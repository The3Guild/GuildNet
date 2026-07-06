import "dotenv/config";
import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { config } from "./config";
import { runCoordinator } from "./coordinator";
import { runAgent, type Capability } from "./agentRunner";
import { buildProject } from "./builder";

const app = express();
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN
    ? process.env.ALLOWED_ORIGIN.split(",")
    : ["https://guild-net-plum.vercel.app", "http://localhost:3001", "http://localhost:3000"],
  methods: ["GET", "POST"],
}));
app.use(express.json());

const limiter = rateLimit({ windowMs: 60_000, max: 10, standardHeaders: true, legacyHeaders: false });

// ── Routes ────────────────────────────────────────────────────────────────────

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", chain: config.casperChainName, network: "casper" });
});

/**
 * POST /task
 * Full coordinator loop: discover all agents → hire → Venice AI → complete
 */
// In-memory store for design HTML (keyed by taskId)
const designStore = new Map<string, string>();

app.post("/task", limiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { description, capabilities } = req.body as {
      description: string;
      capabilities?: string[];
    };
    if (!description?.trim()) { res.status(400).json({ error: "description is required" }); return; }

    const result = await runCoordinator(description, capabilities);

    // Store design HTML for preview endpoint
    if (result.design) designStore.set(result.taskId.toString(), result.design);

    res.json({
      taskId:              result.taskId,
      agentsHired:         result.agentsHired,
      // x402 deploy hashes — these are the real Casper payment proofs
      x402Hashes:          result.x402Hashes,
      casperExplorerLinks: result.casperExplorerLinks,
      research:            result.research,
      riskAnalysis:        result.riskAnalysis,
      coding:              result.coding,
      design:              result.design,
      audit:               result.audit,
      report:              result.report,
    });
  } catch (err) { next(err); }
});

// Serve design HTML as a live preview page
app.get("/design-preview/:taskId", (req: Request, res: Response) => {
  const html = designStore.get(req.params.taskId);
  if (!html) { res.status(404).send("Design not found"); return; }
  // Ensure it's a complete HTML document
  const full = html.trim().startsWith("<!DOCTYPE") || html.trim().startsWith("<html")
    ? html
    : `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Design Preview</title></head><body>${html}</body></html>`;
  res.setHeader("Content-Type", "text/html");
  res.send(full);
});

/**
 * POST /agent/:capability/run
 * A2A route: run a specific agent directly. The agent can autonomously hire
 * sub-agents on-chain using its own wallet before performing Venice AI inference.
 *
 * Body: { taskId: string, description: string, context?: string }
 */
app.post("/agent/:capability/run", limiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const capability = req.params.capability as Capability;
    const { taskId, description, context = "" } = req.body as {
      taskId: string; description: string; context?: string;
    };

    if (!["research","risk","report","coding","design","audit"].includes(capability)) {
      res.status(400).json({ error: `Unknown capability: ${capability}` }); return;
    }
    if (!taskId || !description?.trim()) {
      res.status(400).json({ error: "taskId and description are required" }); return;
    }

    const result = await runAgent(capability, BigInt(taskId), description, context);
    res.json({
      capability:     result.capability,
      agentAddress:   result.agentAddress,
      output:         result.output,
      subAgentsHired: result.subAgentsHired,
      txHashes:       result.txHashes,
    });
  } catch (err) { next(err); }
});

/**
 * POST /verify-endpoint
 * Probes an agent endpoint to confirm it's reachable and returns a valid response.
 */
app.post("/verify-endpoint", limiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { endpoint } = req.body as { endpoint: string };
    if (!endpoint?.trim()) { res.status(400).json({ error: "endpoint is required" }); return; }

    // Must be a valid URL
    let url: URL;
    try { url = new URL(endpoint); } catch { res.status(400).json({ ok: false, reason: "Invalid URL" }); return; }
    if (!["http:", "https:"].includes(url.protocol)) {
      res.status(400).json({ ok: false, reason: "URL must be http or https" }); return;
    }

    // Probe with a minimal test task
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const probe = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: "ping", description: "GuildNet endpoint verification" }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!probe.ok) {
        res.json({ ok: false, reason: `Endpoint returned HTTP ${probe.status}` }); return;
      }
      const text = await probe.text().catch(() => "");
      res.json({ ok: true, status: probe.status, preview: text.slice(0, 200) });
    } catch (e: unknown) {
      clearTimeout(timeout);
      const msg = (e as Error).message ?? "Connection failed";
      res.json({ ok: false, reason: msg.includes("abort") ? "Endpoint timed out (>10s)" : msg });
    }
  } catch (err) { next(err); }
});

