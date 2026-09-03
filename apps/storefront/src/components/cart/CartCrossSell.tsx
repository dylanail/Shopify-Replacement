"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { Product } from "@/lib/types";
import { api } from "@/lib/client-api";
import { useStore } from "@/components/providers/StoreProvider";
import { useCart } from "@/components/providers/CartProvider";
import { Img } from "@/components/ui/Img";
import { formatMoney } from "@/lib/format";
import { defaultVariant, isAvailable } from "@/lib/lite";

/** "Complete the look": a few products not yet in the cart, one-tap add. Merch-config cross-sells render through the cartDrawerEnd slot instead. */
export function CartCrossSell({ title = "Complete the look", limit = 3 }: { title?: string; limit?: number }) {
  const store = useStore();
  const { cart, add, currency } = useCart();
  const [items, setItems] = useState<Product[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    api<{ items: Product[] }>(store.key, "/products", { query: { pageSize: 12 }, env: store.env }).then((r) => alive && setItems(r.items)).catch(() => alive && setItems([]));
    return () => { alive = false; };
  }, [store.key, store.env]);
  if (!items?.length || !cart?.items.length) return null;
  const inCart = new Set(cart.items.map((i) => i.productId));
  const picks = items.filter((p) => !inCart.has(p.id) && p.variants.some(isAvailable)).slice(0, limit);
  if (!picks.length) return null;
  return (
    <section aria-label={title} className="pt-4 border-t border-rule">
      <p className="eyebrow mb-3">{title}</p>
      <ul className="space-y-3">
        {picks.map((p) => {
          const v = defaultVariant(p)!;
          return (
            <li key={p.id} className="flex items-center gap-3">
              <Link href={store.path(`/products/${p.handle}`)} className="w-14 shrink-0 bg-ink/5" style={{ borderRadius: "var(--radius-card)" }}><Img src={p.media[0]?.url ?? v.imageUrl} alt="" width={112} height={112} className="w-full aspect-square object-cover" /></Link>
              <div className="flex-1 min-w-0"><Link href={store.path(`/products/${p.handle}`)} className="text-sm font-medium line-clamp-1 hover:underline underline-offset-4">{p.title}</Link><p className="text-xs text-muted">{formatMoney(v.priceCents, currency)}</p></div>
              <button type="button" className="btn btn-outline min-h-9 px-3 text-xs" disabled={busy === p.id} onClick={async () => { setBusy(p.id); try { await add(v.id, 1, { open: false }); } catch { /* error surfaces via cart.error */ } finally { setBusy(null); } }}>{busy === p.id ? "…" : "Add"}</button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
