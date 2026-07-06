//! TaskCoordinator — orchestrates agent hiring with x402 EIP-712 payment
//! authorization.
//!
//! Flow:
//!   1. Requester creates a task (no longer payable — payment uses x402).
//!   2. Requester pre-signs an EIP-712 `TransferAuthorization` off-chain
//!      authorising the coordinator to pay the agent from the requester's
//!      escrowed CSPR balance.
//!   3. `hire_agent(task_id, agent, value, valid_after, valid_before, nonce,
//!                  public_key, signature)` — coordinator-only; verifies the
//!      EIP-712 typed-data signature, deducts from the escrowed budget, and
//!      transfers CSPR to the agent.
//!   4. `complete_task` — stores result hash, refunds unspent escrow to
//!      requester, notifies AgentReputation.
//!
//! Access control:
//!   - `hire_agent` is restricted to the `coordinator` account.
//!   - `complete_task` is open to the task requester or the coordinator.
//!
//! Replay protection:
//!   - A unique 32-byte `nonce` prevents replay of the same authorization.
//!   - A per-(task_id, agent) `paid` mapping prevents double-hiring.

use odra::prelude::*;
use odra::ContractRef;
use odra::casper_types::{
    U512, PublicKey,
    bytesrepr::Bytes, Signature,
};
use crate::agent_registry::AgentRegistryContractRef;
use crate::agent_reputation::AgentReputationContractRef;
use crate::x402;

// ── Custom type ───────────────────────────────────────────────────────────────

#[odra::odra_type]
pub struct Task {
    /// Account that funded the task
    pub requester: Address,
    /// Human-readable task description
    pub description: String,
    /// Remaining unspent budget in motes
    pub budget: U512,
    /// Agents hired so far
    pub agents_hired: Vec<Address>,
    /// Whether the task has been completed/closed
    pub completed: bool,
    /// SHA-256 hex digest of the final AI result (verifiable output)
    pub result_hash: Option<String>,
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[odra::module(errors = Error, events = [TaskCreated, AgentHired, TaskCompleted])]
pub struct TaskCoordinator {
    /// AgentRegistry for agent lookup
    registry: Var<Address>,
    /// AgentReputation for post-completion scoring
    reputation: Var<Address>,
    /// The coordinator EOA — only it may call hire_agent
    coordinator: Var<Address>,
    /// task_id → Task
    tasks: Mapping<u64, Task>,
    /// (task_id, agent_address) → already paid?
    paid: Mapping<(u64, Address), bool>,
    /// Auto-incrementing task counter
    task_count: Var<u64>,
    // ── x402 EIP-712 domain ──────────────────────────────────────────────
    /// Chain name used in the EIP-712 domain (e.g. "casper-test")
    chain_name: Var<String>,
    /// 32-byte package hash of this contract for EIP-712 domain separation
    package_hash: Var<[u8; 32]>,
    /// Nonces already consumed (32-byte nonce → used)
    nonces: Mapping<[u8; 32], bool>,
}

#[odra::module]
impl TaskCoordinator {
    // ── Initialiser ───────────────────────────────────────────────────────

    pub fn init(
        &mut self,
        registry: Address,
        reputation: Address,
        coordinator: Address,
        chain_name: String,
        package_hash: [u8; 32],
    ) {
        self.registry.set(registry);
        self.reputation.set(reputation);
        self.coordinator.set(coordinator);
        self.chain_name.set(chain_name);
        self.package_hash.set(package_hash);
        self.task_count.set(0);
    }

    // ── Mutations ─────────────────────────────────────────────────────────

