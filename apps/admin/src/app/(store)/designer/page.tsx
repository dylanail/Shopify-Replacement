"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Check, Eye, EyeOff, Hammer, Image as ImageIcon, LayoutTemplate, LoaderCircle, Palette, Pencil, Plus, RotateCcw, ScrollText, Trash2 } from "lucide-react";
import { THEME_TEMPLATES, type ThemeConfig, type ThemeSection } from "@kiln/shared";
import { useStore, useStoreQuery } from "@/lib/store-context";
import { useStoreMutation } from "@/lib/hooks";
import { useEventChannel, type BuildEvent } from "@/lib/events";
import { cn, fmtDateTime, timeAgo } from "@/lib/utils";
import type { Environment } from "@/lib/types";
import { ChatView } from "@/components/ai/chat";
import { BrowserFrame } from "@/components/preview";
import { PublishButton } from "@/components/shell/topbar";
import { Badge, Button, ConfirmDialog, Dialog, Field, Input, Select, StatusBadge, Tabs, Textarea } from "@/components/ui";

const SECTION_TYPES: ThemeSection["type"][] = ["hero", "featured-products", "collection-grid", "rich-text", "image-with-text", "testimonials", "newsletter", "trust-strip", "faq", "custom-html"];
const FIELDS: Record<string, { key: string; label: string; kind: "text" | "textarea" | "number" | "items" | "url" }[]> = {
  hero: [{ key: "headline", label: "Headline", kind: "text" }, { key: "subheadline", label: "Subheadline", kind: "textarea" }, { key: "ctaLabel", label: "CTA label", kind: "text" }, { key: "ctaHref", label: "CTA link", kind: "text" }, { key: "imageUrl", label: "Image URL", kind: "url" }],
  "featured-products": [{ key: "title", label: "Title", kind: "text" }, { key: "limit", label: "How many", kind: "number" }],
  "collection-grid": [{ key: "title", label: "Title", kind: "text" }, { key: "limit", label: "How many", kind: "number" }],
  "rich-text": [{ key: "title", label: "Title", kind: "text" }, { key: "body", label: "Body", kind: "textarea" }],
  "image-with-text": [{ key: "title", label: "Title", kind: "text" }, { key: "body", label: "Body", kind: "textarea" }, { key: "imageUrl", label: "Image URL", kind: "url" }],
  testimonials: [{ key: "title", label: "Title", kind: "text" }],
  newsletter: [{ key: "title", label: "Title", kind: "text" }, { key: "body", label: "Body", kind: "textarea" }],
  "trust-strip": [{ key: "items", label: "Items", kind: "items" }],
  faq: [{ key: "title", label: "Title", kind: "text" }, { key: "items", label: "Questions (one per line: Question | Answer)", kind: "items" }],
  "custom-html": [{ key: "html", label: "HTML", kind: "textarea" }],
};

function SectionEditor({ section, onSave, onClose, saving }: { section: ThemeSection; onSave: (settings: Record<string, unknown>) => void; onClose: () => void; saving: boolean }) {
  const [s, setS] = useState<Record<string, unknown>>({ ...section.settings });
  const fields = FIELDS[section.type] ?? [{ key: "title", label: "Title", kind: "text" as const }];
  return (
    <Dialog open onClose={onClose} title={`Edit ${section.type.replace(/-/g, " ")}`} description={`Section ${section.id}`} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={saving} onClick={() => onSave(s)}>Save to draft</Button></>}>
      <div className="space-y-3">
        {fields.map((f) => (
          <Field key={f.key} label={f.label}>
            {f.kind === "textarea" ? <Textarea value={String(s[f.key] ?? "")} onChange={(e) => setS({ ...s, [f.key]: e.target.value })} /> : f.kind === "number" ? <Input type="number" value={String(s[f.key] ?? "")} onChange={(e) => setS({ ...s, [f.key]: Number(e.target.value) })} /> : f.kind === "items" ? <Textarea value={Array.isArray(s[f.key]) ? (s[f.key] as unknown[]).map((i) => (typeof i === "string" ? i : `${(i as { q?: string; question?: string }).q ?? (i as { question?: string }).question ?? ""} | ${(i as { a?: string; answer?: string }).a ?? (i as { answer?: string }).answer ?? ""}`)).join("\n") : ""} onChange={(e) => setS({ ...s, [f.key]: e.target.value.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => (section.type === "faq" && l.includes("|") ? { question: l.split("|")[0]!.trim(), answer: l.split("|").slice(1).join("|").trim() } : l)) })} placeholder="One per line" /> : <Input value={String(s[f.key] ?? "")} onChange={(e) => setS({ ...s, [f.key]: e.target.value })} />}
            {f.kind === "url" && typeof s[f.key] === "string" && s[f.key] ? <img src={String(s[f.key])} alt="" className="mt-2 h-20 w-full rounded border border-line object-cover" /> : null}
          </Field>
        ))}
      </div>
    </Dialog>
  );
}

