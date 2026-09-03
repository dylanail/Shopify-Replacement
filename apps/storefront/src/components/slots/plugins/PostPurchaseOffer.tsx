"use client";
import { useState } from "react";
import type { SlotComponentProps } from "../Slot";
import { api, errorMessage } from "@/lib/client-api";
import { useStore } from "@/components/providers/StoreProvider";
import { Img } from "@/components/ui/Img";
import { formatMoney } from "@/lib/format";

/** One-click post-checkout upsell on the thank-you page: charged to the same payment method, no re-entry. */
export function PostPurchaseOffer({ ctx }: SlotComponentProps) {
  const store = useStore();
  const order = ctx.order;
  const [state, setState] = useState<Record<string, "busy" | "done" | string>>({});
  if (!order || !order.postPurchaseOffers?.length) return null;
  const offers = order.postPurchaseOffers.filter((o) => o.variant);
  if (!offers.length) return null;
  const claim = async (id: string, variantId: string) => {
    setState((s) => ({ ...s, [id]: "busy" }));
    try { await api(store.key, `/orders/${encodeURIComponent(order.id)}/upsell`, { body: { variantId, email: ctx.email ?? order.email } }); setState((s) => ({ ...s, [id]: "done" })); }
    catch (e) { setState((s) => ({ ...s, [id]: `error:${errorMessage(e)}` })); }
  };
  return (
    <section className="card p-6" aria-labelledby="ppo-title" style={{ background: "color-mix(in srgb, var(--brand-primary) 6%, var(--brand-bg-elevated))" }}>
      <p className="eyebrow text-primary mb-1">One more thing</p>
      <h2 id="ppo-title" className="display text-xl">Add to this order in one click</h2>
      <p className="text-sm text-muted mt-1 mb-5">Charged to the same card and shipped together — no second checkout.</p>
      <ul className="grid sm:grid-cols-2 gap-4">
        {offers.map((o) => {
          const st = state[o.id];
          return (
            <li key={o.id} className="flex gap-4 items-center">
              <div className="w-20 shrink-0 bg-ink/5 overflow-hidden" style={{ borderRadius: "var(--radius-card)" }}><Img src={o.media[0]?.url ?? o.variant?.imageUrl} alt="" width={160} height={160} className="w-full aspect-square object-cover" /></div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm line-clamp-2">{o.title}</p>
                <p className="text-xs text-muted">{o.reason} · {formatMoney(o.variant!.priceCents, order.currency)}</p>
                {st === "done" ? <p className="text-xs text-primary mt-1">Added to your order ✓</p> : st?.startsWith("error:") ? <p className="text-xs text-red-700 mt-1">{st.slice(6)}</p> : <button type="button" className="btn btn-primary min-h-9 px-3 text-xs mt-2" disabled={st === "busy"} onClick={() => claim(o.id, o.variant!.id)}>{st === "busy" ? "Adding…" : "Add to order"}</button>}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
