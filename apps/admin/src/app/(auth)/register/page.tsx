"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api, tokens, errorMessage } from "@/lib/api";
import { Button, ErrorBox, Field, Input } from "@/components/ui";
import { KilnLogo } from "@/components/shell/logo";

function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inviteToken = params.get("invite") ?? undefined;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const utm: Record<string, string> = {};
      params.forEach((v, k) => { if (k.startsWith("utm_")) utm[k] = v; });
      const r = await api<{ accessToken: string; refreshToken: string }>("/auth/register", { method: "POST", body: { email, password, name, inviteToken, utm: Object.keys(utm).length ? utm : undefined }, auth: false });
      tokens.set(r.accessToken, r.refreshToken);
      router.replace(inviteToken ? "/dashboard" : "/onboarding");
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
        <h1 className="font-display text-[28px]">Start with a sentence.</h1>
        <p className="mt-1 text-muted">Create your account — your store is one prompt away.</p>
      </div>
      {err && <ErrorBox error={err} />}
      <Field label="Your name"><Input value={name} onChange={(e) => setName(e.target.value)} required autoFocus autoComplete="name" /></Field>
      <Field label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></Field>
      <Field label="Password" hint="At least 8 characters."><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" /></Field>
      <Button type="submit" variant="primary" className="w-full" loading={busy}>Create account</Button>
      <div className="text-center text-xs text-muted">
        Already have an account? <Link href="/login" className="text-ink underline-offset-2 hover:underline">Sign in</Link>
      </div>
    </form>
  );
}
export default function RegisterPage() {
  return <Suspense><RegisterForm /></Suspense>;
}