    /// Create a task. The attached CSPR becomes the task budget, escrowed
    /// inside this contract.
    ///
    /// Returns the new `task_id`.
    #[odra(payable)]
    pub fn create_task(&mut self, description: String) -> u64 {
        let budget = self.env().attached_value();
        if budget == U512::zero() {
            self.env().revert(Error::ZeroBudget);
        }

        let task_id = self.task_count.get_or_default();
        self.task_count.set(task_id + 1);

        self.tasks.set(
            &task_id,
            Task {
                requester: self.env().caller(),
                description: description.clone(),
                budget,
                agents_hired: Vec::new(),
                completed: false,
                result_hash: None,
            },
        );

        self.env().emit_event(TaskCreated {
            task_id,
            requester: self.env().caller(),
            budget,
        });

        task_id
    }

    /// Hire `agent` for `task_id` using an x402 EIP-712 `TransferAuthorization`
    /// signed by the task requester.
    ///
    /// The coordinator submits the pre-signed authorization. The contract
    /// verifies the EIP-712 typed-data signature, checks the nonce is unused,
    /// validates the time window, deducts from the task escrow, and transfers
    /// CSPR to the agent.
    pub fn hire_agent(
        &mut self,
        task_id: u64,
        agent: Address,
        value: U512,
        valid_after: u64,
        valid_before: u64,
        nonce: [u8; 32],
        public_key: PublicKey,
        signature: Bytes,
    ) {
        self.only_coordinator();

        let mut task = self
            .tasks
            .get(&task_id)
            .unwrap_or_revert_with(&self.env(), Error::TaskNotFound);

        if task.completed {
            self.env().revert(Error::TaskAlreadyCompleted);
        }
        if self.paid.get(&(task_id, agent)).unwrap_or_default() {
            self.env().revert(Error::AgentAlreadyPaid);
        }

        // Look up agent details from registry
        let registry_addr = self.registry.get().unwrap_or_revert_with(&self.env(), Error::TaskNotFound);
        let record = AgentRegistryContractRef::new(self.env(), registry_addr)
            .get_agent(agent)
            .unwrap_or_revert_with(&self.env(), Error::AgentNotFound);

        if !record.active {
            self.env().revert(Error::AgentInactive);
        }
        if value != record.price_per_task {
            self.env().revert(Error::AmountMismatch);
        }
        if task.budget < value {
            self.env().revert(Error::InsufficientBudget);
        }

        // ── x402 EIP-712 verification ─────────────────────────────────────

        // Replay protection
        if self.nonces.get(&nonce).unwrap_or_default() {
            self.env().revert(Error::NonceAlreadyUsed);
        }

        // Time window
        let block_time = self.env().get_block_time();
        if block_time < valid_after || block_time >= valid_before {
            self.env().revert(Error::AuthorizationExpired);
        }

        // Build domain separator
        let chain_name = self.chain_name.get().unwrap_or_revert_with(&self.env(), Error::NotConfigured);
        let package_hash = self.package_hash.get().unwrap_or_revert_with(&self.env(), Error::NotConfigured);
        let domain = x402::guildnet_domain(&chain_name, package_hash);

        // Convert addresses to 32-byte account hashes
        let from_hash = x402::address_to_account_hash(&task.requester);
        let to_hash = x402::address_to_account_hash(&agent);

        // Convert U512 amount to 32-byte U256 big-endian
        let value_bytes = u512_to_bytes32(&value);

        // Convert signature bytes → casper_types::Signature
        let sig = raw_bytes_to_signature(&signature)
            .unwrap_or_revert_with(&self.env(), Error::InvalidSignature);

        // Verify EIP-712 typed-data signature
        if !x402::verify_auth(
            &domain,
            from_hash,
            to_hash,
            value_bytes,
            valid_after,
            valid_before,
            nonce,
            &public_key,
            &sig,
        ) {
            self.env().revert(Error::InvalidSignature);
        }

        // Mark nonce as consumed
        self.nonces.set(&nonce, true);

        // ── Execute payment ──────────────────────────────────────────────

        // Deduct budget and mark paid before transferring (checks-effects-interactions)
        task.budget -= value;
        task.agents_hired.push(agent);
        self.paid.set(&(task_id, agent), true);
        self.tasks.set(&task_id, task.clone());

        // Native CSPR transfer — the on-chain payment record
        self.env().transfer_tokens(&agent, &value);

        self.env().emit_event(AgentHired {
            task_id,
            agent,
            amount: value,
        });
    }

