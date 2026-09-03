"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import type { SlotComponent, SlotComponentProps } from "../Slot";
import type { MerchConfig } from "@/lib/types";
import { useStore } from "@/components/providers/StoreProvider";
import { useCart } from "@/components/providers/CartProvider";
import { api, errorMessage } from "@/lib/client-api";
import { Img } from "@/components/ui/Img";
import { formatMoney } from "@/lib/format";
import { defaultVariant, isAvailable, recToLite, toLite, type ProductLite } from "@/lib/lite";

export type MerchLayout = "FrequentlyBoughtTogether" | "FbtGrid" | "BundleOffer" | "CompleteYourRoutine" | "CompleteYourSet" | "BuyMoreGetFree" | "BundlePackTriple" | "BundlePackDuo" | "HorizontalTripleTier" | "ChooseYourDealDuo" | "BogoHorizontal" | "BogoVertical" | "GoesWithWidget" | "CompleteTheLook" | "WeSavedOneForYou" | "PairsWellGrid" | "FreeGiftSelector" | "RoutineBuilder";
interface Tier { quantity: number; percentOff: number }
const DEFAULT_TITLES: Record<MerchLayout, string> = { FrequentlyBoughtTogether: "Frequently bought together", FbtGrid: "Pairs well with", BundleOffer: "Bundle & save", CompleteYourRoutine: "Complete your routine", CompleteYourSet: "Complete the set", BuyMoreGetFree: "Buy more, get more", BundlePackTriple: "The three-pack", BundlePackDuo: "The pair", HorizontalTripleTier: "Choose your bundle", ChooseYourDealDuo: "Choose your deal", BogoHorizontal: "Buy one, get one", BogoVertical: "Buy one, get one", GoesWithWidget: "Goes with", CompleteTheLook: "Complete the look", WeSavedOneForYou: "We saved one for you", PairsWellGrid: "Pairs well with", FreeGiftSelector: "Choose your free gift", RoutineBuilder: "Build your routine" };

/** Builds a registry entry for a merch layout. All bundle/upsell/cross-sell components share this base (products, tiers, add-N-to-cart). */
export const merchComponent = (layout: MerchLayout): SlotComponent => function MerchSlot(p: SlotComponentProps) { return <MerchOffer {...p} layout={layout} />; };

function useMerchProducts(merch: MerchConfig | undefined, ctx: SlotComponentProps["ctx"], includeCurrent: boolean): ProductLite[] {
  const store = useStore();
  return useMemo(() => {
    const configured = (merch?.productIds ?? []).map((id) => store.merchProducts.find((p) => p.id === id)).filter((p): p is ProductLite => !!p);
    const current = ctx.product ? toLite(ctx.product) : null;
    let base: ProductLite[] = configured.filter((p) => p.id !== current?.id);
    if (!base.length) base = (ctx.recommendations ?? []).map(recToLite).filter((p): p is ProductLite => !!p);
    if (!base.length && ctx.order?.postPurchaseOffers) base = ctx.order.postPurchaseOffers.map(recToLite).filter((p): p is ProductLite => !!p);
    if (!base.length) base = store.merchProducts.filter((p) => p.id !== current?.id).slice(0, 3);
    return includeCurrent && current ? [current, ...base] : base;
  }, [merch, ctx.product, ctx.recommendations, ctx.order, store.merchProducts, includeCurrent]);
}

const tierFor = (tiers: Tier[], qty: number) => [...tiers].filter((t) => t.quantity <= qty).sort((a, b) => b.percentOff - a.percentOff)[0] ?? null;
const priceOf = (p: ProductLite) => defaultVariant(p)?.priceCents ?? 0;

