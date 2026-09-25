import { useCallback, useEffect, useRef, useState } from "react";
import type QrScannerType from "qr-scanner";
import { supabase } from "@/integrations/supabase/client";

type Match = {
  serial: string;
  model: string | null;
  registered_at: string;
  username: string | null;
  full_name: string | null;
};

type Status =
  | { kind: "idle" }
  | { kind: "scanning" }
  | { kind: "checking"; value: string }
  | { kind: "match"; value: string; match: Match }
  | { kind: "nomatch"; value: string }
  | { kind: "error"; title: string; message: string };

export function ScanTab() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerRef = useRef<QrScannerType | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [run, setRun] = useState(0);

  const lookup = useCallback(async (value: string) => {
    const scanned = value.trim();
    if (!scanned) {
      setStatus({
        kind: "error",
        title: "Unreadable code",
        message: "That code did not contain a serial number. Try holding the camera steadier.",
      });
      return;
    }
    setStatus({ kind: "checking", value: scanned });
    try {
      const { data, error } = await supabase
        .from("laptops")
        .select("serial_number, model, registered_at, users(username, full_name)")
        .eq("serial_number", scanned)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        setStatus({ kind: "nomatch", value: scanned });
        return;
      }
      const owner = (data as unknown as { users: { username: string; full_name: string } | null })
        .users;
      setStatus({
        kind: "match",
        value: scanned,
        match: {
          serial: data.serial_number,
          model: data.model,
          registered_at: data.registered_at,
          username: owner?.username ?? null,
          full_name: owner?.full_name ?? null,
        },
      });
    } catch (err) {
      setStatus({
        kind: "error",
        title: "Lookup failed",
        message:
          err instanceof Error
            ? err.message
            : "We could not reach the registry. Check your connection and scan again.",
      });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let scanner: QrScannerType | null = null;

    (async () => {
      const { default: QrScanner } = await import("qr-scanner");
      if (cancelled) return;

      const hasCamera = await QrScanner.hasCamera().catch(() => false);
      if (cancelled) return;
      if (!hasCamera) {
        setStatus({
          kind: "error",
          title: "No camera found",
          message: "This device has no usable camera. Open the link on a phone to scan a code.",
        });
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
        {
          preferredCamera: "environment",
          highlightScanRegion: true,
          highlightCodeOutline: true,
          returnDetailedScanResult: true,
        },
      );
      scannerRef.current = scanner;

      try {
        await scanner.start();
        if (!cancelled) setStatus({ kind: "scanning" });
      } catch (err) {
        const name = (err as { name?: string })?.name ?? "";
        const denied =
          name === "NotAllowedError" ||
          name === "SecurityError" ||
          String(err).toLowerCase().includes("permission");
        setStatus(
          denied
            ? {
                kind: "error",
                title: "Camera access blocked",
                message:
                  "Allow camera access for this site in your browser settings, then tap Scan again.",
              }
            : {
                kind: "error",
                title: "Camera unavailable",
                message: "The camera could not be started. Close other apps using it and retry.",
              },
        );
      }
    })();

    return () => {
      cancelled = true;
      scanner?.stop();
      scanner?.destroy();
      scannerRef.current = null;
    };
  }, [run, lookup]);

  const rescan = () => {
    setStatus({ kind: "idle" });
    setRun((n) => n + 1);
  };

  const showCamera = status.kind === "idle" || status.kind === "scanning";

  return (
    <div className="space-y-4">
      <div className={showCamera ? "surface space-y-3" : "hidden"}>
        <h2 className="text-lg font-semibold">Scan a device QR code</h2>
        <div className="overflow-hidden rounded-xl border border-border bg-black">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video ref={videoRef} className="aspect-square w-full object-cover" playsInline muted />
        </div>
        <p className="text-sm text-muted-foreground">
          {status.kind === "scanning" ? "Point at the QR code on the laptop." : "Starting camera…"}
        </p>
      </div>

      {status.kind === "checking" && (
        <div className="surface text-sm text-muted-foreground">
          Checking <span className="font-mono text-foreground">{status.value}</span> against the
          registry…
        </div>
      )}

      {status.kind === "match" && (
        <div className="surface border-success/60 bg-success/10 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-success">Match found</p>
          <h2 className="text-xl font-semibold">
            {status.match.full_name || status.match.username || "Unknown owner"}
          </h2>
          <dl className="space-y-2 text-sm">
            <Row label="Username" value={status.match.username ?? "—"} mono />
            <Row label="Serial" value={status.match.serial} mono />
            <Row label="Model" value={status.match.model || "—"} />
            <Row
              label="Registered"
              value={new Date(status.match.registered_at).toLocaleDateString()}
            />
          </dl>
          <button type="button" onClick={rescan} className="btn-ghost w-full">
            Scan again
          </button>
        </div>
      )}

      {status.kind === "nomatch" && (
        <div className="surface border-destructive/60 bg-destructive/10 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-destructive">
            No match
          </p>
          <p className="text-sm text-muted-foreground">
            This serial number is not in the registry.
          </p>
          <p className="font-mono text-base break-all">{status.value}</p>
          <button type="button" onClick={rescan} className="btn-ghost w-full">
            Scan again
          </button>
        </div>
      )}

      {status.kind === "error" && (
        <div className="surface space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-destructive">
            {status.title}
          </p>
          <p className="text-sm text-muted-foreground">{status.message}</p>
          <button type="button" onClick={rescan} className="btn-ghost w-full">
            Scan again
          </button>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/60 pb-2 last:border-0">
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className={`text-right ${mono ? "font-mono break-all" : ""}`}>{value}</dd>
    </div>
  );
}
