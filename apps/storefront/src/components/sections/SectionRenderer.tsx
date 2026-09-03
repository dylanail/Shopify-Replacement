import Link from "next/link";
import type { ThemeSection } from "@kiln/shared";
import type { Shell, Product, Review, TemplateId } from "@/lib/types";
import type { StoreCtx } from "@/lib/store-path";
import { storePath } from "@/lib/store-path";
import { getProducts, getReviews, getCollection } from "@/lib/api";
import { ProductGrid } from "@/components/product/ProductGrid";
import { Img } from "@/components/ui/Img";
import { Stars } from "@/components/ui/Stars";
import { AccordionItem } from "@/components/ui/Accordion";
import { NewsletterForm } from "./NewsletterForm";
import { Slot } from "@/components/slots/Slot";
import { templateOf } from "@/lib/lite";

const s = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);
const n = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => (typeof x === "string" ? x : typeof x === "object" && x && "text" in x ? String((x as { text: unknown }).text) : "")).filter(Boolean) : []);

/** Renders theme.sections in order. Every one of the 10 section types has a real implementation; hidden sections are skipped. */
export async function SectionRenderer({ shell, ctx, sections }: { shell: Shell; ctx: StoreCtx; sections: ThemeSection[] }) {
  const template = templateOf(shell.theme.template);
  const currency = shell.region?.currency ?? "USD";
  const visible = sections.filter((x) => !x.hidden);
  return (
    <>
      {visible.map((sec, i) => (
        <SectionSwitch key={sec.id ?? i} sec={sec} shell={shell} ctx={ctx} template={template} currency={currency} first={i === 0} />
      ))}
    </>
  );
}

async function SectionSwitch({ sec, shell, ctx, template, currency, first }: { sec: ThemeSection; shell: Shell; ctx: StoreCtx; template: TemplateId; currency: string; first: boolean }) {
  const st = sec.settings ?? {};
  switch (sec.type) {
    case "hero": return <Hero st={st} shell={shell} ctx={ctx} template={template} first={first} />;
    case "featured-products": return <FeaturedProducts st={st} shell={shell} ctx={ctx} template={template} currency={currency} />;
    case "collection-grid": return <CollectionGrid st={st} shell={shell} ctx={ctx} template={template} />;
    case "rich-text": return <RichText st={st} />;
    case "image-with-text": return <ImageWithText st={st} shell={shell} ctx={ctx} />;
    case "testimonials": return <Testimonials st={st} shell={shell} ctx={ctx} />;
    case "newsletter": return <Newsletter st={st} />;
    case "trust-strip": return <TrustStrip st={st} template={template} />;
    case "faq": return <Faq st={st} />;
    case "custom-html": return <CustomHtml st={st} />;
    default: return null;
  }
}

