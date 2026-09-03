"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Plus, Search, Trash2, X } from "lucide-react";
import { useStoreQuery } from "@/lib/store-context";
import { useStoreMutation } from "@/lib/hooks";
import type { Collection, Paginated, Product } from "@/lib/types";
import { Page } from "@/components/shell/shell";
import { Button, Card, Checkbox, ConfirmDialog, Field, Input, Loading, SegmentedControl, Select, Textarea, Thumb, useDebounce } from "@/components/ui";

interface Form { title: string; description: string; imageUrl: string; kind: "manual" | "smart"; rules: { field: string; op: string; value: string }[]; productIds: string[] }

export default function CollectionEditorPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === "new";
  const router = useRouter();
  const q = useStoreQuery<Collection>(["collection", id], `/collections/${id}`, { enabled: !isNew });
  const [f, setF] = useState<Form>({ title: "", description: "", imageUrl: "", kind: "manual", rules: [], productIds: [] });
  useEffect(() => { if (q.data) setF({ title: q.data.title, description: q.data.description, imageUrl: q.data.imageUrl ?? "", kind: q.data.kind, rules: q.data.rules, productIds: q.data.productIds ?? [] }); }, [q.data]);
  const [search, setSearch] = useState("");
  const ds = useDebounce(search);
  const products = useStoreQuery<Paginated<Product>>(["products"], "/products", { query: { q: ds, pageSize: 50 } });
  const selected = useStoreQuery<Paginated<Product>>(["products"], "/products", { query: { pageSize: 200, collectionId: isNew ? undefined : id }, enabled: !isNew });
  const [del, setDel] = useState(false);
  const save = useStoreMutation((sapi) => (isNew ? sapi<Collection>("/collections", { method: "POST", body: { ...f, imageUrl: f.imageUrl || null } }) : sapi<Collection>(`/collections/${id}`, { method: "PATCH", body: { ...f, imageUrl: f.imageUrl || null } })), { success: isNew ? "Collection created" : "Collection saved", onSuccess: (c) => { if (isNew) router.replace(`/collections/${c.id}`); } });
  const remove = useStoreMutation((sapi) => sapi(`/collections/${id}`, { method: "DELETE" }), { success: "Collection deleted", onSuccess: () => router.replace("/collections") });
  const byId = new Map<string, Product>([...(selected.data?.items ?? []), ...(products.data?.items ?? [])].map((p) => [p.id, p]));

  if (!isNew && !q.data) return <Page><Loading /></Page>;
  return (
    <Page>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link href="/collections" className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink"><ArrowLeft size={13} /> Collections</Link>
        <h1 className="font-display min-w-0 flex-1 truncate text-[24px] leading-tight">{isNew ? "New collection" : q.data?.title}</h1>
        {!isNew && <Button variant="danger" icon={<Trash2 size={13} />} onClick={() => setDel(true)}>Delete</Button>}
        <Button variant="primary" loading={save.isPending} disabled={!f.title.trim()} onClick={() => save.mutate()}>{isNew ? "Create" : "Save"}</Button>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          <Card>
            <div className="space-y-3">
              <Field label="Title" required><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} autoFocus={isNew} /></Field>
              <Field label="Description"><Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} className="min-h-[70px]" /></Field>
              <Field label="Image URL"><Input value={f.imageUrl} onChange={(e) => setF({ ...f, imageUrl: e.target.value })} /></Field>
              <Field label="Kind"><SegmentedControl value={f.kind} onChange={(v) => setF({ ...f, kind: v })} items={[{ value: "manual", label: "Manual" }, { value: "smart", label: "Smart (rules)" }]} /></Field>
            </div>
          </Card>
          {f.kind === "smart" ? (
            <Card title="Rules" eyebrow="All rules must match · published products only" action={<Button size="xs" icon={<Plus size={12} />} onClick={() => setF({ ...f, rules: [...f.rules, { field: "tag", op: "eq", value: "" }] })}>Add rule</Button>}>
              {f.rules.length === 0 && <p className="text-[11px] text-muted">Add a rule like <em>tag equals gloves</em> or <em>title contains wrap</em>.</p>}
              <div className="space-y-2">
                {f.rules.map((r, i) => (
                  <div key={i} className="grid grid-cols-[120px_120px_1fr_auto] gap-2">
                    <Select value={r.field} onChange={(e) => setF({ ...f, rules: f.rules.map((x, j) => (j === i ? { ...x, field: e.target.value } : x)) })}>{["tag", "title", "type", "vendor"].map((o) => <option key={o} value={o}>{o}</option>)}</Select>
                    <Select value={r.op} onChange={(e) => setF({ ...f, rules: f.rules.map((x, j) => (j === i ? { ...x, op: e.target.value } : x)) })}><option value="eq">equals</option><option value="contains">contains</option></Select>
                    <Input value={r.value} onChange={(e) => setF({ ...f, rules: f.rules.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })} placeholder="value" />
                    <button onClick={() => setF({ ...f, rules: f.rules.filter((_, j) => j !== i) })} className="text-muted hover:text-danger"><X size={14} /></button>
                  </div>
                ))}
              </div>
            </Card>
          ) : (
            <Card title="Products" eyebrow={`${f.productIds.length} selected`}>
              <div className="relative mb-2"><Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products to add…" className="!pl-8" /></div>
              <div className="max-h-80 divide-y divide-line overflow-y-auto rounded border border-line">
                {(products.data?.items ?? []).map((p) => (
                  <div key={p.id} className="flex items-center gap-2 px-2 py-1.5">
                    <Checkbox checked={f.productIds.includes(p.id)} onChange={(v) => setF({ ...f, productIds: v ? [...f.productIds, p.id] : f.productIds.filter((x) => x !== p.id) })} />
                    <Thumb src={p.media[0]?.url} size={28} />
                    <span className="min-w-0 flex-1 truncate text-xs">{p.title}</span>
                    <span className="text-[10px] text-muted">{p.status}</span>
                  </div>
                ))}
                {products.data?.items.length === 0 && <div className="px-3 py-4 text-center text-[11px] text-muted">No products match.</div>}
              </div>
            </Card>
          )}
        </div>
        <Card title={f.kind === "smart" ? "Currently matching" : "In this collection"} padded={false}>
          <ul className="max-h-[60vh] divide-y divide-line overflow-y-auto">
            {(f.kind === "smart" ? (selected.data?.items ?? []) : f.productIds.map((pid) => byId.get(pid)).filter((p): p is Product => !!p)).map((p) => (
              <li key={p.id} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                <Thumb src={p.media[0]?.url} size={28} />
                <Link href={`/products/${p.id}`} className="min-w-0 flex-1 truncate hover:underline">{p.title}</Link>
                {f.kind === "manual" && <button onClick={() => setF({ ...f, productIds: f.productIds.filter((x) => x !== p.id) })} className="text-muted hover:text-danger"><X size={12} /></button>}
              </li>
            ))}
            {f.kind === "manual" && f.productIds.length === 0 && <li className="px-3 py-5 text-center text-[11px] text-muted">Nothing yet — tick products on the left.</li>}
            {f.kind === "smart" && (selected.data?.items ?? []).length === 0 && <li className="px-3 py-5 text-center text-[11px] text-muted">Save to apply the rules and see matches.</li>}
          </ul>
        </Card>
      </div>
      <ConfirmDialog open={del} onClose={() => setDel(false)} onConfirm={() => remove.mutate()} loading={remove.isPending} title="Delete this collection?" body="Products stay; only the grouping goes." confirmLabel="Delete" danger />
    </Page>
  );
}
