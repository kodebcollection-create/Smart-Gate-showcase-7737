CREATE OR REPLACE FUNCTION public.report_laptop_lost(_laptop_id uuid, _lost boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE l public.laptops;
BEGIN
  SELECT * INTO l FROM public.laptops WHERE id = _laptop_id FOR UPDATE;
  IF NOT FOUND OR l.owner_id <> auth.uid() THEN RAISE EXCEPTION 'Not your laptop'; END IF;
  IF _lost THEN
    IF l.status <> 'active' THEN RAISE EXCEPTION 'Laptop is already flagged as %', l.status; END IF;
    UPDATE public.laptops SET status = 'lost' WHERE id = l.id;
  ELSE
    IF l.status <> 'lost' THEN RAISE EXCEPTION 'Only lost laptops can be marked found'; END IF;
    UPDATE public.laptops SET status = 'active' WHERE id = l.id;
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.report_laptop_lost(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_gate_event_at(_laptop_id uuid, _direction text, _at timestamptz)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE ts timestamptz; eid uuid;
BEGIN
  IF _at IS NULL OR _at > now() OR _at < now() - interval '24 hours' THEN RAISE EXCEPTION 'Offline scan is too old to sync'; END IF;
  ts := public.record_gate_event(_laptop_id, _direction);
  SELECT id INTO eid FROM public.gate_events WHERE laptop_id = _laptop_id AND created_at = ts ORDER BY created_at DESC LIMIT 1;
  UPDATE public.gate_events SET created_at = _at WHERE id = eid;
  IF _direction = 'out' THEN UPDATE public.laptops SET deregistered_at = _at WHERE id = _laptop_id; END IF;
  RETURN _at;
END $$;
GRANT EXECUTE ON FUNCTION public.record_gate_event_at(uuid, text, timestamptz) TO authenticated;