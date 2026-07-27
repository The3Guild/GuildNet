import fs from "fs";
import path from "path";

export interface AgentRecord {
  accountHash:      string;
  endpoint:         string;
  capability:       string;
  pricePerTask:     string;
  active:           boolean;
  reputationScore:  number;
  tasksCompleted:   number;
  tasksFailed:      number;
  lastUpdated:      string;   // ISO timestamp of last reputation change
  source:           "on-chain" | "local";
  demo?:            boolean;  // true for seeded coordinator agents
}

const STORE_PATH = path.resolve(__dirname, "..", "data", "agents.json");
const ACCOUNT_HASH_RE = /^00[0-9a-f]{64}$/i;

let agents: Map<string, AgentRecord> = new Map();
let loaded = false;
let lastChainSync = 0;
const CHAIN_SYNC_INTERVAL_MS = 30_000;

function loadLocal(): void {
  if (loaded) return;
  try {
    const dir = path.dirname(STORE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(STORE_PATH)) {
      const raw = JSON.parse(fs.readFileSync(STORE_PATH, "utf-8"));
      let removed = 0;
      for (const [k, v] of Object.entries(raw)) {
        const rec = v as AgentRecord;
        if (!ACCOUNT_HASH_RE.test(rec.accountHash || k)) {
          removed++;
          continue;
        }
        agents.set(k, {
          ...rec,
          source:     rec.source ?? "local",
          tasksFailed: rec.tasksFailed ?? 0,
          lastUpdated: rec.lastUpdated ?? new Date(0).toISOString(),
        });
      }
      if (removed > 0) {
        console.warn(`[AgentStore] Removed ${removed} agents with invalid account hashes`);
        saveLocal();
      }
    }
  } catch (e) {
    console.warn(`[AgentStore] Failed to load local cache: ${e}`);
  }
  loaded = true;
}

