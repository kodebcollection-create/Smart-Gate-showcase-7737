-- Replace legacy prototype tables (serial-in-QR design)
DROP TABLE IF EXISTS public.laptops CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;

CREATE TYPE public.app_role AS ENUM ('student','guard','admin');
CREATE TYPE public.laptop_status AS ENUM ('active','lost','stolen','transferred');

CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- Roles
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "Read own roles" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

-- Profiles (owner passport photo lives here, one per student)
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  email text NOT NULL,
  username text UNIQUE,
  full_name text,
  photo_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own profile or staff read" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(),'guard') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Insert own profile" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid() AND email = (auth.jwt() ->> 'email'));
CREATE POLICY "Update own profile" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid() AND email = (auth.jwt() ->> 'email'));
CREATE TRIGGER profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Laptops
CREATE TABLE public.laptops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  secret_qr_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(), -- only value ever encoded in the QR
  serial_number text NOT NULL UNIQUE,
  model text,
  laptop_photo_path text NOT NULL,
  status public.laptop_status NOT NULL DEFAULT 'active',
  on_campus boolean NOT NULL DEFAULT false,
  registered_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX laptops_owner_idx ON public.laptops(owner_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.laptops TO authenticated;
GRANT ALL ON public.laptops TO service_role;
ALTER TABLE public.laptops ENABLE ROW LEVEL SECURITY;
-- Students see only their own devices; guards/admins may read all for verification
CREATE POLICY "Read own laptops or staff" ON public.laptops FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(),'guard') OR public.has_role(auth.uid(),'admin'));
-- Students may only insert rows they own; ownership cannot be spoofed
CREATE POLICY "Students insert own laptops" ON public.laptops FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid() AND public.has_role(auth.uid(),'student'));
-- Status edits and deletion are admin-only
CREATE POLICY "Admins update laptops" ON public.laptops FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins delete laptops" ON public.laptops FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER laptops_updated BEFORE UPDATE ON public.laptops
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Scan logs
CREATE TABLE public.scan_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  laptop_id uuid REFERENCES public.laptops(id) ON DELETE SET NULL,
  scanned_value text NOT NULL,
  result text NOT NULL,
  scanned_by uuid,
  scanned_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.scan_logs TO authenticated;
