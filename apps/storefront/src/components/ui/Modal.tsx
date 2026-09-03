"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";

/** Accessible dialog: focus trap, Esc to close, click-outside, scroll lock. */
export function Modal({ open, onClose, title, children, size = "md", labelledBy }: { open: boolean; onClose: () => void; title?: string; children: ReactNode; size?: "sm" | "md" | "lg"; labelledBy?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const focusables = () => Array.from(el?.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])') ?? []);
    (focusables()[0] ?? el)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
      if (e.key === "Tab") {
        const f = focusables(); if (!f.length) return;
        const first = f[0]!, last = f[f.length - 1]!;
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; prev?.focus?.(); };
  }, [open, onClose]);
  if (!open) return null;
  const width = size === "lg" ? "max-w-3xl" : size === "sm" ? "max-w-sm" : "max-w-lg";
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6" role="presentation">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={labelledBy ?? (title ? titleId : undefined)} tabIndex={-1} className={`relative w-full ${width} card p-6 sm:p-8 fade-up max-h-[92vh] overflow-y-auto`} style={{ background: "var(--brand-bg-elevated)" }}>
        <div className="flex items-start justify-between gap-4 mb-4">
          {title ? <h2 id={titleId} className="display text-xl">{title}</h2> : <span />}
          <button type="button" onClick={onClose} className="btn btn-ghost -mr-2 -mt-2 px-2" aria-label="Close dialog">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
