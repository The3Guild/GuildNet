import { veniceChat } from "./venice.js";

const SYSTEM = `You are a market research specialist. Given a task description, 
produce concise, factual market research: key players, market size, growth trends, 
and relevant data points. Be precise and structured.`;

export async function runResearch(taskDescription: string): Promise<string> {
  return veniceChat(SYSTEM, `Research this topic thoroughly:\n\n${taskDescription}`);
}
