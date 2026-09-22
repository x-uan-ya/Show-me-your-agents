import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const backendDir = path.join(projectRoot, "backend");
const python = path.join(
  backendDir,
  ".venv",
  process.platform === "win32" ? "Scripts" : "bin",
  process.platform === "win32" ? "python.exe" : "python",
);
const recipient = process.argv[2]?.trim();

if (!recipient) {
  console.error("Usage: npm run test:email -- you@example.com");
  process.exit(1);
}
if (!existsSync(python)) {
  console.error("Backend virtual environment not found. Run `npm run setup` first.");
  process.exit(1);
}

const result = spawnSync(
  python,
  ["-m", "app.scripts.send_test_email", recipient],
  { cwd: backendDir, env: process.env, stdio: "inherit", windowsHide: false },
);
process.exit(result.status ?? 1);