    /// Complete (close) a task. Callable by the requester or the coordinator.
    ///
    /// - Stores `result_hash` (SHA-256 of AI output).
    /// - Refunds unspent budget to the requester.
    /// - Calls `AgentReputation.record_completion` for every hired agent.
    pub fn complete_task(&mut self, task_id: u64, result_hash: Option<String>) {
        let mut task = self
            .tasks
            .get(&task_id)
            .unwrap_or_revert_with(&self.env(), Error::TaskNotFound);

        let caller = self.env().caller();
        let coordinator = self.coordinator.get().unwrap_or_revert_with(&self.env(), Error::NotCoordinator);
        if caller != task.requester && caller != coordinator {
            self.env().revert(Error::NotAuthorized);
        }
        if task.completed {
            self.env().revert(Error::TaskAlreadyCompleted);
        }

        task.completed = true;
        task.result_hash = result_hash.clone();
        let refund = task.budget;
        let requester = task.requester;
        let agents_hired = task.agents_hired.clone();
        task.budget = U512::zero();
        self.tasks.set(&task_id, task);

        // Refund unspent CSPR to requester
        if refund > U512::zero() {
            self.env().transfer_tokens(&requester, &refund);
        }

        // Notify reputation contract for each hired agent
        let reputation_addr = self.reputation.get().unwrap_or_revert_with(&self.env(), Error::TaskNotFound);
        let mut rep_ref = AgentReputationContractRef::new(self.env(), reputation_addr);
        for agent in &agents_hired {
            rep_ref.record_completion(*agent, task_id);
        }

        self.env().emit_event(TaskCompleted {
            task_id,
            requester,
            refund,
            result_hash,
        });
    }

    /// Flag an agent on a task as failed (dispute resolution).
    /// Restricted to coordinator. Notifies AgentReputation.
    pub fn flag_agent_failure(&mut self, task_id: u64, agent: Address) {
        self.only_coordinator();
        let _task = self
            .tasks
            .get(&task_id)
            .unwrap_or_revert_with(&self.env(), Error::TaskNotFound);
        if !self.paid.get(&(task_id, agent)).unwrap_or_default() {
            self.env().revert(Error::AgentNotFound);
        }

        let reputation_addr = self.reputation.get().unwrap_or_revert_with(&self.env(), Error::TaskNotFound);
        AgentReputationContractRef::new(self.env(), reputation_addr)
            .record_failure(agent, task_id);
    }

    // ── Views ─────────────────────────────────────────────────────────────

    pub fn get_task(&self, task_id: u64) -> Option<Task> {
        self.tasks.get(&task_id)
    }

    pub fn get_assigned_agents(&self, task_id: u64) -> Vec<Address> {
        self.tasks
            .get(&task_id)
            .map(|t| t.agents_hired)
            .unwrap_or_default()
    }

    pub fn task_count(&self) -> u64 {
        self.task_count.get_or_default()
    }

    /// Check whether a nonce has already been consumed.
    pub fn is_nonce_used(&self, nonce: [u8; 32]) -> bool {
        self.nonces.get(&nonce).unwrap_or_default()
    }

    // ── Internal helpers ──────────────────────────────────────────────────

