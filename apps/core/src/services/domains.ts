import { and, eq, domains } from "@kiln/db";
import { promises as dns } from "node:dns";
import type { AppDeps } from "../context.js";
import { badRequest, notFound } from "../lib/errors.js";
import { randomToken } from "../lib/crypto.js";

const HOST_RE = /^(?=.{1,253}$)(?!-)([a-z0-9-]{1,63}\.)+[a-z]{2,}$/i;

export async function listDomains(deps: AppDeps, storeId: string) {
  return deps.db.select().from(domains).where(eq(domains.storeId, storeId));
}

export async function addDomain(deps: AppDeps, storeId: string, hostname: string) {
  const h = hostname.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!HOST_RE.test(h)) throw badRequest("Enter a domain like shop.example.com");
  const [existing] = await deps.db.select().from(domains).where(eq(domains.hostname, h));
  if (existing && existing.storeId !== storeId) throw badRequest("That domain is connected to another store");
  if (existing) return existing;
  const [row] = await deps.db.insert(domains).values({ storeId, hostname: h, verificationToken: `kiln-verify=${randomToken(12)}` }).returning();
  return { ...row!, instructions: dnsInstructions(deps, row!) };
}

export function dnsInstructions(deps: AppDeps, d: { hostname: string; verificationToken: string }) {
  const apex = d.hostname.split(".").length === 2;
  const base = deps.env.storefrontBaseDomain.split(":")[0];
  return [
    { type: "TXT", name: `_kiln.${d.hostname}`, value: d.verificationToken, purpose: "Ownership verification" },
    apex ? { type: "A", name: "@", value: "76.76.21.21", purpose: "Route the apex to Kiln's edge" } : { type: "CNAME", name: d.hostname.split(".")[0], value: `edge.${base}`, purpose: "Route the subdomain to Kiln's edge" },
  ];
}

/** Verifies the TXT record (real DNS lookup). In dev, `force` skips the lookup. */
export async function verifyDomain(deps: AppDeps, storeId: string, id: string, force = false) {
  const [d] = await deps.db.select().from(domains).where(and(eq(domains.id, id), eq(domains.storeId, storeId)));
  if (!d) throw notFound("Domain");
  let ok = force && deps.env.storefrontBaseDomain.startsWith("localhost");
  if (!ok) {
    try {
      const records = await dns.resolveTxt(`_kiln.${d.hostname}`);
      ok = records.some((r) => r.join("").includes(d.verificationToken));
    } catch {
      ok = false;
    }
  }
  const [row] = await deps.db.update(domains).set({ status: ok ? "active" : "pending", sslStatus: ok ? "issued" : "pending", ...(ok ? { applePayRegistered: true } : {}) }).where(eq(domains.id, id)).returning();
  deps.bus.publish({ channel: "domain", storeId, event: { kind: ok ? "verified" : "pending", hostname: d.hostname } });
  return { ...row!, verified: ok, instructions: dnsInstructions(deps, d) };
}

export async function setPrimary(deps: AppDeps, storeId: string, id: string) {
  await deps.db.update(domains).set({ isPrimary: false }).where(eq(domains.storeId, storeId));
  const [row] = await deps.db.update(domains).set({ isPrimary: true }).where(and(eq(domains.id, id), eq(domains.storeId, storeId))).returning();
  if (!row) throw notFound("Domain");
  return row;
}
export async function removeDomain(deps: AppDeps, storeId: string, id: string) {
  await deps.db.delete(domains).where(and(eq(domains.id, id), eq(domains.storeId, storeId)));
  return { deleted: true };
}
