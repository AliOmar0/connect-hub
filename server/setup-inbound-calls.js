import 'dotenv/config';
import twilio from 'twilio';

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const phoneNumber = process.env.TWILIO_PHONE_NUMBER;
const ngrokUrl = process.env.NGROK_URL;

async function setupInboundCalls() {
    try {
        console.log(`\n🔍 Searching for Twilio number: ${phoneNumber}`);

        // Find the phone number
        const numbers = await client.incomingPhoneNumbers.list({ phoneNumber });

        if (numbers.length === 0) {
            console.error(`❌ Phone number ${phoneNumber} not found in your Twilio account`);
            return;
        }

        const number = numbers[0];
        console.log(`✅ Found number: ${number.friendlyName}`);

        // Update the voice URL
        const voiceUrl = `${ngrokUrl}/voice`;
        console.log(`\n📞 Configuring inbound calls to: ${voiceUrl}`);

        await client.incomingPhoneNumbers(number.sid).update({
            voiceUrl: voiceUrl,
            voiceMethod: 'POST'
        });

        console.log(`\n✅ SUCCESS! Inbound calls are now enabled!`);
        console.log(`\n📱 You can now call ${phoneNumber} from your phone`);
        console.log(`   The AI will answer and speak to you in Arabic\n`);

    } catch (error) {
        console.error(`\n❌ Error: ${error.message}\n`);
    }
}

setupInboundCalls();