    fn only_coordinator(&self) {
        let coordinator = self.coordinator.get().unwrap_or_revert_with(&self.env(), Error::NotCoordinator);
        if self.env().caller() != coordinator {
            self.env().revert(Error::NotCoordinator);
        }
    }
}

// ── Conversion helpers ────────────────────────────────────────────────────────

/// Convert a `U512` amount to a 32-byte big-endian array (uint256).
/// Realistic CSPR amounts always fit in 256 bits.
fn u512_to_bytes32(value: &U512) -> [u8; 32] {
    let mut be64 = [0u8; 64];
    value.to_big_endian(&mut be64);
    let mut buf = [0u8; 32];
    buf.copy_from_slice(&be64[32..]);
    buf
}

/// Parse raw 64-byte Ed25519 signature bytes as a Casper `Signature`.
fn raw_bytes_to_signature(raw: &Bytes) -> Option<Signature> {
    if raw.len() == 64 {
        let mut arr = [0u8; 64];
        arr.copy_from_slice(raw.as_ref());
        let dalek_sig: ed25519_dalek::Signature = arr.into();
        Some(Signature::Ed25519(dalek_sig))
    } else {
        use odra::casper_types::bytesrepr::FromBytes;
        FromBytes::from_bytes(raw.as_ref()).ok().map(|(sig, _)| sig)
    }
}

// ── Errors ────────────────────────────────────────────────────────────────────

#[odra::odra_error]
pub enum Error {
    ZeroBudget           = 20,
    TaskNotFound         = 21,
    TaskAlreadyCompleted = 22,
    AgentAlreadyPaid     = 23,
    AgentNotFound        = 24,
    AgentInactive        = 25,
    InsufficientBudget   = 26,
    NotAuthorized        = 27,
    NotCoordinator       = 28,
    // ── x402 errors ──────────────────────────────────────────────────────
    InvalidSignature     = 30,
    NonceAlreadyUsed     = 31,
    AuthorizationExpired = 32,
    AmountMismatch       = 33,
    NotConfigured        = 34,
}

// ── Events ────────────────────────────────────────────────────────────────────

#[odra::event]
pub struct TaskCreated {
    pub task_id:   u64,
    pub requester: Address,
    pub budget:    U512,
}

#[odra::event]
pub struct AgentHired {
    pub task_id: u64,
    pub agent:   Address,
    pub amount:  U512,
}

#[odra::event]
pub struct TaskCompleted {
    pub task_id:     u64,
    pub requester:   Address,
    pub refund:      U512,
    pub result_hash: Option<String>,
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent_registry::AgentRegistry;
    use crate::agent_reputation::AgentReputation;
    use crate::x402;
    use odra::{
        casper_types::U512,
        host::{Deployer, HostRef, NoArgs},
    };

    const CHAIN_NAME: &str = "casper-test";
    const PACKAGE_HASH: [u8; 32] = [0xAA; 32];
    const NONCE: [u8; 32] = [0xBB; 32];

    struct Setup {
        env:         odra::host::HostEnv,
        registry:    crate::agent_registry::AgentRegistryHostRef,
        reputation:  crate::agent_reputation::AgentReputationHostRef,
        coordinator: crate::task_coordinator::TaskCoordinatorHostRef,
        coord_acct:  Address,
        agent_acct:  Address,
        user_acct:   Address,
    }

    fn setup() -> Setup {
        let env = odra_test::env();
        let coord_acct = env.get_account(0);
        let agent_acct = env.get_account(1);
        let user_acct  = env.get_account(2);

        // Deploy registry
        let mut registry = AgentRegistry::deploy(&env, NoArgs);

        // Deploy reputation
        let mut reputation = AgentReputation::deploy(&env, NoArgs);

        // Deploy coordinator (wires everything together)
        let coordinator = TaskCoordinator::deploy(
            &env,
            TaskCoordinatorInitArgs {
                registry:     registry.address(),
                reputation:   reputation.address(),
                coordinator:  coord_acct,
                chain_name:   CHAIN_NAME.to_string(),
                package_hash: PACKAGE_HASH,
            },
        );

        // Configure reputation: coordinator → TaskCoordinator; registry → AgentRegistry
        reputation.configure(coordinator.address(), registry.address());

        // Configure registry: reputation_contract → AgentReputation
        registry.set_reputation_contract(reputation.address());

        // Register an agent (price = 1 CSPR)
        env.set_caller(agent_acct);
        registry.register(
            "https://api.venice.ai".to_string(),
            "research".to_string(),
            U512::from(1_000_000_000u64),
        );

        Setup { env, registry, reputation, coordinator, coord_acct, agent_acct, user_acct }
    }

