import 'dotenv/config';

console.log("=== Checking Vapi Environment Variables ===");

const apiKey = process.env.VAPI_API_KEY;
const publicKey = process.env.VAPI_PUBLIC_KEY;
const assistantId = process.env.VAPI_ASSISTANT_ID;
const phoneNumberId = process.env.VAPI_PHONE_NUMBER_ID;
const serverSecret = process.env.VAPI_SERVER_SECRET;

function check(val) {
    if (!val) return "❌ MISSING";
    return "✅ OK";
}

function checkOptional(val) {
    if (!val) return "⚠️  NOT SET (optional)";
    return "✅ OK";
}

console.log(`VAPI_API_KEY:         ${check(apiKey)}`);
console.log(`VAPI_PUBLIC_KEY:      ${check(publicKey)}`);
console.log(`VAPI_ASSISTANT_ID:    ${check(assistantId)}`);
console.log(`VAPI_PHONE_NUMBER_ID: ${check(phoneNumberId)}`);
console.log(`VAPI_SERVER_SECRET:   ${checkOptional(serverSecret)}`);

const missingRequired = [
    ["VAPI_API_KEY", apiKey],
    ["VAPI_PUBLIC_KEY", publicKey],
    ["VAPI_ASSISTANT_ID", assistantId],
    ["VAPI_PHONE_NUMBER_ID", phoneNumberId],
].filter(([, v]) => !v);

if (missingRequired.length) {
    console.log(`\n❌ Missing: ${missingRequired.map(([k]) => k).join(", ")}`);
    process.exitCode = 1;
} else {
    console.log("\n✅ All required Vapi variables are set.");
}
