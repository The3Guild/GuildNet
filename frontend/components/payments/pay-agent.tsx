"use client";

import { useState } from "react";
import { useWallet } from "@/hooks/use-wallet";
import { BACKEND_URL } from "@/lib/constants";
import { shortenAddress } from "@/lib/utils";
import { Loader2, CreditCard, ExternalLink, CheckCircle, AlertCircle } from "lucide-react";

interface PayAgentProps {
  agentAccountHash: string;
  agentName: string;
  amountMotes: string;
  amountLabel: string;
  onSuccess?: (explorerLink: string) => void;
}

export function PayAgent({ agentAccountHash, agentName, amountMotes, amountLabel, onSuccess }: PayAgentProps) {
  const { connected, address, connect, signTypedData } = useWallet();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; explorerLink?: string; error?: string } | null>(null);

  async function handlePay() {
    if (!connected || !signTypedData) { connect(); return; }
    setLoading(true);
    setResult(null);

    try {
      // Step 1: Prepare payment
      const prepRes = await fetch(`${BACKEND_URL}/x402/prepare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payeeAccountHash: agentAccountHash,
          amountBaseUnits:  amountMotes,
          resourceUrl:      `https://guildnet.io/agents/pay/${agentAccountHash}`,
        }),
      });
      if (!prepRes.ok) throw new Error(`Prepare failed: ${prepRes.status}`);
      const prepData = await prepRes.json();

      // Step 2: Sign via CSPR.click
      const signed = await signTypedData(prepData.signTypedDataParams);
      if (!signed || signed.cancelled || !signed.signatureHex) throw new Error("Signing was rejected or cancelled");

      // Step 3: Submit signed payment
      const submitRes = await fetch(`${BACKEND_URL}/x402/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authorization: prepData.authorization,
          signature:     signed.signatureHex,
          publicKey:     address,
          resourceUrl:   prepData.resourceUrl,
        }),
      });
      if (!submitRes.ok) {
        const err = await submitRes.json().catch(() => ({}));
        throw new Error(err.error ?? `Submit failed: ${submitRes.status}`);
      }
      const submitData = await submitRes.json();

      const link = submitData.explorerLink ?? `https://testnet.cspr.live/deploy/${submitData.transactionHash}`;
      setResult({ success: true, explorerLink: link });
      onSuccess?.(link);
    } catch (e) {
      setResult({ success: false, error: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <button
        onClick={handlePay}
        disabled={loading}
        className="w-full btn-primary py-3 rounded-xl text-sm flex items-center justify-center gap-2"
      >
        {loading ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> Processing…</>
        ) : (
          <><CreditCard className="w-4 h-4" /> Pay {amountLabel} to {agentName}</>
        )}
      </button>

      {result?.success && result.explorerLink && (
        <div className="flex items-start gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-xl">
          <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-xs font-medium text-green-400">Payment settled!</p>
            <a href={result.explorerLink} target="_blank" rel="noreferrer"
              className="text-[11px] text-cyan-400 hover:underline flex items-center gap-1 mt-0.5">
              View on explorer <ExternalLink className="w-2.5 h-2.5" />
            </a>
          </div>
        </div>
      )}

      {result?.error && (
        <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
          <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-red-400">{result.error}</p>
        </div>
      )}
    </div>
  );
}
