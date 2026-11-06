import { handleOrderReceiptWebhook, handleOrderReceiptPageWebhook, prepareOrderReceipt, deliverOrderReceipt } from './line-order-receipts';
import { resolveOrderKey, findOrderForCustomer, isOrderId } from './order-identity';
import { Env } from '../types/env';
import { TenantContext, resolveTenantOrderPrefix, generateStandardOrderId } from '../types/tenant';
import { Order, DiningOption, OrderItemInput } from '../types/index';
import { corsHeaders } from '../utils/http';
import { resolveSecret } from '../utils/secrets';
import { LineRuntimeError, readVerifiedLineWebhook } from './line-runtime';
import { getNextDailyOrderSeq, saveOrder, getPendingMap, getOrderQueueAhead, getUserLatestActiveOrder } from './orders';
import { callAI, FewShotExample } from '../integrations/groq';
import { syncToGoogleSheets } from '../integrations/googleSheets';
import { getTenantId, getMenuData, formatMenuForPrompt } from './menu';
import { formatOperatingHoursForDisplay } from './bootstrap';

export {
  buildOrderFlexMessage,
  buildProgressFlexMessage,
  buildAppendConfirmationFlexMessage,
  createRejectFlexBubble,
  createTimeChangeFlexBubble,
  createTimeChangeConfirmedFlexBubble,
  createChangeFlexBubble,
  createSoldOutItemFlexBubble,
  createOrderModifiedConfirmationFlexBubble
} from './line/templates';
import {
  buildProgressFlexMessage,
  createTimeChangeConfirmedFlexBubble,
  buildAppendConfirmationFlexMessage,
  createOrderModifiedConfirmationFlexBubble
} from './line/templates';

export async function getLineToken(env: Env, tenantCtx?: TenantContext | null): Promise<string> {
  if (tenantCtx?.lineChannelToken) {
    return tenantCtx.lineChannelToken;
  }
  if (tenantCtx?.tenantId === 'bsc' && env.LINE_TOKEN_BSC) {
    return await resolveSecret(env.LINE_TOKEN_BSC);
  }
  return await resolveSecret(env.LINE_CHANNEL_TOKEN);
}

export function normalizeLineText(text: string): string {
  if (!text) return "";
  return String(text)
    .replace(/\r\n/g, "\n")
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n");
}

export async function pushLineMessage(
  userId: string,
  text: string,
  env: Env,
  tenantCtx?: TenantContext | null
): Promise<void> {
  const token = await getLineToken(env, tenantCtx);
  const brand = tenantCtx?.brandName || "Bot";
  if (!token) { console.error(`[${brand}] pushLineMessage: LINE_CHANNEL_TOKEN missing`); return; }
  if (!userId) { console.error(`[${brand}] pushLineMessage: userId is empty, cannot push`); return; }

  const normalizedText = normalizeLineText(text);

  try {
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        to: userId,
        messages: [{ type: "text", text: normalizedText }],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "(unreadable)");
      const tokenPrefix = token ? token.substring(0, 10) + '...' : 'none';
      console.error(`[${brand}] pushLineMessage FAILED: status=${res.status} userId=${userId} tokenPrefix=${tokenPrefix} body=${body}`);
    } else {
      console.log(`[${brand}] pushLineMessage OK: userId=${userId}`);
    }
  } catch (e: any) {
    console.error(`[${brand}] pushLineMessage EXCEPTION: userId=${userId} error=${e.message}`);
  }
}

export async function replyText(
  replyToken: string,
  text: string,
  env: Env,
  tenantCtx?: TenantContext | null
): Promise<boolean> {
  const token = await getLineToken(env, tenantCtx);
  const brand = tenantCtx?.brandName || "Bot";
  if (!token || !replyToken) return false;

  const normalizedText = normalizeLineText(text);

  try {
    const res = await fetch("https://api.line.me/v2/bot/message/reply", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        replyToken,
        messages: [{ type: "text", text: normalizedText }],
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "(unreadable)");
      console.error(`[${brand}] replyText FAILED: status=${res.status} body=${errBody}`);
      return false;
    }
    return true;
  } catch (e: any) {
    console.error(`[${brand}] replyText EXCEPTION: error=${e.message}`);
    return false;
  }
}

export async function pushLineFlexMessage(
  userId: string,
  altText: string,
  contents: any,
  env: Env,
  tenantCtx?: TenantContext | null
): Promise<boolean> {
  const token = await getLineToken(env, tenantCtx);
  const brand = tenantCtx?.brandName || "Bot";
  if (!token || !userId) return false;

  try {
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        to: userId,
        messages: [{ type: "flex", altText, contents }],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "(unreadable)");
      const tokenPrefix = token ? token.substring(0, 10) + '...' : 'none';
      console.error(`[${brand}] pushLineFlexMessage FAILED: status=${res.status} userId=${userId} tokenPrefix=${tokenPrefix} body=${body}`);
      return false;
    }
    return true;
  } catch (e: any) {
    console.error(`[${brand}] pushLineFlexMessage EXCEPTION: userId=${userId} error=${e.message}`);
    return false;
  }
}

export async function replyLineFlexMessage(
  replyToken: string,
  altText: string,
  contents: any,
  env: Env,
  tenantCtx?: TenantContext | null
): Promise<boolean> {
  const token = await getLineToken(env, tenantCtx);
  const brand = tenantCtx?.brandName || "Bot";
  if (!token || !replyToken) return false;

  try {
    const res = await fetch("https://api.line.me/v2/bot/message/reply", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        replyToken,
        messages: [{ type: "flex", altText, contents }],
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "(unreadable)");
      console.error(`[${brand}] replyLineFlexMessage FAILED: status=${res.status} body=${errBody}`);
      return false;
    }
    return true;
  } catch (e: any) {
    console.error(`[${brand}] replyLineFlexMessage EXCEPTION: error=${e.message}`);
    return false;
  }
}


