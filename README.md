# GuildNet — RWA Oracle Agents with Verifiable On-Chain Identity

> AI agents that discover, hire, pay, and build reputation — fully autonomous on Casper.

GuildNet is a decentralized AI agent coordination network with **verifiable on-chain identity and reputation**, built for the Casper Agentic Buildathon. Agents self-register in an on-chain directory, get hired by a coordinator, execute work via Venice AI, settle payments through Casper's **x402 Facilitator**, and build a verifiable trust score — all without human intervention.

This directly implements the **RWA Oracle Agent with Verifiable On-Chain Identity** pattern from the buildathon brief.

---

## Casper AI Toolkit Usage

| Toolkit Component | Integration |
|---|---|
| **x402 Facilitator** | Agent payments use the live Casper x402 Facilitator — EIP-712 `TransferAuthorization` signed by requester, verified off-chain via `/verify`, settled on-chain via `/settle` — producing real Casper Testnet deploy hashes |
| **Odra Framework** | All three smart contracts written in Rust/Odra 2.8.0, tested with `odra-test` mock VM, compiled to Wasm, and deployed to Casper Testnet |
| **CSPR.cloud APIs** | Backend discovers agents via CSPR.cloud REST API (`/contracts/{hash}/named-keys`), submits transactions via Casper RPC |
| **CSPR.click / Agent Skills** | Backend uses `casper-js-sdk` for wallet creation, transaction signing, and contract interaction matching the CSPR.click Agent Skill pattern |
| **Casper MCP** | Architecture supports MCP integration for natural-language balance queries and transaction submission |

---

## Architecture

```
                    ┌─────────────────────────────┐
                    │      Casper Testnet          │
                    │                              │
                    │  ┌──────────────────────┐   │
                    │  │   AgentRegistry       │   │
                    │  │  - register/update    │   │
                    │  │  - find_by_capability │   │
                    │  │  - reputation-sorted  │   │
                    │  │  - update_reputation  │   │
                    │  └──────────┬───────────┘   │
                    │             │                │
                    │  ┌──────────▼───────────┐   │
                    │  │  AgentReputation      │   │
                    │  │  - record_completion  │   │
                    │  │  - record_failure     │   │
                    │  │  - compute_score()    │   │
                    │  │  - pushes score →     │   │
                    │  │    AgentRegistry      │   │
                    │  └──────────┬───────────┘   │
                    │             │                │
                    │  ┌──────────▼───────────┐   │
                    │  │  TaskCoordinator      │   │
                    │  │  - create_task (CSPR) │   │
                    │  │  - hire_agent (x402)  │   │
                    │  │  - complete_task      │   │
                    │  │  - flag_agent_failure │   │
                    │  └──────────────────────┘   │
                    │                              │
                    │  x402 Facilitator            │
                    │  - /verify (off-chain)       │
                    │  - /settle (on-chain tx)     │
                    └──────────┬───────────────────┘
                               │
                    ┌──────────▼───────────────────┐
                    │  Coordinator Backend          │
                    │  - Creates task on-chain      │
                    │  - Discovers agents via       │
                    │    CSPR.cloud REST API        │
                    │  - Hires agents via           │
                    │    x402 facilitator payment   │
                    │  - Runs Venice AI inference   │
                    │  - Completes task on-chain    │
                    │  - Triggers reputation update │
                    └──────────────────────────────┘
```

---

## Smart Contracts (Rust/Odra)

Three contracts deployed to Casper Testnet, built with Casper's Odra Framework:

### AgentRegistry — On-Chain Agent Directory

```
struct AgentRecord {
    endpoint:         String,        // Venice AI URL
    capability:       String,        // "research" | "risk" | "oracle" | ...
    price_per_task:   U512,          // price in motes
    active:           bool,
    reputation_score: u32,           // 0-10000, written by AgentReputation
    tasks_completed:  u64,
}
```

- Agents self-register with endpoint, capability, and price
- `find_by_capability` returns active agents **sorted by reputation descending** — highest-trust agent first
- `update_reputation` restricted to the AgentReputation contract
- Events: `AgentRegistered`, `AgentUpdated`, `AgentDeactivated`, `ReputationUpdated`

### AgentReputation — Verifiable On-Chain Identity

This is the **RWA Oracle Agent** differentiator — agents build a cryptographically verifiable reputation directly on-chain.

- `record_completion(agent, task_id)` — increases trust score
- `record_failure(agent, task_id)` — failures weighted double, penalizing bad actors
- `compute_score(completed, failed)` → 0-10000 scale (5000 = neutral, 9900 = trusted)
- Score pushed back to AgentRegistry automatically on every update
- Restricted to TaskCoordinator (access controlled)

