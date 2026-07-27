"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useAgentReputation } from "@/hooks/use-agent-reputation";
import { useWallet } from "@/hooks/use-wallet";
import { CASPER_EXPLORER, BACKEND_URL } from "@/lib/constants";
import { shortenAddress } from "@/lib/utils";
import {
  Shield, ExternalLink, CheckCircle, XCircle, Clock, ArrowLeft,
  TrendingUp, Activity, Award, Zap, Star, Check,
} from "lucide-react";
import Link from "next/link";

function getRepLevel(score: number) {
  if (score >= 8000) return { label: "Elite", color: "text-green-400", barClass: "rep-excellent", bg: "from-green-500/15 to-green-500/5" };
  if (score >= 6500) return { label: "Trusted", color: "text-lime-400", barClass: "rep-good", bg: "from-lime-500/15 to-lime-500/5" };
  if (score >= 5000) return { label: "Neutral", color: "text-amber-400", barClass: "rep-neutral", bg: "from-amber-500/15 to-amber-500/5" };
  if (score >= 3000) return { label: "Risky", color: "text-orange-400", barClass: "rep-poor", bg: "from-orange-500/15 to-orange-500/5" };
  return { label: "Poor", color: "text-red-400", barClass: "rep-bad", bg: "from-red-500/15 to-red-500/5" };
}

