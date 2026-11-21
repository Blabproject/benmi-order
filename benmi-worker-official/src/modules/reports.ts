import { Env } from '../types/env';
import { json } from '../utils/http';
import { getTenantId } from './menu';
import { ItemAnalyticsSummary } from '../types/index';
import { createReportRepository } from '../repositories';

export async function getItemAnalyticsReport(request: Request, env: Env): Promise<Response> {
  const tenantId = getTenantId(request);
  if (!env.DB) {
    return json({ error: "Database not configured", code: "NO_DB" }, 500);
  }

  const url = new URL(request.url);
  const range = url.searchParams.get("range") || "today"; // 'today' | '7d' | '30d' | 'custom'
  const customStart = url.searchParams.get("start_date");
  const customEnd = url.searchParams.get("end_date");

  // Compute UTC+8 (Asia/Taipei) datetime bounds
  const nowTw = new Date(Date.now() + 8 * 3600000);
  const todayTwStr = `${nowTw.getUTCFullYear()}-${String(nowTw.getUTCMonth() + 1).padStart(2, "0")}-${String(nowTw.getUTCDate()).padStart(2, "0")}`;

  let startUtcIso: string;
  let endUtcIso: string = new Date().toISOString().replace("T", " ").replace(/\.\d+Z$/, "");

  let displayStartDate = todayTwStr;
  let displayEndDate = todayTwStr;

  if (range === "today") {
    displayStartDate = todayTwStr;
    displayEndDate = todayTwStr;
    startUtcIso = new Date(new Date(`${todayTwStr}T00:00:00+08:00`).getTime()).toISOString().replace("T", " ").replace(/\.\d+Z$/, "");
  } else if (range === "7d") {
    const d7AgoTw = new Date(nowTw.getTime() - 6 * 86400000);
    displayStartDate = `${d7AgoTw.getUTCFullYear()}-${String(d7AgoTw.getUTCMonth() + 1).padStart(2, "0")}-${String(d7AgoTw.getUTCDate()).padStart(2, "0")}`;
    startUtcIso = new Date(new Date(`${displayStartDate}T00:00:00+08:00`).getTime()).toISOString().replace("T", " ").replace(/\.\d+Z$/, "");
  } else if (range === "30d") {
    const d30AgoTw = new Date(nowTw.getTime() - 29 * 86400000);
    displayStartDate = `${d30AgoTw.getUTCFullYear()}-${String(d30AgoTw.getUTCMonth() + 1).padStart(2, "0")}-${String(d30AgoTw.getUTCDate()).padStart(2, "0")}`;
    startUtcIso = new Date(new Date(`${displayStartDate}T00:00:00+08:00`).getTime()).toISOString().replace("T", " ").replace(/\.\d+Z$/, "");
  } else if (range === "custom" && customStart && /^\d{4}-\d{2}-\d{2}$/.test(customStart)) {
    displayStartDate = customStart;
    displayEndDate = (customEnd && /^\d{4}-\d{2}-\d{2}$/.test(customEnd)) ? customEnd : todayTwStr;
    startUtcIso = new Date(new Date(`${displayStartDate}T00:00:00+08:00`).getTime()).toISOString().replace("T", " ").replace(/\.\d+Z$/, "");
    endUtcIso = new Date(new Date(`${displayEndDate}T23:59:59+08:00`).getTime()).toISOString().replace("T", " ").replace(/\.\d+Z$/, "");
  } else {
    // Default fallback to today
    startUtcIso = new Date(new Date(`${todayTwStr}T00:00:00+08:00`).getTime()).toISOString().replace("T", " ").replace(/\.\d+Z$/, "");
  }

  try {
    const reportRepo = createReportRepository(env.DB);
    const { items, channels, totalItemsSold, totalRevenue, totalOrders } = await reportRepo.getItemAnalytics(
      tenantId,
      startUtcIso,
      endUtcIso
    );

    const summary: ItemAnalyticsSummary = {
      tenantId,
      range,
      startDate: displayStartDate,
      endDate: displayEndDate,
      totalItemsSold,
      totalRevenue,
      totalOrders,
      topItem: items.length > 0 ? items[0] : null,
      items,
      ...(channels && channels.length > 0 ? { channels } : {})
    };

    return json(summary);
  } catch (e: any) {
    console.error("[getItemAnalyticsReport] D1 error:", e);
    return json({ error: "Failed to generate item analytics report", details: e.message }, 500);
  }
}

