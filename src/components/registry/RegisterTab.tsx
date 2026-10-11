import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { supabase } from "@/integrations/supabase/client";
import { errMsg, uploadPhoto } from "@/lib/photos";
import { Field } from "./Field";
import { Photo, PhotoInput } from "./Photo";
import { STAGE_LABEL } from "@/lib/lost-found";

type MyLaptop = {
  id: string;
  serial_number: string;
  model: string | null;
  status: string;
  on_campus: boolean;
  laptop_photo_path: string;
  secret_qr_id: string;
  registered_at: string;
  deregistered_at: string | null;
};

type GateEvent = { id: string; laptop_id: string; direction: string; created_at: string };
type LostEvent = { id: string; laptop_id: string; stage: string; note: string | null; created_at: string };

async function toQr(secret: string) {
  return QRCode.toDataURL(secret, { width: 640, margin: 2, color: { dark: "#0b1220", light: "#ffffff" } });
}

export function RegisterTab({ userId }: { userId: string }) {
  const [laptops, setLaptops] = useState<MyLaptop[]>([]);
  const [events, setEvents] = useState<GateEvent[]>([]);
  const [lostEvents, setLostEvents] = useState<LostEvent[]>([]);
  const [serial, setSerial] = useState("");
  const [model, setModel] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qr, setQr] = useState<{ serial: string; img: string } | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("laptops")
      .select("id, serial_number, model, status, on_campus, laptop_photo_path, secret_qr_id, registered_at, deregistered_at")
      .eq("owner_id", userId)
      .order("registered_at", { ascending: false });
    setLaptops((data as MyLaptop[]) ?? []);
    const { data: ev } = await supabase
      .from("gate_events")
      .select("id, laptop_id, direction, created_at")
      .eq("owner_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);
    setEvents((ev as GateEvent[]) ?? []);
    const { data: le } = await supabase
      .from("lost_report_events")
      .select("id, laptop_id, stage, note, created_at")
      .eq("owner_id", userId)
      .order("created_at", { ascending: true });
    setLostEvents((le as LostEvent[]) ?? []);
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!photo) return setError("Take a photo of the laptop first.");
    setBusy(true);
    setError(null);
    try {
      const path = await uploadPhoto(userId, "laptop", photo);
      const { data: secret, error } = await supabase.rpc("register_laptop", {
        _serial: serial,
        _model: model,
        _photo_path: path,
      });
      if (error) throw error;
      setQr({ serial: serial.trim().toUpperCase(), img: await toQr(secret as string) });
      setSerial("");
      setModel("");
      setPhoto(null);
      void load();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {qr && (
        <div className="surface space-y-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-success">QR code ready</p>
          <p className="font-mono text-sm text-muted-foreground">{qr.serial}</p>
          <img src={qr.img} alt={`QR code for ${qr.serial}`} className="mx-auto w-full max-w-[240px] rounded-xl border border-border bg-white p-3" />
          <p className="text-xs text-muted-foreground">
            Stick this on your laptop. Any older QR for this laptop no longer works.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <a href={qr.img} download={`${qr.serial}-qr.png`} className="btn-primary no-underline">Download QR code</a>
            <button type="button" onClick={() => setQr(null)} className="btn-ghost w-full sm:w-auto">Close</button>
          </div>
        </div>
      )}

      <div className="surface space-y-3">
        <h2 className="text-lg font-semibold">My laptops</h2>
        {laptops.length === 0 && <p className="text-sm text-muted-foreground">No laptops registered yet.</p>}
        {laptops.map((l) => (
          <div key={l.id} className="flex items-center gap-3 border-b border-border/60 pb-3 last:border-0">
            <Photo path={l.laptop_photo_path} alt="Laptop" className="h-14 w-14 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-mono text-sm">{l.serial_number}</p>
              <p className="text-xs text-muted-foreground">
                {l.model || "Laptop"} · {l.status !== "active" ? <span className="font-semibold text-destructive uppercase">{l.status}</span> : l.deregistered_at ? "deregistered — register again to get a new QR" : l.on_campus ? "signed in" : "registered, not signed in"}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              {!l.deregistered_at && l.status === "active" && <button
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={async () => setQr({ serial: l.serial_number, img: await toQr(l.secret_qr_id) })}
              >
                QR
              </button>}
              {(l.status === "active" || l.status === "lost") && (
                <button
                  type="button"
                  className={`text-xs hover:underline ${l.status === "lost" ? "text-success" : "text-destructive"}`}
                  onClick={async () => {
                    const lost = l.status === "active";
                    if (lost && !confirm(`Report ${l.serial_number} as lost? Gates will raise an alarm if it is scanned.`)) return;
                    const { error } = await supabase.rpc("report_laptop_lost", { _laptop_id: l.id, _lost: lost });
                    if (error) setError(errMsg(error));
                    void load();
                  }}
                >
                  {l.status === "lost" ? "I found it" : "Report lost"}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="surface space-y-2">
        <h2 className="text-lg font-semibold">Gate history</h2>
        {events.length === 0 && <p className="text-sm text-muted-foreground">No sign-ins yet.</p>}
        {events.map((e) => (
          <div key={e.id} className="flex justify-between gap-3 border-b border-border/60 pb-2 text-sm last:border-0">
            <span className={e.direction === "in" ? "text-success" : "text-primary"}>
              {e.direction === "in" ? "Signed in" : "Signed out"} ·{" "}
              <span className="font-mono">{laptops.find((l) => l.id === e.laptop_id)?.serial_number ?? ""}</span>
            </span>
            <span className="font-mono text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString()}</span>
          </div>
        ))}
      </div>

      <form onSubmit={submit} className="surface space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Register a laptop</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Re-registering an existing serial gives it a fresh QR code and cancels the old one.
          </p>
        </div>
        <Field label="Serial number" value={serial} onChange={setSerial} required mono />
        <Field label="Model" value={model} onChange={setModel} placeholder="HP EliteBook 840" />
        <PhotoInput label="Photo of the laptop" file={photo} onChange={setPhoto} capture="environment" />
        {error && <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        <button type="submit" disabled={busy} className="btn-primary disabled:opacity-60">
          {busy ? "Registering…" : "Register & generate QR"}
        </button>
      </form>
    </div>
  );
}
