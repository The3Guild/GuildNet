/**
 * x402.ts — Casper x402 payment client
 *
 * Implements the full x402 payment flow using the official
 * @make-software/casper-x402 SDK and CSPR.cloud facilitator:
 *
 *   1. Build a PaymentRequirements object for an agent payment
 *   2. Sign a TransferAuthorization via EIP-712 using the coordinator key
 *   3. POST /verify to the CSPR.cloud facilitator (off-chain check)
 *   4. POST /settle to execute the CEP-18 token transfer on Casper
 *
 * The payment flow runs entirely without the payer needing to hold CSPR
 * for gas — the facilitator pays gas (motes) on their behalf.
 *
 * References:
 *   https://docs.cspr.cloud/x402-facilitator-api/reference
 *   https://github.com/make-software/casper-x402
 */

import crypto from "crypto";
import { config } from "./config";

// ── Types mirroring @make-software/casper-x402 exact scheme ──────────────────

export interface ExactCasperAuthorization {
  from:         string;   // payer account-hash  "00<64 hex>"
  to:           string;   // payee account-hash  "00<64 hex>"
  value:        string;   // token amount in base units (decimal string)
  validAfter:   string;   // unix seconds (string)
  validBefore:  string;   // unix seconds (string)
  nonce:        string;   // 32-byte random hex (64 chars)
}

export interface ExactCasperPayload {
  signature:     string;  // 65-byte EIP-712 sig hex (130 chars)
  publicKey:     string;  // full Casper pubkey hex with algo prefix
  authorization: ExactCasperAuthorization;
}

export interface PaymentPayload {
  x402Version: number;
  resource:    { url: string };
  accepted: {
    scheme:            string;
    network:           string;
    asset:             string;
    amount:            string;
    payTo:             string;
    maxTimeoutSeconds: number;
  };
  payload: ExactCasperPayload;
}

export interface PaymentRequirements {
  scheme:            string;
  network:           string;
  payTo:             string;
  amount:            string;
  asset:             string;
  maxTimeoutSeconds: number;
  extra: {
    name:     string;
    version:  string;
    decimals: string;
    symbol:   string;
  };
}

export interface SettleResult {
  success:      boolean;
  transaction:  string;   // Casper deploy hash (64 hex chars)
  network:      string;
  payer:        string;
  errorReason?: string;
  errorMessage?: string;
}

// ── EIP-712 typed-data hashing (Casper flavour) ───────────────────────────────
//
// Casper x402 uses EIP-712 structured-data signing:
//   domain  = { name, version }
//   message = TransferAuthorization { from, to, value, validAfter, validBefore, nonce }
//
// All values are ABI-encoded as 32-byte chunks and hashed with keccak256.
// We use Node's built-in crypto for SHA-3/keccak because the casper-js-sdk
// signs raw digests directly.

function keccak256(data: Buffer): Buffer {
  // Node's crypto does not expose keccak256 directly — use the noble library
  // bundled transitively by casper-js-sdk, or implement using hash.js.
  // We use the standardised approach: import from @noble/hashes which is
  // already present as a transitive dep of casper-js-sdk.
  const { keccak_256 } = require("@noble/hashes/sha3");
  return Buffer.from(keccak_256(data));
}

function encodeBytes32(value: string): Buffer {
  // Left-pad hex string to 32 bytes
  const hex = value.startsWith("0x") ? value.slice(2) : value;
  return Buffer.from(hex.padStart(64, "0"), "hex");
}

function encodeUint256(value: string): Buffer {
  const n = BigInt(value);
  const hex = n.toString(16).padStart(64, "0");
  return Buffer.from(hex, "hex");
}

function encodeAddress(value: string): Buffer {
  // Casper account hash: "00<64 hex>" — strip the "00" prefix for encoding
  const hex = value.startsWith("00") ? value.slice(2) : value;
  return Buffer.from(hex.padStart(64, "0"), "hex");
}

/**
 * Compute the EIP-712 typed-data hash for a Casper x402 TransferWithAuthorization.
 *
 * Uses the Casper-specific domain format (name, version, chain_name, contract_package_hash)
 * matching the @make-software/casper-x402 package and CSPR.cloud facilitator.
 */
