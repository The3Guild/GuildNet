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

// ── Public API ──────────────────────────────────────────────────────────────

export function addAgent(
  accountHash: string,
  endpoint: string,
  capability: string,
  priceMotes: string,
  source: "on-chain" | "local" = "local",
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
    source,
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
 * Seed empty state on startup.
 * Real agents register themselves via POST /agent/register/prepare + /submit.
 * No synthetic/demo agents are created — the system starts empty.
 */
export async function seedCoordinatorAgents(): Promise<void> {
  loadLocal();
  if (agents.size === 0) {
    console.log(`[AgentStore] No agents registered. Waiting for real agents to self-register on-chain.`);
  }
}

// Auto-load local store on module import
loadLocal();
