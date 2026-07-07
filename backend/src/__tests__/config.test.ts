import { describe, it, expect, beforeEach, vi } from "vitest";

describe("config defaults", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("uses default port 3000 when PORT is not set", async () => {
    process.env = { CSPR_CLOUD_AUTH_TOKEN: "test-token", VENICE_API_KEY: "test-key", AGENT_REGISTRY_HASH: "hash-a", AGENT_REPUTATION_HASH: "hash-b", TASK_COORDINATOR_HASH: "hash-c" };
    delete process.env.PORT;
    const { config } = await import("../config");
    expect(config.port).toBe(3000);
  });

  it("uses custom port when PORT is set", async () => {
    process.env = { PORT: "4000", CSPR_CLOUD_AUTH_TOKEN: "test-token", VENICE_API_KEY: "test-key", AGENT_REGISTRY_HASH: "hash-a", AGENT_REPUTATION_HASH: "hash-b", TASK_COORDINATOR_HASH: "hash-c" };
    const { config } = await import("../config");
    expect(config.port).toBe(4000);
  });

  it("falls back to default Casper RPC", async () => {
    process.env = { CSPR_CLOUD_AUTH_TOKEN: "test-token", VENICE_API_KEY: "test-key", AGENT_REGISTRY_HASH: "hash-a", AGENT_REPUTATION_HASH: "hash-b", TASK_COORDINATOR_HASH: "hash-c" };
    delete process.env.CASPER_NODE_RPC;
    const { config } = await import("../config");
    expect(config.casperNodeRpc).toBe("https://node.testnet.casper.network/rpc");
  });

  it("throws when required env vars are missing", async () => {
    process.env = {};
    await expect(async () => {
      await import("../config");
    }).rejects.toThrow();
  });
});
