"use client";

import { useState } from "react";
import { ChevronRight, Lightbulb, Plus, Trash2, X } from "lucide-react";
import { useStore, useStoreQuery } from "@/lib/store-context";
import { useStoreMutation } from "@/lib/hooks";
import { useAi } from "@/lib/ai-context";
import { centsToInput, cn, inputToCents, money, titleCase } from "@/lib/utils";
import type { Region, ShippingOption } from "@/lib/types";
import { Badge, Button, Card, Checkbox, ConfirmDialog, Dialog, EmptyState, Field, Input, Loading, Note, Select, Toggle } from "@/components/ui";

type OptType = ShippingOption["type"];
const TYPES: { value: OptType; label: string; hint: string }[] = [
  { value: "flat", label: "Flat rate", hint: "One price per order." },
  { value: "free_above", label: "Free above threshold", hint: "Free once the subtotal passes a threshold; otherwise the amount." },
  { value: "weight", label: "By weight", hint: "Bands of grams → price." },
  { value: "price", label: "By order value", hint: "Bands of subtotal → price." },
  { value: "pickup", label: "In-store pickup", hint: "Free; customer collects." },
  { value: "local_delivery", label: "Local delivery", hint: "Radius delivery with a fee." },
  { value: "live", label: "Live carrier rates", hint: "Quoted at checkout by a connected carrier plugin." },
];
interface OptForm { name: string; type: OptType; amount: string; threshold: string; estimate: string; enabled: boolean; provider: string; rules: { from: string; to: string; amount: string }[] }
const blankOpt: OptForm = { name: "", type: "flat", amount: "", threshold: "", estimate: "3–5 business days", enabled: true, provider: "", rules: [{ from: "0", to: "", amount: "" }] };

const TOUR = [
  { title: "Regions decide currency and tax", body: "Each region has one currency, a tax rate and a country list. A shopper's country picks the region; prices convert automatically." },
  { title: "Rates live inside regions", body: "Add flat, free-above, weight, price-band, pickup, local delivery or live rates per region. The cheapest qualifying enabled rate is the default at checkout." },
  { title: "Free shipping is a promotion too", body: "A region's free-shipping threshold and a free-shipping promotion both work; the promotion can be code-gated." },
  { title: "Going multi-region locks the store currency", body: "Once you add a second region the default currency is fixed and payment providers are mirrored to the new region." },
];

