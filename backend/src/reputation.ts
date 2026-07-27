/**
 * reputation.ts — Trust Ledger & On-Chain Discovery
 *
 * Two primary functions:
 *   1. Agent Discovery: Parse AgentRegistered / ReputationUpdated / AgentDeactivated
 *      events from CSPR.cloud to discover real on-chain agents.
 *   2. Reputation: Read from local agentStore (mirrors on-chain state).
 *
 * Odra Mapping storage is NOT readable via named keys — individual mapping
 * entries can only be accessed via dictionary reads or view entry points.
 * Events are the reliable discovery mechanism; the local store mirrors writes.
 */

import { config } from "./config";
import { csproCloudGet } from "./chain";
import { type AgentRecord } from "./agentStore";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ReputationData {
  tasksCompleted: number;
  tasksFailed:    number;
  score:          number;
  lastUpdated:    string; // ISO timestamp
}

export interface ReputationEvent {
  agent:       string;
  taskId:      string;
  score:       number;
  success:     boolean;
  timestamp:   string;
}

// ── Local-store backed reputation query ──────────────────────────────────────

/**
 * Get reputation data for an agent from the local agentStore.
 * The local store is kept in sync by recordAgentCompletion() / recordAgentFailure()
 * which are called after every on-chain complete_task / flag_agent_failure.
 */
export async function getReputation(
  agentHash: string,
  agentRecord?: AgentRecord | null,
): Promise<ReputationData | null> {
  if (!agentRecord) return null;
  return {
    tasksCompleted: agentRecord.tasksCompleted,
    tasksFailed:    agentRecord.tasksFailed,
    score:          agentRecord.reputationScore,
    lastUpdated:    agentRecord.lastUpdated ?? new Date(0).toISOString(),
  };
}

/**
 * Fetch ReputationRecorded events from CSPR.cloud for a given agent.
 * These are emitted by the AgentReputation contract on each task completion.
 *
 * CSPR.cloud returns hex-encoded CL values for event fields. We attempt
 * to decode the standard CL serialization layout:
 *   Address (32 bytes) | u64 task_id | u32 score | u64 tasks_completed | u64 tasks_failed
 */
export async function getReputationEvents(agentHash: string): Promise<ReputationEvent[]> {
  try {
    const data = await csproCloudGet(
      `/contracts/${config.contracts.agentReputation.replace("hash-", "")}/events?limit=50`
    ) as { data?: Array<{ event_name: string; cl_value: string; timestamp: string }> };

    const events: ReputationEvent[] = [];
    for (const evt of (data.data ?? [])) {
      if (evt.event_name !== "ReputationRecorded") continue;

      try {
        const parsed = parseReputationRecorded(evt.cl_value);
        if (parsed && parsed.agent === agentHash) {
          events.push({
            agent:     parsed.agent,
            taskId:    String(parsed.taskId),
            score:     parsed.score,
            success:   parsed.success,
            timestamp: evt.timestamp,
          });
        }
      } catch {
        // Unparseable CL value — skip this event
      }
    }
    return events;
  } catch (err) {
    console.warn(`[Reputation] Failed to fetch events for ${agentHash.slice(0, 14)}…: ${err}`);
    return [];
  }
}

// ── CL hex value parser for ReputationRecorded events ────────────────────────

interface ParsedReputationEvent {
  agent:     string;
  taskId:    number;
  score:     number;
  success:   boolean;
}

/**
 * Parse hex-encoded CL values from a ReputationRecorded event.
 *
 * CL type tags (first byte of each value):
 *   0x01 = Key (Address is stored as a 32-byte Key)
 *   0x04 = U32
 *   0x05 = U64
 *   0x09 = String
 *
 * ReputationRecorded layout:
 *   [0x01] [32 bytes address]    — agent
 *   [0x05] [8 bytes LE]          — task_id
 *   [0x04] [4 bytes LE]          — score
 *   [0x05] [8 bytes LE]          — tasks_completed
 *   [0x05] [8 bytes LE]          — tasks_failed
 */
