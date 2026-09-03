import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { loadShell, productsByIds } from "@/lib/api";
import { storeCtx, requestPath } from "@/lib/request";
import { storePath } from "@/lib/store-path";
import { brandTagline, googleFontsHref } from "@/lib/brand";
import { brandCssVars, cssVarsToStyle } from "@/lib/theme-vars";
import { toStoreClient, toLite, templateOf } from "@/lib/lite";
import { jsonLd } from "@/lib/jsonld";
import { StoreProviders } from "@/components/layout/StoreProviders";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { AnnouncementBar } from "@/components/layout/AnnouncementBar";
import { DraftBar } from "@/components/layout/DraftBar";
import { PluginScripts } from "@/components/layout/PluginScripts";
import { StoreUnavailable } from "@/components/layout/StoreUnavailable";

export const dynamic = "force-dynamic";

type Params = Promise<{ store: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { store } = await params;
  const ctx = await storeCtx(store);
  const res = await loadShell(ctx.key, ctx.env);
  if (!res.ok) return { title: "Store unavailable", robots: { index: false } };
  const b = res.shell.brand;
  return {
    title: { default: `${b.name}${b.slogan ? ` — ${b.slogan}` : ""}`, template: `%s · ${b.name}` },
    description: b.description || b.slogan,
    metadataBase: (() => { try { return new URL(res.shell.url); } catch { return undefined; } })(),
    icons: b.logoUrl ? { icon: b.logoUrl } : undefined,
    openGraph: { siteName: b.name, title: b.name, description: b.description || b.slogan, images: b.heroImageUrl ? [b.heroImageUrl] : undefined, type: "website" },
    robots: ctx.env === "draft" || res.shell.status !== "live" ? { index: false, follow: false } : undefined,
  };
}

export default async function StoreLayout({ children, params }: { children: ReactNode; params: Params }) {
  const { store } = await params;
  const ctx = await storeCtx(store);
  const res = await loadShell(ctx.key, ctx.env);
  if (!res.ok) { if (res.status === 404) notFound(); return <StoreUnavailable storeKey={ctx.key} status={res.status} message={res.message} />; }
  const shell = res.shell;

  // Merchant redirects (e.g. from a migrated store) resolve here — before any page fetches.
  const path = await requestPath();
  const rd = shell.redirects.find((r) => r.from === path || r.from === path.replace(/\/$/, ""));
  if (rd && rd.to !== path) redirect(rd.to.startsWith("http") ? rd.to : storePath(ctx, rd.to));

  const merchIds = [...new Set(shell.merch.flatMap((m) => m.productIds))];
  const merchProducts = (await productsByIds(ctx.key, ctx.env, merchIds).catch(() => [])).map(toLite);
  const client = toStoreClient(shell, ctx, merchProducts);
  const template = templateOf(shell.theme.template);
  const vars = brandCssVars(shell.brand);
  const fonts = googleFontsHref(shell.brand.displayFont || "Playfair Display", shell.brand.bodyFont || "Inter");
  const org = { "@context": "https://schema.org", "@type": "Organization", name: shell.brand.name, url: shell.url, logo: shell.brand.logoUrl, description: shell.brand.description, slogan: shell.brand.slogan };

  return (
    <div data-template={template} data-store={shell.slug} className="min-h-screen flex flex-col" style={{ ...(vars as React.CSSProperties), background: "var(--brand-bg)", color: "var(--brand-text)", fontFamily: "var(--font-body)" }}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link rel="stylesheet" href={fonts} precedence="default" />
      {/* Scope the brand tokens to :root too, so portals/modals and the body background follow the brand. */}
      <style dangerouslySetInnerHTML={{ __html: `:root{${cssVarsToStyle(vars)}} body{background:${vars["--brand-bg"]};color:${vars["--brand-text"]}}` }} />
      {shell.theme.customCss && <style data-custom-css dangerouslySetInnerHTML={{ __html: shell.theme.customCss }} />}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(org) }} />
      <PluginScripts plugins={shell.plugins} position="head" storeSlug={shell.slug} />
      <StoreProviders value={client}>
        {ctx.env === "draft" && <DraftBar version={shell.version} />}
        <AnnouncementBar text={shell.brand.announcement} />
        <Header tagline={brandTagline(shell.brand)} />
        <main id="main" className="flex-1">{children}</main>
        <Footer shell={shell} ctx={ctx} />
      </StoreProviders>
      <PluginScripts plugins={shell.plugins} position="bodyEnd" storeSlug={shell.slug} />
    </div>
  );
}
