import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { errMsg, uploadPhoto } from "@/lib/photos";
import { downloadCsv } from "@/lib/lost-found";

type Item = { id: string; serial: string | null; description: string; location: string; note: string | null; status: string; found_at: string };

export function FoundItems() {
  const [items, setItems] = useState<Item[]>([]);
  const [f, setF] = useState({ serial: "", description: "", location: "", note: "" });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("found_items").select("id, serial, description, location, note, status, found_at").order("found_at", { ascending: false });
    if (error) setErr(errMsg(error));
    else setItems(data ?? []);
  }, []);
  useEffect(() => void load(), [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const { data: u } = await supabase.auth.getUser();
      const photo_path = file && u.user ? await uploadPhoto(u.user.id, "found", file) : null;
      const { error } = await supabase.from("found_items").insert({
        serial: f.serial.trim().toUpperCase() || null, description: f.description.trim(), location: f.location.trim(),
        note: f.note.trim() || null, photo_path,
      });
      if (error) throw error;
      setF({ serial: "", description: "", location: "", note: "" });
      setFile(null);
      void load();
    } catch (e2) {
      setErr(errMsg(e2));
    } finally {
      setBusy(false);
    }
  }

  async function markReturned(id: string) {
    const { error } = await supabase.from("found_items").update({ status: "returned" }).eq("id", id);
    if (error) setErr(errMsg(error));
    void load();
  }

  function exportCsv() {
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const rows = [["Found at", "Serial", "Description", "Location", "Note", "Status"],
      ...items.map((i) => [i.found_at, i.serial ?? "", i.description, i.location, i.note ?? "", i.status])];
    downloadCsv(rows.map((r) => r.map(esc).join(",")).join("\r\n"), `smartgate-found-devices-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  return (
    <div className="surface space-y-3">
      <h2 className="text-lg font-semibold">Log unattended device</h2>
      <form onSubmit={save} className="space-y-2">
        <input className="field text-sm" placeholder="Serial number (if visible)" value={f.serial} onChange={(e) => setF({ ...f, serial: e.target.value })} />
        <input required className="field text-sm" placeholder="What is it? e.g. Black HP laptop" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        <input required className="field text-sm" placeholder="Where was it found?" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} />
        <input className="field text-sm" placeholder="Note (optional)" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        <input type="file" accept="image/*" capture="environment" className="text-xs" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <button type="submit" disabled={busy} className="btn-primary disabled:opacity-50">{busy ? "Saving…" : "Log device"}</button>
      </form>
      {err && <p className="text-sm text-destructive">{err}</p>}
      {items.map((i) => (
        <div key={i.id} className="rounded-lg border border-border p-3 text-sm">
          <p className="font-medium">{i.description} {i.serial && <span className="font-mono text-xs">· {i.serial}</span>}</p>
          <p className="text-xs text-muted-foreground">{i.location} · {new Date(i.found_at).toLocaleString()} · {i.status}</p>
          {i.status === "held" && <button type="button" className="mt-1 text-xs text-primary hover:underline" onClick={() => markReturned(i.id)}>Mark returned to owner</button>}
        </div>
      ))}
      <button type="button" className="btn-ghost w-full" disabled={!items.length} onClick={exportCsv}>Download found devices CSV</button>
    </div>
  );
}
