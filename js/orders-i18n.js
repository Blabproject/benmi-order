// ==========================================
// Benmi POS - Module: I18N & Localization
// ==========================================

const I18N = {
  "zh-TW": {
    paymentWorkspace: "付款管理", paymentWorkspaceIntro: "查詢付款、追蹤退款並處理需要確認的交易。",
    paymentNeedsReview: "待確認", paymentHistory: "交易紀錄", paymentRefresh: "重新整理",
    paymentToday: "今天", paymentSevenDays: "近 7 天", paymentThirtyDays: "近 30 天",
    paymentFrom: "開始日期", paymentTo: "結束日期", paymentStatus: "付款狀態", paymentSearch: "訂單編號或交易編號",
    paymentApplyFilters: "查詢", paymentAllStatuses: "所有狀態",
    paymentDateHint: "依交易建立日期篩選，每次最多 31 天，時區為台灣時間。",
    paymentSummaryHint: "依區間內實際收款與退款時間統計，不受搜尋或狀態篩選影響。",
    paymentSummaryPeriod: "收款與退款統計：{from} 至 {to}（台灣時間）",
    paymentCollectedLabel: "已收款", paymentRefundedLabel: "已退款", paymentNetLabel: "淨收款",
    paymentOrder: "訂單", paymentCreated: "建立時間", paymentAmount: "金額", paymentAttentionReason: "待確認原因",
    paymentActions: "操作", paymentLoadMore: "載入更多", paymentTransactionDetail: "交易明細", paymentClose: "關閉",
    paymentViewDetail: "查看明細", paymentTransactionId: "LINE Pay 交易編號", paymentProviderOrderId: "付款參考編號",
    paymentPaidAt: "收款時間", paymentRefundedAt: "退款時間", paymentRefundRequestedAt: "申請退款時間",
    paymentResultCode: "回應代碼", paymentRefundStatus: "退款處理狀態", paymentRefundTransactionId: "退款交易編號",
    paymentAlertCount: "有 {count} 筆 LINE Pay 交易需要確認", paymentCountStale: "LINE Pay：尚未更新",
    paymentNotConfigured: "此門市尚未設定 LINE Pay。", paymentConfigLoading: "正在確認 LINE Pay 設定…",
    paymentWorkspaceLocked: "請驗證管理 PIN 碼以查看金額、交易明細及進行操作。",
    paymentWorkspaceStale: "資料尚未更新，請檢查連線後重新整理。",
    paymentHistoryEmpty: "此條件下沒有交易。可調整日期、搜尋或狀態。",
    paymentAttentionEmpty: "目前沒有需要確認的交易。系統會自動追蹤處理中的付款與退款。",
    paymentLoading: "正在載入…", paymentInvalidRange: "請選擇有效日期，每次最多查詢 31 天。",
    paymentCheckedStatus: "已完成查詢。目前狀態：{status}。", paymentChecking: "正在確認…",
    paymentContactSupport: "聯繫支援", paymentRefundFailedHelp: "退款未成功。請提供交易編號及回應代碼聯繫支援；此處不會再次送出退款。",
    paymentReasonREFUND_FAILED: "退款失敗，需人工確認", paymentReasonPAID_CANCELLED: "已收款，但有取消要求或訂單已取消／拒絕／逾期",
    paymentReasonREFUND_DELAYED: "退款等待結果已超過 5 分鐘", paymentReasonCANCEL_DELAYED: "取消付款等待確認已超過 5 分鐘",
    paymentReasonPAYMENT_UNCERTAIN: "付款結果等待確認已超過 5 分鐘",
    paymentREQUESTING: "建立付款中", paymentPENDING: "等待顧客付款", paymentCONFIRMING: "確認付款中",
    paymentCANCELLED: "已取消付款", paymentFAILED: "付款失敗",
    paymentRefundStatePENDING: "等待處理", paymentRefundStatePROCESSING: "處理中", paymentRefundStateUNKNOWN: "等待確認結果", paymentRefundStateSUCCEEDED: "退款成功", paymentRefundStateFAILED: "退款失敗",
    paymentViewRefundFailure: "查看原因", paymentViewRefund: "退款", paymentViewCheck: "確認交易",
    paymentInvalidPIN: "PIN 碼不正確，請使用目前門市與環境的管理 PIN 碼。",
    paymentDefaultPIN: "目前仍使用預設 PIN 碼。請設定門市專用 PIN 碼，再使用付款管理功能。",
    paymentChangePinContinue: "變更 PIN 碼以繼續",
    paymentLoginNewPin: "使用新 PIN 碼驗證",
    paymentPinChangedLogin: "PIN 碼已變更。請使用新 PIN 碼驗證，以繼續管理付款。",
    paymentSessionExpired: "驗證已過期，請重新輸入門市管理 PIN 碼。",
    paymentRateLimited: "驗證次數過多，請稍候一分鐘再試。",
    paymentLoginHint: "請使用目前門市的管理 PIN 碼。",

    paymentCollected: "今日實收", paymentRefundedTotal: "今日退款", paymentNet: "今日淨收",
    paymentPAID: "已付款",
    paymentREFUND_PENDING: "退款處理中",
    paymentREFUNDED: "已退款",
    paymentREFUND_FAILED: "退款失敗，待處理",
    paymentUNKNOWN: "付款待確認",
    paymentRefund: "LINE Pay 全額退款",
    paymentUnrefunded: "訂單已取消，尚未退款",
    paymentUnrefundedTitle: "訂單已取消 — 尚未退款",
    paymentUnrefundedDesc: "顧客已透過 LINE Pay 付款。請點擊退款按鈕將款項退還顧客。",
    paymentRefundTarget: "退款金額",
    paymentRefundNotice: "款項將立即退還至顧客的 LINE Pay 帳戶。",
    paymentRefundReasonPlaceholder: "請輸入退款原因或點選上方常用選項...",
    paymentReasonOutStock: "售完缺貨",
    paymentReasonCustomerCancelled: "顧客要求取消",
    paymentReasonStoreBusy: "門市忙碌無法製作",
    paymentReasonOther: "其他原因",
    paymentRefundProcessing: "正在處理退款...",
    paymentReason: "退款原因",
    paymentCancel: "取消",
    paymentConfirm: "確認",
    paymentError: "操作未完成，請確認登入狀態後重新查詢。請勿重複付款或退款。",
    paymentLogin: "驗證門市權限",
    paymentPIN: "管理 PIN 碼",
    paymentReviewHint: "交易待確認，請至付款待處理清單查詢。",
    paymentAttention: "LINE Pay 待處理",
    paymentNone: "目前無待處理交易",
    paymentCheck: "重新查詢",

    detailRound: "第 {n} 輪",
    detailPortion: "第 {n} 份",
    detailLegacy: "原始訂單內容",
    detailOptionGroup: "客製化選項",
    detailPortionNote: "備註",
    detailItemNote: "餐點備註",
    detailRoundNote: "本輪備註",
    displayTitle: "顯示",
    displayTextSize: "文字大小",
    displayDeviceHint: "立即套用，僅儲存在此裝置。",
    displayAuto: "自動",
    displayAutoHint: "寬螢幕使用大字，窄螢幕使用標準字。",
    displayStandard: "標準",
    displayLarge: "大",
    displayExtraLarge: "特大",
    displayPreview: "預覽",
    displayPreviewOrder: "訂單 #001",
    displayPreviewItem: "2 × 招牌餐點",
    displayPreviewOptions: "客製化：微辣，不加蔥",
    displayPreviewTotal: "總金額",
    langBtn: "Tiếng Việt",
    brandTitle: "🥖 Benmi Dashboard",
    brandSub: "即時訂單",
    tabLive: "即時",
    tabHistory: "歷史",
    tabReports: "報表",
    tabStaffOrder: "桌邊點餐",
    tabSound: "測試音效",
    tabPrinter: "印表機",
    tabMenu: "菜單",
    tabSettings: "設定",
    sidebarLive: "即時訂單",
    sidebarHistory: "歷史訂單",
    sidebarMenu: "菜單管理",
    sidebarPrinter: "出單印表機",
    sidebarSettings: "系統設定",
    sidebarSupport: "技術支援",
    pageTitleLive: "訂單",
    pageTitleHistory: "歷史訂單",
    pageTitleMenu: "菜單管理",
    pageTitleSettings: "系統設定",
    pageTitleReports: "營業報表",
    headerStore: "門市: ",
    headerSwitch: "(切換)",
    reportsTitle: "餐點銷量與營收分析",
    reportsSub: "即時統計門市各品項銷售數據與加料偏好",
    rangeToday: "今天",
    range7d: "近 7 天",
    range30d: "近 30 天",
    kpiTopItem: "熱銷第一名",
    kpiTotalSold: "總銷售份數",
    kpiTotalRevenue: "餐點總營收",
    kpiTotalOrders: "成交訂單數",
    revenueSub: "餐點銷售總額",
    completedOrdersSub: "已完成 / 已結帳",
    tableTitle: "品項銷售明細排行榜",
    colRank: "排名",
    colItem: "品項名稱",
    colCategory: "分類",
    colQuantity: "銷量",
    colSales: "營收",
    colRatio: "佔比",
    colOptions: "熱門加料與選項",
    extraIngredientLabel: "配料",
    itemUnit: "品項",
    portionUnit: "份",
    emptyReports: "此期間尚無銷售數據",
    panelLeftTitle: "待處理",
    panelLeftSub: "近 → 遠 (依取餐時間)",
    panelRightTitle: "待取餐",
    liveMobileTabsLabel: "訂單狀態",
    panelRightSub: "製作中與等待取餐",
    loading: "載入中...",
    empty: "無訂單",
    emptyLivePendingTitle: "目前沒有待處理訂單",
    emptyLivePendingSub: "新進訂單將即時推播並顯示於此",
    emptyLiveAcceptedTitle: "目前無製作中訂單",
    emptyLiveAcceptedSub: "已接單的餐點將在此顯示製作進度",
    badgeNewOrder: "新訂單",
    badgeModifiedOrder: "已更換品項",

    emptyHistory: "尚無歷史訂單",
    historyTitle: "訂單歷史",
    historySub: "近 30 天訂單紀錄 (依日期分組)",
    historySearchPlaceholder: "搜尋訂單編號 / 顧客姓名 / 桌號...",
    historyFilterAll: "全部",
    historyFilterDineIn: "內用",
    historyFilterTakeaway: "外帶",
    historyNoSearchResults: "查無符合條件的訂單",
    historyNoSearchResultsSub: "請嘗試更換關鍵字或清除篩選條件",
    btnClearFilter: "清除篩選",
    btnExpandAll: "展開全部",
    btnCollapseAll: "收合全部",
    todayTag: "今天",
    orderUnit: "單",
    historyOlderTitle: "查看 30 天前的歷史訂單",
    historyOlderSub: "如需調閱更早歷史紀錄或匯出月報表，請聯繫 BLAB 團隊",
    btnContactBlab: "聯繫 BLAB",
    modalBlabTitle: "BLAB 客服與技術支援",
    modalBlabSubtitle: "門市系統疑難排解、日常操作協助與餐飲 POS 解決方案諮詢。",
    modalBlabDesc: "系統預設提供近 30 天即時訂單記錄。超過 30 天之歷史資料封存於雲端資料庫，如需查詢或匯出完整財務報表，請聯繫 BLAB 團隊為您處理。",
    blabStatusOnline: "線上",
    blabSupportChannel: "專人技術支援・LINE 一對一諮詢",
    blabSupportDirectTitle: "BLAB 客服團隊",
    blabSupportDirectBadge: "一對一支援",
    blabSupportDirectSub: "LINE 官方帳號 / 一對一技術支援",
    blabSupportDirectDesc: "出單機連線異常、列印問題、訂單同步與門市操作協助。",
    btnModalBlabLine: "開啟 LINE 支援",
    blabUpgradeTitle: "功能開通與方案諮詢",
    blabUpgradeSub: "諮詢內用接單、營收報表分析與歷史資料調閱等進階功能。",
    blabUpgradeTagDineIn: "內用接單",
    blabUpgradeTagReports: "營收報表",
    blabUpgradeTagHistory: "歷史資料",
    btnModalBlabUpgrade: "聯繫諮詢",
    blabHoursCommitment: "服務時間：每日 09:00 - 22:00（標準回覆時間 < 5 分鐘）",
    blabExportTitle: "月度報表 / 雲端匯出服務",
    blabExportSub: "請聯繫 BLAB 團隊協助調閱歷史資料",
    btnModalBlabExport: "聯絡 BLAB",
    btnModalBlabClose: "關閉",
    blabContextHistoryTitle: "歷史訂單進階調閱",
    blabContextHistoryDesc: "系統預設提供近 30 天即時訂單記錄。超過 30 天之歷史資料封存於雲端資料庫，如需查詢或匯出完整財務報表，請透過下方管道聯繫技術團隊為您處理。",
    blabContextUpgradeTitle: "方案升級與功能解鎖",
    blabContextUpgradeDesc: "如需開通「內用接單」或「銷量與營收報表分析」等進階模組，專員將於 5 分鐘內為您提供說明並線上開通。",
    blabContextSupportTitle: "即時專屬支援管道",
    blabContextSupportDesc: "門市營運遇到疑問、出單機連線異常或需要功能協助，歡迎隨時透過下方官方管道與我們聯繫。",
    startShiftTitle: "開始接收訂單",
    startShiftDesc: "點擊下方按鈕以啟動即時訂單提示音與工作階段，確保第一時間收到顧客點餐通知。",
    startShiftStatus: "即時連線・就緒接收新訂單",
    btnStartShift: "開始接單 (啟用提示音)",
    // Badges & Buttons
    badgeNew: "新訂單",
    badgeDoing: "製作中",
    badgeReady: "已完成",
    badgeWaiting: "等客戶確認",
    badgePicked: "已取餐",
    badgePaid: "已結帳",
    badgeRejected: "已取消",
    btnReview: "查看訂單",
    btnReady: "準備好了",
    btnPickedUp: "已取餐",
    btnPaid: "已結帳",
    btnWaitingReply: "等待客戶回覆",
    btnView: "查看",
    defaultCustomer: "顧客",
    processing: "處理中...",
    processFail: "處理失敗，請稍後再試。",
    // Time & ETA
    pickupLabel: "取餐:",
    tileItemCount: "{count} 項",
    etaArrived: "已到 / {min} 分鐘前",
    etaArrivedHours: "已到 / {h} 小時 {m} 分前",
    etaArrivedHoursOnly: "已到 / {h} 小時前",
    etaArrivedDays: "已到 / {d} 天前",
    etaArrivedDaysHours: "已到 / {d} 天 {h} 小時前",
    etaArrivedWeeks: "已到 / {w} 週前",
    etaMinutes: "剩 {min} 分鐘",
    etaHours: "剩 {h} 小時 {m} 分",
    etaHoursOnly: "剩 {h} 小時",
    etaDays: "剩 {d} 天",
    etaDaysHours: "剩 {d} 天 {h} 小時",
    etaWeeks: "剩 {w} 週",
    dineInElapsedJustNow: "剛剛下單",
    dineInElapsedMinutes: "{min} 分鐘前下單",
    dineInElapsedHours: "{h} 小時 {m} 分前下單",
    dineInElapsedHoursOnly: "{h} 小時前下單",
    dineInElapsedDays: "{d} 天前下單",
    dineInElapsedDaysHours: "{d} 天 {h} 小時前下單",
    dineInElapsedWeeks: "{w} 週前下單",
    dineInAppendedJustNow: "剛剛加點",
    dineInAppendedMinutes: "{min} 分鐘前加點",
    dineInAppendedHours: "{h} 小時 {m} 分前加點",
    dineInAppendedHoursOnly: "{h} 小時前加點",
    dineInAppendedDays: "{d} 天前加點",
    dineInAppendedDaysHours: "{d} 天 {h} 小時前加點",
    dineInAppendedWeeks: "{w} 週前加點",
    dineInTimeLabel: "點餐時間",
    dineInAppendedTimeLabel: "加點時間",
    dineInElapsedHeader: "下單進度",
    // Alert modal
    alertTitle: "{count} 單 新訂單",
    alertTitleAppend: "{count} 單 現場加點",
    alertTitleCombined: "{newCount} 單新訂單，{appendCount} 單現場加點",
    alertSub: "點擊「審核訂單」查看詳情並接單",
    alertSubAppend: "桌號：{tables} 剛加點新品項，請盡速製作",
    alertBtnReview: "審核訂單",
    alertBtnDismiss: "暫時隱藏",
    // Review Modal
    reviewTitle: "訂單詳情",
    reviewTitleNew: "審核訂單",
    labelOrder: "訂單編號",
    labelCustomer: "LINE 顧客",
    labelPickup: "取餐時間",
    labelEta: "剩餘時間",
    labelTotal: "總金額",
    labelSubtotal: "小計",
    labelGrandtotal: "總計",
    labelDiscount: "折抵優惠",
    labelStatus: "狀態",
    labelDiningOption: "用餐方式",
    labelOrderItems: "餐點明細",
    statusPillNew: "待處理",
    statusPillAccepted: "製作中",
    statusPillDone: "待取餐",
    statusPillPicked: "已取餐",
    statusPillPaid: "已結帳",
    statusPillWaiting: "待客人確認",
    statusPillRejected: "已取消",
    customerNoteLabel: "顧客備註",
    flavorTitle: "口味與客製設定",
    customerChangeTitle: "顧客換單 / 特殊需求",
    viewRawOrder: "查看原始訂單內容",
    hideRawOrder: "收起原始內容",
    printToolsLabel: "出單與列印工具",
    rawOrderTitle: "原始訂單文字（Raw Data）",
    btnCopy: "複製",
    copySuccess: "已複製",
    btnPrintStickerShort: "印貼紙",
    btnPrintAllPortionsShort: "印全{n}張",
    itemPreparedBadge: "已完成",
    btnAccept: "接單",
    btnChange: "需要更改",
    btnReject: "無法接單",
    btnCancelOrder: "取消訂單",
    btnClose: "關閉",
    confirmCancelOrder: "確定要取消此訂單嗎？客戶將不會收到通知。",
    confirmForceCancel: "客戶無回應，確定要強制取消此訂單嗎？",
    // Change Modal
    changeTitle: "需要更改",
    changeTabTime: "時間太趕，需延後",
    changeTabTimeSub: "建議延後取餐時間",
    changeTabSoldout: "該口味已售完",
    changeTabSoldoutSub: "選擇已售完的品項",
    origTimeLabel: "客戶原定取餐時間",
    calcFromNowSub: "（以現在/原定時間計算）",
    changeTimeTitle: "⏰ 建議新取餐時間:",
    changeTimeSub: "輸入新時間或點擊下方快速加分",
    changeTimePlaceholder: "例: 11:30",
    changeQuickSelect: "點擊快速選擇延後時間:",
    soldoutTitle: "點擊選擇已售完品項:",
    soldoutClear: "取消全選",
    btnSendSuggest: "傳送建議",
    btnCancel: "取消",
    btnConfirm: "確認",
    alertInputTime: "請輸入建議的新取餐時間 (例: 11:30)！",
    alertSelectSoldout: "請至少選擇一項已售完的品項！",
    // Reject Modal
    rejectTitle: "無法接單",
    rejectR1Title: "今日已售完",
    rejectR1Sub: "所有餐點已全數售完",
    rejectR2Title: "訂單過多，暫不接單",
    rejectR2Sub: "現場製作繁忙，暫停接單",
    rejectR3Title: "已過營業時間",
    rejectR3Sub: "目前非營業時段",
    rejectR4Title: "取消並不回復客戶",
    rejectR4Sub: "直接取消且不發送訊息",
    btnConfirmReject: "確認拒絕",
    btnBack: "返回",
    // Settings
    settingsTitle: "系統設定",
    settingsSub: "門市營運參數、出單列印與設備偏好",
    settingsSyncStatus: "雲端即時同步",
    tocSettingsTitle: "設定目錄",
    tocSettingsSub: "系統與門市參數",
    tocStoreStatus: "門市接單狀態",
    tocOrderMode: "點餐取餐模式",
    tocPayment: "付款方式設定",
    tocHours: "營業時間設定",
    tocStoreInfo: "門市基本資訊",
    settingStoreInfoTitle: "門市基本資訊",
    settingStoreInfoSub: "管理門市標誌 (Logo)、跑馬燈公告與門市聯絡地址",
    btnSaveAllStoreInfo: "儲存全部資訊",
    tocAddress: "門市地址設定",
    tocLogo: "門市 Logo",
    settingStoreStatusTitle: "門市接單狀態",
    settingStoreStatusSub: "隨時切換一般營業、繁忙延後或暫停接單模式",
    boxOpenTitle: "正常營業",
    boxOpenDesc: "立即接單，優先於今日營業時間與公休日",
    boxBusyTitle: "門市繁忙 (+1小時)",
    boxBusyDesc: "新訂單自動延長 1 小時製作時間",
    boxPausedTitle: "暫停接單",
    boxPausedDesc: "暫停接收新訂單，顧客端無法下單",
    statusOpen: "營業中",
    statusBusy: "繁忙中 (+1小時)",
    statusPaused: "暫停接單",
    statusClosed: "打烊休息",
    statusMenuHeader: "門市接單狀態",
    statusOptOpenTitle: "營業中",
    statusOptOpenDesc: "立即接單，優先於今日營業時間與公休日",
    statusOptBusyTitle: "繁忙中 (+1小時)",
    statusOptBusyDesc: "新訂單製作時間自動延長 1 小時",
    statusOptPausedTitle: "暫停接單",
    statusOptPausedDesc: "暫停接收新訂單，顧客端無法下單",
    statusOptClosedTitle: "打烊休息",
    statusOptClosedDesc: "暫停接受新訂單",
    prepTimeTitle: "門市預估備餐時間",
    prepTimeSub: "當顧客選擇「盡快取餐」時，系統將依此時間預估完成時間。店家可視現場忙碌狀況隨時調整",
    settingPrepTimeTitle: "門市預估備餐時間",
    settingPrepTimeSub: "當顧客選擇「盡快取餐」時，系統將依此時間預估完成時間。店家可視現場忙碌狀況隨時調整",
    prepTimeMin: "{n} 分鐘",
    prepTimeSaved: "已更新備餐時間為 {n} 分鐘",
    prepTimePrompt: "請輸入預估出餐時間（分鐘，0-180）:",
    prepTimeInvalid: "請輸入 0 至 180 之間的有效分鐘數",
    prepTimeCustom: "自訂",
    prepTimeMinShort: "分",
    orderModeTitle: "點餐模式 / 取餐時間設定",
    orderModeSub: "自訂允許顧客預約取餐時間或依序即刻製作",
    btnSaveSetting: "儲存設定",
    modeScheduledTitle: "允許預約取餐",
    modeScheduledSub: "顧客可在點餐頁面自選取餐日期與時間，適合預先排程準備餐點的店家。",
    modeAsapTitle: "僅限現場排隊 / 即刻出餐模式",
    modeAsapSub: "隱藏預約時間選項。顧客送出訂單後，店家將依序即刻製作出餐。",
    paymentSettingsTitle: "付款方式設定",
    paymentSettingsSub: "自訂顧客在線上點餐時可使用的付款選項",
    btnSavePaymentSetting: "儲存設定",
    paymentOptLinePayTitle: "LINE Pay (線上付款)",
    paymentOptLinePaySub: "顧客可在點餐頁直接以 LINE Pay 完成線上結帳，款項即時入帳。",
    paymentOptCashTitle: "取餐時付款 / 現場結帳（訂單先送出）",
    paymentOptCashSub: "允許顧客先下單，待抵達門市取餐時再以現金或其他臨櫃方式結帳。",
    paymentSettingsHint: "提示：若僅勾選「LINE Pay」，顧客在點餐頁送出訂單前必須先完成線上付款；若同時勾選「取餐時付款」，顧客可自行選擇線上支付或到店付款。",
    paymentBadgeActive: "已啟用",
    paymentBadgeInactive: "未啟用",
    paymentSettingsUnavailableHint: "此店家尚未啟用 LINE Pay，付款方式固定為「取餐時付款」。",
    paymentMinOneRequired: "請至少選擇一種付款方式！",
    paymentSettingsSaved: "已成功儲存付款方式設定！",
    paymentSettingsBtn: "付款方式設定",
    hoursTitle: "營業時間設定",
    hoursSub: "設定每日營業時段與公休日",
    btnSaveHours: "儲存時間",
    settingAddressTitle: "門市地址",
    settingAddressSub: "顯示於顧客點餐頁面與 LINE 官方帳號回覆",
    settingAddressPlaceholder: "請輸入門市地址",
    btnSaveAddress: "儲存地址",
    tocAnnouncement: "門市公告設定",
    settingAnnouncementTitle: "門市公告設定",
    settingAnnouncementSub: "顯示於顧客點餐頁面 Header 最下方，留空則自動隱藏",
    settingAnnouncementPlaceholder: "請輸入門市公告（例如：今日特餐全面 9 折 / 國定假日公休公告...）",
    btnSaveAnnouncement: "儲存公告",
    settingLogoTitle: "門市 Logo",
    settingLogoSub: "顯示於顧客點餐頁面頂部與 POS 系統",
    btnChooseLogo: "選擇圖片",
    logoHint: "支援 PNG, JPG, WebP 格式（建議正方形 512x512px 以達最佳效果）",
    btnSaveLogo: "儲存 Logo",
    btnDeleteLogo: "刪除 Logo",
    logoUploadPrompt: "請先選擇要上傳的 Logo 圖片",
    confirmDeleteLogo: "確定要刪除門市 Logo 嗎？",
    logoDeleteSuccess: "已成功移除門市 Logo！",
    btnAddShift: "+ 新增時段",
    closedDay: "公休",
    saving: "儲存中...",
    saveSuccess: "設定儲存成功！",
    printerSavedLocally: "印表機設定已儲存於此裝置（變更會自動儲存）。",
    printerSaveFailed: "無法儲存印表機設定，請確認此裝置的儲存空間後重試。",
    printerAutoSaveHint: "設定變更會自動儲存於此裝置，也可按下儲存按鈕立即儲存。",
    printerFeedBeforeCut: "裁切前進紙／底部留白 (mm)",
    saveFail: "儲存失敗：",
    // Printer Settings
    btnPrint: "列印",
    btnReprint: "補印",
    tocPrinter: "出單與印表機",
    settingPrinterTitle: "出單與印表機",
    settingPrinterSub: "設定 Wi-Fi / LAN 區域網路熱感應出單機 (Port 9100) 與自動列印模式",
    printerAutoPrintTitle: "確認接單後自動列印",
    printerAutoPrintDesc: "店員確認接單成功後，自動列印至已啟用的印表機",
    printerCashierTitle: "收據印表機（ESC/POS）",
    printerCashierDesc: "出明細發票、含金額、客製化與 QR Code",
    printerKitchenTitle: "貼紙印表機（TSPL）",
    printerKitchenDesc: "列印單品或整單標籤，可調整 X／Y 位置。",
    printerInterfaceLabel: "連線方式",
    printerInterfaceNetwork: "區域網路 / Wi-Fi (TCP/IP)",
    printerInterfaceBluetooth: "藍牙無線 (Bluetooth SPP)",
    printerEnableLabel: "啟用",
    printerStatusConnected: "已連線印表機",
    printerStatusNone: "未連線印表機",
    printerDisabled: "已停用",
    printerNotConfigured: "未設定連線",
    printerStationCashierShort: "櫃檯",
    printerStationKitchenShort: "廚房",
    printerTypeBluetooth: "藍牙",
    printerTypeLAN: "區網",
    printerBtDeviceLabel: "已配對藍牙裝置",
    printerBtSelectPlaceholder: "-- 請選擇已配對的藍牙印表機 --",
    printerBtDevicePlaceholder: "-- 請選擇已配對的藍牙印表機 --",
    printerBtRefreshBtn: "重新整理",
    printerBtNoDevices: "未發現已配對裝置，請先至 Android 設定中完成配對",
    printerIpLabel: "IP 位址 (LAN / Wi-Fi)",
    printerPortLabel: "Port 端口",
    printerPaperLabel: "紙張規格",
    printerPaper80: "80mm (標準大票)",
    printerPaper58: "58mm (小票)",
    printerProtocolLabel: "列印指令協定 (Protocol)",
    printerOptEscPos: "ESC/POS (收據/小票 58-80mm)",
    printerOptTspl: "TSPL (貼紙/標籤機 如 Aimo D520BT, Xprinter)",
    printerTsplSizeLabel: "標籤紙張尺寸",
    printerOptTspl100x150: "100 x 150 mm (4x6\" 貨運/大袋貼紙)",
    printerOptTspl76x130: "76 x 130 mm (3x5\" 訂單明細貼紙)",
    printerOptTspl50x30: "50 x 30 mm (餐盒/單品標籤)",
    printerOptTspl40x30: "40 x 30 mm (飲料杯貼/單品標籤)",
    printerOptTsplCustom: "自訂尺寸 (Custom mm)",
    printerTsplWidthLabel: "寬度 (mm)",
    printerTsplHeightLabel: "高度 (mm)",
    printerTsplModeLabel: "標籤列印模式",
    printerOptTsplModeSummary: "訂單總表貼紙 (1張/每張訂單)",
    printerOptTsplModeItems: "單品/杯貼標籤 (1張/每份餐點)",
    printerTsplDpiLabel: "解析度 (DPI)",
    printerOptTsplDpi203: "203 DPI (8 dots/mm - 標準)",
    printerOptTsplDpi300: "300 DPI (11.8 dots/mm - 高解析度)",
    printerTsplXOffsetLabel: "水平邊距 X (mm)",
    printerTsplYOffsetLabel: "垂直邊距 Y (mm)",
    btnTestPrint: "測試列印 (Test Print)",
    btnSavePrinterSettings: "儲存印表機設定",
    // Print Mode Settings (Auto vs Manual)
    printModeTitle: "列印出單模式",
    printModeSub: "選擇新訂單進來時的列印行為",
    printModeAutoTitle: "確認後自動列印",
    printModeAutoDesc: "收到新訂單時先發出提示音，店員確認接單成功後，才自動列印明細與餐點貼紙。",
    printModeManualTitle: "手動列印模式 (Manual-print)",
    printModeManualDesc: "店員須在螢幕點選 [整單全印] 機器才會出單。適合需要先核對確認訂單的門市。",
    // 3 Print Levels
    btnPrintFullOrder: "整單全印<span class=\"print-action-summary\">1 張明細 + {n} 張標籤</span>",
    btnPrintBillOnly: "僅印收銀明細",
    btnPrintCustomOption: "補印自訂標籤",
    btnPrintSingleItem: "印此品項貼紙",
    printDisabledBill: "請先啟用並設定 Bill 印表機",
    printDisabledStickers: "請先啟用並設定貼紙印表機",
    printDisabledFull: "整單列印需要同時啟用 Bill 與貼紙印表機",
    printingInProgress: "正在出單列印中，請稍候...",
    printerBusyQueued: "⏳ 已加入列印排程，將依序出單...",
    itemPrepared: "已完成",
    markPrepared: "標記已出餐",
    printSingleItemSuccess: "已列印「{name}」貼紙！",
    btnPrintPortion: "印此份貼紙",
    printPortionsPrinting: "正在列印「{name}」{count} 張貼紙...",
    printPortionsSuccess: "已列印「{name}」{count} 張貼紙！",
    bundleSelectionsTitle: "套餐組合內容",
    bundlePortionPrefix: "第 {n} 份",
    bundleGroupFallback: "搭配",
    // Quick Sticker / Emergency Note Modal
    quickStickerModalTitle: "補印客製標籤 (緊急貼紙)",
    quickStickerModalSub: "點擊下方常見選項，立即列印 1 張獨立備註貼紙粘貼於餐點上：",
    quickStickerCustomLabel: "或輸入自訂備註文字：",
    quickStickerCustomPlaceholder: "輸入自訂備註 (例如：少冰、不要酸菜)...",
    quickStickerCustomPrintBtn: "列印此備註",
    quickStickerPrinting: "正在列印備註貼紙...",
    quickStickerSuccess: "已出標籤: 「{text}」！",
    quickStickerLoading: "正在載入選項...",
    quickStickerGroupSpice: "辣度選項",
    quickStickerGroupVeggie: "蔥花與香菜",
    quickStickerGroupIceSugar: "甜度與冰量",
    quickStickerGroupKitchen: "出餐與分裝",
    // Printer Usage Guide
    printerGuideTitle: "出單與印表機功能使用指南",
    printerGuideSub: "深入了解自動出單、單據規格與 3 段式列印操作技巧",
    btnPrinterGuide: "出單指南",
    btnViewPrinterGuide: "查看完整指南",
    btnCloseGuide: "我知道了",
    printerGuideStripTitle: "需要了解自動出單、雙機搭配或 3 段式列印技巧？",
    printerGuideModeTitle: "1. 列印出單模式說明 (Auto vs. Manual)",
    printerGuideModeAutoTitle: "確認後自動列印",
    printerGuideModeAutoDesc: "客人送出訂單後，系統先發出提示音。店員檢查內容並確認接單成功後，才自動列印「1 張收銀明細」與「全部餐點貼紙」。店員自行建立的訂單，送出即視為確認。",
    printerGuideModeManualTitle: "手動列印模式 (Manual-print)",
    printerGuideModeManualDesc: "收到新單時僅發出通知音，店員需點進訂單詳細頁確認餐點內容後，點選 [整單全印] 才會出單。適合需先確認庫存或客製化說明的門市。",
    printerGuideLevelsTitle: "2. 訂單詳細頁 3 段式列印控制",
    printerGuideLevelFullTitle: "整單全印 (明細+標籤）",
    printerGuideLevelFullDesc: "一鍵送出：1 張櫃檯明細 (給客人或留底) + N 張廚房貼紙 (每份餐點 1 張獨立杯貼/盒貼)。",
    printerGuideLevelBillTitle: "僅印收銀明細",
    printerGuideLevelBillDesc: "僅出單張收據小票，適合結帳找零、補開客人明細或退換貨核對。",
    printerGuideLevelSingleTitle: "單品貼紙補印",
    printerGuideLevelSingleDesc: "每道餐點右側設有 [印貼紙] 鈕，遇卡紙或貼紙破損時可單獨補印該品項，方便又快速。",
    printerGuideLevelCustomTitle: "補印客製/緊急貼紙",
    printerGuideLevelCustomDesc: "點開可快選常見備註 (如：不要香菜、去冰、微辣) 或手動輸入特殊要求，立即印出獨立小貼紙貼在餐盒上。",
    printerGuideHardwareTitle: "3. 雙印表機 (Dual-Station) 建議設定",
    printerGuideAlignTitle: "4. 列印位置與裁切",
    printerGuideAlignBillHeading: "RECEIPT · 收據列印",
    printerGuideAlignLabelHeading: "LABEL · 貼紙列印",
    printerGuideAlignReceipt: "收據請選 ESC/POS 與實際紙寬（58／80 mm）。系統會在內容印完後進紙再裁切；X／Y 是貼紙定位，不能修正收據裁切。更新 Android 應用程式後，請連續試印兩張，確認總計及頁尾完整。",
    printerGuideAlignLabel: "貼紙先選正確尺寸與 DPI，再調整 X／Y（毫米）。X 增加向右移，Y 增加向下移；目前負值視為 0。每次調整 0.5–1 mm 後試印，過大的位移可能超出紙張。位置正常時維持 0 即可。",
    printerGuideAlignReceiptCaption: "收據：內容 → 留白 → 裁切",
    printerGuideAlignLabelCaption: "貼紙：X 向右，Y 向下",
    printerGuideHwCashier: "• 櫃檯印表機：建議使用 ESC/POS 協定熱感應小票機 (80mm 或 58mm)，連接 Wi-Fi (Port 9100) 或藍牙。",
    printerGuideHwKitchen: "• 廚房/吧台印表機：建議使用 TSPL 協定標籤貼紙機 (如 Aimo, Xprinter 40x30mm / 50x30mm)，模式選「單品/杯貼標籤」。",
    printerGuideHwTest: "• 每日開班前建議點選「測試列印」確認連線通暢。",
    // Menu Editor
    menuCatTitle: "菜單分類",
    menuCatSub: "點擊左側分類以管理品項",
    btnManageCategories: "顯示排序",
    moveDisplayUp: "上移",
    moveDisplayDown: "下移",
    manageCategoriesTitle: "顯示排序",
    manageCategoriesSub: "拖曳或使用上下按鈕調整分類與口味選擇的位置。選取分類可排序餐點；選取口味選擇可排序其中的群組，完成後請儲存變更。",
    menuOrderSections: "分類與口味選擇",
    menuOrderFlavorSection: "口味選擇",
    menuOrderGroups: "口味選擇內的群組",
    menuOrderItems: "{name}內的餐點",
    tabletSortTipLabel: "平板排序提示：",
    tabletSortTipDesc: "長按拖曳把手 ⠿ 或使用箭頭按鈕 ▲ ▼ 調整順序。點擊左側卡片即可將該分類餐點載入右側。",
    posTouchModeBadge: "POS 觸控模式",
    menuSortBreadcrumbMenu: "菜單管理",
    menuSortBreadcrumbDineTakeaway: "內用 / 外帶",
    statusAutoSaved: "已自動儲存",
    statusUnsaved: "未儲存變更",
    btnRevertSort: "復原",
    btnSaveSortChanges: "儲存變更",
    sortColSectionsTitle: "分類與全單客製化順序",
    sortColClickToView: "點擊查看餐點",
    badgeScopeOrder: "全單",
    badgeFoodItem: "餐點",
    badgeComboItem: "套餐搭配餐點",
    badgeUncategorized: "未分類餐點",
    badgeSelectedState: "已選取",
    btnOpeningCategory: "正在開啟",
    customizationOptionsCount: "{n} 項客製化",
    categoryItemsCount: "{n} 道餐點",
    menuOrderCustomizationsIn: "客製化選項：{name}",
    menuOrderItemsIn: "分類內餐點：{name}",
    sortColItemsSubtitle: "設定顧客先看到的餐點順序",
    nItemsVisible: "{n} 道餐點顯示",
    nCustomizationsVisible: "{n} 項客製化顯示",
    dragToReorder: "拖曳以調整順序",
    wholeOrderMasterTitle: "口味與客製化選擇",
    requiredOptionBadge: "必選",
    optionalOptionBadge: "可選",
    btnCloseManager: "關閉",
    btnAddCategory: "新增分類",
    btnMenuAddCategory: "新增分類",
    btnAddCategoryBottom: "新增菜單分類",
    btnCategoryDelete: "刪除分類",
    btnCategoryRename: "重新命名",
    addCategoryModalTitle: "新增菜單分類",
    categoryNameLabel: "分類名稱",
    categoryNamePlaceholder: "例: 豆漿 意仁漿, 經典主食",
    categoryShortNameLabel: "導航簡稱 (選填，手機版頁籤顯示)",
    categoryShortNamePlaceholder: "留空則與分類名稱相同",
    categoryTypeLabel: "分類類型",
    categoryTypeCatalog: "菜單品項 (主餐 / 飲料)",
    categoryTypeModifier: "客製化選項 (加辣 / 加料 / 甜度)",
    categoryTypeCustomization: "整單口味與客製化 (例如：口味、鹹度、配料調整)",
    categoryTypeCatalogBadge: "餐點",
    confirmDeleteCategory: "確定要刪除整個「{name}」分類及其內部所有品項嗎？",
    promptCategoryNameEmpty: "請輸入有效的分類名稱！",
    promptCategoryNamePrompt: "請輸入新的分類名稱：",
    customizationSettings: "客製化設定",
    allowCustomizationLabel: "允許客製化選項 (加料 / 辣度 / 備註)",
    allowCustomizationDesc: "開啟後，顧客在點選此分類餐點時可選擇客製化設定",
    appliedModifiersTitle: "分類預設客製化",
    appliedModifiersDesc: "勾選顧客在點選此分類餐點時可使用的客製化選項 (預設為全部勾選)",
    btnSelectAll: "全選",
    btnUnselectAll: "清除 (全不選)",
    noModifiersInStore: "目前尚未建立任何客製化分類 (如加辣、加料等)",
    modifiersEmptyTitle: "尚未建立客製化選項群組",
    modifiersEmptyDesc: "建立加料、甜度、冰塊、辣度等客製化群組，供顧客點餐時自訂選擇。",
    btnCreateModifierGroup: "建立客製化群組",
    tooltipItemPhoto: "點擊查看或更換餐點圖片",
    tooltipDropToUpload: "放開以立即上傳餐點圖片",
    imageUploadSuccessToast: "餐點圖片上傳成功",
    itemModifiersCount: "項客製",
    appliedModifiersCardDesc: "此分類下的所有餐點將預設套用以下客製化群組（亦可在各餐點「設定」中單獨調整）",
    colItemPhoto: "圖片",
    colItemName: "餐點名稱",
    colPrice: "售價",
    colModifiers: "客製化群組",
    colStock: "供應狀態",
    colActions: "操作",
    inheritedCatModifiers: "繼承預設",
    customItemModifiers: "項專屬客製",
    noModifiersApplied: "無客製化",
    btnMoreActions: "更多操作",
    btnDuplicateItem: "複製餐點",
    duplicateSuffix: "副本",
    toggleModifiersCollapse: "收合",
    toggleModifiersExpand: "展開",
    catalogManageTitle: "餐點設定",
    catalogManageDesc: "編輯餐點名稱、價格、供應狀態與詳細設定。",
    menuEditorTitle: "分類項目",
    menuEditSub: "點擊餐點以編輯；使用「顯示排序」調整順序。",
    btnMenuRestore: "恢復預設菜單",
    btnMenuAddItem: "新增項目",
    btnMenuCreateType: "建立設定",
    btnMenuCreateUnified: "建立新項目",
    btnMenuAddCustomGroup: "新增客製化分組",
    newGroupCardTitle: "新增客製化分組",
    newGroupInputPlaceholder: "✦ 輸入分組名稱（例：✦ 醬料選擇、✦ 加料選項）",
    btnSaveGroup: "儲存分組",
    menuSectionCatalogTitle: "單品與特惠套餐",
    menuSectionComboTitle: "特惠套餐",
    menuSectionCustomTitle: "口味與客製化",
    segProducts: "餐點",
    segOptions: "客製選項",
    btnAddOptionGroupTop: "新增客製化分組",
    optionsCountUnit: "項選擇",
    noOptionGroupsPrompt: "尚無客製化分組 (點擊上方按鈕立即建立)",
    noCategoriesPrompt: "尚無任何客製化分組，請點擊上方按鈕建立",
    btnAddCatalogCategory: "新增餐點分類",
    btnAddComboCategory: "新增套餐分類",
    btnCreateComboWizard: "建立特惠套餐",
    btnCreateCustomGroup: "新增客製化分組",
    noComboCategoriesPrompt: "尚無套餐分類 (點擊下方立即建立)",
    btnCatRename: "重新命名",
    btnCatDelete: "刪除分類",
    createTypeModalTitle: "選擇菜單設定類型",
    createTypeModalSub: "請選擇要新增的餐點或客製化類型",
    createTypeStandardTitle: "單品餐點",
    createTypeStandardDesc: "新增單品餐點，設定價格、圖片與推薦標籤，並可隨時配置專屬客製選項。",
    createTypeModifiersTitle: "單品含客製選項",
    createTypeModifiersDesc: "獨立單品，可配置專屬加料、甜度冰塊、辣度等多組選項。",
    createType1Title: "特惠套餐 (組合選擇)",
    createType1Desc: "顧客必須從指定分類中任選 N 樣餐點，支援重複與單品客製。",
    createType3Title: "整單客製化 (全單設定)",
    createType3Desc: "適用於整筆訂單的通用偏好設定 (餐具、整單辣度、通用備註)。",
    btnItemModifiers: "客製選項",
    itemModifiersModalTitle: "設定餐點客製選項",
    itemModifiersModalSub: "勾選要套用至此餐點的客製化群組",
    itemModAppliesTo: "套用餐點",
    itemModDraftNote: "完成設定後，請儲存菜單以同步變更。",
    itemModInheritedHelp: "由分類自動套用，不需再次勾選。",
    itemModNoInherited: "此分類尚未套用選項群組。",
    itemModDirectTitle: "此餐點的專屬選項",
    itemModDirectHelp: "從共用選項庫勾選要套用的群組。",
    itemModFilterLabel: "篩選選項群組",
    itemModAllGroups: "全部群組",
    itemModSelectedGroups: "已選群組",
    itemModSelectVisible: "全選目前結果",
    itemModClearVisible: "取消選取目前結果",
    itemModSharedHelp: "必選／選填為共用群組設定，變更會影響使用此群組的餐點。",
    itemModNoFilterResults: "沒有符合條件的群組。請調整搜尋或切換至全部群組。",
    itemModViewOptions: "查看選項與加價",
    itemModNoSurcharge: "不加價",
    itemModCreateGroup: "建立選項群組",
    itemModHubSummary: "專屬 {direct} 組 · 分類繼承 {inherited} 組",
    btnManageCustomLibrary: "+ 前往客製化庫管理",
    libraryGroupAvailableBadge: "客製化庫（共 {total} 組）",
    appliedGroupCountBadge: "已套用：{count} 組",
    searchModifierGroupsPlaceholder: "搜尋客製化群組...",
    modifierOptionCountUnit: "項選項",
    modifierGroupUnit: "組",
    moreOptionsCount: "+{count} 項選項",
    noOptionsInGroup: "尚未建立選項",
    selectionTypeSingle: "單選",
    selectionTypeMultiple: "多選",
    inheritedFromCategoryNotice: "✦ 從所屬分類繼承（已自動套用至此分類所有餐點）",
    noLibraryModifierGroups: "目前客製化庫尚無可選的群組",
    noLibraryModifierGroupsSub: "請前往客製化庫建立群組後，再為餐點勾選套用。",
    btnNewModifierGroup: "新增選項群組",
    btnAddItemModGroup: "+ 新增選項群組",
    btnOpenModLibrary: "+ 從客製化庫選取",
    btnItemModSave: "完成設定",
    btnImportLibraryMod: "加入此餐點",
    labelModifierGroupName: "群組名稱 (例: 辣度、加料、甜度冰塊)",
    labelModifierSelectionType: "選擇模式",
    optionSingleRadio: "單選 (Radio)",
    optionMultipleCheckbox: "多選 (Checkbox)",
    labelModifierRequired: "是否必選",
    labelMinSelection: "最少選取",
    labelMaxSelection: "最多選取",
    labelMultipleBoundsHint: "(0 = 不限)",
    labelItemCustomizationNotice: "此為品項專屬客製化，將與所屬分類繼承選項累加合併（不會被覆蓋）",
    labelModifierDefault: "預設",
    badgeRequired: "必填",
    badgeOptional: "選填",
    btnAddModifierOption: "新增選項",
    labelOptionName: "選項名稱",
    labelOptionPrice: "加價 (+$$)",
    noModifierGroups: "此品項尚未設定專屬客製選項。點擊上方按鈕開始新增。",
    btnSaveModifiers: "完成設定",
    optionSectionOrder: "整單適用",
    optionSectionItem: "餐點適用",
    optionSectionEmpty: "尚無客製化分組",
    scopeOrder: "整單適用",
    scopeCategory: "分類套用",
    scopeItem: "單品適用",
    scopeCategoryItem: "依分類或品項套用",
    btnSelectCategories: "選擇分類",
    scopeSettingsTitle: "設定套用分類與範圍",
    scopeOrderDesc: "適用於整筆訂單結帳時的選項（如餐具、全單辣度）",
    scopeCategoryDesc: "所選分類下的所有餐點將自動繼承此客製化選項",
    scopeItemDesc: "僅在手動加入個別品項或套餐時適用",
    labelAppliedCategories: "套用分類：",
    appliedSummary: "已套用至 {catCount} 個分類 (共 {itemCount} 項餐點)",
    inheritedFromCategory: "從分類繼承",
    btnAddFromLibrary: "從客製化庫選取",
    libraryModalTitle: "從現有客製化庫選取",
    libraryModalSub: "勾選要套用至此餐點的客製化群組或選項",
    btnImportToItem: "加入此餐點",
    noLibraryOptions: "目前尚無其他客製化分組可供選取",
    toggleRequiredOn: "切換為必填",
    toggleRequiredOff: "切換為選填",
    btnMenuSave: "儲存變更",
    menuSaved: "已儲存",
    menuWorkspaceTitle: "菜單管理",
    menuWorkspaceSub: "即時管理餐點項目、售價、客製化選項與庫存供應狀態",
    menuSidebarTotalCats: "分類總數：{count}",
    menuSidebarActiveItems: "{count} 項餐點供應中",
    menuSearchPlaceholder: "搜尋此分類中的餐點...",
    filterAll: "全部",
    filterInStock: "供應中",
    filterOutOfStock: "已售完",
    filterLabel: "篩選：",
    menuPriceLabel: "售價",
    menuServingStatus: "正常供應",
    menuPausedStatus: "暫停供應",
    menuFooterShowing: "顯示分類【{cat}】中 {showing} / 共 {total} 項餐點",
    menuFooterPosSync: "POS 即時同步更新",
    menuUploadImage: "上傳圖片",
    menuChangeImage: "更換圖片",
    btnAddDish: "新增餐點",
    btnItemModifiersShort: "客製化選項",
    menuModeLabel: "菜單管理模式",
    menuEmptyCategory: "此分類尚無餐點，請新增第一道餐點。",
    menuMoveUp: "上移一位",
    menuMoveDown: "下移一位",
    menuDragSort: "拖曳以排序",
    menuAddBundle: "新增套餐",
    menuAddItem: "新增餐點",
    menuBundleSettings: "套餐設定",
    itemDetailSub: "設定餐點名稱、價格、照片與客製化選項",
    itemBasicTitle: "基本資料",
    itemAdvancedDesc: "設定此餐點的客製化選項與套餐內容",
    menuHelp: "編輯說明",
    menuDiscardConfirm: "尚有未儲存的菜單變更。確定放棄變更並離開？取消可繼續編輯。",
    btnMenuDirty: "儲存變更 (尚未儲存 *)",
    menuSelectPrompt: "請先從左側選擇分類",
    menuLoading: "載入菜單中...",
    menuItemTotalCount: "(全部 {count} 項)",
    menuItemUnit: "項",
    modifierPrefix: "[客製化]",
    customizationPositionHint: "可拖曳調整位置",
    stockStatusInStock: "正常供應",
    stockStatusOutOfStock: "暫時售完",
    btnItemImage: "圖片",
    btnItemDelete: "刪除",
    menuItemBadgePlaceholder: "標籤/推薦 (例: 招牌)",
    menuItemPricePlaceholder: "價格",
    confirmDeleteItem: "確定要刪除這個項目嗎？",
    newItemPlaceholder: "新項目",
    confirmSaveMenu: "確定要儲存所有變更嗎？這會直接即時影響顧客端點餐頁面。",
    menuSaving: "儲存中...",
    menuSaveSuccess: "菜單儲存成功！",
    menuSaveFail: "儲存失敗：",
    restoreOnlyBenmi: "恢復預設菜單功能目前僅支援 Benmi。",
    confirmRestoreMenu: "您確定要將菜單恢復為原始預設狀態嗎？所有已修改的項目都將被覆蓋！",
    restoreSuccess: "已成功恢復預設菜單！",
    restoreFail: "恢復菜單失敗：",
    menuLoadFail: "無法載入菜單資料：",
    menuIncompleteReload: "菜單未完整載入，暫時無法儲存。請重新載入後再編輯。",
    menuRetryLoad: "重新載入菜單",
    menuDuplicateItem: "同一分類不能有重複的餐點名稱。",
    priceHiddenPlaceholder: "隱藏",
    // Image Modal
    imageModalTitle: "圖片管理",
    imageModalItem: "圖片：{name}",
    imageChecking: "正在檢查圖片...",
    imageHasImage: "此品項已有圖片",
    imageNoImage: "此品項尚未設定圖片",
    imageLoadFail: "載入圖片失敗",
    btnImageSelect: "選擇圖片",
    btnImageDelete: "刪除圖片",
    imageUploading: "正在上傳圖片...",
    imageUploadSuccess: "圖片上傳成功！",
    imageUploadFail: "上傳圖片失敗：",
    confirmDeleteImage: "確定要刪除這張圖片嗎？",
    imageDeleting: "正在刪除圖片...",
    imageDeleteFail: "刪除圖片失敗：",
    // Stock Modal
    stockModalTitle: "供應狀態",
    stockModalItem: "庫存設定：{name}",
    stockLabelStatus: "狀態：",
    stockOptInStock: "正常供應",
    stockOptOutOfStock: "暫停供應",
    stockLabelDuration: "暫停供應至",
    stockOptToday: "今日結束",
    stockOptMultipleDays: "指定日期",
    stockOptIndefinite: "手動恢復前",
    stockLabelDate: "恢復供應日期",
    btnStockSave: "套用",
    stockDrawerHint: "選擇售完時限後立即儲存。",
    stockInstantHint: "變更會立即套用至顧客菜單。",
    stockTodayHint: "明日凌晨 4:00 自動恢復供應",
    stockDateChoiceHint: "選擇恢復供應日期",
    stockIndefiniteHint: "準備好後，再手動恢復供應",
    stockDateHint: "所選日期凌晨 4:00 恢復供應",
    stockLinkedNotice: "此變更會套用至所有使用此選項的餐點。",
    stockRestore: "恢復供應",
    stockRetry: "重試",
    stockSaveError: "尚未儲存。請檢查網路連線後重試。",
    stockDateInvalid: "請選擇明日或之後的日期。",
    alertSelectOosDate: "請選擇恢復供應日期！",
    stockUpdateFail: "庫存狀態更新失敗：",
    customizationManageTitle: "整單口味與客製化設定",
    customizationManageDesc: "調整各項客製化選項名稱、加價、缺貨狀態與細項設定。",
    subOptionsLabel: "細項調整：",
    btnAddSubOption: "+ 新增細項",
    btnAddCustomOption: "+ 新增選項",
    promptAddSubOption: "請輸入細項名稱（例：不加香油、不加胡椒）：",
    promptNewOptionName: "請輸入新選項名稱：",
    labelSurcharge: "加價",
    labelOptionName: "選項名稱",
    btnAddCustomGroup: "+ 新增客製化分組",
    promptAddCustomGroup: "請輸入新分組名稱（例：✦ 醬料選擇、✦ 加料選項）：",
    promptRenameCustomGroup: "請輸入新的分組名稱：",
    confirmDeleteCustomGroup: "確定要刪除此客製化分組及其所有選項嗎？",
    toggleGroupTypeSingle: "切換為單選 (Radio)",
    toggleGroupTypeMultiple: "切換為多選 (Checkbox)",
    // Dining Options & Filter
    diningOption: "用餐方式",
    takeaway: "外帶",
    dineIn: "內用",
    filterAll: "全部",
    filterTakeaway: "外帶",
    filterDineIn: "內用",
    badgeTakeaway: "外帶",
    badgeDineIn: "內用",
    tableNumber: "桌號",
    tableNumberLabel: "桌號：",
    labelDiningOption: "用餐方式",
    printDineIn: "【內用】",
    printTakeaway: "【外帶】",
    // Dine In Setting
    tocDineIn: "內用接單模式",
    settingDineInTitle: "內用接單設定",
    settingDineInSub: "自訂是否允許顧客選擇「內用」或僅接受「外帶」",
    settingDineInTrueTitle: "開啟內用與外帶 (預設)",
    settingDineInTrueSub: "顧客可在點餐頁面自由切換「外帶」或「內用」模式。",
    settingDineInFalseTitle: "僅限外帶 (關閉內用)",
    settingDineInFalseSub: "隱藏內用選項，所有訂單一律為外帶自取。",
    btnSaveDineInSetting: "儲存設定",
    dineInSaveSuccess: "內用設定已成功儲存！",
    dineInSaveFail: "內用設定儲存失敗：",
    featureLockedTitle: "進階功能 (未啟用)",
    featureLockedDesc: "此功能為 BLAB 進階模組，如需啟用「內用接單」請聯繫 BLAB 團隊升級方案。",
    btnContactUpgrade: "聯繫升級方案",
    // Language & Reports Settings
    tocLanguage: "介面語言",
    tocReports: "銷量與營收報表",
    settingLangTitle: "系統介面語言",
    settingLangSub: "設定 POS 系統的操作與顯示語言",
    settingReportsTitle: "銷量與營收報表",
    settingReportsSub: "查看門市餐點銷售統計、營收排行與加料偏好",
    reportsUnlockedName: "即時餐點銷量與營收分析",
    reportsUnlockedDesc: "依時間區間（今日、近7天、近30天）統計門市各品項銷售數量、營收總額及顧客加料分析。",
    btnOpenReports: "查看銷量報表",
    reportsLockedTitle: "進階功能 (未啟用)",
    reportsLockedDesc: "此功能為 BLAB 進階模組，如需啟用「銷量與營收報表分析」請聯繫 BLAB 團隊升級方案。",
    btnBackToSettings: "← 返回設定",
    // Multi-Round Append Orders
    badgeAppendRound: "第 {n} 輪",
    badgeAppendShort: "加點",
    roundBlockTitle: "第 {n} 輪餐點",
    roundBlockLatest: "最新加點",
    roundBlockInitial: "第 1 輪 (最初點餐)",
    alertNewAppended: "🔔 桌號 {table} (單號 #{key}) 有新加點餐點！",
    // Store Pairing & Activation (Universal Multi-Tenant POS)
    tocStorePairing: "門市終端綁定",
    settingPairingTitle: "門市終端與設備綁定",
    settingPairingSub: "管理此平板電腦與雲端門市之連線設定",
    pairingTenantLabel: "當前綁定門市代碼",
    pairingStatusLabel: "終端連線狀態",
    pairingStatusConnected: "已連線運作中",
    pinChangeTitle: "變更管理 PIN 碼",
    pinChangeDescription: "此 PIN 碼適用於整間門市。變更後，員工需重新登入。",
    pinCurrent: "目前 PIN 碼",
    pinNew: "新 PIN 碼",
    pinConfirm: "確認新 PIN 碼",
    pinFormatHint: "請輸入 4–8 位數字，可使用 0 開頭。",
    pinShow: "顯示",
    pinHide: "隱藏",
    pinChange: "變更 PIN 碼",
    pinClear: "清除內容",
    pinSaving: "正在儲存…",
    pinRequired: "請填寫此欄位。",
    pinInvalidFormat: "新 PIN 碼必須為 4–8 位數字。",
    pinMismatch: "兩次輸入的新 PIN 碼不一致。",
    pinWrongCurrent: "目前 PIN 碼不正確，請重新輸入。",
    pinSaveError: "無法儲存 PIN 碼，請稍後再試。",
    pinNetworkError: "無法確認變更結果。請檢查網路連線，並嘗試使用新 PIN 碼登入。",
    pinTenantRequired: "請先綁定有效的門市，再變更 PIN 碼。",
    pinChangeSuccess: "PIN 碼已變更。員工需使用新 PIN 碼重新登入。",
    pinPaymentContext: "正在設定付款管理使用的 PIN 碼。儲存後將返回付款管理，再以新 PIN 碼驗證。",
    pinPaymentDefaultNotAllowed: "請使用不同於預設值的 PIN 碼，以啟用付款管理。",
    pinBackToPayments: "返回付款管理",
    unlinkTitle: "解除此設備綁定 / 切換門市",
    unlinkDesc: "解除後此終端機將停止同步該門市訂單，需輸入管理 PIN 碼確認。",
    btnUnlinkStore: "切換門市 / 解除綁定",
    modalActivationTitle: "門市終端啟用",
    modalActivationSub: "請輸入門市代碼與管理 PIN 碼以綁定此終端設備",
    activationTenantLabel: "門市代碼 (Tenant ID)",
    activationTenantPlaceholder: "例如: bsc, benmi...",
    activationPinLabel: "管理 PIN 碼",
    activationPinPlaceholder: "預設 12345678",
    btnSubmitActivation: "啟用終端並開始接單",
    btnVerifying: "正在驗證中...",
    activationErrorInvalid: "門市代碼或管理 PIN 碼錯誤，請重新確認。",
    activationErrorTenantNotFound: "門市代碼不存在或已停用，請重新確認。",
    activationErrorWrongPin: "管理 PIN 碼錯誤，請重新確認。",
    activationErrorRequired: "請完整填寫門市代碼與管理 PIN 碼。",
    activationErrorNetwork: "連線驗證失敗，請檢查網路連線後重試。",
    promptUnlinkPin: "請輸入門市管理 PIN 碼以解除綁定：",
    unlinkSuccess: "已成功解除設備綁定！即將返回門市啟用畫面。",
    unlinkWrongPin: "管理 PIN 碼錯誤，無法解除綁定。",
    unpaired: "未綁定",
    btnSetBundle: "設為組合",
    btnEditBundle: "編輯組合",
    bundleBadge: "組合",
    bundleGroupUnit: "組",
    modalBundleTitle: "設定套餐組合",
    modalBundleSub: "設定該套餐所包含的自選群組、選菜來源與數量規則",
    comboCreateTitle: "建立套餐", comboEditTitle: "編輯套餐", comboClose: "關閉", comboBack: "上一步", comboContinue: "下一步", comboSave: "儲存套餐",
    comboStepsLabel: "建立套餐的步驟",
    comboWhatTitle: "什麼是套餐？",
    comboWhatBody: "套餐是以一個名稱與基本價格販售的多樣餐點組合。您可以固定內容、讓顧客自選，或混合兩種方式。例如：固定附一份小菜，再讓顧客選主餐與飲料。",
    comboPriceHelp: "套餐價格＝基本價格＋餐點加價＋付費客製選項。餐點原本的單點售價不會再加上；不加價的餐點請填 0。",
    comboSetupHelp: "先填基本資料，再設定餐點內容，最後預覽顧客選餐方式並儲存。",
    comboPartsTitle: "這份套餐包含什麼？",
    comboPartsHelp: "「固定包含」由您指定餐點與份數；「顧客自選」讓顧客從清單中選足指定數量。同一套餐可同時加入這兩種內容。",
    comboTemplatesTitle: "從範例開始設定",
    comboTemplatesHelp: "範例只會建立分組，不會自動選入餐點。套用後請從菜單勾選餐點，並調整數量與加價；也可以直接在下方自行新增內容。",
    comboTemplateMealHelp: "建立兩個自選分組：顧客各選 1 份主餐及 1 杯飲料。",
    comboTemplateMealExample: "例如：飯或麵 ＋ 茶或果汁",
    comboTemplateManyHelp: "建立一個自選分組，預設選 2 樣且不可重複。數量可再調整。",
    comboTemplateManyExample: "例如：從 5 種小菜中任選 2 種",
    comboTemplateFixedHelp: "建立固定內容分組，由您指定餐點與份數，顧客不必重新選餐。",
    comboTemplateFixedExample: "例如：固定 1 份飯 ＋ 1 碗湯",
    comboUseTemplate: "使用此範例",
    comboChangeTemplate: "查看範例／更換分組設定",
    comboReplaceTemplate: "使用新範例會取代目前所有分組及已選餐點，名稱與基本價格會保留。要繼續嗎？",
    comboFixedHelp: "勾選套餐固定附上的餐點，並填寫每份套餐包含的數量。顧客仍可調整餐點允許的客製選項。",
    comboChoiceHelp: "先設定顧客需選的數量，再勾選可選餐點。加價填 0 表示已包含在套餐價格。",
    comboStepInfo: "基本資料", comboStepParts: "套餐內容", comboStepPreview: "預覽並儲存",
    comboStepInfoSub: "設定名稱、價格與分類",
    comboStepPartsSub: "配置分組規則與可選餐點",
    comboStepPreviewSub: "檢查顧客選餐並儲存",
    comboStepCompleted: "已完成",
    comboStepCurrent: "進行中",
    comboStepPending: "待設定",
    comboProductName: "套餐名稱", comboBasePrice: "套餐基本價格", comboCategory: "顯示分類",
    comboImage: "管理圖片", comboImageAfterSave: "儲存套餐後即可新增圖片。", comboTemplateMeal: "主餐 + 飲料", comboTemplateMany: "任選 N 樣", comboTemplateFixed: "固定套餐",
    comboFixedGroup: "固定包含", comboChoiceGroup: "顧客自選", comboRemove: "移除", comboGroupName: "分組名稱", comboQuantity: "數量", comboRepeat: "允許重複選同一餐點",
    comboSearch: "搜尋餐點", comboFilterCategory: "篩選分類", comboAllCategories: "全部分類", comboSurcharge: "加價", comboWholeCategory: "進階：選取整個分類", comboWholeCategoryHelp: "此分類將來新增的餐點也會自動加入可選清單。",
    comboAddChoice: "新增自選分組", comboAddFixed: "新增固定內容", comboRestoreDraft: "找到未完成的套餐草稿，是否繼續編輯？", comboLeaveDraft: "要關閉嗎？草稿會保留，下次可繼續。",
    comboNeedName: "請填寫套餐名稱。", comboNeedPrice: "請填寫有效價格。", comboNeedGroup: "請加入至少一組內容。", comboNeedGroupName: "請填寫分組名稱。", comboNeedItems: "餐點數量不足或選擇的餐點已不存在。", comboSaveFailed: "無法儲存套餐。", comboSaved: "套餐已儲存。",
    comboEmptyGroupsTitle: "尚未加入任何分組",
    comboEmptyGroupsHelp: "請點擊下方按鈕新增自選分組（讓顧客挑選）或固定內容（套餐隨附）。",
    comboIncluded: "已包含在套餐價格", comboSelect: "選擇", comboPreviewComplete: "所有分組已完成", comboPreviewIncomplete: "請選完所有分組",
    bundleGroupListTitle: "自選分組列表",
    btnAddBundleGroup: "新增自選分組",
    btnRemoveBundleConfig: "解除組合 (轉為一般單點)",
    confirmRemoveBundleConfig: "確定要解除此餐點的組合設定嗎？解除後將變回一般單點品項（原有選菜規則將被清除）。",
    bundleDangerZoneTitle: "變更餐點類型",
    bundleDangerZoneDesc: "此餐點目前已設定為自選組合。若要改為普通單點販售（無需自選配菜），可點擊此處解除組合設定。",
    bundleGroupDetailTitle: "分組詳細設定",
    bundleGroupName: "分組名稱",
    bundleGroupNameZh: "分組名稱 (繁體中文)",
    bundleGroupNameVi: "分組名稱 (Tiếng Việt)",
    bundleGroupNamePlaceholder: "例如：請選擇 6 樣配菜",
    bundleQuantityRule: "選菜數量要求",
    bundleQuantityExact: "必須恰好選取",
    bundleAllowRepeat: "允許重複選取相同菜色",
    bundleAllowRepeatDesc: "客人可在該分組中重複點選同一個品項 (如：2 份甜不辣)",
    bundleSourceType: "選菜來源 (菜品清單)",
    bundleSourceCategory: "依全部分類 (自動包含分類內所有菜品)",
    bundleSourceCategoryDesc: "未來若此分類新增餐點，套餐將自動同步包含",
    bundleSourceItems: "指定個別菜品",
    bundleSelectCategories: "勾選適用的菜品分類",
    bundleSelectItems: "勾選適用的餐點",
    bundleEligiblePreview: "此組預覽可選菜品總數",
    bundleSaveSuccess: "套餐組合設定已成功儲存！",
    bundleSaveFail: "儲存套餐組合失敗：",
    bundleValidationEmptyGroups: "請至少新增 1 個自選分組！",
    bundleValidationEmptyName: "分組名稱不能為空！",
    bundleValidationEmptySources: "請為分組選擇至少一個分類或菜品來源！",
    bundleDefaultGroupName: "任選配菜",
    bundleItemUnit: "樣",
    bundleSurchargeNotice: "包含於套餐內 (如需個別加價請於菜品單價中設定)",
    btnBundleSave: "儲存設定",
    btnBundleCancel: "關閉",
    bundleTipTitle: "提示說明",
    bundleTipDesc: "顧客在點餐時必須逐一完成每個分組的選擇數量，方可加入購物車。",
    btnBundleGuide: "套餐說明與範例",
    btnBundleSidebarGuide: "查看 Combo 說明與範例",
    bundleGuideModalTitle: "套餐組合設定指南與實例",
    bundleGuideModalSub: "深入了解套餐概念、3步驟設定流程與常見餐飲實例",
    bundleGuideWhatTag: "概念",
    bundleGuideWhatTitle: "1. 套餐組合 (Combo / Bundle) 是什麼？",
    bundleGuideWhatDesc: "套餐組合是將多樣餐點（如：主餐 + 配菜 + 飲料）綁定在一起以固定套餐價販售的功能。顧客在手機（LINE LIFF）或店員於 POS 點餐時，需依各群組規定選滿指定數量方可加入購物車。此功能有助於提高客單價、加快出單與備料流程。",
    bundleGuideStepsTag: "流程",
    bundleGuideStepsTitle: "2. 套餐設定 3 步驟",
    bundleGuideStep1Tag: "步驟 1",
    bundleGuideStep1Title: "新增自選分組",
    bundleGuideStep1Desc: "點擊左側「+ 新增自選分組」，設定繁中與越南語名稱（例：請選擇 1 樣主餐、請選擇 6 樣配菜）。",
    bundleGuideStep2Tag: "步驟 2",
    bundleGuideStep2Title: "設定數量與重複規則",
    bundleGuideStep2Desc: "使用 [ - ] 和 [ + ] 調整顧客必須選滿的數量。若顧客可重複選相同品項（如：2 份玉米筍），請勾選「允許重複選同一品項」。",
    bundleGuideStep3Tag: "步驟 3",
    bundleGuideStep3Title: "指定選菜來源",
    bundleGuideStep3Desc: "可選擇「依整個分類自動匯入」（如：所有蔬菜類或飲料類），或切換至「手動勾選特定品項」。",
    bundleGuideExamplesTag: "範例",
    bundleGuideExamplesTitle: "3. 常見餐飲實例 (Example Use Cases)",
    bundleEx1Title: "🍗 鹹水雞 / 滷味 / 炸物店實例 (例：蔣姐姐鹹水雞)",
    bundleEx1Badge: "1 組 • 6 樣菜",
    bundleEx1Desc: "<strong>品項：</strong>套餐 A (3隻鹹水雞翅+6樣菜) - $150<br><strong>設定：</strong>建立 1 個自選分組「請選擇 6 樣配菜」，需求數量設為 6，<strong>勾選</strong>「允許重複選同一品項」。選菜來源勾選「海裡」、「時蔬」、「內臟」、「滷味」等分類。",
    bundleEx2Title: "🥖 越式法國麵包 / 早午餐 / 輕食店實例",
    bundleEx2Badge: "2 組 • 主餐 + 飲料",
    bundleEx2Desc: "<strong>品項：</strong>元氣早午餐特惠套餐 - $99<br><strong>設定：</strong><br>• 分組 1：「選 1 樣主餐麵包」（數量 = 1，來源：法國麵包分類）<br>• 分組 2：「選 1 杯飲品」（數量 = 1，來源：咖啡與茶飲分類）",
    bundleEx3Title: "🍲 火鍋 / 燒烤 / 雙人便當店實例",
    bundleEx3Badge: "3 組 • 湯底 + 肉品 + 副餐",
    bundleEx3Desc: "<strong>品項：</strong>雙人特選火鍋套餐 - $450<br><strong>設定：</strong><br>• 分組 1：「選 1 款湯底」（數量 = 1，來源：原味、麻辣、番茄等）<br>• 分組 2：「選 2 盤肉品」（數量 = 2，允許重複，來源：牛肉片、豬五花、雞腿肉）<br>• 分組 3：「選 2 樣副餐」（數量 = 2，來源：白飯、冬粉、王子麵）",
    btnBundleGuideGotIt: "我知道了",
    // Item Detail Hub Modal (#itemDetailModal)
    btnItemSettings: "設定",
    itemDetailTitle: "單品設定",
    itemDetailTitleNamed: "單品設定：{name}",
    itemCreateTitle: "新增餐點",
    itemNameLabel: "餐點名稱",
    itemPriceLabel: "價格 (NT$)",
    itemNamePlaceholder: "例如：牛肉河粉、波霸奶茶",
    btnItemCreate: "建立餐點",
    btnItemCancel: "取消",
    enterItemName: "請輸入餐點名稱",
    enterItemNameFirst: "請先輸入餐點名稱",
    itemPhotoTitle: "餐點圖片",
    btnUploadPhoto: "上傳/更換圖片",
    btnRemovePhoto: "移除圖片",
    itemBadgeTitle: "餐點標籤",
    itemBadgePlaceholder: "例如：熱銷、主廚推薦",
    itemRecommendedLabel: "標記為推薦餐點 (在線上菜單置頂凸顯)",
    itemAdvancedTitle: "進階設定",
    cardModifiersTitle: "餐點專屬選項",
    cardModifiersEmpty: "尚未設定專屬選項",
    cardModifiersCount: "已設定 {count} 組客製化選項",
    cardBundleTitle: "套餐組合設定",
    cardBundleEmpty: "一般單品 (未啟用套餐組合)",
    cardBundleCount: "套餐組合 ({count} 個選擇組)",
    btnDetailDone: "完成",
    quickTagHot: "熱銷",
    quickTagRecommend: "推薦",
    quickTagNew: "新品",
    quickTagSpicy: "辣",
    promptStaffPin: "請輸入門市管理 PIN 碼：",
    staffLoading: "載入中…",
    staffNeedsPin: "請先驗證 PIN 碼。",
    staffRetry: "重試",
    staffNoTables: "尚未新增桌號，請先新增桌號。",
    staffNetworkError: "無法連線，請重試。",
    staffStatusConflict: "訂單已更新，請確認最新內容後再操作。",
    staffFeatureClosed: "桌邊點餐尚未啟用",
    staffFeatureClosedHelp: "此門市尚未開放桌邊點餐權限。",
    staffOrderSubmittedToast: "桌號已送出點餐！#{key}",
    staffTakeawayOrderSubmittedToast: "外帶訂單已送出成功！#{key}",
    staffContact: "聯絡支援",
    tableDisable: "停用",
    tableEnable: "啟用",
    tableEditorAddTitle: "新增桌號",
    tableEditorEditTitle: "編輯桌號",
    btnStaffOrder: "桌邊點餐",
    btnStaffOrderDesc: "開啟專用點餐頁面",
    tabTables: "桌號管理",
    tabTablesSub: "管理店內桌號、排序與啟用狀態",
    tableAddBtn: "新增桌號",
    tableName: "桌號名稱",
    tableNamePlaceholder: "例：A-01, 1號桌...",
    tableSort: "排序",
    tableSortPlaceholder: "數字越小排越前",
    tableStatus: "狀態",
    tableStatusActive: "啟用中",
    tableStatusDisabled: "已停用",
    tableAction: "操作",
    tableEdit: "編輯",
    tableSave: "儲存",
    tableCancel: "取消",
    tableOccupied: "使用中",
    tableEmpty: "空桌",
    tableHasActiveOrder: "該桌尚有未結帳訂單，無法修改或停用",
    tableNoWritePermission: "您沒有修改桌號的權限。",
    tableDisableOccupied: "此桌尚有未結帳訂單，暫時無法停用。",
    tableDeleteDisabledHint: "系統保留桌號以維護歷史報表完整性，僅支援停用",
    tableConfirmDisable: "確定要停用此桌號嗎？",
    tableSaveSuccess: "桌號儲存成功",
    tableSaveFail: "桌號儲存失敗，請重試",
    tableQrBtn: "桌號 QR",
    tableQrTitle: "桌號 QR Code",
    tableQrInstruction: "請掃描 QR Code 線上點餐",
    tableQrSubInstruction: "掃描上方 QR Code 開啟菜單並送出訂單",
    tableQrDineInBadge: "內用桌號",
    tableQrCopyLink: "複製連結",
    tableQrCopied: "已複製連結至剪貼簿",
    tableQrDownloadPng: "下載圖片",
    tableQrPrintPos: "出單機列印",
    tableQrPrintA4: "A4 列印",
    tableQrPrintAllA4: "列印全部 QR (A4)",
    tableBatchAddBtn: "批次新增桌號",
    tableBatchAddTitle: "批次新增桌號",
    tableBatchPrefix: "桌號前綴 (選填)",
    tableBatchPrefixPlaceholder: "例：A- 或 桌號",
    tableBatchStart: "起始編號",
    tableBatchEnd: "結束編號",
    tableBatchSort: "起始排序",
    tableBatchCreating: "正在建立桌號...",
    tableBatchSuccess: "成功新增 {count} 個桌號",
    tableBatchFail: "批次建立桌號失敗，請重試",
    tableEmptyList: "尚未建立任何桌號",
    tableEmptyListSub: "點擊上方「新增桌號」或「批次新增桌號」開始使用",
    tableHistoryNotice: "提示：為維護營業歷史報表與數據完整性，使用過之桌號僅能停用，不提供硬性刪除。",
    tableNoPrinterConfigured: "尚未設定出單機，請至「出單與印表機」設定後再行列印",
    tablePrinting: "正在傳送列印任務...",
    tablePrintSuccess: "已送出列印任務",
    tablePrintFail: "列印失敗，請檢查印表機連線",
  },
  "vi": {
    paymentWorkspace: "Thanh toán", paymentWorkspaceIntro: "Tra cứu thanh toán, theo dõi hoàn tiền và kiểm tra giao dịch cần chú ý.",
    paymentNeedsReview: "Cần kiểm tra", paymentHistory: "Lịch sử", paymentRefresh: "Làm mới",
    paymentToday: "Hôm nay", paymentSevenDays: "7 ngày", paymentThirtyDays: "30 ngày",
    paymentFrom: "Từ ngày", paymentTo: "Đến ngày", paymentStatus: "Trạng thái thanh toán", paymentSearch: "Mã đơn hoặc mã giao dịch",
    paymentApplyFilters: "Tra cứu", paymentAllStatuses: "Tất cả trạng thái",
    paymentDateHint: "Lọc theo ngày tạo giao dịch, tối đa 31 ngày mỗi lần, theo giờ Đài Loan.",
    paymentSummaryHint: "Tính theo thời điểm thu và hoàn tiền trong kỳ, không phụ thuộc tìm kiếm hay bộ lọc trạng thái.",
    paymentSummaryPeriod: "Thu và hoàn tiền: {from} đến {to} (giờ Đài Loan)",
    paymentCollectedLabel: "Đã thu", paymentRefundedLabel: "Đã hoàn", paymentNetLabel: "Thu ròng",
    paymentOrder: "Đơn hàng", paymentCreated: "Thời điểm tạo", paymentAmount: "Số tiền", paymentAttentionReason: "Lý do cần kiểm tra",
    paymentActions: "Thao tác", paymentLoadMore: "Xem thêm", paymentTransactionDetail: "Chi tiết giao dịch", paymentClose: "Đóng",
    paymentViewDetail: "Xem chi tiết", paymentTransactionId: "Mã giao dịch LINE Pay", paymentProviderOrderId: "Mã tham chiếu thanh toán",
    paymentPaidAt: "Thời điểm thu tiền", paymentRefundedAt: "Thời điểm hoàn tiền", paymentRefundRequestedAt: "Yêu cầu hoàn tiền lúc",
    paymentResultCode: "Mã phản hồi", paymentRefundStatus: "Trạng thái xử lý hoàn tiền", paymentRefundTransactionId: "Mã giao dịch hoàn tiền",
    paymentAlertCount: "Có {count} giao dịch LINE Pay cần kiểm tra", paymentCountStale: "LINE Pay: chưa cập nhật",
    paymentNotConfigured: "Điểm bán chưa cấu hình LINE Pay.", paymentConfigLoading: "Đang kiểm tra cấu hình LINE Pay…",
    paymentWorkspaceLocked: "Xác thực PIN quản lý để xem số tiền, chi tiết giao dịch và thực hiện thao tác.",
    paymentWorkspaceStale: "Dữ liệu chưa được cập nhật. Vui lòng kiểm tra kết nối và làm mới.",
    paymentHistoryEmpty: "Không có giao dịch phù hợp. Hãy điều chỉnh ngày, từ khóa hoặc trạng thái.",
    paymentAttentionEmpty: "Không có giao dịch cần kiểm tra. Hệ thống tự theo dõi thanh toán và hoàn tiền đang xử lý.",
    paymentLoading: "Đang tải…", paymentInvalidRange: "Chọn khoảng ngày hợp lệ, tối đa 31 ngày mỗi lần tra cứu.",
    paymentCheckedStatus: "Đã kiểm tra. Trạng thái hiện tại: {status}.", paymentChecking: "Đang kiểm tra…",
    paymentContactSupport: "Liên hệ hỗ trợ", paymentRefundFailedHelp: "Hoàn tiền chưa thành công. Cung cấp mã giao dịch và mã phản hồi cho bộ phận hỗ trợ; chức năng này không gửi lại lệnh hoàn tiền.",
    paymentReasonREFUND_FAILED: "Hoàn tiền thất bại, cần kiểm tra thủ công", paymentReasonPAID_CANCELLED: "Đã thu tiền nhưng có yêu cầu hủy hoặc đơn đã hủy, từ chối hay hết hạn",
    paymentReasonREFUND_DELAYED: "Hoàn tiền chờ kết quả quá 5 phút", paymentReasonCANCEL_DELAYED: "Hủy thanh toán chờ xác nhận quá 5 phút",
    paymentReasonPAYMENT_UNCERTAIN: "Kết quả thanh toán chưa được xác nhận quá 5 phút",
    paymentREQUESTING: "Đang tạo thanh toán", paymentPENDING: "Chờ khách thanh toán", paymentCONFIRMING: "Đang xác nhận thanh toán",
    paymentCANCELLED: "Đã hủy thanh toán", paymentFAILED: "Thanh toán thất bại",
    paymentRefundStatePENDING: "Chờ xử lý", paymentRefundStatePROCESSING: "Đang xử lý", paymentRefundStateUNKNOWN: "Chờ xác nhận kết quả", paymentRefundStateSUCCEEDED: "Hoàn tiền thành công", paymentRefundStateFAILED: "Hoàn tiền thất bại",
    paymentViewRefundFailure: "Xem lỗi", paymentViewRefund: "Hoàn tiền", paymentViewCheck: "Kiểm tra",
    paymentInvalidPIN: "PIN không đúng. Hãy dùng PIN quản lý hiện tại của đúng quán và môi trường.",
    paymentDefaultPIN: "Quán đang dùng PIN mặc định. Hãy đặt PIN riêng để sử dụng quản lý thanh toán.",
    paymentChangePinContinue: "Đổi PIN để tiếp tục",
    paymentLoginNewPin: "Xác thực PIN mới",
    paymentPinChangedLogin: "Đã đổi PIN thành công. Xác thực bằng PIN mới để tiếp tục quản lý thanh toán.",
    paymentSessionExpired: "Phiên xác thực đã hết hạn. Vui lòng nhập lại PIN quản lý quán.",
    paymentRateLimited: "Bạn đã thử quá nhiều lần. Vui lòng chờ một phút rồi thử lại.",
    paymentLoginHint: "Sử dụng PIN quản lý hiện tại của quán.",

    paymentCollected: "Đã thu hôm nay", paymentRefundedTotal: "Đã hoàn hôm nay", paymentNet: "Thu ròng hôm nay",
    paymentPAID: "Đã thanh toán",
    paymentREFUND_PENDING: "Đang hoàn tiền",
    paymentREFUNDED: "Đã hoàn tiền",
    paymentREFUND_FAILED: "Hoàn tiền thất bại, cần xử lý",
    paymentUNKNOWN: "Đang xác minh thanh toán",
    paymentRefund: "Hoàn toàn bộ tiền LINE Pay",
    paymentUnrefunded: "Đã hủy — chưa hoàn tiền",
    paymentUnrefundedTitle: "Đơn đã hủy — Chưa hoàn tiền",
    paymentUnrefundedDesc: "Khách đã thanh toán qua LINE Pay. Vui lòng bấm hoàn tiền để trả lại tiền cho khách.",
    paymentRefundTarget: "Số tiền hoàn",
    paymentRefundNotice: "Khoản tiền sẽ được hoàn trả ngay lập tức về tài khoản LINE Pay của khách hàng.",
    paymentRefundReasonPlaceholder: "Nhập lý do hoàn tiền hoặc chọn nhanh ở trên...",
    paymentReasonOutStock: "Hết món",
    paymentReasonCustomerCancelled: "Khách yêu cầu hủy",
    paymentReasonStoreBusy: "Quán quá tải không kịp làm",
    paymentReasonOther: "Lý do khác",
    paymentRefundProcessing: "Đang xử lý hoàn tiền...",
    paymentReason: "Lý do hoàn tiền",
    paymentCancel: "Hủy",
    paymentConfirm: "Xác nhận",
    paymentError: "Thao tác chưa hoàn tất. Kiểm tra đăng nhập rồi tra cứu lại. Vui lòng chưa thu hoặc hoàn lại.",
    paymentLogin: "Xác thực quyền của quán",
    paymentPIN: "Mã PIN quản lý",
    paymentReviewHint: "Giao dịch cần xác minh. Xem danh sách thanh toán cần xử lý.",
    paymentAttention: "LINE Pay cần xử lý",
    paymentNone: "Không có giao dịch cần xử lý",
    paymentCheck: "Kiểm tra lại",

    detailRound: "Đợt {n}",
    detailPortion: "Phần {n}",
    detailLegacy: "Nội dung đơn cũ",
    detailOptionGroup: "Nhóm tùy chọn",
    detailPortionNote: "Ghi chú",
    detailItemNote: "Ghi chú món",
    detailRoundNote: "Ghi chú đợt",
    displayTitle: "Hiển thị",
    displayTextSize: "Cỡ chữ",
    displayDeviceHint: "Áp dụng ngay, chỉ lưu trên thiết bị này.",
    displayAuto: "Tự động",
    displayAutoHint: "Màn hình rộng dùng chữ lớn, màn hình hẹp dùng chữ tiêu chuẩn.",
    displayStandard: "Tiêu chuẩn",
    displayLarge: "Lớn",
    displayExtraLarge: "Rất lớn",
    displayPreview: "Xem trước",
    displayPreviewOrder: "Đơn hàng #001",
    displayPreviewItem: "2 × Món đặc trưng",
    displayPreviewOptions: "Tùy biến: ít cay, không hành",
    displayPreviewTotal: "Tổng tiền",
    langBtn: "Tiếng Việt",
    brandTitle: "Benmi Dashboard",
    brandSub: "Đơn hàng trực tiếp",
    tabLive: "Trực tiếp",
    tabHistory: "Lịch sử",
    tabReports: "Báo cáo",
    tabStaffOrder: "Nhận đơn tại bàn",
    tabSound: "Thử âm thanh",
    tabPrinter: "Máy in",
    tabMenu: "Thực đơn",
    tabSettings: "Cài đặt",
    sidebarLive: "Đơn hàng",
    sidebarHistory: "Lịch sử đơn",
    sidebarMenu: "Thực đơn",
    sidebarPrinter: "Máy in",
    sidebarSettings: "Cài đặt",
    sidebarSupport: "Hỗ trợ kỹ thuật",
    pageTitleLive: "Đơn hàng",
    pageTitleHistory: "Lịch sử đơn",
    pageTitleMenu: "Quản lý thực đơn",
    pageTitleSettings: "Cài đặt hệ thống",
    pageTitleReports: "Báo cáo doanh thu",
    headerStore: "Quán: ",
    headerSwitch: "(Đổi)",
    reportsTitle: "Phân tích doanh số & Doanh thu món",
    reportsSub: "Thống kê thời gian thực doanh số từng món và tùy biến",
    rangeToday: "Hôm nay",
    range7d: "7 ngày qua",
    range30d: "30 ngày qua",
    kpiTopItem: "Top 1 Bán chạy nhất",
    kpiTotalSold: "Tổng phần đã bán",
    kpiTotalRevenue: "Tổng doanh thu món",
    kpiTotalOrders: "Tổng đơn thành công",
    revenueSub: "Doanh thu món bán",
    completedOrdersSub: "Đã xong / Đã thanh toán",
    tableTitle: "Bảng xếp hạng chi tiết món bán",
    colRank: "Hạng",
    colItem: "Tên món",
    colCategory: "Danh mục",
    colQuantity: "Số lượng",
    colSales: "Doanh thu",
    colRatio: "Tỷ trọng",
    colOptions: "Tùy chọn / Topping chọn nhiều",
    extraIngredientLabel: "Topping",
    itemUnit: "món",
    portionUnit: "phần",
    emptyReports: "Không có dữ liệu bán hàng trong khoảng thời gian này",
    panelLeftTitle: "Chờ xử lý",
    panelLeftSub: "Gần → xa (theo giờ lấy)",
    panelRightTitle: "Chờ lấy món",
    liveMobileTabsLabel: "Trạng thái đơn hàng",
    panelRightSub: "Đang làm & Chờ khách lấy",
    loading: "Đang tải...",
    empty: "Chưa có đơn",
    emptyLivePendingTitle: "Không có đơn chờ xử lý",
    emptyLivePendingSub: "Đơn mới sẽ tự động hiển thị và đổ chuông tại đây",
    emptyLiveAcceptedTitle: "Không có đơn đang thực hiện",
    emptyLiveAcceptedSub: "Các đơn đã nhận sẽ hiển thị tiến độ tại đây",
    badgeNewOrder: "ĐƠN MỚI",
    badgeModifiedOrder: "Đã đổi món",

    emptyHistory: "Chưa có lịch sử đơn hàng",
    historyTitle: "Lịch sử đơn hàng",
    historySub: "Đơn hàng 30 ngày gần nhất (theo ngày)",
    historySearchPlaceholder: "Tìm mã đơn / tên khách / số bàn...",
    historyFilterAll: "Tất cả",
    historyFilterDineIn: "Tại bàn",
    historyFilterTakeaway: "Mang về",
    historyNoSearchResults: "Không tìm thấy đơn hàng phù hợp",
    historyNoSearchResultsSub: "Vui lòng thử từ khóa khác hoặc xóa bộ lọc",
    btnClearFilter: "Xóa bộ lọc",
    btnExpandAll: "Mở tất cả",
    btnCollapseAll: "Thu gọn",
    todayTag: "Hôm nay",
    orderUnit: "đơn",
    historyOlderTitle: "Xem đơn hàng trên 30 ngày",
    historyOlderSub: "Quý khách cần xuất báo cáo hoặc tra cứu lịch sử vui lòng liên hệ đội ngũ BLAB",
    btnContactBlab: "Liên hệ BLAB",
    modalBlabTitle: "Hỗ trợ kỹ thuật & Liên hệ BLAB",
    modalBlabSubtitle: "Hỗ trợ xử lý sự cố, thao tác tại quầy và tư vấn giải pháp POS cho quán.",
    modalBlabDesc: "Hệ thống hiển thị dữ liệu 30 ngày gần nhất. Dữ liệu trên 30 ngày được lưu trữ an toàn trên đám mây, quý khách cần tra cứu hoặc xuất báo cáo đối soát vui lòng liên hệ đội ngũ BLAB.",
    blabStatusOnline: "Trực tuyến",
    blabSupportChannel: "Hỗ trợ kỹ thuật trực tiếp · Tư vấn 1-1 qua LINE",
    blabSupportDirectTitle: "Đội ngũ hỗ trợ BLAB",
    blabSupportDirectBadge: "Hỗ trợ 1-1",
    blabSupportDirectSub: "LINE chính thức / Hỗ trợ kỹ thuật trực tiếp",
    blabSupportDirectDesc: "Hỗ trợ lỗi kết nối máy in, lỗi in hóa đơn, đồng bộ đơn hàng và thao tác vận hành tại quầy.",
    btnModalBlabLine: "Mở LINE hỗ trợ",
    blabUpgradeTitle: "Tư vấn nâng cấp tính năng & Gói giải pháp",
    blabUpgradeSub: "Tư vấn các tính năng nâng cao: nhận đơn tại bàn, báo cáo doanh thu và tra cứu dữ liệu lịch sử.",
    blabUpgradeTagDineIn: "Ăn tại quán",
    blabUpgradeTagReports: "Báo cáo doanh thu",
    blabUpgradeTagHistory: "Dữ liệu lịch sử",
    btnModalBlabUpgrade: "Liên hệ tư vấn",
    blabHoursCommitment: "Khung giờ hỗ trợ: 09:00 - 22:00 hằng ngày (Phản hồi < 5 phút)",
    blabExportTitle: "Báo cáo theo tháng / Dữ liệu đám mây",
    blabExportSub: "Vui lòng liên hệ đội ngũ BLAB để được hỗ trợ",
    btnModalBlabExport: "Liên hệ BLAB",
    btnModalBlabClose: "Đóng",
    blabContextHistoryTitle: "Tra cứu dữ liệu lịch sử > 30 ngày",
    blabContextHistoryDesc: "Hệ thống hiển thị dữ liệu 30 ngày gần nhất. Dữ liệu trên 30 ngày được lưu trữ an toàn trên đám mây, quý khách cần tra cứu hoặc xuất báo cáo đối soát vui lòng liên hệ chuyên viên qua kênh dưới đây.",
    blabContextUpgradeTitle: "Mở khóa tính năng & Nâng cấp gói",
    blabContextUpgradeDesc: "Để kích hoạt các tính năng nâng cao (Ăn tại quán, Báo cáo doanh thu chuyên sâu), chuyên viên BLAB luôn sẵn sàng tư vấn và kích hoạt cho quý quán trong 5 phút.",
    blabContextSupportTitle: "Kênh kết nối kỹ thuật trực tiếp",
    blabContextSupportDesc: "Quý quán gặp sự cố vận hành, lỗi kết nối máy in hoặc cần hỗ trợ thao tác, vui lòng kết nối ngay với đội ngũ kỹ thuật BLAB.",
    startShiftTitle: "Bắt đầu nhận đơn",
    startShiftDesc: "Nhấn nút bên dưới để kích hoạt chuông báo và sẵn sàng nhận đơn hàng mới từ khách hàng.",
    startShiftStatus: "Kết nối máy chủ・Sẵn sàng nhận đơn",
    btnStartShift: "Bắt đầu nhận đơn (Bật chuông)",
    // Badges & Buttons
    badgeNew: "MỚI",
    badgeDoing: "ĐANG LÀM",
    badgeReady: "ĐÃ XONG",
    badgeWaiting: "CHỜ KHÁCH",
    badgePicked: "ĐÃ LẤY",
    badgePaid: "ĐÃ THANH TOÁN",
    badgeRejected: "ĐÃ HỦY",
    btnReview: "Xem đơn",
    btnReady: "Đã xong",
    btnPickedUp: "Đã lấy",
    btnPaid: "Đã thanh toán",
    btnWaitingReply: "Chờ khách phản hồi",
    btnView: "Xem",
    defaultCustomer: "Khách",
    processing: "Đang xử lý...",
    processFail: "Xử lý thất bại, vui lòng thử lại sau.",
    // Time & ETA
    pickupLabel: "Lấy:",
    tileItemCount: "{count} món",
    etaArrived: "Đã đến / {min} phút trước",
    etaArrivedHours: "Đã đến / {h} giờ {m} phút trước",
    etaArrivedHoursOnly: "Đã đến / {h} giờ trước",
    etaArrivedDays: "Đã đến / {d} ngày trước",
    etaArrivedDaysHours: "Đã đến / {d} ngày {h} giờ trước",
    etaArrivedWeeks: "Đã đến / {w} tuần trước",
    etaMinutes: "Còn {min} phút",
    etaHours: "Còn {h} giờ {m} phút",
    etaHoursOnly: "Còn {h} giờ",
    etaDays: "Còn {d} ngày",
    etaDaysHours: "Còn {d} ngày {h} giờ",
    etaWeeks: "Còn {w} tuần",
    dineInElapsedJustNow: "Vừa gửi đơn",
    dineInElapsedMinutes: "Gửi đơn {min} phút trước",
    dineInElapsedHours: "Gửi đơn {h} giờ {m} phút trước",
    dineInElapsedHoursOnly: "Gửi đơn {h} giờ trước",
    dineInElapsedDays: "Gửi đơn {d} ngày trước",
    dineInElapsedDaysHours: "Gửi đơn {d} ngày {h} giờ trước",
    dineInElapsedWeeks: "Gửi đơn {w} tuần trước",
    dineInAppendedJustNow: "Vừa gọi thêm",
    dineInAppendedMinutes: "Gọi thêm {min} phút trước",
    dineInAppendedHours: "Gọi thêm {h} giờ {m} phút trước",
    dineInAppendedHoursOnly: "Gọi thêm {h} giờ trước",
    dineInAppendedDays: "Gọi thêm {d} ngày trước",
    dineInAppendedDaysHours: "Gọi thêm {d} ngày {h} giờ trước",
    dineInAppendedWeeks: "Gọi thêm {w} tuần trước",
    dineInTimeLabel: "Thời gian gửi đơn",
    dineInAppendedTimeLabel: "Thời gian gọi thêm",
    dineInElapsedHeader: "Thời gian đã qua",
    // Alert modal
    alertTitle: "{count} Đơn hàng mới",
    alertTitleAppend: "{count} Đơn gọi thêm món",
    alertTitleCombined: "{newCount} đơn mới, {appendCount} đơn gọi thêm",
    alertSub: "Nhấn “Xem đơn” để xem chi tiết và nhận đơn",
    alertSubAppend: "Bàn: {tables} vừa gọi thêm món, vui lòng chuẩn bị",
    alertBtnReview: "Xem đơn",
    alertBtnDismiss: "Tạm ẩn",
    // Review Modal
    reviewTitle: "Chi tiết đơn hàng",
    reviewTitleNew: "Duyệt đơn hàng",
    labelOrder: "Mã đơn",
    labelCustomer: "Khách LINE",
    labelPickup: "Giờ lấy",
    labelEta: "Thời gian còn",
    labelTotal: "Tổng tiền",
    labelSubtotal: "Tạm tính",
    labelGrandtotal: "Tổng cộng",
    labelDiscount: "Giảm giá",
    labelStatus: "Trạng thái",
    labelDiningOption: "Hình thức phục vụ",
    labelOrderItems: "Danh sách món",
    statusPillNew: "Chờ xử lý",
    statusPillAccepted: "Đang làm",
    statusPillDone: "Chờ lấy",
    statusPillPicked: "Đã lấy",
    statusPillPaid: "Đã thanh toán",
    statusPillWaiting: "Chờ khách xác nhận",
    statusPillRejected: "Đã hủy",
    customerNoteLabel: "Ghi chú từ khách",
    flavorTitle: "Tùy chọn hương vị & Khẩu vị",
    customerChangeTitle: "Yêu cầu đổi món / Ghi chú đặc biệt",
    viewRawOrder: "Xem toàn văn đơn gốc",
    hideRawOrder: "Thu gọn đơn gốc",
    printToolsLabel: "In ấn & tem nhãn",
    rawOrderTitle: "Dữ liệu đơn hàng gốc (Raw Data)",
    btnCopy: "Sao chép",
    copySuccess: "Đã sao chép",
    btnPrintStickerShort: "In tem",
    btnPrintAllPortionsShort: "In cả {n} tem",
    itemPreparedBadge: "Đã xong",
    btnAccept: "Nhận đơn",
    btnChange: "Yêu cầu thay đổi",
    btnReject: "Từ chối đơn",
    btnCancelOrder: "Hủy đơn",
    btnClose: "Đóng",
    confirmCancelOrder: "Bạn có chắc muốn hủy đơn này? Khách sẽ KHÔNG nhận được thông báo.",
    confirmForceCancel: "Khách không phản hồi, bạn có chắc muốn hủy đơn này?",
    // Change Modal
    changeTitle: "Yêu cầu thay đổi",
    changeTabTime: "Thời gian quá gấp",
    changeTabTimeSub: "Đề xuất dời giờ lấy món",
    changeTabSoldout: "Đã hết món",
    changeTabSoldoutSub: "Chọn món đã hết hàng",
    origTimeLabel: "Khách hẹn ban đầu",
    calcFromNowSub: "（Tính từ giờ hẹn hoặc hiện tại）",
    changeTimeTitle: "⏰ Đề xuất giờ lấy mới:",
    changeTimeSub: "Nhập giờ mới hoặc chọn nhanh cộng phút bên dưới",
    changeTimePlaceholder: "VD: 11:30",
    changeQuickSelect: "Chọn nhanh mốc dời giờ:",
    soldoutTitle: "Chọn các món đã hết:",
    soldoutClear: "Bỏ chọn tất cả",
    btnSendSuggest: "Gửi đề xuất",
    btnCancel: "Hủy",
    btnConfirm: "Xác nhận",
    alertInputTime: "Vui lòng nhập giờ đề xuất mới (Ví dụ: 11:30)!",
    alertSelectSoldout: "Vui lòng chọn ít nhất một món đã hết hàng!",
    // Reject Modal
    rejectTitle: "Không thể nhận đơn",
    rejectR1Title: "Hôm nay đã bán hết",
    rejectR1Sub: "Tất cả các món đã bán hết hôm nay",
    rejectR2Title: "Đơn quá tải, tạm ngưng",
    rejectR2Sub: "Quán đang quá tải, tạm dừng nhận đơn",
    rejectR3Title: "Đã qua giờ mở cửa",
    rejectR3Sub: "Hiện tại ngoài khung giờ hoạt động",
    rejectR4Title: "Hủy không báo khách",
    rejectR4Sub: "Hủy trực tiếp không gửi tin nhắn",
    btnConfirmReject: "Xác nhận từ chối",
    btnBack: "Quay lại",
    // Settings
    settingsTitle: "Cài đặt hệ thống",
    settingsSub: "Thông số vận hành, in ấn hoá đơn và thiết bị quầy",
    settingsSyncStatus: "Đồng bộ đám mây",
    tocSettingsTitle: "Mục lục cài đặt",
    tocSettingsSub: "Cấu hình hệ thống",
    tocStoreStatus: "Trạng thái nhận đơn",
    tocOrderMode: "Chế độ nhận đơn",
    tocPayment: "Thiết lập thanh toán",
    tocHours: "Giờ hoạt động",
    tocStoreInfo: "Thông tin cửa hàng",
    settingStoreInfoTitle: "Thông tin cơ bản cửa hàng",
    settingStoreInfoSub: "Quản lý Logo thương hiệu, thông báo chạy chữ và địa chỉ liên hệ",
    btnSaveAllStoreInfo: "Lưu tất cả thông tin",
    tocAddress: "Địa chỉ cửa hàng",
    tocLogo: "Logo cửa hàng",
    settingStoreStatusTitle: "Trạng thái nhận đơn",
    settingStoreStatusSub: "Chuyển đổi linh hoạt giữa Mở quán, Đang bận (+1h) hoặc Tạm dừng nhận đơn",
    boxOpenTitle: "Mở quán",
    boxOpenDesc: "Nhận đơn ngay, ưu tiên hơn giờ hoạt động và ngày nghỉ hôm nay",
    boxBusyTitle: "Đang bận (+1 giờ)",
    boxBusyDesc: "Tự động cộng thêm 1 giờ cho mỗi đơn mới",
    boxPausedTitle: "Tạm dừng nhận đơn",
    boxPausedDesc: "Tạm dừng nhận đơn mới, khách không thể gửi đơn",
    statusOpen: "Đang mở quán",
    statusBusy: "Đang bận (+1 giờ)",
    statusPaused: "Tạm dừng nhận đơn",
    statusClosed: "Đóng cửa nghỉ",
    statusMenuHeader: "Trạng thái nhận đơn",
    statusOptOpenTitle: "Mở quán",
    statusOptOpenDesc: "Nhận đơn ngay, ưu tiên hơn giờ hoạt động và ngày nghỉ hôm nay",
    statusOptBusyTitle: "Đang bận (+1 giờ)",
    statusOptBusyDesc: "Quán đang bận, tự động kéo dài thời gian làm thêm 1 tiếng cho mỗi đơn mới",
    statusOptPausedTitle: "Tạm dừng nhận đơn",
    statusOptPausedDesc: "Tạm dừng nhận đơn mới, khách hàng không thể gửi đơn",
    statusOptClosedTitle: "Đóng cửa nghỉ",
    statusOptClosedDesc: "Tạm ngừng nhận đơn mới",
    prepTimeTitle: "Thời gian chuẩn bị món",
    prepTimeSub: "Khi khách chọn 'Lấy hàng sớm nhất', hệ thống sẽ dựa vào thời gian này để ước tính thời gian hoàn thành. Quán có thể linh hoạt điều chỉnh theo tình hình thực tế.",
    settingPrepTimeTitle: "Thời gian chuẩn bị món",
    settingPrepTimeSub: "Khi khách chọn 'Lấy hàng sớm nhất', hệ thống sẽ dựa vào thời gian này để ước tính thời gian hoàn thành. Quán có thể linh hoạt điều chỉnh theo tình hình thực tế.",
    prepTimeMin: "{n} phút",
    prepTimeSaved: "Đã cập nhật thời gian chuẩn bị món thành {n} phút",
    prepTimePrompt: "Vui lòng nhập thời gian chuẩn bị món (phút, 0-180):",
    prepTimeInvalid: "Vui lòng nhập số phút hợp lệ từ 0 đến 180",
    prepTimeCustom: "Tùy chỉnh",
    prepTimeMinShort: "p",
    orderModeTitle: "Chế độ nhận đơn & Hẹn giờ",
    orderModeSub: "Tùy chỉnh cho phép khách hẹn giờ lấy hoặc nhận đơn làm ngay theo thứ tự",
    btnSaveSetting: "Lưu thiết lập",
    modeScheduledTitle: "Bật hẹn giờ lấy món",
    modeScheduledSub: "Khách hàng có thể tự chọn ngày và giờ muốn đến lấy món trên trang đặt hàng. Thích hợp với các quán chuẩn bị theo giờ hẹn của khách.",
    modeAsapTitle: "Tắt hẹn giờ - Nhận đơn làm ngay theo thứ tự",
    modeAsapSub: "Ẩn mục chọn ngày giờ. Khách đặt xong đơn sẽ được tiếp nhận và xử lý làm ngay theo thứ tự vào đơn.",
    paymentSettingsTitle: "Thiết lập phương thức thanh toán",
    paymentSettingsSub: "Tùy chỉnh các phương thức thanh toán khách có thể sử dụng khi đặt món",
    btnSavePaymentSetting: "Lưu thiết lập",
    paymentOptLinePayTitle: "LINE Pay (Thanh toán trực tuyến)",
    paymentOptLinePaySub: "Khách hàng thanh toán trực tiếp qua ví LINE Pay khi đặt món, tiền về ngay.",
    paymentOptCashTitle: "Đặt rồi trả sau (Thanh toán tại quầy khi nhận món)",
    paymentOptCashSub: "Cho phép khách đặt trước món ăn và thanh toán tiền mặt/quẹt thẻ khi tới lấy hàng.",
    paymentSettingsHint: "Lưu ý: Nếu chỉ chọn «LINE Pay», khách bắt buộc phải thanh toán online trước khi gửi đơn; nếu chọn cả hai, khách có thể linh hoạt chọn trả trước qua LINE Pay hoặc trả sau tại quầy.",
    paymentBadgeActive: "Đang bật",
    paymentBadgeInactive: "Chưa bật",
    paymentSettingsUnavailableHint: "Quán chưa kích hoạt LINE Pay. Phương thức thanh toán được cố định là Đặt rồi trả sau.",
    paymentMinOneRequired: "Vui lòng chọn ít nhất một phương thức thanh toán!",
    paymentSettingsSaved: "Đã lưu thiết lập phương thức thanh toán thành công!",
    paymentSettingsBtn: "Thiết lập thanh toán",
    hoursTitle: "Giờ hoạt động",
    hoursSub: "Cài đặt khung giờ mở cửa và ngày nghỉ định kỳ",
    btnSaveHours: "Lưu thời gian",
    settingAddressTitle: "Địa chỉ cửa hàng",
    settingAddressSub: "Hiển thị trên trang đặt món của khách và tin nhắn tự động LINE",
    settingAddressPlaceholder: "Nhập địa chỉ cửa hàng",
    btnSaveAddress: "Lưu địa chỉ",
    tocAnnouncement: "Thông báo cửa hàng",
    settingAnnouncementTitle: "Thông báo của quán",
    settingAnnouncementSub: "Hiển thị dưới cùng của Header trên trang đặt món của khách, để trống sẽ tự động ẩn",
    settingAnnouncementPlaceholder: "Nhập thông báo cửa hàng (ví dụ: Hôm nay có món mới / Nghỉ lễ 2/9...)",
    btnSaveAnnouncement: "Lưu thông báo",
    settingLogoTitle: "Logo cửa hàng",
    settingLogoSub: "Hiển thị ở đầu trang đặt món của khách và hệ thống POS",
    btnChooseLogo: "Chọn ảnh",
    logoHint: "Hỗ trợ định dạng PNG, JPG, WebP (Khuyến nghị hình vuông 512x512px)",
    btnSaveLogo: "Lưu Logo",
    btnDeleteLogo: "Xóa Logo",
    logoUploadPrompt: "Vui lòng chọn ảnh Logo trước khi lưu",
    confirmDeleteLogo: "Bạn có chắc muốn xóa Logo cửa hàng không?",
    logoDeleteSuccess: "Đã xóa Logo cửa hàng thành công!",
    btnAddShift: "+ Thêm khung giờ",
    closedDay: "Nghỉ",
    saving: "Đang lưu...",
    saveSuccess: "Đã lưu thiết lập thành công!",
    printerSavedLocally: "Đã lưu cài đặt máy in trên thiết bị này (thay đổi được tự động lưu).",
    printerSaveFailed: "Không lưu được cài đặt máy in. Kiểm tra bộ nhớ thiết bị rồi thử lại.",
    printerAutoSaveHint: "Thay đổi tự lưu trên thiết bị này; bạn cũng có thể bấm Lưu để lưu ngay.",
    printerFeedBeforeCut: "Đẩy giấy / chừa khoảng trắng trước khi cắt (mm)",
    saveFail: "Lưu thất bại: ",
    // Menu Editor
    menuCatTitle: "Danh mục thực đơn",
    menuCatSub: "Chọn danh mục bên trái để quản lý món",
    btnManageCategories: "Sắp xếp hiển thị",
    moveDisplayUp: "Đưa lên",
    moveDisplayDown: "Đưa xuống",
    manageCategoriesTitle: "Sắp xếp hiển thị",
    manageCategoriesSub: "Kéo thả hoặc dùng nút lên/xuống để đặt vị trí phân loại và mục Tùy chọn khẩu vị. Chọn phân loại để sắp xếp món; chọn Tùy chọn khẩu vị để sắp xếp các nhóm bên trong, rồi bấm Lưu thay đổi khi hoàn tất.",
    menuOrderSections: "Phân loại và tùy chọn khẩu vị",
    menuOrderFlavorSection: "Tùy chọn khẩu vị",
    menuOrderGroups: "Nhóm trong Tùy chọn khẩu vị",
    menuOrderItems: "Món trong {name}",
    tabletSortTipLabel: "Mẹo sắp xếp cho Tablet:",
    tabletSortTipDesc: "Chạm và giữ thanh kéo ⠿ hoặc dùng các nút mũi tên ▲ ▼ để định vị món. Chạm vào thẻ bên trái để trực tiếp tải danh sách món tương ứng sang bên phải.",
    posTouchModeBadge: "Chế độ cảm ứng POS",
    menuSortBreadcrumbMenu: "Quản lý thực đơn",
    menuSortBreadcrumbDineTakeaway: "Bàn / Mang đi",
    statusAutoSaved: "Đã tự động lưu",
    statusUnsaved: "Chưa lưu thay đổi",
    btnRevertSort: "Khôi phục",
    btnSaveSortChanges: "Lưu thay đổi",
    sortColSectionsTitle: "THỨ TỰ PHÂN LOẠI & TÙY CHỌN",
    sortColClickToView: "Bấm để xem món",
    badgeScopeOrder: "Toàn đơn",
    badgeFoodItem: "Món ăn",
    badgeComboItem: "Món ăn kèm combo",
    badgeUncategorized: "Chưa phân loại cụ thể",
    badgeSelectedState: "Đang chọn",
    btnOpeningCategory: "Đang mở",
    customizationOptionsCount: "{n} mục tùy chọn",
    categoryItemsCount: "{n} món",
    menuOrderCustomizationsIn: "TÙY CHỌN TRONG: {name}",
    menuOrderItemsIn: "MÓN TRONG PHÂN LOẠI: {name}",
    sortColItemsSubtitle: "Sắp xếp thứ tự hiển thị khách hàng nhìn thấy trước",
    nItemsVisible: "{n} món hiển thị",
    nCustomizationsVisible: "{n} mục tùy chọn hiển thị",
    dragToReorder: "Kéo để sắp xếp",
    wholeOrderMasterTitle: "Tùy chọn khẩu vị",
    requiredOptionBadge: "Bắt buộc",
    optionalOptionBadge: "Tùy chọn",
    btnCloseManager: "Đóng",
    btnAddCategory: "Thêm phân loại",
    btnMenuAddCategory: "Thêm phân loại",
    btnAddCategoryBottom: "Thêm phân loại mới",
    btnCategoryDelete: "Xóa phân loại",
    btnCategoryRename: "Đổi tên phân loại",
    addCategoryModalTitle: "Thêm phân loại thực đơn mới",
    categoryNameLabel: "Tên phân loại",
    categoryNamePlaceholder: "VD: Đồ uống, Món chính",
    categoryShortNameLabel: "Tên rút gọn thanh điều hướng (tùy chọn, hiển thị trên tab mobile)",
    categoryShortNamePlaceholder: "Để trống sẽ lấy theo tên phân loại",
    categoryTypeLabel: "Loại phân loại",
    categoryTypeCatalog: "Danh mục món (Món chính / Đồ uống)",
    categoryTypeModifier: "Tùy biến chọn kèm (Thêm cay / Topping)",
    categoryTypeCustomization: "Tùy biến toàn đơn (VD: Khẩu vị, Độ mặn, Gia vị)",
    categoryTypeCatalogBadge: "Món ăn",
    confirmDeleteCategory: "Bạn có chắc muốn xóa toàn bộ phân loại「{name}」và các món bên trong không?",
    promptCategoryNameEmpty: "Vui lòng nhập tên phân loại hợp lệ!",
    promptCategoryNamePrompt: "Nhập tên phân loại mới:",
    customizationSettings: "Tùy chọn khẩu vị",
    allowCustomizationLabel: "Cho phép tùy chỉnh món (Topping / Độ cay / Ghi chú)",
    allowCustomizationDesc: "Khi bật, khách hàng có thể tùy chỉnh thêm topping, mức cay cho các món trong loại này",
    appliedModifiersTitle: "Tùy biến mặc định của phân loại",
    appliedModifiersDesc: "Chọn các tùy biến khách hàng có thể chọn khi gọi món trong loại này (Mặc định chọn tất cả)",
    btnSelectAll: "Chọn tất cả",
    btnUnselectAll: "Bỏ chọn tất cả",
    noModifiersInStore: "Hiện tại quán chưa thiết lập nhóm tùy biến nào (như Thêm cay, Topping...)",
    modifiersEmptyTitle: "Chưa có nhóm tùy biến nào trong thực đơn",
    modifiersEmptyDesc: "Tạo các nhóm tùy biến (Topping, Mức đường, Đá, Cay...) để khách hàng lựa chọn khi đặt món.",
    btnCreateModifierGroup: "Thiết lập nhóm tùy biến mới",
    tooltipItemPhoto: "Bấm để xem hoặc đổi ảnh món",
    tooltipDropToUpload: "Thả ảnh vào đây để tải lên ngay",
    imageUploadSuccessToast: "Đã tải lên ảnh món thành công",
    itemModifiersCount: "tùy biến",
    appliedModifiersCardDesc: "Mọi món trong danh mục này sẽ tự động áp dụng các nhóm tùy biến dưới đây (Có thể tùy chỉnh riêng trong Cài đặt từng món)",
    colItemPhoto: "Hình ảnh",
    colItemName: "Món ăn",
    colPrice: "Giá bán",
    colModifiers: "Tùy biến của món",
    colStock: "Trạng thái",
    colActions: "Thao tác",
    inheritedCatModifiers: "Kế thừa mặc định",
    customItemModifiers: "tùy biến riêng",
    noModifiersApplied: "Không có tùy biến",
    btnMoreActions: "Thao tác khác",
    btnDuplicateItem: "Sao chép món",
    duplicateSuffix: "Bản sao",
    toggleModifiersCollapse: "Thu gọn",
    toggleModifiersExpand: "Mở rộng",
    catalogManageTitle: "Cài đặt món ăn",
    catalogManageDesc: "Điều chỉnh tên món, giá bán, trạng thái còn món và cài đặt chi tiết.",
    menuEditorTitle: "Danh sách món",
    menuEditSub: "Nhấn vào món để chỉnh sửa; dùng Sắp xếp hiển thị để đổi thứ tự.",
    btnMenuRestore: "Khôi phục Menu gốc",
    btnMenuAddItem: "Thêm món mới",
    btnMenuCreateType: "Tạo theo loại",
    btnMenuCreateUnified: "Thêm mới",
    btnMenuAddCustomGroup: "Thêm nhóm khẩu vị",
    newGroupCardTitle: "Tạo nhóm tùy chọn mới",
    newGroupInputPlaceholder: "✦ Nhập tên nhóm (ví dụ: Chọn nước sốt, Dụng cụ ăn uống...)",
    btnSaveGroup: "Lưu nhóm",
    menuSectionCatalogTitle: "Thực đơn món & Combo",
    menuSectionComboTitle: "Combo & Set ưu đãi",
    menuSectionCustomTitle: "Khẩu vị & Tùy chọn",
    segProducts: "Món ăn",
    segOptions: "Tùy chọn",
    btnAddOptionGroupTop: "Thêm nhóm tùy chọn",
    optionsCountUnit: "lựa chọn",
    noOptionGroupsPrompt: "Chưa có nhóm tùy chọn nào (nhấn bên trên để tạo)",
    noCategoriesPrompt: "Chưa có nhóm tùy chọn nào, vui lòng nhấn nút bên trên để tạo",
    btnAddCatalogCategory: "Thêm phân loại món",
    btnAddComboCategory: "Thêm phân loại Combo",
    btnCreateComboWizard: "Tạo Combo mới",
    btnCreateCustomGroup: "Thêm nhóm tùy chọn",
    noComboCategoriesPrompt: "Chưa có phân loại Combo (bấm bên dưới để tạo)",
    btnCatRename: "Đổi tên phân loại",
    btnCatDelete: "Xóa phân loại",
    createTypeModalTitle: "Chọn loại cấu hình thực đơn",
    createTypeModalSub: "Chọn phương thức tạo phù hợp cho món ăn hoặc tuỳ chọn",
    createTypeStandardTitle: "Món đơn (kèm tùy chọn)",
    createTypeStandardDesc: "Thêm món ăn/đồ uống vào thực đơn, thiết lập giá, ảnh, nhãn và tùy chọn nâng cao.",
    createTypeModifiersTitle: "Món kèm tùy chọn",
    createTypeModifiersDesc: "Món lẻ có các nhóm tùy chọn riêng: topping, mức đường, đá, độ cay...",
    createType1Title: "Combo ưu đãi (Chọn món)",
    createType1Desc: "Bán combo gồm đủ N món từ các danh mục nguồn + tùy chọn đi kèm.",
    createType3Title: "Tùy chọn toàn đơn",
    createType3Desc: "Áp dụng chung cho cả đơn: dụng cụ ăn uống, mức cay toàn đơn, dặn dò...",
    btnItemModifiers: "Tuỳ chọn món",
    itemModifiersModalTitle: "Thiết lập tuỳ chọn cho món",
    itemModifiersModalSub: "Chọn các nhóm tuỳ chọn từ Thư viện để áp dụng cho món này",
    itemModAppliesTo: "Áp dụng cho món",
    itemModDraftNote: "Hoàn tất thiết lập, sau đó lưu thực đơn để đồng bộ thay đổi.",
    itemModInheritedHelp: "Tự động áp dụng từ danh mục, không cần chọn lại.",
    itemModNoInherited: "Danh mục chưa có nhóm tùy chọn áp dụng sẵn.",
    itemModDirectTitle: "Nhóm tùy chọn riêng của món",
    itemModDirectHelp: "Chọn nhóm từ thư viện để gán riêng cho món này.",
    itemModFilterLabel: "Lọc nhóm tùy chọn",
    itemModAllGroups: "Tất cả nhóm",
    itemModSelectedGroups: "Nhóm đã chọn",
    itemModSelectVisible: "Chọn kết quả",
    itemModClearVisible: "Bỏ chọn kết quả",
    itemModSharedHelp: "Bắt buộc / Tùy chọn là thiết lập của nhóm dùng chung; thay đổi sẽ ảnh hưởng các món sử dụng nhóm này.",
    itemModNoFilterResults: "Không có nhóm phù hợp. Đổi từ khóa hoặc chuyển sang Tất cả nhóm.",
    itemModViewOptions: "Xem lựa chọn và phụ thu",
    itemModNoSurcharge: "Không phụ thu",
    itemModCreateGroup: "Tạo nhóm tùy chọn",
    itemModHubSummary: "Gán riêng {direct} nhóm · Kế thừa {inherited} nhóm",
    btnManageCustomLibrary: "+ Quản lý Thư viện Tùy chọn",
    libraryGroupAvailableBadge: "Thư viện tùy chọn ({total} nhóm)",
    appliedGroupCountBadge: "Đã chọn: {count} nhóm",
    searchModifierGroupsPlaceholder: "Tìm kiếm nhóm tùy chọn...",
    modifierOptionCountUnit: "lựa chọn",
    modifierGroupUnit: "nhóm",
    moreOptionsCount: "+{count} lựa chọn khác",
    noOptionsInGroup: "Chưa có lựa chọn",
    selectionTypeSingle: "Chọn 1",
    selectionTypeMultiple: "Chọn nhiều",
    inheritedFromCategoryNotice: "✦ Kế thừa từ Danh mục (Đã tự động áp dụng cho mọi món trong danh mục)",
    noLibraryModifierGroups: "Hiện tại Thư viện tùy biến chưa có nhóm tùy chọn nào",
    noLibraryModifierGroupsSub: "Vui lòng vào Quản lý Tùy chọn để tạo nhóm trước khi gán cho món.",
    btnNewModifierGroup: "Thêm nhóm tuỳ chọn",
    btnAddItemModGroup: "+ Thêm nhóm tùy chọn",
    btnOpenModLibrary: "+ Chọn từ thư viện có sẵn",
    btnItemModSave: "Hoàn tất thiết lập",
    btnImportLibraryMod: "Thêm vào món này",
    labelModifierGroupName: "Tên nhóm (VD: Độ cay, Topping, Mức đường đá)",
    labelModifierSelectionType: "Kiểu chọn",
    optionSingleRadio: "Chọn 1 (Radio)",
    optionMultipleCheckbox: "Chọn nhiều (Checkbox)",
    labelModifierRequired: "Bắt buộc chọn",
    labelMinSelection: "Tối thiểu",
    labelMaxSelection: "Tối đa",
    labelMultipleBoundsHint: "(0 = không giới hạn)",
    labelItemCustomizationNotice: "Tùy chọn riêng của món sẽ cộng dồn cùng tùy chọn kế thừa từ danh mục (không bị ghi đè)",
    labelModifierDefault: "Mặc định",
    badgeRequired: "Bắt buộc",
    badgeOptional: "Tùy chọn",
    btnAddModifierOption: "Thêm lựa chọn",
    labelOptionName: "Tên lựa chọn",
    labelOptionPrice: "Phụ thu (+$$)",
    noModifierGroups: "Món này chưa có nhóm tuỳ chọn nào. Bấm nút phía trên để tạo mới.",
    btnSaveModifiers: "Lưu tuỳ chọn",
    optionSectionOrder: "Gán cho toàn cục",
    optionSectionItem: "Gán cho món",
    optionSectionEmpty: "Chưa có nhóm tùy chọn",
    scopeOrder: "Toàn đơn",
    scopeCategory: "Theo danh mục",
    scopeItem: "Theo món",
    scopeCategoryItem: "Theo danh mục hoặc món",
    btnSelectCategories: "Chọn phân loại",
    scopeSettingsTitle: "Thiết lập phân loại áp dụng",
    scopeOrderDesc: "Áp dụng cho toàn bộ đơn hàng tại bước thanh toán (như dụng cụ, độ cay cả đơn)",
    scopeCategoryDesc: "Tất cả món thuộc các phân loại được chọn sẽ tự động kế thừa tùy chọn này",
    scopeItemDesc: "Chỉ áp dụng khi gán thủ công vào từng món ăn hoặc combo cụ thể",
    labelAppliedCategories: "Phân loại áp dụng:",
    appliedSummary: "Đang áp dụng cho {catCount} phân loại ({itemCount} món ăn)",
    inheritedFromCategory: "Kế thừa từ phân loại",
    btnAddFromLibrary: "Thêm từ thư viện tùy chọn",
    libraryModalTitle: "Chọn từ thư viện tùy chọn",
    libraryModalSub: "Tích chọn các nhóm tùy chọn hoặc lựa chọn cần gắn vào món này",
    btnImportToItem: "Thêm vào món",
    noLibraryOptions: "Chưa có nhóm tùy chọn nào khác trong thư viện để chọn",
    toggleRequiredOn: "Bật bắt buộc",
    toggleRequiredOff: "Tắt bắt buộc",
    btnMenuSave: "Lưu thay đổi",
    menuSaved: "Đã lưu",
    menuWorkspaceTitle: "Quản lý thực đơn",
    menuWorkspaceSub: "Quản lý danh sách món ăn, giá bán, cấu hình tùy chọn và trạng thái kho món trong thời gian thực",
    menuSidebarTotalCats: "Tổng số danh mục: {count}",
    menuSidebarActiveItems: "{count} món hoạt động",
    menuSearchPlaceholder: "Tìm kiếm món trong phân loại này...",
    filterAll: "Tất cả",
    filterInStock: "Còn món",
    filterOutOfStock: "Hết hàng",
    filterLabel: "Lọc theo:",
    menuPriceLabel: "Giá bán",
    menuServingStatus: "Đang phục vụ",
    menuPausedStatus: "Tạm ngưng",
    menuFooterShowing: "Hiển thị {showing} trên tổng {total} món trong phân loại {cat}",
    menuFooterPosSync: "Cập nhật đồng bộ POS tức thì",
    menuUploadImage: "Tải ảnh",
    menuChangeImage: "Đổi ảnh",
    btnAddDish: "Thêm món",
    btnItemModifiersShort: "Tuỳ chọn món",
    menuModeLabel: "Chế độ quản lý thực đơn",
    menuEmptyCategory: "Danh mục chưa có món. Hãy thêm món đầu tiên.",
    menuMoveUp: "Đưa lên một vị trí",
    menuMoveDown: "Đưa xuống một vị trí",
    menuDragSort: "Kéo để đổi thứ tự",
    menuAddBundle: "Thêm combo",
    menuAddItem: "Thêm món",
    menuBundleSettings: "Thiết lập combo",
    itemDetailSub: "Chỉnh tên món, giá bán, hình ảnh và tùy chọn",
    itemBasicTitle: "Thông tin cơ bản",
    itemAdvancedDesc: "Thiết lập tùy chọn riêng và các thành phần của combo",
    menuHelp: "Hướng dẫn chỉnh sửa",
    menuDiscardConfirm: "Có thay đổi thực đơn chưa lưu. Bỏ thay đổi và rời đi? Chọn Hủy để tiếp tục chỉnh sửa.",
    btnMenuDirty: "Lưu thay đổi (Chưa lưu *)",
    menuSelectPrompt: "Vui lòng chọn danh mục ở bên trái",
    menuLoading: "Đang tải thực đơn...",
    menuItemTotalCount: "(Tất cả {count} món)",
    menuItemUnit: "món",
    modifierPrefix: "[Tùy biến]",
    customizationPositionHint: "Có thể kéo để đổi vị trí",
    stockStatusInStock: "Còn món",
    stockStatusOutOfStock: "Hết hàng",
    btnItemImage: "Ảnh món",
    btnItemDelete: "Xóa",
    menuItemBadgePlaceholder: "Nhãn/Gợi ý (VD: Bán chạy)",
    menuItemPricePlaceholder: "Giá",
    confirmDeleteItem: "Bạn có chắc muốn xóa món này không?",
    newItemPlaceholder: "Món mới",
    confirmSaveMenu: "Bạn có chắc chắn muốn lưu mọi thay đổi không? Thay đổi sẽ cập nhật ngay lập tức lên trang đặt hàng của khách.",
    menuSaving: "Đang lưu...",
    menuSaveSuccess: "Lưu thực đơn thành công!",
    menuSaveFail: "Lưu thất bại: ",
    restoreOnlyBenmi: "Tính năng khôi phục mặc định hiện chỉ áp dụng cho Benmi.",
    confirmRestoreMenu: "Bạn có chắc chắn muốn KHÔI PHỤC MENU về trạng thái gốc mặc định không? Tất cả các món bạn đã sửa sẽ bị ghi đè!",
    restoreSuccess: "Đã khôi phục menu gốc thành công!",
    restoreFail: "Khôi phục menu thất bại: ",
    menuLoadFail: "Không thể tải dữ liệu thực đơn: ",
    menuIncompleteReload: "Thực đơn chưa tải đầy đủ nên chưa thể lưu. Vui lòng tải lại trước khi chỉnh sửa.",
    menuRetryLoad: "Tải lại thực đơn",
    menuDuplicateItem: "Tên món trong cùng một danh mục không được trùng nhau.",
    priceHiddenPlaceholder: "Ẩn",
    // Image Modal
    imageModalTitle: "Quản lý hình ảnh",
    imageModalItem: "Ảnh: {name}",
    imageChecking: "Đang kiểm tra ảnh...",
    imageHasImage: "Món này đã có ảnh",
    imageNoImage: "Món này chưa có ảnh",
    imageLoadFail: "Lỗi khi tải ảnh",
    btnImageSelect: "Chọn ảnh",
    btnImageDelete: "Xóa ảnh",
    imageUploading: "Đang tải ảnh lên...",
    imageUploadSuccess: "Tải ảnh thành công!",
    imageUploadFail: "Lỗi tải ảnh: ",
    confirmDeleteImage: "Bạn có chắc muốn xóa ảnh này không?",
    imageDeleting: "Đang xóa ảnh...",
    imageDeleteFail: "Lỗi xóa ảnh: ",
    // Stock Modal
    stockModalTitle: "Trạng thái bán",
    stockModalItem: "Cài đặt kho: {name}",
    stockLabelStatus: "Trạng thái:",
    stockOptInStock: "Đang bán",
    stockOptOutOfStock: "Tạm ngừng bán",
    stockLabelDuration: "Tạm ngừng bán đến",
    stockOptToday: "Hết hôm nay",
    stockOptMultipleDays: "Ngày cụ thể",
    stockOptIndefinite: "Khi mở bán lại",
    stockLabelDate: "Ngày mở bán lại",
    btnStockSave: "Áp dụng",
    stockDrawerHint: "Chọn thời hạn để lưu ngay trạng thái hết món.",
    stockInstantHint: "Thay đổi áp dụng ngay trên thực đơn khách.",
    stockTodayHint: "Tự mở bán lại lúc 4 giờ sáng mai",
    stockDateChoiceHint: "Chọn ngày mở bán lại",
    stockIndefiniteHint: "Mở bán lại thủ công khi món sẵn sàng",
    stockDateHint: "Mở bán lại lúc 4 giờ sáng ngày đã chọn",
    stockLinkedNotice: "Thay đổi áp dụng cho mọi món dùng lựa chọn này.",
    stockRestore: "Mở bán lại ngay",
    stockRetry: "Thử lại",
    stockSaveError: "Chưa lưu được. Kiểm tra kết nối rồi thử lại.",
    stockDateInvalid: "Chọn ngày từ ngày mai trở đi.",
    alertSelectOosDate: "Vui lòng chọn ngày khôi phục bán!",
    stockUpdateFail: "Lỗi cập nhật trạng thái kho: ",
    customizationManageTitle: "Cài đặt khẩu vị & tùy chọn gọi món",
    customizationManageDesc: "Điều chỉnh tên lựa chọn, phụ thu, trạng thái hết hàng và các nhánh phụ (sub-options).",
    subOptionsLabel: "Nhánh phụ:",
    btnAddSubOption: "+ Thêm nhánh",
    btnAddCustomOption: "+ Thêm lựa chọn",
    promptAddSubOption: "Nhập tên nhánh phụ (ví dụ: Không hành, Không tiêu):",
    promptNewOptionName: "Nhập tên lựa chọn mới:",
    labelSurcharge: "Phụ thu",
    labelOptionName: "Tên lựa chọn",
    btnAddCustomGroup: "+ Thêm nhóm tùy chọn mới",
    promptAddCustomGroup: "Nhập tên nhóm tùy chọn (ví dụ: ✦ Chọn nước sốt, ✦ Chọn topping):",
    promptRenameCustomGroup: "Nhập tên nhóm tùy chọn mới:",
    confirmDeleteCustomGroup: "Bạn có chắc muốn xóa nhóm tùy chọn này cùng tất cả lựa chọn bên trong?",
    toggleGroupTypeSingle: "Chuyển thành Chọn 1 (Radio)",
    toggleGroupTypeMultiple: "Chuyển thành Chọn nhiều (Checkbox)",
    // Dining Options & Filter
    diningOption: "Hình thức",
    takeaway: "Mang đi",
    dineIn: "Ăn tại quán",
    filterAll: "Tất cả",
    filterTakeaway: "Mang đi",
    filterDineIn: "Ăn tại quán",
    badgeTakeaway: "Mang đi",
    badgeDineIn: "Ăn tại quán",
    tableNumber: "Số bàn",
    tableNumberLabel: "Số bàn: ",
    labelDiningOption: "Hình thức",
    printDineIn: "【ĂN TẠI QUÁN】",
    printTakeaway: "【MANG ĐI】",
    // Dine In Setting
    tocDineIn: "Thiết lập ăn tại quán",
    settingDineInTitle: "Thiết lập ăn tại quán",
    settingDineInSub: "Bật/tắt tùy chọn ăn tại quán hoặc chỉ bán mang đi",
    settingDineInTrueTitle: "Mở cả Ăn tại quán & Mang đi (Mặc định)",
    settingDineInTrueSub: "Khách có thể tự do chuyển đổi giữa Ăn tại quán và Mang đi.",
    settingDineInFalseTitle: "Chỉ bán mang đi (Tắt ăn tại quán)",
    settingDineInFalseSub: "Ẩn tùy chọn ăn tại quán trên menu, tất cả đơn hàng đều là mang đi.",
    btnSaveDineInSetting: "Lưu thiết lập",
    dineInSaveSuccess: "Đã lưu thiết lập ăn tại quán thành công!",
    dineInSaveFail: "Lưu thiết lập thất bại: ",
    featureLockedTitle: "Tính năng nâng cao (Chưa kích hoạt)",
    featureLockedDesc: "Tính năng này thuộc gói mô-đun nâng cao. Để kích hoạt 'Ăn tại quán', vui lòng liên hệ BLAB để nâng cấp gói.",
    btnContactUpgrade: "Liên hệ nâng cấp gói",
    // Language & Reports Settings
    tocLanguage: "Ngôn ngữ POS",
    tocReports: "Báo cáo doanh thu",
    settingLangTitle: "Ngôn ngữ hiển thị POS",
    settingLangSub: "Cài đặt ngôn ngữ hiển thị và thao tác của hệ thống POS",
    settingReportsTitle: "Báo cáo doanh thu & sản lượng món",
    settingReportsSub: "Xem thống kê bán hàng, doanh thu các món và tùy biến chọn kèm",
    reportsUnlockedName: "Phân tích doanh thu & sản lượng món thời gian thực",
    reportsUnlockedDesc: "Thống kê số lượng bán, tổng doanh thu theo mốc thời gian (Hôm nay, 7 ngày, 30 ngày) và phân tích topping/tùy biến.",
    btnOpenReports: "Xem báo cáo doanh thu",
    reportsLockedTitle: "Tính năng nâng cao (Chưa kích hoạt)",
    reportsLockedDesc: "Tính năng thuộc gói BLAB Analytics nâng cao, vui lòng liên hệ đội ngũ BLAB để nâng cấp.",
    btnBackToSettings: "← Quay lại Cài đặt",
    // Printer Settings
    btnPrint: "In phiếu",
    btnReprint: "In lại",
    tocPrinter: "Máy in & Xuất vé",
    settingPrinterTitle: "Máy in & xuất vé",
    settingPrinterSub: "Cấu hình máy in mạng LAN / Wi-Fi (Cổng 9100) và chế độ tự động in",
    printerAutoPrintTitle: "Tự động in sau khi xác nhận",
    printerAutoPrintDesc: "Tự động in ra các máy đã bật sau khi nhân viên xác nhận nhận đơn thành công",
    printerCashierTitle: "Máy in Bill (ESC/POS)",
    printerCashierDesc: "In hóa đơn chi tiết, hiển thị giá tiền, tùy biến và mã QR",
    printerKitchenTitle: "Máy in Tem (TSPL)",
    printerKitchenDesc: "In tem từng món hoặc tem tổng đơn, căn vị trí bằng X/Y.",
    printerInterfaceLabel: "Hình thức kết nối",
    printerInterfaceNetwork: "Mạng nội bộ / Wi-Fi (TCP/IP)",
    printerInterfaceBluetooth: "Bluetooth không dây (SPP)",
    printerEnableLabel: "Kích hoạt",
    printerStatusConnected: "Đã kết nối máy in",
    printerStatusNone: "Chưa kết nối máy in",
    printerDisabled: "Đã tắt",
    printerNotConfigured: "Chưa thiết lập",
    printerStationCashierShort: "Thu ngân",
    printerStationKitchenShort: "Bếp",
    printerTypeBluetooth: "Bluetooth",
    printerTypeLAN: "Mạng LAN",
    printerBtDeviceLabel: "Thiết bị Bluetooth đã ghép đôi",
    printerBtSelectPlaceholder: "-- Chọn máy in Bluetooth đã ghép đôi --",
    printerBtDevicePlaceholder: "-- Vui lòng chọn máy in Bluetooth đã kết nối --",
    printerBtRefreshBtn: "Quét lại",
    printerBtNoDevices: "Chưa tìm thấy máy in Bluetooth nào. Vui lòng ghép đôi trong Cài đặt Android trước",
    printerIpLabel: "Địa chỉ IP (LAN / Wi-Fi)",
    printerPortLabel: "Cổng Port",
    printerPaperLabel: "Khổ giấy",
    printerPaper80: "80mm (Khổ tiêu chuẩn)",
    printerPaper58: "58mm (Khổ nhỏ)",
    printerProtocolLabel: "Giao thức lệnh in (Protocol)",
    printerOptEscPos: "ESC/POS (Hóa đơn cuộn 58-80mm)",
    printerOptTspl: "TSPL (Máy in tem nhãn/decal như Aimo D520BT, Xprinter)",
    printerTsplSizeLabel: "Kích thước nhãn/decal",
    printerOptTspl100x150: "100 x 150 mm (4x6\" Tem dán túi/thùng lớn)",
    printerOptTspl76x130: "76 x 130 mm (3x5\" Tem đơn hàng trung bình)",
    printerOptTspl50x30: "50 x 30 mm (Tem hộp/món chuẩn)",
    printerOptTspl40x30: "40 x 30 mm (Tem dán ly/phiếu chế biến)",
    printerOptTsplCustom: "Kích thước tùy chỉnh (Custom mm)",
    printerTsplWidthLabel: "Chiều rộng (mm)",
    printerTsplHeightLabel: "Chiều cao (mm)",
    printerTsplModeLabel: "Chế độ in tem nhãn",
    printerOptTsplModeSummary: "Tem tổng đơn hàng (1 tem/mỗi đơn)",
    printerOptTsplModeItems: "Tem dán từng ly/từng món (1 tem/mỗi món)",
    printerTsplDpiLabel: "Độ phân giải (DPI)",
    printerOptTsplDpi203: "203 DPI (8 dots/mm - Tiêu chuẩn)",
    printerOptTsplDpi300: "300 DPI (11.8 dots/mm - Siêu nét)",
    printerTsplXOffsetLabel: "Lề ngang X (mm)",
    printerTsplYOffsetLabel: "Lề dọc Y (mm)",
    btnTestPrint: "In thử nghiệm (Test Print)",
    btnSavePrinterSettings: "Lưu Cấu Hình Máy In",
    // Print Mode Settings (Auto vs Manual)
    printModeTitle: "Chế độ xuất vé / in",
    printModeSub: "Tùy chỉnh hành vi in khi hệ thống tiếp nhận đơn hàng mới",
    printModeAutoTitle: "Tự động in sau khi xác nhận",
    printModeAutoDesc: "Đơn mới chỉ phát chuông thông báo. Sau khi nhân viên xác nhận nhận đơn thành công, hệ thống mới tự động in hóa đơn và tem món.",
    printModeManualTitle: "Chế độ In thủ công (Manual-print)",
    printModeManualDesc: "Nhân viên phải bấm nút [ IN CẢ ĐƠN ] trên màn hình thì máy mới in. Thích hợp cho quán muốn kiểm tra lại đơn trước khi nhận.",
    // 3 Print Levels
    btnPrintFullOrder: "In cả đơn<span class=\"print-action-summary\">1 bill + {n} tem</span>",
    btnPrintBillOnly: "In bill thu ngân",
    btnPrintCustomOption: "In bù tem tùy chọn",
    btnPrintSingleItem: "In tem món",
    printDisabledBill: "Vui lòng bật và thiết lập máy in Bill",
    printDisabledStickers: "Vui lòng bật và thiết lập máy in Tem",
    printDisabledFull: "In cả đơn cần bật cả máy in Bill và máy in Tem",
    printingInProgress: "Đang truyền lệnh in, vui lòng chờ...",
    printerBusyQueued: "⏳ Đã thêm vào hàng đợi in, sẽ in lần lượt...",
    itemPrepared: "Đã hoàn thành",
    markPrepared: "Đánh dấu đã hoàn thành",
    printSingleItemSuccess: "Đã in tem món \"{name}\"!",
    btnPrintPortion: "In tem phần này",
    printPortionsPrinting: "Đang in {count} tem cho \"{name}\"...",
    printPortionsSuccess: "Đã in {count} tem cho \"{name}\"!",
    bundleSelectionsTitle: "Món trong combo",
    bundlePortionPrefix: "Phần {n}",
    bundleGroupFallback: "Món kèm",
    // Quick Sticker / Emergency Note Modal
    quickStickerModalTitle: "In tem tùy chọn / Tem chữa cháy",
    quickStickerModalSub: "Chạm các tùy chọn bên dưới để xả ngay 1 tem ghi chú dán lên món:",
    quickStickerCustomLabel: "Hoặc nhập ghi chú tùy ý cần in:",
    quickStickerCustomPlaceholder: "Nhập ghi chú tùy ý (ví dụ: Ít đá, Bàn 2 thêm thìa)...",
    quickStickerCustomPrintBtn: "In ghi chú này",
    quickStickerPrinting: "Đang in tem ghi chú...",
    quickStickerSuccess: "Đã in tem: \"{text}\"!",
    quickStickerLoading: "Đang tải danh sách tùy chọn...",
    quickStickerGroupSpice: "Gia vị cay",
    quickStickerGroupVeggie: "Rau gia vị",
    quickStickerGroupIceSugar: "Đá & Đường",
    quickStickerGroupKitchen: "Ghi chú bếp",
    // Printer Usage Guide
    printerGuideTitle: "Hướng dẫn sử dụng chức năng In ấn POS",
    printerGuideSub: "Tìm hiểu chi tiết cơ chế in tự động, quy cách tem nhãn và thao tác in 3 cấp độ",
    btnPrinterGuide: "Hướng dẫn in",
    btnViewPrinterGuide: "Xem hướng dẫn",
    btnCloseGuide: "Đã hiểu",
    printerGuideStripTitle: "Tìm hiểu chế độ in tự động, phối hợp 2 máy in hoặc mẹo in 3 cấp độ?",
    printerGuideModeTitle: "1. Các chế độ in đơn (Auto-print vs. Manual-print)",
    printerGuideModeAutoTitle: "Tự động in sau khi xác nhận",
    printerGuideModeAutoDesc: "Khi khách gửi đơn, hệ thống chỉ phát chuông thông báo. Nhân viên kiểm tra nội dung và xác nhận nhận đơn thành công thì hệ thống mới tự động in 1 hóa đơn thu ngân và toàn bộ tem món. Với đơn do nhân viên tạo, gửi đơn được xem là xác nhận.",
    printerGuideModeManualTitle: "Chế độ In thủ công (Manual-print)",
    printerGuideModeManualDesc: "Khi có đơn mới hệ thống chỉ báo chuông. Nhân viên bấm mở đơn kiểm tra rồi nhấn [IN CẢ ĐƠN] máy mới in. Phù hợp quán cần kiểm tra lại món hoặc xác nhận với khách trước khi làm.",
    printerGuideLevelsTitle: "2. Thao tác in 3 cấp độ trong chi tiết đơn hàng",
    printerGuideLevelFullTitle: "IN CẢ ĐƠN (1 Receipt + N Label)",
    printerGuideLevelFullDesc: "1 chạm xuất đầy đủ: 1 Receipt thu ngân cho khách + N Label nhãn cho quầy bar/bếp (mỗi ly/phần ăn 1 label dán riêng).",
    printerGuideLevelBillTitle: "IN RECEIPT THU NGÂN",
    printerGuideLevelBillDesc: "Chỉ in 1 phiếu Receipt tính tiền, dùng khi thanh toán, kẹp hoá đơn bàn giao cho khách hoặc lưu sổ sách.",
    printerGuideLevelSingleTitle: "In Label từng món",
    printerGuideLevelSingleDesc: "Mỗi dòng món ăn có nút [In label món] cho phép in lại đúng món đó khi rách label hoặc kẹt giấy, thao tác nhanh gọn tại quầy.",
    printerGuideLevelCustomTitle: "IN LABEL TÙY CHỌN (Label chữa cháy)",
    printerGuideLevelCustomDesc: "Bấm mở popup để chạm nhanh các tùy biến (Không hành, Ít đá, Cay vừa...) hoặc nhập chữ tự do để xả ngay 1 label ghi chú dán chữa cháy lên ly/hộp.",
    printerGuideHardwareTitle: "3. Cấu hình khuyến nghị cho mô hình 2 máy in (Dual-Station)",
    printerGuideAlignTitle: "4. Vị trí in và cắt giấy",
    printerGuideAlignBillHeading: "RECEIPT · HÓA ĐƠN NHIỆT",
    printerGuideAlignLabelHeading: "LABEL · NHÃN DÁN",
    printerGuideAlignReceipt: "Receipt: chọn ESC/POS và đúng khổ giấy (58/80 mm). Hệ thống in hết nội dung rồi đẩy giấy trước khi cắt. X/Y dùng để căn vị trí label, không sửa lỗi cắt receipt. Sau khi cập nhật ứng dụng Android, in thử hai receipt liên tiếp và kiểm tra đủ tổng tiền, lời cảm ơn.",
    printerGuideAlignLabel: "Label: chọn đúng kích thước và DPI trước khi chỉnh X/Y (mm). Tăng X để dịch phải, tăng Y để dịch xuống; hiện giá trị âm được xử lý như 0. Chỉnh từng 0,5–1 mm rồi in thử; dịch quá nhiều có thể vượt mép giấy. Nếu đã in đúng vị trí, giữ 0.",
    printerGuideAlignReceiptCaption: "Receipt: nội dung → khoảng trống → đường cắt",
    printerGuideAlignLabelCaption: "Label: X sang phải, Y xuống dưới",
    printerGuideHwCashier: "• Máy in thu ngân: Dùng máy in hoá đơn nhiệt ESC/POS (khổ 80mm hoặc 58mm), kết nối mạng Wi-Fi LAN (Port 9100) hoặc Bluetooth.",
    printerGuideHwKitchen: "• Máy in bếp/pha chế: Dùng máy in Label nhãn TSPL (như Aimo, Xprinter khổ 40x30mm hoặc 50x30mm), chọn chế độ in \"Đơn từng món/ly\".",
    printerGuideHwTest: "• Đầu mỗi ca bán hàng, nên bấm nút \"Kiểm tra in (Test Print)\" để đảm bảo kết nối thông suốt.",
    // Multi-Round Append Orders
    badgeAppendRound: "Đợt {n}",
    badgeAppendShort: "Gọi thêm",
    roundBlockTitle: "Đợt {n}",
    roundBlockLatest: "Mới gọi thêm",
    roundBlockInitial: "Đợt 1 (Đơn ban đầu)",
    alertNewAppended: "🔔 Bàn {table} (Đơn #{key}) vừa gọi thêm món mới!",
    // Store Pairing & Activation (Universal Multi-Tenant POS)
    tocStorePairing: "Điểm bán & Thiết bị",
    settingPairingTitle: "Điểm Bán & Thiết Bị POS",
    settingPairingSub: "Quản lý kết nối giữa máy tính bảng này và điểm bán trên hệ thống đám mây",
    pairingTenantLabel: "Mã điểm bán hiện tại",
    pairingStatusLabel: "Trạng thái kết nối",
    pairingStatusConnected: "Đã kết nối và hoạt động",
    pinChangeTitle: "Đổi mã PIN quản lý",
    pinChangeDescription: "Mã PIN dùng chung cho điểm bán. Sau khi đổi, nhân viên cần đăng nhập lại.",
    pinCurrent: "PIN hiện tại",
    pinNew: "PIN mới",
    pinConfirm: "Xác nhận PIN mới",
    pinFormatHint: "Nhập 4–8 chữ số, có thể bắt đầu bằng số 0.",
    pinShow: "Hiện",
    pinHide: "Ẩn",
    pinChange: "Đổi PIN",
    pinClear: "Xóa nội dung",
    pinSaving: "Đang lưu…",
    pinRequired: "Vui lòng nhập trường này.",
    pinInvalidFormat: "PIN mới phải gồm 4–8 chữ số.",
    pinMismatch: "Hai mã PIN mới chưa trùng khớp.",
    pinWrongCurrent: "PIN hiện tại không đúng. Vui lòng nhập lại.",
    pinSaveError: "Chưa lưu được mã PIN. Vui lòng thử lại sau.",
    pinNetworkError: "Không xác nhận được kết quả đổi PIN. Vui lòng kiểm tra kết nối và thử đăng nhập bằng PIN mới.",
    pinTenantRequired: "Vui lòng liên kết với điểm bán hợp lệ trước khi đổi PIN.",
    pinChangeSuccess: "Đã đổi mã PIN. Nhân viên cần đăng nhập lại bằng PIN mới.",
    pinPaymentContext: "Đang thiết lập PIN để quản lý thanh toán. Sau khi lưu, bạn sẽ quay lại Thanh toán để xác thực bằng PIN mới.",
    pinPaymentDefaultNotAllowed: "Hãy chọn PIN khác mã mặc định để sử dụng quản lý thanh toán.",
    pinBackToPayments: "Quay lại Thanh toán",
    unlinkTitle: "Hủy ghép đôi thiết bị / Đổi điểm bán",
    unlinkDesc: "Sau khi hủy, thiết bị sẽ ngừng đồng bộ đơn của quán này. Cần nhập mã PIN quản lý để xác nhận.",
    btnUnlinkStore: "Đổi Quán / Hủy Ghép Đôi",
    modalActivationTitle: "Kích Hoạt Điểm Bán",
    modalActivationSub: "Vui lòng nhập Mã Quán (Tenant ID) và Mã PIN Quản Lý để liên kết thiết bị POS",
    activationTenantLabel: "Mã Điểm Bán (Tenant ID)",
    activationTenantPlaceholder: "Ví dụ: bsc, benmi...",
    activationPinLabel: "Mã PIN Quản Lý",
    activationPinPlaceholder: "Mặc định 12345678",
    btnSubmitActivation: "Kích Hoạt Điểm Bán & Bắt Đầu",
    btnVerifying: "Đang xác thực...",
    activationErrorInvalid: "Mã quán hoặc mã PIN quản lý không chính xác. Vui lòng kiểm tra lại.",
    activationErrorTenantNotFound: "Mã điểm bán không tồn tại hoặc đã ngưng hoạt động. Vui lòng kiểm tra lại.",
    activationErrorWrongPin: "Mã PIN quản lý không chính xác. Vui lòng kiểm tra lại.",
    activationErrorRequired: "Vui lòng nhập đầy đủ mã quán và mã PIN quản lý.",
    activationErrorNetwork: "Kết nối xác thực thất bại. Vui lòng kiểm tra lại đường truyền mạng.",
    promptUnlinkPin: "Vui lòng nhập mã PIN quản lý của quán để hủy ghép đôi:",
    unlinkSuccess: "Đã hủy ghép đôi thiết bị thành công! Đang chuyển về màn hình kích hoạt.",
    unlinkWrongPin: "Mã PIN quản lý không đúng. Không thể hủy ghép đôi.",
    unpaired: "Chưa liên kết",
    btnSetBundle: "Cấu hình Combo",
    btnEditBundle: "Sửa Combo",
    bundleBadge: "Combo",
    bundleGroupUnit: "nhóm",
    modalBundleTitle: "Thiết Lập Combo Món Ăn",
    modalBundleSub: "Cấu hình các nhóm món tự chọn, nguồn món và quy tắc số lượng cho combo này",
    comboCreateTitle: "Tạo combo", comboEditTitle: "Sửa combo", comboClose: "Đóng", comboBack: "Quay lại", comboContinue: "Tiếp tục", comboSave: "Lưu combo",
    comboStepsLabel: "Các bước tạo combo",
    comboWhatTitle: "Combo là gì?",
    comboWhatBody: "Combo là một suất gồm nhiều món, được bán dưới một tên và giá cơ bản chung. Bạn có thể chọn sẵn món, cho khách tự chọn, hoặc kết hợp cả hai. Ví dụ: có sẵn một món ăn kèm, khách chọn thêm món chính và nước.",
    comboPriceHelp: "Giá khách trả = giá combo + phụ thu món được chọn + tùy chỉnh có phí. Giá bán lẻ của món con không cộng thêm; món đã gồm trong giá có phụ thu bằng 0.",
    comboSetupHelp: "Điền thông tin chung → chọn món và quy tắc ở bước Thành phần → xem thử cách khách chọn rồi lưu.",
    comboPartsTitle: "Một suất combo gồm những gì?",
    comboPartsHelp: "“Món có sẵn” do bạn chọn món và số phần. “Nhóm tự chọn” cho khách chọn đủ số món từ danh sách bạn cho phép. Một combo có thể dùng cả hai loại.",
    comboTemplatesTitle: "Bắt đầu từ một mẫu",
    comboTemplatesHelp: "Mẫu chỉ tạo các nhóm ban đầu, chưa chọn món từ menu. Sau khi dùng mẫu, hãy chọn món, số lượng và phụ thu cho từng nhóm. Bạn cũng có thể tự thêm nhóm ở bên dưới.",
    comboTemplateMealHelp: "Tạo hai nhóm tự chọn: khách chọn 1 món chính và 1 nước.",
    comboTemplateMealExample: "Ví dụ: cơm hoặc mì + trà hoặc nước ép",
    comboTemplateManyHelp: "Tạo một nhóm tự chọn, mặc định chọn 2 món khác nhau. Bạn có thể đổi số lượng sau.",
    comboTemplateManyExample: "Ví dụ: chọn 2 trong 5 món ăn kèm",
    comboTemplateFixedHelp: "Tạo nhóm món có sẵn. Bạn chọn món và số phần; khách không phải chọn lại.",
    comboTemplateFixedExample: "Ví dụ: có sẵn 1 phần cơm + 1 phần canh",
    comboUseTemplate: "Dùng mẫu này",
    comboChangeTemplate: "Xem mẫu / đổi cấu trúc nhóm",
    comboReplaceTemplate: "Dùng mẫu mới sẽ thay toàn bộ nhóm và món đang chọn. Tên và giá combo được giữ nguyên. Tiếp tục?",
    comboFixedHelp: "Đánh dấu món luôn có trong suất và nhập số phần. Khách vẫn được chỉnh các tùy chọn mà món đó cho phép.",
    comboChoiceHelp: "Nhập số món khách cần chọn, rồi đánh dấu các món được phép chọn. Phụ thu 0 nghĩa là đã gồm trong giá combo.",
    comboStepInfo: "Thông tin", comboStepParts: "Thành phần", comboStepPreview: "Xem trước và lưu",
    comboStepInfoSub: "Thiết lập tên, giá & danh mục",
    comboStepPartsSub: "Cấu hình nhóm & món lựa chọn",
    comboStepPreviewSub: "Kiểm tra hiển thị & lưu combo",
    comboStepCompleted: "Hoàn thành",
    comboStepCurrent: "Đang làm",
    comboStepPending: "Chờ thiết lập",
    comboProductName: "Tên combo", comboBasePrice: "Giá combo", comboCategory: "Danh mục hiển thị",
    comboImage: "Quản lý ảnh", comboImageAfterSave: "Có thể thêm ảnh sau khi lưu combo.", comboTemplateMeal: "Món chính + nước", comboTemplateMany: "Chọn N món", comboTemplateFixed: "Combo cố định",
    comboFixedGroup: "Món có sẵn", comboChoiceGroup: "Khách tự chọn", comboRemove: "Xóa", comboGroupName: "Tên nhóm", comboQuantity: "Số lượng", comboRepeat: "Cho chọn trùng món",
    comboSearch: "Tìm món", comboFilterCategory: "Lọc danh mục", comboAllCategories: "Tất cả danh mục", comboSurcharge: "Phụ thu", comboWholeCategory: "Nâng cao: chọn cả danh mục", comboWholeCategoryHelp: "Món mới trong danh mục này sẽ tự được đưa vào combo.",
    comboAddChoice: "Thêm nhóm tự chọn", comboAddFixed: "Thêm món có sẵn", comboRestoreDraft: "Có bản nháp combo chưa hoàn tất. Tiếp tục chỉnh sửa?", comboLeaveDraft: "Đóng trình tạo? Bản nháp sẽ được giữ để chỉnh tiếp.",
    comboNeedName: "Nhập tên combo.", comboNeedPrice: "Nhập giá hợp lệ.", comboNeedGroup: "Thêm ít nhất một nhóm.", comboNeedGroupName: "Nhập tên nhóm.", comboNeedItems: "Chưa đủ món hợp lệ hoặc món đã bị xóa.", comboSaveFailed: "Không thể lưu combo.", comboSaved: "Đã lưu combo.",
    comboEmptyGroupsTitle: "Chưa có nhóm nào trong combo",
    comboEmptyGroupsHelp: "Chọn nút bên dưới để thêm nhóm tự chọn (cho khách chọn món) hoặc món có sẵn (luôn có trong combo).",
    comboIncluded: "Đã gồm trong giá combo", comboSelect: "Chọn", comboPreviewComplete: "Đã hoàn thành mọi nhóm", comboPreviewIncomplete: "Hãy chọn đủ các nhóm",
    bundleGroupListTitle: "Danh sách nhóm chọn",
    btnAddBundleGroup: "Thêm nhóm chọn mới",
    btnRemoveBundleConfig: "Gỡ bỏ Combo (chuyển về món thường)",
    confirmRemoveBundleConfig: "Bạn có chắc muốn gỡ bỏ cấu hình Combo cho món này? Món sẽ trở thành món đơn bán lẻ thông thường (toàn bộ quy tắc chọn nhóm sẽ bị xóa).",
    bundleDangerZoneTitle: "Chuyển đổi loại món",
    bundleDangerZoneDesc: "Món này hiện đang được thiết lập là món Combo tự chọn. Nếu muốn bán như một món đơn lẻ bình thường (không yêu cầu khách chọn nhóm món), bạn có thể gỡ bỏ cấu hình combo tại đây.",
    bundleGroupDetailTitle: "Chi tiết nhóm chọn",
    bundleGroupName: "Tên nhóm chọn",
    bundleGroupNameZh: "Tên nhóm (Tiếng Trung)",
    bundleGroupNameVi: "Tên nhóm (Tiếng Việt)",
    bundleGroupNamePlaceholder: "Ví dụ: Chọn 6 món ăn kèm",
    bundleQuantityRule: "Số lượng món yêu cầu",
    bundleQuantityExact: "Bắt buộc chọn đúng",
    bundleAllowRepeat: "Cho phép chọn trùng món cùng loại",
    bundleAllowRepeatDesc: "Khách có thể chọn nhiều phần cùng 1 món (ví dụ: 2 phần bắp ngô)",
    bundleSourceType: "Nguồn món ăn được phép chọn",
    bundleSourceCategory: "Theo toàn bộ danh mục (tự động gồm các món trong danh mục)",
    bundleSourceCategoryDesc: "Món mới thêm vào danh mục sau này sẽ tự động có trong combo",
    bundleSourceItems: "Chọn lọc từng món cụ thể",
    bundleSelectCategories: "Chọn các danh mục áp dụng",
    bundleSelectItems: "Chọn các món áp dụng",
    bundleEligiblePreview: "Tổng số món khả dụng trong nhóm này",
    bundleSaveSuccess: "Đã lưu cấu hình Combo thành công!",
    bundleSaveFail: "Lưu cấu hình Combo thất bại: ",
    bundleValidationEmptyGroups: "Vui lòng thêm ít nhất 1 nhóm chọn!",
    bundleValidationEmptyName: "Tên nhóm không được để trống!",
    bundleValidationEmptySources: "Vui lòng chọn ít nhất một danh mục hoặc món ăn làm nguồn!",
    bundleDefaultGroupName: "Món tự chọn",
    bundleItemUnit: "món",
    bundleSurchargeNotice: "Đã bao gồm trong giá combo",
    btnBundleSave: "Lưu cấu hình",
    btnBundleCancel: "Đóng",
    bundleTipTitle: "Mẹo thiết lập",
    bundleTipDesc: "Khách hàng phải hoàn tất đủ số lượng món trong từng nhóm mới có thể thêm vào giỏ hàng.",
    btnBundleGuide: "Hướng dẫn & Ví dụ Combo",
    btnBundleSidebarGuide: "Xem Combo là gì & Ví dụ mẫu",
    bundleGuideModalTitle: "Hướng Dẫn Thiết Lập Combo Món Ăn",
    bundleGuideModalSub: "Tìm hiểu khái niệm Combo, cách cấu hình theo bước và các mô hình quán thực tế",
    bundleGuideWhatTag: "Khái niệm",
    bundleGuideWhatTitle: "1. Combo Món Ăn là gì?",
    bundleGuideWhatDesc: "Combo (hay Set menu / Bundle) là gói gồm nhiều món thành phần được bán cùng nhau với mức giá trọn gói. Khách khi gọi món trên điện thoại (LINE LIFF) hoặc nhân viên gọi tại POS sẽ được chọn các món theo từng nhóm quy định (ví dụ: chọn món chính, chọn món ăn kèm, chọn đồ uống). Khách phải chọn đủ số lượng yêu cầu mới có thể thêm vào giỏ hàng.",
    bundleGuideStepsTag: "Quy trình",
    bundleGuideStepsTitle: "2. Cách Tạo Combo Trong 3 Bước",
    bundleGuideStep1Tag: "BƯỚC 1",
    bundleGuideStep1Title: "Thêm Nhóm Chọn",
    bundleGuideStep1Desc: "Nhấn '+ Thêm nhóm chọn mới' ở cột trái. Nhập tên nhóm bằng tiếng Trung và tiếng Việt (VD: Chọn 1 Món chính, Chọn 6 Món ăn kèm).",
    bundleGuideStep2Tag: "BƯỚC 2",
    bundleGuideStep2Title: "Quy Tắc Số Lượng",
    bundleGuideStep2Desc: "Dùng nút [ - ] và [ + ] chỉnh số lượng món khách bắt buộc phải chọn. Bật 'Cho phép chọn trùng' nếu khách được lấy nhiều suất cùng 1 món (VD: 2 phần bắp ngô).",
    bundleGuideStep3Tag: "BƯỚC 3",
    bundleGuideStep3Title: "Nguồn Món Tự Chọn",
    bundleGuideStep3Desc: "Chọn 'Theo toàn bộ danh mục' (như Rau củ, Nước uống) hoặc 'Chọn lọc từng món cụ thể' để chỉ định chính xác các món được chọn trong nhóm.",
    bundleGuideExamplesTag: "Ví dụ mẫu",
    bundleGuideExamplesTitle: "3. Ví Dụ Cấu Hình Thực Tế (Example Use Cases)",
    bundleEx1Title: "🍗 Mô hình Quán Gà / Đồ Ăn Vặt (VD: Gà Muối Tiêu 蔣姐姐)",
    bundleEx1Badge: "1 Nhóm • 6 Món kèm",
    bundleEx1Desc: "<strong>Món:</strong> 套餐 A (3隻鹹水雞翅+6樣菜) - $150<br><strong>Cấu hình:</strong> Tạo 1 nhóm chọn duy nhất: 'Chọn 6 món ăn kèm'. Cài đặt số lượng = 6, <strong>BẬT</strong> 'Cho phép chọn trùng'. Nguồn món: Chọn danh mục 'Hải sản', 'Rau củ', 'Nội tạng', 'Đồ kho'.",
    bundleEx2Title: "🥖 Mô hình Bánh Mì / Cà Phê / Ăn Sáng",
    bundleEx2Badge: "2 Nhóm • Món chính + Nước",
    bundleEx2Desc: "<strong>Món:</strong> Combo Bữa Sáng Năng Lượng - $99<br><strong>Cấu hình:</strong><br>• Nhóm 1: 'Chọn 1 Bánh Mì' (Số lượng = 1, Nguồn: Toàn bộ danh mục Bánh mì)<br>• Nhóm 2: 'Chọn 1 Đồ Uống' (Số lượng = 1, Nguồn: Toàn bộ danh mục Cà phê & Trà)",
    bundleEx3Title: "🍲 Mô hình Quán Lẩu / Nướng / Cơm Gia Đình",
    bundleEx3Badge: "3 Nhóm • Nước lẩu + Thịt + Tinh bột",
    bundleEx3Desc: "<strong>Món:</strong> Set Lẩu Uyên Ương 2 Người - $450<br><strong>Cấu hình:</strong><br>• Nhóm 1: 'Chọn 1 Vị Nước Lẩu' (Số lượng = 1, Nguồn: Lẩu Thái, Lẩu Nấm, Lẩu Kim chi)<br>• Nhóm 2: 'Chọn 2 Đĩa Thịt' (Số lượng = 2, Cho phép chọn trùng: BẬT, Nguồn: Ba chỉ bò, Đùi gà, Bắp hoa)<br>• Nhóm 3: 'Chọn 2 Món Ăn Kèm / Tinh Bột' (Số lượng = 2, Nguồn: Mì tôm, Miến dong, Rau tổng hợp)",
    btnBundleGuideGotIt: "Đã hiểu",
    // Item Detail Hub Modal (#itemDetailModal)
    btnItemSettings: "Cài đặt",
    itemDetailTitle: "Thiết lập món",
    itemDetailTitleNamed: "Thiết lập món: {name}",
    itemCreateTitle: "Thêm món mới",
    itemNameLabel: "Tên món ăn / đồ uống",
    itemPriceLabel: "Giá bán (NT$)",
    itemNamePlaceholder: "Ví dụ: Phở bò đặc biệt, Trà sữa trân châu",
    btnItemCreate: "Tạo món",
    btnItemCancel: "Hủy",
    enterItemName: "Vui lòng nhập tên món",
    enterItemNameFirst: "Vui lòng nhập tên món trước",
    itemPhotoTitle: "Ảnh minh họa món",
    btnUploadPhoto: "Tải ảnh lên / Thay đổi",
    btnRemovePhoto: "Xóa ảnh",
    itemBadgeTitle: "Nhãn hiển thị món",
    itemBadgePlaceholder: "Ví dụ: Bán chạy, Đặc sản",
    itemRecommendedLabel: "Đánh dấu là món nổi bật (Khuyên dùng)",
    itemAdvancedTitle: "Thiết lập nâng cao",
    cardModifiersTitle: "Tuỳ chọn riêng cho món",
    cardModifiersEmpty: "Chưa thiết lập tuỳ chọn riêng",
    cardModifiersCount: "Đang áp dụng {count} nhóm tuỳ chọn",
    cardBundleTitle: "Cấu hình combo / suất ăn",
    cardBundleEmpty: "Món tiêu chuẩn (Không phải combo)",
    cardBundleCount: "Combo {count} nhóm lựa chọn",
    btnDetailDone: "Hoàn tất",
    quickTagHot: "Bán chạy",
    quickTagRecommend: "Khuyên dùng",
    quickTagNew: "Món mới",
    quickTagSpicy: "Cay",
    promptStaffPin: "Nhập mã PIN cửa hàng:",
    staffLoading: "Đang tải…",
    staffNeedsPin: "Vui lòng xác thực mã PIN.",
    staffRetry: "Thử lại",
    staffNoTables: "Chưa có bàn. Hãy thêm bàn mới.",
    staffNetworkError: "Không thể kết nối. Vui lòng thử lại.",
    staffStatusConflict: "Đơn đã thay đổi. Vui lòng kiểm tra lại trước khi thao tác.",
    staffFeatureClosed: "Chưa bật nhận đơn tại bàn",
    staffFeatureClosedHelp: "Cửa hàng chưa được bật quyền nhận đơn tại bàn.",
    staffOrderSubmittedToast: "Bàn đã gửi đơn thành công! #{key}",
    staffTakeawayOrderSubmittedToast: "Đơn mang đi đã gửi thành công! #{key}",
    staffContact: "Liên hệ hỗ trợ",
    tableDisable: "Ngừng dùng",
    tableEnable: "Kích hoạt",
    tableEditorAddTitle: "Thêm bàn",
    tableEditorEditTitle: "Sửa bàn",
    btnStaffOrder: "Nhận đơn tại bàn",
    btnStaffOrderDesc: "Mở trang nhận đơn chuyên biệt",
    tabTables: "Quản lý bàn",
    tabTablesSub: "Quản lý danh sách bàn, thứ tự và trạng thái sử dụng",
    tableAddBtn: "Thêm bàn mới",
    tableName: "Tên bàn",
    tableNamePlaceholder: "Ví dụ: Bàn 01, Tầng 1...",
    tableSort: "Thứ tự",
    tableSortPlaceholder: "Số nhỏ hiển thị trước",
    tableStatus: "Trạng thái",
    tableStatusActive: "Đang sử dụng",
    tableStatusDisabled: "Ngừng sử dụng",
    tableAction: "Thao tác",
    tableEdit: "Sửa",
    tableSave: "Lưu",
    tableCancel: "Hủy",
    tableOccupied: "Có khách",
    tableEmpty: "Bàn trống",
    tableHasActiveOrder: "Bàn đang có đơn chưa thanh toán, không thể sửa hoặc ngừng sử dụng",
    tableNoWritePermission: "Bạn không có quyền chỉnh sửa bàn.",
    tableDisableOccupied: "Bàn đang có đơn chưa thanh toán, chưa thể ngừng dùng.",
    tableDeleteDisabledHint: "Hệ thống lưu giữ bàn để bảo toàn lịch sử báo cáo, chỉ hỗ trợ ngừng sử dụng",
    tableConfirmDisable: "Bạn có chắc chắn muốn ngừng sử dụng bàn này?",
    tableSaveSuccess: "Lưu thông tin bàn thành công",
    tableSaveFail: "Lưu thông tin bàn thất bại, vui lòng thử lại",
    tableQrBtn: "Mã QR",
    tableQrTitle: "Mã QR cho bàn",
    tableQrInstruction: "Quét mã QR để đặt món",
    tableQrSubInstruction: "Quét mã QR phía trên để mở thực đơn và đặt món tại bàn",
    tableQrDineInBadge: "Bàn ăn",
    tableQrCopyLink: "Sao chép link",
    tableQrCopied: "Đã sao chép liên kết vào bộ nhớ tạm",
    tableQrDownloadPng: "Tải ảnh PNG",
    tableQrPrintPos: "In tem POS",
    tableQrPrintA4: "In trang A4",
    tableQrPrintAllA4: "In tất cả QR (A4)",
    tableBatchAddBtn: "Tạo nhanh nhiều bàn",
    tableBatchAddTitle: "Tạo nhanh nhiều bàn",
    tableBatchPrefix: "Tiền tố tên bàn (Không bắt buộc)",
    tableBatchPrefixPlaceholder: "Ví dụ: Bàn  hoặc A-",
    tableBatchStart: "Từ số",
    tableBatchEnd: "Đến số",
    tableBatchSort: "Thứ tự bắt đầu",
    tableBatchCreating: "Đang tạo bàn...",
    tableBatchSuccess: "Đã tạo {count} bàn thành công",
    tableBatchFail: "Tạo dải bàn thất bại, vui lòng thử lại",
    tableEmptyList: "Chưa có bàn nào trong danh sách",
    tableEmptyListSub: "Bấm \"Thêm bàn mới\" hoặc \"Tạo nhanh nhiều bàn\" để bắt đầu",
    tableHistoryNotice: "Lưu ý: Để đảm bảo tính toàn vẹn của lịch sử và báo cáo doanh thu, bàn đã từng sử dụng chỉ có thể ngừng dùng, không được xoá vĩnh viễn.",
    tableNoPrinterConfigured: "Chưa cấu hình máy in, vui lòng thiết lập trong mục Xuất đơn & Máy in",
    tablePrinting: "Đang gửi lệnh in tới máy in...",
    tablePrintSuccess: "Đã gửi lệnh in thành công",
    tablePrintFail: "Lệnh in thất bại, vui lòng kiểm tra kết nối máy in",
  }
};

