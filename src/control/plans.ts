/**
 * Plans are configuration, never code paths.
 *
 * The public surface renamed these tiers three times in two months and the
 * marketing names, the FAQ names and the API slugs never agreed. So the slug
 * is the only identifier anything else in the platform is allowed to know,
 * every limit is a field, and gating asks `limitsFor(store).customDomain`
 * rather than testing a name.
 */
export type Plan = {
  slug: string
  name: string
  tagline: string
  monthlyPriceCents: number
  yearlyPriceCents: number
  platformFeePercent: number
  cardRate: number
  maxStores: number
  maxTeamMembers: number
  baseCreditsPerMonth: number | null
  customDomain: boolean
  advancedAnalytics: boolean
  prioritySupport: boolean
  agenticCro: 'none' | 'assisted' | 'autonomous'
  multiRegion: boolean
  isPopular: boolean
  ctaLabel: string
  displayFeatures: string[]
}

export const PLANS: Plan[] = [
  {
    slug: 'free',
    name: 'Free',
    tagline: 'See your store before you pay for it.',
    monthlyPriceCents: 0,
    yearlyPriceCents: 0,
    platformFeePercent: 3,
    cardRate: 0.029,
    maxStores: 1,
    maxTeamMembers: 1,
    baseCreditsPerMonth: 200,
    customDomain: false,
    advancedAnalytics: false,
    prioritySupport: false,
    agenticCro: 'none',
    multiRegion: false,
    isPopular: false,
    ctaLabel: 'Start free',
    displayFeatures: ['1 store', '200 AI credits a month', 'Generated storefront on an amboras subdomain', '3% platform fee'],
  },
  {
    slug: 'launch',
    name: 'Basic',
    tagline: 'A real storefront on your own domain.',
    monthlyPriceCents: 4900,
    yearlyPriceCents: 46800,
    platformFeePercent: 1,
    cardRate: 0.029,
    maxStores: 1,
    maxTeamMembers: 1,
    baseCreditsPerMonth: null,
    customDomain: true,
    advancedAnalytics: true,
    prioritySupport: false,
    agenticCro: 'none',
    multiRegion: false,
    isPopular: false,
    ctaLabel: 'Get started',
    displayFeatures: ['Custom domain, SSL and CDN', 'Unlimited AI credits', 'Advanced analytics', '1% platform fee', 'Choose your model'],
  },
  {
    slug: 'starter',
    name: 'Grow',
    tagline: 'The plan most stores settle on.',
    monthlyPriceCents: 10500,
    yearlyPriceCents: 114000,
    platformFeePercent: 1,
    cardRate: 0.027,
    maxStores: 5,
    maxTeamMembers: 10,
    baseCreditsPerMonth: null,
    customDomain: true,
    advancedAnalytics: true,
    prioritySupport: true,
    agenticCro: 'assisted',
    multiRegion: false,
    isPopular: true,
    ctaLabel: 'Get started',
    displayFeatures: ['5 stores, 10 teammates', 'Assisted CRO: the agent proposes tests', 'Cohort reporting', 'Priority support', '2.7% + 30c card rate'],
  },
  {
    slug: 'scale',
    name: 'Advanced',
    tagline: 'The store runs its own experiments.',
    monthlyPriceCents: 39900,
    yearlyPriceCents: 432000,
    platformFeePercent: 0.5,
    cardRate: 0.025,
    maxStores: 20,
    maxTeamMembers: 20,
    baseCreditsPerMonth: null,
    customDomain: true,
    advancedAnalytics: true,
    prioritySupport: true,
    agenticCro: 'autonomous',
    multiRegion: true,
    isPopular: false,
    ctaLabel: 'Get started',
    displayFeatures: ['Autonomous CRO loop with auto-promote', 'Multi-region and live shipping rates', 'Brand-voice fine tune', '0.5% platform fee', '2.5% + 30c card rate'],
  },
  {
    slug: 'enterprise',
    name: 'Enterprise',
    tagline: 'Your compliance team has questions. We have answers.',
    monthlyPriceCents: -1,
    yearlyPriceCents: -1,
    platformFeePercent: 0,
    cardRate: 0.025,
    maxStores: Number.MAX_SAFE_INTEGER,
    maxTeamMembers: Number.MAX_SAFE_INTEGER,
    baseCreditsPerMonth: null,
    customDomain: true,
    advancedAnalytics: true,
    prioritySupport: true,
    agenticCro: 'autonomous',
    multiRegion: true,
    isPopular: false,
    ctaLabel: 'Talk to us',
    displayFeatures: ['SSO and SCIM', 'Audit export', 'B2B price lists and net terms', 'Sandbox clone of production', 'Custom platform fee'],
  },
]

/**
 * Personal mode. This deployment is one person's, so every store is on the
 * owner plan — every limit off, no fee, nothing gated. The tiers above stay
 * defined so pricing can return as configuration later; nothing else in the
 * platform tests a plan name.
 */
export const OWNER: Plan = {
  slug: 'owner',
  name: 'Owner',
  tagline: 'Your platform. Everything on.',
  monthlyPriceCents: 0,
  yearlyPriceCents: 0,
  platformFeePercent: 0,
  cardRate: 0.029,
  maxStores: Number.MAX_SAFE_INTEGER,
  maxTeamMembers: Number.MAX_SAFE_INTEGER,
  baseCreditsPerMonth: null,
  customDomain: true,
  advancedAnalytics: true,
  prioritySupport: true,
  agenticCro: 'autonomous',
  multiRegion: true,
  isPopular: false,
  ctaLabel: '',
  displayFeatures: ['Everything, no limits, no platform fee'],
}

export function planBySlug(slug: string): Plan {
  if (slug === 'owner' || process.env.AMBORAS_PERSONAL !== 'false') return OWNER
  return PLANS.find((plan) => plan.slug === slug) ?? (PLANS[0] as Plan)
}

export function yearlySavingsPercent(plan: Plan): number {
  if (plan.monthlyPriceCents <= 0) return 0
  return Math.round((1 - plan.yearlyPriceCents / (plan.monthlyPriceCents * 12)) * 100)
}

export class PlanLimitError extends Error {
  readonly feature: string
  readonly plan: Plan
  readonly upgradeTo: Plan | undefined
  constructor(feature: string, plan: Plan, upgradeTo: Plan | undefined) {
    super(
      upgradeTo
        ? `${feature} is not on ${plan.name}. ${upgradeTo.name} includes it.`
        : `${feature} is not available on ${plan.name}.`,
    )
    this.name = 'PlanLimitError'
    this.feature = feature
    this.plan = plan
    this.upgradeTo = upgradeTo
  }
}

/** The gate every plan-limited feature calls. It names the upgrade, because a
 * blocked merchant needs the next step, not a closed door. */
export function requirePlan(planSlug: string, feature: keyof Plan, label: string) {
  const plan = planBySlug(planSlug)
  if (plan[feature]) return
  const upgrade = PLANS.find((candidate) => candidate.monthlyPriceCents > plan.monthlyPriceCents && candidate[feature])
  throw new PlanLimitError(label, plan, upgrade)
}