Scoring formula:
```
weighted_total = completions + (failures × 2)
raw_score     = completions / weighted_total × 10000
```
- Pure-success agents converge toward **9900** (ceiling)
- Repeated failures push toward **100** (floor)
- New agents start at **5000** (neutral)

### TaskCoordinator — Orchestration Engine

```
struct Task {
    requester:    Address,
    description:  String,
    budget:       U512,              // remaining CSPR escrow
    agents_hired: Vec<Address>,
    completed:    bool,
    result_hash:  Option<String>,    // SHA-256 of AI output
}
```

- `create_task(description)` — payable, escrows CSPR budget on-chain
- `hire_agent(task_id, agent, value, ..., signature)` — coordinator-only; verifies EIP-712 typed-data signature, deducts budget, transfers CSPR to agent
- `complete_task(task_id, result_hash)` — refunds unspent CSPR, calls AgentReputation for every hired agent
- `flag_agent_failure(task_id, agent)` — dispute resolution, triggers reputation penalty
- **Replay protection:** 32-byte nonce consumed per authorization, `paid[(task_id, agent)]` double-payment guard
- **Time-bounded:** `valid_after` / `valid_before` window enforced on every hire

### x402 — EIP-712 Payment Authorization

Implements the exact x402 typed-data signing scheme verified by the CSPR.cloud facilitator:

```
Domain:  { name: "GuildNet", version: "1", chain_name, contract_package_hash }
Message: TransferAuthorization { from, to, value, valid_after, valid_before, nonce }
```

---

## Payment Flow — Real x402 Micropayments

```
Requester creates task with 3 CSPR escrow
  └─ TaskCoordinator.create_task(description) { value: 3 CSPR }

Requester pre-signs EIP-712 TransferAuthorization
  └─ { from: requester, to: agent, value: 0.5 CSPR, nonce, valid_after, valid_before }

Coordinator submits signed authorization
  └─ hire_agent()
  └─ Verifies EIP-712 signature on-chain
  └─ Deducts from task budget
  └─ Transfers CSPR to agent (on-chain tx)
  └─ Emits AgentHired event

Backend settles via x402 Facilitator
  └─ POST /verify (off-chain signature check)
  └─ POST /settle (CEP-18 token transfer on Casper Testnet)
  └─ Returns deploy hash — real Casper payment proof

Task completed
  └─ complete_task()
  └─ Refunds unspent CSPR to requester
  └─ AgentReputation.record_completion() for each hired agent
  └─ Reputation score updated on-chain
```

---

## Deployment

### Casper Testnet

| Contract | Package Hash |
|---|---|
| AgentRegistry | `hash-d99fca67a1671de057392109594fab2bb2f412643f7f6aa22ca0f297c60c00c3` |
| AgentReputation | `hash-87cb7a6c8e3a7a8fcc7aa1d4c0f8024859d54d300344ae8d53039b7f8ab11c69` |
| TaskCoordinator | `hash-2216cbbc233837a526e1b3b47ec1e1535258151ef779a1bd8476266898105ac1` |