function Hero({ st, shell, ctx, template, first }: { st: Record<string, unknown>; shell: Shell; ctx: StoreCtx; template: TemplateId; first: boolean }) {
  const headline = s(st.headline, shell.brand.slogan || shell.brand.name);
  const sub = s(st.subheadline, shell.brand.description);
  const img = s(st.imageUrl, shell.brand.heroImageUrl ?? "");
  const cta = s(st.ctaLabel, "Shop the collection");
  const href = s(st.ctaHref, "/collections/all");
  const layout = s(st.layout, template === "studio" ? "full" : template === "bazaar" ? "banner" : "split");
  const link = href.startsWith("http") ? href : storePath(ctx, href);
  if (layout === "full" && img) {
    return (
      <section className="relative overflow-hidden" aria-label="Hero">
        <Img src={img} alt={s(st.imageAlt, headline)} width={1600} height={900} eager className="w-full h-[70vh] min-h-[420px] object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent" aria-hidden />
        <div className="absolute inset-x-0 bottom-0 container-x pb-12 text-white">
          <p className="eyebrow mb-3 opacity-90">{shell.brand.name}</p>
          <h1 className="display text-4xl sm:text-6xl max-w-3xl">{headline}</h1>
          {sub && <p className="mt-4 max-w-xl text-sm sm:text-base opacity-90">{sub}</p>}
          <Link href={link} className="btn mt-6 bg-white text-black border-white">{cta}</Link>
        </div>
      </section>
    );
  }
  if (layout === "banner") {
    return (
      <section className="container-x pt-6" aria-label="Hero">
        <div className="relative overflow-hidden card" style={{ background: "color-mix(in srgb, var(--brand-primary) 8%, var(--brand-bg))" }}>
          <div className="grid md:grid-cols-2 items-center">
            <div className="p-8 sm:p-12">
              <p className="eyebrow text-primary mb-3">{shell.brand.slogan && headline !== shell.brand.slogan ? shell.brand.slogan : shell.brand.name}</p>
              <h1 className="display text-3xl sm:text-5xl">{headline}</h1>
              {sub && <p className="mt-4 text-muted max-w-md">{sub}</p>}
              <div className="mt-6 flex gap-3"><Link href={link} className="btn btn-primary">{cta}</Link><Link href={storePath(ctx, "/collections/all")} className="btn btn-outline">Browse all</Link></div>
            </div>
            {img && <Img src={img} alt={s(st.imageAlt, headline)} width={1200} height={900} eager className="w-full h-full max-h-[420px] object-cover" />}
          </div>
        </div>
      </section>
    );
  }
  return (
    <section className={`container-x ${first ? "pt-10 sm:pt-16" : "pt-16"} pb-8`} aria-label="Hero">
      <div className="grid lg:grid-cols-12 gap-8 lg:gap-12 items-center">
        <div className="lg:col-span-5 order-2 lg:order-1">
          <p className="eyebrow text-primary mb-4">◆ {shell.brand.slogan && shell.brand.slogan !== headline ? shell.brand.slogan : shell.brand.name}</p>
          <h1 className="display text-4xl sm:text-5xl xl:text-6xl">{headline}</h1>
          {sub && <p className="mt-5 text-muted max-w-md leading-relaxed">{sub}</p>}
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={link} className="btn btn-primary">{cta}</Link>
            {s(st.secondaryLabel) && <Link href={storePath(ctx, s(st.secondaryHref, "/pages/contact"))} className="btn btn-outline">{s(st.secondaryLabel)}</Link>}
          </div>
        </div>
        <div className="lg:col-span-7 order-1 lg:order-2">
          {img ? <Img src={img} alt={s(st.imageAlt, headline)} width={1400} height={1000} eager className="w-full aspect-[4/3] object-cover" sizes="(min-width:1024px) 58vw, 100vw" /> : <div className="w-full aspect-[4/3] bg-ink/5" aria-hidden />}
        </div>
      </div>
    </section>
  );
}

async function FeaturedProducts({ st, shell, ctx, template, currency }: { st: Record<string, unknown>; shell: Shell; ctx: StoreCtx; template: TemplateId; currency: string }) {
  const limit = Math.min(12, n(st.limit, 6));
  const collection = s(st.collection);
  const res = await getProducts(ctx.key, ctx.env, { pageSize: limit, collection: collection || undefined, sort: s(st.sort) || undefined }).catch(() => null);
  const products: Product[] = res?.items ?? [];
  if (!products.length) return null;
  return (
    <section className="container-x py-14 sm:py-20" aria-labelledby="featured-title">
      <SectionHeading id="featured-title" title={s(st.title, "The essentials")} sub={s(st.subtitle)} link={{ href: storePath(ctx, collection ? `/collections/${collection}` : "/collections/all"), label: "View all" }} />
      <ProductGrid products={products} ctx={ctx} currency={currency} template={template} columns={limit % 3 === 0 && limit !== 6 ? 3 : 4} />
      {shell.merch.some((m) => m.placement === "homeSections") && null}
    </section>
  );
}

