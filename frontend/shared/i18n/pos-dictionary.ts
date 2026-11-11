export type PosLocale = 'zh-TW' | 'vi';

const POS_DICTIONARY = {
  'zh-TW': {
    sandboxBadge: 'POS 現代化預覽環境（隔離入口）',
    sandboxTitle: '訂單歷史與明細（TypeScript + React 契約驗證）',
    sandboxSubtitle: '此頁面用於驗證編譯流程、樣式隔離、多語系與 48px 觸控標準，不影響正式櫃台。',
    switchLang: '切換至 Tiếng Việt',
    historySearchPlaceholder: '搜尋訂單編號 / 顧客姓名 / 桌號...',
    historyFilterAll: '全部',
    historyFilterDineIn: '內用',
    historyFilterTakeaway: '外帶',
    btnClearFilter: '清除篩選',
    historyClearSearch: '清除搜尋',
    btnExpandAll: '展開全部',
    btnCollapseAll: '收合全部',
    todayTag: '今天',
    orderUnit: '單',
    loading: '載入中...',
    historyTitle: '訂單歷史',
    historySub: '近 30 天訂單紀錄 (依日期分組)',
    emptyHistory: '尚無歷史訂單',
    historyNoSearchResults: '查無符合條件的訂單',
    historyNoSearchResultsSub: '請嘗試更換關鍵字或清除篩選條件',
    historyOlderTitle: '查看 30 天前的歷史訂單',
    historyOlderSub: '如需調閱更早歷史紀錄或匯出月報表，請聯繫 BLAB 團隊',
    btnContactBlab: '聯繫 BLAB',
    badgePicked: '已取餐',
    badgePaid: '已結帳',
    badgeRejected: '已取消',
    badgeDineIn: '內用',
    badgeTakeaway: '外帶',
    badgeModifiedOrder: '已更換品項',
    badgeAppendRound: '第 {n} 輪',
    dineInTimeLabel: '點餐時間',
    pickupLabel: '取餐:',
    btnView: '查看',
    defaultCustomer: '顧客',
    searchLabel: '搜尋歷史訂單',
    filterGroupLabel: '訂單類型篩選',
    btnClose: '關閉',
    detailModalTitle: '訂單明細（唯讀）',
    totalLabel: '總金額',
    itemsSummaryLabel: '品項內容',
    tablePrefix: '桌 {table}',
    tableInline: '桌號 {table}',
    paymentUnrefunded: '訂單已取消，尚未退款',
    paymentREQUESTING: '建立付款中',
    paymentPENDING: '等待顧客付款',
    paymentCONFIRMING: '確認付款中',
    paymentUNKNOWN: '付款待確認',
    paymentPAID: '已付款',
    paymentCANCELLED: '已取消付款',
    paymentFAILED: '付款失敗',
    paymentREFUND_PENDING: '退款處理中',
    paymentREFUNDED: '已退款',
    paymentREFUND_FAILED: '退款失敗，待處理',
    liveLoading: '正在載入訂單...',
    liveLoadError: '無法連線至伺服器，已切換為契約範例資料',
    dataSourceFixture: '契約範例資料',
    dataSourceLive: '即時 API：{tenant}'
  },
  vi: {
    sandboxBadge: 'Môi trường thử nghiệm POS (Tách biệt)',
    sandboxTitle: 'Lịch sử & Chi tiết đơn (Kiểm chứng React + TypeScript)',
    sandboxSubtitle: 'Trang cô lập dùng để kiểm chứng Vite build, CSS scope, đa ngôn ngữ và chuẩn chạm 48px.',
    switchLang: 'Chuyển sang 繁體中文',
    historySearchPlaceholder: 'Tìm mã đơn / tên khách / số bàn...',
    historyFilterAll: 'Tất cả',
    historyFilterDineIn: 'Tại bàn',
    historyFilterTakeaway: 'Mang về',
    btnClearFilter: 'Xóa bộ lọc',
    historyClearSearch: 'Xóa tìm kiếm',
    btnExpandAll: 'Mở tất cả',
    btnCollapseAll: 'Thu gọn',
    todayTag: 'Hôm nay',
    orderUnit: 'đơn',
    loading: 'Đang tải...',
    historyTitle: 'Lịch sử đơn hàng',
    historySub: 'Đơn hàng 30 ngày gần nhất (theo ngày)',
    emptyHistory: 'Chưa có lịch sử đơn hàng',
    historyNoSearchResults: 'Không tìm thấy đơn hàng phù hợp',
    historyNoSearchResultsSub: 'Vui lòng thử từ khóa khác hoặc xóa bộ lọc',
    historyOlderTitle: 'Xem đơn hàng trên 30 ngày',
    historyOlderSub: 'Quý khách cần xuất báo cáo hoặc tra cứu lịch sử vui lòng liên hệ đội ngũ BLAB',
    btnContactBlab: 'Liên hệ BLAB',
    badgePicked: 'ĐÃ LẤY',
    badgePaid: 'ĐÃ THANH TOÁN',
    badgeRejected: 'ĐÃ HỦY',
    badgeDineIn: 'Ăn tại quán',
    badgeTakeaway: 'Mang đi',
    badgeModifiedOrder: 'Đã đổi món',
    badgeAppendRound: 'Đợt {n}',
    dineInTimeLabel: 'Thời gian gửi đơn',
    pickupLabel: 'Lấy:',
    btnView: 'Xem',
    defaultCustomer: 'Khách',
    searchLabel: 'Tìm kiếm lịch sử đơn hàng',
    filterGroupLabel: 'Lọc theo hình thức đơn',
    btnClose: 'Đóng',
    detailModalTitle: 'Chi tiết đơn hàng (Chỉ đọc)',
    totalLabel: 'Tổng cộng',
    itemsSummaryLabel: 'Nội dung món',
    tablePrefix: 'Bàn {table}',
    tableInline: 'Bàn {table}',
    paymentUnrefunded: 'Đã hủy — chưa hoàn tiền',
    paymentREQUESTING: 'Đang tạo thanh toán',
    paymentPENDING: 'Chờ khách thanh toán',
    paymentCONFIRMING: 'Đang xác nhận thanh toán',
    paymentUNKNOWN: 'Đang xác minh thanh toán',
    paymentPAID: 'Đã thanh toán',
    paymentCANCELLED: 'Đã hủy thanh toán',
    paymentFAILED: 'Thanh toán thất bại',
    paymentREFUND_PENDING: 'Đang hoàn tiền',
    paymentREFUNDED: 'Đã hoàn tiền',
    paymentREFUND_FAILED: 'Hoàn tiền thất bại, cần xử lý',
    liveLoading: 'Đang tải lịch sử đơn...',
    liveLoadError: 'Không thể kết nối API, đang hiển thị dữ liệu mẫu',
    dataSourceFixture: 'Dữ liệu mẫu chuẩn DTO',
    dataSourceLive: 'Dữ liệu API: {tenant}'
  }
} as const satisfies Record<PosLocale, Record<string, string>>;

export type PosTranslationKey = keyof typeof POS_DICTIONARY['zh-TW'];

/** Resolves localized string with compile-time parity between zh-TW and vi. */
export function translatePos(
  locale: PosLocale,
  key: PosTranslationKey,
  params?: Record<string, string | number>
): string {
  const table: Record<PosTranslationKey, string> = POS_DICTIONARY[locale];
  let message = table[key];
  if (params) {
    for (const [paramKey, paramValue] of Object.entries(params)) {
      message = message.replaceAll(`{${paramKey}}`, String(paramValue));
    }
  }
  return message;
}

export function getAllPosTranslationKeys(): PosTranslationKey[] {
  return Object.keys(POS_DICTIONARY['zh-TW']) as PosTranslationKey[];
}

export function hasMatchingDictionaryKeys(): boolean {
  const zhKeys = Object.keys(POS_DICTIONARY['zh-TW']).sort();
  const viKeys = Object.keys(POS_DICTIONARY.vi).sort();
  return zhKeys.length === viKeys.length && zhKeys.every((key, index) => key === viKeys[index]);
}
