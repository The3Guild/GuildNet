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
    return resp.data;
  }
}

/**
 * Retry a Casper RPC operation with exponential backoff.
 * @param fn      The async operation to retry
 * @param label   Human-readable label for log messages
 * @param maxAttempts  Maximum number of attempts (default: 3)
 * @param baseDelayMs  Base delay in ms (default: 2000, doubles each attempt)
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxAttempts = 3,
  baseDelayMs = 2000,
): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxAttempts) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        console.warn(`[Retry] ${label} failed (attempt ${attempt}/${maxAttempts}): ${lastError.message}. Retrying in ${delay}ms…`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw new Error(`[Retry] ${label} failed after ${maxAttempts} attempts: ${lastError?.message}`);
}
