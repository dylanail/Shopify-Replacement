import type { Metadata } from "next";
import { loadShell, searchProducts } from "@/lib/api";
import { storeCtx } from "@/lib/request";
import { templateOf } from "@/lib/lite";
import { ProductGrid } from "@/components/product/ProductGrid";
import { SearchForm } from "@/components/layout/SearchForm";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ store: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> { const q = (await searchParams).q; return { title: q ? `Search: ${Array.isArray(q) ? q[0] : q}` : "Search", robots: { index: false } }; }

export default async function SearchPage({ params, searchParams }: Props) {
  const sp = await searchParams;
  const ctx = await storeCtx((await params).store, sp);
  const q = ((Array.isArray(sp.q) ? sp.q[0] : sp.q) ?? "").trim();
  const [shellRes, res] = await Promise.all([loadShell(ctx.key, ctx.env), q ? searchProducts(ctx.key, ctx.env, q).catch(() => null) : Promise.resolve(null)]);
  if (!shellRes.ok) return null;
  const shell = shellRes.shell;
  return (
    <div className="container-x py-10 sm:py-14">
      <p className="eyebrow text-primary mb-2">Search</p>
      <h1 className="display text-3xl mb-6">{q ? <>Results for “{q}”</> : "What are you looking for?"}</h1>
      <SearchForm initial={q} />
      {q && (
        <div className="mt-10">
          <p className="text-sm text-muted mb-6">{res ? `${res.total} ${res.total === 1 ? "result" : "results"}` : "Search is unavailable right now."}</p>
          {res && <ProductGrid products={res.items} ctx={ctx} currency={shell.region?.currency ?? "USD"} template={templateOf(shell.theme.template)} emptyText={`Nothing matched “${q}”. Try a different word, or browse the collections above.`} />}
        </div>
      )}
    </div>
  );
}
