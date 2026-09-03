"use client";
import Link from "next/link";
import { useCart } from "@/components/providers/CartProvider";
import { useStore } from "@/components/providers/StoreProvider";
import { CartLines } from "./CartLines";
import { DiscountForm } from "./DiscountForm";
import { CartTotals } from "./CartTotals";
import { FreeShippingBar } from "./FreeShippingBar";
import { CartCrossSell } from "./CartCrossSell";
import { Slot, useSlotEntries } from "@/components/slots/Slot";

export function CartPage() {
  const { cart, loading, error } = useCart();
  const store = useStore();
  const entries = useSlotEntries("cartDrawerEnd");
  const hasCrossSell = entries.some((e) => e.merch?.kind === "cross_sell");
  const empty = !loading && (!cart || cart.items.length === 0);
  return (
    <div className="container-x py-10 sm:py-14">
      <h1 className="display text-3xl mb-8">Your cart</h1>
      {error && <p role="alert" className="mb-6 text-sm border border-red-200 bg-red-50 text-red-800 p-3">{error}</p>}
      {loading && !cart ? <div className="skeleton h-40 max-w-2xl" aria-label="Loading cart" /> : empty ? (
        <div className="py-16 text-center space-y-3"><p className="display text-xl">Nothing here yet.</p><p className="text-sm text-muted">Made-to-order pieces are waiting.</p><Link href={store.path("/collections/all")} className="btn btn-primary">Browse the collection</Link></div>
      ) : (
        <div className="grid lg:grid-cols-12 gap-10">
          <div className="lg:col-span-8 space-y-8">
            <FreeShippingBar className="card p-4" />
            <CartLines />
            <Slot name="cartDrawerEnd" ctx={{ page: "cart" }} className="space-y-6" />
            {!hasCrossSell && <CartCrossSell limit={4} />}
          </div>
          <aside className="lg:col-span-4"><div className="card p-5 sm:p-6 space-y-5 lg:sticky lg:top-24">
            <DiscountForm idPrefix="cart" />
            <CartTotals />
            <p className="text-xs text-muted">Shipping and taxes are calculated at checkout.</p>
            <Link href={store.path("/checkout")} className="btn btn-primary w-full">Checkout</Link>
            <Link href={store.path("/collections/all")} className="block text-center text-xs underline underline-offset-4 text-muted">Continue shopping</Link>
          </div></aside>
        </div>
      )}
    </div>
  );
}
