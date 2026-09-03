"use client";
import { useEffect, useState } from "react";
import type { SlotComponentProps } from "../Slot";
import type { ReviewStats, ReviewsResponse } from "@/lib/types";
import { Stars } from "@/components/ui/Stars";
import { api } from "@/lib/client-api";
import { useStore } from "@/components/providers/StoreProvider";

/** "★★★★★ 4.9 · 892 reviews" above the title; links to the review wall. */
export function ReviewBadge({ ctx }: SlotComponentProps) {
  const store = useStore();
  const product = ctx.product;
  const initial = product && "reviews" in product ? product.reviews : null;
  const [stats, setStats] = useState<ReviewStats | null>(initial);
  useEffect(() => {
    if (stats || !product) return;
    api<ReviewsResponse>(store.key, `/products/${encodeURIComponent(product.handle)}/reviews`, { env: store.env }).then((r) => setStats(r.stats)).catch(() => undefined);
  }, [stats, product, store.key, store.env]);
  if (!stats || !stats.total) return null;
  return (
    <a href="#reviews" className="inline-flex items-center gap-2 text-xs hover:underline underline-offset-4">
      <Stars rating={stats.average} size={13} />
      <span className="font-semibold">{stats.average.toFixed(1)}</span>
      <span className="text-muted">{stats.total} {stats.total === 1 ? "review" : "reviews"}</span>
    </a>
  );
}
