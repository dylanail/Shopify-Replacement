"use client";

import { useState } from "react";
import { BadgeCheck, Check, Flag, MessageSquareReply, RefreshCw, Sparkles, Trash2, Undo2, X } from "lucide-react";
import { useStoreQuery } from "@/lib/store-context";
import { useStoreMutation } from "@/lib/hooks";
import { useAi } from "@/lib/ai-context";
import { cn, fmtDateTime, fmtNumber } from "@/lib/utils";
import type { Paginated, Product, Question, Review } from "@/lib/types";
import { Page } from "@/components/shell/shell";
import { Badge, Button, Card, Dialog, EmptyState, Field, Input, Loading, PageHeader, Pagination, Select, Stars, StatTiles, StatusBadge, Tabs, Textarea, Toggle } from "@/components/ui";

type ReviewsRes = Paginated<Review> & { overview: { total: number; pending: number; flagged: number; average: number } };
const COMPONENTS = [
  { id: "ReviewBadge", name: "Star badge", where: "Above the product title", desc: "Average rating + count, links to the wall." },
  { id: "ReviewWall", name: "Review wall (grid)", where: "Product page end · homepage", desc: "Masonry grid of photo reviews with filters." },
  { id: "ReviewCardsHorizontal", name: "Horizontal cards", where: "Product page below description", desc: "Swipeable cards, three per row." },
  { id: "VideoWall", name: "Video wall", where: "Homepage sections", desc: "Autoplaying muted clips from video reviews." },
  { id: "HappyCustomersBanner", name: "Happy customers banner", where: "Homepage · collection top", desc: "Avatars + count + average, one line." },
  { id: "QuoteCard", name: "Quote card", where: "Cart drawer · thank-you", desc: "One rotating five-star quote." },
  { id: "BubblesGrid", name: "Bubbles grid", where: "Homepage sections", desc: "Short quotes as speech bubbles." },
];

