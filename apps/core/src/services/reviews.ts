import { and, eq, desc, count, avg, inArray, reviews, productAiSummaries, qaThreads, orders, products, sql } from "@kiln/db";
import { z } from "zod";
import { MediaItem } from "@kiln/shared";
import type { AppDeps } from "../context.js";
import { notFound } from "../lib/errors.js";
import type { PaginationQ } from "../lib/http.js";
import { offsetOf } from "../lib/http.js";
import { track } from "./analytics.js";
import { runWorkflowsFor } from "./workflows.js";

export const ReviewInput = z.object({
  productId: z.string(),
  authorName: z.string().min(1),
  email: z.string().email().optional(),
  rating: z.number().int().min(1).max(5),
  title: z.string().optional(),
  body: z.string().min(1),
  media: z.array(MediaItem).optional(),
  sessionId: z.string().optional(),
});

/** Heuristic fake-review score (0–1): short generic copy, superlatives, no purchase, burst posting. */
export function fakeScore(r: { body: string; rating: number; verified: boolean; recentFromSameEmail?: number }) {
  let s = 0;
  const words = r.body.trim().split(/\s+/).length;
  if (words < 6) s += 0.3;
  if (/(best|amazing|perfect|excellent|awesome)\s+(product|item|purchase)/i.test(r.body) && words < 15) s += 0.25;
  if (!r.verified) s += 0.15;
  if (r.rating === 5 && words < 8) s += 0.1;
  if ((r.recentFromSameEmail ?? 0) > 2) s += 0.3;
  if (/https?:\/\//i.test(r.body)) s += 0.2;
  return Math.min(1, Math.round(s * 100) / 100);
}

export async function createReview(deps: AppDeps, storeId: string, input: z.infer<typeof ReviewInput>, opts: { autoApprove?: boolean } = {}) {
  const verified = input.email ? (await deps.db.select({ id: orders.id }).from(orders).where(and(eq(orders.storeId, storeId), eq(orders.email, input.email.toLowerCase()), sql`${orders.items}::text like ${"%" + input.productId + "%"}`)).limit(1)).length > 0 : false;
  const [{ recent }] = input.email ? await deps.db.select({ recent: count() }).from(reviews).where(and(eq(reviews.storeId, storeId), eq(reviews.email, input.email.toLowerCase()))) : [{ recent: 0 }];
  const score = fakeScore({ body: input.body, rating: input.rating, verified, recentFromSameEmail: Number(recent) });
  const flags = [score >= 0.5 ? "possible_fake" : null, !verified ? "unverified" : null].filter((f): f is string => !!f);
  const status = opts.autoApprove && input.rating >= 4 && score < 0.5 ? "approved" : "pending";
  const [row] = await deps.db.insert(reviews).values({ storeId, productId: input.productId, authorName: input.authorName, email: input.email?.toLowerCase() ?? null, rating: input.rating, title: input.title ?? "", body: input.body, media: input.media ?? [], status, verified, flags, fakeScore: score }).returning();
  if (input.sessionId) await track(deps, storeId, { sessionId: input.sessionId, kind: "review.submit", productId: input.productId });
  void runWorkflowsFor(deps, storeId, "review.created", { review: row! });
  if (status === "approved") await regenerateSummary(deps, storeId, input.productId);
  return row!;
}

export async function moderate(deps: AppDeps, storeId: string, id: string, action: "approve" | "reject" | "restore" | "delete" | "reply", reply?: string) {
  const status = { approve: "approved", reject: "rejected", restore: "pending", delete: "deleted", reply: undefined }[action];
  const [row] = await deps.db.update(reviews).set({ ...(status ? { status } : {}), ...(reply !== undefined ? { reply } : {}) }).where(and(eq(reviews.id, id), eq(reviews.storeId, storeId))).returning();
  if (!row) throw notFound("Review");
  if (action === "approve" || action === "reject" || action === "delete") await regenerateSummary(deps, storeId, row.productId);
  return row;
}

export async function listReviews(deps: AppDeps, storeId: string, q: PaginationQ & { productId?: string; rating?: string; withPhoto?: string; verified?: string }) {
  const where = and(eq(reviews.storeId, storeId), q.status && q.status !== "all" ? eq(reviews.status, q.status) : sql`${reviews.status} <> 'deleted'`, q.productId ? eq(reviews.productId, q.productId) : undefined, q.rating ? eq(reviews.rating, Number(q.rating)) : undefined, q.withPhoto === "true" ? sql`jsonb_array_length(${reviews.media}) > 0` : undefined, q.verified === "true" ? eq(reviews.verified, true) : undefined);
  const [{ total }] = await deps.db.select({ total: count() }).from(reviews).where(where);
  const items = await deps.db.select().from(reviews).where(where).orderBy(desc(reviews.createdAt)).limit(q.pageSize).offset(offsetOf(q));
  const pids = [...new Set(items.map((i) => i.productId))];
  const prods = pids.length ? await deps.db.select({ id: products.id, title: products.title, handle: products.handle }).from(products).where(inArray(products.id, pids)) : [];
  return { items: items.map((i) => ({ ...i, product: prods.find((p) => p.id === i.productId) ?? null })), total: Number(total), page: q.page, pageSize: q.pageSize };
}

export async function productReviewStats(deps: AppDeps, storeId: string, productId: string) {
  const rows = await deps.db.select({ rating: reviews.rating, n: count() }).from(reviews).where(and(eq(reviews.storeId, storeId), eq(reviews.productId, productId), eq(reviews.status, "approved"))).groupBy(reviews.rating);
  const distribution = [5, 4, 3, 2, 1].map((r) => ({ rating: r, count: Number(rows.find((x) => x.rating === r)?.n ?? 0) }));
  const total = distribution.reduce((s, d) => s + d.count, 0);
  const average = total ? Math.round((distribution.reduce((s, d) => s + d.rating * d.count, 0) / total) * 10) / 10 : 0;
  const summary = await deps.db.query.productAiSummaries.findFirst({ where: eq(productAiSummaries.productId, productId) });
  return { total, average, distribution, summary: summary?.bullets ?? [] };
}

/** Extractive summary: most frequent meaningful phrases across approved reviews become bullets. */
export async function regenerateSummary(deps: AppDeps, storeId: string, productId: string) {
  const rows = await deps.db.select({ body: reviews.body, rating: reviews.rating }).from(reviews).where(and(eq(reviews.storeId, storeId), eq(reviews.productId, productId), eq(reviews.status, "approved")));
  const stop = new Set("the a an and or but of to in on for with it is are was were this that these those i my we our you your they them very really just so too also have has had be been".split(" "));
  const freq = new Map<string, number>();
  for (const r of rows) {
    const words = r.body.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter((w) => w.length > 3 && !stop.has(w));
    for (let i = 0; i < words.length - 1; i++) freq.set(`${words[i]} ${words[i + 1]}`, (freq.get(`${words[i]} ${words[i + 1]}`) ?? 0) + 1);
  }
  const top = [...freq.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([phrase, n]) => `${n} reviewers mention "${phrase}"`);
  const avg = rows.length ? rows.reduce((s, r) => s + r.rating, 0) / rows.length : 0;
  const bullets = rows.length ? [`${rows.length} approved reviews · ${avg.toFixed(1)}★ average`, ...top] : [];
  await deps.db.insert(productAiSummaries).values({ productId, storeId, bullets, sentiment: avg ? (avg - 3) / 2 : 0, generatedAt: new Date() }).onConflictDoUpdate({ target: productAiSummaries.productId, set: { bullets, sentiment: avg ? (avg - 3) / 2 : 0, generatedAt: new Date() } });
  return bullets;
}

export async function askQuestion(deps: AppDeps, storeId: string, productId: string, question: string, askedBy?: string) {
  const corpus = await deps.db.select({ body: reviews.body }).from(reviews).where(and(eq(reviews.storeId, storeId), eq(reviews.productId, productId), eq(reviews.status, "approved")));
  const terms = question.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  const best = corpus.map((r) => ({ body: r.body, hits: terms.filter((t) => r.body.toLowerCase().includes(t)).length })).filter((x) => x.hits > 0).sort((a, b) => b.hits - a.hits)[0];
  const [row] = await deps.db.insert(qaThreads).values({ storeId, productId, question, askedBy: askedBy ?? null, answer: best ? `From a verified review: “${best.body.slice(0, 220)}${best.body.length > 220 ? "…" : ""}”` : null, answeredBy: best ? "ai" : null, status: best ? "answered" : "open" }).returning();
  return row!;
}
export async function answerQuestion(deps: AppDeps, storeId: string, id: string, answer: string) {
  const [row] = await deps.db.update(qaThreads).set({ answer, answeredBy: "founder", status: "answered" }).where(and(eq(qaThreads.id, id), eq(qaThreads.storeId, storeId))).returning();
  if (!row) throw notFound("Question");
  return row;
}
export async function listQuestions(deps: AppDeps, storeId: string, productId?: string) {
  return deps.db.select().from(qaThreads).where(and(eq(qaThreads.storeId, storeId), productId ? eq(qaThreads.productId, productId) : undefined)).orderBy(desc(qaThreads.createdAt)).limit(100);
}
export async function reviewOverview(deps: AppDeps, storeId: string) {
  const [row] = await deps.db.select({ total: count(), pending: count(sql`case when ${reviews.status}='pending' then 1 end`), flagged: count(sql`case when ${reviews.fakeScore} >= 0.5 then 1 end`), avg: avg(reviews.rating) }).from(reviews).where(and(eq(reviews.storeId, storeId), sql`${reviews.status} <> 'deleted'`));
  return { total: Number(row?.total ?? 0), pending: Number(row?.pending ?? 0), flagged: Number(row?.flagged ?? 0), average: Math.round(Number(row?.avg ?? 0) * 10) / 10 };
}
