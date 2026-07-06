"use client";

import { Star, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Agent {
  name: string;
  type: string;
  description: string;
  price: number;
  rating: number;
  tasks: number;
  status: "online" | "busy" | "offline";
  skills: string[];
}

const GRADIENTS: Record<string, string> = {
  Research: "from-blue-500 to-cyan-400",
  Risk:     "from-amber-500 to-orange-400",
  Coding:   "from-violet-500 to-purple-400",
  Design:   "from-pink-500 to-rose-400",
  Report:   "from-emerald-500 to-teal-400",
};
const EMOJIS: Record<string, string> = {
  Research: "🔍", Risk: "⚠️", Coding: "💻", Design: "🎨", Report: "📄",
};

export function AgentCard({ name, type, description, price, rating, tasks, status, skills }: Agent) {
  const gradient = GRADIENTS[type] ?? "from-cyan-500 to-violet-400";
  const emoji    = EMOJIS[type] ?? "🤖";
  const isOnline = status === "online";

  return (
    <div className="glass-card p-5 flex flex-col group glow-hover transition-all duration-200 hover:-translate-y-0.5">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={cn("w-12 h-12 rounded-2xl bg-gradient-to-br flex items-center justify-center text-xl flex-shrink-0 shadow-lg", gradient)}>
            {emoji}
          </div>
          <div>
            <h3 className="font-semibold text-white text-sm group-hover:text-cyan-400 transition-colors">{name}</h3>
            <div className="flex items-center gap-1.5 mt-1">
              <span className={cn("w-1.5 h-1.5 rounded-full", isOnline ? "bg-green-400 animate-pulse" : "bg-slate-500")} />
              <span className="text-[11px] text-slate-500 capitalize">{status}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 px-2 py-1 bg-amber-500/10 border border-amber-500/20 rounded-lg">
          <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
          <span className="text-xs font-medium text-amber-300">{rating}</span>
        </div>
      </div>

      <p className="text-xs text-slate-400 leading-relaxed mb-3 flex-1 line-clamp-2">{description}</p>

      <div className="flex flex-wrap gap-1.5 mb-4">
        {skills.slice(0, 3).map(s => (
          <span key={s} className="px-2 py-0.5 text-[11px] bg-white/[0.04] border border-white/[0.06] rounded-md text-slate-400">{s}</span>
        ))}
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-white/[0.06]">
        <div>
          <span className="text-base font-bold text-white">{price}</span>
          <span className="text-xs text-slate-500 ml-1">CSPR / task</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <Zap className="w-3 h-3 text-cyan-400/50" />
          <span>{tasks} tasks</span>
        </div>
      </div>
    </div>
  );
}
