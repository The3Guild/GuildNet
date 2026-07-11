import fs from "fs";
import path from "path";

interface AgentRecord {
  accountHash:      string;
  endpoint:         string;
  capability:       string;
  pricePerTask:     string;
  active:           boolean;
  reputationScore:  number;
}

const STORE_PATH = path.resolve(__dirname, "..", "data", "agents.json");

let agents: Map<string, AgentRecord> = new Map();
let loaded = false;

function load(): void {
  if (loaded) return;
  try {
    const dir = path.dirname(STORE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(STORE_PATH)) {
      const raw = JSON.parse(fs.readFileSync(STORE_PATH, "utf-8"));
      for (const [k, v] of Object.entries(raw)) {
        agents.set(k, v as AgentRecord);
      }
    }
  } catch (e) {
    console.warn(`[AgentStore] Failed to load: ${e}`);
  }
  loaded = true;
}

function save(): void {
  try {
    const obj: Record<string, AgentRecord> = {};
    for (const [k, v] of agents) obj[k] = v;
    fs.writeFileSync(STORE_PATH, JSON.stringify(obj, null, 2));
  } catch (e) {
    console.warn(`[AgentStore] Failed to save: ${e}`);
  }
}

export function addAgent(
  accountHash: string,
  endpoint: string,
  capability: string,
  priceMotes: string,
): void {
  load();
  agents.set(accountHash, {
    accountHash,
    endpoint,
    capability,
    pricePerTask: priceMotes,
    active: true,
    reputationScore: 5000,
  });
  save();
}

export function getAllAgents(): AgentRecord[] {
  load();
  return Array.from(agents.values())
    .filter(a => a.active)
    .sort((a, b) => b.reputationScore - a.reputationScore);
}

export function getAgentsByCapability(capability: string): AgentRecord[] {
  load();
  return Array.from(agents.values())
    .filter(a => a.active && a.capability === capability)
    .sort((a, b) => b.reputationScore - a.reputationScore);
}
