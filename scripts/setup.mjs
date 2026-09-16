import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const backendDir = path.join(projectRoot, "backend");
const frontendDir = path.join(projectRoot, "frontend");
const venvDir = path.join(backendDir, ".venv");
const venvPython = path.join(
  venvDir,
  process.platform === "win32" ? "Scripts" : "bin",
  process.platform === "win32" ? "python.exe" : "python",
);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? projectRoot,
    env: process.env,
    stdio: "inherit",
    windowsHide: false,
  });
  if (result.error) {
    console.error(`Could not run ${command}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function findPython() {
  const configured = process.env.PYTHON;
  const candidates = configured
    ? [[configured, []]]
    : process.platform === "win32"
      ? [
          ["py", ["-3"]],
          ["python", []],
          ["python3", []],
        ]
      : [
          ["python3", []],
          ["python", []],
        ];

  for (const [command, prefixArgs] of candidates) {
    const result = spawnSync(
      command,
      [
        ...prefixArgs,
        "-c",
        "import sys; raise SystemExit(0 if sys.version_info >= (3, 11) else 1)",
      ],
      {
        stdio: "ignore",
        windowsHide: true,
      },
    );
    if (!result.error && result.status === 0) return { command, prefixArgs };
  }

  console.error("Python 3 was not found. Install Python 3.11 or newer first.");
  process.exit(1);
}

if (!existsSync(venvPython)) {
  const python = findPython();
  console.log("[setup] Creating backend virtual environment...");
  run(python.command, [...python.prefixArgs, "-m", "venv", venvDir]);
}

console.log("[setup] Installing backend dependencies...");
run(venvPython, ["-m", "pip", "install", "-r", "requirements.txt"], {
  cwd: backendDir,
});

console.log("[setup] Installing frontend dependencies...");
run(process.platform === "win32" ? "npm.cmd" : "npm", ["install"], {
  cwd: frontendDir,
});

console.log("[setup] Complete. Start both services with `npm run dev`.");
