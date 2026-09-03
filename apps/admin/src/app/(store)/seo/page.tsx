"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Minus, Plus, ScanLine, ShieldCheck, Sparkles } from "lucide-react";
import { useStoreQuery } from "@/lib/store-context";
import { useStoreMutation } from "@/lib/hooks";
import { useAi } from "@/lib/ai-context";
import { cn, fmtNumber } from "@/lib/utils";
import type { Paginated, Product, SeoOverview } from "@/lib/types";
import { Page } from "@/components/shell/shell";
import { Sparkline } from "@/components/charts";
import { Badge, Button, Card, Dialog, EmptyState, Field, Input, Loading, PageHeader, Select, StatTiles, Table, Td, Textarea, Th, Tr } from "@/components/ui";

function StackedArea({ series, takeoverIndex }: { series: SeoOverview["series"]; takeoverIndex: number }) {
  const W = 720, H = 200, PL = 40, PR = 12, PT = 14, PB = 24;
  const n = series.length;
  if (!n) return null;
  const max = Math.max(1, ...series.map((s) => s.impressions));
  const px = (i: number) => PL + (i / Math.max(1, n - 1)) * (W - PL - PR);
  const py = (v: number) => PT + (1 - v / max) * (H - PT - PB);
  const imp = series.map((s, i) => `${i === 0 ? "M" : "L"}${px(i).toFixed(1)},${py(s.impressions).toFixed(1)}`).join(" ");
  const clk = series.map((s, i) => `${i === 0 ? "M" : "L"}${px(i).toFixed(1)},${py(s.clicks).toFixed(1)}`).join(" ");
  const base = `L${px(n - 1).toFixed(1)},${H - PB} L${px(0).toFixed(1)},${H - PB} Z`;
  const tx = px(takeoverIndex);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full">
      {[0, 0.5, 1].map((t) => <g key={t}><line x1={PL} x2={W - PR} y1={py(t * max)} y2={py(t * max)} stroke="#e9e2d9" strokeDasharray="2 3" /><text x={PL - 6} y={py(t * max) + 3} textAnchor="end" fontSize="10" fill="#a89d93">{fmtNumber(Math.round(t * max))}</text></g>)}
      <path d={`${imp} ${base}`} fill="#2f6f6a" opacity={0.18} />
      <path d={imp} fill="none" stroke="#2f6f6a" strokeWidth={1.6} />
      <path d={`${clk} ${base}`} fill="#b8552f" opacity={0.35} />
      <path d={clk} fill="none" stroke="#b8552f" strokeWidth={1.6} />
      <line x1={tx} x2={tx} y1={PT} y2={H - PB} stroke="#1a1a1a" strokeDasharray="3 3" />
      <rect x={tx + 4} y={PT} width={92} height={16} rx={2} fill="#1a1a1a" /><text x={tx + 9} y={PT + 11} fontSize="10" fill="#fff">Kiln took over</text>
      <text x={px(0)} y={H - 8} fontSize="10" fill="#a89d93">{series[0]!.day.slice(5)}</text><text x={px(n - 1)} y={H - 8} textAnchor="end" fontSize="10" fill="#a89d93">{series[n - 1]!.day.slice(5)}</text>
      <g fontSize="10"><rect x={W - PR - 150} y={PT} width={8} height={8} fill="#2f6f6a" opacity={0.6} /><text x={W - PR - 138} y={PT + 8} fill="#7a6f66">impressions</text><rect x={W - PR - 70} y={PT} width={8} height={8} fill="#b8552f" opacity={0.7} /><text x={W - PR - 58} y={PT + 8} fill="#7a6f66">clicks</text></g>
    </svg>
  );
}

