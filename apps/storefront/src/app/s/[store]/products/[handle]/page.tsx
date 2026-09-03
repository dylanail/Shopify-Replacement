import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ApiError, getProduct, loadShell } from "@/lib/api";
import { storeCtx } from "@/lib/request";
import { storePath } from "@/lib/store-path";
import { templateOf } from "@/lib/lite";
import { trustEyebrow, pdpMicrocopy, pdpTrustItems } from "@/lib/brand";
import { stripHtml, formatMoney } from "@/lib/format";
import { pdpExperimentOverrides } from "@/lib/experiments";
import { PdpProvider } from "@/components/product/PdpContext";
import { Gallery } from "@/components/product/Gallery";
import { BuyBox } from "@/components/product/BuyBox";
import { ProductTabs } from "@/components/product/ProductTabs";
import { Breadcrumb } from "@/components/product/Breadcrumb";
import { ProductJsonLd } from "@/components/product/ProductJsonLd";
import { Slot } from "@/components/slots/Slot";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ store: string; handle: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

async function load(props: Props) {
  const { store, handle } = await props.params;
  const sp = await props.searchParams;
  const ctx = await storeCtx(store, sp);
  const cartIds = (Array.isArray(sp.cart) ? sp.cart[0] : sp.cart)?.split(",").filter(Boolean) ?? [];
  const [shellRes, product] = await Promise.all([loadShell(ctx.key, ctx.env), getProduct(ctx.key, ctx.env, handle, cartIds).catch((e: unknown) => { if (e instanceof ApiError && e.status === 404) notFound(); throw e; })]);
  return { ctx, shellRes, product };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  try {
    const { product, shellRes } = await load(props);
    const desc = product.seo.description || stripHtml(product.description).slice(0, 160);
    return { title: product.seo.title || product.title, description: desc, keywords: product.seo.keywords, openGraph: { title: product.title, description: desc, images: product.media.slice(0, 1).map((m) => m.url), type: "website" }, robots: shellRes.ok && product.status !== "published" ? { index: false } : undefined };
  } catch { return {}; }
}

export default async function ProductPage(props: Props) {
  const { ctx, shellRes, product } = await load(props);
  if (!shellRes.ok) return null;
  const shell = shellRes.shell;
  const template = templateOf(shell.theme.template);
  const currency = shell.region?.currency ?? "USD";
  const overrides = pdpExperimentOverrides(product.experiments);
  const collection = shell.collections.find((c) => product.collectionIds?.includes(c.id)) ?? shell.collections.find((c) => c.productCount > 0);
  const freeShip = shell.theme.sections.find((s) => s.type === "trust-strip")?.settings.items;
  const freeShipLabel = Array.isArray(freeShip) ? (freeShip as string[]).find((x) => /free (shipping|freight|delivery)/i.test(x)) ?? null : null;
  const copy = { eyebrow: trustEyebrow(shell.brand), microcopy: pdpMicrocopy(shell.brand, product.metadata.microcopy), trust: pdpTrustItems(shell.brand, product.metadata.trust, freeShipLabel), ctaLabel: typeof product.metadata.ctaLabel === "string" ? product.metadata.ctaLabel : template === "atelier" ? "Add to cart" : "Add to cart" };
  const shippingHtml = typeof product.metadata.shipping === "string" ? product.metadata.shipping : `<p>${freeShipLabel ?? "Shipping is calculated at checkout"}. Made-to-order pieces ship once finished; in-stock items leave within 2 business days with tracking by email.</p><p>Returns are accepted within 30 days on unworn, unpersonalised pieces. ${shell.brand.name} covers repairs on manufacturing defects.</p>`;
  const careHtml = typeof product.metadata.care === "string" ? product.metadata.care : "";
  // A running "headline" experiment tests the tagline under the product name, never the name itself.
  const subtitle = overrides.headline ?? product.subtitle;
  const ctxSlot = { product, recommendations: product.recommendations, page: "product" };

  return (
    <PdpProvider product={product}>
      <ProductJsonLd product={product} url={`${shell.url}/products/${product.handle}`} currency={currency} />
      <Slot name="pdpAnalytics" ctx={ctxSlot} wrap={false} />
      <div className="container-x py-6 sm:py-10">
        <div className="grid lg:grid-cols-12 gap-8 lg:gap-14">
          <div className={`lg:col-span-7 ${template === "studio" ? "lg:col-span-8" : ""}`}>
            <Slot name="pdpGallery" ctx={ctxSlot} className="mb-4" />
            <Gallery media={product.media} title={product.title} template={template} />
          </div>
          <div className={`lg:col-span-5 ${template === "studio" ? "lg:col-span-4" : ""} space-y-6`}>
            <Breadcrumb items={[{ label: "Home", href: storePath(ctx, "/") }, ...(collection ? [{ label: collection.title, href: storePath(ctx, `/collections/${collection.handle}`) }] : [{ label: "Shop", href: storePath(ctx, "/collections/all") }]), { label: product.title }]} />
            <Slot name="pdpAboveTitle" ctx={ctxSlot} />
            <div className="space-y-2">
              {copy.eyebrow && <p className="eyebrow text-primary text-[10.5px]">◆ {copy.eyebrow}</p>}
              <h1 className={`display ${template === "bazaar" ? "text-2xl sm:text-3xl" : "text-3xl sm:text-4xl"}`}>{product.title}</h1>
              {subtitle && <p className={`text-muted ${template === "atelier" ? "italic font-display text-lg" : "text-base"}`}>{subtitle}</p>}
            </div>
            <BuyBox copy={copy} />
            <Slot name="pdpBelowAddToCart" ctx={ctxSlot} className="space-y-8" />
            <ProductTabs tabs={[{ id: "description", label: "Description", html: product.description || `<p>${product.subtitle || product.title}</p>` }, { id: "shipping", label: "Shipping & returns", html: shippingHtml }, { id: "care", label: "Care", html: careHtml }]} />
            <Slot name="pdpBelowDescription" ctx={ctxSlot} className="space-y-8" />
            {product.tags.length > 0 && <p className="text-[11px] text-muted">{product.tags.slice(0, 6).map((t) => `#${t}`).join("  ")}</p>}
            <p className="sr-only">From {formatMoney(Math.min(...product.variants.map((v) => v.priceCents)), currency)}</p>
          </div>
        </div>
        <div className="mt-16 sm:mt-24 space-y-16">
          <Slot name="pdpEnd" ctx={ctxSlot} className="space-y-16" />
        </div>
      </div>
    </PdpProvider>
  );
}
