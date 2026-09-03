import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serveStatic } from "@hono/node-server/serve-static";
import { KILN } from "@kiln/shared";
import type { AppDeps } from "./context.js";
import { HttpError } from "./lib/errors.js";
import { authRoutes } from "./routes/auth.js";
import { storeRoutes } from "./routes/stores.js";
import { catalogRoutes } from "./routes/catalog.js";
import { commerceRoutes } from "./routes/commerce.js";
import { growthRoutes } from "./routes/growth.js";
import { settingsRoutes } from "./routes/settings.js";
import { aiRoutes } from "./routes/ai.js";
import { publicRoutes } from "./routes/public.js";
import { webhookRoutes } from "./routes/webhooks.js";

export function createApp(deps: AppDeps, opts: { quiet?: boolean } = {}) {
  const app = new Hono();
  if (!opts.quiet) app.use("*", logger((line) => console.log(line.replace(/([?&]token=)[^&\s]+/g, "$1[redacted]"))));
  app.use("*", cors({ origin: (o) => o ?? "*", allowHeaders: ["Authorization", "Content-Type", "X-Orchestrator-Secret", "X-Kiln-Token"], exposeHeaders: ["Content-Type"] }));
  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: err.message, details: err.details ?? null }, err.status as 400);
    console.error(err);
    return c.json({ error: err.message || "Internal error" }, 500);
  });
  app.get("/", (c) => c.json({ name: KILN.name, tagline: KILN.tagline, version: KILN.version, docs: "/api/v1" }));
  app.get("/health", (c) => c.json({ ok: true, ai: deps.env.anthropicApiKey ? "anthropic" : "offline", email: deps.email.name, payments: deps.stripe ? "stripe" : "test" }));
  app.use("/uploads/*", serveStatic({ root: deps.env.dataDir ?? ".data" }));

  const api = new Hono();
  api.get("/", (c) => c.json({ routes: ["/auth", "/stores", "/stores/:storeId/{products,collections,orders,customers,promotions,regions,shipping-options,subscriptions,merch}", "/stores/:storeId/{analytics,reviews,emails,blogs,articles,seo,geo,experiments,workflows}", "/stores/:storeId/{plugins,domains,team,billing,payments}", "/stores/:storeId/ai/{runs,sessions,tools,prompts,models}", "/public/stores/:slug/*", "/webhooks/*"] }));
  api.route("/auth", authRoutes(deps));
  // Order matters: the literal /stores routes (/onboard, /templates) must win over the :storeId mounts.
  api.route("/stores", storeRoutes(deps));
  api.route("/stores/:storeId/ai", aiRoutes(deps));
  api.route("/stores/:storeId", catalogRoutes(deps));
  api.route("/stores/:storeId", commerceRoutes(deps));
  api.route("/stores/:storeId", growthRoutes(deps));
  api.route("/stores/:storeId", settingsRoutes(deps));
  api.route("/public", publicRoutes(deps));
  api.route("/webhooks", webhookRoutes(deps));
  app.route("/api/v1", api);
  return app;
}
