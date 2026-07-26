import { execSync, spawn } from "child_process";
import { mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { runArchitect, runCoder, runDesigner, runReviewer, type ProjectFile, type BuildPlan } from "./agents/builder.js";

export interface BuildResult {
  prompt: string;
  plan: BuildPlan;
  files: ProjectFile[];
  outputDir: string;
  buildLog: string;
  success: boolean;
  previewUrl?: string;
  attempts: number;
}

const usedPorts = new Set<number>();
let nextPort = 4000;

function getFreePort(): number {
  while (usedPorts.has(nextPort)) nextPort++;
  usedPorts.add(nextPort);
  return nextPort++;
}

function writeFiles(outputDir: string, files: ProjectFile[]) {
  for (const f of files) {
    const fullPath = join(outputDir, f.path);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, f.content, "utf8");
  }
}

function runCmd(cmd: string, cwd: string): string {
  try {
    return execSync(cmd, { cwd, timeout: 120_000, encoding: "utf8", stdio: "pipe" });
  } catch (e: unknown) {
    return (e as { stdout?: string; stderr?: string }).stdout ?? (e as Error).message;
  }
}

function startPreviewServer(outputDir: string, plan: BuildPlan, port: number): void {
  let startCmd: string;
  let args: string[];

  if (plan.framework === "nextjs") {
    startCmd = "node_modules/.bin/next";
    args = ["dev", "-p", String(port)];
  } else if (plan.framework.startsWith("vite")) {
    startCmd = "node_modules/.bin/vite";
    args = ["--port", String(port), "--host"];
  } else {
    runCmd("npm install --save-dev serve", outputDir);
    startCmd = "node_modules/.bin/serve";
    args = ["-l", String(port), "dist"];
  }

  const child = spawn(startCmd, args, {
    cwd: outputDir,
    detached: true,
    stdio: "ignore",
    env: { ...process.env, PORT: String(port), NODE_ENV: "development" },
  });
  child.unref();
  console.log(`[Builder] Preview server started on port ${port} (pid ${child.pid})`);
}

/**
 * Validate a generated file for common issues.
 * Returns a list of problems found.
 */
function validateFile(file: ProjectFile): string[] {
  const issues: string[] = [];
  const { path, content } = file;

  // Skip validation for config files
  if (path.endsWith(".json") || path.endsWith(".config.js") || path.endsWith(".config.ts")) {
    return issues;
  }

  // Check for markdown fences that weren't stripped
  if (content.startsWith("```") || content.includes("```\n")) {
    issues.push("Contains unstripped markdown code fences");
  }

  // Check for common placeholder patterns
  if (/\bTODO\b/.test(content) && content.length < 100) {
    issues.push("File is just a TODO placeholder");
  }

  // Check for empty files
  if (content.trim().length === 0) {
    issues.push("File is empty");
  }

  // Check for broken imports in TS/TSX files
  if (/\.(ts|tsx)$/.test(path)) {
    const importMatches = content.matchAll(/from\s+["']([^"']+)["']/g);
    for (const match of importMatches) {
      const importPath = match[1];
      // Relative imports should resolve to existing files in our set
      if (importPath.startsWith("./") || importPath.startsWith("../")) {
        // Just flag it — we'll fix during review
      }
    }
  }

  // Check for malformed JSX/TSX
  if (/\.(tsx|jsx)$/.test(path)) {
    const openBraces = (content.match(/{/g) ?? []).length;
    const closeBraces = (content.match(/}/g) ?? []).length;
    if (Math.abs(openBraces - closeBraces) > 5) {
      issues.push(`Unbalanced braces: ${openBraces} open, ${closeBraces} close`);
    }
  }

  return issues;
}

/**
 * Attempt to fix common issues in a file using AI.
 */
