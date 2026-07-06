//! AgentRegistry — on-chain directory of AI agents, capabilities, and pricing.
//!
//! Agents self-register with an endpoint (Venice AI URL), a capability string
//! ("research" | "risk" | "oracle" | "report" | "coding" | "design" | …),
//! and a price per task in motes (1 CSPR = 1_000_000_000 motes).
//!
//! `find_by_capability` returns matching active agents sorted by
//! `reputation_score` descending — highest-trust agent first.
//!
//! `update_reputation` is restricted to the registered `reputation_contract`
//! and is called automatically by AgentReputation after each task completion.

use odra::prelude::*;
use odra::casper_types::U512;

// ── Custom type stored per agent ──────────────────────────────────────────────

#[odra::odra_type]
pub struct AgentRecord {
    /// Venice AI URL or external agent endpoint
    pub endpoint: String,
    /// Capability key: "research" | "risk" | "oracle" | "report" | "coding" | …
    pub capability: String,
    /// Price per task in motes
    pub price_per_task: U512,
    /// Whether the agent is accepting work
    pub active: bool,
    /// 0–10000 trust score written by AgentReputation contract
    pub reputation_score: u32,
    /// Lifetime completed-task counter (informational)
    pub tasks_completed: u64,
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[odra::module(errors = Error, events = [AgentRegistered, AgentUpdated, AgentDeactivated, ReputationUpdated])]
pub struct AgentRegistry {
    /// address → AgentRecord
    agents: Mapping<Address, AgentRecord>,
    /// Ordered list of every address that has ever registered
    agent_list: List<Address>,
    /// The AgentReputation contract address — set once via `set_reputation_contract`
    reputation_contract: Var<Option<Address>>,
}

#[odra::module]
impl AgentRegistry {
    // ── Initialiser ───────────────────────────────────────────────────────

    pub fn init(&mut self) {
        self.reputation_contract.set(None);
    }

    // ── One-time configuration ────────────────────────────────────────────

    /// Wire in the AgentReputation contract after deployment.
    /// Can only be called once; subsequent calls revert.
    pub fn set_reputation_contract(&mut self, reputation: Address) {
        if self.reputation_contract.get_or_default().is_some() {
            self.env().revert(Error::AlreadyConfigured);
        }
        self.reputation_contract.set(Some(reputation));
    }

    // ── Agent self-registration ───────────────────────────────────────────

    /// Register or re-register. Endpoint and price can be updated freely;
    /// reputation_score and tasks_completed carry over on re-registration.
    pub fn register(
        &mut self,
        endpoint: String,
        capability: String,
        price_per_task: U512,
    ) {
        if capability.is_empty() {
            self.env().revert(Error::EmptyCapability);
        }
        let caller = self.env().caller();

        // Preserve reputation / history across re-registrations
        let existing = self.agents.get(&caller);
        let (reputation_score, tasks_completed) = existing
            .as_ref()
            .map(|r| (r.reputation_score, r.tasks_completed))
            .unwrap_or((5000, 0)); // neutral starting score = 50 / 100

        // Only push to list on first-ever registration
        if existing.is_none() {
            self.agent_list.push(caller);
        }

        self.agents.set(
            &caller,
            AgentRecord {
                endpoint: endpoint.clone(),
                capability: capability.clone(),
                price_per_task,
                active: true,
                reputation_score,
                tasks_completed,
            },
        );

        self.env().emit_event(AgentRegistered {
            agent: caller,
            capability,
            price_per_task,
        });
    }

    /// Update endpoint or price. Agent must be currently active.
    pub fn update(&mut self, endpoint: String, price_per_task: U512) {
        let caller = self.env().caller();
        let mut record = self
            .agents
            .get(&caller)
            .unwrap_or_revert_with(&self.env(), Error::NotRegistered);
        if !record.active {
            self.env().revert(Error::NotRegistered);
        }
        record.endpoint = endpoint;
        record.price_per_task = price_per_task;
        self.agents.set(&caller, record);
        self.env().emit_event(AgentUpdated { agent: caller });
    }

    /// Remove self from the active discovery pool.
    pub fn deactivate(&mut self) {
        let caller = self.env().caller();
        let mut record = self
            .agents
            .get(&caller)
            .unwrap_or_revert_with(&self.env(), Error::NotRegistered);
        record.active = false;
        self.agents.set(&caller, record);
        self.env().emit_event(AgentDeactivated { agent: caller });
    }

    // ── Called by AgentReputation (restricted) ────────────────────────────

    /// Push an updated reputation score back to this registry.
    /// Only callable from the registered reputation_contract address.
    pub fn update_reputation(&mut self, agent: Address, score: u32) {
        self.only_reputation_contract();
        if let Some(mut record) = self.agents.get(&agent) {
            record.reputation_score = score;
            self.agents.set(&agent, record);
        }
        self.env().emit_event(ReputationUpdated { agent, score });
    }

    /// Increment tasks_completed counter. Called by AgentReputation.
    pub fn record_task_completion(&mut self, agent: Address) {
        self.only_reputation_contract();
        if let Some(mut record) = self.agents.get(&agent) {
            record.tasks_completed = record.tasks_completed.saturating_add(1);
            self.agents.set(&agent, record);
        }
    }

    // ── Views ─────────────────────────────────────────────────────────────

    pub fn get_agent(&self, agent: Address) -> Option<AgentRecord> {
        self.agents.get(&agent)
    }

