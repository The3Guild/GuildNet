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
}

// Track running preview servers so we can reuse ports
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
    // Use dev mode — more forgiving for generated code, no prod build needed
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

export async function buildProject(prompt: string, baseOutputDir = "/tmp/guildnet-builds"): Promise<BuildResult> {
  const slug = prompt.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
  const outputDir = join(baseOutputDir, `${slug}-${Date.now()}`);
  mkdirSync(outputDir, { recursive: true });

  console.log("[Builder] Architecting...");
  const plan = await runArchitect(prompt);

  console.log("[Builder] Coding...");
  let files = await runCoder(prompt, plan);

  console.log("[Builder] Designing + Reviewing in parallel...");
  const [designed, reviewed] = await Promise.all([
    runDesigner(prompt, files),
    runReviewer(prompt, files),
  ]);
  const map = new Map(designed.map(f => [f.path, f]));
  for (const f of reviewed) map.set(f.path, f);
  files = Array.from(map.values());

  console.log(`[Builder] Writing ${files.length} files to ${outputDir}`);
  writeFiles(outputDir, files);

  console.log("[Builder] Installing dependencies...");
  const installLog = runCmd(plan.installCmd, outputDir);

  console.log("[Builder] Building...");
  const buildLog = runCmd(plan.buildCmd, outputDir);
  const success = !(/build failed|compilation failed/i.test(buildLog));

  // Start live preview server (local dev only — not available on cloud deployments)
  let previewUrl: string | undefined;
  if (success && process.env.NODE_ENV !== "production") {
    const port = getFreePort();
    startPreviewServer(outputDir, plan, port);
    await new Promise(r => setTimeout(r, 2000));
    previewUrl = `http://localhost:${port}`;
    console.log(`[Builder] Live preview: ${previewUrl}`);
  }

  console.log(`[Builder] Done — success=${success}`);
  return { prompt, plan, files, outputDir, buildLog: installLog + "\n" + buildLog, success, previewUrl };
}
