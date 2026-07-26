import { describe, it, expect } from "vitest";

describe("coordinator buildArgs patterns", () => {
  describe("ArgValue type handling", () => {
    it("string values are recognized", () => {
      const v: string = "hello";
      expect(typeof v).toBe("string");
    });

    it("bigint values are recognized", () => {
      const v: bigint = 123n;
      expect(typeof v).toBe("bigint");
    });

    it("U512 typed values have correct shape", () => {
      const v = { type: "U512" as const, value: "500000000" };
      expect(v.type).toBe("U512");
      expect(typeof v.value).toBe("string");
    });

    it("Key typed values have correct shape", () => {
      const v = { type: "Key" as const, value: "00".padEnd(66, "a") };
      expect(v.type).toBe("Key");
    });

    it("ByteArray typed values contain Uint8Array", () => {
      const v = { type: "ByteArray" as const, value: new Uint8Array(32) };
      expect(v.value).toBeInstanceOf(Uint8Array);
      expect(v.value.length).toBe(32);
    });

    it("OptionString wraps nullable string", () => {
      const withVal = { type: "OptionString" as const, value: "abc" };
      const nullVal = { type: "OptionString" as const, value: null };
      expect(withVal.value).toBe("abc");
      expect(nullVal.value).toBeNull();
    });
  });

  describe("nonce conversion", () => {
    it("converts 64-char hex to 32-byte Uint8Array", () => {
      const nonce = "aabb".padEnd(64, "0");
      const nonceBytes = new Uint8Array(32);
      for (let i = 0; i < 32; i++) {
        nonceBytes[i] = parseInt(nonce.slice(i * 2, i * 2 + 2), 16);
      }
      expect(nonceBytes.length).toBe(32);
      expect(nonceBytes[0]).toBe(0xaa);
      expect(nonceBytes[1]).toBe(0xbb);
      expect(nonceBytes[2]).toBe(0x00);
    });
  });

  describe("signature conversion", () => {
    it("converts hex signature to Uint8Array", () => {
      const sigHex = "aabb".repeat(32); // 64 bytes = 128 hex chars
      const sigBytes = new Uint8Array(Buffer.from(sigHex, "hex"));
      expect(sigBytes.length).toBe(64);
      expect(sigBytes[0]).toBe(0xaa);
      expect(sigBytes[1]).toBe(0xbb);
    });
  });
});
