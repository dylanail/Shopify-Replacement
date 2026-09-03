import { and, eq, desc, promotions, sql } from "@kiln/db";
import { z } from "zod";
import type { AppDeps } from "../context.js";
import { notFound, conflict } from "../lib/errors.js";

export const PromotionInput = z.object({
  name: z.string().min(1),
  code: z.string().min(2).max(40).optional().nullable(),
  kind: z.enum(["code", "automatic"]).optional(),
  type: z.enum(["percentage", "fixed", "free_shipping", "bogo", "bundle"]),
  value: z.number().int().nonnegative().default(0),
  minSubtotalCents: z.number().int().nonnegative().optional(),
  minQuantity: z.number().int().nonnegative().optional(),
  maxDiscountCents: z.number().int().nonnegative().nullable().optional(),
  appliesTo: z.object({ productIds: z.array(z.string()).optional(), collectionIds: z.array(z.string()).optional(), variantIds: z.array(z.string()).optional() }).optional(),
  bogo: z.object({ buyQuantity: z.number().int().positive(), getQuantity: z.number().int().positive(), getPercentOff: z.number().int().min(1).max(100) }).optional(),
  bundle: z.object({ tiers: z.array(z.object({ quantity: z.number().int().positive(), percentOff: z.number().int().min(1).max(100) })) }).optional(),
  regionIds: z.array(z.string()).optional(),
  usageLimit: z.number().int().positive().nullable().optional(),
  perCustomerLimit: z.number().int().positive().nullable().optional(),
  stackable: z.boolean().optional(),
  status: z.enum(["active", "scheduled", "expired", "disabled"]).optional(),
  startsAt: z.coerce.date().nullable().optional(),
  endsAt: z.coerce.date().nullable().optional(),
});
export type PromotionInput = z.infer<typeof PromotionInput>;

export async function createPromotion(deps: AppDeps, storeId: string, input: PromotionInput) {
  const kind = input.kind ?? (input.code ? "code" : "automatic");
  const code = kind === "code" ? (input.code ?? input.name).toUpperCase().replace(/[^A-Z0-9_-]/g, "") : null;
  if (code) {
    const [dupe] = await deps.db.select({ id: promotions.id }).from(promotions).where(and(eq(promotions.storeId, storeId), eq(promotions.code, code)));
    if (dupe) throw conflict(`Code ${code} already exists`);
  }
  if (input.type === "percentage" && input.value > 100) input.value = 100;
  const [row] = await deps.db
    .insert(promotions)
    .values({
      storeId, name: input.name, code, kind, type: input.type, value: input.value, minSubtotalCents: input.minSubtotalCents ?? 0, minQuantity: input.minQuantity ?? 0, maxDiscountCents: input.maxDiscountCents ?? null,
      appliesTo: input.appliesTo ?? {}, bogo: input.bogo ?? null, bundle: input.bundle ?? null, regionIds: input.regionIds ?? [], usageLimit: input.usageLimit ?? null, perCustomerLimit: input.perCustomerLimit ?? null,
      stackable: input.stackable ?? input.type === "free_shipping", status: input.status ?? (input.startsAt && input.startsAt > new Date() ? "scheduled" : "active"), startsAt: input.startsAt ?? null, endsAt: input.endsAt ?? null,
    })
    .returning();
  return row!;
}

export async function updatePromotion(deps: AppDeps, storeId: string, id: string, input: Partial<PromotionInput>) {
  const patch: Record<string, unknown> = { ...input };
  if (input.code !== undefined) patch.code = input.code ? input.code.toUpperCase() : null;
  const [row] = await deps.db.update(promotions).set(patch).where(and(eq(promotions.id, id), eq(promotions.storeId, storeId))).returning();
  if (!row) throw notFound("Promotion");
  return row;
}

export async function listPromotions(deps: AppDeps, storeId: string) {
  return deps.db.select().from(promotions).where(eq(promotions.storeId, storeId)).orderBy(desc(promotions.createdAt));
}

export async function activePromotions(deps: AppDeps, storeId: string) {
  return deps.db.select().from(promotions).where(and(eq(promotions.storeId, storeId), sql`${promotions.status} in ('active','scheduled')`));
}

export async function deletePromotion(deps: AppDeps, storeId: string, id: string) {
  const r = await deps.db.delete(promotions).where(and(eq(promotions.id, id), eq(promotions.storeId, storeId))).returning({ id: promotions.id });
  if (!r.length) throw notFound("Promotion");
  return { deleted: true };
}

export async function incrementUsage(deps: AppDeps, ids: string[]) {
  for (const id of ids) await deps.db.update(promotions).set({ usageCount: sql`${promotions.usageCount} + 1` }).where(eq(promotions.id, id));
}
