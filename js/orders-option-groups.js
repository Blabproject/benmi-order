/* One isolated draft and route stack for product / shared option-group editing. */
(() => {
  const translations = {
    vi: {
      ugProduct: "Chỉnh sửa món",
      ugProductOptions: "Tùy chọn món",
      ugSaveProductOptions: "Lưu tùy chọn",
      ugNewProduct: "Thêm món",
      ugGroup: "Chỉnh sửa nhóm",
      ugNewGroup: "Thêm nhóm tùy chọn",
      ugEditOption: "Chỉnh sửa lựa chọn",
      ugNewOption: "Thêm lựa chọn",
      ugSaveOption: "Lưu lựa chọn",
      ugRemoveOption: "Gỡ khỏi nhóm",
      ugSourceOption: "Lựa chọn được tự động lấy từ phân loại. Bạn có thể tạm ngừng lựa chọn trong nhóm.",
      ugConditions: "Điều kiện áp dụng",
      ugDiscardTitle: "Bỏ thay đổi chưa lưu?",
      ugDeleteTitle: "Xác nhận xóa",
      ugSubName: "Tên lựa chọn con",
      ugSubEmpty: "Chưa có lựa chọn con",
      ugAddSub: "Thêm lựa chọn con",
      ugDetails: "Thông tin",
      ugName: "Tên",
      ugNewGroupTitle: "Tạo nhóm tùy chọn",
      ugSelectScopeIntro: "Chọn loại nhóm tùy chọn bạn muốn tạo:",
      ugScope: "Phân loại nhóm",
      ugScopeItem: "Tùy chọn cho món",
      ugScopeItemDesc: "Áp dụng cho từng món riêng lẻ",
      ugScopeOrder: "Tùy chọn toàn cục",
      ugScopeOrderDesc: "Áp dụng cho cả đơn hàng",
      ugScopeDisabledHelp: "Nhóm đang có lựa chọn liên kết từ món, không thể chuyển sang tùy chọn toàn đơn.",
      ugManualCustomize: "Tự bấm tùy chỉnh",
      ugCategory: "Phân loại",
      ugPrice: "Giá bán",
      ugBadge: "Nhãn",
      ugGroups: "Nhóm tùy chọn",
      ugRules: "Quy tắc",
      ugRequired: "Bắt buộc chọn ít nhất một lựa chọn",
      ugRequiredHelp: "Bật để khách chọn tuỳ chọn khi thêm món. Tắt để thêm món ngay vào giỏ; khách có thể bấm Tuỳ chọn bên dưới món để chỉnh sau.",
      ugMin: "Số lượng tối thiểu",
      ugMax: "Số lượng tối đa",
      ugRuleInteger: "Nhập số nguyên từ {min} đến 999.",
      ugRuleRange: "Số lượng tối đa phải lớn hơn hoặc bằng tối thiểu.",
      ugRuleRangeMin: "Số lượng tối thiểu không được lớn hơn số lượng tối đa.",
      ugRuleRangeMax: "Số lượng tối đa phải lớn hơn hoặc bằng số lượng tối thiểu.",
      ugRuleOptionCountMin: "Số lượng tối thiểu không thể lớn hơn số lựa chọn trong nhóm (hiện có {count} lựa chọn).",
      ugRuleOptionCountMax: "Số lượng tối đa không thể lớn hơn số lựa chọn trong nhóm (hiện có {count} lựa chọn).",
      ugGroupNoOptions: "Nhóm tùy chọn phải có ít nhất 1 lựa chọn.",
      ugRepeat: "Cho phép chọn nhiều phần của cùng một lựa chọn",
      ugIncluded: "Có sẵn trong món",
      ugOptions: "Lựa chọn",
      ugLinked: "Món áp dụng",
      ugLink: "Liên kết món",
      ugAdd: "Thêm lựa chọn",
      ugAddGroup: "Thêm nhóm",
      ugFromProducts: "Từ món có sẵn",
      ugFromProductsHelp: "Chọn món trong thực đơn và đặt phụ thu riêng.",
      ugCustom: "Tùy chọn tự tạo",
      ugCustomHelp: "Tạo lựa chọn mới cho nhóm này.",
      ugCustomStatus: "Tự tạo",
      ugLinkedStatus: "Liên kết",
      ugLinkedHelp: "Tên và trạng thái hết món được đồng bộ từ thực đơn. Phụ thu được đặt riêng cho lựa chọn này.",
      ugOriginalPrice: "Giá gốc",
      ugMissingProduct: "Món liên kết không còn trong thực đơn",
      ugSurcharge: "Phụ thu trong nhóm",
      ugRetail: "Giá bán lẻ",
      ugQuantity: "Số phần có sẵn",
      ugDefault: "Chọn sẵn",
      ugExplain: "Giải thích",
      ugDefaultHelp: "Tự chọn lựa chọn này khi khách mở món. Khách có thể đổi theo quy tắc của nhóm. Phụ thu vẫn được tính nếu có.",
      ugLocalStockHelp: "Tạm thời không cho khách chọn lựa chọn này trong nhóm. Áp dụng cho mọi món dùng nhóm này và giữ cấu hình để bật lại. Món liên kết vẫn có thể bán riêng hoặc dùng trong nhóm khác.",
      ugInherited: "Từ phân loại",
      ugDefaults: "Dùng lại mặc định",
      ugOwn: "Danh sách riêng cho món",
      ugChoose: "Chọn",
      ugSearch: "Tìm kiếm",
      ugSelectAllCategory: "Chọn toàn bộ món trong nhóm",
      ugToggleCategory: "Mở rộng hoặc thu gọn nhóm món",
      ugOther: "Khác",
      ugSearchGroups: "Tìm nhóm",
      ugClearGroupSearch: "Xóa từ khóa tìm nhóm",
      ugNoMatchingGroups: "Không tìm thấy nhóm phù hợp",
      ugNoGroups: "Chưa có nhóm tùy chọn",
      ugOrderSection: "Tùy chọn toàn đơn",
      ugItemSection: "Tùy chọn theo món",
      ugGroupSurcharge: "Phụ thu",
      ugAppliesToOrder: "Áp dụng cho cả đơn hàng",
      ugAll: "Tất cả phân loại",
      ugSaveProduct: "Lưu món",
      ugSaveGroup: "Lưu nhóm",
      ugApply: "Áp dụng",
      ugBack: "Quay lại",
      ugClose: "Đóng",
      ugDelete: "Xóa",
      ugCancel: "Tiếp tục chỉnh",
      ugDiscard: "Bỏ thay đổi",
      ugUnsaved: "Bạn có thay đổi chưa lưu.",
      ugError: "Chưa lưu được. Dữ liệu của bạn vẫn được giữ lại.",
      ugConflict:
        "Dữ liệu đã được cập nhật ở nơi khác. Đóng bản nháp và tải lại trước khi lưu.",
      ugInvalid: "Kiểm tra tên, giá và quy tắc chọn.",
      ugInsufficient: "Danh sách lựa chọn chưa đủ số lượng tối thiểu của nhóm.",
      ugAffected: "Thay đổi áp dụng cho {count} món",
      ugEmpty: "Chưa có lựa chọn",
      ugRemoveGroup: "Gỡ nhóm khỏi món",
      ugSoldOut: "Hết món",
      ugPhoto: "Ảnh món",
      ugUploading: "Đang tải ảnh…",
      ugSaving: "Đang lưu…",
      ugCycle: "Liên kết này tạo vòng lặp giữa các món.",
      ugCycleGroupBlocked: "Không thể chọn do tạo vòng lặp (món này nằm trong nhóm)",
      ugSub: "Lựa chọn con",
      ugSources: "Tự động lấy món từ phân loại",
      ugSourceHint: "Nhóm luôn có các món trong phân loại đã chọn.",
      ugRemove: "Gỡ",
      ugDeleteConfirm: "Xóa đối tượng này và các liên kết của nó?",
      ugOrderGroups: "Tùy chọn cho cả đơn",
      ugAdvanced: "Cấu hình khác",
      ugDescription: "Mô tả",
      ugCategoryLinks: "Áp dụng mặc định cho phân loại",
      ugMinimumSubtotal: "Giá trị món tối thiểu để chọn",
      ugRuleMessage: "Thông báo khi chưa đủ điều kiện",
      ugLocalStock: "Tạm ngừng lựa chọn trong nhóm",
      ugRemovePhoto: "Gỡ ảnh",
      ugInUse: "Món đang được dùng làm lựa chọn. Gỡ liên kết trước khi xóa.",
    },
    "zh-TW": {
      ugProduct: "編輯餐點",
      ugProductOptions: "餐點選項",
      ugSaveProductOptions: "儲存餐點選項",
      ugNewProduct: "新增餐點",
      ugGroup: "編輯選項群組",
      ugNewGroup: "新增選項群組",
      ugEditOption: "編輯選項",
      ugNewOption: "新增選項",
      ugSaveOption: "儲存選項",
      ugRemoveOption: "從群組移除",
      ugSourceOption: "此選項會自動從分類加入。您可以暫停此群組內的選項。",
      ugConditions: "適用條件",
      ugDiscardTitle: "放棄尚未儲存的變更？",
      ugDeleteTitle: "確認刪除",
      ugSubName: "子選項名稱",
      ugSubEmpty: "尚無子選項",
      ugAddSub: "新增子選項",
      ugDetails: "詳細資料",
      ugName: "名稱",
      ugNewGroupTitle: "建立選項群組",
      ugSelectScopeIntro: "請選擇欲建立的選項群組類型：",
      ugScope: "群組類型",
      ugScopeItem: "餐點選項",
      ugScopeItemDesc: "套用至個別餐點",
      ugScopeOrder: "整筆訂單選項",
      ugScopeOrderDesc: "套用至整筆訂單",
      ugScopeDisabledHelp: "此群組內含有來自餐點的選項，無法變更為整筆訂單選項。",
      ugManualCustomize: "手動自訂",
      ugCategory: "分類",
      ugPrice: "售價",
      ugBadge: "標籤",
      ugGroups: "選項群組",
      ugRules: "選擇規則",
      ugRequired: "顧客必須選擇至少一個選項",
      ugRequiredHelp: "開啟時，加入餐點會先顯示選項視窗。關閉時，餐點直接加入購物車，顧客可點選餐點下方的「選項」再調整。",
      ugMin: "最少選擇數量",
      ugMax: "最多選擇數量",
      ugRuleInteger: "請輸入 {min} 至 999 的整數。",
      ugRuleRange: "最多選擇數量必須大於或等於最少選擇數量。",
      ugRuleRangeMin: "最少選擇數量不可大於最多選擇數量。",
      ugRuleRangeMax: "最多選擇數量必須大於或等於最少選擇數量。",
      ugRuleOptionCountMin: "最少選擇數量不可大於群組內的選項數量（目前有 {count} 個選項）。",
      ugRuleOptionCountMax: "最多選擇數量不可大於群組內的選項數量（目前有 {count} 個選項）。",
      ugGroupNoOptions: "選項群組必須至少包含一個選項。",
      ugRepeat: "允許重複選擇同一選項",
      ugIncluded: "餐點已包含的內容",
      ugOptions: "選項",
      ugLinked: "適用餐點",
      ugLink: "連結餐點",
      ugAdd: "新增選項",
      ugAddGroup: "新增群組",
      ugFromProducts: "從現有餐點選擇",
      ugFromProductsHelp: "從菜單選取餐點並設定群組內的加價。",
      ugCustom: "自訂選項",
      ugCustomHelp: "為此群組建立新的選項。",
      ugCustomStatus: "自訂",
      ugLinkedStatus: "已連結",
      ugLinkedHelp: "名稱與售完狀態會與菜單同步，此子選項的加價可獨立設定。",
      ugOriginalPrice: "原價",
      ugMissingProduct: "連結的餐點已不在菜單中",
      ugSurcharge: "群組內加價",
      ugRetail: "單點售價",
      ugQuantity: "已包含份數",
      ugDefault: "預設選取",
      ugExplain: "說明",
      ugDefaultHelp: "顧客開啟餐點時會自動選取此選項。顧客可依群組規則更改選擇；若有加價，仍會計入金額。",
      ugLocalStockHelp: "暫時不讓顧客在此群組選取此選項，適用於所有使用此群組的餐點。設定會保留，方便重新啟用；連結的餐點仍可單點販售或用於其他群組。",
      ugInherited: "來自分類",
      ugDefaults: "恢復預設",
      ugOwn: "此餐點專用選項",
      ugChoose: "選擇",
      ugSearch: "搜尋",
      ugSelectAllCategory: "選取該分類全部餐點",
      ugToggleCategory: "展開或收合分類",
      ugOther: "其他",
      ugSearchGroups: "搜尋群組",
      ugClearGroupSearch: "清除群組搜尋",
      ugNoMatchingGroups: "找不到符合的群組",
      ugNoGroups: "尚無選項群組",
      ugOrderSection: "整筆訂單選項",
      ugItemSection: "餐點選項",
      ugGroupSurcharge: "加價",
      ugAppliesToOrder: "適用整筆訂單",
      ugAll: "所有分類",
      ugSaveProduct: "儲存餐點",
      ugSaveGroup: "儲存群組",
      ugApply: "套用",
      ugBack: "返回",
      ugClose: "關閉",
      ugDelete: "刪除",
      ugCancel: "繼續編輯",
      ugDiscard: "放棄變更",
      ugUnsaved: "您有尚未儲存的變更。",
      ugError: "儲存失敗，您的編輯內容仍然保留。",
      ugConflict: "資料已在其他地方更新。請關閉草稿並重新載入後再儲存。",
      ugInvalid: "請檢查名稱、價格及選擇規則。",
      ugInsufficient: "選項數量不足以符合群組的最少選擇數量。",
      ugAffected: "變更將套用至 {count} 個餐點",
      ugEmpty: "尚無選項",
      ugRemoveGroup: "從餐點移除群組",
      ugSoldOut: "已售完",
      ugPhoto: "餐點圖片",
      ugUploading: "正在上傳圖片…",
      ugSaving: "正在儲存…",
      ugCycle: "此連結會造成餐點之間的循環。",
      ugCycleGroupBlocked: "無法選取（此餐點已在此群組內，選取會形成循環）",
      ugSub: "子選項",
      ugSources: "自動加入分類中的餐點",
      ugSourceHint: "群組會持續包含所選分類中的餐點。",
      ugRemove: "移除",
      ugDeleteConfirm: "刪除此項目及其連結？",
      ugOrderGroups: "整筆訂單選項",
      ugAdvanced: "其他設定",
      ugDescription: "說明",
      ugCategoryLinks: "分類預設群組",
      ugMinimumSubtotal: "選取所需的最低餐點金額",
      ugRuleMessage: "未符合條件時的提示",
      ugLocalStock: "暫停此群組內的選項",
      ugRemovePhoto: "移除圖片",
      ugInUse: "此餐點仍被選項群組使用，請先移除連結再刪除。",
    },
  };
  for (const lang of Object.keys(translations))
    Object.assign(I18N[lang], translations[lang]);
  const esc = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const tr = (key, args) => t(key, args);
  let catalog = null,
    state = null,
    selectedGroup = null,
    groupQuery = "",
    catalogTenant = null,
    returnFocus = null;
  const normalizeSearch = (value) =>
    String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().replace(/đ/g, "d").trim();
  const groupSectionsOpen = { order: true, item: true };
  const uid = (kind) =>
    `${getTenantIdFromUrl()}_${kind}_${crypto.randomUUID()}`;
  const groupById = (id) => catalog.groups.find((g) => g.id === id);
  const productById = (id) => catalog.products.find((p) => p.id === id);
  function options(group) {
    const result = clone(group.options || []);
    const seen = new Set(result.map((o) => o.productId).filter(Boolean));
    for (const source of group.sources || []) {
      for (const product of catalog.products || []) {
        const matches =
          source.type === "category"
            ? product.category_id === (source.refId || source.categoryId)
            : source.type === "item_list" && source.itemIds?.includes(product.id);
        if (!matches || seen.has(product.id)) continue;
        seen.add(product.id);
        result.push({
          id: `source:${group.id}:${product.id}`,
          name: product.name,
          productId: product.id,
          price: Number(group.metadata?.legacySurcharges?.[product.id] || 0),
          quantity: 1,
          isDefault: false,
          isOutOfStock: false,
          outOfStockUntil: null,
          subOptions: [],
          eligibilityRules: [],
          description: null,
          fromSource: true,
        });
      }
    }
    return result.map((o) => {
      const p = productById(o.productId);
      return {
        ...o,
        name: p?.name || o.name,
        retailPrice: p?.price,
        isOutOfStock:
          o.isOutOfStock ||
          o.isLocallyOutOfStock ||
          (o.outOfStockUntil && Date.parse(o.outOfStockUntil) > Date.now()) ||
          Boolean(
            p?.is_out_of_stock ||
            (p?.out_of_stock_until &&
              Date.parse(p.out_of_stock_until) > Date.now()),
          ),
      };
    });
  }
  function productGroups(product) {
    const direct = product.links || [];
    return direct
      .filter((l) => !l.disabled)
      .map((l) => ({
        group: groupById(l.groupId),
        link: l,
        inherited: false,
      }))
      .filter((v) => v.group && v.group.scope !== "order");
  }
  function insufficient(group, link) {
    const available = options(group).filter(
      (o) => !Array.isArray(link.optionIds) || link.optionIds.includes(o.id),
    );
    const count = group.included
      ? available.reduce((n, o) => n + Number(o.quantity || 1), 0)
      : available.length;
    return group.included
      ? count !== group.minSelection || !count
      : group.minSelection > 0 &&
          (!count || (!group.allowRepeats && count < group.minSelection));
  }
  function rule(group) {
    const [min, max] = selectionRules(group);
    return `${tr("ugChoose")} ${min === max ? min : `${min}–${max}`}`;
  }
  function affectedIds(group) {
    const ids =
      group.itemIds ||
      catalog.links
        .filter((l) => l.groupId === group.id && !l.disabled)
        .map((l) => l.itemId);
    return [...new Set(ids)];
  }
  const affected = (group) => affectedIds(group).length;
  const sortedIds = (ids) => [...new Set(ids || [])].sort();
  const stable = (value) => JSON.stringify(value, (_, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v).sort().map((key) => [key, v[key]]))
      : v,
  );
  function optionValues(o) {
    return {
      id: o.id,
      productId: o.productId || null,
      name: o.productId ? "" : String(o.name || "").trim(),
      price: Number(o.price || 0),
      quantity: Number(o.quantity ?? 1),
      isDefault: Boolean(o.isDefault),
      isLocallyOutOfStock: Boolean(o.isLocallyOutOfStock),
      outOfStockUntil: o.outOfStockUntil || null,
      description: o.description || "",
      subOptions: (o.subOptions || []).map((s) => ({
        ...(s.id ? { id: s.id } : {}),
        ...(s.productId ? { productId: s.productId } : {}),
        name: s.productId ? "" : String(typeof s === "string" ? s : s.name || "").trim(),
        price: Number(typeof s === "string" ? 0 : s.price || 0),
      })),
      eligibilityRules: (o.eligibilityRules || []).map((r) => r.rule_type === "min_order_subtotal"
        ? { ...r, min_order_subtotal: Number(r.min_order_subtotal || 0), error_message: r.error_message || "", threshold_basis: r.threshold_basis || "merchandise_subtotal" }
        : r).filter((r) => r.rule_type !== "min_order_subtotal" || r.min_order_subtotal || r.error_message),
    };
  }
  function selectionRules(group) {
    if (!group.included) return [group.minSelection, group.maxSelection];
    const count = options(group).reduce((sum, o) => sum + Number(o.quantity || 1), 0);
    return [count, count];
  }
  function entitySnapshot(kind, d) {
    if (kind === "product") return stable({
      name: String(d.name || "").trim(), price: Number(d.price), categoryId: d.categoryId,
      badgeText: d.badgeText || "", isRecommended: Boolean(d.isRecommended),
      imageKey: d.imageKey, imageDraft: d.imageDraft || null,
      links: (d.links || []).map((l) => ({ groupId: l.groupId, disabled: Boolean(l.disabled), optionIds: l.optionIds === null ? null : sortedIds(l.optionIds) })).sort((a, b) => a.groupId.localeCompare(b.groupId)),
    });
    return stable({
      name: String(d.name || "").trim(),
      scope: d.scope === "order" ? "order" : "item",
      minSelection: d.included ? null : d.minSelection,
      maxSelection: d.included ? null : d.maxSelection,
      allowRepeats: Boolean(d.allowRepeats), included: Boolean(d.included),
      autoPopup: d.scope === "item" ? Boolean(d.included || Number(d.minSelection) > 0) : null,
      options: (d.options || []).map(optionValues),
      itemIds: sortedIds(d.itemIds), categoryIds: [],
      sources: [],
    });
  }
  function routeSnapshot(r) {
    if (r.page === "option") return stable(optionValues(r.option));
    if (r.page === "subset") return stable(r.optionIds === null ? null : sortedIds(r.optionIds));
    if (r.ids) return stable(sortedIds(r.ids));
    return "";
  }
  const routeChanged = (r) => routeSnapshot(r) !== r.original;
  const hasChanges = () => entitySnapshot(state.kind, state.draft) !== state.original ||
    [state.route, ...state.stack.map((v) => v.route)].some(routeChanged);
  function prepareRoute(route) {
    route.original = routeSnapshot(route);
    if (route.page === "subset") route.originalOptionIds = clone(route.optionIds);
    return route;
  }
  function rememberView() {
    if (!state) return;
    const el = ensureDrawer(), body = el.querySelector(".ug-body"), active = document.activeElement;
    state.route.view = {
      scroll: body.scrollTop,
      details: [...body.querySelectorAll("details[data-section]")].filter((e) => e.open).map((e) => e.dataset.section),
      focus: active?.dataset.field ? `[data-field="${active.dataset.field}"]` :
        active?.dataset.action ? `[data-action="${active.dataset.action}"]${active.dataset.index ? `[data-index="${active.dataset.index}"]` : ""}` : null,
      search: body.querySelector('[data-field="search"]')?.value || "",
      filter: body.querySelector('[data-field="filter"]')?.value || "",
      openCategories: [...body.querySelectorAll(".ug-category-card.ug-category-open")].map((c) => c.dataset.category),
    };
  }
  function sourceContains(group, option) {
    return false;
  }
  const btn = (action, label, attrs = "") =>
    `<button type="button" data-action="${action}" ${attrs}>${esc(tr(label))}</button>`;
  const field = (key, label, value, type = "text", extra = "") =>
    `<label class="ug-field"><span>${esc(tr(label))}</span><input data-field="${key}" type="${type}" value="${esc(value)}" ${extra}></label>`;
  const toggle = (key, label, value, help, extra = "") => {
    const id = `ug-${key.replace(/\./g, "-")}`;
    // Keep the help button outside the switch label so reading help cannot toggle it.
    // Help-circle SVG: Feather Icons (MIT).
    return `<div class="ug-rule ${help ? "ug-rule-help" : ""}"><div class="ug-rule-label"><label for="${id}">${esc(tr(label))}</label>${help ? `<button type="button" class="ug-help-button" data-action="help" aria-label="${esc(tr("ugExplain"))}: ${esc(tr(label))}" aria-expanded="false" aria-controls="${id}-help"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg></button>` : ""}</div><label class="ug-switch"><input id="${id}" type="checkbox" role="switch" data-field="${key}" ${help ? `aria-describedby="${id}-help"` : ""} ${value ? "checked" : ""} ${extra}><span class="ug-switch-track" aria-hidden="true"></span></label>${help ? `<p id="${id}-help" class="ug-help-text" hidden>${esc(tr(help))}</p>` : ""}</div>`;
  };
  function toggleHelp(button, expanded = button.getAttribute("aria-expanded") !== "true") {
    for (const other of ensureDrawer().querySelectorAll('[data-action="help"]')) {
      const open = other === button && expanded;
      other.setAttribute("aria-expanded", String(open));
      other.closest(".ug-rule").querySelector(".ug-help-text").hidden = !open;
    }
  }
  const stepper = (key, label, value, min = 0) =>
    `<div class="ug-rule-field"><div class="ug-rule"><label for="ug-${key}">${esc(tr(label))}</label><div class="ug-stepper">${btn("step", "ugRemove", `data-key="${key}" data-delta="-1" aria-label="${esc(tr(label))} −"`)}<input id="ug-${key}" aria-label="${esc(tr(label))}" aria-describedby="ug-${key}-error" data-field="${key}" type="number" min="${min}" max="999" step="1" value="${esc(value)}"><button type="button" data-action="step" data-key="${key}" data-delta="1" aria-label="${esc(tr(label))} +">+</button></div></div><p id="ug-${key}-error" class="ug-rule-error" hidden></p></div>`;
  function selectionErrors(d) {
    if (d.included) return {};
    const errors = {}, lower = state.required ? 1 : 0;
    for (const [key, min] of [["minSelection", lower], ["maxSelection", 1]]) {
      const value = d[key];
      if (value === "" || !Number.isInteger(Number(value)) || Number(value) < min || Number(value) > 999)
        errors[key] = tr("ugRuleInteger", { min });
    }
    const optionCount = options(d).length;
    const shouldCheckOptionCount = optionCount > 0 || state.required || Number(d.minSelection) > 0;
    if (!errors.minSelection && !errors.maxSelection) {
      if (Number(d.maxSelection) < Number(d.minSelection)) {
        errors.minSelection = tr("ugRuleRangeMin");
        if (!d.allowRepeats && shouldCheckOptionCount && Number(d.maxSelection) > optionCount) {
          errors.maxSelection = tr("ugRuleOptionCountMax", { count: optionCount });
        } else {
          errors.maxSelection = tr("ugRuleRangeMax");
        }
      } else {
        if (!d.allowRepeats && shouldCheckOptionCount) {
          if (Number(d.minSelection) > optionCount) {
            errors.minSelection = tr("ugRuleOptionCountMin", { count: optionCount });
          }
          if (Number(d.maxSelection) > optionCount) {
            errors.maxSelection = tr("ugRuleOptionCountMax", { count: optionCount });
          }
        }
      }
    }
    return errors;
  }
  function showSelectionErrors(focus = false, target = state?.draft) {
    if (state.kind !== "group" || !target) return true;
    state.ruleErrors = selectionErrors(target);
    const root = ensureDrawer();
    for (const key of ["minSelection", "maxSelection"]) {
      const field = root.querySelector(`[data-field="${key}"]`), error = root.querySelector(`#ug-${key}-error`);
      const message = state.ruleErrors[key] || "";
      if (field) field.setAttribute("aria-invalid", String(Boolean(message)));
      if (error) { error.textContent = message; error.hidden = !message; }
    }
    if (focus) root.querySelector(`[data-field="${Object.keys(state.ruleErrors)[0]}"]`)?.focus();
    return !Object.keys(state.ruleErrors).length;
  }
  const row = (action, title, sub, attrs = "") =>
    `<button type="button" class="ug-row" data-action="${action}" ${attrs}><span><strong>${esc(title)}</strong>${sub ? `<small>${esc(sub)}</small>` : ""}</span><span aria-hidden="true">›</span></button>`;
  // Feather/Lucide SVG paths (MIT); avoid emoji and keep the menu compact.
  const subIcon = (paths) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  function subMenu() {
    const item = (action, title, help, icon) => `<button type="button" class="ug-sub-menu-action" role="menuitem" data-action="${action}"><span class="ug-sub-menu-icon">${subIcon(icon)}</span><span class="ug-sub-menu-copy"><strong>${esc(tr(title))}</strong><small>${esc(tr(help))}</small></span>${subIcon('<path d="m9 5 7 7-7 7"/>')}</button>`;
    return `<div class="ug-sub-add">${btn("add-sub", "ugAddSub", 'id="ug-add-sub" aria-haspopup="menu" aria-expanded="false" aria-controls="ug-sub-menu"')}<div id="ug-sub-menu" class="ug-sub-menu" role="menu" aria-labelledby="ug-add-sub" hidden>${state.draft.scope === "order" ? "" : item("sub-products", "ugFromProducts", "ugFromProductsHelp", '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>')}${item("sub-custom", "ugCustom", "ugCustomHelp", '<path d="M12 5v14M5 12h14"/>')}</div></div>`;
  }
  function toggleSubMenu(open, focus = false) {
    const root = ensureDrawer(), menu = root.querySelector(".ug-sub-menu"), trigger = root.querySelector('[data-action="add-sub"]');
    if (!menu || !trigger) return false;
    if (open === undefined) open = menu.hidden;
    menu.hidden = !open;
    trigger.setAttribute("aria-expanded", String(open));
    if (open) {
      const body = root.querySelector(".ug-body");
      if (body?.getBoundingClientRect) {
        // Keep the trigger visible, even when a short landscape viewport needs menu scrolling.
        menu.style.maxHeight = `${Math.max(80, body.clientHeight - trigger.getBoundingClientRect().height - 18)}px`;
        const overflow = menu.getBoundingClientRect().bottom - body.getBoundingClientRect().bottom + 8;
        if (overflow > 0) body.scrollTop += overflow;
      }
    }
    if (focus) (open ? menu.querySelector('button') : trigger)?.focus({ preventScroll: true });
    return true;
  }
  function subRow(sub, index) {
    const linked = Boolean(sub.productId), product = linked ? productById(sub.productId) : null;
    const name = linked ? product?.name || sub.name || tr("ugMissingProduct") : typeof sub === "string" ? sub : sub.name || "";
    const unavailable = linked && (!product || product.is_out_of_stock || (product.out_of_stock_until && Date.parse(product.out_of_stock_until) > Date.now()));
    const metadata = product ? `#${product.sku || product.id} · ${tr("ugOriginalPrice")} $${Number(product.price || 0)}` : tr("ugMissingProduct");
    return `<div class="ug-sub-option ug-sub-option-compact ${linked ? "ug-sub-option-linked" : ""}"><div class="ug-sub-name"><div class="ug-sub-origin"><span class="ug-sub-origin-copy">${linked ? `${subIcon('<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2"/>')}${esc(tr("ugFromProducts"))}` : esc(tr("ugSubName"))}</span><span class="ug-sub-kind" ${linked ? `title="${esc(tr("ugLinkedHelp"))}"` : ""}>${esc(tr(linked ? "ugLinkedStatus" : "ugCustomStatus"))}</span></div>${linked ? `<small class="ug-sub-source-meta" title="${esc(metadata)}">${esc(metadata)}${unavailable ? ` · ${esc(tr("ugSoldOut"))}` : ""}</small>` : ""}<label class="ug-field"><input data-field="sub.${index}.name" type="text" value="${esc(name)}" aria-label="${esc(tr("ugSubName"))}" ${linked ? 'readonly' : ''}></label></div><label class="ug-field ug-sub-price"><span>${esc(tr("ugGroupSurcharge"))}</span><div class="ug-sub-price-input"><span aria-hidden="true">$</span><input data-field="sub.${index}.price" type="number" value="${esc(typeof sub === "string" ? 0 : sub.price || 0)}" min="0" step="0.01"></div></label>${btn("remove-sub", "ugRemove", `data-index="${index}" aria-label="${esc(tr("ugRemove"))} ${esc(name || tr("ugSub"))}"`)}</div>`;
  }
  function ensureDrawer() {
    let el = document.getElementById("unified-menu-drawer");
    if (el) return el;
    el = document.createElement("div");
    el.id = "unified-menu-drawer";
    el.className = "ug-overlay";
    el.hidden = true;
    el.innerHTML =
      '<section class="ug-drawer" role="dialog" aria-modal="true" aria-labelledby="ug-title" tabindex="-1"><header></header><div class="ug-body"></div><footer></footer><div class="ug-confirmation" hidden></div></section>';
    el.addEventListener("click", (event) => {
      if (!event.target.closest(".ug-sub-add")) {
        const menu = el.querySelector(".ug-sub-menu"), wasOpen = menu && !menu.hidden;
        toggleSubMenu(false);
        if (wasOpen && event.target === el) return;
      }
      if (event.target === el) close();
      const target = event.target.closest("[data-action]");
      if (target) action(target.dataset.action, target);
    });
    el.addEventListener("input", (event) => input(event.target));
    el.addEventListener("focusout", (event) => {
      if (state?.route.page === "group" && ["minSelection", "maxSelection"].includes(event.target.dataset.field)) showSelectionErrors();
    });
    el.addEventListener("change", (event) => {
      if (event.target.type === "checkbox" || event.target.tagName === "SELECT")
        input(event.target);
    });
    el.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        const subMenuEl = el.querySelector(".ug-sub-menu");
        if (subMenuEl && !subMenuEl.hidden) { toggleSubMenu(false, true); return; }
        if (state?.confirm) dismissConfirmation();
        else {
          const help = el.querySelector('[data-action="help"][aria-expanded="true"]');
          if (help) {
            toggleHelp(help, false);
            help.focus({ preventScroll: true });
          } else close();
        }
      }
      const menu = el.querySelector(".ug-sub-menu");
      if (event.target.dataset.action === "add-sub" && ["ArrowDown", "ArrowUp"].includes(event.key)) {
        event.preventDefault();
        toggleSubMenu(true, true);
        if (event.key === "ArrowUp") [...menu.querySelectorAll('button')].at(-1).focus();
        return;
      }
      if (menu && !menu.hidden && event.target.closest(".ug-sub-menu")) {
        const items = [...menu.querySelectorAll('button')];
        const index = items.indexOf(document.activeElement);
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
          items[next].focus();
          return;
        }
        if (event.key === "Tab") toggleSubMenu(false, true);
      }
      if (event.key === "Tab") {
        const root = state?.confirm ? el.querySelector(".ug-confirmation") : el;
        const elements = [
          ...root.querySelectorAll(
            "button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea,summary",
          ),
        ].filter((e) => e.getClientRects().length);
        const first = elements[0],
          last = elements.at(-1);
        if (event.shiftKey && (document.activeElement === first || !elements.includes(document.activeElement))) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    });
    document.body.appendChild(el);
    return el;
  }
  function open(kind, draft, route = { page: kind }) {
    returnFocus = document.activeElement;
    state = {
      kind,
      draft,
      original: entitySnapshot(kind, draft),
      required: Number(draft.minSelection) > 0,
      ruleErrors: {},
      optionsOnly: route.page === "product-options",
      stack: [],
      route: prepareRoute(route),
      busy: false,
      error: "",
      scroll: 0,
    };
    const el = ensureDrawer();
    el.hidden = false;
    for (const sibling of document.body.children)
      if (sibling !== el && !sibling.inert) {
        sibling.dataset.ugInert = "1";
        sibling.inert = true;
      }
    document.body.classList.add("ug-open");
    render(0);
  }
  function finish() {
    dismissConfirmation();
    ensureDrawer().hidden = true;
    state = null;
    document.body.classList.remove("ug-open");
    document.querySelectorAll("[data-ug-inert]").forEach((el) => {
      el.inert = false;
      delete el.dataset.ugInert;
    });
    returnFocus?.focus();
  }
  function close() {
    if (!state || state.busy || state.confirm) return;
    if (hasChanges()) showConfirmation("discard");
    else finish();
  }
  function showConfirmation(kind) {
    const el = ensureDrawer();
    state.confirm = kind;
    state.confirmFocus = document.activeElement;
    for (const part of el.querySelectorAll("header,.ug-body,footer")) part.inert = true;
    el.querySelector(".ug-drawer").setAttribute("aria-modal", "false");
    const box = el.querySelector(".ug-confirmation");
    box.innerHTML = `<div class="ug-confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="ug-confirm-title" aria-describedby="ug-confirm-message"><h3 id="ug-confirm-title">${esc(tr(kind === "discard" ? "ugDiscardTitle" : "ugDeleteTitle"))}</h3><p id="ug-confirm-message">${esc(tr(kind === "discard" ? "ugUnsaved" : "ugDeleteConfirm"))}</p><div class="ug-confirm-actions">${btn("continue", "ugCancel")}${btn(kind === "discard" ? "discard" : "confirm-delete", kind === "discard" ? "ugDiscard" : "ugDelete", 'class="ug-confirm-danger"')}</div></div>`;
    box.hidden = false;
    box.querySelector('[data-action="continue"]').focus();
  }
  function dismissConfirmation() {
    if (!state?.confirm) return;
    const el = ensureDrawer(), focus = state.confirmFocus;
    state.confirm = null;
    el.querySelector(".ug-confirmation").hidden = true;
    for (const part of el.querySelectorAll("header,.ug-body,footer")) part.inert = false;
    el.querySelector(".ug-drawer").setAttribute("aria-modal", "true");
    if (focus?.isConnected) focus.focus({ preventScroll: true });
  }
  function push(route) {
    rememberView();
    state.stack.push({
      route: state.route,
      scroll: ensureDrawer().querySelector(".ug-body").scrollTop,
    });
    state.route = prepareRoute(route);
    state.error = "";
    render(0);
  }
  function back() {
    const prev = state.stack.pop();
    if (!prev) return;
    state.route = prev.route;
    state.error = "";
    render(prev.scroll);
  }
  function productGroupSection(d) {
    const groups = productGroups(d);
    return `<section><div class="ug-section-title"><h3>${esc(tr("ugGroups"))}</h3>${btn("groups", "ugAddGroup")}</div><div class="ug-list">${groups
      .map(({ group: g, link, inherited }) => row(
        "subset",
        g.name,
        `${rule(g)} · ${link.optionIds ? `${options(g).filter((o) => link.optionIds.includes(o.id)).length}/${options(g).length}` : options(g).length} ${tr("ugOptions").toLowerCase()}${insufficient(g, link) ? " · " + tr("ugInsufficient") : ""}`,
        `data-id="${esc(g.id)}"`,
      ))
      .join("") || `<p class="ug-muted">${esc(tr("ugNoGroups"))}</p>`}</div></section>`;
  }
  function render(scroll) {
    if (!state) return;
    if (scroll === undefined) rememberView();
    const el = ensureDrawer(),
      d = state.draft,
      r = state.route;
    let title = tr(state.kind === "product" ? (d.isNew ? "ugNewProduct" : "ugProduct") : (d.isNew ? "ugNewGroup" : "ugGroup")),
      body = "";
    if (r.page === "new-group-scope") {
      title = tr("ugNewGroupTitle");
      body = `<div class="ug-scope-step"><p class="ug-scope-step-intro">${esc(tr("ugSelectScopeIntro"))}</p><div class="ug-scope-step-cards"><button type="button" class="ug-scope-step-card" data-action="select-new-scope" data-scope="item"><div class="ug-scope-step-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/></svg></div><div class="ug-scope-step-info"><strong class="ug-scope-step-title">${esc(tr("ugScopeItem"))}</strong><small class="ug-scope-step-desc">${esc(tr("ugScopeItemDesc"))}</small></div><svg class="ug-scope-step-chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg></button><button type="button" class="ug-scope-step-card" data-action="select-new-scope" data-scope="order"><div class="ug-scope-step-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg></div><div class="ug-scope-step-info"><strong class="ug-scope-step-title">${esc(tr("ugScopeOrder"))}</strong><small class="ug-scope-step-desc">${esc(tr("ugScopeOrderDesc"))}</small></div><svg class="ug-scope-step-chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg></button></div></div>`;
    } else if (r.page === "product") {
      const catOptions = catalog.categories
        .filter((c) => c.category_type === "catalog" || !c.category_type)
        .map(
          (c) =>
            `<option value="${esc(c.id)}" ${d.categoryId === c.id ? "selected" : ""}>${esc(c.name)}</option>`,
        )
        .join("");
      body = `<section class="ug-photo"><div class="ug-photo-frame"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 6-6 4 4 3-3 5 5"/></svg><img ${d.imageKey === "" && !d.imageDraft ? "hidden" : ""} src="${esc(d.imageDraft || `${WORKER_BASE}/api/image?tenant_id=${encodeURIComponent(getTenantIdFromUrl())}&name=${encodeURIComponent(d.imageKey || d.name)}`)}" alt="" onerror="this.hidden=true"></div><div><label class="ug-upload">${esc(tr("ugPhoto"))}<input type="file" accept="image/*" data-field="photo"></label>${btn("remove-photo", "ugRemovePhoto")}</div></section>${field("name", "ugName", d.name)}<label class="ug-field"><span>${esc(tr("ugCategory"))}</span><select data-field="categoryId">${catOptions}</select></label>${field("price", "ugPrice", d.price, "number", 'min="0" step="0.01"')}${field("badgeText", "ugBadge", d.badgeText)}`;
      body += productGroupSection(d) +
        (!d.isNew ? btn("delete", "ugDelete", 'class="ug-danger"') : "");
    } else if (r.page === "product-options") {
      title = d.name;
      body = productGroupSection(d);
    } else if (r.page === "group") {
      const [min, max] = selectionRules(d);
      const isOrder = d.scope === "order";
      body = `<section><h3>${esc(tr("ugDetails"))}</h3>${field("name", "ugName", d.name)}</section><section><h3>${esc(tr("ugRules"))}</h3><div class="ug-list">${toggle("required", "ugRequired", d.included ? min > 0 : state.required, d.scope === "order" || d.included ? null : "ugRequiredHelp")}${d.included || state.required ? stepper("minSelection", "ugMin", min, 1) : ""}${stepper("maxSelection", "ugMax", max, 1)}</div><div class="ug-list">${toggle("allowRepeats", "ugRepeat", d.allowRepeats)}${toggle("included", "ugIncluded", d.included)}</div></section><section><div class="ug-section-title"><h3>${esc(tr("ugOptions"))} (${options(d).length})</h3>${btn("add-option", "ugAdd")}</div><div class="ug-list">${
        options(d)
          .map((o) =>
            row(
              "option",
              o.name,
              `${o.productId ? `${tr("ugRetail")} $${o.retailPrice} · ` : ""}+$${o.price}`,
              `data-id="${esc(o.id)}"`,
            ),
          )
          .join("") || `<p class="ug-muted">${esc(tr("ugEmpty"))}</p>`
      }</div></section>`;
      if (isOrder) {
        body += `<section class="ug-order-scope-notice"><p class="ug-muted">${esc(tr("ugAppliesToOrder"))}</p></section>`;
      } else {
        body += `<section><div class="ug-section-title"><h3>${esc(tr("ugLinked"))} (${affected(d)})</h3>${btn("linked", "ugLink")}</div><div class="ug-linked">${affectedIds(d).map((id) => `<div>${esc(productById(id)?.name || "")}</div>`).join("") || `<span class="ug-muted">${esc(tr("ugEmpty"))}</span>`}</div></section>`;
      }
      body += !d.isNew ? btn("delete", "ugDelete", 'class="ug-danger"') : "";
    } else if (r.page === "groups") {
      title = tr("ugAddGroup");
      body =
        search() +
        `<div class="ug-list">${catalog.groups
          .filter((g) => g.scope !== "order")
          .map((g) => {
            const isCycle = options(g).some((o) => o.productId === d.id);
            const sub = isCycle
              ? tr("ugCycleGroupBlocked")
              : `${rule(g)} · ${options(g).map((o) => o.name).join("、")}`;
            return check(
              g.id,
              g.name,
              sub,
              r.ids.includes(g.id),
              "group",
              "",
              isCycle,
              isCycle ? tr("ugCycle") : ""
            );
          })
          .join("")}</div>`;
    } else if (r.page === "subset") {
      const g = groupById(r.id);
      title = g.name;
      body = `<p class="ug-muted">${esc(rule(g))} · ${esc(tr(r.optionIds === null ? "ugDefaults" : "ugOwn"))}</p>${btn("defaults", "ugDefaults")}<div class="ug-list">${options(
        g,
      )
        .map((o) =>
          check(
            o.id,
            o.name,
            `+$${o.price}${o.isOutOfStock ? " · " + tr("ugSoldOut") : ""}`,
            r.optionIds === null || r.optionIds.includes(o.id),
            "subset",
          ),
        )
        .join(
          "",
        )}</div>${btn("remove-group", "ugRemoveGroup", 'class="ug-danger"')}`;
    } else if (r.page === "add-option") {
      title = tr("ugAdd");
      body =
        (d.scope === "order"
          ? ""
          : row("products", tr("ugFromProducts"), tr("ugFromProductsHelp"))) +
        row("custom", tr("ugCustom"), tr("ugCustomHelp"));
    } else if (r.page === "products" || r.page === "linked" || r.page === "sub-products") {
      title = tr(r.page === "linked" ? "ugLink" : "ugFromProducts");
      const selectableCategories = catalog.categories.filter((c) => (c.category_type || 'catalog') === "catalog");
      const existingSubProducts = r.page === "sub-products" ? state.stack.at(-1).route.option.subOptions?.map((sub) => sub.productId).filter(Boolean) || [] : [];
      const selectableProducts = catalog.products.filter((p) => selectableCategories.some((c) => c.id === p.category_id));
      const uncategorizedProducts = catalog.products.filter((p) => !selectableCategories.some((c) => c.id === p.category_id));
      const renderCategoryCard = (c, products) => {
        if (!products.length) return "";
        const isOpen = Boolean(r.view?.openCategories?.includes(c.id));
        return `<div class="ug-category-card ${isOpen ? "ug-category-open" : ""}" data-category="${esc(c.id)}">` +
          `<div class="ug-category-header">` +
            `<button type="button" class="ug-category-toggle" data-action="toggle-category" data-category="${esc(c.id)}" aria-expanded="${isOpen ? "true" : "false"}" aria-label="${esc(tr("ugToggleCategory"))}: ${esc(c.name)}">` +
              `<svg class="ug-category-chevron" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>` +
              `<span class="ug-category-name">${esc(c.name)}</span>` +
              `<span class="ug-category-count ug-muted">(${products.length})</span>` +
            `</button>` +
            `<label class="ug-category-check" title="${esc(tr("ugSelectAllCategory"))}: ${esc(c.name)}" aria-label="${esc(tr("ugSelectAllCategory"))}: ${esc(c.name)}">` +
              `<input type="checkbox" data-check="category" data-category="${esc(c.id)}">` +
            `</label>` +
          `</div>` +
          `<div class="ug-category-items ug-list" ${isOpen ? "" : "hidden"}>` +
            products.map((p) => {
              const isChecked = existingSubProducts.includes(p.id) || r.ids.includes(p.id);
              const isDisabled = existingSubProducts.includes(p.id);
              return check(p.id, p.name, `${tr("ugRetail")} $${p.price}`, isChecked, "product", p.category_id, isDisabled);
            }).join("") +
          `</div>` +
        `</div>`;
      };
      body =
        search() +
        `<select class="ug-filter" data-field="filter" hidden><option value="">${esc(tr("ugAll"))}</option>${selectableCategories.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("")}</select><div class="ug-category-accordion-list">${selectableCategories.map((c) => {
          const catProducts = selectableProducts.filter((p) => p.category_id === c.id);
          return renderCategoryCard(c, catProducts);
        }).join("")}${uncategorizedProducts.length ? renderCategoryCard({ id: "uncategorized", name: tr("ugOther") }, uncategorizedProducts) : ""}</div>`;
    } else if (r.page === "option") {
      const o = r.option;
      title = tr(r.isNew ? "ugNewOption" : "ugEditOption");
      const p = productById(o.productId);
      body =
        `<p class="ug-option-context">${esc(d.name)}</p><section class="ug-option-details">` +
        (p
          ? `<div class="ug-product-summary"><strong>${esc(p.name)}</strong><small>${esc(tr("ugRetail"))} $${p.price}${p.is_out_of_stock || (p.out_of_stock_until && Date.parse(p.out_of_stock_until) > Date.now()) ? ` · ${esc(tr("ugSoldOut"))}` : ""}</small></div>`
          : field("option.name", "ugName", o.name)) +
        field(
          "option.price",
          "ugSurcharge",
          o.price,
          "number",
          'min="0" step="0.01"',
        ) +
        (d.included
          ? stepper("option.quantity", "ugQuantity", o.quantity, 1)
          : "") +
        `<div class="ug-list ug-option-toggles">${toggle("option.isDefault", "ugDefault", o.isDefault, "ugDefaultHelp")}${toggle("option.isLocallyOutOfStock", "ugLocalStock", o.isLocallyOutOfStock, "ugLocalStockHelp")}</div></section>` +
        `<section class="ug-option-children"><div class="ug-section-title"><h3>${esc(tr("ugSub"))} (${(o.subOptions || []).length})</h3>${subMenu()}</div>${(o.subOptions || []).map(subRow).join("") || `<p class="ug-muted">${esc(tr("ugSubEmpty"))}</p>`}</section>` +
        `<details data-section="conditions"><summary>${esc(tr("ugConditions"))}</summary>${field("eligibility.min_order_subtotal", "ugMinimumSubtotal", (o.eligibilityRules || []).find((r) => r.rule_type === "min_order_subtotal")?.min_order_subtotal || 0, "number", 'min="0" step="0.01"')}${field("eligibility.error_message", "ugRuleMessage", (o.eligibilityRules || []).find((r) => r.rule_type === "min_order_subtotal")?.error_message || "")}</details>` +
        (!r.isNew ? sourceContains(d, o)
          ? `<p class="ug-muted ug-option-source">${esc(tr("ugSourceOption"))}</p>${btn("remove-option", "ugRemoveOption", 'class="ug-option-remove" disabled')}`
          : btn("remove-option", "ugRemoveOption", 'class="ug-option-remove"') : "");
    }
    el.querySelector("header").innerHTML =
      `${state.stack.length && r.page !== "option" ? btn("back", "ugBack") : ""}<h2 id="ug-title" tabindex="-1">${r.page === "product-options" ? `<small class="ug-product-options-label">${esc(tr("ugProductOptions"))}</small>` : ""}${esc(title)}</h2>${btn("close", "ugClose", 'class="ug-close"')}`;
    el.querySelector(".ug-body").classList.toggle("ug-option-body", r.page === "option");
    el.querySelector(".ug-body").classList.toggle("ug-product-options-body", r.page === "product-options");
    el.querySelector(".ug-body").innerHTML = body;
    el.querySelector(".ug-body").inert = state.busy;
    const isScopeStep = r.page === "new-group-scope";
    const footerEl = el.querySelector("footer");
    footerEl.hidden = isScopeStep;
    if (!isScopeStep) {
      const isMainEntityPage = r.page === "group" || r.page === "product" || r.page === "product-options";
      const btnAction = isMainEntityPage ? "save" : (state.stack.length ? "apply" : "save");
      const btnLabel = state.busy ? "ugSaving" :
        isMainEntityPage
          ? (state.optionsOnly ? "ugSaveProductOptions" : state.kind === "product" ? "ugSaveProduct" : "ugSaveGroup")
          : (state.stack.length ? "ugApply" : (r.direct ? "ugSaveOption" : "ugSaveGroup"));
      footerEl.innerHTML =
        `<p class="ug-error" role="alert">${esc(state.error)}</p>${state.kind === "group" && isMainEntityPage ? `<p class="ug-muted">${esc(tr("ugAffected", { count: affected(d) }))}</p>` : ""}${btn(btnAction, btnLabel, `class="ug-primary" ${state.busy ? "disabled" : ""}`)}`;
    }
    if (r.page === "group" && d.included)
      el.querySelectorAll(
        '[data-field="required"],[data-field="minSelection"],[data-field="maxSelection"],[data-field="allowRepeats"],.ug-stepper button',
      ).forEach((b) => (b.disabled = true));
    if (r.page === "group") showSelectionErrors();
    const view = r.view;
    for (const details of el.querySelectorAll("details[data-section]")) details.open = Boolean(view?.details.includes(details.dataset.section));
    const q = el.querySelector('[data-field="search"]'), filter = el.querySelector('[data-field="filter"]');
    if (q) q.value = view?.search || "";
    if (filter) filter.value = view?.filter || "";
    if (q) input(q);
    syncCategoryCheckboxes(el);
    el.querySelector(".ug-body").scrollTop = scroll ?? view?.scroll ?? 0;
    const focus = scroll === undefined && view?.focus ? el.querySelector(view.focus) : null;
    const defaultFocus = (r.page === "new-group-scope" && el.querySelector('[data-action="select-new-scope"]')) ||
      (r.page === "group" && d.isNew && el.querySelector("#ug-name")) ||
      el.querySelector("#ug-title");
    (focus || defaultFocus)?.focus({ preventScroll: true });
    el.querySelectorAll('.ug-stepper button[data-delta="-1"]').forEach(
      (b) => (b.textContent = "−"),
    );
  }
  const search = () =>
    `<input class="ug-search" type="search" data-field="search" placeholder="${esc(tr("ugSearch"))}" aria-label="${esc(tr("ugSearch"))}">`;
  const check = (id, name, sub, checked, kind, category = "", disabled = false, warning = "") =>
    `<label class="ug-check ${disabled ? "ug-check-disabled" : ""}" data-search="${esc(name.toLowerCase())}" data-category="${esc(category)}"><input type="checkbox" data-check="${kind}" value="${esc(id)}" ${checked ? "checked" : ""} ${disabled ? "disabled" : ""}><span><strong>${esc(name)}${warning ? ` <span class="ug-cycle-badge">${esc(warning)}</span>` : ""}</strong><small>${esc(sub)}</small></span></label>`;
  function syncCategoryCheckboxes(root) {
    if (!root || !state || !state.route) return;
    const r = state.route;
    if (!["products", "linked", "sub-products"].includes(r.page)) return;
    const d = state.draft;
    const existingSubProducts = r.page === "sub-products" ? state.stack.at(-1)?.route.option.subOptions?.map((sub) => sub.productId).filter(Boolean) || [] : [];
    root.querySelectorAll(".ug-category-card").forEach((card) => {
      const catId = card.dataset.category;
      const catCheckbox = card.querySelector('[data-check="category"]');
      if (!catCheckbox) return;
      const catProducts = catalog.products.filter((p) => (catId === "uncategorized" ? !catalog.categories.some((c) => c.id === p.category_id) : p.category_id === catId));
      if (!catProducts.length) {
        catCheckbox.checked = false;
        catCheckbox.indeterminate = false;
        return;
      }
      const selectedCount = catProducts.filter((p) => {
        return existingSubProducts.includes(p.id) || r.ids.includes(p.id);
      }).length;
      const selectableProducts = catProducts.filter((p) => {
        return !existingSubProducts.includes(p.id);
      });
      catCheckbox.disabled = selectableProducts.length === 0;
      if (selectedCount === catProducts.length) {
        catCheckbox.checked = true;
        catCheckbox.indeterminate = false;
      } else if (selectedCount > 0) {
        catCheckbox.checked = false;
        catCheckbox.indeterminate = true;
      } else {
        catCheckbox.checked = false;
        catCheckbox.indeterminate = false;
      }
    });
  }
  function input(el) {
    if (!state || state.busy) return;
    const r = state.route,
      d = state.draft,
      key = el.dataset.field;
    if (key === "search" || key === "filter") {
      const root = ensureDrawer(),
        q = root.querySelector('[data-field="search"]').value.toLowerCase().trim(),
        cat = root.querySelector('[data-field="filter"]')?.value;
      const cards = root.querySelectorAll(".ug-category-card");
      if (cards.length) {
        cards.forEach((card) => {
          const cardCat = card.dataset.category;
          if (cat && cardCat !== cat) {
            card.hidden = true;
            return;
          }
          const catNameEl = card.querySelector(".ug-category-name");
          const catName = catNameEl ? catNameEl.textContent.toLowerCase() : "";
          const rows = card.querySelectorAll("[data-search]");
          let visibleCount = 0;
          rows.forEach((row) => {
            const match = !q || row.dataset.search.includes(q) || catName.includes(q);
            row.hidden = !match;
            if (match) visibleCount++;
          });
          card.hidden = q ? visibleCount === 0 : false;
          const items = card.querySelector(".ug-category-items");
          const shouldBeOpen = q ? visibleCount > 0 : Boolean(r.view?.openCategories?.includes(cardCat));
          if (items) items.hidden = !shouldBeOpen;
          card.classList.toggle("ug-category-open", shouldBeOpen);
          card.querySelector(".ug-category-toggle")?.setAttribute("aria-expanded", String(shouldBeOpen));
        });
      } else {
        root.querySelectorAll("[data-search]").forEach((row) => {
          row.hidden =
            !row.dataset.search.includes(q) ||
            Boolean(cat && row.dataset.category !== cat);
        });
      }
      return;
    }
    if (el.dataset.check) {
      if (el.dataset.check === "category") {
        const catId = el.dataset.category;
        const catProducts = catalog.products.filter((p) => (catId === "uncategorized" ? !catalog.categories.some((c) => c.id === p.category_id) : p.category_id === catId));
        const existingSubProducts = r.page === "sub-products" ? state.stack.at(-1)?.route.option.subOptions?.map((sub) => sub.productId).filter(Boolean) || [] : [];
        const selectableProducts = catProducts.filter((p) => {
          return !existingSubProducts.includes(p.id);
        });
        if (el.checked) {
          for (const p of selectableProducts) {
            if (!r.ids.includes(p.id)) r.ids.push(p.id);
          }
        } else {
          const selectableIds = new Set(selectableProducts.map((p) => p.id));
          r.ids = r.ids.filter((id) => !selectableIds.has(id));
        }
        const root = ensureDrawer();
        const card = root.querySelector(`.ug-category-card[data-category="${catId}"]`);
        if (card) {
          card.querySelectorAll('[data-check="product"]').forEach((chk) => {
            if (!chk.disabled) chk.checked = el.checked;
          });
        }
        syncCategoryCheckboxes(root);
        return;
      }
      let list =
        el.dataset.check === "subset"
          ? (r.optionIds ?? options(groupById(r.id)).map((o) => o.id))
          : r.ids;
      list = list.filter((id) => id !== el.value);
      if (el.checked) list.push(el.value);
      if (el.dataset.check === "subset") r.optionIds = list;
      else r.ids = list;
      if (el.dataset.check === "subset" && r.originalOptionIds === null &&
        options(groupById(r.id)).every((o) => list.includes(o.id))) r.optionIds = null;
      syncCategoryCheckboxes(ensureDrawer());
      return;
    }
    if (el.dataset.categoryLink) {
      d.categoryIds = d.categoryIds.filter(
        (id) => id !== el.dataset.categoryLink,
      );
      if (el.checked) d.categoryIds.push(el.dataset.categoryLink);
      return;
    }
    if (el.dataset.source) {
      d.sources = d.sources.filter(
        (s) => (s.refId || s.categoryId) !== el.dataset.source,
      );
      if (el.checked)
        d.sources.push({ type: "category", categoryId: el.dataset.source });
      return;
    }
    if (key === "photo") {
      photo(el.files[0]);
      return;
    }
    if (!key) return;
    const value =
      el.type === "checkbox"
        ? el.checked
        : el.type === "number"
          ? (["minSelection", "maxSelection"].includes(key) && el.value === "" ? "" : Number(el.value))
          : el.value;
    if (key === "required") {
      state.required = Boolean(value);
      d.minSelection = value ? 1 : 0;
      render();
      return;
    }
    if (key.startsWith("eligibility.")) {
      r.option.eligibilityRules = r.option.eligibilityRules || [];
      let rule = r.option.eligibilityRules.find(
        (v) => v.rule_type === "min_order_subtotal",
      );
      if (!rule) {
        rule = {
          rule_type: "min_order_subtotal",
          min_order_subtotal: 0,
          threshold_basis: "merchandise_subtotal",
        };
        r.option.eligibilityRules.push(rule);
      }
      rule[key.slice(12)] = value;
    } else if (key.startsWith("option.")) r.option[key.slice(7)] = value;
    else if (key.startsWith("sub.")) {
      const [, i, k] = key.split(".");
      if (typeof r.option.subOptions[i] === "string")
        r.option.subOptions[i] = { name: r.option.subOptions[i], price: 0 };
      if (k === "name" && r.option.subOptions[i].productId) return;
      r.option.subOptions[i][k] = value;
    } else {
      d[key] = value;
      if (key === "included") render();
      if (key === "scope") {
        if (value === "order") {
          d.itemIds = [];
          d.categoryIds = [];
          d.sources = [];
        }
        render();
      }
      if (["minSelection", "maxSelection", "allowRepeats"].includes(key)) showSelectionErrors();
    }
  }
  function action(name, el) {
    if (!state || state.busy) return;
    if (state.confirm && !["continue", "discard", "confirm-delete"].includes(name)) return;
    const d = state.draft,
      r = state.route;
    if (name === "close") return close();
    if (name === "help") return toggleHelp(el);
    if (name === "back") return back();
    if (name === "discard") return finish();
    if (name === "continue") return dismissConfirmation();
    if (name === "toggle-category") {
      const card = el.closest(".ug-category-card");
      if (!card) return;
      const items = card.querySelector(".ug-category-items");
      const toggleBtn = card.querySelector(".ug-category-toggle");
      if (!items) return;
      const isHidden = items.hidden;
      items.hidden = !isHidden;
      card.classList.toggle("ug-category-open", isHidden);
      if (toggleBtn) {
        toggleBtn.setAttribute("aria-expanded", String(isHidden));
      }
      r.view = r.view || {};
      r.view.openCategories = [...ensureDrawer().querySelectorAll(".ug-category-card.ug-category-open")].map((c) => c.dataset.category);
      return;
    }
    if (name === "select-new-scope") {
      const card = el.closest("[data-scope]");
      const scope = card?.dataset.scope || "item";
      d.scope = scope;
      if (scope === "order") {
        d.itemIds = [];
        d.categoryIds = [];
        d.sources = [];
      }
      d.autoPopup = Boolean(d.included || Number(d.minSelection) > 0);
      return push({ page: "group" });
    }
    if (name === "set-scope") {
      const card = el.closest("[data-scope]");
      const scope = card?.dataset.scope;
      if (card?.disabled || !scope || scope === d.scope) return;
      d.scope = scope;
      if (scope === "order") {
        d.itemIds = [];
        d.categoryIds = [];
        d.sources = [];
      }
      return render();
    }
    if (name === "remove-photo") {
      const prevKey = d.imageKey;
      d.imageDraft = null;
      d.imageKey = "";
      d.removedPhoto = true;
      d.prevImageKey = prevKey;
      if (window._tenantImageList) {
        if (prevKey) window._tenantImageList.delete(prevKey);
        window._tenantImageList.delete(d.name);
        window._tenantImageList.delete(`product:${d.id}`);
        if (d.id) window._tenantImageList.delete(d.id);
        if (d.categoryId) window._tenantImageList.delete(`${d.categoryId}_${d.name}`);
        if (catalog?.categories) {
          for (const cat of catalog.categories) {
            window._tenantImageList.delete(`${cat.id}_${d.name}`);
            if (cat.slug) window._tenantImageList.delete(`${cat.slug}_${d.name}`);
          }
        }
      }
      return render();
    }
    if (name === "groups")
      return push({
        page: "groups",
        ids: productGroups(d).map((v) => v.group.id),
      });
    if (name === "subset") {
      const link = d.links.find((l) => l.groupId === el.dataset.id);
      return push({
        page: "subset",
        id: el.dataset.id,
        optionIds: clone(link?.optionIds ?? null),
      });
    }
    if (name === "defaults") {
      r.optionIds = null;
      return render();
    }
    if (name === "remove-group") {
      d.links = d.links.filter((l) => l.groupId !== r.id);
      d.links.push({ groupId: r.id, optionIds: null, disabled: true });
      return back();
    }
    if (name === "add-option") return push({ page: "add-option" });
    if (name === "products") return push({ page: "products", ids: [] });
    if (name === "linked") return push({ page: "linked", ids: [...d.itemIds] });
    if (name === "custom")
      return push({
        page: "option",
        isNew: true,
        option: {
          id: uid("option"),
          name: "",
          price: 0,
          productId: null,
          quantity: 1,
          isDefault: false,
          subOptions: [],
          eligibilityRules: [],
        },
      });
    if (name === "option") {
      return push({
        page: "option",
        option: clone(options(d).find((o) => o.id === el.dataset.id)),
      });
    }
    if (name === "step") {
      const key = el.dataset.key;
      const target = ensureDrawer().querySelector(`[data-field="${key}"]`);
      target.value = String(Math.min(Number(target.getAttribute("max") || Infinity), Math.max(
        Number(target.getAttribute("min") || 0),
        Number(target.value) + Number(el.dataset.delta),
      )));
      if (key === "minSelection") {
        const newMin = Number(target.value);
        if (newMin > Number(d.maxSelection)) {
          d.maxSelection = newMin;
          const maxTarget = ensureDrawer().querySelector('[data-field="maxSelection"]');
          if (maxTarget) maxTarget.value = String(newMin);
        }
      } else if (key === "maxSelection") {
        const newMax = Number(target.value);
        if (newMax < Number(d.minSelection)) {
          d.minSelection = newMax;
          const minTarget = ensureDrawer().querySelector('[data-field="minSelection"]');
          if (minTarget) minTarget.value = String(newMax);
        }
      }
      input(target);
      return;
    }
    if (name === "add-sub") return toggleSubMenu();
    if (name === "sub-products") return push({ page: "sub-products", ids: [] });
    if (name === "sub-custom") {
      rememberView();
      r.option.subOptions = r.option.subOptions || [];
      r.option.subOptions.push({ id: uid("sub"), name: "", price: 0 });
      render();
      ensureDrawer().querySelector(`[data-field="sub.${r.option.subOptions.length - 1}.name"]`)?.focus();
      return;
    }
    if (name === "remove-sub") {
      rememberView();
      r.option.subOptions.splice(Number(el.dataset.index), 1);
      return render();
    }
    if (name === "remove-option") {
      if (sourceContains(d, r.option)) return;
      if (r.direct) return save(false, true);
      d.options = d.options.filter((o) => o.id !== r.option.id);
      return back();
    }
    if (name === "delete") return showConfirmation("delete");
    if (name === "confirm-delete") {
      dismissConfirmation();
      return save(true);
    }
    if (name === "save") return save();
    if (name === "apply") {
      if (!routeChanged(r)) return back();
      if (r.page === "groups") {
        d.links = d.links.filter((l) => r.ids.includes(l.groupId));
        for (const id of r.ids) {
          let l = d.links.find((l) => l.groupId === id);
          if (l) l.disabled = false;
          else d.links.push({ groupId: id, optionIds: null, disabled: false });
        }
      }
      if (r.page === "subset") {
        const g = groupById(r.id),
          count = g.included
            ? options(g)
                .filter(
                  (o) => r.optionIds === null || r.optionIds.includes(o.id),
                )
                .reduce((n, o) => n + Number(o.quantity || 1), 0)
            : (r.optionIds?.length ?? options(g).length);
        if (
          (g.included && count !== g.minSelection) ||
          (g.minSelection > 0 &&
            (!count || (!g.allowRepeats && count < g.minSelection)))
        ) {
          state.error = tr("ugInsufficient");
          return render();
        }
        d.links = d.links.filter((l) => l.groupId !== r.id);
        d.links.push({
          groupId: r.id,
          optionIds: r.optionIds,
          disabled: false,
        });
      }
      if (r.page === "sub-products") {
        const parent = state.stack.at(-1).route.option;
        parent.subOptions = parent.subOptions || [];
        for (const id of r.ids) {
          const product = productById(id);
          if (product && !parent.subOptions.some((sub) => sub.productId === id))
            parent.subOptions.push({ id: uid("sub"), productId: id, name: product.name, price: 0 });
        }
        return back();
      }
      if (r.page === "linked") d.itemIds = r.ids;
      if (r.page === "products") {
        for (const id of r.ids)
          if (!options(d).some((o) => o.productId === id))
            d.options.push({
              id: uid("option"),
              productId: id,
              name: productById(id).name,
              price: 0,
              quantity: 1,
              subOptions: [],
              eligibilityRules: [],
            });
        back();
        return back();
      }
      if (r.page === "option") {
        if (!commitOption(d)) return render();
        back();
        if (state.route.page === "add-option") return back();
        return;
      }
      return back();
    }
  }
  function commitOption(target) {
    const r = state.route, o = r.option;
    if ((!o.productId && !String(o.name || "").trim()) || !Number.isFinite(o.price) || o.price < 0 ||
      !Number.isInteger(Number(o.quantity ?? 1)) || Number(o.quantity ?? 1) < 1 ||
      (o.subOptions || []).some((s) => (s.productId ? !productById(s.productId) : !String(typeof s === "string" ? s : s.name || "").trim()) ||
        (typeof s !== "string" && (!Number.isFinite(Number(s.price)) || Number(s.price) < 0)))) {
      state.error = tr("ugInvalid");
      return false;
    }
    if (!routeChanged(r) && !r.isNew) return true;
    const value = clone(o);
    delete value.retailPrice;
    delete value.imageUrl;
    delete value.isOutOfStock;
    value.fromSource = false;
    const index = target.options.findIndex((v) => v.id === value.id);
    if (index >= 0) target.options[index] = value;
    else target.options.push(value);
    return true;
  }
  async function photo(file) {
    if (!file?.type.startsWith("image/")) return;
    const bitmap = await createImageBitmap(file),
      scale = Math.min(1, 900 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas
      .getContext("2d")
      .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    state.draft.imageKey = `product:${state.draft.id}`;
    state.draft.imageDraft = canvas.toDataURL("image/webp", 0.85);
    render();
  }
  async function save(remove = false, removeOption = false) {
    if (!remove && !removeOption && !hasChanges()) return finish();
    // A direct option editor never writes its temporary edits into the parent
    // snapshot. Failed requests can be retried, changed or reverted safely.
    const d = state.route.direct || (state.kind === "group" && state.draft.included)
      ? clone(state.draft) : state.draft;
    if (state.route.direct) {
      if (removeOption) d.options = d.options.filter((o) => o.id !== state.route.option.id);
      else if (!commitOption(d)) return render();
    }
    if (state.kind === "group" && d.included) {
      const [min, max] = selectionRules(d);
      // Normalize the outgoing copy, never the draft during rendering.
      d.minSelection = min;
      d.maxSelection = max;
    }
    if (state.kind === "group" && d.scope === "item") {
      d.autoPopup = Boolean(d.included || Number(d.minSelection) > 0);
    }
    return persist(d, remove, removeOption);
  }
  async function persist(d, remove, removeOption = false) {
    if (!remove && !removeOption && state.kind === "group") {
      const optionCount = options(d).length;
      if (optionCount === 0) {
        const msg = tr("ugGroupNoOptions");
        state.error = msg;
        render();
        if (typeof alert === "function") alert(msg);
        return;
      }
      if (!showSelectionErrors(true, d)) {
        const firstKey = Object.keys(state.ruleErrors)[0];
        const msg = state.ruleErrors[firstKey] || tr("ugInvalid");
        state.error = msg;
        render();
        if (typeof alert === "function") alert(msg);
        return;
      }
    }
    if (
      !remove &&
      (!d.name.trim() ||
        (state.kind === "product" &&
          (!Number.isFinite(d.price) || d.price < 0)) ||
        (state.kind === "group" &&
          (d.minSelection < 0 || d.maxSelection < Math.max(1, d.minSelection))))
    ) {
      state.error = tr("ugInvalid");
      return render();
    }
    if (
      !remove &&
      state.kind === "product" &&
      productGroups(d).some(({ group, link }) => insufficient(group, link))
    ) {
      state.error = tr("ugInsufficient");
      return render();
    }
    state.busy = true;
    state.error = "";
    render();
    try {
      const res = await fetch(
        `${WORKER_BASE}/api/menu/${state.kind === "product" ? "product" : "option-group"}?tenant_id=${encodeURIComponent(getTenantIdFromUrl())}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...d, delete: remove }),
        },
      );
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "MENU_SAVE_FAILED");
      const kind = state.kind;
      catalog = result.catalog;
      if (d.imageDraft && !remove) {
        const imageRes = await fetch(
          `${WORKER_BASE}/api/image?tenant_id=${encodeURIComponent(getTenantIdFromUrl())}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: d.imageKey, dataUri: d.imageDraft }),
          },
        );
        if (!imageRes.ok) {
          d.revision = catalog.products.find(
            (p) => p.id === d.id,
          )?.menu_revision;
          throw new Error("IMAGE_SAVE_FAILED");
        }
      } else if (!d.imageDraft && !d.imageKey && state.kind === "product") {
        if (window._tenantImageList) {
          if (d.prevImageKey) window._tenantImageList.delete(d.prevImageKey);
          window._tenantImageList.delete(d.name);
          window._tenantImageList.delete(`product:${d.id}`);
          if (d.id) window._tenantImageList.delete(d.id);
          if (d.categoryId) window._tenantImageList.delete(`${d.categoryId}_${d.name}`);
          if (catalog?.categories) {
            for (const cat of catalog.categories) {
              window._tenantImageList.delete(`${cat.id}_${d.name}`);
              if (cat.slug) window._tenantImageList.delete(`${cat.slug}_${d.name}`);
            }
          }
        }
      }
      rebase(kind, d.id, remove, state.optionsOnly);
      if (kind === "group" && !remove) {
        selectedGroup = d.id;
        if (d.scope) groupSectionsOpen[d.scope] = true;
      } else if (kind === "group" && remove && typeof setMenuMobileView === "function") {
        setMenuMobileView("master");
      }
      const focusId = returnFocus?.id;
      finish();
      renderMenuCategories();
      renderMenuCategoryEditor(activeCategoryIndex);
      checkMenuDirty();
      if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
    } catch (error) {
      state.busy = false;
      state.error = tr(
        error.message === "PRODUCT_IS_LINKED"
          ? "ugInUse"
          : error.message.startsWith("INVALID_")
            ? "ugInvalid"
            : error.message === "MENU_CONFLICT"
              ? "ugConflict"
              : error.message.includes("CYCLE")
                ? "ugCycle"
                : error.message.includes("INSUFFICIENT")
                  ? "ugInsufficient"
                  : "ugError",
      );
      render();
    }
  }
  function rebase(kind, id, remove, optionsOnly = false) {
    const saved = JSON.parse(savedMenuSnapshot || "[]");
    for (const data of [currentMenuData, saved]) {
      if (kind === "product") {
        if (optionsOnly) {
          // Saving links must preserve inline product edits and their baseline.
          for (const c of data) {
            const item = c.items?.find((p) => p.id === id);
            if (item) item.menuRevision = productById(id)?.menu_revision;
          }
          continue;
        }
        let old, oldCategory, oldIndex;
        for (const c of data) {
          const i = c.items?.findIndex((p) => p.id === id);
          if (i >= 0) {
            oldCategory = c;
            oldIndex = i;
            old = c.items.splice(i, 1)[0];
            break;
          }
        }
        const p = productById(id);
        if (p && !remove) {
          const c = data.find(
            (c) => (c.databaseId || c.catId) === p.category_id,
          );
          c?.items.splice(c === oldCategory ? oldIndex : c.items.length, 0, {
            ...old,
            id: p.id,
            name: p.name,
            originalName: p.name,
            price: p.price,
            badgeText: p.badge_text || "",
            isRecommended: Boolean(p.is_recommended),
            imageKey: p.image_key || null,
            imageUrl: p.image_key ? old?.imageUrl : null,
            itemType: "standard",
            bundleRule: null,
            modifierGroups: [],
            menuRevision: p.menu_revision,
          });
        }
      } else
        for (const c of data)
          if (c.groups) {
            const i = c.groups.findIndex((g) => (g.canonicalId || g.id) === id);
            if (i >= 0) {
              if (remove) c.groups.splice(i, 1);
              else {
                const g = groupById(id);
                c.groups[i] = {
                  ...c.groups[i],
                  title: g.name,
                  options: g.options,
                  minSelection: g.minSelection,
                  maxSelection: g.maxSelection,
                  isRequired: g.minSelection > 0,
                };
              }
            }
          }
    }
    savedMenuSnapshot = canonicalMenuSnapshot(saved);
  }
  window.UnifiedMenu = {
    get enabled() {
      return Boolean(catalog);
    },
    imageKey(catId, name) {
      return catalog?.products.find(
        (p) =>
          p.name === name &&
          (p.category_id === catId ||
            catalog.categories.some(
              (c) => c.id === p.category_id && c.slug === catId,
            )),
      )?.image_key;
    },
    groupCount(id) {
      const p = productById(id);
      return p
        ? productGroups({
            categoryId: p.category_id,
            links: catalog.links.filter((l) => l.itemId === id),
          }).length
        : 0;
    },
    async load() {
      const tenantId = getTenantIdFromUrl();
      const res = await fetch(
        `${WORKER_BASE}/api/menu/options?tenant_id=${encodeURIComponent(tenantId)}`,
      );
      if (!res.ok) throw new Error("MENU_UNAVAILABLE");
      catalog = await res.json();
      if (catalogTenant !== tenantId) {
        selectedGroup = null;
        groupQuery = "";
        groupSectionsOpen.order = groupSectionsOpen.item = true;
        catalogTenant = tenantId;
      }
    },
    product(cIdx, iIdx, entry) {
      syncMenuDataFromDOM();
      const c = currentMenuData[cIdx],
        local = c?.items?.[iIdx],
        p = local ? productById(local.id) : null;
      if (!c) return;
      const optionsOnly = entry === "options" && Boolean(p);
      open("product", {
        id: local?.id || uid("product"),
        isNew: !p,
        // The options-only entry writes links against the server revision;
        // unrelated inline name/price drafts remain in the menu workspace.
        name: optionsOnly ? p.name : local?.name || "",
        price: Number(optionsOnly ? p.price : local?.price || 0),
        categoryId: p?.category_id || c.databaseId || c.catId,
        badgeText: (optionsOnly ? p.badge_text : local?.badgeText) || "",
        isRecommended: Boolean(optionsOnly ? p.is_recommended : local?.isRecommended),
        revision: Number(p?.menu_revision || 0),
        links: clone(catalog.links.filter((l) => l.itemId === local?.id)),
        imageKey:
          optionsOnly ? p.image_key : p?.image_key ??
          (local ? `${c.id}_${local.originalName || local.name}` : null),
      }, { page: optionsOnly ? "product-options" : "product" });
    },
    group(id, entry, optionId, defaultScope) {
      const g = groupById(id);
      const current = groupById(selectedGroup);
      const scope = g ? (g.scope === "order" ? "order" : "item") : (defaultScope || (current?.scope === "order" ? "order" : "item"));
      const totalOptions = g ? options(g).length : 0;
      let initialMax = g ? g.maxSelection : 1;
      if (g && !g.allowRepeats && totalOptions > 0 && initialMax > totalOptions && (!g.maxSelection || initialMax >= 99)) {
        initialMax = totalOptions;
      }
      const draft =
        g
          ? {
              ...clone(g),
              maxSelection: initialMax,
              scope,
              autoPopup: Boolean(g.included || Number(g.minSelection) > 0),
              isNew: false,
              categoryIds: [],
              sources: [],
              itemIds: catalog.links.filter((l) => l.groupId === id && !l.disabled).map((l) => l.itemId),
            }
          : {
              id: uid("group"), isNew: true, name: "", scope, minSelection: 0,
              maxSelection: 1, allowRepeats: false, included: false,
              autoPopup: false,
              options: [], sources: [], labels: {}, revision: 0, itemIds: [], categoryIds: [],
            };
      const option = g && entry === "option" ? options(draft).find((o) => o.id === optionId) : null;
      const initialRoute = g
        ? (option ? { page: "option", option: clone(option), direct: true } : { page: "group" })
        : (entry === "group" ? { page: "group" } : { page: "new-group-scope" });
      open(
        "group",
        draft,
        initialRoute,
      );
      if (g && entry === "add-option") push({ page: "add-option" });
      if (g && entry === "linked") push({ page: "linked", ids: [...state.draft.itemIds] });
    },
    sidebar() {
      if (!catalog || menuSidebarTab !== "options") return false;
      const root = document.getElementById("menu-categories");
      if (!root) return false;
      if (!groupById(selectedGroup))
        selectedGroup = (catalog.groups.find((g) => g.scope !== "order") || catalog.groups[0])?.id;
      root.classList.add("is-option-groups");
      root.innerHTML =
        `<div class="ug-group-navigation">${btn("new-group", "ugNewGroup")}<div class="ug-group-search"><input type="search" id="ug-group-search" value="${esc(groupQuery)}" placeholder="${esc(tr("ugSearchGroups"))}" aria-label="${esc(tr("ugSearchGroups"))}"><button type="button" data-action="clear-search" aria-label="${esc(tr("ugClearGroupSearch"))}" ${groupQuery ? "" : "hidden"}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div></div><div class="ug-group-list">` +
        ["order", "item"]
          .map((scope) => {
            const groups = catalog.groups.filter((g) => (g.scope === "order" ? "order" : "item") === scope);
            return `<details class="ug-group-section" data-group-scope="${scope}" ${groupSectionsOpen[scope] ? "open" : ""}><summary class="ug-group-section-heading"><span>${esc(tr(scope === "order" ? "ugOrderSection" : "ugItemSection"))}</span><span class="ug-group-section-count">${groups.length}</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg></summary><div class="ug-group-section-cards">${groups.map((g) =>
              `<button type="button" class="menu-option-card ${selectedGroup === g.id ? "active" : ""}" data-group="${esc(g.id)}" aria-pressed="${selectedGroup === g.id}"><span class="menu-option-card-content"><strong>${esc(g.name)}</strong><small>${options(g).length} ${esc(tr("ugOptions"))}</small></span><span aria-hidden="true">›</span></button>`,
            ).join("") || `<p class="ug-group-section-empty ug-muted">${esc(tr("ugNoGroups"))}</p>`}</div></details>`;
          })
          .join("") + `<p class="ug-group-empty ug-muted" role="status" hidden></p></div>`;
      root.querySelectorAll("[data-group-scope]").forEach((section) => {
        section.querySelector("summary").onclick = (event) => {
          event.preventDefault();
          section.open = !section.open;
          // Search expansion is temporary and must not replace manual state.
          if (!normalizeSearch(groupQuery)) groupSectionsOpen[section.dataset.groupScope] = section.open;
        };
      });
      root.querySelector('[data-action="new-group"]').onclick = () => {
        this.group();
      };
      const input = root.querySelector("#ug-group-search");
      input.oninput = () => {
        groupQuery = input.value;
        this.filterGroups();
      };
      root.querySelector('[data-action="clear-search"]').onclick = () => {
        groupQuery = "";
        input.value = "";
        this.filterGroups();
        input.focus();
      };
      root.querySelectorAll("[data-group]").forEach(
        (b) =>
          (b.onclick = () => {
            selectedGroup = b.dataset.group;
            root.querySelectorAll("[data-group]").forEach((card) => {
              card.classList.toggle("active", card.dataset.group === selectedGroup);
              card.setAttribute("aria-pressed", card.dataset.group === selectedGroup);
            });
            this.workspace();
            if (typeof setMenuMobileView === "function") {
              setMenuMobileView("detail");
            }
          }),
      );
      this.filterGroups();
      this.workspace();
      return true;
    },
    filterGroups() {
      const root = document.getElementById("menu-categories");
      const query = normalizeSearch(groupQuery);
      let visible = 0;
      root.querySelectorAll("[data-group]").forEach((card) => {
        card.hidden = !normalizeSearch(groupById(card.dataset.group)?.name || "").includes(query);
        if (!card.hidden) visible++;
      });
      root.querySelectorAll("[data-group-scope]").forEach((section) => {
        const hasMatches = [...section.querySelectorAll("[data-group]")].some((card) => !card.hidden);
        section.hidden = Boolean(query) && !hasMatches;
        section.open = query ? hasMatches : groupSectionsOpen[section.dataset.groupScope];
      });
      const empty = root.querySelector(".ug-group-empty");
      empty.hidden = !query || visible > 0;
      empty.textContent = tr("ugNoMatchingGroups");
      root.querySelector('[data-action="clear-search"]').hidden = !groupQuery;
    },
    workspace() {
      if (!catalog || menuSidebarTab !== "options") return false;
      const root = document.getElementById("menu-editor-body");
      if (!root) return true;
      const group =
        groupById(selectedGroup) ||
        catalog.groups.find((g) => g.scope !== "order") || catalog.groups[0];
      selectedGroup = group?.id;
      const footer = document.getElementById("menu-editor-footer");
      if (footer) footer.style.display = "none";
      for (const id of [
        "btn-category-rename",
        "btn-category-delete",
        "btn-menu-create-unified",
      ]) {
        const b = document.getElementById(id);
        if (b) {
          b.style.display = "none";
          b.hidden = true;
        }
      }
      const catActions = document.getElementById("cat-title-actions");
      if (catActions) {
        catActions.style.display = "none";
        catActions.hidden = true;
      }
      document.getElementById("menu-editor-title").textContent =
        group?.name || tr("ugGroups");
      root.classList.remove("is-catalog");
      root.classList.add("is-option-workspace");
      const edit = document.getElementById("btn-option-group-edit");
      edit.hidden = !group;
      edit.setAttribute("aria-label", tr("ugGroup"));
      edit.title = tr("ugGroup");
      edit.onclick = () => this.group(group.id);
      const add = document.getElementById("btn-option-add");
      add.hidden = !group;
      add.querySelector("span").textContent = tr("ugAdd");
      add.onclick = () => this.group(group.id, "add-option");
      const ids = group ? affectedIds(group) : [];
      root.innerHTML = group
        ? `<div class="ug-workspace"><div class="ug-workspace-linked"><div><strong>${esc(group.scope === "order" ? tr("ugAppliesToOrder") : `${tr("ugLinked")} (${ids.length})`)}</strong>${group.scope !== "order" && ids.length ? `<span>${esc(ids.map((id) => productById(id)?.name).filter(Boolean).join("、"))}</span>` : ""}</div>${group.scope !== "order" ? btn("linked", "ugLink") : ""}</div><p class="ug-workspace-rule ug-muted">${esc(rule(group))}${group.allowRepeats ? ` · ${esc(tr("ugRepeat"))}` : ""}${group.included ? ` · ${esc(tr("ugIncluded"))}` : ""}${group.scope !== "order" && group.autoPopup === false ? ` · ${esc(tr("ugManualCustomize"))}` : ""}</p><div class="ug-workspace-options">${options(
            group,
          )
            .map(
              (o) =>
                `<button type="button" id="ug-option-${esc(o.id)}" class="ug-row" data-action="option" data-id="${esc(o.id)}"><span class="ug-option-copy"><strong>${esc(o.name)}</strong><small class="ug-option-prices"><span>${esc(tr("ugGroupSurcharge"))} +$${esc(o.price)}</span>${o.productId ? `<span>${esc(tr("ugRetail"))} $${esc(o.retailPrice)}</span>` : ""}</small></span><span class="ug-option-trailing">${o.isOutOfStock ? `<span class="ug-muted">${esc(tr("ugSoldOut"))}</span>` : ""}<span aria-hidden="true">›</span></span></button>`,
            )
            .join("") || `<p class="ug-workspace-empty ug-muted">${esc(tr("ugEmpty"))}</p>`}</div></div>`
        : `<p class="ug-workspace-empty ug-muted">${esc(tr("ugNoGroups"))}</p>`;
      root
        .querySelector('[data-action="linked"]')
        ?.addEventListener("click", () => this.group(group.id, "linked"));
      root.querySelectorAll('[data-action="option"]').forEach((button) => {
        button.onclick = () => this.group(group.id, "option", button.dataset.id);
      });
      return true;
    },
  };
})();