function BrandKit({ theme, onSave, saving }: { theme: ThemeConfig; onSave: (brand: Record<string, unknown>) => void; saving: boolean }) {
  const { store } = useStore();
  const base = useMemo(() => ({ ...(store?.brand ?? {}), ...theme.brand }), [store?.brand, theme.brand]);
  const [b, setB] = useState<Record<string, string>>({});
  useEffect(() => setB(Object.fromEntries(Object.entries(base).map(([k, v]) => [k, String(v ?? "")]))), [base]);
  const set = (k: string, v: string) => setB((x) => ({ ...x, [k]: v }));
  const color = (k: string, label: string) => (
    <label className="flex items-center gap-2 text-xs">
      <input type="color" value={b[k] || "#000000"} onChange={(e) => set(k, e.target.value)} className="h-7 w-9 cursor-pointer rounded border border-line bg-card p-0.5" />
      <span className="w-24 text-muted">{label}</span>
      <Input value={b[k] ?? ""} onChange={(e) => set(k, e.target.value)} className="!h-7 flex-1 font-mono !text-[11px]" />
    </label>
  );
  return (
    <div className="space-y-3 p-3">
      <div className="flex items-center gap-3 rounded border border-line bg-card p-3">
        <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded border border-line" style={{ background: b.backgroundColor }}>{b.logoUrl ? <img src={b.logoUrl} alt="logo" className="h-full w-full object-contain" /> : <span className="font-display text-lg" style={{ color: b.primaryColor, fontFamily: b.displayFont }}>{(b.name ?? "K")[0]}</span>}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-lg" style={{ color: b.primaryColor, fontFamily: b.displayFont }}>{b.name}</div>
          <div className="truncate text-[11px] italic" style={{ color: b.secondaryColor }}>{b.slogan}</div>
        </div>
      </div>
      <Field label="Brand name"><Input value={b.name ?? ""} onChange={(e) => set("name", e.target.value)} /></Field>
      <Field label="Slogan"><Input value={b.slogan ?? ""} onChange={(e) => set("slogan", e.target.value)} /></Field>
      <Field label="Description"><Textarea value={b.description ?? ""} onChange={(e) => set("description", e.target.value)} className="min-h-[60px]" /></Field>
      <div className="space-y-1.5">{color("primaryColor", "Primary")}{color("secondaryColor", "Secondary")}{color("backgroundColor", "Background")}{color("textColor", "Text")}</div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Display font"><Input value={b.displayFont ?? ""} onChange={(e) => set("displayFont", e.target.value)} /></Field>
        <Field label="Body font"><Input value={b.bodyFont ?? ""} onChange={(e) => set("bodyFont", e.target.value)} /></Field>
      </div>
      <Field label="Tone of voice"><Input value={b.tone ?? ""} onChange={(e) => set("tone", e.target.value)} /></Field>
      <Field label="Announcement bar"><Input value={b.announcement ?? ""} onChange={(e) => set("announcement", e.target.value)} placeholder="Free shipping over $200 · 14-day build" /></Field>
      <Field label="Logo URL"><Input value={b.logoUrl ?? ""} onChange={(e) => set("logoUrl", e.target.value)} /></Field>
      <Field label="Hero image URL"><Input value={b.heroImageUrl ?? ""} onChange={(e) => set("heroImageUrl", e.target.value)} /></Field>
      <Button variant="primary" loading={saving} onClick={() => onSave(Object.fromEntries(Object.entries(b).filter(([, v]) => v !== "")))} icon={<Check size={13} />}>Save brand kit to draft</Button>
    </div>
  );
}

