"use client";

import { useState } from "react";
import { Gift, Plus, RefreshCw, Sparkles, Trash2, X } from "lucide-react";
import { useStore, useStoreQuery } from "@/lib/store-context";
import { useStoreMutation } from "@/lib/hooks";
import { useAi } from "@/lib/ai-context";
import { centsToInput, cn, fmtDate, inputToCents, money, titleCase } from "@/lib/utils";
import type { Collection, GiftCard, MerchConfig, Paginated, Product, Promotion, Region } from "@/lib/types";
import { Page } from "@/components/shell/shell";
import { Badge, Button, Checkbox, ConfirmDialog, Dialog, EmptyState, Field, Input, Loading, Menu, PageHeader, SegmentedControl, Select, StatusBadge, Table, Tabs, Td, Th, Toggle, Tr } from "@/components/ui";

type Tab = "promotions" | "bundle" | "upsell" | "cross_sell" | "gift";
const TYPES = [["percentage", "Percentage off"], ["fixed", "Fixed amount off"], ["free_shipping", "Free shipping"], ["bogo", "Buy X get Y"], ["bundle", "Bundle tiers"]] as const;

interface PromoForm { name: string; kind: "code" | "automatic"; code: string; type: Promotion["type"]; value: string; minSubtotal: string; minQuantity: string; maxDiscount: string; productIds: string[]; collectionIds: string[]; buyQuantity: string; getQuantity: string; getPercentOff: string; tiers: { quantity: string; percentOff: string }[]; regionIds: string[]; usageLimit: string; perCustomerLimit: string; stackable: boolean; status: string; startsAt: string; endsAt: string }
const blank: PromoForm = { name: "", kind: "code", code: "", type: "percentage", value: "10", minSubtotal: "", minQuantity: "", maxDiscount: "", productIds: [], collectionIds: [], buyQuantity: "2", getQuantity: "1", getPercentOff: "100", tiers: [{ quantity: "2", percentOff: "10" }, { quantity: "3", percentOff: "15" }], regionIds: [], usageLimit: "", perCustomerLimit: "", stackable: false, status: "active", startsAt: "", endsAt: "" };
const toForm = (p: Promotion): PromoForm => ({ name: p.name, kind: p.kind, code: p.code ?? "", type: p.type, value: p.type === "fixed" ? centsToInput(p.value) : String(p.value), minSubtotal: p.minSubtotalCents ? centsToInput(p.minSubtotalCents) : "", minQuantity: p.minQuantity ? String(p.minQuantity) : "", maxDiscount: p.maxDiscountCents ? centsToInput(p.maxDiscountCents) : "", productIds: p.appliesTo.productIds ?? [], collectionIds: p.appliesTo.collectionIds ?? [], buyQuantity: String(p.bogo?.buyQuantity ?? 2), getQuantity: String(p.bogo?.getQuantity ?? 1), getPercentOff: String(p.bogo?.getPercentOff ?? 100), tiers: (p.bundle?.tiers ?? [{ quantity: 2, percentOff: 10 }]).map((t) => ({ quantity: String(t.quantity), percentOff: String(t.percentOff) })), regionIds: p.regionIds, usageLimit: p.usageLimit ? String(p.usageLimit) : "", perCustomerLimit: p.perCustomerLimit ? String(p.perCustomerLimit) : "", stackable: p.stackable, status: p.status, startsAt: p.startsAt ? p.startsAt.slice(0, 16) : "", endsAt: p.endsAt ? p.endsAt.slice(0, 16) : "" });
const toBody = (f: PromoForm) => ({
  name: f.name, kind: f.kind, code: f.kind === "code" ? f.code || f.name : null, type: f.type, value: f.type === "fixed" ? inputToCents(f.value) : Number(f.value) || 0,
  minSubtotalCents: f.minSubtotal ? inputToCents(f.minSubtotal) : 0, minQuantity: Number(f.minQuantity) || 0, maxDiscountCents: f.maxDiscount ? inputToCents(f.maxDiscount) : null,
  appliesTo: { productIds: f.productIds, collectionIds: f.collectionIds },
  bogo: f.type === "bogo" ? { buyQuantity: Number(f.buyQuantity), getQuantity: Number(f.getQuantity), getPercentOff: Number(f.getPercentOff) } : undefined,
  bundle: f.type === "bundle" ? { tiers: f.tiers.map((t) => ({ quantity: Number(t.quantity), percentOff: Number(t.percentOff) })) } : undefined,
  regionIds: f.regionIds, usageLimit: f.usageLimit ? Number(f.usageLimit) : null, perCustomerLimit: f.perCustomerLimit ? Number(f.perCustomerLimit) : null, stackable: f.stackable, status: f.status,
  startsAt: f.startsAt ? new Date(f.startsAt).toISOString() : null, endsAt: f.endsAt ? new Date(f.endsAt).toISOString() : null,
});

