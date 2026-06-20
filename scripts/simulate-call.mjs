#!/usr/bin/env node
/**
 * Simulate a Twilio voice interaction locally - WITHOUT placing a real call
 * (so it costs zero Twilio credits).
 *
 * It calls the Node API's dev-only /api/test/voice endpoint, which runs the same
 * AI + OTP + account logic the phone path uses and returns the reply as JSON.
 * Unlike the raw /handle-speech webhook, this does NOT require a Twilio signature,
 * so it works no matter what TWILIO_VALIDATE_SIGNATURE is set to.
 *
 * Requirements:
 *   - Node API running (npm run backend)
 *   - NODE_ENV != production
 *
 * Usage:
 *   node scripts/simulate-call.mjs "السلام عليكم"
 *   node scripts/simulate-call.mjs "بدي اعرف رصيدي" --from "+970599000000"
 *   node scripts/simulate-call.mjs "مرحبا" --url http://localhost:3001
 */
import process from 'node:process';

const args = process.argv.slice(2);
let baseUrl = process.env.VITE_NODE_API_URL || 'http://localhost:3001';
let from = '+10000000000';
const phrases = [];

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--url') baseUrl = args[++i];
  else if (args[i] === '--from') from = args[++i];
  else phrases.push(args[i]);
}

const speech = phrases.join(' ') || 'السلام عليكم';
const sessionId = `sim_${Date.now()}`;

console.log(`\n  Simulating voice turn -> ${baseUrl}/api/test/voice`);
console.log(`  Session : ${sessionId}`);
console.log(`  From    : ${from}`);
console.log(`  Said    : "${speech}"\n`);

try {
  const res = await fetch(`${baseUrl}/api/test/voice`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: speech, sessionId, phone: from }),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error(`  HTTP ${res.status} ${res.statusText}`);
    if (res.status === 404) {
      console.error('  -> /api/test/voice not found. Is NODE_ENV=production? Test endpoints are dev-only.');
    }
    console.error(`  ${text}`);
    process.exit(1);
  }

  const data = JSON.parse(text);
  console.log(`  AI reply (${data.ttsProvider}):`);
  console.log(`  ${data.aiText}\n`);
} catch (err) {
  console.error(`  Request failed: ${err.message}`);
  console.error('  Is the Node API running?  npm run backend');
  process.exit(1);
}
