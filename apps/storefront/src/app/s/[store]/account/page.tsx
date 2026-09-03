import type { Metadata } from "next";
import { AccountGate, AccountDashboard } from "@/components/account/AccountDashboard";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Account", robots: { index: false } };
export default function Page() { return <AccountGate><AccountDashboard /></AccountGate>; }
