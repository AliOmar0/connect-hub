-- PIB Dummy Bank System Setup
-- Run this in Supabase SQL Editor

-- 1. Create Bank Accounts Table
CREATE TABLE IF NOT EXISTS public.bank_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_number TEXT UNIQUE NOT NULL,
    iban TEXT UNIQUE NOT NULL,
    balance NUMERIC(15, 2) DEFAULT 0.00,
    currency TEXT DEFAULT 'ILS',
    owner_name TEXT NOT NULL,
    owner_phone TEXT NOT NULL, -- Format: +970... or +972...
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create OTPs Table
CREATE TABLE IF NOT EXISTS public.bank_otps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_number TEXT NOT NULL,
    otp_code TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policies
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_otps ENABLE ROW LEVEL SECURITY;

-- Allow the service role (backend) to do everything
CREATE POLICY "Service Role Full Access" ON public.bank_accounts FOR ALL TO service_role USING (true);
CREATE POLICY "Service Role Full Access" ON public.bank_otps FOR ALL TO service_role USING (true);

-- Also allow anon/auth for this demo if needed, but safer to use service role from backend
CREATE POLICY "Public Read Access" ON public.bank_accounts FOR SELECT USING (true);
CREATE POLICY "Public All Access" ON public.bank_otps FOR ALL USING (true);

-- 3. Insert Dummy Data
INSERT INTO public.bank_accounts (account_number, iban, balance, currency, owner_name, owner_phone)
VALUES 
('12345678', 'PS12PIBK0000000012345678', 5250.75, 'ILS', 'Ali Omar', '+970599123456'),
('87654321', 'PS12PIBK0000000087654321', 12400.50, 'USD', 'Mohammed Ahmed', '+970599000000'),
('55556666', 'PS12PIBK0000000055556666', 315.00, 'ILS', 'Test User', '+970595123456');
