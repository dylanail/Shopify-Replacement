import { commerceTools } from './commerce.ts'
import { growthTools } from './growth.ts'
import { pluginTools } from './plugin-tools.ts'
import { productTools } from './products.ts'
import { researchTools } from './research.ts'
import { pageTools } from './pages.ts'
import { storefrontTools } from './storefront.ts'

/** Importing this module is what populates the registry. */
export const ALL_TOOLS = [...productTools, ...researchTools, ...pageTools, ...commerceTools, ...storefrontTools, ...growthTools, ...pluginTools]
