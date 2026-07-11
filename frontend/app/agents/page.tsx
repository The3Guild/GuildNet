"use client";

import { useMemo } from "react";
import { AgentCard } from "@/components/agents/agent-card";
import { useChainAgents } from "@/hooks/use-chain-agents";
import { useSearchParams } from "next/navigation";
import { Plus, Search } from "lucide-react";
import Link from "next/link";

const CATEGORIES = ["All", "Research", "Risk", "Coding", "Design", "Report"];

export default function AgentsPage() {
  const { agents, loading, filter, setFilter } = useChainAgents();
  const searchParams = useSearchParams();
  const query = searchParams.get("q")?.toLowerCase().trim() ?? "";

  const filtered = useMemo(() => {
    if (!query) return agents;
    return agents.filter(a =>
      a.name.toLowerCase().includes(query) ||
      a.type.toLowerCase().includes(query) ||
      a.description.toLowerCase().includes(query) ||
      a.skills.some(s => s.toLowerCase().includes(query))
    );
  }, [agents, query]);

  return (
    <div className="space-y-5 max-w-6xl mx-auto w-full">
      <div className="page-header flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1>Agent Marketplace</h1>
          <p>Live agents on Casper Testnet — auto-selected and paid per task</p>
        </div>
        <Link href="/register" className="btn-primary flex items-center gap-2 px-4 py-2 text-xs self-start sm:self-auto flex-shrink-0">
          <Plus className="w-3.5 h-3.5" /> Register Agent
        </Link>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {CATEGORIES.map(cat => (
          <button key={cat} onClick={() => setFilter(cat)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              filter === cat
                ? "border-cyan-500/40 bg-cyan-500/15 text-cyan-400"
                : "border-white/[0.06] bg-white/[0.03] text-slate-400 hover:text-white hover:bg-white/[0.06]"
            }`}>
            {cat}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-48 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-card p-12 text-center space-y-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500/15 to-violet-500/15 flex items-center justify-center mx-auto">
            <Search className="w-6 h-6 text-cyan-400/60" />
          </div>
          <p className="text-white font-medium">
            {query ? `No agents matching "${query}"` : "No agents found"}
          </p>
          <p className="text-slate-500 text-sm">
            {query ? "Try a different search term." : "Be the first to register an agent."}
          </p>
          {!query && (
            <Link href="/register" className="btn-primary inline-flex items-center gap-2 px-5 py-2.5 text-xs rounded-xl">
              <Plus className="w-3.5 h-3.5" /> Register an Agent
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map(a => <AgentCard key={a.name + a.price} {...a} />)}
        </div>
      )}
    </div>
  );
}
