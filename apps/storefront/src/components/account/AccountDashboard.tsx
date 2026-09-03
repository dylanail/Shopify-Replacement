"use client";
import { useState } from "react";
import Link from "next/link";
import { useAccount } from "@/components/providers/AccountProvider";
import { useStore } from "@/components/providers/StoreProvider";
import { Slot } from "@/components/slots/Slot";
import { formatMoney, formatDate, cadenceLabel } from "@/lib/format";
import { errorMessage } from "@/lib/client-api";
import type { Subscription } from "@/lib/types";

const CADENCES = ["weekly", "monthly", "quarterly", "annual"];

export function AccountGate({ children }: { children: React.ReactNode }) {
  const { token, loading } = useAccount();
  const store = useStore();
  if (loading && !token) return <div className="container-x py-16"><div className="skeleton h-40 max-w-xl" aria-label="Loading account" /></div>;
  if (!token) return (
    <div className="container-x py-20 text-center space-y-4">
      <p className="eyebrow text-primary">Account</p>
      <h1 className="display text-3xl">Sign in to continue</h1>
      <p className="text-muted text-sm">Orders, subscriptions and addresses live here.</p>
      <div className="flex justify-center gap-3"><Link href={store.path("/account/login")} className="btn btn-primary">Sign in</Link><Link href={store.path("/account/register")} className="btn btn-outline">Create account</Link></div>
    </div>
  );
  return <>{children}</>;
}

