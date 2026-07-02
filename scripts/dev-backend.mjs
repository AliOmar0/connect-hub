#!/usr/bin/env node
/**
 * Unified backend launcher for connect-hub.
 *
 * Starts the backend services in ONE terminal with colored, prefixed output
 * instead of opening a separate terminal per service.
 *
 * Usage:
 *   node scripts/dev-backend.mjs                # default: node + tts  (free, no Twilio cost)
 *   node scripts/dev-backend.mjs node tts otp   # pick services explicitly
 *   node scripts/dev-backend.mjs all            # everything incl. heavy WhatsApp/Whisper backend
 *
 * Services:
 *   node  -> Node voice/API server      (server/index.js, port 3001)
 *   tts   -> Edge TTS server (free)      (edge_tts_server.py, port 5070)
 *   otp   -> OTP microservice            (otp-service/main.py, port 5001)
 *   wa    -> WhatsApp support backend    (whatsapp-support-backend, port 3001, heavy)
 *
 * Python services use the shared venv created by scripts/setup-backend.(ps1|sh).
 * Run that setup script once before using otp/tts/wa.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import process from "node:process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const isWin = process.platform === "win32";

// Resolve the python interpreter from the shared backend venv if present.
const venvPython = isWin
  ? join(ROOT, ".venv-backend", "Scripts", "python.exe")
  : join(ROOT, ".venv-backend", "bin", "python");
const PY = existsSync(venvPython) ? venvPython : isWin ? "python" : "python3";
const usingVenv = existsSync(venvPython);

const COLORS = ["\x1b[36m", "\x1b[32m", "\x1b[35m", "\x1b[33m"]; // cyan, green, magenta, yellow
const RESET = "\x1b[0m";
const DIM = "\x1b[2m";

const SERVICES = {
  node: {
    label: "node-api",
    cmd: process.execPath,
    args: [join("server", "index.js")],
    cwd: ROOT,
  },
  tts: {
    label: "edge-tts",
    cmd: PY,
    args: ["edge_tts_server.py"],
    cwd: ROOT,
    python: true,
  },
  otp: {
    label: "otp-svc ",
    cmd: PY,
    args: ["main.py"],
    cwd: join(ROOT, "otp-service"),
    python: true,
  },
  wa: {
    label: "whatsapp",
    cmd: PY,
    args: [
      "-m",
      "uvicorn",
      "app.main:app",
      "--host",
      "0.0.0.0",
      "--port",
      "3001",
    ],
    cwd: join(ROOT, "whatsapp-support-backend"),
    python: true,
  },
};

// --- Parse which services to run ---
let requested = process.argv.slice(2).map((s) => s.toLowerCase());
if (requested.includes("all")) requested = ["node", "tts", "otp", "wa"];
if (requested.length === 0) requested = ["node", "tts"]; // free default stack

const unknown = requested.filter((s) => !SERVICES[s]);
if (unknown.length) {
  console.error(`Unknown service(s): ${unknown.join(", ")}`);
  console.error(`Valid: ${Object.keys(SERVICES).join(", ")}, all`);
  process.exit(1);
}

const needsPython = requested.some((s) => SERVICES[s].python);
if (needsPython && !usingVenv) {
  console.log(
    `${DIM}[launcher] No .venv-backend found. Using system "${PY}". ` +
      `Run scripts/setup-backend.${isWin ? "ps1" : "sh"} first for an isolated env.${RESET}`,
  );
}

console.log(`${DIM}[launcher] Starting: ${requested.join(", ")}${RESET}\n`);

const children = [];
let shuttingDown = false;
let running = 0;

requested.forEach((key, i) => {
  const svc = SERVICES[key];
  const color = COLORS[i % COLORS.length];
  const prefix = `${color}[${svc.label}]${RESET} `;

  if (svc.python && svc.cwd !== ROOT && !existsSync(svc.cwd)) {
    console.log(`${prefix}skipped (folder not found: ${svc.cwd})`);
    return;
  }

  const child = spawn(svc.cmd, svc.args, {
    cwd: svc.cwd,
    env: { ...process.env, PYTHONUNBUFFERED: "1", FORCE_COLOR: "1" },
    shell: false,
  });
  children.push({ child, label: svc.label });
  running++;

  // Track missing-Python-dependency errors so we can print an actionable hint.
  let missingModule = false;

  const pipe = (stream, isErr) => {
    let buf = "";
    stream.on("data", (chunk) => {
      buf += chunk.toString();
      if (svc.python && buf.includes("ModuleNotFoundError"))
        missingModule = true;
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? "";
      for (const line of lines) {
        process[isErr ? "stderr" : "stdout"].write(`${prefix}${line}\n`);
      }
    });
    stream.on("end", () => {
      if (buf) process[isErr ? "stderr" : "stdout"].write(`${prefix}${buf}\n`);
    });
  };
  pipe(child.stdout, false);
  pipe(child.stderr, true);

  child.on("exit", (code, signal) => {
    running--;
    process.stdout.write(
      `${prefix}${DIM}exited (code=${code} signal=${signal})${RESET}\n`,
    );

    // One service crashing must NOT take down the others. Only print a hint and
    // keep the rest running. We exit the launcher only when ALL children stop.
    if (!shuttingDown && code && code !== 0) {
      if (missingModule && key === "wa") {
        process.stdout.write(
          `${prefix}${DIM}Missing deps for the WhatsApp backend. Install them with:${RESET}\n` +
            `${prefix}${DIM}  Windows : ./scripts/setup-backend.ps1 -IncludeWhatsApp${RESET}\n` +
            `${prefix}${DIM}  mac/linux: ./scripts/setup-backend.sh --with-whatsapp${RESET}\n` +
            `${prefix}${DIM}Continuing with the other services...${RESET}\n`,
        );
      } else if (missingModule) {
        process.stdout.write(
          `${prefix}${DIM}Missing Python deps. Run the setup script first:${RESET}\n` +
            `${prefix}${DIM}  npm run setup:backend${RESET}\n` +
            `${prefix}${DIM}Continuing with the other services...${RESET}\n`,
        );
      }
    }

    if (running <= 0 && !shuttingDown) {
      process.stdout.write(
        `${DIM}[launcher] All services have stopped.${RESET}\n`,
      );
      process.exit(0);
    }
  });
  child.on("error", (err) => {
    process.stderr.write(`${prefix}failed to start: ${err.message}\n`);
  });
});

if (children.length === 0) {
  console.error("No services started.");
  process.exit(1);
}

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n${DIM}[launcher] Shutting down...${RESET}`);
  for (const { child } of children) {
    try {
      child.kill(isWin ? undefined : "SIGTERM");
    } catch {
      /* ignore */
    }
  }
  setTimeout(() => process.exit(0), 500);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
