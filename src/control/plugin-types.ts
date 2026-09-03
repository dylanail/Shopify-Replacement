import type { Schema } from '../lib/validate.ts'

/**
 * The plugin manifest, reverse-engineered from the live catalog and then
 * tightened into types.
 *
 * A plugin is three things at most, and any of them can be absent:
 *   - `admin`     a settings form, credentials, and AI tools it contributes
 *   - `storefront` components mounted into named slots of the generated theme
 *   - `capabilities` providers it registers with the commerce core
 *
 * Adding a tool here is literally giving the assistant a new capability: the
 * registry merges `admin.aiTools` at install time.
 */
export type SlotName =
  | 'rootProviders'
  | 'headEnd'
  | 'bodyEnd'
  | 'announcementBar'
  | 'pdpBelowAddToCart'
  | 'pdpAnalytics'
  | 'cartDrawer'
  | 'cartUpdate'
  | 'checkoutStart'
  | 'orderConfirmed'
  | 'accountOverview'
  | 'paymentRegistry'

export type PluginComponent = {
  id: string
  slot?: SlotName
  /** `merchant_choice` means the merchant (or the assistant) picks the slot. */
  placement?: 'fixed' | 'merchant_choice' | 'payment_registry'
  validSlots?: SlotName[]
  defaultSlot?: SlotName
  /** Rendered into the storefront with the plugin's settings and page context. */
  render?: (input: { settings: Record<string, unknown>; context: Record<string, unknown> }) => string
}

export type PluginAiTool = { name: string; description: string; schema: Schema; example: string }

export type Capability =
  | { id: string; type: 'payment_provider'; label: string }
  | { id: string; type: 'fulfillment_provider'; label: string }
  | { id: string; type: 'analytics_sink'; label: string }
  | { id: string; type: 'email_provider'; label: string }

export type Plugin = {
  id: string
  name: string
  version: string
  npmPackage: string
  category: string
  source: 'first-party' | 'third-party'
  regions: string[]
  website?: string
  featured?: boolean
  planGated?: boolean
  allowedPlanIds?: string[] | null
  description: string
  longDescription?: string
  manifest: {
    kind: 'integration' | 'ux_module' | 'hybrid'
    api?: { admin?: string[]; store?: string[] }
    admin?: {
      hasSettings: boolean
      settingsRoute?: string
      settingsSchema?: Schema
      /** Fields sealed into store_plugin_credentials rather than settings. */
      secretFields?: string[]
      aiTools?: PluginAiTool[]
    }
    storefront?: { components?: PluginComponent[] }
    capabilities?: Capability[]
    /** Analytics and pixels must not fire against the admin's preview iframe. */
    disableInPreview?: boolean
  }
}
