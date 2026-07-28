/**
 * coordinator.ts — GuildNet orchestration loop (Casper)
 *
 * All on-chain interactions target the deployed Casper Testnet contracts.
 * Agent payments use the real Casper x402 Facilitator via CSPR.cloud.
 *
 * Flow per task:
 *   1. create_task    — escrow CSPR budget on-chain
 *   2. discover agents — query AgentRegistry (on-chain + local cache)
 *   3. hire_agent     — call TaskCoordinator on Casper
 *   4. x402 settle    — POST /verify + /settle to CSPR.cloud facilitator
 *   5. complete_task  — store result hash, refund unspent, trigger reputation
 */

import crypto from "crypto";
import { config } from "./config";
import { csproCloudGet } from "./chain";
import { signAuthorization, loadCoordinatorKey, type ExactCasperAuthorization } from "./x402";
import { settleX402Payment } from "./x402";
import { veniceChat } from "./agents/venice";
import { withRetry } from "./casperHandler";
import { addSettlement } from "./settlements";
import {
  getAllAgents,
  getAgentsByCapability,
  type AgentRecord,
} from "./agentStore";

// ── Lazy SDK import ───────────────────────────────────────────────────────────

let _sdk: any = null;

async function getSdk() {
  if (!_sdk) {
    const casperSdk = await import("casper-js-sdk");
    _sdk = casperSdk.default ?? casperSdk;
  }
  return _sdk;
}

// ── Re-export loadCoordinatorKey from x402.ts (single source of truth) ──────

export { loadCoordinatorKey } from "./x402";

// ── Query a named key from the TaskCoordinator contract ─────────────────────

