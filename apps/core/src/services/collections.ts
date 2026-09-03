import { and, eq, asc, count, ilike, or, inArray, collections, collectionProducts, products } from "@kiln/db";
import { z } from "zod";
import { slugify } from "@kiln/shared";
import type { AppDeps } from "../context.js";
import { notFound } from "../lib/errors.js";

export const CollectionInput = z.object({
  title: z.string().min(1),
  handle: z.string().optional(),
  description: z.string().optional(),
  imageUrl: z.string().nullable().optional(),
  kind: z.enum(["manual", "smart"]).optional(),
  rules: z.array(z.object({ field: z.string(), op: z.string(), value: z.string() })).optional(),
  productIds: z.array(z.string()).optional(),
  sort: z.number().int().optional(),
});

export async function createCollection(deps: AppDeps, storeId: string, input: z.infer<typeof CollectionInput>) {
  let handle = slugify(input.handle ?? input.title);
  const [dupe] = await deps.db.select({ id: collections.id }).from(collections).where(and(eq(collections.storeId, storeId), eq(collections.handle, handle)));
  if (dupe) handle = `${handle}-${Date.now().toString(36).slice(-4)}`;
  const [col] = await deps.db.insert(collections).values({ storeId, handle, title: input.title, description: input.description ?? "", imageUrl: input.imageUrl ?? null, kind: input.kind ?? "manual", rules: input.rules ?? [], sort: input.sort ?? 0 }).returning();
  if (input.productIds?.length) await setCollectionProducts(deps, storeId, col!.id, input.productIds);
  if (input.kind === "smart") await applySmartRules(deps, storeId, col!.id);
  return getCollection(deps, storeId, col!.id);
}

export async function updateCollection(deps: AppDeps, storeId: string, id: string, input: Partial<z.infer<typeof CollectionInput>>) {
  const patch: Record<string, unknown> = {};
  for (const k of ["title", "description", "imageUrl", "kind", "rules", "sort"] as const) if (input[k] !== undefined) patch[k] = input[k];
  if (input.handle) patch.handle = slugify(input.handle);
  const [col] = await deps.db.update(collections).set(patch).where(and(eq(collections.id, id), eq(collections.storeId, storeId))).returning();
  if (!col) throw notFound("Collection");
  if (input.productIds) await setCollectionProducts(deps, storeId, id, input.productIds);
  if (col.kind === "smart") await applySmartRules(deps, storeId, id);
  return getCollection(deps, storeId, id);
}

export async function setCollectionProducts(deps: AppDeps, storeId: string, collectionId: string, productIds: string[]) {
  await deps.db.delete(collectionProducts).where(eq(collectionProducts.collectionId, collectionId));
  if (productIds.length) await deps.db.insert(collectionProducts).values(productIds.map((productId, sort) => ({ collectionId, productId, sort }))).onConflictDoNothing();
  void storeId;
}

export async function addProductsToCollection(deps: AppDeps, collectionId: string, productIds: string[]) {
  if (productIds.length) await deps.db.insert(collectionProducts).values(productIds.map((productId, sort) => ({ collectionId, productId, sort: 1000 + sort }))).onConflictDoNothing();
}
export async function removeProductsFromCollection(deps: AppDeps, collectionId: string, productIds: string[]) {
  if (productIds.length) await deps.db.delete(collectionProducts).where(and(eq(collectionProducts.collectionId, collectionId), inArray(collectionProducts.productId, productIds)));
}

/** Smart collections: rules like {field:'tag', op:'eq', value:'gloves'} or {field:'title', op:'contains', value:'wrap'}. */
export async function applySmartRules(deps: AppDeps, storeId: string, collectionId: string) {
  const col = await deps.db.query.collections.findFirst({ where: eq(collections.id, collectionId) });
  if (!col || col.kind !== "smart") return;
  const all = await deps.db.select().from(products).where(and(eq(products.storeId, storeId), eq(products.status, "published")));
  const matches = all.filter((p) =>
    col.rules.every((r) => {
      const v = r.value.toLowerCase();
      if (r.field === "tag") return p.tags.some((t) => t.toLowerCase() === v);
      if (r.field === "title") return r.op === "contains" ? p.title.toLowerCase().includes(v) : p.title.toLowerCase() === v;
      if (r.field === "type") return (p.productType ?? "").toLowerCase() === v;
      if (r.field === "vendor") return (p.vendor ?? "").toLowerCase() === v;
      return true;
    }),
  );
  await setCollectionProducts(deps, storeId, collectionId, matches.map((m) => m.id));
}

export async function getCollection(deps: AppDeps, storeId: string, idOrHandle: string) {
  const col = await deps.db.query.collections.findFirst({ where: and(eq(collections.storeId, storeId), or(eq(collections.id, idOrHandle), eq(collections.handle, idOrHandle))) });
  if (!col) throw notFound("Collection");
  const links = await deps.db.select().from(collectionProducts).where(eq(collectionProducts.collectionId, col.id)).orderBy(asc(collectionProducts.sort));
  return { ...col, productIds: links.map((l) => l.productId) };
}

export async function findCollectionByTitle(deps: AppDeps, storeId: string, title: string) {
  const col = await deps.db.query.collections.findFirst({ where: and(eq(collections.storeId, storeId), ilike(collections.title, `%${title}%`)) });
  return col ? getCollection(deps, storeId, col.id) : null;
}

export async function listCollections(deps: AppDeps, storeId: string) {
  const rows = await deps.db.select().from(collections).where(eq(collections.storeId, storeId)).orderBy(asc(collections.sort), asc(collections.title));
  const counts = await deps.db.select({ collectionId: collectionProducts.collectionId, n: count() }).from(collectionProducts).where(rows.length ? inArray(collectionProducts.collectionId, rows.map((r) => r.id)) : eq(collectionProducts.collectionId, "_")).groupBy(collectionProducts.collectionId);
  const byId = new Map(counts.map((c) => [c.collectionId, Number(c.n)]));
  return rows.map((r) => ({ ...r, productCount: byId.get(r.id) ?? 0 }));
}

export async function deleteCollection(deps: AppDeps, storeId: string, id: string) {
  const r = await deps.db.delete(collections).where(and(eq(collections.id, id), eq(collections.storeId, storeId))).returning({ id: collections.id });
  if (!r.length) throw notFound("Collection");
  return { deleted: true };
}
