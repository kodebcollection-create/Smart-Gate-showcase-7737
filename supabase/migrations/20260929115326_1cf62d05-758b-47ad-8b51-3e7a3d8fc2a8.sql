CREATE OR REPLACE FUNCTION public.claim_staff_role()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e text := lower(auth.jwt() ->> 'email');
BEGIN
  -- Only confirmed accounts can sign in, so the JWT email is verified
  IF auth.uid() IS NULL OR e IS NULL OR e !~ '^[a-z0-9._%+-]+@cuk\.ac\.ke$' THEN RETURN false; END IF;
  INSERT INTO public.user_roles(user_id, role) VALUES (auth.uid(),'guard') ON CONFLICT DO NOTHING;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.claim_staff_role() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.claim_staff_role() TO authenticated;