var currentLang = "zh-TW";
try { currentLang = localStorage.getItem("benmi_lang") || "zh-TW"; } catch (e) {}
window.currentLang = currentLang;

function t(key, params = {}) {
  const lang = window.currentLang || currentLang || "zh-TW";
  let str = (I18N[lang] && I18N[lang][key]) || (I18N["zh-TW"] && I18N["zh-TW"][key]) || key;
  Object.keys(params).forEach(p => {
    str = str.replace(new RegExp(`\\{${p}\\}`, 'g'), params[p]);
  });
  return str;
}

function toggleLangDropdown(e) {
  if (e) e.stopPropagation();
  const dd = document.getElementById("lang-dropdown");
  if (dd) dd.classList.toggle("open");
}

function selectLanguage(lang) {
  setLanguage(lang);
  const dd = document.getElementById("lang-dropdown");
  if (dd) dd.classList.remove("open");
}

// Click outside to close dropdown
document.addEventListener("click", (e) => {
  const dd = document.getElementById("lang-dropdown");
  if (dd && !dd.contains(e.target)) {
    dd.classList.remove("open");
  }
});

function setLanguage(lang) {
  currentLang = lang;
  window.currentLang = lang;
  try { localStorage.setItem("benmi_lang", lang); } catch (e) {}
  applyLanguageToDOM();
  if (typeof updatePrintActionAvailability === "function") updatePrintActionAvailability();
  if (typeof renderAll === "function") renderAll();
  if (typeof activeTab !== "undefined") {
    if (activeTab === "settings") {
      if (typeof renderOperatingHours === "function") renderOperatingHours();
      if (typeof renderScheduledPickupSetting === "function") renderScheduledPickupSetting();
      if (typeof renderDineInSetting === "function") renderDineInSetting();
    } else if (activeTab === "menu") {
      if (typeof renderMenuCategories === "function") renderMenuCategories();
      if (typeof renderMenuCategoryEditor === "function" && typeof activeCategoryIndex !== "undefined" && activeCategoryIndex >= 0) {
        renderMenuCategoryEditor(activeCategoryIndex);
      }
      if (typeof updateMenuSaveState === "function") updateMenuSaveState();
      if (typeof renderItemModifiersEditor === "function" && document.getElementById("itemModifiersModal")?.style.display === "flex") {
        renderItemModifiersEditor();
      }
      if (typeof renderBundleGroupConfigPanel === "function" && document.getElementById("modal-bundle-editor")?.style.display !== "none") {
        renderBundleGroupConfigPanel();
      }
    }
  }
}

