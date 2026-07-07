/**
 * chain.ts — Casper Network client
 *
 * Replaces the previous viem/Base Sepolia setup.
 * All on-chain reads and writes go through casper-js-sdk
 * pointed at the Casper Testnet via CSPR.cloud.
 */

import { config } from "./config";

// ── CSPR.cloud REST helper ────────────────────────────────────────────────────

export async function csproCloudGet(path: string): Promise<unknown> {
  const res = await fetch(`${config.csprCloudBaseUrl}${path}`, {
    headers: {
      "Authorization": config.csprCloudAuthToken,
      "Accept":        "application/json",
    },
  });
  if (!res.ok) throw new Error(`CSPR.cloud GET ${path} → HTTP ${res.status}`);
  return res.json();
}


