import type { ReactNode } from "react";
import { KilnMark } from "@/components/shell/logo";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <aside className="hidden flex-col justify-between bg-ink p-10 text-cream lg:flex">
        <div className="flex items-center gap-2">
          <KilnMark size={22} />
          <span className="font-display text-lg font-semibold">Kiln</span>
        </div>
        <div>
          <p className="eyebrow !text-faint">The AI-native shop system</p>
          <h2 className="font-display mt-3 max-w-md text-[44px] leading-[1.05] font-normal">
            Say what you sell. <em className="italic text-accent">Kiln</em> fires the store.
          </h2>
          <p className="mt-5 max-w-md text-[14px] leading-relaxed text-cream/70">One sentence becomes a named brand, a brand kit, three products with copy and imagery, promotions and a live storefront — then an assistant that runs the store with you.</p>
        </div>
        <div className="text-[11px] text-cream/40">© {new Date().getFullYear()} Kiln</div>
      </aside>
      <main className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
