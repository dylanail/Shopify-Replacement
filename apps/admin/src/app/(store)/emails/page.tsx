"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Check, Mail, Send, Sparkles, Trash2, WandSparkles } from "lucide-react";
import { useStore, useStoreQuery } from "@/lib/store-context";
import { useStoreMutation, useStoreApi } from "@/lib/hooks";
import { useAi } from "@/lib/ai-context";
import { cn, fmtDateTime, fmtNumber, money, titleCase } from "@/lib/utils";
import type { Campaign, EmailSend, EmailTemplate, Flow } from "@/lib/types";
import { Page } from "@/components/shell/shell";
import { Badge, Button, Card, ConfirmDialog, Dialog, EmptyState, Field, Input, Loading, PageHeader, StatTiles, StatusBadge, Table, Tabs, Td, Textarea, Th, Toggle, Tr, useDebounce } from "@/components/ui";

type Tab = "templates" | "flows" | "campaigns" | "log";
const delayLabel = (m: number) => (m === 0 ? "immediately" : m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`);

function TemplateEditor({ t, onBack }: { t: EmailTemplate; onBack: () => void }) {
  const { open } = useAi();
  const { me } = useStore();
  const sapi = useStoreApi();
  const [subject, setSubject] = useState(t.subject);
  const [html, setHtml] = useState(t.html);
  const [delay, setDelay] = useState(String(t.delayMinutes));
  const [testTo, setTestTo] = useState(me.user.email);
  const dSubject = useDebounce(subject, 500), dHtml = useDebounce(html, 500);
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  useEffect(() => { let alive = true; sapi<{ subject: string; html: string }>(`/emails/templates/${t.key}/preview`, { method: "POST", body: { subject: dSubject, html: dHtml } }).then((r) => alive && setPreview(r)).catch(() => undefined); return () => { alive = false; }; }, [dSubject, dHtml, t.key, sapi]);
  const save = useStoreMutation((s) => s(`/emails/templates/${t.key}`, { method: "PATCH", body: { subject, html, delayMinutes: Number(delay) || 0 } }), { success: "Template saved", invalidate: "emails" });
  const test = useStoreMutation((s) => s(`/emails/templates/${t.key}/test`, { method: "POST", body: { to: testTo } }), { success: `Test sent to ${testTo}`, invalidate: "emails" });
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <button onClick={onBack} className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink"><ArrowLeft size={13} /> Templates</button>
        <h2 className="font-display text-lg">{t.name}</h2><Badge>{t.trigger}</Badge>{t.customized && <Badge tone="accent">customised</Badge>}
        <span className="flex-1" />
        <Button size="sm" icon={<Sparkles size={12} className="text-accent" />} onClick={() => open(`Rewrite the "${t.name}" email template in a warmer tone and update it`)}>Rewrite with AI</Button>
        <Button size="sm" variant="primary" loading={save.isPending} onClick={() => save.mutate()} icon={<Check size={12} />}>Save</Button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <Field label="Subject" hint="Handlebars: {{customer.firstName}}, {{order.number}}, {{brand.name}}"><Input value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
          <Field label="Delay (minutes after trigger)"><Input type="number" value={delay} onChange={(e) => setDelay(e.target.value)} className="!w-32" /></Field>
          <Field label="HTML"><Textarea value={html} onChange={(e) => setHtml(e.target.value)} className="min-h-[420px] font-mono !text-[11px]" /></Field>
          <div className="flex items-end gap-2"><Field label="Send a test to" className="flex-1"><Input value={testTo} onChange={(e) => setTestTo(e.target.value)} /></Field><Button icon={<Send size={12} />} loading={test.isPending} onClick={() => test.mutate()}>Send test</Button></div>
        </div>
        <div className="card overflow-hidden">
          <div className="border-b border-line bg-sand px-3 py-2 text-xs"><span className="text-muted">Subject:</span> <span className="font-medium">{preview?.subject ?? subject}</span></div>
          <iframe title="Preview" srcDoc={preview?.html ?? html} className="h-[560px] w-full bg-white" sandbox="" />
        </div>
      </div>
    </div>
  );
}

function CampaignsTab() {
  const { store } = useStore();
  const q = useStoreQuery<{ items: Campaign[] }>(["emails", "campaigns"], "/emails/campaigns");
  const [brief, setBrief] = useState("");
  const [active, setActive] = useState<Campaign | null>(null);
  const [del, setDel] = useState<Campaign | null>(null);
  const draft = useStoreMutation((sapi) => sapi<Campaign>("/emails/campaigns/draft", { method: "POST", body: { brief } }), { success: "Draft ready — pick a subject", invalidate: "emails", onSuccess: (c) => { setActive(c); setBrief(""); } });
  const update = useStoreMutation((sapi, v: { id: string; patch: Partial<Campaign> & { scheduledAt?: string | null } }) => sapi<Campaign>(`/emails/campaigns/${v.id}`, { method: "PATCH", body: v.patch }), { success: "Campaign updated", invalidate: "emails", onSuccess: (c) => setActive(c) });
  const send = useStoreMutation((sapi, id: string) => sapi<Campaign>(`/emails/campaigns/${id}/send`, { method: "POST" }), { success: (c) => `Sent to ${c.stats.sent} subscribers`, invalidate: "emails", onSuccess: () => setActive(null) });
  const remove = useStoreMutation((sapi, id: string) => sapi(`/emails/campaigns/${id}`, { method: "DELETE" }), { success: "Deleted", invalidate: "emails", onSuccess: () => { setDel(null); setActive(null); } });
  const [schedule, setSchedule] = useState("");
  return (
    <div className="space-y-4">
      <Card title="Draft a campaign" eyebrow="Brief → AI draft → subject → send">
        <div className="flex gap-2"><Input value={brief} onChange={(e) => setBrief(e.target.value)} onKeyDown={(e) => e.key === "Enter" && brief.trim().length > 1 && draft.mutate()} placeholder="New autumn drop: three glove colours, free shipping this week" /><Button variant="primary" icon={<WandSparkles size={13} />} loading={draft.isPending} disabled={brief.trim().length < 2} onClick={() => draft.mutate()}>Draft with AI</Button></div>
        <p className="mt-1.5 text-[11px] text-muted">The draft uses your three newest products and brand voice, and proposes three subject lines. Sends go to marketing opt-ins with send-time rotation across subjects.</p>
      </Card>
      <div className="card">
        {q.isLoading && <Loading />}
        {q.data && q.data.items.length === 0 && <EmptyState title="No campaigns yet" />}
        {q.data && q.data.items.length > 0 && (
          <Table>
            <thead><tr><Th>Campaign</Th><Th>Status</Th><Th right>Sent</Th><Th right>Opened</Th><Th right>Revenue</Th><Th>When</Th><Th /></tr></thead>
            <tbody>{q.data.items.map((c) => <Tr key={c.id} onClick={() => setActive(c)}><Td><div className="font-medium">{c.name}</div><div className="truncate text-[11px] text-muted">{c.subject}</div></Td><Td><StatusBadge status={c.status} /></Td><Td right>{c.stats.sent}</Td><Td right>{c.stats.opened}</Td><Td right>{money(c.stats.revenueCents, store?.defaultCurrency)}</Td><Td className="text-muted">{c.sentAt ? fmtDateTime(c.sentAt) : c.scheduledAt ? `scheduled ${fmtDateTime(c.scheduledAt)}` : fmtDateTime(c.createdAt)}</Td><Td right><button onClick={(e) => { e.stopPropagation(); setDel(c); }} className="text-muted hover:text-danger"><Trash2 size={13} /></button></Td></Tr>)}</tbody>
          </Table>
        )}
      </div>
      <Dialog open={!!active} onClose={() => setActive(null)} title={active?.name} description={active?.brief} width="max-w-4xl" footer={active && active.status !== "sent" ? <><Input type="datetime-local" value={schedule} onChange={(e) => setSchedule(e.target.value)} className="!w-52" /><Button disabled={!schedule} onClick={() => update.mutate({ id: active.id, patch: { scheduledAt: new Date(schedule).toISOString() } })}>Schedule</Button><Button variant="primary" icon={<Send size={12} />} loading={send.isPending} onClick={() => send.mutate(active.id)}>Send now</Button></> : undefined}>
        {active && (
          <div className="grid gap-4 md:grid-cols-[300px_1fr]">
            <div className="space-y-3">
              <div>
                <div className="eyebrow mb-1">Subject line</div>
                <div className="space-y-1">{(active.subjectVariants.length ? active.subjectVariants : [active.subject]).map((s) => <button key={s} onClick={() => update.mutate({ id: active.id, patch: { subject: s } })} className={cn("block w-full rounded border px-2.5 py-1.5 text-left text-xs", active.subject === s ? "border-ink bg-ink text-white" : "border-line hover:border-ink")}>{s}</button>)}</div>
                <p className="mt-1 text-[10px] text-muted">All variants rotate across recipients; the selected one is the default.</p>
              </div>
              <Field label="Name"><Input defaultValue={active.name} onBlur={(e) => e.target.value !== active.name && update.mutate({ id: active.id, patch: { name: e.target.value } })} /></Field>
              <Field label="Segment"><Input defaultValue={active.segment} onBlur={(e) => e.target.value !== active.segment && update.mutate({ id: active.id, patch: { segment: e.target.value } })} /></Field>
              <div className="text-xs text-muted"><StatusBadge status={active.status} /> · sent {active.stats.sent} · opened {active.stats.opened} · clicked {active.stats.clicked}</div>
            </div>
            <div className="card overflow-hidden"><iframe title="Campaign preview" srcDoc={active.html} className="h-[520px] w-full bg-white" sandbox="" /></div>
          </div>
        )}
      </Dialog>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={() => del && remove.mutate(del.id)} loading={remove.isPending} title="Delete campaign?" confirmLabel="Delete" danger />
    </div>
  );
}

export default function EmailsPage() {
  const [tab, setTab] = useState<Tab>("templates");
  const [editing, setEditing] = useState<string | null>(null);
  const templates = useStoreQuery<{ items: EmailTemplate[] }>(["emails", "templates"], "/emails/templates");
  const flows = useStoreQuery<{ items: Flow[] }>(["emails", "flows"], "/emails/flows", { enabled: tab === "flows" });
  const log = useStoreQuery<{ items: EmailSend[]; stats: { total: number; sent: number } }>(["emails", "log"], "/emails/log", { enabled: tab === "log" });
  const toggleTemplate = useStoreMutation((sapi, v: { key: string; enabled: boolean }) => sapi(`/emails/templates/${v.key}`, { method: "PATCH", body: { enabled: v.enabled } }), { success: (_, v) => `${v.key.replace(/_/g, " ")} ${v.enabled ? "enabled" : "disabled"}`, invalidate: "emails" });
  const toggleFlow = useStoreMutation((sapi, v: { key: string; enabled: boolean }) => sapi(`/emails/flows/${v.key}`, { method: "PATCH", body: { enabled: v.enabled } }), { success: (_, v) => `Flow ${v.enabled ? "on" : "off"}`, invalidate: "emails" });
  const saveSteps = useStoreMutation((sapi, v: { key: string; steps: Flow["steps"] }) => sapi(`/emails/flows/${v.key}`, { method: "PATCH", body: { steps: v.steps } }), { success: "Flow saved", invalidate: "emails" });
  const editingT = templates.data?.items.find((t) => t.key === editing);
  const [stepDrafts, setStepDrafts] = useState<Record<string, Flow["steps"]>>({});

  return (
    <Page wide>
      <PageHeader eyebrow="Retention" title="Emails" subtitle="Ten transactional templates, five automations, campaigns drafted from a brief, and a send log with retries." />
      {!editingT && <Tabs value={tab} onChange={setTab} items={[{ value: "templates", label: "Templates", count: templates.data?.items.length }, { value: "flows", label: "Flows", count: 5 }, { value: "campaigns", label: "Campaigns" }, { value: "log", label: "Send log" }]} className="mb-4" />}
      {editingT ? <TemplateEditor key={editingT.key} t={editingT} onBack={() => setEditing(null)} /> : tab === "templates" ? (
        <div className="card">
          {templates.isLoading && <Loading />}
          <Table>
            <thead><tr><Th>Template</Th><Th>Trigger</Th><Th>Delay</Th><Th>Subject</Th><Th>Customised</Th><Th>Enabled</Th></tr></thead>
            <tbody>{(templates.data?.items ?? []).map((t) => <Tr key={t.key} onClick={() => setEditing(t.key)}><Td><span className="inline-flex items-center gap-2 font-medium"><Mail size={13} className="text-muted" />{t.name}</span></Td><Td><Badge>{t.trigger}</Badge></Td><Td className="text-muted">{delayLabel(t.delayMinutes)}</Td><Td className="max-w-[320px] truncate text-muted">{t.subject}</Td><Td>{t.customized ? <Badge tone="accent">yes</Badge> : <span className="text-[11px] text-muted">default</span>}</Td><Td><span onClick={(e) => e.stopPropagation()}><Toggle checked={t.enabled} onChange={(v) => toggleTemplate.mutate({ key: t.key, enabled: v })} /></span></Td></Tr>)}</tbody>
          </Table>
        </div>
      ) : tab === "flows" ? (
        <div className="grid gap-3 md:grid-cols-2">
          {flows.isLoading && <Loading />}
          {(flows.data?.items ?? []).map((f) => {
            const steps = stepDrafts[f.key] ?? f.steps;
            const dirty = stepDrafts[f.key] !== undefined && JSON.stringify(steps) !== JSON.stringify(f.steps);
            return (
              <Card key={f.id} title={f.name} eyebrow={`when ${f.trigger}`} action={<Toggle checked={f.enabled} onChange={(v) => toggleFlow.mutate({ key: f.key, enabled: v })} />}>
                <ol className="space-y-1.5">
                  {steps.map((s, i) => (
                    <li key={i} className="grid grid-cols-[64px_1fr_1fr] items-center gap-1.5 text-xs">
                      <Input type="number" value={s.delayHours} onChange={(e) => setStepDrafts({ ...stepDrafts, [f.key]: steps.map((x, j) => (j === i ? { ...x, delayHours: Number(e.target.value) } : x)) })} className="!h-7" title="Delay (hours)" />
                      <Input value={s.templateKey} onChange={(e) => setStepDrafts({ ...stepDrafts, [f.key]: steps.map((x, j) => (j === i ? { ...x, templateKey: e.target.value } : x)) })} className="!h-7 font-mono !text-[11px]" list="tpl-keys" />
                      <Input value={s.subject} onChange={(e) => setStepDrafts({ ...stepDrafts, [f.key]: steps.map((x, j) => (j === i ? { ...x, subject: e.target.value } : x)) })} className="!h-7" />
                    </li>
                  ))}
                </ol>
                <datalist id="tpl-keys">{(templates.data?.items ?? []).map((t) => <option key={t.key} value={t.key} />)}</datalist>
                <div className="mt-2 flex items-center gap-2 text-[11px] text-muted">
                  <span>{f.stats.triggered} triggered · {f.stats.converted} converted</span><span className="flex-1" />
                  <Button size="xs" variant="ghost" onClick={() => setStepDrafts({ ...stepDrafts, [f.key]: [...steps, { delayHours: 24, templateKey: "welcome", subject: "" }] })}>Add step</Button>
                  {dirty && <Button size="xs" variant="primary" loading={saveSteps.isPending} onClick={() => saveSteps.mutate({ key: f.key, steps })}>Save</Button>}
                </div>
              </Card>
            );
          })}
        </div>
      ) : tab === "campaigns" ? <CampaignsTab /> : (
        <div>
          <StatTiles cols={3} items={[{ label: "Total sends", value: fmtNumber(log.data?.stats.total ?? 0) }, { label: "Delivered", value: fmtNumber(log.data?.stats.sent ?? 0) }, { label: "Delivery rate", value: log.data?.stats.total ? `${Math.round((log.data.stats.sent / log.data.stats.total) * 100)}%` : "—" }]} />
          <div className="card mt-4">
            {log.isLoading && <Loading />}
            {log.data && log.data.items.length === 0 && <EmptyState title="No emails sent yet" />}
            {log.data && log.data.items.length > 0 && <Table><thead><tr><Th>To</Th><Th>Template</Th><Th>Subject</Th><Th>Status</Th><Th right>Attempts</Th><Th>Sent</Th></tr></thead><tbody>{log.data.items.map((s) => <Tr key={s.id}><Td>{s.to}</Td><Td><Badge>{titleCase(s.templateKey)}</Badge></Td><Td className="max-w-[300px] truncate text-muted">{s.subject}</Td><Td><StatusBadge status={s.status} />{s.error && <span className="ml-1 text-[10px] text-danger">{s.error}</span>}</Td><Td right>{s.attempts}</Td><Td className="text-muted">{fmtDateTime(s.createdAt)}</Td></Tr>)}</tbody></Table>}
          </div>
        </div>
      )}
    </Page>
  );
}
