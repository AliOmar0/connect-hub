-- Run this script in your Supabase SQL Editor (https://supabase.com/dashboard/project/_/sql/new)

-- Option 1: Grant 'admin' role to ALL existing users (Recommended for dev)
UPDATE public.user_roles
SET role = 'admin';

-- Option 2: Grant 'admin' role to a specific email user
-- Uncomment and replace the email address
/*
UPDATE public.user_roles
SET role = 'admin'
FROM auth.users
WHERE public.user_roles.user_id = auth.users.id
AND auth.users.email = 'YOUR_EMAIL@EXAMPLE.COM';
*/

-- Verification: Check the results
SELECT u.email, ur.role 
FROM public.user_roles ur
JOIN auth.users u ON ur.user_id = u.id;
