import { describe, it, expect } from "vitest";
import { getSettlements, addSettlement, getSettlementsByAgent } from "../settlements";

describe("settlements", () => {
  it("getSettlements returns an array", () => {
    const result = getSettlements();
    expect(Array.isArray(result)).toBe(true);
  });

  it("addSettlement persists a record with all fields", () => {
    const before = getSettlements().length;
    addSettlement({
      hash:       "abc123".padEnd(64, "0"),
      from:       "00" + "a".repeat(64),
      to:         "00" + "b".repeat(64),
      amount:     "500000000",
      capability: "research",
      taskId:     "test-1",
    });
    const after = getSettlements();
    expect(after.length).toBe(before + 1);
    const last = after[after.length - 1];
    expect(last.hash).toBe("abc123".padEnd(64, "0"));
    expect(last.from).toBe("00" + "a".repeat(64));
    expect(last.to).toBe("00" + "b".repeat(64));
    expect(last.amount).toBe("500000000");
    expect(last.capability).toBe("research");
    expect(last.taskId).toBe("test-1");
    expect(last.timestamp).toBeDefined();
  });

  it("getSettlementsByAgent filters by recipient", () => {
    const target = "00" + "c".repeat(64);
    addSettlement({
      hash:       "def456".padEnd(64, "0"),
      from:       "00" + "a".repeat(64),
      to:         target,
      amount:     "100000000",
      capability: "coding",
      taskId:     "test-2",
    });
    const filtered = getSettlementsByAgent(target);
    expect(filtered.length).toBeGreaterThanOrEqual(1);
    expect(filtered.every(s => s.to === target)).toBe(true);
  });

  it("getSettlementsByAgent returns empty for unknown hash", () => {
    const result = getSettlementsByAgent("00" + "z".repeat(64));
    expect(result.length).toBe(0);
  });
});
