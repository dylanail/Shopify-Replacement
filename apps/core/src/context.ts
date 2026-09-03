import type { Db } from "@kiln/db";
import type { EmailTransport } from "@kiln/email";
import type { Env } from "./env.js";
import type { EventBus } from "./lib/bus.js";

export interface AppDeps {
  db: Db;
  env: Env;
  email: EmailTransport;
  bus: EventBus;
  /** Optional Stripe client (constructed when STRIPE_SECRET_KEY is present). */
  stripe?: import("stripe").default;
}
