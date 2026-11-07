/**
 * Serve the marketplace on explore.blabfood.app and POS on pos.blabfood.app.
 *
 * This is an internal asset fetch: the address bar remains on the clean
 * domain and no redirect is added to the request path.
 */
const EXPLORE_HOST = "explore.blabfood.app";
const POS_HOST = "pos.blabfood.app";
const ORDER_HOST = "order.blabfood.app";

function isLineCallback(url) {
  return [...url.searchParams.keys()].some(key => key === 'code' || key === 'state' || key === 'access_token' || key.startsWith('liff.')) ||
    url.searchParams.has('liffClientId') || url.searchParams.has('liffRedirectUri');
}

function orderError(message, status) {
  return new Response(message, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
}

async function serveCustomerOrder(context, url, tenantId) {
  const directTenants = [...url.searchParams.getAll('tenant_id'), ...url.searchParams.getAll('tenant')];
  if (directTenants.some(value => value !== tenantId)) return orderError('點餐連結的店家資料不一致。', 400);
  try {
    const response = await fetch(`https://benmi-worker-official.thuanmnc.workers.dev/api/config?tenant_id=${encodeURIComponent(tenantId)}`, {
      cache: 'no-store', signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) return orderError('無法讀取店家設定，請稍後重試。', response.status === 404 ? 404 : 503);
    const config = await response.json();
    if (config.tenantId !== tenantId || !['legacy', 'blabfood'].includes(config.customerOrderDomain)) {
      return orderError('無法讀取店家設定，請稍後重試。', 503);
    }
    if (!isLineCallback(url) && (config.customerOrderDomain === 'legacy' || url.pathname === '/' || url.pathname === '/index.html')) {
      const target = new URL(config.orderUrl);
      if (!['https://benmi-order.pages.dev', 'https://blabfood.app', 'https://www.blabfood.app', 'https://order.blabfood.app'].includes(target.origin)) {
        return orderError('店家點餐連結設定有誤。', 503);
      }
      for (const [key, value] of url.searchParams) {
        if (key !== 'tenant' && key !== 'tenant_id') target.searchParams.set(key, value);
      }
      if (config.customerOrderDomain === 'legacy') target.searchParams.set('tenant_id', tenantId);
      return new Response(null, { status: 302, headers: { Location: target.toString(), 'Cache-Control': 'no-store' } });
    }
    // Internal fetch keeps both primary/secondary LIFF paths and SDK parameters intact.
    return serveInternalAsset(context, '/');
  } catch {
    return orderError('無法讀取店家設定，請稍後重試。', 503);
  }
}

const RESERVED_POS_PATHS = new Set([
  "orders",
  "orders.html",
  "index",
  "index.html",
  "marketplace",
  "marketplace.html",
  "landing",
  "landing.html",
  "payment-result",
  "staff-order",
  "favicon.ico",
  "robots.txt",
  "manifest.json",
  "css",
  "js",
  "icons",
  "fonts",
  "sound",
  "audio",
  "dist",
  "api"
]);

function isPosRoute(pathname) {
  if (pathname === "/" || pathname === "/index.html" || pathname === "/orders" || pathname === "/orders/") {
    return true;
  }
  // Pattern /:tenant/orders or /:tenant/orders/
  const ordersMatch = pathname.match(/^\/([a-zA-Z0-9_-]+)\/orders\/?$/);
  if (ordersMatch) {
    return !RESERVED_POS_PATHS.has(ordersMatch[1]);
  }
  // Pattern /:tenant or /:tenant/ (single segment, no file extension)
  const tenantMatch = pathname.match(/^\/([a-zA-Z0-9_-]+)\/?$/);
  if (tenantMatch) {
    const seg = tenantMatch[1];
    if (!RESERVED_POS_PATHS.has(seg) && !seg.includes(".")) {
      return true;
    }
  }
  return false;
}

async function serveInternalAsset(context, assetPath) {
  const assetUrl = new URL(context.request.url);
  assetUrl.pathname = assetPath;
  let response = await context.env.ASSETS.fetch(new Request(assetUrl, context.request));
  if (response.status >= 300 && response.status < 400 && response.headers.has("location")) {
    const redirectUrl = new URL(response.headers.get("location"), context.request.url);
    response = await context.env.ASSETS.fetch(new Request(redirectUrl, context.request));
  }
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "public, max-age=0, must-revalidate");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function onRequest(context) {
  const url = new URL(context.request.url);

  // The embedded staff menu uses the shared customer document on the POS host.
  if (url.hostname === POS_HOST && url.searchParams.get('mode') === 'staff' &&
      ['/', '/index.html'].includes(url.pathname) && ['GET', 'HEAD'].includes(context.request.method)) {
    return serveInternalAsset(context, '/');
  }

  if (url.hostname === ORDER_HOST && ['GET', 'HEAD'].includes(context.request.method)) {
    const match = url.pathname.match(/^\/([a-zA-Z0-9_-]+)\/?$/);
    if (match && !RESERVED_POS_PATHS.has(match[1])) return serveCustomerOrder(context, url, match[1]);
    if (url.pathname === '/' || url.pathname === '/index.html') {
      const tenantId = url.searchParams.get('tenant_id') || url.searchParams.get('tenant');
      if (tenantId && /^[a-zA-Z0-9_-]+$/.test(tenantId) && !RESERVED_POS_PATHS.has(tenantId)) return serveCustomerOrder(context, url, tenantId);
      return orderError('請使用包含店家名稱的點餐連結。', 400);
    }
  }

  // 1. Explore Marketplace routing: explore.blabfood.app -> /marketplace
  if (url.hostname === EXPLORE_HOST && (url.pathname === "/" || url.pathname === "/index.html")) {
    return serveInternalAsset(context, "/marketplace");
  }

  // 2. POS Dashboard routing: pos.blabfood.app -> /orders
  if (url.hostname === POS_HOST && isPosRoute(url.pathname)) {
    return serveInternalAsset(context, "/orders");
  }

  return context.next();
}
