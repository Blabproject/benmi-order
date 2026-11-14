import OrderCode from '../../../../../js/order-code.js';
import LegacyOrderAdapter from '../../../../../js/order-legacy-adapter.js';
import { DetailView } from '../../order-detail';
import { Order, OrderItemInput } from '../../../types/index';
import { TenantContext } from '../../../types/tenant';
import { itemNoteKey } from '../../../utils/order-item-notes';
import LineOrderPresentation from '../../../../../js/line-order-presentation.js';

export function renderReceiptItem(it: OrderItemInput, locale: string) {
  const model = LineOrderPresentation.item(it);
  const price = model.price;
  return {
    type: 'box', layout: 'vertical', spacing: 'none', margin: 'sm', contents: [
      { type: 'box', layout: 'horizontal', contents: [
        { type: 'text', text: model.name || '餐點', size: 'sm', weight: 'bold', color: '#1E293B', flex: 1, wrap: true },
        { type: 'text', text: `×${model.quantity}`, size: 'sm', weight: 'bold', color: '#64748B', flex: 0, margin: 'sm' },
        ...(price ? [{ type: 'text', text: `${price.unit ? LineOrderPresentation.labels(locale).unit + ' ' : ''}$${price.amount}`,
          size: 'sm', weight: 'bold', color: '#0F172A', align: 'end', flex: 0, margin: 'sm', wrap: true }] : [])
      ] },
      ...LineOrderPresentation.flex(model, locale)
    ]
  };
}

