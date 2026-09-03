"use client";
import { useEffect, useMemo, useState } from "react";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { formatMoney } from "@/lib/format";

/** A payment panel reports a `confirm` function that returns the payment reference for POST /checkout. */
export type Confirm = () => Promise<{ paymentRef: string; provider: "stripe" | "test" }>;
export interface PaymentPanelProps { totalCents: number; currency: string; cartId: string; onReady: (confirm: Confirm | null, summary: string) => void; onError: (msg: string | null) => void }

const stripeCache = new Map<string, Promise<Stripe | null>>();
const getStripe = (pk: string) => { let p = stripeCache.get(pk); if (!p) { p = loadStripe(pk); stripeCache.set(pk, p); } return p; };

export function StripePanel({ publishableKey, clientSecret, brandPrimary, font, ...rest }: PaymentPanelProps & { publishableKey: string; clientSecret: string; brandPrimary: string; font: string }) {
  const stripePromise = useMemo(() => getStripe(publishableKey), [publishableKey]);
  return (
    <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: "stripe", variables: { colorPrimary: brandPrimary, borderRadius: "0px", fontFamily: font } } }}>
      <StripeInner {...rest} />
    </Elements>
  );
}
function StripeInner({ onReady, onError, totalCents, currency }: PaymentPanelProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [complete, setComplete] = useState(false);
  useEffect(() => {
    if (!stripe || !elements || !complete) { onReady(null, "Card"); return; }
    onReady(async () => {
      const { error: submitErr } = await elements.submit();
      if (submitErr) throw new Error(submitErr.message ?? "Check your payment details.");
      const { error, paymentIntent } = await stripe.confirmPayment({ elements, redirect: "if_required", confirmParams: { return_url: window.location.href } });
      if (error) throw new Error(error.message ?? "Payment was not completed.");
      if (!paymentIntent || (paymentIntent.status !== "succeeded" && paymentIntent.status !== "requires_capture" && paymentIntent.status !== "processing")) throw new Error(`Payment not complete (${paymentIntent?.status ?? "unknown"}).`);
      return { paymentRef: paymentIntent.id, provider: "stripe" as const };
    }, "Card via Stripe");
  }, [stripe, elements, complete, onReady]);
  return (
    <div className="space-y-3">
      <PaymentElement options={{ layout: "tabs" }} onChange={(e) => { setComplete(e.complete); onError(null); }} />
      <p className="text-xs text-muted">You'll be charged {formatMoney(totalCents, currency)}. Payments are processed by Stripe; card details never touch our servers.</p>
    </div>
  );
}

