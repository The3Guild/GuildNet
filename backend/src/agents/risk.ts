import { veniceChat } from "./venice.js";

const SYSTEM = `You are a risk analysis specialist. Identify key risks: regulatory, competitive, financial, and operational. Rate each High/Medium/Low and suggest mitigations. Be concise.`;

export async function runRiskAnalysis(taskDescription: string, research: string): Promise<string> {
  // Truncate research to avoid token overflows
  const ctx = research.slice(0, 1500);
  return veniceChat(
    SYSTEM,
    `Task: ${taskDescription}\n\nContext:\n${ctx}\n\nProvide a concise risk analysis.`,
    "mistral-small-3-2-24b-instruct"
  );
}
