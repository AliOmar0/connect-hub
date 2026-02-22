# Email Confirmation Setup

## Issue

Email confirmations are being sent but may not be reaching users. This is common in development.

## Solutions

### Option 1: Disable Email Confirmation (Recommended for Development)

1. Go to your Supabase Dashboard: https://supabase.com/dashboard/project/riijdydwstwujgjwqvbe
2. Navigate to: Authentication > Providers > Email
3. Toggle OFF "Confirm email"
4. Save changes

### Option 2: Configure Custom SMTP (For Production)

1. Go to: Authentication > Settings > SMTP Settings
2. Configure your SMTP provider (SendGrid, AWS SES, etc.)
3. This ensures emails are delivered reliably

### Option 3: Manually Confirm Users (Quick Fix)

Run this SQL in the Supabase SQL Editor to confirm all existing users:

```sql
UPDATE auth.users
SET email_confirmed_at = NOW()
WHERE email_confirmed_at IS NULL;
```

### Option 4: Check Email Templates

1. Go to: Authentication > Email Templates
2. Verify the "Confirm signup" template is configured correctly
3. Check that the confirmation URL is correct

## Current Status

- Emails ARE being sent (confirmed in logs)
- Issue is likely email delivery or spam filtering
- For development, disabling confirmation is the fastest solution
