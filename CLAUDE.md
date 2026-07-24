# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

GuildNet is a decentralized AI-agent coordination network running on **Casper Testnet**. AI agents self-register on-chain, get hired by a coordinator, execute work via **Venice AI**, settle payments through Casper's **x402 Facilitator**, and accrue a verifiable on-chain reputation. Built for the Casper Agentic Buildathon (RWA Oracle Agent pattern).

The repo is a monorepo with three independent projects, each with its own toolchain:

- `smart-contract/` — Rust/Odra 2.8 contracts deployed to Casper Testnet
- `backend/` — TypeScript/Express coordinator (the orchestration brain)
- `frontend/` — Next.js 16 / React 19 UI with CSPR.click wallet integration
- `archive/` — legacy Solidity/Base-era contracts, **not in use** — ignore unless doing history archaeology

## Commands

Each subproject is built and tested independently. There is no root-level task runner.

### Smart contracts (`smart-contract/`)
```bash
cargo odra test                              # 29 unit tests on Odra MockVM (no chain needed)
cargo odra test -- agent_registry            # run one test module
cargo odra build                             # compile to wasm/ (.wasm files)
cargo run --bin deploy --features=livenet    # deploy to Casper Testnet (needs livenet env)
```
Requires the pinned nightly toolchain (`rust-toolchain.toml`: `nightly-2025-02-01`, `wasm32-unknown-unknown`). See `smart-contract/DEPLOY.md`.

### Backend (`backend/`)
```bash
npm run dev            # ts-node-dev, hot reload, serves on PORT (default 3000)
npm run build          # tsc → dist/
npm start              # build + node dist/server.js (production)
npm test               # vitest run
npm run test:watch     # vitest watch
npm run lint           # eslint src/
npm run format         # prettier --write src/
npx vitest run src/__tests__/x402.test.ts   # single test file
```
Needs `.env` (copy `.env.example`). Required vars with no default: `AGENT_REGISTRY_HASH`, `AGENT_REPUTATION_HASH`, `TASK_COORDINATOR_HASH`, `CSPR_CLOUD_AUTH_TOKEN`, `VENICE_API_KEY`. Config with validation lives in `src/config.ts` — `required()` throws on missing, `optional()` supplies a testnet default.

### Frontend (`frontend/`)
```bash
npm run dev            # next dev (defaults to :3000 — run backend on a different port or set PORT)
npm run build          # next build
npm test               # vitest run
npm run lint           # next lint
```
Needs `NEXT_PUBLIC_BACKEND_URL` in `.env.local`.

## Architecture

### The coordinator loop (backend)
`POST /task` → `runCoordinator()` in `src/coordinator.ts` drives the whole system:
1. Create task on-chain (escrows CSPR) via `TaskCoordinator` contract
2. Discover agents by capability (highest reputation first)
3. Hire each agent — records the hire on-chain, then settles a real x402 payment
4. Run Venice AI inference per hired agent (`src/agents/venice.ts`)
5. Complete the task on-chain, which triggers reputation updates

Backend module map:
- `config.ts` — single source of env config; import `config` everywhere, never read `process.env` directly
- `chain.ts` — Casper RPC + CSPR.cloud REST client (`csproCloudGet`)
- `casperHandler.ts` — `AxiosHandler` for casper-js-sdk RpcClient, error helpers, `simulatedHash()`
- `coordinator.ts` — orchestration + on-chain reads/writes (`queryContractVar`, `findAllAgents`, deploy building)
- `x402.ts` — server-side x402 verify/settle client (`settleX402Payment`)
- `agentRunner.ts` — single-agent A2A runner (an agent can hire sub-agents before inference)
- `agentStore.ts` — in-memory agent registry mirror; `seedCoordinatorAgents()` seeds defaults on boot
- `builder.ts` + `agents/builder.ts` — multi-stage project generation (architect → code → design → review)
- `server.ts` — Express routes, rate limiting, CORS

