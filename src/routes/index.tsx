import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { AuthPanel } from "@/components/registry/AuthPanel";
import { RegisterTab } from "@/components/registry/RegisterTab";
import { ScanTab } from "@/components/registry/ScanTab";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Device Registry — Verify laptop ownership by QR code" },
      {
        name: "description",
        content:
          "Register laptops with a QR code and verify ownership instantly by scanning the code with your phone camera.",
      },
      { property: "og:title", content: "Device Registry — Verify laptop ownership by QR code" },
      {
        property: "og:description",
        content:
          "Register laptops with a QR code and verify ownership instantly by scanning the code with your phone camera.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const [tab, setTab] = useState<"register" | "scan">("scan");
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return (
    <main className="mx-auto min-h-screen w-full max-w-lg px-4 pb-16 pt-8">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary">Device Registry</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Verify laptop ownership in seconds
        </h1>
      </header>

      <div className="mb-5 flex rounded-xl border border-border bg-card p-1">
        {(
          [
            ["scan", "Scan & Verify"],
            ["register", "Register"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              tab === key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "scan" ? (
        <ScanTab />
      ) : !ready ? (
        <div className="surface text-sm text-muted-foreground">Loading…</div>
      ) : session ? (
        <div className="space-y-3">
          <RegisterTab userId={session.user.id} />
          <button
            type="button"
            onClick={() => supabase.auth.signOut()}
            className="w-full text-center text-sm text-muted-foreground hover:text-primary"
          >
            Sign out
          </button>
        </div>
      ) : (
        <AuthPanel />
      )}
    </main>
  );
}
