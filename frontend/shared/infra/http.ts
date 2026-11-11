export type RuntimeEnvironment = 'dev' | 'staging' | 'prod';

export class ApiClientError extends Error {
  readonly status: number;
  readonly payload: unknown;

  constructor(message: string, status: number, payload: unknown = null) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.payload = payload;
  }
}

const WORKER_URLS: Record<RuntimeEnvironment, string> = {
  dev: 'https://platform-worker-dev.thuanmnc.workers.dev',
  staging: 'https://platform-worker-staging.thuanmnc.workers.dev',
  prod: 'https://benmi-worker-official.thuanmnc.workers.dev'
};

/** Resolves Worker API origin using query override or preview hostname. */
export function resolveWorkerBase(locationLike: { hostname: string; search: string } = window.location): string {
  const params = new URLSearchParams(locationLike.search);
  const envParam = params.get('env');
  if (envParam === 'dev' || envParam === 'staging' || envParam === 'prod') {
    return WORKER_URLS[envParam];
  }
  if (locationLike.hostname.startsWith('staging.') || locationLike.hostname.includes('-staging.')) {
    return WORKER_URLS.staging;
  }
  if (locationLike.hostname.startsWith('dev.') || locationLike.hostname.includes('-dev.')) {
    return WORKER_URLS.dev;
  }
  return WORKER_URLS.prod;
}

/** Fetches JSON with timeout and structured HTTP error normalization. */
export async function fetchJson<T>(url: string, init: RequestInit = {}, timeoutMs = 20000): Promise<T> {
  const response = await fetch(url, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(timeoutMs)
  });

  const text = await response.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!response.ok) {
    const errMsg =
      parsed && typeof parsed === 'object' && 'error' in parsed && typeof (parsed as { error: unknown }).error === 'string'
        ? (parsed as { error: string }).error
        : `HTTP_${response.status}`;
    throw new ApiClientError(errMsg, response.status, parsed);
  }

  return parsed as T;
}
