"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Download, ExternalLink, Lock, Plus, Trash2, Wrench, Play } from "lucide-react";
import { API_BASE, tokens } from "@/lib/api";
import { useStoreQuery, useStore } from "@/lib/store-context";
import { useStoreMutation } from "@/lib/hooks";
import { useAi } from "@/lib/ai-context";
import { cn, fmtDateTime, money } from "@/lib/utils";
import type { CatalogPlugin, InstalledPlugin, SettingsField, Workflow } from "@/lib/types";
import { Page } from "@/components/shell/shell";
import { Badge, Button, Card, Checkbox, ConfirmDialog, Dialog, EmptyState, ErrorBox, Field, Input, Loading, Select, StatusBadge, Table, Tabs, Td, Textarea, Th, Toggle, Tr } from "@/components/ui";

function SettingsForm({ schema, values, onSave, saving }: { schema: Record<string, SettingsField>; values: Record<string, unknown>; onSave: (v: Record<string, unknown>) => void; saving: boolean }) {
  const [v, setV] = useState<Record<string, unknown>>({});
  useEffect(() => setV(Object.fromEntries(Object.entries(schema).map(([k, f]) => [k, values[k] ?? f.default ?? (f.type === "boolean" ? false : "")]))), [schema, values]);
  const entries = Object.entries(schema);
  if (entries.length === 0) return <p className="text-xs text-muted">This plugin has no settings.</p>;
  return (
    <div className="space-y-3">
      {entries.map(([k, f]) => (
        <Field key={k} label={f.label} hint={f.description} required={f.required}>
          {f.type === "boolean" ? <Toggle checked={!!v[k]} onChange={(c) => setV({ ...v, [k]: c })} /> : f.type === "select" ? <Select value={String(v[k] ?? "")} onChange={(e) => setV({ ...v, [k]: e.target.value })}><option value="">—</option>{(f.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select> : f.type === "textarea" ? <Textarea value={String(v[k] ?? "")} onChange={(e) => setV({ ...v, [k]: e.target.value })} placeholder={f.placeholder} /> : f.type === "number" ? <Input type="number" value={String(v[k] ?? "")} onChange={(e) => setV({ ...v, [k]: e.target.value === "" ? "" : Number(e.target.value) })} placeholder={f.placeholder} /> : <Input type={f.type === "secret" ? "password" : "text"} value={String(v[k] ?? "")} onChange={(e) => setV({ ...v, [k]: e.target.value })} placeholder={f.type === "secret" && values[k] ? "•••••••• (stored encrypted — enter to replace)" : f.placeholder} pattern={f.pattern} autoComplete="off" />}
        </Field>
      ))}
      <Button variant="primary" loading={saving} onClick={() => onSave(Object.fromEntries(Object.entries(v).filter(([k, val]) => !(schema[k]?.type === "secret" && (val === "" || val === "••••••••")))))}>Save settings</Button>
    </div>
  );
}

function ContactInbox() {
  const q = useStoreQuery<{ items: { id: string; name: string; email: string; message: string; read: boolean; createdAt: string }[] }>(["plugin-contact"], "/plugins/contact-form/submissions");
  if (q.isLoading) return <Loading />;
  if (!q.data?.items.length) return <EmptyState title="Inbox is empty" body="Submissions from the storefront contact form land here." />;
  return <ul className="divide-y divide-line">{q.data.items.map((s) => <li key={s.id} className="px-4 py-3 text-xs"><div className="flex items-center gap-2"><span className="font-medium">{s.name}</span><a href={`mailto:${s.email}`} className="text-muted hover:text-ink">{s.email}</a><span className="ml-auto text-[10px] text-faint">{fmtDateTime(s.createdAt)}</span></div><p className="mt-1 whitespace-pre-wrap">{s.message}</p></li>)}</ul>;
}

function ExitIntent() {
  const { storeId } = useStore();
  const q = useStoreQuery<{ items: { id: string; email: string | null; offer: string; converted: boolean; createdAt: string }[]; stats: { shown: number; captured: number; converted: number } }>(["plugin-exit"], "/plugins/exit-intent/responses");
  const download = async () => {
    const res = await fetch(`${API_BASE}/stores/${storeId}/plugins/exit-intent/responses.csv`, { headers: { Authorization: `Bearer ${tokens.access()}` } });
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "exit-intent.csv";
    a.click();
  };
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2 text-xs"><span>Shown <strong>{q.data?.stats.shown ?? 0}</strong></span><span>Captured <strong>{q.data?.stats.captured ?? 0}</strong></span><span>Converted <strong>{q.data?.stats.converted ?? 0}</strong></span><span className="flex-1" /><Button size="xs" icon={<Download size={11} />} onClick={download}>Export CSV</Button></div>
      {q.isLoading && <Loading />}
      {q.data && q.data.items.length === 0 && <EmptyState title="No responses yet" />}
      {q.data && q.data.items.length > 0 && <Table><thead><tr><Th>Email</Th><Th>Offer</Th><Th>Converted</Th><Th>When</Th></tr></thead><tbody>{q.data.items.map((r) => <Tr key={r.id}><Td>{r.email ?? <span className="text-muted">dismissed</span>}</Td><Td className="text-muted">{r.offer}</Td><Td>{r.converted ? <Badge tone="green">yes</Badge> : <span className="text-muted">no</span>}</Td><Td className="text-muted">{fmtDateTime(r.createdAt)}</Td></Tr>)}</tbody></Table>}
    </div>
  );
}

function Engraving() {
  const { store } = useStore();
  const q = useStoreQuery<{ items: { id: string; name: string; maxChars: number; feeCents: number; fonts: string[] }[] }>(["plugin-engraving"], "/plugins/engraving/templates");
  const [f, setF] = useState({ name: "", maxChars: "20", fee: "", fonts: "serif, script" });
  const create = useStoreMutation((sapi) => sapi("/plugins/engraving/templates", { method: "POST", body: { name: f.name, maxChars: Number(f.maxChars) || 20, feeCents: Math.round(parseFloat(f.fee || "0") * 100), fonts: f.fonts.split(",").map((s) => s.trim()).filter(Boolean) } }), { success: "Template created", invalidate: "plugin-engraving", onSuccess: () => setF({ name: "", maxChars: "20", fee: "", fonts: "serif, script" }) });
  return (
    <div className="p-4">
      <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_100px_100px_1fr_auto]">
        <Field label="Name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Initials on the cuff" /></Field>
        <Field label="Max chars"><Input type="number" value={f.maxChars} onChange={(e) => setF({ ...f, maxChars: e.target.value })} /></Field>
        <Field label={`Fee (${store?.defaultCurrency ?? "USD"})`}><Input value={f.fee} onChange={(e) => setF({ ...f, fee: e.target.value })} inputMode="decimal" /></Field>
        <Field label="Fonts"><Input value={f.fonts} onChange={(e) => setF({ ...f, fonts: e.target.value })} /></Field>
        <div className="flex items-end"><Button variant="primary" icon={<Plus size={12} />} loading={create.isPending} disabled={!f.name.trim()} onClick={() => create.mutate()}>Add</Button></div>
      </div>
      <p className="mb-3 text-[11px] text-muted">Fees are converted per region at checkout using the store's FX table. Assign templates to products from the product editor's metadata (<code className="font-mono">engravingTemplate</code>).</p>
      {q.isLoading && <Loading />}
      {q.data && q.data.items.length === 0 && <EmptyState title="No engraving templates" />}
      {q.data && q.data.items.length > 0 && <Table><thead><tr><Th>Template</Th><Th right>Max chars</Th><Th right>Fee</Th><Th>Fonts</Th></tr></thead><tbody>{q.data.items.map((t) => <Tr key={t.id}><Td className="font-medium">{t.name}</Td><Td right>{t.maxChars}</Td><Td right>{money(t.feeCents, store?.defaultCurrency)}</Td><Td className="text-muted">{t.fonts.join(", ")}</Td></Tr>)}</tbody></Table>}
    </div>
  );
}