function TemplateGallery({ open, onClose, current, onPick, busy }: { open: boolean; onClose: () => void; current: string; onPick: (id: string) => void; busy: boolean }) {
  const [slide, setSlide] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => setSlide((s) => Object.fromEntries(THEME_TEMPLATES.map((tp) => [tp.id, ((s[tp.id] ?? 0) + 1) % 3]))), 2200);
    return () => clearInterval(t);
  }, [open]);
  return (
    <Dialog open={open} onClose={onClose} title="Start from a template" description="Your brand kit, products and plugin slots carry over. Sections reset to the template's defaults." width="max-w-3xl">
      <div className="grid gap-3 sm:grid-cols-3">
        {THEME_TEMPLATES.map((t) => {
          const i = slide[t.id] ?? 0;
          return (
            <div key={t.id} className={cn("card overflow-hidden", current === t.id && "border-ink")}>
              <div className="relative aspect-[4/3] bg-sand">
                {t.screenshots.map((src, j) => (
                  <div key={src} className={cn("absolute inset-0 transition-opacity duration-500", j === i ? "opacity-100" : "opacity-0")}>
                    <TemplateShot src={src} name={t.name} index={j} />
                  </div>
                ))}
                <div className="absolute bottom-1.5 left-1/2 flex -translate-x-1/2 gap-1">{[0, 1, 2].map((j) => <span key={j} className={cn("h-1.5 w-1.5 rounded-full", j === i ? "bg-ink" : "bg-ink/25")} />)}</div>
              </div>
              <div className="p-3">
                <div className="flex items-center justify-between"><div className="font-display text-[15px]">{t.name}</div>{current === t.id && <Badge tone="ink">Current</Badge>}</div>
                <p className="mt-1 text-[11px] text-muted">{t.description}</p>
                <Button size="sm" variant={current === t.id ? "secondary" : "primary"} className="mt-2 w-full" loading={busy} onClick={() => onPick(t.id)}>{current === t.id ? "Reset to defaults" : "Use this template"}</Button>
              </div>
            </div>
          );
        })}
      </div>
    </Dialog>
  );
}

/** Screenshot slot with a drawn fallback when the asset isn't present. */
function TemplateShot({ src, name, index }: { src: string; name: string; index: number }) {
  const [err, setErr] = useState(false);
  const palettes: Record<string, [string, string]> = { Atelier: ["#f3ece4", "#b8552f"], Studio: ["#ffffff", "#1a1a1a"], Bazaar: ["#fff6e5", "#2f6f6a"] };
  const [bg, fg] = palettes[name] ?? ["#faf6f2", "#1a1a1a"];
  if (err) {
    return (
      <div className="flex h-full w-full flex-col gap-1.5 p-3" style={{ background: bg }}>
        <div className="h-2 w-1/3 rounded-sm" style={{ background: fg, opacity: 0.8 }} />
        {index === 0 ? <div className="flex-1 rounded-sm" style={{ background: fg, opacity: 0.12 }} /> : index === 1 ? <div className="grid flex-1 grid-cols-3 gap-1">{[0, 1, 2, 3, 4, 5].map((k) => <div key={k} className="rounded-sm" style={{ background: fg, opacity: 0.12 }} />)}</div> : <div className="grid flex-1 grid-cols-2 gap-1"><div className="rounded-sm" style={{ background: fg, opacity: 0.12 }} /><div className="space-y-1 pt-2"><div className="h-2 w-3/4 rounded-sm" style={{ background: fg, opacity: 0.6 }} /><div className="h-1.5 w-1/2 rounded-sm" style={{ background: fg, opacity: 0.3 }} /><div className="mt-2 h-4 w-2/3 rounded-sm" style={{ background: fg }} /></div></div>}
        <div className="h-1.5 w-1/2 rounded-sm" style={{ background: fg, opacity: 0.3 }} />
      </div>
    );
  }
  return <img src={src} alt={`${name} ${index + 1}`} className="h-full w-full object-cover" onError={() => setErr(true)} />;
}

