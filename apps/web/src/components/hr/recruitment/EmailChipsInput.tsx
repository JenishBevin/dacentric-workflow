import React, { useState } from "react";
import { X } from "lucide-react";
import clsx from "clsx";

export const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

/**
 * Multi-email input (for CC): type an address and press Enter, comma, space or
 * Tab (or leave the field) to turn it into a chip; Backspace on an empty field
 * removes the last chip. Pasting a list ("a@x.com, b@y.com") adds them all.
 */
export function EmailChipsInput({
  value,
  onChange,
  placeholder = "name@company.com",
  max = 10,
  disabled,
}: {
  value: string[];
  onChange: (emails: string[]) => void;
  placeholder?: string;
  max?: number;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");

  function commit(raw: string): boolean {
    const parts = raw.split(/[\s,;]+/).map((p) => p.trim().toLowerCase()).filter(Boolean);
    if (parts.length === 0) return true;
    const bad = parts.find((p) => !EMAIL_RE.test(p));
    if (bad) {
      setError(`"${bad}" is not a valid email address`);
      return false;
    }
    const next = [...value];
    for (const p of parts) if (!next.includes(p)) next.push(p);
    if (next.length > max) {
      setError(`You can CC at most ${max} people`);
      return false;
    }
    setError("");
    onChange(next);
    setDraft("");
    return true;
  }

  return (
    <div>
      <div
        className={clsx(
          "flex min-h-[2.5rem] flex-wrap items-center gap-1.5 rounded-lg border bg-white px-2 py-1.5 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20",
          error ? "border-red-400" : "border-slate-300",
          disabled && "opacity-60"
        )}
      >
        {value.map((email) => (
          <span key={email} className="inline-flex items-center gap-1 rounded-full bg-slate-100 py-0.5 pl-2.5 pr-1 text-xs text-slate-700">
            {email}
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange(value.filter((e) => e !== email))}
              className="rounded-full p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
              aria-label={`Remove ${email}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          type="text"
          inputMode="email"
          value={draft}
          disabled={disabled}
          placeholder={value.length ? "" : placeholder}
          onChange={(e) => {
            setDraft(e.target.value);
            if (error) setError("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "," || e.key === ";" || e.key === " " || e.key === "Tab") {
              if (draft.trim()) {
                e.preventDefault();
                commit(draft);
              } else if (e.key === "Enter") {
                e.preventDefault(); // never submit the surrounding form from here
              }
            } else if (e.key === "Backspace" && !draft && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text");
            if (/[\s,;]/.test(text.trim())) {
              e.preventDefault();
              commit(text);
            }
          }}
          onBlur={() => {
            if (draft.trim()) commit(draft);
          }}
          className="min-w-[10rem] flex-1 border-0 bg-transparent p-1 text-sm outline-none placeholder:text-slate-400"
          aria-label="CC email address"
        />
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
