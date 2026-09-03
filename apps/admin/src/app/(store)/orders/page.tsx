"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Sparkles } from "lucide-react";
import { useStore, useStoreQuery } from "@/lib/store-context";
import { useAi } from "@/lib/ai-context";
import { fmtDateTime, fmtNumber, money } from "@/lib/utils";
import type { Order, Paginated } from "@/lib/types";
import { Page } from "@/components/shell/shell";
import { Button, EmptyState, ErrorBox, Input, Loading, Pagination, Select, StatTiles, StatusBadge, Table, Tabs, Td, Th, Tr, useDebounce } from "@/components/ui";

type Tab = "all" | "open" | "completed" | "cancelled";

export default function OrdersPage() {
  const router = useRouter();
  const { store } = useStore();
  const { open } = useAi();
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");
  const [financial, setFinancial] = useState("");
  const [fulfillment, setFulfillment] = useState("");
  const [page, setPage] = useState(1);
  const dq = useDebounce(q);
  const stats = useStoreQuery<{ total: number; revenueCents: number; unfulfilled: number }>(["orders-stats"], "/orders/stats");
  const list = useStoreQuery<Paginated<Order>>(["orders"], "/orders", { query: { page, pageSize: 25, q: dq, status: tab, financial, fulfillment } });
  const cur = store?.defaultCurrency;

  return (
    <Page wide>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div><div className="eyebrow mb-1">Commerce</div><h1 className="font-display text-[26px] leading-tight">Orders</h1></div>
        <div className="flex gap-2">
          <Button icon={<Sparkles size={13} className="text-accent" />} onClick={() => open("Summarise today's orders")}>Summarise today</Button>
          <Button icon={<Sparkles size={13} className="text-accent" />} onClick={() => open("Fulfil every unfulfilled paid order that has all items in stock")}>Fulfil all paid</Button>
        </div>
      </div>
      <StatTiles cols={3} items={[{ label: "Orders", value: fmtNumber(stats.data?.total ?? 0) }, { label: "Revenue", value: money(stats.data?.revenueCents ?? 0, cur) }, { label: "Awaiting fulfilment", value: fmtNumber(stats.data?.unfulfilled ?? 0) }]} />
      <div className="card mt-4">
        <div className="flex flex-wrap items-center gap-2 px-3 pt-1">
          <Tabs value={tab} onChange={(v) => { setTab(v); setPage(1); }} items={[{ value: "all", label: "All" }, { value: "open", label: "Open" }, { value: "completed", label: "Completed" }, { value: "cancelled", label: "Cancelled" }]} className="!border-b-0" />
          <span className="flex-1" />
          <Select value={financial} onChange={(e) => { setFinancial(e.target.value); setPage(1); }} className="!h-7 !w-36 !text-xs"><option value="">Any payment</option>{["paid", "pending", "authorized", "partially_refunded", "refunded"].map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}</Select>
          <Select value={fulfillment} onChange={(e) => { setFulfillment(e.target.value); setPage(1); }} className="!h-7 !w-36 !text-xs"><option value="">Any fulfilment</option>{["unfulfilled", "partial", "fulfilled", "returned"].map((s) => <option key={s} value={s}>{s}</option>)}</Select>
          <div className="relative w-full sm:w-56"><Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" /><Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Order # or email" className="!pl-8" /></div>
        </div>
        {list.isError && <div className="p-3"><ErrorBox error={list.error} retry={() => list.refetch()} /></div>}
        {list.isLoading && <Loading />}
        {list.data && list.data.items.length === 0 && <EmptyState title="No orders here" body={dq || financial || fulfillment ? "Try loosening the filters." : "Orders appear the moment a customer checks out."} />}
        {list.data && list.data.items.length > 0 && (
          <Table>
            <thead><tr><Th>Order</Th><Th>Customer</Th><Th right>Total</Th><Th>Payment</Th><Th>Fulfilment</Th><Th right>Items</Th><Th>Date</Th></tr></thead>
            <tbody>
              {list.data.items.map((o) => (
                <Tr key={o.id} onClick={() => router.push(`/orders/${o.id}`)}>
                  <Td><span className="font-medium">#{o.number}</span>{o.tags.length > 0 && <span className="ml-1 text-[10px] text-muted">{o.tags.join(", ")}</span>}</Td>
                  <Td><div>{o.shippingAddress ? `${o.shippingAddress.firstName} ${o.shippingAddress.lastName}`.trim() : "—"}</div><div className="text-[11px] text-muted">{o.email}</div></Td>
                  <Td right className="font-medium">{money(o.totalCents, o.currency)}</Td>
                  <Td><StatusBadge status={o.financialStatus} /></Td>
                  <Td><StatusBadge status={o.fulfillmentStatus} /></Td>
                  <Td right>{o.items.reduce((n, i) => n + i.quantity, 0)}</Td>
                  <Td className="text-muted">{fmtDateTime(o.createdAt)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        {list.data && <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onChange={setPage} />}
      </div>
    </Page>
  );
}
