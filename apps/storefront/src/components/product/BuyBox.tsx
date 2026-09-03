"use client";
import { useState } from "react";
import { usePdp } from "./PdpContext";
import { useCart } from "@/components/providers/CartProvider";
import { useStore } from "@/components/providers/StoreProvider";
import { QtyStepper } from "@/components/ui/QtyStepper";
import { Price } from "@/components/ui/Price";
import { Slot } from "@/components/slots/Slot";
import { swatchColor, isSwatchOption } from "@/lib/colors";
import { formatMoney, cadenceLabel } from "@/lib/format";
import { errorMessage } from "@/lib/client-api";

export interface BuyBoxCopy { eyebrow: string; microcopy: string; trust: string[]; ctaLabel: string }

/** Price, subscription toggle, option pills/swatches, build-option radio cards, quantity and the full-width CTA (blueprint §2.5). */
export function BuyBox({ copy }: { copy: BuyBoxCopy }) {
  const pdp = usePdp();
  const { add, cart } = useCart();
  const store = useStore();
  const { product, variant, selection, select, quantity, setQuantity, buildOption, setBuildOption, engraving, cadence, setCadence, unitPriceCents, compareAtCents, overrides } = pdp;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
  const currency = cart?.currency ?? store.currency;
  const available = !!variant && (variant.inventoryQty > 0 || variant.allowBackorder);
  const lowStock = variant && variant.inventoryQty > 0 && variant.inventoryQty <= 5 && !variant.allowBackorder;
  const sub = product.subscription?.enabled ? product.subscription : null;
  const total = unitPriceCents * quantity;
  const cta = overrides.ctaLabel ?? copy.ctaLabel;
  const buildOptions = product.metadata.buildOptions ?? [];

  const onAdd = async () => {
    if (!variant) return;
    setBusy(true); setErr(null);
    const metadata: Record<string, unknown> = {};
    if (buildOption) { metadata.buildOption = buildOption.title; metadata.buildOptionId = buildOption.id; if (buildOption.priceDeltaCents) metadata.buildOptionFeeCents = buildOption.priceDeltaCents; }
    if (engraving?.text) { metadata.engraving = engraving.text; metadata.engravingFeeCents = engraving.feeCents; }
    try { await add(variant.id, quantity, { subscriptionCadence: cadence ?? undefined, metadata: Object.keys(metadata).length ? metadata : undefined }); setAdded(true); setTimeout(() => setAdded(false), 2500); }
    catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      <div>
        <Price cents={unitPriceCents} compareAtCents={compareAtCents} currency={currency} size="lg" />
        {buildOption?.priceDeltaCents && buildOption.priceDeltaCents !== 0 ? <p className="text-xs text-muted mt-1">Includes {buildOption.title.toLowerCase()} ({buildOption.priceDeltaCents > 0 ? "+" : "−"}{formatMoney(Math.abs(buildOption.priceDeltaCents), currency)})</p> : null}
        {buildOption?.priceDeltaCents === undefined && engraving && <p className="text-xs text-muted mt-1">Includes engraving (+{formatMoney(engraving.feeCents, currency)})</p>}
      </div>
      <Slot name="pdpBelowPrice" ctx={{ product, selectedVariantId: variant?.id, priceCents: unitPriceCents }} />

      {sub && (
        <fieldset className="border border-rule p-3 space-y-2" style={{ borderRadius: "var(--radius-card)" }}>
          <legend className="eyebrow px-1">Purchase type</legend>
          <label className="flex items-center gap-3 cursor-pointer text-sm">
            <input type="radio" name="purchase" checked={cadence === null} onChange={() => setCadence(null)} className="accent-[var(--brand-primary)]" /> One-time purchase
          </label>
          <label className="flex items-center gap-3 cursor-pointer text-sm">
            <input type="radio" name="purchase" checked={cadence !== null} onChange={() => setCadence(sub.cadences[0] ?? "monthly")} className="accent-[var(--brand-primary)]" />
            <span>Subscribe &amp; save{sub.discountPercent ? <strong className="text-primary"> {sub.discountPercent}%</strong> : null}{sub.trialDays ? <span className="text-muted"> · {sub.trialDays}-day free trial</span> : null}</span>
          </label>
          {cadence !== null && (
            <div className="pl-7">
              <label htmlFor="cadence" className="label">Deliver</label>
              <select id="cadence" className="field" value={cadence} onChange={(e) => setCadence(e.target.value)}>{sub.cadences.map((c) => <option key={c} value={c}>{cadenceLabel(c)}</option>)}</select>
              <p className="text-[11px] text-muted mt-1">Pause, skip or cancel anytime from your account.</p>
            </div>
          )}
        </fieldset>
      )}

      {product.options.map((o) => {
        const swatch = isSwatchOption(o.name);
        return (
          <fieldset key={o.name}>
            <legend className="label flex items-baseline gap-2">{o.name} <span className="normal-case tracking-normal font-normal text-muted">{selection[o.name]}</span></legend>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={o.name}>
              {o.values.map((val) => {
                const sel = { ...selection, [o.name]: val };
                const ok = pdp.isCombinationAvailable(sel) || product.variants.some((v) => v.options[o.name] === val && (v.inventoryQty > 0 || v.allowBackorder));
                const checked = selection[o.name] === val;
                if (swatch) {
                  const color = swatchColor(val);
                  return (
                    <button key={val} type="button" role="radio" aria-checked={checked} aria-label={`${val}${ok ? "" : " (sold out)"}`} disabled={!ok} title={val} onClick={() => select(o.name, val)}
                      className={`relative w-9 h-9 flex items-center justify-center border-2 transition-colors ${checked ? "border-ink" : "border-rule hover:border-rule-strong"} ${ok ? "" : "opacity-40"}`} style={{ borderRadius: "var(--radius-pill)" }}>
                      <span className="block w-6 h-6 border border-black/10" style={{ background: color ?? "linear-gradient(135deg,#ddd,#bbb)", borderRadius: "var(--radius-pill)" }} aria-hidden />
                      {!color && <span className="absolute -bottom-4 text-[9px] whitespace-nowrap text-muted" aria-hidden>{val.slice(0, 8)}</span>}
                      {!ok && <span aria-hidden className="absolute inset-0 flex items-center justify-center"><span className="w-full h-px bg-ink rotate-45" /></span>}
                    </button>
                  );
                }
                return <button key={val} type="button" role="radio" aria-checked={checked} disabled={!ok} className="pill" onClick={() => select(o.name, val)}>{val}</button>;
              })}
            </div>
          </fieldset>
        );
      })}

      {buildOptions.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="label">Build</legend>
          {buildOptions.map((b) => {
            const checked = buildOption?.id === b.id;
            const price = formatMoney((variant?.priceCents ?? 0) + (b.priceDeltaCents ?? 0), currency);
            return (
              <label key={b.id} className={`flex items-start gap-3 p-3 border cursor-pointer transition-colors ${checked ? "border-ink bg-ink/[.03]" : "border-rule hover:border-rule-strong"}`} style={{ borderRadius: "var(--radius-card)" }}>
                <input type="radio" name="build" className="mt-1 accent-[var(--brand-primary)]" checked={checked} onChange={() => setBuildOption(b)} />
                <span className="flex-1 min-w-0">
                  <span className="flex justify-between gap-3"><span className="font-medium text-sm">{b.title}</span><span className="text-sm">{price}</span></span>
                  {b.description && <span className="block text-xs text-muted mt-0.5">{b.description}</span>}
                </span>
              </label>
            );
          })}
        </fieldset>
      )}

      <div className="flex items-center gap-4">
        <div><span className="label">Quantity</span><QtyStepper value={quantity} onChange={setQuantity} max={variant && !variant.allowBackorder ? Math.max(1, variant.inventoryQty) : 99} /></div>
        {lowStock && <p className="text-xs text-primary font-medium mt-5">Only {variant!.inventoryQty} left</p>}
        {variant && variant.inventoryQty <= 0 && variant.allowBackorder && <p className="text-xs text-muted mt-5">Made to order · ships when ready</p>}
      </div>

      <div className="space-y-2">
        <button type="button" onClick={onAdd} disabled={!available || busy} className="btn btn-primary w-full text-base min-h-13" aria-live="polite">
          {busy ? "Adding…" : added ? "Added to cart ✓" : available ? `${cta} — ${formatMoney(total, currency)}` : "Sold out"}
        </button>
        {err && <p role="alert" className="text-xs text-red-700">{err}</p>}
        {!available && <p className="text-xs text-muted">This combination is currently unavailable. Try another option, or <a href={store.path("/pages/contact")} className="underline">ask us about a restock</a>.</p>}
        <p className="text-xs text-muted">{copy.microcopy}</p>
      </div>

      <ul className="flex flex-wrap gap-x-5 gap-y-1 border-t border-rule pt-4" aria-label="Guarantees">
        {copy.trust.map((t, i) => <li key={i} className="eyebrow text-[10px] flex items-center gap-1.5"><span className="text-primary" aria-hidden>◆</span>{t}</li>)}
      </ul>
    </div>
  );
}
