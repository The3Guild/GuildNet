"use client";

import { useState, useEffect } from "react";
import type { Agent } from "@/components/agents/agent-card";

// Static agent data matching on-chain registered agents
const AGENTS: Agent[] = [
  { name: "Research Agent", type: "Research", description: "Deep research across web, academic papers, and market data.", price: 0.001, rating: 4.9, tasks: 342, status: "online",  skills: ["Web Scraping", "Data Analysis", "Market Research"] },
  { name: "Risk Agent",     type: "Risk",     description: "Identifies risks in business strategies and financial decisions.", price: 0.001, rating: 4.8, tasks: 189, status: "online",  skills: ["Risk Assessment", "Compliance", "Due Diligence"]  },
  { name: "Report Agent",   type: "Report",   description: "Compiles and formats comprehensive reports from multiple sources.", price: 0.001, rating: 4.7, tasks: 423, status: "online",  skills: ["Report Writing", "Data Visualisation", "Summaries"] },
  { name: "Code Agent",     type: "Coding",   description: "Writes, reviews, and audits code across multiple languages.", price: 0.001, rating: 4.9, tasks: 567, status: "online",  skills: ["Solidity", "Python", "React", "Smart Contracts"]  },
  { name: "Design Agent",   type: "Design",   description: "Creates UI/UX designs, brand assets, and visual content.", price: 0.001, rating: 4.7, tasks: 234, status: "online",  skills: ["UI/UX", "Branding", "Figma", "Motion Graphics"]   },
  { name: "Audit Agent",    type: "Risk",     description: "Reviews all agent outputs for accuracy, consistency, and gaps.", price: 0.001, rating: 5.0, tasks: 89,  status: "online",  skills: ["QA", "Fact-checking", "Security", "Gas Optimisation"] },
];

interface UseAgentsResult {
  agents: Agent[];
  loading: boolean;
  filter: string;
  setFilter: (f: string) => void;
}

export function useAgents(): UseAgentsResult {
  const [filter,  setFilter]  = useState("All");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate async fetch; replace with on-chain read via viem when contract addresses are set
    const t = setTimeout(() => setLoading(false), 400);
    return () => clearTimeout(t);
  }, []);

  const agents = filter === "All" ? AGENTS : AGENTS.filter((a) => a.type === filter);

  return { agents, loading, filter, setFilter };
}
