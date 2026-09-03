"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CircleQuestionMark, LogOut, Settings, User } from "lucide-react";
import { useActivityDots } from "@/lib/events";
import { useStore } from "@/lib/store-context";
import { tokens } from "@/lib/api";
import { cn, areaFromPath } from "@/lib/utils";
import { RAIL_AREAS } from "./areas";
import { Avatar, Menu } from "@/components/ui";

export function ActivityDot({ area, className }: { area: string; className?: string }) {
  const dots = useActivityDots();
  const d = dots[area];
  if (!d) return null;
  const tone = d.status === "running" ? "bg-amber pulse" : d.status === "error" ? "bg-danger" : "bg-positive";
  return <span className={cn("absolute right-1 top-1 h-1.5 w-1.5 rounded-full", tone, className)} />;
}

export function Rail({ onHelp }: { onHelp: () => void }) {
  const pathname = usePathname();
  const active = areaFromPath(pathname);
  const { me } = useStore();
  const router = useRouter();
  return (
    <nav className="hidden shrink-0 flex-col items-center border-r border-line bg-card py-1.5 md:flex" style={{ width: "var(--shell-rail)" }}>
      <div className="flex flex-1 flex-col items-center gap-0.5">
        {RAIL_AREAS.map((a) => {
          const Icon = a.icon;
          const isActive = active === a.key;
          return (
            <Link key={a.key} href={a.href} data-tip={a.label} aria-label={a.label} className={cn("relative flex h-8 w-8 items-center justify-center rounded-[6px] transition-colors", isActive ? (a.tone === "teal" ? "bg-teal-soft text-teal" : "bg-ink text-white") : "text-muted hover:bg-sand hover:text-ink")}>
              <Icon size={16} strokeWidth={isActive ? 2.2 : 1.8} />
              <ActivityDot area={a.key} />
            </Link>
          );
        })}
      </div>
      <div className="flex flex-col items-center gap-0.5">
        <button onClick={onHelp} data-tip="Help" aria-label="Help" className="flex h-8 w-8 items-center justify-center rounded-[6px] text-muted hover:bg-sand hover:text-ink"><CircleQuestionMark size={16} /></button>
        <Link href="/settings" data-tip="Settings" aria-label="Settings" className={cn("relative flex h-8 w-8 items-center justify-center rounded-[6px]", active === "settings" ? "bg-ink text-white" : "text-muted hover:bg-sand hover:text-ink")}><Settings size={16} /><ActivityDot area="settings" /></Link>
        <Menu
          align="left"
          trigger={<button className="mt-1 flex h-8 w-8 items-center justify-center" aria-label="Account"><Avatar name={me.user.name} size={24} /></button>}
          items={[
            { label: me.user.email, icon: <User size={12} />, onClick: () => router.push("/settings") },
            { label: "Sign out", icon: <LogOut size={12} />, danger: true, onClick: () => { tokens.clear(); router.replace("/login"); } },
          ]}
        />
      </div>
    </nav>
  );
}
