/**
 * settlements.ts — x402 settlement persistence
 *
 * Persists x402 settlement records to data/settlements.json.
 * Each record captures a successful payment for history tracking.
 */

import fs from "fs";
import path from "path";

// ── Types ────────────────────────────────────────────────────────────────────

export interface SettlementRecord {
  hash:        string;  // Casper deploy hash
  from:        string;  // payer account hash
  to:          string;  // payee account hash
  amount:      string;  // token amount in base units
  capability:  string;  // agent capability (e.g. "research")
  taskId:      string;  // task ID string
  timestamp:   string;  // ISO timestamp
}

// ── Persistence ──────────────────────────────────────────────────────────────

const STORE_PATH = path.resolve(__dirname, "..", "data", "settlements.json");

let settlements: SettlementRecord[] | null = null;

function load(): SettlementRecord[] {
  if (settlements) return settlements;
  try {
    const dir = path.dirname(STORE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(STORE_PATH)) {
      settlements = JSON.parse(fs.readFileSync(STORE_PATH, "utf-8"));
      if (!Array.isArray(settlements)) settlements = [];
    } else {
      settlements = [];
    }
  } catch {
    settlements = [];
  }
  return settlements;
}

function save(): void {
  try {
    const dir = path.dirname(STORE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(STORE_PATH, JSON.stringify(settlements ?? [], null, 2));
  } catch (e) {
    console.warn(`[Settlements] Failed to persist: ${e}`);
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Record a successful x402 settlement.
 */
export function addSettlement(record: Omit<SettlementRecord, "timestamp"> & { timestamp?: string }): void {
  const entry: SettlementRecord = {
    ...record,
    timestamp: record.timestamp ?? new Date().toISOString(),
  };
  load();
  settlements!.push(entry);
  save();
  console.log(`[Settlements] Recorded ${entry.hash.slice(0, 12)}… → ${entry.to.slice(0, 12)}… (${entry.amount} motes)`);
}

/**
 * Return all settlement records.
 */
export function getSettlements(): SettlementRecord[] {
  return load();
}

/**
 * Return settlement records filtered by recipient account hash.
 */
export function getSettlementsByAgent(accountHash: string): SettlementRecord[] {
  return load().filter(s => s.to === accountHash);
}
