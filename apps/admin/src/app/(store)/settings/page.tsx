"use client";

import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { useStore } from "@/lib/store-context";
import { useStoreMutation } from "@/lib/hooks";
import { useAi } from "@/lib/ai-context";
import { Button, Card, Checkbox, Field, Input, Loading, Select, Textarea } from "@/components/ui";

const GRANTS = [
  { key: "refund_order", label: "Refund orders", desc: "Issue refunds without asking first." },
  { key: "cancel_order", label: "Cancel orders", desc: "Cancel and restock without confirmation." },
  { key: "delete_product", label: "Delete products", desc: "Permanently remove products and variants." },
  { key: "publish_storefront", label: "Publish the storefront", desc: "Push the draft live on its own." },
];

export default function GeneralSettingsPage() {
  const { store, refreshStore } = useStore();
  const { models } = useAi();
  const [f, setF] = useState({ name: "", aiModel: "", slogan: "", description: "", tone: "", announcement: "", senderEmail: "" });
  const [grants, setGrants] = useState<string[]>([]);
  useEffect(() => { if (store) { setF({ name: store.name, aiModel: store.aiModel, slogan: store.brand.slogan, description: store.brand.description, tone: store.brand.tone, announcement: store.brand.announcement ?? "", senderEmail: String(store.settings.senderEmail ?? "") }); setGrants((store.settings.autonomyGrants as string[] | undefined) ?? []); } }, [store]);
  const save = useStoreMutation((sapi) => sapi("", { method: "PATCH", body: { name: f.name, aiModel: f.aiModel || undefined, brand: { slogan: f.slogan, description: f.description, tone: f.tone, announcement: f.announcement || undefined }, settings: { senderEmail: f.senderEmail || undefined } } }), { success: "Settings saved", onSuccess: refreshStore });
  const saveGrants = useStoreMutation((sapi) => sapi("/autonomy", { method: "POST", body: { grants } }), { success: "Autonomy updated", onSuccess: refreshStore });
  if (!store) return <Loading />;
  return (
    <div className="space-y-4">
      <Card title="Store" eyebrow="General">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Store name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Storefront URL"><Input value={store.url} disabled /></Field>
          <Field label="Default currency" hint={store.settings.currencyLocked ? "Locked — the store has more than one region." : "Set per region under Regions & shipping."}><Input value={store.defaultCurrency} disabled /></Field>
          <Field label="Sender email" hint="From address for transactional email."><Input value={f.senderEmail} onChange={(e) => setF({ ...f, senderEmail: e.target.value })} placeholder="hello@yourbrand.com" /></Field>
        </div>
      </Card>
      <Card title="Brand voice" eyebrow="Used by every generated word">
        <div className="grid gap-3">
          <Field label="Slogan"><Input value={f.slogan} onChange={(e) => setF({ ...f, slogan: e.target.value })} /></Field>
          <Field label="Description"><Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} className="min-h-[70px]" /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Tone"><Input value={f.tone} onChange={(e) => setF({ ...f, tone: e.target.value })} placeholder="warm, confident, specific" /></Field>
            <Field label="Announcement bar"><Input value={f.announcement} onChange={(e) => setF({ ...f, announcement: e.target.value })} /></Field>
          </div>
        </div>
      </Card>
      <Card title="AI model" eyebrow="Default for the assistant">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Model" hint="Frontier for design and CRO, balanced for chat, fast for classification. The router picks per task when unset."><Select value={f.aiModel} onChange={(e) => setF({ ...f, aiModel: e.target.value })}><option value="">Automatic routing</option>{models.map((m) => <option key={m.id} value={m.id} disabled={!m.available}>{m.label} · {m.tier}{m.available ? "" : " (no key)"}</option>)}</Select></Field>
          <Field label="Credits"><Input value={`${store.credits.balance.toLocaleString()} left · ${store.credits.usedThisPeriod.toLocaleString()} used this period`} disabled /></Field>
        </div>
      </Card>
      <div className="flex justify-end"><Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>Save settings</Button></div>
      <Card title="Autonomy grants" eyebrow="Risky tools the assistant may run without asking" action={<Button size="sm" variant="primary" loading={saveGrants.isPending} onClick={() => saveGrants.mutate()}>Save grants</Button>}>
        <div className="mb-3 flex items-start gap-2 rounded border border-amber/40 bg-amber-soft px-3 py-2 text-xs"><ShieldAlert size={14} className="mt-0.5 shrink-0 text-amber" /><span>Everything else always pauses for a confirmation in the chat. Grants apply to every run in this store, including scheduled CRO loops.</span></div>
        <div className="grid gap-2 sm:grid-cols-2">
          {GRANTS.map((g) => <label key={g.key} className="flex cursor-pointer items-start gap-2 rounded border border-line p-2.5 hover:border-ink"><Checkbox checked={grants.includes(g.key)} onChange={(v) => setGrants(v ? [...grants, g.key] : grants.filter((x) => x !== g.key))} /><span><span className="block text-xs font-medium">{g.label}</span><span className="block text-[11px] text-muted">{g.desc}</span></span></label>)}
        </div>
      </Card>
    </div>
  );
}
