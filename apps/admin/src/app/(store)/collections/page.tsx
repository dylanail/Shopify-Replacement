"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Sparkles } from "lucide-react";
import { useStore, useStoreQuery } from "@/lib/store-context";
import { useAi } from "@/lib/ai-context";
import type { Collection } from "@/lib/types";
import { Page } from "@/components/shell/shell";
import { Badge, Button, EmptyState, ErrorBox, Loading, PageHeader, Table, Td, Th, Thumb, Tr } from "@/components/ui";

export default function CollectionsPage() {
  const router = useRouter();
  const { store } = useStore();
  const { open } = useAi();
  const q = useStoreQuery<{ items: Collection[] }>(["collections"], "/collections");
  return (
    <Page>
      <PageHeader eyebrow="Catalog" title="Collections" subtitle="Manual lists or smart rules by tag, type, vendor or title." actions={<><Button icon={<Sparkles size={13} className="text-accent" />} onClick={() => open("Create a Summer Essentials collection with anything lightweight")}>Organise with AI</Button><Link href="/collections/new"><Button variant="primary" icon={<Plus size={13} />}>New collection</Button></Link></>} />
      <div className="card">
        {q.isError && <div className="p-3"><ErrorBox error={q.error} retry={() => q.refetch()} /></div>}
        {q.isLoading && <Loading />}
        {q.data && q.data.items.length === 0 && <EmptyState title="No collections yet" body="Group products by season, style or use-case. Smart collections update themselves." action={<Link href="/collections/new"><Button variant="primary">New collection</Button></Link>} />}
        {q.data && q.data.items.length > 0 && (
          <Table>
            <thead><tr><Th>Collection</Th><Th>Kind</Th><Th right>Products</Th><Th>Handle</Th></tr></thead>
            <tbody>
              {q.data.items.map((c) => (
                <Tr key={c.id} onClick={() => router.push(`/collections/${c.id}`)}>
                  <Td><div className="flex items-center gap-3"><Thumb src={c.imageUrl} /><div><div className="font-medium">{c.title}</div><div className="truncate text-[11px] text-muted">{c.description}</div></div></div></Td>
                  <Td><Badge tone={c.kind === "smart" ? "teal" : "neutral"}>{c.kind}</Badge>{c.kind === "smart" && <span className="ml-1 text-[11px] text-muted">{c.rules.map((r) => `${r.field} ${r.op} ${r.value}`).join(" · ")}</span>}</Td>
                  <Td right>{c.productCount ?? 0}</Td>
                  <Td><a href={`${store?.url}/collections/${c.handle}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-muted hover:text-ink">/collections/{c.handle}</a></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
    </Page>
  );
}
