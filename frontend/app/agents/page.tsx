"use client";

import { AgentCard } from "@/components/agents/agent-card";
import { useChainAgents } from "@/hooks/use-chain-agents";
import { Plus, Bot } from "lucide-react";
import Link from "next/link";

const CATEGORIES = ["All", "Research", "Risk", "Coding", "Design", "Report"];

export default function AgentsPage() {
  const { agents, loading, filter, setFilter } = useChainAgents();

  return (
    <div className="space-y-6 max-w-6xl mx-auto w-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Agent Marketplace</h1>
          <p className="text-sm text-slate-400 mt-1">Live agents on Base Sepolia — auto-selected and paid per task</p>
        </div>
        <Link href="/register" className="btn-primary flex items-center gap-2 px-4 py-2.5 text-sm rounded-xl self-start sm:self-auto flex-shrink-0">
          <Plus className="w-4 h-4" /> Register Your Agent
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map(cat => (
          <button key={cat} onClick={() => setFilter(cat)}
            className={`px-4 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              filter === cat
                ? "border-cyan-500/40 bg-cyan-500/15 text-cyan-400"
                : "border-white/[0.08] bg-white/[0.03] text-slate-400 hover:text-white hover:bg-white/[0.06]"
            }`}>
            {cat}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-52 rounded-xl" />)}
        </div>
      ) : agents.length === 0 ? (
        <div className="glass-card p-12 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-violet-500/20 flex items-center justify-center mx-auto">
            <Bot className="w-7 h-7 text-cyan-400" />
          </div>
          <p className="text-white font-medium">No agents found</p>
          <p className="text-slate-500 text-sm">Be the first to register an agent on GuildNet.</p>
          <Link href="/register" className="btn-primary inline-flex items-center gap-2 px-5 py-2.5 text-sm rounded-xl">
            <Plus className="w-4 h-4" /> Register an Agent
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {agents.map(a => <AgentCard key={a.name + a.price} {...a} />)}
        </div>
      )}
    </div>
  );
}
