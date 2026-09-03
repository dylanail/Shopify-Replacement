import type { ReactNode } from "react";
/** Native <details> accordion — accessible without JS. */
export function AccordionItem({ title, children, open }: { title: string; children: ReactNode; open?: boolean }) {
  return (
    <details className="group border-b border-rule py-1" open={open}>
      <summary className="flex items-center justify-between gap-4 cursor-pointer list-none py-3 font-medium [&::-webkit-details-marker]:hidden">
        <span>{title}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="shrink-0 transition-transform group-open:rotate-45" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
      </summary>
      <div className="pb-4 text-sm text-muted prose">{children}</div>
    </details>
  );
}
