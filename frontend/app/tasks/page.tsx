"use client";

import { useState, useEffect } from "react";
import { TaskCreator } from "@/components/tasks/task-creator";
import { CheckCircle, ExternalLink, Trash2, ClipboardList, Sparkles, Bot, Zap } from "lucide-react";
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
    <div className="space-y-8 max-w-5xl mx-auto w-full">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Tasks</h1>
          <p className="text-sm text-slate-400 mt-1">
            Describe anything. AI agents self-select, execute, and settle payments on-chain.
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <Bot className="w-3.5 h-3.5 text-cyan-400" /> {agentCount ?? "—"} agents ready
          </div>
          <div className="flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-green-400" /> 0.5 CSPR per agent
          </div>
        </div>
      </div>

      {/* Example prompts — shown only if no history */}
      {history.length === 0 && (
        <div>
          <p className="text-xs text-slate-600 uppercase tracking-widest mb-3">Example tasks</p>
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

      {/* Task creator */}
      <TaskCreator onTaskComplete={(t: TaskRecord) => addTask(t)} />

      {/* History */}
      {history.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-slate-400" />
              <h2 className="text-sm font-semibold text-white">
                Task History
                <span className="ml-2 text-xs text-slate-500 font-normal">{history.length} completed</span>
              </h2>
            </div>
            <button onClick={clearHistory}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-red-400 transition-colors px-3 py-1.5 rounded-lg hover:bg-red-500/5">
              <Trash2 className="w-3.5 h-3.5" /> Clear all
            </button>
          </div>

          <div className="space-y-2">
            {history.map(task => (
              <div key={task.taskId + task.createdAt}
                className="glass-card px-4 py-4 flex flex-col sm:flex-row sm:items-center gap-3 hover:border-white/10 transition-colors">

                {/* Status dot */}
                <div className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0 hidden sm:block" />

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white leading-snug line-clamp-1">{task.description}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                    <span className="text-xs text-slate-500">Task #{task.taskId}</span>
                    <span className="text-xs text-slate-600">·</span>
                    <span className="text-xs text-slate-500">{task.agentsHired.length} agents hired</span>
                    <span className="text-xs text-slate-600">·</span>
                    <span className="text-xs text-slate-500">{new Date(task.createdAt).toLocaleDateString(undefined, { month:"short", day:"numeric", hour:"2-digit", minute:"2-digit" })}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {task.txHashes?.[0] && (
                    <a href={`${CASPER_EXPLORER}/deploy/${task.txHashes[0]}`}
                      target="_blank" rel="noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-cyan-400 hover:bg-white/5 transition-all border border-transparent hover:border-white/10">
                      <ExternalLink className="w-3.5 h-3.5" /> Explorer
                    </a>
                  )}
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20">
                    <CheckCircle className="w-3 h-3 text-green-400" />
                    <span className="text-xs font-medium text-green-400">Completed</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty history state — only show after creator is visible */}
      {history.length === 0 && (
        <div className="glass-card p-8 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-violet-500/10 flex items-center justify-center mx-auto">
            <Sparkles className="w-6 h-6 text-cyan-400" />
          </div>
          <p className="text-white font-medium text-sm">Your completed tasks will appear here</p>
          <p className="text-slate-500 text-xs">Each task is executed by AI agents with on-chain payment history.</p>
        </div>
      )}
    </div>
  );
}
