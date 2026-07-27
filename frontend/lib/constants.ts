export const CONTRACTS = {
  AGENT_REGISTRY:    process.env.NEXT_PUBLIC_AGENT_REGISTRY    ?? "hash-cf8607a9d307178f0e6dd720008c739f80d672f4c692b5e09e9d65158096d13c",
  AGENT_REPUTATION:  process.env.NEXT_PUBLIC_AGENT_REPUTATION  ?? "hash-7bc4116e7689d173b4da2a11ac0504c4657c95db27c03fc74aed3339b2f5ff37",
  TASK_COORDINATOR:  process.env.NEXT_PUBLIC_TASK_COORDINATOR  ?? "hash-bc9399e8f9555d9c7da371edefef3e958e882e914f38dc7f5ce146b197167b53",
};

export const CHAIN_ID = "casper-test";

export const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3000";

export const CAPABILITIES = ["research", "risk", "coding", "design", "audit", "report"] as const;
export type Capability = typeof CAPABILITIES[number];

export const CSPR_CLICK_URL = "https://wallet.cspr.click/";
export const CASPER_EXPLORER = "https://testnet.cspr.live";
