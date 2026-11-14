import OrderCode from '../../../../../js/order-code.js';
import LineOrderPresentation from '../../../../../js/line-order-presentation.js';
import type { OrderItemInput } from '../../../types/index';
import { renderReceiptItem } from './order-receipt';

export function createSoldOutItemFlexBubble(
  orderKey: string,
  soldOutItems: string | string[],
  brandName: string = "店家",
  displayKey: string = orderKey,
  liffUrl: string = "https://liff.line.me/",
  tenantId: string = "benmi"
): any {
  const itemsList: string[] = Array.isArray(soldOutItems)
    ? soldOutItems
    : String(soldOutItems || "")
        .split(/[,、]/)
        .map(s => s.trim())
        .filter(Boolean);

  const itemsDisplayText = itemsList.length > 0 ? itemsList.join("、") : "部分品項";
  const editUrl = `${liffUrl.includes('?') ? liffUrl + '&' : liffUrl + '?'}tenant_id=${encodeURIComponent(tenantId)}&mode=edit_order&order_key=${encodeURIComponent(orderKey)}&display_key=${encodeURIComponent(displayKey)}`;

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
            {
              type: "text",
              text: "訂單品項售完通知",
              size: "xs",
              weight: "bold",
              color: "#D97706",
              flex: 0
            },
            {
              type: "text",
              text: `${OrderCode.format(displayKey)}`,
              size: "sm",
              weight: "bold",
              color: "#0F172A",
              align: "end",
              flex: 1
            }
          ]
        },
        {
          type: "text",
          text: "售完品項",
          weight: "bold",
          size: "lg",
          color: "#0F172A"
        },
        {
          type: "box",
          layout: "vertical",
          backgroundColor: "#FEF3C7",
          cornerRadius: "md",
          paddingAll: "12px",
          contents: [
            {
              type: "text",
              text: itemsDisplayText,
              size: "sm",
              color: "#B45309",
              weight: "bold",
              wrap: true
            }
          ]
        },
        {
          type: "text",
          text: `非常抱歉！${brandName} 已為您保留其餘餐點。請點選下方按鈕更換其他餐點，或直接取消訂單，謝謝您！`,
          size: "xs",
          color: "#64748B",
          wrap: true,
          lineSpacing: "4px"
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
          color: "#D97706",
          height: "sm",
          action: {
            type: "uri",
            label: "👉 前往更換品項",
            uri: editUrl
          }
        },
        {
          type: "button",
          style: "secondary",
          height: "sm",
          action: {
            type: "postback",
            label: "直接取消訂單",
            data: `action=change_cancel&orderKey=${orderKey}`,
            displayText: "直接取消訂單"
          }
        }
      ]
    }
  };
}

export function createOrderModifiedConfirmationFlexBubble(
  orderKey: string,
  total: number = 0,
  _deltaAmount: number = 0,
  brandName: string = "店家",
  displayKey: string = orderKey,
  items: OrderItemInput[] = []
): any {
  const itemComponents = items.map(it => renderReceiptItem(it, 'zh-TW'));
  return LineOrderPresentation.paginate({
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
            {
              type: "text",
              text: "訂單修改確認",
              size: "xs",
              weight: "bold",
              color: "#059669",
              flex: 0
            },
            {
              type: "text",
              text: `${OrderCode.format(displayKey)}`,
              size: "sm",
              weight: "bold",
              color: "#0F172A",
              align: "end",
              flex: 1
            }
          ]
        },
        {
          type: "text",
          text: `訂單 ${OrderCode.format(displayKey)} 已成功更換品項！`,
          weight: "bold",
          size: "lg",
          color: "#0F172A",
          wrap: true
        },
        {
          type: "box",
          layout: "vertical",
          backgroundColor: "#F0FDF4",
          cornerRadius: "md",
          paddingAll: "12px",
          contents: [
            {
              type: "text",
              text: `更新後金額：$${total}`,
              size: "sm",
              color: "#15803D",
              weight: "bold"
            }
          ]
        },
        ...(itemComponents.length ? [{ type: 'box', layout: 'vertical', contents: itemComponents }] : []),
        {
          type: "text",
          text: `${brandName} 已收到您重新調整的餐點內容，店員將儘速為您確認製作，謝謝您！`,
          size: "xs",
          color: "#64748B",
          wrap: true,
          lineSpacing: "4px"
        }
      ]
    },
    footer: {
      type: "box",
      layout: "vertical",
      paddingAll: "16px",
      contents: [
        {
          type: "button",
          style: "primary",
          color: "#059669",
          height: "sm",
          action: {
            type: "postback",
            label: "查看訂單進度",
            data: `action=check_progress&order_key=${orderKey}`,
            displayText: "查看訂單進度"
          }
        }
      ]
    }
  }, itemComponents);
}
