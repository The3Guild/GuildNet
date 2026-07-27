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
  userRating?:      number;   // average user rating (1.0–5.0)
  userRatingCount?: number;   // number of user ratings received
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
 * On-chain agent discovery via CSPR.cloud events API.
 * AgentRegistry events (AgentRegistered, ReputationUpdated, AgentDeactivated)
 * are parsed to discover real on-chain agents. The local cache persists across
 * requests and is rebuilt from events on fresh starts.
 *
 * Coordinator fallback agents (demo=true) are seeded when the store is empty,
 * providing a working system even without on-chain agents.
 */

/**
 * Sync on-chain state into the local agent store.
 * Discovers real agents registered on Casper Testnet by parsing
 * AgentRegistry events via CSPR.cloud. External agents are merged
 * into the local cache (preserving coordinator fallback agents).
 */
export async function syncWithChain(): Promise<void> {
  const now = Date.now();
  if (now - lastChainSync < CHAIN_SYNC_INTERVAL_MS) return;
  lastChainSync = now;

  try {
    const { discoverOnChainAgents } = await import("./reputation");
    const discovered = await discoverOnChainAgents();

    let newCount = 0;
    for (const agent of discovered) {
      const existing = agents.get(agent.accountHash);
      if (!existing) {
        // New on-chain agent not in local cache
        agents.set(agent.accountHash, {
          accountHash:      agent.accountHash,
          endpoint:         agent.endpoint,
          capability:       agent.capability,
          pricePerTask:     agent.pricePerTask,
          active:           agent.active,
          reputationScore:  agent.reputationScore,
          tasksCompleted:   0,
          tasksFailed:      0,
          lastUpdated:      new Date().toISOString(),
          source:           "on-chain",
        });
        newCount++;
      } else if (existing.source === "local" && !existing.demo) {
        // Upgrade local (user-registered) agent with on-chain data
        existing.reputationScore = agent.reputationScore;
        existing.active = agent.active;
        existing.source = "on-chain";
      } else if (existing.source === "on-chain") {
        // Refresh on-chain agent with latest data
        existing.reputationScore = agent.reputationScore;
        existing.active = agent.active;
        existing.lastUpdated = new Date().toISOString();
      }
    }

    if (newCount > 0 || discovered.length > 0) {
      saveLocal();
    }
    console.log(`[AgentStore] Chain sync: ${agents.size} agents total, ${discovered.length} on-chain discovered, ${newCount} new`);
  } catch (err) {
    console.warn(`[AgentStore] Chain sync failed (non-fatal): ${err}`);
  }
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
 * Submit a user rating (1–5 stars) for an agent.
 * Maintains a running average stored locally (not on-chain).
 */
export function rateAgent(
  accountHash: string,
  rating: number,
): { userRating: number; userRatingCount: number } | null {
  loadLocal();
  const agent = agents.get(accountHash);
  if (!agent) return null;

  const clamped = Math.max(1, Math.min(5, Math.round(rating)));
  const prevCount = agent.userRatingCount ?? 0;
  const prevTotal = (agent.userRating ?? 0) * prevCount;
  const newCount = prevCount + 1;
  const newRating = Math.round(((prevTotal + clamped) / newCount) * 10) / 10;

  agent.userRating = newRating;
  agent.userRatingCount = newCount;
  agents.set(accountHash, agent);
  saveLocal();

  return { userRating: newRating, userRatingCount: newCount };
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
    const crypto = await import("crypto");
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

    // Each capability gets a unique synthetic account hash derived from the
    // coordinator's real hash. This avoids Map key collisions while keeping
    // each demo agent identifiable.
    for (const cap of caps) {
      const capHash = crypto.createHash("sha256").update(`${acctHash}_${cap}`).digest("hex").slice(0, 64);
      const syntheticHash = "00" + capHash;

      agents.set(syntheticHash, {
        accountHash:      syntheticHash,
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
    console.log(`[AgentStore] Seeded ${caps.length} coordinator agents (demo=true) with unique synthetic hashes`);

    // On-chain registration is skipped for demo agents — they use synthetic
    // hashes that don't correspond to real Casper accounts. Real agents
    // self-register via POST /agent/register/prepare + /submit.
  } catch (err) {
    console.warn(`[AgentStore] Could not seed coordinator agents: ${err}`);
  }
}

// Auto-sync with chain on module load (non-blocking)
loadLocal();
syncWithChain().catch(() => {});
