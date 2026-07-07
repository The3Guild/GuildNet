import "dotenv/config";

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing env var: ${key}`);
  return val;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const config = {
  // ── Casper node ──────────────────────────────────────────────────────────────
  casperNodeRpc:    optional("CASPER_NODE_RPC",    "https://node.testnet.casper.network/rpc"),
  casperChainName:  optional("CASPER_CHAIN_NAME",  "casper-test"),

  // ── Coordinator signing key ──────────────────────────────────────────────────
  coordinatorKeyPath: optional("COORDINATOR_SECRET_KEY_PATH", "./keys/secret_key.pem"),
  coordinatorKeyAlgo: optional("COORDINATOR_KEY_ALGO",        "ed25519") as "ed25519" | "secp256k1",

  // ── Deployed Casper contract hashes ─────────────────────────────────────────
  contracts: {
    agentRegistry:   required("AGENT_REGISTRY_HASH"),
    agentReputation: required("AGENT_REPUTATION_HASH"),
    taskCoordinator: required("TASK_COORDINATOR_HASH"),
  },

  // ── CSPR.cloud ───────────────────────────────────────────────────────────────
  csprCloudAuthToken:  required("CSPR_CLOUD_AUTH_TOKEN"),
  csprCloudBaseUrl:    optional("CSPR_CLOUD_BASE_URL",   "https://api.cspr.cloud"),
  x402FacilitatorUrl:  optional("X402_FACILITATOR_URL",  "https://x402-facilitator.cspr.cloud"),

  // ── x402 payment settings ────────────────────────────────────────────────────
  x402: {
    // CEP-18 Wrapped CSPR package hash on testnet (from casper-x402 official .env.testnet)
    assetPackage:    optional("X402_ASSET_PACKAGE",   "3d80df21ba4ee4d66a2a1f60c32570dd5685e4b279f6538162a5fd1314847c1e"),
    tokenName:       optional("X402_TOKEN_NAME",      "Wrapped CSPR"),
    tokenVersion:    optional("X402_TOKEN_VERSION",   "1"),
    tokenDecimals:   Number(optional("X402_TOKEN_DECIMALS", "9")),
    network:         optional("X402_NETWORK",         "casper:casper-test"),
    timeoutSeconds:  Number(optional("X402_TIMEOUT_SECONDS", "300")),
  },

  // ── Task creation ─────────────────────────────────────────────────────────────
  taskBudgetMotes: BigInt(optional("TASK_BUDGET_MOTES", "2500000000")),

  // ── Venice AI ────────────────────────────────────────────────────────────────
  veniceApiKey:  required("VENICE_API_KEY"),
  veniceBaseUrl: optional("VENICE_BASE_URL", "https://api.venice.ai/api/v1"),

  // ── Server ───────────────────────────────────────────────────────────────────
  port: Number(optional("PORT", "3000")),
} as const;
