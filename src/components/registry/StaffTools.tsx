import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { errMsg } from "@/lib/photos";
import { loadVisits, visitsToCsv } from "@/lib/gate-history";
import { askGateInsights } from "@/lib/insights.functions";

export function StaffTools() {
  const [busy, setBusy] = useState(false);
  const [csvErr, setCsvErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [aiErr, setAiErr] = useState<string | null>(null);

  async function exportCsv() {
    setBusy(true);
    setCsvErr(null);
    try {
      const csv = visitsToCsv(await loadVisits(supabase));
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `smartgate-gate-history-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setCsvErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function ask(question: string) {
    if (!question.trim()) return;
    setAsking(true);
    setAiErr(null);
    setAnswer(null);
    try {
      const r = await askGateInsights({ data: { question } });
      if (r.error) setAiErr(r.error);
      else setAnswer(r.answer);
    } catch (e) {
      setAiErr(errMsg(e));
    } finally {
      setAsking(false);
    }
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="surface space-y-3">
        <h2 className="text-lg font-semibold">Gate history export</h2>
        <p className="text-xs text-muted-foreground">Student, laptop, sign-in and sign-out times as a spreadsheet file.</p>
        {csvErr && <p className="text-sm text-destructive">{csvErr}</p>}
        <button type="button" onClick={exportCsv} disabled={busy} className="btn-ghost w-full disabled:opacity-60">
          {busy ? "Preparing…" : "Download CSV"}
        </button>
      </div>

      <form
        className="surface space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(q);
        }}
      >
        <h2 className="text-lg font-semibold">Ask about scan history</h2>
        <textarea
          value={q}
          onChange={(e) => setQ(e.target.value)}
          rows={3}
          placeholder="e.g. Any unusual sign-ins this week?"
          className="field text-sm"
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="submit" disabled={asking || !q.trim()} className="btn-primary disabled:opacity-60">
            {asking ? "Analysing…" : "Ask"}
          </button>
          <button
            type="button"
            disabled={asking}
            onClick={() => {
              const s = "Find unusual sign-in and sign-out patterns.";
              setQ(s);
              void ask(s);
            }}
            className="btn-ghost w-full sm:w-auto"
          >
            Find unusual patterns
          </button>
        </div>
        {aiErr && <p className="text-sm text-destructive">{aiErr}</p>}
        {answer && <div className="whitespace-pre-wrap rounded-lg border border-border bg-background/60 p-3 text-sm">{answer}</div>}
      </form>
    </div>
  );
}
