"use client";

import { useState } from "react";
import { Send, Sparkles, Loader2, CheckCircle, ChevronDown, ChevronUp, AlertCircle, Zap, Wand2, RefreshCw } from "lucide-react";
import { CAPABILITIES, BACKEND_URL } from "@/lib/constants";
import { useWallet } from "@/hooks/use-wallet";
import type { TaskRecord } from "@/hooks/use-tasks";

const PIPELINE_LABELS: Record<string, string> = {
  creating: "⛓️ Creating task", research: "🔍 Research", risk: "⚠️ Risk",
  coding: "💻 Coding", design: "🎨 Design", audit: "✅ Audit", report: "📄 Report",
};
const OUTPUT_LABELS: Record<string, string> = {
  research: "🔍 Research", riskAnalysis: "⚠️ Risk Analysis",
  coding: "🚀 Live App", design: "🎨 Design Preview",
  audit: "✅ Audit", report: "📄 Final Report",
};

interface Props { onTaskComplete?: (task: TaskRecord) => void; }

export function TaskCreator({ onTaskComplete }: Props) {
  const [description,  setDescription]  = useState("");
  const [capabilities, setCapabilities] = useState<string[]>(["research", "risk", "audit", "report"]);
  const [autoMode,     setAutoMode]     = useState(true);
  const [suggesting,   setSuggesting]   = useState(false);
  const [step,         setStep]         = useState("idle");
  const [result,       setResult]       = useState<TaskRecord | null>(null);
  const [error,        setError]        = useState("");
  const [expanded,     setExpanded]     = useState<string | null>("report");
  // enhance state per section
  const [enhancing,    setEnhancing]    = useState<string | null>(null);
  const [feedback,     setFeedback]     = useState<Record<string, string>>({});
  const [enhanced,     setEnhanced]     = useState<Record<string, string>>({});

  const { connected, connect } = useWallet();

  const busy = step !== "idle" && step !== "done" && step !== "error";
  const pipelineKeys = ["creating", ...capabilities];
  const stepIndex = pipelineKeys.indexOf(step);

  // Auto-suggest agents based on description
  async function suggestAgents() {
    if (!description.trim()) return;
    setSuggesting(true);
    try {
      const res = await fetch(`${BACKEND_URL}/suggest-agents`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });
      const data = await res.json();
      if (data.capabilities) setCapabilities(data.capabilities);
    } catch {} finally { setSuggesting(false); }
  }

  async function handleSubmit() {
    if (!description.trim() || busy) return;
    if (!connected) { connect(); return; }

    // Auto-suggest agents
    let activeCaps = capabilities;
    if (autoMode) {
      setSuggesting(true);
      try {
        const res = await fetch(`${BACKEND_URL}/suggest-agents`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ description }),
        });
        const data = await res.json();
        if (data.capabilities?.length) {
          activeCaps = data.capabilities;
          setCapabilities(activeCaps);
        }
      } catch {} finally { setSuggesting(false); }
    }

    setResult(null); setError(""); setEnhanced({}); setStep("creating");
    const pKeys = ["creating", ...activeCaps];

    try {
      // ── Run backend pipeline ──
      let si = 1;
      const ticker = setInterval(() => { si = Math.min(si + 1, pKeys.length - 1); setStep(pKeys[si]); }, 14_000);
      const res = await fetch(`${BACKEND_URL}/task`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description, budgetCSPR: "4", capabilities: activeCaps }),
        signal: AbortSignal.timeout(300_000),
      });
      clearInterval(ticker);
      if (!res.ok) { const err = await res.json().catch(() => ({ error: res.statusText })); throw new Error(err.error ?? res.statusText); }
      const data = await res.json();
      const record: TaskRecord = { ...data, description, status: "completed", createdAt: Date.now() };
      setResult(record); setStep("done");
      onTaskComplete?.(record);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setStep("error");
    }
  }

  async function handleEnhance(key: string) {
    const fb = feedback[key];
    if (!fb?.trim() || !result) return;
    const original = result[key as keyof TaskRecord] as string;
    setEnhancing(key);
    try {
      const res = await fetch(`${BACKEND_URL}/enhance`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ capability: key, originalOutput: original, feedback: fb }),
        signal: AbortSignal.timeout(120_000),
      });
      const data = await res.json();
      if (data.enhanced) setEnhanced(prev => ({ ...prev, [key]: data.enhanced }));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setEnhancing(null); }
  }

  return (
    <div className="glass-card p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-violet-600 flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-bold text-white">Create New Task</h2>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-sm text-zinc-400">Autonomous agents · on-chain payments · Venice AI</p>
          </div>
        </div>
        {/* Auto / Manual toggle */}
        <button onClick={() => setAutoMode(p => !p)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${autoMode ? "border-cyan-500/50 bg-cyan-500/20 text-cyan-400" : "border-white/10 bg-white/5 text-zinc-400"}`}>
          {autoMode ? "🤖 Auto" : "🔧 Manual"}
        </button>
      </div>

      {/* Capability selector (shown in manual mode, or after auto-suggest) */}
      {(!autoMode || suggesting || step !== "idle") && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <p className="text-xs text-zinc-500">Agents{autoMode ? " (auto-selected)" : ""}</p>
            {autoMode && description.trim() && step === "idle" && (
              <button onClick={suggestAgents} disabled={suggesting} className="text-xs text-cyan-400 hover:underline flex items-center gap-1">
                {suggesting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />} Re-suggest
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {CAPABILITIES.map(cap => {
              const active = capabilities.includes(cap);
              return (
                <button key={cap} disabled={busy || autoMode}
                  onClick={() => !autoMode && setCapabilities(prev => active && prev.length > 1 ? prev.filter(c => c !== cap) : active ? prev : [...prev, cap])}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${active ? "border-cyan-500/50 bg-cyan-500/20 text-cyan-400" : "border-white/10 bg-white/5 text-zinc-500"} ${autoMode ? "cursor-default" : ""}`}>
                  {cap}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="relative">
        <textarea value={description} onChange={e => setDescription(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && e.metaKey) handleSubmit(); }}
          placeholder="Describe your task... agents will be auto-selected (⌘+Enter to submit)"
          className="w-full h-32 bg-white/5 border border-white/10 rounded-xl p-4 pr-14 text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 resize-none transition-all"
          disabled={busy} />
        <button onClick={handleSubmit} disabled={!description.trim() || busy}
          className="absolute bottom-4 right-4 p-2 bg-gradient-to-r from-cyan-500 to-violet-600 rounded-lg text-white disabled:opacity-40 hover:opacity-90 transition-opacity">
          {busy || suggesting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
        </button>
      </div>

      {!connected && <p className="text-xs text-zinc-500 text-center"><button onClick={connect} className="text-cyan-400 hover:underline">Connect wallet</button> to submit tasks</p>}

      {/* Progress */}
      {busy && (
        <div className="flex flex-wrap gap-2">
          {pipelineKeys.map((key, i) => {
            const isActive = key === step; const isDone = i < stepIndex;
            return (
              <div key={key} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${isActive ? "border-cyan-500/50 bg-cyan-500/20 text-cyan-400 animate-pulse" : isDone ? "border-green-500/30 bg-green-500/10 text-green-400" : "border-white/10 bg-white/5 text-zinc-500"}`}>
                {isActive ? <Loader2 className="w-3 h-3 animate-spin" /> : isDone ? "✓" : ""}{PIPELINE_LABELS[key] ?? key}
              </div>
            );
          })}
        </div>
      )}

      {/* Error */}
      {step === "error" && <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-xl"><AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" /><p className="text-sm text-red-400">{error}</p></div>}

      {/* Results */}
      {step === "done" && result && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-green-400"><CheckCircle className="w-5 h-5" /><span className="text-sm font-medium">Task #{result.taskId} completed</span></div>
            <span className="text-xs text-zinc-500">{result.agentsHired.length} agents</span>
          </div>

          {(["research","riskAnalysis","coding","design","audit","report"] as const).map(key => {
            const val = enhanced[key] ?? result[key];
            if (!val) return null;
            const isOpen = expanded === key;
            return (
              <div key={key} className="border border-white/10 rounded-xl overflow-hidden">
                <button onClick={() => setExpanded(isOpen ? null : key)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-white/5 hover:bg-white/[0.08] transition-colors text-left">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">{OUTPUT_LABELS[key]}</span>
                    {enhanced[key] && <span className="text-xs text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded">enhanced</span>}
                  </div>
                  {isOpen ? <ChevronUp className="w-4 h-4 text-zinc-400" /> : <ChevronDown className="w-4 h-4 text-zinc-400" />}
                </button>
                {isOpen && (
                  <div className="border-t border-white/5">
                    {/* Design OR Coding: render as live interactive HTML iframe */}
                    {(key === "design" || (key === "coding" && (val.includes("<!DOCTYPE") || val.includes("<html")))) ? (
                      <div>
                        <div className="flex items-center justify-between px-4 py-2 bg-black/20 border-b border-white/5">
                          <span className="text-xs text-slate-400">
                            {key === "coding" ? "✅ Live app — fully interactive, click anything" : "Live design preview — click, scroll, interact"}
                          </span>
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => {
                                const blob = new Blob([val], { type: "text/html" });
                                const a = document.createElement("a");
                                a.href = URL.createObjectURL(blob);
                                a.download = `${key}-output.html`;
                                a.click();
                              }}
                              className="text-xs text-slate-400 hover:text-white"
                            >
                              ↓ Download
                            </button>
                            <button
                              onClick={() => {
                                const blob = new Blob([val], { type: "text/html" });
                                window.open(URL.createObjectURL(blob), "_blank");
                              }}
                              className="text-xs text-cyan-400 hover:underline"
                            >
                              Open fullscreen ↗
                            </button>
                          </div>
                        </div>
                        <iframe
                          srcDoc={val}
                          className="w-full border-0"
                          style={{ height: "640px" }}
                          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                          title={key === "coding" ? "Live App" : "Design Preview"}
                        />
                      </div>
                    ) : (
                      <div className={`px-4 py-4 text-sm leading-relaxed max-h-[600px] overflow-y-auto ${
                        key === "coding" || (key === "report" && val.includes("// === FILE:"))
                          ? "font-mono text-green-300 bg-black/30 whitespace-pre text-xs"
                          : "text-zinc-300 whitespace-pre-wrap"
                      }`}>{val}</div>
                    )}
                    {/* Enhance input */}
                    <div className="px-4 pb-4 pt-3 flex gap-2 border-t border-white/5">
                      <input
                        value={feedback[key] ?? ""}
                        onChange={e => setFeedback(prev => ({ ...prev, [key]: e.target.value }))}
                        placeholder={key === "design" ? "Request UI changes..." : "Request improvements..."}
                        className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-cyan-500/50"
                      />
                      <button onClick={() => handleEnhance(key)} disabled={!feedback[key]?.trim() || enhancing === key}
                        className="flex items-center gap-1.5 px-3 py-2 bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 rounded-lg text-xs font-medium hover:bg-cyan-500/30 transition-colors disabled:opacity-40">
                        {enhancing === key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}Enhance
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
