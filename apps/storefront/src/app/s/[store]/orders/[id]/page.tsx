import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getOrder, loadShell, ApiError } from "@/lib/api";
import { storeCtx } from "@/lib/request";
import { storePath } from "@/lib/store-path";
import { formatMoney, formatDate, cadenceLabel } from "@/lib/format";
import { Img } from "@/components/ui/Img";
import { ThankYouExtras } from "@/components/layout/ThankYouExtras";
import { OrderPlacedToast } from "@/components/layout/OrderPlacedToast";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your order", robots: { index: false } };
type Props = { params: Promise<{ store: string; id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function ThankYouPage({ params, searchParams }: Props) {
  const { store, id } = await params;
  const sp = await searchParams;
  const ctx = await storeCtx(store, sp);
  const email = one(sp.email).trim().toLowerCase();
  const shellRes = await loadShell(ctx.key, ctx.env);
  if (!shellRes.ok) return null;
  const shell = shellRes.shell;
  const order = email ? await getOrder(ctx.key, ctx.env, id, email).catch((e: unknown) => { if (e instanceof ApiError && (e.status === 404 || e.status === 400)) return null; throw e; }) : null;

  if (!order) {
    return (
      <div className="container-x py-20 max-w-md">
        <p className="eyebrow text-primary mb-2">Order lookup</p>
        <h1 className="display text-3xl mb-3">Find your order</h1>
        <p className="text-sm text-muted mb-6">{email ? "We couldn't match that email to this order. Try the address you used at checkout." : "Enter the email you used at checkout to view this order."}</p>
        <form method="get" className="flex gap-2">
          {ctx.env === "draft" && <input type="hidden" name="env" value="draft" />}
          <label htmlFor="lookup-email" className="sr-only">Email</label>
          <input id="lookup-email" name="email" type="email" required className="field" defaultValue={email} placeholder="you@example.com" />
          <button className="btn btn-primary" type="submit">View order</button>
        </form>
      </div>
    );
  }
  const a = order.shippingAddress;
  const f = order.fulfillments?.[0];
  return (
    <div className="container-x py-10 sm:py-14">
      <Suspense fallback={null}><OrderPlacedToast /></Suspense>
      <div className="grid lg:grid-cols-12 gap-10">
        <div className="lg:col-span-7 space-y-10">
          <header>
            <p className="eyebrow text-primary mb-2 flex items-center gap-2"><span className="inline-flex w-5 h-5 items-center justify-center bg-primary text-primary-contrast text-[11px]" style={{ borderRadius: "var(--radius-pill)" }} aria-hidden>✓</span> Order confirmed</p>
            <h1 className="display text-3xl sm:text-4xl">Thank you{a?.firstName ? `, ${a.firstName}` : ""}.</h1>
            <p className="text-muted mt-3">Order <strong className="text-ink">#{order.number}</strong> placed {formatDate(order.createdAt)}. A confirmation is on its way to <strong className="text-ink">{order.email}</strong>.</p>
          </header>
          <section aria-labelledby="ship-title" className="grid sm:grid-cols-2 gap-4 text-sm">
            <div className="card p-4"><h2 id="ship-title" className="eyebrow text-[10px] mb-2">Shipping to</h2>{a ? <p>{a.firstName} {a.lastName}<br />{a.line1}{a.line2 ? `, ${a.line2}` : ""}<br />{a.city}{a.province ? `, ${a.province}` : ""} {a.postalCode}<br />{a.country}</p> : <p className="text-muted">—</p>}</div>
            <div className="card p-4"><h2 className="eyebrow text-[10px] mb-2">Delivery</h2><p>{order.shippingMethod ?? "Standard shipping"}</p><p className="text-muted mt-1">{f?.trackingNumber ? <>Tracking: {f.trackingUrl ? <a href={f.trackingUrl} className="underline underline-offset-4" target="_blank" rel="noreferrer">{f.trackingNumber}</a> : f.trackingNumber}</> : "You'll get tracking by email as soon as it ships."}</p><p className="mt-2"><span className="badge bg-ink/8">{order.fulfillmentStatus.replace(/_/g, " ")}</span> <span className="badge bg-primary/10 text-primary ml-1">{order.financialStatus}</span></p></div>
          </section>
          <section aria-labelledby="items-title">
            <h2 id="items-title" className="display text-xl mb-3">Items</h2>
            <ul className="divide-y divide-rule border-y border-rule">
              {order.items.map((i) => (
                <li key={i.id} className="flex items-center gap-4 py-4 text-sm">
                  <div className="w-16 shrink-0 bg-ink/5 overflow-hidden" style={{ borderRadius: "var(--radius-card)" }}><Img src={i.imageUrl} alt="" width={128} height={128} className="w-full aspect-square object-cover" /></div>
                  <div className="flex-1 min-w-0"><p className="font-medium">{i.title}</p><p className="text-xs text-muted">{[i.variantTitle !== "Default" ? i.variantTitle : null, i.subscriptionCadence ? `Subscription · ${cadenceLabel(i.subscriptionCadence)}` : null, typeof i.metadata?.engraving === "string" ? `Engraving “${i.metadata.engraving}”` : null].filter(Boolean).join(" · ")}</p></div>
                  <p className="text-muted">× {i.quantity}</p><p className="font-medium">{formatMoney(i.unitPriceCents * i.quantity, order.currency)}</p>
                </li>
              ))}
            </ul>
          </section>
          <ThankYouExtras order={order} email={email} />
          <section className="card p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div><p className="display text-lg">Keep track of it all</p><p className="text-sm text-muted">Create an account with {order.email} to see orders, manage subscriptions and reorder in a tap.</p></div>
            <Link href={storePath(ctx, "/account/register")} className="btn btn-outline shrink-0">Create account</Link>
          </section>
        </div>
        <aside className="lg:col-span-5"><div className="card p-6 lg:sticky lg:top-24">
          <h2 className="display text-lg mb-4">Summary</h2>
          <dl className="text-sm space-y-2">
            <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd>{formatMoney(order.subtotalCents, order.currency)}</dd></div>
            {order.discountCents > 0 && <div className="flex justify-between text-primary"><dt>Discounts{order.discountCodes.length ? ` (${order.discountCodes.join(", ")})` : ""}</dt><dd>−{formatMoney(order.discountCents, order.currency)}</dd></div>}
            <div className="flex justify-between"><dt className="text-muted">Shipping</dt><dd>{order.shippingCents === 0 ? "Free" : formatMoney(order.shippingCents, order.currency)}</dd></div>
            {order.taxCents > 0 && <div className="flex justify-between"><dt className="text-muted">Tax</dt><dd>{formatMoney(order.taxCents, order.currency)}</dd></div>}
            <div className="flex justify-between border-t border-rule pt-3 text-base font-semibold"><dt>Total</dt><dd>{formatMoney(order.totalCents, order.currency)}</dd></div>
          </dl>
          <p className="text-xs text-muted mt-4">Paid via {order.paymentProvider === "stripe" ? "card (Stripe)" : order.paymentProvider === "test" ? "test payment" : order.paymentProvider}.</p>
          <p className="text-xs text-muted mt-3">Questions? <Link href={storePath(ctx, "/pages/contact")} className="underline underline-offset-4">Contact {shell.brand.name}</Link>.</p>
        </div></aside>
      </div>
    </div>
  );
}
