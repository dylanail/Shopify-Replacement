import { SignJWT, jwtVerify } from "jose";
import type { Context, MiddlewareHandler } from "hono";
import { and, eq, or, stores, teamMembers, organizations, refreshTokens } from "@kiln/db";
import type { AppDeps } from "../context.js";
import { unauthorized, forbidden, notFound } from "./errors.js";
import { randomToken, sha256 } from "./crypto.js";

const ACCESS_TTL = "2h";
const REFRESH_DAYS = 30;

export async function signAccessToken(secret: string, userId: string) {
  return new SignJWT({ sub: userId, typ: "access" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(ACCESS_TTL).sign(new TextEncoder().encode(secret));
}

export async function verifyAccessToken(secret: string, token: string) {
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    if (payload.typ !== "access" || typeof payload.sub !== "string") return null;
    return payload.sub;
  } catch {
    return null;
  }
}

export async function issueRefreshToken(deps: AppDeps, userId: string) {
  const token = randomToken(32);
  await deps.db.insert(refreshTokens).values({ userId, tokenHash: sha256(token), expiresAt: new Date(Date.now() + REFRESH_DAYS * 864e5) });
  return token;
}

export async function rotateRefreshToken(deps: AppDeps, token: string) {
  const [row] = await deps.db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, sha256(token)));
  if (!row || row.expiresAt < new Date()) throw unauthorized("Refresh token invalid");
  await deps.db.delete(refreshTokens).where(eq(refreshTokens.id, row.id));
  return { userId: row.userId, refreshToken: await issueRefreshToken(deps, row.userId) };
}

export type AuthVars = { userId: string; storeId: string; role: string };

export const requireUser = (deps: AppDeps): MiddlewareHandler<{ Variables: AuthVars }> => async (c, next) => {
  const header = c.req.header("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : c.req.query("token");
  const userId = token ? await verifyAccessToken(deps.env.jwtSecret, token) : null;
  if (!userId) throw unauthorized();
  c.set("userId", userId);
  await next();
};

/** Resolves :storeId and verifies the user owns the org or is an accepted team member. */
export const requireStore = (deps: AppDeps): MiddlewareHandler<{ Variables: AuthVars }> => async (c, next) => {
  const storeId = c.req.param("storeId");
  if (!storeId) throw notFound("Store");
  const access = await storeAccess(deps, storeId, c.get("userId"));
  if (!access) throw forbidden("No access to this store");
  c.set("storeId", storeId);
  c.set("role", access.role);
  await next();
};

export async function storeAccess(deps: AppDeps, storeId: string, userId: string) {
  const [row] = await deps.db
    .select({ storeId: stores.id, ownerId: organizations.ownerUserId })
    .from(stores)
    .innerJoin(organizations, eq(stores.orgId, organizations.id))
    .where(eq(stores.id, storeId));
  if (!row) return null;
  if (row.ownerId === userId) return { role: "owner" };
  const [tm] = await deps.db.select().from(teamMembers).where(and(eq(teamMembers.storeId, storeId), eq(teamMembers.userId, userId)));
  if (tm && tm.acceptedAt) return { role: tm.role };
  return null;
}

export const requireOrchestrator = (deps: AppDeps): MiddlewareHandler => async (c, next) => {
  if (c.req.header("x-orchestrator-secret") !== deps.env.orchestratorSecret) throw unauthorized("Bad orchestrator secret");
  await next();
};

export function bearer(c: Context) {
  const h = c.req.header("authorization") ?? "";
  return h.startsWith("Bearer ") ? h.slice(7) : null;
}
export { or };
