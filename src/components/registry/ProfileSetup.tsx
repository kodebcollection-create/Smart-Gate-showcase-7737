import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { errMsg, uploadPhoto } from "@/lib/photos";
import { Field } from "./Field";
import { PhotoInput } from "./Photo";

export function ProfileSetup({ userId, email, onDone }: { userId: string; email: string; onDone: () => void }) {
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!photo) return setError("A passport photo is required.");
    setBusy(true);
    setError(null);
    try {
      const path = await uploadPhoto(userId, "passport", photo);
      const { error } = await supabase.from("profiles").upsert({
        id: userId,
        email,
        full_name: fullName.trim(),
        username: username.trim().toUpperCase(),
        photo_path: path,
      });
      if (error) throw error.code === "23505" ? new Error("That registration number is already used by another account.") : error;
      onDone();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="surface space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Complete your profile</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter your name and registration number, then upload the passport photo from your student portal. Guards compare it with you at the gate.
        </p>
      </div>
      <Field label="Full name" value={fullName} onChange={setFullName} required />
      <Field label="Registration number" value={username} onChange={setUsername} required mono placeholder="e.g. BSC/1234/2023" />
      <PhotoInput label="Passport photo (from your student portal)" file={photo} onChange={setPhoto} />
      {error && <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <button type="submit" disabled={busy} className="btn-primary disabled:opacity-60">
        {busy ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}
