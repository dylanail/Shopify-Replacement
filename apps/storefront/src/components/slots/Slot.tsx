"use client";
import { useMemo, type ComponentType } from "react";
import { useStore } from "@/components/providers/StoreProvider";
import { resolveSlot, type SlotEntry } from "@/lib/slots";
import type { MerchConfig, ProductDetail, Product, Recommendation, CollectionInfo, OrderDetail } from "@/lib/types";
import { REGISTRY } from "./registry";

/** Context handed to slot components; every field is optional and serialisable. */
export interface SlotCtx { product?: ProductDetail | Product; recommendations?: Recommendation[]; collection?: CollectionInfo; order?: OrderDetail; email?: string; page?: string; selectedVariantId?: string; priceCents?: number }
export interface SlotComponentProps { ctx: SlotCtx; settings: Record<string, unknown>; props: Record<string, unknown>; merch?: MerchConfig; pluginId?: string; slot: string; entry: SlotEntry }
export type SlotComponent = ComponentType<SlotComponentProps>;

/**
 * <Slot name="pdpEnd" ctx={{product}} /> — renders theme placements + plugin components + merch configs bound to a slot.
 * Unknown component ids render nothing. Renders in any tree (client) so pages can drop it wherever the blueprint shows it.
 */
export function Slot({ name, ctx, className, wrap }: { name: string; ctx: SlotCtx; className?: string; wrap?: boolean }) {
  const store = useStore();
  const entries = useMemo(() => resolveSlot(name, store.slots, store.plugins, store.merch), [name, store.slots, store.plugins, store.merch]);
  const rendered = entries.map((e) => {
    const C = REGISTRY[e.component];
    if (!C) return null;
    const props: Record<string, unknown> = { ...e.props };
    for (const k of e.propsFromConfig) if (e.settings[k] !== undefined) props[k] = e.settings[k];
    for (const k of e.propsFromContext) {
      if (k === "productId") props.productId = ctx.product?.id;
      else if (k === "price") props.price = ctx.priceCents;
      else if (k === "currency") props.currency = store.currency;
      else if (k in ctx) props[k] = (ctx as Record<string, unknown>)[k];
    }
    return <C key={e.key} ctx={ctx} settings={e.settings} props={props} merch={e.merch} pluginId={e.pluginId} slot={name} entry={e} />;
  }).filter(Boolean);
  if (!rendered.length) return null;
  return wrap === false ? <>{rendered}</> : <div className={className} data-slot={name}>{rendered}</div>;
}

export function useSlotEntries(name: string): SlotEntry[] {
  const store = useStore();
  return useMemo(() => resolveSlot(name, store.slots, store.plugins, store.merch), [name, store.slots, store.plugins, store.merch]);
}