/**
 * POST /suggest-agents
 * Deterministic routing — reads live capabilities from chain, matches to task keywords.
 */
app.post("/suggest-agents", limiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { description = "" } = req.body as { description: string };
    const d = description.toLowerCase();

    // Fetch all registered capabilities from chain
    const { csproCloudGet } = await import("./chain");
    let registeredCaps: string[] = [];
    try {
      const registryHash = config.contracts.agentRegistry.replace("hash-", "");
      const data = await csproCloudGet(`/contracts/${registryHash}/named-keys`) as {
        data?: Array<{ name: string; value: string }>;
      };
      const caps = new Set<string>();
      for (const entry of (data.data ?? [])) {
        try {
          const parsed = JSON.parse(entry.value ?? "{}");
          if (parsed.active === true && parsed.capability) caps.add(parsed.capability);
        } catch { /* skip */ }
      }
      registeredCaps = [...caps];
    } catch { registeredCaps = ["research","risk","coding","design","audit","report"]; }

    // Core routing logic
    const hasCoding  = /\b(build|code|implement|write|create|develop|program|script|solidity|smart contract|dapp|app|cli|api|backend|frontend|website|web app|react|next|vue|angular|node|express)\b/.test(d);
    const hasDesign  = /\b(design|ui|ux|interface|layout|figma|wireframe|visual|landing page|dashboard|component|style|theme|css|tailwind)\b/.test(d);
    const hasBiz     = /\b(market|research|analysis|strategy|business|competitor|risk|report|study|survey|industry|trend|startup|investment|growth)\b/.test(d);
    const hasMixed   = hasCoding && hasBiz;

    let base: string[];
    if (hasMixed)        base = hasDesign ? ["research","coding","design","audit","report"] : ["research","coding","audit","report"];
    else if (hasCoding)  base = hasDesign ? ["coding","design","report"] : ["coding","report"];
    else if (hasDesign)  base = ["design","report"];
    else                 base = ["research","risk","audit","report"];

    // Add any registered custom capabilities that match keywords in the description
    const customCaps = registeredCaps.filter(cap =>
      !base.includes(cap) &&
      !["research","risk","coding","design","audit","report"].includes(cap) &&
      d.includes(cap.toLowerCase())
    );
    // Insert custom caps before "report"
    const reportIdx = base.indexOf("report");
    const capabilities = reportIdx >= 0
      ? [...base.slice(0, reportIdx), ...customCaps, ...base.slice(reportIdx)]
      : [...base, ...customCaps];

    // Only keep capabilities that have a registered agent
    const filtered = capabilities.filter(c => registeredCaps.includes(c));
    // Always ensure "report" is last if registered
    if (!filtered.includes("report") && registeredCaps.includes("report")) filtered.push("report");

    res.json({ capabilities: filtered.length > 0 ? filtered : base });
  } catch (err) { next(err); }
});

/**
 * POST /enhance
 * Refine a specific agent output with a follow-up prompt.
 */
app.post("/enhance", limiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { capability, originalOutput, feedback } = req.body as {
      capability: string; originalOutput: string; feedback: string;
    };
    if (!originalOutput?.trim() || !feedback?.trim()) {
      res.status(400).json({ error: "originalOutput and feedback are required" }); return;
    }
    const { veniceChat } = await import("./agents/venice.js");
    const SYSTEM = `You are a ${capability} specialist. You previously produced an output. The user wants it improved. Apply their feedback precisely and return the complete revised output — no explanations, just the improved content.`;
    const enhanced = await veniceChat(SYSTEM, `Original output:\n${originalOutput}\n\nUser feedback:\n${feedback}\n\nRevised output:`, "mistral-small-3-2-24b-instruct");
    res.json({ enhanced });
  } catch (err) { next(err); }
});

app.post("/build", limiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { prompt } = req.body as { prompt: string };
    if (!prompt?.trim()) { res.status(400).json({ error: "prompt is required" }); return; }
    const result = await buildProject(prompt);
    // Find single-file HTML output if generated
    const htmlFile = result.files.find(f => f.path.endsWith(".html") && (f.content.includes("<!DOCTYPE") || f.content.includes("<html")));
    res.json({
      success:    result.success,
      outputDir:  result.outputDir,
      previewUrl: result.previewUrl,
      plan:       result.plan,
      html:       htmlFile?.content,
      files:      result.files.map(f => ({ path: f.path, size: f.content.length })),
      buildLog:   result.buildLog.slice(-2000),
    });
  } catch (err) { next(err); }
});

