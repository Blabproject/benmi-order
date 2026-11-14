import { resolveWorkerBase } from '@shared/infra/http';
import type {
  PaymentLocale,
  PaymentProviderTarget,
  PaymentResultDto,
  PaymentSessionRecord
} from '@shared/contracts/payment';

export interface PaymentApiError extends Error {
  status?: number;
}

export interface PaymentSessionClient {
  active: () => PaymentSessionRecord | null;
  archive: (id?: string) => PaymentSessionRecord | null;
  same: (a: PaymentSessionRecord | null | undefined, b: PaymentSessionRecord | null | undefined) => boolean;
  remember: (session: PaymentSessionRecord) => void;
  save: (session: PaymentSessionRecord) => void;
  forResult: (id: string) => PaymentSessionRecord | null;
  matches: (session: PaymentSessionRecord | null | undefined) => boolean;
  signature: (draft: unknown) => string;
  cleanUrl: (result?: boolean) => void;
  detach: (session: PaymentSessionRecord) => void;
  completeDetail: (session: PaymentSessionRecord) => void;
  paid: (session: PaymentSessionRecord) => void;
  restore: (session: PaymentSessionRecord) => void;
  terminal: (session: PaymentSessionRecord) => void;
  resolve: (session: PaymentSessionRecord) => Promise<PaymentResultDto>;
  providerTarget: (data: Pick<PaymentResultDto, 'paymentUrl' | 'appUrl'>) => PaymentProviderTarget;
  openProvider: (data: Pick<PaymentResultDto, 'paymentUrl' | 'appUrl'>, preferWeb?: boolean) => void;
  api: (path: string, session: PaymentSessionRecord, body?: unknown) => Promise<PaymentResultDto>;
}

const DEV_WORKER_URL = 'https://platform-worker-dev.thuanmnc.workers.dev';
const STAGING_WORKER_URL = 'https://platform-worker-staging.thuanmnc.workers.dev';

/**
 * Resolves Worker API origin for the dedicated payment-result entry.
 * Matches legacy payment-result.js behavior where localhost/127.0.0.1 and dev/test hostnames map to dev/staging.
 */
export function resolvePaymentWorkerBase(
  locationLike: { hostname: string; search: string } = window.location
): string {
  const params = new URLSearchParams(locationLike.search);
  const envParam = params.get('env');
  if (envParam === 'dev' || envParam === 'staging' || envParam === 'prod') {
    return resolveWorkerBase(locationLike);
  }
  const hostname = locationLike.hostname;
  if (
    /^(localhost|127\.0\.0\.1)$/.test(hostname) ||
    hostname.startsWith('dev.') ||
    hostname.includes('.dev.') ||
    hostname.includes('-dev.') ||
    hostname.startsWith('dev-')
  ) {
    return DEV_WORKER_URL;
  }
  if (
    hostname.startsWith('staging.') ||
    hostname.includes('.staging.') ||
    hostname.includes('-staging.') ||
    hostname.startsWith('test.') ||
    hostname.includes('.test.') ||
    hostname.includes('-test.')
  ) {
    return STAGING_WORKER_URL;
  }
  return resolveWorkerBase(locationLike);
}

/** Builds a safe same-origin menu redirect URL stripped of provider callback query params. */
export function buildPaymentMenuUrl(
  latestMenuUrl: string | null | undefined,
  tenant: string,
  locale: PaymentLocale,
  origin: string = window.location.origin
): URL {
  let url = new URL('/', origin);
  try {
    const candidate = new URL(latestMenuUrl || '', origin);
    if (candidate.origin === origin && !candidate.username && !candidate.password) {
      url = candidate;
    }
  } catch {
    // Keep same-origin root fallback when menuUrl is invalid.
  }
  for (const key of ['payment_id', 'transactionId', 'orderId']) {
    url.searchParams.delete(key);
  }
  url.searchParams.set('tenant_id', tenant);
  url.searchParams.set('lang', locale);
  return url;
}

