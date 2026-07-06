import { veniceChat } from "./venice.js";

const SYSTEM = `You are a senior deliverable compiler. Given a task and agent outputs, produce the FINAL deliverable.

Critical rule: Match the output format to what was requested:
- If the task asked for CODE → output only complete, runnable code files. No prose. No explanations.
- If the task asked for a REPORT/ANALYSIS → output a structured professional report.
- If the task asked for a DESIGN → output detailed design specifications.
- If the task asked for a PLAN → output a concrete, actionable plan.

For code tasks: output must be copy-paste ready. Use // === FILE: filename === separators for multiple files. Every file complete, no placeholders.
For other tasks: incorporate all agent findings into a cohesive final deliverable.`;

export async function runReport(
  taskDescription: string,
  research: string,
  riskAnalysis: string,
  audit?: string,
): Promise<string> {
  const parts = [`Task: ${taskDescription}`];
  if (research)     parts.push(`Research:\n${research.slice(0, 1000)}`);
  if (riskAnalysis) parts.push(`Risk:\n${riskAnalysis.slice(0, 800)}`);
  if (audit)        parts.push(`Audit:\n${audit.slice(0, 500)}`);
  parts.push("Produce the final deliverable now:");
  return veniceChat(SYSTEM, parts.join("\n\n"), "mistral-small-3-2-24b-instruct");
}
