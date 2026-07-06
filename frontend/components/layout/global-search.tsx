"use client";

import { useState, useEffect, useRef } from "react";
import { Search, Bot, ClipboardList, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useChainAgents } from "@/hooks/use-chain-agents";
import { useTaskHistory } from "@/hooks/use-task-history";

export function GlobalSearch() {
  const [query,  setQuery]  = useState("");
  const [open,   setOpen]   = useState(false);
  const ref  = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { agents } = useChainAgents();
  const { history } = useTaskHistory();

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const q = query.toLowerCase().trim();

  const matchedAgents = q
    ? agents.filter(a =>
        a.name.toLowerCase().includes(q) ||
        a.type.toLowerCase().includes(q) ||
        a.skills.some(s => s.toLowerCase().includes(q))
      ).slice(0, 4)
    : [];

  const matchedTasks = q
    ? history.filter(t => t.description.toLowerCase().includes(q)).slice(0, 4)
    : [];

  const hasResults = matchedAgents.length > 0 || matchedTasks.length > 0;

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") { setOpen(false); setQuery(""); }
    if (e.key === "Enter" && q) {
      // Navigate to agents page filtered by query if it matches a capability
      router.push(`/agents`);
      setOpen(false);
    }
  }

  return (
    <div ref={ref} className="relative flex-1 max-w-sm">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600 pointer-events-none" />
      <input
        type="text"
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKey}
        placeholder="Search agents, tasks…"
        className="input-base pl-9 pr-8 py-1.5 text-sm"
      />
      {query && (
        <button onClick={() => { setQuery(""); setOpen(false); }}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
          <X className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Dropdown */}
      {open && query && (
        <div className="absolute top-full mt-2 left-0 right-0 glass-card border border-white/10 rounded-xl overflow-hidden z-50 shadow-2xl">
          {!hasResults && (
            <p className="px-4 py-3 text-sm text-slate-500">No results for "{query}"</p>
          )}

          {matchedAgents.length > 0 && (
            <div>
              <p className="px-4 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wider border-b border-white/5">Agents</p>
              {matchedAgents.map(a => (
                <button key={a.name} onClick={() => { router.push("/agents"); setOpen(false); setQuery(""); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors text-left">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-500/30 to-violet-500/30 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-3.5 h-3.5 text-cyan-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-white truncate">{a.name}</p>
                    <p className="text-xs text-slate-500">{a.type} · {a.price} ETH/task</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {matchedTasks.length > 0 && (
            <div className={matchedAgents.length > 0 ? "border-t border-white/5" : ""}>
              <p className="px-4 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wider border-b border-white/5">Tasks</p>
              {matchedTasks.map(t => (
                <button key={t.taskId} onClick={() => { router.push("/tasks"); setOpen(false); setQuery(""); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors text-left">
                  <div className="w-7 h-7 rounded-lg bg-green-500/20 flex items-center justify-center flex-shrink-0">
                    <ClipboardList className="w-3.5 h-3.5 text-green-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-white truncate">{t.description}</p>
                    <p className="text-xs text-slate-500">Task #{t.taskId} · {t.agentsHired.length} agents</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
