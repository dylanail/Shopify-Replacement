import { and, eq, desc, workflows, workflowRuns, orders } from "@kiln/db";
import { z } from "zod";
import type { AppDeps } from "../context.js";
import { notFound } from "../lib/errors.js";

export const WorkflowInput = z.object({
  name: z.string().min(1),
  trigger: z.enum(["order.created", "order.paid", "order.fulfilled", "customer.created", "review.created", "cart.abandoned"]),
  conditions: z.array(z.object({ field: z.string(), op: z.enum(["eq", "ne", "gt", "lt", "contains"]), value: z.unknown() })).default([]),
  actions: z.array(z.object({ type: z.enum(["tag_order", "send_email", "webhook", "notify", "append_sheet"]), params: z.record(z.string(), z.unknown()).default({}) })).min(1),
  enabled: z.boolean().default(true),
});

const get = (obj: unknown, path: string) => path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), obj);

export function conditionsMatch(conds: { field: string; op: string; value: unknown }[], payload: unknown) {
  return conds.every((c) => {
    const v = get(payload, c.field);
    switch (c.op) {
      case "eq": return v === c.value || String(v) === String(c.value);
      case "ne": return v !== c.value && String(v) !== String(c.value);
      case "gt": return Number(v) > Number(c.value);
      case "lt": return Number(v) < Number(c.value);
      case "contains": return Array.isArray(v) ? v.includes(c.value) : String(v ?? "").includes(String(c.value));
      default: return false;
    }
  });
}

export async function runWorkflowsFor(deps: AppDeps, storeId: string, trigger: string, payload: Record<string, unknown>) {
  const rows = await deps.db.select().from(workflows).where(and(eq(workflows.storeId, storeId), eq(workflows.trigger, trigger), eq(workflows.enabled, true)));
  for (const wf of rows) {
    if (!conditionsMatch(wf.conditions, payload)) continue;
    const log: string[] = [];
    let status = "ok";
    for (const a of wf.actions) {
      try {
        if (a.type === "tag_order" && payload.order) {
          const o = payload.order as { id: string; tags: string[] };
          const tag = String(a.params.tag ?? "flagged");
          await deps.db.update(orders).set({ tags: [...new Set([...(o.tags ?? []), tag])] }).where(eq(orders.id, o.id));
          log.push(`tagged order with ${tag}`);
        } else if (a.type === "send_email") {
          const { sendTemplated } = await import("./emails.js");
          const to = String(a.params.to ?? (payload.order as { email?: string } | undefined)?.email ?? "");
          if (to) {
            await sendTemplated(deps, storeId, String(a.params.templateKey ?? "welcome"), to, payload);
            log.push(`emailed ${to}`);
          }
        } else if (a.type === "webhook" && typeof a.params.url === "string") {
          const res = await fetch(a.params.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trigger, payload }) }).catch((e) => ({ ok: false, status: 0, statusText: String(e) }));
          log.push(`webhook ${a.params.url} → ${res.status}`);
        } else if (a.type === "notify") {
          deps.bus.publish({ channel: "activity", storeId, event: { area: "orders", status: "done", message: String(a.params.message ?? `Workflow ${wf.name} fired`) } });
          log.push("notified");
        } else if (a.type === "append_sheet") {
          log.push(`queued row for sheet ${String(a.params.sheetId ?? "?")} (service-account push runs in the outbox drainer)`);
        }
      } catch (err) {
        status = "error";
        log.push(`error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    await deps.db.insert(workflowRuns).values({ workflowId: wf.id, storeId, status, log });
  }
}

export async function listWorkflows(deps: AppDeps, storeId: string) {
  const rows = await deps.db.select().from(workflows).where(eq(workflows.storeId, storeId)).orderBy(desc(workflows.createdAt));
  const runs = await deps.db.select().from(workflowRuns).where(eq(workflowRuns.storeId, storeId)).orderBy(desc(workflowRuns.createdAt)).limit(100);
  return rows.map((w) => ({ ...w, runs: runs.filter((r) => r.workflowId === w.id).slice(0, 10) }));
}
export async function createWorkflow(deps: AppDeps, storeId: string, input: z.infer<typeof WorkflowInput>) {
  const [row] = await deps.db.insert(workflows).values({ storeId, ...input }).returning();
  return row!;
}
export async function updateWorkflow(deps: AppDeps, storeId: string, id: string, input: Partial<z.infer<typeof WorkflowInput>>) {
  const [row] = await deps.db.update(workflows).set(input).where(and(eq(workflows.id, id), eq(workflows.storeId, storeId))).returning();
  if (!row) throw notFound("Workflow");
  return row;
}
export async function deleteWorkflow(deps: AppDeps, storeId: string, id: string) {
  await deps.db.delete(workflows).where(and(eq(workflows.id, id), eq(workflows.storeId, storeId)));
  return { deleted: true };
}