function applyLanguageToDOM() {
  const dict = I18N[currentLang];
  if (!dict) return;
  document.querySelectorAll("[data-pos-display-i18n]").forEach(node => {
    node.textContent = dict[node.dataset.posDisplayI18n];
  });

  // Topbar
  const labelMap = { "zh-TW": "繁體中文", "vi": "Tiếng Việt" };
  const currentLabel = document.getElementById("current-lang-label");
  if (currentLabel) currentLabel.innerText = labelMap[currentLang] || currentLang;

  document.querySelectorAll(".lang-dropdown-item").forEach(item => {
    item.classList.toggle("active", item.dataset.lang === currentLang);
  });

  const brandSub = document.getElementById("i18n-brand-sub");
  if (brandSub) brandSub.innerText = dict.brandSub;

  const labelLive = document.getElementById("i18n-tab-live");
  if (labelLive) {
    labelLive.innerText = dict.sidebarLive || dict.tabLive || "即時訂單";
  } else {
    const tabLive = document.getElementById("tab-live");
    if (tabLive) tabLive.innerText = dict.tabLive;
  }

  const labelHistory = document.getElementById("i18n-tab-history");
  if (labelHistory) {
    labelHistory.innerText = dict.sidebarHistory || dict.tabHistory || "歷史訂單";
  } else {
    const tabHistory = document.getElementById("tab-history");
    if (tabHistory) tabHistory.innerText = dict.tabHistory;
  }

  const labelReports = document.getElementById("i18n-tab-reports");
  if (labelReports) {
    labelReports.innerText = dict.tabReports;
  } else {
    const tabReports = document.getElementById("tab-reports");
    if (tabReports) tabReports.innerText = dict.tabReports;
  }

  const tabSound = document.getElementById("tab-sound");
  if (tabSound) tabSound.innerText = dict.tabSound;

  const labelMenu = document.getElementById("i18n-tab-menu");
  if (labelMenu) {
    labelMenu.innerText = dict.sidebarMenu || dict.tabMenu || "菜單管理";
  } else {
    const tabMenu = document.getElementById("tab-menu");
    if (tabMenu) tabMenu.innerText = dict.tabMenu;
  }

  const labelStaffOrder = document.getElementById("i18n-tab-staff-order");
  if (labelStaffOrder) {
    labelStaffOrder.innerText = dict.tabStaffOrder || (currentLang === "vi" ? "Nhận đơn tại bàn" : "桌邊點餐");
  }

  const labelPrinter = document.getElementById("i18n-tab-printer");
  if (labelPrinter) {
    labelPrinter.innerText = dict.sidebarPrinter || dict.tabPrinter || "出單印表機";
  } else {
    const tabPrinter = document.getElementById("tab-printer-quick");
    if (tabPrinter) tabPrinter.innerText = dict.tabPrinter;
  }

  const labelSettings = document.getElementById("i18n-tab-settings");
  if (labelSettings) {
    labelSettings.innerText = dict.sidebarSettings || dict.tabSettings || "系統設定";
  } else {
    const tabSettings = document.getElementById("tab-settings");
    if (tabSettings) tabSettings.innerText = dict.tabSettings;
  }

  const labelSupport = document.getElementById("i18n-tab-support");
  if (labelSupport) {
    labelSupport.innerText = dict.sidebarSupport || "技術支援";
  }

  const mobileSub = document.getElementById("sidebar-mobile-sub");
  if (mobileSub && typeof currentStoreStatus !== "undefined") {
    if (currentStoreStatus === 'open') mobileSub.innerText = dict.statusOpen || "營業中";
    else if (currentStoreStatus === 'busy') mobileSub.innerText = dict.statusBusy || "忙碌中";
    else if (currentStoreStatus === 'paused') mobileSub.innerText = dict.statusPaused || "暫停接單";
    else if (currentStoreStatus === 'closed') mobileSub.innerText = dict.statusPaused;
  }

  if (typeof updateSidebarToggleIcon === "function") {
    const sidebar = document.getElementById("app-sidebar");
    updateSidebarToggleIcon(sidebar ? sidebar.classList.contains("expanded") : false);
  }

  if (typeof updatePageMainTitle === "function" && typeof activeTab !== "undefined") {
    updatePageMainTitle(activeTab);
  }

  // View Reports Elements
  const repTitle = document.getElementById("i18n-reports-title");
  if (repTitle) repTitle.innerText = dict.reportsTitle;
  const repSub = document.getElementById("i18n-reports-sub");
  if (repSub) repSub.innerText = dict.reportsSub;
  const rngToday = document.getElementById("i18n-range-today");
  if (rngToday) rngToday.innerText = dict.rangeToday;
  const rng7d = document.getElementById("i18n-range-7d");
  if (rng7d) rng7d.innerText = dict.range7d;
  const rng30d = document.getElementById("i18n-range-30d");
  if (rng30d) rng30d.innerText = dict.range30d;
  const kpiTopItem = document.getElementById("i18n-kpi-top-item");
  if (kpiTopItem) kpiTopItem.innerText = dict.kpiTopItem;
  const kpiTotalSold = document.getElementById("i18n-kpi-total-sold");
  if (kpiTotalSold) kpiTotalSold.innerText = dict.kpiTotalSold;
  const kpiTotalRev = document.getElementById("i18n-kpi-total-revenue");
  if (kpiTotalRev) kpiTotalRev.innerText = dict.kpiTotalRevenue;
  const kpiTotalOrders = document.getElementById("i18n-kpi-total-orders");
  if (kpiTotalOrders) kpiTotalOrders.innerText = dict.kpiTotalOrders;
  const revSub = document.getElementById("i18n-revenue-sub");
  if (revSub) revSub.innerText = dict.revenueSub;
  const compOrdersSub = document.getElementById("i18n-completed-orders-sub");
  if (compOrdersSub) compOrdersSub.innerText = dict.completedOrdersSub;
  const repTblTitle = document.getElementById("i18n-table-title");
  if (repTblTitle) repTblTitle.innerText = dict.tableTitle;

  // View Live Headers
  const leftTitle = document.getElementById("i18n-left-title");
  if (leftTitle) leftTitle.innerText = dict.panelLeftTitle;
  const leftSub = document.getElementById("i18n-left-sub");
  if (leftSub) leftSub.innerText = dict.panelLeftSub;
  const rightTitle = document.getElementById("i18n-right-title");
  if (rightTitle) rightTitle.innerText = dict.panelRightTitle;
  const rightSub = document.getElementById("i18n-right-sub");
  if (rightSub) rightSub.innerText = dict.panelRightSub;

  const mobilePendingTitle = document.getElementById("i18n-live-mobile-pending");
  if (mobilePendingTitle) mobilePendingTitle.innerText = dict.panelLeftTitle;
  const mobileReadyTitle = document.getElementById("i18n-live-mobile-ready");
  if (mobileReadyTitle) mobileReadyTitle.innerText = dict.panelRightTitle;
  const mobileLiveTabs = document.getElementById("live-mobile-tabs");
  if (mobileLiveTabs) mobileLiveTabs.setAttribute("aria-label", dict.liveMobileTabsLabel);

  const fAll = document.getElementById("i18n-filter-all");
  if (fAll) fAll.innerText = dict.filterAll || "全部";
  const fTakeaway = document.getElementById("i18n-filter-takeaway");
  if (fTakeaway) fTakeaway.innerText = dict.filterTakeaway || "外帶";
  const fDinein = document.getElementById("i18n-filter-dinein");
  if (fDinein) fDinein.innerText = dict.filterDineIn || "內用";

  // View History Headers & Search
  const histTitle = document.getElementById("i18n-history-title");
  if (histTitle) histTitle.innerText = dict.historyTitle;
  const histSub = document.getElementById("i18n-history-sub");
  if (histSub) histSub.innerText = dict.historySub;
  const histSearch = document.getElementById("history-search-input");
  if (histSearch) histSearch.placeholder = dict.historySearchPlaceholder || "搜尋訂單編號 / 顧客姓名 / 桌號...";
  const histFAll = document.getElementById("i18n-hist-filter-all");
  if (histFAll) histFAll.innerText = dict.historyFilterAll || "全部";
  const histFDine = document.getElementById("i18n-hist-filter-dinein");
  if (histFDine) histFDine.innerText = dict.historyFilterDineIn || "內用";
  const histFTake = document.getElementById("i18n-hist-filter-takeaway");
  if (histFTake) histFTake.innerText = dict.historyFilterTakeaway || "外帶";

  // BLAB Support & Contact Modal
  const blabSupportLabels = {
    "i18n-blab-support-channel": "blabSupportChannel",
    "i18n-blab-support-direct-title": "blabSupportDirectTitle",
    "i18n-blab-support-direct-badge": "blabSupportDirectBadge",
    "i18n-blab-support-direct-desc": "blabSupportDirectDesc",
    "i18n-blab-upgrade-tag-dine-in": "blabUpgradeTagDineIn",
    "i18n-blab-upgrade-tag-reports": "blabUpgradeTagReports",
    "i18n-blab-upgrade-tag-history": "blabUpgradeTagHistory"
  };
  Object.entries(blabSupportLabels).forEach(([id, key]) => {
    const node = document.getElementById(id);
    if (node) node.textContent = dict[key];
  });
  const blabSupportClose = document.getElementById("blab-support-close");
  if (blabSupportClose) blabSupportClose.setAttribute("aria-label", dict.btnModalBlabClose);
  const mBlabT = document.getElementById("i18n-modal-blab-title");
  if (mBlabT) mBlabT.innerText = dict.modalBlabTitle;
  const mBlabSub = document.getElementById("i18n-modal-blab-subtitle");
  if (mBlabSub) mBlabSub.innerText = dict.modalBlabSubtitle;
  const mBlabStatus = document.getElementById("i18n-blab-status-online");
  if (mBlabStatus) mBlabStatus.innerText = dict.blabStatusOnline;
  const mBlabDirectSub = document.getElementById("i18n-blab-support-direct-sub");
  if (mBlabDirectSub) mBlabDirectSub.innerText = dict.blabSupportDirectSub;
  const btnMBlabLine = document.getElementById("i18n-btn-modal-blab-line");
  if (btnMBlabLine) btnMBlabLine.innerText = dict.btnModalBlabLine;
  const mBlabUpgT = document.getElementById("i18n-blab-upgrade-title");
  if (mBlabUpgT) mBlabUpgT.innerText = dict.blabUpgradeTitle;
  const mBlabUpgS = document.getElementById("i18n-blab-upgrade-sub");
  if (mBlabUpgS) mBlabUpgS.innerText = dict.blabUpgradeSub;
  const btnMBlabUpg = document.getElementById("i18n-btn-modal-blab-upgrade");
  if (btnMBlabUpg) btnMBlabUpg.innerText = dict.btnModalBlabUpgrade;
  const mBlabHours = document.getElementById("i18n-blab-hours-commitment");
  if (mBlabHours) mBlabHours.innerText = dict.blabHoursCommitment;
  const mBlabD = document.getElementById("i18n-modal-blab-desc");
  if (mBlabD) mBlabD.innerText = dict.modalBlabDesc;
  const blabExpT = document.getElementById("i18n-blab-export-title");
  if (blabExpT) blabExpT.innerText = dict.blabExportTitle;
  const blabExpS = document.getElementById("i18n-blab-export-sub");
  if (blabExpS) blabExpS.innerText = dict.blabExportSub;
  const btnMBlabExp = document.getElementById("i18n-btn-modal-blab-export");
  if (btnMBlabExp) btnMBlabExp.innerText = dict.btnModalBlabExport;
  const btnMBlabCls = document.getElementById("i18n-btn-modal-blab-close");
  if (btnMBlabCls) btnMBlabCls.innerText = dict.btnModalBlabClose;

  // Start Shift Modal
  const startShiftT = document.getElementById("i18n-start-shift-title");
  if (startShiftT) startShiftT.innerText = dict.startShiftTitle;
  const startShiftD = document.getElementById("i18n-start-shift-desc");
  if (startShiftD) startShiftD.innerText = dict.startShiftDesc;
  const startShiftS = document.getElementById("i18n-start-shift-status");
  if (startShiftS && dict.startShiftStatus) startShiftS.innerText = dict.startShiftStatus;
  const btnStartShiftText = document.getElementById("i18n-btn-start-shift-text");
  if (btnStartShiftText) btnStartShiftText.innerText = dict.btnStartShift;

  // Alert modal
  const alertSub = document.getElementById("new-alert-sub");
  if (alertSub) alertSub.innerText = dict.alertSub;
  const btnAlertRev = document.getElementById("btn-alert-review");
  if (btnAlertRev) {
    const spanRev = btnAlertRev.querySelector(".btn-text") || btnAlertRev.querySelector("span");
    if (spanRev) spanRev.innerText = dict.alertBtnReview;
    else btnAlertRev.innerText = dict.alertBtnReview;
  }
  const btnAlertDis = document.getElementById("btn-alert-dismiss");
  if (btnAlertDis) {
    const spanDis = btnAlertDis.querySelector(".btn-text") || btnAlertDis.querySelector("span");
    if (spanDis) spanDis.innerText = dict.alertBtnDismiss;
    else btnAlertDis.innerText = dict.alertBtnDismiss;
  }

  // Review Modal
  const revTitle = document.getElementById("i18n-review-title");
  if (revTitle) revTitle.innerText = dict.reviewTitle;
  const btnRevPrn = document.getElementById("i18n-review-btn-print");
  if (btnRevPrn) btnRevPrn.innerText = dict.btnPrint;
  const lOrder = document.getElementById("i18n-label-order");
  if (lOrder) lOrder.innerText = dict.labelOrder;
  const lCustomer = document.getElementById("i18n-label-customer");
  if (lCustomer) lCustomer.innerText = dict.labelCustomer;
  const lPickup = document.getElementById("i18n-label-pickup");
  if (lPickup) lPickup.innerText = dict.labelPickup;
  const lEta = document.getElementById("i18n-label-eta");
  if (lEta) lEta.innerText = dict.labelEta;
  const lTotal = document.getElementById("i18n-label-total");
  if (lTotal) lTotal.innerText = dict.labelTotal;
  const lSubtotal = document.getElementById("i18n-label-subtotal");
  if (lSubtotal) lSubtotal.innerText = dict.labelSubtotal;
  const lGrandtotal = document.getElementById("i18n-label-grandtotal");
  if (lGrandtotal) lGrandtotal.innerText = dict.labelGrandtotal;
  const lDiscount = document.getElementById("i18n-label-discount");
  if (lDiscount) lDiscount.innerText = dict.labelDiscount;
  const lStatus = document.getElementById("i18n-label-status");
  if (lStatus) lStatus.innerText = dict.labelStatus;
  const lDining = document.getElementById("i18n-label-dining");
  if (lDining) lDining.innerText = dict.labelDiningOption;
  const lItemsTitle = document.getElementById("i18n-review-items-title");
  if (lItemsTitle) lItemsTitle.innerText = dict.labelOrderItems;
  const lPrintTools = document.getElementById("i18n-print-tools-label");
  if (lPrintTools) lPrintTools.innerText = dict.printToolsLabel;

  const setBtnText = (id, text) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    const sp = btn.querySelector("span");
    if (sp) sp.innerText = text;
    else btn.innerText = text;
  };

  setBtnText("btn-review-accept", dict.btnAccept);
  setBtnText("btn-review-change", dict.btnChange);
  setBtnText("btn-review-reject", dict.btnReject);

  setBtnText("btn-review-ready", dict.btnReady);
  setBtnText("btn-review-cancel-1", dict.btnCancelOrder);
  setBtnText("btn-review-close-1", dict.btnClose);

  setBtnText("btn-review-picked", dict.btnPickedUp);
  setBtnText("btn-review-cancel-2", dict.btnCancelOrder);
  setBtnText("btn-review-close-2", dict.btnClose);

  setBtnText("btn-review-accept-wait", dict.btnAccept);
  setBtnText("btn-review-force-cancel", dict.btnCancelOrder);
  setBtnText("btn-review-close-3", dict.btnClose);

  // Change Modal
  const chgTitle = document.getElementById("i18n-change-title");
  if (chgTitle) chgTitle.innerText = dict.changeTitle;
  const chgTabTT = document.getElementById("i18n-change-tab-time-title");
  if (chgTabTT) chgTabTT.innerText = dict.changeTabTime;
  const chgTabTS = document.getElementById("i18n-change-tab-time-sub");
  if (chgTabTS) chgTabTS.innerText = dict.changeTabTimeSub;
  const chgTabST = document.getElementById("i18n-change-tab-soldout-title");
  if (chgTabST) chgTabST.innerText = dict.changeTabSoldout;
  const chgTabSS = document.getElementById("i18n-change-tab-soldout-sub");
  if (chgTabSS) chgTabSS.innerText = dict.changeTabSoldoutSub;
  const origTL = document.getElementById("i18n-orig-time-label");
  if (origTL) origTL.innerText = dict.origTimeLabel;
  const calcSub = document.getElementById("i18n-calc-sub");
  if (calcSub) calcSub.innerText = dict.calcFromNowSub;
  const chgQuick = document.getElementById("i18n-change-quick-select");
  if (chgQuick) chgQuick.innerText = dict.changeQuickSelect;
  const soldT = document.getElementById("i18n-soldout-title");
  if (soldT) soldT.innerText = dict.soldoutTitle;
  const btnSoldClr = document.getElementById("btn-soldout-clear");
  if (btnSoldClr) btnSoldClr.innerText = dict.soldoutClear;
  const btnChgSnd = document.getElementById("btn-change-send");
  if (btnChgSnd) {
    const curVal = document.getElementById("change-note") ? document.getElementById("change-note").value : "";
    const reason = document.getElementById("change-reason") ? document.getElementById("change-reason").value : "";
    if (reason === "時間需調整" && curVal) {
      btnChgSnd.innerText = `${dict.btnSendSuggest} (${curVal})`;
    } else {
      btnChgSnd.innerText = dict.btnSendSuggest;
    }
  }
  const btnChgCan = document.getElementById("btn-change-cancel");
  if (btnChgCan) btnChgCan.innerText = dict.btnCancel;

  // Reject Modal
  const rejTitle = document.getElementById("i18n-reject-title");
  if (rejTitle) rejTitle.innerText = dict.rejectTitle;
  const rejR1T = document.getElementById("i18n-reject-r1-title");
  if (rejR1T) rejR1T.innerText = dict.rejectR1Title;
  const rejR1S = document.getElementById("i18n-reject-r1-sub");
  if (rejR1S) rejR1S.innerText = dict.rejectR1Sub;
  const rejR2T = document.getElementById("i18n-reject-r2-title");
  if (rejR2T) rejR2T.innerText = dict.rejectR2Title;
  const rejR2S = document.getElementById("i18n-reject-r2-sub");
  if (rejR2S) rejR2S.innerText = dict.rejectR2Sub;
  const rejR3T = document.getElementById("i18n-reject-r3-title");
  if (rejR3T) rejR3T.innerText = dict.rejectR3Title;
  const rejR3S = document.getElementById("i18n-reject-r3-sub");
  if (rejR3S) rejR3S.innerText = dict.rejectR3Sub;
  const rejR4T = document.getElementById("i18n-reject-r4-title");
  if (rejR4T) rejR4T.innerText = dict.rejectR4Title;
  const rejR4S = document.getElementById("i18n-reject-r4-sub");
  if (rejR4S) rejR4S.innerText = dict.rejectR4Sub;
  const btnRejCnf = document.getElementById("btn-reject-confirm");
  if (btnRejCnf) btnRejCnf.innerText = dict.btnConfirmReject;
  const btnRejCan = document.getElementById("btn-reject-cancel");
  if (btnRejCan) btnRejCan.innerText = dict.btnBack;

  // Settings
  const setT = document.getElementById("i18n-settings-title");
  if (typeof updateSettingsPanelHeaderTitle === "function") {
    updateSettingsPanelHeaderTitle();
  } else if (setT) {
    setT.innerText = dict.settingsTitle;
  }
  const setS = document.getElementById("i18n-settings-sub");
  if (setS) setS.innerText = dict.settingsSub || "";
  const setSync = document.getElementById("i18n-settings-sync-status");
  if (setSync) setSync.innerText = dict.settingsSyncStatus;
  if (typeof updateSettingsPrinterStatusDisplay === "function") {
    updateSettingsPrinterStatusDisplay();
  }
  const setStT = document.getElementById("i18n-setting-store-status-title");
  if (setStT) setStT.innerText = dict.settingStoreStatusTitle;
  const setStS = document.getElementById("i18n-setting-store-status-sub");
  if (setStS) setStS.innerText = dict.settingStoreStatusSub;
  const boxOpenT = document.getElementById("i18n-box-open-title");
  if (boxOpenT) boxOpenT.innerText = dict.boxOpenTitle;
  const boxOpenD = document.getElementById("i18n-box-open-desc");
  if (boxOpenD) boxOpenD.innerText = dict.boxOpenDesc;
  const boxBusyT = document.getElementById("i18n-box-busy-title");
  if (boxBusyT) boxBusyT.innerText = dict.boxBusyTitle;
  const boxBusyD = document.getElementById("i18n-box-busy-desc");
  if (boxBusyD) boxBusyD.innerText = dict.boxBusyDesc;
  const boxPausedT = document.getElementById("i18n-box-paused-title");
  if (boxPausedT) boxPausedT.innerText = dict.boxPausedTitle;
  const boxPausedD = document.getElementById("i18n-box-paused-desc");
  if (boxPausedD) boxPausedD.innerText = dict.boxPausedDesc;

  // Store Status Dropdown
  const stMenuH = document.getElementById("i18n-status-menu-header");
  if (stMenuH) stMenuH.innerText = dict.statusMenuHeader;
  const stOptOpenT = document.getElementById("i18n-status-opt-open");
  if (stOptOpenT) stOptOpenT.innerText = dict.statusOptOpenTitle;
  const stOptOpenD = document.getElementById("i18n-status-desc-open");
  if (stOptOpenD) stOptOpenD.innerText = dict.statusOptOpenDesc;
  const stOptBusyT = document.getElementById("i18n-status-opt-busy");
  if (stOptBusyT) stOptBusyT.innerText = dict.statusOptBusyTitle;
  const stOptBusyD = document.getElementById("i18n-status-desc-busy");
  if (stOptBusyD) stOptBusyD.innerText = dict.statusOptBusyDesc;
  const stOptPausedT = document.getElementById("i18n-status-opt-paused");
  if (stOptPausedT) stOptPausedT.innerText = dict.statusOptPausedTitle;
  const stOptPausedD = document.getElementById("i18n-status-desc-paused");
  if (stOptPausedD) stOptPausedD.innerText = dict.statusOptPausedDesc;


  const prepTT = document.getElementById("i18n-status-preptime-title");
  if (prepTT) prepTT.innerText = dict.prepTimeTitle;
  const prepTD = document.getElementById("i18n-status-preptime-desc");
  if (prepTD) prepTD.innerText = dict.prepTimeSub;
  const setPrepTT = document.getElementById("i18n-setting-preptime-title");
  if (setPrepTT) setPrepTT.innerText = dict.settingPrepTimeTitle;
  const setPrepTS = document.getElementById("i18n-setting-preptime-sub");
  if (setPrepTS) setPrepTS.innerText = dict.settingPrepTimeSub;
  if (typeof renderStorePrepTimeUI === "function" && typeof currentPrepTimeMinutes !== "undefined") {
    renderStorePrepTimeUI(currentPrepTimeMinutes);
  }

  if (typeof renderStoreStatusUI === "function" && typeof currentStoreStatus !== "undefined") {
    renderStoreStatusUI(currentStoreStatus);
  }

  const tocTitle = document.getElementById("i18n-toc-settings-title");
  if (tocTitle) tocTitle.innerText = dict.tocSettingsTitle;
  const tocSub = document.getElementById("i18n-toc-settings-sub");
  if (tocSub) tocSub.innerText = dict.tocSettingsSub || (currentLang === "vi" ? "Cấu hình hệ thống" : "系統與門市參數");
  const tocStatus = document.getElementById("i18n-toc-status");
  if (tocStatus) tocStatus.innerText = dict.tocStoreStatus;
  const tocOrderMode = document.getElementById("i18n-toc-ordermode");
  if (tocOrderMode) tocOrderMode.innerText = dict.tocOrderMode;
  const tocPayment = document.getElementById("i18n-toc-payment");
  if (tocPayment) tocPayment.innerText = dict.tocPayment;
  const tocHours = document.getElementById("i18n-toc-hours");
  if (tocHours) tocHours.innerText = dict.tocHours;
  const tocStoreInfo = document.getElementById("i18n-toc-store-info");
  if (tocStoreInfo) tocStoreInfo.innerText = dict.tocStoreInfo;
  const tocAddress = document.getElementById("i18n-toc-address");
  if (tocAddress) tocAddress.innerText = dict.tocAddress;
  const tocAnn = document.getElementById("i18n-toc-announcement");
  if (tocAnn) tocAnn.innerText = dict.tocAnnouncement;
  const tocLogo = document.getElementById("i18n-toc-logo");
  if (tocLogo) tocLogo.innerText = dict.tocLogo;
  const tocLang = document.getElementById("i18n-toc-language");
  if (tocLang) tocLang.innerText = dict.tocLanguage;
  const tocDine = document.getElementById("i18n-toc-dinein");
  if (tocDine) tocDine.innerText = dict.tocDineIn;
  const tocPrn = document.getElementById("i18n-toc-printer");
  if (tocPrn) tocPrn.innerText = dict.tocPrinter;
  const tocRep = document.getElementById("i18n-toc-reports");
  if (tocRep) tocRep.innerText = dict.tocReports;
  const tocStoreP = document.getElementById("i18n-toc-store-pairing");
  if (tocStoreP) tocStoreP.innerText = dict.tocStorePairing;
  const tocTables = document.getElementById("i18n-toc-tables");
  if (tocTables) tocTables.innerText = dict.tabTables;
  const btnStaffOrder = document.getElementById("i18n-btn-staff-order");
  if (btnStaffOrder) btnStaffOrder.innerText = dict.btnStaffOrder;
  const setTablesT = document.getElementById("i18n-setting-tables-title");
  if (setTablesT) setTablesT.innerText = dict.tabTables;
  const setTablesS = document.getElementById("i18n-setting-tables-sub");
  if (setTablesS) setTablesS.innerText = dict.tabTablesSub;
  const btnAddTable = document.getElementById("i18n-table-add-btn");
  if (btnAddTable) {
    const span = btnAddTable.querySelector("span");
    if (span) span.innerText = dict.tableAddBtn;
    else btnAddTable.innerText = dict.tableAddBtn;
  }
  const thTableName = document.getElementById("i18n-th-table-name");
  if (thTableName) thTableName.innerText = dict.tableName;
  const thTableSort = document.getElementById("i18n-th-table-sort");
  if (thTableSort) thTableSort.innerText = dict.tableSort;
  const thTableStatus = document.getElementById("i18n-th-table-status");
  if (thTableStatus) thTableStatus.innerText = dict.tableStatus;
  const thTableAction = document.getElementById("i18n-th-table-action");
  if (thTableAction) thTableAction.innerText = dict.tableAction;
  if (typeof renderRestaurantTablesList === 'function' && typeof currentRestaurantTables !== 'undefined' && Array.isArray(currentRestaurantTables)) {
    renderRestaurantTablesList();
  }
  const btnPrintAllTables = document.getElementById("i18n-table-print-all-btn");
  if (btnPrintAllTables) {
    const span = btnPrintAllTables.querySelector("span");
    if (span) span.innerText = dict.tableQrPrintAllA4;
  }
  const btnBatchTable = document.getElementById("i18n-table-batch-btn");
  if (btnBatchTable) {
    const span = btnBatchTable.querySelector("span");
    if (span) span.innerText = dict.tableBatchAddBtn;
  }
  const noticeTables = document.getElementById("i18n-setting-tables-notice");
  if (noticeTables) noticeTables.innerText = dict.tableHistoryNotice;
  const modalQrTitle = document.getElementById("table-qr-modal-title");
  if (modalQrTitle) modalQrTitle.innerText = dict.tableQrTitle;
  const qrDineInBadge = document.getElementById("i18n-table-qr-dinein-badge");
  if (qrDineInBadge) qrDineInBadge.innerText = dict.tableQrDineInBadge;
  const qrInstruction = document.getElementById("i18n-table-qr-instruction-text");
  if (qrInstruction) qrInstruction.innerText = dict.tableQrInstruction;
  const qrSubInstruction = document.getElementById("i18n-table-qr-sub-text");
  if (qrSubInstruction) qrSubInstruction.innerText = dict.tableQrSubInstruction;
  const qrCopyBtn = document.getElementById("i18n-table-qr-copy-btn");
  if (qrCopyBtn) qrCopyBtn.innerText = dict.tableQrCopyLink;
  const btnQrPos = document.getElementById("i18n-btn-qr-print-pos");
  if (btnQrPos) btnQrPos.innerText = dict.tableQrPrintPos;
  const btnQrDown = document.getElementById("i18n-btn-qr-download");
  if (btnQrDown) btnQrDown.innerText = dict.tableQrDownloadPng;
  const btnQrA4 = document.getElementById("i18n-btn-qr-print-a4");
  if (btnQrA4) btnQrA4.innerText = dict.tableQrPrintA4;

  const modalBatchTitle = document.getElementById("batch-table-modal-title");
  if (modalBatchTitle) modalBatchTitle.innerText = dict.tableBatchAddTitle;
  const batchPrefixLabel = document.getElementById("i18n-batch-table-prefix-label");
  if (batchPrefixLabel) batchPrefixLabel.innerText = dict.tableBatchPrefix;
  const batchStartLabel = document.getElementById("i18n-batch-table-start-label");
  if (batchStartLabel) batchStartLabel.innerText = dict.tableBatchStart;
  const batchEndLabel = document.getElementById("i18n-batch-table-end-label");
  if (batchEndLabel) batchEndLabel.innerText = dict.tableBatchEnd;
  const batchSortLabel = document.getElementById("i18n-batch-table-sort-label");
  if (batchSortLabel) batchSortLabel.innerText = dict.tableBatchSort;
  const batchCancelBtn = document.getElementById("i18n-batch-table-cancel-btn");
  if (batchCancelBtn) batchCancelBtn.innerText = dict.tableCancel;
  const batchSubmitBtn = document.getElementById("i18n-batch-table-submit-btn");
  if (batchSubmitBtn) batchSubmitBtn.innerText = dict.paymentConfirm;
  if (typeof updateSettingsPanelHeaderTitle === "function") {
    updateSettingsPanelHeaderTitle();
  }

  // Language Setting Card
  const setLangT = document.getElementById("i18n-setting-lang-title");
  if (setLangT) setLangT.innerText = dict.settingLangTitle;
  const setLangS = document.getElementById("i18n-setting-lang-sub");
  if (setLangS) setLangS.innerText = dict.settingLangSub;
  const radioZh = document.getElementById("setting-lang-zh");
  const radioVi = document.getElementById("setting-lang-vi");
  const cardZh = document.getElementById("lang-card-zh");
  const cardVi = document.getElementById("lang-card-vi");
  if (radioZh) radioZh.checked = (currentLang === "zh-TW");
  if (radioVi) radioVi.checked = (currentLang === "vi");
  if (cardZh && cardVi) {
    if (currentLang === "zh-TW") {
      cardZh.style.borderColor = "var(--primary)";
      cardZh.style.background = "rgba(0, 185, 0, 0.05)";
      cardVi.style.borderColor = "var(--border)";
      cardVi.style.background = "#fff";
    } else {
      cardVi.style.borderColor = "var(--primary)";
      cardVi.style.background = "rgba(0, 185, 0, 0.05)";
      cardZh.style.borderColor = "var(--border)";
      cardZh.style.background = "#fff";
    }
  }

  // Reports Setting Card
  const setRepT = document.getElementById("i18n-setting-reports-title");
  if (setRepT) setRepT.innerText = dict.settingReportsTitle;
  const setRepS = document.getElementById("i18n-setting-reports-sub");
  if (setRepS) setRepS.innerText = dict.settingReportsSub;
  const repUnName = document.getElementById("i18n-reports-unlocked-name");
  if (repUnName) repUnName.innerText = dict.reportsUnlockedName;
  const repUnDesc = document.getElementById("i18n-reports-unlocked-desc");
  if (repUnDesc) repUnDesc.innerText = dict.reportsUnlockedDesc;
  const btnOpRep = document.getElementById("i18n-btn-open-reports");
  if (btnOpRep) btnOpRep.innerText = dict.btnOpenReports;
  const repLkT = document.getElementById("i18n-reports-locked-title");
  if (repLkT) repLkT.innerText = dict.reportsLockedTitle;
  const repLkD = document.getElementById("i18n-reports-locked-desc");
  if (repLkD) repLkD.innerText = dict.reportsLockedDesc;
  const btnUpRep = document.getElementById("i18n-btn-contact-upgrade-rep");
  if (btnUpRep) btnUpRep.innerText = dict.btnContactUpgrade;
  const btnBackSet = document.getElementById("i18n-btn-back-settings");
  if (btnBackSet) btnBackSet.innerText = dict.btnBackToSettings;

  const ordMT = document.getElementById("i18n-ordermode-title");
  if (ordMT) ordMT.innerText = dict.orderModeTitle;
  const ordMS = document.getElementById("i18n-ordermode-sub");
  if (ordMS) ordMS.innerText = dict.orderModeSub;
  const btnSavePick = document.getElementById("btn-save-pickup-setting");
  if (btnSavePick) btnSavePick.innerText = dict.btnSaveSetting;
  const modeSchT = document.getElementById("i18n-mode-scheduled-title");
  if (modeSchT) modeSchT.innerText = dict.modeScheduledTitle;
  const modeSchS = document.getElementById("i18n-mode-scheduled-sub");
  if (modeSchS) modeSchS.innerText = dict.modeScheduledSub;
  const modeAsapT = document.getElementById("i18n-mode-asap-title");
  if (modeAsapT) modeAsapT.innerText = dict.modeAsapTitle;
  const modeAsapS = document.getElementById("i18n-mode-asap-sub");
  if (modeAsapS) modeAsapS.innerText = dict.modeAsapSub;

  const paySetT = document.getElementById("i18n-payment-settings-title");
  if (paySetT) paySetT.innerText = dict.paymentSettingsTitle;
  const paySetS = document.getElementById("i18n-payment-settings-sub");
  if (paySetS) paySetS.innerText = dict.paymentSettingsSub;
  const btnSavePay = document.getElementById("btn-save-payment-setting");
  if (btnSavePay) btnSavePay.innerText = dict.btnSavePaymentSetting;
  const payOptLinePayT = document.getElementById("i18n-payment-opt-linepay-title");
  if (payOptLinePayT) payOptLinePayT.innerText = dict.paymentOptLinePayTitle;
  const payOptLinePayS = document.getElementById("i18n-payment-opt-linepay-sub");
  if (payOptLinePayS) payOptLinePayS.innerText = dict.paymentOptLinePaySub;
  const payOptCashT = document.getElementById("i18n-payment-opt-cash-title");
  if (payOptCashT) payOptCashT.innerText = dict.paymentOptCashTitle;
  const payOptCashS = document.getElementById("i18n-payment-opt-cash-sub");
  if (payOptCashS) payOptCashS.innerText = dict.paymentOptCashSub;
  const paySetHint = document.getElementById("i18n-payment-settings-hint");
  if (paySetHint) paySetHint.innerText = dict.paymentSettingsHint;
  if (typeof renderPaymentMethodsSetting === "function") {
    renderPaymentMethodsSetting();
  }

  const hrsT = document.getElementById("i18n-hours-title");
  if (hrsT) hrsT.innerText = dict.hoursTitle;
  const hrsS = document.getElementById("i18n-hours-sub");
  if (hrsS) hrsS.innerText = dict.hoursSub;
  const btnSaveHrs = document.getElementById("btn-save-hours");
  if (btnSaveHrs) btnSaveHrs.innerText = dict.btnSaveHours;

  const setStoreInfoT = document.getElementById("i18n-setting-store-info-title");
  if (setStoreInfoT) setStoreInfoT.innerText = dict.settingStoreInfoTitle;
  const setStoreInfoS = document.getElementById("i18n-setting-store-info-sub");
  if (setStoreInfoS) setStoreInfoS.innerText = dict.settingStoreInfoSub;
  const btnSaveAllStoreInfo = document.getElementById("btn-save-all-store-info");
  if (btnSaveAllStoreInfo) btnSaveAllStoreInfo.innerText = dict.btnSaveAllStoreInfo;

  const setAddrT = document.getElementById("i18n-setting-address-title");
  if (setAddrT) setAddrT.innerText = dict.settingAddressTitle;
  const setAddrS = document.getElementById("i18n-setting-address-sub");
  if (setAddrS) setAddrS.innerText = dict.settingAddressSub;
  const setAddrInp = document.getElementById("setting-store-address-input");
  if (setAddrInp) setAddrInp.placeholder = dict.settingAddressPlaceholder;
  const btnSaveAddr = document.getElementById("btn-save-address-setting");
  if (btnSaveAddr) btnSaveAddr.innerText = dict.btnSaveAddress;

  const setAnnT = document.getElementById("i18n-setting-announcement-title");
  if (setAnnT) setAnnT.innerText = dict.settingAnnouncementTitle;
  const setAnnS = document.getElementById("i18n-setting-announcement-sub");
  if (setAnnS) setAnnS.innerText = dict.settingAnnouncementSub;
  const setAnnInp = document.getElementById("setting-store-announcement-input");
  if (setAnnInp) setAnnInp.placeholder = dict.settingAnnouncementPlaceholder;
  const btnSaveAnn = document.getElementById("btn-save-announcement-setting");
  if (btnSaveAnn) btnSaveAnn.innerText = dict.btnSaveAnnouncement;

  const setLogoT = document.getElementById("i18n-setting-logo-title");
  if (setLogoT) setLogoT.innerText = dict.settingLogoTitle;
  const setLogoS = document.getElementById("i18n-setting-logo-sub");
  if (setLogoS) setLogoS.innerText = dict.settingLogoSub;
  const btnChooseLogoTxt = document.getElementById("i18n-btn-choose-logo-text");
  if (btnChooseLogoTxt) {
    btnChooseLogoTxt.innerText = dict.btnChooseLogo;
  } else {
    const btnChooseLogo = document.getElementById("btn-setting-choose-logo");
    if (btnChooseLogo) btnChooseLogo.innerText = dict.btnChooseLogo;
  }
  const logoHint = document.getElementById("i18n-logo-hint");
  if (logoHint) logoHint.innerText = dict.logoHint;
  const btnSaveLogo = document.getElementById("btn-save-logo-setting");
  if (btnSaveLogo) btnSaveLogo.innerText = dict.btnSaveLogo;
  const btnDeleteLogo = document.getElementById("btn-delete-logo-setting");
  if (btnDeleteLogo) btnDeleteLogo.innerText = dict.btnDeleteLogo;

  // Menu Editor
  const segProducts = document.getElementById("i18n-seg-products");
  if (segProducts) segProducts.innerText = dict.segProducts || "餐點";
  const segOptions = document.getElementById("i18n-seg-options");
  if (segOptions) segOptions.innerText = dict.segOptions || "客製選項";

  const menuCatT = document.getElementById("i18n-menu-cat-title");
  if (menuCatT) menuCatT.innerText = dict.menuCatTitle;
  const menuCatS = document.getElementById("i18n-menu-cat-sub");
  if (menuCatS) menuCatS.innerText = dict.menuCatSub || "";

  const btnManageCats = document.getElementById("btn-menu-manage-cats");
  if (btnManageCats) {
    const label = btnManageCats.querySelector('span');
    if (label) label.innerText = dict.btnManageCategories;
  }
  const menuOrderTitle = document.getElementById("menu-order-title");
  if (menuOrderTitle) menuOrderTitle.textContent = dict.manageCategoriesTitle || "Sắp xếp hiển thị";
  const btnMenuOrderBackText = document.getElementById("btn-menu-order-back-text");
  if (btnMenuOrderBackText) btnMenuOrderBackText.textContent = dict.btnBack || "Quay lại";
  const tabletTipLabel = document.getElementById("tablet-tip-label");
  if (tabletTipLabel) tabletTipLabel.textContent = dict.tabletSortTipLabel || "Mẹo sắp xếp cho Tablet:";
  const tabletTipDesc = document.getElementById("tablet-tip-desc");
  if (tabletTipDesc) tabletTipDesc.textContent = dict.tabletSortTipDesc || "";
  const tabletModeBadge = document.getElementById("tablet-mode-badge");
  if (tabletModeBadge) tabletModeBadge.textContent = dict.posTouchModeBadge || "Chế độ cảm ứng POS";
  const btnMenuOrderRevertText = document.getElementById("btn-menu-order-revert-text");
  if (btnMenuOrderRevertText) btnMenuOrderRevertText.textContent = dict.btnRevertSort || "Khôi phục";
  const btnMenuOrderSaveText = document.getElementById("btn-menu-order-save-text");
  if (btnMenuOrderSaveText) btnMenuOrderSaveText.textContent = dict.btnSaveSortChanges || "Lưu thay đổi";
  const bcMgmt = document.getElementById("menu-order-bc-mgmt");
  if (bcMgmt) bcMgmt.textContent = dict.menuSortBreadcrumbMenu || "Quản lý thực đơn";
  const bcDining = document.getElementById("menu-order-bc-dining");
  if (bcDining) bcDining.textContent = dict.menuSortBreadcrumbDineTakeaway || "Bàn / Mang đi";
  const btnManageClose = document.getElementById("btn-menu-manage-close");
  if (btnManageClose) btnManageClose.innerText = dict.btnCloseManager;
  const btnAddCatTop = document.getElementById("btn-menu-add-cat-top");
  if (btnAddCatTop) btnAddCatTop.innerText = dict.btnAddCategory;
  const btnCatDel = document.getElementById("btn-category-delete");
  if (btnCatDel) {
    if (btnCatDel.classList.contains("cat-title-action-btn")) {
      btnCatDel.setAttribute("title", dict.btnCatDelete || dict.btnCategoryDelete || "刪除分類");
      btnCatDel.setAttribute("aria-label", dict.btnCatDelete || dict.btnCategoryDelete || "刪除分類");
    } else {
      btnCatDel.innerHTML = `${(typeof POS_SVG !== 'undefined' && POS_SVG.trash) || ''} <span>${dict.btnCategoryDelete}</span>`;
    }
  }
  const btnCatRen = document.getElementById("btn-category-rename");
  if (btnCatRen) {
    if (btnCatRen.classList.contains("cat-title-action-btn")) {
      btnCatRen.setAttribute("title", dict.btnCatRename || dict.btnCategoryRename || "重新命名");
      btnCatRen.setAttribute("aria-label", dict.btnCatRename || dict.btnCategoryRename || "重新命名");
    } else {
      btnCatRen.innerHTML = `${(typeof POS_SVG !== 'undefined' && POS_SVG.edit) || ''} <span>${dict.btnCategoryRename}</span>`;
    }
  }
  const addCatModT = document.getElementById("i18n-add-cat-modal-title");
  if (addCatModT) addCatModT.innerText = dict.addCategoryModalTitle;
  const addCatLblN = document.getElementById("i18n-add-cat-label-name");
  if (addCatLblN) addCatLblN.innerText = dict.categoryNameLabel;
  const addCatInpN = document.getElementById("add-cat-input-name");
  if (addCatInpN) addCatInpN.placeholder = dict.categoryNamePlaceholder;
  const addCatLblSN = document.getElementById("i18n-add-cat-label-short-name");
  if (addCatLblSN) addCatLblSN.innerText = dict.categoryShortNameLabel;
  const addCatInpSN = document.getElementById("add-cat-input-short-name");
  if (addCatInpSN) addCatInpSN.placeholder = dict.categoryShortNamePlaceholder;
  const addCatLblT = document.getElementById("i18n-add-cat-label-type");
  if (addCatLblT) addCatLblT.innerText = dict.categoryTypeLabel;
  const addCatOptCat = document.getElementById("i18n-add-cat-opt-catalog");
  if (addCatOptCat) addCatOptCat.innerText = dict.categoryTypeCatalog;
  const addCatOptMod = document.getElementById("i18n-add-cat-opt-modifier");
  if (addCatOptMod) addCatOptMod.innerText = dict.categoryTypeModifier;
  const addCatOptCust = document.getElementById("i18n-add-cat-opt-customization");
  if (addCatOptCust) addCatOptCust.innerText = dict.categoryTypeCustomization;
  const addCatCustLbl = document.getElementById("i18n-add-cat-customization-label");
  if (addCatCustLbl) addCatCustLbl.innerText = dict.allowCustomizationLabel;
  const addCatCustDesc = document.getElementById("i18n-add-cat-customization-desc");
  if (addCatCustDesc) addCatCustDesc.innerText = dict.allowCustomizationDesc;
  const allowCustLbl = document.getElementById("i18n-allow-customization-label");
  if (allowCustLbl) allowCustLbl.innerText = dict.allowCustomizationLabel;
  const allowCustDesc = document.getElementById("i18n-allow-customization-desc");
  if (allowCustDesc) allowCustDesc.innerText = dict.allowCustomizationDesc;
  const btnAddCatCnf = document.getElementById("btn-add-cat-confirm");
  if (btnAddCatCnf) btnAddCatCnf.innerText = dict.btnConfirm || "確認";
  const btnAddCatCan = document.getElementById("btn-add-cat-cancel");
  if (btnAddCatCan) btnAddCatCan.innerText = dict.btnCancel || "取消";
  const menuEdT = document.getElementById("menu-editor-title");
  if (menuEdT && (typeof currentMenuData === 'undefined' || !currentMenuData || typeof activeCategoryIndex === 'undefined' || activeCategoryIndex < 0)) menuEdT.innerText = dict.menuEditorTitle;
  const menuEdS = document.getElementById("i18n-menu-edit-sub");
  if (menuEdS) menuEdS.innerText = dict.menuEditSub;
  const btnMenuAdd = document.getElementById("btn-menu-add-item");
  const btnMenuAddText = document.getElementById("i18n-btn-add-item-text");
  if (btnMenuAddText) btnMenuAddText.innerText = dict.btnMenuAddItem;
  else if (btnMenuAdd) btnMenuAdd.innerText = dict.btnMenuAddItem;
  const btnCreateUnifiedText = document.getElementById("i18n-btn-create-unified-text");
  if (btnCreateUnifiedText) {
    const curCat = (typeof currentMenuData !== 'undefined' && currentMenuData && typeof activeCategoryIndex !== 'undefined' && activeCategoryIndex >= 0) ? currentMenuData[activeCategoryIndex] : null;
    const isFlavor = curCat && (typeof isCustomizationCategory === 'function' ? isCustomizationCategory(curCat) : (curCat.type === 'order_customization' || curCat.id === 'sec-flavor'));
    const isCombo = curCat && (typeof isComboCategory === 'function' && isComboCategory(curCat));
    btnCreateUnifiedText.innerText = isFlavor
      ? (dict.btnMenuAddCustomGroup || "新增客製化分組")
      : isCombo
      ? (dict.btnCreateComboWizard || "建立特惠套餐")
      : (dict.btnMenuAddItem || "新增餐點");
  }
  const btnCatRename = document.getElementById("btn-category-rename");
  if (btnCatRename) {
    if (typeof btnCatRename.setAttribute === "function") {
      btnCatRename.setAttribute("title", dict.btnCatRename || dict.btnCategoryRename || "重新命名");
      btnCatRename.setAttribute("aria-label", dict.btnCatRename || dict.btnCategoryRename || "重新命名");
    } else {
      btnCatRename.title = dict.btnCatRename || dict.btnCategoryRename || "重新命名";
    }
  }
  const btnCatDelete = document.getElementById("btn-category-delete");
  if (btnCatDelete) {
    if (typeof btnCatDelete.setAttribute === "function") {
      btnCatDelete.setAttribute("title", dict.btnCatDelete || dict.btnCategoryDelete || "刪除分類");
      btnCatDelete.setAttribute("aria-label", dict.btnCatDelete || dict.btnCategoryDelete || "刪除分類");
    } else {
      btnCatDelete.title = dict.btnCatDelete || dict.btnCategoryDelete || "刪除分類";
    }
  }
  const btnMenuCreateType = document.getElementById("i18n-btn-create-type-text");
  if (btnMenuCreateType) btnMenuCreateType.innerText = dict.btnMenuCreateType;
  const createTypeT = document.getElementById("i18n-create-type-title");
  if (createTypeT) createTypeT.innerText = dict.createTypeModalTitle;
  const createTypeS = document.getElementById("i18n-create-type-sub");
  if (createTypeS) createTypeS.innerText = dict.createTypeModalSub;
  const tStdTitle = document.getElementById("i18n-type-std-title");
  if (tStdTitle) tStdTitle.innerText = dict.createTypeStandardTitle;
  const tStdDesc = document.getElementById("i18n-type-std-desc");
  if (tStdDesc) tStdDesc.innerText = dict.createTypeStandardDesc;
  const tModTitle = document.getElementById("i18n-type-mod-title");
  if (tModTitle) tModTitle.innerText = dict.createTypeModifiersTitle;
  const tModDesc = document.getElementById("i18n-type-mod-desc");
  if (tModDesc) tModDesc.innerText = dict.createTypeModifiersDesc;
  const t1Title = document.getElementById("i18n-type-1-title");
  if (t1Title) t1Title.innerText = dict.createType1Title;
  const t1Desc = document.getElementById("i18n-type-1-desc");
  if (t1Desc) t1Desc.innerText = dict.createType1Desc;
  const t3Title = document.getElementById("i18n-type-3-title");
  if (t3Title) t3Title.innerText = dict.createType3Title;
  const t3Desc = document.getElementById("i18n-type-3-desc");
  if (t3Desc) t3Desc.innerText = dict.createType3Desc;
  const btnCreationTypeClose = document.getElementById("btn-creation-type-close");
  if (btnCreationTypeClose) btnCreationTypeClose.innerText = dict.btnClose || "關閉";

  document.querySelectorAll("#itemModifiersModal .item-modifiers-close-btn, #itemDetailModal .item-detail-modal-close-btn").forEach(button => {
    const label = button.classList.contains("item-modifiers-close-btn") ? dict.btnBack : dict.btnClose;
    button.setAttribute("aria-label", label);
    button.setAttribute("title", `${label} (Esc)`);
  });

  // Item Modifiers Modal (Unified Library Assignment)
  const itemModT = document.getElementById("item-modifiers-modal-title");
  if (itemModT) itemModT.innerText = dict.itemModifiersModalTitle;
  const itemModS = document.getElementById("item-modifiers-modal-sub");
  if (itemModS) itemModS.innerText = dict.itemModifiersModalSub;
  const btnGotoCustom = document.getElementById("btn-goto-customizations");
  if (btnGotoCustom) btnGotoCustom.innerText = dict.itemModCreateGroup;
  const btnItemModCan = document.getElementById("btn-item-mod-cancel");
  if (btnItemModCan) btnItemModCan.innerText = dict.btnCancel;
  const btnItemModSv = document.getElementById("btn-item-mod-save");
  if (btnItemModSv) btnItemModSv.innerText = dict.btnItemModSave || dict.btnSaveModifiers;

  if (typeof updateMenuSaveState === "function") updateMenuSaveState();
  if (typeof renderComboWizard === "function" && document.getElementById('bundle-wizard')?.style.display === 'flex') renderComboWizard();
  const menuHelp = document.getElementById("menu-help-toggle");
  if (menuHelp) menuHelp.setAttribute("aria-label", dict.menuHelp);
  const menuPrompt = document.getElementById("i18n-menu-select-prompt");
  if (menuPrompt) menuPrompt.innerText = dict.menuSelectPrompt;
  [
    ['i18n-menu-workspace-title', 'menuWorkspaceTitle'],
    ['i18n-menu-workspace-sub', 'menuWorkspaceSub'],
    ['i18n-menu-loading', 'menuLoading'],
    ['menu-filter-label', 'filterLabel'],
    ['filter-all-label', 'filterAll'],
    ['filter-instock-label', 'filterInStock'],
    ['filter-oos-label', 'filterOutOfStock'],
    ['menu-footer-sync-status', 'menuFooterPosSync'],
    ['item-detail-modal-sub', 'itemDetailSub'],
    ['i18n-item-basic-title', 'itemBasicTitle'],
    ['i18n-item-advanced-desc', 'itemAdvancedDesc']
  ].forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = dict[key];
  });
  const searchInput = document.getElementById('menu-items-search-input');
  if (searchInput) searchInput.setAttribute('placeholder', dict.menuSearchPlaceholder || '');
  document.getElementById('menu-mode-tabs')?.setAttribute('aria-label', dict.menuModeLabel);

  // Image Modal
  const imgModT = document.getElementById("image-modal-title");
  if (imgModT && (typeof currentImageItemName === 'undefined' || !currentImageItemName)) imgModT.innerText = dict.imageModalTitle;
  const btnImgSel = document.getElementById("btn-image-select");
  if (btnImgSel) btnImgSel.innerText = dict.btnImageSelect;
  const btnImgDel = document.getElementById("btn-delete-image");
  if (btnImgDel) btnImgDel.innerText = dict.btnImageDelete;
  const btnImgCls = document.getElementById("btn-image-close");
  if (btnImgCls) btnImgCls.innerText = dict.btnClose;

  // Stock Modal
  const stkModT = document.getElementById("stock-modal-title");
  if (stkModT) stkModT.innerText = dict.stockModalTitle;
  const stkLblSt = document.getElementById("i18n-stock-label-status");
  if (stkLblSt) stkLblSt.innerText = dict.stockLabelStatus;
  const stkOptIn = document.getElementById("stock-opt-in-stock");
  if (stkOptIn) stkOptIn.innerText = dict.stockOptInStock;
  const stkOptOut = document.getElementById("stock-opt-out-stock");
  if (stkOptOut) stkOptOut.innerText = dict.stockOptOutOfStock;
  const stkLblDur = document.getElementById("i18n-stock-label-duration");
  if (stkLblDur) stkLblDur.innerText = dict.stockLabelDuration;
  const stkOptTd = document.getElementById("stock-opt-today");
  if (stkOptTd) stkOptTd.innerText = dict.stockOptToday;
  const stkOptMd = document.getElementById("stock-opt-multiple-days");
  if (stkOptMd) stkOptMd.innerText = dict.stockOptMultipleDays;
  const stkOptInd = document.getElementById("stock-opt-indefinite");
  if (stkOptInd) stkOptInd.innerText = dict.stockOptIndefinite;
  const stkLblDt = document.getElementById("i18n-stock-label-date");
  if (stkLblDt) stkLblDt.innerText = dict.stockLabelDate;
  const btnStkSv = document.getElementById("btn-stock-save");
  if (btnStkSv) btnStkSv.innerText = dict.btnStockSave;
  const btnStkCan = document.getElementById("btn-stock-cancel");
  if (btnStkCan) btnStkCan.innerText = dict.btnCancel;
  [
    ['stock-drawer-hint', 'stockDrawerHint'],
    ['stock-today-hint', 'stockTodayHint'],
    ['stock-date-choice-hint', 'stockDateChoiceHint'],
    ['stock-indefinite-hint', 'stockIndefiniteHint'],
    ['stock-date-hint', 'stockDateHint'],
    ['stock-linked-notice', 'stockLinkedNotice'],
    ['btn-stock-restore', 'stockRestore']
  ].forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = dict[key];
  });
  document.getElementById('btn-stock-close')?.setAttribute('aria-label', dict.btnClose);
  if (typeof updateStockSaveState === 'function') updateStockSaveState();

  // Dining Filter Buttons
  const btnFilterAll = document.getElementById("filter-btn-all");
  if (btnFilterAll) btnFilterAll.innerText = dict.filterAll;
  const btnFilterTakeaway = document.getElementById("filter-btn-takeaway");
  if (btnFilterTakeaway) btnFilterTakeaway.innerText = dict.filterTakeaway;
  const btnFilterDineIn = document.getElementById("filter-btn-dine-in");
  if (btnFilterDineIn) btnFilterDineIn.innerText = dict.filterDineIn;

  // Dine-in Settings
  const setDineInT = document.getElementById("i18n-setting-dinein-title");
  if (setDineInT) setDineInT.innerText = dict.settingDineInTitle;
  const setDineInS = document.getElementById("i18n-setting-dinein-sub");
  if (setDineInS) setDineInS.innerText = dict.settingDineInSub;
  const btnSaveDineIn = document.getElementById("btn-save-dinein-setting");
  if (btnSaveDineIn) btnSaveDineIn.innerText = dict.btnSaveDineInSetting;
  const modeDineInTT = document.getElementById("i18n-mode-dinein-true-title");
  if (modeDineInTT) modeDineInTT.innerText = dict.settingDineInTrueTitle;
  const modeDineInTS = document.getElementById("i18n-mode-dinein-true-sub");
  if (modeDineInTS) modeDineInTS.innerText = dict.settingDineInTrueSub;
  const modeDineInFT = document.getElementById("i18n-mode-dinein-false-title");
  if (modeDineInFT) modeDineInFT.innerText = dict.settingDineInFalseTitle;
  const modeDineInFS = document.getElementById("i18n-mode-dinein-false-sub");
  if (modeDineInFS) modeDineInFS.innerText = dict.settingDineInFalseSub;

  const featLockT = document.getElementById("i18n-feature-locked-title");
  if (featLockT) featLockT.innerText = dict.featureLockedTitle;
  const featLockD = document.getElementById("i18n-feature-locked-desc");
  if (featLockD) featLockD.innerText = dict.featureLockedDesc;
  const btnContUpgTxt = document.getElementById("i18n-btn-contact-upgrade-text");
  if (btnContUpgTxt) {
    btnContUpgTxt.innerText = dict.btnContactUpgrade;
  } else {
    const btnContUpg = document.getElementById("i18n-btn-contact-upgrade");
    if (btnContUpg) btnContUpg.innerText = dict.btnContactUpgrade;
  }

  // Thermal Printer Settings DOM mappings
  const setPrnT = document.getElementById("i18n-setting-printer-title");
  if (setPrnT) setPrnT.innerText = dict.settingPrinterTitle;
  const setPrnS = document.getElementById("i18n-setting-printer-sub");
  if (setPrnS) setPrnS.innerText = dict.settingPrinterSub;
  const prnAutoT = document.getElementById("i18n-printer-autoprint-title");
  if (prnAutoT) prnAutoT.innerText = dict.printerAutoPrintTitle;
  const prnAutoD = document.getElementById("i18n-printer-autoprint-desc");
  if (prnAutoD) prnAutoD.innerText = dict.printerAutoPrintDesc;
  const prnModeT = document.getElementById("i18n-printer-mode-title");
  if (prnModeT) prnModeT.innerText = dict.printModeTitle;
  const prnModeS = document.getElementById("i18n-printer-mode-sub");
  if (prnModeS) prnModeS.innerText = dict.printModeSub;
  const prnAutoTitle = document.getElementById("i18n-print-mode-auto-title");
  if (prnAutoTitle) prnAutoTitle.innerText = dict.printModeAutoTitle;
  const prnAutoDesc = document.getElementById("i18n-print-mode-auto-desc");
  if (prnAutoDesc) prnAutoDesc.innerText = dict.printModeAutoDesc;
  const prnManualTitle = document.getElementById("i18n-print-mode-manual-title");
  if (prnManualTitle) prnManualTitle.innerText = dict.printModeManualTitle;
  const prnManualDesc = document.getElementById("i18n-print-mode-manual-desc");
  if (prnManualDesc) prnManualDesc.innerText = dict.printModeManualDesc;

  // Review 3 Print levels
  const btnPrintFull = document.getElementById("i18n-btn-print-full");
  if (btnPrintFull) {
    const order = (typeof reviewingOrder !== "undefined" && reviewingOrder) ? reviewingOrder : null;
    let n = 1;
    if (order && typeof PrinterService !== "undefined" && typeof PrinterService.parseOrderItems === "function") {
      n = PrinterService.parseOrderItems(order, true).length || 1;
    }
    btnPrintFull.innerHTML = dict.btnPrintFullOrder ? dict.btnPrintFullOrder.replace("{n}", n) : `IN CẢ ĐƠN<br>(1 Bill + ${n} Tem)`;
  }
  const btnPrintBillOnly = document.getElementById("i18n-btn-print-bill-only");
  if (btnPrintBillOnly) btnPrintBillOnly.innerText = dict.btnPrintBillOnly;
  const btnPrintCustomOpt = document.getElementById("i18n-btn-print-custom-opt");
  if (btnPrintCustomOpt) btnPrintCustomOpt.innerHTML = dict.btnPrintCustomOption;

  // Quick Sticker Modal
  const qStickerTitle = document.getElementById("i18n-quick-sticker-title");
  if (qStickerTitle) qStickerTitle.innerText = dict.quickStickerModalTitle;
  const qStickerSub = document.getElementById("i18n-quick-sticker-sub");
  if (qStickerSub) qStickerSub.innerText = dict.quickStickerModalSub;
  const qStickerCustomLbl = document.getElementById("i18n-quick-sticker-custom-label");
  if (qStickerCustomLbl) qStickerCustomLbl.innerText = dict.quickStickerCustomLabel;
  const qStickerInput = document.getElementById("quick-sticker-custom-input");
  if (qStickerInput) qStickerInput.placeholder = dict.quickStickerCustomPlaceholder;
  const qStickerBtn = document.getElementById("i18n-btn-print-quick-custom");
  if (qStickerBtn) qStickerBtn.innerText = dict.quickStickerCustomPrintBtn;

  // Printer Usage Guide DOM mappings
  const gTitle = document.getElementById("i18n-printer-guide-title");
  if (gTitle) gTitle.innerText = dict.printerGuideTitle;
  const gSub = document.getElementById("i18n-printer-guide-sub");
  if (gSub) gSub.innerText = dict.printerGuideSub;
  const gModeT = document.getElementById("i18n-printer-guide-mode-title");
  if (gModeT) gModeT.innerText = dict.printerGuideModeTitle;
  const gModeAutoT = document.getElementById("i18n-printer-guide-mode-auto-title");
  if (gModeAutoT) gModeAutoT.innerText = dict.printerGuideModeAutoTitle;
  const gModeAutoD = document.getElementById("i18n-printer-guide-mode-auto-desc");
  if (gModeAutoD) gModeAutoD.innerText = dict.printerGuideModeAutoDesc;
  const gModeManualT = document.getElementById("i18n-printer-guide-mode-manual-title");
  if (gModeManualT) gModeManualT.innerText = dict.printerGuideModeManualTitle;
  const gModeManualD = document.getElementById("i18n-printer-guide-mode-manual-desc");
  if (gModeManualD) gModeManualD.innerText = dict.printerGuideModeManualDesc;
  const gLevelsT = document.getElementById("i18n-printer-guide-levels-title");
  if (gLevelsT) gLevelsT.innerText = dict.printerGuideLevelsTitle;
  const gLevelFullT = document.getElementById("i18n-printer-guide-level-full-title");
  if (gLevelFullT) gLevelFullT.innerText = dict.printerGuideLevelFullTitle;
  const gLevelFullD = document.getElementById("i18n-printer-guide-level-full-desc");
  if (gLevelFullD) gLevelFullD.innerText = dict.printerGuideLevelFullDesc;
  const gLevelBillT = document.getElementById("i18n-printer-guide-level-bill-title");
  if (gLevelBillT) gLevelBillT.innerText = dict.printerGuideLevelBillTitle;
  const gLevelBillD = document.getElementById("i18n-printer-guide-level-bill-desc");
  if (gLevelBillD) gLevelBillD.innerText = dict.printerGuideLevelBillDesc;
  const gLevelSingleT = document.getElementById("i18n-printer-guide-level-single-title");
  if (gLevelSingleT) gLevelSingleT.innerText = dict.printerGuideLevelSingleTitle;
  const gLevelSingleD = document.getElementById("i18n-printer-guide-level-single-desc");
  if (gLevelSingleD) gLevelSingleD.innerText = dict.printerGuideLevelSingleDesc;
  const gLevelCustomT = document.getElementById("i18n-printer-guide-level-custom-title");
  if (gLevelCustomT) gLevelCustomT.innerText = dict.printerGuideLevelCustomTitle;
  const gLevelCustomD = document.getElementById("i18n-printer-guide-level-custom-desc");
  if (gLevelCustomD) gLevelCustomD.innerText = dict.printerGuideLevelCustomDesc;
  const gHwT = document.getElementById("i18n-printer-guide-hardware-title");
  if (gHwT) gHwT.innerText = dict.printerGuideHardwareTitle;
  const gHwCashier = document.getElementById("i18n-printer-guide-hw-cashier");
  if (gHwCashier) gHwCashier.innerText = dict.printerGuideHwCashier;
  const gHwKitchen = document.getElementById("i18n-printer-guide-hw-kitchen");
  if (gHwKitchen) gHwKitchen.innerText = dict.printerGuideHwKitchen;
  ['Title', 'BillHeading', 'Receipt', 'LabelHeading', 'Label', 'ReceiptCaption', 'LabelCaption'].forEach(suffix => {
    const el = document.getElementById('printer-guide-align-' + suffix);
    if (el) el.innerText = dict['printerGuideAlign' + suffix];
  });
  const printerSaveStatus = document.getElementById('printer-save-status');
  document.querySelectorAll('.i18n-printer-feed-before-cut').forEach(el => { el.textContent = dict.printerFeedBeforeCut || el.textContent; });
  if (printerSaveStatus) printerSaveStatus.textContent = dict[printerSaveStatus.dataset?.state === 'error' ? 'printerSaveFailed' : printerSaveStatus.dataset?.state === 'saved' ? 'printerSavedLocally' : 'printerAutoSaveHint'];
  const gHwTest = document.getElementById("i18n-printer-guide-hw-test");
  if (gHwTest) gHwTest.innerText = dict.printerGuideHwTest;
  const btnPGuide = document.getElementById("i18n-btn-printer-guide");
  if (btnPGuide) btnPGuide.innerText = dict.btnPrinterGuide;
  const btnCloseG = document.getElementById("i18n-btn-close-guide");
  if (btnCloseG) btnCloseG.innerText = dict.btnCloseGuide;

  // Re-render open modal contents if active
  if (typeof reviewingOrder !== "undefined" && reviewingOrder) {
    const elCont = document.getElementById("review-content");
    if (elCont && typeof formatContentHtml === "function") {
      elCont.innerHTML = formatContentHtml(reviewingOrder);
    }
  }
  const qModal = document.getElementById("quickStickerModal");
  if (qModal && qModal.style.display === "flex" && typeof renderQuickStickerOptions === "function") {
    renderQuickStickerOptions();
  }

  const prnCashT = document.getElementById("i18n-printer-cashier-title");
  if (prnCashT) prnCashT.innerText = dict.printerCashierTitle;
  const prnCashD = document.getElementById("i18n-printer-cashier-desc");
  if (prnCashD) prnCashD.innerText = dict.printerCashierDesc;
  const prnKitT = document.getElementById("i18n-printer-kitchen-title");
  if (prnKitT) prnKitT.innerText = dict.printerKitchenTitle;
  const prnKitD = document.getElementById("i18n-printer-kitchen-desc");
  if (prnKitD) prnKitD.innerText = dict.printerKitchenDesc;
  const btnSvPrn = document.getElementById("i18n-btn-save-printer-settings");
  if (btnSvPrn) btnSvPrn.innerText = dict.btnSavePrinterSettings;

  // Bluetooth & Interface DOM Labels
  const labelsEnable = document.querySelectorAll(".i18n-printer-enable-lbl");
  labelsEnable.forEach(el => el.innerText = dict.printerEnableLabel);

  const optsBtPlaceholder = document.querySelectorAll(".i18n-opt-bt-placeholder");
  optsBtPlaceholder.forEach(el => el.innerText = dict.printerBtDevicePlaceholder);

  const labelsInterface = document.querySelectorAll(".i18n-printer-interface-lbl");
  labelsInterface.forEach(el => el.innerText = dict.printerInterfaceLabel);

  const labelsBt = document.querySelectorAll(".i18n-printer-bt-lbl");
  labelsBt.forEach(el => el.innerText = dict.printerBtDeviceLabel);

  const btRefreshBtns = document.querySelectorAll(".i18n-printer-bt-refresh");
  btRefreshBtns.forEach(el => el.innerText = dict.printerBtRefreshBtn);

  const labelsIp = document.querySelectorAll(".i18n-printer-ip-lbl");
  labelsIp.forEach(el => el.innerText = dict.printerIpLabel);

  const labelsPaper = document.querySelectorAll(".i18n-printer-paper-lbl");
  labelsPaper.forEach(el => el.innerText = dict.printerPaperLabel);

  const optNets = document.querySelectorAll(".i18n-opt-network");
  optNets.forEach(el => el.innerText = dict.printerInterfaceNetwork);

  const optBts = document.querySelectorAll(".i18n-opt-bluetooth");
  optBts.forEach(el => el.innerText = dict.printerInterfaceBluetooth);

  const optP80s = document.querySelectorAll(".i18n-opt-p80");
  optP80s.forEach(el => el.innerText = dict.printerPaper80);

  const optP58s = document.querySelectorAll(".i18n-opt-p58");
  optP58s.forEach(el => el.innerText = dict.printerPaper58);

  // Protocol & TSPL Labels
  const labelsProto = document.querySelectorAll(".i18n-printer-protocol-lbl");
  labelsProto.forEach(el => el.innerText = dict.printerProtocolLabel);

  const optEscs = document.querySelectorAll(".i18n-opt-escpos");
  optEscs.forEach(el => el.innerText = dict.printerOptEscPos);

  const optTspls = document.querySelectorAll(".i18n-opt-tspl");
  optTspls.forEach(el => el.innerText = dict.printerOptTspl);

  const labelsTsplSize = document.querySelectorAll(".i18n-printer-tspl-size-lbl");
  labelsTsplSize.forEach(el => el.innerText = dict.printerTsplSizeLabel);

  const optTspl100s = document.querySelectorAll(".i18n-opt-tspl-100x150");
  optTspl100s.forEach(el => el.innerText = dict.printerOptTspl100x150);

  const optTspl76s = document.querySelectorAll(".i18n-opt-tspl-76x130");
  optTspl76s.forEach(el => el.innerText = dict.printerOptTspl76x130);

  const optTspl50s = document.querySelectorAll(".i18n-opt-tspl-50x30");
  optTspl50s.forEach(el => el.innerText = dict.printerOptTspl50x30);

  const optTspl40s = document.querySelectorAll(".i18n-opt-tspl-40x30");
  optTspl40s.forEach(el => el.innerText = dict.printerOptTspl40x30);

  const optTsplCustoms = document.querySelectorAll(".i18n-opt-tspl-custom");
  optTsplCustoms.forEach(el => el.innerText = dict.printerOptTsplCustom);

  const labelsTsplW = document.querySelectorAll(".i18n-printer-tspl-width-lbl");
  labelsTsplW.forEach(el => el.innerText = dict.printerTsplWidthLabel);

  const labelsTsplH = document.querySelectorAll(".i18n-printer-tspl-height-lbl");
  labelsTsplH.forEach(el => el.innerText = dict.printerTsplHeightLabel);

  const labelsTsplMode = document.querySelectorAll(".i18n-printer-tspl-mode-lbl");
  labelsTsplMode.forEach(el => el.innerText = dict.printerTsplModeLabel);

  const optTsplModSums = document.querySelectorAll(".i18n-opt-tspl-mode-summary");
  optTsplModSums.forEach(el => el.innerText = dict.printerOptTsplModeSummary);

  const optTsplModIts = document.querySelectorAll(".i18n-opt-tspl-mode-items");
  optTsplModIts.forEach(el => el.innerText = dict.printerOptTsplModeItems);

  const labelsTsplDpi = document.querySelectorAll(".i18n-printer-tspl-dpi-lbl");
  labelsTsplDpi.forEach(el => el.innerText = dict.printerTsplDpiLabel);

  const optTsplDpi203s = document.querySelectorAll(".i18n-opt-tspl-dpi-203");
  optTsplDpi203s.forEach(el => el.innerText = dict.printerOptTsplDpi203);

  const optTsplDpi300s = document.querySelectorAll(".i18n-opt-tspl-dpi-300");
  optTsplDpi300s.forEach(el => el.innerText = dict.printerOptTsplDpi300);

  const labelsTsplXOff = document.querySelectorAll(".i18n-printer-tspl-x-offset-lbl");
  labelsTsplXOff.forEach(el => el.innerText = dict.printerTsplXOffsetLabel);

  const labelsTsplYOff = document.querySelectorAll(".i18n-printer-tspl-y-offset-lbl");
  labelsTsplYOff.forEach(el => el.innerText = dict.printerTsplYOffsetLabel);

  const labelsTestPrint = document.querySelectorAll(".i18n-btn-test-print");
  labelsTestPrint.forEach(el => el.innerText = dict.btnTestPrint);

  // Store Pairing DOM mappings
  const setPairT = document.getElementById("i18n-setting-pairing-title");
  if (setPairT) setPairT.innerText = dict.settingPairingTitle;
  const setPairS = document.getElementById("i18n-setting-pairing-sub");
  if (setPairS) setPairS.innerText = dict.settingPairingSub;
  const pairTLbl = document.getElementById("i18n-pairing-tenant-label");
  if (pairTLbl) pairTLbl.innerText = dict.pairingTenantLabel;
  const pairStLbl = document.getElementById("i18n-pairing-status-label");
  if (pairStLbl) pairStLbl.innerText = dict.pairingStatusLabel;
  const pairStConn = document.getElementById("i18n-pairing-status-connected");
  if (pairStConn) pairStConn.innerText = dict.pairingStatusConnected;
  document.querySelectorAll("[data-store-pin-i18n]").forEach(el => {
    el.textContent = t(el.dataset.storePinI18n);
  });
  if (typeof renderStorePinChangeState === "function") renderStorePinChangeState();
  const unlT = document.getElementById("i18n-unlink-title");
  if (unlT) unlT.innerText = dict.unlinkTitle;
  const unlD = document.getElementById("i18n-unlink-desc");
  if (unlD) unlD.innerText = dict.unlinkDesc;
  const btnUnlSt = document.getElementById("i18n-btn-unlink-store");
  if (btnUnlSt) btnUnlSt.innerText = dict.btnUnlinkStore;

  // Store Activation Modal DOM mappings
  const actModT = document.getElementById("i18n-modal-activation-title");
  if (actModT) actModT.innerText = dict.modalActivationTitle;
  const actModS = document.getElementById("i18n-modal-activation-sub");
  if (actModS) actModS.innerText = dict.modalActivationSub;
  const actTLbl = document.getElementById("i18n-activation-tenant-label");
  if (actTLbl) actTLbl.innerText = dict.activationTenantLabel;
  const actInpT = document.getElementById("activation-tenant-id");
  if (actInpT) actInpT.placeholder = dict.activationTenantPlaceholder;
  const actPLbl = document.getElementById("i18n-activation-pin-label");
  if (actPLbl) actPLbl.innerText = dict.activationPinLabel;
  const actInpP = document.getElementById("activation-pin");
  if (actInpP) actInpP.placeholder = dict.activationPinPlaceholder;
  const btnActTxt = document.getElementById("i18n-btn-submit-activation-text");
  if (btnActTxt) btnActTxt.innerText = dict.btnSubmitActivation;

  // Bundle Editor Modal DOM mappings
  const bndlModT = document.getElementById("i18n-bundle-modal-title");
  if (bndlModT) bndlModT.innerText = dict.modalBundleTitle;
  const bndlModS = document.getElementById("i18n-bundle-modal-sub");
  if (bndlModS) bndlModS.innerText = dict.modalBundleSub;
  const bndlGrpT = document.getElementById("i18n-bundle-groups-title");
  if (bndlGrpT) bndlGrpT.innerText = dict.bundleGroupListTitle;
  const btnAddBndlG = document.getElementById("i18n-btn-add-bundle-group");
  if (btnAddBndlG) btnAddBndlG.innerText = dict.btnAddBundleGroup;
  const btnDelBndlC = document.getElementById("i18n-btn-delete-bundle-config");
  if (btnDelBndlC) btnDelBndlC.innerText = dict.btnRemoveBundleConfig;
  const btnBndlCancel = document.getElementById("i18n-btn-bundle-cancel");
  if (btnBndlCancel) btnBndlCancel.innerText = dict.btnBundleCancel;
  const btnBndlSave = document.getElementById("i18n-btn-bundle-save");
  if (btnBndlSave) btnBndlSave.innerText = dict.btnBundleSave;
  const bndlTipT = document.getElementById("i18n-bundle-tip-title");
  if (bndlTipT) bndlTipT.innerText = dict.bundleTipTitle;
  const bndlTipD = document.getElementById("i18n-bundle-tip-desc");
  if (bndlTipD) bndlTipD.innerText = dict.bundleTipDesc;
  const bndlDangerT = document.getElementById("i18n-bundle-danger-title");
  if (bndlDangerT) bndlDangerT.innerText = dict.bundleDangerZoneTitle;
  const bndlDangerD = document.getElementById("i18n-bundle-danger-desc");
  if (bndlDangerD) bndlDangerD.innerText = dict.bundleDangerZoneDesc;
  const bndlGrdB = document.getElementById("i18n-btn-bundle-guide");
  if (bndlGrdB) bndlGrdB.innerText = dict.btnBundleGuide;
  const bndlSbG = document.getElementById("i18n-btn-bundle-sidebar-guide");
  if (bndlSbG) bndlSbG.innerText = dict.btnBundleSidebarGuide;
  const bndlGMTitle = document.getElementById("i18n-bundle-guide-modal-title");
  if (bndlGMTitle) bndlGMTitle.innerText = dict.bundleGuideModalTitle;
  const bndlGMSub = document.getElementById("i18n-bundle-guide-modal-sub");
  if (bndlGMSub) bndlGMSub.innerText = dict.bundleGuideModalSub;
  const bndlGWhatTag = document.getElementById("i18n-bundle-guide-what-tag");
  if (bndlGWhatTag) bndlGWhatTag.innerText = dict.bundleGuideWhatTag;
  const bndlGWhatT = document.getElementById("i18n-bundle-guide-what-title");
  if (bndlGWhatT) bndlGWhatT.innerText = dict.bundleGuideWhatTitle;
  const bndlGWhatD = document.getElementById("i18n-bundle-guide-what-desc");
  if (bndlGWhatD) bndlGWhatD.innerHTML = dict.bundleGuideWhatDesc;
  const bndlGStepsTag = document.getElementById("i18n-bundle-guide-steps-tag");
  if (bndlGStepsTag) bndlGStepsTag.innerText = dict.bundleGuideStepsTag;
  const bndlGStepsT = document.getElementById("i18n-bundle-guide-steps-title");
  if (bndlGStepsT) bndlGStepsT.innerText = dict.bundleGuideStepsTitle;
  const bndlGS1Tag = document.getElementById("i18n-bundle-guide-step1-tag");
  if (bndlGS1Tag) bndlGS1Tag.innerText = dict.bundleGuideStep1Tag;
  const bndlGS1T = document.getElementById("i18n-bundle-guide-step1-title");
  if (bndlGS1T) bndlGS1T.innerText = dict.bundleGuideStep1Title;
  const bndlGS1D = document.getElementById("i18n-bundle-guide-step1-desc");
  if (bndlGS1D) bndlGS1D.innerHTML = dict.bundleGuideStep1Desc;
  const bndlGS2Tag = document.getElementById("i18n-bundle-guide-step2-tag");
  if (bndlGS2Tag) bndlGS2Tag.innerText = dict.bundleGuideStep2Tag;
  const bndlGS2T = document.getElementById("i18n-bundle-guide-step2-title");
  if (bndlGS2T) bndlGS2T.innerText = dict.bundleGuideStep2Title;
  const bndlGS2D = document.getElementById("i18n-bundle-guide-step2-desc");
  if (bndlGS2D) bndlGS2D.innerHTML = dict.bundleGuideStep2Desc;
  const bndlGS3Tag = document.getElementById("i18n-bundle-guide-step3-tag");
  if (bndlGS3Tag) bndlGS3Tag.innerText = dict.bundleGuideStep3Tag;
  const bndlGS3T = document.getElementById("i18n-bundle-guide-step3-title");
  if (bndlGS3T) bndlGS3T.innerText = dict.bundleGuideStep3Title;
  const bndlGS3D = document.getElementById("i18n-bundle-guide-step3-desc");
  if (bndlGS3D) bndlGS3D.innerHTML = dict.bundleGuideStep3Desc;
  const bndlGExTag = document.getElementById("i18n-bundle-guide-examples-tag");
  if (bndlGExTag) bndlGExTag.innerText = dict.bundleGuideExamplesTag;
  const bndlGExT = document.getElementById("i18n-bundle-guide-examples-title");
  if (bndlGExT) bndlGExT.innerText = dict.bundleGuideExamplesTitle;
  const bndlEx1T = document.getElementById("i18n-bundle-ex1-title");
  if (bndlEx1T) bndlEx1T.innerText = dict.bundleEx1Title;
  const bndlEx1B = document.getElementById("i18n-bundle-ex1-badge");
  if (bndlEx1B) bndlEx1B.innerText = dict.bundleEx1Badge;
  const bndlEx1D = document.getElementById("i18n-bundle-ex1-desc");
  if (bndlEx1D) bndlEx1D.innerHTML = dict.bundleEx1Desc;
  const bndlEx2T = document.getElementById("i18n-bundle-ex2-title");
  if (bndlEx2T) bndlEx2T.innerText = dict.bundleEx2Title;
  const bndlEx2B = document.getElementById("i18n-bundle-ex2-badge");
  if (bndlEx2B) bndlEx2B.innerText = dict.bundleEx2Badge;
  const bndlEx2D = document.getElementById("i18n-bundle-ex2-desc");
  if (bndlEx2D) bndlEx2D.innerHTML = dict.bundleEx2Desc;
  const bndlEx3T = document.getElementById("i18n-bundle-ex3-title");
  if (bndlEx3T) bndlEx3T.innerText = dict.bundleEx3Title;
  const bndlEx3B = document.getElementById("i18n-bundle-ex3-badge");
  if (bndlEx3B) bndlEx3B.innerText = dict.bundleEx3Badge;
  const bndlEx3D = document.getElementById("i18n-bundle-ex3-desc");
  if (bndlEx3D) bndlEx3D.innerHTML = dict.bundleEx3Desc;
  const btnBndlGGotIt = document.getElementById("i18n-btn-bundle-guide-gotit");
  if (btnBndlGGotIt) btnBndlGGotIt.innerText = dict.btnBundleGuideGotIt;

  // Item Detail Hub Modal DOM mappings
  const itemDetailTitle = document.getElementById("item-detail-modal-title");
  if (itemDetailTitle && (typeof itemDetailTitle.getAttribute !== "function" || !itemDetailTitle.getAttribute("data-custom-title"))) itemDetailTitle.innerText = dict.itemDetailTitle;
  const itemNameLabel = document.getElementById("i18n-item-name-label");
  if (itemNameLabel) itemNameLabel.innerHTML = `${dict.itemNameLabel} <span style="color: #dc2626;">*</span>`;
  const itemPriceLabel = document.getElementById("i18n-item-price-label");
  if (itemPriceLabel) itemPriceLabel.innerText = dict.itemPriceLabel;
  const itemNameInput = document.getElementById("item-detail-name-input");
  if (itemNameInput && typeof itemNameInput.setAttribute === "function") itemNameInput.setAttribute("placeholder", dict.itemNamePlaceholder);
  const itemBadgeTitle = document.getElementById("i18n-item-badge-title");
  if (itemBadgeTitle) itemBadgeTitle.innerText = dict.itemBadgeTitle;
  const itemBadgeInput = document.getElementById("item-detail-badge-input");
  if (itemBadgeInput && typeof itemBadgeInput.setAttribute === "function") itemBadgeInput.setAttribute("placeholder", dict.itemBadgePlaceholder);
  const itemRecLabel = document.getElementById("i18n-item-recommended-label");
  if (itemRecLabel) itemRecLabel.innerText = dict.itemRecommendedLabel;
  const itemAdvTitle = document.getElementById("i18n-item-advanced-title");
  if (itemAdvTitle) itemAdvTitle.innerText = dict.itemAdvancedTitle;
  const cardModTitle = document.getElementById("i18n-card-mod-title");
  if (cardModTitle) cardModTitle.innerText = dict.cardModifiersTitle;
  const cardBundleTitle = document.getElementById("i18n-card-bundle-title");
  if (cardBundleTitle) cardBundleTitle.innerText = dict.cardBundleTitle;
  const btnItemPhotoUpload = document.getElementById("i18n-btn-item-photo-upload");
  if (btnItemPhotoUpload) btnItemPhotoUpload.innerText = dict.btnUploadPhoto;
  const btnItemPhotoRemove = document.getElementById("i18n-btn-item-photo-remove");
  if (btnItemPhotoRemove) btnItemPhotoRemove.innerText = dict.btnRemovePhoto;
  const spanCancel = document.getElementById("i18n-btn-item-detail-cancel");
  if (spanCancel) spanCancel.innerText = dict.btnItemCancel;
  else {
    const btnItemDetailCancel = document.getElementById("btn-item-detail-cancel");
    if (btnItemDetailCancel) btnItemDetailCancel.innerText = dict.btnItemCancel;
  }
  const spanDone = document.getElementById("i18n-btn-item-detail-done");
  if (spanDone) spanDone.innerText = dict.btnDetailDone;
  else {
    const btnItemDetailDone = document.getElementById("btn-item-detail-done");
    if (btnItemDetailDone && (typeof btnItemDetailDone.getAttribute !== "function" || !btnItemDetailDone.getAttribute("data-custom-text"))) btnItemDetailDone.innerText = dict.btnDetailDone;
  }
  const spanModSave = document.getElementById("i18n-btn-item-mod-save");
  if (spanModSave) spanModSave.innerText = dict.btnItemModSave || dict.btnSave || "完成設定";
}

window.I18N = I18N;

const originalStaffLanguageDOM = applyLanguageToDOM;
applyLanguageToDOM = function () {
  originalStaffLanguageDOM();
  document.querySelectorAll('[data-staff-i18n]').forEach(el=>{el.textContent=t(el.dataset.staffI18n);});
  const tableLabel=document.getElementById('table-editor-label');
  if (tableLabel) tableLabel.placeholder=t('tableNamePlaceholder');
  if (window.PaymentPOS && typeof PaymentPOS.translate === 'function') PaymentPOS.translate();
};
