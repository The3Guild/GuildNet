/**
 * reputation.ts — Trust Ledger
 *
 * All reputation data lives in the local agentStore (mirrors on-chain state).
 * CSPR.cloud events API does not work for Casper 2.0 contracts, so there is
 * no remote discovery. The local store is the source of truth.
 *
 * Reputation is written locally after every on-chain complete_task /
 * flag_agent_failure via recordAgentCompletion() / recordAgentFailure().
 */

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
 * Get reputation events for an agent from the local agentStore.
 * Returns a synthetic event summarising the agent's task history.
 * When real on-chain events are available in the future, this can be
 * backed by event indexing.
 */
export async function getReputationEvents(agentHash: string): Promise<ReputationEvent[]> {
  // Local store doesn't track per-task event history yet.
  // Return empty until we add event persistence.
  void agentHash;
  return [];
}