export async function replyWithLiffRedirect(
  replyToken: string,
  userId: string,
  env: Env,
  tenantCtx?: TenantContext | null
): Promise<boolean> {
  const brand = tenantCtx?.brandName || "Bot";
  if (tenantCtx?.aiOrderRedirectEnabled === false) {
    console.log(`[${brand}] AI order redirect disabled for tenant=${tenantCtx.tenantId}`);
    return false;
  }

  const token = await getLineToken(env, tenantCtx);
  if (!token || !replyToken) return false;

  const liffUrl = tenantCtx?.liffUrl || (await resolveSecret(env.LIFF_URL)) || "https://liff.line.me/";
  const brandColor = tenantCtx?.brandColor || "#00b900";
  const brandTitle = tenantCtx?.brandName || "線上點餐";

  const flexBubble = {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: brandColor,
      paddingAll: "20px",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          spacing: "md",
          contents: [
            { type: "text", text: "📝", size: "3xl", flex: 0 },
            {
              type: "box",
              layout: "vertical",
              justifyContent: "center",
              contents: [
                { type: "text", text: brandTitle, weight: "bold", size: "xl", color: "#ffffff" },
                { type: "text", text: "Online Order", size: "sm", color: "#ffffff" }
              ]
            }
          ]
        }
      ]
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "20px",
      spacing: "md",
      contents: [
        {
          type: "text",
          text: "線上點餐、省時方便",
          weight: "bold",
          size: "lg",
          color: "#111111"
        },
        {
          type: "text",
          text: "透過線上系統挑選餐點，確保每個細節都精準記錄 ✨",
          wrap: true,
          color: "#555555",
          size: "sm"
        },
        { type: "separator", margin: "lg", color: "#eeeeee" },
        {
          type: "box",
          layout: "vertical",
          margin: "md",
          spacing: "sm",
          contents: [
            {
              type: "box",
              layout: "horizontal",
              spacing: "sm",
              contents: [
                { type: "text", text: "•", color: brandColor, flex: 0, weight: "bold" },
                { type: "text", text: "清楚瀏覽完整菜單與即時價格", size: "xs", color: "#666666" }
              ]
            },
            {
              type: "box",
              layout: "horizontal",
              spacing: "sm",
              contents: [
                { type: "text", text: "•", color: brandColor, flex: 0, weight: "bold" },
                { type: "text", text: "隨時隨地輕鬆完成預訂", size: "xs", color: "#666666" }
              ]
            },
            {
              type: "box",
              layout: "horizontal",
              spacing: "sm",
              contents: [
                { type: "text", text: "•", color: brandColor, flex: 0, weight: "bold" },
                { type: "text", text: "送出後即時接收訂單進度通知", size: "xs", color: "#666666" }
              ]
            }
          ]
        }
      ]
    },
    footer: {
      type: "box",
      layout: "vertical",
      paddingAll: "15px",
      contents: [
        {
          type: "button",
          style: "primary",
          color: brandColor,
          height: "md",
          action: {
            type: "uri",
            label: "👉 前往線上點餐",
            uri: liffUrl
          }
        }
      ]
    }
  };

  try {
    const res = await fetch("https://api.line.me/v2/bot/message/reply", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        replyToken,
        messages: [{
          type: "flex",
          altText: `歡迎使用 ${brandTitle} 線上點餐！`,
          contents: flexBubble
        }],
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "(unreadable)");
      console.error(`[${brand}] replyWithLiffRedirect FAILED: status=${res.status} body=${errBody}`);
      return false;
    }

    try {
      await env.ORDER_STATE.put(`liff_redirected:${tenantCtx?.tenantId || "legacy"}:${userId}`, "1", { expirationTtl: 300 });
    } catch { }

    return true;
  } catch (e: any) {
    console.error(`[${brand}] replyWithLiffRedirect EXCEPTION: error=${e.message}`);
    return false;
  }
}

export function handleQuickReply(text: string, tenantCtx?: TenantContext | null): string | null {
  const msg = String(text || "").trim();
  if (!msg) return null;

  const lowerMsg = msg.toLowerCase();

  // 1. Check custom quick replies configured for this tenant
  if (tenantCtx && Array.isArray(tenantCtx.quickReplies)) {
    for (const qr of tenantCtx.quickReplies) {
      if (Array.isArray(qr.triggers) && qr.triggers.some(tr => tr && lowerMsg.includes(tr.toLowerCase()))) {
        return normalizeLineText(qr.reply);
      }
    }
  }

  // Detect language: Vietnamese triggers or tenant locale
  const isViTrigger = [
    "giờ mở cửa", "thời gian mở cửa", "mở cửa mấy giờ", "mấy giờ mở", "mấy giờ đóng", "có mở cửa",
    "địa chỉ", "ở đâu", "vị trí",
    "giao hàng", "ship", "có ship không", "phí ship"
  ].some(k => lowerMsg.includes(k));
  const isVi = isViTrigger || tenantCtx?.locale === 'vi';

  // 2. Business / Operating Hours
  const hoursTriggers = [
    "營業時間", "幾點開", "開到幾點", "幾點關", "幾點打烊", "有開嗎", "營業到幾點", "什麼時候開",
    "giờ mở cửa", "thời gian mở cửa", "mở cửa mấy giờ", "mấy giờ mở", "mấy giờ đóng", "có mở cửa",
    "opening hours", "operating hours", "business hours"
  ];
  if (hoursTriggers.some(k => lowerMsg.includes(k))) {
    const formatted = formatOperatingHoursForDisplay(
      tenantCtx?.operatingHours,
      isVi ? 'vi' : (tenantCtx?.locale || 'zh-TW'),
      tenantCtx?.tenantId || ''
    );
    return isVi ? `Giờ mở cửa của chúng tôi:\n${formatted}` : `我們的營業時間：\n${formatted}`;
  }

  // 3. Address
  const addressTriggers = [
    "地址", "在哪", "位置", "在哪裡", "在哪裏",
    "địa chỉ", "ở đâu", "vị trí", "địa điểm",
    "address", "location"
  ];
  if (addressTriggers.some(k => lowerMsg.includes(k))) {
    if (tenantCtx?.storeAddress) {
      return tenantCtx.storeAddress;
    }
    if (tenantCtx?.tenantId === 'benmi' || !tenantCtx) {
      return "新北市土城區中央路二段135號";
    }
    return isVi ? "Hiện tại quán chưa cập nhật địa chỉ cửa hàng." : "目前尚未設定店家地址，敬請見諒。";
  }

  // 4. Delivery Policy
  const deliveryTriggers = [
    "外送嗎", "外送", "送外賣", "有外送", "可以外送", "外送服務",
    "giao hàng", "ship", "có ship không", "phí ship",
    "delivery"
  ];
  if (deliveryTriggers.some(k => lowerMsg.includes(k))) {
    if (tenantCtx?.deliveryPolicy) {
      return normalizeLineText(tenantCtx.deliveryPolicy);
    }
    if (tenantCtx?.tenantId === 'benmi' || !tenantCtx) {
      return (
        "Benmi 最新外送說明如下：\n" +
        "🛵 滿 2,000 元： 不限距離，土城全區皆享免運！\n" +
        "🛵 滿 800 元：\n" +
        "距離店址 2公里內 ➔ 免運 \n" +
        "距離店址 超過2公里 ➔ 酌收 80元 運費。\n" +
        "🛵 未滿 800 元： 也別擔心！歡迎直接點擊 UberEats 平台直接下單，美味一樣送到家 👇 👉 https://cutt.ly/Mt9w2fAD"
      );
    }
    return isVi
      ? "Hiện tại quán chưa có chính sách giao hàng trực tiếp. Vui lòng đặt qua các ứng dụng giao đồ ăn hoặc đến lấy trực tiếp."
      : "目前尚未提供外送服務，歡迎透過外送平台訂購或到店自取，謝謝！";
  }

  return null;
}

export function normalizeCustomerReply(text: string) {
  const t = String(text || "").trim().toLowerCase();
  const hasAgree =
    t.includes("同意") || t.includes("agree") || t === "ok" || t === "okay" || t === "yes" || t === "好";
  const hasCancel =
    t.includes("取消") || t.includes("cancel") || t.includes("不要了") || t.includes("不用了");
  const hasDifferent =
    t.includes("不同意") || t.includes("disagree") || t === "no" || t === "not" || t.includes("不要");
  return { hasAgree, hasCancel, hasDifferent };
}

