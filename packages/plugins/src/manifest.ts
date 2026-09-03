import { z } from "zod";
import { STOREFRONT_SLOTS } from "@kiln/shared";

export const SettingsField = z.object({
  type: z.enum(["text", "secret", "boolean", "number", "select", "textarea"]),
  label: z.string(),
  description: z.string().optional(),
  placeholder: z.string().optional(),
  pattern: z.string().optional(),
  required: z.boolean().default(false),
  options: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
  default: z.unknown().optional(),
});
export type SettingsField = z.infer<typeof SettingsField>;

export const AiToolDecl = z.object({
  name: z.string().regex(/^[a-z][a-z0-9_]*$/),
  description: z.string(),
  example: z.string().optional(),
  input: z.record(z.string(), z.enum(["string", "number", "boolean"])).default({}),
});
export type AiToolDecl = z.infer<typeof AiToolDecl>;

export const StorefrontComponent = z.object({
  id: z.string(),
  placement: z.enum(["fixed", "merchant_choice", "payment_registry"]).default("fixed"),
  slot: z.enum(STOREFRONT_SLOTS).optional(),
  validSlots: z.array(z.enum(STOREFRONT_SLOTS)).optional(),
  defaultSlot: z.enum(STOREFRONT_SLOTS).optional(),
  propsFromConfig: z.array(z.string()).default([]),
  propsFromContext: z.array(z.string()).default([]),
});
export type StorefrontComponent = z.infer<typeof StorefrontComponent>;

export const Capability = z.object({
  id: z.string(),
  type: z.enum(["fulfillment_provider", "payment_provider", "marketing_sync", "analytics_pixel", "sales_channel", "ux_module", "accounting", "support", "dropshipping", "affiliates"]),
});

export const PluginManifest = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  name: z.string(),
  version: z.string().default("0.1.0"),
  category: z.string(),
  source: z.enum(["first-party", "third-party"]).default("first-party"),
  kind: z.enum(["integration", "ux_module", "hybrid"]).default("integration"),
  regions: z.array(z.string()).default([]),
  description: z.string(),
  longDescription: z.string().default(""),
  website: z.string().optional(),
  icon: z.string().default("🔌"),
  featured: z.boolean().default(false),
  planGated: z.boolean().default(false),
  allowedPlanSlugs: z.array(z.string()).nullable().default(null),
  installable: z.boolean().default(true),
  settingsSchema: z.record(z.string(), SettingsField).default({}),
  requiresEmailDomain: z.boolean().default(false),
  aiTools: z.array(AiToolDecl).default([]),
  storefront: z
    .object({
      components: z.array(StorefrontComponent).default([]),
      scripts: z.array(z.object({ src: z.string().optional(), inline: z.string().optional(), position: z.enum(["head", "bodyEnd"]).default("bodyEnd") })).default([]),
    })
    .default({ components: [], scripts: [] }),
  capabilities: z.array(Capability).default([]),
  disableInPreview: z.boolean().default(false),
  adminRoutes: z.array(z.object({ path: z.string(), label: z.string() })).default([]),
});
export type PluginManifest = z.infer<typeof PluginManifest>;
export type PluginManifestInput = z.input<typeof PluginManifest>;

export function definePlugin(input: PluginManifestInput): PluginManifest {
  return PluginManifest.parse(input);
}

/** Validate merchant-provided settings against a plugin's schema. Returns {ok, errors, values}. */
export function validateSettings(manifest: PluginManifest, values: Record<string, unknown>) {
  const errors: Record<string, string> = {};
  const out: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(manifest.settingsSchema)) {
    const raw = values[key] ?? field.default;
    if (field.required && (raw === undefined || raw === "" || raw === null)) {
      errors[key] = `${field.label} is required`;
      continue;
    }
    if (raw === undefined) continue;
    if (field.type === "boolean" && typeof raw !== "boolean") errors[key] = `${field.label} must be true/false`;
    else if (field.type === "number" && typeof raw !== "number") errors[key] = `${field.label} must be a number`;
    else if ((field.type === "text" || field.type === "secret" || field.type === "textarea") && typeof raw !== "string") errors[key] = `${field.label} must be text`;
    else if (field.pattern && typeof raw === "string" && !new RegExp(field.pattern).test(raw)) errors[key] = `${field.label} has an invalid format`;
    else if (field.type === "select" && field.options && !field.options.some((o) => o.value === raw)) errors[key] = `${field.label} must be one of ${field.options.map((o) => o.value).join(", ")}`;
    out[key] = raw;
  }
  return { ok: Object.keys(errors).length === 0, errors, values: out };
}
