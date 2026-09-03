"use client";

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, Check, ChevronDown, ChevronLeft, ChevronRight, Info, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

/* ───────────────────────── Button ───────────────────────── */
type Variant = "primary" | "secondary" | "ghost" | "danger" | "accent" | "link";
type Size = "xs" | "sm" | "md";
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}
const variants: Record<Variant, string> = {
  primary: "bg-ink text-white border-ink hover:bg-black disabled:bg-faint disabled:border-faint",
  secondary: "bg-card text-ink border-line-strong hover:bg-sand",
  ghost: "bg-transparent text-ink border-transparent hover:bg-sand",
  danger: "bg-card text-danger border-danger/40 hover:bg-danger-soft",
  accent: "bg-accent text-white border-accent hover:brightness-95",
  link: "bg-transparent border-transparent text-accent underline-offset-2 hover:underline px-0",
};
const sizes: Record<Size, string> = { xs: "h-6 px-2 text-[11px] gap-1", sm: "h-7 px-2.5 text-xs gap-1.5", md: "h-8 px-3 text-[13px] gap-2" };
export function Button({ variant = "secondary", size = "md", loading, icon, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button className={cn("inline-flex items-center justify-center whitespace-nowrap rounded-[5px] border font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60", variants[variant], sizes[size], className)} disabled={disabled || loading} {...rest}>
      {loading ? <Loader2 size={14} className="animate-spin" /> : icon}
      {children}
    </button>
  );
}
export function IconButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button aria-label={label} title={label} className={cn("inline-flex h-7 w-7 items-center justify-center rounded border border-transparent text-muted hover:bg-sand hover:text-ink", className)} {...rest}>
      {children}
    </button>
  );
}

/* ───────────────────────── Inputs ───────────────────────── */
const fieldBase = "w-full rounded-[5px] border border-line bg-card px-2.5 text-[13px] outline-none placeholder:text-faint focus:border-ink disabled:bg-sand disabled:text-muted";
export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldBase, "h-8", className)} {...rest} />;
}
export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldBase, "min-h-[80px] py-2 leading-relaxed", className)} {...rest} />;
}
export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={cn(fieldBase, "h-8 appearance-none pr-7", className)} {...rest}>
        {children}
      </select>
      <ChevronDown size={14} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted" />
    </div>
  );
}
export function Field({ label, hint, children, className, required }: { label: string; hint?: string; children: ReactNode; className?: string; required?: boolean }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block text-xs font-medium text-ink">
        {label}
        {required && <span className="text-danger"> *</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-muted">{hint}</span>}
    </label>
  );
}
export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)} className={cn("inline-flex items-center gap-2 text-xs", disabled && "opacity-50")}>
      <span className={cn("relative inline-block h-[18px] w-8 rounded-full transition-colors", checked ? "bg-positive" : "bg-line-strong")}>
        <span className={cn("absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow-sm transition-all", checked ? "left-[16px]" : "left-[2px]")} />
      </span>
      {label && <span>{label}</span>}
    </button>
  );
}
export function Checkbox({ checked, onChange, label, className }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; className?: string }) {
  return (
    <label className={cn("inline-flex cursor-pointer items-center gap-2 text-xs", className)}>
      <span onClick={(e) => { e.preventDefault(); onChange(!checked); }} className={cn("flex h-4 w-4 items-center justify-center rounded-[3px] border", checked ? "border-ink bg-ink text-white" : "border-line-strong bg-card")}>
        {checked && <Check size={11} strokeWidth={3} />}
      </span>
      {label}
    </label>
  );
}
export function Chips({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const parts = draft.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length) onChange([...new Set([...value, ...parts])]);
    setDraft("");
  };
  return (
    <div className="flex min-h-8 flex-wrap items-center gap-1 rounded-[5px] border border-line bg-card px-1.5 py-1 focus-within:border-ink">
      {value.map((v) => (
        <span key={v} className="inline-flex items-center gap-1 rounded bg-sand px-1.5 py-0.5 text-xs">
          {v}
          <button type="button" onClick={() => onChange(value.filter((x) => x !== v))} className="text-muted hover:text-ink"><X size={11} /></button>
        </span>
      ))}
      <input value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={add} onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); } if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1)); }} placeholder={placeholder ?? "Add…"} className="min-w-[80px] flex-1 bg-transparent px-1 text-xs outline-none" />
    </div>
  );
}

