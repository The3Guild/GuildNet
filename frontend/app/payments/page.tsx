"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@/hooks/use-wallet";
import { CASPER_EXPLORER, BACKEND_URL } from "@/lib/constants";
import { shortenAddress } from "@/lib/utils";
import { ExternalLink, ArrowUpRight, ArrowDownLeft, Wallet, Receipt, Loader2 } from "lucide-react";

interface Settlement {
  id: string;
  payer: string;
  payee: string;
  amountBaseUnits: string;
  amountCSPR: string;
  resource: string;
  transactionHash: string;
  timestamp: number;
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
    .filter(s => !address || s.payer.toLowerCase() === address.toLowerCase())
    .reduce((s, x) => s + parseFloat(x.amountCSPR || "0"), 0);

  return (
    <div className="space-y-5 max-w-5xl mx-auto w-full">
      <div className="page-header">
        <h1>Payments</h1>
        <p>Settled x402 payment history on Casper Testnet</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="space-y-3">
          <div className="grid grid-cols-3 lg:grid-cols-1 gap-2">
            {[
              { label: "Total Spent",    value: `${totalOut.toFixed(2)} CSPR` },
              { label: "Transactions",   value: String(settlements.length) },
              { label: "Agents Paid",    value: String(new Set(settlements.map(s => s.payee)).size) },
            ].map(({ label, value }) => (
              <div key={label} className="glass-card p-3.5">
                <p className="text-[11px] text-slate-500 mb-1">{label}</p>
                <p className="text-base font-bold text-white tabular-nums">{value}</p>
              </div>
            ))}
          </div>

          {!connected ? (
            <div className="glass-card p-5 text-center space-y-3">
              <Wallet className="w-6 h-6 text-slate-600 mx-auto" />
              <p className="text-xs text-slate-400">Connect wallet to link on-chain explorer</p>
              <button onClick={connect} className="btn-primary px-5 py-2 rounded-xl text-xs w-full">Connect Wallet</button>
            </div>
          ) : (
            <div className="glass-card p-3 flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
              <code className="text-xs text-white truncate flex-1">{shortenAddress(address)}</code>
              <a href={`${CASPER_EXPLORER}/account/${address}`} target="_blank" rel="noreferrer"
                className="text-slate-500 hover:text-cyan-400 transition-colors flex-shrink-0">
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}
        </div>

        <div className="lg:col-span-2">
          {loading ? (
            <div className="glass-card p-10 text-center h-full flex flex-col items-center justify-center">
              <Loader2 className="w-6 h-6 text-cyan-400 animate-spin mx-auto mb-2" />
              <p className="text-slate-500 text-xs">Loading settlement history…</p>
            </div>
          ) : error ? (
            <div className="glass-card p-10 text-center h-full flex flex-col items-center justify-center">
              <p className="text-amber-400 text-sm mb-1">Could not load settlements</p>
              <p className="text-slate-600 text-xs">{error}</p>
            </div>
          ) : settlements.length > 0 ? (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-white mb-2">Settled Payments</h2>
              {settlements.map(s => {
                const isPayer = address && s.payer.toLowerCase() === address.toLowerCase();
                return (
                  <div key={s.id} className="glass-card px-4 py-3 flex items-center gap-3">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${isPayer ? "bg-red-500/8" : "bg-green-500/8"}`}>
                      {isPayer
                        ? <ArrowUpRight className="w-3.5 h-3.5 text-red-400" />
                        : <ArrowDownLeft className="w-3.5 h-3.5 text-green-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">
                        {isPayer ? `Payment to ${shortenAddress(s.payee)}` : `Payment from ${shortenAddress(s.payer)}`}
                      </p>
                      <code className="text-[11px] text-slate-500">{s.transactionHash.slice(0, 16)}…</code>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`text-xs font-medium tabular-nums ${isPayer ? "text-red-400" : "text-green-400"}`}>
                        {isPayer ? "-" : "+"}{s.amountCSPR} CSPR
                      </span>
                      <a href={`${CASPER_EXPLORER}/deploy/${s.transactionHash}`} target="_blank" rel="noreferrer"
                        className="text-slate-500 hover:text-cyan-400 transition-colors">
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="glass-card p-10 text-center h-full flex flex-col items-center justify-center">
              <Receipt className="w-8 h-8 text-slate-700 mb-3" />
              <p className="text-slate-500 text-sm">No transactions yet.</p>
              <p className="text-slate-600 text-xs mt-1">Submit a task to see payments here.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
