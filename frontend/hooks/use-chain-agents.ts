"use client";

import { useState, useEffect } from "react";
import { BACKEND_URL } from "@/lib/constants";
import type { Agent } from "@/components/agents/agent-card";

const TYPE_MAP: Record<string, string> = {
  research: "Research", risk: "Risk", coding: "Coding",
  design: "Design", report: "Report", audit: "Risk",
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
    (async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/agents`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const result: Agent[] = (data.agents ?? []).map((a: any) => ({
          name: `${a.capability.charAt(0).toUpperCase() + a.capability.slice(1)} Agent`,
          type: TYPE_MAP[a.capability] ?? "Research",
          description: `Autonomous ${a.capability} agent on GuildNet. ${(a.tasks ?? 0) > 0 ? `${a.tasks} tasks completed.` : "Ready for hire."}`,
          price: Number(a.pricePerTask) / 1e9,
          rating: Math.min(5.0, 4.5 + (a.tasks ?? 0) * 0.01),
          tasks: a.tasks ?? 0,
          status: a.active ? "online" as const : "offline" as const,
          skills: SKILL_MAP[a.capability] ?? [],
        }));
        setAgents(result);
      } catch (e) {
        console.error("Failed to load agents from backend", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = filter === "All" ? agents : agents.filter(a => a.type === filter);
  return { agents: filtered, loading, filter, setFilter };
}
