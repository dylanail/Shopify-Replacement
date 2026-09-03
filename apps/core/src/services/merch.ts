import { and, eq, desc, gte, inArray, affinityPairs, merchConfigs, orders, products, productVariants, sql } from "@kiln/db";
import { z } from "zod";
import type { AppDeps } from "../context.js";
import { notFound } from "../lib/errors.js";
import { createPromotion } from "./promotions.js";

/** Nightly job: mine 90 days of orders for co-purchases → cosine-ish affinity score. */
export async function rebuildAffinity(deps: AppDeps, storeId: string, days = 90) {
  const rows = await deps.db.select({ items: orders.items }).from(orders).where(and(eq(orders.storeId, storeId), gte(orders.createdAt, new Date(Date.now() - days * 864e5)), sql`${orders.status} <> 'cancelled'`));
  const single = new Map<string, number>();
  const pair = new Map<string, number>();
  for (const o of rows) {
    const ids = [...new Set(o.items.map((i) => i.productId))].sort();
    for (const id of ids) single.set(id, (single.get(id) ?? 0) + 1);
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) pair.set(`${ids[i]}|${ids[j]}`, (pair.get(`${ids[i]}|${ids[j]}`) ?? 0) + 1);
  }
  await deps.db.delete(affinityPairs).where(eq(affinityPairs.storeId, storeId));
  const values = [...pair.entries()].flatMap(([k, co]) => {
    const [a, b] = k.split("|") as [string, string];
    const score = co / Math.sqrt((single.get(a) ?? 1) * (single.get(b) ?? 1));
    return [{ storeId, productA: a, productB: b, score, coPurchases: co }, { storeId, productA: b, productB: a, score, coPurchases: co }];
  });
  if (values.length) await deps.db.insert(affinityPairs).values(values);
  return { orders: rows.length, pairs: pair.size };
}

/** Cart-aware recommendations: affinity first, then same-collection/tag fallback, excluding what's already in the cart. */
export async function recommend(deps: AppDeps, storeId: string, productId: string, cartProductIds: string[] = [], limit = 3) {
  const exclude = new Set([productId, ...cartProductIds]);
  const pairs = await deps.db.select().from(affinityPairs).where(and(eq(affinityPairs.storeId, storeId), eq(affinityPairs.productA, productId))).orderBy(desc(affinityPairs.score)).limit(10);
  const ids = pairs.map((p) => p.productB).filter((id) => !exclude.has(id));
  const base = await deps.db.query.products.findFirst({ where: eq(products.id, productId) });
  let picks = ids.length ? await deps.db.select().from(products).where(and(inArray(products.id, ids), eq(products.status, "published"))) : [];
  picks.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  if (picks.length < limit) {
    const fill = await deps.db.select().from(products).where(and(eq(products.storeId, storeId), eq(products.status, "published"))).orderBy(desc(products.createdAt)).limit(20);
    const scored = fill.filter((p) => !exclude.has(p.id) && !picks.some((x) => x.id === p.id)).map((p) => ({ p, s: (base ? p.tags.filter((t) => base.tags.includes(t)).length : 0) + (base && p.productType && p.productType === base.productType ? 1 : 0) })).sort((a, b) => b.s - a.s);
    picks = [...picks, ...scored.map((x) => x.p)].slice(0, limit);
  }
  const vids = picks.map((p) => p.id);
  const variants = vids.length ? await deps.db.select().from(productVariants).where(inArray(productVariants.productId, vids)) : [];
  return picks.slice(0, limit).map((p) => ({ id: p.id, handle: p.handle, title: p.title, media: p.media, variant: variants.find((v) => v.productId === p.id) ?? null, reason: pairs.some((x) => x.productB === p.id) ? "Bought together" : "Goes with this" }));
}

export const MerchInput = z.object({ kind: z.enum(["upsell", "bundle", "cross_sell"]), component: z.string(), placement: z.string(), title: z.string().optional(), productIds: z.array(z.string()).default([]), rules: z.record(z.string(), z.unknown()).optional(), enabled: z.boolean().optional(), tiers: z.array(z.object({ quantity: z.number().int().positive(), percentOff: z.number().int().min(1).max(100) })).optional() });

export const MERCH_COMPONENTS = {
  upsell: ["FrequentlyBoughtTogether", "FbtGrid", "BundleOffer", "CompleteYourRoutine", "CompleteYourSet", "BuyMoreGetFree"],
  bundle: ["BundlePackTriple", "BundlePackDuo", "HorizontalTripleTier", "ChooseYourDealDuo", "BogoHorizontal", "BogoVertical"],
  cross_sell: ["GoesWithWidget", "CompleteTheLook", "WeSavedOneForYou", "PairsWellGrid", "FreeGiftSelector", "RoutineBuilder"],
};

/** Creating a bundle also creates the tiered automatic promotion behind it. */
export async function createMerch(deps: AppDeps, storeId: string, input: z.infer<typeof MerchInput>) {
  let promotionId: string | null = null;
  if (input.kind === "bundle" && input.tiers?.length) {
    const promo = await createPromotion(deps, storeId, { name: `${input.title ?? "Bundle"} tiers`, kind: "automatic", type: "bundle", value: 0, minQuantity: Math.min(...input.tiers.map((t) => t.quantity)), appliesTo: { productIds: input.productIds }, bundle: { tiers: input.tiers }, stackable: false });
    promotionId = promo.id;
  }
  const [row] = await deps.db.insert(merchConfigs).values({ storeId, kind: input.kind, component: input.component, placement: input.placement, title: input.title ?? "", productIds: input.productIds, rules: { ...(input.rules ?? {}), tiers: input.tiers }, promotionId, enabled: input.enabled ?? true }).returning();
  return row!;
}
export async function listMerch(deps: AppDeps, storeId: string, kind?: string) {
  return deps.db.select().from(merchConfigs).where(and(eq(merchConfigs.storeId, storeId), kind ? eq(merchConfigs.kind, kind) : undefined)).orderBy(desc(merchConfigs.createdAt));
}
export async function updateMerch(deps: AppDeps, storeId: string, id: string, patch: Partial<z.infer<typeof MerchInput>>) {
  const [row] = await deps.db.update(merchConfigs).set({ ...patch, rules: patch.rules }).where(and(eq(merchConfigs.id, id), eq(merchConfigs.storeId, storeId))).returning();
  if (!row) throw notFound("Config");
  return row;
}
export async function deleteMerch(deps: AppDeps, storeId: string, id: string) {
  await deps.db.delete(merchConfigs).where(and(eq(merchConfigs.id, id), eq(merchConfigs.storeId, storeId)));
  return { deleted: true };
}
