import { and, eq, desc, count, ilike, or, sql, orders, carts, counters, fulfillments, returns, refunds, productVariants, customers, sum } from "@kiln/db";
import { z } from "zod";
import type { AppDeps } from "../context.js";
import { notFound, badRequest } from "../lib/errors.js";
import type { PaginationQ } from "../lib/http.js";
import { offsetOf } from "../lib/http.js";
import { getCart, priceCartRecord } from "./carts.js";
import { upsertCustomer, recordCustomerOrder } from "./customers.js";
import { incrementUsage } from "./promotions.js";
import { sendTemplated } from "./emails.js";
import { track } from "./analytics.js";
import { runWorkflowsFor } from "./workflows.js";
import { adjustInventory } from "./products.js";
import { createSubscriptionsFromOrder } from "./subscriptions.js";
import { regions } from "@kiln/db";

async function nextOrderNumber(deps: AppDeps, storeId: string) {
  const [row] = await deps.db.insert(counters).values({ storeId, key: "order_number", value: 1001 }).onConflictDoUpdate({ target: [counters.storeId, counters.key], set: { value: sql`${counters.value} + 1` } }).returning({ value: counters.value });
  return Number(row!.value);
}

export const CheckoutInput = z.object({
  email: z.string().email(),
  paymentProvider: z.string().default("test"),
  paymentRef: z.string().optional(),
  acceptsMarketing: z.boolean().optional(),
  notes: z.string().optional(),
});

/** Cart → order. Validates stock, allocates a number, decrements inventory, upserts the customer, sends the confirmation, fires workflows. */
export async function checkout(deps: AppDeps, storeId: string, cartId: string, input: z.infer<typeof CheckoutInput>) {
  const cart = await getCart(deps, storeId, cartId);
  if (cart.status !== "open") throw badRequest("Cart already checked out");
  if (cart.items.length === 0) throw badRequest("Cart is empty");
  if (!cart.shippingAddress) throw badRequest("Shipping address required");
  const pricing = await priceCartRecord(deps, cart);
  const region = cart.regionId ? await deps.db.query.regions.findFirst({ where: eq(regions.id, cart.regionId) }) : undefined;
  for (const item of cart.items) {
    const [v] = await deps.db.select().from(productVariants).where(eq(productVariants.id, item.variantId));
    if (!v) throw badRequest(`${item.title} is no longer available`);
    if (!v.allowBackorder && v.inventoryQty < item.quantity) throw badRequest(`Only ${v.inventoryQty} of ${item.title} left`);
  }
  if (input.paymentProvider === "stripe" && deps.stripe && input.paymentRef) {
    const pi = await deps.stripe.paymentIntents.retrieve(input.paymentRef);
    if (pi.status !== "succeeded" && pi.status !== "requires_capture") throw badRequest(`Payment not complete (${pi.status})`);
  }
  const { customer } = await upsertCustomer(deps, storeId, { email: input.email, firstName: cart.shippingAddress.firstName, lastName: cart.shippingAddress.lastName, phone: cart.shippingAddress.phone, acceptsMarketing: input.acceptsMarketing, addresses: [cart.shippingAddress] });
  const number = await nextOrderNumber(deps, storeId);
  const shippingOption = cart.shippingOptionId ? await deps.db.query.shippingOptions.findFirst({ where: eq((await import("@kiln/db")).shippingOptions.id, cart.shippingOptionId) }) : undefined;
  const [order] = await deps.db
    .insert(orders)
    .values({
      storeId, number, cartId, customerId: customer.id, email: input.email.toLowerCase(), status: "open", financialStatus: input.paymentProvider === "manual" ? "pending" : "paid", fulfillmentStatus: "unfulfilled", currency: region?.currency ?? "USD", regionId: cart.regionId,
      items: cart.items.map((i) => ({ ...i, fulfilledQuantity: 0, returnedQuantity: 0 })), subtotalCents: pricing.subtotalCents, discountCents: pricing.discountCents, shippingCents: pricing.shippingCents, taxCents: pricing.taxCents, totalCents: pricing.totalCents,
      shippingAddress: cart.shippingAddress, billingAddress: cart.billingAddress ?? cart.shippingAddress, shippingMethod: shippingOption?.name ?? null, paymentProvider: input.paymentProvider, paymentRef: input.paymentRef ?? null, discountCodes: pricing.applied.filter((a) => a.code).map((a) => a.code!), notes: input.notes ?? "", sessionId: cart.sessionId,
      metadata: { experimentVariants: cart.experimentVariants, applied: pricing.applied },
    })
    .returning();
  for (const item of cart.items) await adjustInventory(deps, storeId, item.variantId, -item.quantity, `order #${number}`, "system");
  await deps.db.update(carts).set({ status: "completed", customerId: customer.id, email: input.email }).where(eq(carts.id, cartId));
  await recordCustomerOrder(deps, customer.id, pricing.totalCents);
  await incrementUsage(deps, pricing.applied.map((a) => a.id));
  if (cart.sessionId) await track(deps, storeId, { sessionId: cart.sessionId, kind: "checkout.complete", path: "/checkout/complete", valueCents: pricing.totalCents, meta: { orderId: order!.id } });
  await createSubscriptionsFromOrder(deps, order!);
  void sendTemplated(deps, storeId, "order_confirmation", input.email, { order: order!, customer, orderUrl: `/account/orders/${order!.id}` });
  void runWorkflowsFor(deps, storeId, "order.created", { order: order! });
  if (order!.financialStatus === "paid") void runWorkflowsFor(deps, storeId, "order.paid", { order: order! });
  return order!;
}

