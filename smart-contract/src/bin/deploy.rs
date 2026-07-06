//! GuildNet livenet deploy script.
//!
//! Deploys AgentRegistry, AgentReputation, and TaskCoordinator to Casper
//! Testnet (or Mainnet) in the correct order and wires them together.
//!
//! Run with:
//!   cargo run --bin deploy --features=livenet
//!
//! Reads configuration from environment variables (or a .env file):
//!   ODRA_CASPER_LIVENET_NODE_ADDRESS
//!   ODRA_CASPER_LIVENET_SECRET_KEY_PATH
//!   ODRA_CASPER_LIVENET_EVENTS_URL
//!   ODRA_CASPER_LIVENET_CHAIN_NAME
//!
//! See .env.sample for the full list of required variables.

use guildnet::{
    agent_registry::AgentRegistry,
    agent_reputation::AgentReputation,
    task_coordinator::TaskCoordinator,
};
use odra::host::{Deployer, HostEnv, NoArgs};
use odra::casper_types::U512;
use odra_casper_livenet_env::env;

fn main() {
    // Gas budget constants (in motes)
    const DEPLOY_GAS:     u64 = 450_000_000_000; // 450 CSPR per deployment
    const CALL_GAS:       u64 =   3_000_000_000; //   3 CSPR per call
    const REGISTER_GAS:   u64 =   5_000_000_000; //   5 CSPR for register calls

    let env: HostEnv = env();
    let deployer = env.caller();

    println!("═══════════════════════════════════════════════════════════");
    println!(" GuildNet — Casper Testnet Deploy");
    println!("═══════════════════════════════════════════════════════════");
    println!(" Deployer : {}", deployer);
    println!();

    // ── 1. Deploy AgentRegistry ───────────────────────────────────────────
    println!("[1/6] Deploying AgentRegistry…");
    env.set_gas(DEPLOY_GAS);
    let mut registry = AgentRegistry::deploy(&env, NoArgs);
    println!("      ✓ AgentRegistry : {}", registry.address());

    // ── 2. Deploy AgentReputation ─────────────────────────────────────────
    println!("[2/6] Deploying AgentReputation…");
    env.set_gas(DEPLOY_GAS);
    let mut reputation = AgentReputation::deploy(&env, NoArgs);
    println!("      ✓ AgentReputation : {}", reputation.address());

    // ── 3. Deploy TaskCoordinator ─────────────────────────────────────────
    println!("[3/6] Deploying TaskCoordinator…");
    env.set_gas(DEPLOY_GAS);
    let coordinator = TaskCoordinator::deploy(
        &env,
        TaskCoordinatorInitArgs {
            registry:    registry.address(),
            reputation:  reputation.address(),
            coordinator: deployer,
        },
    );
    println!("      ✓ TaskCoordinator : {}", coordinator.address());

    // ── 4. Wire AgentReputation → knows TaskCoordinator + AgentRegistry ───
    println!("[4/6] Configuring AgentReputation (coordinator + registry)…");
    env.set_gas(CALL_GAS);
    reputation.configure(coordinator.address(), registry.address());
    println!("      ✓ Done");

    // ── 5. Wire AgentRegistry → knows AgentReputation ────────────────────
    println!("[5/6] Configuring AgentRegistry (reputation_contract)…");
    env.set_gas(CALL_GAS);
    registry.set_reputation_contract(reputation.address());
    println!("      ✓ Done");

    // ── 6. Register sample demo agent ────────────────────────────────────
    // NOTE: Each Casper account can only be registered once in AgentRegistry.
    // For a full multi-agent demo, register each agent capability from a
    // separate account. Here we register the deployer as the "research" agent
    // for a minimal working demo. Additional agent accounts can be registered
    // separately using their own keys and the `register` entry point.
    println!("[6/6] Registering deployer as demo research agent…");
    env.set_gas(REGISTER_GAS);
    registry.register(
        "https://api.venice.ai/api/v1".to_string(),
        "research".to_string(),
        U512::from(500_000_000u64), // 0.5 CSPR per task
    );
    println!("      ✓ research agent registered (deployer account)");
    println!("      ℹ To register more agents, use separate accounts:");

    // ── Summary ───────────────────────────────────────────────────────────
    println!();
    println!("═══════════════════════════════════════════════════════════");
    println!(" Deployment complete — copy these into your backend/.env");
    println!("═══════════════════════════════════════════════════════════");
    println!(" AGENT_REGISTRY_HASH={}", registry.address());
    println!(" AGENT_REPUTATION_HASH={}", reputation.address());
    println!(" TASK_COORDINATOR_HASH={}", coordinator.address());
    println!("═══════════════════════════════════════════════════════════");
    println!();
    println!(" Explorer links (Testnet):");
    println!("   https://testnet.cspr.live/contract/{}", registry.address());
    println!("   https://testnet.cspr.live/contract/{}", reputation.address());
    println!("   https://testnet.cspr.live/contract/{}", coordinator.address());
    println!("═══════════════════════════════════════════════════════════");
    println!();
    println!(" To register additional agents with separate capabilities,");
    println!(" call register() from each agent's own account:");
    println!("   casper-client put-txn call-package \\");
    println!("     --package-hash <AGENT_REGISTRY_PACKAGE_HASH> \\");
    println!("     --entry-point register \\");
    println!("     --session-arg \"endpoint:string='https://api.venice.ai/api/v1'\" \\");
    println!("     --session-arg \"capability:string='risk'\" \\");
    println!("     --session-arg \"price_per_task:u512='500000000'\" \\");
    println!("     --secret-key <AGENT_SECRET_KEY> ...");
    println!("═══════════════════════════════════════════════════════════");
}
