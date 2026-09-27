import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { errMsg, uploadPhoto } from "@/lib/photos";
import { Field } from "./Field";
import { PhotoInput } from "./Photo";

export function ProfileSetup({ userId, email, onDone }: { userId: string; email: string; onDone: () => void }) {
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState(email.split("@")[0].toLowerCase());
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
        username: username.trim().toLowerCase(),
        photo_path: path,
      });
      if (error) throw error.code === "23505" ? new Error("That username is taken.") : error;
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
          Guards compare this passport photo with you at the gate. Use a clear, front-facing photo.
        </p>
      </div>
      <Field label="Full name" value={fullName} onChange={setFullName} required />
      <Field label="Username" value={username} onChange={setUsername} required mono />
      <PhotoInput label="Passport photo" file={photo} onChange={setPhoto} capture="user" />
      {error && <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <button type="submit" disabled={busy} className="btn-primary disabled:opacity-60">
        {busy ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}
