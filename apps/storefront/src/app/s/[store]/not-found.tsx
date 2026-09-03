import Link from "next/link";
import { headers } from "next/headers";
import { storePath } from "@/lib/store-path";

export default async function StoreNotFound() {
  const h = await headers();
  const key = h.get("x-kiln-store") ?? "";
  const ctx = { key, mode: h.get("x-kiln-mode") === "host" ? ("host" as const) : ("path" as const), env: h.get("x-kiln-env") === "draft" ? ("draft" as const) : ("live" as const) };
  return (
    <div className="container-x py-24 sm:py-32 text-center max-w-xl">
      <p className="eyebrow text-primary mb-3">404</p>
      <h1 className="display text-4xl">This page has moved on.</h1>
      <p className="text-muted mt-4">The link may be old, or the piece may have sold out for good. The collection is still here.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href={storePath(ctx, "/collections/all")} className="btn btn-primary">Shop all</Link>
        <Link href={storePath(ctx, "/search")} className="btn btn-outline">Search</Link>
        <Link href={storePath(ctx, "/")} className="btn btn-ghost">Home</Link>
      </div>
    </div>
  );
}