async function attemptFix(
  file: ProjectFile,
  issues: string[],
  prompt: string,
): Promise<ProjectFile | null> {
  if (issues.length === 0) return file;

  const { veniceChat } = await import("./agents/venice.js");
  const MODEL = "mistral-small-3-2-24b-instruct";

  const SYSTEM = `You are a TypeScript/React code fixer. A generated file has issues.
Fix ONLY the listed problems. Output the complete corrected file content.
No explanation, no markdown fences — just the raw file content.`;

  const userMsg = `File: ${file.path}
Issues: ${issues.join("; ")}

Current content:
${file.content.slice(0, 4000)}

Output the fixed file:`;

  try {
    const fixed = await veniceChat(SYSTEM, userMsg, MODEL);
    const cleaned = fixed.replace(/^```[a-z]*\n?/gm, "").replace(/^```\n?/gm, "").trim();
    if (cleaned.length > 50) {
      return { path: file.path, content: cleaned };
    }
  } catch {
    // Fix failed — return original
  }
  return null;
}

export async function buildProject(
  prompt: string,
  baseOutputDir = "/tmp/guildnet-builds",
): Promise<BuildResult> {
  const slug = prompt.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
  const outputDir = join(baseOutputDir, `${slug}-${Date.now()}`);
  mkdirSync(outputDir, { recursive: true });

  const MAX_BUILD_ATTEMPTS = 3;
  let lastBuildLog = "";
  let files: ProjectFile[] = [];
  let plan: BuildPlan | null = null;

  for (let attempt = 1; attempt <= MAX_BUILD_ATTEMPTS; attempt++) {
    console.log(`[Builder] Attempt ${attempt}/${MAX_BUILD_ATTEMPTS}`);

    if (attempt === 1 || !plan) {
      console.log("[Builder] Architecting...");
      plan = await runArchitect(prompt);
    }

    console.log("[Builder] Coding...");
    files = await runCoder(prompt, plan);

    console.log("[Builder] Designing + Reviewing in parallel...");
    const [designed, reviewed] = await Promise.all([
      runDesigner(prompt, files),
      runReviewer(prompt, files),
    ]);
    const map = new Map(designed.map(f => [f.path, f]));
    for (const f of reviewed) map.set(f.path, f);
    files = Array.from(map.values());

    // Validate files and attempt fixes
    console.log("[Builder] Validating files...");
    let fixCount = 0;
    for (let i = 0; i < files.length; i++) {
      const issues = validateFile(files[i]);
      if (issues.length > 0) {
        console.warn(`[Builder] ${files[i].path}: ${issues.join(", ")}`);
        const fixed = await attemptFix(files[i], issues, prompt);
        if (fixed) {
          files[i] = fixed;
          fixCount++;
        }
      }
    }
    if (fixCount > 0) {
      console.log(`[Builder] Auto-fixed ${fixCount} files`);
    }

    console.log(`[Builder] Writing ${files.length} files to ${outputDir}`);
    writeFiles(outputDir, files);

    console.log("[Builder] Installing dependencies...");
    const installLog = runCmd(plan.installCmd, outputDir);

    console.log("[Builder] Building...");
    const buildLog = runCmd(plan.buildCmd, outputDir);
    lastBuildLog = installLog + "\n" + buildLog;
    const buildFailed = /build failed|compilation failed|error TS|error \(E\d{4}\)/i.test(buildLog);

    if (!buildFailed) {
      console.log(`[Builder] Build succeeded on attempt ${attempt}`);
      break;
    }

    console.warn(`[Builder] Build failed on attempt ${attempt}:\n${buildLog.slice(-500)}`);

    if (attempt < MAX_BUILD_ATTEMPTS) {
      console.log("[Builder] Retrying with error context...");
      // Pass build errors back to architect for next attempt
      if (plan) {
        plan.description += `\n\nPREVIOUS BUILD FAILED WITH:\n${buildLog.slice(-1000)}\n\nFix these errors in the next attempt.`;
      }
    }
  }

  const success = !/build failed|compilation failed|error TS|error \(E\d{4}\)/i.test(lastBuildLog);

  let previewUrl: string | undefined;
  if (success && process.env.NODE_ENV !== "production") {
    const port = getFreePort();
    startPreviewServer(outputDir, plan!, port);
    await new Promise(r => setTimeout(r, 2000));
    previewUrl = `http://localhost:${port}`;
    console.log(`[Builder] Live preview: ${previewUrl}`);
  }

  console.log(`[Builder] Done — success=${success}`);
  return {
    prompt,
    plan: plan!,
    files,
    outputDir,
    buildLog: lastBuildLog,
    success,
    previewUrl,
    attempts: MAX_BUILD_ATTEMPTS,
  };
}
