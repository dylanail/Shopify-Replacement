import type { Metadata } from "next";
import { RegisterForm } from "@/components/account/AuthForms";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Create account", robots: { index: false } };
export default function Page() {
  return (
    <div className="container-x py-16 sm:py-24 max-w-md">
      <p className="eyebrow text-primary mb-2">Account</p>
      <h1 className="display text-3xl mb-2">Create your account</h1>
      <p className="text-sm text-muted mb-6">Track orders, manage subscriptions and check out faster.</p>
      <div className="card p-6"><RegisterForm /></div>
    </div>
  );
}
