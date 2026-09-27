import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { supabase } from "@/integrations/supabase/client";
import { errMsg, uploadPhoto } from "@/lib/photos";
import { Field } from "./Field";
import { Photo, PhotoInput } from "./Photo";

type MyLaptop = {
  id: string;
  serial_number: string;
  model: string | null;
  status: string;
  on_campus: boolean;
  laptop_photo_path: string;
  secret_qr_id: string;
  registered_at: string;
};

async function toQr(secret: string) {
  return QRCode.toDataURL(secret, { width: 640, margin: 2, color: { dark: "#0b1220", light: "#ffffff" } });
}

export function RegisterTab({ userId }: { userId: string }) {
  const [laptops, setLaptops] = useState<MyLaptop[]>([]);
  const [serial, setSerial] = useState("");
  const [model, setModel] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qr, setQr] = useState<{ serial: string; img: string } | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("laptops")
      .select("id, serial_number, model, status, on_campus, laptop_photo_path, secret_qr_id, registered_at")
      .eq("owner_id", userId)
      .order("registered_at", { ascending: false });
    setLaptops((data as MyLaptop[]) ?? []);
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
                {l.model || "Laptop"} · {l.status} · {l.on_campus ? "on campus" : "off campus"}
              </p>
            </div>
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={async () => setQr({ serial: l.serial_number, img: await toQr(l.secret_qr_id) })}
            >
              QR
            </button>
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
