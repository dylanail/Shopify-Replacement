import type { Metadata } from "next";
import { AccountGate, Preferences } from "@/components/account/AccountDashboard";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Preferences", robots: { index: false } };
export default function Page() { return <AccountGate><Preferences /></AccountGate>; }
