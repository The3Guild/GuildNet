import { veniceChat } from "./venice.js";

export interface ProjectFile { path: string; content: string; }
export interface BuildPlan {
  stack: string;
  framework: string;
  files: string[];
  installCmd: string;
  buildCmd: string;
  devCmd: string;
  description: string;
}

const MODEL = "mistral-small-3-2-24b-instruct";

function parseJSON<T>(raw: string): T {
  const cleaned = raw.replace(/^```[a-z]*\n?/gm, "").replace(/^```\n?/gm, "").trim();
  try { return JSON.parse(cleaned) as T; } catch {}
  const objMatch = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (objMatch) { try { return JSON.parse(objMatch[1]) as T; } catch {} }
  const repaired = cleaned.replace(/,\s*$/, "") + (cleaned.startsWith("[") ? "]" : "}");
  try { return JSON.parse(repaired) as T; } catch {}
  throw new Error(`JSON parse failed: ${cleaned.slice(0, 200)}`);
}

// ── Architect ─────────────────────────────────────────────────────────────────
export async function runArchitect(prompt: string): Promise<BuildPlan> {
  const SYSTEM = `You are a senior software architect. Output ONLY a JSON object — no explanation, no markdown.

Format:
{
  "stack": "Next.js 14 + Tailwind + TypeScript",
  "framework": "nextjs",
  "files": ["package.json","tsconfig.json","tailwind.config.js","src/app/layout.tsx","src/app/page.tsx","src/app/globals.css"],
  "installCmd": "npm install",
  "buildCmd": "npm run build",
  "devCmd": "npm run dev",
  "description": "one sentence"
}

Rules:
- framework must be: "nextjs" | "vite-react" | "vite-vanilla"
- Always include package.json with ALL dependencies
- For e-commerce: Next.js + Tailwind + TypeScript + API routes in src/app/api/
- For dApp: Next.js + wagmi + viem + Tailwind
- List EVERY file path — components, pages, API routes, styles, config
- Max 15 files for simplicity`;

  const raw = await veniceChat(SYSTEM, `Build this: ${prompt}`, MODEL);
  return parseJSON<BuildPlan>(raw);
}

// ── Generate one file at a time ───────────────────────────────────────────────
async function generateFile(
  filePath: string,
  prompt: string,
  plan: BuildPlan,
  existingFiles: ProjectFile[]
): Promise<ProjectFile> {
  const ext = filePath.split(".").pop() ?? "";
  const isConfig = ["json","toml","js","ts"].includes(ext) && !filePath.includes("app/");
  const isStyle  = ext === "css";
  const isApi    = filePath.includes("/api/");
  const isUI     = ["tsx","jsx"].includes(ext);

  const context = existingFiles.length > 0
    ? `\nExisting files for reference:\n${existingFiles.slice(0,3).map(f => `// ${f.path}\n${f.content.slice(0,300)}`).join("\n\n")}`
    : "";

  const SYSTEM = isConfig
    ? `Output ONLY the complete file content for ${filePath}. No explanation.`
    : isStyle
    ? `Output ONLY complete CSS for ${filePath}. Use Tailwind @layer directives. No explanation.`
    : isApi
    ? `You are a backend engineer. Output ONLY complete TypeScript for the API route ${filePath}. Use Next.js App Router API conventions (export async function GET/POST). Include real in-memory or mock data. No explanation.`
    : isUI
    ? `You are a senior React/Next.js engineer. Output ONLY complete TypeScript/TSX for ${filePath}. Use Tailwind CSS. Make it visually polished, dark theme. Include real functionality (forms work, buttons do something, state management). No TODOs. No explanation.`
    : `Output ONLY complete TypeScript for ${filePath}. No explanation.`;

  const userMsg = `Product: ${prompt}\nStack: ${plan.stack}\nFile to generate: ${filePath}${context}`;
  const content = await veniceChat(SYSTEM, userMsg, MODEL);

  // Strip any accidental markdown fences
  const clean = content.replace(/^```[a-z]*\n?/gm, "").replace(/^```\n?/gm, "").trim();
  return { path: filePath, content: clean };
}

// ── Coder: generate files in parallel batches ─────────────────────────────────
export async function runCoder(prompt: string, plan: BuildPlan): Promise<ProjectFile[]> {
  const files: ProjectFile[] = [];
  const BATCH_SIZE = 4;

  // Always generate package.json first so other files can reference it
  const configFiles = plan.files.filter(f =>
    f === "package.json" || f === "tsconfig.json" || f.endsWith(".config.js") || f.endsWith(".config.ts")
  );
  const otherFiles = plan.files.filter(f => !configFiles.includes(f));

  // Batch 1: config files
  const configResults = await Promise.all(
    configFiles.map(f => generateFile(f, prompt, plan, []))
  );
  files.push(...configResults);

  // Batch 2+: remaining files in parallel batches of BATCH_SIZE
  for (let i = 0; i < otherFiles.length; i += BATCH_SIZE) {
    const batch = otherFiles.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(f => generateFile(f, prompt, plan, files.slice(0, 2)))
    );
    files.push(...results);
  }

  return files;
}

// ── Designer: polish UI files ─────────────────────────────────────────────────
export async function runDesigner(prompt: string, files: ProjectFile[]): Promise<ProjectFile[]> {
  const uiFiles = files.filter(f => /\.(tsx|jsx|css)$/.test(f.path) && !f.path.includes("config"));
  if (uiFiles.length === 0) return files;

  const SYSTEM = `You are a senior UI engineer. Improve the visual design of these files. Make them dark, modern, professional with Tailwind. Keep ALL logic identical. Output ONLY a JSON array: [{"path":"...","content":"..."}]. No explanation.`;

  // Polish at most 4 UI files to avoid timeout
  const toPolish = uiFiles.slice(0, 4);
  const polished = await Promise.all(toPolish.map(async f => {
    try {
      const raw = await veniceChat(SYSTEM, `Product: ${prompt}\n\nFile: ${f.path}\n\n${f.content.slice(0, 2000)}`, MODEL);
      const arr = parseJSON<ProjectFile[]>(raw);
      return arr[0] ?? f;
    } catch { return f; }
  }));

  const map = new Map(files.map(f => [f.path, f]));
  for (const f of polished) map.set(f.path, f);
  return Array.from(map.values());
}

// ── Reviewer: fix bugs ────────────────────────────────────────────────────────
export async function runReviewer(prompt: string, files: ProjectFile[]): Promise<ProjectFile[]> {
  const srcFiles = files.filter(f => /\.(ts|tsx)$/.test(f.path)).slice(0, 4);
  if (srcFiles.length === 0) return files;

  const SYSTEM = `You are a TypeScript expert. Fix any import errors, missing types, or bugs in these files. Output ONLY a JSON array of fixed files: [{"path":"...","content":"..."}]. If nothing is wrong, output [].`;

  try {
    const raw = await veniceChat(SYSTEM,
      `Product: ${prompt}\n\nFiles:\n${JSON.stringify(srcFiles.map(f => ({ path: f.path, content: f.content.slice(0, 1000) })))}`,
      MODEL
    );
    const fixes = parseJSON<ProjectFile[]>(raw);
    const map = new Map(files.map(f => [f.path, f]));
    for (const f of fixes) map.set(f.path, f);
    return Array.from(map.values());
  } catch { return files; }
}
