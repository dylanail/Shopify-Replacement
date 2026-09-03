"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Ban, Check, PackageCheck, RotateCcw, Sparkles, Truck, Undo2 } from "lucide-react";
import { useStoreQuery } from "@/lib/store-context";
import { useStoreMutation } from "@/lib/hooks";
import { useAi } from "@/lib/ai-context";
import { centsToInput, fmtDateTime, inputToCents, money } from "@/lib/utils";
import type { Order } from "@/lib/types";
import { Page } from "@/components/shell/shell";
import { Badge, Button, Card, Checkbox, Chips, Dialog, ErrorBox, Field, Input, Loading, Select, StatusBadge, Textarea, Thumb } from "@/components/ui";
import type { Address } from "@kiln/shared";

function AddressBlock({ a }: { a: Address | null }) {
  if (!a) return <span className="text-muted">—</span>;
  return <address className="not-italic text-xs leading-relaxed">{a.firstName} {a.lastName}<br />{a.company && <>{a.company}<br /></>}{a.line1}{a.line2 ? `, ${a.line2}` : ""}<br />{a.city}{a.province ? `, ${a.province}` : ""} {a.postalCode}<br />{a.country}{a.phone && <><br />{a.phone}</>}</address>;
}

export default function OrderPage() {
  const { id } = useParams<{ id: string }>();
  const { open } = useAi();
  const q = useStoreQuery<Order>(["order", id], `/orders/${id}`);
  const o = q.data;
  const [dlg, setDlg] = useState<"fulfil" | "cancel" | "refund" | "return" | null>(null);
  const [ful, setFul] = useState({ provider: "manual", trackingNumber: "", trackingUrl: "", items: {} as Record<string, number> });
  const [reason, setReason] = useState("");
  const [refundAmt, setRefundAmt] = useState("");
  const [ret, setRet] = useState<{ kind: "refund" | "exchange"; items: Record<string, { qty: number; reason: string }> }>({ kind: "refund", items: {} });
  const [tags, setTags] = useState<string[] | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const close = () => setDlg(null);

  const fulfil = useStoreMutation((sapi) => sapi(`/orders/${id}/fulfill`, { method: "POST", body: { provider: ful.provider, trackingNumber: ful.trackingNumber || undefined, trackingUrl: ful.trackingUrl || undefined, items: Object.entries(ful.items).filter(([, n]) => n > 0).map(([variantId, quantity]) => ({ variantId, quantity })) } }), { success: "Fulfilment created · shipping email sent", onSuccess: close });
  const delivered = useStoreMutation((sapi, fid: string) => sapi(`/fulfillments/${fid}/delivered`, { method: "POST" }), { success: "Marked delivered" });
  const cancel = useStoreMutation((sapi) => sapi(`/orders/${id}/cancel`, { method: "POST", body: { reason } }), { success: "Order cancelled", onSuccess: close });
  const refund = useStoreMutation((sapi) => sapi(`/orders/${id}/refund`, { method: "POST", body: { amountCents: refundAmt ? inputToCents(refundAmt) : undefined, reason } }), { success: "Refund issued", onSuccess: close });
  const createReturn = useStoreMutation((sapi) => sapi(`/orders/${id}/returns`, { method: "POST", body: { kind: ret.kind, items: Object.entries(ret.items).filter(([, v]) => v.qty > 0).map(([variantId, v]) => ({ variantId, quantity: v.qty, reason: v.reason })) } }), { success: "Return created · label issued", onSuccess: close });
  const completeReturn = useStoreMutation((sapi, rid: string) => sapi(`/returns/${rid}/complete`, { method: "POST" }), { success: "Return completed · stock restored" });

  if (q.isError) return <Page><ErrorBox error={q.error} retry={() => q.refetch()} /></Page>;
  if (!o) return <Page><Loading /></Page>;
  const remaining = o.items.map((i) => ({ ...i, left: i.quantity - i.fulfilledQuantity })).filter((i) => i.left > 0);
  const maxRefund = o.totalCents - o.refundedCents;
  const timeline = [
    { at: o.createdAt, label: `Order placed · ${money(o.totalCents, o.currency)} via ${o.paymentProvider}` },
    ...(o.refunds ?? []).map((r) => ({ at: r.createdAt, label: `Refunded ${money(r.amountCents, o.currency)}${r.reason ? ` — ${r.reason}` : ""} (${r.actor})` })),
    ...(o.fulfillments ?? []).flatMap((f) => [{ at: f.createdAt, label: `Shipped via ${f.provider}${f.trackingNumber ? ` · ${f.trackingNumber}` : ""}` }, ...(f.deliveredAt ? [{ at: f.deliveredAt, label: "Delivered" }] : [])]),
    ...(o.returns ?? []).map((r) => ({ at: r.createdAt, label: `Return (${r.kind}) · ${r.status} · ${money(r.refundCents, o.currency)}` })),
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  return (
    <Page>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link href="/orders" className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink"><ArrowLeft size={13} /> Orders</Link>
        <h1 className="font-display text-[24px] leading-tight">Order #{o.number}</h1>
        <StatusBadge status={o.status} /><StatusBadge status={o.financialStatus} /><StatusBadge status={o.fulfillmentStatus} />
        <span className="text-xs text-muted">{fmtDateTime(o.createdAt)}</span>
        <span className="flex-1" />
        <div className="flex flex-wrap gap-2">
          {remaining.length > 0 && o.status !== "cancelled" && <Button variant="primary" icon={<Truck size={13} />} onClick={() => { setFul({ provider: "manual", trackingNumber: "", trackingUrl: "", items: Object.fromEntries(remaining.map((i) => [i.variantId, i.left])) }); setDlg("fulfil"); }}>Fulfil</Button>}
          {maxRefund > 0 && o.financialStatus !== "pending" && <Button icon={<Undo2 size={13} />} onClick={() => { setRefundAmt(centsToInput(maxRefund)); setReason(""); setDlg("refund"); }}>Refund</Button>}
          {o.fulfillmentStatus !== "unfulfilled" && <Button icon={<RotateCcw size={13} />} onClick={() => { setRet({ kind: "refund", items: {} }); setDlg("return"); }}>Create return</Button>}
          {o.status !== "cancelled" && o.fulfillmentStatus !== "fulfilled" && <Button variant="danger" icon={<Ban size={13} />} onClick={() => { setReason(""); setDlg("cancel"); }}>Cancel</Button>}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Card title="Items" padded={false}>
            <ul className="divide-y divide-line">
              {o.items.map((i) => (
                <li key={i.id} className="flex items-center gap-3 px-4 py-2.5">
                  <Thumb src={i.imageUrl} size={44} />
                  <div className="min-w-0 flex-1"><div className="font-medium">{i.title}</div><div className="text-[11px] text-muted">{i.variantTitle}{i.subscriptionCadence ? ` · subscription (${i.subscriptionCadence})` : ""}</div></div>
                  <div className="text-right text-xs"><div>{i.quantity} × {money(i.unitPriceCents, o.currency)}</div><div className="text-[11px] text-muted">{i.fulfilledQuantity}/{i.quantity} fulfilled{i.returnedQuantity ? ` · ${i.returnedQuantity} returned` : ""}</div></div>
                  <div className="w-20 text-right font-medium">{money(i.unitPriceCents * i.quantity, o.currency)}</div>
                </li>
              ))}
            </ul>
            <div className="ml-auto max-w-xs space-y-1 px-4 py-3 text-xs">
              <div className="flex justify-between"><span className="text-muted">Subtotal</span><span>{money(o.subtotalCents, o.currency)}</span></div>
              {o.discountCents > 0 && <div className="flex justify-between"><span className="text-muted">Discount{o.discountCodes.length ? ` (${o.discountCodes.join(", ")})` : ""}</span><span>−{money(o.discountCents, o.currency)}</span></div>}
              <div className="flex justify-between"><span className="text-muted">Shipping{o.shippingMethod ? ` · ${o.shippingMethod}` : ""}</span><span>{money(o.shippingCents, o.currency)}</span></div>
              <div className="flex justify-between"><span className="text-muted">Tax</span><span>{money(o.taxCents, o.currency)}</span></div>
              <div className="flex justify-between border-t border-line pt-1 text-[13px] font-semibold"><span>Total</span><span>{money(o.totalCents, o.currency)}</span></div>
              {o.refundedCents > 0 && <div className="flex justify-between text-danger"><span>Refunded</span><span>−{money(o.refundedCents, o.currency)}</span></div>}
            </div>
          </Card>

          {(o.fulfillments ?? []).length > 0 && (
            <Card title="Fulfilments" padded={false}>
              <ul className="divide-y divide-line">
                {o.fulfillments!.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-xs">
                    <PackageCheck size={14} className="text-positive" />
                    <span className="font-medium">{f.provider}</span>
                    <StatusBadge status={f.status} />
                    {f.trackingNumber && (f.trackingUrl ? <a href={f.trackingUrl} target="_blank" rel="noreferrer" className="underline">{f.trackingNumber}</a> : <span>{f.trackingNumber}</span>)}
                    <span className="text-muted">{f.items.reduce((n, i) => n + i.quantity, 0)} item(s) · {fmtDateTime(f.shippedAt ?? f.createdAt)}</span>
                    <span className="flex-1" />
                    {f.status !== "delivered" && <Button size="xs" icon={<Check size={11} />} loading={delivered.isPending} onClick={() => delivered.mutate(f.id)}>Mark delivered</Button>}
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {(o.returns ?? []).length > 0 && (
            <Card title="Returns" padded={false}>
              <ul className="divide-y divide-line">
                {o.returns!.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-xs">
                    <Badge tone="neutral">{r.kind}</Badge><StatusBadge status={r.status} />
                    <span>{r.items.reduce((n, i) => n + i.quantity, 0)} item(s) · {money(r.refundCents, o.currency)}</span>
                    <span className="text-muted">{fmtDateTime(r.createdAt)}</span>
                    <span className="flex-1" />
                    {r.status !== "refunded" && <Button size="xs" loading={completeReturn.isPending} onClick={() => completeReturn.mutate(r.id)}>Received — complete</Button>}
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Card title="Timeline" padded={false}>
            <ol className="divide-y divide-line">{timeline.map((t, i) => <li key={i} className="flex gap-3 px-4 py-2 text-xs"><span className="w-32 shrink-0 text-muted">{fmtDateTime(t.at)}</span><span>{t.label}</span></li>)}</ol>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Customer">
            <div className="text-xs">{o.customerId ? <Link href={`/customers/${o.customerId}`} className="font-medium hover:underline">{o.email}</Link> : o.email}</div>
            <div className="mt-3 grid gap-3">
              <div><div className="eyebrow mb-1">Shipping</div><AddressBlock a={o.shippingAddress} /></div>
              <div><div className="eyebrow mb-1">Billing</div><AddressBlock a={o.billingAddress ?? o.shippingAddress} /></div>
            </div>
          </Card>
          <Card title="Tags & notes">
            <Field label="Tags"><Chips value={tags ?? o.tags} onChange={setTags} /></Field>
            <Field label="Notes" className="mt-2"><Textarea value={notes ?? o.notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[60px]" /></Field>
            <p className="mt-2 text-[11px] text-muted">Tags and notes are set by workflows and the assistant — ask it to “tag order #{o.number} as gift” to change them.</p>
            {(tags !== null || notes !== null) && <Button size="sm" className="mt-2" onClick={() => open(`Update order #${o.number}: set tags to [${(tags ?? o.tags).join(", ")}] and notes to "${notes ?? o.notes}"`)}>Apply via assistant</Button>}
          </Card>
          <Card title="Assistant shortcuts">
            <div className="flex flex-col gap-1.5">
              {[["Summarise this order", `Summarise order #${o.number} for me`], ["Draft a customer email", `Draft a short email to the customer of order #${o.number} about its status`], ["Refund a damaged item", `Refund order #${o.number} for one damaged item`], ["Check fraud signals", `Look at order #${o.number} and tell me if anything looks risky`]].map(([l, p]) => (
                <button key={l} onClick={() => open(p)} className="rounded border border-line bg-card px-2.5 py-1.5 text-left text-xs hover:border-ink"><Sparkles size={11} className="mr-1 inline text-accent" />{l}</button>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <Dialog open={dlg === "fulfil"} onClose={close} title="Fulfil order" description="Creates a shipment and emails tracking to the customer." footer={<><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="primary" loading={fulfil.isPending} onClick={() => fulfil.mutate()}>Create fulfilment</Button></>}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Carrier / provider"><Select value={ful.provider} onChange={(e) => setFul({ ...ful, provider: e.target.value })}>{["manual", "shippo", "shipstation", "ups", "usps", "fedex", "dhl", "royal-mail"].map((p) => <option key={p} value={p}>{p}</option>)}</Select></Field>
            <Field label="Tracking number"><Input value={ful.trackingNumber} onChange={(e) => setFul({ ...ful, trackingNumber: e.target.value })} placeholder="1Z999AA10123456784" /></Field>
          </div>
          <Field label="Tracking URL (optional)"><Input value={ful.trackingUrl} onChange={(e) => setFul({ ...ful, trackingUrl: e.target.value })} placeholder="auto-generated when empty" /></Field>
          <div>
            <div className="eyebrow mb-1">Items to ship</div>
            {remaining.map((i) => (
              <div key={i.variantId} className="flex items-center gap-2 py-1 text-xs">
                <Checkbox checked={(ful.items[i.variantId] ?? 0) > 0} onChange={(v) => setFul({ ...ful, items: { ...ful.items, [i.variantId]: v ? i.left : 0 } })} />
                <span className="flex-1">{i.title} · {i.variantTitle}</span>
                <Input type="number" min={0} max={i.left} value={ful.items[i.variantId] ?? 0} onChange={(e) => setFul({ ...ful, items: { ...ful.items, [i.variantId]: Math.min(i.left, Number(e.target.value)) } })} className="!h-7 !w-16" />
                <span className="text-muted">of {i.left}</span>
              </div>
            ))}
          </div>
        </div>
      </Dialog>
      <Dialog open={dlg === "cancel"} onClose={close} title={`Cancel order #${o.number}?`} width="max-w-sm" footer={<><Button variant="ghost" onClick={close}>Keep</Button><Button variant="danger" loading={cancel.isPending} onClick={() => cancel.mutate()}>Cancel order</Button></>}>
        <p className="text-xs text-muted">Stock goes back, {o.financialStatus === "paid" ? `${money(maxRefund, o.currency)} is refunded,` : ""} and the customer is emailed.</p>
        <Field label="Reason" className="mt-3"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Customer request" /></Field>
      </Dialog>
      <Dialog open={dlg === "refund"} onClose={close} title="Refund" width="max-w-sm" footer={<><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="primary" loading={refund.isPending} onClick={() => refund.mutate()}>Refund {refundAmt ? money(inputToCents(refundAmt), o.currency) : ""}</Button></>}>
        <div className="space-y-3">
          <Field label={`Amount (up to ${money(maxRefund, o.currency)})`}><Input value={refundAmt} onChange={(e) => setRefundAmt(e.target.value)} inputMode="decimal" /></Field>
          <Field label="Reason"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Damaged item" /></Field>
        </div>
      </Dialog>
      <Dialog open={dlg === "return"} onClose={close} title="Create return" description="A pre-approved return with a label. Complete it when the parcel arrives to restock and refund." footer={<><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="primary" loading={createReturn.isPending} disabled={!Object.values(ret.items).some((v) => v.qty > 0)} onClick={() => createReturn.mutate()}>Create return</Button></>}>
        <Field label="Kind"><Select value={ret.kind} onChange={(e) => setRet({ ...ret, kind: e.target.value as "refund" | "exchange" })}><option value="refund">Refund</option><option value="exchange">Exchange</option></Select></Field>
        <div className="mt-3 space-y-1.5">
          {o.items.map((i) => (
            <div key={i.variantId} className="grid grid-cols-[1fr_64px_1fr] items-center gap-2 text-xs">
              <span className="truncate">{i.title} · {i.variantTitle}</span>
              <Input type="number" min={0} max={i.quantity - i.returnedQuantity} value={ret.items[i.variantId]?.qty ?? 0} onChange={(e) => setRet({ ...ret, items: { ...ret.items, [i.variantId]: { qty: Number(e.target.value), reason: ret.items[i.variantId]?.reason ?? "" } } })} className="!h-7" />
              <Input value={ret.items[i.variantId]?.reason ?? ""} onChange={(e) => setRet({ ...ret, items: { ...ret.items, [i.variantId]: { qty: ret.items[i.variantId]?.qty ?? 0, reason: e.target.value } } })} placeholder="Reason" className="!h-7" />
            </div>
          ))}
        </div>
      </Dialog>
    </Page>
  );
}
