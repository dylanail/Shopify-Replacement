import { tool } from "./define.js";
import { z } from "zod";
import { ThemeSection, THEME_TEMPLATES, STOREFRONT_SLOTS } from "@kiln/shared";
import type { AppDeps } from "../../context.js";
import { getEnvironment, updateDraftTheme, upsertSection, removeSection, reorderSections, buildEnvironment, publish, applyTemplate, lintTheme } from "../../services/theme.js";
import { getStore, updateStore, storefrontUrl } from "../../services/stores.js";
import { renderLogo, renderHero, artUrl } from "../images.js";
import { recordActivity, setTodo } from "../../services/todos.js";
import { generateSlogan } from "../generators.js";

const d = (ctx: { deps: AppDeps }) => ctx.deps;

export const storefrontTools = [
  tool({
    name: "read_theme", area: "designer", description: "Read the draft theme: template, sections (with settings), brand tokens, slots, custom CSS and theme files.",
    input: z.object({ environment: z.enum(["draft", "live"]).default("draft") }),
    handler: async (input, ctx) => {
      const env = await getEnvironment(d(ctx), ctx.storeId, input.environment);
      return { version: env.version, buildStatus: env.buildStatus, theme: env.theme, lint: lintTheme(env.theme), previewUrl: `${storefrontUrl(d(ctx), await getStore(d(ctx), ctx.storeId))}?env=${input.environment}` };
    },
  }),
  tool({
    name: "update_theme_section", area: "designer",
    description: "Update (or create) a homepage section by id or type. Types: hero, featured-products, collection-grid, rich-text, image-with-text, testimonials, newsletter, trust-strip, faq, custom-html. Pass settings to merge (e.g. {headline, subheadline, ctaLabel, imageUrl, title, body, items}).",
    input: z.object({ sectionId: z.string().optional(), sectionType: ThemeSection.shape.type, settings: z.record(z.string(), z.unknown()).default({}), hidden: z.boolean().optional(), position: z.number().int().optional() }),
    handler: async (input, ctx) => {
      const settings = { ...input.settings };
      if (settings.refresh) {
        const store = await getStore(d(ctx), ctx.storeId);
        delete settings.refresh;
        settings.headline = settings.headline ?? generateSlogan(store.prompt || store.name, store.brand.name);
        settings.imageUrl = settings.imageUrl ?? artUrl(d(ctx).env, { t: store.brand.name, p: "lifestyle", c: store.brand.primaryColor, a: store.brand.secondaryColor, s: `hero-${Date.now()}` });
      }
      const env = await upsertSection(d(ctx), ctx.storeId, { id: input.sectionId, type: input.sectionType, settings, hidden: input.hidden }, input.position);
      const build = await buildEnvironment(d(ctx), ctx.storeId, "draft", { fast: true });
      return { sections: env.theme.sections.map((s) => ({ id: s.id, type: s.type, hidden: s.hidden })), build: { ok: build.ok, problems: build.problems }, adminUrl: "/designer" };
    },
  }),
  tool({ name: "remove_theme_section", area: "designer", description: "Remove a section from the draft by id.", input: z.object({ sectionId: z.string() }), handler: async (input, ctx) => ({ sections: (await removeSection(d(ctx), ctx.storeId, input.sectionId)).theme.sections.map((s) => s.id) }) }),
  tool({ name: "reorder_theme_sections", area: "designer", description: "Reorder sections by listing ids in the desired order.", input: z.object({ sectionIds: z.array(z.string()) }), handler: async (input, ctx) => ({ sections: (await reorderSections(d(ctx), ctx.storeId, input.sectionIds)).theme.sections.map((s) => s.id) }) }),
  tool({
    name: "update_brand", area: "designer", description: "Update brand tokens: colours (hex), fonts, slogan, description, tone, announcement bar. Applies to the store and the draft theme.",
    input: z.object({ name: z.string().optional(), slogan: z.string().optional(), description: z.string().optional(), primaryColor: z.string().optional(), secondaryColor: z.string().optional(), backgroundColor: z.string().optional(), textColor: z.string().optional(), displayFont: z.string().optional(), bodyFont: z.string().optional(), tone: z.string().optional(), announcement: z.string().optional() }),
    handler: async (input, ctx) => {
      const store = await updateStore(d(ctx), ctx.storeId, { brand: input, ...(input.name ? { name: input.name } : {}) });
      await updateDraftTheme(d(ctx), ctx.storeId, { brand: store.brand }, "ai");
      await recordActivity(d(ctx), ctx.storeId, "designer", "done", "Brand updated", ctx.runId);
      await setTodo(d(ctx), ctx.storeId, "brand", "done");
      return { brand: store.brand };
    },
  }),
  tool({
    name: "generate_logo", area: "designer", credits: 4, description: "Generate a wordmark/monogram logo and hero art from the brand palette and apply them to the theme.",
    input: z.object({ style: z.enum(["monogram", "wordmark"]).default("monogram") }),
    handler: async (_input, ctx) => {
      const store = await getStore(d(ctx), ctx.storeId);
      const b = store.brand;
      const logoUrl = `${d(ctx).env.publicCoreUrl}/api/v1/public/stores/${store.slug}/logo.svg?v=${Date.now()}`;
      const heroImageUrl = `${d(ctx).env.publicCoreUrl}/api/v1/public/stores/${store.slug}/hero.svg?v=${Date.now()}`;
      void renderLogo; void renderHero;
      const updated = await updateStore(d(ctx), ctx.storeId, { brand: { logoUrl, heroImageUrl } });
      await updateDraftTheme(d(ctx), ctx.storeId, { brand: updated.brand }, "ai");
      await upsertSection(d(ctx), ctx.storeId, { type: "hero", settings: { imageUrl: heroImageUrl } });
      return { logoUrl, heroImageUrl };
    },
  }),
  tool({
    name: "write_theme_file", area: "designer", description: "Write a theme source file (e.g. 'sections/custom.tsx' or 'styles/custom.css') or the customCss. Files are linted in the sandbox on build.",
    input: z.object({ path: z.string().optional(), content: z.string(), customCss: z.boolean().default(false) }),
    handler: async (input, ctx) => {
      const env = input.customCss ? await updateDraftTheme(d(ctx), ctx.storeId, { customCss: input.content }, "ai") : await updateDraftTheme(d(ctx), ctx.storeId, { files: { [input.path ?? "custom.tsx"]: input.content } }, "ai");
      const lint = lintTheme(env.theme);
      return { ok: lint.ok, problems: lint.problems, files: Object.keys(env.theme.files) };
    },
  }),
  tool({
    name: "place_component", area: "designer", description: `Place a plugin/merch component into a storefront slot. Slots: ${STOREFRONT_SLOTS.join(", ")}.`,
    input: z.object({ slot: z.enum(STOREFRONT_SLOTS), component: z.string(), pluginId: z.string().optional(), props: z.record(z.string(), z.unknown()).optional(), remove: z.boolean().default(false) }),
    handler: async (input, ctx) => {
      const env = await getEnvironment(d(ctx), ctx.storeId, "draft");
      const current = env.theme.slots[input.slot] ?? [];
      const next = input.remove ? current.filter((c) => c.component !== input.component) : [...current.filter((c) => c.component !== input.component), { component: input.component, pluginId: input.pluginId, props: input.props }];
      await updateDraftTheme(d(ctx), ctx.storeId, { slots: { [input.slot]: next } }, "ai");
      return { slot: input.slot, components: next.map((c) => c.component) };
    },
  }),
  tool({ name: "apply_template", area: "designer", description: `Start the draft from a template: ${THEME_TEMPLATES.map((t) => t.id).join(" | ")}. Keeps brand, slots and files.`, input: z.object({ template: z.string() }), handler: async (input, ctx) => ({ template: (await applyTemplate(d(ctx), ctx.storeId, input.template)).theme.template }) }),
  tool({
    name: "build_storefront", area: "designer", credits: 2, description: "Build + verify (lint, screenshot) the draft or live environment. Returns the build log and problems.",
    input: z.object({ environment: z.enum(["draft", "live"]).default("draft") }),
    handler: async (input, ctx) => {
      const r = await buildEnvironment(d(ctx), ctx.storeId, input.environment, { fast: true });
      return { ok: r.ok, problems: r.problems, log: r.log.slice(-6), screenshotUrl: r.screenshotUrl };
    },
  }),
  tool({
    name: "publish_storefront", area: "designer", risky: true, description: "Verify the draft and publish it live (bumps the version; rollback available).",
    input: z.object({}),
    handler: async (_i, ctx) => {
      const env = await publish(d(ctx), ctx.storeId, "ai");
      await setTodo(d(ctx), ctx.storeId, "publish", "done");
      const store = await getStore(d(ctx), ctx.storeId);
      return { version: env.version, publishedAt: env.publishedAt, url: storefrontUrl(d(ctx), store) };
    },
  }),
];
