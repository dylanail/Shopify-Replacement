"use client";
import Link from "next/link";
import type { CartItem } from "@kiln/shared";
import { useCart } from "@/components/providers/CartProvider";
import { useStore } from "@/components/providers/StoreProvider";
import { QtyStepper } from "@/components/ui/QtyStepper";
import { Img } from "@/components/ui/Img";
import { formatMoney, cadenceLabel } from "@/lib/format";

export function CartLines({ compact = false, items }: { compact?: boolean; items?: CartItem[] }) {
  const { cart, updateQty, remove, currency } = useCart();
  const store = useStore();
  const lines = items ?? cart?.items ?? [];
  if (!lines.length) return null;
  return (
    <ul className="divide-y divide-rule" aria-label="Cart items">
      {lines.map((i) => {
        const p = store.merchProducts.find((x) => x.id === i.productId);
        const href = p ? store.path(`/products/${p.handle}`) : null;
        const meta = i.metadata ?? {};
        const notes: string[] = [];
        if (typeof meta.buildOption === "string") notes.push(meta.buildOption);
        if (typeof meta.engraving === "string" && meta.engraving) notes.push(`Engraving: “${meta.engraving}”`);
        if (i.subscriptionCadence) notes.push(`Subscription · ${cadenceLabel(i.subscriptionCadence)}`);
        return (
          <li key={i.id} className={`flex gap-4 ${compact ? "py-4" : "py-6"}`}>
            <div className={`${compact ? "w-20" : "w-24 sm:w-28"} shrink-0 bg-ink/5 overflow-hidden`} style={{ borderRadius: "var(--radius-card)" }}>
              <Img src={i.imageUrl} alt="" width={200} height={200} className="w-full aspect-square object-cover" />
            </div>
            <div className="flex-1 min-w-0 flex flex-col gap-1">
              <div className="flex justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium leading-snug">{href ? <Link href={href} className="hover:underline underline-offset-4">{i.title}</Link> : i.title}</p>
                  {i.variantTitle && i.variantTitle !== "Default" && <p className="text-xs text-muted">{i.variantTitle}</p>}
                  {notes.map((t, k) => <p key={k} className="text-xs text-muted">{t}</p>)}
                </div>
                <p className="text-sm font-medium whitespace-nowrap">{formatMoney(i.unitPriceCents * i.quantity, currency)}</p>
              </div>
              <div className="mt-auto flex items-center justify-between gap-3 pt-2">
                <QtyStepper value={i.quantity} onChange={(q) => void updateQty(i.id, q)} size="sm" label={`Quantity for ${i.title}`} />
                <button type="button" onClick={() => void remove(i.id)} className="text-xs text-muted underline underline-offset-4 hover:text-ink">Remove</button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