export function buildEIP712Digest(
  auth:             ExactCasperAuthorization,
  tokenName:        string,
  tokenVersion:     string,
  network?:         string,
  assetPackage?:    string,
): Buffer {
  // ── Domain type: Casper EIP-712 (name, version, chain_name, contract_package_hash) ──
  const DOMAIN_TYPE_HASH = keccak256(
    Buffer.from(
      "EIP712Domain(string name,string version,string chain_name,bytes32 contract_package_hash)"
    )
  );

  // Normalise asset hex: strip "0x" prefix and pad to 32 bytes (64 hex chars)
  const assetHex = (assetPackage ?? "").replace(/^0x/, "").padStart(64, "0");

  const domainSeparator = keccak256(
    Buffer.concat([
      DOMAIN_TYPE_HASH,
      keccak256(Buffer.from(tokenName)),
      keccak256(Buffer.from(tokenVersion)),
      keccak256(Buffer.from(network ?? "")),
      Buffer.from(assetHex, "hex"),
    ])
  );

  // ── Message type: TransferWithAuthorization (matching casper-x402) ────────────
  const TYPE_HASH = keccak256(
    Buffer.from(
      "TransferWithAuthorization(address from,address to,uint256 value," +
      "uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    )
  );

  const messageHash = keccak256(
    Buffer.concat([
      TYPE_HASH,
      encodeAddress(auth.from),
      encodeAddress(auth.to),
      encodeUint256(auth.value),
      encodeUint256(auth.validAfter),
      encodeUint256(auth.validBefore),
      encodeBytes32(auth.nonce),
    ])
  );

  // ── Final EIP-712 digest ──────────────────────────────────────────────────────
  return keccak256(
    Buffer.concat([
      Buffer.from("1901", "hex"),   // EIP-712 prefix
      domainSeparator,
      messageHash,
    ])
  );
}

// ── Facilitator HTTP calls ────────────────────────────────────────────────────

async function facilitatorPost(endpoint: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${config.x402FacilitatorUrl}${endpoint}`, {
    method:  "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": config.csprCloudAuthToken,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`x402 facilitator ${endpoint} returned HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

// ── Main exported function ────────────────────────────────────────────────────

/**
 * Execute a real Casper x402 payment from the coordinator account to an agent.
 *
 * Steps:
 *   1. Load coordinator private key via casper-js-sdk
 *   2. Build a TransferAuthorization (EIP-712 typed data)
 *   3. Sign the EIP-712 digest with the coordinator's key
 *   4. POST /verify — validate signature off-chain (no gas)
 *   5. POST /settle — submit CEP-18 transfer on Casper Testnet
 *   6. Return the Casper deploy hash as proof of payment
 *
 * @param payeeAccountHash  Casper account-hash of the agent being paid ("00<64hex>")
 * @param amountBaseUnits   Payment amount in token base units (e.g. "1000000000" = 1 WCSPR)
 * @param resourceUrl       URL label for the payment (e.g. the agent's endpoint)
 * @returns deploy hash of the settled transaction
 */
export async function settleX402Payment(
  payeeAccountHash: string,
  amountBaseUnits: string,
  resourceUrl: string,
): Promise<string> {
  const casper = await import("casper-js-sdk");
  const { KeyAlgorithm, PrivateKey } = casper.default ?? casper;

  // Load coordinator key
  const fs = await import("fs/promises");
  const pemContent = await fs.readFile(config.coordinatorKeyPath, "utf-8");
  const algo = config.coordinatorKeyAlgo === "secp256k1"
    ? KeyAlgorithm.SECP256K1
    : KeyAlgorithm.ED25519;
  const privateKey = PrivateKey.fromPem(pemContent, algo);

  // Derive payer account hash ("00" + hex)
  const payerAccountHash = "00" + privateKey.publicKey.accountHash().toHex();
  const payerPublicKey   = privateKey.publicKey.toHex();

  // Build authorization
  const now          = Math.floor(Date.now() / 1000);
  const validAfter   = String(now - 60);
  const validBefore  = String(now + config.x402.timeoutSeconds);
  const nonce        = crypto.randomBytes(32).toString("hex");

  const authorization: ExactCasperAuthorization = {
    from:        payerAccountHash,
    to:          payeeAccountHash,
    value:       amountBaseUnits,
    validAfter,
    validBefore,
    nonce,
  };

  // Sign EIP-712 digest (Casper domain with chain_name + contract_package_hash)
  const digest    = buildEIP712Digest(authorization, config.x402.tokenName, config.x402.tokenVersion, config.x402.network, config.x402.assetPackage);
  const signature = await privateKey.signAndAddAlgorithmBytes(digest);
  const sigHex    = Buffer.from(signature).toString("hex");

  const payload: ExactCasperPayload = {
    signature:     sigHex,
    publicKey:     payerPublicKey,
    authorization,
  };

  const paymentRequirements: PaymentRequirements = {
    scheme:            "exact",
    network:           config.x402.network,
    payTo:             payeeAccountHash,
    amount:            amountBaseUnits,
    asset:             config.x402.assetPackage,
    maxTimeoutSeconds: config.x402.timeoutSeconds,
    extra: {
      name:     config.x402.tokenName,
      version:  config.x402.tokenVersion,
      decimals: String(config.x402.tokenDecimals),
      symbol:   "CSPR",
    },
  };

  const paymentPayload: PaymentPayload = {
    x402Version: 2,
    resource:    { url: resourceUrl },
    accepted: {
      scheme:            "exact",
      network:           config.x402.network,
      asset:             config.x402.assetPackage,
      amount:            amountBaseUnits,
      payTo:             payeeAccountHash,
      maxTimeoutSeconds: config.x402.timeoutSeconds,
    },
    payload,
  };

  // Step 4: Verify off-chain
  console.log(`[x402] Verifying payment: ${amountBaseUnits} → ${payeeAccountHash.slice(0, 12)}…`);
  const verifyResult = await facilitatorPost("/verify", {
    paymentPayload,
    paymentRequirements,
  }) as { isValid: boolean; invalidReason?: string; invalidMessage?: string };

  if (!verifyResult.isValid) {
    throw new Error(
      `[x402] Facilitator /verify rejected: ${verifyResult.invalidReason} — ${verifyResult.invalidMessage}`
    );
  }
  console.log(`[x402] Verification passed`);

  // Step 5: Settle on-chain
  console.log(`[x402] Settling on Casper Testnet…`);
  const settleResult = await facilitatorPost("/settle", {
    paymentPayload,
    paymentRequirements,
  }) as SettleResult;

  if (!settleResult.success) {
    throw new Error(
      `[x402] Settlement failed: ${settleResult.errorReason} — ${settleResult.errorMessage}`
    );
  }

  console.log(`[x402] ✓ Settled. Deploy hash: ${settleResult.transaction}`);
  console.log(`[x402] Explorer: https://testnet.cspr.live/deploy/${settleResult.transaction}`);

  return settleResult.transaction;
}
