import Link from "next/link";
import { headers } from "next/headers";
import { StoreUnavailable } from "@/components/layout/StoreUnavailable";

/** Root 404: reached for unknown store keys (the store layout calls notFound()) and for paths outside any store. */
export default async function RootNotFound() {
  const h = await headers();
  const storeKey = h.get("x-kiln-store");
  if (storeKey) return <StoreUnavailable storeKey={storeKey} status={404} message="Store not found" />;
  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="max-w-md w-full text-center space-y-4">
        <p className="eyebrow text-muted">404</p>
        <h1 className="display text-3xl">Page not found</h1>
        <p className="text-sm text-muted">The page you were looking for does not exist.</p>
        <Link href="/" className="btn btn-outline">Go home</Link>
      </div>
    </main>
  );
}
