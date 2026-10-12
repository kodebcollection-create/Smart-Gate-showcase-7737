import { useCallback, useEffect, useRef, useState } from "react";
import type QrScannerType from "qr-scanner";
import { supabase } from "@/integrations/supabase/client";
import { errMsg } from "@/lib/photos";
import { Photo } from "./Photo";
import { cacheRegistry, offlineLookup, pendingCount, queueOffline, syncQueue } from "@/lib/offline-gate";

type Match = {
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
  owner_id?: string;
};

type Status =
  | { kind: "idle" }
  | { kind: "scanning" }
  | { kind: "checking" }
  | { kind: "match"; match: Match }
  | { kind: "done"; match: Match; direction: "in" | "out"; at: string }
  | { kind: "nomatch" }
  | { kind: "error"; title: string; message: string };

type AlertMode = "normal" | "loud" | "continuous";
let vibTimer: ReturnType<typeof setInterval> | null = null;
function stopVibration() {
  if (vibTimer) clearInterval(vibTimer);
  vibTimer = null;
  navigator.vibrate?.(0);
}
function soundAlarm(mode: AlertMode = "normal") {
  try {
    const loud = mode !== "normal";
    const ctx = new AudioContext();
    for (let i = 0; i < (loud ? 14 : 6); i++) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "square";
      o.type = loud ? "sawtooth" : "square";
      o.frequency.value = loud ? (i % 2 ? 1800 : 2600) : i % 2 ? 660 : 990;
      g.gain.value = loud ? 1 : 0.25;
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.3);
      o.stop(ctx.currentTime + i * 0.3 + 0.25);
    }
    navigator.vibrate?.([400, 150, 400, 150, 400]);
    if (mode === "continuous") {
      stopVibration();
      vibTimer = setInterval(() => navigator.vibrate?.(800), 1000);
    }
  } catch {
    /* audio unavailable */
  }
}

