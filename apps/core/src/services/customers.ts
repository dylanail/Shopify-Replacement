import { and, eq, desc, count, ilike, or, customers, orders, sql } from "@kiln/db";
import { z } from "zod";
import { Address } from "@kiln/shared";
import type { AppDeps } from "../context.js";
import { notFound, badRequest } from "../lib/errors.js";
import type { PaginationQ } from "../lib/http.js";
import { offsetOf } from "../lib/http.js";
import { hashPassword, verifyPassword } from "../lib/crypto.js";

export const CustomerInput = z.object({
  email: z.string().email(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phone: z.string().optional(),
  acceptsMarketing: z.boolean().optional(),
  addresses: z.array(Address).optional(),
  tags: z.array(z.string()).optional(),
  b2b: z.object({ priceListId: z.string().optional(), netTermsDays: z.number().int().optional(), gatedCatalog: z.boolean().optional() }).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  password: z.string().min(8).optional(),
});

export async function upsertCustomer(deps: AppDeps, storeId: string, input: z.infer<typeof CustomerInput>) {
  const email = input.email.toLowerCase();
  const existing = await deps.db.query.customers.findFirst({ where: and(eq(customers.storeId, storeId), eq(customers.email, email)) });
  const passwordHash = input.password ? await hashPassword(input.password) : undefined;
  if (existing) {
    const [row] = await deps.db.update(customers).set({ firstName: input.firstName ?? existing.firstName, lastName: input.lastName ?? existing.lastName, phone: input.phone ?? existing.phone, acceptsMarketing: input.acceptsMarketing ?? existing.acceptsMarketing, addresses: input.addresses ?? existing.addresses, tags: input.tags ?? existing.tags, b2b: input.b2b ?? existing.b2b, metadata: { ...existing.metadata, ...(input.metadata ?? {}) }, ...(passwordHash ? { passwordHash } : {}) }).where(eq(customers.id, existing.id)).returning();
    return { customer: row!, created: false };
  }
  const [row] = await deps.db.insert(customers).values({ storeId, email, firstName: input.firstName ?? "", lastName: input.lastName ?? "", phone: input.phone, acceptsMarketing: input.acceptsMarketing ?? false, addresses: input.addresses ?? [], tags: input.tags ?? [], b2b: input.b2b ?? null, metadata: input.metadata ?? {}, passwordHash }).returning();
  return { customer: row!, created: true };
}

export async function getCustomer(deps: AppDeps, storeId: string, id: string) {
  const c = await deps.db.query.customers.findFirst({ where: and(eq(customers.storeId, storeId), eq(customers.id, id)) });
  if (!c) throw notFound("Customer");
  const recent = await deps.db.select().from(orders).where(and(eq(orders.storeId, storeId), eq(orders.customerId, id))).orderBy(desc(orders.createdAt)).limit(20);
  return { ...c, segment: segmentOf(c), orders: recent };
}

export function segmentOf(c: { ordersCount: number; totalSpentCents: number; lastOrderAt: Date | null; createdAt: Date }) {
  const days = c.lastOrderAt ? (Date.now() - c.lastOrderAt.getTime()) / 864e5 : Infinity;
  if (c.ordersCount === 0) return "prospect";
  if (c.totalSpentCents >= 50000 || c.ordersCount >= 5) return days > 90 ? "at_risk_vip" : "vip";
  if (days > 90) return "at_risk";
  return c.ordersCount === 1 ? "new" : "returning";
}

export async function listCustomers(deps: AppDeps, storeId: string, q: PaginationQ & { segment?: string; marketing?: string }) {
  const where = and(eq(customers.storeId, storeId), q.q ? or(ilike(customers.email, `%${q.q}%`), ilike(customers.firstName, `%${q.q}%`), ilike(customers.lastName, `%${q.q}%`)) : undefined, q.marketing === "true" ? eq(customers.acceptsMarketing, true) : undefined);
  const order = q.sort === "spent" ? desc(customers.totalSpentCents) : desc(customers.createdAt);
  if (q.segment) {
    // Segments are derived, so filter in memory over the (bounded) matching set before paginating.
    const all = await deps.db.select().from(customers).where(where).orderBy(order).limit(5000);
    const matched = all.map((c) => ({ ...c, passwordHash: undefined, segment: segmentOf(c) })).filter((c) => c.segment === q.segment);
    return { items: matched.slice(offsetOf(q), offsetOf(q) + q.pageSize), total: matched.length, page: q.page, pageSize: q.pageSize };
  }
  const [{ total }] = await deps.db.select({ total: count() }).from(customers).where(where);
  const rows = await deps.db.select().from(customers).where(where).orderBy(order).limit(q.pageSize).offset(offsetOf(q));
  return { items: rows.map((c) => ({ ...c, passwordHash: undefined, segment: segmentOf(c) })), total: Number(total), page: q.page, pageSize: q.pageSize };
}

export async function customerSegments(deps: AppDeps, storeId: string) {
  const rows = await deps.db.select({ ordersCount: customers.ordersCount, totalSpentCents: customers.totalSpentCents, lastOrderAt: customers.lastOrderAt, createdAt: customers.createdAt }).from(customers).where(eq(customers.storeId, storeId));
  const out: Record<string, number> = {};
  for (const r of rows) out[segmentOf(r)] = (out[segmentOf(r)] ?? 0) + 1;
  return out;
}

export async function recordCustomerOrder(deps: AppDeps, customerId: string, totalCents: number) {
  await deps.db.update(customers).set({ ordersCount: sql`${customers.ordersCount} + 1`, totalSpentCents: sql`${customers.totalSpentCents} + ${totalCents}`, lastOrderAt: new Date() }).where(eq(customers.id, customerId));
}

export async function customerLogin(deps: AppDeps, storeId: string, email: string, password: string) {
  const c = await deps.db.query.customers.findFirst({ where: and(eq(customers.storeId, storeId), eq(customers.email, email.toLowerCase())) });
  if (!c?.passwordHash || !(await verifyPassword(password, c.passwordHash))) throw badRequest("Invalid email or password");
  return c;
}

export async function deleteCustomer(deps: AppDeps, storeId: string, id: string) {
  const r = await deps.db.delete(customers).where(and(eq(customers.id, id), eq(customers.storeId, storeId))).returning({ id: customers.id });
  if (!r.length) throw notFound("Customer");
  return { deleted: true };
}