    pub fn total_agents(&self) -> u32 {
        self.agent_list.len()
    }

    /// Returns active agents matching `capability`, sorted by reputation DESC.
    /// Highest-trust agent is at index 0.
    pub fn find_by_capability(&self, capability: String) -> Vec<Address> {
        let len = self.agent_list.len();
        let mut matches: Vec<(Address, u32)> = Vec::new();

        for i in 0..len {
            let addr = self.agent_list.get(i).unwrap();
            if let Some(record) = self.agents.get(&addr) {
                if record.active && record.capability == capability {
                    matches.push((addr, record.reputation_score));
                }
            }
        }

        // Sort descending by score
        matches.sort_by(|a, b| b.1.cmp(&a.1));
        matches.into_iter().map(|(addr, _)| addr).collect()
    }

    // ── Internal helpers ──────────────────────────────────────────────────

    fn only_reputation_contract(&self) {
        if let Some(rep) = self.reputation_contract.get_or_default() {
            if self.env().caller() != rep {
                self.env().revert(Error::NotAuthorized);
            }
        }
        // If reputation_contract not yet set, calls are open (bootstrap only)
    }
}

// ── Errors ────────────────────────────────────────────────────────────────────

#[odra::odra_error]
pub enum Error {
    EmptyCapability    = 1,
    NotRegistered      = 2,
    NotAuthorized      = 3,
    AlreadyConfigured  = 4,
}

// ── Events ────────────────────────────────────────────────────────────────────

#[odra::event]
pub struct AgentRegistered {
    pub agent:          Address,
    pub capability:     String,
    pub price_per_task: U512,
}

#[odra::event]
pub struct AgentUpdated {
    pub agent: Address,
}

#[odra::event]
pub struct AgentDeactivated {
    pub agent: Address,
}

#[odra::event]
pub struct ReputationUpdated {
    pub agent: Address,
    pub score: u32,
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use odra::{
        casper_types::U512,
        host::{Deployer, NoArgs},
    };

    fn one_cspr() -> U512 {
        U512::from(1_000_000_000u64)
    }

    #[test]
    fn test_register_and_discover() {
        let env = odra_test::env();
        let mut registry = AgentRegistry::deploy(&env, NoArgs);

        env.set_caller(env.get_account(1));
        registry.register(
            "https://api.venice.ai".to_string(),
            "research".to_string(),
            one_cspr(),
        );

        let agents = registry.find_by_capability("research".to_string());
        assert_eq!(agents.len(), 1);
        assert_eq!(agents[0], env.get_account(1));

        let record = registry.get_agent(env.get_account(1)).unwrap();
        assert_eq!(record.capability, "research");
        assert_eq!(record.price_per_task, one_cspr());
        assert!(record.active);
        assert_eq!(record.reputation_score, 5000);
    }

    #[test]
    fn test_deactivate_hides_from_discovery() {
        let env = odra_test::env();
        let mut registry = AgentRegistry::deploy(&env, NoArgs);

        env.set_caller(env.get_account(1));
        registry.register("url".to_string(), "risk".to_string(), one_cspr());
        registry.deactivate();

        let agents = registry.find_by_capability("risk".to_string());
        assert_eq!(agents.len(), 0);
    }

    #[test]
    fn test_reregistration_preserves_reputation() {
        let env = odra_test::env();
        let mut registry = AgentRegistry::deploy(&env, NoArgs);

        env.set_caller(env.get_account(1));
        registry.register("url1".to_string(), "oracle".to_string(), one_cspr());

        // Re-register with updated endpoint
        registry.register(
            "url2".to_string(),
            "oracle".to_string(),
            U512::from(2_000_000_000u64),
        );

        // total_agents should still be 1 (not pushed twice)
        assert_eq!(registry.total_agents(), 1);
        let record = registry.get_agent(env.get_account(1)).unwrap();
        assert_eq!(record.reputation_score, 5000); // preserved
        assert_eq!(record.price_per_task, U512::from(2_000_000_000u64));
    }

    #[test]
    fn test_find_by_capability_sorted_by_reputation() {
        let env = odra_test::env();
        let mut registry = AgentRegistry::deploy(&env, NoArgs);

        // Register two agents — both start at 5000
        env.set_caller(env.get_account(1));
        registry.register("url1".to_string(), "research".to_string(), one_cspr());
        env.set_caller(env.get_account(2));
        registry.register("url2".to_string(), "research".to_string(), one_cspr());

        // Both score equal → order preserved as registered
        let agents = registry.find_by_capability("research".to_string());
        assert_eq!(agents.len(), 2);
    }

    #[test]
    fn test_update_changes_endpoint_and_price() {
        let env = odra_test::env();
        let mut registry = AgentRegistry::deploy(&env, NoArgs);

        env.set_caller(env.get_account(1));
        registry.register("old".to_string(), "coding".to_string(), one_cspr());
        registry.update("new".to_string(), U512::from(500_000_000u64));

        let record = registry.get_agent(env.get_account(1)).unwrap();
        assert_eq!(record.endpoint, "new");
        assert_eq!(record.price_per_task, U512::from(500_000_000u64));
    }

    #[test]
    fn test_empty_capability_reverts() {
        let env = odra_test::env();
        let mut registry = AgentRegistry::deploy(&env, NoArgs);

        env.set_caller(env.get_account(1));
        let result = registry
            .try_register("url".to_string(), "".to_string(), one_cspr());
        assert!(result.is_err());
    }
}
