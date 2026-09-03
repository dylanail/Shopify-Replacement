"use client";
import { useEffect, useState } from "react";
export function Toast({ message, kind = "success", duration = 5000 }: { message: string; kind?: "success" | "error"; duration?: number }) {
  const [show, setShow] = useState(true);
  useEffect(() => { const t = setTimeout(() => setShow(false), duration); return () => clearTimeout(t); }, [duration]);
  if (!show) return null;
  return (
    <div role="status" aria-live="polite" className={`fixed left-1/2 -translate-x-1/2 top-4 z-50 px-4 py-3 text-sm font-medium shadow-lg fade-up flex items-center gap-2 ${kind === "success" ? "bg-ink text-paper" : "bg-red-700 text-white"}`} style={{ borderRadius: "var(--radius-ui)" }}>
      {kind === "success" && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
      {message}
    </div>
  );
}
