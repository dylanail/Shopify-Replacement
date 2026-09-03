import { BASE_DOMAIN } from "@/lib/config";

export const dynamic = "force-dynamic";

/** Reached only on the bare base domain (no store in the host and no /s/<slug> prefix). */
export default function BaseDomainPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="max-w-md w-full card p-8 space-y-4 text-center">
        <p className="eyebrow text-muted">Kiln storefront</p>
        <h1 className="display text-3xl">No store selected</h1>
        <p className="text-sm text-muted">Open a store as <code className="font-mono">/s/&lt;slug&gt;</code> on this host, or visit <code className="font-mono">&lt;slug&gt;.{BASE_DOMAIN}</code> / a connected custom domain.</p>
      </div>
    </main>
  );
}