function describe(p: Promotion, cur?: string) {
  switch (p.type) {
    case "percentage": return `${p.value}% off`;
    case "fixed": return `${money(p.value, cur)} off`;
    case "free_shipping": return `Free shipping${p.minSubtotalCents ? ` over ${money(p.minSubtotalCents, cur)}` : ""}`;
    case "bogo": return `Buy ${p.bogo?.buyQuantity} get ${p.bogo?.getQuantity} at ${p.bogo?.getPercentOff}% off`;
    case "bundle": return (p.bundle?.tiers ?? []).map((t) => `${t.quantity}+ → ${t.percentOff}%`).join(" · ");
  }
}

function ScopePicker({ productIds, collectionIds, onChange }: { productIds: string[]; collectionIds: string[]; onChange: (p: string[], c: string[]) => void }) {
  const products = useStoreQuery<Paginated<Product>>(["products"], "/products", { query: { pageSize: 100 } });
  const collections = useStoreQuery<{ items: Collection[] }>(["collections"], "/collections");
  const scoped = productIds.length + collectionIds.length > 0;
  return (
    <div>
      <SegmentedControl value={scoped ? "some" : "all"} onChange={(v) => v === "all" && onChange([], [])} items={[{ value: "all", label: "Whole catalog" }, { value: "some", label: "Specific products / collections" }]} />
      {(scoped || true) && (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <div className="max-h-40 overflow-y-auto rounded border border-line p-2"><div className="eyebrow mb-1">Collections</div>{(collections.data?.items ?? []).map((c) => <Checkbox key={c.id} className="block py-0.5" checked={collectionIds.includes(c.id)} onChange={(v) => onChange(productIds, v ? [...collectionIds, c.id] : collectionIds.filter((x) => x !== c.id))} label={c.title} />)}</div>
          <div className="max-h-40 overflow-y-auto rounded border border-line p-2"><div className="eyebrow mb-1">Products</div>{(products.data?.items ?? []).map((p) => <Checkbox key={p.id} className="block py-0.5" checked={productIds.includes(p.id)} onChange={(v) => onChange(v ? [...productIds, p.id] : productIds.filter((x) => x !== p.id), collectionIds)} label={p.title} />)}</div>
        </div>
      )}
    </div>
  );
}

