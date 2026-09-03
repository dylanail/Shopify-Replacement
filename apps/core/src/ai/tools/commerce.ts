import { tool } from "./define.js";
import { z } from "zod";
import type { AppDeps } from "../../context.js";
import { createPromotion, listPromotions, updatePromotion, PromotionInput } from "../../services/promotions.js";
import { listOrders, getOrder, fulfillOrder, cancelOrder, refundOrder } from "../../services/orders.js";
import { listCustomers, upsertCustomer } from "../../services/customers.js";
import { findProductByTitle } from "../../services/products.js";
import { findCollectionByTitle } from "../../services/collections.js";
import { recordActivity, setTodo } from "../../services/todos.js";
import { createRegion, createShippingOption, listRegions, RegionInput, ShippingOptionInput } from "../../services/shipping.js";
import { createMerch, rebuildAffinity } from "../../services/merch.js";
import { formatMoney } from "@kiln/shared";

const d = (ctx: { deps: AppDeps }) => ctx.deps;

export const commerceTools = [
  tool({
    name: "create_promotion", area: "promotions",
    description: "Create a discount: code or automatic; percentage | fixed (cents) | free_shipping | bogo | bundle. Scope to products/collections by title. Thresholds in cents.",
    input: PromotionInput.extend({ productTitles: z.array(z.string()).optional(), collectionTitles: z.array(z.string()).optional() }),
    handler: async ({ productTitles, collectionTitles, ...input }, ctx) => {
      const appliesTo = { ...(input.appliesTo ?? {}) };
      if (productTitles?.length) appliesTo.productIds = [...(appliesTo.productIds ?? []), ...(await Promise.all(productTitles.map((t) => findProductByTitle(d(ctx), ctx.storeId, t)))).filter((p): p is NonNullable<typeof p> => !!p).map((p) => p.id)];
      if (collectionTitles?.length) appliesTo.collectionIds = [...(appliesTo.collectionIds ?? []), ...(await Promise.all(collectionTitles.map((t) => findCollectionByTitle(d(ctx), ctx.storeId, t)))).filter((c): c is NonNullable<typeof c> => !!c).map((c) => c.id)];
      const p = await createPromotion(d(ctx), ctx.storeId, { ...input, appliesTo });
      await recordActivity(d(ctx), ctx.storeId, "promotions", "done", `Created ${p.code ?? p.name}`, ctx.runId);
      return { id: p.id, name: p.name, code: p.code, kind: p.kind, type: p.type, value: p.value, adminUrl: "/promotions" };
    },
  }),
  tool({ name: "list_promotions", area: "promotions", description: "List promotions with usage.", input: z.object({}), handler: async (_i, ctx) => (await listPromotions(d(ctx), ctx.storeId)).map((p) => ({ id: p.id, name: p.name, code: p.code, kind: p.kind, type: p.type, value: p.value, status: p.status, usageCount: p.usageCount })) }),
  tool({
    name: "set_promotion_status", area: "promotions", description: "Enable/disable/expire a promotion by id or code.",
    input: z.object({ promotionId: z.string().optional(), code: z.string().optional(), status: z.enum(["active", "disabled", "expired"]) }),
    handler: async (input, ctx) => {
      const all = await listPromotions(d(ctx), ctx.storeId);
      const p = all.find((x) => x.id === input.promotionId || (input.code && x.code === input.code.toUpperCase()));
      if (!p) throw new Error("Promotion not found");
      const r = await updatePromotion(d(ctx), ctx.storeId, p.id, { status: input.status });
      return { id: r.id, code: r.code, status: r.status };
    },
  }),
  tool({
    name: "create_bundle", area: "promotions", description: "Create a tiered bundle component + the automatic promotion behind it (e.g. 2 → 10% off, 3 → 15% off).",
    input: z.object({ title: z.string(), productTitles: z.array(z.string()).optional(), productIds: z.array(z.string()).optional(), tiers: z.array(z.object({ quantity: z.number().int().min(2), percentOff: z.number().int().min(1).max(90) })).default([{ quantity: 2, percentOff: 10 }, { quantity: 3, percentOff: 15 }]), component: z.string().default("BundlePackTriple"), placement: z.string().default("pdpBelowAddToCart") }),
    handler: async (input, ctx) => {
      const ids = [...(input.productIds ?? []), ...(await Promise.all((input.productTitles ?? []).map((t) => findProductByTitle(d(ctx), ctx.storeId, t)))).filter((p): p is NonNullable<typeof p> => !!p).map((p) => p.id)];
      const m = await createMerch(d(ctx), ctx.storeId, { kind: "bundle", component: input.component, placement: input.placement, title: input.title, productIds: ids, tiers: input.tiers });
      await recordActivity(d(ctx), ctx.storeId, "promotions", "done", `Bundle ${input.title} live`, ctx.runId);
      return { id: m.id, promotionId: m.promotionId, products: ids.length, tiers: input.tiers };
    },
  }),
  tool({ name: "rebuild_affinity", area: "promotions", description: "Recompute co-purchase affinity pairs from the last 90 days of orders (powers upsells/cross-sells).", input: z.object({}), handler: async (_i, ctx) => rebuildAffinity(d(ctx), ctx.storeId) }),
  tool({
    name: "list_orders", area: "orders", description: "List recent orders, optionally filtered; returns a compact summary with totals.",
    input: z.object({ limit: z.number().int().max(50).default(10), status: z.string().optional(), fulfillment: z.string().optional(), q: z.string().optional() }),
    handler: async (input, ctx) => {
      const r = await listOrders(d(ctx), ctx.storeId, { page: 1, pageSize: input.limit, status: input.status, fulfillment: input.fulfillment, q: input.q });
      const revenue = r.items.reduce((s, o) => s + o.totalCents, 0);
      return { total: r.total, revenue: formatMoney(revenue, r.items[0]?.currency ?? "USD"), items: r.items.map((o) => ({ id: o.id, number: o.number, email: o.email, total: formatMoney(o.totalCents, o.currency), financialStatus: o.financialStatus, fulfillmentStatus: o.fulfillmentStatus, items: o.items.map((i) => `${i.quantity}× ${i.title}`), createdAt: o.createdAt })) };
    },
  }),
  tool({ name: "get_order", area: "orders", description: "Get one order by number or id with fulfillments, returns and refunds.", input: z.object({ orderNumber: z.number().int().optional(), orderId: z.string().optional() }), handler: async (input, ctx) => getOrder(d(ctx), ctx.storeId, input.orderId ?? String(input.orderNumber)) }),
  tool({
    name: "fulfill_order", area: "orders", description: "Mark an order (or part of it) shipped with optional carrier + tracking; emails the customer.",
    input: z.object({ orderNumber: z.number().int().optional(), orderId: z.string().optional(), provider: z.string().optional(), trackingNumber: z.string().optional(), trackingUrl: z.string().optional() }),
    handler: async (input, ctx) => {
      const o = await fulfillOrder(d(ctx), ctx.storeId, input.orderId ?? String(input.orderNumber), { provider: input.provider, trackingNumber: input.trackingNumber, trackingUrl: input.trackingUrl });
      await recordActivity(d(ctx), ctx.storeId, "orders", "done", `Fulfilled #${o.number}`, ctx.runId);
      return { number: o.number, fulfillmentStatus: o.fulfillmentStatus, adminUrl: `/orders/${o.id}` };
    },
  }),
  tool({
    name: "cancel_order", area: "orders", risky: true, description: "Cancel an unfulfilled order, restock, refund if paid, and email the customer.",
    input: z.object({ orderNumber: z.number().int().optional(), orderId: z.string().optional(), reason: z.string().default("") }),
    handler: async (input, ctx) => {
      const o = await cancelOrder(d(ctx), ctx.storeId, input.orderId ?? String(input.orderNumber), input.reason, "ai");
      await recordActivity(d(ctx), ctx.storeId, "orders", "done", `Cancelled #${o.number}`, ctx.runId);
      return { number: o.number, status: o.status, refundedCents: o.refundedCents };
    },
  }),
  tool({
    name: "refund_order", area: "orders", risky: true, description: "Refund an order fully or partially (amountCents) and email the customer.",
    input: z.object({ orderNumber: z.number().int().optional(), orderId: z.string().optional(), amountCents: z.number().int().positive().optional(), reason: z.string().default("") }),
    handler: async (input, ctx) => {
      const o = await refundOrder(d(ctx), ctx.storeId, input.orderId ?? String(input.orderNumber), input.amountCents, input.reason, "ai");
      await recordActivity(d(ctx), ctx.storeId, "orders", "done", `Refunded #${o.number}`, ctx.runId);
      return { number: o.number, refundedCents: o.refundedCents, financialStatus: o.financialStatus };
    },
  }),
  tool({
    name: "list_customers", area: "customers", description: "Search customers; segments: prospect | new | returning | vip | at_risk | at_risk_vip.",
    input: z.object({ q: z.string().optional(), segment: z.string().optional(), limit: z.number().int().max(50).default(20) }),
    handler: async (input, ctx) => {
      const r = await listCustomers(d(ctx), ctx.storeId, { page: 1, pageSize: input.limit, q: input.q, segment: input.segment });
      return { total: r.total, items: r.items.map((c) => ({ id: c.id, email: c.email, name: `${c.firstName} ${c.lastName}`.trim(), segment: c.segment, ordersCount: c.ordersCount, totalSpentCents: c.totalSpentCents, tags: c.tags })) };
    },
  }),
  tool({
    name: "upsert_customer", area: "customers", description: "Create or update a customer (tags, marketing opt-in, B2B terms).",
    input: z.object({ email: z.string().email(), firstName: z.string().optional(), lastName: z.string().optional(), tags: z.array(z.string()).optional(), acceptsMarketing: z.boolean().optional(), netTermsDays: z.number().int().optional() }),
    handler: async (input, ctx) => {
      const { customer, created } = await upsertCustomer(d(ctx), ctx.storeId, { ...input, b2b: input.netTermsDays ? { netTermsDays: input.netTermsDays } : undefined });
      return { id: customer.id, email: customer.email, created };
    },
  }),
  tool({
    name: "create_region", area: "settings", description: "Add a selling region (currency + countries). Payment providers mirror the default region; prices convert automatically.",
    input: RegionInput,
    handler: async (input, ctx) => {
      const r = await createRegion(d(ctx), ctx.storeId, input);
      await recordActivity(d(ctx), ctx.storeId, "settings", "done", `Added region ${r.name}`, ctx.runId);
      return { id: r.id, name: r.name, currency: r.currency, countries: r.countries };
    },
  }),
  tool({
    name: "create_shipping_option", area: "settings", description: "Add a shipping rate: flat | free_above (thresholdCents) | weight | price | pickup | local_delivery.",
    input: ShippingOptionInput.extend({ regionName: z.string().optional() }),
    handler: async ({ regionName, ...input }, ctx) => {
      const regionsAll = await listRegions(d(ctx), ctx.storeId);
      const region = regionName ? regionsAll.find((r) => r.name.toLowerCase().includes(regionName.toLowerCase())) : regionsAll[0];
      const o = await createShippingOption(d(ctx), ctx.storeId, { ...input, regionId: region?.id ?? null });
      await setTodo(d(ctx), ctx.storeId, "shipping", "done");
      return { id: o.id, name: o.name, type: o.type, amountCents: o.amountCents };
    },
  }),
];
