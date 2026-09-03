import Link from "next/link";

export function Pagination({ page, pageSize, total, hrefFor }: { page: number; pageSize: number; total: number; hrefFor: (page: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const items = Array.from({ length: pages }, (_, i) => i + 1).filter((p) => p === 1 || p === pages || Math.abs(p - page) <= 1);
  return (
    <nav aria-label="Pagination" className="flex items-center justify-center gap-1 mt-10">
      {page > 1 && <Link href={hrefFor(page - 1)} className="btn btn-outline min-h-9 px-3" rel="prev">Previous</Link>}
      {items.map((p, i) => (
        <span key={p} className="inline-flex items-center">
          {i > 0 && items[i - 1] !== p - 1 && <span className="px-1 text-muted">…</span>}
          <Link href={hrefFor(p)} aria-current={p === page ? "page" : undefined} className={`inline-flex items-center justify-center min-w-9 min-h-9 px-2 text-sm border ${p === page ? "bg-ink text-paper border-ink" : "border-rule-strong hover:border-ink"}`} style={{ borderRadius: "var(--radius-ui)" }}>{p}</Link>
        </span>
      ))}
      {page < pages && <Link href={hrefFor(page + 1)} className="btn btn-outline min-h-9 px-3" rel="next">Next</Link>}
    </nav>
  );
}
