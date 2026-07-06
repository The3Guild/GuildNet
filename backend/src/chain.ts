/**
 * chain.ts — Casper Network client
 *
 * Replaces the previous viem/Base Sepolia setup.
 * All on-chain reads and writes go through casper-js-sdk
 * pointed at the Casper Testnet via CSPR.cloud.
 */

import { config } from "./config";

// ── Lazily-initialised Casper RPC client ──────────────────────────────────────
// We use a lazy getter so the SDK is only loaded when needed (avoids
// startup errors if optional env vars are missing).

let _rpcClient: unknown = null;

export async function getRpcClient(): Promise<{
  queryGlobalStateByBlockHash(args: unknown): Promise<unknown>;
  putTransaction(tx: unknown): Promise<{ transactionHash: { toHex(): string } }>;
  getTransactionByTransactionHash(hash: string): Promise<unknown>;
}> {
  if (_rpcClient) return _rpcClient as ReturnType<typeof getRpcClient> extends Promise<infer T> ? T : never;

  const casper = await import("casper-js-sdk");
  const { RpcClient, HttpHandler } = casper.default ?? casper;
  _rpcClient = new RpcClient(new HttpHandler(config.casperNodeRpc));
  return _rpcClient as ReturnType<typeof getRpcClient> extends Promise<infer T> ? T : never;
}

// ── Load coordinator private key ──────────────────────────────────────────────

export async function getCoordinatorKey() {
  const casper = await import("casper-js-sdk");
  const { KeyAlgorithm, PrivateKey } = casper.default ?? casper;
  const fs = await import("fs/promises");

  const pemContent = await fs.readFile(config.coordinatorKeyPath, "utf-8");
  const algo = config.coordinatorKeyAlgo === "secp256k1"
    ? KeyAlgorithm.SECP256K1
    : KeyAlgorithm.ED25519;

  return PrivateKey.fromPem(pemContent, algo);
}

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

export async function csproCloudPost(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${config.csprCloudBaseUrl}${path}`, {
    method:  "POST",
    headers: {
      "Authorization": config.csprCloudAuthToken,
      "Content-Type":  "application/json",
      "Accept":        "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`CSPR.cloud POST ${path} → HTTP ${res.status}`);
  return res.json();
}
