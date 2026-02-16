-- Add status column to messages if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'status') THEN
        ALTER TABLE public.messages ADD COLUMN status TEXT DEFAULT 'sent';
    END IF;
END $$;

-- Add index on external_message_id for faster lookups during webhook processing
CREATE INDEX IF NOT EXISTS idx_messages_external_id ON public.messages(external_message_id);

-- Add failure_reason column for failed messages
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'failure_reason') THEN
        ALTER TABLE public.messages ADD COLUMN failure_reason TEXT;
    END IF;
END $$;
