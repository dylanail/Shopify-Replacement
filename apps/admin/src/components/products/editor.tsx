"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowLeft, ArrowUp, ImagePlus, Plus, Sparkles, Trash2, WandSparkles, X } from "lucide-react";
import type { MediaItem, ProductOption } from "@kiln/shared";
import { useStore, useStoreQuery } from "@/lib/store-context";
import { useStoreMutation } from "@/lib/hooks";
import { useAi } from "@/lib/ai-context";
import { centsToInput, cn, inputToCents, stripHtml } from "@/lib/utils";
import type { Collection, Product } from "@/lib/types";
import { Page } from "@/components/shell/shell";
import { Button, Card, Checkbox, Chips, ConfirmDialog, Dialog, Field, Input, Select, Textarea, Toggle, useToast } from "@/components/ui";

interface VariantForm { id?: string; title?: string; sku: string; options: Record<string, string>; price: string; compareAt: string; inventoryQty: number; allowBackorder: boolean; imageUrl: string; weightGrams: string }
interface Form {
  title: string; subtitle: string; description: string; status: "draft" | "published" | "archived"; options: ProductOption[]; variants: VariantForm[]; media: MediaItem[]; tags: string[]; vendor: string; productType: string;
  seoTitle: string; seoDescription: string; metadata: { key: string; value: string }[]; subscription: { enabled: boolean; cadences: ("weekly" | "monthly" | "quarterly" | "annual")[]; discountPercent: number; trialDays: number }; digital: boolean; weightGrams: string; collectionIds: string[];
}
const PRESETS = [["white_seamless", "White seamless"], ["lifestyle", "Lifestyle"], ["dark_luxury", "Dark luxury"], ["flat_lay", "Flat lay"], ["golden_hour", "Golden hour"], ["studio_3point", "Studio 3-point"]] as const;
const CADENCES = ["weekly", "monthly", "quarterly", "annual"] as const;

function cartesian(options: ProductOption[]): Record<string, string>[] {
  if (options.length === 0) return [{}];
  return options.reduce<Record<string, string>[]>((acc, opt) => acc.flatMap((combo) => opt.values.map((v) => ({ ...combo, [opt.name]: v }))), [{}]);
}
const sig = (o: Record<string, string>) => Object.entries(o).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("|");

function fromProduct(p?: Product): Form {
  return {
    title: p?.title ?? "", subtitle: p?.subtitle ?? "", description: p?.description ?? "", status: p?.status ?? "draft", options: p?.options ?? [],
    variants: p?.variants.map((v) => ({ id: v.id, title: v.title, sku: v.sku ?? "", options: v.options, price: centsToInput(v.priceCents), compareAt: centsToInput(v.compareAtCents), inventoryQty: v.inventoryQty, allowBackorder: v.allowBackorder, imageUrl: v.imageUrl ?? "", weightGrams: v.weightGrams ? String(v.weightGrams) : "" })) ?? [{ sku: "", options: {}, price: "", compareAt: "", inventoryQty: 25, allowBackorder: false, imageUrl: "", weightGrams: "" }],
    media: p?.media ?? [], tags: p?.tags ?? [], vendor: p?.vendor ?? "", productType: p?.productType ?? "", seoTitle: p?.seo.title ?? "", seoDescription: p?.seo.description ?? "",
    metadata: Object.entries(p?.metadata ?? {}).map(([key, value]) => ({ key, value: typeof value === "string" ? value : JSON.stringify(value) })),
    subscription: { enabled: p?.subscription?.enabled ?? false, cadences: p?.subscription?.cadences ?? ["monthly"], discountPercent: p?.subscription?.discountPercent ?? 0, trialDays: p?.subscription?.trialDays ?? 0 },
    digital: p?.digital?.enabled ?? false, weightGrams: p?.weightGrams ? String(p.weightGrams) : "", collectionIds: p?.collectionIds ?? [],
  };
}

