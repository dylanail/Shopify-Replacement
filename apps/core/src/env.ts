export interface Env {
  port: number;
  jwtSecret: string;
  orchestratorSecret: string;
  publicCoreUrl: string;
  adminUrl: string;
  storefrontBaseDomain: string;
  anthropicApiKey?: string;
  openaiApiKey?: string;
  stripeSecretKey?: string;
  stripeConnectClientId?: string;
  stripeWebhookSecret?: string;
  resendApiKey?: string;
  emailFrom: string;
  defaultModel: string;
  dataDir?: string;
  databaseUrl?: string;
}

export function loadEnv(e: NodeJS.ProcessEnv = process.env): Env {
  return {
    port: Number(e.CORE_PORT ?? 4000),
    jwtSecret: e.JWT_SECRET ?? "kiln-dev-secret-change-me",
    orchestratorSecret: e.ORCHESTRATOR_SECRET ?? "kiln-dev-orchestrator",
    publicCoreUrl: e.PUBLIC_CORE_URL ?? `http://localhost:${e.CORE_PORT ?? 4000}`,
    adminUrl: e.ADMIN_URL ?? "http://localhost:3000",
    storefrontBaseDomain: e.STOREFRONT_BASE_DOMAIN ?? "localhost:3001",
    anthropicApiKey: e.ANTHROPIC_API_KEY,
    openaiApiKey: e.OPENAI_API_KEY,
    stripeSecretKey: e.STRIPE_SECRET_KEY,
    stripeConnectClientId: e.STRIPE_CONNECT_CLIENT_ID,
    stripeWebhookSecret: e.STRIPE_WEBHOOK_SECRET,
    resendApiKey: e.RESEND_API_KEY,
    emailFrom: e.EMAIL_FROM ?? "Kiln <noreply@kiln.local>",
    defaultModel: e.KILN_DEFAULT_MODEL ?? "claude-sonnet-5",
    dataDir: e.KILN_DATA_DIR,
    databaseUrl: e.DATABASE_URL,
  };
}
