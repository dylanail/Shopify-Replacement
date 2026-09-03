import type { Cents } from '../lib/money.ts'

export type ProductOption = {
  title: string
  /** Swatches are what makes a leather colour render as a colour, not a word. */
  values: Array<{ value: string; swatch?: string; note?: string }>
}

export type Media = { url: string; alt: string }

export type Variant = {
  id: string
  productId: string
  title: string
  sku: string
  priceCents: Cents
  compareAtCents: Cents | null
  inventory: number
  allowBackorder: boolean
  optionValues: Record<string, string>
  image: string
  position: number
}

export type Product = {
  id: string
  storeId: string
  title: string
  handle: string
  subtitle: string
  description: string
  status: 'draft' | 'published' | 'archived'
  heroImage: string
  media: Media[]
  options: ProductOption[]
  metadata: Record<string, string>
  seo: { title?: string; description?: string }
  tags: string[]
  subscription: { cadences?: string[]; discountPercent?: number; trialDays?: number }
  position: number
  createdAt: string
  updatedAt: string
  variants: Variant[]
}

export type LineItem = {
  variantId: string
  productId: string
  title: string
  variantTitle: string
  image: string
  unitCents: Cents
  quantity: number
  /** Set when the line was added by a bundle, upsell or cross-sell component. */
  source?: string
}

export type Address = {
  name?: string
  line1?: string
  city?: string
  postal?: string
  country?: string
  phone?: string
}

export type Totals = {
  subtotalCents: Cents
  discountCents: Cents
  shippingCents: Cents
  taxCents: Cents
  totalCents: Cents
  currency: string
  appliedPromotions: Array<{ id: string; title: string; code: string; amountCents: Cents }>
  /** How much more the cart needs to clear the free-shipping threshold. */
  freeShippingGapCents: Cents | null
}

export type Order = {
  id: string
  storeId: string
  displayId: number
  email: string
  items: LineItem[]
  currency: string
  subtotalCents: Cents
  discountCents: Cents
  shippingCents: Cents
  taxCents: Cents
  totalCents: Cents
  discountCode: string
  status: 'pending' | 'completed' | 'cancelled'
  paymentStatus: 'awaiting' | 'captured' | 'refunded' | 'partially_refunded'
  fulfillmentStatus: 'unfulfilled' | 'fulfilled' | 'shipped' | 'delivered' | 'returned'
  address: Address
  fulfillments: Array<{ id: string; provider: string; tracking: string; createdAt: string }>
  refunds: Array<{ id: string; amountCents: Cents; reason: string; createdAt: string }>
  createdAt: string
  updatedAt: string
}

export type PromotionKind =
  | 'percentage'
  | 'fixed'
  | 'free_shipping'
  | 'bogo'
  | 'bundle'
  | 'tiered'

export type Promotion = {
  id: string
  storeId: string
  code: string
  title: string
  kind: PromotionKind
  /** percent for percentage/bundle/tiered, minor units for fixed. */
  value: number
  rules: {
    minSubtotalCents?: number
    productIds?: string[]
    variantIds?: string[]
    collectionIds?: string[]
    buyQuantity?: number
    getQuantity?: number
    tiers?: Array<{ quantity: number; percent: number }>
    regionIds?: string[]
    firstOrderOnly?: boolean
  }
  automatic: boolean
  status: 'active' | 'scheduled' | 'disabled' | 'expired'
  startsAt: string | null
  endsAt: string | null
  usageCount: number
  createdAt: string
}

export type Brand = {
  name?: string
  slogan?: string
  description?: string
  primary?: string
  secondary?: string
  ink?: string
  paper?: string
  displayFont?: string
  bodyFont?: string
  logoSvg?: string
  announcement?: string
  voice?: string
}

export type Theme = {
  template: string
  sections: string[]
  radius: string
  density: 'compact' | 'roomy'
  heroImage?: string
  heroHeadline?: string
  heroSub?: string
  nav: Array<{ label: string; href: string }>
  slots: Record<string, string[]>
}
