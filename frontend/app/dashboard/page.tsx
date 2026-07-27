"use client";

import { useEffect, useState } from "react";
import { AgentCard } from "@/components/agents/agent-card";
import { TaskCreator } from "@/components/tasks/task-creator";
import { Activity, TrendingUp, Users, Zap, ArrowRight, Shield, Award } from "lucide-react";
import { useTaskHistory } from "@/hooks/use-task-history";
import { useChainAgents } from "@/hooks/use-chain-agents";
import { BACKEND_URL } from "@/lib/constants";
import type { TaskRecord } from "@/hooks/use-tasks";
import Link from "next/link";

interface Settlement {
  hash:       string;
  from:       string;
  to:         string;
  amount:     string;
  capability: string;
  taskId:     string;
  timestamp:  string;
}

export default function DashboardPage() {
  const { history, addTask } = useTaskHistory();
  const { agents, loading: agentsLoading } = useChainAgents();
  const [taskCount, setTaskCount] = useState("—");
  const [agentCount, setAgentCount] = useState("—");
  const [totalSpentCSPR, setTotalSpentCSPR] = useState(0);
  const [settlementCount, setSettlementCount] = useState(0);
  const [chainReadOk, setChainReadOk] = useState(true);

  useEffect(() => {
    fetch(`${BACKEND_URL}/stats`)
      .then(r => r.json().catch(() => ({})))
      .then(data => {
        if (data.taskCount !== undefined) setTaskCount(String(data.taskCount));
        if (data.agentCount !== undefined) setAgentCount(String(data.agentCount));
        if (data.chainReadOk === false) setChainReadOk(false);
      })
      .catch(() => setChainReadOk(false));
  }, []);

  useEffect(() => {
    fetch(`${BACKEND_URL}/x402/history`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((data: { settlements?: Settlement[] }) => {
        const settlements = data.settlements ?? [];
        const total = settlements.reduce((s, x) => s + (parseFloat(x.amount || "0") / 1e9), 0);
        setTotalSpentCSPR(total);
        setSettlementCount(settlements.length);
      })
      .catch(() => {});
  }, []);

  const avgRep = agents.length > 0
    ? Math.round(agents.reduce((s, a) => s + (a.reputationScore ?? 5000), 0) / agents.length)
    : 5000;
  const eliteCount = agents.filter(a => (a.reputationScore ?? 5000) >= 8000).length;

  const STATS = [
    { label: "Agents",      value: agentCount, sub: chainReadOk ? "registered" : "est. local", icon: Users,    color: "text-cyan-400",   bg: "from-cyan-500/15 to-cyan-500/5"    },
    { label: "Tasks",       value: taskCount,  sub: chainReadOk ? "on-chain" : "est. local",   icon: Zap,      color: "text-violet-400", bg: "from-violet-500/15 to-violet-500/5" },
    { label: "Avg. Rep.",   value: String(avgRep), sub: "score / 10000", icon: Shield, color: "text-amber-400",  bg: "from-amber-500/15 to-amber-500/5"   },
    { label: "Sessions",    value: String(history.length), sub: "local", icon: Activity, color: "text-emerald-400", bg: "from-emerald-500/15 to-emerald-500/5" },
  ];

  return (
    <div className="space-y-6 max-w-6xl mx-auto w-full">
      <div className="page-header flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1>Welcome to <span className="gradient-text">GuildNet</span></h1>
          <p>Autonomous AI agents that hire and pay each other on-chain.</p>
        </div>
        <Link href="/register" className="btn-ghost flex items-center gap-2 px-4 py-2 text-xs self-start sm:self-auto flex-shrink-0">
          Register Agent <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 stagger">
        {STATS.map(({ label, value, sub, icon: Icon, color, bg }) => (
          <div key={label} className="glass-card stat-card p-4 glow-hover">
            <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${bg} flex items-center justify-center mb-3`}>
              <Icon className={`w-4 h-4 ${color}`} />
            </div>
            <p className="text-xl font-bold text-white tabular-nums">{value}</p>
            <p className="text-xs text-slate-500 mt-0.5 font-medium">{label}</p>
            <p className="text-[10px] text-slate-600 mt-0.5 uppercase tracking-wide">{sub}</p>
          </div>
        ))}
      </div>

      {/* Reputation overview */}
      {agents.length > 0 && (
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Award className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-semibold text-white">Network Reputation</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-slate-500 mb-1">Average Score</p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold text-white tabular-nums">{avgRep}</span>
                <span className="text-[11px] text-slate-600">/10000</span>
              </div>
              <div className="rep-bar-track mt-2">
                <div className={`rep-bar-fill ${avgRep >= 6000 ? "rep-excellent" : avgRep >= 5000 ? "rep-good" : "rep-neutral"}`}
                  style={{ width: `${Math.round((avgRep / 10000) * 100)}%` }} />
              </div>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Elite Agents</p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold text-white tabular-nums">{eliteCount}</span>
                <span className="text-[11px] text-slate-600">/ {agents.length}</span>
              </div>
              <p className="text-[10px] text-emerald-400 mt-1 font-medium">Score &ge; 8000</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Total Earned</p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold text-white tabular-nums">{totalSpentCSPR.toFixed(1)}</span>
                <span className="text-[11px] text-slate-600">CSPR</span>
              </div>
              <p className="text-[10px] text-slate-600 mt-1">From {settlementCount} settlements</p>
            </div>
          </div>
        </div>
      )}

      {/* Task creator */}
      <TaskCreator onTaskComplete={(t: TaskRecord) => addTask(t)} />

      {/* Live agents */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-white">Live Agents</h2>
          <Link href="/agents" className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors flex items-center gap-1">
            View all <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        {agentsLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-48 rounded-xl" />)}
          </div>
        ) : agents.length === 0 ? (
          <div className="glass-card p-8 text-center">
            <p className="text-slate-500 text-sm mb-3">No agents registered yet</p>
            <Link href="/register" className="text-xs text-cyan-400 hover:underline">Register the first agent →</Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 stagger">
            {agents.slice(0, 4).map(a => <AgentCard key={a.name + a.price} {...a} />)}
          </div>
        )}
      </div>
    </div>
  );
}
