import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { STAFF_EMAIL, STUDENT_EMAIL } from "@/lib/photos";
import { Field } from "./Field";

export function AuthPanel() {
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    const clean = email.trim().toLowerCase();
    if (mode === "signup" && !STUDENT_EMAIL.test(clean) && !STAFF_EMAIL.test(clean)) {
      setError("Use your CUK email, e.g. name@student.cuk.ac.ke");
      return;
    }
    setBusy(true);
    try {
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(clean, {
          redirectTo: `${window.location.origin}/?reset-password=1`,
        });
        if (error) throw error;
        setNotice("If an account exists for this email, you’ll receive a link to reset your password.");
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: clean,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (!data.session) setNotice("Check your email to confirm your account, then sign in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: clean, password });
        if (error) throw error;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="surface space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{mode === "forgot" ? "Reset your password" : mode === "signup" ? "Create your account" : "Sign in"}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "forgot" ? "Enter the email address linked to your SmartGate account." : "Students use their @student.cuk.ac.ke email. Guards and admins use their CUK staff email."}
        </p>
      </div>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Email" type="email" value={email} onChange={setEmail} required autoComplete="email" placeholder="xyz@student.cuk.ac.ke" />
        {mode !== "forgot" && <Field
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          required
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          placeholder="••••••••"
        />}
        {error && <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        {notice && <p className="rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary">{notice}</p>}
        <button type="submit" disabled={busy} className="btn-primary disabled:opacity-60">
          {busy ? "Working…" : mode === "forgot" ? "Send reset link" : mode === "signup" ? "Create account" : "Sign in"}
        </button>
      </form>
      {mode === "signin" && (
        <button type="button" className="w-full text-center text-sm text-primary hover:underline" onClick={() => {
          setMode("forgot");
          setError(null);
          setNotice(null);
        }}>Forgot password?</button>
      )}
      <button
        type="button"
        onClick={() => {
          setMode(mode === "signin" ? "signup" : "signin");
          setError(null);
          setNotice(null);
        }}
        className="w-full text-center text-sm text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
      >
        {mode === "forgot" ? "Back to sign in" : mode === "signin" ? "Need an account? Sign up" : "Already have an account? Sign in"}
      </button>
    </div>
  );
}