export default function ShippingPage() {
  const { store, refreshStore } = useStore();
  const { open } = useAi();
  const regions = useStoreQuery<{ items: Region[]; countries: { code: string; name: string; currency: string }[] }>(["regions"], "/regions");
  const [regionId, setRegionId] = useState("");
  const current = regions.data?.items.find((r) => r.id === regionId) ?? regions.data?.items[0];
  const options = useStoreQuery<{ items: ShippingOption[] }>(["shipping-options", current?.id ?? ""], "/shipping-options", { query: { regionId: current?.id }, enabled: !!current });
  const [addRegion, setAddRegion] = useState(false);
  const [rf, setRf] = useState({ name: "", currency: "", countries: [] as string[], taxRateBps: "0", taxInclusive: false, freeAbove: "" });
  const [opt, setOpt] = useState<{ id?: string; form: OptForm } | null>(null);
  const [delRegion, setDelRegion] = useState<Region | null>(null);
  const [tour, setTour] = useState(0);
  const cur = current?.currency ?? store?.defaultCurrency ?? "USD";
  const multi = (regions.data?.items.length ?? 0) > 1;

  const createRegion = useStoreMutation((sapi) => sapi<Region>("/regions", { method: "POST", body: { name: rf.name, currency: rf.currency, countries: rf.countries, taxRateBps: Number(rf.taxRateBps) || 0, taxInclusive: rf.taxInclusive, freeShippingThresholdCents: rf.freeAbove ? inputToCents(rf.freeAbove) : null } }), { success: "Region added with a Standard rate", invalidate: "regions", onSuccess: (r) => { setAddRegion(false); setRegionId(r.id); refreshStore(); } });
  const patchRegion = useStoreMutation((sapi, v: { id: string; body: Record<string, unknown> }) => sapi(`/regions/${v.id}`, { method: "PATCH", body: v.body }), { success: "Region updated", invalidate: "regions" });
  const removeRegion = useStoreMutation((sapi, id: string) => sapi(`/regions/${id}`, { method: "DELETE" }), { success: "Region removed", invalidate: "regions", onSuccess: () => { setDelRegion(null); setRegionId(""); } });
  const saveOpt = useStoreMutation((sapi, v: { id?: string; form: OptForm }) => {
    const f = v.form;
    const body = { regionId: current?.id, name: f.name, type: f.type, amountCents: f.amount ? inputToCents(f.amount) : 0, thresholdCents: f.threshold ? inputToCents(f.threshold) : null, estimate: f.estimate, enabled: f.enabled, provider: f.provider || null, rules: f.type === "weight" || f.type === "price" ? f.rules.filter((r) => r.amount !== "").map((r) => ({ from: Number(r.from) || 0, to: r.to === "" ? null : Number(r.to), amountCents: inputToCents(r.amount) })) : [] };
    return v.id ? sapi(`/shipping-options/${v.id}`, { method: "PATCH", body }) : sapi("/shipping-options", { method: "POST", body });
  }, { success: "Rate saved", invalidate: "shipping-options", onSuccess: () => setOpt(null) });
  const toggleOpt = useStoreMutation((sapi, v: { id: string; enabled: boolean }) => sapi(`/shipping-options/${v.id}`, { method: "PATCH", body: { enabled: v.enabled } }), { invalidate: "shipping-options" });
  const removeOpt = useStoreMutation((sapi, id: string) => sapi(`/shipping-options/${id}`, { method: "DELETE" }), { success: "Rate removed", invalidate: "shipping-options" });
  const f = opt?.form;
  const setF = (patch: Partial<OptForm>) => opt && setOpt({ ...opt, form: { ...opt.form, ...patch } });
  const rateLabel = (o: ShippingOption) => o.type === "flat" ? money(o.amountCents, cur) : o.type === "free_above" ? `Free over ${money(o.thresholdCents ?? 0, cur)}${o.amountCents ? `, else ${money(o.amountCents, cur)}` : ""}` : o.type === "weight" || o.type === "price" ? `${o.rules.length} band(s)` : o.type === "pickup" ? "Free" : o.type === "local_delivery" ? money(o.amountCents, cur) : `Live · ${o.provider ?? "carrier"}`;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <div className="space-y-4">
        <Card title="Regions" eyebrow={multi ? "Multi-region · currency locked" : "Single region"} action={<Button size="xs" icon={<Plus size={11} />} onClick={() => { setRf({ name: "", currency: "", countries: [], taxRateBps: "0", taxInclusive: false, freeAbove: "" }); setAddRegion(true); }}>Add region</Button>}>
          {regions.isLoading && <Loading />}
          <div className="flex flex-wrap gap-1.5">{(regions.data?.items ?? []).map((r) => <button key={r.id} onClick={() => setRegionId(r.id)} className={cn("rounded border px-2.5 py-1.5 text-left text-xs", current?.id === r.id ? "border-ink bg-ink text-white" : "border-line hover:border-ink")}><div className="font-medium">{r.name}</div><div className={cn("text-[10px]", current?.id === r.id ? "text-white/70" : "text-muted")}>{r.currency} · {r.countries.join(", ")}</div></button>)}</div>
          {current && (
            <div className="mt-3 grid gap-2 border-t border-line pt-3 sm:grid-cols-4">
              <Field label="Tax rate %"><Input defaultValue={(current.taxRateBps / 100).toString()} key={`${current.id}-tax`} onBlur={(e) => Number(e.target.value) * 100 !== current.taxRateBps && patchRegion.mutate({ id: current.id, body: { taxRateBps: Math.round(Number(e.target.value) * 100) } })} /></Field>
              <Field label="Prices include tax"><Toggle checked={current.taxInclusive} onChange={(v) => patchRegion.mutate({ id: current.id, body: { taxInclusive: v } })} /></Field>
              <Field label={`Free shipping over (${current.currency})`}><Input defaultValue={centsToInput(current.freeShippingThresholdCents)} key={`${current.id}-free`} onBlur={(e) => patchRegion.mutate({ id: current.id, body: { freeShippingThresholdCents: e.target.value ? inputToCents(e.target.value) : null } })} placeholder="—" /></Field>
              <div className="flex items-end justify-end"><Button size="xs" variant="danger" icon={<Trash2 size={11} />} disabled={(regions.data?.items.length ?? 0) <= 1} onClick={() => setDelRegion(current)}>Remove region</Button></div>
            </div>
          )}
        </Card>
        <Card title={`Rates · ${current?.name ?? ""}`} eyebrow="Cheapest qualifying rate is default at checkout" action={<Button size="xs" icon={<Plus size={11} />} disabled={!current} onClick={() => setOpt({ form: blankOpt })}>Add rate</Button>}>
          {options.isLoading && <Loading />}
          {options.data && options.data.items.length === 0 && <EmptyState title="No rates in this region" />}
          <ul className="divide-y divide-line">
            {(options.data?.items ?? []).map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-3 py-2 text-xs">
                <Toggle checked={o.enabled} onChange={(v) => toggleOpt.mutate({ id: o.id, enabled: v })} />
                <button onClick={() => setOpt({ id: o.id, form: { name: o.name, type: o.type, amount: centsToInput(o.amountCents), threshold: centsToInput(o.thresholdCents), estimate: o.estimate, enabled: o.enabled, provider: o.provider ?? "", rules: o.rules.length ? o.rules.map((r) => ({ from: String(r.from), to: r.to === null ? "" : String(r.to), amount: centsToInput(r.amountCents) })) : blankOpt.rules } })} className="font-medium hover:underline">{o.name}</button>
                <Badge>{titleCase(o.type)}</Badge>
                <span>{rateLabel(o)}</span>
                <span className="text-muted">{o.estimate}</span>
                <span className="flex-1" />
                <button onClick={() => removeOpt.mutate(o.id)} className="text-muted hover:text-danger"><Trash2 size={13} /></button>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <div className="space-y-4">
        <Card title="Show me how" eyebrow="Guided tour">
          <div className="text-[13px] font-medium">{TOUR[tour]!.title}</div>
          <p className="mt-1 text-xs text-muted">{TOUR[tour]!.body}</p>
          <div className="mt-3 flex items-center justify-between"><span className="flex gap-1">{TOUR.map((_, i) => <span key={i} className={cn("h-1.5 w-1.5 rounded-full", i === tour ? "bg-ink" : "bg-line-strong")} />)}</span><Button size="xs" onClick={() => setTour((t) => (t + 1) % TOUR.length)} icon={<ChevronRight size={11} />}>{tour === TOUR.length - 1 ? "Start over" : "Next"}</Button></div>
          <button onClick={() => open("Show me how shipping works and suggest rates for my region")} className="mt-3 inline-flex items-center gap-1 text-[11px] text-accent hover:underline"><Lightbulb size={11} /> Ask the assistant to set this up</button>
        </Card>
        {multi && <Note tone="warn">Currency is locked to {store?.defaultCurrency} because the store has multiple regions. Prices convert per region with mid-market rates.</Note>}
        <Card title="Duties & delivery" eyebrow="Coming from plugins">
          <ul className="space-y-1 text-[11px] text-muted"><li>· DDP/DAP duties are quoted by carrier plugins (Shippo, ShipStation) when live rates are on.</li><li>· Local delivery slots and multi-location pickup are configured on the rate.</li></ul>
        </Card>
      </div>

      <Dialog open={addRegion} onClose={() => setAddRegion(false)} title="Add a region" description={multi || (regions.data?.items.length ?? 0) >= 1 ? "Adding a second region locks the store currency and mirrors payment providers." : undefined} width="max-w-lg" footer={<><Button variant="ghost" onClick={() => setAddRegion(false)}>Cancel</Button><Button variant="primary" loading={createRegion.isPending} disabled={!rf.name || !rf.currency || !rf.countries.length} onClick={() => createRegion.mutate()}>Add region</Button></>}>
        <div className="space-y-3">
          <div className="grid grid-cols-[1fr_100px] gap-2"><Field label="Name" required><Input value={rf.name} onChange={(e) => setRf({ ...rf, name: e.target.value })} placeholder="European Union" autoFocus /></Field><Field label="Currency" required><Input value={rf.currency} onChange={(e) => setRf({ ...rf, currency: e.target.value.toUpperCase().slice(0, 3) })} placeholder="EUR" /></Field></div>
          <Field label="Countries" required hint="Curated catalog — picking a country suggests its currency.">
            <div className="grid max-h-48 grid-cols-2 gap-x-3 overflow-y-auto rounded border border-line p-2 sm:grid-cols-3">{(regions.data?.countries ?? []).map((c) => <Checkbox key={c.code} className="py-0.5" checked={rf.countries.includes(c.code)} onChange={(v) => setRf({ ...rf, countries: v ? [...rf.countries, c.code] : rf.countries.filter((x) => x !== c.code), currency: rf.currency || (v ? c.currency : "") })} label={<span>{c.name} <span className="text-muted">{c.currency}</span></span>} />)}</div>
          </Field>
          <div className="grid grid-cols-3 gap-2"><Field label="Tax rate %"><Input value={rf.taxRateBps} onChange={(e) => setRf({ ...rf, taxRateBps: e.target.value })} /></Field><Field label="Tax inclusive"><Toggle checked={rf.taxInclusive} onChange={(v) => setRf({ ...rf, taxInclusive: v })} /></Field><Field label="Free shipping over"><Input value={rf.freeAbove} onChange={(e) => setRf({ ...rf, freeAbove: e.target.value })} inputMode="decimal" /></Field></div>
        </div>
      </Dialog>
      <Dialog open={!!opt} onClose={() => setOpt(null)} title={opt?.id ? "Edit rate" : "New rate"} width="max-w-lg" footer={<><Button variant="ghost" onClick={() => setOpt(null)}>Cancel</Button><Button variant="primary" loading={saveOpt.isPending} disabled={!f?.name.trim()} onClick={() => opt && saveOpt.mutate(opt)}>Save</Button></>}>
        {f && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2"><Field label="Name" required><Input value={f.name} onChange={(e) => setF({ name: e.target.value })} placeholder="Standard" autoFocus /></Field><Field label="Type"><Select value={f.type} onChange={(e) => setF({ type: e.target.value as OptType })}>{TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</Select></Field></div>
            <p className="text-[11px] text-muted">{TYPES.find((t) => t.value === f.type)?.hint}</p>
            {(f.type === "flat" || f.type === "local_delivery" || f.type === "free_above") && <Field label={`Amount (${cur})`}><Input value={f.amount} onChange={(e) => setF({ amount: e.target.value })} inputMode="decimal" /></Field>}
            {f.type === "free_above" && <Field label={`Free above (${cur})`}><Input value={f.threshold} onChange={(e) => setF({ threshold: e.target.value })} inputMode="decimal" /></Field>}
            {f.type === "live" && <Field label="Carrier plugin"><Select value={f.provider} onChange={(e) => setF({ provider: e.target.value })}><option value="">Pick…</option>{["shippo", "shipstation", "shipbob", "skydropx", "shiprocket", "royal-mail"].map((p) => <option key={p} value={p}>{p}</option>)}</Select></Field>}
            {(f.type === "weight" || f.type === "price") && (
              <Field label={f.type === "weight" ? "Bands (grams → price)" : `Bands (${cur} subtotal → price)`}>
                <div className="space-y-1.5">{f.rules.map((r, i) => <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-1.5 text-xs"><Input value={r.from} onChange={(e) => setF({ rules: f.rules.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)) })} placeholder="from" className="!h-7" /><Input value={r.to} onChange={(e) => setF({ rules: f.rules.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)) })} placeholder="to (blank = ∞)" className="!h-7" /><Input value={r.amount} onChange={(e) => setF({ rules: f.rules.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)) })} placeholder={`price ${cur}`} className="!h-7" /><button onClick={() => setF({ rules: f.rules.filter((_, j) => j !== i) })} className="text-muted"><X size={13} /></button></div>)}<Button size="xs" onClick={() => setF({ rules: [...f.rules, { from: f.rules[f.rules.length - 1]?.to ?? "", to: "", amount: "" }] })}>Add band</Button></div>
              </Field>
            )}
            <div className="grid grid-cols-2 gap-2"><Field label="Estimate shown to shoppers"><Input value={f.estimate} onChange={(e) => setF({ estimate: e.target.value })} /></Field><Field label="Enabled"><Toggle checked={f.enabled} onChange={(v) => setF({ enabled: v })} /></Field></div>
          </div>
        )}
      </Dialog>
      <ConfirmDialog open={!!delRegion} onClose={() => setDelRegion(null)} onConfirm={() => delRegion && removeRegion.mutate(delRegion.id)} loading={removeRegion.isPending} title={`Remove ${delRegion?.name}?`} body="Its shipping rates go too. Orders keep their currency." confirmLabel="Remove" danger />
    </div>
  );
}
