/**
 * agentRunner.ts — Agent-to-Agent runner (Casper)
 *
 * NOTE: The primary A2A orchestration loop now lives in coordinator.ts.
 * This file provides the /agent/:capability/run HTTP route handler used
 * by server.ts for direct single-agent invocations.
 *
 * Each capability runs Venice AI inference. On-chain hiring for standalone
 * A2A runs is handled via the coordinator's callContractEntry helper,
 * which this module re-exports for server.ts compatibility.
 */

import { veniceChat } from "./agents/venice";

export type Capability = "research" | "risk" | "report" | "coding" | "design" | "audit";

export interface AgentRunResult {
  capability:     Capability;
  agentAddress:   string;
  output:         string;
  subAgentsHired: string[];
  txHashes:       string[];
}

const SYSTEM_PROMPTS: Record<Capability, string> = {
  research: "You are a market research specialist. Produce concise, factual research: key players, market size, growth trends, and data points.",
  risk:     "You are a risk analysis specialist. Identify key risks (regulatory, competitive, financial, operational). Rate each High/Medium/Low and suggest mitigations.",
  report:   "You are an expert report writer. Compile a professional report with executive summary, key findings, risk overview, and recommendations.",
  coding:   "You are an expert software engineer. Write clean, well-commented, production-ready code. Include error handling, security considerations, and usage examples.",
  design:   "You are a UI/UX design specialist. Produce detailed design specifications, component breakdowns, user flow descriptions, and accessibility considerations.",
  audit:    "You are a critical quality auditor. Review AI-generated outputs for accuracy, consistency, and completeness. Flag hallucinations, contradictions, and gaps. Return verdict (PASS/FAIL/NEEDS_REVISION) with specific findings.",
};

/**
 * Run a single agent capability via Venice AI.
 * Does not perform on-chain operations — use coordinator.ts for full
 * create_task → hire_agent → x402 → complete_task loops.
 */
export async function runAgent(
  capability: Capability,
  _taskId: bigint,
  taskDescription: string,
  context = ""
): Promise<AgentRunResult> {
  const prompt = context
    ? `Task: ${taskDescription}\n\nContext:\n${context}`
    : taskDescription;

  const output = await veniceChat(SYSTEM_PROMPTS[capability], prompt, "llama-3.3-70b");

  return {
    capability,
    agentAddress:   "",   // not applicable for standalone Venice-only runs
    output,
    subAgentsHired: [],
    txHashes:       [],
  };
}
