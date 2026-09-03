/** URL the Next server uses to reach the core API. */
export const SERVER_CORE_URL = process.env.CORE_URL ?? process.env.NEXT_PUBLIC_CORE_URL ?? "http://localhost:4000";
/** URL the browser uses to reach the core API (must be publicly reachable). */
export const PUBLIC_CORE_URL = process.env.NEXT_PUBLIC_CORE_URL ?? process.env.CORE_URL ?? "http://localhost:4000";
export const BASE_DOMAIN = process.env.STOREFRONT_BASE_DOMAIN ?? "localhost:3001";
export const STRIPE_PK_OVERRIDE = process.env.STRIPE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || null;

export const publicApiBase = (coreUrl: string, storeKey: string) => `${coreUrl.replace(/\/$/, "")}/api/v1/public/stores/${encodeURIComponent(storeKey)}`;
