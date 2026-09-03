import type { Product, TemplateId } from "@/lib/types";
import type { StoreCtx } from "@/lib/store-path";
import { ProductCard, type CardReview } from "./ProductCard";

export function ProductGrid({ products, ctx, currency, template, reviews, columns = 4, emptyText = "No products yet." }: { products: Product[]; ctx: StoreCtx; currency: string; template: TemplateId; reviews?: Record<string, CardReview>; columns?: 3 | 4; emptyText?: string }) {
  if (!products.length) return <p className="text-center text-muted py-16">{emptyText}</p>;
  const cols = columns === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4";
  return (
    <div className={`product-grid grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 ${cols} ${template === "bazaar" ? "sm:grid-cols-3 lg:grid-cols-5" : ""}`}>
      {products.map((p, i) => <ProductCard key={p.id} product={p} ctx={ctx} currency={currency} template={template} review={reviews?.[p.id]} eager={i < 4} />)}
    </div>
  );
}
