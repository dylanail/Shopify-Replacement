"use client";
import { useEffect } from "react";
import type { OrderDetail } from "@/lib/types";
import { Slot, useSlotEntries } from "@/components/slots/Slot";
import { PostPurchaseOffer } from "@/components/slots/plugins/PostPurchaseOffer";
import { useCart } from "@/components/providers/CartProvider";

/** thankYouEnd slot + the built-in post-purchase offer when no plugin/merch config already provides one. Also clears any stale cart. */
export function ThankYouExtras({ order, email }: { order: OrderDetail; email: string }) {
  const entries = useSlotEntries("thankYouEnd");
  const { cart, clear } = useCart();
  useEffect(() => { if (cart && cart.status !== "open") clear(); }, [cart, clear]);
  const hasOffer = entries.some((e) => e.component === "PostPurchaseOffer" || e.component === "WeSavedOneForYou");
  const ctx = { order, email, page: "thank-you" };
  return (
    <div className="space-y-8">
      {!hasOffer && <PostPurchaseOffer ctx={ctx} settings={{}} props={{}} slot="thankYouEnd" entry={{ key: "builtin", component: "PostPurchaseOffer", settings: {}, props: {}, propsFromConfig: [], propsFromContext: [] }} />}
      <Slot name="thankYouEnd" ctx={ctx} className="space-y-8" />
    </div>
  );
}
