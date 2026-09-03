import Link from "next/link";
import type { Article } from "@/lib/types";
import type { StoreCtx } from "@/lib/store-path";
import { storePath } from "@/lib/store-path";
import { Img } from "@/components/ui/Img";
import { formatDate, stripHtml } from "@/lib/format";

export function ArticleCard({ a, ctx, featured = false }: { a: Article; ctx: StoreCtx; featured?: boolean }) {
  const href = storePath(ctx, `/blog/${a.handle}`);
  return (
    <article className={featured ? "grid md:grid-cols-2 gap-8 items-center" : "flex flex-col gap-3"}>
      <Link href={href} className="block overflow-hidden bg-ink/5" style={{ borderRadius: "var(--radius-card)" }} aria-hidden tabIndex={-1}>
        <Img src={a.featuredImage} alt="" width={1200} height={800} eager={featured} className={`w-full object-cover ${featured ? "aspect-[4/3]" : "aspect-[3/2]"}`} />
      </Link>
      <div>
        <p className="eyebrow text-[10px] text-muted mb-2">{formatDate(a.publishedAt)}{a.tags[0] ? ` · ${a.tags[0]}` : ""}</p>
        <h2 className={`display ${featured ? "text-3xl" : "text-xl"}`}><Link href={href} className="hover:underline underline-offset-4">{a.title}</Link></h2>
        <p className="text-sm text-muted mt-2 line-clamp-3">{a.excerpt || stripHtml(a.body).slice(0, 180)}</p>
        <Link href={href} className="inline-block mt-3 text-xs eyebrow hover:text-primary">Read →</Link>
      </div>
    </article>
  );
}
