import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BACKEND_URL = process.env.GUILDNET_BACKEND_URL || "http://localhost:3000";

async function api(path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  return res.json();
}

const server = new McpServer({
  name: "guildnet",
  version: "0.1.0",
});

server.tool("list_agents", "List all registered AI agents on Casper Testnet", {}, async () => {
  const data = await api("/agents");
  const agents = (data.agents ?? []).map((a: any) =>
    `[${a.capability}] ${a.name} — rep:${a.reputationScore ?? "?"} $${a.priceCSPR ?? "?"}/task${a.demo ? " (demo)" : ""}`
  );
  return { content: [{ type: "text" as const, text: agents.join("\n") || "No agents registered." }] };
});

server.tool("suggest_agents", "Suggest which agents to use for a task", {
  taskDescription: z.string().describe("Plain-English description of the work"),
}, async ({ taskDescription }) => {
  const data = await api("/suggest-agents", {
    method: "POST",
    body: JSON.stringify({ taskDescription }),
  });
  const lines = (data.agents ?? []).map((a: any) => `• ${a.name} (${a.capability})`);
  return { content: [{ type: "text" as const, text: lines.join("\n") || data.error || "No suggestion." }] };
});

server.tool("dispatch_task", "Dispatch a task to the coordinator", {
  taskDescription: z.string().describe("Plain-English task description"),
}, async ({ taskDescription }) => {
  const data = await api("/task", {
    method: "POST",
    body: JSON.stringify({ taskDescription }),
  });
  if (data.error) return { content: [{ type: "text" as const, text: `Error: ${data.error}` }] };
  const taskId = data.taskId ?? "unknown";
  const agents = (data.agentsHired ?? []).map((a: any) => `  → ${a.name}`).join("\n");
  return { content: [{ type: "text" as const, text: `Task #${taskId} dispatched.\nAgents:\n${agents || "  (none)"}` }] };
});

server.tool("get_task_status", "Get status and results of a task", {
  taskId: z.union([z.string(), z.number()]).describe("Task ID"),
}, async ({ taskId }) => {
  const data = await api(`/task/${taskId}`);
  if (data.error) return { content: [{ type: "text" as const, text: `Error: ${data.error}` }] };
  const status = data.task?.status ?? "unknown";
  const results = (data.task?.results ?? []).map((r: any) => `  → ${r.agent}: ${r.output?.slice(0, 200) ?? "…"}`).join("\n");
  return { content: [{ type: "text" as const, text: `Task #${taskId}: ${status}\nResults:\n${results || "  (none yet)"}` }] };
});

server.tool("read_payment_history", "List x402 settlement records", {
  agent: z.string().optional().describe("Filter by agent account hash"),
  limit: z.number().optional().describe("Max records to return"),
}, async ({ agent, limit }) => {
  const data = await api("/x402/history");
  let settlements = data.settlements ?? [];
  if (agent) settlements = settlements.filter((s: any) => s.payee === agent || s.payer === agent);
  if (limit) settlements = settlements.slice(-limit);
  const rows = settlements.map((s: any) =>
    `${s.amountCSPR} CSPR  ${s.payer.slice(0, 12)}→${s.payee.slice(0, 12)}  ${s.transactionHash.slice(0, 16)}…  ${new Date(s.timestamp * 1000).toLocaleDateString()}`
  );
  return { content: [{ type: "text" as const, text: rows.join("\n") || "No settlements found." }] };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("GuildNet MCP server running on stdio");
}

main().catch(e => { console.error(e); process.exit(1); });
