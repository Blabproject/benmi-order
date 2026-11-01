import { tenantIsDeleted } from './utils/tenant-lifecycle';
import { getOptionCatalog, saveOptionEntity } from './modules/option-groups';
import { getModifierLibrary } from './modules/modifier-library';
import { Env } from './types/env';
import { corsHeaders, json } from './utils/http';
import { handleLineWebhook } from './modules/line';
import { createOrder, appendOrder, updateOrder, getOrders, getWaitingCount, getHistorySummary, getOrdersByDate, getHistoryAll, handleOrdersMigration, getOrderEditContext, modifyOrder } from './modules/orders';
import { getConfig, updateConfig } from './modules/config';
import { getMenu, updateMenu, updateStockStatus, updateBundleRule, saveBundleProduct, getTenantId } from './modules/menu';
import { handleAuth, handleAuthChange, handleCreateTempLink, handleVerifyTempLink } from './modules/auth';
import { getImageList, getImage, updateImage, deleteImage } from './modules/image';
import { resolveTenantContext } from './modules/tenant';
import { handleLineWebhookProbe, LineRuntimeError } from './modules/line-runtime';
import { handleAdminRoute } from './modules/admin';
import { handleStaffRoute } from './modules/staff';
import { getTenantBootstrap } from './modules/bootstrap';
import { getItemAnalyticsReport } from './modules/reports';
import { getMarketplaceTenants } from './modules/marketplace';
import { requestOrderReceiptPush, processPendingOrderReceipts } from './modules/line-order-receipts';
import { recordLiffClientError } from './modules/line-client-telemetry';