GRANT ALL ON public.scan_logs TO service_role;
ALTER TABLE public.scan_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read scan logs" ON public.scan_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- Gate entry / exit
CREATE TABLE public.gate_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  laptop_id uuid NOT NULL REFERENCES public.laptops(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  direction text NOT NULL CHECK (direction IN ('in','out')),
  guard_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gate_events TO authenticated;
GRANT ALL ON public.gate_events TO service_role;
ALTER TABLE public.gate_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner or staff read gate events" ON public.gate_events FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(),'guard') OR public.has_role(auth.uid(),'admin'));

-- Transfers
CREATE TABLE public.laptop_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  laptop_id uuid NOT NULL REFERENCES public.laptops(id) ON DELETE CASCADE,
  from_owner uuid NOT NULL,
  to_owner uuid NOT NULL,
  transferred_by uuid NOT NULL,
  transferred_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.laptop_transfers TO authenticated;
GRANT ALL ON public.laptop_transfers TO service_role;
ALTER TABLE public.laptop_transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read transfers" ON public.laptop_transfers FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- Auto-grant student role to verified CUK student emails
CREATE OR REPLACE FUNCTION public.claim_student_role() RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e text := lower(auth.jwt() ->> 'email');
BEGIN
  IF auth.uid() IS NULL OR e IS NULL OR e !~ '^[a-z0-9._%+-]+@student\.cuk\.ac\.ke$' THEN RETURN false; END IF;
  INSERT INTO public.user_roles(user_id, role) VALUES (auth.uid(),'student') ON CONFLICT DO NOTHING;
  RETURN true;
END $$;

-- Register or re-register; re-registration rotates the QR secret (old QR dies)
CREATE OR REPLACE FUNCTION public.register_laptop(_serial text, _model text, _photo_path text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s text := upper(trim(_serial)); existing public.laptops; new_secret uuid := gen_random_uuid();
BEGIN
  IF NOT public.has_role(auth.uid(),'student') THEN RAISE EXCEPTION 'Only students can register laptops'; END IF;
  IF s = '' THEN RAISE EXCEPTION 'Serial number is required'; END IF;
  IF _photo_path IS NULL OR _photo_path NOT LIKE auth.uid()::text || '/%' THEN RAISE EXCEPTION 'Laptop photo is required'; END IF;
  SELECT * INTO existing FROM public.laptops WHERE serial_number = s;
  IF FOUND THEN
    IF existing.owner_id <> auth.uid() THEN RAISE EXCEPTION 'Serial % is registered to another student', s; END IF;
    UPDATE public.laptops SET secret_qr_id = new_secret, model = NULLIF(trim(_model),''), laptop_photo_path = _photo_path,
      status = 'active', registered_at = now() WHERE id = existing.id;
  ELSE
    INSERT INTO public.laptops(owner_id, secret_qr_id, serial_number, model, laptop_photo_path)
    VALUES (auth.uid(), new_secret, s, NULLIF(trim(_model),''), _photo_path);
  END IF;
  RETURN new_secret;
END $$;

-- Guard lookup by QR secret; logs every attempt
CREATE OR REPLACE FUNCTION public.lookup_laptop(_token text)
RETURNS TABLE(laptop_id uuid, serial_number text, model text, status public.laptop_status, on_campus boolean,
  laptop_photo_path text, owner_id uuid, full_name text, username text, owner_photo_path text, other_on_campus boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE tok uuid; l public.laptops;
BEGIN
  IF NOT (public.has_role(auth.uid(),'guard') OR public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'Guards only'; END IF;
  BEGIN tok := trim(_token)::uuid; EXCEPTION WHEN others THEN
    INSERT INTO public.scan_logs(scanned_value, result, scanned_by) VALUES (left(_token,200),'invalid_format',auth.uid());
    RETURN;
  END;
  SELECT * INTO l FROM public.laptops WHERE secret_qr_id = tok;
  IF NOT FOUND THEN
    INSERT INTO public.scan_logs(scanned_value, result, scanned_by) VALUES (tok::text,'unregistered',auth.uid());
    RETURN;
  END IF;
  INSERT INTO public.scan_logs(laptop_id, scanned_value, result, scanned_by)
    VALUES (l.id, tok::text, CASE WHEN l.status='active' THEN 'match' ELSE 'flagged_'||l.status END, auth.uid());
  RETURN QUERY SELECT l.id, l.serial_number, l.model, l.status, l.on_campus, l.laptop_photo_path, p.id, p.full_name, p.username, p.photo_path,
    EXISTS (SELECT 1 FROM public.laptops o WHERE o.owner_id = l.owner_id AND o.id <> l.id AND o.on_campus)
  FROM public.profiles p WHERE p.id = l.owner_id;
END $$;

-- Gate in/out; only one laptop per student on campus at a time
CREATE OR REPLACE FUNCTION public.record_gate_event(_laptop_id uuid, _direction text)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l public.laptops; ts timestamptz := now();
BEGIN
  IF NOT (public.has_role(auth.uid(),'guard') OR public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'Guards only'; END IF;
  IF _direction NOT IN ('in','out') THEN RAISE EXCEPTION 'Invalid direction'; END IF;
  SELECT * INTO l FROM public.laptops WHERE id = _laptop_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Laptop not found'; END IF;
  IF l.status <> 'active' THEN RAISE EXCEPTION 'Laptop is flagged as %', l.status; END IF;
  IF _direction = 'in' THEN
    IF l.on_campus THEN RAISE EXCEPTION 'Laptop is already signed in'; END IF;
    IF EXISTS (SELECT 1 FROM public.laptops WHERE owner_id = l.owner_id AND id <> l.id AND on_campus) THEN
      RAISE EXCEPTION 'Student already has another laptop on campus'; END IF;
  ELSIF NOT l.on_campus THEN RAISE EXCEPTION 'Laptop is not signed in';
  END IF;
  UPDATE public.laptops SET on_campus = (_direction = 'in') WHERE id = l.id;
  INSERT INTO public.gate_events(laptop_id, owner_id, direction, guard_id, created_at) VALUES (l.id, l.owner_id, _direction, auth.uid(), ts);
  RETURN ts;
END $$;

-- Admin: transfer ownership in place
CREATE OR REPLACE FUNCTION public.transfer_laptop(_laptop_id uuid, _username text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target uuid; prev uuid;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Admins only'; END IF;
  SELECT id INTO target FROM public.profiles WHERE username = lower(trim(_username));
  IF target IS NULL THEN RAISE EXCEPTION 'No student with username %', _username; END IF;
  SELECT owner_id INTO prev FROM public.laptops WHERE id = _laptop_id FOR UPDATE;
  IF prev IS NULL THEN RAISE EXCEPTION 'Laptop not found'; END IF;
  IF prev = target THEN RAISE EXCEPTION 'Already owned by that student'; END IF;
  UPDATE public.laptops SET owner_id = target, secret_qr_id = gen_random_uuid(), on_campus = false WHERE id = _laptop_id;
  INSERT INTO public.laptop_transfers(laptop_id, from_owner, to_owner, transferred_by) VALUES (_laptop_id, prev, target, auth.uid());
END $$;

-- Admin: grant/revoke guard/admin by email
CREATE OR REPLACE FUNCTION public.set_user_role(_email text, _role public.app_role, _grant boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Admins only'; END IF;
  SELECT id INTO uid FROM public.profiles WHERE lower(email) = lower(trim(_email));
  IF uid IS NULL THEN RAISE EXCEPTION 'That person must sign in once first'; END IF;
  IF _grant THEN INSERT INTO public.user_roles(user_id, role) VALUES (uid,_role) ON CONFLICT DO NOTHING;
  ELSE DELETE FROM public.user_roles WHERE user_id = uid AND role = _role; END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.claim_student_role(), public.register_laptop(text,text,text), public.lookup_laptop(text),
  public.record_gate_event(uuid,text), public.transfer_laptop(uuid,text), public.set_user_role(text,public.app_role,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_student_role(), public.register_laptop(text,text,text), public.lookup_laptop(text),
  public.record_gate_event(uuid,text), public.transfer_laptop(uuid,text), public.set_user_role(text,public.app_role,boolean) TO authenticated;