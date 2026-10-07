import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { AuthPanel } from "@/components/registry/AuthPanel";
import { RegisterTab } from "@/components/registry/RegisterTab";
import { ScanTab } from "@/components/registry/ScanTab";
import { ProfileSetup } from "@/components/registry/ProfileSetup";
import { ResetPassword } from "@/components/registry/ResetPassword";
import { StaffTools } from "@/components/registry/StaffTools";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CUK Smart Gate — Laptop registration and gate checks" },
      {
        name: "description",
        content: "Students register laptops and get a secure QR code; CUK guards scan it to sign laptops in and out.",
      },
      { property: "og:title", content: "CUK Smart Gate — Laptop registration and gate checks" },
      {
        property: "og:description",
        content: "Students register laptops and get a secure QR code; CUK guards scan it to sign laptops in and out.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

type Role = "student" | "guard" | "admin";

function Index() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [roles, setRoles] = useState<Role[] | null>(null);
  const [hasProfile, setHasProfile] = useState<boolean | null>(null);
  const [recovery, setRecovery] = useState(false);
  const [recoveryReady, setRecoveryReady] = useState(false);

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const requestedRecovery = hash.get("type") === "recovery" || new URLSearchParams(window.location.search).has("reset-password");
    setRecovery(requestedRecovery);
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === "PASSWORD_RECOVERY") {
        setRecovery(true);
        setRecoveryReady(true);
      }
    });
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
      }
      if (requestedRecovery) setRecoveryReady(!!user);
      setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;

  const loadProfile = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase.from("profiles").select("photo_path").eq("id", userId).maybeSingle();
    setHasProfile(!!data?.photo_path);
  }, [userId]);

  useEffect(() => {
    setRoles(null);
    setHasProfile(null);
    if (!userId) return;
    (async () => {
      await supabase.rpc("claim_student_role");
      await supabase.rpc("claim_staff_role");
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
      setRoles(((data ?? []) as { role: Role }[]).map((r) => r.role));
      await loadProfile();
    })();
  }, [userId, loadProfile]);

  const isStaff = roles?.includes("guard") || roles?.includes("admin");
  const isStudent = roles?.includes("student");

  let body: React.ReactNode;
  if (!ready) {
    body = <div className="surface text-sm text-muted-foreground">Loading…</div>;
  } else if (recovery) {
    body = <ResetPassword ready={recoveryReady} onDone={() => {
      window.history.replaceState(null, "", "/");
      setRecovery(false);
      setRecoveryReady(false);
    }} />;
  } else if (session && (roles === null || (isStudent && hasProfile === null))) {
    body = <div className="surface text-sm text-muted-foreground">Loading…</div>;
  } else if (!session) {
    body = <AuthPanel />;
  } else if (isStaff) {
    body = (
      <>
        <ScanTab />
        <StaffTools />
      </>
    );
  } else if (isStudent) {
    body = hasProfile ? (
      <RegisterTab userId={session.user.id} />
    ) : (
      <ProfileSetup userId={session.user.id} email={session.user.email ?? ""} onDone={loadProfile} />
    );
  } else {
    body = (
      <div className="surface text-sm text-muted-foreground">
        This account has no access. Use a @student.cuk.ac.ke or CUK staff email.
      </div>
    );
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-lg px-4 pb-16 pt-8">
      <header className="mb-6 flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary">
            CUK Smart Gate{session && roles ? ` · ${isStaff ? "Guard" : "Student"}` : ""}
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            {recovery ? "Password recovery" : isStaff ? "Gate check" : "Laptop registration"}
          </h1>
        </div>
        {session && (
          <button type="button" onClick={() => supabase.auth.signOut()} className="text-sm text-muted-foreground hover:text-primary">
            Sign out
          </button>
        )}
      </header>
      {body}
    </main>
  );
}
