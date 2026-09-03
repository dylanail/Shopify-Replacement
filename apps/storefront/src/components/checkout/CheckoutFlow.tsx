"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Address } from "@kiln/shared";
import { useCart } from "@/components/providers/CartProvider";
import { useStore } from "@/components/providers/StoreProvider";
import { useSession } from "@/components/providers/SessionProvider";
import { useAccount } from "@/components/providers/AccountProvider";
import { api, errorMessage } from "@/lib/client-api";
import { formatMoney } from "@/lib/format";
import { fontStack } from "@/lib/brand";
import { session as ss, storageKey } from "@/lib/storage";
import { AddressForm, validateAddress, type AddressErrors } from "./AddressForm";
import { StripePanel, TestPanel, type Confirm } from "./PaymentPanels";
import { CartLines } from "@/components/cart/CartLines";
import { DiscountForm } from "@/components/cart/DiscountForm";
import { CartTotals } from "@/components/cart/CartTotals";
import { Input } from "@/components/ui/Field";
import { Slot } from "@/components/slots/Slot";

const STEPS = ["Cart", "Shipping", "Payment", "Review"] as const;
type Step = 0 | 1 | 2 | 3;
const emptyAddress = (country: string): Address => ({ firstName: "", lastName: "", line1: "", line2: "", city: "", province: "", postalCode: "", country, phone: "" });

