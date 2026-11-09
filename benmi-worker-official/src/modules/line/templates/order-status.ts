import OrderCode from '../../../../../js/order-code.js';
export function createRejectFlexBubble(
  orderKey: string,
  reason: string,
  brandName: string = "店家",
  brandColor: string = "#DC2626",
  displayKey: string = orderKey
): any {
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
              text: `訂單 ${OrderCode.format(displayKey)}`,
              size: "sm",
              weight: "bold",
              color: "#DC2626"
            }
          ]
        },
        {
          type: "text",
          wrap: true,
          contents: [
            {
              type: "span",
              text: `非常抱歉！${brandName} 目前無法接單。\n原因：`
            },
            {
              type: "span",
              text: reason || "部分品項售完 / 現場忙碌無法接單",
              weight: "bold",
              color: "#DC2626"
            },
            {
              type: "span",
              text: "\n\n請協助點選下方按鈕確認是否同意取消訂單，謝謝您！"
            }
          ],
          size: "md",
          color: "#1E293B",
          lineSpacing: "6px"
        }
      ]
    },
    footer: {
      type: "box",
      layout: "horizontal",
      paddingAll: "16px",
      spacing: "md",
      contents: [
        {
          type: "button",
          style: "primary",
          color: "#DC2626",
          height: "sm",
          action: {
            type: "postback",
            label: "同意取消",
            data: `action=reject_agree&orderKey=${orderKey}`,
            displayText: "同意取消"
          }
        },
        {
          type: "button",
          style: "secondary",
          height: "sm",
          action: {
            type: "postback",
            label: "不同意",
            data: `action=reject_disagree&orderKey=${orderKey}`,
            displayText: "不同意"
          }
        }
      ]
    }
  };
}

export function createTimeChangeFlexBubble(
  orderKey: string,
  newTime: string,
  brandName: string = "店家",
  displayKey: string = orderKey
): any {
  const timeDisplay = newTime || "稍後";
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
              text: `訂單 ${OrderCode.format(displayKey)}`,
              size: "sm",
              weight: "bold",
              color: "#64748B"
            }
          ]
        },
        {
          type: "text",
          wrap: true,
          contents: [
            {
              type: "span",
              text: "目前現場較忙碌，為了提供最佳品質，請問可以改成 "
            },
            {
              type: "span",
              text: timeDisplay,
              weight: "bold",
              color: "#059669",
              size: "lg"
            },
            {
              type: "span",
              text: " 嗎？\n\n請協助點選下方按鈕回覆，謝謝您！"
            }
          ],
          size: "md",
          color: "#1E293B",
          lineSpacing: "6px"
        }
      ]
    },
    footer: {
      type: "box",
      layout: "horizontal",
      paddingAll: "16px",
      spacing: "md",
      contents: [
        {
          type: "button",
          style: "primary",
          color: "#059669",
          height: "sm",
          action: {
            type: "postback",
            label: "同意",
            data: `action=change_agree&orderKey=${orderKey}&newTime=${encodeURIComponent(timeDisplay)}`,
            displayText: "同意"
          }
        },
        {
          type: "button",
          style: "secondary",
          height: "sm",
          action: {
            type: "postback",
            label: "不同意",
            data: `action=change_cancel&orderKey=${orderKey}`,
            displayText: "不同意"
          }
        }
      ]
    }
  };
}

export function createTimeChangeConfirmedFlexBubble(
  orderKey: string,
  newTime: string,
  liffUrl: string = "https://liff.line.me/",
  brandName: string = "店家",
  displayKey: string = orderKey
): any {
  const timeDisplay = newTime || "稍後";
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
              text: "訂單修改確認",
              size: "xs",
              weight: "bold",
              color: "#059669"
            },
            {
              type: "text",
              text: `${OrderCode.format(displayKey)}`,
              size: "sm",
              weight: "bold",
              color: "#0F172A",
              align: "end"
            }
          ]
        },
        {
          type: "text",
          text: `訂單 ${OrderCode.format(displayKey)} 已確認修改！`,
          weight: "bold",
          size: "lg",
          color: "#0F172A",
          wrap: true
        },
        {
          type: "text",
          wrap: true,
          contents: [
            {
              type: "span",
              text: "取餐時間已為您更改為 "
            },
            {
              type: "span",
              text: timeDisplay,
              weight: "bold",
              color: "#059669"
            },
            {
              type: "span",
              text: "，店家已收到並將儘速為您確認訂單！"
            }
          ],
          size: "sm",
          color: "#475569",
          lineSpacing: "5px"
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
            label: "查看訂單狀態",
            data: `action=check_progress&order_key=${orderKey}`,
            displayText: "查看訂單狀態"
          }
        }
      ]
    }
  };
}

export function createChangeFlexBubble(
  orderKey: string,
  reason: string,
  note: string = "",
  brandName: string = "店家",
  brandColor: string = "#F59E0B",
  displayKey: string = orderKey
): any {
  return createTimeChangeFlexBubble(orderKey, note, brandName, displayKey);
}
