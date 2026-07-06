"use client";

import { useState, useCallback } from "react";
import { BACKEND_URL } from "@/lib/constants";

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

export function useTasks() {
  const [tasks, setTasks]     = useState<TaskRecord[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError]     = useState("");

  const submitTask = useCallback(async (
    description: string,
    capabilities: string[],
    onStep: (step: string) => void
  ): Promise<TaskRecord | null> => {
    setRunning(true);
    setError("");
    const steps = ["creating","research","risk","coding","design","audit","report"];
    let si = 0;
    onStep(steps[0]);
    const ticker = setInterval(() => {
      si = Math.min(si + 1, steps.length - 1);
      onStep(steps[si]);
    }, 14_000);

    try {
      const res = await fetch(`${BACKEND_URL}/task`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description, budgetEth: "0.008", capabilities }),
      });
      clearInterval(ticker);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error ?? res.statusText);
      }
      const data = await res.json();
      const record: TaskRecord = { ...data, description, status: "completed", createdAt: Date.now() };
      setTasks(prev => [record, ...prev]);
      return record;
    } catch (e: unknown) {
      clearInterval(ticker);
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      return null;
    } finally {
      setRunning(false);
    }
  }, []);

  return { tasks, running, error, submitTask };
}
