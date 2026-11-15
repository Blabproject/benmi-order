import type { ItemAnalyticsRow } from '../types';
import type { ReportRepository, ReportItemAnalyticsResult, RawItemAnalyticsRow } from './types';

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
           AND o.status IN ('READY', 'COMPLETED')
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
           AND o.status IN ('READY', 'COMPLETED')
           AND o.created_at >= ?
           AND o.created_at <= ?`
      ).bind(tenantId, startUtcIso, endUtcIso).first<{ total_orders: number }>();

      const totalOrders = Number(orderCountRow?.total_orders) || 0;

      return {
        items,
        totalItemsSold,
        totalRevenue,
        totalOrders
      };
    }
  };
}
