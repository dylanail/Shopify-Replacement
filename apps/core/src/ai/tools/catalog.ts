import { tool } from "./define.js";
import { z } from "zod";
import type { AppDeps } from "../../context.js";
import { createProduct, updateProduct, deleteProduct, listProducts, findProductByTitle, getProduct, adjustInventory, ProductInput } from "../../services/products.js";
import { createCollection, findCollectionByTitle, listCollections, addProductsToCollection, removeProductsFromCollection, getCollection } from "../../services/collections.js";
import { generateProducts, generateDescription, detectCategory } from "../generators.js";
import { generateLanes, IMAGE_PRESETS, artUrl } from "../images.js";
import { getStore } from "../../services/stores.js";
import { recordActivity, setTodo } from "../../services/todos.js";
import { audit } from "../../services/todos.js";

const Preset = z.enum(Object.keys(IMAGE_PRESETS) as [keyof typeof IMAGE_PRESETS, ...(keyof typeof IMAGE_PRESETS)[]]);

async function resolveProduct(deps: AppDeps, storeId: string, ref: { productId?: string; title?: string; productTitle?: string }) {
  if (ref.productId) return getProduct(deps, storeId, ref.productId);
  const t = ref.title ?? ref.productTitle;
  if (t) {
    const p = await findProductByTitle(deps, storeId, t);
    if (p) return p;
  }
  throw new Error(`Could not find product ${ref.productId ?? ref.title ?? ref.productTitle ?? ""}`);
}

