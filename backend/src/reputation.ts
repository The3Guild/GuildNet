/**
 * reputation.ts — Trust Ledger
 *
 * Reads reputation data from the local agentStore (which mirrors on-chain
 * state). Also supports fetching ReputationRecorded events from CSPR.cloud
 * for audit trail / enrichment.
 *
 * Odra Mapping storage is NOT readable via named keys — individual mapping
 * entries can only be accessed via dictionary reads or view entry points.
 * Since the backend is the one calling record_completion / record_failure,
 * the local store is the authoritative source for real-time reputation.
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
  completed:   boolean;
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
            completed: parsed.completed,
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
  completed: boolean;
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
  if (clean.length < 66) return null; // minimum: 1 tag + 32 addr + 1 tag + 8 task_id

  let offset = 0;
  const readByte = () => parseInt(clean.slice(offset, offset + 2), 16);
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
    completed: tasksCompleted > 0 && tasksFailed === 0,
  };
}
