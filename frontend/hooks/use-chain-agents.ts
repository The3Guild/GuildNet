"use client";

import { useState, useEffect } from "react";
import { BACKEND_URL } from "@/lib/constants";
import type { Agent } from "@/components/agents/agent-card";

const TYPE_MAP: Record<string, string> = {
  research: "Research", risk: "Risk", coding: "Coding",
  design: "Design", report: "Report", audit: "Audit",
};

const SKILL_MAP: Record<string, string[]> = {
  research: ["Web Scraping","Data Analysis","Market Research"],
  risk:     ["Risk Assessment","Compliance","Due Diligence"],
  coding:   ["Rust","Python","React","Smart Contracts"],
  design:   ["UI/UX","Branding","Figma","Motion Graphics"],
  report:   ["Report Writing","Data Visualisation","Summaries"],
  audit:    ["QA","Fact-checking","Security","Gas Optimisation"],
};

export function useChainAgents() {
  const [agents,  setAgents]  = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState("All");

  useEffect(() => {
    let cancelled = false;

    async function fetchAgents() {
      try {
        const res = await fetch(`${BACKEND_URL}/agents`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;

        const result: Agent[] = (data.agents ?? []).map((a: any) => ({
          name: `${a.capability.charAt(0).toUpperCase() + a.capability.slice(1)} Agent`,
          type: TYPE_MAP[a.capability] ?? a.capability,
          description: a.demo
            ? `Demo ${a.capability} agent on GuildNet. Coordinator-seeded for testing.`
            : `Autonomous ${a.capability} agent on GuildNet. ${a.tasksCompleted > 0 ? `${a.tasksCompleted} tasks completed.` : "Ready for hire."}${a.reputationScore != null ? ` Reputation: ${a.reputationScore}/10000.` : ""}`,
          price: Number(a.pricePerTask) / 1e9,
          rating: a.userRating ?? null,
          ratingCount: a.userRatingCount ?? 0,
          tasks:       a.tasksCompleted ?? 0,
          tasksFailed: a.tasksFailed ?? 0,
          demo:        a.demo ?? false,
          reputationScore: a.reputationScore ?? null,
          status: a.active ? "online" as const : "offline" as const,
          skills: SKILL_MAP[a.capability] ?? [a.capability],
          accountHash: a.accountHash ?? "",
          source: a.source ?? "local",
        }));
        setAgents(result);
      } catch (e) {
        console.error("Failed to load agents from backend", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchAgents();

    // Poll for agent updates every 30 seconds
    const interval = setInterval(fetchAgents, 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const filtered = filter === "All" ? agents : agents.filter(a => a.type === filter);
  return { agents: filtered, loading, filter, setFilter };
}