export const catalogTools = [
  tool({
    name: "create_product", area: "products", credits: 3,
    description: "Create a product. Generates on-brand copy and an image when generateCopy is true. Prices in cents. Up to 3 options; variants are generated from options unless given explicitly.",
    input: ProductInput.extend({ generateCopy: z.boolean().default(true), imagePreset: Preset.optional() }),
    handler: async (input, ctx) => {
      const store = await getStore(deps(ctx), ctx.storeId);
      const cat = detectCategory(store.prompt || input.title);
      const base = { title: input.title, subtitle: input.subtitle ?? "", priceCents: input.priceCents ?? 0, options: input.options ?? [], tags: input.tags ?? [], productType: input.productType ?? cat.key, imagePrompt: input.title };
      const description = input.description && input.description.length > 40 ? input.description : input.generateCopy ? generateDescription(base, store.brand, store.prompt || input.title) : input.description ?? "";
      ctx.progress(`Writing copy for ${input.title}`);
      const media = input.media?.length ? input.media : (await generateLanes(deps(ctx).env, { title: input.title, preset: input.imagePreset ?? "white_seamless", primary: store.brand.primaryColor, secondary: store.brand.secondaryColor, wordmark: store.brand.name, lanes: 1 })).map((l) => ({ url: l.url, alt: `${input.title} — ${store.brand.name}`, kind: "image" as const, sort: 0, generated: true, preset: l.preset }));
      const p = await createProduct(deps(ctx), ctx.storeId, { ...input, description, media, status: input.status ?? "published", productType: input.productType ?? base.productType }, "ai");
      await recordActivity(deps(ctx), ctx.storeId, "products", "done", `Created ${p.title}`, ctx.runId);
      await audit(deps(ctx), ctx.storeId, "ai", ctx.runId, "product.create", p.id, { title: p.title });
      await setTodo(deps(ctx), ctx.storeId, "products", "in_progress");
      return { id: p.id, handle: p.handle, title: p.title, status: p.status, variants: p.variants.map((v) => ({ id: v.id, title: v.title, priceCents: v.priceCents })), adminUrl: `/products/${p.id}` };
    },
  }),
  tool({
    name: "update_product", area: "products",
    description: "Update a product by id or title: price (applies to all variants unless variants given), copy, status, tags, options, media, SEO.",
    input: ProductInput.partial().extend({ productId: z.string().optional(), title: z.string().optional(), newTitle: z.string().optional() }),
    handler: async ({ productId, title, newTitle, ...patch }, ctx) => {
      const p = await resolveProduct(deps(ctx), ctx.storeId, { productId, title });
      const updated = await updateProduct(deps(ctx), ctx.storeId, p.id, { ...patch, ...(newTitle ? { title: newTitle } : {}) }, "ai");
      await recordActivity(deps(ctx), ctx.storeId, "products", "done", `Updated ${updated.title}`, ctx.runId);
      return { id: updated.id, title: updated.title, status: updated.status, priceCents: updated.variants[0]?.priceCents, adminUrl: `/products/${updated.id}` };
    },
  }),
  tool({
    name: "delete_product", area: "products", risky: true, description: "Permanently delete a product and its variants.",
    input: z.object({ productId: z.string().optional(), title: z.string().optional() }),
    handler: async (input, ctx) => {
      const p = await resolveProduct(deps(ctx), ctx.storeId, input);
      await deleteProduct(deps(ctx), ctx.storeId, p.id);
      await recordActivity(deps(ctx), ctx.storeId, "products", "done", `Deleted ${p.title}`, ctx.runId);
      return { deleted: p.title };
    },
  }),
  tool({
    name: "generate_products", area: "products", credits: 8,
    description: "Generate N complete, published products (copy, variants, pricing, images) in the store's category. Use for 'add three products', sample catalogs, or filling a collection.",
    input: z.object({ count: z.number().int().min(1).max(12).default(3), theme: z.string().optional(), collectionTitle: z.string().optional(), imagePreset: Preset.default("white_seamless") }),
    handler: async (input, ctx) => {
      const d = deps(ctx);
      const store = await getStore(d, ctx.storeId);
      const gen = generateProducts(input.theme ?? store.prompt ?? store.name, store.brand, input.count);
      const created = [];
      for (const g of gen) {
        ctx.progress(`Creating ${g.title}`);
        const lanes = await generateLanes(d.env, { title: g.title, brief: g.imagePrompt, preset: input.imagePreset, primary: store.brand.primaryColor, secondary: store.brand.secondaryColor, wordmark: store.brand.name, lanes: 2 });
        const p = await createProduct(d, ctx.storeId, { title: g.title, subtitle: g.subtitle, description: g.description, priceCents: g.priceCents, compareAtCents: g.compareAtCents, options: g.options, tags: g.tags, productType: g.productType, status: "published", inventoryQty: 25, media: lanes.map((l, i) => ({ url: l.url, alt: `${g.title} — ${store.brand.name}`, kind: "image" as const, sort: i, generated: true, preset: l.preset })) }, "ai");
        created.push({ id: p.id, title: p.title, handle: p.handle });
      }
      if (input.collectionTitle) {
        const col = (await findCollectionByTitle(d, ctx.storeId, input.collectionTitle)) ?? (await createCollection(d, ctx.storeId, { title: input.collectionTitle }));
        await addProductsToCollection(d, col.id, created.map((c) => c.id));
      }
      await recordActivity(d, ctx.storeId, "products", "done", `Generated ${created.length} products`, ctx.runId);
      return { created, adminUrl: "/products" };
    },
  }),
  tool({
    name: "list_products", area: "products", description: "Search/list products with variants, prices and stock.",
    input: z.object({ q: z.string().optional(), status: z.string().optional(), limit: z.number().int().max(50).default(20) }),
    handler: async (input, ctx) => {
      const r = await listProducts(deps(ctx), ctx.storeId, { page: 1, pageSize: input.limit, q: input.q, status: input.status });
      return { total: r.total, items: r.items.map((p) => ({ id: p.id, title: p.title, handle: p.handle, status: p.status, tags: p.tags, variants: p.variants.map((v) => ({ id: v.id, title: v.title, priceCents: v.priceCents, inventoryQty: v.inventoryQty })) })) };
    },
  }),
  tool({
    name: "adjust_inventory", area: "products", description: "Add or remove stock for a variant (by variant id, or product title + variant title).",
    input: z.object({ variantId: z.string().optional(), productTitle: z.string().optional(), variantTitle: z.string().optional(), delta: z.number().int(), reason: z.string().default("manual adjustment") }),
    handler: async (input, ctx) => {
      let variantId = input.variantId;
      if (!variantId) {
        const p = await resolveProduct(deps(ctx), ctx.storeId, { title: input.productTitle });
        const v = input.variantTitle ? p.variants.find((x) => x.title.toLowerCase().includes(input.variantTitle!.toLowerCase())) : p.variants[0];
        if (!v) throw new Error("Variant not found");
        variantId = v.id;
      }
      const v = await adjustInventory(deps(ctx), ctx.storeId, variantId, input.delta, input.reason, "ai");
      return { variantId: v.id, title: v.title, inventoryQty: v.inventoryQty };
    },
  }),
  tool({
    name: "enhance_image", area: "products", credits: 6,
    description: "Render 4 enhanced image lanes for a product in a preset (white_seamless, lifestyle, dark_luxury, flat_lay, golden_hour, studio_3point) and attach the best as the hero.",
    input: z.object({ productId: z.string().optional(), productTitle: z.string().optional(), preset: Preset.default("white_seamless"), brief: z.string().optional(), attach: z.boolean().default(true) }),
    handler: async (input, ctx) => {
      const d = deps(ctx);
      const store = await getStore(d, ctx.storeId);
      const p = await resolveProduct(d, ctx.storeId, input);
      ctx.progress(`Rendering 4 ${IMAGE_PRESETS[input.preset].label} lanes for ${p.title}`);
      const lanes = await generateLanes(d.env, { title: p.title, brief: input.brief, preset: input.preset, primary: store.brand.primaryColor, secondary: store.brand.secondaryColor, wordmark: store.brand.name, lanes: 4, referenceImage: p.media[0]?.url });
      if (input.attach) {
        const before = p.media[0]?.url;
        const media = [{ url: lanes[0]!.url, alt: `${p.title} — ${IMAGE_PRESETS[input.preset].label}`, kind: "image" as const, sort: 0, generated: true, preset: input.preset }, ...p.media.map((m, i) => ({ ...m, sort: i + 1 }))];
        await updateProduct(d, ctx.storeId, p.id, { media }, "ai");
        await recordActivity(d, ctx.storeId, "products", "done", `Enhanced images for ${p.title}`, ctx.runId);
        return { productId: p.id, before, after: lanes[0]!.url, lanes, contactSheet: lanes.map((l) => l.url) };
      }
      return { productId: p.id, lanes };
    },
  }),
  tool({
    name: "generate_mockup", area: "products", credits: 4, description: "Generate a lifestyle/mockup image for a product or concept without attaching it.",
    input: z.object({ subject: z.string(), preset: Preset.default("lifestyle") }),
    handler: async (input, ctx) => {
      const store = await getStore(deps(ctx), ctx.storeId);
      return { url: artUrl(deps(ctx).env, { t: input.subject, p: input.preset, c: store.brand.primaryColor, a: store.brand.secondaryColor, w: store.brand.name }) };
    },
  }),
  tool({
    name: "create_collection", area: "collections", description: "Create a collection; optionally add products matching a query (tags/titles) or explicit ids.",
    input: z.object({ title: z.string(), description: z.string().optional(), productIds: z.array(z.string()).optional(), productQuery: z.string().optional(), smartTag: z.string().optional() }),
    handler: async (input, ctx) => {
      const d = deps(ctx);
      let ids = input.productIds ?? [];
      if (input.productQuery) {
        const r = await listProducts(d, ctx.storeId, { page: 1, pageSize: 50, q: input.productQuery });
        ids = [...ids, ...r.items.map((p) => p.id)];
      }
      const col = await createCollection(d, ctx.storeId, { title: input.title, description: input.description, productIds: [...new Set(ids)], ...(input.smartTag ? { kind: "smart" as const, rules: [{ field: "tag", op: "eq", value: input.smartTag }] } : {}) });
      await recordActivity(d, ctx.storeId, "collections", "done", `Created collection ${col.title}`, ctx.runId);
      return { id: col.id, title: col.title, handle: col.handle, productCount: col.productIds.length, adminUrl: `/collections/${col.id}` };
    },
  }),
  tool({
    name: "manage_collection_products", area: "collections", description: "Add or remove products (by id or title) in a collection (by id or title).",
    input: z.object({ collectionId: z.string().optional(), collectionTitle: z.string().optional(), addProductIds: z.array(z.string()).optional(), removeProductIds: z.array(z.string()).optional(), addProductTitles: z.array(z.string()).optional(), removeProductTitles: z.array(z.string()).optional() }),
    handler: async (input, ctx) => {
      const d = deps(ctx);
      const col = input.collectionId ? await getCollection(d, ctx.storeId, input.collectionId) : input.collectionTitle ? (await findCollectionByTitle(d, ctx.storeId, input.collectionTitle)) ?? (await createCollection(d, ctx.storeId, { title: input.collectionTitle })) : null;
      if (!col) throw new Error("Collection not found");
      const byTitle = async (titles: string[] = []) => (await Promise.all(titles.map((t) => findProductByTitle(d, ctx.storeId, t)))).filter((p): p is NonNullable<typeof p> => !!p).map((p) => p.id);
      const add = [...(input.addProductIds ?? []), ...(await byTitle(input.addProductTitles))];
      const remove = [...(input.removeProductIds ?? []), ...(await byTitle(input.removeProductTitles))];
      await addProductsToCollection(d, col.id, add);
      await removeProductsFromCollection(d, col.id, remove);
      const fresh = await getCollection(d, ctx.storeId, col.id);
      await recordActivity(d, ctx.storeId, "collections", "done", `Updated ${col.title} (${fresh.productIds.length} products)`, ctx.runId);
      return { id: col.id, title: col.title, added: add.length, removed: remove.length, productCount: fresh.productIds.length };
    },
  }),
  tool({ name: "list_collections", area: "collections", description: "List collections with product counts.", input: z.object({}), handler: async (_i, ctx) => (await listCollections(deps(ctx), ctx.storeId)).map((c) => ({ id: c.id, title: c.title, handle: c.handle, productCount: c.productCount })) }),
];

function deps(ctx: { deps: AppDeps }) {
  return ctx.deps;
}
