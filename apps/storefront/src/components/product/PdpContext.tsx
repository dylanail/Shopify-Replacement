"use client";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { ProductDetail, Variant, BuildOption } from "@/lib/types";
import { pdpExperimentOverrides, applyPriceDelta, assignmentVariants } from "@/lib/experiments";
import { useCart } from "@/components/providers/CartProvider";
import { useSession } from "@/components/providers/SessionProvider";

export interface Engraving { text: string; feeCents: number }
export interface PdpState {
  product: ProductDetail; variant: Variant | null; selection: Record<string, string>; select: (name: string, value: string) => void;
  quantity: number; setQuantity: (n: number) => void;
  buildOption: BuildOption | null; setBuildOption: (b: BuildOption | null) => void;
  engraving: Engraving | null; setEngraving: (e: Engraving | null) => void;
  cadence: string | null; setCadence: (c: string | null) => void;
  unitPriceCents: number; compareAtCents: number | null; overrides: ReturnType<typeof pdpExperimentOverrides>;
  isCombinationAvailable: (sel: Record<string, string>) => boolean;
}
const Ctx = createContext<PdpState | null>(null);

const variantFor = (p: ProductDetail, sel: Record<string, string>) => p.variants.find((v) => p.options.every((o) => v.options[o.name] === sel[o.name])) ?? null;
const available = (v: Variant | null) => !!v && (v.inventoryQty > 0 || v.allowBackorder);

/** Shared buy-state for the PDP: the buy box, gallery and slot components (engraving, pixels) all read from here. */
export function PdpProvider({ product, children }: { product: ProductDetail; children: ReactNode }) {
  const overrides = useMemo(() => pdpExperimentOverrides(product.experiments), [product.experiments]);
  const initial = useMemo(() => {
    const first = product.variants.find(available) ?? product.variants[0];
    const sel: Record<string, string> = {};
    for (const o of product.options) sel[o.name] = first?.options[o.name] ?? o.values[0]!;
    return sel;
  }, [product]);
  const [selection, setSelection] = useState(initial);
  const [quantity, setQuantity] = useState(1);
  const [buildOption, setBuildOption] = useState<BuildOption | null>(() => product.metadata.buildOptions?.[0] ?? null);
  const [engraving, setEngraving] = useState<Engraving | null>(null);
  const [cadence, setCadence] = useState<string | null>(null);
  const variant = useMemo(() => variantFor(product, selection) ?? (product.options.length ? null : product.variants[0] ?? null), [product, selection]);
  const { cart, patch } = useCart();
  const { setSessionId } = useSession();

  useEffect(() => { if (product.sessionId) setSessionId(product.sessionId); }, [product.sessionId, setSessionId]);
  // Persist experiment assignments on the cart so checkout can record conversions.
  useEffect(() => {
    const vars = assignmentVariants(product.experiments);
    if (!Object.keys(vars).length || !cart) return;
    const missing = Object.entries(vars).some(([id, v]) => cart.experimentVariants?.[id] !== v);
    if (missing) void patch({ experimentVariants: { ...(cart.experimentVariants ?? {}), ...vars } }).catch(() => undefined);
  }, [product.experiments, cart?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const select = (name: string, value: string) => setSelection((s) => {
    const next = { ...s, [name]: value };
    if (variantFor(product, next) && available(variantFor(product, next))) return next;
    // pick the closest available combination that keeps this choice
    const cand = product.variants.find((v) => v.options[name] === value && available(v)) ?? product.variants.find((v) => v.options[name] === value);
    return cand ? { ...cand.options } : next;
  });

  const base = variant?.priceCents ?? product.variants[0]?.priceCents ?? 0;
  let unit = applyPriceDelta(base, overrides.priceDeltaPercent);
  if (buildOption?.priceDeltaCents) unit += buildOption.priceDeltaCents;
  if (engraving) unit += engraving.feeCents;
  if (cadence && product.subscription?.enabled) unit = Math.round(unit * (1 - (product.subscription.discountPercent ?? 0) / 100));
  const compareAt = variant?.compareAtCents ?? null;
  const value = useMemo<PdpState>(() => ({
    product, variant, selection, select, quantity, setQuantity, buildOption, setBuildOption, engraving, setEngraving, cadence, setCadence,
    unitPriceCents: unit, compareAtCents: compareAt != null && compareAt > unit ? compareAt : null, overrides,
    isCombinationAvailable: (sel) => available(variantFor(product, sel)),
  }), [product, variant, selection, quantity, buildOption, engraving, cadence, unit, compareAt, overrides]); // eslint-disable-line react-hooks/exhaustive-deps
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export function usePdp(): PdpState { const v = useContext(Ctx); if (!v) throw new Error("usePdp outside <PdpProvider>"); return v; }
export const usePdpOptional = () => useContext(Ctx);
