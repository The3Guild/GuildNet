/**
 * coordinator.ts — GuildNet orchestration loop (Casper)
 *
 * Replaces the viem/Base version. All on-chain interactions target the
 * deployed Casper Testnet contracts. Agent payments use the real Casper
 * x402 Facilitator via CSPR.cloud — not a custom permission mimic.
 *
 * Payment flow per hire:
 *   1. hire_agent   — call TaskCoordinator.hire_agent on Casper (records on-chain)
 *   2. x402 settle  — POST /verify + /settle to CSPR.cloud facilitator
 *                     → CEP-18 token transfer on Casper Testnet
 *                     → returns real Casper deploy hash
 */

import { config } from "./config";
import { csproCloudGet } from "./chain";
import { settleX402Payment } from "./x402";
import { veniceChat } from "./agents/venice";

// ── Lazy SDK import ───────────────────────────────────────────────────────────

let _sdk: any = null;

async function getSdk() {
  if (!_sdk) {
    const casperSdk = await import("casper-js-sdk");
    _sdk = casperSdk.default ?? casperSdk;
  }
  return _sdk;
}

// ── Query a named key from the TaskCoordinator contract ─────────────────────

async function queryContractVar(varName: string): Promise<bigint | undefined> {
  const contractHash = config.contracts.taskCoordinator.replace("hash-", "");

  // Attempt 1 — direct Casper RPC via queryLatestGlobalState
  try {
    const sdk = await getSdk();
    const { RpcClient, HttpHandler } = sdk;
    const rpc = new RpcClient(new HttpHandler(config.casperNodeRpc));
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
  agentsHired:         string[];   // Casper account hashes
  x402Hashes:          string[];   // deploy hashes from x402 settlements
  casperExplorerLinks: string[];
}

// ── Agent record shape from AgentRegistry ────────────────────────────────────

interface AgentRecord {
  accountHash:      string;   // "00<64 hex>" — used as x402 payTo
  endpoint:         string;
  capability:       string;
  pricePerTask:     string;   // motes, decimal string
  active:           boolean;
  reputationScore:  number;
}

// ── Agent discovery via CSPR.cloud REST ──────────────────────────────────────

async function findAgents(capability: string): Promise<AgentRecord[]> {
  try {
    const registryHash = config.contracts.agentRegistry.replace("hash-", "");
    const data = await csproCloudGet(
      `/contracts/${registryHash}/named-keys`
    ) as { data?: Array<{ name: string; value: string }> };

    const agents: AgentRecord[] = [];
    for (const entry of (data.data ?? [])) {
      try {
        const parsed = JSON.parse(entry.value ?? "{}");
        if (parsed.active === true && parsed.capability === capability) {
          agents.push({
            accountHash:     "00" + entry.name,
            endpoint:        parsed.endpoint   ?? "",
            capability:      parsed.capability,
            pricePerTask:    String(parsed.price_per_task ?? "500000000"),
            active:          true,
            reputationScore: parsed.reputation_score ?? 5000,
          });
        }
      } catch { /* skip non-agent entries */ }
    }

    // Highest reputation first
    return agents.sort((a, b) => b.reputationScore - a.reputationScore);
  } catch (err) {
    console.warn(`[Coordinator] CSPR.cloud discovery failed for "${capability}": ${err}`);
    return [];
  }
}

// ── On-chain contract calls (casper-js-sdk v5) ────────────────────────────────

async function callContractEntry(
  entryPoint: string,
  namedArgs:  Record<string, string | bigint | boolean>,
  paymentMotes?: bigint,
): Promise<string> {
  const sdk = await getSdk();
  const { KeyAlgorithm, PrivateKey, RpcClient, HttpHandler, Hash, InitiatorAddr } = sdk;

  const fsPromises = await import("fs/promises");
  const pem  = await fsPromises.readFile(config.coordinatorKeyPath, "utf-8");
  const algo = config.coordinatorKeyAlgo === "secp256k1"
    ? KeyAlgorithm.SECP256K1
    : KeyAlgorithm.ED25519;
  const key  = PrivateKey.fromPem(pem, algo);
  const rpc  = new RpcClient(new HttpHandler(config.casperNodeRpc));

  // Build runtime args
  const { Args, CLValue } = sdk;
  const args = Args.fromMap({});
  for (const [k, v] of Object.entries(namedArgs)) {
    if (typeof v === "string")  args.insert(k, CLValue.newCLString(v));
    else if (typeof v === "bigint")  args.insert(k, CLValue.newCLUint64(v));
    else if (typeof v === "boolean") args.insert(k, CLValue.newCLValueBool(v));
  }

  const {
    TransactionV1Payload, TransactionV1, Transaction,
    TransactionScheduling, TransactionEntryPoint, TransactionEntryPointEnum,
    TransactionTarget, StoredTarget, TransactionInvocationTarget,
    ByPackageHashInvocationTarget, TransactionRuntime,
    PricingMode, FixedMode, PaymentLimitedMode, Timestamp, Duration,
  } = sdk;

  const contractHash = config.contracts.taskCoordinator.replace("hash-", "");

  // Build transaction target: stored contract call by package hash
  const byPackageHash = new ByPackageHashInvocationTarget();
  byPackageHash.addr = Hash.fromHex(contractHash);
  byPackageHash.protocolVersionMajor = null;

  const invocationTarget = new TransactionInvocationTarget();
  invocationTarget.byPackageHash = byPackageHash;

  const storedTarget = new StoredTarget();
  storedTarget.id = invocationTarget;
  storedTarget.runtime = TransactionRuntime.vmCasperV1();

  const transactionTarget = new TransactionTarget(undefined, storedTarget, undefined);

  // Build pricing mode: payment-limited (for payable entry points) or fixed
  let pricingMode: InstanceType<typeof PricingMode>;
  if (paymentMotes !== undefined) {
    const limited = new PaymentLimitedMode();
    limited.gasPriceTolerance = 1;
    limited.paymentAmount = Number(paymentMotes);
    limited.standardPayment = true;
    pricingMode = new PricingMode();
    pricingMode.paymentLimited = limited;
  } else {
    const fixed = new FixedMode();
    fixed.gasPriceTolerance = 1;
    fixed.additionalComputationFactor = 0;
    pricingMode = new PricingMode();
    pricingMode.fixed = fixed;
  }

  const payload = TransactionV1Payload.build({
    initiatorAddr: new InitiatorAddr(key.publicKey),
    args,
    ttl: new Duration(30 * 60 * 1000),
    chainName: config.casperChainName,
    entryPoint: new TransactionEntryPoint(TransactionEntryPointEnum.Custom, entryPoint),
    pricingMode,
    timestamp: new Timestamp(new Date()),
    transactionTarget,
    scheduling: new TransactionScheduling({}),
  });

  const txV1 = TransactionV1.makeTransactionV1(payload);
  txV1.sign(key);
  const tx = Transaction.fromTransactionV1(txV1);

  const result = await rpc.putTransaction(tx);
  const hash   = result.transactionHash.toHex();

  console.log(`[Coordinator] ${entryPoint} → ${hash}`);
  console.log(`[Coordinator] https://testnet.cspr.live/deploy/${hash}`);

  await waitForDeploy(rpc, hash);
  return hash;
}

async function waitForDeploy(
  rpc:  { getTransactionByTransactionHash(h: string): Promise<unknown> },
  hash: string
): Promise<void> {
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 4000));
    try {
      const info = await rpc.getTransactionByTransactionHash(hash) as {
        executionInfo?: { blockHeight?: number; executionResult?: { errorMessage?: string } };
      };
      const exec = info.executionInfo;
      if (exec?.blockHeight && exec.blockHeight > 0 && exec.executionResult) {
        if (exec.executionResult.errorMessage) {
          throw new Error(`Casper deploy failed: ${exec.executionResult.errorMessage}`);
        }
        return;
      }
    } catch (e) {
      const msg = (e as Error).message ?? "";
      if (msg.startsWith("Casper deploy failed")) throw e;
    }
  }
  throw new Error(`Deploy ${hash} not confirmed after 240s`);
}

