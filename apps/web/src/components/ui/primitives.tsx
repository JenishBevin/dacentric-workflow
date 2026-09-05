import React from "react";
import clsx from "clsx";
import { Loader2, Eye, EyeOff } from "lucide-react";

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------
type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type ButtonSize = "sm" | "md" | "lg";

export const Button = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize; loading?: boolean }
>(({ className, variant = "primary", size = "md", loading, disabled, children, ...props }, ref) => {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus-visible:focus-ring disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" && "px-2.5 py-1.5 text-xs",
        size === "md" && "px-3.5 py-2 text-sm",
        size === "lg" && "px-4 py-2.5 text-base",
        variant === "primary" && "bg-brand-600 text-white hover:bg-brand-700 shadow-sm",
        variant === "secondary" && "bg-slate-100 text-slate-800 hover:bg-slate-200",
        variant === "outline" && "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
        variant === "ghost" && "text-slate-600 hover:bg-slate-100",
        variant === "danger" && "bg-red-600 text-white hover:bg-red-700 shadow-sm",
        className
      )}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
});
Button.displayName = "Button";

// ---------------------------------------------------------------------------
// Form controls
// ---------------------------------------------------------------------------
export const Label: React.FC<React.LabelHTMLAttributes<HTMLLabelElement> & { required?: boolean }> = ({ children, required, className, ...props }) => (
  <label className={clsx("mb-1 block text-sm font-medium text-slate-700", className)} {...props}>
    {children}
    {required && <span className="ml-0.5 text-red-500">*</span>}
  </label>
);

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { error?: string }>(
  ({ className, error, ...props }, ref) => (
    <div>
      <input
        ref={ref}
        className={clsx(
          "w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:focus-ring",
          error ? "border-red-400" : "border-slate-300",
          className
        )}
        {...props}
      />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
);
Input.displayName = "Input";

/** Password field with a show/hide toggle. Drop-in replacement for
 *  <Input type="password" /> — don't pass `type`, it's fixed internally. */
export const PasswordInput = React.forwardRef<HTMLInputElement, Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & { error?: string }>(
  ({ className, error, ...props }, ref) => {
    const [visible, setVisible] = React.useState(false);
    return (
      <div>
        <div className="relative">
          <input
            ref={ref}
            type={visible ? "text" : "password"}
            className={clsx(
              "w-full rounded-lg border bg-white px-3 py-2 pr-10 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:focus-ring",
              error ? "border-red-400" : "border-slate-300",
              className
            )}
            {...props}
          />
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Hide password" : "Show password"}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600"
          >
            {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
    );
  }
);
PasswordInput.displayName = "PasswordInput";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: string }>(
  ({ className, error, ...props }, ref) => (
    <div>
      <textarea
        ref={ref}
        className={clsx(
          "w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:focus-ring",
          error ? "border-red-400" : "border-slate-300",
          className
        )}
        {...props}
      />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
);
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement> & { error?: string }>(
  ({ className, error, children, ...props }, ref) => (
    <div>
      <select
        ref={ref}
        className={clsx(
          "w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 focus-visible:focus-ring",
          error ? "border-red-400" : "border-slate-300",
          className
        )}
        {...props}
      >
        {children}
      </select>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
);
Select.displayName = "Select";

export const Checkbox: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({ className, ...props }) => (
  <input type="checkbox" className={clsx("h-4 w-4 rounded border-slate-300 text-brand-600 focus-visible:focus-ring", className)} {...props} />
);

// ---------------------------------------------------------------------------
// Card / Badge / Avatar
// ---------------------------------------------------------------------------
export const Card: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, children, ...props }) => (
  <div className={clsx("rounded-xl border border-slate-200 bg-white shadow-card", className)} {...props}>
    {children}
  </div>
);

type BadgeTone = "slate" | "green" | "amber" | "red" | "indigo" | "purple" | "blue";
const BADGE_TONES: Record<BadgeTone, string> = {
  slate: "bg-slate-100 text-slate-700",
  green: "bg-emerald-100 text-emerald-700",
  amber: "bg-amber-100 text-amber-800",
  red: "bg-red-100 text-red-700",
  indigo: "bg-indigo-100 text-indigo-700",
  purple: "bg-purple-100 text-purple-700",
  blue: "bg-blue-100 text-blue-700",
};

export const Badge: React.FC<{ tone?: BadgeTone; className?: string; children: React.ReactNode; dotted?: boolean }> = ({
  tone = "slate",
  className,
  children,
  dotted,
}) => (
  <span className={clsx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", BADGE_TONES[tone], className)}>
    {dotted && <span className={clsx("h-1.5 w-1.5 rounded-full", BADGE_TONES[tone].split(" ")[1])} />}
    {children}
  </span>
);

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const AVATAR_COLORS = ["bg-brand-500", "bg-emerald-500", "bg-amber-500", "bg-pink-500", "bg-sky-500", "bg-purple-500"];
function colorForName(name: string) {
  const idx = name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
}

export const Avatar: React.FC<{ name: string; size?: "xs" | "sm" | "md" | "lg"; className?: string; src?: string }> = ({
  name,
  size = "sm",
  className,
  src,
}) => {
  const [imgFailed, setImgFailed] = React.useState(false);
  const showImg = src && !imgFailed;
  return (
    <div
      title={name}
      className={clsx(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full font-medium text-white",
        size === "xs" && "h-5 w-5 text-[9px]",
        size === "sm" && "h-7 w-7 text-xs",
        size === "md" && "h-9 w-9 text-sm",
        size === "lg" && "h-16 w-16 text-xl",
        !showImg && colorForName(name || "?"),
        className
      )}
    >
      {showImg ? (
        <img src={src} alt={name} className="h-full w-full object-cover" onError={() => setImgFailed(true)} />
      ) : (
        initials(name || "?")
      )}
    </div>
  );
};

export const AvatarGroup: React.FC<{ names: string[]; max?: number }> = ({ names, max = 3 }) => {
  const shown = names.slice(0, max);
  const extra = names.length - shown.length;
  return (
    <div className="flex -space-x-2">
      {shown.map((n, i) => (
        <Avatar key={i} name={n} size="xs" className="ring-2 ring-white" />
      ))}
      {extra > 0 && (
        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-[9px] font-medium text-slate-600 ring-2 ring-white">
          +{extra}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Skeleton / Empty / Spinner
// ---------------------------------------------------------------------------
export const Skeleton: React.FC<{ className?: string }> = ({ className }) => (
  <div className={clsx("animate-pulse rounded-md bg-slate-200", className)} />
);

export const Spinner: React.FC<{ className?: string }> = ({ className }) => <Loader2 className={clsx("animate-spin text-brand-600", className)} />;

export const EmptyState: React.FC<{ icon?: React.ReactNode; title: string; description?: string; action?: React.ReactNode }> = ({
  icon,
  title,
  description,
  action,
}) => (
  <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white/60 px-6 py-12 text-center">
    {icon && <div className="mb-3 text-slate-400">{icon}</div>}
    <p className="text-sm font-medium text-slate-700">{title}</p>
    {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

export const ErrorState: React.FC<{ message?: string; onRetry?: () => void }> = ({ message, onRetry }) => (
  <div className="flex flex-col items-center justify-center rounded-xl border border-red-200 bg-red-50 px-6 py-10 text-center">
    <p className="text-sm font-medium text-red-700">{message ?? "Something went wrong."}</p>
    {onRetry && (
      <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
        Try again
      </Button>
    )}
  </div>
);

export const Tooltip: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <span className="group relative inline-flex">
    {children}
    <span className="pointer-events-none absolute -top-8 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-[11px] text-white opacity-0 transition-opacity group-hover:opacity-100">
      {label}
    </span>
  </span>
);
