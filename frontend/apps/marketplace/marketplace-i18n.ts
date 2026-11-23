import type {
  MarketplaceCuisineFilter,
  MarketplaceLocale,
  MarketplaceRegionFilter
} from '@shared/contracts/marketplace';

export interface MarketplaceTranslation {
  pageTitle: string;
  brandTitle: string;
  brandSubtitle: string;
  searchPlaceholder: string;
  clearSearchAria: string;
  locateMe: string;
  locateTitle: string;
  locating: string;
  located: string;
  locationDenied: string;
  langSwitchTitle: string;
  langLabel: string;
  viewList: string;
  viewMap: string;
  regionAll: string;
  regionTucheng: string;
  regionXindian: string;
  regionBanqiao: string;
  regionXinzhuang: string;
  regionTaichung: string;
  cuisineAll: string;
  cuisineVietnamese: string;
  cuisineTaiwanese: string;
  cuisineSnack: string;
  onlyOpen: string;
  loadingStores: string;
  loadErrorTitle: string;
  loadErrorDesc: string;
  retryLoad: string;
  storesFoundPrefix: string;
  storesFoundSuffix: string;
  noStoresFound: string;
  noStoresDesc: string;
  clearFilters: string;
  openNow: string;
  closed: string;
  busy: string;
  distanceKm: string;
  distanceM: string;
  btnDetails: string;
  btnOrder: string;
  modalCloseAria: string;
  modalHours: string;
  modalAddress: string;
  modalDirections: string;
  modalDelivery: string;
  modalDiningDineIn: string;
  modalDiningTakeaway: string;
  modalDiningScheduled: string;
  recenterMap: string;
  defaultLocation: string;
  days: readonly string[];
  dayRest: string;
  todayRest: string;
  todayHours: string;
  todayLabel: string;
}

export const MARKETPLACE_DICTIONARY: Record<MarketplaceLocale, MarketplaceTranslation> = {
  'zh-TW': {
    pageTitle: 'Blab 美食探索 | 多店家線上點餐平台',
    brandTitle: 'Blab 美食探索',
    brandSubtitle: '探索全台優質合作店家與線上點餐',
    searchPlaceholder: '搜尋店家名稱、地址、料理類別...',
    clearSearchAria: '清除搜尋',
    locateMe: '尋找附近',
    locateTitle: '尋找離我最近的店家',
    locating: '定位中...',
    located: '已定位',
    locationDenied: '無法取得您的位置',
    langSwitchTitle: '切換語言 / Switch language',
    langLabel: '繁體中文',
    viewList: '列表',
    viewMap: '地圖',
    regionAll: '全部地區',
    regionTucheng: '土城',
    regionXindian: '新店',
    regionBanqiao: '板橋',
    regionXinzhuang: '新莊',
    regionTaichung: '台中',
    cuisineAll: '全部料理',
    cuisineVietnamese: '越式料理',
    cuisineTaiwanese: '台式小吃',
    cuisineSnack: '點心炸物',
    onlyOpen: '僅顯示營業中',
    loadingStores: '載入店家資料中...',
    loadErrorTitle: '無法載入店家資料',
    loadErrorDesc: '請確認網路連線後再試一次。',
    retryLoad: '重新載入',
    storesFoundPrefix: '共找到 ',
    storesFoundSuffix: ' 家店家',
    noStoresFound: '找不到符合條件的店家',
    noStoresDesc: '請嘗試調整搜尋關鍵字或清除篩選條件。',
    clearFilters: '清除篩選條件',
    openNow: '營業中',
    closed: '休息中',
    busy: '忙碌中',
    distanceKm: '{dist} 公里',
    distanceM: '{dist} 公尺',
    btnDetails: '店家詳情',
    btnOrder: '線上點餐',
    modalCloseAria: '關閉店家資訊',
    modalHours: '營業時間',
    modalAddress: '店家地址',
    modalDirections: 'Google 地圖導航',
    modalDelivery: '外送與訂餐說明',
    modalDiningDineIn: '支援內用點餐',
    modalDiningTakeaway: '支援外帶自取',
    modalDiningScheduled: '支援預約取餐',
    recenterMap: '重設地圖',
    defaultLocation: '台灣',
    days: ['週日', '週一', '週二', '週三', '週四', '週五', '週六'],
    dayRest: '公休',
    todayRest: '今日公休',
    todayHours: '今日 {hours}',
    todayLabel: '今日'
  },
  vi: {
    pageTitle: 'Blab Discovery | Khám phá quán ngon & Đặt món trực tuyến',
    brandTitle: 'Blab Discovery',
    brandSubtitle: 'Khám phá quán ngon & Đặt món trực tuyến',
    searchPlaceholder: 'Tìm tên quán, địa chỉ, loại món ăn...',
    clearSearchAria: 'Xóa tìm kiếm',
    locateMe: 'Quán gần tôi',
    locateTitle: 'Tìm quán gần vị trí của bạn',
    locating: 'Đang định vị...',
    located: 'Đã định vị',
    locationDenied: 'Không thể truy cập GPS',
    langSwitchTitle: 'Chuyển ngôn ngữ / 切換語言',
    langLabel: 'Tiếng Việt',
    viewList: 'Danh Sách',
    viewMap: 'Bản Đồ',
    regionAll: 'Tất cả',
    regionTucheng: 'Thổ Thành',
    regionXindian: 'Tân Điếm',
    regionBanqiao: 'Bản Kiều',
    regionXinzhuang: 'Tân Trang',
    regionTaichung: 'Đài Trung',
    cuisineAll: 'Tất cả món',
    cuisineVietnamese: 'Món Việt & Bánh Mì',
    cuisineTaiwanese: 'Món Đài Loan',
    cuisineSnack: 'Đồ Ăn Vặt',
    onlyOpen: 'Chỉ quán đang mở',
    loadingStores: 'Đang tải danh sách quán...',
    loadErrorTitle: 'Không thể tải danh sách quán',
    loadErrorDesc: 'Vui lòng kiểm tra kết nối mạng và thử lại.',
    retryLoad: 'Thử lại',
    storesFoundPrefix: 'Tìm thấy ',
    storesFoundSuffix: ' quán',
    noStoresFound: 'Không tìm thấy quán phù hợp',
    noStoresDesc: 'Vui lòng thử từ khóa khác hoặc xóa bộ lọc để xem tất cả quán.',
    clearFilters: 'Xóa bộ lọc',
    openNow: 'Đang mở cửa',
    closed: 'Đã đóng cửa',
    busy: 'Đang bận',
    distanceKm: '{dist} km',
    distanceM: '{dist} m',
    btnDetails: 'Xem chi tiết',
    btnOrder: 'Vào đặt món',
    modalCloseAria: 'Đóng thông tin quán',
    modalHours: 'Giờ mở cửa',
    modalAddress: 'Địa chỉ quán',
    modalDirections: 'Chỉ đường Google Maps',
    modalDelivery: 'Chính sách giao hàng',
    modalDiningDineIn: 'Ăn tại quán',
    modalDiningTakeaway: 'Mang về',
    modalDiningScheduled: 'Hẹn giờ lấy',
    recenterMap: 'Toàn bộ bản đồ',
    defaultLocation: 'Đài Loan',
    days: ['Chủ Nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'],
    dayRest: 'Nghỉ',
    todayRest: 'Hôm nay nghỉ',
    todayHours: 'Hôm nay: {hours}',
    todayLabel: 'Hôm nay'
  }
};

