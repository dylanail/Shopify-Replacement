"use client";

import { useState } from "react";
import { Apple, Check, Copy, Globe, Plus, RefreshCw, Star, Trash2 } from "lucide-react";
import { useStore, useStoreQuery } from "@/lib/store-context";
import { useStoreMutation } from "@/lib/hooks";
import { useEventChannel, type DomainEvent } from "@/lib/events";
import type { DnsInstruction, Domain } from "@/lib/types";
import { Badge, Button, Card, EmptyState, Input, Loading, Note, StatusBadge, Table, Td, Th, Tr, useToast } from "@/components/ui";

function DnsTable({ rows }: { rows: DnsInstruction[] }) {
  const toast = useToast();
  return (
    <Table>
      <thead><tr><Th>Type</Th><Th>Name</Th><Th>Value</Th><Th>Purpose</Th></tr></thead>
      <tbody>{rows.map((r, i) => <Tr key={i}><Td><Badge>{r.type}</Badge></Td><Td className="font-mono text-xs">{r.name}</Td><Td><span className="inline-flex items-center gap-1 font-mono text-xs">{r.value}<button onClick={() => { void navigator.clipboard.writeText(r.value); toast("Copied", "info"); }} className="text-muted hover:text-ink"><Copy size={11} /></button></span></Td><Td className="text-muted">{r.purpose}</Td></Tr>)}</tbody>
    </Table>
  );
}

export default function DomainsPage() {
  const { store } = useStore();
  const q = useStoreQuery<{ items: Domain[]; baseDomain: string }>(["domains"], "/domains");
  const [hostname, setHostname] = useState("");
  const [instructions, setInstructions] = useState<Record<string, DnsInstruction[]>>({});
  const toast = useToast();
  useEventChannel<DomainEvent>("domain", (e) => { toast(`${e.hostname}: ${e.kind}`, e.kind === "verified" ? "success" : "info"); void q.refetch(); });
  const add = useStoreMutation((sapi) => sapi<Domain>("/domains", { method: "POST", body: { hostname } }), { success: "Domain added — add the DNS records below", invalidate: "domains", onSuccess: (d) => { if (d.instructions) setInstructions((i) => ({ ...i, [d.id]: d.instructions! })); setHostname(""); } });
  const verify = useStoreMutation((sapi, id: string) => sapi<Domain & { verified: boolean }>(`/domains/${id}/verify`, { method: "POST", query: q.data?.baseDomain.startsWith("localhost") ? { force: 1 } : undefined }), { success: (d) => (d.verified ? `${d.hostname} verified · SSL issued · Apple Pay registered` : "Not verified yet — DNS can take a few minutes"), invalidate: "domains", onSuccess: (d) => { if (d.instructions) setInstructions((i) => ({ ...i, [d.id]: d.instructions! })); } });
  const primary = useStoreMutation((sapi, id: string) => sapi(`/domains/${id}/primary`, { method: "POST" }), { success: "Primary domain set", invalidate: "domains" });
  const remove = useStoreMutation((sapi, id: string) => sapi(`/domains/${id}`, { method: "DELETE" }), { success: "Domain removed", invalidate: "domains" });
  const d = q.data;
  return (
    <div className="space-y-4">
      <Card title="Add a domain" eyebrow="DNS, SSL and CDN are automatic">
        <div className="flex gap-2"><Input value={hostname} onChange={(e) => setHostname(e.target.value)} onKeyDown={(e) => e.key === "Enter" && hostname && add.mutate()} placeholder="shop.yourbrand.com" /><Button variant="primary" icon={<Plus size={12} />} loading={add.isPending} disabled={!hostname.trim()} onClick={() => add.mutate()}>Add</Button></div>
        <p className="mt-2 text-[11px] text-muted">Your store is always reachable at <a href={store?.url} target="_blank" rel="noreferrer" className="font-mono hover:text-ink">{store?.url}</a>. Preview links use an unguessable slug.</p>
      </Card>
      {q.isLoading && <Loading />}
      {d && d.items.length === 0 && <div className="card"><EmptyState icon={<Globe size={28} />} title="No custom domains" body="Paste a domain you own. We'll verify it with a TXT record, then issue SSL and register it for Apple Pay." /></div>}
      {(d?.items ?? []).map((dom) => (
        <Card key={dom.id} title={<span className="inline-flex items-center gap-2">{dom.hostname}{dom.isPrimary && <Badge tone="ink"><Star size={9} /> primary</Badge>}</span>} action={<div className="flex gap-1.5">{dom.status !== "active" && <Button size="xs" icon={<RefreshCw size={11} />} loading={verify.isPending && verify.variables === dom.id} onClick={() => verify.mutate(dom.id)}>Verify</Button>}{dom.status === "active" && !dom.isPrimary && <Button size="xs" onClick={() => primary.mutate(dom.id)}>Make primary</Button>}<button onClick={() => remove.mutate(dom.id)} className="rounded px-1 text-muted hover:text-danger"><Trash2 size={13} /></button></div>}>
          <div className="mb-3 flex flex-wrap gap-1.5"><StatusBadge status={dom.status} /><Badge tone={dom.sslStatus === "issued" ? "green" : "neutral"} dot>SSL {dom.sslStatus}</Badge><Badge tone={dom.applePayRegistered ? "green" : "neutral"}><Apple size={10} /> Apple Pay {dom.applePayRegistered ? "registered" : "pending"}</Badge></div>
          {dom.status !== "active" ? (
            <>
              <DnsTable rows={instructions[dom.id] ?? [{ type: "TXT", name: `_kiln.${dom.hostname}`, value: dom.verificationToken, purpose: "Ownership verification" }, dom.hostname.split(".").length === 2 ? { type: "A", name: "@", value: "76.76.21.21", purpose: "Route the apex to Kiln's edge" } : { type: "CNAME", name: dom.hostname.split(".")[0]!, value: `edge.${(d?.baseDomain ?? "").split(":")[0]}`, purpose: "Route the subdomain to Kiln's edge" }]} />
              <p className="mt-2 text-[11px] text-muted">Add these at your registrar, then click Verify. Propagation usually takes 5–30 minutes.</p>
            </>
          ) : <Note tone="success"><Check size={12} className="inline" /> Live at https://{dom.hostname} — traffic is served from the edge with automatic certificates.</Note>}
        </Card>
      ))}
    </div>
  );
}