Explorer links:
- [AgentRegistry](https://testnet.cspr.live/contract/hash-d99fca67a1671de057392109594fab2bb2f412643f7f6aa22ca0f297c60c00c3)
- [AgentReputation](https://testnet.cspr.live/contract/hash-87cb7a6c8e3a7a8fcc7aa1d4c0f8024859d54d300344ae8d53039b7f8ab11c69)
- [TaskCoordinator](https://testnet.cspr.live/contract/hash-2216cbbc233837a526e1b3b47ec1e1535258151ef779a1bd8476266898105ac1)

### Build & Deploy Locally

```bash
cd smart-contract

# Run unit tests (29 tests, MockVM — no chain needed)
cargo odra test

# Build Wasm files
cargo odra build

# Deploy to Casper Testnet
cargo run --bin deploy --features=livenet
```

See `smart-contract/DEPLOY.md` for detailed deploy instructions.

---

## Backend API

The coordinator backend runs as an Express server on port 3000:

```bash
cd backend
cp .env.example .env   # fill in your keys
npm install
npm run dev
```

| Endpoint | Description |
|---|---|
| `POST /task` | Full coordinator loop: create → discover → hire → x402 → complete |
| `POST /agent/:capability/run` | Run a single agent capability |
| `POST /suggest-agents` | Deterministic capability routing from task description |
| `POST /enhance` | Refine agent output with feedback |
| `POST /build` | Generate full project from prompt (architect → code → design → review) |
| `GET /health` | Health check |

### Server-Side Agent Types

| Agent | Capability | Backend System |
|---|---|---|
| Research | `research` | Venice AI (llama-3.3-70b) |
| Risk | `risk` | Venice AI |
| Coding | `coding` | Venice AI |
| Design | `design` | Venice AI |
| Audit | `audit` | Venice AI |
| Report | `report` | Venice AI |

---

## Tests

### Smart Contracts (29 tests, all passing)

```bash
cd smart-contract
cargo odra test
```

| Test | Coverage |
|---|---|
| `agent_registry` | Register, discover, deactivate, re-registration preserves reputation, sorted by score, update, empty capability guard |
| `agent_reputation` | Score starts at neutral, completions raise score, failures lower score, compute floor/ceiling, access control, configure-once |
| `task_coordinator` | Create task escrow, hire with x402 auth, invalid signature revert, replay protection, expiry guard, amount mismatch, complete refund, double-payment guard, access control, result hash storage, reputation integration, zero-budget revert |
| `x402` | Deterministic digest, nonce changes digest, signature verification with test signer |

---

## RWA Oracle Agent Pattern

GuildNet's architecture directly maps to **Example Direction #2** from the Casper Agentic Buildathon brief:

> *"Create an agent that scrapes off-chain data, runs a risk assessment model, and posts verified data on-chain via Casper's native X402 implementation. The agent maintains a verifiable on-chain identity and reputation score based on historical accuracy, creating a trust-minimized RWA oracle."*

| Brief Requirement | GuildNet Implementation |
|---|---|
| Off-chain data scraping | Venice AI inference per agent (research, risk, audit) |
| Risk assessment model | Risk agent capability + Audit agent cross-verification |
| Posted on-chain via X402 | Complete task stores `result_hash` (SHA-256) on-chain |
| Verifiable on-chain identity | `AgentRegistry` with `reputation_score` per agent |
| Reputation score based on accuracy | `AgentReputation` — `compute_score` weights completions vs failures |
| Trust-minimized oracle | Sorted agent discovery by reputation; failures recorded on-chain and penalized double |

---

## Why This Wins

| Criterion | How GuildNet Delivers |
|---|---|
| **Technical Execution** | Three Odra contracts, 29 tests, TypeScript backend, full x402 pipeline — production-quality |
| **Innovation & Originality** | Verifiable on-chain reputation for AI agents using Casper-native x402 + EIP-712 |
| **Use of AI / Agentic Systems** | 6 specialized Venice AI agent types, multi-wave orchestration, A2A hiring |
| **Real-World Applicability** | RWA Oracle Agents with trust-minimized verified data — directly from the buildathon brief |
| **Working Smart Contracts** | 3 contracts deployed on Casper Testnet with real deploy hashes |
| **x402 Facilitator** | Full verify + settle flow through the live CSPR.cloud facilitator — not a mock |
| **Depth of Toolkit Usage** | Odra + x402 Facilitator + CSPR.cloud REST API + casper-js-sdk + EIP-712 — all five pieces tied together |

---

## Repository Structure

```
guildnet/
├── smart-contract/          # Odra Rust contracts (Casper)
│   ├── src/
│   │   ├── agent_registry.rs
│   │   ├── agent_reputation.rs
│   │   ├── task_coordinator.rs
│   │   ├── x402.rs
│   │   └── bin/
│   │       └── deploy.rs    # Livenet deploy script
│   ├── wasm/                # Compiled .wasm files
│   ├── Cargo.toml
│   ├── Odra.toml
│   └── DEPLOY.md
├── backend/                 # TypeScript coordinator
│   ├── src/
│   │   ├── chain.ts         # Casper RPC + CSPR.cloud client
│   │   ├── coordinator.ts   # Orchestration loop
│   │   ├── x402.ts          # x402 payment client
│   │   ├── server.ts        # Express API
│   │   ├── agentRunner.ts   # Single agent runner
│   │   ├── builder.ts       # Project generation
│   │   ├── agents/          # Venice AI agent prompts
│   │   └── config.ts
│   └── .env.example
├── frontend/                # Next.js UI (in development)
└── archive/                 # Legacy Solidity contracts (Base-era)
```

---

## Future Vision

- **Agent-to-Agent sub-hiring**: Agents hire sub-agents autonomously using their own wallet and x402 payments
- **Multi-agent DAOs**: Guilds with shared treasuries governed by reputation-weighted voting
- **RWA data pipeline**: Continuous off-chain data streaming with on-chain verification timestamps
- **MCP-native discovery**: Agents discover each other via Casper MCP in natural language

---

*Built for the Casper Agentic Buildathon 2026*
