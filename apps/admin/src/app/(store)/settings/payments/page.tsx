"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { CreditCard, ExternalLink } from "lucide-react";
import { useStore, useStoreQuery } from "@/lib/store-context";
import { useStoreMutation } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { Badge, Button, Card, Loading, Note, SegmentedControl, useToast } from "@/components/ui";

interface Payments { provider: "stripe" | "test"; accountId: string | null; chargesEnabled: boolean; payoutsEnabled: boolean; requirements: string[]; captureMode: string; methods: string[]; payoutTimeline: { day: number; label: string }[] }
const METHOD_LABEL: Record<string, string> = { card: "Credit / debit card", apple_pay: "Apple Pay", google_pay: "Google Pay", link: "Link", paypal: "PayPal" };

function PaymentsInner() {
  const { refreshStore } = useStore();
  const q = useStoreQuery<Payments>(["payments"], "/payments");
  const toast = useToast();
  const params = useSearchParams();
  useEffect(() => { if (params.get("connected")) { toast("Stripe connected"); refreshStore(); } // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const connect = useStoreMutation((sapi) => sapi<{ url: string; simulated: boolean }>("/payments/stripe/connect", { method: "POST" }), { invalidate: false, onSuccess: (r) => { window.location.href = r.url; } });
  const patch = useStoreMutation((sapi, v: { captureMode: "automatic" | "manual" }) => sapi("/payments", { method: "PATCH", body: v }), { success: "Capture mode updated", invalidate: "payments" });
  const [capture, setCapture] = useState<"automatic" | "manual">("automatic");
  useEffect(() => { if (q.data) setCapture(q.data.captureMode as "automatic" | "manual"); }, [q.data]);
  const d = q.data;
  if (!d) return <Loading />;
  const connected = !!d.accountId;
  return (
    <div className="space-y-4">
      <Card title="Stripe Connect" eyebrow="Payments & payouts" action={<Badge tone={d.provider === "stripe" ? "green" : "amber"}>{d.provider === "stripe" ? "live keys" : "test mode"}</Badge>}>
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded bg-[#635bff] text-white"><CreditCard size={18} /></span>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold">{connected ? `Connected · ${d.accountId}` : "Not connected"}</div>
            <div className="mt-1 flex flex-wrap gap-1.5"><Badge tone={d.chargesEnabled ? "green" : "neutral"} dot>charges {d.chargesEnabled ? "enabled" : "pending"}</Badge><Badge tone={d.payoutsEnabled ? "green" : "neutral"} dot>payouts {d.payoutsEnabled ? "enabled" : "pending"}</Badge>{d.requirements.length > 0 && <Badge tone="amber">{d.requirements.length} requirement(s) due</Badge>}</div>
          </div>
          <Button variant={connected ? "secondary" : "primary"} icon={<ExternalLink size={12} />} loading={connect.isPending} onClick={() => connect.mutate()}>{connected ? "Manage in Stripe" : "Connect Stripe"}</Button>
        </div>
        {d.requirements.length > 0 && <Note tone="warn">Stripe still needs: {d.requirements.join(", ")}. Finish KYC in the Stripe dashboard to enable payouts.</Note>}
        {d.provider === "test" && <div className="mt-3"><Note>No Stripe keys on the server — checkout runs in test mode and “Connect” simulates a completed onboarding. Add STRIPE_SECRET_KEY and STRIPE_CONNECT_CLIENT_ID to go live.</Note></div>}
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Payout timeline" eyebrow="Typical card payment">
          <ol className="relative ml-2 border-l border-line pl-4">{d.payoutTimeline.map((t) => <li key={t.day} className="mb-3 text-xs"><span className="absolute -left-[5px] mt-1 h-2 w-2 rounded-full bg-ink" /><div className="eyebrow">Day {t.day}</div><div>{t.label}</div></li>)}</ol>
        </Card>
        <Card title="Capture mode" eyebrow="When money moves">
          <SegmentedControl value={capture} onChange={setCapture} items={[{ value: "automatic", label: "Automatic" }, { value: "manual", label: "Manual (authorise first)" }]} />
          <p className="mt-2 text-[11px] text-muted">{capture === "automatic" ? "Charge at checkout. Best for stock you already have." : "Authorise at checkout and capture when you fulfil — up to 7 days. Best for made-to-order."}</p>
          {capture !== d.captureMode && <Button size="sm" variant="primary" className="mt-2" loading={patch.isPending} onClick={() => patch.mutate({ captureMode: capture })}>Save</Button>}
        </Card>
      </div>
      <Card title="Payment methods" eyebrow="Shown at checkout">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">{d.methods.map((m) => <div key={m} className={cn("rounded border border-line px-2.5 py-2 text-center text-xs", !connected && "opacity-60")}><div className="font-medium">{METHOD_LABEL[m] ?? m}</div><div className="text-[10px] text-muted">{m === "apple_pay" ? "needs a verified domain" : connected ? "on" : "after connect"}</div></div>)}</div>
        <p className="mt-2 text-[11px] text-muted">Regional providers (Airwallex, Adyen, Mollie, Paystack, Razorpay, iyzico, VNPay, MoMo, Payoo) appear here once their plugin is installed.</p>
      </Card>
    </div>
  );
}

export default function PaymentsPage() {
  return <Suspense fallback={<Loading />}><PaymentsInner /></Suspense>;
}
