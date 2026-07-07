import { describe, it, expect } from "vitest";

describe("app health", () => {
  it("has required environment", () => {
    expect(typeof window).toBe("object");
    expect(typeof document).toBe("object");
  });
});
