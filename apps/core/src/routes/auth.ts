import { Hono } from "hono";
import { z } from "zod";
import { eq, users, organizations } from "@kiln/db";
import type { AppDeps } from "../context.js";
import { parseBody } from "../lib/http.js";
import { hashPassword, verifyPassword } from "../lib/crypto.js";
import { signAccessToken, issueRefreshToken, rotateRefreshToken, requireUser, type AuthVars } from "../lib/auth.js";
import { badRequest, unauthorized } from "../lib/errors.js";
import { acceptInvite } from "../services/team.js";
import { listStoresForUser } from "../services/stores.js";

export function authRoutes(deps: AppDeps) {
  const r = new Hono<{ Variables: AuthVars }>();
  const tokens = async (userId: string) => ({ accessToken: await signAccessToken(deps.env.jwtSecret, userId), refreshToken: await issueRefreshToken(deps, userId) });

  r.post("/register", async (c) => {
    const b = await parseBody(c, z.object({ email: z.string().email(), password: z.string().min(8), name: z.string().min(1).optional(), utm: z.record(z.string(), z.string()).optional(), inviteToken: z.string().optional() }));
    const existing = await deps.db.query.users.findFirst({ where: eq(users.email, b.email.toLowerCase()) });
    if (existing) throw badRequest("An account with that email already exists");
    const [u] = await deps.db.insert(users).values({ email: b.email.toLowerCase(), passwordHash: await hashPassword(b.password), name: b.name ?? b.email.split("@")[0]! }).returning();
    const [org] = await deps.db.insert(organizations).values({ name: `${u!.name}'s workspace`, ownerUserId: u!.id }).returning();
    if (b.inviteToken) await acceptInvite(deps, b.inviteToken, u!.id).catch(() => null);
    return c.json({ user: { id: u!.id, email: u!.email, name: u!.name }, org: { id: org!.id, planSlug: org!.planSlug }, ...(await tokens(u!.id)) }, 201);
  });

  r.post("/login", async (c) => {
    const b = await parseBody(c, z.object({ email: z.string().email(), password: z.string() }));
    const u = await deps.db.query.users.findFirst({ where: eq(users.email, b.email.toLowerCase()) });
    if (!u || !(await verifyPassword(b.password, u.passwordHash))) throw unauthorized("Invalid email or password");
    return c.json({ user: { id: u.id, email: u.email, name: u.name }, ...(await tokens(u.id)) });
  });

  r.post("/refresh", async (c) => {
    const b = await parseBody(c, z.object({ refreshToken: z.string() }));
    const { userId, refreshToken } = await rotateRefreshToken(deps, b.refreshToken);
    return c.json({ accessToken: await signAccessToken(deps.env.jwtSecret, userId), refreshToken });
  });

  r.post("/password-reset", async (c) => {
    const b = await parseBody(c, z.object({ email: z.string().email() }));
    const u = await deps.db.query.users.findFirst({ where: eq(users.email, b.email.toLowerCase()) });
    if (u) {
      const token = await signAccessToken(deps.env.jwtSecret, u.id);
      const { sendWithRetry } = await import("@kiln/email");
      void sendWithRetry(deps.email, { to: u.email, from: deps.env.emailFrom, subject: "Reset your Kiln password", html: `<p><a href="${deps.env.adminUrl}/reset?token=${token}">Choose a new password</a> (valid 2 hours)</p>` });
    }
    return c.json({ ok: true });
  });

  r.post("/password-reset/confirm", requireUser(deps), async (c) => {
    const b = await parseBody(c, z.object({ password: z.string().min(8) }));
    await deps.db.update(users).set({ passwordHash: await hashPassword(b.password) }).where(eq(users.id, c.get("userId")));
    return c.json({ ok: true });
  });

  r.get("/me", requireUser(deps), async (c) => {
    const u = await deps.db.query.users.findFirst({ where: eq(users.id, c.get("userId")) });
    if (!u) throw unauthorized();
    const orgs = await deps.db.select().from(organizations).where(eq(organizations.ownerUserId, u.id));
    const storesList = await listStoresForUser(deps, u.id);
    return c.json({ user: { id: u.id, email: u.email, name: u.name, totpEnabled: !!u.totpSecret }, orgs: orgs.map((o) => ({ id: o.id, name: o.name, planSlug: o.planSlug, billingInterval: o.billingInterval })), stores: storesList.map((s) => ({ id: s.id, name: s.name, slug: s.slug, status: s.status, orgId: s.orgId, brand: s.brand, onboardingStep: s.onboardingStep })) });
  });

  r.post("/invite/:token/accept", requireUser(deps), async (c) => c.json(await acceptInvite(deps, c.req.param("token"), c.get("userId"))));

  r.post("/feature-request", requireUser(deps), async (c) => {
    const b = await parseBody(c, z.object({ text: z.string().min(3), storeId: z.string().optional(), source: z.enum(["typed", "voice"]).default("typed") }));
    const { featureRequests } = await import("@kiln/db");
    const [row] = await deps.db.insert(featureRequests).values({ storeId: b.storeId ?? null, userId: c.get("userId"), text: b.text, source: b.source }).returning();
    return c.json(row, 201);
  });
  return r;
}
