import type { ComponentType } from "react";
import { LayoutGrid, Sparkles, Paintbrush, ShoppingBag, Layers, Receipt, Users, Tag, ChartColumn, FlaskConical, Star, Search, Radar, Mail, Newspaper, Puzzle, Settings, type LucideProps } from "lucide-react";
import type { AdminArea } from "@kiln/shared";

export interface AreaDef { key: AdminArea; label: string; href: string; icon: ComponentType<LucideProps>; tone?: "teal" }

export const RAIL_AREAS: AreaDef[] = [
  { key: "dashboard", label: "Dashboard", href: "/dashboard", icon: LayoutGrid },
  { key: "ai", label: "AI", href: "/ai", icon: Sparkles },
  { key: "designer", label: "Designer", href: "/designer", icon: Paintbrush },
  { key: "products", label: "Products", href: "/products", icon: ShoppingBag },
  { key: "collections", label: "Collections", href: "/collections", icon: Layers },
  { key: "orders", label: "Orders", href: "/orders", icon: Receipt },
  { key: "customers", label: "Customers", href: "/customers", icon: Users },
  { key: "promotions", label: "Promotions", href: "/promotions", icon: Tag },
  { key: "analytics", label: "Analytics", href: "/analytics", icon: ChartColumn },
  { key: "experiments", label: "Experiments", href: "/experiments", icon: FlaskConical },
  { key: "reviews", label: "Reviews", href: "/reviews", icon: Star },
  { key: "seo", label: "SEO", href: "/seo", icon: Search, tone: "teal" },
  { key: "geo", label: "GEO", href: "/geo", icon: Radar, tone: "teal" },
  { key: "emails", label: "Emails", href: "/emails", icon: Mail },
  { key: "blog", label: "Blog", href: "/blog", icon: Newspaper },
  { key: "plugins", label: "Plugins", href: "/plugins", icon: Puzzle },
];
export const SETTINGS_AREA: AreaDef = { key: "settings", label: "Settings", href: "/settings", icon: Settings };
export const ALL_AREAS = [...RAIL_AREAS, SETTINGS_AREA];
export const areaByKey = (key: string) => ALL_AREAS.find((a) => a.key === key);
export function AreaIcon({ area, size = 12, className }: { area?: string; size?: number; className?: string }) {
  const Icon = areaByKey(area ?? "")?.icon ?? Sparkles;
  return <Icon size={size} className={className} />;
}
