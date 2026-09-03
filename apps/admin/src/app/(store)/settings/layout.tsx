"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Page } from "@/components/shell/shell";

const NAV = [
  { href: "/settings", label: "General" },
  { href: "/settings/payments", label: "Payments" },
  { href: "/settings/domains", label: "Domains" },
  { href: "/settings/shipping", label: "Regions & shipping" },
  { href: "/settings/team", label: "Team" },
  { href: "/settings/billing", label: "Billing" },
  { href: "/settings/migration", label: "Migration" },
];

export default function SettingsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <Page wide>
      <div className="mb-4"><div className="eyebrow mb-1">Store</div><h1 className="font-display text-[26px] leading-tight">Settings</h1></div>
      <div className="grid gap-5 md:grid-cols-[180px_1fr]">
        <nav className="flex gap-1 overflow-x-auto md:flex-col">
          {NAV.map((n) => {
            const active = n.href === "/settings" ? pathname === "/settings" : pathname.startsWith(n.href);
            return <Link key={n.href} href={n.href} className={cn("whitespace-nowrap rounded-[5px] px-2.5 py-1.5 text-xs", active ? "bg-ink text-white" : "text-muted hover:bg-sand hover:text-ink")}>{n.label}</Link>;
          })}
        </nav>
        <div className="min-w-0">{children}</div>
      </div>
    </Page>
  );
}
