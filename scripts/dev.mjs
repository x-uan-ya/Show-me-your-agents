import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const backendDir = path.join(projectRoot, "backend");
const frontendDir = path.join(projectRoot, "frontend");
const target = process.argv[2] ?? "all";

if (!new Set(["all", "backend", "frontend"]).has(target)) {
  console.error(`Unknown development target: ${target}`);
  console.error("Use one of: all, backend, frontend.");
  process.exit(1);
}

const venvPython = path.join(
  backendDir,
  ".venv",
  process.platform === "win32" ? "Scripts" : "bin",
  process.platform === "win32" ? "python.exe" : "python",
);
const viteEntry = path.join(
  frontendDir,
  "node_modules",
  "vite",
  "bin",
  "vite.js",
);

function requireFile(filePath, message) {
  if (existsSync(filePath)) return;
  console.error(message);
  console.error("Run `npm run setup` from the project root, then try again.");
  process.exit(1);
}

const specs = [];

if (target === "all" || target === "backend") {
  requireFile(venvPython, `Backend virtual environment not found: ${venvPython}`);
  specs.push({
    name: "backend",
    command: venvPython,
    args: [
      "-m",
      "uvicorn",
      "app.main:app",
      "--reload",
      "--host",
      "127.0.0.1",
      "--port",
      "8000",
    ],
    cwd: backendDir,
  });
}

if (target === "all" || target === "frontend") {
  requireFile(viteEntry, `Frontend dependencies not found: ${viteEntry}`);
  specs.push({
    name: "frontend",
    command: process.execPath,
    args: [viteEntry, "--host", "127.0.0.1"],
    cwd: frontendDir,
  });
}

const children = [];
let stopping = false;

function stop(exitCode) {
  if (stopping) return;
  stopping = true;
  process.exitCode = exitCode;
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) child.kill();
  }
}

for (const spec of specs) {
  console.log(`[dev] Starting ${spec.name}...`);
  const child = spawn(spec.command, spec.args, {
    cwd: spec.cwd,
    env: process.env,
    stdio: "inherit",
    windowsHide: false,
  });
  children.push(child);

  child.on("error", (error) => {
    console.error(`[dev] Could not start ${spec.name}: ${error.message}`);
    stop(1);
  });

  child.on("exit", (code, signal) => {
    if (stopping) return;
    const reason = signal ? `signal ${signal}` : `code ${code ?? 1}`;
    console.error(`[dev] ${spec.name} exited with ${reason}.`);
    stop(code ?? 1);
  });
}

process.on("SIGINT", () => stop(130));
process.on("SIGTERM", () => stop(143));
