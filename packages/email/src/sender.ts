export interface OutgoingEmail {
  to: string;
  from: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  tags?: Record<string, string>;
}

export interface SendResult {
  ok: boolean;
  providerId?: string;
  attempts: number;
  error?: string;
  provider: "resend" | "console";
}

export interface EmailTransport {
  send(email: OutgoingEmail): Promise<{ id: string }>;
  name: "resend" | "console";
}

/** Resend via its REST API — no SDK dependency, DKIM/SPF/DMARC handled by verified sending domains. */
export function resendTransport(apiKey: string, fetchImpl: typeof fetch = fetch): EmailTransport {
  return {
    name: "resend",
    async send(email) {
      const res = await fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: email.from, to: [email.to], subject: email.subject, html: email.html, text: email.text, reply_to: email.replyTo, tags: email.tags ? Object.entries(email.tags).map(([name, value]) => ({ name, value })) : undefined }),
      });
      if (!res.ok) throw new Error(`resend ${res.status}: ${await res.text()}`);
      const body = (await res.json()) as { id: string };
      return { id: body.id };
    },
  };
}

/** Dev transport: logs the email and returns a fake id. */
export function consoleTransport(log: (line: string) => void = console.log): EmailTransport {
  return {
    name: "console",
    async send(email) {
      const id = `console_${Date.now().toString(36)}`;
      log(`[kiln/email] → ${email.to} · ${email.subject} (${id})`);
      return { id };
    },
  };
}

/** Sends with up to `maxAttempts` tries and exponential backoff. */
export async function sendWithRetry(transport: EmailTransport, email: OutgoingEmail, opts: { maxAttempts?: number; baseDelayMs?: number; sleep?: (ms: number) => Promise<void> } = {}): Promise<SendResult> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  let lastError = "";
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { id } = await transport.send(email);
      return { ok: true, providerId: id, attempts: attempt, provider: transport.name };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt < maxAttempts) await sleep((opts.baseDelayMs ?? 500) * 2 ** (attempt - 1));
    }
  }
  return { ok: false, attempts: maxAttempts, error: lastError, provider: transport.name };
}

export function defaultTransport(env: NodeJS.ProcessEnv = process.env): EmailTransport {
  return env.RESEND_API_KEY ? resendTransport(env.RESEND_API_KEY) : consoleTransport();
}
