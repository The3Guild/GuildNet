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
import { buildEIP712Digest, signAuthorization, loadCoordinatorKey, type ExactCasperAuthorization } from "./x402";
import { settleX402Payment } from "./x402";
import { veniceChat } from "./agents/venice";
import { withRetry } from "./casperHandler";
import { addSettlement } from "./settlements";
import {
  getAllAgents,
  getAgentsByCapability,
  syncWithChain,
  updateAgentReputation,
  incrementAgentTasks,
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
  try {
    await syncWithChain();
  } catch (err) {
    console.warn(`[Coordinator] Chain sync failed: ${err}`);
  }
  return getAllAgents();
}

async function findAgents(capability: string): Promise<AgentRecord[]> {
  try {
    await syncWithChain();
  } catch (err) {
    console.warn(`[Coordinator] Chain sync failed for "${capability}": ${err}`);
  }
  return getAgentsByCapability(capability);
}

// ── Build runtime args helper ─────────────────────────────────────────────────

type ArgValue =
  | string
  | bigint
  | boolean
  | { type: "U512"; value: string }
  | { type: "Key"; value: string }
  | { type: "ByteArray"; value: Uint8Array }
  | { type: "PublicKey"; value: any }
  | { type: "OptionString"; value: string | null };

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

// ── Build an unsigned deploy JSON for wallet signing ────────────────────────

export async function buildDeployJSON(
  entryPoint: string,
  namedArgs:  Record<string, ArgValue>,
  contractHash: string,
  initiatorPublicKeyHex: string,
  paymentMotes?: bigint,
  legacy?: boolean,
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

  // Legacy mode: build Deploy (for CSPR.click frontend signing)
  // Default: build TransactionV1 (for backend-submitted calls)
  const tx = legacy ? builder.buildFor1_5() : builder.build();

  return tx.toJSON();
}

// ── On-chain contract calls (casper-js-sdk) ────────────────────────────────────

export async function callContractEntry(
  entryPoint: string,
  namedArgs:  Record<string, ArgValue>,
  paymentMotes?: bigint,
  contractOverride?: string,
): Promise<string> {
  const sdk = await getSdk();
  const { RpcClient, Transaction } = sdk;
  const { AxiosHandler } = await import("./casperHandler");

  const { key } = await loadCoordinatorKey();
  const rpc = new RpcClient(new AxiosHandler(config.casperNodeRpc));

  const contractHash = (contractOverride ?? config.contracts.taskCoordinator).replace("hash-", "");
  const deployJSON = await buildDeployJSON(entryPoint, namedArgs, contractHash, key.publicKey.toHex(), paymentMotes);

  const transaction = Transaction.fromJSON(deployJSON);
  transaction.sign(key);

  const result = await withRetry(
    () => rpc.putTransaction(transaction) as Promise<{ transactionHash: { toHex(): string } }>,
    `putTransaction(${entryPoint})`,
    3,
    3000,
  );

  const hash = result.transactionHash.toHex();

  console.log(`[Coordinator] ${entryPoint} → ${hash}`);
  console.log(`[Coordinator] https://testnet.cspr.live/transaction/${hash}`);

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

    await waitForDeployLegacy(rpc, hash);
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

  await waitForTransaction(rpc, hash);
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
      const info = await rpc.getTransactionByTransactionHash(hash) as {
        executionInfo?: { blockHeight?: number; executionResult?: { errorMessage?: string } };
      };
      const exec = info.executionInfo;
      if (exec?.blockHeight && exec.blockHeight > 0 && exec.executionResult) {
        if (exec.executionResult.errorMessage) {
          throw new Error(`Casper transaction failed on-chain: ${exec.executionResult.errorMessage}`);
        }
        return;
      }
    } catch (e) {
      const msg = (e as Error).message ?? "";
      if (msg.startsWith("Casper transaction failed")) throw e;
      // Transient RPC errors — continue polling
    }
  }
  throw new Error(`Transaction ${hash} not confirmed after ${MAX_ATTEMPTS * POLL_INTERVAL_MS / 1000}s (${MAX_ATTEMPTS} attempts)`);
}

