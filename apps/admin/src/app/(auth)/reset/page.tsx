"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api, errorMessage, tokens } from "@/lib/api";
import { Button, ErrorBox, Field, Input, Note } from "@/components/ui";

function ResetForm() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const request = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api("/auth/password-reset", { method: "POST", body: { email }, auth: false });
      setSent(true);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const confirm = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api("/auth/password-reset/confirm", { method: "POST", body: { password }, auth: false, headers: { Authorization: `Bearer ${token}` } });
      tokens.set(token!);
      router.replace("/dashboard");
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (token) {
    return (
      <form onSubmit={confirm} className="space-y-4">
        <h1 className="font-display text-[28px]">Choose a new password.</h1>
        {err && <ErrorBox error={err} />}
        <Field label="New password"><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required autoFocus /></Field>
        <Button type="submit" variant="primary" className="w-full" loading={busy}>Save password</Button>
      </form>
    );
  }
  return (
    <form onSubmit={request} className="space-y-4">
      <div>
        <h1 className="font-display text-[28px]">Reset your password.</h1>
        <p className="mt-1 text-muted">We'll email you a link valid for two hours.</p>
      </div>
      {err && <ErrorBox error={err} />}
      {sent ? <Note tone="success">If an account exists for {email}, a reset link is on its way.</Note> : (
        <>
          <Field label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></Field>
          <Button type="submit" variant="primary" className="w-full" loading={busy}>Send reset link</Button>
        </>
      )}
      <div className="text-center text-xs text-muted"><Link href="/login" className="hover:text-ink">Back to sign in</Link></div>
    </form>
  );
}
export default function ResetPage() {
  return <Suspense><ResetForm /></Suspense>;
}
