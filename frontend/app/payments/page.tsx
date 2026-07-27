"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@/hooks/use-wallet";
import { CASPER_EXPLORER, BACKEND_URL } from "@/lib/constants";
import { shortenAddress } from "@/lib/utils";
import { ExternalLink, ArrowUpRight, ArrowDownLeft, Wallet, Receipt, Loader2, TrendingUp, Users, CreditCard } from "lucide-react";

interface Settlement {
  hash:        string;
  from:        string;
  to:          string;
  amount:      string;
  capability:  string;
  taskId:      string;
  timestamp:   string;
}

export default function PaymentsPage() {
  const { connected, address, connect } = useWallet();
  const [settlements, setSettlements]   = useState<Settlement[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);

  useEffect(() => {
    fetch(`${BACKEND_URL}/x402/history`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(data => setSettlements(data.settlements ?? []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const totalOut = settlements
    .filter(s => !address || s.from.toLowerCase() === address.toLowerCase())
    .reduce((s, x) => s + (parseFloat(x.amount || "0") / 1e9), 0);

  const uniqueAgents = new Set(settlements.map(s => s.to)).size;

  return (
    <div className="space-y-5 max-w-5xl mx-auto w-full">
      <div className="page-header">
        <h1>Payments</h1>
        <p>Settled x402 payment history on Casper Testnet</p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: "Total Spent", value: `${totalOut.toFixed(2)} CSPR`, icon: CreditCard, color: "text-cyan-400", bg: "from-cyan-500/15 to-cyan-500/5" },
          { label: "Transactions", value: String(settlements.length), icon: TrendingUp, color: "text-violet-400", bg: "from-violet-500/15 to-violet-500/5" },
          { label: "Agents Paid", value: String(uniqueAgents), icon: Users, color: "text-green-400", bg: "from-green-500/15 to-green-500/5" },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="glass-card stat-card p-4">
            <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${bg} flex items-center justify-center mb-3`}>
              <Icon className={`w-3.5 h-3.5 ${color}`} />
            </div>
            <p className="text-lg font-bold text-white tabular-nums">{value}</p>
            <p className="text-[11px] text-slate-500">{label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Wallet sidebar */}
        <div className="order-2 lg:order-1 space-y-3">
          {!connected ? (
            <div className="glass-card p-5 text-center space-y-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500/10 to-violet-500/10 flex items-center justify-center mx-auto">
                <Wallet className="w-6 h-6 text-slate-500" />
              </div>
              <p className="text-xs text-slate-400">Connect wallet to link on-chain explorer</p>
              <button onClick={connect} className="btn-primary px-5 py-2 rounded-xl text-xs w-full">Connect Wallet</button>
            </div>
          ) : (
            <div className="glass-card p-4">
              <p className="text-[11px] text-slate-500 mb-2">Connected Wallet</p>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
                <code className="text-xs text-white truncate flex-1">{shortenAddress(address)}</code>
                <a href={`${CASPER_EXPLORER}/account/${address}`} target="_blank" rel="noreferrer"
                  className="text-slate-500 hover:text-cyan-400 transition-colors flex-shrink-0">
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Settlement list */}
        <div className="lg:col-span-2 order-1 lg:order-2">
          {loading ? (
            <div className="glass-card p-8 sm:p-10 text-center h-full flex flex-col items-center justify-center">
              <Loader2 className="w-6 h-6 text-cyan-400 animate-spin mx-auto mb-2" />
              <p className="text-slate-500 text-xs">Loading settlement history…</p>
            </div>
          ) : error ? (
            <div className="glass-card p-8 sm:p-10 text-center h-full flex flex-col items-center justify-center">
              <p className="text-amber-400 text-sm mb-1">Could not load settlements</p>
              <p className="text-slate-600 text-xs">{error}</p>
            </div>
          ) : settlements.length > 0 ? (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-white mb-2">Settled Payments</h2>
              {settlements.map(s => {
                const isPayer = address && s.from.toLowerCase() === address.toLowerCase();
                const amountCSPR = (parseFloat(s.amount || "0") / 1e9).toFixed(2);
                return (
                  <div key={s.hash} className="glass-card px-2.5 sm:px-4 py-2.5 sm:py-3 flex items-center gap-2 sm:gap-3 hover:bg-white/[0.03] transition-colors">
                    <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isPayer ? "bg-red-500/8" : "bg-green-500/8"}`}>
                      {isPayer
                        ? <ArrowUpRight className="w-4 h-4 text-red-400" />
                        : <ArrowDownLeft className="w-4 h-4 text-green-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">
                        {isPayer ? `Paid ${shortenAddress(s.to)}` : `Received from ${shortenAddress(s.from)}`}
                      </p>
                      <div className="flex items-center gap-2">
                        <code className="text-[11px] text-slate-500 truncate">{s.hash.slice(0, 16)}…</code>
                        {s.capability && (
                          <span className="text-[10px] text-slate-600 hidden sm:inline">· {s.capability}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 sm:gap-1.5 sm:gap-2 flex-shrink-0">
                      <span className={`text-xs sm:text-sm font-medium tabular-nums ${isPayer ? "text-red-400" : "text-green-400"}`}>
                        {isPayer ? "−" : "+"}{amountCSPR}
                      </span>
                      <a href={`${CASPER_EXPLORER}/deploy/${s.hash}`} target="_blank" rel="noreferrer"
                        className="text-slate-500 hover:text-cyan-400 transition-colors p-1">
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="glass-card p-8 sm:p-10 text-center h-full flex flex-col items-center justify-center">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-cyan-500/10 to-violet-500/10 flex items-center justify-center mx-auto mb-3">
                <Receipt className="w-7 h-7 text-slate-600" />
              </div>
              <p className="text-slate-500 text-sm font-medium">No transactions yet</p>
              <p className="text-slate-600 text-xs mt-1">Submit a task to see payments here.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
