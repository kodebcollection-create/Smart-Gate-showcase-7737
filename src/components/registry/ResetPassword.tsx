import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Field } from "./Field";

export function ResetPassword({ ready, onDone }: { ready: boolean; onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Use at least 8 characters for your new password.");
      return;
    }
    if (password !== confirmation) {
      setError("The passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update your password. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="surface space-y-4">
      <h2 className="text-lg font-semibold">{saved ? "Password updated" : "Set a new password"}</h2>
      {saved ? (
        <>
          <p className="text-sm text-muted-foreground">Your SmartGate password has been changed.</p>
          <button className="btn-primary" onClick={onDone}>Continue to SmartGate</button>
        </>
      ) : !ready ? (
        <>
          <p className="text-sm text-muted-foreground">This recovery link is invalid or expired. Request a new link from the sign-in screen.</p>
          <button className="btn-ghost" onClick={onDone}>Back to sign in</button>
        </>
      ) : (
        <form className="space-y-3" onSubmit={submit}>
          <Field label="New password" type="password" value={password} onChange={setPassword} required autoComplete="new-password" />
          <Field label="Confirm new password" type="password" value={confirmation} onChange={setConfirmation} required autoComplete="new-password" />
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <button className="btn-primary disabled:opacity-60" disabled={busy} type="submit">{busy ? "Saving…" : "Save new password"}</button>
        </form>
      )}
    </section>
  );
}