/** Formats user-facing cancellation/pending message shared with checkout cancellation flow. */
export function formatPaymentCancelMessage(
  data: Pick<PaymentResultDto, 'paidAt' | 'cancelRequestedAt'> | null | undefined,
  locale: PaymentLocale
): string {
  const isVi = locale === 'vi';
  if (data?.paidAt) {
    return isVi
      ? 'Đơn này đã thanh toán. Vui lòng liên hệ quán để hủy đơn hoặc hoàn tiền.'
      : '此訂單已付款，取消訂單或退款請聯絡門市。';
  }
  if (data?.cancelRequestedAt) {
    return isVi
      ? 'Đang kiểm tra trước khi hủy. Vui lòng chưa thanh toán lại.'
      : '正在確認是否能取消付款。確認完成前，請勿重新付款。';
  }
  return isVi
    ? 'Bạn có một đơn chưa hoàn tất thanh toán.'
    : '您有一筆訂單尚未完成付款。';
}

function readJsonStorage<T>(storage: Storage, key: string): T | null {
  try {
    return JSON.parse(storage.getItem(key) || 'null') as T | null;
  } catch {
    return null;
  }
}

export interface CreatePaymentSessionOptions {
  getTenant: () => string;
  getWorkerBase: () => string;
  fetcher?: typeof fetch;
  localStorageRef?: Storage;
  sessionStorageRef?: Storage;
  navigate?: (url: string) => void;
}

