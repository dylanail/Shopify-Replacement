import { getStore } from '../../control/stores.ts'
import { listProducts, updateProduct } from '../../domain/catalog.ts'
import { format } from '../../lib/money.ts'
import { contentFor } from '../pages.ts'
import { latestResearch, runResearch } from '../research.ts'
import { defineTools, type Tool } from '../registry.ts'

export const researchTools: Tool[] = defineTools([
  {
    name: 'run_customer_research',
    area: 'products',
    description: 'Research who buys this, what stops them, what they compare against and what they pay. Reads a site URL if given. Every product page written afterwards uses it.',
    schema: {
      brief: { type: 'string', help: 'Defaults to the sentence the store was built from.' },
      siteUrl: { type: 'string', help: 'An existing site to read for positioning and copy.' },
      rewritePages: { type: 'boolean', default: false, help: 'Also rewrite every product page from the new research.' },
    },
    async handler(args, ctx) {
      const store = getStore(ctx.db, ctx.storeId)
      if (!store) throw new Error('No store')
      const research = await runResearch(ctx.db, ctx.storeId, {
        prompt: (args.brief as string) || store.prompt || store.name,
        ...(args.siteUrl ? { siteUrl: args.siteUrl as string } : store.referenceUrl ? { siteUrl: store.referenceUrl } : {}),
      })
      let rewritten = 0
      if (args.rewritePages) {
        for (const product of listProducts(ctx.db, ctx.storeId, { limit: 200 })) {
          updateProduct(ctx.db, ctx.storeId, product.id, { content: contentFor(research, store.prompt, product) })
          rewritten++
        }
      }
      return {
        summary:
          `Research done (${research.source}): ${research.audience.length} audiences, ${research.objections.length} objections answered, ` +
          `${research.competitors.length} competitors, price anchor ${format(research.priceAnchor.midCents, store.currency)}` +
          (rewritten ? `; rewrote ${rewritten} product pages.` : '.'),
        data: research,
        artifacts: [
          { type: 'note', text: research.positioning },
          {
            type: 'table',
            columns: ['Audience', 'Share', 'Wants', 'Fears'],
            rows: research.audience.map((persona) => [persona.name, `${Math.round(persona.share * 100)}%`, persona.wants, persona.fears]),
          },
          { type: 'link', href: '/admin/research', label: 'Open the research' },
        ],
      }
    },
  },
  {
    name: 'get_research',
    area: 'products',
    description: 'Read back the customer research on file for this store.',
    schema: {},
    handler(_args, ctx) {
      const research = latestResearch(ctx.db, ctx.storeId)
      if (!research) return { summary: 'No research on file yet. Run run_customer_research first.' }
      return {
        summary: `Research from ${research.createdAt.slice(0, 10)} (${research.source}): ${research.positioning}`,
        data: research,
        artifacts: [
          { type: 'table', columns: ['Objection', 'Answer'], rows: research.objections.map((entry) => [entry.objection, entry.answer]) },
          { type: 'table', columns: ['Competitor', 'Angle', 'Price band', 'Weakness'], rows: research.competitors.map((entry) => [entry.name, entry.angle, entry.priceBand, entry.weakness]) },
        ],
      }
    },
  },
])
