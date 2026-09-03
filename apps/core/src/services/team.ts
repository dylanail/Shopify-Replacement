import { and, eq, teamMembers, users, stores, organizations } from "@kiln/db";
import { planBySlug } from "@kiln/shared";
import type { AppDeps } from "../context.js";
import { badRequest, notFound } from "../lib/errors.js";
import { randomToken } from "../lib/crypto.js";

export const PERMISSIONS = ["products", "orders", "customers", "promotions", "analytics", "designer", "settings", "ai", "billing"] as const;

export async function listMembers(deps: AppDeps, storeId: string) {
  const store = await deps.db.query.stores.findFirst({ where: eq(stores.id, storeId) });
  const org = await deps.db.query.organizations.findFirst({ where: eq(organizations.id, store!.orgId) });
  const owner = await deps.db.query.users.findFirst({ where: eq(users.id, org!.ownerUserId) });
  const rows = await deps.db.select().from(teamMembers).where(eq(teamMembers.storeId, storeId));
  return [{ id: "owner", email: owner!.email, name: owner!.name, role: "owner", permissions: [...PERMISSIONS], acceptedAt: owner!.createdAt, pending: false }, ...rows.map((r) => ({ id: r.id, email: r.email, name: "", role: r.role, permissions: r.permissions, acceptedAt: r.acceptedAt, pending: !r.acceptedAt }))];
}

export async function invite(deps: AppDeps, storeId: string, email: string, role: "admin" | "member", permissions: string[] = [...PERMISSIONS]) {
  const store = await deps.db.query.stores.findFirst({ where: eq(stores.id, storeId) });
  const org = await deps.db.query.organizations.findFirst({ where: eq(organizations.id, store!.orgId) });
  const plan = planBySlug(org!.planSlug);
  const current = await deps.db.select().from(teamMembers).where(eq(teamMembers.storeId, storeId));
  if (current.length + 1 >= plan.maxTeamMembers) throw badRequest(`${plan.name} allows ${plan.maxTeamMembers} team member(s). Upgrade to invite more.`);
  const existingUser = await deps.db.query.users.findFirst({ where: eq(users.email, email.toLowerCase()) });
  const token = randomToken(16);
  const [row] = await deps.db.insert(teamMembers).values({ storeId, email: email.toLowerCase(), role, permissions: role === "admin" ? [...PERMISSIONS] : permissions, inviteToken: token, userId: existingUser?.id ?? null }).onConflictDoUpdate({ target: [teamMembers.storeId, teamMembers.email], set: { role, permissions, inviteToken: token } }).returning();
  const { sendWithRetry } = await import("@kiln/email");
  void sendWithRetry(deps.email, { to: email, from: deps.env.emailFrom, subject: `You've been invited to ${store!.name} on Kiln`, html: `<p>Accept your invite: <a href="${deps.env.adminUrl}/invite/${token}">${deps.env.adminUrl}/invite/${token}</a></p>` });
  return { ...row!, inviteUrl: `${deps.env.adminUrl}/invite/${token}` };
}

export async function acceptInvite(deps: AppDeps, token: string, userId: string) {
  const [row] = await deps.db.select().from(teamMembers).where(eq(teamMembers.inviteToken, token));
  if (!row) throw notFound("Invite");
  const [updated] = await deps.db.update(teamMembers).set({ userId, acceptedAt: new Date(), inviteToken: null }).where(eq(teamMembers.id, row.id)).returning();
  return updated!;
}
export async function updateMember(deps: AppDeps, storeId: string, id: string, patch: { role?: string; permissions?: string[] }) {
  const [row] = await deps.db.update(teamMembers).set(patch).where(and(eq(teamMembers.id, id), eq(teamMembers.storeId, storeId))).returning();
  if (!row) throw notFound("Member");
  return row;
}
export async function removeMember(deps: AppDeps, storeId: string, id: string) {
  await deps.db.delete(teamMembers).where(and(eq(teamMembers.id, id), eq(teamMembers.storeId, storeId)));
  return { deleted: true };
}