function saveLocal(): void {
  try {
    const obj: Record<string, AgentRecord> = {};
    for (const [k, v] of agents) obj[k] = v;
    const dir = path.dirname(STORE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(STORE_PATH, JSON.stringify(obj, null, 2));
  } catch (e) {
    console.warn(`[AgentStore] Failed to save local cache: ${e}`);
  }
}

/**
 * On-chain agent discovery is limited by the AgentRegistry contract design:
 * agents are stored in an Odra Mapping<Address, AgentRecord> which is not
 * exposed via CSPR.cloud's named-keys API. Full on-chain discovery would
 * require a `get_all_agents()` entry point on the contract.
 *
 * For now, the local cache (seeded on startup + updated on user registration)
 * is the primary agent registry.
 */

/**
 * Sync on-chain state into the local agent store.
 * On-chain agent discovery is limited (no get_all_agents entry point),
 * so this is a best-effort merge. Local agents are always preserved.
 */
export async function syncWithChain(): Promise<void> {
  const now = Date.now();
  if (now - lastChainSync < CHAIN_SYNC_INTERVAL_MS) return;
  lastChainSync = now;

  // On-chain discovery is not yet supported (Odra Mapping not queryable).
  // Local cache is the primary registry, populated by seedCoordinatorAgents()
  // and updated by /agent/register/submit.
  console.log(`[AgentStore] Chain sync: ${agents.size} agents in local cache`);
}

// ── Public API ──────────────────────────────────────────────────────────────

export function addAgent(
  accountHash: string,
  endpoint: string,
  capability: string,
  priceMotes: string,
): void {
  loadLocal();
  if (!ACCOUNT_HASH_RE.test(accountHash)) {
    console.warn(`[AgentStore] Rejecting invalid account hash: ${accountHash}`);
    return;
  }
  agents.set(accountHash, {
    accountHash,
    endpoint,
    capability,
    pricePerTask: priceMotes,
    active: true,
    reputationScore: 5000,
    tasksCompleted: 0,
    tasksFailed: 0,
    lastUpdated: new Date().toISOString(),
    source: "local",
  });
  saveLocal();
}

export function getAllAgents(): AgentRecord[] {
  loadLocal();
  return Array.from(agents.values())
    .filter(a => a.active)
    .sort((a, b) => b.reputationScore - a.reputationScore);
}

export function getAgentsByCapability(capability: string): AgentRecord[] {
  loadLocal();
  return Array.from(agents.values())
    .filter(a => a.active && a.capability === capability)
    .sort((a, b) => b.reputationScore - a.reputationScore);
}

export function updateAgentReputation(accountHash: string, score: number): void {
  loadLocal();
  const agent = agents.get(accountHash);
  if (agent) {
    agent.reputationScore = score;
    agent.lastUpdated = new Date().toISOString();
    agents.set(accountHash, agent);
    saveLocal();
  }
}

export function incrementAgentTasks(accountHash: string): void {
  loadLocal();
  const agent = agents.get(accountHash);
  if (agent) {
    agent.tasksCompleted += 1;
    agents.set(accountHash, agent);
    saveLocal();
  }
}

function computeScore(completed: number, failed: number): number {
  const total = completed + failed;
  if (total === 0) return 5000;
  const weightedTotal = completed + failed * 2;
  return Math.min(9900, Math.max(100, Math.floor((completed / weightedTotal) * 10000)));
}

/**
 * Record a successful task completion for an agent.
 * Increments tasksCompleted, recomputes the trust score, and persists.
 */
export function recordAgentCompletion(accountHash: string): void {
  loadLocal();
  const agent = agents.get(accountHash);
  if (agent) {
    agent.tasksCompleted += 1;
    agent.reputationScore = computeScore(agent.tasksCompleted, agent.tasksFailed);
    agent.lastUpdated = new Date().toISOString();
    agents.set(accountHash, agent);
    saveLocal();
  }
}

/**
 * Record a failed / disputed task for an agent.
 * Increments tasksFailed, recomputes the trust score, and persists.
 * Failures carry double weight in the scoring formula.
 */
export function recordAgentFailure(accountHash: string): void {
  loadLocal();
  const agent = agents.get(accountHash);
  if (agent) {
    agent.tasksFailed += 1;
    agent.reputationScore = computeScore(agent.tasksCompleted, agent.tasksFailed);
    agent.lastUpdated = new Date().toISOString();
    agents.set(accountHash, agent);
    saveLocal();
  }
}

/**
 * Seed agents using the coordinator's own account hash.
 * Called on startup when no agents exist (e.g. fresh Render deploy).
 * Attempts on-chain registration via AgentRegistry for each capability.
 */
export async function seedCoordinatorAgents(): Promise<void> {
  loadLocal();
  if (agents.size > 0) return;

  try {
    const sdk = await import("casper-js-sdk");
    const { KeyAlgorithm, PrivateKey } = sdk.default ?? sdk;
    const fsPromises = await import("fs/promises");

    const keyPath   = process.env.COORDINATOR_SECRET_KEY_PATH || "./keys/secret_key.pem";
    const keyAlgo   = process.env.COORDINATOR_KEY_ALGO || "ed25519";
    const pem       = await fsPromises.readFile(keyPath, "utf-8");
    const algo      = keyAlgo === "secp256k1" ? KeyAlgorithm.SECP256K1 : KeyAlgorithm.ED25519;
    const key       = PrivateKey.fromPem(pem, algo);
    const acctHash  = "00" + key.publicKey.accountHash().toHex();

    if (!ACCOUNT_HASH_RE.test(acctHash)) {
      console.warn(`[AgentStore] Derived coordinator account hash is invalid: ${acctHash}`);
      return;
    }

    const priceMotes = "500000000";
    const caps = ["research", "risk", "coding", "design", "audit", "report"];

    // Seed locally first (always succeeds)
    for (const cap of caps) {
      agents.set(acctHash, {
        accountHash:      acctHash,
        endpoint:         `coordinator://${cap}`,
        capability:       cap,
        pricePerTask:     priceMotes,
        active:           true,
        reputationScore:  5000,
        tasksCompleted:   0,
        tasksFailed:      0,
        lastUpdated:      new Date().toISOString(),
        source:           "local",
        demo:             true,
      });
    }
    saveLocal();
    console.log(`[AgentStore] Seeded ${caps.length} coordinator agents (demo=true) with hash ${acctHash.slice(0, 14)}…`);

    // Attempt on-chain registration for each capability (best-effort)
    try {
      const { callContractEntry } = await import("./coordinator");
      const { config } = await import("./config");
      let onChainCount = 0;
      for (const cap of caps) {
        try {
          await callContractEntry(
            "register",
            {
              endpoint:       `coordinator://${cap}`,
              capability:     cap,
              price_per_task: { type: "U512", value: priceMotes },
            },
            undefined,
            config.contracts.agentRegistry,
          );
          onChainCount++;
          console.log(`[AgentStore] ✓ Registered ${cap} agent on-chain`);
        } catch (err) {
          console.warn(`[AgentStore] On-chain registration for ${cap} failed (non-fatal): ${(err as Error).message?.slice(0, 120)}`);
        }
      }
      if (onChainCount > 0) {
        // Update source to on-chain for successfully registered agents
        const agent = agents.get(acctHash);
        if (agent) {
          agent.source = "on-chain";
          agent.demo = false;
        }
        saveLocal();
        console.log(`[AgentStore] ${onChainCount}/${caps.length} agents registered on-chain`);
      }
    } catch (err) {
      console.warn(`[AgentStore] On-chain registration batch failed (non-fatal): ${err}`);
    }
  } catch (err) {
    console.warn(`[AgentStore] Could not seed coordinator agents: ${err}`);
  }
}

// Auto-sync with chain on module load (non-blocking)
loadLocal();
syncWithChain().catch(() => {});
