import { eq, migrationJobs } from "@kiln/db";
import type { AppDeps } from "../context.js";
import { createProduct, type ProductInput } from "./products.js";
import { addRedirect } from "./seo.js";

/** RFC 4180-ish CSV parser (quotes, escaped quotes, newlines inside quotes). */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQ) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cell += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  const [header, ...body] = rows.filter((r) => r.some((c) => c.trim() !== ""));
  if (!header) return [];
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

type Source = "shopify" | "woocommerce" | "bigcommerce" | "magento" | "squarespace" | "csv";

const MAPS: Record<Source, Record<string, string>> = {
  shopify: { handle: "Handle", title: "Title", description: "Body (HTML)", vendor: "Vendor", type: "Type", tags: "Tags", published: "Published", option1Name: "Option1 Name", option1Value: "Option1 Value", option2Name: "Option2 Name", option2Value: "Option2 Value", option3Name: "Option3 Name", option3Value: "Option3 Value", sku: "Variant SKU", qty: "Variant Inventory Qty", price: "Variant Price", compareAt: "Variant Compare At Price", image: "Image Src", imageAlt: "Image Alt Text", variantImage: "Variant Image", weight: "Variant Grams", seoTitle: "SEO Title", seoDescription: "SEO Description" },
  woocommerce: { handle: "Slug", title: "Name", description: "Description", vendor: "", type: "Type", tags: "Tags", published: "Published", option1Name: "Attribute 1 name", option1Value: "Attribute 1 value(s)", option2Name: "Attribute 2 name", option2Value: "Attribute 2 value(s)", option3Name: "", option3Value: "", sku: "SKU", qty: "Stock", price: "Regular price", compareAt: "Sale price", image: "Images", imageAlt: "", variantImage: "", weight: "Weight (kg)", seoTitle: "", seoDescription: "Short description" },
  bigcommerce: { handle: "Product URL", title: "Product Name", description: "Product Description", vendor: "Brand Name", type: "Product Type", tags: "Search Keywords", published: "Product Visible", option1Name: "", option1Value: "", option2Name: "", option2Value: "", option3Name: "", option3Value: "", sku: "Product Code/SKU", qty: "Current Stock Level", price: "Price", compareAt: "Retail Price", image: "Product Image URL", imageAlt: "Product Image Description", variantImage: "", weight: "Product Weight", seoTitle: "Page Title", seoDescription: "Meta Description" },
  magento: { handle: "url_key", title: "name", description: "description", vendor: "manufacturer", type: "product_type", tags: "meta_keyword", published: "product_online", option1Name: "", option1Value: "", option2Name: "", option2Value: "", option3Name: "", option3Value: "", sku: "sku", qty: "qty", price: "price", compareAt: "special_price", image: "base_image", imageAlt: "base_image_label", variantImage: "", weight: "weight", seoTitle: "meta_title", seoDescription: "meta_description" },
  squarespace: { handle: "Product URL", title: "Title", description: "Description", vendor: "", type: "Product Type", tags: "Tags", published: "Visible", option1Name: "Option Name 1", option1Value: "Option Value 1", option2Name: "Option Name 2", option2Value: "Option Value 2", option3Name: "Option Name 3", option3Value: "Option Value 3", sku: "SKU", qty: "Stock", price: "Price", compareAt: "Sale Price", image: "Hosted Image URLs", imageAlt: "", variantImage: "", weight: "Weight", seoTitle: "", seoDescription: "" },
  csv: { handle: "handle", title: "title", description: "description", vendor: "vendor", type: "type", tags: "tags", published: "published", option1Name: "option1_name", option1Value: "option1_value", option2Name: "option2_name", option2Value: "option2_value", option3Name: "option3_name", option3Value: "option3_value", sku: "sku", qty: "quantity", price: "price", compareAt: "compare_at_price", image: "image", imageAlt: "image_alt", variantImage: "variant_image", weight: "weight_grams", seoTitle: "seo_title", seoDescription: "seo_description" },
};

export function detectSource(headers: string[]): Source {
  const h = new Set(headers);
  if (h.has("Handle") && h.has("Body (HTML)")) return "shopify";
  if (h.has("Regular price") || h.has("Attribute 1 name")) return "woocommerce";
  if (h.has("Product Code/SKU")) return "bigcommerce";
  if (h.has("url_key") && h.has("sku")) return "magento";
  if (h.has("Hosted Image URLs")) return "squarespace";
  return "csv";
}

const cents = (s: string) => Math.round(parseFloat(s.replace(/[^0-9.]/g, "") || "0") * 100);