async function waitForDeployLegacy(
  rpc:  { getTransactionByDeployHash(h: string): Promise<unknown> },
  hash: string,
): Promise<void> {
  const MAX_ATTEMPTS = 60;
  const POLL_INTERVAL_MS = 4000;

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    try {
      const info = await rpc.getTransactionByDeployHash(hash) as {
        executionInfo?: { blockHeight?: number; executionResult?: { errorMessage?: string } };
      };
      const exec = info.executionInfo;
      if (exec?.blockHeight && exec.blockHeight > 0 && exec.executionResult) {
        if (exec.executionResult.errorMessage) {
          throw new Error(`Casper deploy failed on-chain: ${exec.executionResult.errorMessage}`);
        }
        return;
      }
    } catch (e) {
      const msg = (e as Error).message ?? "";
      if (msg.startsWith("Casper deploy failed")) throw e;
      // Transient RPC errors — continue polling
    }
  }
  throw new Error(`Deploy ${hash} not confirmed after ${MAX_ATTEMPTS * POLL_INTERVAL_MS / 1000}s (${MAX_ATTEMPTS} attempts)`);
}

// ── Venice AI inference ───────────────────────────────────────────────────────

async function callAgent(
  capability:      string,
  taskDescription: string,
  context = "",
): Promise<string> {
  const SYSTEM_MAP: Record<string, string> = {
    research: "You are a market research specialist. Produce concise, factual research: key players, market size, growth trends.",
    risk:     "You are a risk analysis specialist. Identify key risks and rate each High/Medium/Low. Be concise.",
    coding:   "You are a senior software engineer. Output ONLY complete, runnable code. No explanations.",
    design:   "You are a UI/UX design specialist. Produce detailed design specifications.",
    audit:    "You are a quality auditor. Review outputs for accuracy. Give a verdict (PASS/FAIL/NEEDS_REVISION).",
    report:   "You are a deliverable compiler. Match output format to what was requested.",
  };
  const prompt = context
    ? `Task: ${taskDescription}\n\nContext:\n${context}`
    : taskDescription;
  return veniceChat(SYSTEM_MAP[capability] ?? SYSTEM_MAP.research, prompt, "llama-3.3-70b");
}

// ── hireAndPay: on-chain hire + real x402 settlement ─────────────────────────

async function hireAndPay(
  agent:     AgentRecord,
  taskId:    bigint,
  result:    TaskResult,
): Promise<void> {
  const sdk = await getSdk();

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
    signature:   { type: "ByteArray", value: sigBytes },
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

  // 4. Update local agent store
  incrementAgentTasks(agent.accountHash);
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

    // Reputation is updated by the TaskCoordinator contract calling AgentReputation.
    // Also update our local store to reflect the on-chain reputation change.
    for (const agent of agentsHired) {
      try {
        // Query updated score from chain
        const score = await queryContractVar(`reputation_score_${agent.accountHash}`);
        if (score !== undefined) {
          updateAgentReputation(agent.accountHash, Number(score));
        } else {
          // If we can't query the score, apply the formula locally
          const currentScore = agent.reputationScore;
          const newTasksCompleted = agent.tasksCompleted + 1;
          const weightedTotal = newTasksCompleted + 0 * 2;
          const rawScore = Math.min(9900, Math.max(100, Math.floor((newTasksCompleted / Math.max(1, weightedTotal)) * 10000)));
          updateAgentReputation(agent.accountHash, rawScore);
        }
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

  // ── Sync agents from chain ──────────────────────────────────────────────
  try {
    await syncWithChain();
  } catch {
    // Non-fatal — local cache is available
  }

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
    console.log(`[Coordinator] Creating task on Casper Testnet…`);
    const createHash = await withRetry(
      () => callContractEntry("create_task", {
        description: taskDescription,
      }, config.taskBudgetMotes),
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

  // ── Wave 1: independent capabilities (parallel Venice AI) ──────────────────
  const dependents = ["risk", "audit", "report"];
  const wave1 = capabilities.filter(c => !dependents.includes(c));

  if (wave1.length) {
    console.log(`[Coordinator] Wave 1 (parallel Venice): ${wave1.join(", ")}`);
    const outputs = await Promise.all(wave1.map(c => callAgent(c, taskDescription)));

    for (let i = 0; i < wave1.length; i++) {
      const cap = wave1[i];
      if (cap === "research")     result.research = outputs[i];
      else if (cap === "coding")  result.coding   = outputs[i];
      else if (cap === "design")  result.design   = outputs[i];
      else result.research = (result.research ?? "") + `\n\n[${cap.toUpperCase()}]\n${outputs[i]}`;

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
    const output = await callAgent("risk", taskDescription, (result.research ?? "").slice(0, 1500));
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
    const output = await callAgent("audit", taskDescription, ctx);
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
    const output = await callAgent("report", taskDescription, ctx);
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
