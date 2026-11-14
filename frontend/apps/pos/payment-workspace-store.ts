import { formatOrderCode } from '@shared/contracts/order-formatters';
import type {
  PaymentAttentionCountDto,
  PaymentConfigResponseDto,
  PaymentTransactionsResponseDto,
  PaymentWorkspaceItemDto,
  PaymentWorkspaceSummaryDto,
  PaymentWorkspaceView
} from '@shared/contracts/payment-workspace';
import { translatePos, type PosLocale, type PosTranslationKey } from '@shared/i18n/pos-dictionary';

export interface PaymentWorkspaceApiError extends Error {
  code?: string;
  status?: number;
}

export interface PaymentPromptDialogState {
  id: number;
  kind: 'pin' | 'refund';
  title: string;
  hint?: string;
  summary?: {
    key: string;
    amount: string;
  };
  notice?: string;
  pinChangeRequired: boolean;
  errorKey: PosTranslationKey | null;
  busy: boolean;
}

export interface PaymentWorkspaceSnapshot {
  locale: PosLocale;
  scope: string;
  configured: boolean | null;
  configError: boolean;
  configBusy: boolean;
  count: number | null;
  countError: boolean;
  checkedAt: number | null;
  view: PaymentWorkspaceView;
  filters: {
    from: string;
    to: string;
    status: string;
    q: string;
  };
  items: PaymentWorkspaceItemDto[];
  summary: PaymentWorkspaceSummaryDto | null;
  nextCursor: string | null;
  loaded: boolean;
  auth: string | null;
  error: PosTranslationKey | null;
  listBusy: boolean;
  loginBusy: boolean;
  detailOpen: boolean;
  detail: PaymentWorkspaceItemDto | null;
  detailBusy: boolean;
  detailMessage: PosTranslationKey | null;
  actionBusy: boolean;
  pinChangeRequired: boolean;
  pinChanged: boolean;
  notice: PosTranslationKey | null;
  prompt: PaymentPromptDialogState | null;
}

export interface PaymentWorkspaceDependencies {
  getTenantId: () => string;
  getWorkerBase: () => string;
  getLocale: () => PosLocale;
  isWorkspaceOpen: () => boolean;
  isDocumentHidden?: () => boolean;
  fetcher?: typeof fetch;
  sessionStorageRef?: Storage | null;
  onStartPinChange?: (scope: string) => void;
  onSwitchToPaymentsTab?: () => void;
  onFetchOrders?: () => Promise<void> | void;
  onOpenSupport?: () => void;
  onResetStorePinChangeForm?: () => void;
  onFocusButtonAfterPinReturn?: (changed: boolean) => void;
}

export interface RefundOrderTarget {
  key: string;
  displayKey?: string | null;
  payment: {
    id: string;
    amount: number;
  };
}

function taipeiToday(): string {
  return new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
}

function cancelledAuthError(): PaymentWorkspaceApiError {
  const err = new Error('PAYMENT_AUTH_CANCELLED') as PaymentWorkspaceApiError;
  err.code = 'PAYMENT_AUTH_CANCELLED';
  return err;
}

export function resolvePaymentErrorKey(error: unknown): PosTranslationKey {
  const code = (error as PaymentWorkspaceApiError | undefined)?.code;
  if (code === 'INVALID_DATE_RANGE') return 'paymentInvalidRange';
  if (code === 'INVALID_PASSWORD') return 'paymentInvalidPIN';
  if (code === 'PAYMENT_PIN_CHANGE_REQUIRED') return 'paymentDefaultPIN';
  if (code === 'SESSION_REQUIRED') return 'paymentSessionExpired';
  if (code === 'PAYMENT_RATE_LIMIT') return 'paymentRateLimited';
  return 'paymentError';
}

export function formatPaymentMoney(amount: number, locale: PosLocale): string {
  return `TWD ${new Intl.NumberFormat(locale === 'vi' ? 'vi-VN' : 'zh-TW').format(amount)}`;
}

export function formatPaymentTimestamp(value: number | null | undefined, locale: PosLocale): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'zh-TW', {
    timeZone: 'Asia/Taipei',
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(value);
}

export function resolvePaymentStatusLabel(status: string, locale: PosLocale): string {
  const key = `payment${status}` as PosTranslationKey;
  const translated = translatePos(locale, key);
  return translated || status;
}

