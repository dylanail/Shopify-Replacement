import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ApiError, getCollection, loadShell } from "@/lib/api";
import { storeCtx } from "@/lib/request";
import { storePath } from "@/lib/store-path";
import { templateOf, minPrice } from "@/lib/lite";
import { ProductGrid } from "@/components/product/ProductGrid";
import { Pagination } from "@/components/ui/Pagination";
import { Img } from "@/components/ui/Img";
import { Slot } from "@/components/slots/Slot";
import { jsonLd } from "@/lib/jsonld";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ store: string; handle: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
const SORTS = [{ v: "newest", label: "Newest" }, { v: "title", label: "A – Z" }, { v: "price_asc", label: "Price: low to high" }, { v: "price_desc", label: "Price: high to low" }];
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { store, handle } = await params;
  const ctx = await storeCtx(store, await searchParams);
  try { const c = await getCollection(ctx.key, ctx.env, handle); return { title: c.collection.title, description: c.collection.description || undefined }; } catch { return {}; }
}

export default async function CollectionPage({ params, searchParams }: Props) {
  const { store, handle } = await params;
  const sp = await searchParams;
  const ctx = await storeCtx(store, sp);
  const page = Math.max(1, parseInt(one(sp.page) || "1", 10) || 1);
  const sort = SORTS.some((s) => s.v === one(sp.sort)) ? one(sp.sort) : "newest";
  const [shellRes, data] = await Promise.all([loadShell(ctx.key, ctx.env), getCollection(ctx.key, ctx.env, handle, { page, sort: sort === "title" ? "title" : undefined }).catch((e: unknown) => { if (e instanceof ApiError && e.status === 404) notFound(); throw e; })]);
  if (!shellRes.ok) return null;
  const shell = shellRes.shell;
  const template = templateOf(shell.theme.template);
  const currency = shell.region?.currency ?? "USD";
  let items = data.products.items;
  if (sort === "price_asc") items = [...items].sort((a, b) => minPrice(a) - minPrice(b));
  if (sort === "price_desc") items = [...items].sort((a, b) => minPrice(b) - minPrice(a));
  const col = data.collection;
  const hrefFor = (p: number, s = sort) => storePath(ctx, `/collections/${handle}${p > 1 || s !== "newest" ? `?${new URLSearchParams({ ...(p > 1 ? { page: String(p) } : {}), ...(s !== "newest" ? { sort: s } : {}) })}` : ""}`);
  const ld = { "@context": "https://schema.org", "@type": "CollectionPage", name: col.title, description: col.description, url: `${shell.url}/collections/${handle}`, mainEntity: { "@type": "ItemList", itemListElement: items.map((p, i) => ({ "@type": "ListItem", position: i + 1, url: `${shell.url}/products/${p.handle}`, name: p.title })) } };
  return (
    <div className="container-x py-8 sm:py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(ld) }} />
      <nav aria-label="Breadcrumb" className="text-xs text-muted mb-4"><Link href={storePath(ctx, "/")} className="hover:underline">Home</Link> <span aria-hidden>/</span> <span aria-current="page" className="text-ink">{col.title}</span></nav>
      <header className={`mb-8 ${col.imageUrl ? "grid md:grid-cols-2 gap-8 items-center" : template === "atelier" ? "text-center max-w-2xl mx-auto" : ""}`}>
        <div>
          <p className="eyebrow text-primary mb-2">{data.products.total} {data.products.total === 1 ? "piece" : "pieces"}</p>
          <h1 className="display text-4xl sm:text-5xl">{col.title}</h1>
          {col.description && <p className="text-muted mt-4 max-w-xl">{col.description}</p>}
        </div>
        {col.imageUrl && <Img src={col.imageUrl} alt="" width={1200} height={800} eager className="w-full aspect-[3/2] object-cover" />}
      </header>
      <Slot name="collectionTop" ctx={{ collection: col, page: "collection" }} className="mb-8" />
      <div className={`filter-bar flex flex-wrap items-center justify-between gap-3 py-3 border-y border-rule mb-8 ${template === "bazaar" ? "" : ""}`}>
        <div className="flex flex-wrap gap-2 text-xs" aria-label="Collections">
          <Link href={storePath(ctx, "/collections/all")} className="pill min-h-8" aria-pressed={handle === "all"}>All</Link>
          {shell.collections.filter((c) => c.productCount > 0 && c.handle !== "all").slice(0, 8).map((c) => <Link key={c.id} href={storePath(ctx, `/collections/${c.handle}`)} className="pill min-h-8" aria-pressed={c.handle === handle}>{c.title}</Link>)}
        </div>
        <form method="get" action={storePath(ctx, `/collections/${handle}`).split("?")[0]} className="flex items-center gap-2 text-xs">
          {ctx.env === "draft" && <input type="hidden" name="env" value="draft" />}
          <label htmlFor="sort" className="eyebrow text-[10px]">Sort</label>
          <select id="sort" name="sort" defaultValue={sort} className="field min-h-9 w-auto text-xs py-1">{SORTS.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}</select>
          <button type="submit" className="btn btn-outline min-h-9 px-3 text-xs">Apply</button>
        </form>
      </div>
      <ProductGrid products={items} ctx={ctx} currency={currency} template={template} emptyText="Nothing in this collection yet — check back soon." />
      <Pagination page={data.products.page} pageSize={data.products.pageSize} total={data.products.total} hrefFor={(p) => hrefFor(p)} />
    </div>
  );
}
