# Kiln API index

Base URL `http://localhost:4000/api/v1`. JSON in/out. Errors: `{ error, details? }` with 4xx/5xx.
Authenticated routes take `Authorization: Bearer <accessToken>`; SSE routes also accept `?token=`.
Store-scoped routes live under `/stores/:storeId/…` and require org ownership or accepted team membership.

## Auth
| Method | Path | Notes |
|---|---|---|
| POST | /auth/register | `{email, password, name?, inviteToken?}` → tokens + org |
| POST | /auth/login · /auth/refresh · /auth/password-reset · /auth/password-reset/confirm | |
| GET | /auth/me | user, orgs, stores |
| POST | /auth/invite/:token/accept · /auth/feature-request | |

## Stores & designer
| Method | Path | Notes |
|---|---|---|
| GET/POST | /stores | list / create |
| POST | /stores/onboard | one sentence → store; `Accept: text/event-stream` streams steps |
| GET | /stores/templates | theme templates |
| GET/PATCH | /stores/:id | store + publish state + credits |
| GET | /stores/:id/dashboard?days | KPIs, series, to-dos, activity, deployment |
| GET/PATCH | /stores/:id/todos(/:key) · GET /activity · GET /audit | |
| GET | /stores/:id/environments/:kind | draft \| live theme, build log, lint |
| PATCH | /stores/:id/environments/draft/theme | partial ThemeConfig |
| POST/DELETE | /stores/:id/environments/draft/sections(/:id) · POST …/reorder · POST …/template | |
| POST | /stores/:id/environments/:kind/build · /stores/:id/publish · /stores/:id/rollback · GET /publish-state | |
| GET | /stores/:id/events | SSE: agent, activity, build, analytics, domain |

## AI
| Method | Path | Notes |
|---|---|---|
| POST | /stores/:id/ai/runs | `{input, images?, sessionId?, pageContext?, model?}` → 202 `{runId, sessionId}` |
| GET | /stores/:id/ai/runs(/:runId) · POST …/:runId/cancel · POST …/:runId/resume `{answer, confirm}` · GET …/:runId/events (SSE) | |
| GET | /stores/:id/ai/sessions · /sessions/:sid/messages · /tools · /prompts · /models | |

## Catalog
`/stores/:id/products` (GET list · POST), `/products/stats`, `/products/:pid` (GET · PATCH · DELETE), `/products/:pid/inventory`, `/products/:pid/images` (4 lanes, presets), `/collections` (+ `/:cid`), `/import` (CSV, `dryRun`), `/import/jobs`.

## Commerce
`/orders` (list, `/stats`, `/:oid`, `/:oid/fulfill|cancel|refund|returns`), `/returns/:rid/complete`, `/fulfillments/:fid/delivered`, `/customers` (list, `/segments`, `/:cid`, `/:cid/subscriptions`), `/promotions`, `/gift-cards`, `/regions`, `/shipping-options`, `/subscriptions` (+ `/:sid/pause|resume|cancel|change_cadence`, `/process-due`), `/merch` (+ `/rebuild-affinity`).

## Growth
`/analytics/summary|timeseries|funnel|realtime|top-products|cohorts`, `/reviews` (+ `/:rid/approve|reject|restore|delete|reply`, `/summary/:pid`, `/stats/:pid`), `/questions` (+ `/:qid/answer`), `/emails/templates` (+ `/:key`, `/:key/preview`, `/:key/test`), `/emails/log`, `/emails/flows/:key`, `/emails/campaigns` (+ `/draft`, `/:cid`, `/:cid/send`), `/blogs`, `/articles`, `/seo` (+ `/scan`, `/keywords`, `/redirects`, `/redirects/bulk`, `/validate/:pid`), `/geo` (+ `/knowledge-card`, `/prompts`, `/check`, `/preview`), `/experiments` (+ `/suggest`, `/:eid/running|killed|promoted|draft`), `/workflows`.

## Settings
`/plugins` (+ `/:pid/install`, `/:pid` DELETE, `/:pid/settings`, `/:pid/enabled`, `/contact-form/submissions`, `/exit-intent/responses[.csv]`, `/engraving/templates`), `/domains` (+ `/:did/verify?force=1`, `/:did/primary`), `/team` (+ `/invite`, `/:mid`), `/billing` (+ `/plan`, `/credits/top-up`), `/autonomy`, `/payments` (+ `/stripe/connect`, `/stripe/simulate`).

## Public storefront API (`/public`)
`/plans`, `/plugins`, `/art.svg?t&p&c&a&s&w`, and per store `/public/stores/:slugOrHost/…`:
shell `/`, `/products?page&pageSize&q&collection&sort(newest|oldest|title|price_asc|price_desc)&ids`, `/products/:handle`, `/products/:handle/reviews` (GET/POST), `/products/:handle/questions`, `/collections(/:handle)`, `/search`, `/variants?ids`, `/track`, `/live` (SSE), `/cart` (POST), `/cart/:cid` (GET/PATCH), `/cart/:cid/items(/:lineId)`, `/cart/:cid/discount`, `/cart/:cid/payment-intent`, `/cart/:cid/checkout`, `/shipping-options`, `/orders/:oid?email`, `/orders/:oid/upsell`, `/contact`, `/exit-intent`, `/newsletter`, `/account/register|login`, `/account` (GET · PATCH profile/addresses/marketing), `/account/subscriptions/:sid/:action`, `/experiments/:eid/convert`, `/logo.svg`, `/hero.svg`, `/preview.svg`, `/sitemap.xml`, `/robots.txt`, `/llms.txt`, `/blog`, `/blog/rss.xml`, `/blog/:handle`.

## Webhooks & orchestrator
`POST /webhooks/stripe`, `GET /webhooks/stripe/connect` (OAuth callback), `POST /webhooks/:pluginId/:storeId` (carrier tracking, `X-Kiln-Token`), `POST /webhooks/orchestrator/cron/:job` and `/orchestrator/plugin-settings/:storeId/:pluginId` (require `X-Orchestrator-Secret`). Jobs: `abandoned-carts`, `subscriptions`, `affinity`, `review-requests`, `geo`.
