import Link from "next/link";
import type { Shell } from "@/lib/types";
import type { StoreCtx } from "@/lib/store-path";
import { storePath } from "@/lib/store-path";
import { NewsletterForm } from "@/components/sections/NewsletterForm";
import { Slot } from "@/components/slots/Slot";
import { brandLocation } from "@/lib/brand";

export function Footer({ shell, ctx }: { shell: Shell; ctx: StoreCtx }) {
  const year = new Date().getFullYear();
  const loc = brandLocation(shell.brand.description);
  const hasBlog = shell.plugins.some((p) => p.id === "blog") || true;
  return (
    <footer className="mt-20 border-t border-rule" style={{ background: "var(--brand-bg-elevated)" }}>
      <div className="container-x py-12 sm:py-16 grid gap-10 sm:grid-cols-2 lg:grid-cols-12">
        <div className="lg:col-span-4 space-y-3">
          <p className="display text-xl">{shell.brand.name}</p>
          <p className="text-sm text-muted max-w-xs">{shell.brand.description || shell.brand.slogan}</p>
          {loc && <p className="eyebrow text-[10px] text-muted">{loc}</p>}
        </div>
        <div className="lg:col-span-2">
          <p className="eyebrow mb-3">Shop</p>
          <ul className="space-y-2 text-sm">
            <li><Link href={storePath(ctx, "/collections/all")} className="hover:underline underline-offset-4">All products</Link></li>
            {shell.collections.filter((c) => c.productCount > 0).slice(0, 6).map((c) => <li key={c.id}><Link href={storePath(ctx, `/collections/${c.handle}`)} className="hover:underline underline-offset-4">{c.title}</Link></li>)}
          </ul>
        </div>
        <div className="lg:col-span-2">
          <p className="eyebrow mb-3">Help</p>
          <ul className="space-y-2 text-sm">
            <li><Link href={storePath(ctx, "/pages/shipping")} className="hover:underline underline-offset-4">Shipping &amp; returns</Link></li>
            <li><Link href={storePath(ctx, "/pages/contact")} className="hover:underline underline-offset-4">Contact us</Link></li>
            <li><Link href={storePath(ctx, "/account")} className="hover:underline underline-offset-4">My account</Link></li>
            <li><Link href={storePath(ctx, "/search")} className="hover:underline underline-offset-4">Search</Link></li>
          </ul>
        </div>
        <div className="lg:col-span-4">
          <p className="eyebrow mb-3">Newsletter</p>
          <p className="text-sm text-muted mb-3">New pieces, workshop notes and early access. No noise.</p>
          <NewsletterForm compact />
          {hasBlog && <p className="mt-4 text-sm"><Link href={storePath(ctx, "/blog")} className="hover:underline underline-offset-4">Read the journal →</Link></p>}
        </div>
      </div>
      <Slot name="footerEnd" ctx={{}} />
      <div className="border-t border-rule">
        <div className="container-x py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted">
          <p>© {year} {shell.brand.name}. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <Link href={storePath(ctx, "/pages/shipping")} className="hover:underline">Shipping policy</Link>
            <Link href={storePath(ctx, "/pages/contact")} className="hover:underline">Support</Link>
            <span>Powered by Kiln</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
