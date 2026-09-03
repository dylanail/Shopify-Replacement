"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api, tokens, errorMessage } from "@/lib/api";
import { Button, ErrorBox, Field, Input } from "@/components/ui";
import { KilnLogo } from "@/components/shell/logo";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ accessToken: string; refreshToken: string }>("/auth/login", { method: "POST", body: { email, password }, auth: false });
      tokens.set(r.accessToken, r.refreshToken);
      const next = params.get("next");
      router.replace(next && next.startsWith("/") ? next : "/dashboard");
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="lg:hidden"><KilnLogo /></div>
      <div>
        <h1 className="font-display text-[28px]">Welcome back.</h1>
        <p className="mt-1 text-muted">Sign in to run your store.</p>
      </div>
      {err && <ErrorBox error={err} />}
      <Field label="Email"><Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></Field>
      <Field label="Password"><Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
      <Button type="submit" variant="primary" className="w-full" loading={busy}>Sign in</Button>
      <div className="flex justify-between text-xs text-muted">
        <Link href="/reset" className="hover:text-ink">Forgot password?</Link>
        <Link href="/register" className="hover:text-ink">Create an account</Link>
      </div>
    </form>
  );
}
export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
