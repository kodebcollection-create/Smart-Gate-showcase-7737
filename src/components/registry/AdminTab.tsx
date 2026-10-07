import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { errMsg } from "@/lib/photos";

type Row = {
  id: string;
  serial_number: string;
  model: string | null;
  status: "active" | "lost" | "stolen" | "transferred";
  registered_at: string;
  deregistered_at: string | null;
  owner: string;
};
type SortKey = "owner" | "serial_number" | "status" | "registered_at";
const STATUSES: Row["status"][] = ["active", "lost", "stolen", "transferred"];

export function AdminTab() {
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: "registered_at", asc: false });
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    const { data, error } = await supabase
      .from("laptops")
      .select("id, serial_number, model, status, registered_at, deregistered_at, owner_id");
    if (error) return setErr(errMsg(error));
    const ids = [...new Set((data ?? []).map((l) => l.owner_id))];
    const { data: profs } = ids.length
      ? await supabase.from("profiles").select("id, full_name, username").in("id", ids)
      : { data: [] };
    const pm = new Map((profs ?? []).map((p) => [p.id, p.full_name || p.username || ""]));
    setRows((data ?? []).map((l) => ({ ...l, owner: pm.get(l.owner_id) ?? "" })) as Row[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    const f = rows.filter((r) => !s || [r.owner, r.serial_number, r.model ?? "", r.status].some((v) => v.toLowerCase().includes(s)));
    return f.sort((a, b) => {
      const c = String(a[sort.key]).localeCompare(String(b[sort.key]));
      return sort.asc ? c : -c;
    });
  }, [rows, q, sort]);

  async function setStatus(id: string, status: Row["status"]) {
    const { error } = await supabase.from("laptops").update({ status }).eq("id", id);
    if (error) return setErr(errMsg(error));
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status } : r)));
  }

  async function remove(r: Row) {
    if (!confirm(`Delete laptop ${r.serial_number} and its gate history?`)) return;
    const { error } = await supabase.from("laptops").delete().eq("id", r.id);
    if (error) return setErr(errMsg(error));
    setRows((rs) => rs.filter((x) => x.id !== r.id));
  }

  const head = (key: SortKey, label: string) => (
    <th className="px-2 py-2 text-left">
      <button type="button" className="hover:text-primary" onClick={() => setSort((s) => ({ key, asc: s.key === key ? !s.asc : true }))}>
        {label}{sort.key === key ? (sort.asc ? " ↑" : " ↓") : ""}
      </button>
    </th>
  );

  return (
    <div className="surface space-y-3">
      <h2 className="text-lg font-semibold">All laptops</h2>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search owner, serial, model, status" className="field text-sm" />
      {err && <p className="text-sm text-destructive">{err}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wider text-muted-foreground">
            <tr>{head("owner", "Owner")}{head("serial_number", "Serial")}{head("status", "Status")}{head("registered_at", "Registered")}<th /></tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className="border-t border-border/60">
                <td className="px-2 py-2">{r.owner || "—"}</td>
                <td className="px-2 py-2 font-mono text-xs">{r.serial_number}{r.deregistered_at && <span className="block text-muted-foreground">deregistered</span>}</td>
                <td className="px-2 py-2">
                  <select value={r.status} onChange={(e) => setStatus(r.id, e.target.value as Row["status"])} className="rounded-md border border-border bg-background px-1 py-1 text-xs">
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
                <td className="px-2 py-2 font-mono text-xs">{new Date(r.registered_at).toLocaleDateString()}</td>
                <td className="px-2 py-2 text-right">
                  <button type="button" onClick={() => remove(r)} className="text-xs text-destructive hover:underline">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && <p className="py-3 text-sm text-muted-foreground">No laptops found.</p>}
      </div>
    </div>
  );
}
