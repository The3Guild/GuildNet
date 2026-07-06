# GuildNet — Casper Testnet Deploy Guide

Complete step-by-step instructions to compile, test, and deploy the three
GuildNet contracts to Casper Testnet.

---

## Prerequisites

### 1. Rust toolchain

```bash
# Install rustup (if not already installed)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source $HOME/.cargo/env

# Add the Wasm compile target
rustup target add wasm32-unknown-unknown

# Verify
rustc --version   # should print 1.75.0 or newer
cargo --version
```

### 2. Wasm optimisation tools

These are required by cargo-odra to strip and optimise the compiled `.wasm` files.

```bash
# Ubuntu / Debian
sudo apt-get install -y wabt binaryen

# macOS
brew install wabt binaryen
```

### 3. cargo-odra

```bash
cargo install cargo-odra --locked

# Verify
cargo odra --help
```

---

## Project layout

```
smart-contract/
├── Cargo.toml          # crate manifest (odra 2.8.0)
├── Odra.toml           # module registry for cargo-odra
├── .env.sample         # livenet environment template
├── src/
│   ├── lib.rs
│   ├── agent_registry.rs    # on-chain agent directory
│   ├── agent_reputation.rs  # verifiable reputation scores
│   ├── task_coordinator.rs  # hiring + CSPR payments
│   └── bin/
│       └── deploy.rs        # livenet deploy script
└── wasm/               # compiled .wasm files (auto-generated)
```

---

## Step 1 — Run unit tests (no chain needed)

All tests run against Odra's in-process MockVM. This is the fastest way to
verify correctness before touching the chain.

```bash
cd smart-contract
cargo odra test
```

Expected output: every test in all three modules passes.

To run tests against the real Casper VM (slower — requires Docker):

```bash
cargo odra test -b casper
```

---

## Step 2 — Build the Wasm files

```bash
cargo odra build
```

Compiled contracts appear in `smart-contract/wasm/`:
- `AgentRegistry.wasm`
- `AgentReputation.wasm`
- `TaskCoordinator.wasm`

---

## Step 3 — Generate a Casper keypair

```bash
mkdir -p keys

# Using casper-client (install: https://docs.casper.network/developers/prerequisites)
casper-client keygen keys/

# This creates:
#   keys/secret_key.pem   ← keep private, never commit
#   keys/public_key.pem
#   keys/public_key_hex
```

Note your public key hex — you will need it to get testnet tokens.

---

## Step 4 — Fund your account on Testnet

1. Open https://testnet.cspr.live/tools/faucet
2. Paste your public key hex
3. Request CSPR tokens
4. Wait ~15 seconds for confirmation

You need at least **1500 CSPR** to cover all deployments and configuration calls
at the gas amounts set in `deploy.rs`.

---

## Step 5 — Configure the environment

```bash
cd smart-contract
cp .env.sample .env
```

Edit `.env`:

```bash
# Required — path to your key
ODRA_CASPER_LIVENET_SECRET_KEY_PATH=./keys/secret_key.pem

# Casper Testnet RPC (CSPR.cloud free tier)
ODRA_CASPER_LIVENET_NODE_ADDRESS=https://node.testnet.cspr.cloud

# SSE events
ODRA_CASPER_LIVENET_EVENTS_URL=https://node.testnet.cspr.cloud/events

# Chain name — must be exactly "casper-test" for Testnet
ODRA_CASPER_LIVENET_CHAIN_NAME=casper-test
```

---

## Step 6 — Deploy to Casper Testnet

```bash
# Build Wasm first (required before livenet run)
cargo odra build

# Deploy
cargo run --bin deploy --features=livenet
```

The script deploys the three contracts in order, wires them together, and
registers three demo agents. Output looks like:

```
═══════════════════════════════════════════════════════════
 GuildNet — Casper Testnet Deploy
═══════════════════════════════════════════════════════════
 Deployer : account-hash-abc123…

[1/6] Deploying AgentRegistry…
      ✓ AgentRegistry : hash-aaa111…
[2/6] Deploying AgentReputation…
      ✓ AgentReputation : hash-bbb222…
[3/6] Deploying TaskCoordinator…
      ✓ TaskCoordinator : hash-ccc333…
[4/6] Configuring AgentReputation…
      ✓ Done
[5/6] Configuring AgentRegistry…
      ✓ Done
[6/6] Registering demo agents…
      ✓ research agent registered
      ✓ risk agent registered
      ✓ report agent registered

═══════════════════════════════════════════════════════════
 Deployment complete — copy these into your backend/.env
═══════════════════════════════════════════════════════════
 AGENT_REGISTRY_HASH=hash-aaa111…
 AGENT_REPUTATION_HASH=hash-bbb222…
 TASK_COORDINATOR_HASH=hash-ccc333…
═══════════════════════════════════════════════════════════

 Explorer links (Testnet):
   https://testnet.cspr.live/contract/hash-aaa111…
   https://testnet.cspr.live/contract/hash-bbb222…
   https://testnet.cspr.live/contract/hash-ccc333…
═══════════════════════════════════════════════════════════
```

---

## Step 7 — Verify on the explorer

Open each of the three `testnet.cspr.live/contract/…` links.

For each contract you should see:
- **Contract package hash** — proof it's installed on-chain
- **Entry points** — matching the contract's public functions
- **Named keys** — the contract's on-chain state

This is your eligibility proof for the Builder Merit path.

---

## Step 8 — Save contract addresses

Copy the three `hash-…` values into your backend `.env`:

```bash
# backend/.env
AGENT_REGISTRY_HASH=hash-aaa111…
AGENT_REPUTATION_HASH=hash-bbb222…
TASK_COORDINATOR_HASH=hash-ccc333…
```

Also add them to the README deploy table.

---

## Troubleshooting

**`error: the 'rustc' binary is not applicable to the toolchain`**
```bash
rustup toolchain remove stable
rustup toolchain install stable
rustup target add wasm32-unknown-unknown
```

**`wasmstrip: command not found`**
```bash
sudo apt-get install wabt     # Ubuntu
brew install wabt             # macOS
```

**`Error: insufficient funds`**
- Request more CSPR from the faucet: https://testnet.cspr.live/tools/faucet
- Each deployment costs ~400–450 CSPR in gas at the amounts in `deploy.rs`

**Deploy hangs / times out**
- Try the alternative RPC: `http://65.21.235.219:7777` (public Testnet node)
- Increase TTL: add `ODRA_CASPER_LIVENET_TTL=1800000` to `.env`

**`AlreadyConfigured` error on re-deploy**
- `configure` and `set_reputation_contract` are one-time-only.
- If you need to redeploy, the new contracts will be fresh instances —
  re-run the full deploy script.

---

## Contract addresses (fill in after deploy)

| Contract         | Hash |
|------------------|------|
| AgentRegistry    |      |
| AgentReputation  |      |
| TaskCoordinator  |      |