export async function getOrder(deps: AppDeps, storeId: string, idOrNumber: string) {
  const numeric = /^\d+$/.test(idOrNumber) ? Number(idOrNumber) : null;
  const o = await deps.db.query.orders.findFirst({ where: and(eq(orders.storeId, storeId), numeric != null ? or(eq(orders.id, idOrNumber), eq(orders.number, numeric)) : eq(orders.id, idOrNumber)) });
  if (!o) throw notFound("Order");
  const [fs, rs, rf] = await Promise.all([
    deps.db.select().from(fulfillments).where(eq(fulfillments.orderId, o.id)).orderBy(desc(fulfillments.createdAt)),
    deps.db.select().from(returns).where(eq(returns.orderId, o.id)).orderBy(desc(returns.createdAt)),
    deps.db.select().from(refunds).where(eq(refunds.orderId, o.id)).orderBy(desc(refunds.createdAt)),
  ]);
  return { ...o, fulfillments: fs, returns: rs, refunds: rf };
}

export async function listOrders(deps: AppDeps, storeId: string, q: PaginationQ & { customerId?: string; financial?: string; fulfillment?: string }) {
  const where = and(
    eq(orders.storeId, storeId),
    q.status && q.status !== "all" ? eq(orders.status, q.status) : undefined,
    q.financial ? eq(orders.financialStatus, q.financial) : undefined,
    q.fulfillment ? eq(orders.fulfillmentStatus, q.fulfillment) : undefined,
    q.customerId ? eq(orders.customerId, q.customerId) : undefined,
    q.q ? or(ilike(orders.email, `%${q.q}%`), /^\d+$/.test(q.q) ? eq(orders.number, Number(q.q)) : undefined) : undefined,
  );
  const [{ total }] = await deps.db.select({ total: count() }).from(orders).where(where);
  const items = await deps.db.select().from(orders).where(where).orderBy(desc(orders.createdAt)).limit(q.pageSize).offset(offsetOf(q));
  return { items, total: Number(total), page: q.page, pageSize: q.pageSize };
}

