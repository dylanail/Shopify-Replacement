export function DraftBar({ version }: { version: number }) {
  return (
    <div className="bg-amber-100 text-amber-900 text-center text-xs px-4 py-1.5 border-b border-amber-300 flex items-center justify-center gap-2" role="status">
      <span className="inline-block w-2 h-2 rounded-full bg-amber-500" aria-hidden />
      <span className="font-semibold">Draft preview</span>
      <span className="opacity-80">— theme v{version}. Nothing here is visible to customers until you publish.</span>
    </div>
  );
}