function parseReputationRecorded(hex: string): ParsedReputationEvent | null {
  const clean = hex.replace(/^0x/i, "");
  // minimum: 1 tag + 32 addr + 1 tag + 8 task_id + 1 tag + 4 score + 1 tag + 8 completed + 1 tag + 8 failed = 64 bytes = 128 hex
  if (clean.length < 128) return null;

  let offset = 0;
  const readByte = () => {
    const byte = parseInt(clean.slice(offset, offset + 2), 16);
    offset += 2;
    return byte;
  };
  const readBytes = (n: number) => {
    const bytes = clean.slice(offset, offset + n * 2);
    offset += n * 2;
    return bytes;
  };

  // Agent address — Key type (tag 0x01), 32 bytes
  const addrTag = readByte();
  if (addrTag !== 0x01) return null;
  const agentHex = readBytes(32);
  // Address is stored as "00" + raw key hex in Casper
  const agent = "00" + agentHex;

  // task_id — U64 type (tag 0x05), 8 bytes LE
  const taskIdTag = readByte();
  if (taskIdTag !== 0x05) return null;
  const taskIdHex = readBytes(8);
  const taskId = Number(BigInt("0x" + taskIdHex.split("").reverse().join("")));

  // score — U32 type (tag 0x04), 4 bytes LE
  const scoreTag = readByte();
  if (scoreTag !== 0x04) return null;
  const scoreHex = readBytes(4);
  const score = parseInt(scoreHex.split("").reverse().join(""), 16);

  // tasks_completed — U64 type (tag 0x05), 8 bytes LE
  const completedTag = readByte();
  if (completedTag !== 0x05) return null;
  const completedHex = readBytes(8);
  const tasksCompleted = Number(BigInt("0x" + completedHex.split("").reverse().join("")));

  // tasks_failed — U64 type (tag 0x05), 8 bytes LE
  const failedTag = readByte();
  if (failedTag !== 0x05) return null;
  const failedHex = readBytes(8);
  const tasksFailed = Number(BigInt("0x" + failedHex.split("").reverse().join("")));

  return {
    agent,
    taskId,
    score,
    success: tasksCompleted > tasksFailed,
  };
}

// ── On-chain agent discovery via CSPR.cloud events API ───────────────────────

export interface DiscoveredAgent {
  accountHash:      string;
  endpoint:         string;
  capability:       string;
  pricePerTask:     string;
  active:           boolean;
  reputationScore:  number;
}

/**
 * Discover real on-chain agents by parsing AgentRegistry events from CSPR.cloud.
 *
 * Processes three event types:
 *   1. AgentRegistered — agent address, endpoint, capability, price
 *   2. ReputationUpdated — pushes reputation score
 *   3. AgentDeactivated — marks agent inactive
 *
 * Events are processed in chronological order (reversed from CSPR.cloud's
 * newest-first response) so the final state reflects the latest on-chain data.
 */
export async function discoverOnChainAgents(): Promise<DiscoveredAgent[]> {
  try {
    const data = await csproCloudGet(
      `/contracts/${config.contracts.agentRegistry.replace("hash-", "")}/events?limit=200`
    ) as { data?: Array<{ event_name: string; cl_value: string; timestamp: string }> };

    const events = data.data ?? [];
    // CSPR.cloud returns newest-first; reverse for chronological processing
    events.reverse();

    const agents = new Map<string, DiscoveredAgent>();

    for (const evt of events) {
      try {
        if (evt.event_name === "AgentRegistered") {
          const parsed = parseAgentRegistered(evt.cl_value);
          if (parsed) {
            agents.set(parsed.accountHash, {
              accountHash:     parsed.accountHash,
              endpoint:        parsed.endpoint || `https://guildnet.io/agents/${parsed.capability}`,
              capability:      parsed.capability,
              pricePerTask:    parsed.pricePerTask,
              active:          true,
              reputationScore: 5000,
            });
          }
        } else if (evt.event_name === "ReputationUpdated") {
          const parsed = parseReputationUpdated(evt.cl_value);
          if (parsed && agents.has(parsed.agent)) {
            agents.get(parsed.agent)!.reputationScore = parsed.score;
          }
        } else if (evt.event_name === "AgentDeactivated") {
          const parsed = parseAgentDeactivated(evt.cl_value);
          if (parsed && agents.has(parsed.agent)) {
            agents.get(parsed.agent)!.active = false;
          }
        }
      } catch {
        // Skip unparseable events
      }
    }

    if (agents.size > 0) {
      console.log(`[Discovery] Found ${agents.size} on-chain agents from ${events.length} events`);
    }
    return Array.from(agents.values());
  } catch (err) {
    console.warn(`[Discovery] Failed to query AgentRegistry events: ${err}`);
    return [];
  }
}

