import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { errMsg } from "@/lib/photos";

type Row = { id: string; action: string; details: string | null; created_at: string; actor: string; serial: string };

export function AuditTrail() {
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("guard_audit").select("id, actor_id, action, laptop_id, details, created_at").order("created_at", { ascending: false }).limit(300);
      if (error) return setErr(errMsg(error));
      const actors = [...new Set((data ?? []).map((r) => r.actor_id).filter(Boolean))] as string[];
      const laps = [...new Set((data ?? []).map((r) => r.laptop_id).filter(Boolean))] as string[];
      const [{ data: p }, { data: l }] = await Promise.all([
        actors.length ? supabase.from("profiles").select("id, full_name, email").in("id", actors) : Promise.resolve({ data: [] as { id: string; full_name: string | null; email: string }[] }),
        laps.length ? supabase.from("laptops").select("id, serial_number").in("id", laps) : Promise.resolve({ data: [] as { id: string; serial_number: string }[] }),
      ]);
      const pm = new Map((p ?? []).map((x) => [x.id, x.full_name || x.email]));
      const lm = new Map((l ?? []).map((x) => [x.id, x.serial_number]));
      setRows((data ?? []).map((r) => ({ id: r.id, action: r.action, details: r.details, created_at: r.created_at,
        actor: (r.actor_id && pm.get(r.actor_id)) || "—", serial: (r.laptop_id && lm.get(r.laptop_id)) || "—" })));
    })();
  }, []);

  const s = q.trim().toLowerCase();
  const shown = rows.filter((r) => !s || [r.actor, r.serial, r.action, r.details ?? ""].some((v) => v.toLowerCase().includes(s)));

  return (
    <div className="surface space-y-3">
      <h2 className="text-lg font-semibold">Guard audit trail</h2>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search guard, serial or action" className="field text-sm" />
      {err && <p className="text-sm text-destructive">{err}</p>}
      <div className="max-h-96 overflow-auto">
        <table className="w-full text-xs">
          <thead className="uppercase tracking-wider text-muted-foreground"><tr><th className="p-1 text-left">When</th><th className="p-1 text-left">Who</th><th className="p-1 text-left">Action</th><th className="p-1 text-left">Device</th></tr></thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className="border-t border-border/60">
                <td className="p-1 font-mono">{new Date(r.created_at).toLocaleString()}</td>
                <td className="p-1">{r.actor}</td>
                <td className="p-1">{r.action.replace(/_/g, " ")}{r.details && <span className="block text-muted-foreground">{r.details}</span>}</td>
                <td className="p-1 font-mono">{r.serial}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!shown.length && <p className="py-2 text-sm text-muted-foreground">No activity yet.</p>}
      </div>
    </div>
  );
}
