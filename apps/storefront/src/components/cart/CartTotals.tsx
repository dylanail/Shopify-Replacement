"use client";
import { useCart } from "@/components/providers/CartProvider";
import { formatMoney } from "@/lib/format";

export function CartTotals({ showShipping = false, showTax = false }: { showShipping?: boolean; showTax?: boolean }) {
  const { cart, currency } = useCart();
  if (!cart) return null;
  const p = cart.pricing;
  return (
    <dl className="text-sm space-y-2">
      <div className="flex justify-between"><dt className="text-muted">Subtotal ({p.itemCount} {p.itemCount === 1 ? "item" : "items"})</dt><dd>{formatMoney(p.subtotalCents, currency)}</dd></div>
      {p.discountCents > 0 && <div className="flex justify-between text-primary"><dt>Discounts</dt><dd>−{formatMoney(p.discountCents, currency)}</dd></div>}
      {showShipping && <div className="flex justify-between"><dt className="text-muted">Shipping</dt><dd>{cart.shippingOptionId ? (p.shippingCents === 0 ? "Free" : formatMoney(p.shippingCents, currency)) : <span className="text-muted">Calculated next</span>}</dd></div>}
      {showTax && p.taxCents > 0 && <div className="flex justify-between"><dt className="text-muted">Tax</dt><dd>{formatMoney(p.taxCents, currency)}</dd></div>}
      {p.giftCardCents > 0 && <div className="flex justify-between text-primary"><dt>Gift card</dt><dd>−{formatMoney(p.giftCardCents, currency)}</dd></div>}
      <div className="flex justify-between border-t border-rule pt-3 text-base font-semibold"><dt>{showShipping ? "Total" : "Estimated total"}</dt><dd>{formatMoney(showShipping ? p.totalCents : p.subtotalCents - p.discountCents, currency)}</dd></div>
    </dl>
  );
}