export default {
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(processPendingOrderReceipts(env));
  },
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      const url = new URL(request.url);
      const path = url.pathname;

      if (request.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders() });
      }

      // 1. Admin API Routes
      if (path.startsWith("/api/admin")) {
        return handleAdminRoute(request, env, path);
      }

      const webhookTenant = path.match(/^\/webhook\/([a-zA-Z0-9_-]+)(?:\/verify\/[a-f0-9-]{36})?$/);
      if (webhookTenant && await tenantIsDeleted(env.DB, webhookTenant[1])) return json({ error: 'TENANT_DELETED' }, 410, { 'Cache-Control': 'no-store' });
      // 2. LINE Webhook Routes
      if (request.method === "POST") {
        const probeMatch = path.match(/^\/webhook\/([a-zA-Z0-9_-]+)\/verify\/([a-f0-9-]{36})$/);
        if (probeMatch) return handleLineWebhookProbe(request, env, probeMatch[1], probeMatch[2]);
        // Legacy Webhook Path (/webhook or /) -> Fallback to "benmi" tenant
        if (path === "/webhook" || path === "/") {
          const tenantCtx = await resolveTenantContext("benmi", env);
          if (!tenantCtx) return json({ error: 'Unknown or inactive tenant' }, 404);
          return handleLineWebhook(request, env, ctx, tenantCtx);
        }

        // Path-Based Webhook Routing (/webhook/:tenantId)
        const webhookMatch = path.match(/^\/webhook\/([a-zA-Z0-9_-]+)$/);
        if (webhookMatch) {
          const tenantId = webhookMatch[1];
          const tenantCtx = await resolveTenantContext(tenantId, env);
          if (!tenantCtx) {
            return json({ error: `Unknown or inactive tenant: ${tenantId}` }, 404);
          }
          return handleLineWebhook(request, env, ctx, tenantCtx);
        }
      }

      // 3. Resolve Tenant Context for API Requests
      const tenantId = getTenantId(request);
      if (path.startsWith('/api/') && !['/api/health','/api/marketplace','/api/marketplace/tenants'].includes(path)
        && await tenantIsDeleted(env.DB, tenantId)) return json({ error: 'TENANT_DELETED' }, 410, { 'Cache-Control': 'no-store' });
      const tenantCtx = await resolveTenantContext(tenantId, env);

      // 4. Staff API Routes
      if (path.startsWith("/api/staff")) {
        return handleStaffRoute(request, env, path, tenantCtx);
      }

      // 5. API Endpoints
      if (request.method === "POST" && path === "/api/line/order-receipt/push") return requestOrderReceiptPush(request, env, tenantCtx);
      if (request.method === "POST" && path === "/api/line/client-error") return recordLiffClientError(request, tenantCtx);
      if (request.method === "GET" && (path === "/api/marketplace/tenants" || path === "/api/marketplace")) return getMarketplaceTenants(request, env);
      if (request.method === "GET" && (path === "/api/tenant/bootstrap" || path === "/api/bootstrap")) return getTenantBootstrap(request, env);
      if (request.method === "GET" && (path === "/api/order/edit-context" || path === "/api/orders/edit-context")) return getOrderEditContext(request, env, tenantCtx);
      if (request.method === "POST" && (path === "/api/orders/modify" || path === "/api/modify")) return modifyOrder(request, env, ctx, tenantCtx);
      if (request.method === "POST" && path === "/api/create") return createOrder(request, env, ctx, tenantCtx);
      if (request.method === "POST" && (path === "/api/orders/append" || path === "/api/append")) return appendOrder(request, env, ctx, tenantCtx);
      if (request.method === "POST" && path === "/api/update") return updateOrder(request, env, ctx, tenantCtx);
      if (request.method === "GET" && path === "/api/orders/waiting-count") return getWaitingCount(request, env);
      if (request.method === "GET" && path === "/api/orders") return getOrders(request, env);
      if (request.method === "GET" && path === "/api/orders/history-summary") return getHistorySummary(request, env);
      if (request.method === "GET" && path === "/api/orders/by-date") return getOrdersByDate(request, env);
      if (request.method === "GET" && path === "/api/orders/history-all") return getHistoryAll(request, env);
      if (request.method === "GET" && path === "/api/reports/items-analytics") return getItemAnalyticsReport(request, env);
      if (request.method === "GET" && path === "/api/config") return getConfig(request, env, tenantCtx);
      if (request.method === "POST" && path === "/api/config") return updateConfig(request, env, tenantCtx);
      if (request.method === "GET" && path === "/api/menu/options") return getOptionCatalog(request, env);
      if (request.method === "POST" && path === "/api/menu/product") return saveOptionEntity(request, env, 'product');
      if (request.method === "POST" && path === "/api/menu/option-group") return saveOptionEntity(request, env, 'group');
      if (request.method === "GET" && path === "/api/menu/modifier-library") return getModifierLibrary(request, env);
      if (request.method === "GET" && path === "/api/menu") return getMenu(request, env);
      if (request.method === "POST" && path === "/api/menu") return updateMenu(request, env);
      if (request.method === "POST" && path === "/api/menu/stock-status") return updateStockStatus(request, env);
      if (request.method === "POST" && path === "/api/menu/bundle-rules") return updateBundleRule(request, env);
      if (request.method === "POST" && path === "/api/menu/bundles") return saveBundleProduct(request, env);
      if ((request.method === "GET" || request.method === "HEAD") && path === "/api/image_list") return getImageList(request, env);
      if ((request.method === "GET" || request.method === "HEAD") && path === "/api/image") return getImage(request, env);
      if (request.method === "POST" && path === "/api/image") return updateImage(request, env);
      if (request.method === "DELETE" && path === "/api/image") return deleteImage(request, env);
      if ((request.method === "POST" || request.method === "GET") && path === "/api/auth") return handleAuth(request, env, url, tenantCtx);
      if (request.method === "POST" && path === "/api/auth/change") return handleAuthChange(request, env, tenantCtx);
      if (request.method === "POST" && path === "/api/auth/templink") return handleCreateTempLink(request, env, tenantCtx);
      if (request.method === "GET" && path === "/api/auth/templink") return handleVerifyTempLink(request, env, tenantCtx);
      if (request.method === "GET" && path === "/api/health") {
        return json({
          status: "ok",
          service: "benmi-worker",
          commit: env.BUILD_COMMIT || null,
          environment: env.BUILD_ENVIRONMENT || null,
          dirty: env.BUILD_DIRTY !== "false",
          tenantId: tenantCtx?.tenantId || tenantId,
          timestamp: new Date().toISOString(),
        });
      }

      return new Response("Not Found", { status: 404, headers: corsHeaders() });
    } catch (err: any) {
      if (err instanceof LineRuntimeError) return json({ error: err.code }, err.status);
      console.error("[Fatal API Error]", err);
      return json({ error: err.message || "Internal Server Error", stack: err.stack }, 500);
    }
  }
};
