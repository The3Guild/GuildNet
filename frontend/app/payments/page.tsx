"use client";

import { ExternalLink, ArrowUpRight, ArrowDownLeft, Wallet, Receipt } from "lucide-react";
import { useWallet } from "@/hooks/use-wallet";
import { useTaskHistory } from "@/hooks/use-task-history";
import { CASPER_EXPLORER } from "@/lib/constants";
import { shortenAddress } from "@/lib/utils";

export default function PaymentsPage() {
  const { connected, address, connect } = useWallet();
  const { history } = useTaskHistory();

  const txRows = history.flatMap(task =>
    task.txHashes.map((hash, i) => ({
      hash,
      label: i === 0 ? `Created task #${task.taskId}`
           : i === task.txHashes.length - 1 ? `Refund — task #${task.taskId}`
           : `Paid agent (task #${task.taskId})`,
      type:   i === task.txHashes.length - 1 ? "in" : "out",
      amount: i === 0 ? "4 CSPR" : i === task.txHashes.length - 1 ? "refund" : "0.5 CSPR",
    }))
  );

  const totalOut = history.reduce((s, t) => s + t.agentsHired.length * 0.5, 0);

  return (
    <div className="space-y-6 max-w-5xl mx-auto w-full">
      <div>
        <h1 className="text-2xl font-bold text-white">Payments</h1>
        <p className="text-sm text-slate-400 mt-1">On-chain payment history via x402 payment rail</p>
      </div>

      {/* Desktop two-column */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left column — summary + wallet */}
        <div className="space-y-4">
          <div className="grid grid-cols-3 lg:grid-cols-1 gap-3">
            {[
              { label: "Total Spent",   value: `${totalOut.toFixed(2)} CSPR` },
              { label: "Transactions",  value: String(txRows.length) },
              { label: "Tasks",         value: String(history.length) },
            ].map(({ label, value }) => (
              <div key={label} className="glass-card p-4">
                <p className="text-xs text-slate-500 mb-1">{label}</p>
                <p className="text-lg font-bold text-white tabular-nums">{value}</p>
              </div>
            ))}
          </div>

          {!connected ? (
            <div className="glass-card p-5 text-center space-y-3">
              <Wallet className="w-7 h-7 text-slate-600 mx-auto" />
              <p className="text-xs text-slate-400">Connect wallet to view on CSPR.live</p>
              <button onClick={connect} className="btn-primary px-5 py-2 rounded-xl text-xs w-full">Connect Wallet</button>
            </div>
          ) : (
            <div className="glass-card p-4 flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
              <code className="text-xs text-white truncate flex-1">{shortenAddress(address)}</code>
              <a href={`${CASPER_EXPLORER}/account/${address}`} target="_blank" rel="noreferrer"
                className="text-slate-500 hover:text-cyan-400 transition-colors flex-shrink-0">
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          )}
        </div>

        {/* Right column — transactions */}
        <div className="lg:col-span-2">
          {txRows.length > 0 ? (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-white mb-3">Transaction History</h2>
              {txRows.map(tx => (
                <div key={tx.hash} className="glass-card px-4 py-3 flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${tx.type === "out" ? "bg-red-500/10" : "bg-green-500/10"}`}>
                    {tx.type === "out"
                      ? <ArrowUpRight className="w-3.5 h-3.5 text-red-400" />
                      : <ArrowDownLeft className="w-3.5 h-3.5 text-green-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{tx.label}</p>
                    <code className="text-xs text-slate-500">{tx.hash.slice(0, 16)}…</code>
                  </div>
                  <div className="flex items-center gap-2.5 flex-shrink-0">
                    <span className={`text-xs font-medium tabular-nums ${tx.type === "out" ? "text-red-400" : "text-green-400"}`}>
                      {tx.type === "out" ? "−" : "+"}{tx.amount}
                    </span>
                    <a href={`${CASPER_EXPLORER}/deploy/${tx.hash}`} target="_blank" rel="noreferrer"
                      className="text-slate-500 hover:text-cyan-400 transition-colors">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="glass-card p-10 text-center h-full flex flex-col items-center justify-center">
              <Receipt className="w-10 h-10 text-slate-700 mb-3" />
              <p className="text-slate-500 text-sm">No transactions yet.</p>
              <p className="text-slate-600 text-xs mt-1">Submit a task to see payments here.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
