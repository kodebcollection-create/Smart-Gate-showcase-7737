ALTER TABLE public.laptops ADD COLUMN IF NOT EXISTS deregistered_at timestamptz;

CREATE OR REPLACE FUNCTION public.claim_staff_role()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e text := lower(auth.jwt() ->> 'email');
BEGIN
  IF auth.uid() IS NULL OR e IS NULL OR NOT (e ~ '^[a-z0-9._%+-]+@cuk\.ac\.ke$' OR e = 'k.o.deb.collection@gmail.com') THEN RETURN false; END IF;
  INSERT INTO public.user_roles(user_id, role) VALUES (auth.uid(),'guard') ON CONFLICT DO NOTHING;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.lookup_laptop(_token text)
 RETURNS TABLE(laptop_id uuid, serial_number text, model text, status laptop_status, on_campus boolean, laptop_photo_path text, owner_id uuid, full_name text, username text, owner_photo_path text, other_on_campus boolean)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE tok uuid; l public.laptops;
BEGIN
  IF NOT (public.has_role(auth.uid(),'guard') OR public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'Guards only'; END IF;
  BEGIN tok := trim(_token)::uuid; EXCEPTION WHEN others THEN
    INSERT INTO public.scan_logs(scanned_value, result, scanned_by) VALUES (left(_token,200),'invalid_format',auth.uid());
    RETURN;
  END;
  SELECT * INTO l FROM public.laptops WHERE secret_qr_id = tok AND deregistered_at IS NULL;
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

-- Signing out deregisters the laptop: QR is rotated and the record is marked deregistered
CREATE OR REPLACE FUNCTION public.record_gate_event(_laptop_id uuid, _direction text)
 RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE l public.laptops; ts timestamptz := now();
BEGIN
  IF NOT (public.has_role(auth.uid(),'guard') OR public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'Guards only'; END IF;
  IF _direction NOT IN ('in','out') THEN RAISE EXCEPTION 'Invalid direction'; END IF;
  SELECT * INTO l FROM public.laptops WHERE id = _laptop_id FOR UPDATE;
  IF NOT FOUND OR l.deregistered_at IS NOT NULL THEN RAISE EXCEPTION 'Laptop is not registered'; END IF;
  IF l.status <> 'active' THEN RAISE EXCEPTION 'Laptop is flagged as %', l.status; END IF;
  IF _direction = 'in' THEN
    IF l.on_campus THEN RAISE EXCEPTION 'Laptop is already signed in'; END IF;
    IF EXISTS (SELECT 1 FROM public.laptops WHERE owner_id = l.owner_id AND id <> l.id AND on_campus) THEN
      RAISE EXCEPTION 'Student already has another laptop on campus'; END IF;
    UPDATE public.laptops SET on_campus = true WHERE id = l.id;
  ELSE
    IF NOT l.on_campus THEN RAISE EXCEPTION 'Laptop is not signed in'; END IF;
    UPDATE public.laptops SET on_campus = false, deregistered_at = ts, secret_qr_id = gen_random_uuid() WHERE id = l.id;
  END IF;
  INSERT INTO public.gate_events(laptop_id, owner_id, direction, guard_id, created_at) VALUES (l.id, l.owner_id, _direction, auth.uid(), ts);
  RETURN ts;
END $$;

CREATE OR REPLACE FUNCTION public.register_laptop(_serial text, _model text, _photo_path text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE s text := upper(trim(_serial)); existing public.laptops; new_secret uuid := gen_random_uuid();
BEGIN
  IF NOT public.has_role(auth.uid(),'student') THEN RAISE EXCEPTION 'Only students can register laptops'; END IF;
  IF s = '' THEN RAISE EXCEPTION 'Serial number is required'; END IF;
  IF _photo_path IS NULL OR _photo_path NOT LIKE auth.uid()::text || '/%' THEN RAISE EXCEPTION 'Laptop photo is required'; END IF;
  SELECT * INTO existing FROM public.laptops WHERE serial_number = s;
  IF FOUND THEN
    IF existing.owner_id <> auth.uid() THEN RAISE EXCEPTION 'Serial % is registered to another student', s; END IF;
    IF existing.on_campus THEN RAISE EXCEPTION 'This laptop is signed in. Sign it out at the gate first.'; END IF;
    UPDATE public.laptops SET secret_qr_id = new_secret, model = NULLIF(trim(_model),''), laptop_photo_path = _photo_path,
      status = 'active', registered_at = now(), deregistered_at = NULL WHERE id = existing.id;
  ELSE
    INSERT INTO public.laptops(owner_id, secret_qr_id, serial_number, model, laptop_photo_path)
    VALUES (auth.uid(), new_secret, s, NULLIF(trim(_model),''), _photo_path);
  END IF;
  RETURN new_secret;
END $$;