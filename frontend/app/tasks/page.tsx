"use client";

import { useState, useEffect } from "react";
import { TaskCreator } from "@/components/tasks/task-creator";
import { CheckCircle, ExternalLink, Trash2, ClipboardList, Bot, Zap } from "lucide-react";
import { useTaskHistory } from "@/hooks/use-task-history";
import { BACKEND_URL, CASPER_EXPLORER } from "@/lib/constants";
import type { TaskRecord } from "@/hooks/use-tasks";

const EXAMPLES = [
  { icon: "🔍", text: "Market research on AI agent infrastructure in 2024" },
  { icon: "💻", text: "Build a Web3 NFT marketplace with mint button and dark theme" },
  { icon: "🎨", text: "Design a mobile banking app UI with onboarding screens" },
  { icon: "📊", text: "Risk analysis for a DeFi protocol launch on Casper" },
];

export default function TasksPage() {
  const { history, addTask, clearHistory } = useTaskHistory();
  const [agentCount, setAgentCount] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/agents`);
        if (res.ok) {
          const data = await res.json();
          setAgentCount(data.agents?.length ?? null);
        }
      } catch {}
    })();
  }, []);

  return (
    <div className="space-y-6 max-w-5xl mx-auto w-full">
      <div className="page-header flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1>Tasks</h1>
          <p>Describe anything. AI agents self-select, execute, and settle payments on-chain.</p>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <Bot className="w-3.5 h-3.5 text-cyan-400" /> {agentCount ?? "—"} agents
          </div>
          <div className="flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-green-400" /> 0.5 CSPR/agent
          </div>
        </div>
      </div>

      {history.length === 0 && (
        <div>
          <p className="text-[11px] text-slate-600 uppercase tracking-widest mb-3">Example tasks</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {EXAMPLES.map(e => (
              <div key={e.text} className="glass-card px-4 py-3 flex items-start gap-3">
                <span className="text-base flex-shrink-0">{e.icon}</span>
                <p className="text-xs text-slate-400 leading-relaxed">{e.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <TaskCreator onTaskComplete={(t: TaskRecord) => addTask(t)} />

      {history.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-slate-400" />
              <h2 className="text-sm font-semibold text-white">
                History
                <span className="ml-2 text-xs text-slate-500 font-normal">{history.length}</span>
              </h2>
            </div>
            <button onClick={clearHistory}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-red-400 transition-colors px-2 py-1 rounded-lg hover:bg-red-500/5">
              <Trash2 className="w-3 h-3" /> Clear
            </button>
          </div>

          <div className="space-y-2">
            {history.map(task => (
              <div key={task.taskId + task.createdAt}
                className="glass-card px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3 hover:border-white/[0.1] transition-colors">

                <div className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0 hidden sm:block" />

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white leading-snug line-clamp-1">{task.description}</p>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
                    <span className="text-[11px] text-slate-500">#{task.taskId}</span>
                    <span className="text-[11px] text-slate-600">·</span>
                    <span className="text-[11px] text-slate-500">{task.agentsHired.length} agents</span>
                    <span className="text-[11px] text-slate-600">·</span>
                    <span className="text-[11px] text-slate-500">{new Date(task.createdAt).toLocaleDateString(undefined, { month:"short", day:"numeric", hour:"2-digit", minute:"2-digit" })}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {task.txHashes?.[0] && (
                    <a href={`${CASPER_EXPLORER}/deploy/${task.txHashes[0]}`}
                      target="_blank" rel="noreferrer"
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] text-slate-400 hover:text-cyan-400 hover:bg-white/5 transition-all">
                      <ExternalLink className="w-3 h-3" /> Explorer
                    </a>
                  )}
                  <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-green-500/8 border border-green-500/15">
                    <CheckCircle className="w-3 h-3 text-green-400" />
                    <span className="text-[11px] font-medium text-green-400">Done</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {history.length === 0 && (
        <div className="glass-card p-8 text-center space-y-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/15 to-violet-500/10 flex items-center justify-center mx-auto">
            <ClipboardList className="w-5 h-5 text-cyan-400/60" />
          </div>
          <p className="text-white font-medium text-sm">Completed tasks appear here</p>
          <p className="text-slate-500 text-xs">Each task is executed by AI agents with on-chain payment history.</p>
        </div>
      )}
    </div>
  );
}