export default function DesignerPage() {
  const { store, refreshStore } = useStore();
  const draftQ = useStoreQuery<Environment>(["env", "draft"], "/environments/draft");
  const liveQ = useStoreQuery<Environment>(["env", "live"], "/environments/live");
  const draft = draftQ.data;
  const [tab, setTab] = useState<"sections" | "brand" | "build">("sections");
  const [editing, setEditing] = useState<ThemeSection | null>(null);
  const [gallery, setGallery] = useState(false);
  const [addType, setAddType] = useState<ThemeSection["type"]>("rich-text");
  const [rollbackOpen, setRollbackOpen] = useState(false);
  const [liveLog, setLiveLog] = useState<{ at: string; status: string; message: string; environment: string }[]>([]);
  const [previewEnv, setPreviewEnv] = useState<"draft" | "live">("draft");
  const [reload, setReload] = useState(0);
  useEventChannel<BuildEvent>("build", (e) => {
    setLiveLog((l) => [...l.slice(-60), { at: new Date().toISOString(), ...e }]);
    if (e.status === "ready" || e.status === "failed") { void draftQ.refetch(); void liveQ.refetch(); setReload((r) => r + 1); }
  });

  const onSaved = () => { setReload((r) => r + 1); refreshStore(); };
  const patchTheme = useStoreMutation((sapi, patch: Partial<ThemeConfig>) => sapi("/environments/draft/theme", { method: "PATCH", body: patch }), { success: "Draft updated", invalidate: "env", onSuccess: onSaved });
  const upsertSection = useStoreMutation((sapi, body: { id?: string; type: string; settings?: Record<string, unknown>; hidden?: boolean; position?: number }) => sapi("/environments/draft/sections", { method: "POST", body }), { success: "Section saved", invalidate: "env", onSuccess: () => { setEditing(null); onSaved(); } });
  const removeSection = useStoreMutation((sapi, id: string) => sapi(`/environments/draft/sections/${id}`, { method: "DELETE" }), { success: "Section removed", invalidate: "env", onSuccess: onSaved });
  const reorder = useStoreMutation((sapi, ids: string[]) => sapi("/environments/draft/reorder", { method: "POST", body: { ids } }), { invalidate: "env", onSuccess: onSaved });
  const applyTemplate = useStoreMutation((sapi, template: string) => sapi("/environments/draft/template", { method: "POST", body: { template } }), { success: "Template applied to draft", invalidate: "env", onSuccess: () => { setGallery(false); onSaved(); } });
  const build = useStoreMutation((sapi, kind: "draft" | "live") => sapi<{ ok: boolean }>(`/environments/${kind}/build`, { method: "POST" }), { success: (r) => (r.ok ? "Build ready" : "Build failed verification — see the log"), invalidate: "env", onSuccess: () => setTab("build") });
  const rollback = useStoreMutation((sapi) => sapi<{ version: number }>("/rollback", { method: "POST" }), { success: (r) => `Rolled back — live is now v${r.version}`, onSuccess: () => { setRollbackOpen(false); onSaved(); } });

  const sections = draft?.theme.sections ?? [];
  const move = (i: number, dir: -1 | 1) => {
    const ids = sections.map((s) => s.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    reorder.mutate(ids);
  };
  const previewUrl = store?.url ? (previewEnv === "draft" ? `${store.url}?env=draft` : store.url) : null;
  const log = [...(draft?.buildLog ?? []).map((l) => ({ ...l, environment: "draft" })), ...liveLog.map((l) => ({ at: l.at, level: l.status === "failed" ? "error" : "info", message: `[${l.environment}] ${l.message}`, environment: l.environment }))].slice(-80);

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      <section className="flex min-h-[50vh] w-full shrink-0 flex-col border-b border-line lg:min-h-0 lg:w-[30%] lg:min-w-[300px] lg:border-b-0 lg:border-r">
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line bg-card px-3">
          <Palette size={14} className="text-accent" /><span className="text-xs font-semibold">Store Designer</span>
          <span className="ml-auto text-[10px] text-muted">chat edits the draft</span>
        </div>
        <ChatView compact pageContext="designer" placeholder="Describe a change — “make the hero moodier”, “add an FAQ”…" />
      </section>

      <section className="flex min-h-0 flex-1 flex-col">
        <div className="flex h-10 shrink-0 flex-wrap items-center gap-2 border-b border-line bg-card px-3">
          <div className="inline-flex rounded border border-line p-0.5">
            <button onClick={() => setPreviewEnv("draft")} className={cn("rounded px-2 py-0.5 text-[11px]", previewEnv === "draft" ? "bg-ink text-white" : "text-muted")}>Draft</button>
            <button onClick={() => setPreviewEnv("live")} className={cn("rounded px-2 py-0.5 text-[11px]", previewEnv === "live" ? "bg-ink text-white" : "text-muted")}>Live</button>
          </div>
          {draft && <span className="text-[11px] text-muted">draft <StatusBadge status={draft.buildStatus} /></span>}
          {liveQ.data && <span className="hidden text-[11px] text-muted sm:inline">live v{liveQ.data.version}{liveQ.data.publishedAt ? ` · ${timeAgo(liveQ.data.publishedAt)}` : ""}</span>}
          <span className="flex-1" />
          <Button size="xs" icon={<LayoutTemplate size={12} />} onClick={() => setGallery(true)}>Templates</Button>
          <Button size="xs" icon={<Hammer size={12} />} loading={build.isPending} onClick={() => build.mutate("draft")}>Preview build</Button>
          <Button size="xs" icon={<RotateCcw size={12} />} onClick={() => setRollbackOpen(true)}>Rollback</Button>
          <PublishButton size="xs" />
        </div>
        <div className="flex min-h-0 flex-1 flex-col xl:flex-row">
          <div className="min-h-[360px] flex-1 p-3">
            <BrowserFrame url={previewUrl} height="100%" className="h-full" reloadKey={reload} />
          </div>
          <aside className="flex w-full shrink-0 flex-col border-t border-line bg-cream xl:w-[320px] xl:border-l xl:border-t-0">
            <Tabs value={tab} onChange={setTab} items={[{ value: "sections", label: "Sections", count: sections.length }, { value: "brand", label: "Brand kit" }, { value: "build", label: "Build log", count: draft?.lint.problems.length || undefined }]} className="bg-card px-2" />
            <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
              {tab === "sections" && (
                <div className="p-2">
                  {!draft && <div className="flex items-center gap-2 p-3 text-[11px] text-muted"><LoaderCircle size={12} className="animate-spin" /> Loading draft…</div>}
                  <ul className="space-y-1">
                    {sections.map((s, i) => (
                      <li key={s.id} className={cn("card flex items-center gap-1.5 px-2 py-1.5", s.hidden && "opacity-60")}>
                        <div className="flex flex-col">
                          <button onClick={() => move(i, -1)} disabled={i === 0} className="text-muted hover:text-ink disabled:opacity-30"><ArrowUp size={11} /></button>
                          <button onClick={() => move(i, 1)} disabled={i === sections.length - 1} className="text-muted hover:text-ink disabled:opacity-30"><ArrowDown size={11} /></button>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-medium">{String(s.settings.headline ?? s.settings.title ?? s.type.replace(/-/g, " "))}</div>
                          <div className="text-[10px] text-muted">{s.type}{s.hidden ? " · hidden" : ""}</div>
                        </div>
                        <button onClick={() => upsertSection.mutate({ id: s.id, type: s.type, hidden: !s.hidden })} title={s.hidden ? "Show" : "Hide"} className="text-muted hover:text-ink">{s.hidden ? <EyeOff size={13} /> : <Eye size={13} />}</button>
                        <button onClick={() => setEditing(s)} title="Edit" className="text-muted hover:text-ink"><Pencil size={13} /></button>
                        <button onClick={() => removeSection.mutate(s.id)} title="Remove" className="text-muted hover:text-danger"><Trash2 size={13} /></button>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2 flex gap-1.5">
                    <Select value={addType} onChange={(e) => setAddType(e.target.value as ThemeSection["type"])} className="!h-7 !text-[11px]">{SECTION_TYPES.map((t) => <option key={t} value={t}>{t.replace(/-/g, " ")}</option>)}</Select>
                    <Button size="sm" icon={<Plus size={12} />} loading={upsertSection.isPending} onClick={() => upsertSection.mutate({ id: `${addType}-${Date.now().toString(36)}`, type: addType, settings: addType === "trust-strip" ? { items: ["Free shipping", "Easy returns", "Secure checkout"] } : { title: addType.replace(/-/g, " ") } })}>Add</Button>
                  </div>
                  <Field label="Custom CSS" className="mt-3"><Textarea value={draft?.theme.customCss ?? ""} key={draft?.theme.customCss} onBlur={(e) => e.target.value !== draft?.theme.customCss && patchTheme.mutate({ customCss: e.target.value })} className="min-h-[70px] font-mono !text-[11px]" placeholder=".hero h1 { letter-spacing: -0.02em }" /></Field>
                </div>
              )}
              {tab === "brand" && draft && <BrandKit theme={draft.theme} saving={patchTheme.isPending} onSave={(brand) => patchTheme.mutate({ brand: brand as ThemeConfig["brand"] })} />}
              {tab === "build" && (
                <div className="p-2">
                  {draft && (
                    <div className="card mb-2 p-2.5 text-[11px]">
                      <div className="flex items-center justify-between"><span className="font-medium">Draft v{draft.version}</span><StatusBadge status={draft.buildStatus} /></div>
                      <div className="mt-1 text-muted">Live v{liveQ.data?.version ?? "—"}{liveQ.data?.publishedAt ? ` · published ${fmtDateTime(liveQ.data.publishedAt)}` : " · never published"}</div>
                      {draft.screenshotUrl && <a href={`${process.env.NEXT_PUBLIC_CORE_URL ?? "http://localhost:4000"}${draft.screenshotUrl}`} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-muted hover:text-ink"><ImageIcon size={11} /> Last screenshot</a>}
                    </div>
                  )}
                  {draft && draft.lint.problems.length > 0 && (
                    <div className="mb-2 space-y-1">
                      <div className="eyebrow">Lint</div>
                      {draft.lint.problems.map((p, i) => <div key={i} className={cn("rounded border px-2 py-1 text-[11px]", p.level === "error" ? "border-danger/30 bg-danger-soft text-danger" : "border-amber/30 bg-amber-soft text-amber")}>{p.message}{p.sectionId ? ` (${p.sectionId})` : ""}</div>)}
                    </div>
                  )}
                  <div className="eyebrow mb-1 flex items-center gap-1"><ScrollText size={11} /> Log</div>
                  <div className="card max-h-[50vh] overflow-y-auto p-2 font-mono text-[10px] leading-relaxed">
                    {log.length === 0 && <div className="text-muted">No builds yet. Run a preview build to lint and render the draft.</div>}
                    {log.map((l, i) => <div key={i} className={cn(l.level === "error" ? "text-danger" : l.level === "warning" ? "text-amber" : "text-ink")}><span className="text-faint">{new Date(l.at).toLocaleTimeString()}</span> {l.message}</div>)}
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
      </section>

      {editing && <SectionEditor section={editing} saving={upsertSection.isPending} onClose={() => setEditing(null)} onSave={(settings) => upsertSection.mutate({ id: editing.id, type: editing.type, settings })} />}
      <TemplateGallery open={gallery} onClose={() => setGallery(false)} current={draft?.theme.template ?? "atelier"} busy={applyTemplate.isPending} onPick={(id) => applyTemplate.mutate(id)} />
      <ConfirmDialog open={rollbackOpen} onClose={() => setRollbackOpen(false)} onConfirm={() => rollback.mutate()} loading={rollback.isPending} title="Roll back the live store?" body="Live goes back to the previously published theme. The draft is untouched." confirmLabel="Roll back" danger />
    </div>
  );
}
