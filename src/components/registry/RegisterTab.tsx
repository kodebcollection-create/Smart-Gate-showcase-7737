import { useState } from "react";
import QRCode from "qrcode";
import { supabase } from "@/integrations/supabase/client";
import { Field } from "./Field";

type Result = { serial: string; model: string; owner: string; qr: string };

export function RegisterTab({ email: accountEmail }: { email: string }) {
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [serial, setSerial] = useState("");
  const [model, setModel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  function reset() {
    setUsername("");
    setFullName("");
    setEmail("");
    setSerial("");
    setModel("");
    setResult(null);
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const cleanSerial = serial.trim();
    const cleanUsername = username.trim().toLowerCase();
    if (!cleanSerial || !cleanUsername) return;

    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const { data: existing, error: lookupError } = await supabase
        .from("laptops")
        .select("id")
        .eq("serial_number", cleanSerial)
        .maybeSingle();
      if (lookupError) throw lookupError;
      if (existing) {
        setError(`Serial ${cleanSerial} is already registered. Nothing was changed.`);
        return;
      }

      const { data: owner, error: ownerError } = await supabase
        .from("users")
        .upsert(
          {
            username: cleanUsername,
            full_name: fullName.trim() || null,
            email: email.trim() || null,
          },
          { onConflict: "username" },
        )
        .select("id, username, full_name")
        .single();
      if (ownerError) throw ownerError;

      const { error: insertError } = await supabase.from("laptops").insert({
        serial_number: cleanSerial,
        model: model.trim() || null,
        user_id: owner.id,
      });
      if (insertError) throw insertError;

      const qr = await QRCode.toDataURL(cleanSerial, {
        width: 640,
        margin: 2,
        color: { dark: "#0b1220", light: "#ffffff" },
      });
      setResult({
        serial: cleanSerial,
        model: model.trim(),
        owner: owner.full_name || owner.username,
        qr,
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not reach the database. Check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <div className="surface space-y-5 text-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-success">
            Device registered
          </p>
          <h2 className="mt-1 text-lg font-semibold">{result.owner}</h2>
          <p className="font-mono text-sm text-muted-foreground">
            {result.serial}
            {result.model ? ` · ${result.model}` : ""}
          </p>
        </div>
        <img
          src={result.qr}
          alt={`QR code for serial number ${result.serial}`}
          className="mx-auto w-full max-w-[260px] rounded-xl border border-border bg-white p-3"
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          <a
            href={result.qr}
            download={`${result.serial}-qr.png`}
            className="btn-primary no-underline"
          >
            Download QR code
          </a>
          <button type="button" onClick={reset} className="btn-ghost w-full sm:w-auto">
            Register another
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="surface space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Register a laptop</h2>
        <p className="mt-1 text-xs text-muted-foreground">Signed in as {accountEmail}</p>
      </div>
      <Field label="Username" value={username} onChange={setUsername} required mono />
      <Field label="Full name" value={fullName} onChange={setFullName} />
      <Field label="Email" type="email" value={email} onChange={setEmail} />
      <Field label="Serial number" value={serial} onChange={setSerial} required mono />
      <Field label="Model" value={model} onChange={setModel} placeholder="MacBook Pro 14" />
      {error && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className="btn-primary disabled:opacity-60">
        {busy ? "Registering…" : "Register & generate QR"}
      </button>
    </form>
  );
}