export function buildOrderFlexMessage(
  order: Order,
  tenantCtx?: TenantContext | null,
  items?: OrderItemInput[],
  customizations?: Array<{ label: string; value: string }>
): any {
  const structured = DetailView.isSnapshot(order.detailSnapshot);
  if (structured) {
    items = DetailView.lines(order.detailSnapshot);
    customizations = DetailView.globalChoices(order.detailSnapshot);
    order = { ...order, note: DetailView.notes(order.detailSnapshot) };
  }
  const isScheduled = tenantCtx?.allowScheduledPickup !== false;
  const isDineIn = order.diningOption === "dine_in" || ((order.content || "").includes("用餐方式：") && (order.content || "").includes("內用")) || (order.content || "").includes("【內用】");

  let tableNum = (order.tableNumber || "").trim();
  if (!structured && (!tableNum || tableNum === "-")) {
    const tableMatch = (order.content || "").match(/(?:桌號|Bàn)[：:\s]*([^\n\r,，()（）]+)/i) ||
      (order.note || "").match(/(?:桌號|Bàn)[：:\s]*([^\n\r,，()（）]+)/i);
    if (tableMatch) tableNum = tableMatch[1].trim();
  }
  tableNum = tableNum
    .replace(/^(?:桌號|Bàn)[：:\s]*/i, "")
    .replace(/[：:]/g, "")
    .replace(/[()（）]/g, "")
    .replace(/號桌/g, "")
    .replace(/桌/g, "")
    .trim();

  const diningLabel = isDineIn ? (tableNum && tableNum !== "-" ? `內用 (${tableNum} 桌)` : "內用 (現場製作)") : "外帶自取";
  const timeLabel = isDineIn ? "點餐時間" : (isScheduled ? "預計取餐時間" : "訂餐時間");

  // Extract and clean Global Customizations
  const flavorPills: string[] = [];
  const extraPills: string[] = [];

  const cleanItemVal = (v: string) =>
    v.replace(/（\s*[^）]*缺貨[^）]*）/g, '')
     .replace(/\(\s*[^)]*缺貨[^)]*\)/g, '')
     .trim();

  if (structured) {
    (customizations || []).forEach(c => extraPills.push(`${c.label}: ${c.value}`));
  } else if (Array.isArray(customizations) && customizations.length > 0) {
    customizations.forEach(c => {
      const label = (c.label || '').replace(/✦/g, '').replace(/選擇|調整/g, '').replace(/\(朝天椒\)/g, '').replace(/（朝天椒）/g, '').trim();
      const val = cleanItemVal(c.value || '');
      if (label.includes('配料') || label.includes('加價') || label.includes('備註')) {
        extraPills.push(`${label}：${val}`);
      } else {
        flavorPills.push(val);
      }
    });
  } else {
    LegacyOrderAdapter.globalChoices(order).forEach((c: any) => extraPills.push(`${c.label}: ${c.value}`));
  }

  const uniqueFlavors = structured ? flavorPills : Array.from(new Set(flavorPills.filter(Boolean)));
  const uniqueExtras = structured ? extraPills : Array.from(new Set(extraPills.filter(Boolean)));

  const itemComponents: any[] = [];
  const rawItems = Array.isArray(items) ? items : [];
  const locale = tenantCtx?.locale === 'vi' || (order.content || '').includes('Đợt') || (order.content || '').includes('Mang về') ? 'vi' : 'zh-TW';
  if (structured) {
    for (const round of order.detailSnapshot!.rounds) {
      if (order.detailSnapshot!.rounds.length > 1) itemComponents.push({ type: 'text', text: `第 ${round.roundNumber} 輪`, size: 'sm', color: '#64748B', margin: 'md' });
      if (round.legacyContent !== undefined) itemComponents.push({ type: 'text', text: round.legacyContent || '—', wrap: true, size: 'sm' });
      else DetailView.lines({ schemaVersion: 1, rounds: [round] }).forEach((it: OrderItemInput) => itemComponents.push(renderReceiptItem(it, locale)));
    }
  } else if (rawItems.length) {
    rawItems.forEach(it => itemComponents.push(renderReceiptItem(it, locale)));
  } else {
    LegacyOrderAdapter.receiptLines(order.content, itemNoteKey).forEach(({text, isOption}: any) => {
      itemComponents.push({ type: 'text', text: text || '—', size: isOption ? 'xs' : 'sm',
        weight: isOption ? 'regular' : 'bold', color: isOption ? '#64748B' : '#1E293B', wrap: true, margin: 'xs' });
    });
  }
  // A snapshot discount is authoritative even when paid order-level choices change the total.
  if (structured || (rawItems.length && rawItems.every(it => it.subtotal != null && Number.isFinite(Number(it.subtotal))))) {
    const discount = structured ? order.detailSnapshot!.rounds.reduce((sum, round) => sum + Number(round.discount || 0), 0)
      : Math.round((rawItems.reduce((sum, it) => sum + Number(it.subtotal), 0) - Number(order.total)) * 100) / 100;
    if (discount > 0) itemComponents.push({ type: 'box', layout: 'horizontal', margin: 'md', contents: [
      { type: 'text', text: '優惠折抵', size: 'xs', color: '#64748B', flex: 1 },
      { type: 'text', text: `-$${discount}`, size: 'xs', color: '#059669', align: 'end', flex: 0 }
    ] });
  }

  return LineOrderPresentation.paginate({
    type: "bubble",
    size: "kilo",
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "16px",
      spacing: "sm",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: "訂單明細", size: "xs", weight: "bold", color: "#64748B", flex: 0 },
            { type: "text", text: `${OrderCode.format(order.displayKey || order.key)}`, size: "sm", weight: "bold", color: "#059669", align: "end", flex: 1 }
          ]
        },
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: "用餐方式", size: "xs", color: "#64748B", flex: 0 },
            { type: "text", text: diningLabel, size: "sm", weight: "bold", color: isDineIn ? "#7C3AED" : "#059669", align: "end", flex: 1 }
          ]
        },
        { type: "separator", margin: "4px", color: "#E2E8F0" },
        {
          type: "box",
          margin: "4px",
          layout: "vertical",
          spacing: "xs",
          contents: [
            { type: "text", text: "訂單品項", size: "xs", weight: "bold", color: "#64748B", margin: "none" },
            ...itemComponents
          ]
        },
        ...(uniqueFlavors.length > 0 || uniqueExtras.length > 0 ? [
          { type: "separator", margin: "4px", color: "#E2E8F0" },
          {
            type: "box",
            margin: "4px",
            layout: "vertical",
            backgroundColor: "#F8FAFC",
            cornerRadius: "md",
            paddingAll: "10px",
            spacing: "xs",
            contents: [
              {
                type: "text",
                text: "口味設定",
                size: "xxs",
                weight: "bold",
                color: "#94A3B8"
              },
              ...(uniqueFlavors.length > 0 ? [
                {
                  type: "text",
                  text: uniqueFlavors.join(" · "),
                  size: "xs",
                  weight: "bold",
                  color: "#1E293B",
                  wrap: true,
                  margin: "xs"
                }
              ] : []),
              ...uniqueExtras.map(ext => ({
                type: "text",
                text: ext,
                size: "xs",
                color: "#64748B",
                wrap: true,
                margin: "xs"
              }))
            ]
          }
        ] : []),
        ...(order.note && order.note.trim() ? [
          { type: "separator", margin: "4px", color: "#E2E8F0" },
          {
            type: "box",
            margin: "4px",
            layout: "horizontal",
            contents: [
              { type: "text", text: "備註說明", size: "xs", color: "#64748B", flex: 0 },
              { type: "text", text: order.note.trim(), size: "xs", color: "#334155", wrap: true, align: "end", flex: 1 }
            ]
          }
        ] : []),
        { type: "separator", margin: "4px", color: "#E2E8F0" },
        {
          type: "box",
          margin: "4px",
          layout: "horizontal",
          contents: [
            { type: "text", text: timeLabel, size: "xs", color: "#64748B", flex: 0 },
            { type: "text", text: String(order.time || "").replace(/\s*\([^)]*\)/g, '').trim(), size: "sm", weight: "bold", color: "#0F172A", align: "end", flex: 1, wrap: true }
          ]
        },
        {
          type: "box",
          layout: "horizontal",
          alignItems: "center",
          contents: [
            { type: "text", text: order.payment?.status === "PAID" ? (tenantCtx?.locale === "vi" ? "LINE Pay · Đã thanh toán" : "LINE Pay · 已付款") : "總金額", size: "sm", weight: "bold", color: "#64748B", flex: 0 },
            { type: "text", text: `$${order.total}`, size: "xl", weight: "bold", color: "#059669", align: "end", flex: 1 }
          ]
        }
      ]
    },
    footer: {
      type: "box",
      layout: "vertical",
      paddingAll: "16px",
      spacing: "sm",
      contents: (() => {
        const liffBaseUrl = tenantCtx?.liffUrl || (tenantCtx?.liffId ? `https://liff.line.me/${tenantCtx.liffId}` : "https://liff.line.me/");
        const tenantId = tenantCtx?.tenantId || "benmi";
        const buttons: any[] = [];

        if (isDineIn) {
          const appendUrl = `${liffBaseUrl}?tenant_id=${encodeURIComponent(tenantId)}&parent_order_key=${encodeURIComponent(order.key)}&parent_display_key=${encodeURIComponent(order.displayKey || order.key)}&table_number=${encodeURIComponent(tableNum)}&mode=append`;
          buttons.push({
            type: "button",
            style: "primary",
            color: "#7C3AED",
            height: "sm",
            action: {
              type: "uri",
              label: "現場加點餐點",
              uri: appendUrl
            }
          });
        }

        buttons.push({
          type: "button",
          style: isDineIn ? "secondary" : "primary",
          color: isDineIn ? undefined : "#059669",
          height: "sm",
          action: {
            type: "postback",
            label: "查詢訂單進度",
            data: `action=check_progress&order_key=${order.key}`,
            displayText: "查詢訂單進度"
          }
        });

        return buttons;
      })()
    }
  }, itemComponents);
}