export default function SeoPage() {
  const { open } = useAi();
  const q = useStoreQuery<SeoOverview>(["seo"], "/seo");
  const products = useStoreQuery<Paginated<Product>>(["products"], "/products", { query: { pageSize: 100, status: "published" } });
  const scan = useStoreMutation((sapi) => sapi<{ scanned: number; issues: number }>("/seo/scan", { method: "POST" }), { success: (r) => `Scanned ${r.scanned} pages · ${r.issues} issues`, invalidate: "seo" });
  const [kw, setKw] = useState<{ open: boolean; query: string; page: string; position: string }>({ open: false, query: "", page: "/", position: "" });
  const addKw = useStoreMutation((sapi) => sapi("/seo/keywords", { method: "POST", body: { query: kw.query, page: kw.page, position: kw.position ? Number(kw.position) : null } }), { success: "Keyword tracked", invalidate: "seo", onSuccess: () => setKw({ open: false, query: "", page: "/", position: "" }) });
  const [rd, setRd] = useState({ from: "", to: "" });
  const [bulk, setBulk] = useState("");
  const addRd = useStoreMutation((sapi) => sapi("/seo/redirects", { method: "POST", body: { fromPath: rd.from, toPath: rd.to } }), { success: "Redirect added", invalidate: "seo", onSuccess: () => setRd({ from: "", to: "" }) });
  const bulkRd = useStoreMutation((sapi) => sapi<{ imported: number }>("/seo/redirects/bulk", { method: "POST", body: { items: bulk.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => { const [from, to] = l.split(/[,\t]| -> |→/).map((s) => s?.trim() ?? ""); return { fromPath: from, toPath: to }; }).filter((r) => r.fromPath && r.toPath) } }), { success: (r) => `Imported ${r.imported} redirects`, invalidate: "seo", onSuccess: () => setBulk("") });
  const [valPid, setValPid] = useState("");
  const validate = useStoreQuery<{ product: string; ok: boolean; issues: string[]; jsonLd: unknown }>(["seo-validate", valPid], `/seo/validate/${valPid}`, { enabled: !!valPid });
  const d = q.data;
  const totals = d ? { impressions: d.series.reduce((s, x) => s + x.impressions, 0), clicks: d.series.reduce((s, x) => s + x.clicks, 0) } : null;
  const sevTone = (s: string) => (s === "red" ? "bg-danger" : s === "amber" ? "bg-amber" : "bg-positive");

  return (
    <Page wide>
      <PageHeader eyebrow="Search" title={<span className="text-teal">SEO</span>} subtitle="Keyword tracking, pages needing attention, redirects and schema — meta, alt text and JSON-LD are generated on every product save." actions={<><Button icon={<Sparkles size={13} className="text-accent" />} onClick={() => open("Scan my products for SEO issues and fix the ones you can")}>Fix with AI</Button><Button variant="primary" icon={<ScanLine size={13} />} loading={scan.isPending} onClick={() => scan.mutate()}>Scan now</Button></>} />
      {q.isLoading && <Loading />}
      {d && (
        <>
          <StatTiles items={[{ label: "Impressions (90d)", value: fmtNumber(totals!.impressions) }, { label: "Clicks (90d)", value: fmtNumber(totals!.clicks) }, { label: "Tracked keywords", value: d.keywords.length }, { label: "Open issues", value: d.issues.length, hint: `${d.issues.filter((i) => i.severity === "red").length} critical` }]} />
          <Card className="mt-4" title="Impressions vs clicks" eyebrow="Last 90 days · Search Console-style">
            <StackedArea series={d.series} takeoverIndex={d.takeoverIndex} />
          </Card>
          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_380px]">
            <div className="space-y-4">
              <Card title="Keywords" padded={false} action={<Button size="xs" icon={<Plus size={11} />} onClick={() => setKw({ ...kw, open: true })}>Track keyword</Button>}>
                {d.keywords.length === 0 ? <EmptyState title="No keywords tracked" body="Add the queries you want to rank for; positions and clicks update as data comes in." /> : (
                  <Table>
                    <thead><tr><Th>Query</Th><Th>Page</Th><Th right>Position</Th><Th right>Weekly Δ</Th><Th right>28-day clicks</Th></tr></thead>
                    <tbody>
                      {d.keywords.map((k) => {
                        const delta = k.position != null && k.previousPosition != null ? k.previousPosition - k.position : null;
                        return (
                          <Tr key={k.id}>
                            <Td className="font-medium">{k.query}</Td><Td className="text-muted">{k.page}</Td>
                            <Td right>{k.position ?? "—"}</Td>
                            <Td right>{delta === null ? <Minus size={12} className="inline text-faint" /> : <span className={cn("inline-flex items-center gap-0.5 text-xs", delta > 0 ? "text-positive" : delta < 0 ? "text-danger" : "text-muted")}>{delta > 0 ? <ArrowUp size={11} /> : delta < 0 ? <ArrowDown size={11} /> : <Minus size={11} />}{Math.abs(delta)}</span>}</Td>
                            <Td right><span className="inline-flex items-center gap-2"><Sparkline values={k.clicks28d} /><span className="w-8 text-right">{k.clicks28d.reduce((a, b) => a + b, 0)}</span></span></Td>
                          </Tr>
                        );
                      })}
                    </tbody>
                  </Table>
                )}
              </Card>
              <Card title="Pages needing attention" padded={false} eyebrow="Red · amber · green">
                {d.issues.length === 0 ? <EmptyState title="Nothing flagged" body="Run a scan to check published products for missing alt text, thin descriptions, long titles and broken schema." /> : (
                  <ul className="divide-y divide-line">{d.issues.map((i) => <li key={i.id} className="flex items-center gap-3 px-4 py-2 text-xs"><span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", sevTone(i.severity))} /><span className="w-48 shrink-0 truncate font-mono text-[11px]">{i.path}</span><span className="flex-1">{i.issue}</span><Button size="xs" variant="ghost" onClick={() => open(`Fix this SEO issue on ${i.path}: ${i.issue}`)}>Fix</Button></li>)}</ul>
                )}
              </Card>
            </div>
            <div className="space-y-4">
              <Card title="Redirects" eyebrow={`${d.redirects.length} active · 301`}>
                <div className="flex gap-1.5"><Input value={rd.from} onChange={(e) => setRd({ ...rd, from: e.target.value })} placeholder="/old-path" className="!h-7 font-mono !text-[11px]" /><Input value={rd.to} onChange={(e) => setRd({ ...rd, to: e.target.value })} placeholder="/products/new" className="!h-7 font-mono !text-[11px]" /><Button size="sm" loading={addRd.isPending} disabled={!rd.from || !rd.to} onClick={() => addRd.mutate()}>Add</Button></div>
                <Field label="Bulk paste (from, to per line)" className="mt-3"><Textarea value={bulk} onChange={(e) => setBulk(e.target.value)} className="min-h-[70px] font-mono !text-[11px]" placeholder={"/collections/gloves, /collections/boxing-gloves\n/pages/about -> /about"} /></Field>
                <Button size="sm" className="mt-1.5" loading={bulkRd.isPending} disabled={!bulk.trim()} onClick={() => bulkRd.mutate()}>Import bulk</Button>
                {d.redirects.length > 0 && <ul className="mt-3 max-h-40 divide-y divide-line overflow-y-auto rounded border border-line text-[11px]">{d.redirects.map((r) => <li key={r.id} className="flex gap-2 px-2 py-1 font-mono"><span className="truncate text-muted">{r.fromPath}</span><span>→</span><span className="truncate">{r.toPath}</span><Badge className="ml-auto">{r.code}</Badge></li>)}</ul>}
              </Card>
              <Card title="Schema validator" eyebrow="Product · Offer · AggregateRating">
                <Select value={valPid} onChange={(e) => setValPid(e.target.value)}><option value="">Pick a product…</option>{(products.data?.items ?? []).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</Select>
                {validate.data && (
                  <div className="mt-3 text-xs">
                    <div className={cn("flex items-center gap-1.5 font-medium", validate.data.ok ? "text-positive" : "text-danger")}><ShieldCheck size={13} /> {validate.data.ok ? "Valid JSON-LD" : `${validate.data.issues.length} issue(s)`}</div>
                    {validate.data.issues.length > 0 && <ul className="mt-1 list-disc pl-4 text-danger">{validate.data.issues.map((i) => <li key={i}>{i}</li>)}</ul>}
                    <pre className="scrollbar-thin mt-2 max-h-48 overflow-auto rounded border border-line bg-cream p-2 font-mono text-[10px]">{JSON.stringify(validate.data.jsonLd, null, 1)}</pre>
                  </div>
                )}
              </Card>
              <Card title="Automatic" eyebrow="Always on">
                <ul className="space-y-1 text-[11px] text-muted">
                  <li>· sitemap.xml, robots.txt and llms.txt served per store</li>
                  <li>· Meta title, description, alt text and Product JSON-LD on product save</li>
                  <li>· 301s created for every imported product URL</li>
                  <li>· BreadcrumbList and Organization schema in the storefront shell</li>
                </ul>
              </Card>
            </div>
          </div>
        </>
      )}
      <Dialog open={kw.open} onClose={() => setKw({ ...kw, open: false })} title="Track a keyword" width="max-w-sm" footer={<><Button variant="ghost" onClick={() => setKw({ ...kw, open: false })}>Cancel</Button><Button variant="primary" loading={addKw.isPending} disabled={!kw.query.trim()} onClick={() => addKw.mutate()}>Track</Button></>}>
        <div className="space-y-3">
          <Field label="Query" required><Input value={kw.query} onChange={(e) => setKw({ ...kw, query: e.target.value })} placeholder="hand stitched boxing gloves" autoFocus /></Field>
          <Field label="Target page"><Input value={kw.page} onChange={(e) => setKw({ ...kw, page: e.target.value })} placeholder="/products/sparring-16oz" /></Field>
          <Field label="Current position (optional)"><Input type="number" value={kw.position} onChange={(e) => setKw({ ...kw, position: e.target.value })} /></Field>
        </div>
      </Dialog>
    </Page>
  );
}
