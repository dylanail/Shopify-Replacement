import { and, eq, gte, lt, desc, count, sum, sql, sessions, events, orders, products } from "@kiln/db";
import type { EventKind } from "@kiln/shared";
import { pct } from "@kiln/shared";
import type { AppDeps } from "../context.js";

export interface TrackInput {
  sessionId?: string;
  fingerprint?: string;
  kind: EventKind | string;
  path?: string;
  productId?: string;
  variantId?: string;
  valueCents?: number;
  meta?: Record<string, unknown>;
  country?: string;
  city?: string;
  referrer?: string;
  userAgent?: string;
}

/** Cookie-less tracking: sessions are keyed by a daily-rotating fingerprint. */
export async function track(deps: AppDeps, storeId: string, input: TrackInput) {
  let sessionId = input.sessionId;
  if (!sessionId && input.fingerprint) {
    const [existing] = await deps.db.select().from(sessions).where(and(eq(sessions.storeId, storeId), eq(sessions.fingerprint, input.fingerprint))).orderBy(desc(sessions.lastSeen)).limit(1);
    if (existing && Date.now() - existing.lastSeen.getTime() < 30 * 60e3) {
      sessionId = existing.id;
      await deps.db.update(sessions).set({ lastSeen: new Date() }).where(eq(sessions.id, existing.id));
    } else {
      const device = /mobile|iphone|android/i.test(input.userAgent ?? "") ? "mobile" : "desktop";
      const [s] = await deps.db.insert(sessions).values({ storeId, fingerprint: input.fingerprint, country: input.country ?? null, city: input.city ?? null, referrer: input.referrer ?? null, landingPath: input.path ?? null, userAgent: input.userAgent ?? null, device }).returning();
      sessionId = s!.id;
    }
  }
  if (!sessionId) return null;
  const [e] = await deps.db.insert(events).values({ storeId, sessionId, kind: input.kind, path: input.path ?? null, productId: input.productId ?? null, variantId: input.variantId ?? null, valueCents: input.valueCents ?? 0, meta: input.meta ?? {} }).returning();
  deps.bus.publish({ channel: "analytics", storeId, event: { kind: input.kind, path: input.path, valueCents: input.valueCents, country: input.country, city: input.city, at: e!.createdAt.toISOString() } });
  return { sessionId, eventId: e!.id };
}

async function periodStats(deps: AppDeps, storeId: string, from: Date, to: Date) {
  const [s] = await deps.db.select({ n: count() }).from(sessions).where(and(eq(sessions.storeId, storeId), gte(sessions.firstSeen, from), lt(sessions.firstSeen, to)));
  const [o] = await deps.db.select({ n: count(), revenue: sum(orders.totalCents) }).from(orders).where(and(eq(orders.storeId, storeId), gte(orders.createdAt, from), lt(orders.createdAt, to), sql`${orders.status} <> 'cancelled'`));
  const sessionsN = Number(s?.n ?? 0);
  const ordersN = Number(o?.n ?? 0);
  const revenue = Number(o?.revenue ?? 0);
  return { sessions: sessionsN, orders: ordersN, revenueCents: revenue, conversionRate: pct(ordersN, sessionsN), aovCents: ordersN ? Math.round(revenue / ordersN) : 0 };
}

const delta = (cur: number, prev: number) => (prev === 0 ? (cur > 0 ? 100 : 0) : Math.round(((cur - prev) / prev) * 1000) / 10);

export async function summary(deps: AppDeps, storeId: string, days = 7) {
  const now = new Date();
  const from = new Date(now.getTime() - days * 864e5);
  const prevFrom = new Date(from.getTime() - days * 864e5);
  const [cur, prev] = await Promise.all([periodStats(deps, storeId, from, now), periodStats(deps, storeId, prevFrom, from)]);
  return {
    range: { from: from.toISOString(), to: now.toISOString(), days },
    kpis: {
      sessions: { value: cur.sessions, delta: delta(cur.sessions, prev.sessions) },
      totalSalesCents: { value: cur.revenueCents, delta: delta(cur.revenueCents, prev.revenueCents) },
      orders: { value: cur.orders, delta: delta(cur.orders, prev.orders) },
      conversionRate: { value: cur.conversionRate, delta: delta(cur.conversionRate, prev.conversionRate) },
      aovCents: { value: cur.aovCents, delta: delta(cur.aovCents, prev.aovCents) },
    },
  };
}

export async function timeseries(deps: AppDeps, storeId: string, days = 30) {
  const from = new Date(Date.now() - days * 864e5);
  const rows = await deps.db.select({ day: sql<string>`to_char(${orders.createdAt}, 'YYYY-MM-DD')`, orders: count(), revenue: sum(orders.totalCents) }).from(orders).where(and(eq(orders.storeId, storeId), gte(orders.createdAt, from), sql`${orders.status} <> 'cancelled'`)).groupBy(sql`to_char(${orders.createdAt}, 'YYYY-MM-DD')`);
  const sess = await deps.db.select({ day: sql<string>`to_char(${sessions.firstSeen}, 'YYYY-MM-DD')`, n: count() }).from(sessions).where(and(eq(sessions.storeId, storeId), gte(sessions.firstSeen, from))).groupBy(sql`to_char(${sessions.firstSeen}, 'YYYY-MM-DD')`);
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const sByDay = new Map(sess.map((r) => [r.day, Number(r.n)]));
  return Array.from({ length: days }, (_, i) => {
    const day = new Date(Date.now() - (days - 1 - i) * 864e5).toISOString().slice(0, 10);
    const r = byDay.get(day);
    const s = sByDay.get(day) ?? 0;
    const o = Number(r?.orders ?? 0);
    return { day, sessions: s, orders: o, revenueCents: Number(r?.revenue ?? 0), conversionRate: pct(o, s) };
  });
}

