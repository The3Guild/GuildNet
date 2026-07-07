import { describe, it, expect } from "vitest";
import { buildEIP712Digest, type ExactCasperAuthorization } from "../x402";

describe("buildEIP712Digest", () => {
  const auth: ExactCasperAuthorization = {
    from:        "00" + "a".repeat(64),
    to:          "00" + "b".repeat(64),
    value:       "1000000000",
    validAfter:  "1700000000",
    validBefore: "1700000300",
    nonce:       "c".repeat(64),
  };

  it("returns a 32-byte buffer", () => {
    const digest = buildEIP712Digest(auth, "Wrapped CSPR", "1", "casper:casper-test", "3d80df21ba4ee4d66a2a1f60c32570dd5685e4b279f6538162a5fd1314847c1e");
    expect(digest).toBeInstanceOf(Buffer);
    expect(digest.length).toBe(32);
  });

  it("is deterministic for same inputs", () => {
    const a = buildEIP712Digest(auth, "Wrapped CSPR", "1", "casper:casper-test", "3d80df21ba4ee4d66a2a1f60c32570dd5685e4b279f6538162a5fd1314847c1e");
    const b = buildEIP712Digest(auth, "Wrapped CSPR", "1", "casper:casper-test", "3d80df21ba4ee4d66a2a1f60c32570dd5685e4b279f6538162a5fd1314847c1e");
    expect(a.equals(b)).toBe(true);
  });

  it("changes when nonce changes", () => {
    const a = buildEIP712Digest(auth, "Wrapped CSPR", "1");
    const b = buildEIP712Digest({ ...auth, nonce: "d".repeat(64) }, "Wrapped CSPR", "1");
    expect(a.equals(b)).toBe(false);
  });

  it("changes when amount changes", () => {
    const a = buildEIP712Digest(auth, "Wrapped CSPR", "1");
    const b = buildEIP712Digest({ ...auth, value: "2000000000" }, "Wrapped CSPR", "1");
    expect(a.equals(b)).toBe(false);
  });
});