/* ───────────────────────── Card / layout ───────────────────────── */
export function Card({ className, children, title, action, eyebrow, padded = true }: { className?: string; children: ReactNode; title?: ReactNode; action?: ReactNode; eyebrow?: string; padded?: boolean }) {
  return (
    <section className={cn("card", className)}>
      {(title || action || eyebrow) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
          <div>
            {eyebrow && <div className="eyebrow">{eyebrow}</div>}
            {title && <div className="text-[13px] font-semibold">{title}</div>}
          </div>
          {action}
        </header>
      )}
      <div className={padded ? "p-4" : ""}>{children}</div>
    </section>
  );
}
export function PageHeader({ title, subtitle, actions, eyebrow }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: string }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
        <h1 className="font-display text-[26px] leading-tight font-normal">{title}</h1>
        {subtitle && <p className="mt-1 text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
export function KpiRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("card grid grid-cols-2 divide-y divide-line sm:grid-cols-3 sm:divide-y-0 sm:divide-x lg:grid-cols-5", className)}>{children}</div>;
}
export function Kpi({ label, value, delta, hint, tone }: { label: string; value: ReactNode; delta?: number; hint?: string; tone?: "teal" | "accent" }) {
  return (
    <div className="px-4 py-3">
      <div className="eyebrow">{label}</div>
      <div className={cn("mt-1 text-[22px] leading-tight font-semibold tracking-tight", tone === "teal" && "text-teal", tone === "accent" && "text-accent")}>{value}</div>
      {delta !== undefined && <Delta value={delta} />}
      {hint && <div className="mt-0.5 text-[11px] text-muted">{hint}</div>}
    </div>
  );
}
export function Delta({ value, suffix = "%" }: { value: number; suffix?: string }) {
  const pos = value > 0, neg = value < 0;
  return <div className={cn("mt-0.5 text-xs font-medium", pos && "text-positive", neg && "text-danger", !pos && !neg && "text-muted")}>{pos ? "+" : ""}{value}{suffix}</div>;
}
export function StatTiles({ items, cols = 4 }: { items: { label: string; value: ReactNode; delta?: number; hint?: string }[]; cols?: number }) {
  return (
    <div className={cn("card grid divide-y divide-line sm:divide-y-0 sm:divide-x", cols === 3 ? "grid-cols-1 sm:grid-cols-3" : cols === 5 ? "grid-cols-2 sm:grid-cols-5" : "grid-cols-2 sm:grid-cols-4")}>
      {items.map((it) => <Kpi key={it.label} {...it} />)}
    </div>
  );
}
export function EmptyState({ title, body, action, icon }: { title: string; body?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {icon && <div className="mb-3 text-faint">{icon}</div>}
      <div className="font-display text-lg">{title}</div>
      {body && <p className="mt-1 max-w-sm text-muted">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
export function Spinner({ className }: { className?: string }) {
  return <Loader2 size={16} className={cn("animate-spin text-muted", className)} />;
}
export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 px-4 py-10 text-muted">
      <Spinner /> {label}
    </div>
  );
}
export function ErrorBox({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-danger">
      <AlertCircle size={14} /> {error instanceof Error ? error.message : String(error)}
      {retry && <button onClick={retry} className="ml-auto underline">Retry</button>}
    </div>
  );
}
export function Note({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warn" | "success" }) {
  const cls = tone === "warn" ? "border-amber/40 bg-amber-soft text-amber" : tone === "success" ? "border-positive/40 bg-positive-soft text-positive" : "border-teal/30 bg-teal-soft text-teal";
  return (
    <div className={cn("flex items-start gap-2 rounded border px-3 py-2 text-xs", cls)}>
      <Info size={14} className="mt-0.5 shrink-0" />
      <div className="text-ink/80">{children}</div>
    </div>
  );
}

/* ───────────────────────── Badge / status ───────────────────────── */
export type Tone = "neutral" | "green" | "red" | "amber" | "teal" | "accent" | "ink";
const toneCls: Record<Tone, string> = {
  neutral: "bg-sand text-muted",
  green: "bg-positive-soft text-positive",
  red: "bg-danger-soft text-danger",
  amber: "bg-amber-soft text-amber",
  teal: "bg-teal-soft text-teal",
  accent: "bg-accent-soft text-accent",
  ink: "bg-ink text-white",
};
export function Badge({ tone = "neutral", children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-[4px] px-1.5 py-[2px] text-[11px] font-medium", toneCls[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
export function StatusDot({ tone, className }: { tone: Tone; className?: string }) {
  const c = { neutral: "bg-faint", green: "bg-positive", red: "bg-danger", amber: "bg-amber", teal: "bg-teal", accent: "bg-accent", ink: "bg-ink" }[tone];
  return <span className={cn("inline-block h-2 w-2 rounded-full", c, className)} />;
}
export function statusTone(s: string | null | undefined): Tone {
  switch ((s ?? "").toLowerCase()) {
    case "published": case "paid": case "fulfilled": case "active": case "approved": case "live": case "completed": case "done": case "sent": case "delivered": case "ready": case "winner": case "promoted": case "verified": case "issued": case "ok": case "recommended": case "running":
      return "green";
    case "draft": case "pending": case "unfulfilled": case "queued": case "todo": case "scheduled": case "trialing": case "idle": case "not_cited": case "requested":
      return "neutral";
    case "partial": case "partially_refunded": case "in_progress": case "waiting": case "paused": case "building": case "verifying": case "authorized": case "sending": case "mentioned": case "past_due": case "at_risk":
      return "amber";
    case "cancelled": case "refunded": case "rejected": case "failed": case "error": case "killed": case "deleted": case "disabled": case "expired": case "archived": case "returned": case "bounced":
      return "red";
    case "cited": case "vip": case "returning":
      return "teal";
    default:
      return "neutral";
  }
}
export function StatusBadge({ status }: { status: string | null | undefined }) {
  return <Badge tone={statusTone(status)} dot>{(status ?? "—").replace(/_/g, " ")}</Badge>;
}

/* ───────────────────────── Tabs ───────────────────────── */
export function Tabs<T extends string>({ value, onChange, items, className }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode; count?: number }[]; className?: string }) {
  return (
    <div className={cn("flex items-center gap-1 overflow-x-auto border-b border-line", className)}>
      {items.map((it) => (
        <button key={it.value} onClick={() => onChange(it.value)} className={cn("-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-xs font-medium transition-colors", value === it.value ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink")}>
          {it.label}
          {it.count !== undefined && <span className={cn("rounded px-1 text-[10px]", value === it.value ? "bg-ink text-white" : "bg-sand text-muted")}>{it.count}</span>}
        </button>
      ))}
    </div>
  );
}
export function SegmentedControl<T extends string>({ value, onChange, items, size = "sm" }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode }[]; size?: "xs" | "sm" }) {
  return (
    <div className="inline-flex rounded-[5px] border border-line bg-card p-0.5">
      {items.map((it) => (
        <button key={it.value} onClick={() => onChange(it.value)} className={cn("rounded-[3px] font-medium transition-colors", size === "xs" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs", value === it.value ? "bg-ink text-white" : "text-muted hover:text-ink")}>
          {it.label}
        </button>
      ))}
    </div>
  );
}

/* ───────────────────────── Table ───────────────────────── */
export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("w-full overflow-x-auto", className)}>
      <table className="w-full min-w-[560px] border-collapse text-[13px]">{children}</table>
    </div>
  );
}
export function Th({ children, className, right }: { children?: ReactNode; className?: string; right?: boolean }) {
  return <th className={cn("eyebrow whitespace-nowrap border-b border-line px-3 py-2 text-left font-semibold", right && "text-right", className)}>{children}</th>;
}
export function Td({ children, className, right, colSpan }: { children?: ReactNode; className?: string; right?: boolean; colSpan?: number }) {
  return <td colSpan={colSpan} className={cn("border-b border-line px-3 py-2 align-middle", right && "text-right", className)}>{children}</td>;
}
export function Tr({ children, onClick, className }: { children: ReactNode; onClick?: () => void; className?: string }) {
  return <tr onClick={onClick} className={cn(onClick && "cursor-pointer hover:bg-cream/60", className)}>{children}</tr>;
}
export function Pagination({ page, pageSize, total, onChange }: { page: number; pageSize: number; total: number; onChange: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  return (
    <div className="flex items-center justify-between px-3 py-2 text-xs text-muted">
      <span>
        {(page - 1) * pageSize + 1}–{Math.min(total, page * pageSize)} of {total}
      </span>
      <div className="flex items-center gap-1">
        <IconButton label="Previous page" disabled={page <= 1} onClick={() => onChange(page - 1)}><ChevronLeft size={14} /></IconButton>
        <span className="px-1">{page} / {pages}</span>
        <IconButton label="Next page" disabled={page >= pages} onClick={() => onChange(page + 1)}><ChevronRight size={14} /></IconButton>
      </div>
    </div>
  );
}

/* ───────────────────────── Dialog ───────────────────────── */
export function Dialog({ open, onClose, title, children, footer, width = "max-w-lg", description }: { open: boolean; onClose: () => void; title?: ReactNode; description?: ReactNode; children: ReactNode; footer?: ReactNode; width?: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open || !mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/30 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal className={cn("animate-in flex max-h-[92vh] w-full flex-col rounded-t-lg border border-line bg-card shadow-xl sm:rounded-lg", width)}>
        {(title || description) && (
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-3">
            <div>
              {title && <div className="font-display text-lg">{title}</div>}
              {description && <div className="mt-0.5 text-xs text-muted">{description}</div>}
            </div>
            <IconButton label="Close" onClick={onClose}><X size={16} /></IconButton>
          </div>
        )}
        <div className="scrollbar-thin flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
export function ConfirmDialog({ open, onClose, onConfirm, title, body, confirmLabel = "Confirm", danger, loading }: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; body?: ReactNode; confirmLabel?: string; danger?: boolean; loading?: boolean }) {
  return (
    <Dialog open={open} onClose={onClose} title={title} width="max-w-sm" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant={danger ? "danger" : "primary"} loading={loading} onClick={onConfirm}>{confirmLabel}</Button></>}>
      <div className="text-[13px] text-muted">{body}</div>
    </Dialog>
  );
}

/* ───────────────────────── Menu ───────────────────────── */
export function Menu({ trigger, items, align = "right" }: { trigger: ReactNode; items: { label: string; onClick: () => void; danger?: boolean; icon?: ReactNode }[]; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  return (
    <div ref={ref} className="relative inline-block" onClick={(e) => e.stopPropagation()}>
      <span onClick={() => setOpen((o) => !o)}>{trigger}</span>
      {open && (
        <div className={cn("animate-in absolute z-40 mt-1 min-w-[160px] rounded-[5px] border border-line bg-card py-1 shadow-lg", align === "right" ? "right-0" : "left-0")}>
          {items.map((it) => (
            <button key={it.label} onClick={() => { setOpen(false); it.onClick(); }} className={cn("flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-sand", it.danger && "text-danger")}>
              {it.icon}{it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── Toast ───────────────────────── */
interface Toast { id: number; message: string; tone: "success" | "error" | "info" }
const ToastCtx = createContext<{ toast: (message: string, tone?: Toast["tone"]) => void } | null>(null);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const toast = useCallback((message: string, tone: Toast["tone"] = "success") => {
    const id = Date.now() + Math.random();
    setItems((t) => [...t, { id, message, tone }]);
    setTimeout(() => setItems((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);
  const value = useMemo(() => ({ toast }), [toast]);
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 left-1/2 z-[100] flex -translate-x-1/2 flex-col items-center gap-2 sm:bottom-6">
        {items.map((t) => (
          <div key={t.id} className={cn("animate-in pointer-events-auto flex items-center gap-2 rounded-[6px] border px-3 py-2 text-xs shadow-lg", t.tone === "error" ? "border-danger/40 bg-danger-soft text-danger" : t.tone === "info" ? "border-line bg-card text-ink" : "border-positive/40 bg-positive-soft text-positive")}>
            {t.tone === "error" ? <AlertCircle size={14} /> : t.tone === "info" ? <Info size={14} /> : <Check size={14} />}
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export function useToast() {
  const v = useContext(ToastCtx);
  if (!v) throw new Error("useToast outside ToastProvider");
  return v.toast;
}

/* ───────────────────────── misc ───────────────────────── */
export function Avatar({ name, size = 24, className }: { name: string; size?: number; className?: string }) {
  const letter = (name.trim()[0] ?? "K").toUpperCase();
  return (
    <span className={cn("inline-flex items-center justify-center rounded-full bg-accent font-semibold text-white", className)} style={{ width: size, height: size, fontSize: size * 0.45 }}>
      {letter}
    </span>
  );
}
export function Thumb({ src, alt, size = 36, className }: { src?: string | null; alt?: string; size?: number; className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center overflow-hidden rounded border border-line bg-sand", className)} style={{ width: size, height: size }}>
      {src ? <img src={src} alt={alt ?? ""} className="h-full w-full object-cover" /> : <span className="text-[10px] text-faint">—</span>}
    </span>
  );
}
export function Stars({ value, size = 12 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex text-amber" aria-label={`${value} stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 20 20" fill={i <= Math.round(value) ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.5}><path d="M10 1.5l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L1.3 7.8l6.1-.7z" /></svg>
      ))}
    </span>
  );
}
export function useDebounce<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line bg-sand px-1 text-[10px] text-muted">{children}</kbd>;
}
export function useStableId() {
  return useId();
}