export async function fulfillOrder(deps: AppDeps, storeId: string, orderId: string, input: { items?: { variantId: string; quantity: number }[]; provider?: string; trackingNumber?: string; trackingUrl?: string; labelUrl?: string }) {
  const o = await getOrder(deps, storeId, orderId);
  if (o.status === "cancelled") throw badRequest("Order is cancelled");
  const remaining = o.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity - i.fulfilledQuantity })).filter((i) => i.quantity > 0);
  const toShip = input.items?.length ? input.items : remaining;
  if (!toShip.length) throw badRequest("Nothing left to fulfil");
  const trackingUrl = input.trackingUrl ?? (input.trackingNumber ? `https://track.kiln.store/${encodeURIComponent(input.trackingNumber)}` : null);
  const [f] = await deps.db.insert(fulfillments).values({ orderId: o.id, storeId, status: "shipped", provider: input.provider ?? "manual", trackingNumber: input.trackingNumber ?? null, trackingUrl, labelUrl: input.labelUrl ?? null, items: toShip, shippedAt: new Date() }).returning();
  const items = o.items.map((i) => ({ ...i, fulfilledQuantity: i.fulfilledQuantity + (toShip.find((t) => t.variantId === i.variantId)?.quantity ?? 0) }));
  const done = items.every((i) => i.fulfilledQuantity >= i.quantity);
  await deps.db.update(orders).set({ items, fulfillmentStatus: done ? "fulfilled" : "partial", status: done ? "completed" : o.status }).where(eq(orders.id, o.id));
  void sendTemplated(deps, storeId, "order_shipped", o.email, { order: o, customer: { firstName: o.shippingAddress?.firstName }, fulfillment: f });
  void runWorkflowsFor(deps, storeId, "order.fulfilled", { order: o, fulfillment: f });
  return getOrder(deps, storeId, o.id);
}

export async function markDelivered(deps: AppDeps, storeId: string, fulfillmentId: string) {
  const [f] = await deps.db.update(fulfillments).set({ status: "delivered", deliveredAt: new Date() }).where(and(eq(fulfillments.id, fulfillmentId), eq(fulfillments.storeId, storeId))).returning();
  if (!f) throw notFound("Fulfillment");
  const o = await getOrder(deps, storeId, f.orderId);
  void sendTemplated(deps, storeId, "order_delivered", o.email, { order: o, customer: { firstName: o.shippingAddress?.firstName } });
  return f;
}

export async function cancelOrder(deps: AppDeps, storeId: string, orderId: string, reason = "", actor = "user") {
  const o = await getOrder(deps, storeId, orderId);
  if (o.status === "cancelled") return o;
  if (o.fulfillmentStatus === "fulfilled") throw badRequest("Cannot cancel a fulfilled order — create a return instead");
  for (const item of o.items) await adjustInventory(deps, storeId, item.variantId, item.quantity - item.fulfilledQuantity, `cancel #${o.number}`, actor);
  const refundCents = o.financialStatus === "paid" ? o.totalCents - o.refundedCents : 0;
  if (refundCents > 0) await deps.db.insert(refunds).values({ orderId: o.id, storeId, amountCents: refundCents, reason: reason || "Order cancelled", actor });
  await deps.db.update(orders).set({ status: "cancelled", financialStatus: refundCents > 0 ? "refunded" : o.financialStatus, refundedCents: o.refundedCents + refundCents, notes: [o.notes, reason].filter(Boolean).join("\n") }).where(eq(orders.id, o.id));
  void sendTemplated(deps, storeId, "order_cancelled", o.email, { order: o, reason, customer: { firstName: o.shippingAddress?.firstName } });
  return getOrder(deps, storeId, o.id);
}

