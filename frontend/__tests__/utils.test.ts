import { describe, it, expect } from "vitest";
import { cn, shortenAddress } from "../lib/utils";

describe("cn (className utility)", () => {
  it("merges class names", () => {
    expect(cn("px-4", "py-2")).toBe("px-4 py-2");
  });

  it("handles conditional classes", () => {
    const result = cn("base", false && "hidden", "visible");
    expect(result).toBe("base visible");
  });

  it("handles empty inputs", () => {
    expect(cn()).toBe("");
  });
});

describe("shortenAddress", () => {
  it("shortens long addresses", () => {
    expect(shortenAddress("00abc123def456789")).toBe("00abc1...6789");
  });

  it("returns short addresses unchanged", () => {
    expect(shortenAddress("abc")).toBe("abc");
  });
});
