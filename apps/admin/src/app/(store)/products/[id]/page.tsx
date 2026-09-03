"use client";

import { useParams } from "next/navigation";
import { useStoreQuery } from "@/lib/store-context";
import type { Product } from "@/lib/types";
import { ProductEditor } from "@/components/products/editor";
import { Page } from "@/components/shell/shell";
import { ErrorBox, Loading } from "@/components/ui";

export default function ProductPage() {
  const { id } = useParams<{ id: string }>();
  const q = useStoreQuery<Product>(["product", id], `/products/${id}`);
  if (q.isError) return <Page><ErrorBox error={q.error} retry={() => q.refetch()} /></Page>;
  if (!q.data) return <Page><Loading /></Page>;
  return <ProductEditor product={q.data} />;
}
