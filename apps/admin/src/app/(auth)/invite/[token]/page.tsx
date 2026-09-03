"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api, errorMessage, tokens, STORE_KEY } from "@/lib/api";
import { Button, ErrorBox, Spinner } from "@/components/ui";

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [state, setState] = useState<"checking" | "anon" | "accepting" | "error">("checking");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!tokens.access()) {
      setState("anon");
      return;
    }
    setState("accepting");
    api<{ storeId: string }>(`/auth/invite/${token}/accept`, { method: "POST" })
      .then((r) => {
        if (r?.storeId) localStorage.setItem(STORE_KEY, r.storeId);
        router.replace("/dashboard");
      })
      .catch((e) => {
        setErr(errorMessage(e));
        setState("error");
      });
  }, [token, router]);

  if (state === "checking" || state === "accepting") return <div className="flex items-center gap-2 text-muted"><Spinner /> Accepting your invite…</div>;
  if (state === "error") return <div className="space-y-3"><h1 className="font-display text-[24px]">Invite not accepted</h1><ErrorBox error={err} /><Link href="/dashboard" className="text-xs underline">Go to dashboard</Link></div>;
  return (
    <div className="space-y-4">
      <h1 className="font-display text-[28px]">You've been invited.</h1>
      <p className="text-muted">Sign in or create an account with the email the invite was sent to, and we'll add you to the store.</p>
      <div className="flex gap-2">
        <Link href={`/register?invite=${token}`}><Button variant="primary">Create account</Button></Link>
        <Link href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}><Button>Sign in</Button></Link>
      </div>
    </div>
  );
}
