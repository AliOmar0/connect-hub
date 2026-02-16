-- Add classification column to messages table
ALTER TABLE public.messages
ADD COLUMN IF NOT EXISTS classification TEXT;
