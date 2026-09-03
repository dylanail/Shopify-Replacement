# Deploying

One VPS runs the whole platform: the admin, the commerce core, the agent, and
every storefront, as one Node process behind Caddy. Caddy terminates TLS for
the admin host, the storefront subdomains and every custom domain a store
verifies. There is no build step and no second service to run.

## What you need

- A Linux VPS with Docker and Docker Compose (2 GB of RAM is plenty).
- A domain you control, with three records pointing at the server's IP:
  - `admin.yourbrand.com` (A) — the admin.
  - `*.stores.yourbrand.com` (A, wildcard) — one subdomain per store.
  - `edge.stores.yourbrand.com` (A) — what customers' custom domains CNAME to.
- Ports 80 and 443 open.
- An Anthropic or OpenAI key, or both. Without one the platform still runs,
  on its rules writers, and the admin says so on every page.

## First run

```sh
git clone <this repo> amboras && cd amboras
cp .env.example .env         # fill in AMBORAS_SECRET, the hosts, ACME_EMAIL and a model key
docker compose up -d --build
docker compose exec app node --disable-warning=ExperimentalWarning src/seed.ts   # optional demo store
```

Open `https://admin.yourbrand.com`. The first visit issues the certificate;
register, type one sentence, and the store exists at
`https://<slug>.stores.yourbrand.com`.

State is one sqlite file plus uploads in the `app_data` volume. Backing up
is copying that volume; restoring is copying it back.

## How custom domains get their certificate

The Domains page tells the owner the exact records for their registrar. When
the owner presses **Check**, the app looks the name up; when it verifies as
hosted, the app records it and, from that moment, answers `200` at
`/_edge/tls-ask?domain=<name>`. Caddy asks that endpoint before issuing any
certificate on demand, so:

- a verified custom domain gets a certificate on its first HTTPS visit, with
  no step in the admin;
- a stranger pointing a random name at the server gets nothing, because the
  app answers `404` for names it does not serve;
- the admin host and the storefront root's subdomains are always cleared.

"ssl: issued" on the Domains page means the name is cleared and Caddy issues
on first visit; it is not a certificate stored in the app.

Forwarded domains (the registrar redirects to the store's platform address)
never need a certificate here; the registrar serves the redirect.

## Updating

```sh
git pull && docker compose up -d --build
```

Migrations run on boot. Interrupted agent runs are recovered on boot.

## Running without Docker

`node --version` must be 22.18 or newer.

```sh
npm ci
cp .env.example .env && set -a && . ./.env && set +a
npm run seed
npm start                    # http://localhost:4100
```

Put any reverse proxy that terminates TLS in front of port 4100. If it is not
Caddy with on-demand TLS, custom domains need their certificates arranged
there; the `/_edge/tls-ask` endpoint is available to whatever fronts the
process.

## Environment

See `.env.example`. The ones that matter in production:

| Variable | Why |
|---|---|
| `AMBORAS_SECRET` | Every password hash, sealed credential and visitor fingerprint depends on it. Generate a long random string once and never change it. |
| `AMBORAS_ADMIN_HOST` | The hostname Caddy issues the admin certificate for. |
| `AMBORAS_STOREFRONT_HOST` | Stores answer at `<slug>.<this>`. |
| `AMBORAS_EDGE_HOST`, `AMBORAS_EDGE_IP` | What the Domains page tells registrars to point at. |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` | The writers. `AMBORAS_TEXT_PROVIDER` picks the default family when both are set; model ids are `AMBORAS_MODEL` and `AMBORAS_OPENAI_MODEL`. |
| `OPENAI_API_KEY`, `GEMINI_API_KEY` | Image re-shoots with GPT Image 2 and Gemini 3 Pro Image. |
| `RESEND_API_KEY`, `AMBORAS_EMAIL_DOMAIN` | Transactional email actually sends. |
| `META_AD_LIBRARY_TOKEN` | The Ads tab searches the Meta Ad Library. |
