"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount } from "@/components/providers/AccountProvider";
import { useStore } from "@/components/providers/StoreProvider";
import { useSession } from "@/components/providers/SessionProvider";
import { errorMessage } from "@/lib/client-api";
import { Input } from "@/components/ui/Field";

export function LoginForm() {
  const { login } = useAccount();
  const store = useStore();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true); setErr(null);
    try { await login(String(fd.get("email") ?? "").trim(), String(fd.get("password") ?? "")); router.push(store.path("/account")); }
    catch (x) { setErr(errorMessage(x, "We couldn't sign you in. Check your email and password.")); setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Input id="li-email" name="email" type="email" label="Email" autoComplete="email" required />
      <Input id="li-pass" name="password" type="password" label="Password" autoComplete="current-password" required />
      {err && <p role="alert" className="text-xs text-red-700">{err}</p>}
      <button type="submit" className="btn btn-primary w-full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      <p className="text-xs text-muted text-center">New here? <Link href={store.path("/account/register")} className="underline underline-offset-4">Create an account</Link></p>
    </form>
  );
}

export function RegisterForm() {
  const { register } = useAccount();
  const store = useStore();
  const { track } = useSession();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const password = String(fd.get("password") ?? "");
    if (password.length < 8) { setErr("Use at least 8 characters for your password."); return; }
    setBusy(true); setErr(null);
    try { await register({ email: String(fd.get("email") ?? "").trim(), password, firstName: String(fd.get("firstName") ?? "").trim() || undefined, lastName: String(fd.get("lastName") ?? "").trim() || undefined }); void track("signup", { meta: { source: "account" } }); router.push(store.path("/account")); }
    catch (x) { setErr(errorMessage(x, "We couldn't create your account.")); setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="grid sm:grid-cols-2 gap-4"><Input id="rg-first" name="firstName" label="First name" autoComplete="given-name" /><Input id="rg-last" name="lastName" label="Last name" autoComplete="family-name" /></div>
      <Input id="rg-email" name="email" type="email" label="Email" autoComplete="email" required />
      <Input id="rg-pass" name="password" type="password" label="Password" autoComplete="new-password" required hint="At least 8 characters." />
      {err && <p role="alert" className="text-xs text-red-700">{err}</p>}
      <button type="submit" className="btn btn-primary w-full" disabled={busy}>{busy ? "Creating…" : "Create account"}</button>
      <p className="text-xs text-muted text-center">Already have one? <Link href={store.path("/account/login")} className="underline underline-offset-4">Sign in</Link></p>
    </form>
  );
}
