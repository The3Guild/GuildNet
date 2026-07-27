import { describe, it, expect } from "vitest";
import { type ReputationData, type ReputationEvent } from "../reputation";

describe("reputation types", () => {
  it("ReputationData has required fields", () => {
    const data: ReputationData = {
      tasksCompleted: 5,
      tasksFailed:    1,
      score:          7500,
      lastUpdated:    new Date().toISOString(),
    };
    expect(data.tasksCompleted).toBe(5);
    expect(data.tasksFailed).toBe(1);
    expect(data.score).toBe(7500);
    expect(typeof data.lastUpdated).toBe("string");
  });

  it("ReputationEvent has required fields", () => {
    const event: ReputationEvent = {
      agent:     "00" + "a".repeat(64),
      taskId:    "42",
      score:     8000,
      success:   true,
      timestamp: new Date().toISOString(),
    };
    expect(event.agent).toHaveLength(66);
    expect(event.taskId).toBe("42");
    expect(event.success).toBe(true);
  });
});

describe("reputation score computation (mirrors contract logic)", () => {
  function computeScore(completed: number, failed: number): number {
    const weightedTotal = completed + failed * 2;
    if (weightedTotal === 0) return 5000; // neutral
    const raw = Math.floor((completed / weightedTotal) * 10000);
    return Math.min(9900, Math.max(100, raw));
  }

  it("new agent starts at neutral 5000", () => {
    expect(computeScore(0, 0)).toBe(5000);
  });

  it("completions raise score", () => {
    expect(computeScore(3, 0)).toBe(9900); // ceiling
    expect(computeScore(1, 0)).toBe(9900);
  });

  it("failures lower score (weighted 2x)", () => {
    const score = computeScore(1, 1);
    // 1 / (1 + 1*2) * 10000 = 3333
    expect(score).toBe(3333);
  });

  it("many failures hit the floor", () => {
    expect(computeScore(0, 10)).toBe(100); // floor
  });

  it("score is clamped to [100, 9900]", () => {
    expect(computeScore(100, 0)).toBe(9900);
    expect(computeScore(0, 100)).toBe(100);
  });

  it("mixed results produce proportional score", () => {
    // 5 completed, 2 failed → 5 / (5 + 4) * 10000 = 5555
    const score = computeScore(5, 2);
    expect(score).toBe(5555);
  });
});
