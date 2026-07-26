"use client";

import { useParams } from "next/navigation";
import { useAgentReputation } from "@/hooks/use-agent-reputation";
import { useWallet } from "@/hooks/use-wallet";
import { CASPER_EXPLORER, BACKEND_URL } from "@/lib/constants";
import { shortenAddress } from "@/lib/utils";
import {
  Shield, ExternalLink, CheckCircle, XCircle, Clock, ArrowLeft,
  TrendingUp, Activity,
} from "lucide-react";
import Link from "next/link";

export default function AgentTrustPage() {
  const params = useParams();
  const hash = params?.hash as string;
  const { reputation, events, loading, error } = useAgentReputation(hash);
  const { connected, address } = useWallet();

  const score = reputation?.score ?? 5000;
  const scorePercent = Math.round((score / 10000) * 100);
  const scoreColor = score > 6000 ? "text-green-400" : score > 4000 ? "text-amber-400" : "text-red-400";

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto w-full space-y-5">
        <div className="skeleton h-8 w-48 rounded-lg" />
        <div className="skeleton h-40 rounded-xl" />
        <div className="skeleton h-60 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto w-full space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/agents" className="text-slate-500 hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-lg font-bold text-white">Agent Trust Profile</h1>
          <code className="text-xs text-slate-500">{hash ? shortenAddress(hash) : "—"}</code>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <a href={`${CASPER_EXPLORER}/account/${hash}`} target="_blank" rel="noreferrer"
            className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition-colors">
            Explorer <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      {error && (
        <div className="glass-card p-4 bg-amber-500/10 border border-amber-500/30">
          <p className="text-xs text-amber-400">{error}</p>
        </div>
      )}

      {/* Score overview */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="glass-card p-5 sm:col-span-2">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500/20 to-cyan-500/20 flex items-center justify-center">
              <Shield className={`w-6 h-6 ${scoreColor}`} />
            </div>
            <div>
              <p className="text-2xl font-bold text-white tabular-nums">{score}<span className="text-sm text-slate-500 font-normal">/10000</span></p>
              <p className="text-xs text-slate-500">On-chain reputation score</p>
            </div>
          </div>
          {/* Score bar */}
          <div className="w-full h-2 bg-white/[0.06] rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${score > 6000 ? "bg-green-500" : score > 4000 ? "bg-amber-500" : "bg-red-500"}`}
              style={{ width: `${scorePercent}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-600 mt-1.5">Formula: completions / (completions + failures×2) × 10000</p>
        </div>

        <div className="glass-card p-4">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-green-500/15 to-green-500/5 flex items-center justify-center mb-2">
            <CheckCircle className="w-3.5 h-3.5 text-green-400" />
          </div>
          <p className="text-lg font-bold text-white tabular-nums">{reputation?.tasksCompleted ?? 0}</p>
          <p className="text-xs text-slate-500">Tasks completed</p>
        </div>

        <div className="glass-card p-4">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-red-500/15 to-red-500/5 flex items-center justify-center mb-2">
            <XCircle className="w-3.5 h-3.5 text-red-400" />
          </div>
          <p className="text-lg font-bold text-white tabular-nums">{reputation?.tasksFailed ?? 0}</p>
          <p className="text-xs text-slate-500">Tasks failed</p>
        </div>
      </div>

      {/* Event history */}
      <div className="glass-card p-5">
        <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <Activity className="w-4 h-4 text-cyan-400" />
          Reputation History
        </h2>
        {events.length > 0 ? (
          <div className="space-y-2">
            {events.map((ev, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2.5 bg-white/[0.02] rounded-lg border border-white/[0.04]">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                  ev.success ? "bg-green-500/10" : "bg-red-500/10"
                }`}>
                  {ev.success
                    ? <CheckCircle className="w-3 h-3 text-green-400" />
                    : <XCircle className="w-3 h-3 text-red-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white">
                    Task #{ev.taskId} — <span className={ev.success ? "text-green-400" : "text-red-400"}>{ev.success ? "completed" : "failed"}</span>
                  </p>
                  <p className="text-[11px] text-slate-500">
                    <Clock className="w-2.5 h-2.5 inline mr-1" />
                    {new Date(ev.timestamp * 1000).toLocaleString()}
                  </p>
                </div>
                {ev.deployHash && (
                  <a href={`${CASPER_EXPLORER}/deploy/${ev.deployHash}`} target="_blank" rel="noreferrer"
                    className="text-slate-500 hover:text-cyan-400 transition-colors flex-shrink-0">
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <TrendingUp className="w-8 h-8 text-slate-700 mx-auto mb-2" />
            <p className="text-slate-500 text-sm">No reputation events yet</p>
            <p className="text-slate-600 text-xs mt-1">Events appear after tasks are completed on-chain.</p>
          </div>
        )}
      </div>
    </div>
  );
}
