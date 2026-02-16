# WhatsApp Configuration Guide

Based on the details you provided, here are the steps to finalize your WhatsApp integration.

## 1. Enter Credentials in App

Go to your **Connect Hub Settings Page** (Integration Tab) and enter the following values for **WhatsApp Business**:

- **Phone Number ID**: ``
- **Business Account ID**: ``
- **Access Token**: Copy the long string starting with `EA...` from the Facebook page (under "Access Token" / "رمز الوصول") and paste it here.

> **Note**: The temporary token lasts only 24 hours. For production, you will need a System User Access Token.

## 2. Deploy the Backend Function

Open a terminal in your project folder and run:

```bash
supabase functions deploy whatsapp --no-verify-jwt
```

## 3. Configure Webhook (Facebook Developer Console)

Go back to the Facebook page where you copied the IDs (Step 3 "تكوين Webhooks") and configure:

- **Callback URL**: `https://natxxgvlkdclejswvxha.supabase.co/functions/v1/whatsapp`
- **Verify Token**: `whatsapp`

## 4. Test

1. Send a message from your _personal WhatsApp_ to the _Test Number_ (``).
2. It should appear in your **Connect Hub Sessions Page** immediately.
3. You can reply from the Connect Hub app.