async function CollectionGrid({ st, shell, ctx, template }: { st: Record<string, unknown>; shell: Shell; ctx: StoreCtx; template: TemplateId }) {
  const handles = list(st.collections);
  const cols = (handles.length ? shell.collections.filter((c) => handles.includes(c.handle)) : shell.collections.filter((c) => c.productCount > 0)).slice(0, n(st.limit, 6));
  if (!cols.length) return null;
  const details = await Promise.all(cols.map((c) => getCollection(ctx.key, ctx.env, c.handle).catch(() => null)));
  return (
    <section className="container-x py-14 sm:py-20" aria-labelledby="collections-title">
      <SectionHeading id="collections-title" title={s(st.title, "Shop by collection")} sub={s(st.subtitle)} />
      <div className={`grid gap-4 sm:gap-6 ${cols.length >= 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
        {cols.map((c, i) => {
          const d = details[i];
          const img = d?.collection.imageUrl ?? d?.products.items[0]?.media[0]?.url ?? null;
          return (
            <Link key={c.id} href={storePath(ctx, `/collections/${c.handle}`)} className="group relative block overflow-hidden" style={{ borderRadius: "var(--radius-card)" }}>
              <div className="aspect-[4/3] bg-ink/5"><Img src={img} alt="" width={900} height={675} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" /></div>
              <div className={`absolute inset-x-0 bottom-0 p-5 ${template === "studio" ? "" : "bg-gradient-to-t from-black/60 to-transparent text-white"}`}>
                <p className={`display text-xl ${template === "studio" ? "text-white drop-shadow" : ""}`}>{c.title}</p>
                <p className="text-xs opacity-80">{c.productCount} {c.productCount === 1 ? "piece" : "pieces"}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function RichText({ st }: { st: Record<string, unknown> }) {
  const title = s(st.title), body = s(st.body, s(st.html));
  if (!title && !body) return null;
  return (
    <section className="container-x py-14 sm:py-20">
      <div className={`max-w-2xl ${s(st.align, "center") === "center" ? "mx-auto text-center" : ""}`}>
        {s(st.eyebrow) && <p className="eyebrow text-primary mb-3">{s(st.eyebrow)}</p>}
        {title && <h2 className="section-title mb-5">{title}</h2>}
        {body && (/<[a-z][\s\S]*>/i.test(body) ? <div className="prose text-muted" dangerouslySetInnerHTML={{ __html: body }} /> : <div className="prose text-muted">{body.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}</div>)}
      </div>
    </section>
  );
}

function ImageWithText({ st, shell, ctx }: { st: Record<string, unknown>; shell: Shell; ctx: StoreCtx }) {
  const img = s(st.imageUrl, shell.brand.heroImageUrl ?? "");
  const body = s(st.body, shell.brand.description);
  const flip = s(st.imagePosition, "left") === "right";
  return (
    <section className="container-x py-14 sm:py-20">
      <div className="grid md:grid-cols-2 gap-8 md:gap-16 items-center">
        <div className={flip ? "md:order-2" : ""}>{img ? <Img src={img} alt={s(st.imageAlt, s(st.title))} width={1200} height={1000} className="w-full aspect-[5/4] object-cover" /> : <div className="aspect-[5/4] bg-ink/5" aria-hidden />}</div>
        <div className={flip ? "md:order-1" : ""}>
          {s(st.eyebrow) && <p className="eyebrow text-primary mb-3">{s(st.eyebrow)}</p>}
          <h2 className="section-title">{s(st.title, "Why we make this")}</h2>
          <div className="prose text-muted mt-5">{body.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}</div>
          {s(st.ctaLabel) && <Link href={storePath(ctx, s(st.ctaHref, "/collections/all"))} className="btn btn-outline mt-6">{s(st.ctaLabel)}</Link>}
        </div>
      </div>
    </section>
  );
}

/** Approved reviews from the first three products, or the AI summaries when there are no reviews yet, or hand-written quotes from settings. */
async function Testimonials({ st, shell, ctx }: { st: Record<string, unknown>; shell: Shell; ctx: StoreCtx }) {
  const manual = Array.isArray(st.items) ? (st.items as { quote?: string; text?: string; author?: string; name?: string; rating?: number }[]).filter((x) => x.quote || x.text) : [];
  let cards: { quote: string; author: string; rating: number; product?: string; verified?: boolean }[] = manual.map((x) => ({ quote: x.quote ?? x.text ?? "", author: x.author ?? x.name ?? "Customer", rating: x.rating ?? 5 }));
  let summary: string[] = [];
  let average = 0, total = 0;
  if (!cards.length) {
    const res = await getProducts(ctx.key, ctx.env, { pageSize: 3 }).catch(() => null);
    const revs = await Promise.all((res?.items ?? []).map((p) => getReviews(ctx.key, ctx.env, p.handle, { page: 1 }).then((r) => ({ p, r })).catch(() => null)));
    const all: { r: Review; p: Product }[] = [];
    for (const x of revs) if (x) { for (const r of x.r.items) all.push({ r, p: x.p }); if (!summary.length && x.r.stats.summary.length) summary = x.r.stats.summary; total += x.r.stats.total; average += x.r.stats.average * x.r.stats.total; }
    average = total ? average / total : 0;
    cards = all.filter((x) => x.r.rating >= 4).sort((a, b) => b.r.rating - a.r.rating || (b.r.media.length - a.r.media.length)).slice(0, 3).map((x) => ({ quote: x.r.body, author: x.r.authorName, rating: x.r.rating, product: x.p.title, verified: x.r.verified }));
  }
  if (!cards.length && !summary.length) return null;
  return (
    <section className="py-14 sm:py-20" style={{ background: "color-mix(in srgb, var(--brand-primary) 6%, var(--brand-bg))" }} aria-labelledby="testimonials-title">
      <div className="container-x">
        <SectionHeading id="testimonials-title" title={s(st.title, "What people say")} sub={total ? `${average.toFixed(1)} average from ${total} reviews` : s(st.subtitle)} center />
        {cards.length ? (
          <div className="grid gap-5 md:grid-cols-3">
            {cards.map((c, i) => (
              <figure key={i} className="card p-6 flex flex-col gap-3">
                <Stars rating={c.rating} />
                <blockquote className="display text-lg leading-snug">“{c.quote.length > 220 ? `${c.quote.slice(0, 217)}…` : c.quote}”</blockquote>
                <figcaption className="text-xs text-muted mt-auto">— {c.author}{c.verified && <span className="ml-2 badge bg-ink/8">Verified</span>}{c.product && <span className="block mt-1 opacity-80">on {c.product}</span>}</figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <div className="card p-6 max-w-2xl mx-auto">
            <p className="eyebrow text-primary mb-3">What customers mention most</p>
            <ul className="grid sm:grid-cols-2 gap-2 text-sm">{summary.map((b, i) => <li key={i} className="flex gap-2"><span className="text-primary">◆</span><span>{b}</span></li>)}</ul>
          </div>
        )}
      </div>
    </section>
  );
}

function Newsletter({ st }: { st: Record<string, unknown> }) {
  return (
    <section className="container-x py-14 sm:py-20" aria-labelledby="newsletter-title">
      <div className="max-w-xl mx-auto text-center">
        <p className="eyebrow text-primary mb-3">Stay close</p>
        <h2 id="newsletter-title" className="section-title">{s(st.title, "Get first access")}</h2>
        <p className="text-muted mt-3 mb-6">{s(st.body, "New drops, workshop notes, and the occasional discount.")}</p>
        <NewsletterForm cta={s(st.ctaLabel, "Subscribe")} />
      </div>
    </section>
  );
}

function TrustStrip({ st, template }: { st: Record<string, unknown>; template: TemplateId }) {
  const items = list(st.items);
  if (!items.length) return null;
  return (
    <section className={`border-y border-rule ${template === "bazaar" ? "bg-primary text-primary-contrast border-0" : ""}`} aria-label="Why shop with us">
      <div className="container-x py-4 flex flex-wrap items-center justify-center gap-x-8 gap-y-2">
        {items.map((it, i) => <span key={i} className="eyebrow text-[10.5px] flex items-center gap-2"><span aria-hidden className={template === "bazaar" ? "" : "text-primary"}>◆</span>{it}</span>)}
      </div>
    </section>
  );
}

function Faq({ st }: { st: Record<string, unknown> }) {
  const items = Array.isArray(st.items) ? (st.items as { question?: string; q?: string; answer?: string; a?: string }[]).filter((x) => (x.question || x.q) && (x.answer || x.a)) : [];
  if (!items.length) return null;
  return (
    <section className="container-x py-14 sm:py-20" aria-labelledby="faq-title">
      <div className="max-w-2xl mx-auto">
        <h2 id="faq-title" className="section-title mb-6">{s(st.title, "Questions, answered")}</h2>
        <div className="border-t border-rule">{items.map((it, i) => <AccordionItem key={i} title={it.question ?? it.q ?? ""} open={i === 0}>{it.answer ?? it.a}</AccordionItem>)}</div>
      </div>
    </section>
  );
}

function CustomHtml({ st }: { st: Record<string, unknown> }) {
  const html = s(st.html, s(st.body));
  if (!html) return null;
  return <section className={s(st.contained, "true") === "false" ? "" : "container-x py-10"} dangerouslySetInnerHTML={{ __html: html }} />;
}

export function SectionHeading({ id, title, sub, link, center }: { id?: string; title: string; sub?: string; link?: { href: string; label: string }; center?: boolean }) {
  return (
    <div className={`flex flex-wrap items-end justify-between gap-4 mb-8 sm:mb-10 ${center ? "justify-center text-center" : ""}`}>
      <div className={center ? "w-full" : ""}>
        <h2 id={id} className="section-title">{title}</h2>
        {sub && <p className="text-sm text-muted mt-2">{sub}</p>}
      </div>
      {link && !center && <Link href={link.href} className="eyebrow text-[10.5px] hover:text-primary underline-offset-4 hover:underline">{link.label} →</Link>}
    </div>
  );
}

export function HomeSlots({ name }: { name: "homeHero" | "homeSections" }) { return <Slot name={name} ctx={{ page: "home" }} className="container-x" />; }
