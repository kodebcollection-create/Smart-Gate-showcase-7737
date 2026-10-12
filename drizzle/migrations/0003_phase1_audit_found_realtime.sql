CREATE TABLE public.guard_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  action text NOT NULL,
  laptop_id uuid,
  details text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.guard_audit TO authenticated;
GRANT ALL ON public.guard_audit TO service_role;
ALTER TABLE public.guard_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read audit" ON public.guard_audit FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.audit_log() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF TG_TABLE_NAME = 'gate_events' THEN
    INSERT INTO guard_audit(actor_id, action, laptop_id, details) VALUES (NEW.guard_id, 'sign_'||NEW.direction, NEW.laptop_id, NULL);
  ELSIF TG_TABLE_NAME = 'scan_logs' THEN
    INSERT INTO guard_audit(actor_id, action, laptop_id, details) VALUES (NEW.scanned_by, 'scan', NEW.laptop_id, NEW.result);
  ELSIF TG_TABLE_NAME = 'lost_report_events' THEN
    INSERT INTO guard_audit(actor_id, action, laptop_id, details) VALUES (NEW.created_by, 'lost_'||NEW.stage, NEW.laptop_id, NEW.note);
  ELSIF TG_TABLE_NAME = 'laptops' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      INSERT INTO guard_audit(actor_id, action, laptop_id, details) VALUES (auth.uid(), 'status_change', NEW.id, OLD.status||' → '||NEW.status);
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER audit_gate AFTER INSERT ON public.gate_events FOR EACH ROW EXECUTE FUNCTION public.audit_log();
CREATE TRIGGER audit_scan AFTER INSERT ON public.scan_logs FOR EACH ROW EXECUTE FUNCTION public.audit_log();
CREATE TRIGGER audit_lost AFTER INSERT ON public.lost_report_events FOR EACH ROW EXECUTE FUNCTION public.audit_log();
CREATE TRIGGER audit_status AFTER UPDATE ON public.laptops FOR EACH ROW EXECUTE FUNCTION public.audit_log();

CREATE TABLE public.found_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  serial text,
  description text NOT NULL,
  location text NOT NULL,
  note text,
  photo_path text,
  status text NOT NULL DEFAULT 'held',
  found_by uuid NOT NULL DEFAULT auth.uid(),
  found_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.found_items TO authenticated;
GRANT ALL ON public.found_items TO service_role;
ALTER TABLE public.found_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read found" ON public.found_items FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'guard') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Staff log found" ON public.found_items FOR INSERT TO authenticated WITH CHECK ((public.has_role(auth.uid(),'guard') OR public.has_role(auth.uid(),'admin')) AND found_by = auth.uid());
CREATE POLICY "Staff update found" ON public.found_items FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'guard') OR public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'guard') OR public.has_role(auth.uid(),'admin'));

ALTER PUBLICATION supabase_realtime ADD TABLE public.lost_report_events;