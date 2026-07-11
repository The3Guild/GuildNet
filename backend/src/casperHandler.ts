import axios, { AxiosInstance } from "axios";

const SDK = require("casper-js-sdk");
const { TypedJSON } = require("typedjson");

/**
 * Standalone RPC handler using standard axios (not fetch adapter).
 * Implements the same interface as HttpHandler for RpcClient.
 */
export class AxiosHandler {
  private endpoint: string;
  private client: AxiosInstance;

  constructor(url: string) {
    this.endpoint = url;
    this.client = axios.create({
      timeout: 60_000,
      headers: { "Content-Type": "application/json" },
    });
  }

  async processCall(payload: object): Promise<any> {
    const ser = new TypedJSON(SDK.RpcRequest);
    let jsonStr: string;
    try {
      jsonStr = ser.stringify(payload);
    } catch (e: any) {
      throw new Error(`Failed to serialize RPC request: ${e.message}`);
    }

    const resp = await this.client.post(this.endpoint, jsonStr);
    const data = resp.data;

    // Return the full response — RpcClient expects { result, error, ... }
    return data;
  }
}

/**
 * Check if an error is the "no such addressable entity" error
 * that the v2 testnet node returns for all contract calls.
 */
export function isNoSuchEntityError(err: any): boolean {
  const msg = err?.sourceErr?.data ?? err?.data ?? err?.message ?? "";
  return (
    typeof msg === "string" &&
    msg.includes("no such addressable entity")
  );
}

/**
 * Generate a simulated deploy hash for when on-chain calls fail.
 */
export function simulatedHash(prefix = "sim"): string {
  const crypto = require("crypto");
  return prefix + crypto.randomBytes(28).toString("hex");
}
