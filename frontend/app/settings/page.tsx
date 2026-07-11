"use client";

import { ExternalLink, Globe, Code2, Bot, Plus, CheckCircle } from "lucide-react";
import { CONTRACTS, CASPER_EXPLORER } from "@/lib/constants";
import { useChainAgents } from "@/hooks/use-chain-agents";
import Link from "next/link";

const CONTRACTS_LIST = [
  { label: "AgentRegistry",    desc: "Agent discovery & registration", addr: CONTRACTS.AGENT_REGISTRY,    color: "from-cyan-500/15 to-cyan-500/5",    icon: "🔍" },
  { label: "AgentReputation",  desc: "Reputation scoring",              addr: CONTRACTS.AGENT_REPUTATION,  color: "from-violet-500/15 to-violet-500/5", icon: "⭐" },
  { label: "TaskCoordinator",  desc: "Hires agents & routes payments", addr: CONTRACTS.TASK_COORDINATOR,  color: "from-amber-500/15 to-amber-500/5",   icon: "⚡" },
];

export default function SettingsPage() {
  const { agents, loading } = useChainAgents();

  return (
    <div className="space-y-5 max-w-5xl mx-auto w-full">
      <div className="page-header">
        <h1>Settings</h1>
        <p>Network info, contracts, and active agents</p>
      </div>

      <div className="glass-card p-4 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-green-500/15 to-emerald-500/10 border border-green-500/15 flex items-center justify-center flex-shrink-0">
            <Globe className="w-4 h-4 text-green-400" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              <p className="text-sm font-semibold text-white">Casper Testnet</p>
              <span className="tag tag-green text-[10px]">casper-test</span>
            </div>
            <a href={CASPER_EXPLORER} target="_blank" rel="noreferrer"
              className="text-xs text-slate-500 hover:text-cyan-400 transition-colors flex items-center gap-1 mt-0.5">
              {CASPER_EXPLORER} <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <CheckCircle className="w-3.5 h-3.5 text-green-400" />
          <span className="text-xs text-green-400 font-medium">Connected</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Code2 className="w-3.5 h-3.5 text-violet-400" />
            <h2 className="text-sm font-semibold text-white">Smart Contracts</h2>
          </div>
          <div className="space-y-2">
            {CONTRACTS_LIST.map(({ label, desc, addr, color, icon }) => (
              <div key={label} className="glass-card p-3.5 flex items-center gap-3 glow-hover">
                <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center text-base flex-shrink-0`}>
                  {icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white">{label}</p>
                  <p className="text-xs text-slate-500">{desc}</p>
                  <code className="text-[10px] text-slate-600 mt-0.5 block truncate">{addr}</code>
                </div>
                <a href={`${CASPER_EXPLORER}/deploy/${addr}`} target="_blank" rel="noreferrer"
                  className="text-slate-500 hover:text-cyan-400 transition-colors flex-shrink-0 p-1.5 rounded-lg hover:bg-white/5">
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="w-3.5 h-3.5 text-cyan-400" />
              <h2 className="text-sm font-semibold text-white">
                Active Agents
                {!loading && <span className="ml-2 text-xs text-slate-500 font-normal">{agents.length}</span>}
              </h2>
            </div>
            <Link href="/agents" className="text-xs text-cyan-400 hover:underline">View all</Link>
          </div>

          <div className="space-y-2">
            {loading
              ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-12 rounded-xl" />)
              : agents.map(a => (
                  <div key={a.name} className="glass-card px-3.5 py-2.5 flex items-center gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white">{a.name}</p>
                      <p className="text-[11px] text-slate-500">{a.type} · {a.tasks} tasks</p>
                    </div>
                    <span className="text-xs font-medium text-slate-400 flex-shrink-0">{a.price} CSPR</span>
                  </div>
                ))
            }
          </div>

          <Link href="/register"
            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border border-dashed border-white/[0.1] text-xs text-slate-500 hover:text-white hover:border-cyan-500/25 hover:bg-cyan-500/5 transition-all">
            <Plus className="w-3.5 h-3.5" /> Register your own agent
          </Link>
        </div>
      </div>
    </div>
  );
}