export function buildProgressFlexMessage(order: Order, queueAheadCount: number, tenantCtx?: TenantContext | null): any {
  const isScheduled = tenantCtx?.allowScheduledPickup !== false;
  const isDineIn = order.diningOption === "dine_in" || (order.content || "").includes("📍 用餐方式：🍽️ 內用") || (order.content || "").includes("【內用】");
  const diningLabel = isDineIn ? "內用 (現場製作)" : "外帶自取";
  const timeLabel = isDineIn ? "點餐時間" : (isScheduled ? "預計取餐時間" : "訂餐時間");

  let statusTitle = "已收到訂單";
  let statusColor = "#059669";
  let queueText = "店家已收到您的訂單，店員將儘速為您確認！";

  if (order.status === "NEW") {
    statusTitle = "已收到訂單";
    statusColor = "#059669";
    queueText = "店家已收到您的訂單，店員將儘速為您確認！";
  } else if (order.status === "ACCEPTED") {
    statusTitle = "店家製作中";
    statusColor = "#2563EB";
    queueText = queueAheadCount > 0
      ? `前方還有 ${queueAheadCount} 張訂單正在排隊製作`
      : "您的餐點正由店家製作中！";
  } else if (order.status === "DONE") {
    statusTitle = isDineIn ? "餐點製作完成" : "餐點製作完成，可取餐！";
    statusColor = "#059669";
    queueText = isDineIn ? "" : "您的餐點已準備完畢，請儘快前來取餐！";
  } else if (order.status === "PICKED_UP") {
    statusTitle = isDineIn ? "已完成用餐" : "已完成取餐";
    statusColor = "#64748B";
    queueText = "感謝您的訂購，期待再次為您服務！";
  } else if (order.status === "WAITING_CUSTOMER_CHANGE" || order.status === "WAITING_CUSTOMER_REJECT") {
    statusTitle = "訂單微調確認中";
    statusColor = "#D97706";
    queueText = "請查看上方對話並回覆店家確認事項。";
  } else if (order.status === "REJECTED") {
    statusTitle = "訂單已取消";
    statusColor = "#DC2626";
    queueText = "該訂單已被取消。如有需要歡迎再次點餐。";
  }

  return {
    type: "bubble",
    size: "kilo",
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "20px",
      spacing: "md",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: "訂單進度狀態", size: "xs", weight: "bold", color: "#64748B", flex: 0 },
            { type: "text", text: `${OrderCode.format(order.displayKey || order.key)}`, size: "sm", weight: "bold", color: "#0F172A", align: "end", flex: 1 }
          ]
        },
        {
          type: "text",
          text: statusTitle,
          weight: "bold",
          size: "lg",
          color: statusColor,
          wrap: true
        },
        ...(queueText ? [{
          type: "box",
          layout: "vertical",
          backgroundColor: "#F8FAFC",
          cornerRadius: "md",
          paddingAll: "12px",
          contents: [
            { type: "text", text: queueText, size: "sm", color: "#334155", wrap: true }
          ]
        }] : []),
        { type: "separator", margin: "sm", color: "#E2E8F0" },
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: "用餐方式", size: "xs", color: "#64748B", flex: 0 },
            { type: "text", text: diningLabel, size: "sm", weight: "bold", color: isDineIn ? "#7C3AED" : "#059669", align: "end", flex: 1 }
          ]
        },
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: timeLabel, size: "xs", color: "#64748B", flex: 0 },
            { type: "text", text: String(order.time || "").replace(/\s*\([^)]*\)/g, '').trim(), size: "sm", weight: "bold", color: "#0F172A", align: "end", flex: 1, wrap: true }
          ]
        },
        {
          type: "box",
          layout: "horizontal",
          alignItems: "center",
          contents: [
            { type: "text", text: "總金額", size: "sm", weight: "bold", color: "#64748B", flex: 0 },
            { type: "text", text: `$${order.total}`, size: "lg", weight: "bold", color: "#059669", align: "end", flex: 1 }
          ]
        }
      ]
    },
    footer: {
      type: "box",
      layout: "vertical",
      paddingAll: "16px",
      spacing: "sm",
      contents: (() => {
        const liffBaseUrl = tenantCtx?.liffUrl || (tenantCtx?.liffId ? `https://liff.line.me/${tenantCtx.liffId}` : "https://liff.line.me/");
        const tenantId = tenantCtx?.tenantId || "benmi";
        const tableNum = order.tableNumber || "";
        const buttons: any[] = [];

        if (isDineIn && (order.status === "NEW" || order.status === "ACCEPTED" || order.status === "DONE")) {
          const appendUrl = `${liffBaseUrl}?tenant_id=${encodeURIComponent(tenantId)}&parent_order_key=${encodeURIComponent(order.key)}&parent_display_key=${encodeURIComponent(order.displayKey || order.key)}&table_number=${encodeURIComponent(tableNum)}&mode=append`;
          buttons.push({
            type: "button",
            style: "primary",
            color: "#7C3AED",
            height: "sm",
            action: {
              type: "uri",
              label: "現場加點餐點",
              uri: appendUrl
            }
          });
        }

        buttons.push({
          type: "button",
          style: "secondary",
          height: "sm",
          action: {
            type: "postback",
            label: "重新整理進度",
            data: `action=check_progress&order_key=${order.key}`,
            displayText: "查詢訂單進度"
          }
        });

        return buttons;
      })()
    }
  };
}

