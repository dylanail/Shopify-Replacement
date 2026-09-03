"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CircleQuestionMark, LogOut, Menu as MenuIcon, X } from "lucide-react";
import { cn, areaFromPath } from "@/lib/utils";
import { ALL_AREAS, RAIL_AREAS } from "./areas";
import { ActivityDot } from "./rail";
import { useStore } from "@/lib/store-context";
import { tokens } from "@/lib/api";
import { Avatar } from "@/components/ui";
import { FeatureRequest, PublishButton, BOOK_CALL_URL } from "./topbar";

const PRIMARY = ["dashboard", "products", "orders", "analytics"];

export function MobileNav({ onHelp }: { onHelp: () => void }) {
  const pathname = usePathname();
  const active = areaFromPath(pathname);
  const [more, setMore] = useState(false);
  const { me } = useStore();
  const router = useRouter();
  const primary = RAIL_AREAS.filter((a) => PRIMARY.includes(a.key));
  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-40 flex h-[52px] items-stretch border-t border-line bg-card md:hidden">
        {primary.map((a) => {
          const Icon = a.icon;
          const isActive = active === a.key;
          return (
            <Link key={a.key} href={a.href} className={cn("relative flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px]", isActive ? "text-ink" : "text-muted")}>
              <Icon size={18} strokeWidth={isActive ? 2.2 : 1.8} />
              {a.label}
              <ActivityDot area={a.key} className="right-[calc(50%-14px)] top-1.5" />
            </Link>
          );
        })}
        <button onClick={() => setMore(true)} className={cn("flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px]", more ? "text-ink" : "text-muted")}>
          <MenuIcon size={18} />
          More
        </button>
      </nav>
      {more && (
        <div className="fixed inset-0 z-[60] bg-cream md:hidden">
          <div className="flex h-10 items-center justify-between border-b border-line bg-card px-3">
            <div className="flex items-center gap-2"><Avatar name={me.user.name} size={22} /><span className="text-xs">{me.user.email}</span></div>
            <button onClick={() => setMore(false)} className="inline-flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-sand"><X size={16} /></button>
          </div>
          <div className="scrollbar-thin h-[calc(100%-40px)] overflow-y-auto p-3 pb-16">
            <div className="mb-3 flex flex-wrap items-center gap-2"><PublishButton /><FeatureRequest /><a href={BOOK_CALL_URL} target="_blank" rel="noreferrer" className="text-[11px] text-muted">Book a call</a></div>
            <div className="grid grid-cols-3 gap-2">
              {ALL_AREAS.map((a) => {
                const Icon = a.icon;
                return (
                  <Link key={a.key} href={a.href} onClick={() => setMore(false)} className={cn("relative flex flex-col items-center gap-1.5 rounded border border-line bg-card px-2 py-3 text-[11px]", active === a.key && "border-ink")}>
                    <Icon size={18} className={a.tone === "teal" ? "text-teal" : "text-ink"} />
                    {a.label}
                    <ActivityDot area={a.key} />
                  </Link>
                );
              })}
              <button onClick={() => { setMore(false); onHelp(); }} className="flex flex-col items-center gap-1.5 rounded border border-line bg-card px-2 py-3 text-[11px]"><CircleQuestionMark size={18} /> Help</button>
              <button onClick={() => { tokens.clear(); router.replace("/login"); }} className="flex flex-col items-center gap-1.5 rounded border border-line bg-card px-2 py-3 text-[11px] text-danger"><LogOut size={18} /> Sign out</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
