-- Add main_type_id to sessions table
ALTER TABLE public.sessions
ADD COLUMN IF NOT EXISTS main_type_id UUID REFERENCES public.session_main_types(id);


-- Add classification column to messages table
ALTER TABLE public.messages
ADD COLUMN IF NOT EXISTS classification TEXT;
