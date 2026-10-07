import type { SupabaseClient } from "@supabase/supabase-js";

export type Visit = {
  student: string;
  regNo: string;
  serial: string;
  model: string;
  signIn: string | null;
  signOut: string | null;
};

type Ev = { laptop_id: string; owner_id: string; direction: string; created_at: string };

// Pairs each sign-in with the next sign-out of the same laptop. Staff-only via RLS.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadVisits(sb: SupabaseClient<any>, limit = 2000): Promise<Visit[]> {
  const { data: ev, error } = await sb
    .from("gate_events")
    .select("laptop_id, owner_id, direction, created_at")
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  const events = (ev ?? []) as Ev[];
  const laptopIds = [...new Set(events.map((e) => e.laptop_id))];
  const ownerIds = [...new Set(events.map((e) => e.owner_id))];
  const [{ data: laps }, { data: profs }] = await Promise.all([
    laptopIds.length ? sb.from("laptops").select("id, serial_number, model").in("id", laptopIds) : Promise.resolve({ data: [] }),
    ownerIds.length ? sb.from("profiles").select("id, full_name, username").in("id", ownerIds) : Promise.resolve({ data: [] }),
  ]);
  const lap = new Map((laps ?? []).map((l: { id: string; serial_number: string; model: string | null }) => [l.id, l]));
  const prof = new Map((profs ?? []).map((p: { id: string; full_name: string | null; username: string | null }) => [p.id, p]));
  const open = new Map<string, Visit>();
  const out: Visit[] = [];
  for (const e of events) {
    const l = lap.get(e.laptop_id);
    const p = prof.get(e.owner_id);
    const base = {
      student: p?.full_name ?? "",
      regNo: p?.username ?? "",
      serial: l?.serial_number ?? "",
      model: l?.model ?? "",
    };
    if (e.direction === "in") {
      const v: Visit = { ...base, signIn: e.created_at, signOut: null };
      open.set(e.laptop_id, v);
      out.push(v);
    } else {
      const v = open.get(e.laptop_id);
      if (v) {
        v.signOut = e.created_at;
        open.delete(e.laptop_id);
      } else out.push({ ...base, signIn: null, signOut: e.created_at });
    }
  }
  return out.reverse();
}

export function visitsToCsv(visits: Visit[]) {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const rows = [["Student", "Registration number", "Laptop serial", "Model", "Sign-in time", "Sign-out time"]];
  for (const v of visits) rows.push([v.student, v.regNo, v.serial, v.model, v.signIn ?? "", v.signOut ?? ""]);
  return rows.map((r) => r.map(esc).join(",")).join("\r\n");
}