export async function handleLineWebhook(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  tenantCtx?: TenantContext | null
): Promise<Response> {
  let body: any;
  try { body = await readVerifiedLineWebhook(request, env, tenantCtx); }
  catch (error) {
    const code = error instanceof LineRuntimeError ? error.code : 'LINE_WEBHOOK_UNAVAILABLE';
    const status = error instanceof LineRuntimeError ? error.status : 503;
    return Response.json({ error: code }, { status });
  }
  const events = Array.isArray(body.events) ? body.events : [];
  const tenantId = tenantCtx?.tenantId || getTenantId(request);
  const brandName = tenantCtx?.brandName || tenantId;

  for (const event of events) {
    if (!event) continue;

    const replyToken = event.replyToken;
    const source = event.source || {};
    const userId = source.userId;
    if (!userId) continue;

    // 0.1) Handle postback events (e.g. Progress Check, Reject/Change Agree/Disagree button taps)
    if (event.type === "postback") {
      const dataStr = event.postback?.data || "";
      if (await handleOrderReceiptPageWebhook(env, tenantCtx, userId, dataStr, replyToken)) continue;
      console.log(`[${brandName}] [LINE Postback] userId=${userId} data=${dataStr}`);

      if (dataStr.includes("action=check_progress")) {
        let orderKey = "";
        const match = dataStr.match(/order_key=([^&]+)/);
        if (match) {
          orderKey = match[1];
        }

        const res = orderKey ? await getOrderQueueAhead(env, tenantId, orderKey) : await getUserLatestActiveOrder(env, tenantId, userId);
        if (res && res.order) {
          const flex = buildProgressFlexMessage(res.order, res.queueAhead, tenantCtx);
          await replyLineFlexMessage(replyToken, `訂單進度 #${res.order.displayKey || res.order.key}`, flex, env, tenantCtx);
        } else {
          await replyText(replyToken, "找不到您的相關訂單紀錄。", env, tenantCtx);
        }
        continue;
      }

      // Handle Interactive Actions: reject_agree, reject_disagree, change_agree, change_cancel
      let action = "";
      let orderKey = "";

      const params = new URLSearchParams(dataStr);
      action = params.get("action")?.trim() || "";
      orderKey = params.get("orderKey")?.trim() || params.get("order_key")?.trim() || "";

      if (!action) {
        if (dataStr.includes("reject_agree")) action = "reject_agree";
        else if (dataStr.includes("reject_disagree")) action = "reject_disagree";
        else if (dataStr.includes("change_agree")) action = "change_agree";
        else if (dataStr.includes("change_cancel")) action = "change_cancel";
      }

      if (!orderKey) {
        const m = dataStr.match(/orderKey=([^&]+)/) || dataStr.match(/order_key=([^&]+)/);
        if (m) orderKey = m[1];
      }

      if (!orderKey && env.DB) {
        try {
          const pRow = await env.DB.prepare(
            "SELECT order_key FROM pending_actions WHERE tenant_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1"
          ).bind(tenantId, userId).first<{ order_key: string }>();
          if (pRow?.order_key) {
            orderKey = pRow.order_key;
          } else {
            const wRow = await env.DB.prepare(
              "SELECT key FROM orders WHERE tenant_id = ? AND user_id = ? AND status IN ('WAITING_CUSTOMER_REJECT', 'WAITING_CUSTOMER_CHANGE') ORDER BY updated_at DESC LIMIT 1"
            ).bind(tenantId, userId).first<{ key: string }>();
            if (wRow?.key) orderKey = wRow.key;
          }
        } catch (e) {
          console.error("[Postback Fallback orderKey error]:", e);
        }
      }

      if (orderKey) orderKey = await resolveOrderKey(env, tenantId, orderKey) || '';
      const actionOrder = orderKey ? await env.DB.prepare('SELECT display_key FROM orders WHERE key = ? AND tenant_id = ?').bind(orderKey, tenantId).first<{ display_key: string }>() : null;
      const displayKey = actionOrder?.display_key || '';
      if (action && orderKey && env.DB) {
        try {
          if (action === "reject_agree") {
            await env.DB.prepare(
              "UPDATE orders SET status = 'REJECTED', updated_at = strftime('%Y-%m-%d %H:%M:%f', 'now') WHERE tenant_id = ? AND key = ?"
            ).bind(tenantId, orderKey).run();
            await env.DB.prepare(
              "DELETE FROM pending_actions WHERE tenant_id = ? AND (order_key = ? OR user_id = ?)"
            ).bind(tenantId, orderKey, userId).run();
            await replyText(replyToken, `✅ 訂單 #${displayKey} 已確認取消。期待下次能為您服務！`, env, tenantCtx);
          } else if (action === "reject_disagree") {
            await env.DB.prepare(
              "UPDATE orders SET status = 'NEW', updated_at = strftime('%Y-%m-%d %H:%M:%f', 'now') WHERE tenant_id = ? AND key = ?"
            ).bind(tenantId, orderKey).run();
            await env.DB.prepare(
              "DELETE FROM pending_actions WHERE tenant_id = ? AND (order_key = ? OR user_id = ?)"
            ).bind(tenantId, orderKey, userId).run();
            await replyText(replyToken, `感謝您的回覆！店家將盡快與您聯繫或重新為您確認訂單 #${displayKey}。`, env, tenantCtx);
          } else if (action === "change_agree") {
            const pendingRow = await env.DB.prepare(
              "SELECT * FROM pending_actions WHERE tenant_id = ? AND (order_key = ? OR user_id = ?) LIMIT 1"
            ).bind(tenantId, orderKey, userId).first<any>();

            const orderRow = await env.DB.prepare(
              "SELECT * FROM orders WHERE tenant_id = ? AND key = ? LIMIT 1"
            ).bind(tenantId, orderKey).first<any>();

            const newTimeParam = params.get("newTime") || (pendingRow ? pendingRow.note : "") || (orderRow ? orderRow.note : "");
            const oldTime = orderRow ? orderRow.pickup_time || "" : "";
            const timeParts = oldTime.split(" ");
            const oldDate = timeParts[0] || "";
            let updatedPickupTime = newTimeParam;
            if (oldDate && oldDate.includes("-") && !newTimeParam.includes("-")) {
              updatedPickupTime = `${oldDate} ${newTimeParam}`;
            }

            if (orderRow) {
              const updatedOrder: Order = {
                key: orderRow.key,
                orderId: orderRow.order_id,
                displayKey: orderRow.display_key,
                legacyKey: orderRow.legacy_key,
                businessDate: orderRow.business_date,
                customer: orderRow.customer_name || "顧客",
                time: updatedPickupTime,
                content: orderRow.order_content || "",
                status: "NEW", // Tự động nhảy đơn mới với giờ nhận mới để quán bấm nhận đơn
                createdAt: orderRow.created_at ? new Date(orderRow.created_at + "Z").getTime() : Date.now(),
                userId: orderRow.user_id || undefined,
                total: orderRow.total_amount,
                reason: "",
                note: "",
                diningOption: (orderRow.dining_option as any) || 'takeaway',
                tableNumber: orderRow.table_number || undefined,
                roundCount: Number(orderRow.round_count) || 1,
                round_count: Number(orderRow.round_count) || 1,
                lastAppendedAt: orderRow.last_appended_at || null,
                last_appended_at: orderRow.last_appended_at || null
              };
              await saveOrder(env, updatedOrder, tenantId);
            } else {
              await env.DB.prepare(
                "UPDATE orders SET status = 'NEW', pickup_time = ?, reason = '', note = '', updated_at = strftime('%Y-%m-%d %H:%M:%f', 'now') WHERE tenant_id = ? AND key = ?"
              ).bind(updatedPickupTime, tenantId, orderKey).run();
            }

            await env.DB.prepare(
              "DELETE FROM pending_actions WHERE tenant_id = ? AND (order_key = ? OR user_id = ?)"
            ).bind(tenantId, orderKey, userId).run();

            const liffUrl = tenantCtx?.liffUrl || (await resolveSecret(env.LIFF_URL)) || "https://liff.line.me/";
            const confirmedFlex = createTimeChangeConfirmedFlexBubble(orderKey, newTimeParam, liffUrl, brandName, displayKey);
            await replyLineFlexMessage(replyToken, `訂單 #${displayKey} 已確認修改！`, confirmedFlex, env, tenantCtx);
          } else if (action === "change_cancel") {
            const orderRow = await env.DB.prepare(
              "SELECT * FROM orders WHERE tenant_id = ? AND key = ? LIMIT 1"
            ).bind(tenantId, orderKey).first<any>();

            if (orderRow) {
              const updatedOrder: Order = {
                key: orderRow.key,
                orderId: orderRow.order_id,
                displayKey: orderRow.display_key,
                legacyKey: orderRow.legacy_key,
                businessDate: orderRow.business_date,
                customer: orderRow.customer_name || "顧客",
                time: orderRow.pickup_time || "",
                content: orderRow.order_content || "",
                status: "REJECTED",
                createdAt: orderRow.created_at ? new Date(orderRow.created_at + "Z").getTime() : Date.now(),
                userId: orderRow.user_id || undefined,
                total: orderRow.total_amount,
                reason: orderRow.reason || "",
                note: orderRow.note || "",
                diningOption: (orderRow.dining_option as any) || 'takeaway',
                tableNumber: orderRow.table_number || undefined,
                roundCount: Number(orderRow.round_count) || 1,
                round_count: Number(orderRow.round_count) || 1,
                lastAppendedAt: orderRow.last_appended_at || null,
                last_appended_at: orderRow.last_appended_at || null
              };
              await saveOrder(env, updatedOrder, tenantId);
              if (ctx && ctx.waitUntil) ctx.waitUntil(syncToGoogleSheets(updatedOrder, env, tenantCtx));
            } else {
              await env.DB.prepare(
                "UPDATE orders SET status = 'REJECTED', updated_at = strftime('%Y-%m-%d %H:%M:%f', 'now') WHERE tenant_id = ? AND key = ?"
              ).bind(tenantId, orderKey).run();
            }

            await env.DB.prepare(
              "DELETE FROM pending_actions WHERE tenant_id = ? AND (order_key = ? OR user_id = ?)"
            ).bind(tenantId, orderKey, userId).run();
            await replyText(replyToken, `收到，已為您取消訂單 #${displayKey}，謝謝您！`, env, tenantCtx);
          }
          continue;
        } catch (postbackErr) {
          console.error(`[${brandName}] Postback execution error:`, postbackErr);
        }
      }
    }

    if (event.type !== "message") continue;
    const message = event.message || {};

    // Handle user Flex message sent via LIFF sendMessages
    if (message.type === "flex") {
      if (replyToken) {
        await replyText(replyToken, "✅ 店家已收到您的訂單！店員將儘速為您確認，請稍候 🙏", env, tenantCtx);
      }
      continue;
    }

    if (message.type !== "text") continue;

    const userText = message.text || "";
    const pendingKey = `pending:${userId}`;
    const draftKey = `draft:${userId}`;

    if (await handleOrderReceiptWebhook(env, tenantCtx, userId, normalizeLineText(userText), replyToken)) {
      await env.DB.prepare("DELETE FROM pending_actions WHERE tenant_id = ? AND user_id = ?").bind(tenantId, userId).run();
      try { await env.ORDER_STATE.delete(draftKey); } catch { }
      continue;
    }

    // 0.2) Handle text progress triggers (e.g. 查詢進度 / 進度 / tiến độ / check progress)
    const lowerText = userText.toLowerCase();
    if (
      (lowerText.includes("進度") || lowerText.includes("tiến độ") || lowerText.includes("check progress")) &&
      !userText.includes("訂單編號：")
    ) {
      let orderKey = "";
      const match = userText.match(/(?:\d{4}-[DT]\d{3,4}|[A-Z0-9]{1,4}\d{4}-[A-Z0-9]{4}|[A-Z0-9]+\d{4}-\d{4}-\d{4}|BD\d+-\d+-\d+)/i);
      if (match) {
        orderKey = match[0];
      }

      if (orderKey) orderKey = (await findOrderForCustomer(env, tenantId, orderKey, userId))?.key || '';
      const res = orderKey ? await getOrderQueueAhead(env, tenantId, orderKey) : (match ? null : await getUserLatestActiveOrder(env, tenantId, userId));
      if (res && res.order) {
        const flex = buildProgressFlexMessage(res.order, res.queueAhead, tenantCtx);
        await replyLineFlexMessage(replyToken, `訂單進度 #${res.order.displayKey || res.order.key}`, flex, env, tenantCtx);
      } else {
        await replyText(replyToken, "目前查無您的進行中訂單。", env, tenantCtx);
      }
      continue;
    }

    // 0.25) Handle Append Order text message from LIFF: Reply with Append Confirmation Flex Message
    if (userText.includes("[加點") || userText.includes("加點餐點") || userText.includes("加點成功")) {
      console.log(`[${brandName}] Webhook received append notification message. Replying with Append Flex confirmation.`);
      try {
        await env.DB.prepare("DELETE FROM pending_actions WHERE tenant_id = ? AND user_id = ?")
          .bind(tenantId, userId).run();
      } catch { }
      try { await env.ORDER_STATE.delete(draftKey); } catch { }

      let orderKey = "";
      const match = userText.match(/#([0-9a-f]{8}-[0-9a-f-]{27})/i) || userText.match(/(?:\d{4}-[DT]\d{3,4}|[A-Z0-9]{1,6}\d{4}-[A-Z0-9]{2,8}|[A-Z0-9]+\d{4}-\d{4}-\d{4}|BD\d+-\d+-\d+|BM\d+-\d+)/i) || userText.match(/#([A-Za-z0-9_-]+)/);
      const appendReference = userText.match(/^訂單參考：(.+)$/m);
      if (appendReference) {
        orderKey = appendReference[1].trim();
      } else if (match) {
        orderKey = (match[1] || match[0]).replace('#', '').trim();
      }

      if (!orderKey && env.DB) {
        const activeRow = await env.DB.prepare(
          `SELECT key FROM orders WHERE tenant_id = ? AND user_id = ? AND dining_option = 'dine_in' AND status IN ('NEW', 'ACCEPTED', 'DONE') ORDER BY created_at DESC LIMIT 1`
        ).bind(tenantId, userId).first<{ key: string }>();
        if (activeRow && activeRow.key) orderKey = activeRow.key;
      }

      if (orderKey) orderKey = await resolveOrderKey(env, tenantId, orderKey) || '';
      if (orderKey && env.DB) {
        const row = await env.DB.prepare(
          "SELECT * FROM orders WHERE key = ? AND tenant_id = ?"
        ).bind(orderKey, tenantId).first<any>();

        if (row && replyToken) {
          const order: Order = {
            key: row.key,
                orderId: row.order_id,
            displayKey: row.display_key,
            legacyKey: row.legacy_key,
            businessDate: row.business_date,
            customer: row.customer_name || "顧客",
            time: row.pickup_time || "",
            content: row.order_content || "",
            status: row.status,
            createdAt: row.created_at ? new Date(row.created_at + "Z").getTime() : Date.now(),
            userId: row.user_id || undefined,
            total: row.total_amount,
            reason: row.reason || "",
            note: row.note || "",
            diningOption: (row.dining_option as any) || 'dine_in',
            tableNumber: row.table_number || undefined,
            roundCount: Number(row.round_count) || 1,
            round_count: Number(row.round_count) || 1,
            lastAppendedAt: row.last_appended_at || null
          };

          let addedAmount = 0;
          const addedMatch = userText.match(/(?:本次加點|加點金額)[：:]\s*\+?\$?(\d+)/);
          if (addedMatch) {
            addedAmount = parseInt(addedMatch[1], 10) || 0;
          }

          let itemsText = "";
          const itemsStart = userText.indexOf("現場加點品項：");
          const itemsEnd = userText.indexOf("💰");
          if (itemsStart > -1) {
            if (itemsEnd > itemsStart) {
              itemsText = userText.substring(itemsStart + 7, itemsEnd).trim();
            } else {
              itemsText = userText.substring(itemsStart + 7).trim();
            }
          }

          const flexBubble = buildAppendConfirmationFlexMessage(
            order,
            itemsText || "加點品項",
            addedAmount,
            order.roundCount || 1,
            tenantCtx
          );

          const altText = `現場加點 (第 ${order.roundCount} 輪) #${order.displayKey || order.key}`;
          if (flexBubble.type === 'receipt-pages' && tenantCtx) {
            // Very large legacy append receipts also need stored, recipient-bound continuation pages.
            const receipt = await prepareOrderReceipt(env, tenantId, order.key, userId, 'append', altText, flexBubble);
            if (receipt) {
              await receipt.statement.run();
              await deliverOrderReceipt(env, receipt.notification.id, tenantCtx, replyToken);
            }
          } else await replyLineFlexMessage(replyToken, altText, flexBubble, env, tenantCtx);
        }
      }
      continue;
    }

    // 0.28) Handle Edit/Modify Order text message from LIFF: Acknowledge, clear pending actions, and reply with free Confirmation Flex
    if (userText.includes("[更換品項") || userText.includes("更換品項內容")) {
      console.log(`[${brandName}] Webhook received edit order notification message from customer.`);
      try {
        await env.DB.prepare("DELETE FROM pending_actions WHERE tenant_id = ? AND user_id = ?")
          .bind(tenantId, userId).run();
      } catch { }
      try { await env.ORDER_STATE.delete(draftKey); } catch { }

      if (replyToken) {
        try {
          let orderKey = "";
          const orderRefMatch = userText.match(/^訂單參考：(.+)$/m) || userText.match(/訂單參考：([^\s\n]+)/);
          const headerMatch = userText.match(/\[更換品項\s*#?([^\]]+)\]/);
          if (orderRefMatch) {
            orderKey = orderRefMatch[1].trim();
          } else if (headerMatch) {
            orderKey = headerMatch[1].trim();
          }

          if (!orderKey && env.DB) {
            const activeRow = await env.DB.prepare(
              `SELECT key FROM orders WHERE tenant_id = ? AND user_id = ? AND is_modified = 1 ORDER BY updated_at DESC LIMIT 1`
            ).bind(tenantId, userId).first<{ key: string }>();
            if (activeRow && activeRow.key) orderKey = activeRow.key;
          }

          if (orderKey) {
            orderKey = (await resolveOrderKey(env, tenantId, orderKey)) || orderKey;
          }

          let displayKey = headerMatch ? headerMatch[1].replace('#', '').trim() : (orderKey || "");
          let newTotal = 0;
          const totalMatch = userText.match(/💰\s*更新後金額：\$?(\d+)/);
          if (totalMatch) {
            newTotal = Number(totalMatch[1]) || 0;
          }

          if (orderKey && env.DB) {
            const row = await env.DB.prepare(
              `SELECT key, display_key, total_amount FROM orders WHERE key = ? AND tenant_id = ? LIMIT 1`
            ).bind(orderKey, tenantId).first<any>();

            if (row) {
              if (row.display_key) displayKey = row.display_key;
              if (row.total_amount != null) newTotal = Number(row.total_amount) || 0;
            }
          }

          const confirmBubble = createOrderModifiedConfirmationFlexBubble(
            orderKey || displayKey,
            newTotal,
            0,
            brandName,
            displayKey || orderKey
          );

          await replyLineFlexMessage(
            replyToken,
            `[${brandName}] 訂單品項已成功更換 #${displayKey || orderKey}`,
            confirmBubble,
            env,
            tenantCtx
          );
        } catch (replyErr) {
          console.error(`[${brandName}] Failed to send edit confirmation via reply message:`, replyErr);
        }
      }
      continue;
    }

    // 0.3) Priority Catch new order from LIFF text message (Bypasses pending states)
    if (userText.includes("訂單編號：") && userText.includes("📦 訂單內容：")) {
      if (userText.includes("[已收到]") || userText.includes("[Đã nhận]") || userText.includes("[加點") || userText.includes("加點餐點") || userText.includes("加點成功") || userText.includes("[更換品項")) {
        console.log(`[${brandName}] Webhook received receipt/append/modify message. Skipping to avoid duplicate order.`);
        try {
          await env.DB.prepare("DELETE FROM pending_actions WHERE tenant_id = ? AND user_id = ?")
            .bind(tenantId, userId).run();
        } catch { }
        try { await env.ORDER_STATE.delete(draftKey); } catch { }
        continue;
      }

      const lines = userText.split("\n");
      const keyLine = lines.find((l: string) => l.includes("訂單編號："));
      const timeLine = lines.find((l: string) => l.includes("🕒 取餐時間：") || l.includes("🕒 訂餐時間：") || l.includes("🕒 點餐時間：") || l.includes("取餐時間") || l.includes("訂餐時間") || l.includes("點餐時間"));
      const totalLine = lines.find((l: string) => l.includes("💰 總金額："));

      const isDineIn = userText.includes("📍 用餐方式：🍽️ 內用") || userText.includes("用餐方式：內用") || userText.includes("【內用】");
      const diningOption: DiningOption = isDineIn ? "dine_in" : "takeaway";
      const prefix = resolveTenantOrderPrefix(tenantCtx, tenantId);
      const fallbackOrderKey = generateStandardOrderId(diningOption, new Date(), undefined, prefix);
      const numberReference = keyLine ? keyLine.replace("訂單編號：", "").trim() : fallbackOrderKey;
      const idLine = lines.find((l: string) => l.startsWith('訂單參考：'));
      const reference = idLine ? idLine.slice('訂單參考：'.length).trim() : numberReference;
      let orderKey = await resolveOrderKey(env, tenantId, reference) || '';
      let displayKey = numberReference;
      const nowTw = new Date(Date.now() + 8 * 3600000);
      const defaultTimeStr = `${nowTw.getUTCFullYear()}-${String(nowTw.getUTCMonth() + 1).padStart(2, "0")}-${String(nowTw.getUTCDate()).padStart(2, "0")} ${String(nowTw.getUTCHours()).padStart(2, "0")}:${String(nowTw.getUTCMinutes()).padStart(2, "0")}`;
      const timeStr = timeLine ? timeLine.replace(/🕒\s*(?:取餐時間|訂餐時間|點餐時間)[：:]\s*/, "").replace(/\s*\([^)]*\)/g, '').trim() : defaultTimeStr;
      const totalStr = totalLine ? totalLine.replace("💰 總金額：", "").replace("$", "").trim() : "0";

      let noteStr = "";
      const noteStart = userText.indexOf("總備註");
      const totalStartIdx = userText.indexOf("💰 總金額");

      if (noteStart !== -1) {
        let colonIdx = userText.indexOf("：", noteStart);
        if (colonIdx === -1) colonIdx = userText.indexOf(":", noteStart);
        if (colonIdx === -1) colonIdx = noteStart + 3;

        if (totalStartIdx !== -1 && totalStartIdx > colonIdx) {
          noteStr = userText.substring(colonIdx + 1, totalStartIdx).trim();
        } else {
          noteStr = userText.substring(colonIdx + 1).trim();
        }
      }

      let custName = "顧客 (線上)";

      const existingOrder = await env.DB.prepare(
        "SELECT * FROM orders WHERE key = ? AND tenant_id = ?"
      ).bind(orderKey, tenantId).first<any>();

      if (existingOrder) {
        displayKey = existingOrder.display_key;
        if (existingOrder.user_id && existingOrder.user_id !== userId) continue;
        if (existingOrder.customer_name && existingOrder.customer_name !== "顧客 (線上)" && existingOrder.customer_name !== "Khách (Web)") {
          custName = existingOrder.customer_name;
        }

        // Link user_id to order in DB if not linked yet
        if (userId && (!existingOrder.user_id || existingOrder.user_id !== userId)) {
          try {
            await env.DB.prepare("UPDATE orders SET user_id = ? WHERE key = ?").bind(userId, orderKey).run();
          } catch {}
        }

        try {
          await env.DB.prepare("DELETE FROM pending_actions WHERE tenant_id = ? AND user_id = ?")
            .bind(tenantId, userId).run();
        } catch { }
        try { await env.ORDER_STATE.delete(draftKey); } catch { }

        // Reply Progress Flex Message to customer in LINE chat
        if (replyToken) {
          try {
            const existingOrderData: Order = {
              key: existingOrder.key,
                orderId: existingOrder.order_id,
              displayKey: existingOrder.display_key,
              legacyKey: existingOrder.legacy_key,
              businessDate: existingOrder.business_date,
              customer: existingOrder.customer_name || custName,
              time: existingOrder.pickup_time || timeStr,
              content: existingOrder.order_content || "",
              status: existingOrder.status,
              createdAt: existingOrder.created_at ? new Date(existingOrder.created_at + "Z").getTime() : Date.now(),
              userId: existingOrder.user_id || userId,
              total: existingOrder.total_amount || (parseInt(totalStr, 10) || 0),
              reason: existingOrder.reason || "",
              note: existingOrder.note || noteStr,
              diningOption: (existingOrder.dining_option as any) || diningOption,
              tableNumber: existingOrder.table_number || undefined,
              roundCount: Number(existingOrder.round_count) || 1,
              round_count: Number(existingOrder.round_count) || 1,
              lastAppendedAt: existingOrder.last_appended_at || null
            };
            const queueRes = await getOrderQueueAhead(env, tenantId, orderKey);
            const queueAheadCount = queueRes ? queueRes.queueAhead : 0;
            const flexBubble = buildProgressFlexMessage(existingOrderData, queueAheadCount, tenantCtx);
            await replyLineFlexMessage(replyToken, `訂單進度 #${displayKey}`, flexBubble, env, tenantCtx);
          } catch (replyErr) {
            console.error(`[${brandName}] Reply existing order progress error:`, replyErr);
          }
        }

        // Update real LINE name in background if needed
        if (ctx && ctx.waitUntil) {
          ctx.waitUntil((async () => {
            try {
              const token = await getLineToken(env, tenantCtx);
              const profUrl = `https://api.line.me/v2/bot/profile/${userId}`;
              const resp = await fetch(profUrl, { headers: { Authorization: `Bearer ${token}` } });
              if (resp.ok) {
                const p: any = await resp.json();
                if (p && p.displayName) {
                  await env.DB.prepare(
                    "UPDATE orders SET customer_name = ? WHERE key = ?"
                  ).bind(p.displayName, orderKey).run();
                }
              }
            } catch (err) {
              console.error(`[${brandName}] Background profile fetch error:`, err);
            }
          })());
        }

        // Order already created via /api/create with full customizations & items; DO NOT overwrite order_content in DB!
        continue;
      }

      let contentStart = -1;
      const flavorMatch = userText.match(/(?:[🧂🧪🎛️]?\s*(?:口味設定|客製化設定|Hương vị|Khẩu vị)[：:]|【客製化設定】)/);
      if (flavorMatch && flavorMatch.index !== undefined) {
        contentStart = flavorMatch.index;
      } else {
        contentStart = userText.indexOf("📦 訂單內容：");
      }

      let contentEnd = userText.indexOf("🕒 取餐時間：");
      if (contentEnd === -1) contentEnd = userText.indexOf("🕒 訂餐時間：");
      if (contentEnd === -1) contentEnd = userText.indexOf("🕒");
      if (contentEnd === -1) contentEnd = userText.indexOf("📍 用餐方式：");
      let extractedContent = userText;
      if (contentStart > -1 && contentEnd > contentStart) {
        extractedContent = userText.substring(contentStart, contentEnd)
          .replace(/📦\s*訂單內容[：:]\s*\n?/g, "")
          .trim();
      }

      // Never recreate an unknown immutable reference (e.g. an old/deleted receipt).
      if (isOrderId(reference)) continue;
      ({ key: displayKey } = await getNextDailyOrderSeq(env, tenantId, diningOption, new Date(), prefix));
      orderKey = crypto.randomUUID();
      const orderData: Order = {
        key: orderKey,
        orderId: orderKey,
        displayKey,
        businessDate: new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10),
        customer: custName,
        time: timeStr,
        content: extractedContent,
        status: "NEW",
        createdAt: Date.now(),
        userId: userId,
        total: parseInt(totalStr, 10) || 0,
        reason: "",
        note: noteStr,
        diningOption: diningOption
      };

      await saveOrder(env, orderData, tenantId, true);

      // Reply Progress Flex Message (Order confirmation + status check button) to customer (Free reply)
      if (replyToken) {
        try {
          const queueRes = await getOrderQueueAhead(env, tenantId, orderKey);
          const queueAheadCount = queueRes ? queueRes.queueAhead : 0;
          const flexBubble = buildProgressFlexMessage(orderData, queueAheadCount, tenantCtx);
          await replyLineFlexMessage(replyToken, `訂單進度 #${displayKey}`, flexBubble, env, tenantCtx);
        } catch (replyErr) {
          console.error(`[${brandName}] Reply progress flex confirmation error:`, replyErr);
        }
      }

      // Fetch real LINE name in background and update customer_name safely in DB
      if (ctx && ctx.waitUntil) {
        ctx.waitUntil((async () => {
          try {
            const token = await getLineToken(env, tenantCtx);
            const profUrl = `https://api.line.me/v2/bot/profile/${userId}`;
            const resp = await fetch(profUrl, { headers: { Authorization: `Bearer ${token}` } });
            if (resp.ok) {
              const p: any = await resp.json();
              if (p && p.displayName) {
                await env.DB.prepare(
                  "UPDATE orders SET customer_name = ? WHERE key = ?"
                ).bind(p.displayName, orderKey).run();
              }
            } else {
              const errBody = await resp.text().catch(() => "(unreadable)");
              console.error(`[${brandName}] Background profile fetch FAILED: status=${resp.status} userId=${userId} body=${errBody}`);
            }
          } catch (e: any) {
            console.error(`[${brandName}] Background profile fetch EXCEPTION:`, e);
          }
        })());
      }

      // Auto-clear any stuck pending state
      try {
        await env.DB.prepare("DELETE FROM pending_actions WHERE tenant_id = ? AND user_id = ?")
          .bind(tenantId, userId).run();
      } catch { }

      continue;
    }

    // 0.5) If no pending action exists, a stale draft may be classified for LIFF redirect.
    // Pending actions must win so a change/reject response can never enter the generic order flow.
    const pendingMapBeforeDraft = await getPendingMap(env, tenantId, userId);
    const hasPendingAction = Object.keys(pendingMapBeforeDraft).length > 0;
    const draftRaw = tenantCtx?.aiOrderRedirectEnabled === false || hasPendingAction
      ? null
      : await env.ORDER_STATE.get(draftKey);
    if (draftRaw) {
      let draft: any = {};
      try { draft = JSON.parse(draftRaw); } catch { }

      const draftAge = Date.now() - (draft.lastUpdate || 0);
      if (draftAge > 2 * 60 * 60 * 1000) {
        await env.ORDER_STATE.delete(draftKey);
      } else {
        const processDraft = async () => {
          const alreadySent = await env.ORDER_STATE.get(`liff_redirected:${tenantId}:${userId}`);
          if (alreadySent) {
            try { await env.ORDER_STATE.delete(draftKey); } catch { }
            return;
          }

          const menuData = await getMenuData(env, tenantId);
          const menuContext = formatMenuForPrompt(menuData);
          const systemPrompt = `你是 ${brandName} 的 AI 訂單意圖判斷系統。\n\n${menuContext}\n\n請嚴格分析顧客訊息是否與在此店家菜單點餐或回答訂單細節相關。`;

          const ctxPrompt = `顧客之前的草稿訂單：「${draft.text || '（空）'}」\n顧客剛剛傳來：「${userText}」\n\n請問顧客這句話是：在【繼續點餐 / 追加餐點 / 回答取餐時間 / 確認訂單】嗎？\n如果是 → 回覆「ORDER」\n如果不是（單純發問、聊天、詢問食材等）→ 回覆「IGNORE」\n請嚴格只回覆 ORDER 或 IGNORE。`;
          const ctxRes = await callAI(ctxPrompt, env, tenantCtx, 8000, systemPrompt);
          const upper = (ctxRes || "").toUpperCase();
          const isOrder = /\bORDER\b/.test(upper) && !/\bIGNORE\b/.test(upper);
          if (isOrder) {
            try { await env.ORDER_STATE.delete(draftKey); } catch { }
            await replyWithLiffRedirect(replyToken, userId, env, tenantCtx);
          } else {
            try { await env.ORDER_STATE.delete(draftKey); } catch { }
          }
        };
        if (ctx && ctx.waitUntil) {
          ctx.waitUntil(processDraft());
        } else {
          await processDraft();
        }
        continue;
      }
    }

    // 1) Pending flow priority
    const pMap = pendingMapBeforeDraft;
    const pKeys = Object.keys(pMap).sort((a, b) => (pMap[b].createdAt || 0) - (pMap[a].createdAt || 0));

    if (pKeys.length > 0) {
      const orderKey = pKeys[0];
      const pending = pMap[orderKey];
      const questionText = pending?.questionText || "";
      const lowerText = userText.trim().toLowerCase();

      if (orderKey) {
        const orderRow = await env.DB.prepare(
          "SELECT * FROM orders WHERE tenant_id = ? AND key = ?"
        ).bind(tenantId, orderKey).first<any>();
        if (orderRow) {
          const order: Order = {
            key: orderRow.key,
                orderId: orderRow.order_id,
            displayKey: orderRow.display_key,
            legacyKey: orderRow.legacy_key,
            businessDate: orderRow.business_date,
            customer: orderRow.customer_name,
            time: orderRow.pickup_time,
            content: orderRow.order_content,
            status: orderRow.status,
            createdAt: new Date(orderRow.created_at + "Z").getTime(),
            userId: orderRow.user_id || undefined,
            total: orderRow.total_amount,
            reason: orderRow.reason || "",
            note: orderRow.note || ""
          };
          const pendingType = pending?.type;

          const finishPending = async () => {
            await env.DB.prepare(
              "DELETE FROM pending_actions WHERE tenant_id = ? AND user_id = ? AND order_key = ?"
            ).bind(tenantId, userId, orderKey).run();
          };

          const currentReason = pending?.reason || order.reason || "";
          const currentNote = pending?.note || order.note || "";

          // TÁCH RIÊNG TRƯỜNG HỢP "ĐỔI GIỜ NHẬN HÀNG" KHÔNG DÙNG AI
          if (pendingType === "CHANGE" && currentReason === "時間需調整") {
            const exactMatch = lowerText === "好" || lowerText === "同意" || lowerText === "ok" || lowerText === "可以" || lowerText === "好的";
            const isCancel = lowerText.includes("不要") || lowerText.includes("取消") || lowerText.includes("不用");

            if (isCancel) {
              order.status = "REJECTED";
              await replyText(replyToken, `收到，已為您取消訂單 #${order.displayKey || order.key}，謝謝您！`, env, tenantCtx);
              const cleanup = async () => { await saveOrder(env, order, tenantId); await finishPending(); await syncToGoogleSheets(order, env, tenantCtx); };
              if (ctx && ctx.waitUntil) ctx.waitUntil(cleanup()); else await cleanup();
            }
            else if (exactMatch) {
              const timeParts = (order.time || "").split(" ");
              const oldDate = timeParts[0] || "";
              const newSuggestedTime = currentNote;

              if (oldDate && oldDate.includes("-") && !newSuggestedTime.includes("-")) {
                order.time = `${oldDate} ${newSuggestedTime}`;
              } else {
                order.time = newSuggestedTime;
              }
              order.reason = "";
              order.note = "";
              order.status = "NEW"; // Tái xuất hiện thông báo đơn mới trên Dashboard với giờ mới để quán bấm nhận

              const liffUrl = tenantCtx?.liffUrl || (await resolveSecret(env.LIFF_URL)) || "https://liff.line.me/";
              const confirmedFlex = createTimeChangeConfirmedFlexBubble(order.key, newSuggestedTime, liffUrl, brandName, order.displayKey);
              await replyLineFlexMessage(replyToken, `訂單 #${order.displayKey || order.key} 已確認修改！`, confirmedFlex, env, tenantCtx);

              const cleanup = async () => { await saveOrder(env, order, tenantId); await finishPending(); };
              if (ctx && ctx.waitUntil) ctx.waitUntil(cleanup()); else await cleanup();
            }
            else {
              await replyText(replyToken, `請簡單回覆「好 / 同意」以確認，或回覆「不要了 / 取消」取消訂單。`, env, tenantCtx);
            }
            continue;
          }

          // CÁC TRƯỜNG HỢP KHÁC: DÙNG AI ĐỂ XỬ LÝ
          let aiDecision: "YES" | "NO" | "UNKNOWN" = questionText ? "UNKNOWN" : "YES";
          if (questionText) {
            const menuData = await getMenuData(env, tenantId);
            const menuContext = formatMenuForPrompt(menuData);
            const systemPrompt = `你是 ${brandName} 的 AI 訂單助理。\n\n${menuContext}\n\n請對照店家菜單品項與庫存狀況，分析顧客的回覆內容。`;

            const prompt = `店家剛才詢問顧客：「${questionText}」\n顧客的回覆是：「${userText}」\n\n請問顧客的回覆是否已針對問題做出明確決定（例如：已明確選擇欲更換的口味、同意變更、同意取消等）？\n注意：\n1. 若問題是詢問更換口味，但顧客僅回覆「好/同意」而未說明要換什麼口味，請回覆 NO。\n2. 若顧客是反問問題，請回覆 NO。\n3. 若顧客已明確選擇具體品項或同意取消，請回覆 YES。\n請嚴格只回覆 YES 或 NO。`;
            const changeFewShot: FewShotExample[] = [
              {
                role: "user",
                content: `店家剛才詢問顧客：「不好意思 越南咖啡我們現在賣完了，請問可以幫您換別的嗎？」\n顧客的回覆是：「換雞肉」\n\n請問顧客的回覆是否已針對問題做出明確決定（例如：已明確選擇欲更換的口味、同意變更、同意取消等）？\n注意：\n1. 若問題是詢問更換口味，但顧客僅回覆「好/同意」而未說明要換什麼口味，請回覆 NO。\n2. 若顧客是反問問題，請回覆 NO。\n3. 若顧客已明確選擇具體品項或同意取消，請回覆 YES。\n請嚴格只回覆 YES 或 NO。`
              },
              {
                role: "assistant",
                content: "YES"
              },
              {
                role: "user",
                content: `店家剛才詢問顧客：「不好意思 越南咖啡我們現在賣完了，請問可以幫您換別的嗎？」\n顧客的回覆是：「換雞肉好了」\n\n請問顧客的回覆是否已針對問題做出明確決定（例如：已明確選擇欲更換的口味、同意變更、同意取消等）？\n注意：\n1. 若問題是詢問更換口味，但顧客僅回覆「好/同意」而未說明要換什麼口味，請回覆 NO。\n2. 若顧客是反問問題，請回覆 NO。\n3. 若顧客已明確選擇具體品項或同意取消，請回覆 YES。\n請嚴格只回覆 YES 或 NO。`
              },
              {
                role: "assistant",
                content: "YES"
              },
              {
                role: "user",
                content: `店家剛才詢問顧客：「不好意思 燒肉賣完了，請問可以幫您換別的嗎？」\n顧客的回覆是：「換烤肉麵包」\n\n請問顧客的回覆是否已針對問題做出明確決定（例如：已明確選擇欲更換的口味、同意變更、同意取消等）？\n注意：\n1. 若問題是詢問更換口味，但顧客僅回覆「好/同意」而未說明要換什麼口味，請回覆 NO。\n2. 若顧客是反問問題，請回覆 NO。\n3. 若顧客已明確選擇具體品項或同意取消，請回覆 YES。\n請嚴格只回覆 YES 或 NO。`
              },
              {
                role: "assistant",
                content: "YES"
              },
              {
                role: "user",
                content: `店家剛才詢問顧客：「不好意思 越南咖啡我們現在賣完了，請問可以幫您換別的嗎？」\n顧客的回覆是：「不要換」\n\n請問顧客的回覆是否已針對問題做出明確決定（例如：已明確選擇欲更換的口味、同意變更、同意取消等）？\n注意：\n1. 若問題是詢問更換口味，但顧客僅回覆「好/同意」而未說明要換什麼口味，請回覆 NO。\n2. 若顧客是反問問題，請回覆 NO。\n3. 若顧客已明確選擇具體品項或同意取消，請回覆 YES。\n請嚴格只回覆 YES 或 NO。`
              },
              {
                role: "assistant",
                content: "YES"
              },
              {
                role: "user",
                content: `店家剛才詢問顧客：「不好意思 越南咖啡賣完了，請問想換成拿鐵還是美式？」\n顧客的回覆是：「好」\n\n請問顧客的回覆是否已針對問題做出明確決定（例如：已明確選擇欲更換的口味、同意變更、同意取消等）？\n注意：\n1. 若問題是詢問更換口味，但顧客僅回覆「好/同意」而未說明要換什麼口味，請回覆 NO。\n2. 若顧客是反問問題，請回覆 NO。\n3. 若顧客已明確選擇具體品項或同意取消，請回覆 YES。\n請嚴格只回覆 YES 或 NO。`
              },
              {
                role: "assistant",
                content: "NO"
              }
            ];

            const aiRes = await callAI(prompt, env, tenantCtx, 8000, systemPrompt, changeFewShot);
            if (aiRes) {
              const up = aiRes.toUpperCase();
              const hasYes = /\bYES\b/.test(up);
              const hasNo = /\bNO\b/.test(up);
              if (hasYes && !hasNo) aiDecision = "YES";
              else if (hasNo && !hasYes) aiDecision = "NO";
            }
          }

          if (pendingType === "CHANGE") {
            const isCancel = lowerText.includes("不要了") || lowerText.includes("取消") || lowerText.includes("不用了") || lowerText === "不要";

            if (isCancel) {
              order.status = "REJECTED";
              await replyText(replyToken, `好的，已為您取消訂單 #${order.displayKey || order.key}。`, env, tenantCtx);
              const cleanup = async () => { await saveOrder(env, order, tenantId); await finishPending(); await syncToGoogleSheets(order, env, tenantCtx); };
              if (ctx && ctx.waitUntil) ctx.waitUntil(cleanup()); else await cleanup();
              continue;
            }

            if (aiDecision !== "YES") {
              await replyText(replyToken, `請您明確告訴我們想換什麼品項，或者回覆「取消」直接取消訂單。`, env, tenantCtx);
              continue;
            }

            // Trường hợp đổi món / đổi vị:
            order.content = `【顧客換單】：${userText}\n----原本訂單 👇----\n${order.content}`;
            order.reason = "";
            order.note = "";
            order.status = "NEW"; // Tái kích hoạt chuông và trạng thái đơn mới trên POS để quán nhận
            await replyText(replyToken, `收到您的回覆！店家已收到您的更換品項需求「${userText}」，將儘速為您確認訂單。`, env, tenantCtx);
            const cleanup = async () => { await saveOrder(env, order, tenantId); await finishPending(); };
            if (ctx && ctx.waitUntil) ctx.waitUntil(cleanup()); else await cleanup();
            continue;
          }

          if (pendingType === "REJECT") {
            const isAgree = lowerText === "同意" || lowerText === "好" || lowerText === "ok";
            const isDifferent = lowerText.includes("不同意") || lowerText.includes("不要") || lowerText === "取消";

            if (isAgree) {
              order.status = "REJECTED";
              const reason = order.reason || "（未提供原因）";
              await replyText(
                replyToken,
                `非常抱歉！${brandName} 無法接下您的訂單 #${order.displayKey || order.key}。\n原因：${reason}\n感謝您訂購 ${brandName}，歡迎您下次再訂購。`,
                env,
                tenantCtx
              );
              const cleanup = async () => { await saveOrder(env, order, tenantId); await finishPending(); await syncToGoogleSheets(order, env, tenantCtx); };
              if (ctx && ctx.waitUntil) ctx.waitUntil(cleanup()); else await cleanup();
              continue;
            }

            if (isDifferent) {
              order.status = "NEW";
              await replyText(
                replyToken,
                `謝謝您的回覆！我已將訂單 #${order.displayKey || order.key} 回到「等待店家接單」狀態，店家會再為您確認。`,
                env,
                tenantCtx
              );
              const cleanup = async () => { await saveOrder(env, order, tenantId); await finishPending(); };
              if (ctx && ctx.waitUntil) ctx.waitUntil(cleanup()); else await cleanup();
              continue;
            }

            await replyText(replyToken, `請回覆「同意」或「不同意」。`, env, tenantCtx);
            continue;
          }
        }
      }

      try {
        await env.DB.prepare("DELETE FROM pending_actions WHERE tenant_id = ? AND user_id = ?")
          .bind(tenantId, userId).run();
      } catch { }
      await replyText(replyToken, `目前有點狀況，請稍後再確認一次。`, env, tenantCtx);
      continue;
    }

    // 2) Quick reply
    const quick = handleQuickReply(userText, tenantCtx);
    if (quick) {
      await replyText(replyToken, quick, env, tenantCtx);
      continue;
    }

    // 3) AI fallback - Detect ordering intent and redirect to LIFF
    if (tenantCtx?.aiOrderRedirectEnabled === false) {
      continue;
    }

    const aiPromise = async () => {
      const alreadySent = await env.ORDER_STATE.get(`liff_redirected:${tenantId}:${userId}`);
      if (alreadySent) return;

      const menuData = await getMenuData(env, tenantId);
      const menuContext = formatMenuForPrompt(menuData);
      const systemPrompt = `你是 ${brandName} 的 AI 助理。\n\n${menuContext}\n\n你的任務是評估顧客訊息是否具有向本店家點餐或訂購餐點飲料的意圖。`;

      const intentPrompt = `顧客傳來：「${userText}」\n\n這句話是在向店家「下訂單點餐」嗎（包含提到想要點某個餐點、詢問如何點餐、說要訂餐等）？\n如果是 → 回覆「YES」\n如果不是（單純發問、聊天、抱怨等）→ 回覆「NO」\n請嚴格只回覆 YES 或 NO。`;
      const intentRes = await callAI(intentPrompt, env, tenantCtx, 8000, systemPrompt);
      const resUpper = (intentRes || "").toUpperCase();

      const hasYes = /\bYES\b/.test(resUpper);
      const hasNo = /\bNO\b/.test(resUpper);

      if (hasYes && !hasNo) {
        await replyWithLiffRedirect(replyToken, userId, env, tenantCtx);
        return;
      }

      // Unknown, empty, mixed, or malformed AI output is fail-closed.
      return;
    };
    if (ctx && ctx.waitUntil) {
      ctx.waitUntil(aiPromise());
    } else {
      await aiPromise();
    }
  }

  return new Response("OK", { status: 200, headers: corsHeaders() });
}
