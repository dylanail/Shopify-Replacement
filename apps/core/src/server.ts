import { serve } from "@hono/node-server";
import { createDeps } from "./deps.js";
import { createApp } from "./app.js";
import { KILN } from "@kiln/shared";

const deps = await createDeps();
const app = createApp(deps);
serve({ fetch: app.fetch, port: deps.env.port }, (info) => {
  console.log(`\n  ${KILN.name} core · http://localhost:${info.port}\n  ai: ${deps.env.anthropicApiKey ? "anthropic" : "offline planner"} · email: ${deps.email.name} · payments: ${deps.stripe ? "stripe" : "test"} · db: ${deps.env.databaseUrl ? "postgres" : "pglite"}\n`);
});

/** Lightweight in-process scheduler for the cron jobs (use the orchestrator endpoint + a real scheduler in production). */
const jobs: [string, number][] = [["abandoned-carts", 15], ["subscriptions", 60], ["affinity", 360], ["review-requests", 60], ["geo", 720]];
for (const [job, minutes] of jobs) {
  setInterval(() => {
    void Promise.resolve(app.fetch(new Request(`http://internal/api/v1/webhooks/orchestrator/cron/${job}`, { method: "POST", headers: { "x-orchestrator-secret": deps.env.orchestratorSecret } }))).catch(() => {});
  }, minutes * 60e3).unref();
}