    fn sign_hire_auth(
        env: &odra::host::HostEnv,
        requester: &Address,
        agent: &Address,
        value: U512,
        nonce: [u8; 32],
        valid_after: u64,
        valid_before: u64,
    ) -> (PublicKey, Bytes) {
        let public_key = env.public_key(requester);
        let from_hash = x402::address_to_account_hash(requester);
        let to_hash = x402::address_to_account_hash(agent);
        let value_bytes = u512_to_bytes32(&value);

        let domain = x402::guildnet_domain(CHAIN_NAME, PACKAGE_HASH);
        let digest = x402::compute_auth_digest(
            &domain, from_hash, to_hash, value_bytes,
            valid_after, valid_before, nonce,
        );
        let msg = Bytes::from(digest.to_vec());
        let sig = env.sign_message(&msg, requester);
        (public_key, sig)
    }

    #[test]
    fn test_create_task_stores_budget() {
        let s = setup();
        s.env.set_caller(s.user_acct);
        let task_id = s
            .coordinator
            .with_tokens(U512::from(3_000_000_000u64))
            .create_task("Research AI on Casper".to_string());

        let task = s.coordinator.get_task(task_id).unwrap();
        assert_eq!(task.budget, U512::from(3_000_000_000u64));
        assert_eq!(task.requester, s.user_acct);
        assert!(!task.completed);
    }

    #[test]
    fn test_hire_agent_with_x402_auth() {
        let mut s = setup();
        let price = U512::from(1_000_000_000u64);

        // Requester creates task with 3 CSPR escrow
        s.env.set_caller(s.user_acct);
        let task_id = s
            .coordinator
            .with_tokens(U512::from(3_000_000_000u64))
            .create_task("test".to_string());

        // Requester pre-signs an EIP-712 authorization
        let (pub_key, sig) = sign_hire_auth(
            &s.env, &s.user_acct, &s.agent_acct, price,
            NONCE, 0, 9_999_999_999,
        );

        let agent_bal_before = s.env.balance_of(&s.agent_acct);

        // Coordinator submits the signed authorization
        s.env.set_caller(s.coord_acct);
        s.coordinator.hire_agent(
            task_id, s.agent_acct,
            price,
            0,   // valid_after
            9_999_999_999, // valid_before
            NONCE,
            pub_key,
            sig,
        );

        // Budget should drop by 1 CSPR
        let task = s.coordinator.get_task(task_id).unwrap();
        assert_eq!(task.budget, U512::from(2_000_000_000u64));

        // Agent should have received 1 CSPR
        let agent_bal_after = s.env.balance_of(&s.agent_acct);
        assert_eq!(
            agent_bal_after - agent_bal_before,
            price,
        );

        // Nonce should be consumed
        assert!(s.coordinator.is_nonce_used(NONCE));
    }

    #[test]
    fn test_x402_invalid_signature_reverts() {
        let mut s = setup();
        let price = U512::from(1_000_000_000u64);

        s.env.set_caller(s.user_acct);
        let task_id = s
            .coordinator
            .with_tokens(U512::from(3_000_000_000u64))
            .create_task("test".to_string());

        // Sign with the WRONG key (coordinator instead of user)
        let (wrong_key, wrong_sig) = sign_hire_auth(
            &s.env, &s.coord_acct, &s.agent_acct, price,
            NONCE, 0, 9_999_999_999,
        );

        s.env.set_caller(s.coord_acct);
        let result = s.coordinator.try_hire_agent(
            task_id, s.agent_acct,
            price,
            0, 9_999_999_999,
            NONCE,
            wrong_key,
            wrong_sig,
        );
        assert!(result.is_err());
    }

