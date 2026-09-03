import type { Metadata } from "next";
import { loadShell } from "@/lib/api";
import { storeCtx } from "@/lib/request";
import { ContactPageBody } from "@/components/layout/ContactPageBody";
import { brandLocation } from "@/lib/brand";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Contact" };
type Props = { params: Promise<{ store: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ContactPage({ params, searchParams }: Props) {
  const ctx = await storeCtx((await params).store, await searchParams);
  const res = await loadShell(ctx.key, ctx.env);
  if (!res.ok) return null;
  const b = res.shell.brand;
  const heading = String(res.shell.plugins.find((p) => p.id === "contact-form")?.settings.heading ?? "") || "Talk to us";
  return (
    <div className="container-x py-10 sm:py-16">
      <div className="grid md:grid-cols-2 gap-10 lg:gap-16">
        <div>
          <p className="eyebrow text-primary mb-2">Contact</p>
          <h1 className="display text-4xl mb-4">{heading}</h1>
          <p className="text-muted max-w-md">Sizing, lead times, custom orders, repairs — write to us and a real person at {b.name} replies, usually within a business day.</p>
          <dl className="mt-8 text-sm space-y-3">
            {brandLocation(b.description) && <div><dt className="eyebrow text-[10px] text-muted">Workshop</dt><dd>{brandLocation(b.description)}</dd></div>}
            <div><dt className="eyebrow text-[10px] text-muted">Hours</dt><dd>Monday – Friday, 9:00 – 18:00</dd></div>
          </dl>
        </div>
        <div className="card p-6"><ContactPageBody /></div>
      </div>
    </div>
  );
}
