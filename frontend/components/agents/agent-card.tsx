"use client";

import Link from "next/link";
import { Star, Zap, Shield, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Agent {
  name: string;
  type: string;
  description: string;
  price: number;
  rating: number | null;
  ratingCount?: number;
  tasks: number;
  tasksFailed?: number;
  reputationScore?: number | null;
  status: "online" | "busy" | "offline";
  skills: string[];
  accountHash?: string;
  source?: "on-chain" | "local";
  demo?: boolean;
}

const GRADIENTS: Record<string, string> = {
  Research: "from-blue-500 to-cyan-400",
  Risk:     "from-amber-500 to-orange-400",
  Coding:   "from-violet-500 to-purple-400",
  Design:   "from-pink-500 to-rose-400",
  Report:   "from-emerald-500 to-teal-400",
  Audit:    "from-indigo-500 to-blue-400",
};
const EMOJIS: Record<string, string> = {
  Research: "🔍", Risk: "⚠️", Coding: "💻", Design: "🎨", Report: "📄", Audit: "✅",
};

function getRepLevel(score: number) {
  if (score >= 8000) return { label: "Elite", cls: "rep-excellent", color: "text-emerald-400", badge: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" };
  if (score >= 6500) return { label: "Trusted", cls: "rep-good", color: "text-lime-400", badge: "bg-lime-500/10 border-lime-500/20 text-lime-400" };
  if (score >= 5000) return { label: "Neutral", cls: "rep-neutral", color: "text-amber-400", badge: "bg-amber-500/10 border-amber-500/20 text-amber-400" };
  if (score >= 3000) return { label: "Risky", cls: "rep-poor", color: "text-orange-400", badge: "bg-orange-500/10 border-orange-500/20 text-orange-400" };
  return { label: "Poor", cls: "rep-bad", color: "text-red-400", badge: "bg-red-500/10 border-red-500/20 text-red-400" };
}

export function AgentCard({ name, type, description, price, rating, ratingCount, tasks, reputationScore, status, skills, accountHash, source, demo }: Agent) {
  const gradient = GRADIENTS[type] ?? "from-cyan-500 to-violet-400";
  const emoji    = EMOJIS[type] ?? "🤖";
  const isOnline = status === "online";
  const repScore = reputationScore ?? null;
  const isOnChain = source === "on-chain";
  const rep = repScore != null ? getRepLevel(repScore) : null;
  const repPercent = repScore != null ? Math.round((repScore / 10000) * 100) : 0;

  return (
    <div className="glass-card p-4 flex flex-col group glow-hover hover:-translate-y-0.5">
      {/* Top row: avatar + name + rating */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={cn("w-10 h-10 rounded-xl bg-gradient-to-br flex items-center justify-center text-lg flex-shrink-0 shadow-lg group-hover:scale-105 transition-transform", gradient)}>
            {emoji}
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-white text-sm group-hover:text-cyan-400 transition-colors truncate">
              {accountHash ? (
                <Link href={`/agents/${accountHash}`}>{name}</Link>
              ) : name}
            </h3>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", isOnline ? "bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.4)]" : "bg-slate-500")} />
              <span className="text-[11px] text-slate-500 capitalize">{status}</span>
              {isOnChain && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 font-medium">on-chain</span>
              )}
              {demo && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-400 font-medium">demo</span>
              )}
            </div>
          </div>
        </div>
        {rating != null && (
          <div className="flex items-center gap-1 px-2 py-0.5 bg-amber-500/[0.08] border border-amber-500/15 rounded-lg flex-shrink-0">
            <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
            <span className="text-[11px] font-medium text-amber-300">{rating.toFixed(1)}</span>
            {ratingCount != null && ratingCount > 0 && (
              <span className="text-[10px] text-amber-500/60">({ratingCount})</span>
            )}
          </div>
        )}
      </div>

      {/* Description */}
      <p className="text-xs text-slate-400 leading-relaxed mb-3 flex-1 line-clamp-2">{description}</p>

      {/* Reputation bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1.5">
            {rep ? (
              <>
                <Shield className={cn("w-3 h-3", rep.color)} />
                <span className={cn("text-[11px] font-medium", rep.color)}>{rep.label}</span>
              </>
            ) : (
              <>
                <Shield className="w-3 h-3 text-slate-600" />
                <span className="text-[11px] font-medium text-slate-600">Unrated</span>
              </>
            )}
          </div>
          <span className="text-[10px] text-slate-600 tabular-nums">
            {repScore != null ? `${repScore.toLocaleString()}/10000` : "—"}
          </span>
        </div>
        <div className="rep-bar-track">
          <div
            className={cn("rep-bar-fill", rep ? rep.cls : "")}
            style={{ width: repScore != null ? `${repPercent}%` : "0%", background: !rep ? "rgba(255,255,255,0.1)" : undefined }}
          />
        </div>
      </div>

      {/* Skills */}
      <div className="flex flex-wrap gap-1 mb-3">
        {skills.slice(0, 3).map(s => (
          <span key={s} className="px-2 py-0.5 text-[10px] bg-white/[0.03] border border-white/[0.05] rounded-md text-slate-500 font-medium">{s}</span>
        ))}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-white/[0.05]">
        <div>
          <span className="text-sm font-bold text-white">{price}</span>
          <span className="text-[11px] text-slate-500 ml-1">CSPR/task</span>
        </div>
        <div className="flex items-center gap-3">
          {repScore != null && repScore >= 8000 && (
            <div className="flex items-center gap-1 text-[11px]" title="Elite reputation">
              <Trophy className="w-3 h-3 text-yellow-400" />
            </div>
          )}
          <div className="flex items-center gap-1 text-[11px] text-slate-500">
            <Zap className="w-3 h-3 text-cyan-400/40" />
            <span className="tabular-nums">{tasks}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
