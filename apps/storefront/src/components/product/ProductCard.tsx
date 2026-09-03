import Link from "next/link";
import type { Product, TemplateId } from "@/lib/types";
import type { StoreCtx } from "@/lib/store-path";
import { storePath } from "@/lib/store-path";
import { Price } from "@/components/ui/Price";
import { Stars } from "@/components/ui/Stars";
import { Img } from "@/components/ui/Img";
import { defaultVariant, isAvailable, minPrice } from "@/lib/lite";

export interface CardReview { average: number; total: number }

export function ProductCard({ product, ctx, currency, template, review, eager }: { product: Product; ctx: StoreCtx; currency: string; template: TemplateId; review?: CardReview | null; eager?: boolean }) {
  const v = defaultVariant(product);
  const soldOut = !product.variants.some(isAvailable);
  const price = minPrice(product);
  const compare = v?.compareAtCents ?? null;
  const fromPrice = product.variants.length > 1 && product.variants.some((x) => x.priceCents !== price);
  const img = product.media[0];
  const hover = product.media[1];
  const onSale = compare != null && compare > (v?.priceCents ?? price);
  const tag = product.tags.find((t) => /^(new|bestseller|best seller|limited|sale)$/i.test(t));
  return (
    <article className={`group relative flex flex-col ${template === "bazaar" ? "card p-2" : ""}`}>
      <Link href={storePath(ctx, `/products/${product.handle}`)} className="block" aria-label={product.title}>
        <div className={`relative overflow-hidden bg-ink/5 ${template === "studio" ? "aspect-[4/5]" : "aspect-square"}`} style={{ borderRadius: "var(--radius-card)" }}>
          <Img src={img?.url ?? v?.imageUrl} alt={img?.alt || product.title} width={800} height={template === "studio" ? 1000 : 800} eager={eager} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw" />
          {hover && <Img src={hover.url} alt="" width={800} height={800} className="absolute inset-0 w-full h-full object-cover opacity-0 transition-opacity duration-300 group-hover:opacity-100" />}
          <div className="absolute top-2 left-2 flex flex-col gap-1">
            {soldOut && <span className="badge bg-ink text-paper">Sold out</span>}
            {!soldOut && onSale && <span className="badge bg-primary text-primary-contrast">Sale</span>}
            {!soldOut && tag && <span className="badge bg-secondary text-white">{tag}</span>}
          </div>
        </div>
      </Link>
      <div className={`flex flex-col gap-1 ${template === "atelier" ? "pt-3 text-center" : "pt-3"}`}>
        {product.productType && template === "atelier" && <p className="eyebrow text-muted text-[10px]">{product.productType}</p>}
        <h3 className="product-card-title leading-snug"><Link href={storePath(ctx, `/products/${product.handle}`)} className="hover:underline underline-offset-4">{product.title}</Link></h3>
        {product.subtitle && template !== "bazaar" && <p className="text-xs text-muted line-clamp-1">{product.subtitle}</p>}
        {review && review.total > 0 && <div className={`flex items-center gap-1.5 text-xs text-muted ${template === "atelier" ? "justify-center" : ""}`}><Stars rating={review.average} size={12} /><span>({review.total})</span></div>}
        <div className={`text-sm ${template === "atelier" ? "justify-center flex" : ""}`}>
          {fromPrice && <span className="text-muted mr-1">From</span>}
          <Price cents={fromPrice ? price : v?.priceCents ?? price} compareAtCents={fromPrice ? null : compare} currency={currency} size="sm" />
        </div>
        {template === "bazaar" && !soldOut && <Link href={storePath(ctx, `/products/${product.handle}`)} className="btn btn-primary mt-2 min-h-10 text-xs">View options</Link>}
      </div>
    </article>
  );
}
