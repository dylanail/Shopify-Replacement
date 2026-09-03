"use client";
export function QtyStepper({ value, onChange, min = 1, max = 99, label = "Quantity", size = "md" }: { value: number; onChange: (n: number) => void; min?: number; max?: number; label?: string; size?: "sm" | "md" }) {
  const h = size === "sm" ? "h-9" : "h-11";
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  return (
    <div className={`inline-flex items-stretch border border-rule-strong ${h}`} style={{ borderRadius: "var(--radius-ui)" }} role="group" aria-label={label}>
      <button type="button" className="px-3 hover:bg-ink/5 disabled:opacity-40" aria-label={`Decrease ${label.toLowerCase()}`} onClick={() => onChange(clamp(value - 1))} disabled={value <= min}>−</button>
      <input aria-label={label} inputMode="numeric" className="w-10 text-center bg-transparent border-x border-rule-strong text-sm focus:outline-none" value={value} onChange={(e) => { const n = parseInt(e.target.value, 10); if (!Number.isNaN(n)) onChange(clamp(n)); }} />
      <button type="button" className="px-3 hover:bg-ink/5 disabled:opacity-40" aria-label={`Increase ${label.toLowerCase()}`} onClick={() => onChange(clamp(value + 1))} disabled={value >= max}>+</button>
    </div>
  );
}
