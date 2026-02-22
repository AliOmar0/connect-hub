import 'dotenv/config';

console.log("=== Checking Twilio Environment Variables ===");

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const apiKey = process.env.TWILIO_API_KEY;
const apiSecret = process.env.TWILIO_API_SECRET;
const appSid = process.env.TWIML_APP_SID;

function check(val, prefix) {
    if (!val) return "❌ MISSING";
    if (prefix && !val.startsWith(prefix)) return `❌ INVALID (Expected '${prefix}...')`;
    return "✅ OK";
}

function checkLength(val) {
    if (!val) return "❌ MISSING";
    if (val.length < 20) return "❌ TOO SHORT";
    return "✅ OK";
}

console.log(`TWILIO_ACCOUNT_SID: ${check(accountSid, 'AC')}`);
console.log(`TWILIO_API_KEY:     ${check(apiKey, 'SK')}`);
console.log(`TWILIO_API_SECRET:  ${checkLength(apiSecret)}`);
console.log(`TWIML_APP_SID:      ${check(appSid, 'AP')}`);