export async function queryContractVar(varName: string): Promise<bigint | undefined> {
  const contractHash = config.contracts.taskCoordinator.replace("hash-", "");

  // Attempt 1 — direct Casper RPC via queryLatestGlobalState
  try {
    const sdk = await getSdk();
    const { RpcClient } = sdk;
    const { AxiosHandler } = await import("./casperHandler");
    const rpc = new RpcClient(new AxiosHandler(config.casperNodeRpc));
    const result = await rpc.queryLatestGlobalState(
      `hash-${contractHash}`,
      [varName],
    );
    const clv = result.storedValue?.clValue;
    if (clv?.ui64) {
      return BigInt(clv.ui64.toString());
    }
  } catch (err) {
    console.warn(`[Coordinator] RPC queryContractVar failed: ${err}`);
  }

  // Attempt 2 — CSPR.cloud named-keys API (reliable fallback)
  try {
    const data = await csproCloudGet(
      `/contracts/${contractHash}/named-keys`
    ) as { data?: Array<{ name: string; value: string }> };
    for (const entry of (data.data ?? [])) {
      if (entry.name === varName) {
        const parsed = JSON.parse(entry.value ?? "{}");
        const raw = parsed.parsed ?? parsed.parse ?? parsed.value;
        if (raw !== undefined) {
          return BigInt(String(raw));
        }
      }
    }
  } catch (err) {
    console.warn(`[Coordinator] CSPR.cloud queryContractVar failed: ${err}`);
  }

  return undefined;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TaskResult {
  taskId:              string;
  research?:           string;
  riskAnalysis?:       string;
  coding?:             string;
  design?:             string;
  audit?:              string;
  report:              string;
  agentsHired:         string[];
  txHashes:            string[];
  casperExplorerLinks: string[];
  onChain:             boolean;
}

// ── Agent discovery (on-chain primary, local cache fallback) ─────────────────

export async function findAllAgents(): Promise<AgentRecord[]> {
  return getAllAgents();
}

async function findAgents(capability: string): Promise<AgentRecord[]> {
  const all = getAgentsByCapability(capability);

  // Prefer external (on-chain registered) agents over coordinator fallback agents.
  // External agents are real actors who registered via CSPR.click.
  // Coordinator agents (demo=true) are a fallback for when no external agents exist.
  const external = all.filter(a => a.source === "on-chain");
  if (external.length > 0) {
    console.log(`[Coordinator] ${capability}: ${external.length} external agent(s) available`);
    return external;
  }

  return all;
}

// ── Build runtime args helper ─────────────────────────────────────────────────

type ArgValue =
  | string
  | bigint
  | boolean
  | { type: "U512"; value: string }
  | { type: "Key"; value: string }
  | { type: "ByteArray"; value: Uint8Array }
  | { type: "Bytes"; value: Uint8Array }
  | { type: "PublicKey"; value: any }
  | { type: "OptionString"; value: string | null };

/**
 * Build a CL ByteArray arg with an explicit type tag override.
 * Used for parameters where the contract expects CLBytes (tag 16)
 * rather than CLByteArray (tag 12). The casper-js-sdk only exposes
 * newCLByteArray, so we construct the raw bytesrepr encoding manually.
 */
function buildCLBytesArg(sdk: any, value: Uint8Array): any {
  const { CLValue } = sdk;
  // Casper CLBytes serialization: [type_tag=16] [length: u32 LE] [data...]
  const tag = 16;
  const len = value.length;
  const buf = new Uint8Array(1 + 4 + len);
  buf[0] = tag;
  new DataView(buf.buffer).setUint32(1, len, true);
  buf.set(value, 5);
  // Use the SDK's internal CLValue parser to reconstitute from raw bytes
  const { CLValueParser } = sdk;
  if (CLValueParser?.fromBytes) {
    return CLValueParser.fromBytes(buf).result;
  }
  // Fallback: use ByteArray (may fail if contract strictly checks type tag)
  return CLValue.newCLByteArray(value);
}

function buildArgs(
  sdk: any,
  namedArgs: Record<string, ArgValue>,
): any {
  const { Args, CLValue, Key, CLTypeString } = sdk;
  const args = Args.fromMap({});
  for (const [k, v] of Object.entries(namedArgs)) {
    if (typeof v === "string") {
      args.insert(k, CLValue.newCLString(v));
    } else if (typeof v === "bigint") {
      args.insert(k, CLValue.newCLUint64(v));
    } else if (typeof v === "boolean") {
      args.insert(k, CLValue.newCLValueBool(v));
    } else if (typeof v === "object" && "type" in v) {
      switch (v.type) {
        case "U512":
          args.insert(k, CLValue.newCLUInt512(v.value));
          break;
        case "Key":
          args.insert(k, CLValue.newCLKey(Key.fromAccountHash(v.value)));
          break;
        case "ByteArray":
          args.insert(k, CLValue.newCLByteArray(v.value));
          break;
        case "Bytes":
          args.insert(k, buildCLBytesArg(sdk, v.value));
          break;
        case "PublicKey":
          args.insert(k, CLValue.newCLPublicKey(v.value));
          break;
        case "OptionString":
          args.insert(
            k,
            CLValue.newCLOption(
              v.value !== null ? CLValue.newCLString(v.value) : null,
              CLTypeString,
            ),
          );
          break;
      }
    }
  }
  return args;
}

// ── VmCasperV2 runtime patch for payable entry points ─────────────────────────
//
// Casper 2.0 (Condor) places transferred_value inside
// TransactionRuntimeParams::VmCasperV2, but casper-js-sdk v5.0.12 only
// supports VmCasperV1 (no transferred_value field). This patch overrides
// the runtime's toBytes() and toJSON() to emit VmCasperV2 with the correct
// transferred_value.

function patchRuntimeForPayable(
  builder: any,
  transferredValueMotes: bigint,
): void {
  // Access the builder's internal invocation target (protected property)
  const target = builder._invocationTarget ?? builder._transactionInvocationTarget;
  if (!target?.stored?.runtime) return;

  const runtime = target.stored.runtime;
  const tv = transferredValueMotes;

  // Override toBytes to emit VmCasperV2 with transferred_value
  // VmCasperV2 variant bytes: [tag=1] [u64 LE transferred_value] [Option seed=None=0x00]
  runtime.toBytes = function () {
    const variantBytes = new Uint8Array(10);
    variantBytes[0] = 0x01; // VmCasperV2 tag
    const view = new DataView(variantBytes.buffer);
    const val = BigInt(tv);
    view.setUint32(1, Number(val & 0xFFFFFFFFn), true);
    view.setUint32(5, Number(val >> 32n), true);
    // seed = None (byte 9 = 0x00, already zeroed)

    // Wrap in CalltableSerialization format (single field)
    const result = new Uint8Array(4 + 2 + 4 + variantBytes.length);
    const rv = new DataView(result.buffer);
    rv.setUint32(0, 1, true);       // num_fields = 1
    rv.setUint16(4, 0, true);       // field_index = 0
    rv.setUint32(6, 10, true);      // field_length = 10
    result.set(variantBytes, 10);
    return result;
  };

  // Override toJSON so the JSON also reflects VmCasperV2
  runtime.toJSON = function () {
    return JSON.stringify({
      VmCasperV2: {
        transferred_value: String(tv),
        seed: null,
      },
    });
  };
}

// ── Build an unsigned deploy JSON for wallet signing ────────────────────────

export async function buildDeployJSON(
  entryPoint: string,
  namedArgs:  Record<string, ArgValue>,
  contractHash: string,
  initiatorPublicKeyHex: string,
  paymentMotes?: bigint,
  legacy?: boolean,
  transferredValue?: bigint,
): Promise<object> {
  const sdk = await getSdk();
  const { PublicKey, ContractCallBuilder } = sdk;

  const args = buildArgs(sdk, namedArgs);
  const cleanHash = contractHash.replace("hash-", "");

  const builder = new ContractCallBuilder()
    .from(PublicKey.fromHex(initiatorPublicKeyHex))
    .chainName(config.casperChainName)
    .payment(Number(paymentMotes ?? config.taskBudgetMotes), 1)
    .byPackageHash(cleanHash)
    .entryPoint(entryPoint)
    .runtimeArgs(args);

  // For payable entry points, patch the runtime to VmCasperV2 with transferred_value
  if (transferredValue && transferredValue > 0n) {
    patchRuntimeForPayable(builder, transferredValue);
  }

  // Legacy mode: build Deploy (for CSPR.click frontend signing)
  // Default: build TransactionV1 (for backend-submitted calls)
  const tx = legacy ? builder.buildFor1_5() : builder.build();

  return tx.toJSON();
}

// ── On-chain contract calls (casper-js-sdk) ────────────────────────────────────

/**
 * Verify a contract package exists on-chain via CSPR.cloud.
 * Returns the entity hash if found, or null if not found.
 */
async function verifyContractPackage(packageHash: string): Promise<string | null> {
  try {
    const data = await csproCloudGet(`/contracts/${packageHash}`) as any;
    const contractHash = data?.data?.contractHash ?? data?.contractHash;
    if (contractHash) return contractHash;
    // If we get a 404 or empty response, the package doesn't exist
    if (data?.error || data?.status === 404) return null;
  } catch {}
  return null;
}

export async function callContractEntry(
  entryPoint: string,
  namedArgs:  Record<string, ArgValue>,
  paymentMotes?: bigint,
  contractOverride?: string,
  transferredValue?: bigint,
): Promise<string> {
  const sdk = await getSdk();
  const { RpcClient, Transaction } = sdk;
  const { AxiosHandler } = await import("./casperHandler");

  const { key } = await loadCoordinatorKey();
  const rpc = new RpcClient(new AxiosHandler(config.casperNodeRpc));

  const contractHash = (contractOverride ?? config.contracts.taskCoordinator).replace("hash-", "");

  // ── Pre-flight: verify contract package exists ──
  const entityHash = await verifyContractPackage(contractHash);
  if (!entityHash) {
    console.error(`[Coordinator] ✗ Pre-flight check FAILED: no contract found at package-hash ${contractHash.slice(0, 16)}…`);
    console.error(`[Coordinator] Fix: redeploy contracts and update AGENT_REGISTRY_HASH / AGENT_REPUTATION_HASH / TASK_COORDINATOR_HASH in env.`);
    console.error(`[Coordinator] Check: https://testnet.cspr.live/package/${contractHash}`);
    // Don't throw yet — let the call attempt proceed so we get the exact RPC error
  } else if (entityHash !== contractHash) {
    console.log(`[Coordinator] Package ${contractHash.slice(0, 16)}… resolves to entity ${entityHash.slice(0, 16)}…`);
  }

  const payment = paymentMotes ?? config.taskBudgetMotes;
  const deployJSON = await buildDeployJSON(
    entryPoint, namedArgs, contractHash,
    key.publicKey.toHex(), payment, false, transferredValue,
  );

  // Log full transaction JSON for diagnostics (truncated)
  const txJson = deployJSON as any;
  const payload = txJson?.payload;
  const target = payload?.fields?.target ?? payload?.target ?? "unknown";
  const runtime = target?.Stored?.runtime ?? target?.runtime ?? "unknown";
  console.log(`[Coordinator] → ${entryPoint} | pkg: ${contractHash.slice(0, 16)}… | payment: ${payment} motes | runtime: ${typeof runtime === 'string' ? runtime : JSON.stringify(runtime).slice(0, 60)}`);
  if (transferredValue && transferredValue > 0n) {
    console.log(`[Coordinator]   transferred_value: ${transferredValue} motes (${Number(transferredValue) / 1e9} CSPR)`);
  }

  const transaction = Transaction.fromJSON(deployJSON);
  transaction.sign(key);

  let hash: string;
  try {
    const result = await withRetry(
      () => rpc.putTransaction(transaction) as Promise<{ transactionHash: { toHex(): string } }>,
      `putTransaction(${entryPoint})`,
      3,
      3000,
    );
    hash = result.transactionHash.toHex();
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    console.error(`[Coordinator] ✗ ${entryPoint} submit failed: ${msg.slice(0, 300)}`);
    try {
      const txBytes = transaction.toBytes();
      console.error(`[Coordinator]   tx bytes: ${txBytes.length} | first 64 hex: ${Buffer.from(txBytes).toString('hex').slice(0, 64)}`);
    } catch {}
    // If entity not found, suggest using byHash fallback
    if (msg.includes("NoSuchEntity") || msg.includes("no such entity")) {
      console.error(`[Coordinator]   → Entity not found. Possible causes:`);
      console.error(`     1. Contract hash is wrong (check env vs explorer)`);
      console.error(`     2. Contract not deployed yet (check https://testnet.cspr.live/package/${contractHash})`);
      console.error(`     3. Using ByPackageHash but should use ByHash (entity hash vs package hash)`);
    }
    throw err;
  }

  console.log(`[Coordinator] ✓ ${entryPoint} → ${hash}`);
  console.log(`[Coordinator]   https://testnet.cspr.live/transaction/${hash}`);

  await waitForTransaction(rpc, hash);
  return hash;
}

/**
 * Submit an already-signed Deploy or Transaction JSON via the Casper RPC.
 * Used by POST /agent/register/submit (frontend signs via CSPR.click).
 *
 * Auto-detects whether the JSON is a legacy Deploy or TransactionV1
 * and routes to the appropriate RPC method.
 */
export async function submitSignedDeploy(signedDeployJSON: object): Promise<string> {
  const sdk = await import("casper-js-sdk").then(m => m.default ?? m);
  const { Deploy, Transaction, RpcClient } = sdk;
  const { AxiosHandler } = await import("./casperHandler");
  const rpc = new RpcClient(new AxiosHandler(config.casperNodeRpc));

  const json = signedDeployJSON as any;
  const isLegacyDeploy = !!(json.body && json.header && json.approvals);

  if (isLegacyDeploy) {
    // Legacy Deploy format (from CSPR.click frontend signing)
    const deploy = Deploy.fromJSON(signedDeployJSON);

    const result = await withRetry(
      () => rpc.putDeploy(deploy) as Promise<{ deployHash: { toHex(): string } }>,
      "putDeploy(signed)",
      3,
      3000,
    );

    const hash = result.deployHash.toHex();

    console.log(`[submitSigned] User-signed deploy → ${hash}`);
    console.log(`[submitSigned] https://testnet.cspr.live/deploy/${hash}`);

    return hash;
  }

  // TransactionV1 format
  const transaction = Transaction.fromJSON(signedDeployJSON);

  const result = await withRetry(
    () => rpc.putTransaction(transaction) as Promise<{ transactionHash: { toHex(): string } }>,
    "putTransaction(signed)",
    3,
    3000,
  );

  const hash = result.transactionHash.toHex();

  console.log(`[submitSigned] User-signed transaction → ${hash}`);
  console.log(`[submitSigned] https://testnet.cspr.live/transaction/${hash}`);

  return hash;
}

async function waitForTransaction(
  rpc:  { getTransactionByTransactionHash(h: string): Promise<unknown> },
  hash: string,
): Promise<void> {
  const MAX_ATTEMPTS = 60;
  const POLL_INTERVAL_MS = 4000;

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    try {
      const info = await rpc.getTransactionByTransactionHash(hash) as any;
      const exec = info.executionInfo;
      if (exec?.blockHeight && exec.blockHeight > 0 && exec.executionResult) {
        if (exec.executionResult.errorMessage) {
          console.error(`[Coordinator] ✗ Transaction ${hash.slice(0, 16)}… failed on-chain at block ${exec.blockHeight}: ${exec.executionResult.errorMessage}`);
          throw new Error(`Casper transaction failed on-chain: ${exec.executionResult.errorMessage}`);
        }
        console.log(`[Coordinator] ✓ Transaction ${hash.slice(0, 16)}… confirmed at block ${exec.blockHeight}`);
        return;
      }
      // Log progress every 10 polls
      if (i > 0 && i % 10 === 0) {
        console.log(`[Coordinator] Still waiting for ${hash.slice(0, 16)}… (attempt ${i + 1}/${MAX_ATTEMPTS})`);
      }
    } catch (e) {
      const msg = (e as Error).message ?? "";
      if (msg.startsWith("Casper transaction failed")) throw e;
      // Transient RPC errors — continue polling
      if (i % 15 === 0 && i > 0) {
        console.warn(`[Coordinator] RPC polling ${hash.slice(0, 16)}… attempt ${i + 1}: ${msg.slice(0, 100)}`);
      }
    }
  }
  throw new Error(`Transaction ${hash} not confirmed after ${MAX_ATTEMPTS * POLL_INTERVAL_MS / 1000}s (${MAX_ATTEMPTS} attempts)`);
}

