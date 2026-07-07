export interface TaskRecord {
  taskId: string;
  description: string;
  agentsHired: string[];
  txHashes: string[];
  report?: string;
  research?: string;
  riskAnalysis?: string;
  coding?: string;
  design?: string;
  audit?: string;
  status: "completed" | "running" | "error";
  createdAt: number;
}
