import { and, eq, inArray, carts, productVariants, products, collectionProducts, regions, shippingOptions, giftCards } from "@kiln/db";
import type { CartItem, Address } from "@kiln/shared";
import type { AppDeps } from "../context.js";
import { notFound, badRequest } from "../lib/errors.js";
import { priceCart, type PricingResult } from "./pricing.js";
import { activePromotions } from "./promotions.js";
import { newId } from "@kiln/db";

export async function getCart(deps: AppDeps, storeId: string, cartId: string) {
  const c = await deps.db.query.carts.findFirst({ where: and(eq(carts.id, cartId), eq(carts.storeId, storeId)) });
  if (!c) throw notFound("Cart");
  return c;
}

export async function createCart(deps: AppDeps, storeId: string, opts: { regionId?: string; sessionId?: string; country?: string } = {}) {
  const all = await deps.db.select().from(regions).where(eq(regions.storeId, storeId));
  const region = (opts.regionId && all.find((r) => r.id === opts.regionId)) || (opts.country && all.find((r) => r.countries.includes(opts.country!.toUpperCase()))) || all[0];
  const [c] = await deps.db.insert(carts).values({ storeId, regionId: region?.id ?? null, sessionId: opts.sessionId ?? null }).returning();
  return c!;
}

export async function addToCart(deps: AppDeps, storeId: string, cartId: string, variantId: string, quantity = 1, extra: { subscriptionCadence?: string; metadata?: Record<string, unknown> } = {}) {
  const cart = await getCart(deps, storeId, cartId);
  if (cart.status !== "open") throw badRequest("Cart is closed");
  const [variant] = await deps.db.select().from(productVariants).where(and(eq(productVariants.id, variantId), eq(productVariants.storeId, storeId)));
  if (!variant) throw notFound("Variant");
  const product = await deps.db.query.products.findFirst({ where: eq(products.id, variant.productId) });
  if (!product || product.status !== "published") throw badRequest("Product is not available");
  const items = [...cart.items];
  const existing = items.find((i) => i.variantId === variantId && i.subscriptionCadence === extra.subscriptionCadence && JSON.stringify(i.metadata ?? {}) === JSON.stringify(extra.metadata ?? {}));
  const wanted = (existing?.quantity ?? 0) + quantity;
  if (!variant.allowBackorder && wanted > variant.inventoryQty) throw badRequest(`Only ${variant.inventoryQty} left in stock`);
  let unitPriceCents = variant.priceCents;
  if (extra.subscriptionCadence && product.subscription?.enabled) unitPriceCents = Math.round(unitPriceCents * (1 - product.subscription.discountPercent / 100));
  if (extra.metadata?.engraving && typeof extra.metadata.engravingFeeCents === "number") unitPriceCents += extra.metadata.engravingFeeCents;
  if (existing) existing.quantity = wanted;
  else items.push({ id: newId("li"), productId: product.id, handle: product.handle, variantId, title: product.title, variantTitle: variant.title, quantity, unitPriceCents, imageUrl: variant.imageUrl ?? product.media[0]?.url, subscriptionCadence: extra.subscriptionCadence, metadata: extra.metadata });
  const [updated] = await deps.db.update(carts).set({ items }).where(eq(carts.id, cartId)).returning();
  return updated!;
}

export async function updateCartItem(deps: AppDeps, storeId: string, cartId: string, lineId: string, quantity: number) {
  const cart = await getCart(deps, storeId, cartId);
  const items = cart.items.map((i) => (i.id === lineId ? { ...i, quantity } : i)).filter((i) => i.quantity > 0);
  const [updated] = await deps.db.update(carts).set({ items }).where(eq(carts.id, cartId)).returning();
  return updated!;
}

export async function updateCart(deps: AppDeps, storeId: string, cartId: string, patch: { email?: string; shippingAddress?: Address; billingAddress?: Address; shippingOptionId?: string | null; discountCodes?: string[]; giftCardCodes?: string[]; customerId?: string; regionId?: string; experimentVariants?: Record<string, string> }) {
  await getCart(deps, storeId, cartId);
  const [updated] = await deps.db.update(carts).set(patch).where(eq(carts.id, cartId)).returning();
  return updated!;
}

