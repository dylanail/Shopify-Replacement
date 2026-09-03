import type { Metadata } from "next";
import Link from "next/link";
import { loadShell, getShippingOptions } from "@/lib/api";
import { storeCtx } from "@/lib/request";
import { storePath } from "@/lib/store-path";
import { formatMoney } from "@/lib/format";
import { AccordionItem } from "@/components/ui/Accordion";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Shipping & returns" };
type Props = { params: Promise<{ store: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ShippingPage({ params, searchParams }: Props) {
  const ctx = await storeCtx((await params).store, await searchParams);
  const res = await loadShell(ctx.key, ctx.env);
  if (!res.ok) return null;
  const shell = res.shell;
  const currency = shell.region?.currency ?? "USD";
  const opts = await getShippingOptions(ctx.key, ctx.env, shell.region?.id).then((r) => r.items).catch(() => []);
  const trust = (shell.theme.sections.find((s) => s.type === "trust-strip")?.settings.items as string[] | undefined) ?? [];
  const regions = shell.regions.length ? shell.regions : shell.region ? [shell.region] : [];
  return (
    <div className="container-x py-10 sm:py-16 max-w-3xl">
      <p className="eyebrow text-primary mb-2">Help</p>
      <h1 className="display text-4xl mb-4">Shipping &amp; returns</h1>
      <p className="text-muted mb-10">Everything about how {shell.brand.name} gets your order to you — and what happens if it isn't right.</p>
      {trust.length > 0 && <ul className="flex flex-wrap gap-x-6 gap-y-2 mb-10">{trust.map((t, i) => <li key={i} className="eyebrow text-[10.5px] flex items-center gap-2"><span className="text-primary" aria-hidden>◆</span>{t}</li>)}</ul>}
      <section className="mb-10" aria-labelledby="rates">
        <h2 id="rates" className="display text-2xl mb-4">Shipping rates</h2>
        {opts.length ? (
          <table className="w-full text-sm card"><thead><tr className="text-left eyebrow text-[10px] border-b border-rule"><th className="p-3">Method</th><th className="p-3">Estimate</th><th className="p-3 text-right">Rate</th></tr></thead>
            <tbody>{opts.map((o) => <tr key={o.id} className="border-b border-rule last:border-0"><td className="p-3">{o.name}</td><td className="p-3 text-muted">{o.estimate || "—"}</td><td className="p-3 text-right">{o.amountCents === 0 ? "Free" : formatMoney(o.amountCents, currency)}{o.thresholdCents ? <span className="block text-xs text-muted">Free over {formatMoney(o.thresholdCents, currency)}</span> : null}</td></tr>)}</tbody></table>
        ) : <p className="text-sm text-muted">Rates are shown at checkout once you enter your address.</p>}
        {regions.length > 0 && <p className="text-xs text-muted mt-3">We ship to {regions.flatMap((r) => r.countries).length} countries across {regions.length} {regions.length === 1 ? "region" : "regions"}. Prices in {currency}.</p>}
      </section>
      <section aria-labelledby="policy">
        <h2 id="policy" className="display text-2xl mb-4">Policies</h2>
        <div className="border-t border-rule">
          <AccordionItem title="When will my order ship?" open>In-stock pieces leave the workshop within 2 business days. Made-to-order and personalised pieces ship once they're finished — the lead time is shown on the product page and in your confirmation email. You'll get tracking the moment it's on its way.</AccordionItem>
          <AccordionItem title="Returns and exchanges">Unworn, unpersonalised items can be returned within 30 days of delivery for a refund or exchange. Engraved and custom-built pieces are final sale. Start a return by replying to your order email or through the <Link href={storePath(ctx, "/pages/contact")} className="underline">contact page</Link>.</AccordionItem>
          <AccordionItem title="Duties and taxes">Orders shipped within your region include applicable taxes at checkout. International orders may be subject to import duties collected by the carrier on delivery.</AccordionItem>
          <AccordionItem title="Repairs">{shell.brand.name} repairs manufacturing defects free of charge for the life of the piece. Wear-and-tear repairs are quoted case by case — get in touch with a photo.</AccordionItem>
        </div>
      </section>
    </div>
  );
}
