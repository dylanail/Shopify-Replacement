/**
 * Browser smoke test: logs into the admin, walks the main pages, runs an assistant prompt, then
 * browses the storefront and adds to cart. Requires all three apps running (pnpm seed && pnpm dev)
 * and a Chromium binary (CHROME_PATH, or Playwright's default install).
 *
 *   node scripts/smoke.mjs [--admin http://localhost:3000] [--storefront http://localhost:3001] [--slug <store-slug>] [--out ./smoke]
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > -1 ? process.argv[i + 1] : d; };
const admin = arg("admin", "http://localhost:3000"), storefront = arg("storefront", "http://localhost:3001"), core = arg("core", "http://localhost:4000"), out = arg("out", "./smoke");
const email = arg("email", "franz@kiln.local"), password = arg("password", "kiln-demo");
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ["--no-sandbox"] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const problems = [];
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
page.on("response", (r) => { if (r.status() >= 500) problems.push(`HTTP ${r.status()} ${r.url()}`); });
const shot = async (name) => { await page.waitForTimeout(1500); await page.screenshot({ path: `${out}/${name}.png` }); console.log("✓", name); };

await page.goto(`${admin}/login`, { waitUntil: "domcontentloaded" });
await page.fill('input[type="email"]', email); await page.fill('input[type="password"]', password); await page.click('button[type="submit"]');
await page.waitForURL(/dashboard|onboarding/, { timeout: 30000 }); await page.waitForTimeout(2500);
await shot("admin-dashboard");
const token = await page.evaluate(() => localStorage.getItem("kiln.accessToken") ?? localStorage.getItem("kiln.token") ?? "");
let slug = arg("slug", "");
if (!slug && token) { const me = await (await fetch(`${core}/api/v1/auth/me`, { headers: { Authorization: `Bearer ${token}` } })).json(); slug = me.stores?.[0]?.slug ?? ""; }
for (const p of ["products", "orders", "analytics", "designer", "experiments", "reviews", "plugins", "seo", "geo", "emails", "settings"]) { await page.goto(`${admin}/${p}`, { waitUntil: "domcontentloaded" }); await shot(`admin-${p}`); }
await page.goto(`${admin}/ai`, { waitUntil: "domcontentloaded" });
const ta = page.locator("textarea").first(); await ta.fill("review analytics"); await ta.press("Enter"); await page.waitForTimeout(4000); await shot("admin-ai");
if (slug) {
  await page.goto(`${storefront}/s/${slug}`, { waitUntil: "domcontentloaded" }); await shot("storefront-home");
  await page.locator('a[href*="/products/"]').first().click(); await page.waitForTimeout(2500); await shot("storefront-pdp");
  await page.getByRole("button", { name: /add to cart|order your pair/i }).first().click(); await page.waitForTimeout(2500); await shot("storefront-cart");
  await page.goto(`${storefront}/s/${slug}/checkout`, { waitUntil: "domcontentloaded" }); await shot("storefront-checkout");
}
await browser.close();
console.log(problems.length ? `\n${problems.length} problem(s):\n${problems.join("\n")}` : "\nno page errors or 5xx responses");
process.exit(problems.length ? 1 : 0);
