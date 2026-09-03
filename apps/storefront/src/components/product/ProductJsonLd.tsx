import type { ProductDetail } from "@/lib/types";
import { jsonLd } from "@/lib/jsonld";
import { stripHtml } from "@/lib/format";

export function ProductJsonLd({ product, url, currency }: { product: ProductDetail; url: string; currency: string }) {
  const prices = product.variants.map((v) => v.priceCents / 100);
  const data = product.seo.jsonLd && Object.keys(product.seo.jsonLd).length ? product.seo.jsonLd : {
    "@context": "https://schema.org", "@type": "Product", name: product.title, description: stripHtml(product.description).slice(0, 500), image: product.media.map((m) => m.url), sku: product.variants[0]?.sku ?? undefined, brand: product.vendor ? { "@type": "Brand", name: product.vendor } : undefined, url,
    offers: prices.length ? { "@type": "AggregateOffer", priceCurrency: currency, lowPrice: Math.min(...prices).toFixed(2), highPrice: Math.max(...prices).toFixed(2), offerCount: prices.length, availability: product.variants.some((v) => v.inventoryQty > 0 || v.allowBackorder) ? "https://schema.org/InStock" : "https://schema.org/OutOfStock", url } : undefined,
    aggregateRating: product.reviews.total ? { "@type": "AggregateRating", ratingValue: product.reviews.average, reviewCount: product.reviews.total } : undefined,
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(data) }} />;
}
