import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { errMsg } from "@/lib/photos";
import { casesToCsv, downloadCsv, filterCases, loadLostCases, SAMPLE_CASES, STAGE_LABEL, type LostCase } from "@/lib/lost-found";

export function LostFound() {
  const [cases, setCases] = useState<LostCase[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("all");
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      setCases(await loadLostCases());
    } catch (e) {
      setErr(errMsg(e));
    }
  }, []);
  useEffect(() => void load(), [load]);

  async function update(c: LostCase, stage: string) {
    setErr(null);
    const { error } = await supabase.rpc("add_lost_update", { _laptop_id: c.laptop_id, _stage: stage, _note: notes[c.laptop_id] ?? "" });
    if (error) setErr(errMsg(error));
    setNotes({ ...notes, [c.laptop_id]: "" });
    void load();
  }

  const shown = filterCases(cases, { from, to, status });
  const open = cases.filter((c) => c.status === "lost" || c.status === "stolen");
  const day = new Date().toISOString().slice(0, 10);

  return (
    <div className="surface space-y-4">
      <h2 className="text-lg font-semibold">Lost and found</h2>
      {err && <p className="text-sm text-destructive">{err}</p>}
      {open.length === 0 && <p className="text-sm text-muted-foreground">No open lost or stolen reports.</p>}
      {open.map((c) => (
        <div key={c.laptop_id} className="space-y-2 rounded-lg border border-destructive/40 p-3">
          <p className="font-mono text-sm">{c.serial} <span className="uppercase text-destructive">· {c.status}</span></p>
          <p className="text-xs text-muted-foreground">{c.student} (@{c.regNo}) · {STAGE_LABEL[c.stage] ?? c.stage}</p>
          <input
            className="field text-sm"
            placeholder="Note for the student (optional)"
            value={notes[c.laptop_id] ?? ""}
            onChange={(e) => setNotes({ ...notes, [c.laptop_id]: e.target.value })}
          />
          <div className="grid grid-cols-3 gap-2">
            <button type="button" className="btn-ghost w-full text-xs" onClick={() => update(c, "under_review")}>Reviewing</button>
            <button type="button" className="btn-ghost w-full text-xs" onClick={() => update(c, "found")}>Found</button>
            <button type="button" className="btn-ghost w-full text-xs" onClick={() => update(c, "resolved")}>Returned</button>
          </div>
        </div>
      ))}

      <div className="space-y-2 border-t border-border pt-3">
        <p className="text-sm font-medium">Export lost-and-found CSV</p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <label className="space-y-1">From<input type="date" className="field" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="space-y-1">To<input type="date" className="field" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        </div>
        <select className="field text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All reports</option>
          <option value="open">Open (lost or stolen)</option>
          <option value="lost">Lost</option>
          <option value="stolen">Stolen</option>
          <option value="closed">Resolved / returned</option>
        </select>
        <p className="text-xs text-muted-foreground">{shown.length} report(s) match.</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="button" className="btn-primary" disabled={!shown.length} onClick={() => downloadCsv(casesToCsv(shown), `smartgate-lost-and-found-${day}.csv`)}>
            Download CSV
          </button>
          <button type="button" className="btn-ghost w-full sm:w-auto" onClick={() => downloadCsv(casesToCsv(SAMPLE_CASES), "smartgate-lost-and-found-sample.csv")}>
            Sample file
          </button>
        </div>
      </div>
    </div>
  );
}
