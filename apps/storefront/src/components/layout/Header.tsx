"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/components/providers/StoreProvider";
import { useCart } from "@/components/providers/CartProvider";
import { useAccount } from "@/components/providers/AccountProvider";
import { Img } from "@/components/ui/Img";

export function Header({ tagline }: { tagline: string }) {
  const store = useStore();
  const { itemCount, openDrawer } = useCart();
  const { customer } = useAccount();
  const [menu, setMenu] = useState(false);
  const router = useRouter();
  const t = store.template;
  const nav = [...store.collections.filter((c) => c.productCount > 0).slice(0, 6).map((c) => ({ label: c.title, href: store.path(`/collections/${c.handle}`) })), { label: "Journal", href: store.path("/blog") }, { label: "Contact", href: store.path("/pages/contact") }];
  useEffect(() => { if (!menu) return; const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false); document.addEventListener("keydown", onKey); return () => document.removeEventListener("keydown", onKey); }, [menu]);

  const Logo = (
    <Link href={store.path("/")} className="flex items-center gap-3 min-w-0" aria-label={`${store.brand.name} home`}>
      {store.brand.logoUrl && <Img src={store.brand.logoUrl} alt="" width={44} height={44} eager className="h-9 w-9 sm:h-11 sm:w-11 object-contain shrink-0" />}
      <span className="min-w-0">
        <span className={`display block truncate ${t === "bazaar" ? "text-xl font-bold" : t === "studio" ? "text-lg tracking-tight" : "text-lg sm:text-xl uppercase tracking-[.12em]"}`}>{store.brand.wordmark || store.brand.name}</span>
        {tagline && t !== "bazaar" && <span className="hidden sm:block eyebrow text-[9.5px] text-muted mt-0.5 truncate">{tagline}</span>}
      </span>
    </Link>
  );
  const Icons = (
    <div className="flex items-center gap-1 sm:gap-2">
      <RegionSwitcher />
      {t !== "bazaar" && <SearchButton />}
      <Link href={store.path("/account")} className="btn btn-ghost px-2" aria-label={customer ? `Account (${customer.firstName || customer.email})` : "Account"}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" /></svg>
      </Link>
      <button type="button" onClick={openDrawer} className="btn btn-ghost px-2 relative" aria-label={`Cart, ${itemCount} ${itemCount === 1 ? "item" : "items"}`}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><path d="M6 8h12l-1 12H7L6 8z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></svg>
        {itemCount > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-contrast text-[10px] font-bold flex items-center justify-center" aria-hidden>{itemCount}</span>}
      </button>
      <button type="button" className="btn btn-ghost px-2 lg:hidden" aria-label="Open menu" aria-expanded={menu} onClick={() => setMenu(true)}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><path d="M4 7h16M4 12h16M4 17h16" /></svg>
      </button>
    </div>
  );

  return (
    <header className="header-wrap sticky top-0 z-30" style={{ background: "color-mix(in srgb, var(--brand-bg) 92%, transparent)", backdropFilter: "blur(8px)" }}>
      {t === "bazaar" ? (
        <div className="container-x">
          <div className="flex items-center justify-between gap-4 py-3">
            {Logo}
            <form className="hidden md:flex flex-1 max-w-xl" role="search" onSubmit={(e) => { e.preventDefault(); const q = new FormData(e.currentTarget).get("q"); router.push(store.path(`/search?q=${encodeURIComponent(String(q ?? ""))}`)); }}>
              <label htmlFor="hdr-search" className="sr-only">Search products</label>
              <input id="hdr-search" name="q" className="field rounded-r-none" placeholder="Search products…" />
              <button className="btn btn-primary rounded-l-none" type="submit">Search</button>
            </form>
            {Icons}
          </div>
          <nav aria-label="Primary" className="hidden lg:flex gap-6 pb-2 overflow-x-auto">{nav.map((n) => <Link key={n.href} href={n.href} className="nav-link whitespace-nowrap hover:text-primary">{n.label}</Link>)}</nav>
        </div>
      ) : (
        <div className="container-x flex items-center justify-between gap-6 py-3 sm:py-4">
          {Logo}
          <nav aria-label="Primary" className="hidden lg:flex items-center gap-7">{nav.map((n) => <Link key={n.href} href={n.href} className="nav-link hover:text-primary transition-colors">{n.label}</Link>)}</nav>
          {Icons}
        </div>
      )}
      {menu && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMenu(false)} aria-hidden />
          <div className="absolute inset-y-0 left-0 w-[85%] max-w-sm bg-paper p-6 flex flex-col gap-2 overflow-y-auto" style={{ background: "var(--brand-bg)" }}>
            <div className="flex items-center justify-between mb-4"><span className="display text-lg">{store.brand.name}</span><button className="btn btn-ghost px-2" onClick={() => setMenu(false)} aria-label="Close menu">✕</button></div>
            <form role="search" className="mb-4 flex" onSubmit={(e) => { e.preventDefault(); const q = new FormData(e.currentTarget).get("q"); setMenu(false); router.push(store.path(`/search?q=${encodeURIComponent(String(q ?? ""))}`)); }}>
              <label htmlFor="m-search" className="sr-only">Search</label><input id="m-search" name="q" className="field" placeholder="Search…" />
            </form>
            {nav.map((n) => <Link key={n.href} href={n.href} onClick={() => setMenu(false)} className="nav-link py-3 border-b border-rule">{n.label}</Link>)}
            <Link href={store.path("/account")} onClick={() => setMenu(false)} className="nav-link py-3 border-b border-rule">Account</Link>
            <Link href={store.path("/pages/shipping")} onClick={() => setMenu(false)} className="nav-link py-3 border-b border-rule">Shipping &amp; returns</Link>
          </div>
        </div>
      )}
    </header>
  );
}

function SearchButton() {
  const store = useStore();
  return (
    <Link href={store.path("/search")} className="btn btn-ghost px-2" aria-label="Search">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg>
    </Link>
  );
}

export function RegionSwitcher() {
  const store = useStore();
  const { cart, setRegion } = useCart();
  if (store.regions.length < 2) return null;
  const current = cart?.regionId ?? store.region?.id ?? store.regions[0]?.id ?? "";
  return (
    <label className="hidden sm:flex items-center gap-1 text-xs">
      <span className="sr-only">Region and currency</span>
      <select className="bg-transparent border border-rule-strong px-2 h-9 text-xs" style={{ borderRadius: "var(--radius-ui)" }} value={current} onChange={(e) => void setRegion(e.target.value)}>
        {store.regions.map((r) => <option key={r.id} value={r.id}>{(r.name ?? r.countries[0] ?? r.id).slice(0, 18)} · {r.currency}</option>)}
      </select>
    </label>
  );
}