function toInput(f: Form) {
  return {
    title: f.title, subtitle: f.subtitle, description: f.description, status: f.status, options: f.options.filter((o) => o.name && o.values.length),
    variants: f.variants.map((v) => ({ id: v.id, title: v.title, sku: v.sku || undefined, options: v.options, priceCents: inputToCents(v.price), compareAtCents: v.compareAt ? inputToCents(v.compareAt) : null, inventoryQty: Number(v.inventoryQty) || 0, allowBackorder: v.allowBackorder, imageUrl: v.imageUrl || null, weightGrams: v.weightGrams ? Number(v.weightGrams) : undefined })),
    media: f.media.map((m, i) => ({ ...m, sort: i })), tags: f.tags, vendor: f.vendor || undefined, productType: f.productType || undefined,
    seo: { title: f.seoTitle || undefined, description: f.seoDescription || undefined },
    metadata: Object.fromEntries(f.metadata.filter((m) => m.key).map((m) => [m.key, m.value])),
    subscription: f.subscription, digital: f.digital ? { enabled: true, files: [] } : undefined, weightGrams: f.weightGrams ? Number(f.weightGrams) : undefined, collectionIds: f.collectionIds,
  };
}

export function ProductEditor({ product }: { product?: Product }) {
  const router = useRouter();
  const toast = useToast();
  const { store } = useStore();
  const { open } = useAi();
  const [f, setF] = useState<Form>(() => fromProduct(product));
  useEffect(() => { if (product) setF(fromProduct(product)); }, [product]);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const collections = useStoreQuery<{ items: Collection[] }>(["collections"], "/collections");
  const [lanes, setLanes] = useState<{ open: boolean; preset: string; brief: string; results: { url: string; preset: string; provider: string; lane: number }[] }>({ open: false, preset: "white_seamless", brief: "", results: [] });
  const [del, setDel] = useState(false);
  const [mediaUrl, setMediaUrl] = useState("");
  const [adjust, setAdjust] = useState<{ variantId: string; delta: string; reason: string } | null>(null);
  const cur = store?.defaultCurrency;

  const save = useStoreMutation((sapi) => (product ? sapi<Product>(`/products/${product.id}`, { method: "PATCH", body: toInput(f) }) : sapi<Product>("/products", { method: "POST", body: toInput(f) })), {
    success: product ? "Product saved" : "Product created",
    onSuccess: (p) => { if (!product) router.replace(`/products/${p.id}`); },
  });
  const remove = useStoreMutation((sapi) => sapi(`/products/${product!.id}`, { method: "DELETE" }), { success: "Product deleted", onSuccess: () => router.replace("/products") });
  const genImages = useStoreMutation((sapi, v: { preset: string; brief: string }) => sapi<{ lanes: { url: string; preset: string; provider: string; lane: number }[] }>(`/products/${product!.id}/images`, { method: "POST", body: { preset: v.preset, brief: v.brief || undefined, attach: false } }), { invalidate: false, onSuccess: (r) => setLanes((l) => ({ ...l, results: r.lanes })) });
  const inventory = useStoreMutation((sapi, v: { variantId: string; delta: number; reason: string }) => sapi(`/products/${product!.id}/inventory`, { method: "POST", body: v }), { success: "Inventory adjusted", onSuccess: () => setAdjust(null) });

  // Options → variants (preserve rows whose option signature still exists).
  const setOptions = (options: ProductOption[]) => {
    const clean = options.map((o) => ({ name: o.name, values: o.values }));
    const combos = cartesian(clean.filter((o) => o.name && o.values.length));
    const byS = new Map(f.variants.map((v) => [sig(v.options), v]));
    const base = f.variants[0];
    const variants = combos.map((c) => byS.get(sig(c)) ?? { sku: "", options: c, price: base?.price ?? "", compareAt: base?.compareAt ?? "", inventoryQty: base?.inventoryQty ?? 25, allowBackorder: false, imageUrl: "", weightGrams: "" });
    setF((x) => ({ ...x, options: clean, variants }));
  };
  const setVar = (i: number, patch: Partial<VariantForm>) => setF((x) => ({ ...x, variants: x.variants.map((v, j) => (j === i ? { ...v, ...patch } : v)) }));
  const moveMedia = (i: number, dir: -1 | 1) => {
    const m = [...f.media];
    const j = i + dir;
    if (j < 0 || j >= m.length) return;
    [m[i], m[j]] = [m[j]!, m[i]!];
    set("media", m);
  };
  const addMedia = (url: string) => { if (!url.trim()) return; set("media", [...f.media, { url: url.trim(), alt: f.title, kind: "image", sort: f.media.length }]); setMediaUrl(""); };
  const words = useMemo(() => stripHtml(f.description).split(/\s+/).filter(Boolean).length, [f.description]);
  const valid = f.title.trim().length > 0 && f.variants.every((v) => v.price !== "");

  const askCopy = () => open(product ? `Write a 150–200 word product description for "${f.title}" (product id ${product.id}) in our brand voice, then update the product with it.` : `Write a 150–200 word product description for a product called "${f.title || "my new product"}"${f.subtitle ? ` (${f.subtitle})` : ""} in our brand voice.`);

  return (
    <Page wide>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link href="/products" className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink"><ArrowLeft size={13} /> Products</Link>
        <h1 className="font-display min-w-0 flex-1 truncate text-[24px] leading-tight">{product ? product.title : "New product"}</h1>
        {product && <a href={`${store?.url}/products/${product.handle}`} target="_blank" rel="noreferrer" className="text-xs text-muted hover:text-ink">View on store ↗</a>}
        <Select value={f.status} onChange={(e) => set("status", e.target.value as Form["status"])} className="!w-32"><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></Select>
        {product && <Button variant="danger" size="md" icon={<Trash2 size={13} />} onClick={() => setDel(true)}>Delete</Button>}
        <Button variant="primary" loading={save.isPending} disabled={!valid} onClick={() => save.mutate()}>{product ? "Save" : "Create product"}</Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Card>
            <div className="space-y-3">
              <Field label="Title" required><Input value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="The Sparring 16oz" autoFocus={!product} /></Field>
              <Field label="Subtitle"><Input value={f.subtitle} onChange={(e) => set("subtitle", e.target.value)} placeholder="For real rounds. For real partners." /></Field>
              <Field label="Description (HTML)" hint={`${words} words · aim for 150–200`}>
                <div className="relative">
                  <Textarea value={f.description} onChange={(e) => set("description", e.target.value)} className="min-h-[160px] font-mono !text-[12px]" placeholder="<p>Hand-stitched from full-grain leather…</p>" />
                  <button type="button" onClick={askCopy} className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded border border-line bg-card px-2 py-1 text-[11px] text-ink hover:border-ink"><Sparkles size={11} className="text-accent" /> Ask AI to write copy</button>
                </div>
              </Field>
            </div>
          </Card>

          <Card title="Media" eyebrow="First image is the hero" action={product && <Button size="xs" icon={<WandSparkles size={12} className="text-accent" />} onClick={() => setLanes((l) => ({ ...l, open: true }))}>Generate with AI</Button>}>
            <ul className="space-y-2">
              {f.media.map((m, i) => (
                <li key={`${m.url}-${i}`} className="flex items-center gap-2 rounded border border-line p-2">
                  <img src={m.url} alt={m.alt} className="h-14 w-14 shrink-0 rounded border border-line object-cover" />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 text-[11px]"><span className={cn("rounded px-1", i === 0 ? "bg-ink text-white" : "bg-sand text-muted")}>{i === 0 ? "Hero" : `#${i + 1}`}</span><span className="truncate text-muted">{m.url}</span>{m.generated && <span className="rounded bg-accent-soft px-1 text-accent">AI · {m.preset}</span>}</div>
                    <Input value={m.alt} onChange={(e) => set("media", f.media.map((x, j) => (j === i ? { ...x, alt: e.target.value } : x)))} placeholder="Alt text (SEO)" className="!h-7 !text-[12px]" />
                  </div>
                  <div className="flex flex-col"><button onClick={() => moveMedia(i, -1)} disabled={i === 0} className="text-muted hover:text-ink disabled:opacity-30"><ArrowUp size={12} /></button><button onClick={() => moveMedia(i, 1)} disabled={i === f.media.length - 1} className="text-muted hover:text-ink disabled:opacity-30"><ArrowDown size={12} /></button></div>
                  <button onClick={() => set("media", f.media.filter((_, j) => j !== i))} className="text-muted hover:text-danger"><X size={14} /></button>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex gap-2">
              <Input value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addMedia(mediaUrl))} placeholder="https://… image URL" />
              <Button icon={<ImagePlus size={13} />} onClick={() => addMedia(mediaUrl)}>Add</Button>
            </div>
          </Card>

          <Card title="Options & variants" eyebrow="Up to 3 options" action={f.options.length < 3 && <Button size="xs" icon={<Plus size={12} />} onClick={() => setOptions([...f.options, { name: "", values: [] }])}>Add option</Button>}>
            {f.options.length > 0 && (
              <div className="mb-3 space-y-2">
                {f.options.map((o, i) => (
                  <div key={i} className="grid grid-cols-[140px_1fr_auto] items-start gap-2">
                    <Input value={o.name} onChange={(e) => setOptions(f.options.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder={["Size", "Color", "Material"][i]} />
                    <Chips value={o.values} onChange={(v) => setOptions(f.options.map((x, j) => (j === i ? { ...x, values: v } : x)))} placeholder="Add values, comma or Enter" />
                    <button onClick={() => setOptions(f.options.filter((_, j) => j !== i))} className="mt-2 text-muted hover:text-danger"><X size={14} /></button>
                  </div>
                ))}
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-xs">
                <thead><tr className="text-left"><th className="eyebrow pb-1 pr-2">Variant</th><th className="eyebrow pb-1 pr-2">SKU</th><th className="eyebrow pb-1 pr-2">Price</th><th className="eyebrow pb-1 pr-2">Compare-at</th><th className="eyebrow pb-1 pr-2">Inventory</th><th className="eyebrow pb-1 pr-2">Backorder</th><th className="eyebrow pb-1">Image URL</th></tr></thead>
                <tbody>
                  {f.variants.map((v, i) => (
                    <tr key={v.id ?? sig(v.options) ?? i} className="border-t border-line">
                      <td className="py-1.5 pr-2 font-medium">{Object.values(v.options).join(" / ") || "Default"}</td>
                      <td className="py-1.5 pr-2"><Input value={v.sku} onChange={(e) => setVar(i, { sku: e.target.value })} className="!h-7 !w-28 font-mono !text-[11px]" placeholder="auto" /></td>
                      <td className="py-1.5 pr-2"><Input value={v.price} onChange={(e) => setVar(i, { price: e.target.value })} className="!h-7 !w-24" placeholder="0.00" inputMode="decimal" /></td>
                      <td className="py-1.5 pr-2"><Input value={v.compareAt} onChange={(e) => setVar(i, { compareAt: e.target.value })} className="!h-7 !w-24" placeholder="—" inputMode="decimal" /></td>
                      <td className="py-1.5 pr-2">
                        <div className="flex items-center gap-1">
                          <Input type="number" value={v.inventoryQty} onChange={(e) => setVar(i, { inventoryQty: Number(e.target.value) })} className="!h-7 !w-20" />
                          {v.id && <button onClick={() => setAdjust({ variantId: v.id!, delta: "", reason: "recount" })} className="text-[10px] text-muted underline-offset-2 hover:underline">adjust</button>}
                        </div>
                      </td>
                      <td className="py-1.5 pr-2"><Toggle checked={v.allowBackorder} onChange={(c) => setVar(i, { allowBackorder: c })} /></td>
                      <td className="py-1.5"><Input value={v.imageUrl} onChange={(e) => setVar(i, { imageUrl: e.target.value })} className="!h-7 !text-[11px]" placeholder="inherits hero" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] text-muted">Prices in {cur ?? "USD"}. Variants regenerate from options; rows with a matching combination keep their values.</p>
          </Card>

          <Card title="Search engine listing" eyebrow="SEO">
            <div className="space-y-3">
              <Field label="Title tag" hint={`${(f.seoTitle || f.title).length}/60`}><Input value={f.seoTitle} onChange={(e) => set("seoTitle", e.target.value)} placeholder={f.title} /></Field>
              <Field label="Meta description" hint={`${f.seoDescription.length}/155`}><Textarea value={f.seoDescription} onChange={(e) => set("seoDescription", e.target.value)} className="min-h-[60px]" placeholder={stripHtml(f.description).slice(0, 155)} /></Field>
              <div className="rounded border border-line bg-cream p-3">
                <div className="text-[13px] text-[#1a0dab]">{f.seoTitle || f.title || "Product title"}</div>
                <div className="text-[11px] text-positive">{store?.url}/products/{product?.handle ?? "handle"}</div>
                <div className="text-[11px] text-muted">{f.seoDescription || stripHtml(f.description).slice(0, 155) || "Meta description"}</div>
              </div>
            </div>
          </Card>

          <Card title="Metadata" eyebrow="Custom key / values" action={<Button size="xs" icon={<Plus size={12} />} onClick={() => set("metadata", [...f.metadata, { key: "", value: "" }])}>Add</Button>}>
            {f.metadata.length === 0 && <p className="text-[11px] text-muted">Structured facts for the storefront and the assistant — e.g. material, care, origin.</p>}
            <div className="space-y-1.5">
              {f.metadata.map((m, i) => (
                <div key={i} className="grid grid-cols-[1fr_2fr_auto] gap-2">
                  <Input value={m.key} onChange={(e) => set("metadata", f.metadata.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))} placeholder="key" className="font-mono !text-[11px]" />
                  <Input value={m.value} onChange={(e) => set("metadata", f.metadata.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} placeholder="value" />
                  <button onClick={() => set("metadata", f.metadata.filter((_, j) => j !== i))} className="text-muted hover:text-danger"><X size={14} /></button>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Organisation">
            <div className="space-y-3">
              <Field label="Tags"><Chips value={f.tags} onChange={(v) => set("tags", v)} /></Field>
              <Field label="Vendor"><Input value={f.vendor} onChange={(e) => set("vendor", e.target.value)} /></Field>
              <Field label="Product type"><Input value={f.productType} onChange={(e) => set("productType", e.target.value)} placeholder="Gloves" /></Field>
              <Field label="Weight (grams)"><Input type="number" value={f.weightGrams} onChange={(e) => set("weightGrams", e.target.value)} /></Field>
              <Toggle checked={f.digital} onChange={(v) => set("digital", v)} label="Digital product (no shipping)" />
            </div>
          </Card>
          <Card title="Collections">
            {collections.data?.items.length === 0 && <p className="text-[11px] text-muted">No collections yet. <Link href="/collections/new" className="underline">Create one</Link>.</p>}
            <div className="space-y-1">
              {(collections.data?.items ?? []).map((c) => (
                <Checkbox key={c.id} checked={f.collectionIds.includes(c.id)} onChange={(v) => set("collectionIds", v ? [...f.collectionIds, c.id] : f.collectionIds.filter((x) => x !== c.id))} label={<span>{c.title} <span className="text-muted">· {c.kind}{c.kind === "smart" ? " (rules decide)" : ""}</span></span>} />
              ))}
            </div>
          </Card>
          <Card title="Subscription" action={<Toggle checked={f.subscription.enabled} onChange={(v) => set("subscription", { ...f.subscription, enabled: v })} />}>
            <div className={cn("space-y-3", !f.subscription.enabled && "opacity-50")}>
              <Field label="Cadences">
                <div className="flex flex-wrap gap-1.5">
                  {CADENCES.map((c) => <button key={c} type="button" disabled={!f.subscription.enabled} onClick={() => set("subscription", { ...f.subscription, cadences: f.subscription.cadences.includes(c) ? f.subscription.cadences.filter((x) => x !== c) : [...f.subscription.cadences, c] })} className={cn("rounded-full border px-2 py-0.5 text-[11px]", f.subscription.cadences.includes(c) ? "border-ink bg-ink text-white" : "border-line text-muted")}>{c}</button>)}
                </div>
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Subscriber discount %"><Input type="number" min={0} max={100} disabled={!f.subscription.enabled} value={f.subscription.discountPercent} onChange={(e) => set("subscription", { ...f.subscription, discountPercent: Number(e.target.value) })} /></Field>
                <Field label="Trial days"><Input type="number" min={0} disabled={!f.subscription.enabled} value={f.subscription.trialDays} onChange={(e) => set("subscription", { ...f.subscription, trialDays: Number(e.target.value) })} /></Field>
              </div>
            </div>
          </Card>
          {product && (
            <Card title="Assistant shortcuts">
              <div className="flex flex-col gap-1.5">
                {[["Rewrite the copy warmer", `Rewrite the description of "${product.title}" in a warmer, more specific voice and update it`], ["Suggest pricing", `Suggest pricing for "${product.title}" based on my catalog and update the variants if it makes sense`], ["Add to a collection", `Put "${product.title}" in the most fitting collection, creating one if needed`], ["Check SEO", `Scan "${product.title}" for SEO issues and fix the meta title, description and alt text`]].map(([l, p]) => (
                  <button key={l} onClick={() => open(p)} className="rounded border border-line bg-card px-2.5 py-1.5 text-left text-xs hover:border-ink"><Sparkles size={11} className="mr-1 inline text-accent" />{l}</button>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>

      <Dialog open={lanes.open} onClose={() => setLanes((l) => ({ ...l, open: false }))} title="Generate product images" description="Four lanes are rendered in parallel. Pick the one you like — it becomes the hero." width="max-w-2xl">
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Preset" className="w-44"><Select value={lanes.preset} onChange={(e) => setLanes((l) => ({ ...l, preset: e.target.value }))}>{PRESETS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</Select></Field>
          <Field label="Brief (optional)" className="min-w-[200px] flex-1"><Input value={lanes.brief} onChange={(e) => setLanes((l) => ({ ...l, brief: e.target.value }))} placeholder="oxblood leather, gold stitching" /></Field>
          <Button variant="primary" loading={genImages.isPending} onClick={() => genImages.mutate({ preset: lanes.preset, brief: lanes.brief })} icon={<WandSparkles size={13} />}>Render 4 lanes</Button>
        </div>
        {lanes.results.length > 0 && (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {lanes.results.map((l) => (
              <div key={l.lane} className="card overflow-hidden">
                <img src={l.url} alt={`Lane ${l.lane + 1}`} className="aspect-square w-full object-cover" />
                <div className="flex items-center justify-between p-2 text-[10px] text-muted"><span>Lane {l.lane + 1} · {l.provider}</span></div>
                <div className="flex gap-1 p-2 pt-0">
                  <Button size="xs" variant="primary" className="flex-1" onClick={() => { set("media", [{ url: l.url, alt: f.title, kind: "image", sort: 0, generated: true, preset: l.preset }, ...f.media]); setLanes((x) => ({ ...x, open: false })); toast("Attached as hero — save to keep it"); }}>Use as hero</Button>
                  <Button size="xs" onClick={() => { set("media", [...f.media, { url: l.url, alt: f.title, kind: "image", sort: f.media.length, generated: true, preset: l.preset }]); toast("Added to media"); }}>Add</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Dialog>
      <Dialog open={!!adjust} onClose={() => setAdjust(null)} title="Adjust inventory" width="max-w-sm" footer={<><Button variant="ghost" onClick={() => setAdjust(null)}>Cancel</Button><Button variant="primary" loading={inventory.isPending} disabled={!adjust || !adjust.delta} onClick={() => adjust && inventory.mutate({ variantId: adjust.variantId, delta: Number(adjust.delta), reason: adjust.reason })}>Apply</Button></>}>
        {adjust && (
          <div className="space-y-3">
            <Field label="Change (use − to remove)"><Input value={adjust.delta} onChange={(e) => setAdjust({ ...adjust, delta: e.target.value })} placeholder="+10 or -3" autoFocus /></Field>
            <Field label="Reason"><Select value={adjust.reason} onChange={(e) => setAdjust({ ...adjust, reason: e.target.value })}>{["recount", "received", "damaged", "returned", "manual"].map((r) => <option key={r} value={r}>{r}</option>)}</Select></Field>
          </div>
        )}
      </Dialog>
      <ConfirmDialog open={del} onClose={() => setDel(false)} onConfirm={() => remove.mutate()} loading={remove.isPending} title="Delete this product?" body="This can't be undone." confirmLabel="Delete" danger />
    </Page>
  );
}
