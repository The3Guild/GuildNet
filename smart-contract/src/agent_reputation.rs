//! AgentReputation — verifiable on-chain reputation tracking.
//!
//! Tracks task completions and failures per agent, computes a weighted trust
//! score (0–10000), and pushes it back to AgentRegistry on every update.
//!
//! This is the "RWA Oracle Agent with Verifiable On-Chain Identity" pattern
//! specified in the Casper Agentic Buildathon brief.
//!
//! Access control:
//!   - `record_completion` and `record_failure` are restricted to the
//!     registered TaskCoordinator address.
//!   - `configure` is one-time-only (called from the deploy script).

use odra::prelude::*;
use odra::ContractRef;
use crate::agent_registry::AgentRegistryContractRef;

// ── Custom type ───────────────────────────────────────────────────────────────

#[odra::odra_type]
pub struct ReputationData {
    /// Number of tasks completed successfully
    pub tasks_completed: u64,
    /// Number of tasks marked as failed / disputed
    pub tasks_failed: u64,
    /// Weighted trust score in range 0–10000 (5000 = neutral)
    pub score: u32,
    /// Block timestamp of the last score update
    pub last_updated: u64,
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[odra::module(errors = Error, events = [ReputationRecorded])]
pub struct AgentReputation {
    /// Only this address may call record_completion / record_failure
    coordinator: Var<Option<Address>>,
    /// AgentRegistry contract — receives score push-backs
    registry: Var<Option<Address>>,
    /// agent address → ReputationData
    reputation: Mapping<Address, ReputationData>,
}

#[odra::module]
impl AgentReputation {
    // ── Initialiser ───────────────────────────────────────────────────────

    pub fn init(&mut self) {
        self.coordinator.set(None);
        self.registry.set(None);
    }

    // ── One-time configuration ────────────────────────────────────────────

    /// Wire in the TaskCoordinator and AgentRegistry addresses.
    /// Called once from the deploy script; reverts on any subsequent call.
    pub fn configure(&mut self, coordinator: Address, registry: Address) {
        if self.coordinator.get_or_default().is_some() {
            self.env().revert(Error::AlreadyConfigured);
        }
        self.coordinator.set(Some(coordinator));
        self.registry.set(Some(registry));
    }

    /// Configure only the coordinator, without a registry (useful for unit tests
    /// and standalone deployments where score push-back is not needed).
    pub fn configure_no_registry(&mut self, coordinator: Address) {
        if self.coordinator.get_or_default().is_some() {
            self.env().revert(Error::AlreadyConfigured);
        }
        self.coordinator.set(Some(coordinator));
        // registry stays None → push_score_to_registry is a no-op
    }

    // ── Called by TaskCoordinator (restricted) ────────────────────────────

    /// Record a successful task completion for `agent`.
    /// Recomputes score and pushes it back to AgentRegistry.
    pub fn record_completion(&mut self, agent: Address, task_id: u64) {
        self.only_coordinator();
        let mut data = self.get_or_default(agent);
        data.tasks_completed = data.tasks_completed.saturating_add(1);
        data.score = Self::compute_score(data.tasks_completed, data.tasks_failed);
        data.last_updated = self.env().get_block_time();
        self.reputation.set(&agent, data.clone());

        self.push_score_to_registry(agent, data.score);

        self.env().emit_event(ReputationRecorded {
            agent,
            task_id,
            score: data.score,
            tasks_completed: data.tasks_completed,
            tasks_failed: data.tasks_failed,
        });
    }

    /// Record a failed / disputed task for `agent`.
    /// Failures carry double weight in the scoring formula.
    pub fn record_failure(&mut self, agent: Address, task_id: u64) {
        self.only_coordinator();
        let mut data = self.get_or_default(agent);
        data.tasks_failed = data.tasks_failed.saturating_add(1);
        data.score = Self::compute_score(data.tasks_completed, data.tasks_failed);
        data.last_updated = self.env().get_block_time();
        self.reputation.set(&agent, data.clone());

        self.push_score_to_registry(agent, data.score);

        self.env().emit_event(ReputationRecorded {
            agent,
            task_id,
            score: data.score,
            tasks_completed: data.tasks_completed,
            tasks_failed: data.tasks_failed,
        });
    }

    // ── Views ─────────────────────────────────────────────────────────────

    pub fn get_reputation(&self, agent: Address) -> ReputationData {
        self.reputation.get(&agent).unwrap_or_else(|| ReputationData {
            tasks_completed: 0,
            tasks_failed: 0,
            score: 5000,
            last_updated: 0,
        })
    }

    pub fn get_score(&self, agent: Address) -> u32 {
        self.reputation
            .get(&agent)
            .map(|d| d.score)
            .unwrap_or(5000)
    }

    // ── Internal helpers ──────────────────────────────────────────────────

    fn only_coordinator(&self) {
        if let Some(coord) = self.coordinator.get_or_default() {
            if self.env().caller() != coord {
                self.env().revert(Error::NotCoordinator);
            }
        }
        // If coordinator not yet configured, allow open access (bootstrap only)
    }