/** Creates typed payment session storage & API helper preserving localStorage/sessionStorage contracts. */
export function createPaymentSessionClient(options: CreatePaymentSessionOptions): PaymentSessionClient {
  const fetcher = options.fetcher ?? ((input, init) => window.fetch(input, init));
  const local = options.localStorageRef ?? window.localStorage;
  const sessionStore = options.sessionStorageRef ?? window.sessionStorage;
  const navigate = options.navigate ?? ((url: string) => window.location.assign(url));

  const tenant = () => options.getTenant();
  const activeKey = () => `linepay_checkout:${tenant()}`;
  const archiveKey = (id: string) => `linepay_receipt:${tenant()}:${id}`;
  const active = () => readJsonStorage<PaymentSessionRecord>(local, activeKey());
  const archive = (id?: string) => (id ? readJsonStorage<PaymentSessionRecord>(local, archiveKey(id)) : null);
  const same = (a: PaymentSessionRecord | null | undefined, b: PaymentSessionRecord | null | undefined) =>
    !!a && !!b && a.token === b.token;
  const remember = (session: PaymentSessionRecord) => {
    if (session.id) local.setItem(archiveKey(session.id), JSON.stringify(session));
  };
  const save = (session: PaymentSessionRecord) => {
    local.setItem(activeKey(), JSON.stringify(session));
    remember(session);
  };
  const forResult = (id: string) => {
    const current = active();
    return current?.id === id ? current : archive(id);
  };
  const matches = (session: PaymentSessionRecord | null | undefined) => same(active(), session);

  const signature = (draft: unknown) =>
    JSON.stringify(draft, (_, value: unknown) =>
      value && typeof value === 'object' && !Array.isArray(value)
        ? Object.fromEntries(
            Object.keys(value as Record<string, unknown>)
              .sort()
              .map((key) => [key, (value as Record<string, unknown>)[key]])
          )
        : value
    );

  const cleanUrl = (result = false) => {
    const url = new URL(window.location.href);
    for (const key of ['transactionId', 'orderId', ...(result ? [] : ['payment_id'])]) {
      url.searchParams.delete(key);
    }
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
  };

  const detach = (session: PaymentSessionRecord) => {
    if (matches(session)) local.removeItem(activeKey());
  };

  const completeDetail = (session: PaymentSessionRecord) => {
    if (session?.payload?.operationId) {
      const pending = readJsonStorage<{ payload?: { operationId?: string } }>(
        sessionStore,
        `order_detail_pending:${tenant()}`
      );
      if (pending?.payload?.operationId && pending.payload.operationId !== session.payload.operationId) {
        return;
      }
    }
    sessionStore.removeItem(`order_detail_pending:${tenant()}`);
  };

  const clearPurchasedDraft = (session: PaymentSessionRecord) => {
    if (active() && !matches(session)) return;
    const saved = readJsonStorage<unknown>(local, `cart_save_${tenant()}`);
    if (saved && session.cartSignature === signature(saved)) {
      local.removeItem(`cart_save_${tenant()}`);
    }
    if (matches(session) || !active()) completeDetail(session);
  };

  const paid = (session: PaymentSessionRecord) => {
    if (!session.completed) clearPurchasedDraft(session);
    if (session.id) {
      local.setItem(archiveKey(session.id), JSON.stringify({ id: session.id, token: session.token, completed: true }));
    }
    detach(session);
  };

  const restore = (session: PaymentSessionRecord) => {
    if (active() && !matches(session)) return;
    let savedDraft = (session.returnDraft || session.draft) as { cart?: unknown } | undefined;
    if (!savedDraft && session.cartSignature) {
      try {
        savedDraft = JSON.parse(session.cartSignature) as { cart?: unknown };
      } catch {
        savedDraft = undefined;
      }
    }
    if (savedDraft?.cart && !readJsonStorage(local, `cart_save_${tenant()}`)) {
      local.setItem(`cart_save_${tenant()}`, JSON.stringify(savedDraft));
    }
    detach(session);
    completeDetail(session);
    if (session.id) {
      local.setItem(archiveKey(session.id), JSON.stringify({ id: session.id, token: session.token, terminal: true }));
    }
  };

  const terminal = (session: PaymentSessionRecord) => {
    if (matches(session)) {
      completeDetail(session);
      detach(session);
    }
    remember({ ...session, terminal: true });
  };

  const api = async (
    path: string,
    session: PaymentSessionRecord,
    body?: unknown
  ): Promise<PaymentResultDto> => {
    const separator = path.includes('?') ? '&' : '?';
    const url = `${options.getWorkerBase()}${path}${separator}tenant_id=${encodeURIComponent(tenant())}`;
    const response = await fetcher(url, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Payment-Token': session.token
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(65000)
    });
    const data = (await response.json()) as PaymentResultDto & { code?: string };
    if (!response.ok) {
      const error = new Error(data.code || 'PAYMENT_FAILED') as PaymentApiError;
      error.status = response.status;
      throw error;
    }
    return data;
  };

  const resolve = async (session: PaymentSessionRecord): Promise<PaymentResultDto> => {
    const path = session.id
      ? `/api/payments/${encodeURIComponent(session.id)}`
      : `/api/payments/checkout?operationId=${encodeURIComponent(session.payload?.operationId || '')}`;
    const data = await api(path, session);
    if (session.id && data.id !== session.id) throw new Error('PAYMENT_RESPONSE_MISMATCH');
    if (!session.id && matches(session)) {
      session.id = data.id;
      save({ ...active(), id: data.id, token: session.token });
    }
    return data;
  };

  const providerTarget = (data: Pick<PaymentResultDto, 'paymentUrl' | 'appUrl'>): PaymentProviderTarget => {
    const nav = typeof navigator !== 'undefined' ? navigator : ({ userAgent: '', platform: '', maxTouchPoints: 0 } as const);
    const ua = nav.userAgent || '';
    let mobile =
      /Android|iPhone|iPad|iPod/i.test(ua) ||
      (/MacIntel|Macintosh/.test(nav.platform || ua) && (nav.maxTouchPoints || 0) > 1);
    try {
      const maybeWindow = typeof window !== 'undefined' ? (window as { liff?: { isInClient?: () => boolean } }) : undefined;
      mobile = mobile || maybeWindow?.liff?.isInClient?.() === true;
    } catch {
      // Ignore host LIFF inspection errors when LIFF SDK is absent.
    }
    let usesApp = false;
    try {
      const web = new URL(data.paymentUrl || '');
      const app = new URL(data.appUrl || '');
      usesApp =
        mobile &&
        web.protocol === 'https:' &&
        web.hostname === 'web-pay.line.me' &&
        !web.username &&
        !web.password &&
        app.protocol === 'line:' &&
        app.hostname === 'pay' &&
        app.pathname.startsWith('/payment/') &&
        !app.username &&
        !app.password;
    } catch {
      usesApp = false;
    }
    return {
      url: usesApp ? data.appUrl || '' : data.paymentUrl || '',
      webUrl: data.paymentUrl || '',
      usesApp
    };
  };

  const openProvider = (data: Pick<PaymentResultDto, 'paymentUrl' | 'appUrl'>, preferWeb = false) => {
    const target = providerTarget(data);
    try {
      navigate(preferWeb ? target.webUrl : target.url);
    } catch (error) {
      if (preferWeb || !target.usesApp) throw error;
    }
  };

  return {
    active,
    archive,
    same,
    remember,
    save,
    forResult,
    matches,
    signature,
    cleanUrl,
    detach,
    completeDetail,
    paid,
    restore,
    terminal,
    resolve,
    providerTarget,
    openProvider,
    api
  };
}
