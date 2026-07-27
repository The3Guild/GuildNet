"use client";

import { Wallet, Copy, Check, ExternalLink, LogOut, AlertCircle, Loader2 } from "lucide-react";
import { useWallet } from "@/hooks/use-wallet";
import { shortenAddress } from "@/lib/utils";
import { CASPER_EXPLORER } from "@/lib/constants";

export function WalletConnect() {
  const { connected, address, connecting, sdkReady, error, connect, disconnect, copyAddress, copied } = useWallet();

  if (error) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-red-500/20 bg-red-500/[0.06]">
        <AlertCircle className="w-3.5 h-3.5 text-red-400" />
        <span className="text-xs text-red-400 max-w-[120px] truncate">{error}</span>
      </div>
    );
  }

  if (!sdkReady) {
    return (
      <button disabled
        className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-500 bg-white/[0.02] border border-white/[0.06] rounded-lg opacity-50 cursor-not-allowed">
        <Loader2 className="w-3 h-3 animate-spin" />
        Loading...
      </button>
    );
  }

  if (!connected) {
    return (
      <button onClick={connect} disabled={connecting}
        className="btn-primary flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-1.5 text-xs flex-shrink-0">
        <Wallet className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">{connecting ? "Connecting..." : "Connect"}</span>
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] max-w-[180px] sm:max-w-none">
      <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0 shadow-[0_0_6px_rgba(16,185,129,0.4)]" />
      <span className="text-xs font-medium text-slate-200 tabular-nums truncate">{shortenAddress(address)}</span>
      <button onClick={copyAddress} className="text-slate-500 hover:text-white transition-colors flex-shrink-0" title="Copy address">
        {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
      </button>
      <a href={`${CASPER_EXPLORER}/account/${address}`} target="_blank" rel="noreferrer"
        className="text-slate-500 hover:text-cyan-400 transition-colors flex-shrink-0 hidden sm:block" title="View on explorer">
        <ExternalLink className="w-3 h-3" />
      </a>
      <button onClick={disconnect} className="text-slate-500 hover:text-red-400 transition-colors flex-shrink-0 ml-0.5" title="Disconnect">
        <LogOut className="w-3 h-3" />
      </button>
    </div>
  );
}
