import type { Metadata } from "next";
import { LoginForm } from "@/components/account/AuthForms";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign in", robots: { index: false } };
export default function Page() {
  return (
    <div className="container-x py-16 sm:py-24 max-w-md">
      <p className="eyebrow text-primary mb-2">Account</p>
      <h1 className="display text-3xl mb-6">Welcome back</h1>
      <div className="card p-6"><LoginForm /></div>
    </div>
  );
}
