"use client";
import { useState, type FormEvent } from "react";
import { useCart } from "@/components/providers/CartProvider";
import { errorMessage } from "@/lib/client-api";
import { formatMoney } from "@/lib/format";

export function DiscountForm({ idPrefix = "disc" }: { idPrefix?: string }) {
  const { cart, applyDiscount, currency } = useCart();
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true); setErr(null);
    try { await applyDiscount(code.trim()); setCode(""); }
    catch (x) { setErr(errorMessage(x, "That code can't be applied.")); }
    finally { setBusy(false); }
  };
  const applied = cart?.pricing.applied ?? [];
  return (
    <div className="space-y-2">
      <form onSubmit={submit} className="flex gap-2" noValidate>
        <label htmlFor={`${idPrefix}-code`} className="sr-only">Discount code</label>
        <input id={`${idPrefix}-code`} className="field uppercase" placeholder="Discount code" value={code} onChange={(e) => setCode(e.target.value)} aria-invalid={!!err} aria-describedby={`${idPrefix}-err`} autoComplete="off" />
        <button type="submit" className="btn btn-outline" disabled={busy || !code.trim()}>{busy ? "…" : "Apply"}</button>
      </form>
      {err && <p id={`${idPrefix}-err`} role="alert" className="text-xs text-red-700">{err}</p>}
      {applied.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Applied promotions">
          {applied.map((a) => <li key={a.id} className="badge bg-primary/10 text-primary normal-case tracking-normal text-[11px] font-semibold">{a.code ?? a.label} · −{formatMoney(a.discountCents, currency)}</li>)}
        </ul>
      )}
      {(cart?.pricing.rejectedCodes ?? []).map((r) => <p key={r.code} className="text-xs text-red-700">{r.code}: {r.reason}</p>)}
    </div>
  );
}