/** Test-mode payment: a card form plus wallet buttons — every method resolves to the core's test provider. */
export function TestPanel({ cartId, onReady, onError, totalCents, currency }: PaymentPanelProps) {
  const [method, setMethod] = useState<"card" | "apple" | "google" | "link" | "paypal">("card");
  const [card, setCard] = useState({ name: "", number: "", exp: "", cvc: "" });
  const [errs, setErrs] = useState<Partial<typeof card>>({});
  const brand = /^4/.test(card.number) ? "Visa" : /^5[1-5]|^2[2-7]/.test(card.number) ? "Mastercard" : /^3[47]/.test(card.number) ? "Amex" : "Card";
  const digits = card.number.replace(/\D/g, "");
  const luhn = (s: string) => { let sum = 0, dbl = false; for (let i = s.length - 1; i >= 0; i--) { let d = Number(s[i]); if (dbl) { d *= 2; if (d > 9) d -= 9; } sum += d; dbl = !dbl; } return s.length >= 12 && sum % 10 === 0; };
  const valid = method !== "card" || (card.name.trim().length > 1 && luhn(digits) && /^(0[1-9]|1[0-2])\s*\/\s*\d{2}$/.test(card.exp) && /^\d{3,4}$/.test(card.cvc));
  useEffect(() => {
    if (!valid) { onReady(null, ""); return; }
    const label = method === "card" ? `${brand} •••• ${digits.slice(-4)}` : { apple: "Apple Pay", google: "Google Pay", link: "Link", paypal: "PayPal" }[method];
    onReady(async () => ({ paymentRef: `pi_test_${cartId}`, provider: "test" }), label);
  }, [valid, method, brand, digits, cartId, onReady]);
  const set = (k: keyof typeof card, v: string) => { setCard((c) => ({ ...c, [k]: v })); setErrs((e) => ({ ...e, [k]: undefined })); onError(null); };
  const wallet = (m: typeof method, label: string, bg: string, fg = "#fff") => (
    <button key={m} type="button" onClick={() => setMethod(m)} aria-pressed={method === m} className={`btn w-full border ${method === m ? "ring-2 ring-offset-2 ring-[var(--brand-primary)]" : ""}`} style={{ background: bg, color: fg, borderColor: bg === "#fff" ? "var(--brand-rule-strong)" : bg }}>{label}</button>
  );
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Express checkout">
        {wallet("apple", " Pay", "#000")}{wallet("google", "G Pay", "#fff", "#1a1a1a")}{wallet("link", "Link", "#33d6a6", "#0a2a22")}{wallet("paypal", "PayPal", "#ffc439", "#003087")}
      </div>
      <div className="flex items-center gap-3 text-xs text-muted"><span className="hairline flex-1" />or pay with card<span className="hairline flex-1" /></div>
      <div className={`space-y-3 border p-4 ${method === "card" ? "border-ink" : "border-rule opacity-70"}`} style={{ borderRadius: "var(--radius-card)" }} onFocus={() => setMethod("card")}>
        <div className="flex items-center justify-between"><p className="text-sm font-medium">Credit or debit card</p><span className="flex gap-1" aria-label="Accepted: Visa, Mastercard, American Express"><CardBadge label="VISA" bg="#1a1f71" /><CardBadge label="MC" bg="#eb001b" /><CardBadge label="AMEX" bg="#2e77bc" /></span></div>
        <div><label htmlFor="cc-name" className="label">Name on card</label><input id="cc-name" className="field" autoComplete="cc-name" value={card.name} onChange={(e) => set("name", e.target.value)} onBlur={() => card.name.trim().length < 2 && setErrs((e) => ({ ...e, name: "Required" }))} aria-invalid={!!errs.name} />{errs.name && <p className="text-xs text-red-700 mt-1">{errs.name}</p>}</div>
        <div><label htmlFor="cc-number" className="label">Card number</label><input id="cc-number" className="field font-mono" inputMode="numeric" autoComplete="cc-number" placeholder="4242 4242 4242 4242" value={card.number} onChange={(e) => set("number", e.target.value.replace(/[^\d ]/g, "").replace(/(\d{4})(?=\d)/g, "$1 ").slice(0, 19))} onBlur={() => !luhn(digits) && setErrs((e) => ({ ...e, number: "That card number doesn't look right." }))} aria-invalid={!!errs.number} aria-describedby="cc-hint" />{errs.number ? <p className="text-xs text-red-700 mt-1">{errs.number}</p> : <p id="cc-hint" className="text-xs text-muted mt-1">Test mode — use 4242 4242 4242 4242.</p>}</div>
        <div className="grid grid-cols-2 gap-3">
          <div><label htmlFor="cc-exp" className="label">Expiry</label><input id="cc-exp" className="field font-mono" inputMode="numeric" autoComplete="cc-exp" placeholder="MM / YY" value={card.exp} onChange={(e) => { const d = e.target.value.replace(/\D/g, "").slice(0, 4); set("exp", d.length > 2 ? `${d.slice(0, 2)} / ${d.slice(2)}` : d); }} onBlur={() => !/^(0[1-9]|1[0-2])\s*\/\s*\d{2}$/.test(card.exp) && setErrs((e) => ({ ...e, exp: "MM / YY" }))} aria-invalid={!!errs.exp} />{errs.exp && <p className="text-xs text-red-700 mt-1">{errs.exp}</p>}</div>
          <div><label htmlFor="cc-cvc" className="label">CVC</label><input id="cc-cvc" className="field font-mono" inputMode="numeric" autoComplete="cc-csc" placeholder="123" value={card.cvc} onChange={(e) => set("cvc", e.target.value.replace(/\D/g, "").slice(0, 4))} onBlur={() => !/^\d{3,4}$/.test(card.cvc) && setErrs((e) => ({ ...e, cvc: "3–4 digits" }))} aria-invalid={!!errs.cvc} />{errs.cvc && <p className="text-xs text-red-700 mt-1">{errs.cvc}</p>}</div>
        </div>
      </div>
      <p className="text-xs text-muted">You'll be charged {formatMoney(totalCents, currency)}. This store is in test mode — no real charge is made.</p>
    </div>
  );
}
const CardBadge = ({ label, bg }: { label: string; bg: string }) => <span className="inline-flex items-center justify-center h-5 px-1.5 text-[9px] font-bold text-white rounded-sm" style={{ background: bg }} aria-hidden>{label}</span>;
