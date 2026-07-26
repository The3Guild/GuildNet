/**
 * reputation.ts — Live Trust Ledger
 *
 * Reads reputation data from the AgentReputation contract via two-tier fallback:
 *   1. Direct Casper RPC query_global_state
 *   2. CSPR.cloud named-keys API fallback
 *
 * Also exports getReputationEvents() to fetch ReputationRecorded events
 * from the CSPR.cloud events API.
 */

import { config } from "./config";
import { csproCloudGet } from "./chain";

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

// ── Two-tier fallback query ──────────────────────────────────────────────────

let _sdk: any = null;

async function getSdk() {
  if (!_sdk) {
    const casperSdk = await import("casper-js-sdk");
    _sdk = casperSdk.default ?? casperSdk;
  }
  return _sdk;
}

/**
 * Query a named key from the AgentReputation contract.
 * Two-tier fallback: direct CSPRPC → CSPR.cloud named-keys API.
 */
async function queryReputationVar(varName: string): Promise<string | undefined> {
  const contractHash = config.contracts.agentReputation.replace("hash-", "");

  // Attempt 1 — direct Casper RPC via queryLatestGlobalState
  try {
    const sdk = await getSdk();
    const { RpcClient } = sdk;
    const { AxiosHandler } = await import("./casperHandler");
    const rpc = new RpcClient(new AxiosHandler(config.casperNodeRpc));
    const result = await rpc.queryLatestGlobalState(
      `hash-${contractHash}`,
      [varName],
    );
    const clv = result.storedValue?.clValue;
    if (clv?.toString) {
      return clv.toString();
    }
  } catch (err) {
    console.warn(`[Reputation] RPC queryReputationVar(${varName}) failed: ${err}`);
  }

  // Attempt 2 — CSPR.cloud named-keys API (reliable fallback)
  try {
    const data = await csproCloudGet(
      `/contracts/${contractHash}/named-keys`
    ) as { data?: Array<{ name: string; value: string }> };
    for (const entry of (data.data ?? [])) {
      if (entry.name === varName) {
        return entry.value;
      }
    }
  } catch (err) {
    console.warn(`[Reputation] CSPR.cloud queryReputationVar(${varName}) failed: ${err}`);
  }

  return undefined;
}

/**
 * Get reputation data for an agent from the AgentReputation contract.
 * Returns tasksCompleted, tasksFailed, score, and lastUpdated.
 * Returns null if no on-chain reputation data exists for this agent.
 */
export async function getReputation(agentHash: string): Promise<ReputationData | null> {
  try {
    const [completedStr, failedStr, scoreStr] = await Promise.all([
      queryReputationVar(`reputation_completed_${agentHash}`),
      queryReputationVar(`reputation_failed_${agentHash}`),
      queryReputationVar(`reputation_score_${agentHash}`),
    ]);

    // If none of the three queries returned data, this agent has no on-chain reputation
    const hasAnyData = completedStr !== undefined || failedStr !== undefined || scoreStr !== undefined;
    if (!hasAnyData) {
      return null;
    }

    const data: ReputationData = {
      tasksCompleted: completedStr !== undefined ? Number(BigInt(completedStr)) : 0,
      tasksFailed:    failedStr !== undefined    ? Number(BigInt(failedStr))    : 0,
      score:          scoreStr !== undefined      ? Number(BigInt(scoreStr))      : 0,
      lastUpdated:    new Date(0).toISOString(),
    };

    // Try to get last event timestamp from CSPR.cloud events
    try {
      const events = await getReputationEvents(agentHash);
      if (events.length > 0) {
        data.lastUpdated = events[events.length - 1].timestamp;
      }
    } catch {
      // Non-critical — use epoch default
    }

    return data;
  } catch (err) {
    console.warn(`[Reputation] Failed to fetch reputation for ${agentHash.slice(0, 14)}…: ${err}`);
    return null;
  }
}

/**
 * Fetch ReputationRecorded events from CSPR.cloud for a given agent.
 * These are emitted by the AgentReputation contract on each task completion.
 */
export async function getReputationEvents(agentHash: string): Promise<ReputationEvent[]> {
  try {
    const data = await csproCloudGet(
      `/contracts/${config.contracts.agentReputation.replace("hash-", "")}/events?limit=50`
    ) as { data?: Array<{ event_name: string; cl_value: string; timestamp: string }> };

    const events: ReputationEvent[] = [];
    for (const evt of (data.data ?? [])) {
      if (evt.event_name === "ReputationRecorded") {
        // Parse the CL value — format: (account_hash, task_id, score, completed)
        const match = evt.cl_value?.match(/"([^"]+)".*"([^"]+)".*(\d+).*\((true|false)\)/);
        if (match && match[1] === agentHash) {
          events.push({
            agent:     match[1],
            taskId:    match[2],
            score:     Number(match[3]),
            completed: match[4] === "true",
            timestamp: evt.timestamp,
          });
        }
      }
    }
    return events;
  } catch (err) {
    console.warn(`[Reputation] Failed to fetch events for ${agentHash.slice(0, 14)}…: ${err}`);
    return [];
  }
}