    #[test]
    fn test_x402_replay_attack_fails() {
        let mut s = setup();
        let price = U512::from(1_000_000_000u64);

        s.env.set_caller(s.user_acct);
        let task_id = s
            .coordinator
            .with_tokens(U512::from(5_000_000_000u64))
            .create_task("test".to_string());

        let (pub_key, sig) = sign_hire_auth(
            &s.env, &s.user_acct, &s.agent_acct, price,
            NONCE, 0, 9_999_999_999,
        );

        s.env.set_caller(s.coord_acct);
        s.coordinator.hire_agent(
            task_id, s.agent_acct,
            price, 0, 9_999_999_999, NONCE, pub_key.clone(), sig.clone(),
        );

        // Same nonce on a fresh task → must revert
        let task2 = s
            .coordinator
            .with_tokens(U512::from(3_000_000_000u64))
            .create_task("test2".to_string());

        // Try to reuse the same nonce — should fail at nonce check
        let (_, dup_sig) = sign_hire_auth(
            &s.env, &s.user_acct, &s.agent_acct, price,
            NONCE, 0, 9_999_999_999,
        );

        let result = s.coordinator.try_hire_agent(
            task2, s.agent_acct,
            price, 0, 9_999_999_999, NONCE, pub_key, dup_sig,
        );
        assert!(result.is_err());
    }

    #[test]
    fn test_x402_expired_auth_reverts() {
        let mut s = setup();
        let price = U512::from(1_000_000_000u64);

        s.env.set_caller(s.user_acct);
        let task_id = s
            .coordinator
            .with_tokens(U512::from(3_000_000_000u64))
            .create_task("test".to_string());

        s.env.advance_block_time(5000);

        let (pub_key, sig) = sign_hire_auth(
            &s.env, &s.user_acct, &s.agent_acct, price,
            NONCE, 0, 100,  // expired before current block time
        );

        s.env.set_caller(s.coord_acct);
        let result = s.coordinator.try_hire_agent(
            task_id, s.agent_acct,
            price, 0, 100, NONCE, pub_key, sig,
        );
        assert!(result.is_err());
    }

    #[test]
    fn test_x402_amount_mismatch_reverts() {
        let mut s = setup();
        let wrong_price = U512::from(2_000_000_000u64); // agent's price is 1 CSPR

        s.env.set_caller(s.user_acct);
        let task_id = s
            .coordinator
            .with_tokens(U512::from(5_000_000_000u64))
            .create_task("test".to_string());

        let (pub_key, sig) = sign_hire_auth(
            &s.env, &s.user_acct, &s.agent_acct, wrong_price,
            NONCE, 0, 9_999_999_999,
        );

        s.env.set_caller(s.coord_acct);
        let result = s.coordinator.try_hire_agent(
            task_id, s.agent_acct,
            wrong_price, 0, 9_999_999_999, NONCE, pub_key, sig,
        );
        assert!(result.is_err());
    }

    #[test]
    fn test_create_task_still_requires_attached_value() {
        let mut s = setup();
        s.env.set_caller(s.user_acct);
        // No attached tokens — must revert
        let result = s.coordinator.try_create_task("test".to_string());
        assert!(result.is_err());
    }

    #[test]
    fn test_complete_task_refunds_unspent() {
        let mut s = setup();
        let price = U512::from(1_000_000_000u64);
        let initial_balance = s.env.balance_of(&s.user_acct);

        s.env.set_caller(s.user_acct);
        let task_id = s
            .coordinator
            .with_tokens(U512::from(5_000_000_000u64))
            .create_task("test".to_string());

        let (pub_key, sig) = sign_hire_auth(
            &s.env, &s.user_acct, &s.agent_acct, price,
            NONCE, 0, 9_999_999_999,
        );

        s.env.set_caller(s.coord_acct);
        s.coordinator.hire_agent(
            task_id, s.agent_acct,
            price, 0, 9_999_999_999, NONCE, pub_key, sig,
        );

        s.coordinator.complete_task(task_id, Some("abc123def".to_string()));

        // User spent 1 CSPR on agent, rest refunded
        let final_balance = s.env.balance_of(&s.user_acct);
        let net_cost = initial_balance - final_balance;
        assert_eq!(net_cost, price);
    }

