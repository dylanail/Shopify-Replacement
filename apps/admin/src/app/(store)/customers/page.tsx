"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Sparkles } from "lucide-react";
import { useStore, useStoreQuery } from "@/lib/store-context";
import { useStoreMutation } from "@/lib/hooks";
import { useAi } from "@/lib/ai-context";
import { cn, fmtDate, money, titleCase } from "@/lib/utils";
import type { Customer, Paginated } from "@/lib/types";
import { Page } from "@/components/shell/shell";
import { Badge, Button, Dialog, EmptyState, ErrorBox, Field, Input, Loading, Pagination, StatusBadge, Table, Td, Th, Toggle, Tr, useDebounce } from "@/components/ui";

const SEGMENTS = ["prospect", "new", "returning", "vip", "at_risk", "at_risk_vip"];

export default function CustomersPage() {
  const router = useRouter();
  const { store } = useStore();
  const { open } = useAi();
  const [segment, setSegment] = useState("");
  const [marketing, setMarketing] = useState(false);
  const [sort, setSort] = useState<"" | "spent">("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const dq = useDebounce(q);
  const segs = useStoreQuery<Record<string, number>>(["customer-segments"], "/customers/segments");
  const list = useStoreQuery<Paginated<Customer>>(["customers"], "/customers", { query: { page, pageSize: 25, q: dq, segment, marketing: marketing ? "true" : "", sort } });
  const [add, setAdd] = useState(false);
  const [nf, setNf] = useState({ email: "", firstName: "", lastName: "", acceptsMarketing: false });
  const create = useStoreMutation((sapi) => sapi<{ customer: Customer }>("/customers", { method: "POST", body: nf }), { success: "Customer added", onSuccess: (r) => { setAdd(false); router.push(`/customers/${r.customer.id}`); } });
  const total = Object.values(segs.data ?? {}).reduce((a, b) => a + b, 0);

  return (
    <Page wide>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div><div className="eyebrow mb-1">Commerce</div><h1 className="font-display text-[26px] leading-tight">Customers</h1></div>
        <div className="flex gap-2">
          <Button icon={<Sparkles size={13} className="text-accent" />} onClick={() => open("Show my VIP customers and suggest a win-back offer for the at-risk ones")}>Ask about segments</Button>
          <Button variant="primary" icon={<Plus size={13} />} onClick={() => setAdd(true)}>Add customer</Button>
        </div>
      </div>
      <div className="card">
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-line bg-card px-3 py-2">
          <button onClick={() => { setSegment(""); setPage(1); }} className={cn("rounded-full border px-2.5 py-0.5 text-[11px]", !segment ? "border-ink bg-ink text-white" : "border-line text-muted hover:text-ink")}>All {total}</button>
          {SEGMENTS.map((s) => <button key={s} onClick={() => { setSegment(s); setPage(1); }} className={cn("rounded-full border px-2.5 py-0.5 text-[11px]", segment === s ? "border-ink bg-ink text-white" : "border-line text-muted hover:text-ink")}>{titleCase(s)} {segs.data?.[s] ?? 0}</button>)}
          <span className="flex-1" />
          <Toggle checked={marketing} onChange={(v) => { setMarketing(v); setPage(1); }} label="Marketing opt-in" />
          <Toggle checked={sort === "spent"} onChange={(v) => setSort(v ? "spent" : "")} label="Sort by spend" />
          <div className="relative w-full sm:w-56"><Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" /><Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Name or email" className="!pl-8" /></div>
        </div>
        {list.isError && <div className="p-3"><ErrorBox error={list.error} retry={() => list.refetch()} /></div>}
        {list.isLoading && <Loading />}
        {list.data && list.data.items.length === 0 && <EmptyState title="No customers here" body="Customers are created at checkout, by import, or by hand." />}
        {list.data && list.data.items.length > 0 && (
          <Table>
            <thead><tr><Th>Customer</Th><Th>Segment</Th><Th right>Orders</Th><Th right>Spent</Th><Th>Last order</Th><Th>Marketing</Th><Th>Tags</Th></tr></thead>
            <tbody>
              {list.data.items.map((c) => (
                <Tr key={c.id} onClick={() => router.push(`/customers/${c.id}`)}>
                  <Td><div className="font-medium">{`${c.firstName} ${c.lastName}`.trim() || "—"}</div><div className="text-[11px] text-muted">{c.email}</div></Td>
                  <Td><StatusBadge status={c.segment} /></Td>
                  <Td right>{c.ordersCount}</Td>
                  <Td right className="font-medium">{money(c.totalSpentCents, store?.defaultCurrency)}</Td>
                  <Td className="text-muted">{fmtDate(c.lastOrderAt)}</Td>
                  <Td>{c.acceptsMarketing ? <Badge tone="green">subscribed</Badge> : <span className="text-[11px] text-muted">no</span>}</Td>
                  <Td className="text-[11px] text-muted">{c.tags.join(", ")}{c.b2b ? <Badge tone="teal" className="ml-1">B2B</Badge> : null}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        {list.data && <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onChange={setPage} />}
      </div>
      <Dialog open={add} onClose={() => setAdd(false)} title="Add customer" width="max-w-sm" footer={<><Button variant="ghost" onClick={() => setAdd(false)}>Cancel</Button><Button variant="primary" loading={create.isPending} disabled={!nf.email} onClick={() => create.mutate()}>Add</Button></>}>
        <div className="space-y-3">
          <Field label="Email" required><Input type="email" value={nf.email} onChange={(e) => setNf({ ...nf, email: e.target.value })} autoFocus /></Field>
          <div className="grid grid-cols-2 gap-2"><Field label="First name"><Input value={nf.firstName} onChange={(e) => setNf({ ...nf, firstName: e.target.value })} /></Field><Field label="Last name"><Input value={nf.lastName} onChange={(e) => setNf({ ...nf, lastName: e.target.value })} /></Field></div>
          <Toggle checked={nf.acceptsMarketing} onChange={(v) => setNf({ ...nf, acceptsMarketing: v })} label="Accepts marketing" />
        </div>
      </Dialog>
    </Page>
  );
}
