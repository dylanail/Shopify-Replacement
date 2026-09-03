"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EllipsisVertical, Plus, Search, Upload, Sparkles } from "lucide-react";
import { useStore, useStoreQuery } from "@/lib/store-context";
import { useStoreMutation } from "@/lib/hooks";
import { useAi } from "@/lib/ai-context";
import { money, fmtNumber } from "@/lib/utils";
import type { Paginated, Product, Variant } from "@/lib/types";
import { Page } from "@/components/shell/shell";
import { Button, ConfirmDialog, EmptyState, ErrorBox, Input, Loading, Menu, Pagination, StatTiles, StatusDot, Table, Tabs, Td, Th, Thumb, Tr, useDebounce } from "@/components/ui";

type Status = "all" | "published" | "draft" | "archived";
interface Stats { total: number; published: number; drafts: number; outOfStock: number; lowStock: Variant[] }

const priceRange = (vs: Variant[], cur?: string) => {
  if (!vs.length) return "—";
  const ps = vs.map((v) => v.priceCents);
  const lo = Math.min(...ps), hi = Math.max(...ps);
  return lo === hi ? money(lo, cur) : `${money(lo, cur)} – ${money(hi, cur)}`;
};

export default function ProductsPage() {
  const router = useRouter();
  const { store } = useStore();
  const { open } = useAi();
  const [status, setStatus] = useState<Status>("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const dq = useDebounce(q);
  const stats = useStoreQuery<Stats>(["products-stats"], "/products/stats");
  const list = useStoreQuery<Paginated<Product>>(["products"], "/products", { query: { page, pageSize: 25, q: dq, status } });
  const [del, setDel] = useState<Product | null>(null);
  const remove = useStoreMutation((sapi, id: string) => sapi(`/products/${id}`, { method: "DELETE" }), { success: "Product deleted", onSuccess: () => setDel(null) });
  const setStatusM = useStoreMutation((sapi, v: { id: string; status: string }) => sapi(`/products/${v.id}`, { method: "PATCH", body: { status: v.status } }), { success: (_, v) => `Product ${v.status}` });
  const s = stats.data;

  return (
    <Page wide>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow mb-1">Catalog</div>
          <h1 className="font-display text-[26px] leading-tight">Products</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button icon={<Sparkles size={13} className="text-accent" />} onClick={() => open("Generate three more products that fit my catalog")}>Generate with AI</Button>
          <Link href="/products/import"><Button icon={<Upload size={13} />}>Import CSV</Button></Link>
          <Link href="/products/new"><Button variant="primary" icon={<Plus size={13} />}>Add product</Button></Link>
        </div>
      </div>
      <StatTiles items={[{ label: "Total products", value: fmtNumber(s?.total ?? 0) }, { label: "Published", value: fmtNumber(s?.published ?? 0) }, { label: "Drafts", value: fmtNumber(s?.drafts ?? 0) }, { label: "Out of stock", value: fmtNumber(s?.outOfStock ?? 0), hint: s?.lowStock.length ? `${s.lowStock.length} at or below reorder point` : undefined }]} />
      <div className="card mt-4">
        <div className="flex flex-wrap items-center gap-3 px-3 pt-1">
          <Tabs value={status} onChange={(v) => { setStatus(v); setPage(1); }} items={[{ value: "all", label: "All", count: s?.total }, { value: "published", label: "Published", count: s?.published }, { value: "draft", label: "Drafts", count: s?.drafts }, { value: "archived", label: "Archived" }]} className="!border-b-0" />
          <div className="relative ml-auto w-full sm:w-64">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
            <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search products…" className="!pl-8" />
          </div>
        </div>
        {list.isError && <div className="p-3"><ErrorBox error={list.error} retry={() => list.refetch()} /></div>}
        {list.isLoading && <Loading />}
        {list.data && list.data.items.length === 0 && <EmptyState title={dq ? "No products match" : "No products yet"} body={dq ? "Try another search." : "Add a product by hand, import a CSV, or ask the assistant to generate a few."} action={<Link href="/products/new"><Button variant="primary">Add product</Button></Link>} />}
        {list.data && list.data.items.length > 0 && (
          <Table>
            <thead><tr><Th>Product</Th><Th>Status</Th><Th right>Inventory</Th><Th right>Price</Th><Th /></tr></thead>
            <tbody>
              {list.data.items.map((p) => {
                const inv = p.variants.reduce((n, v) => n + v.inventoryQty, 0);
                const oos = p.variants.some((v) => v.inventoryQty <= 0 && !v.allowBackorder);
                return (
                  <Tr key={p.id} onClick={() => router.push(`/products/${p.id}`)}>
                    <Td>
                      <div className="flex items-center gap-3">
                        <Thumb src={p.media[0]?.url} alt={p.media[0]?.alt} />
                        <div className="min-w-0">
                          <div className="truncate font-medium">{p.title}</div>
                          <div className="truncate text-[11px] text-muted">{p.variants.length === 1 ? (p.variants[0]?.sku ?? "1 variant") : `${p.variants.length} variants · ${p.options.map((o) => o.name).join(", ")}`}</div>
                        </div>
                      </div>
                    </Td>
                    <Td><span className="inline-flex items-center gap-1.5 text-xs"><StatusDot tone={p.status === "published" ? "green" : p.status === "archived" ? "red" : "neutral"} />{p.status}</span></Td>
                    <Td right className={oos ? "text-danger" : ""}>{inv} in stock{oos ? " · out" : ""}</Td>
                    <Td right>{priceRange(p.variants, store?.defaultCurrency)}</Td>
                    <Td right>
                      <Menu trigger={<button className="rounded p-1 text-muted hover:bg-sand hover:text-ink"><EllipsisVertical size={14} /></button>} items={[
                        { label: "Edit", onClick: () => router.push(`/products/${p.id}`) },
                        { label: p.status === "published" ? "Unpublish" : "Publish", onClick: () => setStatusM.mutate({ id: p.id, status: p.status === "published" ? "draft" : "published" }) },
                        { label: p.status === "archived" ? "Unarchive" : "Archive", onClick: () => setStatusM.mutate({ id: p.id, status: p.status === "archived" ? "draft" : "archived" }) },
                        { label: "Generate images", onClick: () => open(`Enhance the images for "${p.title}" in the lifestyle preset`) },
                        { label: "Delete", danger: true, onClick: () => setDel(p) },
                      ]} />
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
        {list.data && <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onChange={setPage} />}
      </div>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={() => del && remove.mutate(del.id)} loading={remove.isPending} title={`Delete “${del?.title}”?`} body="This permanently removes the product and its variants. Orders keep their line items." confirmLabel="Delete" danger />
    </Page>
  );
}
