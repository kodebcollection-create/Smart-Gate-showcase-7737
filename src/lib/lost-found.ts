import { supabase } from "@/integrations/supabase/client";

export const STAGE_LABEL: Record<string, string> = {
  reported: "Reported lost",
  under_review: "Guard reviewing",
  found: "Found by guard",
  resolved: "Resolved — returned",
  cancelled: "Cancelled — student found it",
};

export type LostCase = {
  laptop_id: string;
  serial: string;
  model: string;
  status: string;
  student: string;
  regNo: string;
  reportedAt: string;
  stage: string;
  note: string;
  updatedAt: string;
};

export const LOST_CSV_HEADERS = [
  "Laptop serial", "Model", "Current device status", "Student name", "Registration number",
  "Reported at", "Latest stage", "Latest note", "Last updated",
];

export async function loadLostCases(): Promise<LostCase[]> {
  const [{ data: laps, error }, { data: ev }] = await Promise.all([
    supabase.from("laptops").select("id, owner_id, serial_number, model, status, updated_at"),
    supabase.from("lost_report_events").select("laptop_id, stage, note, created_at").order("created_at", { ascending: true }),
  ]);
  if (error) throw error;
  const byLap = new Map<string, { stage: string; note: string | null; created_at: string }[]>();
  for (const e of ev ?? []) byLap.set(e.laptop_id, [...(byLap.get(e.laptop_id) ?? []), e]);
  const relevant = (laps ?? []).filter((l) => l.status === "lost" || l.status === "stolen" || byLap.has(l.id));
  const ownerIds = [...new Set(relevant.map((l) => l.owner_id))];
  const { data: profs } = ownerIds.length
    ? await supabase.from("profiles").select("id, full_name, username").in("id", ownerIds)
    : { data: [] };
  const prof = new Map((profs ?? []).map((p) => [p.id, p]));
  return relevant.map((l) => {
    const evs = byLap.get(l.id) ?? [];
    const first = [...evs].reverse().find((e) => e.stage === "reported") ?? evs[0];
    const last = evs[evs.length - 1];
    const p = prof.get(l.owner_id);
    return {
      laptop_id: l.id, serial: l.serial_number, model: l.model ?? "", status: l.status,
      student: p?.full_name ?? "", regNo: p?.username ?? "",
      reportedAt: first?.created_at ?? l.updated_at,
      stage: last ? last.stage : l.status === "stolen" ? "flagged stolen by admin" : "reported",
      note: last?.note ?? "", updatedAt: last?.created_at ?? l.updated_at,
    };
  }).sort((a, b) => b.reportedAt.localeCompare(a.reportedAt));
}

export function filterCases(cases: LostCase[], f: { from?: string; to?: string; status?: string }) {
  return cases.filter((c) => {
    const d = c.reportedAt.slice(0, 10);
    if (f.from && d < f.from) return false;
    if (f.to && d > f.to) return false;
    if (!f.status || f.status === "all") return true;
    if (f.status === "open") return c.status === "lost" || c.status === "stolen";
    if (f.status === "closed") return c.status === "active";
    return c.status === f.status;
  });
}

export function casesToCsv(cases: LostCase[]) {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const rows = [LOST_CSV_HEADERS, ...cases.map((c) => [
    c.serial, c.model, c.status, c.student, c.regNo, c.reportedAt, STAGE_LABEL[c.stage] ?? c.stage, c.note, c.updatedAt,
  ])];
  return rows.map((r) => r.map(esc).join(",")).join("\r\n");
}

export const SAMPLE_CASES: LostCase[] = [
  { laptop_id: "", serial: "5CD1234XYZ", model: "HP EliteBook 840", status: "lost", student: "Jane Wanjiru", regNo: "sci/0001/2024",
    reportedAt: "2026-10-01T08:15:00Z", stage: "under_review", note: "Checking CCTV at main gate", updatedAt: "2026-10-01T10:00:00Z" },
  { laptop_id: "", serial: "C02XK1ABJG5H", model: "MacBook Air", status: "active", student: "Brian Otieno", regNo: "eng/0042/2023",
    reportedAt: "2026-09-28T14:30:00Z", stage: "resolved", note: "Returned to owner at security office", updatedAt: "2026-09-29T09:00:00Z" },
];

export function downloadCsv(csv: string, name: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