// ── CL hex value parsers for AgentRegistry events ────────────────────────────

interface ParsedAgentRegistered {
  accountHash:  string;
  endpoint:     string;
  capability:   string;
  pricePerTask: string;
}

/**
 * Parse AgentRegistered event CL values.
 * Layout: [Key agent] [String endpoint] [String capability] [U512 price_per_task]
 */
function parseAgentRegistered(hex: string): ParsedAgentRegistered | null {
  const clean = hex.replace(/^0x/i, "");
  let offset = 0;
  const readByte = () => {
    const byte = parseInt(clean.slice(offset, offset + 2), 16);
    offset += 2;
    return byte;
  };
  const readBytes = (n: number) => {
    const bytes = clean.slice(offset, offset + n * 2);
    offset += n * 2;
    return bytes;
  };

  // Agent address — Key type (tag 0x01), 32 bytes
  const addrTag = readByte();
  if (addrTag !== 0x01) return null;
  const agentHex = readBytes(32);
  const accountHash = "00" + agentHex;

  // Endpoint — String type (tag 0x09), 4-byte LE length + UTF-8
  const endpointTag = readByte();
  if (endpointTag !== 0x09) return null;
  const endpointLen = parseInt(readBytes(4).split("").reverse().join(""), 16);
  const endpoint = Buffer.from(readBytes(endpointLen), "hex").toString("utf-8");

  // Capability — String type (tag 0x09), 4-byte LE length + UTF-8
  const capTag = readByte();
  if (capTag !== 0x09) return null;
  const capLen = parseInt(readBytes(4).split("").reverse().join(""), 16);
  const capability = Buffer.from(readBytes(capLen), "hex").toString("utf-8");

  // Price per task — U512 type (tag 0x06), 1-byte count + N*8 bytes LE
  const priceTag = readByte();
  if (priceTag !== 0x06) return null;
  const priceWordCount = readByte();
  let price = 0n;
  for (let i = 0; i < priceWordCount; i++) {
    const wordHex = readBytes(8).split("").reverse().join("");
    price |= BigInt("0x" + wordHex) << (BigInt(i) * 64n);
  }

  return { accountHash, endpoint, capability, pricePerTask: String(price) };
}

interface ParsedReputationUpdated {
  agent: string;
  score: number;
}

/**
 * Parse ReputationUpdated event CL values.
 * Layout: [Key agent] [U32 score]
 */
function parseReputationUpdated(hex: string): ParsedReputationUpdated | null {
  const clean = hex.replace(/^0x/i, "");
  let offset = 0;
  const readByte = () => {
    const byte = parseInt(clean.slice(offset, offset + 2), 16);
    offset += 2;
    return byte;
  };
  const readBytes = (n: number) => {
    const bytes = clean.slice(offset, offset + n * 2);
    offset += n * 2;
    return bytes;
  };

  const addrTag = readByte();
  if (addrTag !== 0x01) return null;
  const agentHex = readBytes(32);
  const agent = "00" + agentHex;

  const scoreTag = readByte();
  if (scoreTag !== 0x04) return null;
  const scoreHex = readBytes(4);
  const score = parseInt(scoreHex.split("").reverse().join(""), 16);

  return { agent, score };
}

interface ParsedAgentDeactivated {
  agent: string;
}

/**
 * Parse AgentDeactivated event CL values.
 * Layout: [Key agent]
 */
function parseAgentDeactivated(hex: string): ParsedAgentDeactivated | null {
  const clean = hex.replace(/^0x/i, "");
  let offset = 0;
  const readByte = () => {
    const byte = parseInt(clean.slice(offset, offset + 2), 16);
    offset += 2;
    return byte;
  };
  const readBytes = (n: number) => {
    const bytes = clean.slice(offset, offset + n * 2);
    offset += n * 2;
    return bytes;
  };

  const addrTag = readByte();
  if (addrTag !== 0x01) return null;
  const agentHex = readBytes(32);
  const agent = "00" + agentHex;

  return { agent };
}