export function buildAppendConfirmationFlexMessage(
  order: Order,
  newItemsText: string,
  addedAmount: number,
  roundNumber: number,
  tenantCtx?: TenantContext | null,
  items?: OrderItemInput[]
): any {
  let rawTable = (order.tableNumber || "").trim();
  if (!rawTable || rawTable === "-") {
    const tableMatch = (order.content || "").match(/(?:桌號|Bàn)[：:\s]*([^\n\r,，()（）]+)/i) ||
      (order.note || "").match(/(?:桌號|Bàn)[：:\s]*([^\n\r,，()（）]+)/i);
    if (tableMatch) rawTable = tableMatch[1].trim();
  }

  rawTable = rawTable
    .replace(/^(?:桌號|Bàn)[：:\s]*/i, "")
    .replace(/[：:]/g, "")
    .replace(/[()（）]/g, "")
    .replace(/號桌/g, "")
    .replace(/桌/g, "")
    .trim();

  const displayTable = rawTable || "-";

  const contentLines = (newItemsText || "").split("\n").filter(l => l.trim().length > 0);
  const contentComponents = items?.length ? items.map(it => renderReceiptItem(it, tenantCtx?.locale === 'vi' ? 'vi' : 'zh-TW')) : contentLines.map(line => {
    const isOption = line.startsWith("↳") || line.startsWith("-") || line.startsWith("+") || line.startsWith("  ");
    return {
      type: "text",
      text: line,
      size: isOption ? "xs" : "sm",
      color: isOption ? "#64748B" : "#1E293B",
      weight: isOption ? "regular" : "bold",
      wrap: true
    };
  });

  const liffBaseUrl = tenantCtx?.liffUrl || (tenantCtx?.liffId ? `https://liff.line.me/${tenantCtx.liffId}` : "https://liff.line.me/");
  const tenantId = tenantCtx?.tenantId || "benmi";

  return LineOrderPresentation.paginate({
    type: "bubble",
    size: "kilo",
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "16px",
      spacing: "sm",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: `現場加點 (第 ${roundNumber} 輪)`, size: "xs", weight: "bold", color: "#7C3AED", flex: 0 },
            { type: "text", text: `${OrderCode.format(order.displayKey || order.key)}`, size: "sm", weight: "bold", color: "#0F172A", align: "end", flex: 1 }
          ]
        },
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: "桌號", size: "xs", color: "#64748B", flex: 0 },
            { type: "text", text: `${displayTable} 桌`, size: "sm", weight: "bold", color: "#7C3AED", align: "end", flex: 1 }
          ]
        },
        { type: "separator", margin: "4px", color: "#E2E8F0" },
        {
          type: "box",
          margin: "4px",
          layout: "vertical",
          spacing: "xs",
          contents: [
            { type: "text", text: "本次加點品項", size: "xs", weight: "bold", color: "#64748B", margin: "none" },
            ...contentComponents
          ]
        },
        ...(order.note ? [
          { type: "separator", margin: "4px", color: "#E2E8F0" },
          {
            type: "box",
            margin: "4px",
            layout: "horizontal",
            contents: [
              { type: "text", text: "備註說明", size: "xs", color: "#64748B", flex: 0 },
              { type: "text", text: order.note, size: "xs", color: "#334155", wrap: true, align: "end", flex: 1 }
            ]
          }
        ] : []),
        { type: "separator", margin: "4px", color: "#E2E8F0" },
        {
          type: "box",
          margin: "4px",
          layout: "horizontal",
          contents: [
            { type: "text", text: "本次加點金額", size: "xs", color: "#64748B", flex: 0 },
            { type: "text", text: `+$${addedAmount}`, size: "sm", weight: "bold", color: "#7C3AED", align: "end", flex: 1 }
          ]
        },
        {
          type: "box",
          layout: "horizontal",
          alignItems: "center",
          contents: [
            { type: "text", text: "累計總金額", size: "sm", weight: "bold", color: "#64748B", flex: 0 },
            { type: "text", text: `$${order.total}`, size: "xl", weight: "bold", color: "#059669", align: "end", flex: 1 }
          ]
        }
      ]
    },
    footer: {
      type: "box",
      layout: "vertical",
      paddingAll: "16px",
      spacing: "sm",
      contents: [
        {
          type: "button",
          style: "primary",
          color: "#7C3AED",
          height: "sm",
          action: {
            type: "uri",
            label: "再次加點",
            uri: `${liffBaseUrl}?tenant_id=${encodeURIComponent(tenantId)}&parent_order_key=${encodeURIComponent(order.key)}&parent_display_key=${encodeURIComponent(order.displayKey || order.key)}&table_number=${encodeURIComponent(rawTable || '')}&mode=append`
          }
        },
        {
          type: "button",
          style: "secondary",
          height: "sm",
          action: {
            type: "postback",
            label: "查詢訂單進度",
            data: `action=check_progress&order_key=${order.key}`,
            displayText: "查詢訂單進度"
          }
        }
      ]
    }
  }, contentComponents);
}
