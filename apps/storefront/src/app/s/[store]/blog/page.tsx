import type { Metadata } from "next";
import { getArticles, loadShell } from "@/lib/api";
import { storeCtx } from "@/lib/request";
import { ArticleCard } from "@/components/blog/ArticleCard";
import { PUBLIC_CORE_URL, publicApiBase } from "@/lib/config";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Journal" };
type Props = { params: Promise<{ store: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function BlogPage({ params, searchParams }: Props) {
  const ctx = await storeCtx((await params).store, await searchParams);
  const [shellRes, res] = await Promise.all([loadShell(ctx.key, ctx.env), getArticles(ctx.key, ctx.env).catch(() => ({ items: [] }))]);
  if (!shellRes.ok) return null;
  const items = res.items.filter((a) => a.status === "published");
  const [first, ...rest] = items;
  return (
    <div className="container-x py-10 sm:py-14">
      <link rel="alternate" type="application/rss+xml" title={`${shellRes.shell.brand.name} journal`} href={`${publicApiBase(PUBLIC_CORE_URL, ctx.key)}/blog/rss.xml`} />
      <header className="mb-10 flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow text-primary mb-2">Journal</p><h1 className="display text-4xl">Notes from the workshop</h1></div><a href={`${publicApiBase(PUBLIC_CORE_URL, ctx.key)}/blog/rss.xml`} className="text-xs eyebrow hover:text-primary">RSS →</a></header>
      {!items.length ? <p className="text-muted py-16 text-center">No stories yet. The first one is being written.</p> : (
        <div className="space-y-14">
          {first && <ArticleCard a={first} ctx={ctx} featured />}
          {rest.length > 0 && <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8 border-t border-rule pt-10">{rest.map((a) => <ArticleCard key={a.id} a={a} ctx={ctx} />)}</div>}
        </div>
      )}
    </div>
  );
}