// ── x402 prepare / submit for CSPR.click signing ────────────────────────────

interface ExactCasperAuthorization {
  from:         string;
  to:           string;
  value:        string;
  validAfter:   string;
  validBefore:  string;
  nonce:        string;
}

interface PaymentPayload {
  x402Version: number;
  resource:    { url: string };
  accepted: {
    scheme:            string;
    network:           string;
    asset:             string;
    amount:            string;
    payTo:             string;
    maxTimeoutSeconds: number;
  };
  payload: {
    signature:     string;
    publicKey:     string;
    authorization: ExactCasperAuthorization;
  };
}

interface PaymentRequirements {
  scheme:            string;
  network:           string;
  payTo:             string;
  amount:            string;
  asset:             string;
  maxTimeoutSeconds: number;
  extra: {
    name:     string;
    version:  string;
    decimals: string;
    symbol:   string;
  };
}

interface SettleResult {
  success:      boolean;
  transaction:  string;
  network:      string;
  payer:        string;
  errorReason?: string;
  errorMessage?: string;
}

// In-memory store for pending x402 authorizations (keyed by nonce)
const pendingAuths = new Map<string, ExactCasperAuthorization>();

/**
 * POST /x402/prepare
 * Generates the EIP-712 typed data for the frontend to sign via CSPR.click.
 * Returns SignTypedDataParams matching CSPR.click's expected format.
 */
app.post("/x402/prepare", limiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { payeeAccountHash, amountBaseUnits, resourceUrl } = req.body as {
      payeeAccountHash: string;
      amountBaseUnits?: string;
      resourceUrl?: string;
    };
    if (!payeeAccountHash?.trim()) {
      res.status(400).json({ error: "payeeAccountHash is required" }); return;
    }

    const fs = await import("fs/promises");
    const { PrivateKey, KeyAlgorithm } = await import("casper-js-sdk").then(m => m.default ?? m);
    const pemContent = await fs.readFile(config.coordinatorKeyPath, "utf-8");
    const algo = config.coordinatorKeyAlgo === "secp256k1"
      ? KeyAlgorithm.SECP256K1
      : KeyAlgorithm.ED25519;
    const privateKey = PrivateKey.fromPem(pemContent, algo);
    const payerAccountHash = "00" + privateKey.publicKey.accountHash().toHex();

    const now          = Math.floor(Date.now() / 1000);
    const validAfter   = String(now - 60);
    const validBefore  = String(now + config.x402.timeoutSeconds);
    const nonce        = (await import("crypto")).randomBytes(32).toString("hex");
    const amount       = amountBaseUnits ?? "500000000";

    const authorization: ExactCasperAuthorization = {
      from:        payerAccountHash,
      to:          payeeAccountHash,
      value:       amount,
      validAfter,
      validBefore,
      nonce,
    };

    // Store pending authorization
    pendingAuths.set(nonce, authorization);

    const typedData = {
      domain: {
        name:                   config.x402.tokenName,
        version:                config.x402.tokenVersion,
        chain_name:             config.x402.network,
        contract_package_hash:  config.x402.assetPackage,
      },
      types: {
        EIP712Domain: [
          { name: "name",                   type: "string" },
          { name: "version",                type: "string" },
          { name: "chain_name",             type: "string" },
          { name: "contract_package_hash",  type: "bytes32" },
        ],
        TransferWithAuthorization: [
          { name: "from",        type: "address" },
          { name: "to",          type: "address" },
          { name: "value",       type: "uint256" },
          { name: "validAfter",  type: "uint256" },
          { name: "validBefore", type: "uint256" },
          { name: "nonce",       type: "bytes32" },
        ],
      },
      primaryType: "TransferWithAuthorization",
      message: {
        from:        authorization.from,
        to:          authorization.to,
        value:       authorization.value,
        validAfter:  authorization.validAfter,
        validBefore: authorization.validBefore,
        nonce:       authorization.nonce,
      },
    };

    res.json({
      signTypedDataParams: {
        typedData,
        options: {
          domainTypes: [
            { name: "name",                   type: "string" },
            { name: "version",                type: "string" },
            { name: "chain_name",             type: "string" },
            { name: "contract_package_hash",  type: "bytes32" },
          ],
          returnHashArtifacts: true,
        },
      },
      authorization,
      resourceUrl: resourceUrl ?? `https://guildnet.io/agents/pay`,
    });
  } catch (err) { next(err); }
});