// ── Venice AI inference ───────────────────────────────────────────────────────

async function callAgent(
  capability:      string,
  taskDescription: string,
  context = ""
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
  // 1. Record hire on Casper chain
  const hireHash = await callContractEntry("hire_agent", {
    task_id: taskId,
    agent:   agent.accountHash,
  });
  result.agentsHired.push(agent.accountHash);
  result.casperExplorerLinks.push(`https://testnet.cspr.live/deploy/${hireHash}`);

  // 2. Real x402 payment via CSPR.cloud facilitator
  //    → POST /verify (off-chain signature check)
  //    → POST /settle (CEP-18 token transfer on Casper Testnet)
  const x402Hash = await settleX402Payment(
    agent.accountHash,
    agent.pricePerTask,
    agent.endpoint || `https://guildnet.io/agents/${agent.capability}`
  );
  result.x402Hashes.push(x402Hash);
  result.casperExplorerLinks.push(`https://testnet.cspr.live/deploy/${x402Hash}`);
}

// ── Main orchestration loop ───────────────────────────────────────────────────

export async function runCoordinator(
  taskDescription: string,
  capabilities: string[] = ["research", "risk", "audit", "report"]
): Promise<TaskResult> {

  const result: TaskResult = {
    taskId:              "",
    report:              "",
    agentsHired:         [],
    x402Hashes:          [],
    casperExplorerLinks: [],
  };

  // ── Query real task ID from contract state ────────────────────────────────
  const TASK_ID = (await queryContractVar("task_count")) ?? 0n;
  console.log(`[Coordinator] Real TASK_ID = ${TASK_ID}`);

  // ── Create task on Casper ──────────────────────────────────────────────────
  console.log(`[Coordinator] Creating task on Casper Testnet…`);
  const createHash = await callContractEntry("create_task", {
    description: taskDescription,
  }, config.taskBudgetMotes);
  result.taskId = String(TASK_ID);
  result.casperExplorerLinks.push(`https://testnet.cspr.live/deploy/${createHash}`);

  // ── Discover agents ────────────────────────────────────────────────────────
  const agentMap: Partial<Record<string, AgentRecord>> = {};
  await Promise.all(capabilities.map(async cap => {
    const found = await findAgents(cap);
    if (found[0]) {
      agentMap[cap] = found[0];
      console.log(`[Coordinator] Found ${cap} agent: ${found[0].accountHash.slice(0, 14)}… (rep=${found[0].reputationScore})`);
    } else {
      console.warn(`[Coordinator] No ${cap} agent on-chain — skipping`);
    }
  }));

  // ── Wave 1: independent agents (parallel Venice, sequential on-chain) ──────
  const dependents = ["risk", "audit", "report"];
  const wave1 = capabilities.filter(c => !dependents.includes(c) && agentMap[c]);

  if (wave1.length) {
    console.log(`[Coordinator] Wave 1 (parallel Venice): ${wave1.join(", ")}`);
    const outputs = await Promise.all(wave1.map(c => callAgent(c, taskDescription)));

    for (let i = 0; i < wave1.length; i++) {
      const cap = wave1[i];
      await hireAndPay(agentMap[cap]!, TASK_ID, result);
      if (cap === "research")     result.research = outputs[i];
      else if (cap === "coding")  result.coding   = outputs[i];
      else if (cap === "design")  result.design   = outputs[i];
      else result.research = (result.research ?? "") + `\n\n[${cap.toUpperCase()}]\n${outputs[i]}`;
    }
  }

  // ── Wave 2: risk ───────────────────────────────────────────────────────────
  if (capabilities.includes("risk") && agentMap.risk) {
    console.log("[Coordinator] Wave 2: risk");
    const output = await callAgent("risk", taskDescription, (result.research ?? "").slice(0, 1500));
    await hireAndPay(agentMap.risk, TASK_ID, result);
    result.riskAnalysis = output;
  }

  // ── Wave 3: audit ──────────────────────────────────────────────────────────
  if (capabilities.includes("audit") && agentMap.audit) {
    console.log("[Coordinator] Wave 3: audit");
    const ctx = [result.research?.slice(0, 600), result.riskAnalysis?.slice(0, 600)]
      .filter(Boolean).join("\n\n");
    const output = await callAgent("audit", taskDescription, ctx);
    await hireAndPay(agentMap.audit, TASK_ID, result);
    result.audit = output;
  }

  // ── Wave 4: report ─────────────────────────────────────────────────────────
  if (capabilities.includes("report") && agentMap.report) {
    console.log("[Coordinator] Wave 4: report");
    const ctx = [result.research?.slice(0, 1000), result.riskAnalysis?.slice(0, 800), result.audit?.slice(0, 500)]
      .filter(Boolean).join("\n\n");
    const output = await callAgent("report", taskDescription, ctx);
    await hireAndPay(agentMap.report, TASK_ID, result);
    result.report = output;
  }

  // ── Complete task — store result hash on-chain ─────────────────────────────
  const resultHash = require("crypto")
    .createHash("sha256")
    .update(result.report)
    .digest("hex");

  const completeHash = await callContractEntry("complete_task", {
    task_id:     TASK_ID,
    result_hash: resultHash,
  });
  result.casperExplorerLinks.push(`https://testnet.cspr.live/deploy/${completeHash}`);

  console.log("\n[Coordinator] ✅ Task complete!");
  console.log(`[Coordinator] x402 deploy hashes: ${result.x402Hashes.join(", ")}`);
  console.log("[Coordinator] Explorer links:");
  result.casperExplorerLinks.forEach(l => console.log("  ", l));

  return result;
}