function PromoDialog({ initial, onClose }: { initial: { id?: string; form: PromoForm } | null; onClose: () => void }) {
  const [f, setF] = useState<PromoForm>(initial?.form ?? blank);
  const { store } = useStore();
  const regions = useStoreQuery<{ items: Region[] }>(["regions"], "/regions");
  const save = useStoreMutation((sapi) => (initial?.id ? sapi(`/promotions/${initial.id}`, { method: "PATCH", body: toBody(f) }) : sapi("/promotions", { method: "POST", body: toBody(f) })), { success: initial?.id ? "Promotion saved" : "Promotion created", onSuccess: onClose });
  const cur = store?.defaultCurrency ?? "USD";
  return (
    <Dialog open={!!initial} onClose={onClose} title={initial?.id ? "Edit promotion" : "New promotion"} width="max-w-2xl" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={save.isPending} disabled={!f.name.trim()} onClick={() => save.mutate()}>{initial?.id ? "Save" : "Create"}</Button></>}>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" required><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Welcome offer" autoFocus /></Field>
          <Field label="Type"><Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as Promotion["type"], stackable: e.target.value === "free_shipping" })}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="How it applies"><SegmentedControl value={f.kind} onChange={(v) => setF({ ...f, kind: v })} items={[{ value: "code", label: "Discount code" }, { value: "automatic", label: "Automatic" }]} /></Field>
          {f.kind === "code" && <Field label="Code" hint="Uppercase letters, digits, - and _"><Input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} placeholder="WELCOME10" className="font-mono" /></Field>}
        </div>
        {(f.type === "percentage" || f.type === "fixed") && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={f.type === "percentage" ? "Percent off" : `Amount off (${cur})`}><Input value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} inputMode="decimal" /></Field>
            <Field label={`Max discount (${cur}, optional)`}><Input value={f.maxDiscount} onChange={(e) => setF({ ...f, maxDiscount: e.target.value })} inputMode="decimal" /></Field>
            <Field label={`Min subtotal (${cur})`}><Input value={f.minSubtotal} onChange={(e) => setF({ ...f, minSubtotal: e.target.value })} inputMode="decimal" /></Field>
          </div>
        )}
        {f.type === "free_shipping" && <Field label={`Free shipping over (${cur}, blank = always)`}><Input value={f.minSubtotal} onChange={(e) => setF({ ...f, minSubtotal: e.target.value })} inputMode="decimal" /></Field>}
        {f.type === "bogo" && (
          <div className="grid grid-cols-3 gap-3">
            <Field label="Buy quantity"><Input type="number" min={1} value={f.buyQuantity} onChange={(e) => setF({ ...f, buyQuantity: e.target.value })} /></Field>
            <Field label="Get quantity"><Input type="number" min={1} value={f.getQuantity} onChange={(e) => setF({ ...f, getQuantity: e.target.value })} /></Field>
            <Field label="% off the free ones"><Input type="number" min={1} max={100} value={f.getPercentOff} onChange={(e) => setF({ ...f, getPercentOff: e.target.value })} /></Field>
          </div>
        )}
        {f.type === "bundle" && (
          <div>
            <div className="mb-1 flex items-center justify-between"><span className="text-xs font-medium">Tiers</span><Button size="xs" icon={<Plus size={11} />} onClick={() => setF({ ...f, tiers: [...f.tiers, { quantity: "", percentOff: "" }] })}>Add tier</Button></div>
            <div className="space-y-1.5">{f.tiers.map((t, i) => <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2 text-xs"><Input type="number" value={t.quantity} onChange={(e) => setF({ ...f, tiers: f.tiers.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)) })} placeholder="Qty" /><Input type="number" value={t.percentOff} onChange={(e) => setF({ ...f, tiers: f.tiers.map((x, j) => (j === i ? { ...x, percentOff: e.target.value } : x)) })} placeholder="% off" /><button onClick={() => setF({ ...f, tiers: f.tiers.filter((_, j) => j !== i) })} className="text-muted hover:text-danger"><X size={13} /></button></div>)}</div>
          </div>
        )}
        <Field label="Scope"><ScopePicker productIds={f.productIds} collectionIds={f.collectionIds} onChange={(p, c) => setF({ ...f, productIds: p, collectionIds: c })} /></Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Min quantity"><Input type="number" value={f.minQuantity} onChange={(e) => setF({ ...f, minQuantity: e.target.value })} /></Field>
          <Field label="Usage limit"><Input type="number" value={f.usageLimit} onChange={(e) => setF({ ...f, usageLimit: e.target.value })} placeholder="∞" /></Field>
          <Field label="Per customer"><Input type="number" value={f.perCustomerLimit} onChange={(e) => setF({ ...f, perCustomerLimit: e.target.value })} placeholder="∞" /></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Starts"><Input type="datetime-local" value={f.startsAt} onChange={(e) => setF({ ...f, startsAt: e.target.value })} /></Field>
          <Field label="Ends"><Input type="datetime-local" value={f.endsAt} onChange={(e) => setF({ ...f, endsAt: e.target.value })} /></Field>
          <Field label="Status"><Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>{["active", "scheduled", "expired", "disabled"].map((s) => <option key={s} value={s}>{s}</option>)}</Select></Field>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Toggle checked={f.stackable} onChange={(v) => setF({ ...f, stackable: v })} label="Stacks with other promotions" />
          {(regions.data?.items ?? []).length > 1 && <Field label="Regions (blank = all)"><div className="flex flex-wrap gap-1">{regions.data!.items.map((r) => <button key={r.id} type="button" onClick={() => setF({ ...f, regionIds: f.regionIds.includes(r.id) ? f.regionIds.filter((x) => x !== r.id) : [...f.regionIds, r.id] })} className={cn("rounded-full border px-2 py-0.5 text-[11px]", f.regionIds.includes(r.id) ? "border-ink bg-ink text-white" : "border-line text-muted")}>{r.name}</button>)}</div></Field>}
        </div>
      </div>
    </Dialog>
  );
}

