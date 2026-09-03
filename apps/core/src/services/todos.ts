import { and, eq, asc, desc, todos, activityEvents, auditLog } from "@kiln/db";
import type { AppDeps } from "../context.js";

export async function listTodos(deps: AppDeps, storeId: string) {
  return deps.db.select().from(todos).where(eq(todos.storeId, storeId)).orderBy(asc(todos.sort));
}
export async function setTodo(deps: AppDeps, storeId: string, key: string, status: "todo" | "in_progress" | "waiting" | "done") {
  const [row] = await deps.db.update(todos).set({ status }).where(and(eq(todos.storeId, storeId), eq(todos.key, key))).returning();
  return row ?? null;
}
export async function upsertTodo(deps: AppDeps, storeId: string, t: { key: string; title: string; description?: string; href?: string; prompt?: string; status?: string; sort?: number }) {
  const [row] = await deps.db.insert(todos).values({ storeId, key: t.key, title: t.title, description: t.description ?? "", href: t.href ?? null, prompt: t.prompt ?? null, status: t.status ?? "todo", sort: t.sort ?? 99 }).onConflictDoUpdate({ target: [todos.storeId, todos.key], set: { title: t.title, description: t.description ?? "", status: t.status ?? "todo" } }).returning();
  return row!;
}

export async function recordActivity(deps: AppDeps, storeId: string, area: string, status: "running" | "done" | "error", message: string, runId?: string) {
  await deps.db.insert(activityEvents).values({ storeId, area, status, message, runId: runId ?? null });
  deps.bus.publish({ channel: "activity", storeId, event: { area, status, message, runId } });
}
export async function recentActivity(deps: AppDeps, storeId: string, limit = 40) {
  return deps.db.select().from(activityEvents).where(eq(activityEvents.storeId, storeId)).orderBy(desc(activityEvents.createdAt)).limit(limit);
}

export async function audit(deps: AppDeps, storeId: string, actorType: "user" | "ai" | "system", actorId: string | undefined, action: string, target?: string, diff?: unknown) {
  await deps.db.insert(auditLog).values({ storeId, actorType, actorId: actorId ?? null, action, target: target ?? null, diff: diff ?? null });
}
export async function auditEntries(deps: AppDeps, storeId: string, limit = 100) {
  return deps.db.select().from(auditLog).where(eq(auditLog.storeId, storeId)).orderBy(desc(auditLog.createdAt)).limit(limit);
}
