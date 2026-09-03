import type { ReactNode } from "react";
import { AdminShell } from "@/components/shell/shell";

export default function StoreLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
