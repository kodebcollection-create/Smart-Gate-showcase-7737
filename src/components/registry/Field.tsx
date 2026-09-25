import { useId } from "react";

export function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  mono,
  required,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  mono?: boolean;
  required?: boolean;
  autoComplete?: string;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="block text-xs font-medium uppercase tracking-wider text-muted-foreground"
      >
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        required={required}
        autoComplete={autoComplete}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`field focus:field-focus ${mono ? "font-mono tracking-wide" : ""}`}
      />
    </div>
  );
}