export default function ReviewsPage() {
  const { open } = useAi();
  const [tab, setTab] = useState<"queue" | "qa" | "components">("queue");
  const [status, setStatus] = useState("pending");
  const [rating, setRating] = useState("");
  const [withPhoto, setWithPhoto] = useState(false);
  const [verified, setVerified] = useState(false);
  const [productId, setProductId] = useState("");
  const [page, setPage] = useState(1);
  const q = useStoreQuery<ReviewsRes>(["reviews"], "/reviews", { query: { page, pageSize: 20, status, rating, withPhoto: withPhoto ? "true" : "", verified: verified ? "true" : "", productId } });
  const products = useStoreQuery<Paginated<Product>>(["products"], "/products", { query: { pageSize: 100 } });
  const questions = useStoreQuery<{ items: Question[] }>(["questions"], "/questions", { enabled: tab === "qa" });
  const [reply, setReply] = useState<{ r: Review; text: string } | null>(null);
  const [answer, setAnswer] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState<{ pid: string; bullets: string[] } | null>(null);
  const moderate = useStoreMutation((sapi, v: { id: string; action: string; reply?: string }) => sapi(`/reviews/${v.id}/${v.action}`, { method: "POST", body: { reply: v.reply } }), { success: (_, v) => (v.action === "reply" ? "Reply posted" : `Review ${v.action}d`.replace("ed", v.action.endsWith("e") ? "d" : "ed")), invalidate: "reviews", onSuccess: () => setReply(null) });
  const regen = useStoreMutation((sapi, pid: string) => sapi<{ bullets: string[] }>(`/reviews/summary/${pid}`, { method: "POST" }), { success: "Summary regenerated", invalidate: false, onSuccess: (r, pid) => setSummary({ pid, bullets: r.bullets }) });
  const answerM = useStoreMutation((sapi, v: { id: string; answer: string }) => sapi(`/questions/${v.id}/answer`, { method: "POST", body: { answer: v.answer } }), { success: "Answer published", invalidate: "questions" });
  const ov = q.data?.overview;

  return (
    <Page wide>
      <PageHeader eyebrow="Reputation" title="Reviews" subtitle="Moderation queue, fake-review flags, AI summaries and Q&A." actions={<Button icon={<Sparkles size={13} className="text-accent" />} onClick={() => open("Show pending reviews and flag anything that looks fake")}>Triage with AI</Button>} />
      <StatTiles items={[{ label: "Reviews", value: fmtNumber(ov?.total ?? 0) }, { label: "Pending", value: fmtNumber(ov?.pending ?? 0) }, { label: "Flagged", value: fmtNumber(ov?.flagged ?? 0), hint: "fake score ≥ 0.5" }, { label: "Average", value: <span className="inline-flex items-center gap-1">{ov?.average ?? 0}<Stars value={ov?.average ?? 0} /></span> }]} />
      <Tabs value={tab} onChange={setTab} items={[{ value: "queue", label: "Moderation queue", count: ov?.pending }, { value: "qa", label: "Q&A" }, { value: "components", label: "Storefront components", count: 7 }]} className="my-4" />

      {tab === "queue" && (
        <div className="card">
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
            <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="!h-7 !w-32 !text-xs"><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="all">All</option></Select>
            <Select value={rating} onChange={(e) => { setRating(e.target.value); setPage(1); }} className="!h-7 !w-28 !text-xs"><option value="">Any rating</option>{[5, 4, 3, 2, 1].map((r) => <option key={r} value={r}>{r} ★</option>)}</Select>
            <Select value={productId} onChange={(e) => { setProductId(e.target.value); setPage(1); }} className="!h-7 !w-44 !text-xs"><option value="">All products</option>{(products.data?.items ?? []).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</Select>
            <Toggle checked={withPhoto} onChange={(v) => { setWithPhoto(v); setPage(1); }} label="With photo" />
            <Toggle checked={verified} onChange={(v) => { setVerified(v); setPage(1); }} label="Verified only" />
            <span className="flex-1" />
            {productId && <Button size="xs" icon={<RefreshCw size={11} />} loading={regen.isPending} onClick={() => regen.mutate(productId)}>Regenerate summary</Button>}
          </div>
          {summary && summary.pid === productId && <div className="border-b border-line bg-cream px-4 py-2 text-xs"><div className="eyebrow mb-1">AI summary</div>{summary.bullets.length ? <ul className="list-disc pl-4">{summary.bullets.map((b, i) => <li key={i}>{b}</li>)}</ul> : <span className="text-muted">No approved reviews to summarise.</span>}</div>}
          {q.isLoading && <Loading />}
          {q.data && q.data.items.length === 0 && <EmptyState title="Queue is clear" body="Nothing matches these filters." />}
          <ul className="divide-y divide-line">
            {(q.data?.items ?? []).map((r) => (
              <li key={r.id} className={cn("px-4 py-3", r.fakeScore >= 0.5 && "bg-danger-soft/30")}>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Stars value={r.rating} />
                  <span className="font-medium">{r.authorName}</span>
                  {r.verified ? <Badge tone="green"><BadgeCheck size={10} /> verified buyer</Badge> : <Badge tone="neutral">unverified</Badge>}
                  {r.fakeScore >= 0.5 && <Badge tone="red"><Flag size={10} /> fake score {r.fakeScore}</Badge>}
                  {r.flags.filter((f) => f !== "unverified").map((f) => <Badge key={f} tone="amber">{f.replace(/_/g, " ")}</Badge>)}
                  <StatusBadge status={r.status} />
                  <span className="text-muted">· {r.product?.title ?? "product"} · {fmtDateTime(r.createdAt)}</span>
                </div>
                {r.title && <div className="mt-1 text-[13px] font-medium">{r.title}</div>}
                <p className="mt-0.5 text-[13px]">{r.body}</p>
                {r.media.length > 0 && <div className="mt-1.5 flex gap-1.5">{r.media.map((m, i) => <img key={i} src={m.url} alt={m.alt} className="h-14 w-14 rounded border border-line object-cover" />)}</div>}
                {r.reply && <div className="mt-2 rounded border-l-2 border-accent bg-cream px-3 py-1.5 text-xs"><span className="eyebrow">Founder reply</span><div>{r.reply}</div></div>}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {r.status !== "approved" && <Button size="xs" variant="primary" icon={<Check size={11} />} onClick={() => moderate.mutate({ id: r.id, action: "approve" })}>Approve</Button>}
                  {r.status !== "rejected" && <Button size="xs" icon={<X size={11} />} onClick={() => moderate.mutate({ id: r.id, action: "reject" })}>Reject</Button>}
                  {r.status !== "pending" && <Button size="xs" variant="ghost" icon={<Undo2 size={11} />} onClick={() => moderate.mutate({ id: r.id, action: "restore" })}>Restore</Button>}
                  <Button size="xs" variant="ghost" icon={<MessageSquareReply size={11} />} onClick={() => setReply({ r, text: r.reply ?? "" })}>Reply</Button>
                  <Button size="xs" variant="ghost" onClick={() => open(`Draft a warm reply to this ${r.rating}-star review from ${r.authorName}: "${r.body.slice(0, 200)}"`)}><Sparkles size={11} className="text-accent" /> Draft reply</Button>
                  <span className="flex-1" />
                  <Button size="xs" variant="ghost" className="text-danger" icon={<Trash2 size={11} />} onClick={() => moderate.mutate({ id: r.id, action: "delete" })}>Delete</Button>
                </div>
              </li>
            ))}
          </ul>
          {q.data && <Pagination page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onChange={setPage} />}
        </div>
      )}

      {tab === "qa" && (
        <div className="card">
          {questions.isLoading && <Loading />}
          {questions.data && questions.data.items.length === 0 && <EmptyState title="No questions yet" body="Shoppers can ask on product pages. Open ones get an auto-answer from the review corpus when possible." />}
          <ul className="divide-y divide-line">
            {(questions.data?.items ?? []).map((qn) => (
              <li key={qn.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2 text-xs"><StatusBadge status={qn.status} /><span className="text-muted">{products.data?.items.find((p) => p.id === qn.productId)?.title ?? qn.productId} · {qn.askedBy ?? "anonymous"} · {fmtDateTime(qn.createdAt)}</span></div>
                <div className="mt-1 text-[13px] font-medium">{qn.question}</div>
                {qn.answer && <div className="mt-1 rounded border-l-2 border-teal bg-cream px-3 py-1.5 text-xs"><span className="eyebrow">{qn.answeredBy === "ai" ? "Auto-answer from reviews" : "Founder answer"}</span><div>{qn.answer}</div></div>}
                <div className="mt-2 flex gap-2">
                  <Input value={answer[qn.id] ?? ""} onChange={(e) => setAnswer({ ...answer, [qn.id]: e.target.value })} placeholder={qn.answer ? "Replace with a founder answer…" : "Write an answer…"} className="!h-7" />
                  <Button size="sm" variant="primary" disabled={!answer[qn.id]?.trim()} loading={answerM.isPending} onClick={() => answerM.mutate({ id: qn.id, answer: answer[qn.id]! })}>Publish</Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === "components" && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {COMPONENTS.map((c) => (
            <Card key={c.id} title={c.name} eyebrow={c.where}>
              <p className="text-xs text-muted">{c.desc}</p>
              <div className="mt-2 flex items-center justify-between"><span className="font-mono text-[10px] text-muted">{c.id}</span><Button size="xs" onClick={() => open(`Add the ${c.name} review component (${c.id}) to my storefront in its default slot`)}>Place with AI</Button></div>
            </Card>
          ))}
          <Card title="Review request emails" eyebrow="Automation">
            <p className="text-xs text-muted">Seven days after delivery, customers get a request with an optional discount code. Configure it under Plugins → Product Reviews.</p>
          </Card>
        </div>
      )}

      <Dialog open={!!reply} onClose={() => setReply(null)} title={`Reply to ${reply?.r.authorName}`} width="max-w-md" footer={<><Button variant="ghost" onClick={() => setReply(null)}>Cancel</Button><Button variant="primary" loading={moderate.isPending} onClick={() => reply && moderate.mutate({ id: reply.r.id, action: "reply", reply: reply.text })}>Post reply</Button></>}>
        {reply && <><p className="mb-2 rounded bg-cream px-3 py-2 text-xs text-muted">“{reply.r.body}”</p><Field label="Your reply"><Textarea value={reply.text} onChange={(e) => setReply({ ...reply, text: e.target.value })} autoFocus /></Field></>}
      </Dialog>
    </Page>
  );
}
