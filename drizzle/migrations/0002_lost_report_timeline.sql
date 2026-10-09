CREATE TABLE public.lost_report_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  laptop_id uuid NOT NULL REFERENCES public.laptops(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  stage text NOT NULL CHECK (stage IN ('reported','under_review','found','resolved','cancelled')),
  note text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.lost_report_events TO authenticated;
GRANT ALL ON public.lost_report_events TO service_role;
ALTER TABLE public.lost_report_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner or staff read lost events" ON public.lost_report_events FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(),'guard') OR public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.report_laptop_lost(_laptop_id uuid, _lost boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE l public.laptops;
BEGIN
  SELECT * INTO l FROM public.laptops WHERE id = _laptop_id FOR UPDATE;
  IF NOT FOUND OR l.owner_id <> auth.uid() THEN RAISE EXCEPTION 'Not your laptop'; END IF;
  IF _lost THEN
    IF l.status <> 'active' THEN RAISE EXCEPTION 'Laptop is already flagged as %', l.status; END IF;
    UPDATE public.laptops SET status = 'lost' WHERE id = l.id;
    INSERT INTO public.lost_report_events(laptop_id, owner_id, stage, note, created_by) VALUES (l.id, l.owner_id, 'reported', 'Reported lost by student', auth.uid());
  ELSE
    IF l.status <> 'lost' THEN RAISE EXCEPTION 'Only lost laptops can be marked found'; END IF;
    UPDATE public.laptops SET status = 'active' WHERE id = l.id;
    INSERT INTO public.lost_report_events(laptop_id, owner_id, stage, note, created_by) VALUES (l.id, l.owner_id, 'cancelled', 'Student found it', auth.uid());
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.add_lost_update(_laptop_id uuid, _stage text, _note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE l public.laptops;
BEGIN
  IF NOT (public.has_role(auth.uid(),'guard') OR public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'Guards only'; END IF;
  IF _stage NOT IN ('under_review','found','resolved') THEN RAISE EXCEPTION 'Invalid stage'; END IF;
  SELECT * INTO l FROM public.laptops WHERE id = _laptop_id FOR UPDATE;
  IF NOT FOUND OR l.status NOT IN ('lost','stolen') THEN RAISE EXCEPTION 'Laptop is not reported lost or stolen'; END IF;
  IF _stage = 'resolved' THEN UPDATE public.laptops SET status = 'active' WHERE id = l.id; END IF;
  INSERT INTO public.lost_report_events(laptop_id, owner_id, stage, note, created_by) VALUES (l.id, l.owner_id, _stage, NULLIF(left(trim(_note),500),''), auth.uid());
END $$;
GRANT EXECUTE ON FUNCTION public.add_lost_update(uuid, text, text) TO authenticated;