export function createPaymentWorkspaceStore(deps: PaymentWorkspaceDependencies) {
  const fetcher = deps.fetcher ?? ((input, init) => window.fetch(input, init));
  const getStorage = (): Storage | null => {
    if (deps.sessionStorageRef !== undefined) return deps.sessionStorageRef;
    try {
      return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
    } catch {
      return null;
    }
  };
  const isHidden = () => (deps.isDocumentHidden ? deps.isDocumentHidden() : typeof document !== 'undefined' && document.hidden);
  const contextKey = () => `${deps.getWorkerBase()}|${deps.getTenantId()}`;
  const sessionKey = () => `staff_session_token_${deps.getTenantId()}`;

  let dialogSeq = 0;
  let listController: AbortController | null = null;
  let countController: AbortController | null = null;
  let detailController: AbortController | null = null;
  let sessionPromise: Promise<void> | null = null;
  let generation = 0;
  let activePromptResolver: ((value: unknown) => void) | null = null;
  let activePromptSubmitHandler: ((values: Record<string, string>) => Promise<unknown>) | null = null;
  let activePromptScope = '';

  const readSavedView = (scope: string): PaymentWorkspaceView => {
    try {
      return getStorage()?.getItem(`payment_view_${scope}`) === 'history' ? 'history' : 'attention';
    } catch {
      return 'attention';
    }
  };

  const makeInitialState = (): PaymentWorkspaceSnapshot => {
    const scope = contextKey();
    const today = taipeiToday();
    return {
      locale: deps.getLocale(),
      scope,
      configured: null,
      configError: false,
      configBusy: false,
      count: null,
      countError: false,
      checkedAt: null,
      view: readSavedView(scope),
      filters: { from: today, to: today, status: '', q: '' },
      items: [],
      summary: null,
      nextCursor: null,
      loaded: false,
      auth: null,
      error: null,
      listBusy: false,
      loginBusy: false,
      detailOpen: false,
      detail: null,
      detailBusy: false,
      detailMessage: null,
      actionBusy: false,
      pinChangeRequired: false,
      pinChanged: false,
      notice: null,
      prompt: null
    };
  };

  let state: PaymentWorkspaceSnapshot = makeInitialState();
  const listeners = new Set<() => void>();

  const emit = () => {
    for (const listener of listeners) listener();
  };

  const setState = (patch: Partial<PaymentWorkspaceSnapshot>) => {
    state = { ...state, ...patch };
    emit();
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  const getSnapshot = () => state;

  const abortControllers = () => {
    listController?.abort();
    listController = null;
    countController?.abort();
    countController = null;
    detailController?.abort();
    detailController = null;
  };

  const dismissPrompt = (result: unknown = null) => {
    const resolver = activePromptResolver;
    activePromptResolver = null;
    activePromptSubmitHandler = null;
    if (state.prompt) {
      setState({ prompt: null });
    }
    if (resolver) resolver(result);
  };

  const lockWorkspace = () => {
    generation += 1;
    listController?.abort();
    listController = null;
    detailController?.abort();
    detailController = null;
    setState({
      auth: null,
      items: [],
      summary: null,
      nextCursor: null,
      loaded: false,
      listBusy: false,
      error: null,
      detailOpen: false,
      detail: null,
      detailBusy: false,
      detailMessage: null
    });
  };

  const requirePinChange = () => {
    setState({
      pinChangeRequired: true,
      pinChanged: false,
      notice: null
    });
    lockWorkspace();
  };

  const ensureContext = () => {
    const nextScope = contextKey();
    if (state.scope === nextScope) return;
    abortControllers();
    dismissPrompt(null);
    deps.onResetStorePinChangeForm?.();
    sessionPromise = null;
    generation = 0;
    state = makeInitialState();
    emit();
  };

  const api = async <T,>(
    path: string,
    body?: unknown,
    bearer?: string | null,
    signal?: AbortSignal
  ): Promise<T> => {
    const scope = contextKey();
    const key = sessionKey();
    const separator = path.includes('?') ? '&' : '?';
    const url = `${deps.getWorkerBase()}${path}${separator}tenant_id=${encodeURIComponent(deps.getTenantId())}`;
    const response = await fetcher(url, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {})
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: signal || AbortSignal.timeout(body === undefined ? 8000 : 95000)
    });
    if (response.status === 401 && scope === contextKey()) {
      try {
        getStorage()?.removeItem(key);
      } catch {
        // Ignore storage failure.
      }
      lockWorkspace();
    }
    const data = (await response.json()) as T & { code?: string };
    if (!response.ok) {
      const error = new Error(data?.code || `HTTP_${response.status}`) as PaymentWorkspaceApiError;
      error.code = data?.code;
      error.status = response.status;
      throw error;
    }
    return data;
  };

  const openPrompt = <T,>(
    config: {
      kind: 'pin' | 'refund';
      title: string;
      hint?: string;
      summary?: { key: string; amount: string };
      notice?: string;
      pinChangeRequired?: boolean;
    },
    onSubmit: (values: Record<string, string>) => Promise<T>
  ): Promise<T | null> => {
    if (activePromptResolver) {
      dismissPrompt(null);
    }
    const scope = contextKey();
    activePromptScope = scope;
    const pinRequired = Boolean(config.pinChangeRequired);
    return new Promise<T | null>((resolve) => {
      activePromptResolver = resolve as (value: unknown) => void;
      activePromptSubmitHandler = onSubmit;
      setState({
        prompt: {
          id: ++dialogSeq,
          kind: config.kind,
          title: config.title,
          hint: config.hint,
          summary: config.summary,
          notice: config.notice,
          pinChangeRequired: pinRequired,
          errorKey: pinRequired ? 'paymentDefaultPIN' : null,
          busy: false
        }
      });
    });
  };

  const submitPrompt = async (values: Record<string, string>) => {
    if (!state.prompt || state.prompt.busy || !activePromptSubmitHandler) return;
    setState({
      prompt: { ...state.prompt, busy: true, errorKey: null }
    });
    try {
      const result = await activePromptSubmitHandler(values);
      dismissPrompt(result);
    } catch (error) {
      const code = (error as PaymentWorkspaceApiError)?.code;
      if (code === 'PAYMENT_PIN_CHANGE_REQUIRED') {
        if (activePromptScope === contextKey()) {
          requirePinChange();
          if (state.prompt) {
            setState({
              prompt: {
                ...state.prompt,
                busy: false,
                pinChangeRequired: true,
                errorKey: 'paymentDefaultPIN'
              }
            });
          }
        }
        return;
      }
      if (code !== 'PAYMENT_AUTH_CANCELLED' && state.prompt) {
        setState({
          prompt: {
            ...state.prompt,
            busy: false,
            errorKey: resolvePaymentErrorKey(error)
          }
        });
      }
    }
  };

  const token = async (forcePrompt = false): Promise<string | null> => {
    ensureContext();
    const currentScope = state.scope;
    const key = sessionKey();
    let old: string | null = null;
    if (!forcePrompt && !state.pinChangeRequired) {
      try {
        old = getStorage()?.getItem(key) ?? null;
      } catch {
        old = null;
      }
    }
    if (old) {
      try {
        await api('/api/payments/session', undefined, old);
        if (state.scope !== currentScope) throw cancelledAuthError();
        setState({ auth: old });
        return old;
      } catch (error) {
        if (state.scope !== currentScope) throw cancelledAuthError();
        if ((error as PaymentWorkspaceApiError).code === 'PAYMENT_PIN_CHANGE_REQUIRED') {
          requirePinChange();
        } else if ((error as PaymentWorkspaceApiError).status !== 401) {
          throw error;
        }
      }
    }

    const locale = deps.getLocale();
    return openPrompt<string>(
      {
        kind: 'pin',
        title: translatePos(locale, 'paymentLogin'),
        hint: translatePos(locale, state.pinChanged ? 'paymentPinChangedLogin' : 'paymentLoginHint'),
        pinChangeRequired: state.pinChangeRequired
      },
      async (values) => {
        if (state.scope !== currentScope) throw cancelledAuthError();
        const data = await api<{ token: string }>('/api/payments/session', values);
        if (state.scope !== currentScope) throw cancelledAuthError();
        try {
          getStorage()?.setItem(key, data.token);
        } catch {
          // Ignore storage error.
        }
        setState({
          auth: data.token,
          pinChangeRequired: false,
          pinChanged: false,
          notice: null
        });
        return data.token;
      }
    );
  };

  const authorized = async <T,>(path: string, body: unknown): Promise<T> => {
    let bearer = await token();
    if (!bearer) throw cancelledAuthError();
    try {
      return await api<T>(path, body, bearer);
    } catch (error) {
      if ((error as PaymentWorkspaceApiError).status !== 401) throw error;
      bearer = await token(true);
      if (!bearer) throw cancelledAuthError();
      return api<T>(path, body, bearer);
    }
  };

  const period = (): { from: string; to: string } =>
    state.view === 'history'
      ? { from: state.filters.from, to: state.filters.to }
      : { from: taipeiToday(), to: taipeiToday() };

  const refreshCount = async () => {
    ensureContext();
    const scope = state.scope;
    if (!state.configured || countController || isHidden()) return;
    const controller = new AbortController();
    countController = controller;
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const data = await api<PaymentAttentionCountDto>(
        '/api/payments/attention/count',
        undefined,
        undefined,
        controller.signal
      );
      if (state.scope !== scope) return;
      if (!Number.isSafeInteger(data.count) || data.count < 0) throw new Error('INVALID_COUNT');
      setState({
        count: data.count,
        checkedAt: data.checkedAt,
        countError: false
      });
    } catch {
      if (state.scope === scope) {
        setState({ countError: true });
      }
    } finally {
      clearTimeout(timeout);
      if (countController === controller) countController = null;
    }
  };

  const refreshData = async (append = false) => {
    const scope = state.scope;
    if (!state.auth || !state.configured || !deps.isWorkspaceOpen() || isHidden() || state.actionBusy) {
      return;
    }
    if (state.listBusy) return;
    const requestGeneration = generation;
    const controller = new AbortController();
    listController = controller;
    setState({ listBusy: true, error: null });
    const timeout = setTimeout(() => controller.abort(), 8000);
    const range = period();
    const params = new URLSearchParams({ view: state.view, limit: '50' });
    if (state.view === 'history') {
      params.set('from', range.from);
      params.set('to', range.to);
      if (state.filters.status) params.set('status', state.filters.status);
      if (state.filters.q) params.set('q', state.filters.q);
    }
    if (append && state.nextCursor) {
      params.set('cursor', state.nextCursor);
    }
    try {
      const [page, summary] = await Promise.all([
        api<PaymentTransactionsResponseDto>(
          `/api/payments/transactions?${params.toString()}`,
          undefined,
          state.auth,
          controller.signal
        ),
        api<PaymentWorkspaceSummaryDto>(
          `/api/payments/summary?${new URLSearchParams(range).toString()}`,
          undefined,
          state.auth,
          controller.signal
        )
      ]);
      if (state.scope !== scope || generation !== requestGeneration) return;
      if (!Array.isArray(page.items)) throw new Error('INVALID_ITEMS');
      const nextItems = append
        ? [...new Map([...state.items, ...page.items].map((item) => [item.id, item])).values()]
        : page.items;
      setState({
        items: nextItems,
        nextCursor: page.nextCursor,
        summary,
        loaded: true
      });
    } catch (error) {
      if (state.scope === scope && generation === requestGeneration && state.auth) {
        const code = (error as PaymentWorkspaceApiError)?.code;
        setState({
          error: code === 'INVALID_DATE_RANGE' ? 'paymentInvalidRange' : 'paymentWorkspaceStale'
        });
      }
    } finally {
      clearTimeout(timeout);
      if (listController === controller) {
        listController = null;
        if (state.scope === scope) {
          setState({ listBusy: false });
        }
      }
    }
  };

  const restoreSession = async () => {
    if (state.pinChangeRequired) return;
    if (sessionPromise) return sessionPromise;
    const scope = state.scope;
    let saved: string | null = null;
    try {
      saved = getStorage()?.getItem(sessionKey()) ?? null;
    } catch {
      saved = null;
    }
    if (!saved) return;
    const pending = (async () => {
      try {
        await api('/api/payments/session', undefined, saved);
        if (state.scope === scope) {
          setState({ auth: saved });
          await refreshData();
        }
      } catch (error) {
        const err = error as PaymentWorkspaceApiError;
        if (state.scope === scope && err.status !== 401) {
          if (err.code === 'PAYMENT_PIN_CHANGE_REQUIRED') {
            requirePinChange();
          } else {
            lockWorkspace();
            setState({ error: 'paymentWorkspaceStale' });
          }
        }
      }
    })();
    sessionPromise = pending;
    try {
      await pending;
    } finally {
      if (sessionPromise === pending) sessionPromise = null;
    }
  };

  const init = async () => {
    ensureContext();
    const scope = state.scope;
    if (state.configBusy) return;
    setState({ configBusy: true, configError: false, locale: deps.getLocale() });
    try {
      const data = await api<PaymentConfigResponseDto>('/api/payments/config');
      if (state.scope !== scope) return;
      const isConfigured = data.linePay?.configured === true;
      setState({ configured: isConfigured });
      if (isConfigured) {
        await refreshCount();
        if (deps.isWorkspaceOpen()) {
          await restoreSession();
        }
      }
    } catch {
      if (state.scope === scope) {
        setState({ configError: true, configured: null });
      }
    } finally {
      if (state.scope === scope) {
        setState({ configBusy: false });
      }
    }
  };

  const refreshAll = async () => {
    ensureContext();
    if (state.configured === null || state.configError) {
      await init();
      return;
    }
    await Promise.allSettled([refreshCount(), refreshData()]);
  };

  const login = async () => {
    ensureContext();
    if (state.loginBusy) return;
    const scope = state.scope;
    setState({ loginBusy: true });
    try {
      const bearer = await token();
      if (bearer && state.scope === scope) {
        setState({ error: null });
        await refreshData();
      }
    } catch (error) {
      if (state.scope === scope && (error as PaymentWorkspaceApiError)?.code !== 'PAYMENT_AUTH_CANCELLED') {
        setState({ error: 'paymentWorkspaceStale' });
      }
    } finally {
      if (state.scope === scope) {
        setState({ loginBusy: false });
      }
    }
  };

  const resetList = () => {
    generation += 1;
    listController?.abort();
    listController = null;
    setState({
      listBusy: false,
      items: [],
      summary: null,
      loaded: false,
      nextCursor: null,
      error: null
    });
  };

  const setView = (view: PaymentWorkspaceView) => {
    ensureContext();
    if (view !== 'attention' && view !== 'history') return;
    if (state.view !== view) {
      resetList();
      try {
        getStorage()?.setItem(`payment_view_${state.scope}`, view);
      } catch {
        // Ignore storage failure.
      }
      setState({ view });
    }
    if (state.auth) {
      void refreshData();
    }
  };

  const applyFilters = (next: { from: string; to: string; status: string; q: string }): boolean => {
    ensureContext();
    const start = Date.parse(`${next.from}T00:00:00+08:00`);
    const end = Date.parse(`${next.to}T00:00:00+08:00`);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || end - start > 30 * 86400000) {
      setState({ error: 'paymentInvalidRange' });
      return false;
    }
    setState({
      filters: {
        from: next.from,
        to: next.to,
        status: next.status,
        q: next.q.trim()
      }
    });
    resetList();
    void refreshData();
    return true;
  };

  const setRange = (days: number): { from: string; to: string } => {
    const end = taipeiToday();
    const start = new Date(Date.parse(`${end}T00:00:00+08:00`) - (days - 1) * 86400000 + 8 * 3600000)
      .toISOString()
      .slice(0, 10);
    applyFilters({ ...state.filters, from: start, to: end });
    return { from: start, to: end };
  };

  const closeDetail = () => {
    detailController?.abort();
    detailController = null;
    if (state.detailOpen || state.detail || state.detailBusy || state.detailMessage) {
      setState({
        detailOpen: false,
        detail: null,
        detailBusy: false,
        detailMessage: null
      });
    }
  };

  const openDetail = async (id: string) => {
    ensureContext();
    if (!state.auth) return;
    closeDetail();
    const scope = state.scope;
    const controller = new AbortController();
    detailController = controller;
    setState({
      detailOpen: true,
      detailBusy: true,
      detail: null,
      detailMessage: null
    });
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const payment = await api<PaymentWorkspaceItemDto>(
        `/api/payments/${encodeURIComponent(id)}`,
        undefined,
        state.auth,
        controller.signal
      );
      if (state.scope === scope && detailController === controller) {
        setState({ detail: payment });
      }
    } catch {
      if (state.scope === scope && detailController === controller && state.auth) {
        setState({ detailMessage: 'paymentWorkspaceStale' });
      }
    } finally {
      clearTimeout(timeout);
      if (detailController === controller) {
        detailController = null;
        if (state.scope === scope) {
          setState({ detailBusy: false });
        }
      }
    }
  };

  const refundOrderPayment = async (
    order: RefundOrderTarget,
    after: (payment: PaymentWorkspaceItemDto) => Promise<void> | void
  ) => {
    if (!(await token())) return;
    const scope = contextKey();
    const operationId = crypto.randomUUID();
    const orderKey = formatOrderCode(order.displayKey || order.key);
    const locale = deps.getLocale();
    await openPrompt<boolean>(
      {
        kind: 'refund',
        title: `${translatePos(locale, 'paymentRefund')} ${orderKey} · TWD ${order.payment.amount}`,
        summary: {
          key: `${orderKey} · LINE Pay`,
          amount: `TWD ${order.payment.amount}`
        },
        notice: translatePos(locale, 'paymentRefundNotice')
      },
      async (values) => {
        if (scope !== contextKey()) throw cancelledAuthError();
        const payment = await authorized<PaymentWorkspaceItemDto>(
          `/api/payments/${encodeURIComponent(order.payment.id)}/refunds`,
          { ...values, operationId }
        );
        if (scope === contextKey()) {
          await after(payment);
        }
        return true;
      }
    );
  };

  const reconcileDetail = async (id: string) => {
    if (state.actionBusy) return;
    const scope = state.scope;
    setState({ actionBusy: true });
    try {
      const payment = await authorized<PaymentWorkspaceItemDto>(
        `/api/payments/${encodeURIComponent(id)}/reconcile`,
        {}
      );
      if (state.scope === scope && state.detail?.id === id) {
        setState({
          detail: payment,
          detailMessage: 'paymentCheckedStatus'
        });
      }
    } catch (error) {
      if (state.scope === scope && state.auth && (error as PaymentWorkspaceApiError)?.code !== 'PAYMENT_AUTH_CANCELLED') {
        setState({ detailMessage: 'paymentWorkspaceStale' });
      }
    } finally {
      if (state.scope === scope) {
        setState({ actionBusy: false });
        await refreshAll();
      }
    }
  };

  const refundDetail = async (payment: PaymentWorkspaceItemDto) => {
    if (state.actionBusy) return;
    const scope = state.scope;
    setState({ actionBusy: true });
    try {
      await refundOrderPayment(
        {
          key: payment.orderKey,
          displayKey: payment.displayKey,
          payment: { id: payment.id, amount: payment.amount }
        },
        async (result) => {
          if (state.scope === scope && state.detail?.id === payment.id) {
            setState({ detail: result, detailMessage: null });
          }
          await deps.onFetchOrders?.();
        }
      );
    } catch (error) {
      if (state.scope === scope && state.auth && (error as PaymentWorkspaceApiError)?.code !== 'PAYMENT_AUTH_CANCELLED') {
        setState({ detailMessage: 'paymentWorkspaceStale' });
      }
    } finally {
      if (state.scope === scope) {
        setState({ actionBusy: false });
        await refreshAll();
      }
    }
  };

  const startPinChange = () => {
    ensureContext();
    if (!state.pinChangeRequired || !deps.onStartPinChange) return;
    const scope = state.scope;
    dismissPrompt(null);
    closeDetail();
    deps.onStartPinChange(scope);
  };

  const returnFromPinChange = (context: { scope?: string } | null | undefined, changed = false) => {
    ensureContext();
    if (!context || context.scope !== state.scope) return;
    if (changed) {
      lockWorkspace();
      setState({
        pinChangeRequired: false,
        pinChanged: true,
        notice: 'paymentPinChangedLogin'
      });
    }
    deps.onSwitchToPaymentsTab?.();
    deps.onFocusButtonAfterPinReturn?.(changed);
  };

  const onTabChange = (tab: string) => {
    ensureContext();
    if (tab !== 'payments') closeDetail();
    if (tab === 'payments' && state.configured) {
      if (state.auth) {
        void refreshData();
      } else {
        void restoreSession();
      }
    }
  };

  const setLocale = (locale: PosLocale) => {
    if (state.locale !== locale) {
      setState({ locale });
    }
  };

  const tick = () => {
    if (isHidden()) return;
    ensureContext();
    if (state.configured === null) {
      void init();
      return;
    }
    if (state.auth) {
      let saved: string | null = null;
      try {
        saved = getStorage()?.getItem(sessionKey()) ?? null;
      } catch {
        saved = null;
      }
      if (saved !== state.auth) {
        lockWorkspace();
      }
    }
    void refreshAll();
  };

  const cleanupPageHide = () => {
    listController?.abort();
    countController?.abort();
    closeDetail();
    dismissPrompt(null);
  };

  return {
    subscribe,
    getSnapshot,
    setLocale,
    init,
    refreshAll,
    refreshCount,
    refreshData,
    login,
    token,
    refundOrderPayment,
    setView,
    applyFilters,
    setRange,
    openDetail,
    closeDetail,
    reconcileDetail,
    refundDetail,
    startPinChange,
    returnFromPinChange,
    onTabChange,
    tick,
    cleanupPageHide,
    submitPrompt,
    dismissPrompt,
    openSupport: () => {
      closeDetail();
      deps.onOpenSupport?.();
    }
  };
}

export type PaymentWorkspaceStore = ReturnType<typeof createPaymentWorkspaceStore>;
