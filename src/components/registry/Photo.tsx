import { useSignedUrl } from "@/lib/photos";

export function Photo({ path, alt, className = "" }: { path: string | null | undefined; alt: string; className?: string }) {
  const url = useSignedUrl(path);
  return url ? (
    <img src={url} alt={alt} className={`rounded-xl border border-border object-cover ${className}`} />
  ) : (
    <div className={`rounded-xl border border-border bg-muted ${className}`} aria-label={alt} />
  );
}

export function PhotoInput({
  label,
  file,
  onChange,
  capture,
}: {
  label: string;
  file: File | null;
  onChange: (f: File | null) => void;
  capture?: "user" | "environment";
}) {
  const preview = file ? URL.createObjectURL(file) : null;
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label} *</span>
      {preview && <img src={preview} alt="" className="h-40 w-full rounded-xl border border-border object-cover" />}
      <input
        type="file"
        accept="image/*"
        capture={capture}
        required={!file}
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        className="field text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1 file:text-primary-foreground"
      />
    </label>
  );
}