    #[test]
    fn test_double_payment_guard() {
        let mut s = setup();
        let price = U512::from(1_000_000_000u64);

        s.env.set_caller(s.user_acct);
        let task_id = s
            .coordinator
            .with_tokens(U512::from(5_000_000_000u64))
            .create_task("test".to_string());

        let (pub_key, sig) = sign_hire_auth(
            &s.env, &s.user_acct, &s.agent_acct, price,
            [0xBB; 32], 0, 9_999_999_999,
        );

        s.env.set_caller(s.coord_acct);
        s.coordinator.hire_agent(
            task_id, s.agent_acct,
            price, 0, 9_999_999_999, [0xBB; 32], pub_key.clone(), sig.clone(),
        );

        // Second hire of same agent must revert
        let result = s.coordinator.try_hire_agent(
            task_id, s.agent_acct,
            price, 0, 9_999_999_999, [0xCC; 32], pub_key, sig,
        );
        assert!(result.is_err());
    }

    #[test]
    fn test_only_coordinator_can_hire() {
        let mut s = setup();
        let price = U512::from(1_000_000_000u64);

        s.env.set_caller(s.user_acct);
        let task_id = s
            .coordinator
            .with_tokens(U512::from(3_000_000_000u64))
            .create_task("test".to_string());

        let (pub_key, sig) = sign_hire_auth(
            &s.env, &s.user_acct, &s.agent_acct, price,
            NONCE, 0, 9_999_999_999,
        );

        // Non-coordinator (agent) tries to hire → must revert
        s.env.set_caller(s.agent_acct);
        let result = s.coordinator.try_hire_agent(
            task_id, s.agent_acct,
            price, 0, 9_999_999_999, NONCE, pub_key, sig,
        );
        assert!(result.is_err());
    }

    #[test]
    fn test_complete_stores_result_hash() {
        let mut s = setup();
        s.env.set_caller(s.user_acct);
        let task_id = s
            .coordinator
            .with_tokens(U512::from(2_000_000_000u64))
            .create_task("test".to_string());

        s.env.set_caller(s.coord_acct);
        s.coordinator.complete_task(task_id, Some("deadbeef1234".to_string()));

        let task = s.coordinator.get_task(task_id).unwrap();
        assert_eq!(task.result_hash, Some("deadbeef1234".to_string()));
        assert!(task.completed);
    }

    #[test]
    fn test_reputation_updated_after_complete() {
        let mut s = setup();
        let price = U512::from(1_000_000_000u64);

        s.env.set_caller(s.user_acct);
        let task_id = s
            .coordinator
            .with_tokens(U512::from(3_000_000_000u64))
            .create_task("test".to_string());

        let (pub_key, sig) = sign_hire_auth(
            &s.env, &s.user_acct, &s.agent_acct, price,
            NONCE, 0, 9_999_999_999,
        );

        s.env.set_caller(s.coord_acct);
        s.coordinator.hire_agent(
            task_id, s.agent_acct,
            price, 0, 9_999_999_999, NONCE, pub_key, sig,
        );
        s.coordinator.complete_task(task_id, None);

        // Agent's score should now be above neutral (one successful task)
        let score = s.reputation.get_score(s.agent_acct);
        assert!(score > 5000, "reputation score should rise above 5000 after completion");
    }

    #[test]
    fn test_zero_budget_reverts() {
        let mut s = setup();
        s.env.set_caller(s.user_acct);
        let result = s
            .coordinator
            .try_create_task("test".to_string());
        assert!(result.is_err());
    }
}
