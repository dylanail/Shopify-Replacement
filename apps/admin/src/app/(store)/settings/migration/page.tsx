"use client";

import Link from "next/link";
import { ArrowRight, Sparkles, Upload } from "lucide-react";
import { useAi } from "@/lib/ai-context";
import { Button, Card } from "@/components/ui";
import { BOOK_CALL_URL } from "@/components/shell/topbar";

const PLATFORMS = ["Shopify", "BigCommerce", "WooCommerce", "Magento", "Squarespace"];
const MOVES = ["Products, variants, images and inventory", "Customers (with a one-time password reset)", "Orders, fulfilments and refunds", "Gift cards and discount codes", "301 redirects, sitemaps and schema", "DNS flip with no downtime"];

export default function MigrationPage() {
  const { open } = useAi();
  return (
    <div className="space-y-4">
      <Card title="Move your store to Kiln" eyebrow={PLATFORMS.join(" · ")}>
        <p className="text-[13px] text-muted">Paste an export and Kiln maps, validates and tidies it. On paid plans a founder does the full migration for you within 48 hours.</p>
        <ul className="mt-3 grid gap-1 text-xs sm:grid-cols-2">{MOVES.map((m) => <li key={m} className="flex items-center gap-1.5"><ArrowRight size={11} className="text-accent" />{m}</li>)}</ul>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/products/import"><Button variant="primary" icon={<Upload size={13} />}>Import a CSV now</Button></Link>
          <Button icon={<Sparkles size={13} className="text-accent" />} onClick={() => open("I want to migrate my store from Shopify. Walk me through it and tell me what to export.")}>Ask the assistant</Button>
          <a href={BOOK_CALL_URL} target="_blank" rel="noreferrer"><Button variant="ghost">Book a migration call</Button></a>
        </div>
      </Card>
      <Card title="How the DNS flip works" eyebrow="Zero downtime">
        <ol className="list-decimal space-y-1 pl-4 text-xs text-muted">
          <li>Import the catalog and customers while your old store keeps selling.</li>
          <li>Add your domain under Settings → Domains and verify the TXT record — nothing changes yet.</li>
          <li>Import redirects so every old URL lands on the right page.</li>
          <li>Point the CNAME/A record at Kiln's edge. SSL is issued automatically; the old store can stay up as a fallback for a day.</li>
        </ol>
      </Card>
    </div>
  );
}
