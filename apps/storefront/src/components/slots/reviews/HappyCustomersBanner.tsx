"use client";
import { useEffect, useState } from "react";
import type { SlotComponentProps } from "../Slot";
import type { Product, ReviewsResponse, Review } from "@/lib/types";
import { api } from "@/lib/client-api";
import { useStore } from "@/components/providers/StoreProvider";
import { Stars } from "@/components/ui/Stars";

/** "Loved by 1,240 customers · 4.8★" strip with three short quotes, aggregated from the catalog's approved reviews. */
export function HappyCustomersBanner({ props }: SlotComponentProps) {
  const store = useStore();
  const [agg, setAgg] = useState<{ total: number; average: number; quotes: Review[] } | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const prods = await api<{ items: Product[] }>(store.key, "/products", { query: { pageSize: 6 }, env: store.env });
        const revs = await Promise.all(prods.items.map((p) => api<ReviewsResponse>(store.key, `/products/${encodeURIComponent(p.handle)}/reviews`, { env: store.env }).catch(() => null)));
        let total = 0, sum = 0; const quotes: Review[] = [];
        for (const r of revs) if (r) { total += r.stats.total; sum += r.stats.average * r.stats.total; quotes.push(...r.items.filter((x) => x.rating >= 4)); }
        if (alive) setAgg({ total, average: total ? sum / total : 0, quotes: quotes.sort((a, b) => b.rating - a.rating).slice(0, 3) });
      } catch { if (alive) setAgg({ total: 0, average: 0, quotes: [] }); }
    })();
    return () => { alive = false; };
  }, [store.key, store.env]);
  if (!agg || !agg.total) return null;
  const title = typeof props.title === "string" && props.title ? props.title : `Loved by ${agg.total.toLocaleString()} ${agg.total === 1 ? "customer" : "customers"}`;
  return (
    <section className="py-10 border-y border-rule" aria-label="Happy customers">
      <div className="container-x flex flex-col md:flex-row md:items-center gap-8">
        <div className="md:w-1/3">
          <div className="flex items-center gap-2"><Stars rating={agg.average} size={16} /><strong>{agg.average.toFixed(1)}</strong></div>
          <p className="display text-2xl mt-2">{title}</p>
          <p className="text-xs text-muted mt-1">From verified reviews across the collection.</p>
        </div>
        <ul className="md:w-2/3 grid sm:grid-cols-3 gap-4">
          {agg.quotes.map((q) => <li key={q.id} className="text-sm"><p className="display leading-snug">“{q.body.length > 110 ? `${q.body.slice(0, 107)}…` : q.body}”</p><p className="text-xs text-muted mt-2">— {q.authorName}</p></li>)}
        </ul>
      </div>
    </section>
  );
}
