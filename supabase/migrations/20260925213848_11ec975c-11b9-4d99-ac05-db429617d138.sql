CREATE TABLE public.users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  full_name TEXT,
  email TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.laptops (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  serial_number TEXT NOT NULL UNIQUE,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  model TEXT,
  registered_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT ON public.users TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.users TO authenticated;
GRANT ALL ON public.users TO service_role;

GRANT SELECT ON public.laptops TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.laptops TO authenticated;
GRANT ALL ON public.laptops TO service_role;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.laptops ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read owners" ON public.users FOR SELECT USING (true);
CREATE POLICY "Authenticated can insert owners" ON public.users FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update owners" ON public.users FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Anyone can read laptops" ON public.laptops FOR SELECT USING (true);
CREATE POLICY "Authenticated can insert laptops" ON public.laptops FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update laptops" ON public.laptops FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX laptops_serial_number_idx ON public.laptops (serial_number);