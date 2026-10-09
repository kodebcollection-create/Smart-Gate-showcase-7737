import { supabase } from "@/integrations/supabase/client";

// Offline registry: QR secrets are never stored, only their SHA-256 digests,
// so a stolen guard phone cannot be used to mint valid QR codes.
export type OfflineMatch = {
  laptop_id: string;
  serial_number: string;
  model: string | null;
  status: string;
  on_campus: boolean;
  laptop_photo_path: string;
  full_name: string | null;
  username: string | null;
  owner_photo_path: string | null;
  other_on_campus: boolean;
  owner_id: string;
};

type Snapshot = { savedAt: string; entries: Record<string, OfflineMatch>; digest: string };
type Queued = { laptop_id: string; direction: "in" | "out"; at: string };

const SNAP = "smartgate-offline-registry";
const QUEUE = "smartgate-offline-queue";

async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function cacheRegistry() {
  const { data: laps, error } = await supabase
    .from("laptops")
    .select("id, owner_id, secret_qr_id, serial_number, model, status, on_campus, laptop_photo_path")
    .is("deregistered_at", null);
  if (error) throw error;
  const ownerIds = [...new Set((laps ?? []).map((l) => l.owner_id))];
  const { data: profs } = ownerIds.length
    ? await supabase.from("profiles").select("id, full_name, username, photo_path").in("id", ownerIds)
    : { data: [] };
  const prof = new Map((profs ?? []).map((p) => [p.id, p]));
  const entries: Record<string, OfflineMatch> = {};
  for (const l of laps ?? []) {
    const p = prof.get(l.owner_id);
    entries[await sha256(l.secret_qr_id)] = {
      laptop_id: l.id, owner_id: l.owner_id, serial_number: l.serial_number, model: l.model, status: l.status,
      on_campus: l.on_campus, laptop_photo_path: l.laptop_photo_path, full_name: p?.full_name ?? null,
      username: p?.username ?? null, owner_photo_path: p?.photo_path ?? null, other_on_campus: false,
    };
  }
  await save(entries);
}

async function save(entries: Record<string, OfflineMatch>) {
  const body = JSON.stringify(entries);
  const snap: Snapshot = { savedAt: new Date().toISOString(), entries, digest: await sha256(body) };
  localStorage.setItem(SNAP, JSON.stringify(snap));
}

async function load(): Promise<Snapshot | null> {
  try {
    const snap = JSON.parse(localStorage.getItem(SNAP) ?? "null") as Snapshot | null;
    if (!snap || (await sha256(JSON.stringify(snap.entries))) !== snap.digest) return null; // tampered
    return snap;
  } catch {
    return null;
  }
}

export async function offlineLookup(token: string): Promise<OfflineMatch | null | "nocache"> {
  const snap = await load();
  if (!snap) return "nocache";
  const m = snap.entries[await sha256(token.trim())];
  if (!m) return null;
  const others = Object.values(snap.entries).some((o) => o.owner_id === m.owner_id && o.laptop_id !== m.laptop_id && o.on_campus);
  return { ...m, other_on_campus: others };
}

export async function queueOffline(m: OfflineMatch, direction: "in" | "out") {
  const at = new Date().toISOString();
  const q: Queued[] = JSON.parse(localStorage.getItem(QUEUE) ?? "[]");
  q.push({ laptop_id: m.laptop_id, direction, at });
  localStorage.setItem(QUEUE, JSON.stringify(q));
  const snap = await load();
  if (snap) {
    for (const [k, e] of Object.entries(snap.entries)) {
      if (e.laptop_id !== m.laptop_id) continue;
      if (direction === "out") delete snap.entries[k]; // QR stops working after sign-out
      else e.on_campus = true;
    }
    await save(snap.entries);
  }
  return at;
}

export function pendingCount() {
  try {
    return (JSON.parse(localStorage.getItem(QUEUE) ?? "[]") as Queued[]).length;
  } catch {
    return 0;
  }
}

export async function syncQueue(): Promise<{ synced: number; failed: string[] }> {
  const q: Queued[] = JSON.parse(localStorage.getItem(QUEUE) ?? "[]");
  const failed: string[] = [];
  let synced = 0;
  const left: Queued[] = [];
  for (const item of q) {
    const { error } = await supabase.rpc("record_gate_event_at", { _laptop_id: item.laptop_id, _direction: item.direction, _at: item.at });
    if (!error) synced++;
    else if (/fetch|network/i.test(error.message)) left.push(item);
    else failed.push(error.message);
  }
  localStorage.setItem(QUEUE, JSON.stringify(left));
  return { synced, failed };
}
