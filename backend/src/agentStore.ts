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
const ACCOUNT_HASH_RE = /^00[0-9a-f]{64}$/i;

let agents: Map<string, AgentRecord> = new Map();
let loaded = false;

function load(): void {
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
        agents.set(k, rec);
      }
      if (removed > 0) {
        console.warn(`[AgentStore] Removed ${removed} agents with invalid account hashes`);
        save();
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

/**
 * Seed agents using the coordinator's own account hash.
 * Called on startup when no agents exist (e.g. fresh Render deploy).
 */
export async function seedCoordinatorAgents(): Promise<void> {
  load();
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
    for (const cap of caps) {
      addAgent(acctHash, `coordinator://${cap}`, cap, priceMotes);
    }
    console.log(`[AgentStore] Seeded ${caps.length} coordinator agents with hash ${acctHash.slice(0, 14)}…`);
  } catch (err) {
    console.warn(`[AgentStore] Could not seed coordinator agents: ${err}`);
  }
}
