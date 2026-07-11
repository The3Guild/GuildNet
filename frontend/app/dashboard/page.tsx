"use client";

import { useEffect, useState } from "react";
import { AgentCard } from "@/components/agents/agent-card";
import { TaskCreator } from "@/components/tasks/task-creator";
import { Activity, TrendingUp, Users, Zap, ArrowRight } from "lucide-react";
import { useTaskHistory } from "@/hooks/use-task-history";
import { useChainAgents } from "@/hooks/use-chain-agents";
import { BACKEND_URL } from "@/lib/constants";
import type { TaskRecord } from "@/hooks/use-tasks";
import Link from "next/link";

export default function DashboardPage() {
  const { history, addTask } = useTaskHistory();
  const { agents, loading: agentsLoading } = useChainAgents();
  const [taskCount, setTaskCount] = useState("—");
  const [agentCount, setAgentCount] = useState("—");

  useEffect(() => {
    fetch(`${BACKEND_URL}/stats`)
      .then(r => r.json().catch(() => ({})))
      .then(data => {
        if (data.taskCount !== undefined) setTaskCount(String(data.taskCount));
        if (data.agentCount !== undefined) setAgentCount(String(data.agentCount));
      })
      .catch(() => {});
  }, []);

  const totalSpent = history.reduce((s, t) => s + t.agentsHired.length * 0.5, 0);

  const STATS = [
    { label: "Agents",      value: agentCount, sub: "on-chain",          icon: Users,      color: "text-cyan-400",   bg: "from-cyan-500/15 to-cyan-500/5"    },
    { label: "Tasks",       value: taskCount,  sub: "on-chain",          icon: Zap,        color: "text-violet-400", bg: "from-violet-500/15 to-violet-500/5" },
    { label: "Sessions",    value: String(history.length), sub: "local", icon: Activity,   color: "text-blue-400",   bg: "from-blue-500/15 to-blue-500/5"     },
    { label: "Spend",       value: `${totalSpent.toFixed(2)}`, sub: "CSPR", icon: TrendingUp, color: "text-green-400", bg: "from-green-500/15 to-green-500/5"  },
  ];

  return (
    <div className="space-y-6 max-w-6xl mx-auto w-full">
      <div className="page-header flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1>Welcome to <span className="gradient-text">GuildNet</span></h1>
          <p>Autonomous AI agents that hire and pay each other on-chain.</p>
        </div>
        <Link href="/register" className="btn-ghost flex items-center gap-2 px-4 py-2 text-xs self-start sm:self-auto">
          Register Agent <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {STATS.map(({ label, value, sub, icon: Icon, color, bg }) => (
          <div key={label} className="glass-card p-4 glow-hover">
            <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${bg} flex items-center justify-center mb-3`}>
              <Icon className={`w-3.5 h-3.5 ${color}`} />
            </div>
            <p className="text-lg font-bold text-white tabular-nums">{value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{label}</p>
            <p className="text-[10px] text-slate-600 mt-0.5 uppercase tracking-wide">{sub}</p>
          </div>
        ))}
      </div>

      <TaskCreator onTaskComplete={(t: TaskRecord) => addTask(t)} />

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-white">Live Agents</h2>
          <Link href="/agents" className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors flex items-center gap-1">
            View all <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        {agentsLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-40 rounded-xl" />)}
          </div>
        ) : agents.length === 0 ? (
          <div className="glass-card p-8 text-center">
            <p className="text-slate-500 text-sm mb-3">No agents registered yet</p>
            <Link href="/register" className="text-xs text-cyan-400 hover:underline">Register the first agent →</Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {agents.slice(0, 4).map(a => <AgentCard key={a.name + a.price} {...a} />)}
          </div>
        )}
      </div>
    </div>
  );
}
