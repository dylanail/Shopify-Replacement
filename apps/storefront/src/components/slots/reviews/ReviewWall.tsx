"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { SlotComponentProps } from "../Slot";
import type { ReviewsResponse, Review, Question, ReviewStats } from "@/lib/types";
import { api, errorMessage } from "@/lib/client-api";
import { useStore } from "@/components/providers/StoreProvider";
import { useSession } from "@/components/providers/SessionProvider";
import { Stars } from "@/components/ui/Stars";
import { Img } from "@/components/ui/Img";
import { Input, Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { formatDate } from "@/lib/format";

interface Filters { rating: number | null; withPhoto: boolean; verified: boolean; page: number }

/** Review wall: AI summary card, rating-distribution sidebar (click-to-filter), filter chips, review cards, pagination, write-a-review, Q&A. */
export function ReviewWall({ ctx }: SlotComponentProps) {
  const store = useStore();
  const { getSessionId } = useSession();
  const product = ctx.product;
  const [data, setData] = useState<ReviewsResponse | null>(null);
  const [filters, setFilters] = useState<Filters>({ rating: null, withPhoto: false, verified: false, page: 1 });
  const [loading, setLoading] = useState(true);
  const [write, setWrite] = useState(false);
  const [ask, setAsk] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const handle = product?.handle;

  const load = useCallback(async (f: Filters) => {
    if (!handle) return;
    setLoading(true);
    try { setData(await api<ReviewsResponse>(store.key, `/products/${encodeURIComponent(handle)}/reviews`, { env: store.env, query: { page: f.page, rating: f.rating ?? undefined, withPhoto: f.withPhoto ? "true" : undefined, verified: f.verified ? "true" : undefined } })); }
    catch { setData(null); }
    finally { setLoading(false); }
  }, [handle, store.key, store.env]);
  useEffect(() => { void load(filters); }, [filters, load]);
  if (!product) return null;
  const stats: ReviewStats = data?.stats ?? ("reviews" in product ? product.reviews : { total: 0, average: 0, distribution: [], summary: [] });
  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch, page: patch.page ?? 1 }));
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const filtered = filters.rating !== null || filters.withPhoto || filters.verified;

  return (
    <section id="reviews" className="scroll-mt-24" aria-labelledby="reviews-title">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <p className="eyebrow text-primary mb-2">Reviews</p>
          <h2 id="reviews-title" className="section-title">What owners say</h2>
          {stats.total > 0 && <div className="flex items-center gap-2 mt-2 text-sm"><Stars rating={stats.average} /><strong>{stats.average.toFixed(1)}</strong><span className="text-muted">· {stats.total} {stats.total === 1 ? "review" : "reviews"}</span></div>}
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn btn-outline" onClick={() => setAsk(true)}>Ask a question</button>
          <button type="button" className="btn btn-primary" onClick={() => setWrite(true)}>Write a review</button>
        </div>
      </div>
      {notice && <p role="status" className="mb-6 text-sm border border-rule p-3" style={{ background: "var(--brand-bg-elevated)" }}>{notice}</p>}

      <div className="grid lg:grid-cols-12 gap-8">
        <aside className="lg:col-span-4 space-y-6">
          {stats.summary.length > 0 && (
            <div className="card p-5">
              <p className="eyebrow text-primary mb-3">◆ Summary of {stats.total} reviews</p>
              <ul className="space-y-2 text-sm">{stats.summary.map((b, i) => <li key={i} className="flex gap-2"><span className="text-primary" aria-hidden>—</span><span>{b}</span></li>)}</ul>
              <p className="text-[10px] text-muted mt-3">Generated from verified reviews.</p>
            </div>
          )}
          {stats.total > 0 && (
            <div className="card p-5">
              <p className="eyebrow mb-3">Rating breakdown</p>
              <ul className="space-y-1.5" aria-label="Filter by rating">
                {stats.distribution.map((d) => {
                  const pct = stats.total ? Math.round((d.count / stats.total) * 100) : 0;
                  const active = filters.rating === d.rating;
                  return (
                    <li key={d.rating}>
                      <button type="button" aria-pressed={active} onClick={() => set({ rating: active ? null : d.rating })} disabled={!d.count} className={`w-full flex items-center gap-3 text-xs py-1 disabled:opacity-40 ${active ? "font-semibold" : ""}`}>
                        <span className="w-8 text-left">{d.rating}★</span>
                        <span className="flex-1 h-2 bg-ink/10 overflow-hidden" style={{ borderRadius: "var(--radius-pill)" }}><span className={`block h-full ${active ? "bg-primary" : "bg-ink/60"}`} style={{ width: `${pct}%` }} /></span>
                        <span className="w-8 text-right text-muted">{d.count}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </aside>

        <div className="lg:col-span-8">
          <div className="flex flex-wrap items-center gap-2 mb-5" role="group" aria-label="Filters">
            {[5, 4, 3, 2, 1].map((r) => <button key={r} type="button" className="pill min-h-8 text-xs" aria-pressed={filters.rating === r} onClick={() => set({ rating: filters.rating === r ? null : r })}>{r} stars</button>)}
            <button type="button" className="pill min-h-8 text-xs" aria-pressed={filters.withPhoto} onClick={() => set({ withPhoto: !filters.withPhoto })}>With photo</button>
            <button type="button" className="pill min-h-8 text-xs" aria-pressed={filters.verified} onClick={() => set({ verified: !filters.verified })}>Verified only</button>
            {filtered && <button type="button" className="text-xs underline underline-offset-4 text-muted" onClick={() => set({ rating: null, withPhoto: false, verified: false })}>Clear</button>}
          </div>
          {loading && !data ? <div className="grid sm:grid-cols-2 gap-4">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-40" />)}</div>
            : !data?.items.length ? <div className="card p-8 text-center"><p className="display text-lg">{filtered ? "No reviews match those filters." : "No reviews yet."}</p><p className="text-sm text-muted mt-1">{filtered ? "Try widening the filters." : "Be the first to share how it holds up."}</p></div>
            : (
              <>
                <ul className="grid sm:grid-cols-2 gap-4" aria-busy={loading}>{data.items.map((r) => <ReviewCard key={r.id} r={r} />)}</ul>
                {pages > 1 && (
                  <nav className="flex items-center justify-center gap-2 mt-6 text-sm" aria-label="Review pages">
                    <button type="button" className="btn btn-outline min-h-9" disabled={filters.page <= 1} onClick={() => set({ page: filters.page - 1 })}>Previous</button>
                    <span className="text-muted">Page {filters.page} of {pages}</span>
                    <button type="button" className="btn btn-outline min-h-9" disabled={filters.page >= pages} onClick={() => set({ page: filters.page + 1 })}>Next</button>
                  </nav>
                )}
              </>
            )}

          <QA questions={data?.questions ?? []} onAsk={() => setAsk(true)} />
        </div>
      </div>

      <Modal open={write} onClose={() => setWrite(false)} title={`Review ${product.title}`}>
        <ReviewForm handle={product.handle} onDone={(msg) => { setWrite(false); setNotice(msg); void load(filters); }} sessionId={getSessionId()} />
      </Modal>
      <Modal open={ask} onClose={() => setAsk(false)} title="Ask a question" size="sm">
        <QuestionForm handle={product.handle} onDone={(msg) => { setAsk(false); setNotice(msg); void load(filters); }} />
      </Modal>
    </section>
  );
}

function ReviewCard({ r }: { r: Review }) {
  return (
    <li className="card p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2"><Stars rating={r.rating} size={13} /><span className="text-[11px] text-muted">{formatDate(r.createdAt)}</span></div>
      {r.title && <p className="font-medium leading-snug">{r.title}</p>}
      <p className="text-sm text-muted leading-relaxed">{r.body}</p>
      {r.media.length > 0 && <ul className="flex gap-2 flex-wrap">{r.media.slice(0, 4).map((m, i) => <li key={i} className="w-16 h-16 overflow-hidden bg-ink/5" style={{ borderRadius: "var(--radius-card)" }}><Img src={m.url} alt={m.alt || "Customer photo"} width={128} height={128} className="w-full h-full object-cover" /></li>)}</ul>}
      <p className="text-xs mt-auto flex items-center gap-2"><strong>{r.authorName}</strong>{r.verified && <span className="badge bg-primary/10 text-primary">Verified buyer</span>}</p>
      {r.reply && <div className="border-l-2 border-primary pl-3 text-xs"><p className="eyebrow text-[9.5px] text-primary mb-1">Reply from the founder</p><p className="text-muted">{r.reply}</p></div>}
    </li>
  );
}

function QA({ questions, onAsk }: { questions: Question[]; onAsk: () => void }) {
  return (
    <div className="mt-12">
      <div className="flex items-center justify-between mb-4"><h3 className="display text-xl">Questions &amp; answers</h3><button type="button" className="text-xs underline underline-offset-4" onClick={onAsk}>Ask a question</button></div>
      {!questions.length ? <p className="text-sm text-muted">No questions yet — ask anything about fit, materials or lead times.</p> : (
        <ul className="divide-y divide-rule border-t border-rule">
          {questions.map((q) => (
            <li key={q.id} className="py-4 space-y-2">
              <p className="text-sm font-medium"><span className="text-primary mr-2" aria-hidden>Q</span>{q.question}{q.askedBy && <span className="text-xs text-muted font-normal"> — {q.askedBy}</span>}</p>
              {q.answer ? <p className="text-sm text-muted pl-5"><span className="sr-only">Answer:</span>{q.answer}<span className="block text-[10px] mt-1 uppercase tracking-wider">{q.answeredBy === "ai" ? "Answered from reviews" : "Answered by the founder"}</span></p> : <p className="text-xs text-muted pl-5">Awaiting an answer.</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ReviewForm({ handle, onDone, sessionId }: { handle: string; onDone: (msg: string) => void; sessionId: string | null }) {
  const store = useStore();
  const [rating, setRating] = useState(5);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body = { authorName: String(fd.get("name") ?? "").trim(), email: String(fd.get("email") ?? "").trim() || undefined, rating, title: String(fd.get("title") ?? "").trim() || undefined, body: String(fd.get("body") ?? "").trim(), media: String(fd.get("photo") ?? "").trim() ? [{ url: String(fd.get("photo")).trim(), alt: "Customer photo", kind: "image" as const, sort: 0 }] : undefined, sessionId: sessionId ?? undefined };
    if (!body.authorName || body.body.length < 10) { setErr("Please add your name and at least a sentence or two."); return; }
    setBusy(true); setErr(null);
    try { const r = await api<{ status?: string }>(store.key, `/products/${encodeURIComponent(handle)}/reviews`, { body }); onDone(r.status === "approved" ? "Thanks — your review is live." : "Thanks — your review is in for a quick check and will appear shortly."); }
    catch (x) { setErr(errorMessage(x)); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div><span className="label">Your rating</span>
        <div className="flex gap-1" role="radiogroup" aria-label="Rating">{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? "s" : ""}`} onClick={() => setRating(n)} className={`text-2xl ${n <= rating ? "text-primary" : "text-ink/25"}`}>★</button>)}</div>
      </div>
      <div className="grid sm:grid-cols-2 gap-4"><Input id="rv-name" name="name" label="Name" required autoComplete="name" /><Input id="rv-email" name="email" type="email" label="Email (not shown)" autoComplete="email" hint="Used to mark verified purchases." /></div>
      <Input id="rv-title" name="title" label="Title" placeholder="Sums it up in a few words" />
      <Textarea id="rv-body" name="body" label="Review" required placeholder="How does it hold up? What would you tell a friend?" />
      <Input id="rv-photo" name="photo" type="url" label="Photo URL (optional)" placeholder="https://…" />
      {err && <p role="alert" className="text-xs text-red-700">{err}</p>}
      <button type="submit" className="btn btn-primary w-full" disabled={busy}>{busy ? "Sending…" : "Submit review"}</button>
    </form>
  );
}

function QuestionForm({ handle, onDone }: { handle: string; onDone: (msg: string) => void }) {
  const store = useStore();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const question = String(fd.get("question") ?? "").trim();
    if (question.length < 3) { setErr("Please write a question."); return; }
    setBusy(true); setErr(null);
    try { await api(store.key, `/products/${encodeURIComponent(handle)}/questions`, { body: { question, askedBy: String(fd.get("name") ?? "").trim() || undefined } }); onDone("Question received — we answer most within a day."); }
    catch (x) { setErr(errorMessage(x)); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Textarea id="q-body" name="question" label="Your question" required />
      <Input id="q-name" name="name" label="Name (optional)" />
      {err && <p role="alert" className="text-xs text-red-700">{err}</p>}
      <button type="submit" className="btn btn-primary w-full" disabled={busy}>{busy ? "Sending…" : "Ask"}</button>
    </form>
  );
}
