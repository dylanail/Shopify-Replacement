import { describe, it, expect } from "vitest";
import { CATALOG, FIRST_PARTY, pluginById, validateSettings, catalogCategories } from "../src/index.js";

describe("plugin catalog", () => {
  it("has unique ids and valid manifests", () => {
    const ids = new Set(CATALOG.map((p) => p.id));
    expect(ids.size).toBe(CATALOG.length);
    expect(FIRST_PARTY.length).toBeGreaterThanOrEqual(25);
    expect(CATALOG.length).toBeGreaterThan(80);
  });
  it("validates settings against schema", () => {
    const ga4 = pluginById("ga4")!;
    expect(validateSettings(ga4, { measurementId: "nope" }).ok).toBe(false);
    expect(validateSettings(ga4, { measurementId: "G-ABC1234" }).ok).toBe(true);
    expect(validateSettings(ga4, {}).errors.measurementId).toMatch(/required/);
  });
  it("exposes ai tools", () => {
    const tools = FIRST_PARTY.flatMap((p) => p.aiTools.map((t) => t.name));
    expect(tools).toContain("connect_shippo");
    expect(new Set(tools).size).toBe(tools.length);
    expect(catalogCategories()[0]!.category).toBe("Shipping & Fulfillment");
  });
});