// ── Agent execution: real A2A HTTP call → Venice fallback ─────────────────────

/**
 * Execute work via a real agent endpoint (A2A).
 * If the agent has a registered HTTP endpoint, we POST to it — that's real
 * agent-to-agent communication. If the endpoint is unreachable or no agent
 * is registered, we fall back to local Venice AI inference.
 */
async function callAgent(
  capability:      string,
  taskDescription: string,
  context = "",
  agent?:          AgentRecord,
): Promise<{ output: string; viaAgent: boolean }> {
  const prompt = context
    ? `Task: ${taskDescription}\n\nContext:\n${context}`
    : taskDescription;

  // ── Try real A2A HTTP call if agent has a valid endpoint ────────────────
  if (agent?.endpoint && agent.endpoint.startsWith("http")) {
    try {
      console.log(`[Coordinator] A2A → ${capability} agent at ${agent.endpoint}`);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120_000);

      const response = await fetch(agent.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          capability,
          description:  taskDescription,
          context,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Agent endpoint returned HTTP ${response.status}`);
      }

      const data = await response.json() as { output?: string; error?: string };
      if (data.error) throw new Error(data.error);
      if (!data.output?.trim()) throw new Error("Agent returned empty output");

      console.log(`[Coordinator] ✓ A2A ${capability} agent responded (${data.output.length} chars)`);
      return { output: data.output, viaAgent: true };
    } catch (err) {
      const msg = (err as Error).message ?? String(err);
      console.warn(`[Coordinator] A2A ${capability} agent failed (${msg.slice(0, 100)}), falling back to Venice AI`);
    }
  }

  // ── Fallback: local Venice AI inference ─────────────────────────────────
  const SYSTEM_MAP: Record<string, string> = {
    research: "You are a market research specialist. Produce concise, factual research: key players, market size, growth trends.",
    risk:     "You are a risk analysis specialist. Identify key risks and rate each High/Medium/Low. Be concise.",
    coding:   "You are a senior software engineer. Output ONLY complete, runnable code. No explanations.",
    design:   "You are a UI/UX design specialist. Produce detailed design specifications.",
    audit:    "You are a quality auditor. Review outputs for accuracy. Give a verdict (PASS/FAIL/NEEDS_REVISION).",
    report:   "You are a deliverable compiler. Match output format to what was requested.",
  };
  console.log(`[Coordinator] Venice fallback for ${capability}`);
  const output = await veniceChat(SYSTEM_MAP[capability] ?? SYSTEM_MAP.research, prompt, "llama-3.3-70b");
  return { output, viaAgent: false };
}

// ── hireAndPay: on-chain hire + real x402 settlement ─────────────────────────

async function hireAndPay(
  agent:     AgentRecord,
  taskId:    bigint,
  result:    TaskResult,
): Promise<void> {
  await getSdk(); // ensure SDK loaded for side effects

  // Load coordinator key for EIP-712 signing (from x402.ts shared helper)
  const coordinator = await loadCoordinatorKey();

  // Build EIP-712 TransferAuthorization
  const now = Math.floor(Date.now() / 1000);
  const validAfter = String(now - 60);
  const validBefore = String(now + config.x402.timeoutSeconds);
  const nonce = crypto.randomBytes(32).toString("hex");

  const authorization: ExactCasperAuthorization = {
    from:       coordinator.accountHash,
    to:         agent.accountHash,
    value:      agent.pricePerTask,
    validAfter,
    validBefore,
    nonce,
  };

  // Sign via centralized signAuthorization helper
  const { signature: sigHex } = await signAuthorization(authorization);
  const sigBytes  = new Uint8Array(Buffer.from(sigHex, "hex"));

  // Convert nonce hex to 32-byte Uint8Array
  const nonceBytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    nonceBytes[i] = parseInt(nonce.slice(i * 2, i * 2 + 2), 16);
  }

  // 1. Record hire on Casper chain with full x402 auth args (with retry)
  const hireHash = await callContractEntry("hire_agent", {
    task_id:     taskId,
    agent:       { type: "Key", value: agent.accountHash },
    value:       { type: "U512", value: agent.pricePerTask },
    valid_after: BigInt(validAfter),
    valid_before: BigInt(validBefore),
    nonce:       { type: "ByteArray", value: nonceBytes },
    public_key:  { type: "PublicKey", value: coordinator.publicKey },
    signature:   { type: "Bytes", value: sigBytes },
  });
  result.agentsHired.push(agent.accountHash);
  result.casperExplorerLinks.push(`https://testnet.cspr.live/transaction/${hireHash}`);

  // 2. Real x402 payment via CSPR.cloud facilitator
  const settleResult = await settleX402Payment(
    agent.accountHash,
    agent.pricePerTask,
    agent.endpoint || `https://guildnet.io/agents/${agent.capability}`
  );
  result.txHashes.push(settleResult.hash);
  result.casperExplorerLinks.push(`https://testnet.cspr.live/deploy/${settleResult.hash}`);

  // 3. Persist settlement record
  try {
    addSettlement({
      hash:       settleResult.hash,
      from:       settleResult.from,
      to:         settleResult.to,
      amount:     settleResult.amount,
      capability: agent.capability,
      taskId:     String(taskId),
    });
  } catch (e) {
    console.warn(`[Coordinator] Failed to persist settlement: ${e}`);
  }

  // Note: tasksCompleted is incremented in completeTaskOnChain() when the task
  // actually finishes, not here at hire time.
}

// ── Complete task on-chain: store result hash, trigger reputation ────────────

async function completeTaskOnChain(
  taskId:       bigint,
  resultHash:   string,
  agentsHired:  AgentRecord[],
): Promise<void> {
  try {
    await callContractEntry("complete_task", {
      task_id:     taskId,
      result_hash: { type: "OptionString", value: resultHash },
    });
    console.log(`[Coordinator] Task ${taskId} completed on-chain. Result hash: ${resultHash}`);

    // Reputation is updated on-chain by the TaskCoordinator → AgentReputation pipeline.
    // Odra Mapping storage is NOT readable via named keys, so we mirror the
    // score computation locally using the same formula as the contract:
    //   weighted_total = completed + (failed × 2)
    //   score = clamp(completed / weighted_total × 10000, 100, 9900)
    for (const agent of agentsHired) {
      try {
        const { recordAgentCompletion } = await import("./agentStore");
        recordAgentCompletion(agent.accountHash);
      } catch {
        // Reputation update is non-critical
      }
    }
  } catch (err) {
    console.warn(`[Coordinator] complete_task failed (non-fatal): ${err}`);
  }
}

// ── Main orchestration loop ───────────────────────────────────────────────────

let _nextTaskId = 0n;

export async function runCoordinator(
  taskDescription: string,
  capabilities: string[] = ["research", "risk", "audit", "report"],
): Promise<TaskResult> {

  const result: TaskResult = {
    taskId:              "",
    report:              "",
    agentsHired:         [],
    txHashes:            [],
    casperExplorerLinks: [],
    onChain:             false,
  };

  // ── Query real task ID from contract state (fallback to local counter) ─────
  let TASK_ID: bigint;
  try {
    TASK_ID = (await queryContractVar("task_count")) ?? _nextTaskId++;
    console.log(`[Coordinator] Real TASK_ID = ${TASK_ID}`);
  } catch {
    TASK_ID = _nextTaskId++;
    console.warn(`[Coordinator] Could not query task_count, using local ID ${TASK_ID}`);
  }

  // ── Create task on Casper (with retry) ──────────────────────────────────
  let onChain = false;
  try {
    console.log(`[Coordinator] Creating task on Casper Testnet (budget: ${config.taskBudgetMotes} motes)…`);
    const createHash = await withRetry(
      () => callContractEntry("create_task", {
        description: taskDescription,
      }, config.taskBudgetMotes, undefined, config.taskBudgetMotes),
      "create_task",
      2,
      5000,
    );
    result.casperExplorerLinks.push(`https://testnet.cspr.live/transaction/${createHash}`);
    onChain = true;
    result.onChain = true;
    console.log(`[Coordinator] Task ${TASK_ID} created on-chain → ${createHash}`);
  } catch (err) {
    console.warn(`[Coordinator] create_task failed — proceeding without on-chain task: ${err}`);
  }
  result.taskId = String(TASK_ID);

  // ── Discover agents (non-blocking — AI runs regardless) ────────────────────
  const agentMap: Partial<Record<string, AgentRecord>> = {};
  await Promise.all(capabilities.map(async cap => {
    const found = await findAgents(cap);
    if (found[0]) {
      agentMap[cap] = found[0];
      console.log(`[Coordinator] Found ${cap} agent: ${found[0].accountHash.slice(0, 14)}… (rep=${found[0].reputationScore}, source=${found[0].source})`);
    } else {
      console.warn(`[Coordinator] No ${cap} agent registered — will run AI without on-chain hire`);
    }
  }));

  // ── Wave 1: independent capabilities (parallel A2A or Venice) ────────────
  const dependents = ["risk", "audit", "report"];
  const wave1 = capabilities.filter(c => !dependents.includes(c));

  if (wave1.length) {
    console.log(`[Coordinator] Wave 1 (parallel A2A): ${wave1.join(", ")}`);
    const results = await Promise.all(wave1.map(c => callAgent(c, taskDescription, "", agentMap[c])));

    for (let i = 0; i < wave1.length; i++) {
      const cap = wave1[i];
      const { output, viaAgent: _viaAgent } = results[i];
      if (cap === "research")     result.research = output;
      else if (cap === "coding")  result.coding   = output;
      else if (cap === "design")  result.design   = output;
      else result.research = (result.research ?? "") + `\n\n[${cap.toUpperCase()}]\n${output}`;

      if (agentMap[cap]) {
        try {
          await hireAndPay(agentMap[cap]!, TASK_ID, result);
        } catch (err) {
          console.warn(`[Coordinator] hireAndPay for ${cap} failed (non-fatal): ${err}`);
        }
      }
    }
  }

  // ── Wave 2: risk (depends on research) ─────────────────────────────────────
  if (capabilities.includes("risk")) {
    console.log("[Coordinator] Wave 2: risk");
    const { output } = await callAgent("risk", taskDescription, (result.research ?? "").slice(0, 1500), agentMap.risk);
    result.riskAnalysis = output;
    if (agentMap.risk) {
      try { await hireAndPay(agentMap.risk, TASK_ID, result); } catch (err) {
        console.warn(`[Coordinator] hireAndPay risk failed (non-fatal): ${err}`);
      }
    }
  }

  // ── Wave 3: audit (depends on research + risk) ─────────────────────────────
  if (capabilities.includes("audit")) {
    console.log("[Coordinator] Wave 3: audit");
    const ctx = [result.research?.slice(0, 600), result.riskAnalysis?.slice(0, 600)]
      .filter(Boolean).join("\n\n");
    const { output } = await callAgent("audit", taskDescription, ctx, agentMap.audit);
    result.audit = output;
    if (agentMap.audit) {
      try { await hireAndPay(agentMap.audit, TASK_ID, result); } catch (err) {
        console.warn(`[Coordinator] hireAndPay audit failed (non-fatal): ${err}`);
      }
    }
  }

  // ── Wave 4: report (depends on all above) ──────────────────────────────────
  if (capabilities.includes("report")) {
    console.log("[Coordinator] Wave 4: report");
    const ctx = [result.research?.slice(0, 1000), result.riskAnalysis?.slice(0, 800), result.audit?.slice(0, 500)]
      .filter(Boolean).join("\n\n");
    const { output } = await callAgent("report", taskDescription, ctx, agentMap.report);
    result.report = output;
    if (agentMap.report) {
      try { await hireAndPay(agentMap.report, TASK_ID, result); } catch (err) {
        console.warn(`[Coordinator] hireAndPay report failed (non-fatal): ${err}`);
      }
    }
  }

  // ── Complete task on-chain — store result hash, trigger reputation ────────
  if (onChain) {
    const resultHash = crypto.createHash("sha256").update(result.report).digest("hex");
    const hiredAgentRecords = capabilities
      .filter(c => agentMap[c])
      .map(c => agentMap[c]!);
    await completeTaskOnChain(TASK_ID, resultHash, hiredAgentRecords);
  }

  console.log("\n[Coordinator] ✅ Task complete!");
  console.log(`[Coordinator] x402 deploy hashes: ${result.txHashes.join(", ")}`);
  console.log(`[Coordinator] On-chain: ${result.onChain}`);
  console.log("[Coordinator] Explorer links:");
  result.casperExplorerLinks.forEach(l => console.log("  ", l));

  return result;
}