/** Four-step checkout on one page (Cart → Shipping → Payment → Review) with a sticky order summary. */
export function CheckoutFlow() {
  const store = useStore();
  const { cart, loading, patch, clear, currency, refresh } = useCart();
  const { getSessionId, track } = useSession();
  const { customer } = useAccount();
  const router = useRouter();
  const defaultCountry = store.region?.countries[0] ?? "US";
  const [step, setStep] = useState<Step>(0);
  const [email, setEmail] = useState("");
  const [marketing, setMarketing] = useState(true);
  const [address, setAddress] = useState<Address>(() => emptyAddress(defaultCountry));
  const [billingSame, setBillingSame] = useState(true);
  const [billing, setBilling] = useState<Address>(() => emptyAddress(defaultCountry));
  const [addrErrors, setAddrErrors] = useState<AddressErrors>({});
  const [emailErr, setEmailErr] = useState<string | null>(null);
  const [shippingId, setShippingId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [intent, setIntent] = useState<{ clientSecret: string; id: string; mode: "stripe" | "test"; total: number } | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [paySummary, setPaySummary] = useState("");
  const draftKey = storageKey("checkout", store.key);

  // restore draft contact/address for this store (sessionStorage) and prefill from the account
  useEffect(() => {
    try { const d = JSON.parse(ss.get(draftKey) ?? "null") as { email?: string; address?: Address } | null; if (d?.email) setEmail(d.email); if (d?.address) setAddress(d.address); } catch { /* ignore */ }
  }, [draftKey]);
  useEffect(() => { if (customer && !email) setEmail(customer.email); if (customer?.addresses?.[0]) setAddress((a) => (a.line1 ? a : { ...emptyAddress(defaultCountry), ...customer.addresses![0]! })); }, [customer]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (cart?.email && !email) setEmail(cart.email); if (cart?.shippingAddress && !address.line1) setAddress({ ...emptyAddress(defaultCountry), ...cart.shippingAddress }); if (cart?.shippingOptionId && !shippingId) setShippingId(cart.shippingOptionId); }, [cart?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { ss.set(draftKey, JSON.stringify({ email, address })); }, [email, address, draftKey]);

  const options = cart?.shippingOptions ?? [];
  useEffect(() => { if (!shippingId && options.length) setShippingId([...options].sort((a, b) => a.quotedCents - b.quotedCents)[0]!.id); }, [options, shippingId]);
  const total = cart?.pricing.totalCents ?? 0;
  const useStripe = store.paymentMode === "stripe" && !!store.stripePublishable;
  const onReady = useCallback((c: Confirm | null, summary: string) => { setConfirm(() => c); setPaySummary(summary); }, []);

  const goShipping = () => { setErr(null); setStep(1); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const submitShipping = async () => {
    const e = validateAddress(address);
    setAddrErrors(e);
    const okEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
    setEmailErr(okEmail ? null : "Enter a valid email so we can send your confirmation.");
    if (Object.keys(e).length || !okEmail) return;
    if (!billingSame && Object.keys(validateAddress(billing)).length) { setErr("Please complete the billing address."); return; }
    setBusy(true); setErr(null);
    try {
      await patch({ email: email.trim().toLowerCase(), shippingAddress: address, billingAddress: billingSame ? address : billing, shippingOptionId: shippingId });
      void track("checkout.start", { path: "/checkout", valueCents: total });
      setStep(2); window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (x) { setErr(errorMessage(x)); } finally { setBusy(false); }
  };
  // payment intent for the current total (re-created when the total changes)
  useEffect(() => {
    if (step < 2 || !cart) return;
    if (intent && intent.total === cart.pricing.totalCents) return;
    let alive = true;
    api<{ clientSecret: string; id: string; mode: "stripe" | "test" }>(store.key, `/cart/${cart.id}/payment-intent`, { body: {}, env: store.env })
      .then((r) => alive && setIntent({ ...r, total: cart.pricing.totalCents })).catch((x) => alive && setErr(errorMessage(x, "Could not start payment. Please try again.")));
    return () => { alive = false; };
  }, [step, cart?.id, cart?.pricing.totalCents]); // eslint-disable-line react-hooks/exhaustive-deps

  const goReview = () => { if (!confirm) { setErr("Add your payment details to continue."); return; } setErr(null); setStep(3); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const placeOrder = async () => {
    if (!cart || !confirm) return;
    setBusy(true); setErr(null);
    try {
      const { paymentRef, provider } = await confirm();
      const res = await api<{ order: { id: string; email: string; totalCents: number }; thankYouUrl: string }>(store.key, `/cart/${cart.id}/checkout`, { body: { email: email.trim().toLowerCase(), paymentProvider: provider, paymentRef, acceptsMarketing: marketing, notes: notes.trim() || undefined, sessionId: getSessionId() ?? undefined }, env: store.env });
      const sid = getSessionId() ?? undefined;
      await Promise.all(Object.entries(cart.experimentVariants ?? {}).map(([id, variant]) => api(store.key, `/experiments/${encodeURIComponent(id)}/convert`, { body: { variant, valueCents: res.order.totalCents, sessionId: sid } }).catch(() => undefined)));
      void track("checkout.complete", { path: "/checkout", valueCents: res.order.totalCents });
      ss.remove(draftKey);
      clear();
      router.push(store.path(`/orders/${res.order.id}?email=${encodeURIComponent(res.order.email)}&placed=1`));
    } catch (x) {
      const msg = errorMessage(x);
      setErr(/stock|left|available/i.test(msg) ? `${msg} Adjust your cart and try again.` : msg);
      if (/stock|left|available|closed|checked out/i.test(msg)) { await refresh(); setStep(0); }
      setBusy(false);
    }
  };

  const empty = !loading && (!cart || cart.items.length === 0);
  const stepper = useMemo(() => (
    <ol className="flex items-center gap-2 text-xs mb-8" aria-label="Checkout progress">
      {STEPS.map((s, i) => {
        const state = i < step ? "done" : i === step ? "current" : "todo";
        const clickable = i < step && !busy;
        return (
          <li key={s} className="flex items-center gap-2">
            <button type="button" disabled={!clickable} onClick={() => setStep(i as Step)} aria-current={state === "current" ? "step" : undefined} className={`flex items-center gap-2 ${state === "todo" ? "text-muted" : ""} disabled:cursor-default`}>
              <span className={`w-6 h-6 inline-flex items-center justify-center text-[11px] font-semibold border ${state === "current" ? "bg-ink text-paper border-ink" : state === "done" ? "bg-primary text-primary-contrast border-primary" : "border-rule-strong"}`} style={{ borderRadius: "var(--radius-pill)" }} aria-hidden>{state === "done" ? "✓" : i + 1}</span>
              <span className={`eyebrow text-[10px] ${state === "current" ? "" : "hidden sm:inline"}`}>{s}</span>
            </button>
            {i < STEPS.length - 1 && <span className="w-6 sm:w-10 h-px bg-rule-strong" aria-hidden />}
          </li>
        );
      })}
    </ol>
  ), [step, busy]);

  if (loading && !cart) return <div className="container-x py-16"><div className="skeleton h-64 max-w-3xl" aria-label="Loading checkout" /></div>;
  if (empty) return (
    <div className="container-x py-24 text-center space-y-4">
      <h1 className="display text-3xl">Your cart is empty</h1>
      <p className="text-muted">Add something you'd like to own for a long time.</p>
      <Link href={store.path("/collections/all")} className="btn btn-primary">Browse the collection</Link>
    </div>
  );

  return (
    <div className="container-x py-8 sm:py-12">
      <Slot name="checkoutStart" ctx={{ page: "checkout", email }} />
      <div className="grid lg:grid-cols-12 gap-10 lg:gap-16">
        <div className="lg:col-span-7">
          <h1 className="display text-3xl mb-6">Checkout</h1>
          {stepper}
          {err && <p role="alert" className="mb-6 text-sm border border-red-200 bg-red-50 text-red-800 p-3">{err}</p>}

          {step === 0 && (
            <section aria-labelledby="s-cart">
              <h2 id="s-cart" className="display text-xl mb-2">Your cart</h2>
              <p className="text-sm text-muted mb-4">Check quantities before you continue.</p>
              <CartLines />
              <div className="mt-6 flex flex-wrap gap-3 items-center"><button type="button" className="btn btn-primary" onClick={goShipping}>Continue to shipping</button><Link href={store.path("/collections/all")} className="text-sm underline underline-offset-4 text-muted">Keep shopping</Link></div>
              <TrustCopy />
            </section>
          )}

          {step === 1 && (
            <section aria-labelledby="s-ship" className="space-y-8">
              <div>
                <h2 id="s-ship" className="display text-xl mb-4">Contact</h2>
                <Input id="co-email" type="email" label="Email" autoComplete="email" value={email} onChange={(e) => { setEmail(e.target.value); setEmailErr(null); }} error={emailErr ?? undefined} required />
                <label className="flex items-center gap-2 text-sm mt-3"><input type="checkbox" className="accent-[var(--brand-primary)]" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} /> Email me about new pieces and workshop news</label>
                {!customer && <p className="text-xs text-muted mt-2">Have an account? <Link href={store.path("/account/login")} className="underline underline-offset-4">Sign in</Link> to prefill your details.</p>}
              </div>
              <div>
                <h2 className="display text-xl mb-4">Shipping address</h2>
                <AddressForm value={address} onChange={setAddress} errors={addrErrors} idPrefix="ship" allowedCountries={store.region?.countries} />
                <label className="flex items-center gap-2 text-sm mt-4"><input type="checkbox" className="accent-[var(--brand-primary)]" checked={billingSame} onChange={(e) => setBillingSame(e.target.checked)} /> Billing address is the same</label>
                {!billingSame && <div className="mt-4"><h3 className="label">Billing address</h3><AddressForm value={billing} onChange={setBilling} idPrefix="bill" /></div>}
              </div>
              <div>
                <h2 className="display text-xl mb-4">Delivery</h2>
                {options.length ? (
                  <div className="space-y-2" role="radiogroup" aria-label="Shipping method">
                    {options.map((o) => (
                      <label key={o.id} className={`flex items-center gap-3 p-3 border cursor-pointer ${shippingId === o.id ? "border-ink bg-ink/[.03]" : "border-rule"}`} style={{ borderRadius: "var(--radius-card)" }}>
                        <input type="radio" name="ship" className="accent-[var(--brand-primary)]" checked={shippingId === o.id} onChange={() => setShippingId(o.id)} />
                        <span className="flex-1"><span className="text-sm font-medium block">{o.name}</span>{o.estimate && <span className="text-xs text-muted">{o.estimate}</span>}</span>
                        <span className="text-sm font-medium">{o.quotedCents === 0 ? "Free" : formatMoney(o.quotedCents, currency)}</span>
                      </label>
                    ))}
                  </div>
                ) : <p className="text-sm text-muted border border-rule p-3">Shipping is calculated for your region at the next step.</p>}
              </div>
              <div className="flex flex-wrap gap-3 items-center"><button type="button" className="btn btn-primary" onClick={submitShipping} disabled={busy}>{busy ? "Saving…" : "Continue to payment"}</button><button type="button" className="text-sm underline underline-offset-4 text-muted" onClick={() => setStep(0)}>Back to cart</button></div>
              <TrustCopy />
            </section>
          )}

          {step >= 2 && (
            <section aria-labelledby="s-pay" className="space-y-6">
              <div className="grid sm:grid-cols-2 gap-4 text-sm">
                <div className="card p-4"><p className="eyebrow text-[10px] mb-1">Contact</p><p>{email}</p><button type="button" className="text-xs underline underline-offset-4 text-muted mt-1" onClick={() => setStep(1)}>Change</button></div>
                <div className="card p-4"><p className="eyebrow text-[10px] mb-1">Ship to</p><p>{address.firstName} {address.lastName}<br />{address.line1}{address.line2 ? `, ${address.line2}` : ""}<br />{address.city}{address.province ? `, ${address.province}` : ""} {address.postalCode}, {address.country}</p><p className="text-xs text-muted mt-1">{options.find((o) => o.id === shippingId)?.name ?? "Standard"}</p><button type="button" className="text-xs underline underline-offset-4 text-muted mt-1" onClick={() => setStep(1)}>Change</button></div>
              </div>
              <div className={step === 3 ? "card p-5" : ""}>
                <h2 id="s-pay" className="display text-xl mb-1">Payment</h2>
                <p className="text-sm text-muted mb-4 flex items-center gap-2"><LockIcon /> Encrypted and secure. {useStripe ? "3D Secure where required." : "Test mode."}</p>
                {!intent ? <div className="skeleton h-40" aria-label="Loading payment" /> : useStripe && intent.mode === "stripe" ? (
                  <StripePanel publishableKey={store.stripePublishable!} clientSecret={intent.clientSecret} brandPrimary={store.brand.primaryColor} font={fontStack(store.brand.bodyFont)} totalCents={total} currency={currency} cartId={cart!.id} onReady={onReady} onError={setErr} />
                ) : (
                  <TestPanel totalCents={total} currency={currency} cartId={cart!.id} onReady={onReady} onError={setErr} />
                )}
              </div>
              {step === 2 && <div className="flex flex-wrap gap-3 items-center"><button type="button" className="btn btn-primary" onClick={goReview} disabled={!confirm}>Review order</button><button type="button" className="text-sm underline underline-offset-4 text-muted" onClick={() => setStep(1)}>Back</button></div>}
              {step === 3 && (
                <div className="space-y-5">
                  <div>
                    <h2 className="display text-xl mb-3">Review</h2>
                    <CartLines compact />
                  </div>
                  <div><label htmlFor="co-notes" className="label">Order notes (optional)</label><textarea id="co-notes" className="field min-h-20" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Gift message, delivery instructions…" /></div>
                  <p className="text-sm">Paying with <strong>{paySummary || "card"}</strong> · total <strong>{formatMoney(total, currency)}</strong></p>
                  <button type="button" className="btn btn-primary w-full text-base min-h-13" onClick={placeOrder} disabled={busy || !confirm}>{busy ? "Placing your order…" : `Place order — ${formatMoney(total, currency)}`}</button>
                  <p className="text-xs text-muted">By placing your order you agree to our <Link href={store.path("/pages/shipping")} className="underline underline-offset-4">shipping &amp; returns policy</Link>.</p>
                </div>
              )}
              {step === 2 && <TrustCopy />}
            </section>
          )}
        </div>

        <aside className="lg:col-span-5">
          <div className="lg:sticky lg:top-24 card p-5 sm:p-6 space-y-5">
            <h2 className="display text-lg">Order summary</h2>
            <ul className="divide-y divide-rule max-h-72 overflow-y-auto" aria-label="Items">
              {cart!.items.map((i) => (
                <li key={i.id} className="flex items-center gap-3 py-3 text-sm">
                  <span className="relative w-12 h-12 shrink-0 bg-ink/5 overflow-hidden" style={{ borderRadius: "var(--radius-card)" }}>{i.imageUrl && <img src={i.imageUrl} alt="" width={96} height={96} loading="lazy" className="w-full h-full object-cover" />}<span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-ink text-paper text-[10px] flex items-center justify-center">{i.quantity}</span></span>
                  <span className="flex-1 min-w-0"><span className="block truncate">{i.title}</span>{i.variantTitle && i.variantTitle !== "Default" && <span className="block text-xs text-muted">{i.variantTitle}</span>}</span>
                  <span>{formatMoney(i.unitPriceCents * i.quantity, currency)}</span>
                </li>
              ))}
            </ul>
            <DiscountForm idPrefix="co" />
            <CartTotals showShipping={step >= 2 || !!cart?.shippingOptionId} showTax />
            <Slot name="checkoutSummaryEnd" ctx={{ page: "checkout", email }} />
          </div>
        </aside>
      </div>
    </div>
  );
}

function TrustCopy() {
  return (
    <ul className="mt-8 grid sm:grid-cols-3 gap-3 text-xs text-muted" aria-label="Checkout guarantees">
      <li className="flex gap-2"><LockIcon /> Secure, encrypted checkout</li>
      <li className="flex gap-2"><span aria-hidden>↩</span> 30-day returns on unworn pieces</li>
      <li className="flex gap-2"><span aria-hidden>✉</span> Confirmation and tracking by email</li>
    </ul>
  );
}
const LockIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden className="shrink-0 mt-0.5"><rect x="5" y="10" width="14" height="10" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>;
