"use client";
import { useRouter } from "next/navigation";
import { useStore } from "@/components/providers/StoreProvider";
import { useSession } from "@/components/providers/SessionProvider";
export function SearchForm({ initial = "" }: { initial?: string }) {
  const store = useStore();
  const { track } = useSession();
  const router = useRouter();
  return (
    <form role="search" className="flex gap-2 max-w-xl" onSubmit={(e) => { e.preventDefault(); const q = String(new FormData(e.currentTarget).get("q") ?? "").trim(); void track("search", { path: "/search", meta: { q } }); router.push(store.path(`/search?q=${encodeURIComponent(q)}`)); }}>
      <label htmlFor="search-q" className="sr-only">Search products</label>
      <input id="search-q" name="q" defaultValue={initial} className="field" placeholder="Search products…" autoFocus={!initial} autoComplete="off" />
      <button type="submit" className="btn btn-primary">Search</button>
    </form>
  );
}