function MerchTab({ kind }: { kind: "bundle" | "upsell" | "cross_sell" }) {
  const q = useStoreQuery<{ items: MerchConfig[]; components: Record<string, string[]> }>(["merch", kind], "/merch", { query: { kind } });
  const products = useStoreQuery<Paginated<Product>>(["products"], "/products", { query: { pageSize: 100 } });
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ component: "", placement: "pdpBelowAddToCart", title: "", productIds: [] as string[], tiers: [{ quantity: "2", percentOff: "10" }, { quantity: "3", percentOff: "15" }] });
  const create = useStoreMutation((sapi) => sapi("/merch", { method: "POST", body: { kind, component: f.component, placement: f.placement, title: f.title, productIds: f.productIds, tiers: kind === "bundle" ? f.tiers.map((t) => ({ quantity: Number(t.quantity), percentOff: Number(t.percentOff) })) : undefined } }), { success: "Created", invalidate: "merch", onSuccess: () => setOpen(false) });
  const toggle = useStoreMutation((sapi, v: { id: string; enabled: boolean }) => sapi(`/merch/${v.id}`, { method: "PATCH", body: { enabled: v.enabled } }), { invalidate: "merch" });
  const remove = useStoreMutation((sapi, id: string) => sapi(`/merch/${id}`, { method: "DELETE" }), { success: "Removed", invalidate: "merch" });
  const rebuild = useStoreMutation((sapi) => sapi<{ orders: number; pairs: number }>("/merch/rebuild-affinity", { method: "POST" }), { success: (r) => `Affinity rebuilt from ${r.orders} orders · ${r.pairs} pairs`, invalidate: false });
  const comps = q.data?.components[kind] ?? [];
  const placements = ["pdpBelowAddToCart", "pdpBelowDescription", "pdpEnd", "cartDrawerEnd", "thankYouEnd", "homeSections", "collectionTop"];
  const label = { bundle: "Bundles", upsell: "Upsells", cross_sell: "Cross-sells" }[kind];
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">{kind === "bundle" ? "Tiered “buy more, save more” packs. Creating one also creates the automatic promotion behind it." : kind === "upsell" ? "Shown on product pages and in the cart. Product picks come from purchase affinity when you leave them empty." : "Complements shown after add-to-cart and on the thank-you page."}</p>
        <div className="flex gap-2"><Button size="sm" icon={<RefreshCw size={12} />} loading={rebuild.isPending} onClick={() => rebuild.mutate()}>Rebuild affinity</Button><Button size="sm" variant="primary" icon={<Plus size={12} />} onClick={() => { setF({ ...f, component: comps[0] ?? "" }); setOpen(true); }}>New {label.toLowerCase().slice(0, -1)}</Button></div>
      </div>
      <div className="card">
        {q.isLoading && <Loading />}
        {q.data && q.data.items.length === 0 && <EmptyState title={`No ${label.toLowerCase()} yet`} body={`Pick one of the ${comps.length} storefront components and where it goes.`} />}
        {q.data && q.data.items.length > 0 && (
          <Table>
            <thead><tr><Th>Title</Th><Th>Component</Th><Th>Placement</Th><Th right>Products</Th><Th>Enabled</Th><Th /></tr></thead>
            <tbody>{q.data.items.map((m) => <Tr key={m.id}><Td className="font-medium">{m.title || "—"}</Td><Td className="font-mono text-[11px]">{m.component}</Td><Td className="text-muted">{m.placement}</Td><Td right>{m.productIds.length || "auto"}</Td><Td><Toggle checked={m.enabled} onChange={(v) => toggle.mutate({ id: m.id, enabled: v })} /></Td><Td right><button onClick={() => remove.mutate(m.id)} className="text-muted hover:text-danger"><Trash2 size={13} /></button></Td></Tr>)}</tbody>
          </Table>
        )}
      </div>
      <Dialog open={open} onClose={() => setOpen(false)} title={`New ${label.toLowerCase().slice(0, -1)}`} width="max-w-xl" footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" loading={create.isPending} disabled={!f.component} onClick={() => create.mutate()}>Create</Button></>}>
        <div className="space-y-3">
          <Field label="Title"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder={kind === "bundle" ? "Bundle & save" : "Frequently bought together"} /></Field>
          <Field label="Component" hint="Six storefront components per kind">
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">{comps.map((c) => <button key={c} type="button" onClick={() => setF({ ...f, component: c })} className={cn("rounded border px-2 py-2 text-left text-[11px] font-mono", f.component === c ? "border-ink bg-ink text-white" : "border-line hover:border-ink")}>{c}</button>)}</div>
          </Field>
          <Field label="Placement"><Select value={f.placement} onChange={(e) => setF({ ...f, placement: e.target.value })}>{placements.map((p) => <option key={p} value={p}>{p}</option>)}</Select></Field>
          <Field label="Products (blank = affinity picks)"><div className="max-h-36 overflow-y-auto rounded border border-line p-2">{(products.data?.items ?? []).map((p) => <Checkbox key={p.id} className="block py-0.5" checked={f.productIds.includes(p.id)} onChange={(v) => setF({ ...f, productIds: v ? [...f.productIds, p.id] : f.productIds.filter((x) => x !== p.id) })} label={p.title} />)}</div></Field>
          {kind === "bundle" && <Field label="Tiers"><div className="space-y-1.5">{f.tiers.map((t, i) => <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2"><Input type="number" value={t.quantity} onChange={(e) => setF({ ...f, tiers: f.tiers.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)) })} placeholder="Qty" /><Input type="number" value={t.percentOff} onChange={(e) => setF({ ...f, tiers: f.tiers.map((x, j) => (j === i ? { ...x, percentOff: e.target.value } : x)) })} placeholder="% off" /><button onClick={() => setF({ ...f, tiers: f.tiers.filter((_, j) => j !== i) })} className="text-muted"><X size={13} /></button></div>)}<Button size="xs" onClick={() => setF({ ...f, tiers: [...f.tiers, { quantity: "", percentOff: "" }] })}>Add tier</Button></div></Field>}
        </div>
      </Dialog>
    </div>
  );
}

function GiftCards() {
  const { store } = useStore();
  const q = useStoreQuery<{ items: GiftCard[] }>(["gift-cards"], "/gift-cards");
  const [amt, setAmt] = useState("50");
  const issue = useStoreMutation((sapi) => sapi<GiftCard>("/gift-cards", { method: "POST", body: { amountCents: inputToCents(amt), currency: store?.defaultCurrency ?? "USD" } }), { success: (g) => `Issued ${g.code}`, invalidate: "gift-cards" });
  const disable = useStoreMutation((sapi, id: string) => sapi(`/gift-cards/${id}`, { method: "DELETE" }), { success: "Gift card disabled", invalidate: "gift-cards" });
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <Field label={`Amount (${store?.defaultCurrency ?? "USD"})`} className="w-32"><Input value={amt} onChange={(e) => setAmt(e.target.value)} inputMode="decimal" /></Field>
        <Button variant="primary" icon={<Gift size={13} />} loading={issue.isPending} onClick={() => issue.mutate()}>Issue gift card</Button>
        <span className="text-[11px] text-muted">Codes can be redeemed at checkout; store credit is tracked as balance.</span>
      </div>
      <div className="card">
        {q.isLoading && <Loading />}
        {q.data && q.data.items.length === 0 && <EmptyState title="No gift cards yet" />}
        {q.data && q.data.items.length > 0 && (
          <Table>
            <thead><tr><Th>Code</Th><Th right>Initial</Th><Th right>Balance</Th><Th>Status</Th><Th>Issued</Th><Th /></tr></thead>
            <tbody>{q.data.items.map((g) => <Tr key={g.id}><Td className="font-mono">{g.code}</Td><Td right>{money(g.initialCents, g.currency)}</Td><Td right className="font-medium">{money(g.balanceCents, g.currency)}</Td><Td><StatusBadge status={g.status} /></Td><Td className="text-muted">{fmtDate(g.createdAt)}</Td><Td right>{g.status === "active" && <Button size="xs" variant="danger" onClick={() => disable.mutate(g.id)}>Disable</Button>}</Td></Tr>)}</tbody>
          </Table>
        )}
      </div>
    </div>
  );
}

