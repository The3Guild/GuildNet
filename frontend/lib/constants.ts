export const CONTRACTS = {
  AGENT_REGISTRY:    process.env.NEXT_PUBLIC_AGENT_REGISTRY    ?? "hash-d99fca67a1671de057392109594fab2bb2f412643f7f6aa22ca0f297c60c00c3",
  AGENT_REPUTATION:  process.env.NEXT_PUBLIC_AGENT_REPUTATION  ?? "hash-87cb7a6c8e3a7a8fcc7aa1d4c0f8024859d54d300344ae8d53039b7f8ab11c69",
  TASK_COORDINATOR:  process.env.NEXT_PUBLIC_TASK_COORDINATOR  ?? "hash-2216cbbc233837a526e1b3b47ec1e1535258151ef779a1bd8476266898105ac1",
};

export const CHAIN_ID = "casper-test";

export const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3001";

export const CAPABILITIES = ["research", "risk", "coding", "design", "audit", "report"] as const;
export type Capability = typeof CAPABILITIES[number];

export const CSPR_CLICK_URL = "https://wallet.cspr.click/";
export const CASPER_EXPLORER = "https://testnet.cspr.live";
