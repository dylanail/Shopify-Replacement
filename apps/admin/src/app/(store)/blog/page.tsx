"use client";

import { useState } from "react";
import { ExternalLink, Plus, Sparkles, Trash2 } from "lucide-react";
import { useStore, useStoreQuery } from "@/lib/store-context";
import { useStoreMutation } from "@/lib/hooks";
import { useAi } from "@/lib/ai-context";
import { cn, fmtDate, stripHtml } from "@/lib/utils";
import type { Article, Blog } from "@/lib/types";
import { Page } from "@/components/shell/shell";
import { Button, Card, Chips, ConfirmDialog, Dialog, EmptyState, Field, Input, Loading, PageHeader, Select, StatusBadge, Table, Td, Textarea, Th, Tr } from "@/components/ui";

interface Form { title: string; body: string; excerpt: string; featuredImage: string; tags: string[]; status: Article["status"]; publishedAt: string; blogId: string }
const blank = (blogId: string): Form => ({ title: "", body: "", excerpt: "", featuredImage: "", tags: [], status: "draft", publishedAt: "", blogId });

export default function BlogPage() {
  const { store } = useStore();
  const { open } = useAi();
  const blogs = useStoreQuery<{ items: Blog[] }>(["blogs"], "/blogs");
  const [blogId, setBlogId] = useState("");
  const current = blogId || blogs.data?.items[0]?.id || "";
  const articles = useStoreQuery<{ items: Article[] }>(["articles", current], "/articles", { query: { blogId: current }, enabled: !!current });
  const [editing, setEditing] = useState<{ id?: string; form: Form } | null>(null);
  const [newBlog, setNewBlog] = useState<string | null>(null);
  const [del, setDel] = useState<Article | null>(null);
  const createBlog = useStoreMutation((sapi, title: string) => sapi<Blog>("/blogs", { method: "POST", body: { title } }), { success: "Blog created", invalidate: "blogs", onSuccess: (b) => { setBlogId(b.id); setNewBlog(null); } });
  const save = useStoreMutation((sapi, v: { id?: string; form: Form }) => {
    const body = { ...v.form, featuredImage: v.form.featuredImage || null, publishedAt: v.form.publishedAt ? new Date(v.form.publishedAt).toISOString() : null };
    return v.id ? sapi(`/articles/${v.id}`, { method: "PATCH", body }) : sapi("/articles", { method: "POST", body });
  }, { success: (_, v) => (v.id ? "Article saved" : "Article created"), invalidate: "articles", onSuccess: () => setEditing(null) });
  const remove = useStoreMutation((sapi, id: string) => sapi(`/articles/${id}`, { method: "DELETE" }), { success: "Article deleted", invalidate: "articles", onSuccess: () => setDel(null) });
  const f = editing?.form;
  const setF = (patch: Partial<Form>) => editing && setEditing({ ...editing, form: { ...editing.form, ...patch } });

  return (
    <Page wide>
      <PageHeader eyebrow="Content" title="Blog" subtitle="Multi-blog CMS with RSS, SEO fields and scheduled publishing." actions={<><Button icon={<Sparkles size={13} className="text-accent" />} onClick={() => open("Write a blog post about how we make things, in our voice, and save it as a draft")}>Write with AI</Button><Button variant="primary" icon={<Plus size={13} />} disabled={!current} onClick={() => setEditing({ form: blank(current) })}>New article</Button></>} />
      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <Card title="Blogs" padded={false} action={<Button size="xs" icon={<Plus size={11} />} onClick={() => setNewBlog("")}>New</Button>}>
          {blogs.isLoading && <Loading />}
          <ul className="divide-y divide-line">
            {(blogs.data?.items ?? []).map((b) => <li key={b.id}><button onClick={() => setBlogId(b.id)} className={cn("flex w-full items-center justify-between px-4 py-2 text-left text-xs hover:bg-cream", b.id === current && "bg-cream font-medium")}><span>{b.title}</span><span className="text-muted">{b.articleCount}</span></button></li>)}
            {blogs.data && blogs.data.items.length === 0 && <li className="px-4 py-5 text-center text-[11px] text-muted">No blogs yet — create one, or write an article and “Journal” is created for you.</li>}
          </ul>
          {blogs.data?.items.length ? <div className="border-t border-line px-4 py-2 text-[11px]"><a href={`${store?.url}/blog/rss.xml`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-muted hover:text-ink">RSS feed <ExternalLink size={10} /></a></div> : null}
        </Card>
        <div className="card">
          {articles.isLoading && <Loading />}
          {!current && !blogs.isLoading && <EmptyState title="Start your journal" body="Create a blog on the left, or write your first article." action={<Button variant="primary" onClick={() => setEditing({ form: blank("") })}>Write an article</Button>} />}
          {current && articles.data && articles.data.items.length === 0 && <EmptyState title="No articles yet" action={<Button variant="primary" onClick={() => setEditing({ form: blank(current) })}>New article</Button>} />}
          {articles.data && articles.data.items.length > 0 && (
            <Table>
              <thead><tr><Th>Article</Th><Th>Status</Th><Th>Tags</Th><Th>Published</Th><Th /></tr></thead>
              <tbody>{articles.data.items.map((a) => <Tr key={a.id} onClick={() => setEditing({ id: a.id, form: { title: a.title, body: a.body, excerpt: a.excerpt, featuredImage: a.featuredImage ?? "", tags: a.tags, status: a.status, publishedAt: a.publishedAt ? a.publishedAt.slice(0, 16) : "", blogId: a.blogId } })}><Td><div className="flex items-center gap-3">{a.featuredImage && <img src={a.featuredImage} alt="" className="h-9 w-12 rounded border border-line object-cover" />}<div><div className="font-medium">{a.title}</div><div className="max-w-[420px] truncate text-[11px] text-muted">{a.excerpt || stripHtml(a.body).slice(0, 120)}</div></div></div></Td><Td><StatusBadge status={a.status} /></Td><Td className="text-[11px] text-muted">{a.tags.join(", ")}</Td><Td className="text-muted">{fmtDate(a.publishedAt)}</Td><Td right><div className="flex items-center justify-end gap-1"><a href={`${store?.url}/blog/${a.handle}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-muted hover:text-ink"><ExternalLink size={13} /></a><button onClick={(e) => { e.stopPropagation(); setDel(a); }} className="text-muted hover:text-danger"><Trash2 size={13} /></button></div></Td></Tr>)}</tbody>
            </Table>
          )}
        </div>
      </div>

      <Dialog open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? "Edit article" : "New article"} width="max-w-3xl" footer={<><Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button><Button variant="primary" loading={save.isPending} disabled={!f?.title.trim()} onClick={() => editing && save.mutate(editing)}>{editing?.id ? "Save" : "Create"}</Button></>}>
        {f && (
          <div className="grid gap-4 md:grid-cols-[1fr_260px]">
            <div className="space-y-3">
              <Field label="Title" required><Input value={f.title} onChange={(e) => setF({ title: e.target.value })} autoFocus /></Field>
              <Field label="Body (HTML)"><div className="relative"><Textarea value={f.body} onChange={(e) => setF({ body: e.target.value })} className="min-h-[320px] font-mono !text-[12px]" placeholder="<p>…</p>" /><button type="button" onClick={() => open(`Write a blog article titled "${f.title || "untitled"}" in our brand voice, around 600 words, HTML body${editing?.id ? ` — update article ${editing.id}` : ""}`)} className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded border border-line bg-card px-2 py-1 text-[11px] hover:border-ink"><Sparkles size={11} className="text-accent" /> Draft with AI</button></div></Field>
              <Field label="Excerpt"><Textarea value={f.excerpt} onChange={(e) => setF({ excerpt: e.target.value })} className="min-h-[50px]" placeholder="Auto-generated from the body when empty" /></Field>
            </div>
            <div className="space-y-3">
              <Field label="Blog"><Select value={f.blogId} onChange={(e) => setF({ blogId: e.target.value })}><option value="">Default (Journal)</option>{(blogs.data?.items ?? []).map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}</Select></Field>
              <Field label="Status"><Select value={f.status} onChange={(e) => setF({ status: e.target.value as Article["status"] })}><option value="draft">Draft</option><option value="scheduled">Scheduled</option><option value="published">Published</option></Select></Field>
              {f.status !== "draft" && <Field label="Publish at"><Input type="datetime-local" value={f.publishedAt} onChange={(e) => setF({ publishedAt: e.target.value })} /></Field>}
              <Field label="Featured image URL"><Input value={f.featuredImage} onChange={(e) => setF({ featuredImage: e.target.value })} />{f.featuredImage && <img src={f.featuredImage} alt="" className="mt-2 h-24 w-full rounded border border-line object-cover" />}</Field>
              <Field label="Tags"><Chips value={f.tags} onChange={(v) => setF({ tags: v })} /></Field>
            </div>
          </div>
        )}
      </Dialog>
      <Dialog open={newBlog !== null} onClose={() => setNewBlog(null)} title="New blog" width="max-w-sm" footer={<><Button variant="ghost" onClick={() => setNewBlog(null)}>Cancel</Button><Button variant="primary" loading={createBlog.isPending} disabled={!newBlog?.trim()} onClick={() => newBlog && createBlog.mutate(newBlog)}>Create</Button></>}>
        <Field label="Title"><Input value={newBlog ?? ""} onChange={(e) => setNewBlog(e.target.value)} placeholder="Workshop notes" autoFocus /></Field>
      </Dialog>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={() => del && remove.mutate(del.id)} loading={remove.isPending} title={`Delete “${del?.title}”?`} confirmLabel="Delete" danger />
    </Page>
  );
}
