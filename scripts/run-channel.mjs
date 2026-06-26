#!/usr/bin/env node
/**
 * Single-channel launcher for connect-hub.
 *
 * Runs EXACTLY ONE public channel at a time (its backend service + its own
 * ngrok tunnel), in one terminal with colored, prefixed output. This is the
 * recommended way to run on the free ngrok plan, which allows only one tunnel
 * at a time, and it lets you run each channel on a separate laptop.
 *
 *   WhatsApp channel  -> Python backend (port 5000, path /webhook)  -> Active AI Sessions
 *   Voice channel     -> Node API      (port 3001, Twilio voice)    -> phone calls
 *
 * Usage:
 *   node scripts/run-channel.mjs whatsapp     # or:  npm run channel:whatsapp
 *   node scripts/run-channel.mjs voice        # or:  npm run channel:voice
 *   node scripts/run-channel.mjs whatsapp --no-tunnel   # backend only, no ngrok
 *
 * Per-laptop config (root .env):
 *   NGROK_AUTHTOKEN          your ngrok authtoken (each laptop uses its own)
 *   WHATSAPP_NGROK_URL       reserved domain for the WhatsApp channel
 *   VOICE_NGROK_URL          reserved domain for the Voice channel (falls back to NGROK_URL)
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const isWin = process.platform === 'win32';

// Load root .env so domains/authtoken are available without exporting them.
try {
  const { config } = await import('dotenv');
  config({ path: join(ROOT, '.env') });
} catch {
  /* dotenv optional; env may already be set by the shell */
}

const venvPython = isWin
  ? join(ROOT, '.venv-backend', 'Scripts', 'python.exe')
  : join(ROOT, '.venv-backend', 'bin', 'python');
const PY = existsSync(venvPython) ? venvPython : isWin ? 'python' : 'python3';

const venvNgrok = isWin
  ? join(ROOT, '.venv-backend', 'Scripts', 'ngrok.exe')
  : join(ROOT, '.venv-backend', 'bin', 'ngrok');
const NGROK = existsSync(venvNgrok) ? venvNgrok : 'ngrok';

const COLORS = ['\x1b[36m', '\x1b[32m', '\x1b[35m', '\x1b[33m'];
const RESET = '\x1b[0m';
const DIM = '\x1b[2m';

const CHANNELS = {
  whatsapp: {
    title: 'WhatsApp',
    port: 5000,
    path: '/webhook',
    domainEnv: ['WHATSAPP_NGROK_URL'],
    services: [
      {
        label: 'whatsapp',
        cmd: PY,
        args: ['-m', 'uvicorn', 'app.main:app', '--host', '0.0.0.0', '--port', '5000'],
        cwd: join(ROOT, 'whatsapp-support-backend'),
      },
    ],
  },
  voice: {
    title: 'Voice (Twilio)',
    port: 3001,
    path: '/voice',
    domainEnv: ['VOICE_NGROK_URL', 'NGROK_URL'],
    services: [
      { label: 'node-api', cmd: process.execPath, args: [join('server', 'index.js')], cwd: ROOT },
      { label: 'edge-tts', cmd: PY, args: ['edge_tts_server.py'], cwd: ROOT },
    ],
  },
};

// --- Parse args ---
const args = process.argv.slice(2);
const channelKey = (args.find((a) => !a.startsWith('-')) || '').toLowerCase();
const noTunnel = args.includes('--no-tunnel');
const channel = CHANNELS[channelKey];

if (!channel) {
  console.error(`Usage: node scripts/run-channel.mjs <whatsapp|voice> [--no-tunnel]`);
  process.exit(1);
}

// Resolve the public domain for this channel. Strip any protocol/trailing slash
// so it works whether the env value is "https://foo.ngrok-free.dev" or "foo.ngrok-free.dev".
const rawDomain = channel.domainEnv.map((k) => process.env[k]).find(Boolean);
const domain = rawDomain ? rawDomain.replace(/^https?:\/\//, '').replace(/\/+$/, '') : undefined;
const authtoken = process.env.NGROK_AUTHTOKEN;

if (!noTunnel) {
  if (!domain) {
    console.error(
      `No ngrok domain configured. Set ${channel.domainEnv[0]} in .env, ` +
        `or run with --no-tunnel to start the backend only.`
    );
    process.exit(1);
  }
  // Make sure this laptop's ngrok agent is authenticated.
  if (authtoken) {
    const r = spawnSync(NGROK, ['config', 'add-authtoken', authtoken], { encoding: 'utf8' });
    if (r.status !== 0) {
      console.error(`${DIM}[launcher] Could not set ngrok authtoken: ${r.stderr || r.stdout}${RESET}`);
    }
  } else {
    console.log(
      `${DIM}[launcher] NGROK_AUTHTOKEN not set in .env. Assuming this laptop's ngrok ` +
        `is already authenticated (ngrok config add-authtoken <token>).${RESET}`
    );
  }
}

console.log(
  `${DIM}[launcher] Channel: ${channel.title} | backend port ${channel.port}` +
    (noTunnel ? ' | tunnel: OFF' : ` | https://${domain}${channel.path}`) +
    `${RESET}\n`
);

const tasks = [...channel.services];
if (!noTunnel) {
  tasks.push({
    label: 'ngrok   ',
    cmd: NGROK,
    args: ['http', `--url=${domain}`, String(channel.port)],
    cwd: ROOT,
  });
}

const children = [];
let shuttingDown = false;
let running = 0;

tasks.forEach((svc, i) => {
  const color = COLORS[i % COLORS.length];
  const prefix = `${color}[${svc.label}]${RESET} `;

  if (svc.cwd !== ROOT && !existsSync(svc.cwd)) {
    console.log(`${prefix}skipped (folder not found: ${svc.cwd})`);
    return;
  }

  const child = spawn(svc.cmd, svc.args, {
    cwd: svc.cwd,
    env: { ...process.env, PYTHONUNBUFFERED: '1', FORCE_COLOR: '1' },
    shell: false,
  });
  children.push({ child, label: svc.label });
  running++;

  const pipe = (stream, isErr) => {
    let buf = '';
    stream.on('data', (chunk) => {
      buf += chunk.toString();
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? '';
      for (const line of lines) process[isErr ? 'stderr' : 'stdout'].write(`${prefix}${line}\n`);
    });
    stream.on('end', () => {
      if (buf) process[isErr ? 'stderr' : 'stdout'].write(`${prefix}${buf}\n`);
    });
  };
  pipe(child.stdout, false);
  pipe(child.stderr, true);

  child.on('exit', (code, signal) => {
    running--;
    process.stdout.write(`${prefix}${DIM}exited (code=${code} signal=${signal})${RESET}\n`);
    if (running <= 0 && !shuttingDown) {
      process.stdout.write(`${DIM}[launcher] Channel stopped.${RESET}\n`);
      process.exit(0);
    }
  });
  child.on('error', (err) => {
    process.stderr.write(`${prefix}failed to start: ${err.message}\n`);
  });
});

if (children.length === 0) {
  console.error('No processes started.');
  process.exit(1);
}

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n${DIM}[launcher] Shutting down...${RESET}`);
  for (const { child } of children) {
    try {
      child.kill(isWin ? undefined : 'SIGTERM');
    } catch {
      /* ignore */
    }
  }
  setTimeout(() => process.exit(0), 500);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