export default function PromotionsPage() {
  const { store } = useStore();
  const { open } = useAi();
  const [tab, setTab] = useState<Tab>("promotions");
  const q = useStoreQuery<{ items: Promotion[] }>(["promotions"], "/promotions");
  const [dlg, setDlg] = useState<{ id?: string; form: PromoForm } | null>(null);
  const [del, setDel] = useState<Promotion | null>(null);
  const remove = useStoreMutation((sapi, id: string) => sapi(`/promotions/${id}`, { method: "DELETE" }), { success: "Promotion deleted", onSuccess: () => setDel(null) });
  const setStatus = useStoreMutation((sapi, v: { id: string; status: string }) => sapi(`/promotions/${v.id}`, { method: "PATCH", body: { status: v.status } }), { success: "Updated" });
  const cur = store?.defaultCurrency;
  return (
    <Page wide>
      <PageHeader eyebrow="Growth" title="Promotions" subtitle="Codes, automatic discounts, BOGO, bundles, free-shipping thresholds — per region, scheduled, stackable." actions={<><Button icon={<Sparkles size={13} className="text-accent" />} onClick={() => open("Create three promotions: WELCOME10 for first orders, free shipping over $150, and buy 3 save 15% across the catalog")}>3 promotions, 1 prompt</Button><Button variant="primary" icon={<Plus size={13} />} onClick={() => setDlg({ form: blank })}>New promotion</Button></>} />
      <Tabs value={tab} onChange={setTab} items={[{ value: "promotions", label: "Promotions", count: q.data?.items.length }, { value: "bundle", label: "Bundles" }, { value: "upsell", label: "Upsells" }, { value: "cross_sell", label: "Cross-sells" }, { value: "gift", label: "Gift cards" }]} className="mb-4" />
      {tab === "promotions" && (
        <div className="card">
          {q.isLoading && <Loading />}
          {q.data && q.data.items.length === 0 && <EmptyState title="No promotions yet" body="Create one by hand or describe it to the assistant." action={<Button variant="primary" onClick={() => setDlg({ form: blank })}>New promotion</Button>} />}
          {q.data && q.data.items.length > 0 && (
            <Table>
              <thead><tr><Th>Promotion</Th><Th>Type</Th><Th>Code</Th><Th>Scope</Th><Th right>Used</Th><Th>Schedule</Th><Th>Status</Th><Th /></tr></thead>
              <tbody>
                {q.data.items.map((p) => (
                  <Tr key={p.id} onClick={() => setDlg({ id: p.id, form: toForm(p) })}>
                    <Td><div className="font-medium">{p.name}</div><div className="text-[11px] text-muted">{describe(p, cur)}{p.minSubtotalCents && p.type !== "free_shipping" ? ` · min ${money(p.minSubtotalCents, cur)}` : ""}{p.stackable ? " · stackable" : ""}</div></Td>
                    <Td><Badge tone="neutral">{titleCase(p.type)}</Badge></Td>
                    <Td>{p.code ? <span className="font-mono text-xs">{p.code}</span> : <span className="text-[11px] text-muted">automatic</span>}</Td>
                    <Td className="text-[11px] text-muted">{(p.appliesTo.productIds?.length ?? 0) + (p.appliesTo.collectionIds?.length ?? 0) > 0 ? `${p.appliesTo.productIds?.length ?? 0} products · ${p.appliesTo.collectionIds?.length ?? 0} collections` : "whole catalog"}{p.regionIds.length ? ` · ${p.regionIds.length} region(s)` : ""}</Td>
                    <Td right>{p.usageCount}{p.usageLimit ? ` / ${p.usageLimit}` : ""}</Td>
                    <Td className="text-[11px] text-muted">{p.startsAt || p.endsAt ? `${fmtDate(p.startsAt) } → ${fmtDate(p.endsAt)}` : "always"}</Td>
                    <Td><StatusBadge status={p.status} /></Td>
                    <Td right><Menu trigger={<button onClick={(e) => e.stopPropagation()} className="rounded px-1 text-muted hover:bg-sand">⋮</button>} items={[{ label: "Edit", onClick: () => setDlg({ id: p.id, form: toForm(p) }) }, { label: p.status === "disabled" ? "Enable" : "Disable", onClick: () => setStatus.mutate({ id: p.id, status: p.status === "disabled" ? "active" : "disabled" }) }, { label: "Delete", danger: true, onClick: () => setDel(p) }]} /></Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
      )}
      {(tab === "bundle" || tab === "upsell" || tab === "cross_sell") && <MerchTab kind={tab} />}
      {tab === "gift" && <GiftCards />}
      {dlg && <PromoDialog key={dlg.id ?? "new"} initial={dlg} onClose={() => setDlg(null)} />}
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={() => del && remove.mutate(del.id)} loading={remove.isPending} title={`Delete “${del?.name}”?`} confirmLabel="Delete" danger />
    </Page>
  );
}
