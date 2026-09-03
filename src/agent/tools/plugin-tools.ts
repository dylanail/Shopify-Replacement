import { FIRST_PARTY } from '../../control/catalog-plugins.ts'
import { install, invalidateStorefrontConfig } from '../../control/plugins.ts'
import { refreshTodos } from '../../control/todos.ts'
import { defineTool, getTool, type Tool } from '../registry.ts'

/**
 * Plugins contribute tools.
 *
 * Each `admin.aiTools` entry in a manifest becomes a real registry entry here,
 * with the plugin's own schema and a handler that installs and configures it.
 * That is what "adding a tool means giving the assistant a new capability"
 * has to mean in code: after this runs, `connect_shippo` is as real to the
 * agent as `create_product`, and it is validated by the same executor.
 *
 * A plugin cannot shadow a name the platform already owns. `product-reviews`
 * declares `list_reviews` and the core registry also provides it; the core
 * wins, because a merchant uninstalling a plugin must never take a built-in
 * capability down with it.
 */
export const pluginTools: Tool[] = FIRST_PARTY.flatMap((plugin) =>
  (plugin.manifest.admin?.aiTools ?? [])
    .filter((declared) => !getTool(declared.name))
    .map((declared) =>
    defineTool({
      name: declared.name,
      area: 'plugins',
      description: `${declared.description} (${plugin.name}). Example: ${declared.example}`,
      schema: declared.schema,
      handler(args, ctx) {
        const installed = install(ctx.db, ctx.storeId, plugin.id, args)
        invalidateStorefrontConfig(ctx.storeId)
        refreshTodos(ctx.db, ctx.storeId)
        const secrets = plugin.manifest.admin?.secretFields ?? []
        const stored = Object.keys(args).filter((key) => secrets.includes(key))
        return {
          summary:
            `${plugin.name} is connected.` +
            (stored.length ? ` ${stored.join(' and ')} ${stored.length === 1 ? 'is' : 'are'} sealed at rest and never returned to the browser.` : ''),
          data: { pluginId: plugin.id, settings: installed.settings },
        }
      },
    }),
  ),
)
