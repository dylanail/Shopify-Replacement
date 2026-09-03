import { and, eq, desc, asc, ilike, or, count, inArray, products, productVariants, inventoryAdjustments, collectionProducts, sql } from "@kiln/db";
import { z } from "zod";
import { MediaItem, ProductOption, Seo, SubscriptionConfig, slugify } from "@kiln/shared";
import type { AppDeps } from "../context.js";
import { notFound, badRequest } from "../lib/errors.js";
import type { PaginationQ } from "../lib/http.js";
import { offsetOf } from "../lib/http.js";
import { buildProductSeo } from "./seo.js";

export const VariantInput = z.object({
  id: z.string().optional(),
  title: z.string().optional(),
  sku: z.string().optional(),
  options: z.record(z.string(), z.string()).default({}),
  priceCents: z.number().int().nonnegative(),
  compareAtCents: z.number().int().nonnegative().nullable().optional(),
  inventoryQty: z.number().int().default(0),
  allowBackorder: z.boolean().default(false),
  imageUrl: z.string().nullable().optional(),
  weightGrams: z.number().int().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const ProductInput = z.object({
  title: z.string().min(1),
  handle: z.string().optional(),
  subtitle: z.string().optional(),
  description: z.string().optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
  options: z.array(ProductOption).max(3).optional(),
  variants: z.array(VariantInput).optional(),
  /** Convenience for single-variant products or generating variants from options. */
  priceCents: z.number().int().nonnegative().optional(),
  compareAtCents: z.number().int().nonnegative().optional(),
  inventoryQty: z.number().int().optional(),
  media: z.array(MediaItem).optional(),
  tags: z.array(z.string()).optional(),
  vendor: z.string().optional(),
  productType: z.string().optional(),
  seo: Seo.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  subscription: SubscriptionConfig.optional(),
  digital: z.object({ enabled: z.boolean(), files: z.array(z.object({ name: z.string(), url: z.string() })) }).optional(),
  weightGrams: z.number().int().optional(),
  collectionIds: z.array(z.string()).optional(),
});
export type ProductInput = z.infer<typeof ProductInput>;

function cartesian(options: { name: string; values: string[] }[]): Record<string, string>[] {
  if (options.length === 0) return [{}];
  return options.reduce<Record<string, string>[]>((acc, opt) => acc.flatMap((combo) => opt.values.map((v) => ({ ...combo, [opt.name]: v }))), [{}]);
}

const variantTitle = (opts: Record<string, string>) => Object.values(opts).join(" / ") || "Default";

async function uniqueHandle(deps: AppDeps, storeId: string, base: string, excludeId?: string) {
  let handle = slugify(base);
  for (let i = 2; i < 1000; i++) {
    const [existing] = await deps.db.select({ id: products.id }).from(products).where(and(eq(products.storeId, storeId), eq(products.handle, handle)));
    if (!existing || existing.id === excludeId) return handle;
    handle = `${slugify(base)}-${i}`;
  }
  throw badRequest("Could not allocate a unique handle");
}

export async function createProduct(deps: AppDeps, storeId: string, input: ProductInput, actor = "user") {
  const { db } = deps;
  const handle = await uniqueHandle(deps, storeId, input.handle ?? input.title);
  const options = input.options ?? [];
  const seo = { ...buildProductSeo({ title: input.title, description: input.description ?? "", media: input.media ?? [] }), ...(input.seo ?? {}) };
  const [product] = await db
    .insert(products)
    .values({
      storeId, handle, title: input.title, subtitle: input.subtitle ?? "", description: input.description ?? "", status: input.status ?? "draft", options,
      media: (input.media ?? []).map((m, i) => ({ ...m, sort: m.sort ?? i })), tags: input.tags ?? [], vendor: input.vendor, productType: input.productType, seo, metadata: input.metadata ?? {},
      subscription: input.subscription ?? null, digital: input.digital ?? null, weightGrams: input.weightGrams ?? 0,
    })
    .returning();
  const variantsIn = input.variants?.length
    ? input.variants
    : cartesian(options).map((opts, i) => ({ options: opts, priceCents: input.priceCents ?? 0, compareAtCents: input.compareAtCents ?? null, inventoryQty: input.inventoryQty ?? 25, allowBackorder: false, sku: undefined, title: undefined, imageUrl: undefined, weightGrams: undefined, metadata: undefined, id: undefined, ...(i === 0 ? {} : {}) }));
  const variants = await db
    .insert(productVariants)
    .values(
      variantsIn.map((v, i) => ({
        productId: product!.id, storeId, title: v.title ?? variantTitle(v.options), sku: v.sku ?? `${handle.toUpperCase().replace(/-/g, "").slice(0, 8)}-${i + 1}`, options: v.options, priceCents: v.priceCents,
        compareAtCents: v.compareAtCents ?? null, inventoryQty: v.inventoryQty ?? 0, allowBackorder: v.allowBackorder ?? false, imageUrl: v.imageUrl ?? product!.media[0]?.url ?? null, weightGrams: v.weightGrams, metadata: v.metadata ?? {}, sort: i,
      })),
    )
    .returning();
  if (input.collectionIds?.length) await db.insert(collectionProducts).values(input.collectionIds.map((collectionId) => ({ collectionId, productId: product!.id }))).onConflictDoNothing();
  await db.insert(inventoryAdjustments).values(variants.filter((v) => v.inventoryQty).map((v) => ({ storeId, variantId: v.id, delta: v.inventoryQty, reason: "initial", actor })));
  return { ...product!, variants };
}

export async function updateProduct(deps: AppDeps, storeId: string, productId: string, input: Partial<ProductInput>, actor = "user") {
  const { db } = deps;
  const existing = await db.query.products.findFirst({ where: and(eq(products.id, productId), eq(products.storeId, storeId)) });
  if (!existing) throw notFound("Product");
  const patch: Record<string, unknown> = {};
  for (const k of ["title", "subtitle", "description", "status", "options", "tags", "vendor", "productType", "metadata", "subscription", "digital", "weightGrams"] as const) if (input[k] !== undefined) patch[k] = input[k];
  if (input.media) patch.media = input.media.map((m, i) => ({ ...m, sort: i }));
  if (input.handle) patch.handle = await uniqueHandle(deps, storeId, input.handle, productId);
  if (input.seo) patch.seo = { ...existing.seo, ...input.seo };
  if (input.title || input.description) patch.seo = { ...buildProductSeo({ title: input.title ?? existing.title, description: input.description ?? existing.description, media: (input.media ?? existing.media) as never }), ...existing.seo, ...(input.seo ?? {}) };
  const [product] = await db.update(products).set(patch).where(eq(products.id, productId)).returning();
  if (input.variants) {
    const keep = new Set<string>();
    for (const [i, v] of input.variants.entries()) {
      if (v.id) {
        keep.add(v.id);
        await db.update(productVariants).set({ title: v.title ?? variantTitle(v.options), sku: v.sku, options: v.options, priceCents: v.priceCents, compareAtCents: v.compareAtCents ?? null, inventoryQty: v.inventoryQty, allowBackorder: v.allowBackorder, imageUrl: v.imageUrl ?? undefined, weightGrams: v.weightGrams, metadata: v.metadata ?? {}, sort: i }).where(and(eq(productVariants.id, v.id), eq(productVariants.productId, productId)));
      } else {
        const [nv] = await db.insert(productVariants).values({ productId, storeId, title: v.title ?? variantTitle(v.options), sku: v.sku, options: v.options, priceCents: v.priceCents, compareAtCents: v.compareAtCents ?? null, inventoryQty: v.inventoryQty, allowBackorder: v.allowBackorder, imageUrl: v.imageUrl ?? null, weightGrams: v.weightGrams, metadata: v.metadata ?? {}, sort: i }).returning();
        keep.add(nv!.id);
      }
    }
    const all = await db.select({ id: productVariants.id }).from(productVariants).where(eq(productVariants.productId, productId));
    const drop = all.map((a) => a.id).filter((id) => !keep.has(id));
    if (drop.length) await db.delete(productVariants).where(inArray(productVariants.id, drop));
  } else if (input.priceCents !== undefined) {
    await db.update(productVariants).set({ priceCents: input.priceCents, ...(input.compareAtCents !== undefined ? { compareAtCents: input.compareAtCents } : {}) }).where(eq(productVariants.productId, productId));
  }
  if (input.collectionIds) {
    await db.delete(collectionProducts).where(eq(collectionProducts.productId, productId));
    if (input.collectionIds.length) await db.insert(collectionProducts).values(input.collectionIds.map((collectionId) => ({ collectionId, productId }))).onConflictDoNothing();
  }
  void actor;
  return getProduct(deps, storeId, product!.id);
}

export async function getProduct(deps: AppDeps, storeId: string, productIdOrHandle: string) {
  const p = await deps.db.query.products.findFirst({ where: and(eq(products.storeId, storeId), or(eq(products.id, productIdOrHandle), eq(products.handle, productIdOrHandle))) });
  if (!p) throw notFound("Product");
  const variants = await deps.db.select().from(productVariants).where(eq(productVariants.productId, p.id)).orderBy(asc(productVariants.sort));
  const cols = await deps.db.select({ collectionId: collectionProducts.collectionId }).from(collectionProducts).where(eq(collectionProducts.productId, p.id));
  return { ...p, variants, collectionIds: cols.map((c) => c.collectionId) };
}

export async function findProductByTitle(deps: AppDeps, storeId: string, title: string) {
  const p = await deps.db.query.products.findFirst({ where: and(eq(products.storeId, storeId), ilike(products.title, `%${title}%`)) });
  return p ? getProduct(deps, storeId, p.id) : null;
}

export async function listProducts(deps: AppDeps, storeId: string, q: PaginationQ & { collectionId?: string; ids?: string[] }) {
  const where = and(
    eq(products.storeId, storeId),
    q.status && q.status !== "all" ? eq(products.status, q.status) : undefined,
    q.q ? or(ilike(products.title, `%${q.q}%`), ilike(products.description, `%${q.q}%`), ilike(products.handle, `%${q.q}%`)) : undefined,
    q.ids?.length ? inArray(products.id, q.ids) : undefined,
    q.collectionId ? inArray(products.id, deps.db.select({ id: collectionProducts.productId }).from(collectionProducts).where(eq(collectionProducts.collectionId, q.collectionId))) : undefined,
  );
  const [{ total }] = await deps.db.select({ total: count() }).from(products).where(where);
  const rows = await deps.db.select().from(products).where(where).orderBy(q.sort === "title" ? asc(products.title) : desc(products.createdAt)).limit(q.pageSize).offset(offsetOf(q));
  const ids = rows.map((r) => r.id);
  const variants = ids.length ? await deps.db.select().from(productVariants).where(inArray(productVariants.productId, ids)).orderBy(asc(productVariants.sort)) : [];
  const byProduct = new Map<string, typeof variants>();
  for (const v of variants) byProduct.set(v.productId, [...(byProduct.get(v.productId) ?? []), v]);
  return { items: rows.map((r) => ({ ...r, variants: byProduct.get(r.id) ?? [] })), total: Number(total), page: q.page, pageSize: q.pageSize };
}

export async function deleteProduct(deps: AppDeps, storeId: string, productId: string) {
  const r = await deps.db.delete(products).where(and(eq(products.id, productId), eq(products.storeId, storeId))).returning({ id: products.id });
  if (!r.length) throw notFound("Product");
  return { deleted: true };
}

export async function adjustInventory(deps: AppDeps, storeId: string, variantId: string, delta: number, reason: string, actor = "user") {
  const [v] = await deps.db.update(productVariants).set({ inventoryQty: sql`${productVariants.inventoryQty} + ${delta}` }).where(and(eq(productVariants.id, variantId), eq(productVariants.storeId, storeId))).returning();
  if (!v) throw notFound("Variant");
  await deps.db.insert(inventoryAdjustments).values({ storeId, variantId, delta, reason, actor });
  return v;
}

export async function lowStock(deps: AppDeps, storeId: string) {
  return deps.db.select().from(productVariants).where(and(eq(productVariants.storeId, storeId), sql`${productVariants.inventoryQty} <= ${productVariants.reorderPoint}`)).limit(50);
}

export async function productStats(deps: AppDeps, storeId: string) {
  const [row] = await deps.db.select({ total: count(), published: count(sql`case when ${products.status} = 'published' then 1 end`), drafts: count(sql`case when ${products.status} = 'draft' then 1 end`) }).from(products).where(eq(products.storeId, storeId));
  const [oos] = await deps.db.select({ n: count() }).from(productVariants).where(and(eq(productVariants.storeId, storeId), eq(productVariants.inventoryQty, 0), eq(productVariants.allowBackorder, false)));
  return { total: Number(row?.total ?? 0), published: Number(row?.published ?? 0), drafts: Number(row?.drafts ?? 0), outOfStock: Number(oos?.n ?? 0) };
}