The `casper-js-sdk` is imported lazily (`getSdk()`) throughout — it's a heavy ESM module. Follow that pattern when adding chain calls. Reads have a two-tier fallback: direct Casper RPC first, then CSPR.cloud named-keys API.

**On-chain writes are graceful-degrading:** if a deploy submission fails, the code falls back to `simulatedHash()` / local storage rather than throwing, so the demo stays live. Keep this behavior when touching write paths.

### API surface (server.ts)
Beyond the README's list, live routes include: `GET /health`, `GET /agents`, `GET /stats`, `GET /setup/check`, `POST /task`, `POST /agent/register/prepare` + `/submit` (unsigned-deploy build → CSPR.click signs → submit), `POST /agent/:capability/run`, `POST /suggest-agents`, `POST /enhance`, `POST /build`, `POST /verify-endpoint`, `POST /x402/prepare` + `/x402/submit`, `GET /design-preview/:taskId`. All mutating routes share a 10-req/min rate limiter.

Capabilities are a closed set: `research | risk | coding | design | audit | report`. `/suggest-agents` does keyword-based deterministic routing over a task description — edit the regexes there to change routing.

### x402 payment flow
The real differentiator. EIP-712 `TransferWithAuthorization` typed data is built in `/x402/prepare` (domain uses the Wrapped CSPR CEP-18 package + `casper:casper-test`). The frontend signs via CSPR.click; `/x402/submit` POSTs `paymentPayload` + `paymentRequirements` to the CSPR.cloud facilitator `/verify` then `/settle`, yielding a real Casper deploy hash. Nonces are tracked in an in-memory `pendingAuths` map to bind prepare↔submit. The contract-side mirror of this scheme lives in `smart-contract/src/x402.rs`.

### Smart contracts (`smart-contract/src/`)
Three Odra contracts, registered in `Odra.toml`:
- `agent_registry.rs` — agent directory; `find_by_capability` returns active agents sorted by reputation desc; `update_reputation` is access-controlled to the reputation contract
- `agent_reputation.rs` — `compute_score(completed, failed)` → 0–10000 (5000 neutral, failures weighted ×2); pushes score back into the registry on every update; restricted to the coordinator
- `task_coordinator.rs` — task escrow, `hire_agent` (verifies EIP-712 sig, deducts budget, transfers CSPR), `complete_task` (refunds + records completions), `flag_agent_failure`; replay protection via per-auth 32-byte nonce + `paid[(task_id, agent)]` guard, and `valid_after`/`valid_before` time window
- `x402.rs` — EIP-712 digest + signature verification (uses `ed25519-dalek` + `casper-eip-712`)

Contract addresses are pinned in the README, `backend/.env.example`, and `render.yaml`. If you redeploy, update all three.

### Frontend (`frontend/`)
Next.js App Router (`app/`), one directory per page (`agents`, `tasks`, `register`, `builder`, `dashboard`, `payments`, `settings`, `submit`). CSPR.click wallet lives in `contexts/click-context.tsx`; data hooks in `hooks/` (`use-wallet`, `use-tasks`, `use-chain-agents`, `use-task-history`). Shared config/URLs in `lib/constants.ts`. Tailwind CSS 3 + shadcn-style `cn()` in `lib/utils.ts`. All backend calls go through `NEXT_PUBLIC_BACKEND_URL`.

## Deployment
Backend deploys to Render (`render.yaml`, health check `/health`, coordinator key mounted at `/etc/secrets/secret_key.pem`). Frontend deploys to Vercel (`guildnet.vercel.app`), which is the default `ALLOWED_ORIGIN` in the backend CORS config. Secrets (`CSPR_CLOUD_AUTH_TOKEN`, `VENICE_API_KEY`) are `sync: false` — set them in the Render dashboard.

## Conventions
- Formatting via Prettier (`.prettierrc`): 2-space indent, double quotes. The codebase uses aligned column comments and `// ── section ──` dividers heavily — match that style.
- TypeScript strict; `type`-only imports (`import { type Request }`).
- Import Casper SDK lazily; never block module load on it.
