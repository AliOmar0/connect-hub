import 'dotenv/config';
import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const phoneNumber = process.env.TWILIO_PHONE_NUMBER;
const ngrokUrl = process.env.NGROK_URL;

const client = twilio(accountSid, authToken);

async function configureInbound() {
    try {
        console.log(`Searching for Twilio number: ${phoneNumber}...`);

        const incomingNumbers = await client.incomingPhoneNumbers.list({ phoneNumber: phoneNumber });

        if (incomingNumbers.length === 0) {
            console.error("Number not found in your Twilio account. Please double-check TWILIO_PHONE_NUMBER in .env");
            return;
        }

        const sid = incomingNumbers[0].sid;
        console.log(`Found SID: ${sid}. Updating Webhook to: ${ngrokUrl}/voice`);

        await client.incomingPhoneNumbers(sid).update({
            voiceUrl: `${ngrokUrl}/voice`,
            voiceMethod: 'POST',
            statusCallback: `${ngrokUrl}/voice/status`,
            statusCallbackMethod: 'POST'
        });

        console.log("------------------------------------------------");
        console.log("✅ SUCCESS: Inbound calls are now ENABLED!");
        console.log(`You can now call ${phoneNumber} directly.`);
        console.log("------------------------------------------------");
    } catch (error) {
        console.error("❌ Setup failed:", error.message);
    }
}

configureInbound();