export const REGION_FILTERS: ReadonlyArray<{
  value: MarketplaceRegionFilter;
  labelKey: keyof MarketplaceTranslation;
}> = [
  { value: 'all', labelKey: 'regionAll' },
  { value: 'tucheng', labelKey: 'regionTucheng' },
  { value: 'xindian', labelKey: 'regionXindian' },
  { value: 'banqiao', labelKey: 'regionBanqiao' },
  { value: 'xinzhuang', labelKey: 'regionXinzhuang' },
  { value: 'taichung', labelKey: 'regionTaichung' }
];

export const CUISINE_FILTERS: ReadonlyArray<{
  value: MarketplaceCuisineFilter;
  labelKey: keyof MarketplaceTranslation;
}> = [
  { value: 'all', labelKey: 'cuisineAll' },
  { value: 'vietnamese', labelKey: 'cuisineVietnamese' },
  { value: 'taiwanese', labelKey: 'cuisineTaiwanese' },
  { value: 'snack', labelKey: 'cuisineSnack' }
];

export function formatMarketplaceText(
  template: string,
  params?: Record<string, string | number>
): string {
  if (!params) return template;
  return Object.entries(params).reduce(
    (acc, [key, value]) => acc.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value)),
    template
  );
}

export function formatDistanceLabel(
  distKm: number | null | undefined,
  locale: MarketplaceLocale
): string {
  if (distKm == null || Number.isNaN(distKm)) return '';
  const dict = MARKETPLACE_DICTIONARY[locale];
  if (distKm < 1) {
    return formatMarketplaceText(dict.distanceM, { dist: Math.round(distKm * 1000) });
  }
  return formatMarketplaceText(dict.distanceKm, { dist: distKm.toFixed(1) });
}

export function resolveCuisineLabel(
  cuisineType: string | null | undefined,
  locale: MarketplaceLocale
): string {
  const dict = MARKETPLACE_DICTIONARY[locale];
  switch (cuisineType) {
    case 'vietnamese':
      return dict.cuisineVietnamese;
    case 'taiwanese':
      return dict.cuisineTaiwanese;
    case 'snack':
      return dict.cuisineSnack;
    case 'all':
    case '':
    case null:
    case undefined:
      return dict.cuisineAll;
    default:
      return cuisineType;
  }
}
