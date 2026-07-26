import { describe, it, expect } from "vitest";

describe("agent reputation level thresholds", () => {
  function getRepLevel(score: number) {
    if (score >= 8000) return "Elite";
    if (score >= 6500) return "Trusted";
    if (score >= 5000) return "Neutral";
    if (score >= 3000) return "Risky";
    return "Poor";
  }

  it("returns Elite for score >= 8000", () => {
    expect(getRepLevel(8000)).toBe("Elite");
    expect(getRepLevel(9900)).toBe("Elite");
    expect(getRepLevel(10000)).toBe("Elite");
  });

  it("returns Trusted for score 6500-7999", () => {
    expect(getRepLevel(6500)).toBe("Trusted");
    expect(getRepLevel(7999)).toBe("Trusted");
  });

  it("returns Neutral for score 5000-6499", () => {
    expect(getRepLevel(5000)).toBe("Neutral");
    expect(getRepLevel(6499)).toBe("Neutral");
  });

  it("returns Risky for score 3000-4999", () => {
    expect(getRepLevel(3000)).toBe("Risky");
    expect(getRepLevel(4999)).toBe("Risky");
  });

  it("returns Poor for score < 3000", () => {
    expect(getRepLevel(0)).toBe("Poor");
    expect(getRepLevel(2999)).toBe("Poor");
  });
});

describe("reputation score to star rating", () => {
  function toStars(reputationScore: number | null): number | null {
    return reputationScore != null ? Math.min(5.0, reputationScore / 2000) : null;
  }

  it("maps score 0 to 0.0 stars", () => {
    expect(toStars(0)).toBe(0);
  });

  it("maps score 5000 to 2.5 stars", () => {
    expect(toStars(5000)).toBe(2.5);
  });

  it("maps score 10000 to 5.0 stars", () => {
    expect(toStars(10000)).toBe(5.0);
  });

  it("caps at 5.0 for scores above 10000", () => {
    expect(toStars(12000)).toBe(5.0);
  });

  it("returns null for null input", () => {
    expect(toStars(null)).toBeNull();
  });
});

describe("price conversion (motes to CSPR)", () => {
  it("converts 500000000 motes to 0.5 CSPR", () => {
    expect(Number("500000000") / 1e9).toBe(0.5);
  });

  it("converts 2500000000 motes to 2.5 CSPR", () => {
    expect(Number("2500000000") / 1e9).toBe(2.5);
  });
});
