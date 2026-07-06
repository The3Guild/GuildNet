import { veniceChat } from "./venice.js";

const SYSTEM = `You are a quality auditor. Review the provided outputs for accuracy and completeness. Give a verdict (PASS/FAIL/NEEDS_REVISION) and list key findings. Be concise.`;

export async function runAudit(taskDescription: string, outputs: Record<string, string>): Promise<string> {
  // Truncate each section to avoid token overflow
  const sections = Object.entries(outputs)
    .map(([k, v]) => `[${k.toUpperCase()}]\n${v.slice(0, 600)}`)
    .join("\n\n");
  return veniceChat(SYSTEM, `Task: ${taskDescription}\n\n${sections}`, "mistral-small-3-2-24b-instruct");
}