export const INDUSTRY_BENCHMARKS = { addToCart: { median: 7.2, topDecile: 12.5 }, checkout: { median: 3.1, topDecile: 6.0 }, purchase: { median: 1.8, topDecile: 3.6 } };

export async function funnel(deps: AppDeps, storeId: string, days = 7) {
  const from = new Date(Date.now() - days * 864e5);
  const rows = await deps.db.select({ kind: events.kind, n: sql<number>`count(distinct ${events.sessionId})` }).from(events).where(and(eq(events.storeId, storeId), gte(events.createdAt, from))).groupBy(events.kind);
  const [s] = await deps.db.select({ n: count() }).from(sessions).where(and(eq(sessions.storeId, storeId), gte(sessions.firstSeen, from)));
  const get = (k: string) => Number(rows.find((r) => r.kind === k)?.n ?? 0);
  const total = Math.max(Number(s?.n ?? 0), get("view.page"), get("view.product"), 1);
  const steps = [
    { key: "sessions", label: "Sessions", sessions: total, rate: 100 },
    { key: "add_to_cart", label: "Add to cart", sessions: get("cart.add"), rate: pct(get("cart.add"), total), benchmark: INDUSTRY_BENCHMARKS.addToCart },
    { key: "checkout", label: "Checkout", sessions: get("checkout.start"), rate: pct(get("checkout.start"), total), benchmark: INDUSTRY_BENCHMARKS.checkout },
    { key: "purchase", label: "Purchase", sessions: get("checkout.complete"), rate: pct(get("checkout.complete"), total), benchmark: INDUSTRY_BENCHMARKS.purchase },
  ];
  return steps.map((st, i) => ({ ...st, dropOff: i === 0 ? 0 : pct(steps[i - 1]!.sessions - st.sessions, Math.max(1, steps[i - 1]!.sessions)) }));
}

export async function realtime(deps: AppDeps, storeId: string) {
  const fiveMin = new Date(Date.now() - 5 * 60e3);
  const [live] = await deps.db.select({ n: count() }).from(sessions).where(and(eq(sessions.storeId, storeId), gte(sessions.lastSeen, fiveMin)));
  const recent = await deps.db.select({ kind: events.kind, path: events.path, valueCents: events.valueCents, productId: events.productId, createdAt: events.createdAt, country: sessions.country, city: sessions.city }).from(events).innerJoin(sessions, eq(events.sessionId, sessions.id)).where(eq(events.storeId, storeId)).orderBy(desc(events.createdAt)).limit(30);
  const geo = await deps.db.select({ country: sessions.country, n: count() }).from(sessions).where(and(eq(sessions.storeId, storeId), gte(sessions.lastSeen, new Date(Date.now() - 864e5)))).groupBy(sessions.country).orderBy(desc(count())).limit(8);
  const visits = await deps.db.select({ city: sessions.city, country: sessions.country, path: sessions.landingPath, at: sessions.lastSeen }).from(sessions).where(eq(sessions.storeId, storeId)).orderBy(desc(sessions.lastSeen)).limit(12);
  return { visitorsNow: Number(live?.n ?? 0), events: recent, geo: geo.map((g) => ({ country: g.country ?? "??", sessions: Number(g.n) })), visits };
}

export async function topProducts(deps: AppDeps, storeId: string, days = 30) {
  const from = new Date(Date.now() - days * 864e5);
  const rows = await deps.db.select().from(orders).where(and(eq(orders.storeId, storeId), gte(orders.createdAt, from), sql`${orders.status} <> 'cancelled'`));
  const agg = new Map<string, { productId: string; title: string; units: number; revenueCents: number }>();
  for (const o of rows) for (const i of o.items) {
    const a = agg.get(i.productId) ?? { productId: i.productId, title: i.title, units: 0, revenueCents: 0 };
    a.units += i.quantity;
    a.revenueCents += i.unitPriceCents * i.quantity;
    agg.set(i.productId, a);
  }
  return [...agg.values()].sort((a, b) => b.revenueCents - a.revenueCents).slice(0, 10);
}

export async function cohorts(deps: AppDeps, storeId: string) {
  const rows = await deps.db.select({ customerId: orders.customerId, createdAt: orders.createdAt, total: orders.totalCents }).from(orders).where(and(eq(orders.storeId, storeId), sql`${orders.status} <> 'cancelled'`)).orderBy(orders.createdAt);
  const first = new Map<string, string>();
  const cohort = new Map<string, { customers: Set<string>; months: Map<number, Set<string>> }>();
  for (const r of rows) {
    if (!r.customerId) continue;
    const m = r.createdAt.toISOString().slice(0, 7);
    if (!first.has(r.customerId)) first.set(r.customerId, m);
    const c0 = first.get(r.customerId)!;
    const entry = cohort.get(c0) ?? { customers: new Set(), months: new Map() };
    entry.customers.add(r.customerId);
    const idx = (Number(m.slice(0, 4)) - Number(c0.slice(0, 4))) * 12 + (Number(m.slice(5)) - Number(c0.slice(5)));
    if (!entry.months.has(idx)) entry.months.set(idx, new Set());
    entry.months.get(idx)!.add(r.customerId);
    cohort.set(c0, entry);
  }
  return [...cohort.entries()].map(([month, e]) => ({ month, size: e.customers.size, retention: Array.from({ length: 6 }, (_, i) => pct(e.months.get(i)?.size ?? 0, e.customers.size)) }));
}

export { products };