/**
 * POST /x402/submit
 * Takes a CSPR.click-signed payload, submits to CSPR.cloud facilitator.
 * Body: { authorization, signature, publicKey, resourceUrl }
 */
app.post("/x402/submit", limiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { authorization, signature, publicKey: signerPublicKey, resourceUrl } = req.body as {
      authorization: ExactCasperAuthorization;
      signature:     string;
      publicKey:     string;
      resourceUrl?:  string;
    };

    if (!authorization?.nonce || !signature || !signerPublicKey) {
      res.status(400).json({ error: "authorization, signature, and publicKey are required" }); return;
    }

    // Verify the authorization was prepared by us
    const pending = pendingAuths.get(authorization.nonce);
    if (!pending) {
      res.status(400).json({ error: "Unknown authorization nonce — prepare a payment first" }); return;
    }
    pendingAuths.delete(authorization.nonce);

    const paymentPayload: PaymentPayload = {
      x402Version: 2,
      resource:    { url: resourceUrl ?? `https://guildnet.io/agents/pay` },
      accepted: {
        scheme:            "exact",
        network:           config.x402.network,
        asset:             config.x402.assetPackage,
        amount:            authorization.value,
        payTo:             authorization.to,
        maxTimeoutSeconds: config.x402.timeoutSeconds,
      },
      payload: {
        signature,
        publicKey: signerPublicKey,
        authorization,
      },
    };

    const paymentRequirements: PaymentRequirements = {
      scheme:            "exact",
      network:           config.x402.network,
      payTo:             authorization.to,
      amount:            authorization.value,
      asset:             config.x402.assetPackage,
      maxTimeoutSeconds: config.x402.timeoutSeconds,
      extra: {
        name:     config.x402.tokenName,
        version:  config.x402.tokenVersion,
        decimals: String(config.x402.tokenDecimals),
        symbol:   "CSPR",
      },
    };

    // POST to facilitator /verify
    const verifyResult = await fetch(`${config.x402FacilitatorUrl}/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": config.csprCloudAuthToken,
      },
      body: JSON.stringify({ paymentPayload, paymentRequirements }),
    });

    if (!verifyResult.ok) {
      const text = await verifyResult.text().catch(() => "");
      res.status(502).json({ error: `Facilitator /verify failed: ${text}` }); return;
    }

    const verifyData = await verifyResult.json() as { isValid: boolean; invalidReason?: string; invalidMessage?: string };
    if (!verifyData.isValid) {
      res.status(400).json({
        error: `Verification rejected: ${verifyData.invalidReason} — ${verifyData.invalidMessage}`
      }); return;
    }

    // POST to facilitator /settle
    const settleResult = await fetch(`${config.x402FacilitatorUrl}/settle`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": config.csprCloudAuthToken,
      },
      body: JSON.stringify({ paymentPayload, paymentRequirements }),
    });

    if (!settleResult.ok) {
      const text = await settleResult.text().catch(() => "");
      res.status(502).json({ error: `Facilitator /settle failed: ${text}` }); return;
    }

    const settleData = await settleResult.json() as SettleResult;
    if (!settleData.success) {
      res.status(400).json({
        error: `Settlement failed: ${settleData.errorReason} — ${settleData.errorMessage}`
      }); return;
    }

    console.log(`[x402] ✓ CSPR.click-signed payment settled. Deploy: ${settleData.transaction}`);
    console.log(`[x402] Explorer: https://testnet.cspr.live/deploy/${settleData.transaction}`);

    res.json({
      success: true,
      transactionHash: settleData.transaction,
      explorerLink: `https://testnet.cspr.live/deploy/${settleData.transaction}`,
      network: settleData.network,
      payer: settleData.payer,
    });
  } catch (err) { next(err); }
});

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[Server error]", err.message);
  res.status(500).json({ error: err.message });
});

app.listen(config.port, () => {
  console.log(`[GuildNet] Backend running on port ${config.port}`);
  console.log(`[GuildNet] Network: ${config.casperChainName}`);
  console.log(`[GuildNet] TaskCoordinator: ${config.contracts.taskCoordinator}`);
  console.log(`[GuildNet] x402 Facilitator: ${config.x402FacilitatorUrl}`);
});