export default function AgentTrustPage() {
  const params = useParams();
  const hash = params?.hash as string;
  const { reputation, events, loading, error } = useAgentReputation(hash);
  const { connected, address } = useWallet();

  const [hoveredStar, setHoveredStar] = useState(0);
  const [selectedRating, setSelectedRating] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [ratingError, setRatingError] = useState<string | null>(null);

  const score = reputation?.score ?? 5000;
  const scorePercent = Math.round((score / 10000) * 100);
  const rep = getRepLevel(score);

  const userRating = (reputation as Record<string, unknown>)?.userRating as number | null ?? null;
  const userRatingCount = (reputation as Record<string, unknown>)?.userRatingCount as number ?? 0;

  async function submitRating(starValue: number) {
    if (!hash || submitting || submitted) return;
    setSubmitting(true);
    setRatingError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/agents/${hash}/rate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: starValue }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setSelectedRating(starValue);
      setSubmitted(true);
    } catch (e) {
      setRatingError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

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
        <Link href="/agents" className="text-slate-500 hover:text-white transition-colors flex-shrink-0">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-white truncate">Agent Trust Profile</h1>
          <code className="text-xs text-slate-500 block truncate">{hash ? shortenAddress(hash) : "\u2014"}</code>
        </div>
        <div className="ml-auto flex items-center gap-2 flex-shrink-0">
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

      {/* Score hero */}
      <div className="glass-card p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
          <div className="flex-shrink-0">
            <div className="relative w-24 h-24 sm:w-28 sm:h-28 mx-auto sm:mx-0">
              <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
                <circle cx="50" cy="50" r="42" fill="none" strokeWidth="8" strokeLinecap="round"
                  stroke={score >= 6000 ? "#22c55e" : score >= 4000 ? "#eab308" : "#ef4444"}
                  strokeDasharray={`${scorePercent * 2.64} 264`}
                  className="transition-all duration-1000" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl sm:text-2xl font-bold text-white tabular-nums">{score}</span>
                <span className="text-[10px] text-slate-500">/ 10000</span>
              </div>
            </div>
          </div>

          <div className="flex-1 text-center sm:text-left">
            <div className="flex items-center gap-2 justify-center sm:justify-start mb-2">
              <Shield className={`w-5 h-5 ${rep.color}`} />
              <span className={`text-lg font-bold ${rep.color}`}>{rep.label}</span>
            </div>
            <p className="text-xs text-slate-500 mb-3">On-chain reputation score</p>
            <div className="rep-bar-track h-2 max-w-xs mx-auto sm:mx-0">
              <div className={`rep-bar-fill ${rep.barClass}`} style={{ width: `${scorePercent}%` }} />
            </div>
            <p className="text-[11px] text-slate-600 mt-1.5">Formula: completions / (completions + failures\u00d72) \u00d7 10000</p>
          </div>
        </div>
      </div>

      {/* User Rating Card */}
      <div className="glass-card p-5 sm:p-6">
        <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <Star className="w-4 h-4 text-amber-400" />
          User Rating
        </h2>

        <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-8">
          <div className="flex items-center gap-3">
            {userRating != null ? (
              <>
                <div className="flex items-center gap-0.5">
                  {[1,2,3,4,5].map(s => (
                    <Star key={s} className={`w-5 h-5 ${s <= Math.round(userRating) ? "text-amber-400 fill-amber-400" : "text-slate-700"}`} />
                  ))}
                </div>
                <span className="text-lg font-bold text-amber-300">{userRating}</span>
                <span className="text-xs text-slate-500">({userRatingCount} {userRatingCount === 1 ? "rating" : "ratings"})</span>
              </>
            ) : (
              <span className="text-sm text-slate-500">No user ratings yet</span>
            )}
          </div>

          <div className="flex-1 sm:text-right">
            {submitted ? (
              <div className="flex items-center gap-2 justify-center sm:justify-end text-green-400">
                <Check className="w-4 h-4" />
                <span className="text-sm font-medium">Thanks for rating!</span>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-slate-500">Rate this agent</p>
                <div className="flex items-center gap-1 justify-center sm:justify-end">
                  {[1,2,3,4,5].map(star => (
                    <button
                      key={star}
                      disabled={submitting}
                      onMouseEnter={() => setHoveredStar(star)}
                      onMouseLeave={() => setHoveredStar(0)}
                      onClick={() => submitRating(star)}
                      className="p-0.5 transition-transform hover:scale-110 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Star className={`w-7 h-7 transition-colors ${
                        star <= (hoveredStar || selectedRating)
                          ? "text-amber-400 fill-amber-400"
                          : "text-slate-700 hover:text-slate-500"
                      }`} />
                    </button>
                  ))}
                </div>
                {ratingError && (
                  <p className="text-[11px] text-red-400">{ratingError}</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Completed", value: reputation?.tasksCompleted ?? 0, icon: CheckCircle, color: "text-green-400", bg: "from-green-500/15 to-green-500/5" },
          { label: "Failed", value: reputation?.tasksFailed ?? 0, icon: XCircle, color: "text-red-400", bg: "from-red-500/15 to-red-500/5" },
          { label: "Success Rate", value: `${(reputation?.tasksCompleted ?? 0) + (reputation?.tasksFailed ?? 0) > 0 ? Math.round(((reputation?.tasksCompleted ?? 0) / ((reputation?.tasksCompleted ?? 0) + (reputation?.tasksFailed ?? 0))) * 100) : 0}%`, icon: TrendingUp, color: "text-cyan-400", bg: "from-cyan-500/15 to-cyan-500/5" },
          { label: "Events", value: events.length, icon: Activity, color: "text-violet-400", bg: "from-violet-500/15 to-violet-500/5" },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="glass-card stat-card p-4">
            <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${bg} flex items-center justify-center mb-2`}>
              <Icon className={`w-3.5 h-3.5 ${color}`} />
            </div>
            <p className="text-lg font-bold text-white tabular-nums">{value}</p>
            <p className="text-[11px] text-slate-500">{label}</p>
          </div>
        ))}
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
              <div key={i} className="flex items-center gap-3 px-3 py-2.5 bg-white/[0.02] rounded-lg border border-white/[0.04] hover:bg-white/[0.04] transition-colors">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                  ev.success ? "bg-green-500/10" : "bg-red-500/10"
                }`}>
                  {ev.success
                    ? <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                    : <XCircle className="w-3.5 h-3.5 text-red-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">
                    Task #{ev.taskId} {"\u2014"} <span className={ev.success ? "text-green-400" : "text-red-400"}>{ev.success ? "completed" : "failed"}</span>
                  </p>
                  <p className="text-[11px] text-slate-500">
                    <Clock className="w-2.5 h-2.5 inline mr-1" />
                    {new Date(ev.timestamp * 1000).toLocaleString()}
                  </p>
                </div>
                {ev.deployHash && (
                  <a href={`${CASPER_EXPLORER}/deploy/${ev.deployHash}`} target="_blank" rel="noreferrer"
                    className="text-slate-500 hover:text-cyan-400 transition-colors flex-shrink-0 p-1">
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-10">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-cyan-500/10 to-violet-500/10 flex items-center justify-center mx-auto mb-3">
              <TrendingUp className="w-7 h-7 text-slate-600" />
            </div>
            <p className="text-slate-500 text-sm font-medium">No reputation events yet</p>
            <p className="text-slate-600 text-xs mt-1">Events appear after tasks are completed on-chain.</p>
          </div>
        )}
      </div>
    </div>
  );
}