export async function applyDiscountCode(deps: AppDeps, storeId: string, cartId: string, code: string) {
  const cart = await getCart(deps, storeId, cartId);
  const codes = [...new Set([...cart.discountCodes, code.toUpperCase()])];
  const [updated] = await deps.db.update(carts).set({ discountCodes: codes }).where(eq(carts.id, cartId)).returning();
  const priced = await priceCartRecord(deps, updated!);
  const rejected = priced.rejectedCodes.find((r) => r.code.toUpperCase() === code.toUpperCase());
  if (rejected) {
    await deps.db.update(carts).set({ discountCodes: cart.discountCodes }).where(eq(carts.id, cartId));
    throw badRequest(rejected.reason);
  }
  return { cart: updated!, pricing: priced };
}

export async function priceCartRecord(deps: AppDeps, cart: typeof carts.$inferSelect): Promise<PricingResult> {
  const promos = await activePromotions(deps, cart.storeId);
  const region = cart.regionId ? await deps.db.query.regions.findFirst({ where: eq(regions.id, cart.regionId) }) : undefined;
  const option = cart.shippingOptionId ? await deps.db.query.shippingOptions.findFirst({ where: eq(shippingOptions.id, cart.shippingOptionId) }) : undefined;
  const productIds = [...new Set(cart.items.map((i) => i.productId))];
  const links = productIds.length ? await deps.db.select().from(collectionProducts).where(inArray(collectionProducts.productId, productIds)) : [];
  const productCollections: Record<string, string[]> = {};
  for (const l of links) (productCollections[l.productId] ??= []).push(l.collectionId);
  let giftCardCents = 0;
  if (cart.giftCardCodes.length) {
    const cards = await deps.db.select().from(giftCards).where(and(eq(giftCards.storeId, cart.storeId), inArray(giftCards.code, cart.giftCardCodes), eq(giftCards.status, "active")));
    giftCardCents = cards.reduce((s, g) => s + g.balanceCents, 0);
  }
  const variants = cart.items.length ? await deps.db.select({ id: productVariants.id, weightGrams: productVariants.weightGrams, productId: productVariants.productId }).from(productVariants).where(inArray(productVariants.id, cart.items.map((i) => i.variantId))) : [];
  const totalWeightGrams = cart.items.reduce((s, i) => s + (variants.find((v) => v.id === i.variantId)?.weightGrams ?? 0) * i.quantity, 0);
  return priceCart({ items: cart.items, promotions: promos, appliedCodes: cart.discountCodes, shippingOption: option ?? null, region: region ?? null, productCollections, totalWeightGrams, giftCardCents });
}

export async function cartWithPricing(deps: AppDeps, storeId: string, cartId: string) {
  const cart = await getCart(deps, storeId, cartId);
  const pricing = await priceCartRecord(deps, cart);
  const options = cart.regionId ? await deps.db.select().from(shippingOptions).where(and(eq(shippingOptions.storeId, storeId), eq(shippingOptions.regionId, cart.regionId), eq(shippingOptions.enabled, true))) : [];
  const region = cart.regionId ? await deps.db.query.regions.findFirst({ where: eq(regions.id, cart.regionId) }) : undefined;
  return { ...cart, pricing, currency: region?.currency ?? "USD", shippingOptions: options.map((o) => ({ ...o, quotedCents: priceCart({ items: cart.items, promotions: [], appliedCodes: [], shippingOption: o, region: region ?? null }).shippingCents })) };
}

export type CartRecord = typeof carts.$inferSelect;
export type { CartItem };

/** Carts untouched for `hours` with an email become "abandoned" once — used by the cart-abandon flow. */
export async function findAbandonedCarts(deps: AppDeps, storeId: string, hours = 4) {
  const rows = await deps.db.select().from(carts).where(and(eq(carts.storeId, storeId), eq(carts.status, "open")));
  const cutoff = Date.now() - hours * 3600e3;
  return rows.filter((c) => c.email && c.items.length && c.updatedAt.getTime() < cutoff && !c.abandonedEmailSentAt);
}
