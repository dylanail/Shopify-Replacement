"use client";
import { useCart } from "@/components/providers/CartProvider";
import { formatMoney } from "@/lib/format";

/** Progress towards free shipping — reads freeShippingGapCents from the priced cart. */
export function FreeShippingBar({ className = "" }: { className?: string }) {
  const { cart, currency } = useCart();
  const p = cart?.pricing;
  if (!p || p.freeShippingThresholdCents == null) return null;
  const gap = p.freeShippingGapCents ?? 0;
  const pct = Math.min(100, Math.round(((p.freeShippingThresholdCents - gap) / p.freeShippingThresholdCents) * 100));
  return (
    <div className={`text-xs ${className}`} aria-live="polite">
      <p className="mb-1.5">{gap > 0 ? <>You're <strong>{formatMoney(gap, currency)}</strong> away from free shipping.</> : <strong className="text-primary">You've unlocked free shipping.</strong>}</p>
      <div className="h-1.5 bg-ink/10 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Progress to free shipping" style={{ borderRadius: "var(--radius-pill)" }}>
        <div className="h-full bg-primary transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
