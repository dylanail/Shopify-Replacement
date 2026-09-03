import type { Metadata } from "next";
import { loadShell } from "@/lib/api";
import { storeCtx } from "@/lib/request";
import { SectionRenderer, HomeSlots } from "@/components/sections/SectionRenderer";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ store: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const ctx = await storeCtx((await params).store, await searchParams);
  const res = await loadShell(ctx.key, ctx.env);
  if (!res.ok) return {};
  return { title: { absolute: `${res.shell.brand.name}${res.shell.brand.slogan ? ` — ${res.shell.brand.slogan}` : ""}` } };
}

export default async function HomePage({ params, searchParams }: Props) {
  const ctx = await storeCtx((await params).store, await searchParams);
  const res = await loadShell(ctx.key, ctx.env);
  if (!res.ok) return null;
  const shell = res.shell;
  const sections = shell.theme.sections.length ? shell.theme.sections : [
    { id: "hero", type: "hero" as const, settings: { headline: shell.brand.slogan || shell.brand.name, subheadline: shell.brand.description, ctaLabel: "Shop the collection", ctaHref: "/collections/all", imageUrl: shell.brand.heroImageUrl ?? null }, hidden: false },
    { id: "featured", type: "featured-products" as const, settings: { title: "The essentials", limit: 8 }, hidden: false },
    { id: "newsletter", type: "newsletter" as const, settings: {}, hidden: false },
  ];
  return (
    <>
      <HomeSlots name="homeHero" />
      <SectionRenderer shell={shell} ctx={ctx} sections={sections} />
      <HomeSlots name="homeSections" />
    </>
  );
}