function MerchOffer({ ctx, merch, props, layout }: SlotComponentProps & { layout: MerchLayout }) {
  const store = useStore();
  const { add, addMany, currency } = useCart();
  const includeCurrent = layout === "FrequentlyBoughtTogether" || layout === "FbtGrid" || layout === "CompleteYourSet";
  const products = useMerchProducts(merch, ctx, includeCurrent);
  const tiers = ((merch?.rules?.tiers as Tier[] | undefined) ?? []).filter((t) => t.quantity > 0);
  const bogo = (merch?.rules?.bogo as { buyQuantity: number; getQuantity: number; getPercentOff: number } | undefined) ?? (tiers.length ? null : { buyQuantity: 1, getQuantity: 1, getPercentOff: 100 });
  const title = (typeof props.title === "string" && props.title) || merch?.title || DEFAULT_TITLES[layout];
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [tier, setTier] = useState<number>(tiers[0]?.quantity ?? 1);
  const [gift, setGift] = useState<string | null>(null);
  const isChecked = (id: string) => checked[id] ?? true;
  if (!products.length) return null;
  const selected = products.filter((p) => isChecked(p.id) && isAvailable(defaultVariant(p)));
  const sum = selected.reduce((s, p) => s + priceOf(p), 0);
  const addLines = async (lines: { variantId: string; quantity?: number; metadata?: Record<string, unknown> }[], label: string) => {
    if (!lines.length) return;
    setBusy(true); setErr(null); setDone(null);
    try { await addMany(lines); setDone(label); } catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
  };
  const addOne = async (p: ProductLite, qty = 1) => { const v = defaultVariant(p); if (!v) return; setBusy(true); setErr(null); try { await add(v.id, qty); setDone(`${p.title} added.`); } catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); } };
  const Card = ({ p, compact = false, children }: { p: ProductLite; compact?: boolean; children?: React.ReactNode }) => (
    <div className={`flex ${compact ? "items-center gap-3" : "flex-col gap-2"}`}>
      <Link href={store.path(`/products/${p.handle}`)} className={`${compact ? "w-16" : "w-full"} shrink-0 bg-ink/5 overflow-hidden`} style={{ borderRadius: "var(--radius-card)" }}><Img src={p.imageUrl} alt="" width={300} height={300} className="w-full aspect-square object-cover" /></Link>
      <div className="min-w-0 flex-1"><Link href={store.path(`/products/${p.handle}`)} className="text-sm font-medium leading-snug line-clamp-2 hover:underline underline-offset-4">{p.title}</Link><p className="text-xs text-muted">{formatMoney(priceOf(p), currency)}{!isAvailable(defaultVariant(p)) && " · Sold out"}</p></div>
      {children}
    </div>
  );
  const Feedback = () => <>{err && <p role="alert" className="text-xs text-red-700 mt-2">{err}</p>}{done && <p role="status" className="text-xs text-primary mt-2">{done}</p>}</>;
  const Heading = () => <h2 className="display text-xl mb-4">{title}</h2>;
  const wrap = "border-t border-rule pt-8";

  switch (layout) {
    case "FrequentlyBoughtTogether": {
      return (
        <section className={wrap} aria-label={title}><Heading />
          <div className="flex flex-wrap items-center gap-3">
            {products.map((p, i) => (
              <div key={p.id} className="flex items-center gap-3">
                {i > 0 && <span className="text-2xl text-muted" aria-hidden>+</span>}
                <label className={`w-32 card p-2 cursor-pointer ${isChecked(p.id) ? "" : "opacity-50"}`}>
                  <input type="checkbox" className="sr-only" checked={isChecked(p.id)} onChange={(e) => setChecked((c) => ({ ...c, [p.id]: e.target.checked }))} aria-label={`Include ${p.title}`} />
                  <Img src={p.imageUrl} alt="" width={240} height={240} className="w-full aspect-square object-cover" /><p className="text-xs font-medium mt-2 line-clamp-2">{p.title}</p><p className="text-xs text-muted">{formatMoney(priceOf(p), currency)}</p>
                </label>
              </div>
            ))}
            <div className="ml-auto space-y-2 text-right">
              <p className="text-sm">Total for {selected.length}: <strong>{formatMoney(sum, currency)}</strong></p>
              <button type="button" className="btn btn-primary" disabled={busy || !selected.length} onClick={() => addLines(selected.map((p) => ({ variantId: defaultVariant(p)!.id })), `${selected.length === 2 ? "Both" : `All ${selected.length}`} added to your cart.`)}>{busy ? "Adding…" : selected.length === 2 ? "Add both" : `Add ${selected.length} to cart`}</button>
            </div>
          </div><Feedback />
        </section>
      );
    }
    case "FbtGrid": case "PairsWellGrid": case "CompleteYourSet": case "CompleteYourRoutine": {
      const t = tierFor(tiers, selected.length);
      return (
        <section className={wrap} aria-label={title}><Heading />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {products.map((p) => (
              <div key={p.id} className="card p-3">
                <Card p={p}>
                  <label className="flex items-center gap-2 text-xs mt-1"><input type="checkbox" checked={isChecked(p.id)} onChange={(e) => setChecked((c) => ({ ...c, [p.id]: e.target.checked }))} className="accent-[var(--brand-primary)]" /> Include</label>
                </Card>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <p className="text-sm">{selected.length} selected · <strong>{formatMoney(t ? Math.round(sum * (1 - t.percentOff / 100)) : sum, currency)}</strong>{t && <span className="text-primary ml-2">Save {t.percentOff}%</span>}</p>
            <button type="button" className="btn btn-primary" disabled={busy || !selected.length} onClick={() => addLines(selected.map((p) => ({ variantId: defaultVariant(p)!.id })), `${selected.length} items added.`)}>{busy ? "Adding…" : `Add ${selected.length} to cart`}</button>
          </div><Feedback />
        </section>
      );
    }
    case "BundleOffer": case "BundlePackTriple": case "BundlePackDuo": case "RoutineBuilder": {
      const count = layout === "BundlePackTriple" ? 3 : layout === "BundlePackDuo" ? 2 : products.length;
      const pack = products.slice(0, count);
      const packSum = pack.reduce((s, p) => s + priceOf(p), 0);
      const t = tierFor(tiers, pack.length);
      const bundled = t ? Math.round(packSum * (1 - t.percentOff / 100)) : packSum;
      return (
        <section className={wrap} aria-label={title}><Heading />
          <div className="card p-5 grid md:grid-cols-[1fr_auto] gap-6 items-center">
            <ol className={`flex ${layout === "RoutineBuilder" ? "flex-col gap-3" : "flex-wrap gap-4"}`}>
              {pack.map((p, i) => <li key={p.id} className={layout === "RoutineBuilder" ? "" : "w-28"}><Card p={p} compact={layout === "RoutineBuilder"}>{layout === "RoutineBuilder" && <span className="eyebrow text-[10px] text-muted">Step {i + 1}</span>}</Card></li>)}
            </ol>
            <div className="text-center md:text-right space-y-2 min-w-48">
              {t && <p className="badge bg-primary text-primary-contrast">Save {t.percentOff}%</p>}
              <p className="text-2xl font-semibold">{formatMoney(bundled, currency)}{t && <s className="text-sm text-muted ml-2">{formatMoney(packSum, currency)}</s>}</p>
              <button type="button" className="btn btn-primary w-full" disabled={busy} onClick={() => addLines(pack.filter((p) => isAvailable(defaultVariant(p))).map((p) => ({ variantId: defaultVariant(p)!.id })), "Bundle added to your cart.")}>{busy ? "Adding…" : layout === "RoutineBuilder" ? "Build my routine" : `Add ${pack.length} to cart`}</button>
              <p className="text-[11px] text-muted">{t ? "Discount applies automatically at checkout." : "Ships together."}</p>
            </div>
          </div><Feedback />
        </section>
      );
    }
    case "HorizontalTripleTier": case "ChooseYourDealDuo": case "BuyMoreGetFree": {
      const p = products[0]!;
      const unit = priceOf(p);
      const opts = (tiers.length ? tiers : [{ quantity: 1, percentOff: 0 }, { quantity: 2, percentOff: 10 }, { quantity: 3, percentOff: 20 }]).slice(0, layout === "ChooseYourDealDuo" ? 2 : 3);
      const chosen = opts.find((o) => o.quantity === tier) ?? opts[0]!;
      return (
        <section className={wrap} aria-label={title}><Heading />
          <div className="flex gap-4 items-start">
            <div className="w-24 shrink-0 hidden sm:block"><Card p={p} /></div>
            <div className="flex-1">
              <div className={`grid gap-3 ${opts.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3"}`} role="radiogroup" aria-label="Bundle size">
                {opts.map((o) => {
                  const total = Math.round(unit * o.quantity * (1 - o.percentOff / 100));
                  const on = chosen.quantity === o.quantity;
                  return (
                    <button key={o.quantity} type="button" role="radio" aria-checked={on} onClick={() => setTier(o.quantity)} className={`text-left p-4 border transition-colors ${on ? "border-ink bg-ink/[.03]" : "border-rule hover:border-rule-strong"}`} style={{ borderRadius: "var(--radius-card)" }}>
                      <p className="eyebrow text-[10px]">{layout === "BuyMoreGetFree" && o.percentOff >= 100 / (o.quantity || 1) ? `Buy ${o.quantity - 1}, get 1 free` : `${o.quantity}× ${p.title.length > 16 ? "pack" : p.title}`}</p>
                      <p className="text-lg font-semibold mt-1">{formatMoney(total, currency)}</p>
                      <p className="text-xs text-muted">{formatMoney(Math.round(total / o.quantity), currency)} each{o.percentOff > 0 && <span className="text-primary"> · save {o.percentOff}%</span>}</p>
                    </button>
                  );
                })}
              </div>
              <button type="button" className="btn btn-primary mt-4" disabled={busy || !isAvailable(defaultVariant(p))} onClick={() => addOne(p, chosen.quantity)}>{busy ? "Adding…" : `Add ${chosen.quantity} to cart`}</button>
              <Feedback />
            </div>
          </div>
        </section>
      );
    }
    case "BogoHorizontal": case "BogoVertical": {
      const p = products[0]!;
      const buy = bogo?.buyQuantity ?? 1, get = bogo?.getQuantity ?? 1, off = bogo?.getPercentOff ?? 100;
      const vertical = layout === "BogoVertical";
      return (
        <section className={wrap} aria-label={title}><Heading />
          <div className={`card p-5 flex ${vertical ? "flex-col items-center text-center" : "flex-col sm:flex-row items-center"} gap-5`}>
            <div className="w-28"><Img src={p.imageUrl} alt="" width={240} height={240} className="w-full aspect-square object-cover" /></div>
            <div className="flex-1"><p className="badge bg-primary text-primary-contrast mb-2">Buy {buy}, get {get} {off >= 100 ? "free" : `${off}% off`}</p><p className="font-medium">{p.title}</p><p className="text-sm text-muted">Add {buy + get} and the discount applies automatically at checkout.</p></div>
            <button type="button" className="btn btn-primary" disabled={busy || !isAvailable(defaultVariant(p))} onClick={() => addOne(p, buy + get)}>{busy ? "Adding…" : `Add ${buy + get} to cart`}</button>
          </div><Feedback />
        </section>
      );
    }
    case "GoesWithWidget": case "CompleteTheLook": {
      return (
        <section className={wrap} aria-label={title}><Heading />
          <ul className={layout === "CompleteTheLook" ? "flex gap-4 overflow-x-auto pb-2 -mx-1 px-1" : "space-y-3"}>
            {products.slice(0, 4).map((p) => (
              <li key={p.id} className={layout === "CompleteTheLook" ? "w-40 shrink-0" : ""}>
                <Card p={p} compact={layout === "GoesWithWidget"}>
                  <button type="button" className="btn btn-outline min-h-9 px-3 text-xs" disabled={busy || !isAvailable(defaultVariant(p))} onClick={() => addOne(p)}>Add</button>
                </Card>
              </li>
            ))}
          </ul><Feedback />
        </section>
      );
    }
    case "WeSavedOneForYou": {
      const p = products[0]!;
      const t = tiers[0] ?? null;
      const price = priceOf(p);
      const isThankYou = !!ctx.order;
      const oneClick = async () => {
        if (!isThankYou || !ctx.order) return addOne(p);
        setBusy(true); setErr(null);
        try { await api(store.key, `/orders/${encodeURIComponent(ctx.order.id)}/upsell`, { body: { variantId: defaultVariant(p)!.id, email: ctx.email ?? ctx.order.email } }); setDone("Added to your order — no extra checkout needed."); }
        catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
      };
      return (
        <section className={wrap} aria-label={title}>
          <div className="card p-5 flex flex-col sm:flex-row gap-5 items-center" style={{ background: "color-mix(in srgb, var(--brand-primary) 6%, var(--brand-bg-elevated))" }}>
            <div className="w-32 shrink-0"><Img src={p.imageUrl} alt="" width={256} height={256} className="w-full aspect-square object-cover" /></div>
            <div className="flex-1"><p className="eyebrow text-primary mb-1">{title}</p><p className="display text-xl">{p.title}</p><p className="text-sm text-muted mt-1">{t ? `${t.percentOff}% off when you add it now.` : isThankYou ? "One click — charged to the same card, shipped with your order." : "A favourite of people who bought this."}</p><p className="mt-2 font-semibold">{formatMoney(t ? Math.round(price * (1 - t.percentOff / 100)) : price, currency)}{t && <s className="ml-2 text-muted text-sm">{formatMoney(price, currency)}</s>}</p></div>
            <button type="button" className="btn btn-primary" disabled={busy || !done && !isAvailable(defaultVariant(p))} onClick={oneClick}>{busy ? "Adding…" : isThankYou ? "Add to my order" : "Add to cart"}</button>
          </div><Feedback />
        </section>
      );
    }
    case "FreeGiftSelector": {
      const threshold = typeof merch?.rules?.thresholdCents === "number" ? merch.rules.thresholdCents : null;
      return (
        <section className={wrap} aria-label={title}><Heading />
          {threshold != null && <p className="text-sm text-muted mb-4">Free with orders over {formatMoney(threshold, currency)}. Pick one:</p>}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3" role="radiogroup" aria-label="Free gift">
            {products.slice(0, 6).map((p) => (
              <button key={p.id} type="button" role="radio" aria-checked={gift === p.id} onClick={() => setGift(p.id)} className={`card p-3 text-left transition-colors ${gift === p.id ? "border-ink" : ""}`}>
                <Img src={p.imageUrl} alt="" width={240} height={240} className="w-full aspect-square object-cover" /><p className="text-sm font-medium mt-2 line-clamp-2">{p.title}</p><p className="text-xs text-primary">Free gift</p>
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-primary mt-4" disabled={busy || !gift} onClick={() => { const p = products.find((x) => x.id === gift)!; void addLines([{ variantId: defaultVariant(p)!.id, quantity: 1, metadata: { freeGift: true, merchId: merch?.id } }], "Gift added — the discount applies at checkout when your order qualifies."); }}>Add gift</button>
          <Feedback />
        </section>
      );
    }
    default: return null;
  }
}
