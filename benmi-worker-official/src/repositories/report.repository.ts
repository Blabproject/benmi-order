import type { ChannelAnalyticsRow, ItemAnalyticsRow } from '../types';
import type { ReportRepository, ReportItemAnalyticsResult, RawChannelAnalyticsRow, RawItemAnalyticsRow } from './types';
import { hasDbColumn } from '../modules/operating-shifts';

export function createReportRepository(db: D1Database): ReportRepository {
  return {
    async getItemAnalytics(
      tenantId: string,
      startUtcIso: string,
      endUtcIso: string
    ): Promise<ReportItemAnalyticsResult> {
      const { results } = await db.prepare(
        `SELECT 
           oi.item_name,
           oi.category_name,
           SUM(oi.quantity) AS total_quantity,
           SUM(oi.subtotal) AS total_sales,
           COUNT(DISTINCT oi.order_key) AS order_appearances,
           GROUP_CONCAT(oi.selected_options, '|||') AS all_options_raw
         FROM order_items oi
         JOIN orders o ON oi.order_key = o.key
         WHERE oi.tenant_id = ?
           AND o.status IN ('DONE', 'PICKED_UP', 'PAID')
           AND oi.created_at >= ?
           AND oi.created_at <= ?
         GROUP BY oi.item_name
         ORDER BY total_quantity DESC, total_sales DESC`
      ).bind(tenantId, startUtcIso, endUtcIso).all<RawItemAnalyticsRow>();

      const rawRows = results || [];
      let totalItemsSold = 0;
      let totalRevenue = 0;

      const items: ItemAnalyticsRow[] = rawRows.map(r => {
        const qty = Number(r.total_quantity) || 0;
        const sales = Number(r.total_sales) || 0;
        const appearances = Number(r.order_appearances) || 0;
        totalItemsSold += qty;
        totalRevenue += sales;

        // Parse options breakdown
        const optionsBreakdown: { [optName: string]: number } = {};
        const allOptRaw = String(r.all_options_raw || '');
        if (allOptRaw) {
          const optionChunks = allOptRaw.split('|||');
          for (const chunk of optionChunks) {
            try {
              const parsed = JSON.parse(chunk.trim());
              if (Array.isArray(parsed)) {
                for (const opt of parsed) {
                  const choiceName = opt.choice || opt.name || (typeof opt === 'string' ? opt : '');
                  if (choiceName) {
                    optionsBreakdown[choiceName] = (optionsBreakdown[choiceName] || 0) + 1;
                  }
                }
              }
            } catch { }
          }
        }

        return {
          itemName: r.item_name,
          categoryName: r.category_name || 'Món chính',
          totalQuantity: qty,
          totalSales: sales,
          orderAppearances: appearances,
          optionsBreakdown: Object.keys(optionsBreakdown).length > 0 ? optionsBreakdown : undefined
        };
      });

      // Count distinct total orders in range with status DONE, PICKED_UP, PAID
      const orderCountRow = await db.prepare(
        `SELECT COUNT(DISTINCT o.key) as total_orders
         FROM orders o
         WHERE o.tenant_id = ?
           AND o.status IN ('DONE', 'PICKED_UP', 'PAID')
           AND o.created_at >= ?
           AND o.created_at <= ?`
      ).bind(tenantId, startUtcIso, endUtcIso).first<{ total_orders: number }>();

      const totalOrders = Number(orderCountRow?.total_orders) || 0;

      let channels: ChannelAnalyticsRow[] = [];
      if (await hasDbColumn(db, 'orders', 'channel_label')) {
        const chRes = await db.prepare(
          `SELECT
             COALESCE(o.channel_id, 'direct') AS channel_id,
             COALESCE(NULLIF(TRIM(o.channel_label), ''), '一般點餐') AS channel_label,
             COUNT(DISTINCT o.key) AS total_orders,
             COALESCE(SUM(o.total_amount), 0) AS total_sales,
             SUM(CASE WHEN o.dining_option = 'dine_in' THEN 1 ELSE 0 END) AS dine_in_count,
             SUM(CASE WHEN o.dining_option = 'takeaway' THEN 1 ELSE 0 END) AS takeaway_count
           FROM orders o
           WHERE o.tenant_id = ?
             AND o.status IN ('DONE', 'PICKED_UP', 'PAID')
             AND o.created_at >= ?
             AND o.created_at <= ?
           GROUP BY COALESCE(o.channel_id, 'direct'), COALESCE(NULLIF(TRIM(o.channel_label), ''), '一般點餐')
           ORDER BY total_sales DESC, total_orders DESC`
        ).bind(tenantId, startUtcIso, endUtcIso).all<RawChannelAnalyticsRow>();
        channels = (chRes.results || []).map((row) => ({
          channelId: String(row.channel_id || 'direct'),
          channelLabel: String(row.channel_label || '一般點餐'),
          totalOrders: Number(row.total_orders) || 0,
          totalSales: Number(row.total_sales) || 0,
          dineInCount: Number(row.dine_in_count) || 0,
          takeawayCount: Number(row.takeaway_count) || 0,
        }));
      }

      return {
        items,
        ...(channels.length > 0 ? { channels } : {}),
        totalItemsSold,
        totalRevenue,
        totalOrders
      };
    }
  };
}