const TRIGGERS = ["order.created", "order.paid", "order.fulfilled", "customer.created", "review.created", "cart.abandoned"];
const ACTIONS = [["tag_order", "Tag the order"], ["send_email", "Send an email"], ["webhook", "Call a webhook"], ["notify", "Notify the team"], ["append_sheet", "Append to Google Sheet"]] as const;
interface WfForm { name: string; trigger: string; conditions: { field: string; op: string; value: string }[]; actions: { type: string; params: Record<string, string> }[]; enabled: boolean }
const blankWf: WfForm = { name: "", trigger: "order.paid", conditions: [], actions: [{ type: "tag_order", params: { tag: "" } }], enabled: true };

function Workflows() {
  const q = useStoreQuery<{ items: Workflow[] }>(["workflows"], "/workflows");
  const [editing, setEditing] = useState<{ id?: string; form: WfForm } | null>(null);
  const [del, setDel] = useState<Workflow | null>(null);
  const save = useStoreMutation((sapi, v: { id?: string; form: WfForm }) => (v.id ? sapi(`/workflows/${v.id}`, { method: "PATCH", body: v.form }) : sapi("/workflows", { method: "POST", body: v.form })), { success: "Workflow saved", invalidate: "workflows", onSuccess: () => setEditing(null) });
  const toggle = useStoreMutation((sapi, v: { id: string; enabled: boolean }) => sapi(`/workflows/${v.id}`, { method: "PATCH", body: { enabled: v.enabled } }), { invalidate: "workflows" });
  const remove = useStoreMutation((sapi, id: string) => sapi(`/workflows/${id}`, { method: "DELETE" }), { success: "Workflow deleted", invalidate: "workflows", onSuccess: () => setDel(null) });
  const f = editing?.form;
  const setF = (patch: Partial<WfForm>) => editing && setEditing({ ...editing, form: { ...editing.form, ...patch } });
  const paramFields: Record<string, { key: string; label: string; placeholder: string }[]> = { tag_order: [{ key: "tag", label: "Tag", placeholder: "vip" }], send_email: [{ key: "templateKey", label: "Template key", placeholder: "welcome" }, { key: "to", label: "To (blank = order email)", placeholder: "" }], webhook: [{ key: "url", label: "URL", placeholder: "https://hooks.example.com/…" }], notify: [{ key: "message", label: "Message", placeholder: "Big order just came in" }], append_sheet: [{ key: "sheetId", label: "Sheet id", placeholder: "1AbC…" }, { key: "serviceAccountJson", label: "Service-account JSON (encrypted)", placeholder: "{…}" }] };
  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between"><p className="text-xs text-muted">When <em>trigger</em> → If <em>conditions</em> → Then <em>actions</em>. Runs are logged with every action's result.</p><Button size="sm" variant="primary" icon={<Plus size={12} />} onClick={() => setEditing({ form: blankWf })}>New workflow</Button></div>
      {q.isLoading && <Loading />}
      {q.data && q.data.items.length === 0 && <EmptyState title="No workflows yet" body="Tag big orders, email VIPs, post to a webhook, append rows to a sheet." />}
      <div className="space-y-2">
        {(q.data?.items ?? []).map((w) => (
          <div key={w.id} className="card p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Toggle checked={w.enabled} onChange={(v) => toggle.mutate({ id: w.id, enabled: v })} />
              <span className="text-[13px] font-semibold">{w.name}</span>
              <Badge>when {w.trigger}</Badge>
              {w.conditions.map((c, i) => <Badge key={i} tone="amber">if {c.field} {c.op} {String(c.value)}</Badge>)}
              {w.actions.map((a, i) => <Badge key={i} tone="teal">then {a.type.replace(/_/g, " ")}</Badge>)}
              <span className="flex-1" />
              <Button size="xs" onClick={() => setEditing({ id: w.id, form: { name: w.name, trigger: w.trigger, conditions: w.conditions.map((c) => ({ field: c.field, op: c.op, value: String(c.value ?? "") })), actions: w.actions.map((a) => ({ type: a.type, params: Object.fromEntries(Object.entries(a.params).map(([k, v]) => [k, String(v ?? "")])) })), enabled: w.enabled } })}>Edit</Button>
              <button onClick={() => setDel(w)} className="text-muted hover:text-danger"><Trash2 size={13} /></button>
            </div>
            {w.runs.length > 0 && <details className="mt-2 text-[11px]"><summary className="cursor-pointer text-muted"><Play size={10} className="mr-1 inline" />{w.runs.length} recent run(s)</summary><ul className="mt-1 space-y-0.5">{w.runs.map((r) => <li key={r.id} className="flex gap-2"><StatusBadge status={r.status} /><span className="text-faint">{fmtDateTime(r.createdAt)}</span><span className="text-muted">{r.log.join(" · ")}</span></li>)}</ul></details>}
          </div>
        ))}
      </div>
      <Dialog open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? "Edit workflow" : "New workflow"} width="max-w-2xl" footer={<><Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button><Button variant="primary" loading={save.isPending} disabled={!f?.name.trim() || !f?.actions.length} onClick={() => editing && save.mutate({ id: editing.id, form: { ...editing.form, conditions: editing.form.conditions.filter((c) => c.field) } })}>Save</Button></>}>
        {f && (
          <div className="space-y-4">
            <Field label="Name" required><Input value={f.name} onChange={(e) => setF({ name: e.target.value })} placeholder="Tag orders over $500" autoFocus /></Field>
            <div className="rounded border border-line p-3"><div className="eyebrow mb-1">When</div><Select value={f.trigger} onChange={(e) => setF({ trigger: e.target.value })}>{TRIGGERS.map((t) => <option key={t} value={t}>{t}</option>)}</Select></div>
            <div className="rounded border border-line p-3">
              <div className="mb-1 flex items-center justify-between"><span className="eyebrow">If</span><Button size="xs" onClick={() => setF({ conditions: [...f.conditions, { field: "order.totalCents", op: "gt", value: "" }] })}>Add condition</Button></div>
              {f.conditions.length === 0 && <p className="text-[11px] text-muted">No conditions — runs every time.</p>}
              <div className="space-y-1.5">{f.conditions.map((c, i) => <div key={i} className="grid grid-cols-[1fr_100px_1fr_auto] gap-1.5"><Input value={c.field} onChange={(e) => setF({ conditions: f.conditions.map((x, j) => (j === i ? { ...x, field: e.target.value } : x)) })} placeholder="order.totalCents" className="!h-7 font-mono !text-[11px]" /><Select value={c.op} onChange={(e) => setF({ conditions: f.conditions.map((x, j) => (j === i ? { ...x, op: e.target.value } : x)) })} className="!h-7 !text-[11px]">{["eq", "ne", "gt", "lt", "contains"].map((o) => <option key={o} value={o}>{o}</option>)}</Select><Input value={c.value} onChange={(e) => setF({ conditions: f.conditions.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })} placeholder="50000" className="!h-7" /><button onClick={() => setF({ conditions: f.conditions.filter((_, j) => j !== i) })} className="text-muted hover:text-danger"><Trash2 size={13} /></button></div>)}</div>
            </div>
            <div className="rounded border border-line p-3">
              <div className="mb-1 flex items-center justify-between"><span className="eyebrow">Then</span><Button size="xs" onClick={() => setF({ actions: [...f.actions, { type: "notify", params: {} }] })}>Add action</Button></div>
              <div className="space-y-2">{f.actions.map((a, i) => <div key={i} className="rounded border border-line bg-cream p-2"><div className="flex gap-1.5"><Select value={a.type} onChange={(e) => setF({ actions: f.actions.map((x, j) => (j === i ? { type: e.target.value, params: {} } : x)) })} className="!h-7 !text-[11px]">{ACTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select><button onClick={() => setF({ actions: f.actions.filter((_, j) => j !== i) })} className="text-muted hover:text-danger"><Trash2 size={13} /></button></div><div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">{(paramFields[a.type] ?? []).map((p) => <Field key={p.key} label={p.label}><Input value={a.params[p.key] ?? ""} onChange={(e) => setF({ actions: f.actions.map((x, j) => (j === i ? { ...x, params: { ...x.params, [p.key]: e.target.value } } : x)) })} placeholder={p.placeholder} className="!h-7" type={p.key === "serviceAccountJson" ? "password" : "text"} /></Field>)}</div></div>)}</div>
            </div>
            <Checkbox checked={f.enabled} onChange={(v) => setF({ enabled: v })} label="Enabled" />
          </div>
        )}
      </Dialog>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={() => del && remove.mutate(del.id)} loading={remove.isPending} title={`Delete “${del?.name}”?`} confirmLabel="Delete" danger />
    </div>
  );
}

export default function PluginPage() {
  const { id } = useParams<{ id: string }>();
  const { open } = useAi();
  const res = useStoreQuery<{ items: CatalogPlugin[]; installed: InstalledPlugin[] }>(["plugins"], "/plugins");
  const p = res.data?.items.find((x) => x.id === id);
  const inst = res.data?.installed.find((x) => x.pluginId === id);
  const [tab, setTab] = useState("settings");
  const [uninstall, setUninstall] = useState(false);
  const install = useStoreMutation((sapi) => sapi(`/plugins/${id}/install`, { method: "POST", body: {} }), { success: "Installed", invalidate: "plugins" });
  const remove = useStoreMutation((sapi) => sapi(`/plugins/${id}`, { method: "DELETE" }), { success: "Uninstalled", invalidate: "plugins", onSuccess: () => setUninstall(false) });
  const saveSettings = useStoreMutation((sapi, v: Record<string, unknown>) => sapi(`/plugins/${id}/settings`, { method: "PATCH", body: v }), { success: "Settings saved", invalidate: "plugins" });
  const enable = useStoreMutation((sapi, enabled: boolean) => sapi(`/plugins/${id}/enabled`, { method: "PATCH", body: { enabled } }), { success: (_, e) => (e ? "Enabled" : "Disabled"), invalidate: "plugins" });

  if (res.isError) return <Page><ErrorBox error={res.error} retry={() => res.refetch()} /></Page>;
  if (!res.data) return <Page><Loading /></Page>;
  if (!p) return <Page><EmptyState title="Plugin not found" action={<Link href="/plugins"><Button>Back to plugins</Button></Link>} /></Page>;
  const adminTabs = p.adminRoutes.map((r) => ({ value: r.path.replace(/^\//, ""), label: r.label }));
  const subPage = { "contact-form": <ContactInbox />, "exit-intent": <ExitIntent />, engraving: <Engraving />, workflows: <Workflows /> }[p.id];
  const tabs = [{ value: "settings", label: "Settings" }, ...(subPage ? [{ value: "admin", label: adminTabs[0]?.label ?? "Admin" }] : []), { value: "tools", label: "AI tools", count: p.aiTools.length }, { value: "components", label: "Storefront", count: p.storefront.components.length }];

  return (
    <Page>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link href="/plugins" className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink"><ArrowLeft size={13} /> Plugins</Link>
        <span className="flex h-9 w-9 items-center justify-center rounded border border-line bg-card text-lg">{p.icon}</span>
        <div className="min-w-0 flex-1"><h1 className="font-display truncate text-[22px] leading-tight">{p.name}</h1><div className="text-[11px] text-muted">{p.category} · v{p.version} · {p.source}{p.website && <> · <a href={p.website} target="_blank" rel="noreferrer" className="hover:text-ink">website <ExternalLink size={9} className="inline" /></a></>}</div></div>
        {inst && <Toggle checked={inst.enabled} onChange={(v) => enable.mutate(v)} label={inst.enabled ? "Enabled" : "Disabled"} />}
        {inst ? <Button variant="danger" onClick={() => setUninstall(true)}>Uninstall</Button> : !p.installable ? <Button onClick={() => open(`Request a native ${p.name} integration`)}>Request integration</Button> : !p.available ? <Link href="/settings/billing"><Button icon={<Lock size={12} />}>Upgrade to install</Button></Link> : <Button variant="primary" loading={install.isPending} onClick={() => install.mutate()}>Install</Button>}
      </div>
      <p className="mb-4 max-w-2xl text-[13px] text-muted">{p.longDescription || p.description}</p>
      <Tabs value={tab} onChange={setTab} items={tabs} className="mb-4" />
      {tab === "settings" && (
        <Card>
          {!inst ? <p className="text-xs text-muted">{p.installable ? "Install the plugin to configure it." : "Directory listing — no native settings yet."}</p> : <SettingsForm schema={p.settingsSchema} values={inst.settings} saving={saveSettings.isPending} onSave={(v) => saveSettings.mutate(v)} />}
          {inst && Object.values(p.settingsSchema).some((f) => f.type === "secret") && <p className="mt-3 text-[11px] text-muted">Secrets are encrypted at rest and never returned to the browser.</p>}
        </Card>
      )}
      {tab === "admin" && <Card padded={false}>{inst ? subPage : <p className="p-4 text-xs text-muted">Install the plugin to use this page.</p>}</Card>}
      {tab === "tools" && (
        <Card padded={false}>
          {p.aiTools.length === 0 ? <p className="p-4 text-xs text-muted">No AI tools.</p> : <ul className="divide-y divide-line">{p.aiTools.map((t) => <li key={t.name} className="px-4 py-2.5 text-xs"><div className="flex items-center gap-2"><Wrench size={11} className="text-muted" /><span className="font-mono font-medium">{t.name}</span>{!inst && <Badge tone="neutral">available after install</Badge>}</div><div className="mt-0.5 text-muted">{t.description}</div>{t.example && <button onClick={() => open(t.example!)} className="mt-1 text-[11px] text-accent hover:underline">Try: “{t.example}”</button>}</li>)}</ul>}
        </Card>
      )}
      {tab === "components" && (
        <Card padded={false}>
          {p.storefront.components.length === 0 ? <p className="p-4 text-xs text-muted">No storefront components.</p> : <Table><thead><tr><Th>Component</Th><Th>Placement</Th><Th>Slot</Th></tr></thead><tbody>{p.storefront.components.map((c) => <Tr key={c.id}><Td className="font-mono text-xs">{c.id}</Td><Td><Badge tone={c.placement === "merchant_choice" ? "teal" : "neutral"}>{c.placement.replace(/_/g, " ")}</Badge></Td><Td className="text-xs text-muted">{c.slot ?? c.defaultSlot}{c.validSlots?.length ? <span className={cn("ml-1 text-[10px]")}>(or {c.validSlots.filter((s) => s !== c.defaultSlot).join(", ")})</span> : null}</Td></Tr>)}</tbody></Table>}
        </Card>
      )}
      <ConfirmDialog open={uninstall} onClose={() => setUninstall(false)} onConfirm={() => remove.mutate()} loading={remove.isPending} title={`Uninstall ${p.name}?`} body="Settings and credentials are deleted. Storefront components disappear immediately." confirmLabel="Uninstall" danger />
    </Page>
  );
}