export async function refundOrder(deps: AppDeps, storeId: string, orderId: string, amountCents: number | undefined, reason = "", actor = "user") {
  const o = await getOrder(deps, storeId, orderId);
  const max = o.totalCents - o.refundedCents;
  const amount = amountCents ?? max;
  if (amount <= 0 || amount > max) throw badRequest(`Refund must be between 1 and ${max} cents`);
  let providerRef: string | null = null;
  if (o.paymentProvider === "stripe" && deps.stripe && o.paymentRef) {
    const r = await deps.stripe.refunds.create({ payment_intent: o.paymentRef, amount });
    providerRef = r.id;
  }
  const [rf] = await deps.db.insert(refunds).values({ orderId: o.id, storeId, amountCents: amount, reason, providerRef, actor }).returning();
  const refundedCents = o.refundedCents + amount;
  await deps.db.update(orders).set({ refundedCents, financialStatus: refundedCents >= o.totalCents ? "refunded" : "partially_refunded" }).where(eq(orders.id, o.id));
  if (o.customerId) await deps.db.update(customers).set({ totalSpentCents: sql`greatest(0, ${customers.totalSpentCents} - ${amount})` }).where(eq(customers.id, o.customerId));
  void sendTemplated(deps, storeId, "refund_issued", o.email, { order: o, refund: rf, customer: { firstName: o.shippingAddress?.firstName } });
  return getOrder(deps, storeId, o.id);
}

export async function createReturn(deps: AppDeps, storeId: string, orderId: string, input: { items: { variantId: string; quantity: number; reason: string }[]; kind?: "refund" | "exchange"; reason?: string }) {
  const o = await getOrder(deps, storeId, orderId);
  const refundCents = input.items.reduce((s, it) => {
    const line = o.items.find((i) => i.variantId === it.variantId);
    return s + (line ? line.unitPriceCents * Math.min(it.quantity, line.quantity - line.returnedQuantity) : 0);
  }, 0);
  const [r] = await deps.db.insert(returns).values({ orderId: o.id, storeId, kind: input.kind ?? "refund", items: input.items, reason: input.reason ?? "", refundCents, status: "approved", labelUrl: `/returns/label/${o.number}` }).returning();
  return r!;
}

export async function completeReturn(deps: AppDeps, storeId: string, returnId: string, actor = "user") {
  const [r] = await deps.db.select().from(returns).where(and(eq(returns.id, returnId), eq(returns.storeId, storeId)));
  if (!r) throw notFound("Return");
  if (r.status === "refunded") return r;
  const o = await getOrder(deps, storeId, r.orderId);
  for (const it of r.items) await adjustInventory(deps, storeId, it.variantId, it.quantity, `return ${r.id}`, actor);
  const items = o.items.map((i) => ({ ...i, returnedQuantity: i.returnedQuantity + (r.items.find((x) => x.variantId === i.variantId)?.quantity ?? 0) }));
  await deps.db.update(orders).set({ items, fulfillmentStatus: items.every((i) => i.returnedQuantity >= i.quantity) ? "returned" : o.fulfillmentStatus }).where(eq(orders.id, o.id));
  if (r.kind === "refund" && r.refundCents > 0) await refundOrder(deps, storeId, o.id, Math.min(r.refundCents, o.totalCents - o.refundedCents), `Return ${r.id}`, actor);
  const [done] = await deps.db.update(returns).set({ status: "refunded" }).where(eq(returns.id, r.id)).returning();
  return done!;
}

export async function updateOrder(deps: AppDeps, storeId: string, orderId: string, patch: { tags?: string[]; notes?: string; metadata?: Record<string, unknown> }) {
  const o = await getOrder(deps, storeId, orderId);
  await deps.db.update(orders).set({ ...(patch.tags ? { tags: patch.tags } : {}), ...(patch.notes !== undefined ? { notes: patch.notes } : {}), ...(patch.metadata ? { metadata: { ...o.metadata, ...patch.metadata } } : {}) }).where(eq(orders.id, o.id));
  return getOrder(deps, storeId, o.id);
}

export async function orderStats(deps: AppDeps, storeId: string) {
  const [row] = await deps.db.select({ total: count(), revenue: sum(orders.totalCents), unfulfilled: count(sql`case when ${orders.fulfillmentStatus} = 'unfulfilled' and ${orders.status} <> 'cancelled' then 1 end`) }).from(orders).where(eq(orders.storeId, storeId));
  return { total: Number(row?.total ?? 0), revenueCents: Number(row?.revenue ?? 0), unfulfilled: Number(row?.unfulfilled ?? 0) };
}
