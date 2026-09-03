import { and, eq, desc, count, blogs, articles } from "@kiln/db";
import { z } from "zod";
import { slugify } from "@kiln/shared";
import type { AppDeps } from "../context.js";
import { notFound } from "../lib/errors.js";

export const ArticleInput = z.object({ blogId: z.string().optional(), title: z.string().min(1), handle: z.string().optional(), body: z.string().optional(), excerpt: z.string().optional(), featuredImage: z.string().nullable().optional(), tags: z.array(z.string()).optional(), status: z.enum(["draft", "scheduled", "published"]).optional(), publishedAt: z.coerce.date().nullable().optional() });

export async function listBlogs(deps: AppDeps, storeId: string) {
  const rows = await deps.db.select().from(blogs).where(eq(blogs.storeId, storeId));
  const counts = await deps.db.select({ blogId: articles.blogId, n: count() }).from(articles).where(eq(articles.storeId, storeId)).groupBy(articles.blogId);
  return rows.map((b) => ({ ...b, articleCount: Number(counts.find((c) => c.blogId === b.id)?.n ?? 0) }));
}
export async function createBlog(deps: AppDeps, storeId: string, title: string) {
  const [row] = await deps.db.insert(blogs).values({ storeId, handle: slugify(title), title }).returning();
  return row!;
}
export async function ensureDefaultBlog(deps: AppDeps, storeId: string) {
  const [b] = await deps.db.select().from(blogs).where(eq(blogs.storeId, storeId)).limit(1);
  return b ?? createBlog(deps, storeId, "Journal");
}
export async function createArticle(deps: AppDeps, storeId: string, input: z.infer<typeof ArticleInput>) {
  const blogId = input.blogId ?? (await ensureDefaultBlog(deps, storeId)).id;
  const body = input.body ?? `<p>${input.title}</p>`;
  const [row] = await deps.db.insert(articles).values({ blogId, storeId, handle: `${slugify(input.handle ?? input.title)}-${Date.now().toString(36).slice(-3)}`, title: input.title, body, excerpt: input.excerpt ?? body.replace(/<[^>]+>/g, "").slice(0, 160), featuredImage: input.featuredImage ?? null, tags: input.tags ?? [], status: input.status ?? "draft", publishedAt: input.status === "published" ? input.publishedAt ?? new Date() : input.publishedAt ?? null, seo: { title: input.title, description: (input.excerpt ?? body.replace(/<[^>]+>/g, "")).slice(0, 155) } }).returning();
  return row!;
}
export async function updateArticle(deps: AppDeps, storeId: string, id: string, input: Partial<z.infer<typeof ArticleInput>>) {
  const [row] = await deps.db.update(articles).set({ ...input, ...(input.status === "published" ? { publishedAt: input.publishedAt ?? new Date() } : {}) }).where(and(eq(articles.id, id), eq(articles.storeId, storeId))).returning();
  if (!row) throw notFound("Article");
  return row;
}
export async function listArticles(deps: AppDeps, storeId: string, opts: { blogId?: string; publishedOnly?: boolean } = {}) {
  return deps.db.select().from(articles).where(and(eq(articles.storeId, storeId), opts.blogId ? eq(articles.blogId, opts.blogId) : undefined, opts.publishedOnly ? eq(articles.status, "published") : undefined)).orderBy(desc(articles.publishedAt), desc(articles.createdAt));
}
export async function getArticle(deps: AppDeps, storeId: string, handle: string) {
  const a = await deps.db.query.articles.findFirst({ where: and(eq(articles.storeId, storeId), eq(articles.handle, handle)) });
  if (!a) throw notFound("Article");
  return a;
}
export async function deleteArticle(deps: AppDeps, storeId: string, id: string) {
  await deps.db.delete(articles).where(and(eq(articles.id, id), eq(articles.storeId, storeId)));
  return { deleted: true };
}
export function rss(store: { name: string }, baseUrl: string, items: { title: string; handle: string; excerpt: string; publishedAt: Date | null }[]) {
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>${store.name}</title><link>${baseUrl}/blog</link>${items.map((a) => `<item><title><![CDATA[${a.title}]]></title><link>${baseUrl}/blog/${a.handle}</link><description><![CDATA[${a.excerpt}]]></description><pubDate>${(a.publishedAt ?? new Date()).toUTCString()}</pubDate></item>`).join("")}</channel></rss>`;
}
