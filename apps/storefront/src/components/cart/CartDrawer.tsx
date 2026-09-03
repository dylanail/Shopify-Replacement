"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { useCart } from "@/components/providers/CartProvider";
import { useStore } from "@/components/providers/StoreProvider";
import { CartLines } from "./CartLines";
import { DiscountForm } from "./DiscountForm";
import { CartTotals } from "./CartTotals";
import { FreeShippingBar } from "./FreeShippingBar";
import { CartCrossSell } from "./CartCrossSell";
import { Slot, useSlotEntries } from "@/components/slots/Slot";

export function CartDrawer() {
  const { cart, drawerOpen, closeDrawer, error, loading } = useCart();
  const store = useStore();
  const panel = useRef<HTMLDivElement>(null);
  const slotEntries = useSlotEntries("cartDrawerEnd");
  const hasGapCloser = slotEntries.some((e) => e.component === "FreeShippingGapCloser");
  const hasCrossSell = slotEntries.some((e) => e.merch?.kind === "cross_sell");
  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>("button, a")?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeDrawer(); };
    document.addEventListener("keydown", onKey);
    const o = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = o; prev?.focus?.(); };
  }, [drawerOpen, closeDrawer]);
  if (!drawerOpen) return null;
  const empty = !cart || cart.items.length === 0;
  return (
    <div className="fixed inset-0 z-50" role="presentation">
      <div className="absolute inset-0 bg-black/40" onClick={closeDrawer} aria-hidden />
      <div ref={panel} role="dialog" aria-modal="true" aria-label="Your cart" className="absolute inset-y-0 right-0 w-full max-w-md flex flex-col slide-in shadow-2xl" style={{ background: "var(--brand-bg)" }}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-rule">
          <h2 className="display text-xl">Your cart {cart && cart.pricing.itemCount > 0 && <span className="text-sm text-muted font-body">({cart.pricing.itemCount})</span>}</h2>
          <button type="button" onClick={closeDrawer} className="btn btn-ghost px-2" aria-label="Close cart">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {error && <p role="alert" className="text-xs text-red-700 border border-red-200 bg-red-50 p-2">{error}</p>}
          {loading && !cart && <div className="skeleton h-24" aria-hidden />}
          {empty && !loading ? (
            <div className="text-center py-12 space-y-3">
              <p className="display text-lg">Your cart is empty.</p>
              <p className="text-sm text-muted">Made-to-order pieces are waiting.</p>
              <Link href={store.path("/collections/all")} onClick={closeDrawer} className="btn btn-primary">Browse the collection</Link>
            </div>
          ) : (
            <>
              {!hasGapCloser && <FreeShippingBar />}
              <CartLines compact />
              <DiscountForm idPrefix="drawer" />
              <Slot name="cartDrawerEnd" ctx={{ page: "cart" }} className="space-y-5" />
              {!hasCrossSell && <CartCrossSell />}
            </>
          )}
        </div>
        {!empty && (
          <div className="border-t border-rule px-5 py-4 space-y-3" style={{ background: "var(--brand-bg-elevated)" }}>
            <CartTotals />
            <p className="text-[11px] text-muted">Shipping and taxes calculated at checkout.</p>
            <Link href={store.path("/checkout")} onClick={closeDrawer} className="btn btn-primary w-full">Checkout</Link>
            <Link href={store.path("/cart")} onClick={closeDrawer} className="block text-center text-xs underline underline-offset-4 text-muted">View full cart</Link>
          </div>
        )}
      </div>
    </div>
  );
}
