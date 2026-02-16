-- Create table for Session Main Types
CREATE TABLE IF NOT EXISTS public.session_main_types (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.session_main_types ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Enable read access for all users" ON public.session_main_types
    FOR SELECT USING (true);

CREATE POLICY "Enable insert for authenticated users" ON public.session_main_types
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable delete for authenticated users" ON public.session_main_types
    FOR DELETE USING (auth.role() = 'authenticated');

-- Insert default types
INSERT INTO public.session_main_types (name) VALUES
    ('استفسارات عامة'),
    ('الفروع'),
    ('الرواتب'),
    ('الحسابات')
ON CONFLICT (name) DO NOTHING;
