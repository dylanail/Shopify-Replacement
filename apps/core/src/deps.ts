import { openDb } from "@kiln/db";
import { defaultTransport } from "@kiln/email";
import { loadEnv, type Env } from "./env.js";
import { EventBus } from "./lib/bus.js";
import type { AppDeps } from "./context.js";

export async function createDeps(overrides: Partial<Env> & { dataDir?: string } = {}): Promise<AppDeps & { close: () => Promise<void> }> {
  const env = { ...loadEnv(), ...overrides };
  const handle = await openDb({ url: env.databaseUrl, dataDir: env.dataDir });
  let stripe: AppDeps["stripe"];
  if (env.stripeSecretKey) {
    const Stripe = (await import("stripe")).default;
    stripe = new Stripe(env.stripeSecretKey);
  }
  return { db: handle.db, env, email: defaultTransport({ RESEND_API_KEY: env.resendApiKey } as NodeJS.ProcessEnv), bus: new EventBus(), stripe, close: handle.close };
}