    fn get_or_default(&self, agent: Address) -> ReputationData {
        self.reputation.get(&agent).unwrap_or(ReputationData {
            tasks_completed: 0,
            tasks_failed: 0,
            score: 5000,
            last_updated: 0,
        })
    }

    fn push_score_to_registry(&self, agent: Address, score: u32) {
        if let Some(reg_addr) = self.registry.get_or_default() {
            AgentRegistryContractRef::new(self.env(), reg_addr)
                .update_reputation(agent, score);
        }
    }

    /// Score formula:
    ///   weighted_total = completions + (failures × 2)
    ///   raw_score      = completions / weighted_total × 10000
    ///
    /// - New agents start at 5000 (neutral).
    /// - Pure-success agents converge toward 9900 (ceiling).
    /// - Repeated failures push toward 100 (floor).
    fn compute_score(completed: u64, failed: u64) -> u32 {
        let total = completed + failed;
        if total == 0 {
            return 5000;
        }
        // Each failure counted double to penalise bad actors
        let weighted_total = completed + (failed.saturating_mul(2));
        let raw = (completed.saturating_mul(10000)) / weighted_total;
        // Clamp to [100, 9900]
        (raw as u32).max(100).min(9900)
    }
}

// ── Errors ────────────────────────────────────────────────────────────────────

#[odra::odra_error]
pub enum Error {
    NotCoordinator    = 10,
    AlreadyConfigured = 11,
}

// ── Events ────────────────────────────────────────────────────────────────────

#[odra::event]
pub struct ReputationRecorded {
    pub agent:           Address,
    pub task_id:         u64,
    pub score:           u32,
    pub tasks_completed: u64,
    pub tasks_failed:    u64,
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use odra::host::{Deployer, NoArgs};

    /// Deploy reputation with only the coordinator configured (no registry).
    /// This avoids cross-contract calls in unit tests.
    fn deploy_with_coord(env: &odra::host::HostEnv) -> (AgentReputationHostRef, Address) {
        let mut rep = AgentReputation::deploy(env, NoArgs);
        let coord = env.get_account(0);
        // Pass the zero/coord address as registry — but since no real registry is
        // deployed there, we skip configuring registry and rely on the None-guard in
        // push_score_to_registry. We patch configure to accept optional registry below.
        rep.configure_no_registry(coord);
        (rep, coord)
    }

    #[test]
    fn test_new_agent_starts_at_neutral() {
        let env = odra_test::env();
        let rep = AgentReputation::deploy(&env, NoArgs);
        assert_eq!(rep.get_score(env.get_account(1)), 5000);
    }

    #[test]
    fn test_completions_raise_score() {
        let env = odra_test::env();
        let (mut rep, coord) = deploy_with_coord(&env);
        let agent = env.get_account(1);

        // 3 completions, 0 failures → score = 9900 (ceiling)
        env.set_caller(coord);
        rep.record_completion(agent, 0);
        rep.record_completion(agent, 1);
        rep.record_completion(agent, 2);

        assert_eq!(rep.get_score(agent), 9900);
    }

    #[test]
    fn test_failures_lower_score() {
        let env = odra_test::env();
        let (mut rep, coord) = deploy_with_coord(&env);
        let agent = env.get_account(1);

        env.set_caller(coord);
        rep.record_completion(agent, 0); // 1 completion
        rep.record_failure(agent, 1);    // 1 failure

        // weighted_total = 1 + (1×2) = 3; raw = 1/3 × 10000 = 3333
        assert_eq!(rep.get_score(agent), 3333);
    }

    #[test]
    fn test_multiple_failures_floor() {
        let env = odra_test::env();
        let (mut rep, coord) = deploy_with_coord(&env);
        let agent = env.get_account(1);

        env.set_caller(coord);
        // 10 failures, 0 completions → score = 100 (floor)
        for i in 0..10u64 {
            rep.record_failure(agent, i);
        }
        assert_eq!(rep.get_score(agent), 100);
    }

    #[test]
    fn test_non_coordinator_reverts() {
        let env = odra_test::env();
        let (mut rep, _coord) = deploy_with_coord(&env);

        // account(1) tries to call — must fail
        env.set_caller(env.get_account(1));
        let result = rep.try_record_completion(env.get_account(2), 0);
        assert!(result.is_err());
    }

    #[test]
    fn test_configure_once_only() {
        let env = odra_test::env();
        let coord = env.get_account(0);
        let mut rep = AgentReputation::deploy(&env, NoArgs);
        rep.configure_no_registry(coord);

        // Second configure must revert
        let result = rep.try_configure_no_registry(coord);
        assert!(result.is_err());
    }

    #[test]
    fn test_reputation_data_fields() {
        let env = odra_test::env();
        let (mut rep, coord) = deploy_with_coord(&env);
        let agent = env.get_account(1);

        env.set_caller(coord);
        rep.record_completion(agent, 0);
        rep.record_completion(agent, 1);
        rep.record_failure(agent, 2);

        let data = rep.get_reputation(agent);
        assert_eq!(data.tasks_completed, 2);
        assert_eq!(data.tasks_failed, 1);
        // weighted_total = 2 + (1×2) = 4; raw = 2/4 × 10000 = 5000
        assert_eq!(data.score, 5000);
    }
}
