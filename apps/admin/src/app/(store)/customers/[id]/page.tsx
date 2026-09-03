"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Sparkles, Trash2 } from "lucide-react";
import { useStore, useStoreQuery } from "@/lib/store-context";
import { useStoreMutation } from "@/lib/hooks";
import { useAi } from "@/lib/ai-context";
import { fmtDate, fmtDateTime, money } from "@/lib/utils";
import type { Customer, Subscription } from "@/lib/types";
import type { Address } from "@kiln/shared";
import { Page } from "@/components/shell/shell";
import { Button, Card, Chips, ConfirmDialog, ErrorBox, Field, Input, Loading, Menu, StatTiles, StatusBadge, Table, Td, Th, Toggle, Tr } from "@/components/ui";

export default function CustomerPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { store } = useStore();
  const { open } = useAi();
  const q = useStoreQuery<Customer>(["customer", id], `/customers/${id}`);
  const subs = useStoreQuery<{ items: Subscription[] }>(["customer-subs", id], `/customers/${id}/subscriptions`);
  const c = q.data;
  const [f, setF] = useState({ firstName: "", lastName: "", phone: "", acceptsMarketing: false, tags: [] as string[], netTermsDays: "", priceListId: "", gatedCatalog: false, addresses: [] as Address[] });
  useEffect(() => { if (c) setF({ firstName: c.firstName, lastName: c.lastName, phone: c.phone ?? "", acceptsMarketing: c.acceptsMarketing, tags: c.tags, netTermsDays: c.b2b?.netTermsDays ? String(c.b2b.netTermsDays) : "", priceListId: c.b2b?.priceListId ?? "", gatedCatalog: c.b2b?.gatedCatalog ?? false, addresses: c.addresses }); }, [c]);
  const save = useStoreMutation((sapi) => sapi(`/customers/${id}`, { method: "PATCH", body: { firstName: f.firstName, lastName: f.lastName, phone: f.phone || undefined, acceptsMarketing: f.acceptsMarketing, tags: f.tags, addresses: f.addresses, b2b: f.netTermsDays || f.priceListId || f.gatedCatalog ? { netTermsDays: f.netTermsDays ? Number(f.netTermsDays) : undefined, priceListId: f.priceListId || undefined, gatedCatalog: f.gatedCatalog } : undefined } }), { success: "Customer saved" });
  const remove = useStoreMutation((sapi) => sapi(`/customers/${id}`, { method: "DELETE" }), { success: "Customer deleted", onSuccess: () => router.replace("/customers") });
  const subAction = useStoreMutation((sapi, v: { sid: string; action: string; cadence?: string }) => sapi(`/subscriptions/${v.sid}/${v.action}`, { method: "POST", body: { cadence: v.cadence } }), { success: (_, v) => `Subscription ${v.action.replace("_", " ")}d` });
  const [del, setDel] = useState(false);
  const setAddr = (i: number, patch: Partial<Address>) => setF({ ...f, addresses: f.addresses.map((a, j) => (j === i ? { ...a, ...patch } : a)) });

  if (q.isError) return <Page><ErrorBox error={q.error} retry={() => q.refetch()} /></Page>;
  if (!c) return <Page><Loading /></Page>;
  return (
    <Page>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link href="/customers" className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink"><ArrowLeft size={13} /> Customers</Link>
        <h1 className="font-display min-w-0 flex-1 truncate text-[24px] leading-tight">{`${c.firstName} ${c.lastName}`.trim() || c.email}</h1>
        <StatusBadge status={c.segment} />
        <Button variant="danger" icon={<Trash2 size={13} />} onClick={() => setDel(true)}>Delete</Button>
        <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>Save</Button>
      </div>
      <StatTiles cols={4} items={[{ label: "Orders", value: c.ordersCount }, { label: "Lifetime spend", value: money(c.totalSpentCents, store?.defaultCurrency) }, { label: "Last order", value: fmtDate(c.lastOrderAt) }, { label: "Customer since", value: fmtDate(c.createdAt) }]} />
      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Card title="Orders" padded={false}>
            {(c.orders ?? []).length === 0 ? <div className="px-4 py-6 text-center text-[11px] text-muted">No orders yet.</div> : (
              <Table>
                <thead><tr><Th>Order</Th><Th right>Total</Th><Th>Payment</Th><Th>Fulfilment</Th><Th>Date</Th></tr></thead>
                <tbody>{c.orders!.map((o) => <Tr key={o.id} onClick={() => router.push(`/orders/${o.id}`)}><Td className="font-medium">#{o.number}</Td><Td right>{money(o.totalCents, o.currency)}</Td><Td><StatusBadge status={o.financialStatus} /></Td><Td><StatusBadge status={o.fulfillmentStatus} /></Td><Td className="text-muted">{fmtDateTime(o.createdAt)}</Td></Tr>)}</tbody>
              </Table>
            )}
          </Card>
          <Card title="Subscriptions" padded={false}>
            {(subs.data?.items ?? []).length === 0 ? <div className="px-4 py-6 text-center text-[11px] text-muted">No subscriptions.</div> : (
              <Table>
                <thead><tr><Th>Status</Th><Th>Cadence</Th><Th right>Price</Th><Th>Next billing</Th><Th /></tr></thead>
                <tbody>
                  {subs.data!.items.map((s) => (
                    <Tr key={s.id}>
                      <Td><StatusBadge status={s.status} /></Td><Td>{s.cadence} × {s.quantity}</Td><Td right>{money(s.priceCents, s.currency)}</Td><Td className="text-muted">{fmtDate(s.nextBillingAt)}{s.trialEndsAt ? ` · trial ends ${fmtDate(s.trialEndsAt)}` : ""}</Td>
                      <Td right><Menu trigger={<Button size="xs">Manage</Button>} items={[
                        ...(s.status === "paused" ? [{ label: "Resume", onClick: () => subAction.mutate({ sid: s.id, action: "resume" }) }] : [{ label: "Pause", onClick: () => subAction.mutate({ sid: s.id, action: "pause" }) }]),
                        ...["weekly", "monthly", "quarterly", "annual"].filter((cd) => cd !== s.cadence).map((cd) => ({ label: `Switch to ${cd}`, onClick: () => subAction.mutate({ sid: s.id, action: "change_cadence", cadence: cd }) })),
                        { label: "Cancel", danger: true, onClick: () => subAction.mutate({ sid: s.id, action: "cancel" }) },
                      ]} /></Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
          <Card title="Addresses" action={<Button size="xs" onClick={() => setF({ ...f, addresses: [...f.addresses, { firstName: f.firstName, lastName: f.lastName, line1: "", city: "", postalCode: "", country: "US" }] })}>Add address</Button>}>
            {f.addresses.length === 0 && <p className="text-[11px] text-muted">No addresses on file.</p>}
            <div className="grid gap-3 sm:grid-cols-2">
              {f.addresses.map((a, i) => (
                <div key={i} className="space-y-1.5 rounded border border-line p-2.5">
                  <div className="grid grid-cols-2 gap-1.5"><Input value={a.firstName} onChange={(e) => setAddr(i, { firstName: e.target.value })} placeholder="First" className="!h-7" /><Input value={a.lastName} onChange={(e) => setAddr(i, { lastName: e.target.value })} placeholder="Last" className="!h-7" /></div>
                  <Input value={a.line1} onChange={(e) => setAddr(i, { line1: e.target.value })} placeholder="Street" className="!h-7" />
                  <div className="grid grid-cols-3 gap-1.5"><Input value={a.city} onChange={(e) => setAddr(i, { city: e.target.value })} placeholder="City" className="!h-7" /><Input value={a.postalCode} onChange={(e) => setAddr(i, { postalCode: e.target.value })} placeholder="Postal" className="!h-7" /><Input value={a.country} onChange={(e) => setAddr(i, { country: e.target.value.toUpperCase().slice(0, 2) })} placeholder="US" className="!h-7" /></div>
                  <button onClick={() => setF({ ...f, addresses: f.addresses.filter((_, j) => j !== i) })} className="text-[10px] text-danger">Remove</button>
                </div>
              ))}
            </div>
          </Card>
        </div>
        <div className="space-y-4">
          <Card title="Profile">
            <div className="space-y-3">
              <Field label="Email"><Input value={c.email} disabled /></Field>
              <div className="grid grid-cols-2 gap-2"><Field label="First name"><Input value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} /></Field><Field label="Last name"><Input value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} /></Field></div>
              <Field label="Phone"><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
              <Toggle checked={f.acceptsMarketing} onChange={(v) => setF({ ...f, acceptsMarketing: v })} label="Accepts marketing" />
              <Field label="Tags"><Chips value={f.tags} onChange={(v) => setF({ ...f, tags: v })} /></Field>
            </div>
          </Card>
          <Card title="B2B" eyebrow="Wholesale terms">
            <div className="space-y-3">
              <Field label="Net terms (days)"><Input type="number" value={f.netTermsDays} onChange={(e) => setF({ ...f, netTermsDays: e.target.value })} placeholder="30" /></Field>
              <Field label="Price list id"><Input value={f.priceListId} onChange={(e) => setF({ ...f, priceListId: e.target.value })} placeholder="wholesale-2026" /></Field>
              <Toggle checked={f.gatedCatalog} onChange={(v) => setF({ ...f, gatedCatalog: v })} label="Gated catalog access" />
            </div>
          </Card>
          <Card title="Assistant shortcuts">
            <div className="flex flex-col gap-1.5">
              {[["Write a personal note", `Draft a short personal email to ${c.email} thanking them for their ${c.ordersCount} orders`], ["Offer a win-back code", `Create a 15% win-back discount code for ${c.email} and draft the email`], ["Summarise history", `Summarise the purchase history of ${c.email}`]].map(([l, p]) => (
                <button key={l} onClick={() => open(p)} className="rounded border border-line bg-card px-2.5 py-1.5 text-left text-xs hover:border-ink"><Sparkles size={11} className="mr-1 inline text-accent" />{l}</button>
              ))}
            </div>
          </Card>
        </div>
      </div>
      <ConfirmDialog open={del} onClose={() => setDel(false)} onConfirm={() => remove.mutate()} loading={remove.isPending} title="Delete this customer?" body="Orders keep their email, but the profile, addresses and tags are removed." confirmLabel="Delete" danger />
    </Page>
  );
}
