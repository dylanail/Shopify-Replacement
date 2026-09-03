export function StoreUnavailable({ storeKey, status, message }: { storeKey: string; status: number; message: string }) {
  const notFound = status === 404;
  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="max-w-md w-full text-center space-y-4">
        <p className="eyebrow text-muted">{notFound ? "Store not found" : "Store unavailable"}</p>
        <h1 className="display text-3xl">{notFound ? "There is no store here yet." : "We'll be right back."}</h1>
        <p className="text-sm text-muted">
          {notFound ? <>No store answers to <code className="font-mono">{storeKey}</code>. Check the address or the store's custom domain settings.</> : <>The store is temporarily unreachable ({message || `error ${status}`}). Please try again in a moment.</>}
        </p>
        <a href="" className="btn btn-outline">Try again</a>
      </div>
    </main>
  );
}
