"use client";

import { Wallet, Copy, Check, ExternalLink, LogOut, AlertCircle, Loader2 } from "lucide-react";
import { useWallet } from "@/hooks/use-wallet";
import { shortenAddress } from "@/lib/utils";
import { CASPER_EXPLORER } from "@/lib/constants";

export function WalletConnect() {
  const { connected, address, connecting, sdkReady, error, connect, disconnect, copyAddress, copied } = useWallet();

  if (error) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-red-500/20 bg-red-500/8">
        <AlertCircle className="w-3.5 h-3.5 text-red-400" />
        <span className="text-xs text-red-400">{error}</span>
      </div>
    );
  }

  if (!sdkReady) {
    return (
      <button disabled
        className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-500 bg-white/[0.03] border border-white/[0.06] rounded-lg opacity-50 cursor-not-allowed">
        <Loader2 className="w-3 h-3 animate-spin" />
        Loading...
      </button>
    );
  }

  if (!connected) {
    return (
      <button onClick={connect} disabled={connecting}
        className="btn-primary flex items-center gap-2 px-3.5 py-1.5 text-xs">
        <Wallet className="w-3.5 h-3.5" />
        {connecting ? "Connecting..." : "Connect"}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03]">
      <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
      <span className="text-xs font-medium text-slate-200 tabular-nums">{shortenAddress(address)}</span>
      <button onClick={copyAddress} className="text-slate-500 hover:text-white transition-colors" title="Copy address">
        {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
      </button>
      <a href={`${CASPER_EXPLORER}/account/${address}`} target="_blank" rel="noreferrer"
        className="text-slate-500 hover:text-cyan-400 transition-colors" title="View on explorer">
        <ExternalLink className="w-3 h-3" />
      </a>
      <button onClick={disconnect} className="text-slate-500 hover:text-red-400 transition-colors ml-0.5" title="Disconnect">
        <LogOut className="w-3 h-3" />
      </button>
    </div>
  );
}