export function ScanTab() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [run, setRun] = useState(0);
  const [checks, setChecks] = useState({ face: false, serial: false });
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const [pending, setPending] = useState(0);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [alarm, setAlarm] = useState<Match | null>(null);
  const [mode, setMode] = useState<AlertMode>("normal");
  const [broadcasts, setBroadcasts] = useState<{ id: string; serial: string; owner: string }[]>([]);
  const modeRef = useRef<AlertMode>("normal");
  useEffect(() => {
    const m = localStorage.getItem("sg-alert-mode") as AlertMode | null;
    if (m) { setMode(m); modeRef.current = m; }
  }, []);
  const changeMode = (m: AlertMode) => { setMode(m); modeRef.current = m; localStorage.setItem("sg-alert-mode", m); };

  useEffect(() => {
    const ch = supabase
      .channel("lost-broadcast")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "lost_report_events" }, async (p) => {
        const ev = p.new as { id: string; laptop_id: string; stage: string; owner_id: string };
        if (ev.stage !== "reported") return;
        const [{ data: l }, { data: o }] = await Promise.all([
          supabase.from("laptops").select("serial_number").eq("id", ev.laptop_id).maybeSingle(),
          supabase.from("profiles").select("full_name").eq("id", ev.owner_id).maybeSingle(),
        ]);
        setBroadcasts((b) => [{ id: ev.id, serial: l?.serial_number ?? "unknown", owner: o?.full_name ?? "" }, ...b]);
        soundAlarm("normal");
        void cacheRegistry().catch(() => {});
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, []);

  useEffect(() => {
    const sync = async () => {
      setOffline(!navigator.onLine);
      if (!navigator.onLine) return;
      try {
        if (pendingCount()) {
          const r = await syncQueue();
          setSyncMsg(r.failed.length ? `Synced ${r.synced}; ${r.failed.length} rejected: ${r.failed.join("; ")}` : r.synced ? `Synced ${r.synced} offline scan(s).` : null);
        }
        await cacheRegistry();
      } catch {
        /* keep previous cache */
      }
      setPending(pendingCount());
    };
    const goOffline = () => setOffline(true);
    void sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  const show = useCallback((row: Match | null) => {
    if (row && row.status !== "active") {
      setAlarm(row);
      soundAlarm(modeRef.current);
    }
    setStatus(row ? { kind: "match", match: row } : { kind: "nomatch" });
  }, []);

  const lookupOffline = useCallback(async (value: string) => {
    setOffline(true);
    const r = await offlineLookup(value);
    if (r === "nocache") setStatus({ kind: "error", title: "Offline", message: "No saved registry on this phone yet. Connect once to download it." });
    else show(r);
  }, [show]);

  const lookup = useCallback(async (value: string) => {
    setStatus({ kind: "checking" });
    setChecks({ face: false, serial: false });
    if (!navigator.onLine) return lookupOffline(value);
    try {
      const { data, error } = await supabase.rpc("lookup_laptop", { _token: value });
      if (error) throw error;
      setOffline(false);
      show((data as Match[] | null)?.[0] ?? null);
    } catch (err) {
      if (/fetch|network/i.test(errMsg(err))) return lookupOffline(value);
      setStatus({ kind: "error", title: "Lookup failed", message: errMsg(err) });
    }
  }, [show, lookupOffline]);

  useEffect(() => {
    let cancelled = false;
    let scanner: QrScannerType | null = null;
    (async () => {
      const { default: QrScanner } = await import("qr-scanner");
      if (cancelled) return;
      const hasCamera = await QrScanner.hasCamera().catch(() => false);
      if (cancelled) return;
      if (!hasCamera) {
        setStatus({ kind: "error", title: "No camera found", message: "Open this page on a phone to scan codes." });
        return;
      }
      const video = videoRef.current;
      if (!video) return;
      scanner = new QrScanner(
        video,
        (res) => {
          scanner?.stop();
          void lookup(res.data);
        },
        { preferredCamera: "environment", highlightScanRegion: true, highlightCodeOutline: true, returnDetailedScanResult: true },
      );
      try {
        await scanner.start();
        if (!cancelled) setStatus({ kind: "scanning" });
      } catch (err) {
        const name = (err as { name?: string })?.name ?? "";
        const denied = name === "NotAllowedError" || name === "SecurityError" || String(err).toLowerCase().includes("permission");
        setStatus({
          kind: "error",
          title: denied ? "Camera access blocked" : "Camera unavailable",
          message: denied
            ? "Allow camera access for this site in your browser settings, then tap Scan again."
            : "The camera could not be started. Close other apps using it and retry.",
        });
      }
    })();
    return () => {
      cancelled = true;
      scanner?.stop();
      scanner?.destroy();
    };
  }, [run, lookup]);

  const rescan = () => {
    setStatus({ kind: "idle" });
    setRun((n) => n + 1);
  };

  async function grant(m: Match) {
    const direction = m.on_campus ? "out" : "in";
    setBusy(true);
    try {
      if (offline || !navigator.onLine) {
        const at = await queueOffline({ ...m, owner_id: (m as Match & { owner_id?: string }).owner_id ?? "" }, direction);
        setPending(pendingCount());
        setStatus({ kind: "done", match: m, direction, at });
        return;
      }
      const { data, error } = await supabase.rpc("record_gate_event", { _laptop_id: m.laptop_id, _direction: direction });
      if (error) throw error;
      setStatus({ kind: "done", match: m, direction, at: data as string });
      void cacheRegistry().catch(() => {});
    } catch (err) {
      setStatus({ kind: "error", title: "Access not recorded", message: errMsg(err) });
    } finally {
      setBusy(false);
    }
  }

  const showCamera = status.kind === "idle" || status.kind === "scanning";

  return (
    <div className="space-y-4">
      {alarm && (
        <div role="alertdialog" className="fixed inset-0 z-50 flex animate-pulse flex-col items-center justify-center gap-4 bg-destructive p-6 text-center text-destructive-foreground">
          <p className="text-5xl font-black uppercase tracking-widest">Stop</p>
          <p className="text-2xl font-bold uppercase">{alarm.status} device</p>
          <p className="font-mono text-xl break-all">{alarm.serial_number}</p>
          <p className="text-lg">Registered to {alarm.full_name || "unknown"} (@{alarm.username})</p>
          <p className="text-sm">Do not let this laptop through. Hold it and call security.</p>
          <button type="button" onClick={() => { stopVibration(); setAlarm(null); }} className="mt-4 rounded-lg border-2 border-current px-6 py-3 font-semibold">
            Acknowledge
          </button>
        </div>
      )}
      {broadcasts.map((b) => (
        <div key={b.id} role="alert" className="surface flex items-start justify-between gap-3 border-destructive bg-destructive/15">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-destructive">Just reported lost</p>
            <p className="font-mono">{b.serial}</p>
            <p className="text-xs text-muted-foreground">{b.owner} · watch for this device</p>
          </div>
          <button type="button" className="text-xs underline" onClick={() => setBroadcasts((x) => x.filter((y) => y.id !== b.id))}>Dismiss</button>
        </div>
      ))}
      <div className="surface flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Alarm:</span>
        {(["normal", "loud", "continuous"] as const).map((m) => (
          <button key={m} type="button" onClick={() => changeMode(m)} className={`rounded-md border px-2 py-1 text-xs ${mode === m ? "border-primary text-primary" : "border-border"}`}>
            {m === "normal" ? "Normal" : m === "loud" ? "Loud siren" : "Loud + nonstop vibration"}
          </button>
        ))}
      </div>
      {(offline || pending > 0 || syncMsg) && (
        <div className="surface text-sm">
          {offline && <p className="font-semibold text-destructive">Offline mode — using this phone's saved registry. Scans will sync automatically.</p>}
          {pending > 0 && <p className="text-muted-foreground">{pending} scan(s) waiting to sync.</p>}
          {syncMsg && <p className="text-muted-foreground">{syncMsg}</p>}
        </div>
      )}
      <div className={showCamera ? "surface space-y-3" : "hidden"}>
        <h2 className="text-lg font-semibold">Scan device QR code</h2>
        <div className="overflow-hidden rounded-xl border border-border bg-black">
          <video ref={videoRef} className="aspect-square w-full object-cover" playsInline muted />
        </div>
        <p className="text-sm text-muted-foreground">
          {status.kind === "scanning" ? "Point at the QR code on the laptop." : "Starting camera…"}
        </p>
      </div>

      {status.kind === "checking" && <div className="surface text-sm text-muted-foreground">Checking the registry…</div>}

      {status.kind === "match" && (() => {
        const m = status.match;
        const flagged = m.status !== "active";
        const blocked = flagged || (!m.on_campus && m.other_on_campus);
        return (
          <div className={`surface space-y-4 ${blocked ? "border-destructive/60 bg-destructive/10" : "border-success/60 bg-success/10"}`}>
            <p className={`text-xs font-semibold uppercase tracking-widest ${blocked ? "text-destructive" : "text-success"}`}>
              {flagged ? `Flagged: ${m.status}` : blocked ? "Another laptop already on campus" : m.on_campus ? "Signing out" : "Signing in"}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Photo path={m.owner_photo_path} alt="Owner" className="aspect-square w-full" />
                <p className="text-center text-xs text-muted-foreground">Student passport photo</p>
              </div>
              <div className="space-y-1">
                <Photo path={m.laptop_photo_path} alt="Laptop" className="aspect-square w-full" />
                <p className="text-center text-xs text-muted-foreground">Laptop</p>
              </div>
            </div>
            <div>
              <h2 className="text-xl font-semibold">{m.full_name || "Unknown owner"}</h2>
              <p className="font-mono text-sm text-muted-foreground">@{m.username}</p>
            </div>
            <div className="rounded-lg border border-border bg-background/60 p-3">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Serial number</p>
              <p className="font-mono text-lg break-all">{m.serial_number}</p>
              <p className="text-xs text-muted-foreground">{m.model || "Laptop"}</p>
            </div>
            {!blocked && (
              <>
                <Check label="Photo matches the person" checked={checks.face} onChange={(v) => setChecks({ ...checks, face: v })} />
                <Check label="Serial matches the laptop" checked={checks.serial} onChange={(v) => setChecks({ ...checks, serial: v })} />
                <button
                  type="button"
                  disabled={!checks.face || !checks.serial || busy}
                  onClick={() => grant(m)}
                  className="btn-primary disabled:opacity-50"
                >
                  {busy ? "Recording…" : m.on_campus ? "Access Granted — Sign out" : "Access Granted — Sign in"}
                </button>
              </>
            )}
            <button type="button" onClick={rescan} className="btn-ghost w-full">
              {blocked ? "Deny & scan again" : "Deny"}
            </button>
          </div>
        );
      })()}

      {status.kind === "done" && (
        <div className="surface space-y-3 border-success/60 bg-success/10">
          <p className="text-xs font-semibold uppercase tracking-widest text-success">
            Signed {status.direction === "in" ? "in" : "out"}
          </p>
          <h2 className="text-xl font-semibold">{status.match.full_name}</h2>
          <p className="font-mono text-sm">{status.match.serial_number}</p>
          <p className="font-mono text-sm text-muted-foreground">
            {status.direction === "in" ? "Time in: " : "Time out: "}{new Date(status.at).toLocaleString()}
          </p>
          {status.direction === "out" && (
            <p className="text-sm text-muted-foreground">This laptop is now deregistered. Its QR code no longer works.</p>
          )}
          <button type="button" onClick={rescan} className="btn-primary">Scan next</button>
        </div>
      )}

      {status.kind === "nomatch" && (
        <div className="surface space-y-3 border-destructive/60 bg-destructive/10">
          <p className="text-xs font-semibold uppercase tracking-widest text-destructive">Unregistered Device</p>
          <p className="text-sm text-muted-foreground">This QR code is not valid. It may be old, copied or fake.</p>
          <button type="button" onClick={rescan} className="btn-ghost w-full">Scan again</button>
        </div>
      )}

      {status.kind === "error" && (
        <div className="surface space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-destructive">{status.title}</p>
          <p className="text-sm text-muted-foreground">{status.message}</p>
          <button type="button" onClick={rescan} className="btn-ghost w-full">Scan again</button>
        </div>
      )}
    </div>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-3 rounded-lg border border-border p-3 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-5 w-5 accent-[var(--primary)]" />
      {label}
    </label>
  );
}