export function AccountDashboard() {
  const { account, logout, refresh } = useAccount();
  const store = useStore();
  if (!account) return <div className="container-x py-16"><div className="skeleton h-40 max-w-xl" /></div>;
  const { customer, orders, subscriptions } = account;
  return (
    <div className="container-x py-10 sm:py-14 space-y-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="eyebrow text-primary mb-1">Account</p><h1 className="display text-3xl">Hello{customer.firstName ? `, ${customer.firstName}` : ""}.</h1><p className="text-sm text-muted mt-1">{customer.email}</p></div>
        <div className="flex gap-2"><Link href={store.path("/account/preferences")} className="btn btn-outline">Preferences</Link><button type="button" className="btn btn-ghost" onClick={logout}>Sign out</button></div>
      </div>
      <Slot name="accountOverview" ctx={{ page: "account", email: customer.email }} />
      <section aria-labelledby="orders-title">
        <h2 id="orders-title" className="display text-xl mb-4">Orders</h2>
        {!orders.length ? <p className="text-sm text-muted card p-6">No orders yet. <Link href={store.path("/collections/all")} className="underline underline-offset-4">Start with the essentials</Link>.</p> : (
          <div className="overflow-x-auto card">
            <table className="w-full text-sm">
              <thead><tr className="text-left eyebrow text-[10px] border-b border-rule"><th className="p-3">Order</th><th className="p-3">Date</th><th className="p-3">Items</th><th className="p-3">Status</th><th className="p-3 text-right">Total</th></tr></thead>
              <tbody>{orders.map((o) => (
                <tr key={o.id} className="border-b border-rule last:border-0">
                  <td className="p-3"><Link href={store.path(`/orders/${o.id}?email=${encodeURIComponent(o.email)}`)} className="underline underline-offset-4">#{o.number}</Link></td>
                  <td className="p-3 text-muted">{formatDate(o.createdAt)}</td>
                  <td className="p-3">{o.items.reduce((s, i) => s + i.quantity, 0)}</td>
                  <td className="p-3"><span className="badge bg-ink/8">{o.fulfillmentStatus.replace(/_/g, " ")}</span></td>
                  <td className="p-3 text-right">{formatMoney(o.totalCents, o.currency)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
      <section aria-labelledby="subs-title">
        <h2 id="subs-title" className="display text-xl mb-4">Subscriptions</h2>
        {!subscriptions.length ? <p className="text-sm text-muted card p-6">No active subscriptions. Products with “Subscribe &amp; save” show up here.</p> : <ul className="grid md:grid-cols-2 gap-4">{subscriptions.map((s) => <SubscriptionCard key={s.id} sub={s} />)}</ul>}
      </section>
      <section aria-labelledby="addr-title">
        <h2 id="addr-title" className="display text-xl mb-4">Addresses</h2>
        {!customer.addresses?.length ? <p className="text-sm text-muted card p-6">Your shipping address is saved automatically when you place an order.</p> : (
          <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{customer.addresses.map((a, i) => <li key={i} className="card p-4 text-sm">{i === 0 && <span className="badge bg-primary/10 text-primary mb-2">Default</span>}<p>{a.firstName} {a.lastName}</p><p>{a.line1}{a.line2 ? `, ${a.line2}` : ""}</p><p>{a.city}{a.province ? `, ${a.province}` : ""} {a.postalCode}</p><p>{a.country}</p>{a.phone && <p className="text-muted">{a.phone}</p>}</li>)}</ul>
        )}
      </section>
      <button type="button" className="text-xs text-muted underline underline-offset-4" onClick={() => void refresh()}>Refresh</button>
    </div>
  );
}

function SubscriptionCard({ sub }: { sub: Subscription }) {
  const { subscriptionAction } = useAccount();
  const store = useStore();
  const p = store.merchProducts.find((x) => x.variants.some((v) => v.id === sub.variantId));
  const v = p?.variants.find((x) => x.id === sub.variantId);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [cadence, setCadence] = useState(sub.cadence);
  const run = async (action: "pause" | "resume" | "cancel" | "change_cadence") => {
    if (action === "cancel" && !window.confirm("Cancel this subscription? You can subscribe again anytime.")) return;
    setBusy(action); setErr(null);
    try { await subscriptionAction(sub.id, action, action === "change_cadence" ? cadence : undefined); } catch (x) { setErr(errorMessage(x)); } finally { setBusy(null); }
  };
  const status = sub.status;
  return (
    <li className="card p-5 space-y-3">
      <div className="flex justify-between gap-3">
        <div><p className="font-medium">{p?.title ?? "Subscription"}{v && v.title !== "Default" ? ` · ${v.title}` : ""}</p><p className="text-xs text-muted">{sub.quantity} × {formatMoney(sub.priceCents, sub.currency)} · {cadenceLabel(sub.cadence)}</p></div>
        <span className={`badge self-start ${status === "active" || status === "trialing" ? "bg-primary/10 text-primary" : status === "paused" ? "bg-amber-100 text-amber-900" : "bg-ink/8"}`}>{status.replace("_", " ")}</span>
      </div>
      {sub.nextBillingAt && status !== "cancelled" && <p className="text-xs text-muted">Next delivery {formatDate(sub.nextBillingAt)}{sub.trialEndsAt && new Date(sub.trialEndsAt) > new Date() ? ` · trial ends ${formatDate(sub.trialEndsAt)}` : ""}</p>}
      {status !== "cancelled" && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <label className="sr-only" htmlFor={`cad-${sub.id}`}>Cadence</label>
          <select id={`cad-${sub.id}`} className="field w-auto min-h-9 text-xs" value={cadence} onChange={(e) => setCadence(e.target.value)}>{CADENCES.map((c) => <option key={c} value={c}>{cadenceLabel(c)}</option>)}</select>
          <button type="button" className="btn btn-outline min-h-9 px-3 text-xs" disabled={busy !== null || cadence === sub.cadence} onClick={() => run("change_cadence")}>{busy === "change_cadence" ? "…" : "Update cadence"}</button>
          {status === "paused" ? <button type="button" className="btn btn-primary min-h-9 px-3 text-xs" disabled={busy !== null} onClick={() => run("resume")}>{busy === "resume" ? "…" : "Resume"}</button> : <button type="button" className="btn btn-outline min-h-9 px-3 text-xs" disabled={busy !== null} onClick={() => run("pause")}>{busy === "pause" ? "…" : "Pause"}</button>}
          <button type="button" className="text-muted underline underline-offset-4 ml-auto" disabled={busy !== null} onClick={() => run("cancel")}>Cancel</button>
        </div>
      )}
      {err && <p role="alert" className="text-xs text-red-700">{err}</p>}
    </li>
  );
}

export function Preferences() {
  const { account, refresh } = useAccount();
  const store = useStore();
  const [state, setState] = useState<{ status: "idle" | "busy" | "done" | "error"; msg?: string }>({ status: "idle" });
  if (!account) return null;
  const c = account.customer;
  const subscribe = async () => {
    setState({ status: "busy" });
    try { const { api } = await import("@/lib/client-api"); await api(store.key, "/newsletter", { body: { email: c.email } }); await refresh(); setState({ status: "done", msg: "You're subscribed." }); }
    catch (x) { setState({ status: "error", msg: errorMessage(x) }); }
  };
  return (
    <div className="container-x py-10 sm:py-14 max-w-2xl space-y-8">
      <div><p className="eyebrow text-primary mb-1"><Link href={store.path("/account")} className="hover:underline">Account</Link> / Preferences</p><h1 className="display text-3xl">Preferences</h1></div>
      <section className="card p-5 space-y-3">
        <h2 className="display text-lg">Profile</h2>
        <dl className="text-sm grid grid-cols-[8rem_1fr] gap-y-1"><dt className="text-muted">Name</dt><dd>{[c.firstName, c.lastName].filter(Boolean).join(" ") || "—"}</dd><dt className="text-muted">Email</dt><dd>{c.email}</dd></dl>
        <p className="text-xs text-muted">To change your name or email, <Link href={store.path("/pages/contact")} className="underline underline-offset-4">contact us</Link> — we'll update it within a day.</p>
      </section>
      <section className="card p-5 space-y-3">
        <h2 className="display text-lg">Email</h2>
        <p className="text-sm">Marketing emails: <strong>{c.acceptsMarketing ? "on" : "off"}</strong></p>
        {!c.acceptsMarketing ? <button type="button" className="btn btn-outline" onClick={subscribe} disabled={state.status === "busy"}>{state.status === "busy" ? "…" : "Subscribe to updates"}</button> : <p className="text-xs text-muted">Every email includes a one-click unsubscribe link.</p>}
        {state.msg && <p role="status" className={`text-xs ${state.status === "error" ? "text-red-700" : "text-muted"}`}>{state.msg}</p>}
      </section>
      <section className="card p-5 space-y-3">
        <h2 className="display text-lg">Region &amp; currency</h2>
        <p className="text-sm text-muted">{store.regions.length > 1 ? "Change your region with the switcher in the header — prices and shipping follow it." : `Prices are shown in ${store.currency}.`}</p>
      </section>
    </div>
  );
}
