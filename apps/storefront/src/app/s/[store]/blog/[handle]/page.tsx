import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ApiError, getArticle, loadShell } from "@/lib/api";
import { storeCtx } from "@/lib/request";
import { storePath } from "@/lib/store-path";
import { formatDate, stripHtml } from "@/lib/format";
import { Img } from "@/components/ui/Img";
import { jsonLd } from "@/lib/jsonld";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ store: string; handle: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { store, handle } = await params;
  const ctx = await storeCtx(store, await searchParams);
  try { const a = await getArticle(ctx.key, ctx.env, handle); return { title: a.seo.title || a.title, description: a.seo.description || a.excerpt || stripHtml(a.body).slice(0, 160), openGraph: { type: "article", title: a.title, images: a.featuredImage ? [a.featuredImage] : undefined, publishedTime: a.publishedAt ?? undefined } }; } catch { return {}; }
}

export default async function ArticlePage({ params, searchParams }: Props) {
  const { store, handle } = await params;
  const ctx = await storeCtx(store, await searchParams);
  const [shellRes, a] = await Promise.all([loadShell(ctx.key, ctx.env), getArticle(ctx.key, ctx.env, handle).catch((e: unknown) => { if (e instanceof ApiError && e.status === 404) notFound(); throw e; })]);
  if (!shellRes.ok) return null;
  const shell = shellRes.shell;
  const ld = a.seo.jsonLd && Object.keys(a.seo.jsonLd).length ? a.seo.jsonLd : { "@context": "https://schema.org", "@type": "Article", headline: a.title, description: a.excerpt || stripHtml(a.body).slice(0, 200), image: a.featuredImage ?? undefined, datePublished: a.publishedAt ?? undefined, author: { "@type": "Organization", name: shell.brand.name }, publisher: { "@type": "Organization", name: shell.brand.name, logo: shell.brand.logoUrl ? { "@type": "ImageObject", url: shell.brand.logoUrl } : undefined }, mainEntityOfPage: `${shell.url}/blog/${a.handle}` };
  return (
    <article className="container-x py-10 sm:py-14">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(ld) }} />
      <div className="max-w-3xl mx-auto">
        <nav aria-label="Breadcrumb" className="text-xs text-muted mb-6"><Link href={storePath(ctx, "/blog")} className="hover:underline">Journal</Link> <span aria-hidden>/</span> <span className="text-ink">{a.title}</span></nav>
        <p className="eyebrow text-primary mb-3">{formatDate(a.publishedAt)}{a.tags.length ? ` · ${a.tags.join(" · ")}` : ""}</p>
        <h1 className="display text-4xl sm:text-5xl mb-6">{a.title}</h1>
        {a.excerpt && <p className="text-lg text-muted font-display italic mb-8">{a.excerpt}</p>}
        {a.featuredImage && <Img src={a.featuredImage} alt="" width={1400} height={900} eager className="w-full aspect-[3/2] object-cover mb-10" />}
        <div className="prose text-[16px]" dangerouslySetInnerHTML={{ __html: a.body }} />
        <footer className="mt-12 pt-6 border-t border-rule flex flex-wrap items-center justify-between gap-4 text-sm">
          <Link href={storePath(ctx, "/blog")} className="underline underline-offset-4">← All stories</Link>
          <Link href={storePath(ctx, "/collections/all")} className="btn btn-outline">Shop the collection</Link>
        </footer>
      </div>
    </article>
  );
}
