import { describe, it, expect } from "vitest";
import { openDb, users, organizations, stores, eq } from "../src/index.js";

describe("db", () => {
  it("migrates and round-trips", async () => {
    const h = await openDb({ dataDir: ":memory:" });
    const [u] = await h.db.insert(users).values({ email: "a@b.co", passwordHash: "x", name: "A" }).returning();
    const [o] = await h.db.insert(organizations).values({ name: "Org", ownerUserId: u!.id }).returning();
    const [s] = await h.db.insert(stores).values({ orgId: o!.id, name: "Ironjaw", slug: "ironjaw-ab12", brand: { name: "Ironjaw" } as never }).returning();
    const found = await h.db.query.stores.findFirst({ where: eq(stores.id, s!.id) });
    expect(found?.brand.name).toBe("Ironjaw");
    expect(found?.id.startsWith("store_")).toBe(true);
    await h.close();
  });
});
