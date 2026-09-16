import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const timeoutMs = 120_000;
const pollIntervalMs = 500;

const devProcess = spawn(npmCommand, ["run", "dev"], {
  cwd: projectRoot,
  detached: process.platform !== "win32",
  env: { ...process.env, CI: "1" },
  stdio: "inherit",
  windowsHide: false,
});

let stopping = false;

function stopProcessTree() {
  if (stopping) return;
  stopping = true;

  if (process.platform === "win32" && devProcess.pid) {
    spawnSync("taskkill", ["/pid", String(devProcess.pid), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true,
    });
    return;
  }

  if (devProcess.pid) {
    try {
      process.kill(-devProcess.pid, "SIGTERM");
    } catch {
      devProcess.kill("SIGTERM");
    }
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function responds(url) {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForServices() {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const [backendReady, frontendReady] = await Promise.all([
      responds("http://127.0.0.1:8000/api/health"),
      responds("http://127.0.0.1:5173/"),
    ]);
    if (backendReady && frontendReady) return;
    await delay(pollIntervalMs);
  }
  throw new Error(`Services did not become ready within ${timeoutMs / 1000}s.`);
}

const exitedBeforeReady = new Promise((_, reject) => {
  devProcess.once("error", (error) => {
    reject(new Error(`Could not start npm run dev: ${error.message}`));
  });
  devProcess.once("exit", (code, signal) => {
    if (stopping) return;
    const reason = signal ? `signal ${signal}` : `code ${code ?? 1}`;
    reject(new Error(`npm run dev exited before readiness with ${reason}.`));
  });
});

try {
  await Promise.race([waitForServices(), exitedBeforeReady]);
  console.log(`[smoke] PASS on ${process.platform}: frontend and backend responded.`);
} catch (error) {
  console.error(`[smoke] FAIL on ${process.platform}: ${error.message}`);
  process.exitCode = 1;
} finally {
  stopProcessTree();
}
