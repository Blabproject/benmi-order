export interface Env extends Partial<Pick<RuntimeBindings,
  'LINE_RUNTIME_ENABLED' | 'LINE_RUNTIME_TENANTS' | 'LINE_RUNTIME_ENVIRONMENT' | 'LINE_SECRET_KEYS'>> {
  PAYMENT_SECRET_KEYS?: string;
  PAYMENT_ALLOW_LIVE_IN_DEV?: string;
  BUILD_COMMIT?: string;
  BUILD_ENVIRONMENT?: string;
  BUILD_DIRTY?: string;
  UNIFIED_MENU_ENABLED?: string;
  ORDER_DETAIL_READS?: string;
  ORDER_DETAIL_WRITES?: string;
  // Bindings
  ORDER_STATE: KVNamespace;
  DB: D1Database;

  // Global Admin Secret
  ADMIN_API_KEY?: any;
  ORDER_DOMAIN_ADMIN_KEY?: any;

  // Secrets & Env Variables (Fallback for primary/legacy tenant)
  LINE_CHANNEL_TOKEN?: any;
  LINE_TOKEN_BSC?: any;
  LINE_CHANNEL_ACCESS_TOKEN?: string;
  LIFF_ID?: string;
  LIFF_URL?: string;
  OPENROUTER_API_KEY?: string;
  OPENROUTER_MODEL?: string;
  GOOGLE_SHEETS_URL?: string;
  GROQ_API_KEY?: any;
  GROQ_MODEL?: string;
}
