import { Hono } from "hono";
import { z } from "zod";
import type { AppDeps } from "../context.js";
import { parseBody, parseQuery, Pagination } from "../lib/http.js";
import { requireUser, requireStore, type AuthVars } from "../lib/auth.js";
import { createProduct, updateProduct, deleteProduct, getProduct, listProducts, adjustInventory, lowStock, productStats, ProductInput } from "../services/products.js";
import { createCollection, updateCollection, deleteCollection, getCollection, listCollections, CollectionInput } from "../services/collections.js";
import { importCsv, listJobs } from "../services/migration.js";
import { generateLanes, IMAGE_PRESETS } from "../ai/images.js";
import { getStore } from "../services/stores.js";

export function catalogRoutes(deps: AppDeps) {
  const r = new Hono<{ Variables: AuthVars }>();
  r.use("*", requireUser(deps), requireStore(deps));

  r.get("/products", async (c) => c.json(await listProducts(deps, c.get("storeId"), parseQuery(c, Pagination.extend({ collectionId: z.string().optional() })))));
  r.get("/products/stats", async (c) => c.json({ ...(await productStats(deps, c.get("storeId"))), lowStock: await lowStock(deps, c.get("storeId")) }));
  r.post("/products", async (c) => c.json(await createProduct(deps, c.get("storeId"), await parseBody(c, ProductInput), c.get("userId")), 201));
  r.get("/products/:id", async (c) => c.json(await getProduct(deps, c.get("storeId"), c.req.param("id"))));
  r.patch("/products/:id", async (c) => c.json(await updateProduct(deps, c.get("storeId"), c.req.param("id"), await parseBody(c, ProductInput.partial()), c.get("userId"))));
  r.delete("/products/:id", async (c) => c.json(await deleteProduct(deps, c.get("storeId"), c.req.param("id"))));
  r.post("/products/:id/inventory", async (c) => {
    const b = await parseBody(c, z.object({ variantId: z.string(), delta: z.number().int(), reason: z.string().default("manual") }));
    return c.json(await adjustInventory(deps, c.get("storeId"), b.variantId, b.delta, b.reason, c.get("userId")));
  });
  r.post("/products/:id/images", async (c) => {
    const b = await parseBody(c, z.object({ preset: z.enum(Object.keys(IMAGE_PRESETS) as [string, ...string[]]).default("white_seamless"), brief: z.string().optional(), attach: z.boolean().default(false) }));
    const store = await getStore(deps, c.get("storeId"));
    const p = await getProduct(deps, c.get("storeId"), c.req.param("id"));
    const lanes = await generateLanes(deps.env, { title: p.title, brief: b.brief, preset: b.preset as keyof typeof IMAGE_PRESETS, primary: store.brand.primaryColor, secondary: store.brand.secondaryColor, wordmark: store.brand.name });
    if (b.attach) await updateProduct(deps, c.get("storeId"), p.id, { media: [{ url: lanes[0]!.url, alt: p.title, kind: "image", sort: 0, generated: true, preset: b.preset }, ...p.media.map((m, i) => ({ ...m, sort: i + 1 }))] });
    return c.json({ lanes, presets: Object.entries(IMAGE_PRESETS).map(([id, p]) => ({ id, label: p.label })) });
  });

  r.get("/collections", async (c) => c.json({ items: await listCollections(deps, c.get("storeId")) }));
  r.post("/collections", async (c) => c.json(await createCollection(deps, c.get("storeId"), await parseBody(c, CollectionInput)), 201));
  r.get("/collections/:id", async (c) => c.json(await getCollection(deps, c.get("storeId"), c.req.param("id"))));
  r.patch("/collections/:id", async (c) => c.json(await updateCollection(deps, c.get("storeId"), c.req.param("id"), await parseBody(c, CollectionInput.partial()))));
  r.delete("/collections/:id", async (c) => c.json(await deleteCollection(deps, c.get("storeId"), c.req.param("id"))));

  r.post("/import", async (c) => {
    const b = await parseBody(c, z.object({ csv: z.string().min(1), source: z.enum(["shopify", "woocommerce", "bigcommerce", "magento", "squarespace", "csv"]).optional(), dryRun: z.boolean().default(false), oldBaseUrl: z.string().optional() }));
    return c.json(await importCsv(deps, c.get("storeId"), b.csv, b));
  });
  r.get("/import/jobs", async (c) => c.json({ items: await listJobs(deps, c.get("storeId")) }));
  return r;
}