/** Group rows into products (Shopify-style multi-row) and translate them to ProductInput. */
export function rowsToProducts(rows: Record<string, string>[], source: Source, oldBaseUrl?: string): { products: ProductInput[]; redirects: { from: string; to: string }[]; issues: string[] } {
  const m = MAPS[source];
  const get = (r: Record<string, string>, k: keyof typeof m) => (m[k] ? r[m[k]!] ?? "" : "");
  const groups = new Map<string, Record<string, string>[]>();
  for (const r of rows) {
    const key = get(r, "handle") || get(r, "title");
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const issues: string[] = [];
  const redirects: { from: string; to: string }[] = [];
  const products: ProductInput[] = [];
  for (const [key, rs] of groups) {
    const first = rs.find((r) => get(r, "title")) ?? rs[0]!;
    const title = get(first, "title") || key;
    const optionNames = [get(first, "option1Name"), get(first, "option2Name"), get(first, "option3Name")].filter((n) => n && n !== "Title");
    const media = [...new Set(rs.flatMap((r) => get(r, "image").split(/[,\s]+/).filter((u) => /^https?:\/\//.test(u))))].map((url, i) => ({ url, alt: get(first, "imageAlt") || title, kind: "image" as const, sort: i }));
    const variants = rs.filter((r) => get(r, "price") || get(r, "sku")).map((r) => {
      const opts: Record<string, string> = {};
      [get(r, "option1Value"), get(r, "option2Value"), get(r, "option3Value")].forEach((v, i) => { if (optionNames[i] && v) opts[optionNames[i]!] = v.split("|")[0]!.trim(); });
      const w = get(r, "weight");
      return { options: opts, sku: get(r, "sku") || undefined, priceCents: cents(get(r, "price")), compareAtCents: get(r, "compareAt") ? cents(get(r, "compareAt")) : null, inventoryQty: parseInt(get(r, "qty") || "0", 10) || 0, allowBackorder: false, imageUrl: get(r, "variantImage") || undefined, weightGrams: w ? Math.round(parseFloat(w) * (source === "woocommerce" ? 1000 : 1)) : undefined };
    });
    if (!variants.length) issues.push(`${title}: no price/SKU rows — imported as a draft with a single $0 variant`);
    const options = optionNames.map((name) => ({ name, values: [...new Set(variants.map((v) => v.options[name]).filter((x): x is string => !!x))] })).filter((o) => o.values.length);
    const published = /true|1|yes/i.test(get(first, "published") || "true");
    products.push({ title, handle: key.replace(/^\/?products?\//, ""), description: get(first, "description"), vendor: get(first, "vendor") || undefined, productType: get(first, "type") || undefined, tags: get(first, "tags").split(",").map((t) => t.trim()).filter(Boolean), status: published && variants.length ? "published" : "draft", options, variants: variants.length ? variants : undefined, priceCents: variants.length ? undefined : 0, media, seo: { title: get(first, "seoTitle") || undefined, description: get(first, "seoDescription") || undefined } });
    if (oldBaseUrl) redirects.push({ from: `/products/${key}`, to: `/products/${key}` });
    if (media.length === 0) issues.push(`${title}: no images found`);
  }
  return { products, redirects, issues };
}

export async function importCsv(deps: AppDeps, storeId: string, csv: string, opts: { source?: Source; oldBaseUrl?: string; dryRun?: boolean } = {}) {
  const rows = parseCsv(csv);
  const source = opts.source ?? detectSource(Object.keys(rows[0] ?? {}));
  const { products, redirects, issues } = rowsToProducts(rows, source, opts.oldBaseUrl);
  if (opts.dryRun) return { source, preview: products.slice(0, 10), counts: { products: products.length, variants: products.reduce((s, p) => s + (p.variants?.length ?? 1), 0), rows: rows.length }, issues };
  const [job] = await deps.db.insert(migrationJobs).values({ storeId, source, status: "running", counts: { rows: rows.length } }).returning();
  let created = 0, variants = 0;
  for (const p of products) {
    try {
      const r = await createProduct(deps, storeId, p, "migration");
      created++;
      variants += r.variants.length;
    } catch (err) {
      issues.push(`${p.title}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  for (const r of redirects) await addRedirect(deps, storeId, r.from, r.to);
  await deps.db.update(migrationJobs).set({ status: "completed", counts: { rows: rows.length, products: created, variants, redirects: redirects.length }, issues }).where(eq(migrationJobs.id, job!.id));
  return { source, jobId: job!.id, counts: { rows: rows.length, products: created, variants, redirects: redirects.length }, issues };
}

export async function listJobs(deps: AppDeps, storeId: string) {
  return deps.db.select().from(migrationJobs).where(eq(migrationJobs.storeId, storeId));
}
