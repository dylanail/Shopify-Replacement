import { describe, it, expect } from "vitest";
import { TEMPLATES, templateByKey, renderTemplate, sendWithRetry, type EmailTransport } from "../src/index.js";
import { Brand } from "@kiln/shared";

const brand = Brand.parse({ name: "Ironjaw & Co." });

describe("email", () => {
  it("ships 10 transactional templates that render", () => {
    expect(TEMPLATES).toHaveLength(10);
    const t = templateByKey("order_confirmation")!;
    const out = renderTemplate(t.subject, t.html, {
      brand, storeUrl: "https://ironjaw.kiln.store", orderUrl: "https://x/o/1",
      customer: { firstName: "Franz" },
      order: { number: 1042, currency: "USD", items: [{ title: "The Sparring 16oz", variantTitle: "16oz / Oxblood", quantity: 1, unitPriceCents: 34000 }], subtotalCents: 34000, discountCents: 0, shippingCents: 0, taxCents: 0, totalCents: 34000, shippingAddress: { line1: "1 Main", city: "CDMX", postalCode: "06600" } },
    });
    expect(out.subject).toBe("Order #1042 confirmed — thank you, Franz");
    expect(out.html).toContain("$340.00");
    expect(out.html).toContain("Ironjaw &amp; Co.");
  });
  it("retries transient failures", async () => {
    let calls = 0;
    const flaky: EmailTransport = { name: "console", async send() { calls++; if (calls < 3) throw new Error("boom"); return { id: "ok" }; } };
    const res = await sendWithRetry(flaky, { to: "a@b.c", from: "k@k.k", subject: "s", html: "h" }, { sleep: async () => {} });
    expect(res.ok).toBe(true);
    expect(res.attempts).toBe(3);
    const dead: EmailTransport = { name: "console", async send() { throw new Error("nope"); } };
    const fail = await sendWithRetry(dead, { to: "a@b.c", from: "k@k.k", subject: "s", html: "h" }, { sleep: async () => {} });
    expect(fail.ok).toBe(false);
    expect(fail.error).toBe("nope");
  });
});
