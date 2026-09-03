"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, FileUp, Play, Search } from "lucide-react";
import { useStoreQuery } from "@/lib/store-context";
import { useStoreMutation } from "@/lib/hooks";
import { fmtDateTime, money } from "@/lib/utils";
import { Page } from "@/components/shell/shell";
import { Badge, Button, Card, Field, Input, Note, Select, StatusBadge, Table, Td, Textarea, Th, Tr } from "@/components/ui";

interface ImportResult { source: string; jobId?: string; preview?: { title: string; status?: string; variants?: { priceCents: number }[]; media?: unknown[]; tags?: string[] }[]; counts: { products?: number; variants?: number; rows: number; redirects?: number }; issues: string[] }
interface Job { id: string; source: string; status: string; counts: Record<string, number>; issues: string[]; createdAt: string }

const SAMPLE = `handle,title,description,vendor,type,tags,published,option1_name,option1_value,sku,quantity,price,compare_at_price,image
sparring-16oz,The Sparring 16oz,<p>Hand-stitched full-grain leather.</p>,Ironjaw,Gloves,"gloves,leather",true,Weight,16oz,SPAR-16,12,340,,https://example.com/gloves.jpg
sparring-16oz,,,,,,,Weight,14oz,SPAR-14,8,340,,`;

export default function ImportPage() {
  const [csv, setCsv] = useState("");
  const [source, setSource] = useState("");
  const [oldBaseUrl, setOldBaseUrl] = useState("");
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [done, setDone] = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const jobs = useStoreQuery<{ items: Job[] }>(["import-jobs"], "/import/jobs");
  const run = useStoreMutation((sapi, dryRun: boolean) => sapi<ImportResult>("/import", { method: "POST", body: { csv, source: source || undefined, dryRun, oldBaseUrl: oldBaseUrl || undefined } }), {
    invalidate: "products",
    success: (r, dry) => (dry ? `Parsed ${r.counts.rows} rows` : `Imported ${r.counts.products} products`),
    onSuccess: (r, dry) => { if (dry) setPreview(r); else { setDone(r); setPreview(null); void jobs.refetch(); } },
  });

  return (
    <Page>
      <div className="mb-4 flex items-center gap-3">
        <Link href="/products" className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink"><ArrowLeft size={13} /> Products</Link>
        <h1 className="font-display text-[24px] leading-tight">Import products</h1>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          <Card title="Paste or upload a CSV" eyebrow="Shopify · WooCommerce · BigCommerce · Magento · Squarespace · plain CSV">
            <Textarea value={csv} onChange={(e) => { setCsv(e.target.value); setPreview(null); setDone(null); }} className="min-h-[220px] font-mono !text-[11px]" placeholder="Handle,Title,Body (HTML),Vendor,…" />
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) setCsv(await f.text()); e.target.value = ""; }} />
              <Button icon={<FileUp size={13} />} onClick={() => fileRef.current?.click()}>Upload file</Button>
              <Button variant="ghost" onClick={() => setCsv(SAMPLE)}>Use sample</Button>
              <Field label="Source" className="w-40"><Select value={source} onChange={(e) => setSource(e.target.value)}><option value="">Auto-detect</option>{["shopify", "woocommerce", "bigcommerce", "magento", "squarespace", "csv"].map((s) => <option key={s} value={s}>{s}</option>)}</Select></Field>
              <Field label="Old store URL (for 301s)" className="min-w-[200px] flex-1"><Input value={oldBaseUrl} onChange={(e) => setOldBaseUrl(e.target.value)} placeholder="https://old-store.myshopify.com" /></Field>
              <Button variant="primary" icon={<Search size={13} />} loading={run.isPending && run.variables === true} disabled={!csv.trim()} onClick={() => run.mutate(true)}>Dry run</Button>
            </div>
          </Card>
          {preview && (
            <Card title="Preview" eyebrow={`Detected ${preview.source}`} action={<Button variant="primary" icon={<Play size={13} />} loading={run.isPending && run.variables === false} onClick={() => run.mutate(false)}>Import {preview.counts.products} products</Button>}>
              <div className="mb-3 flex flex-wrap gap-2 text-xs"><Badge>{preview.counts.rows} rows</Badge><Badge>{preview.counts.products} products</Badge><Badge>{preview.counts.variants} variants</Badge></div>
              {preview.issues.length > 0 && <Note tone="warn"><ul className="list-disc pl-4">{preview.issues.map((i, k) => <li key={k}>{i}</li>)}</ul></Note>}
              <Table className="mt-3">
                <thead><tr><Th>Title</Th><Th>Status</Th><Th right>Variants</Th><Th right>From</Th><Th right>Images</Th><Th>Tags</Th></tr></thead>
                <tbody>{preview.preview?.map((p, i) => <Tr key={i}><Td>{p.title}</Td><Td><StatusBadge status={p.status ?? "draft"} /></Td><Td right>{p.variants?.length ?? 1}</Td><Td right>{p.variants?.length ? money(Math.min(...p.variants.map((v) => v.priceCents))) : "—"}</Td><Td right>{p.media?.length ?? 0}</Td><Td className="text-muted">{p.tags?.join(", ")}</Td></Tr>)}</tbody>
              </Table>
              {(preview.counts.products ?? 0) > 10 && <p className="mt-2 text-[11px] text-muted">Showing the first 10 of {preview.counts.products}.</p>}
            </Card>
          )}
          {done && (
            <Note tone="success">Imported {done.counts.products} products with {done.counts.variants} variants{done.counts.redirects ? ` and ${done.counts.redirects} redirects` : ""}. {done.issues.length ? `${done.issues.length} issue(s) logged below.` : ""} <Link href="/products" className="underline">Open products</Link>.</Note>
          )}
        </div>
        <div className="space-y-4">
          <Card title="How it works">
            <ol className="list-decimal space-y-1 pl-4 text-xs text-muted">
              <li>Paste the export from your old platform — the format is detected from the headers.</li>
              <li>Dry-run shows what will be created and flags rows without prices or images.</li>
              <li>Import creates products, variants, inventory and 301 redirects from the old URLs.</li>
              <li>Ask the assistant to tidy the copy afterwards: <em>“Rewrite the imported descriptions in our voice.”</em></li>
            </ol>
          </Card>
          <Card title="Previous imports" padded={false}>
            {(jobs.data?.items ?? []).length === 0 && <div className="px-4 py-5 text-center text-[11px] text-muted">No imports yet.</div>}
            <ul className="divide-y divide-line">
              {(jobs.data?.items ?? []).map((j) => (
                <li key={j.id} className="px-4 py-2 text-xs">
                  <div className="flex items-center justify-between"><span className="font-medium">{j.source}</span><StatusBadge status={j.status} /></div>
                  <div className="text-[11px] text-muted">{j.counts.products ?? 0} products · {j.counts.rows} rows · {fmtDateTime(j.createdAt)}</div>
                  {j.issues.length > 0 && <div className="mt-1 text-[10px] text-amber">{j.issues.length} issue(s)</div>}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </Page>
  );
}
