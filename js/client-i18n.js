// ==========================================
// Benmi Client Menu - Modular Internationalization (I18N) Package
// ==========================================
(function (global) {
    'use strict';

    var SUPPORTED_LOCALES = ['zh-TW', 'en', 'vi'];
    var LOCALE_SHORT_LABELS = {
        'zh-TW': '中文',
        'en': 'EN',
        'vi': 'VI'
    };
    var LOCALE_NATIVE_LABELS = {
        'zh-TW': '繁體中文',
        'en': 'English',
        'vi': 'Tiếng Việt',
        'ja': '日本語',
        'ko': '한국어',
        'th': 'ภาษาไทย',
        'id': 'Bahasa Indonesia'
    };

    var CLIENT_I18N = {
        'zh-TW': {
            page_default_title: '線上點餐',
            page_store_title: '{brand} 點餐',
            fallback_brand_generic: '線上點餐',
            fallback_brand_benmi: '本米',
            tenant_unknown_title: '無法確認店家',
            tenant_unknown_desc: '請返回原本的店家連結，再次開啟並登入 LINE。',
            edit_loading_title: '正在載入訂單內容',
            edit_loading_sub: '正在確認剩餘餐點與金額，請稍候...',
            desktop_guest: '顧客',
            desktop_logged_in: '已登入',
            desktop_login_prompt: '請先登入 LINE 帳號以開始選購餐點',
            desktop_login_btn: 'LINE 帳號登入',
            center_auth_title: '請登入 LINE 帳號開始點餐',
            center_auth_desc: '登入後即可自訂餐點口味、加入購物車並即時接收餐點製作與取餐通知。',
            center_auth_btn: '使用 LINE 帳號一鍵登入',
            desktop_qr_title: '請使用手機 LINE 掃碼點餐',
            desktop_qr_desc: '為了確保能即時接收製作進度通知與優惠，本門市僅支援手機 LINE 點餐。',
            status_open: '營業中',
            status_closed: '休息中',
            status_today_closed: '今日打烊',
            status_paused: '暫停接單',
            status_busy: '繁忙中 (+1h)',
            waiting_ahead: '前方排隊：',
            waiting_orders_unit: ' 單',
            hours_label: '營業時間',
            lang_label: '語言',
            lang_select_aria: '選擇介面與菜單語言',
            hours_loading: '載入中...',
            hours_expand: '展開',
            hours_collapse: '收合',
            hours_today: '今日',
            hours_today_prefix: '今天',
            hours_tomorrow: '明天',
            hours_day_after: '後天',
            hours_tomorrow_short: '明日',
            hours_off: '公休',
            hours_today_off: '今日公休',
            hours_shop_off: '店休',
            hours_shop_closed_short: '已打烊',
            hours_next_day: '隔日',
            hours_reserved_badge: '預約',
            days_short: ['週日', '週一', '週二', '週三', '週四', '週五', '週六'],
            banner_paused_title: '店家目前暫停接單中',
            banner_paused_desc: '目前門市暫不接受新訂單，敬請見諒！',
            banner_closed_desc: '店家今日已打烊，暫不接受新訂單',
            banner_busy_title: '門市繁忙中（製作時間 +1 小時）',
            banner_busy_desc: '現場訂單較多，新訂單取餐時間預計延長 1 小時，感謝您的體諒！',
            banner_append_title: '正在加點餐點',
            banner_append_desc: '正在為 <strong id="append-mode-table">{table}</strong> (<span id="append-mode-key">{key}</span>) 加點',
            banner_append_new_btn: '✕ 建立新單',
            banner_table_label: '內用桌號：',
            banner_table_desc: '掃碼點餐專屬通道，餐點將送至您的座位',
            banner_edit_title: '已移除售完餐點',
            banner_edit_desc: '訂單 <strong id="edit-order-mode-key">{key}</strong> 部分品項售完，請直接調整購物車更換餐點',
            dining_takeaway: '外帶自取',
            dining_dinein: '店內用餐',
            dining_method_label: '用餐方式',
            checkout_cart_title: '購物車清單',
            cart_empty: '(目前沒有已選商品)',
            pickup_time_title: '取餐時間',
            order_time_title: '點餐時間',
            table_number_label: '用餐桌號',
            table_required_badge: '必填 (送餐依據)',
            table_placeholder: '請輸入桌號 (例如: 1, 05, A2, B3...)',
            pickup_eta_label: '預計取餐時間',
            pickup_tap_change: '點擊修改',
            pickup_aria_select: '選擇取餐時間',
            pickup_default_primary: '最快取餐 (店家即刻製作)',
            pickup_default_secondary: '今日取餐 · 點擊更改時間',
            pickup_select_prompt_primary: '請選擇預計取餐時間',
            pickup_select_prompt_secondary: '點擊選擇取餐日期與時段',
            pickup_asap_primary: '最快取餐 (約 {time})',
            pickup_asap_sec_prep: '{day} · 備餐約 {min} 分鐘',
            pickup_asap_sec_now: '{day} · 店家即刻備餐',
            pickup_slot_primary: '{time} 取餐',
            pickup_slot_sec: '{day} · 預約時段',
            dinein_live_title: '現場內用・即時製作',
            dinein_live_badge: '現點現做',
            dinein_order_time_label: '點餐時間：',
            dinein_live_note: '※ 訂單送出後廚房將立即依照排單順序為您製作，出餐時請留意叫號或您的取餐號碼。',
            asap_mode_title: '即時排隊製作模式',
            asap_mode_badge: '現場排單',
            asap_mode_time_label: '預計下單時間：',
            asap_mode_note: '※ 訂單送出後將以當前時間排單，門市人員會依序儘速為您新鮮現做。',
            asap_busy_suffix: '{time}（門市繁忙：約 1 小時後完成）',
            pickup_open_first: '開店首批取餐 (約 {time})',
            pickup_eta_busy: '門市繁忙：最快約 {min} 分鐘後可取餐 ({time})',
            pickup_eta_minutes: '預計約 {min} 分鐘後可取餐 ({time})',
            pickup_eta_now: '即刻取餐 ({time})',
            other_requests_title: '其他要求',
            note_placeholder: '請填寫您的備注',
            powered_by_tagline: 'LINE 智慧點餐系統 ↗',
            payment_method_title: '付款方式',
            payment_linepay_description: '線上付款',
            payment_counter_title: '現場櫃台結帳',
            payment_counter_description: '用餐完畢後至櫃台結帳',
            payment_pickup_description: '領取餐點時再付款',
            btn_pay_with_linepay: '前往 LINE Pay 付款',
            btn_submit_order: '確認下單',
            btn_submit_append: '確認加點',
            btn_go_checkout: '前往結帳',
            btn_select_items_first: '請先選擇餐點',
            empty_cart_hint: '請先將餐點加入購物車。',
            btn_store_paused: '店家目前暫停接單',
            btn_store_closed: '今日已打烊',
            btn_sold_out: '餐點已售完',
            btn_validating: '驗證餐點中...',
            btn_order_submitted: '訂單已送出',
            btn_append_submitted: '加點已送出',
            btn_edit_updated: '品項已更新',
            btn_edit_loading: '載入訂單中...',
            btn_edit_failed: '訂單載入失敗，請重新整理',
            btn_linepay_pending: '處理待確認付款',
            alert_header: '提醒',
            btn_confirm: '確定',
            btn_cancel: '取消',
            btn_close: '關閉',
            btn_done: '完成',
            btn_next: '下一步',
            btn_back: '返回',
            confirm_submit: '確認送出',
            notice_modal_title: '門市公告',
            notice_ack_label: '已閱讀，下次不再顯示',
            notice_ok_btn: '我知道了',
            pickup_modal_title: '選擇取餐時間',
            pickup_asap_badge: '最快取餐',
            pickup_asap_title: '店家即刻備餐',
            pickup_asap_default_desc: '預計約 15-20 分鐘後可取餐',
            pickup_slots_title: '或選擇指定時間',
            pickup_slots_hint: '每 15 分鐘為一時段',
            pickup_slots_empty_off: '本日為門市公休日 (店休)',
            pickup_slots_empty_today_closed: '本日營業時間已結束，請選擇明日或其他日期',
            pickup_slots_empty_none: '此日期暫無可預約時段',
            pickup_confirm_btn: '確認時間',
            pickup_confirm_btn_time: '確認時間 ({time})',
            pickup_more_label: '更多',
            pickup_more_sub: '日曆',
            pickup_more_title: '選擇更多日期',
            pickup_period_morning: '上午 / 午餐',
            pickup_period_afternoon: '下午茶時段',
            pickup_period_evening: '晚間 / 晚餐',
            pickup_period_count: '{count} 個時段',
            // Menu & cards
            sold_out: '已售完',
            sold_out_badge: '售完',
            customizable: '客製選項',
            customize_btn: '客製化',
            customize_group_fallback: '口味',
            combo_btn: '選擇組合搭配',
            option_required: '必選',
            option_required_badge: '*必選',
            option_required_min: '必選 (至少 {min} 項)',
            option_min_badge: '至少 {min} 項',
            option_max_badge: '最多 {max} 項',
            option_range_badge: '選 {min}~{max} 項',
            option_optional: '可選',
            option_optional_max: '可選 (最多 {max} 項)',
            option_min_spend: '滿${amount}可選',
            sub_option_title_prefix: '↳ {opt} - 規格 / 配料:',
            sub_option_hint: '點擊{opt}查看配料',
            // Modals (UnifiedOptions & legacy customize modal & Bundle v2)
            portion_n: '第 {n} 份',
            portion_add_new: '+ 新增一份',
            portion_add_nth: '+ 加點第 {n} 份',
            portion_editing: '編輯第 {n} 份',
            portion_base_price: '基本售價 ${price}',
            copy_prev_choice: '複製上一份的選擇',
            copy_prev_same: '與上一份相同',
            individual_note: '個別備註',
            note_short_placeholder: '口味 / 備註',
            add_to_cart: '加入購物車',
            confirm_update: '確認修改',
            confirm_with_price: '確認 · ${price}',
            finish_setup: '完成設定',
            finish_setup_extra: '完成設定 (+${extra})',
            loading_options: '載入選項中…',
            wizard_steps_aria: '選擇步驟',
            opt_err_check_required_oos: '請檢查必選項目與已售完的選項',
            opt_err_complete: '請完成餐點選項',
            opt_err_all_oos: '「{name}」選項已全數售完，暫時無法點選',
            opt_err_choose: '請選擇「{name}」',
            opt_err_min: '「{name}」至少需選擇 {min} 項',
            opt_err_max: '「{name}」最多只能選擇 {max} 項',
            opt_err_need_complete_bundle: '{item} · 第 {n} 份：請完成「{group}」',
            // Bundle builder
            bundle_title_default: '套餐名稱',
            bundle_prompt_default: '請選擇配菜',
            bundle_count_label: '已選 <strong id="bundle-modal-current-count">{current}</strong>/<span id="bundle-modal-max-count">{max}</span> 樣',
            bundle_quota_full: '已選滿',
            bundle_quota_done: '已完成',
            bundle_quota_pending: '待選擇',
            bundle_price_changed_btn: '價格已變更，查看並套用新價格',
            bundle_addons_tab: '自訂選項',
            bundle_addons_title: '自訂餐點選項 / 加料 / 口味',
            bundle_addons_step_label: '自訂餐點選項與加料',
            bundle_step_prompt: '請選擇 {max} 樣{label}',
            bundle_cat_all: '全部',
            bundle_fallback_label: '配菜',
            bundle_mod_pending: '需選擇客製化',
            bundle_mod_optional: '可自選客製化',
            bundle_included: '已包含',
            bundle_unavailable_remove: '已無法選擇，請移除',
            bundle_empty_choices: '目前沒有可選餐點',
            bundle_btn_remain: '還需選擇 {remain} 樣{label} <span style="font-size: 13px; font-weight: 600; opacity: 0.85; margin-left: 4px;">(未完成)</span>',
            bundle_btn_remain_count: '還需選擇 {remain} 樣{label} <span style="font-size: 13px; font-weight: 600; opacity: 0.85; margin-left: 4px;">(已選 {current}/{max})</span>',
            bundle_btn_choose_addon: '請選擇「{name}」 <span style="font-size: 13px; font-weight: 600; opacity: 0.85; margin-left: 4px;">(套餐選項)</span>',
            bundle_btn_confirm_ready: '確認套餐組合 <span style="font-size: 13px; font-weight: 600; opacity: 0.9; margin-left: 4px;">(全部完成)</span>',
            bundle_btn_confirm_label: '確認{label}{price}',
            bundle_err_max_selected: '已選滿 {max} 樣{label}',
            bundle_err_min_selected: '請至少選擇 {min} 樣{label}',
            bundle_err_portion_incomplete: '「{item}」尚有第 {n} 份未完成{label}選擇，請點擊「+」或「調整」完成搭配',
            bundle_err_portion_group: '「{item}」第 {n} 份尚未完成{label}選擇',
            bundle_err_portion_remain: '「{item}」第 {n} 份的{label}還需選擇 {remain} 樣',
            bundle_back_select: '← 返回選擇',
            // Cart summary & promo
            cart_item_removed: '已移除',
            cart_custom_settings: '客製化設定',
            cart_combo_discount: '組合特惠',
            cart_combo_saved: '已享組合優惠，現折 ${amount} 元！',
            cart_combo_more: '已選 {selected}/{required} {unit}，再選 {remain} {unit}即可折 ${amount} 元！',
            cart_item_unit: '項',
            cart_no_extra_label: '備註：',
            // Order-level customization threshold warnings
            threshold_hint: '需滿 ${min} 元 (尚差 ${diff} 元)',
            threshold_alert: '【{title}】需餐點消費滿 ${min} 元才可勾選（目前金額 $${current} 元，還差 $${diff} 元）',
            threshold_submit_alert: '您選擇的口味「{name}」需全單消費滿 ${min} 元方可送出（目前金額 $${current} 元，還差 $${diff} 元）',
            threshold_subtotal_min_alert: '{title}：餐點金額需滿 {min} 元，請調整餐點或選項。',
            // Alerts & Checkout validations
            alert_store_paused: '店家目前暫停接單中，暫時無法下單，敬請見諒！',
            alert_cart_empty: '請先選擇餐點品項加入購物車',
            alert_cart_all_oos: '購物車內餐點已全數售完，請重新挑選其他餐點',
            alert_select_required_global: '請選擇【{title}】（此項為必填）',
            alert_select_required_item: '請為【{item}】第 {n} 份選擇【{mod}】（此項為必選）',
            alert_max_per_order: '【{item}】每單限購 {max} 份，目前已選擇 {qty} 份，請調整數量後再下單。',
            alert_enter_table: '請填寫您的用餐桌號，方便門市人員為您送餐！',
            confirm_closed_title: '店家目前休息中',
            confirm_closed_dinein: '店家預計於 <b>{day} {time}</b> 開始接單製作。<br>您確定要現在預先送出內用訂單嗎？',
            confirm_closed_pickup: '店家預計於 <b>{day} {time}</b> 開始接單製作。<br>您確定要現在預先送出訂單嗎？',
            alert_select_pickup_time: '請選擇預計取餐時間',
            alert_time_past: '取餐時間不能早於當前時間',
            alert_time_closed: '所選的取餐時間非營業時間，請重新選擇！',
            alert_busy_min_time: '目前門市繁忙，最快可取餐時間為 {time}（需至少 1 小時後）',
            alert_linepay_new_takeaway_only: 'LINE Pay 僅支援新的外帶訂單。',
            alert_bootstrap_incomplete: '尚未取得完整菜單，購物車已保留，請重試。',
            alert_options_changed_review: '購物車選項已依最新菜單更新，請確認後再次送出。',
            alert_line_login_failed: 'LINE 登入失敗，請重試',
            alert_oos_partial_title: '售完品項',
            alert_oos_partial_body: '抱歉，以下餐點目前已售完，已自動自購物車移除：',
            alert_oos_partial_footer: '金額已重新計算，請確認後再次點擊送出訂單。',
            alert_oos_all_body: '抱歉，您選購的餐點目前已全數售完：',
            alert_oos_all_footer: '請回到菜單選擇其他餐點，敬請見諒！',
            alert_append_oos_partial_body: '抱歉，以下加點餐點目前已售完，已自動自購物車移除：',
            alert_append_oos_partial_footer: '金額已重新計算，請確認後再次點擊送出加點。',
            alert_append_oos_all_body: '抱歉，您加點的餐點目前已全數售完：',
            alert_edit_oos_all_body: '抱歉，您選購的更換餐點目前已全數售完：',
            alert_edit_oos_partial_footer: '金額已重新計算，請確認後再次點擊送出。',
            alert_append_success_title: '現場加點已送出！',
            alert_append_success_body: '您的現場加點已成功送達廚房製作！<br>總共加點 ${total}',
            alert_edit_success_title: '品項更換成功！',
            alert_edit_no_delta: '無差額 ($0)',
            alert_edit_delta_add: '需補差額 ${delta}',
            alert_edit_delta_refund: '店家退還差額 ${delta}',
            alert_edit_success_body: '門市已收到您的更新訂單！<br><strong>新總計：${total}</strong> ({deltaMsg})<br>品項已更新，請在 LINE 查看確認與訂單進度。',
            alert_order_success_title: '訂單已送出成功！',
            alert_order_success_body: '店家已收到您的訂單，請在 LINE 查看訂單確認與進度。',
            err_option_price_changed: '餐點價格已更新，請重新確認選項。',
            err_option_unavailable: '餐點或選項已售完，請重新選擇。',
            err_option_min_subtotal: '訂單金額未達此選項的最低金額，請重新選擇。',
            err_option_generic: '餐點選項已更新，請重新確認。',
            err_bundle_changed: '套餐內容已變更，請重新確認',
            err_updated_amount: '更新後金額',
            err_submit_failed: '訂單送出失敗',
            err_unconfirmed_retry: '尚未確認送出結果，購物車已保留，請重試。',
            err_timeout: '連線逾時（網路較慢），請重新點擊送出',
            err_submit_retry_box: '訂單送出失敗：<br><br><span style="color:#ef4444; font-weight:700;">{error}</span><br><br>請檢查網路後再次點擊確認下單。',
            table_prefix: '桌號 {table}',
            global_flavor_section_title: '口味選擇',
            nav_checkout: '結帳',
            custom_panel_lock_title: '請先登入 LINE 帳號以自訂餐點口味',
            custom_panel_lock_btn: '使用 LINE 登入',
            item_limit_badge: '限購{max}份',
            customize_card_label: '客製化（加料 / 辣度 / 備註）',
            sold_out_today: '今日已售完',
            bundle_v3_option_btn: '選項',
            bundle_adjust_label_addons: '調整{label} / 加料',
            bundle_adjust_combo: '調整搭配 / 加料',
            bundle_adjust_label: '調整{label}',
            bundle_adjust_sides: '調整套餐配菜',
            threshold_opt_alert: '此選項「{name}」需全單商品消費滿 ${min} 元方可選擇（目前金額 ${current} 元，還差 ${diff} 元）',
            item_category_fallback: '餐點',
            uoc_pick_exact: '選擇 {min} 樣',
            uoc_pick_range: '選擇 {min}–{max} 樣',
            uoc_not_customized: '尚未自訂',
            uoc_complete_required: '請完成必選項目',
            uoc_min_subtotal_not_met: '未達最低餐點金額',
            uoc_decrease: '減少',
            uoc_increase: '增加',
            uoc_select: '選擇',
            uoc_unavailable: '已無法選擇',
            uoc_remove: '移除',
            uoc_selected_prefix: '已選',
            uoc_empty_options: '目前沒有可選項目',
            cart_topping_fallback: '配料',
            cart_note_prefix: '備註: {note}',
            cart_drink_prefix: '↳ 飲料：{drinks}',
            cart_edit_item_aria: '調整 {name}',
            cart_remove_item_aria: '移除 {name}',
            cart_remove_one_aria: '移除 1 份 {name}',
            cart_all_portions: '共 {qty} 份',
            cart_portions_join: '第 {list} 份',
            cart_bundle_promo_line: '{cat} 組合特惠 ({count}組，已省 ${saved})',
            cart_addon_prefix: '+ 加購：{label}',
            cart_threshold_banner: '口味條件未達門檻：{list}，目前餐點金額 ${current} 元，下單前請補足金額或修改口味。',
            cart_edit_all_oos_note: '(購物車內餐點已全數售完，請由上方菜單挑選更換餐點)',
            cart_edit_delta_line: '原金額 ${orig} → 新總計 ${total}',
            cart_total_label: '總計',
            cart_max_limit_short: '【{item}】每單限購 {max} 份',
            dinein_onsite_label: '現場內用',
            edit_round_select_aria: '選擇修改輪次',
            edit_round_label: '第 {n} 輪',
            edit_round_switch_confirm: '切換輪次並放棄目前修改？',
            portion_suffix: '（第 {n} 份）',
            hours_open_fallback: '開店',
            err_linepay_generic: '請重新確認付款',
            outside_schedule_badge: '非供應時段',
            schedule_window_badge: '{label} 供應',
            alert_schedule_items_removed: '以下餐點不在所選取餐時段供應，請調整餐點或更換取餐時間：{items}',
            cart_outside_schedule: '非所選時段供應'
        },

        'en': {
            page_default_title: 'Online Ordering',
            page_store_title: '{brand} · Order Online',
            fallback_brand_generic: 'Online Ordering',
            fallback_brand_benmi: 'Benmi',
            tenant_unknown_title: 'Store Not Found',
            tenant_unknown_desc: 'Please return to the original store link and sign in with LINE again.',
            edit_loading_title: 'Loading Order',
            edit_loading_sub: 'Checking available items and total, please wait...',
            desktop_guest: 'Guest',
            desktop_logged_in: 'Signed In',
            desktop_login_prompt: 'Sign in with your LINE account to start ordering',
            desktop_login_btn: 'Sign in with LINE',
            center_auth_title: 'Sign in with LINE to Order',
            center_auth_desc: 'Customize your items, build your cart, and receive real-time order updates in LINE.',
            center_auth_btn: 'Continue with LINE',
            desktop_qr_title: 'Please Order via LINE on Mobile',
            desktop_qr_desc: 'To receive live preparation notifications and member offers, ordering is only available on mobile LINE.',
            status_open: 'Open',
            status_closed: 'Closed',
            status_today_closed: 'Closed Today',
            status_paused: 'Paused',
            status_busy: 'Busy (+1h)',
            waiting_ahead: 'Queue: ',
            waiting_orders_unit: ' orders',
            hours_label: 'Hours',
            lang_label: 'Language',
            lang_select_aria: 'Select display language',
            hours_loading: 'Loading...',
            hours_expand: 'Show',
            hours_collapse: 'Hide',
            hours_today: 'Today',
            hours_today_prefix: 'Today',
            hours_tomorrow: 'Tomorrow',
            hours_day_after: 'In 2 days',
            hours_tomorrow_short: 'Tomorrow',
            hours_off: 'Closed',
            hours_today_off: 'Closed Today',
            hours_shop_off: 'Closed',
            hours_shop_closed_short: 'Ended',
            hours_next_day: '+1d',
            hours_reserved_badge: 'Booked',
            days_short: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
            banner_paused_title: 'Orders Temporarily Paused',
            banner_paused_desc: 'This store is not accepting new orders right now. Thank you for your patience.',
            banner_closed_desc: 'This store is closed for today and not accepting new orders.',
            banner_busy_title: 'High Volume (+1h Prep Time)',
            banner_busy_desc: 'Due to busy kitchen volume, new pickup times are extended by about 1 hour.',
            banner_append_title: 'Adding Items to Order',
            banner_append_desc: 'Adding to <strong id="append-mode-table">{table}</strong> (<span id="append-mode-key">{key}</span>)',
            banner_append_new_btn: 'New Order',
            banner_table_label: 'Table:',
            banner_table_desc: 'Table QR ordering · Items will be served directly to your table',
            banner_edit_title: 'Sold-Out Items Removed',
            banner_edit_desc: 'Some items in <strong id="edit-order-mode-key">{key}</strong> sold out. Adjust your cart below.',
            dining_takeaway: 'Takeaway',
            dining_dinein: 'Dine-in',
            dining_method_label: 'Dining Option',
            checkout_cart_title: 'Your Cart',
            cart_empty: '(No items selected)',
            pickup_time_title: 'Pickup Time',
            order_time_title: 'Order Time',
            table_number_label: 'Table Number',
            table_required_badge: 'Required',
            table_placeholder: 'Enter table number (e.g. 1, 05, A2...)',
            pickup_eta_label: 'Estimated Pickup',
            pickup_tap_change: 'Change',
            pickup_aria_select: 'Select pickup time',
            pickup_default_primary: 'ASAP (Prepared Right Away)',
            pickup_default_secondary: 'Today · Tap to change time',
            pickup_select_prompt_primary: 'Select pickup time',
            pickup_select_prompt_secondary: 'Tap to choose date & time slot',
            pickup_asap_primary: 'ASAP (~{time})',
            pickup_asap_sec_prep: '{day} · ~{min} min prep',
            pickup_asap_sec_now: '{day} · Prepared immediately',
            pickup_slot_primary: 'Pickup at {time}',
            pickup_slot_sec: '{day} · Scheduled slot',
            dinein_live_title: 'Dine-in · Made to Order',
            dinein_live_badge: 'Freshly Made',
            dinein_order_time_label: 'Order Time:',
            dinein_live_note: '* Kitchen prepares your order in sequence once submitted. Watch for your order number.',
            asap_mode_title: 'Live Queue Mode',
            asap_mode_badge: 'In Queue',
            asap_mode_time_label: 'Submitted At:',
            asap_mode_note: '* Prepared freshly in queue order as soon as your order is placed.',
            asap_busy_suffix: '{time} (Busy: ~1 hr wait)',
            pickup_open_first: 'First batch at open (~{time})',
            pickup_eta_busy: 'Busy: earliest pickup ~{min} min ({time})',
            pickup_eta_minutes: 'Ready in ~{min} min ({time})',
            pickup_eta_now: 'Ready now ({time})',
            other_requests_title: 'Order Note',
            note_placeholder: 'Add allergies or special instructions...',
            powered_by_tagline: 'LINE Smart Ordering ↗',
            payment_method_title: 'Payment Method',
            payment_linepay_description: 'Pay online',
            payment_counter_title: 'Pay at the Counter',
            payment_counter_description: 'Pay at the counter after your meal.',
            payment_pickup_description: 'Pay when you pick up your order.',
            btn_pay_with_linepay: 'Pay with LINE Pay',
            btn_submit_order: 'Place Order',
            btn_submit_append: 'Add Items',
            btn_go_checkout: 'Review & Order',
            btn_select_items_first: 'Select items',
            empty_cart_hint: 'Add at least one item to your cart to continue.',
            btn_store_paused: 'Store Paused',
            btn_store_closed: 'Closed Today',
            btn_sold_out: 'Sold Out',
            btn_validating: 'Checking availability...',
            btn_order_submitted: 'Order Placed',
            btn_append_submitted: 'Items Added',
            btn_edit_updated: 'Order Updated',
            btn_edit_loading: 'Loading order...',
            btn_edit_failed: 'Failed to load order',
            btn_linepay_pending: 'Payment pending',
            alert_header: 'Notice',
            btn_confirm: 'OK',
            btn_cancel: 'Cancel',
            btn_close: 'Close',
            btn_done: 'Done',
            btn_next: 'Next',
            btn_back: 'Back',
            confirm_submit: 'Confirm Order',
            notice_modal_title: 'Store Notice',
            notice_ack_label: "Don't show this again",
            notice_ok_btn: 'Got it',
            pickup_modal_title: 'Select Pickup Time',
            pickup_asap_badge: 'ASAP',
            pickup_asap_title: 'Prepare Immediately',
            pickup_asap_default_desc: 'Estimated ready in 15-20 min',
            pickup_slots_title: 'Or choose a time slot',
            pickup_slots_hint: '15-min intervals',
            pickup_slots_empty_off: 'Store is closed on this day',
            pickup_slots_empty_today_closed: 'Operating hours have ended for today. Please choose another date.',
            pickup_slots_empty_none: 'No time slots available for this date',
            pickup_confirm_btn: 'Confirm Time',
            pickup_confirm_btn_time: 'Confirm ({time})',
            pickup_more_label: 'More',
            pickup_more_sub: 'Calendar',
            pickup_more_title: 'Select another date',
            pickup_period_morning: 'Morning / Lunch',
            pickup_period_afternoon: 'Afternoon',
            pickup_period_evening: 'Evening / Dinner',
            pickup_period_count: '{count} slots',
            sold_out: 'Sold Out',
            sold_out_badge: 'Sold Out',
            customizable: 'Options',
            customize_btn: 'Customize',
            customize_group_fallback: 'Options',
            combo_btn: 'Build Combo',
            option_required: 'Required',
            option_required_badge: '*Required',
            option_required_min: 'Required (min {min})',
            option_min_badge: 'Min {min}',
            option_max_badge: 'Max {max}',
            option_range_badge: 'Pick {min}-{max}',
            option_optional: 'Optional',
            option_optional_max: 'Optional (max {max})',
            option_min_spend: 'Min ${amount}',
            sub_option_title_prefix: '↳ {opt} - Style / Add-ons:',
            sub_option_hint: 'Tap {opt} to choose toppings',
            portion_n: 'Item #{n}',
            portion_add_new: '+ Add another',
            portion_add_nth: '+ Add #{n}',
            portion_editing: 'Editing #{n}',
            portion_base_price: 'Base ${price}',
            copy_prev_choice: 'Copy previous selection',
            copy_prev_same: 'Same as previous',
            individual_note: 'Item Note',
            note_short_placeholder: 'Special request / Note',
            add_to_cart: 'Add to Cart',
            confirm_update: 'Update Item',
            confirm_with_price: 'Confirm · ${price}',
            finish_setup: 'Save Options',
            finish_setup_extra: 'Save Options (+${extra})',
            loading_options: 'Loading options…',
            wizard_steps_aria: 'Selection steps',
            opt_err_check_required_oos: 'Please check required selections and sold-out options.',
            opt_err_complete: 'Please complete required options.',
            opt_err_all_oos: 'All options in "{name}" are sold out.',
            opt_err_choose: 'Please select "{name}"',
            opt_err_min: '"{name}" requires at least {min} selection(s)',
            opt_err_max: '"{name}" allows at most {max} selection(s)',
            opt_err_need_complete_bundle: '{item} · #{n}: Please complete "{group}"',
            bundle_title_default: 'Combo Meal',
            bundle_prompt_default: 'Select items',
            bundle_count_label: 'Selected <strong id="bundle-modal-current-count">{current}</strong>/<span id="bundle-modal-max-count">{max}</span>',
            bundle_quota_full: 'Done',
            bundle_quota_done: 'Done',
            bundle_quota_pending: 'Required',
            bundle_price_changed_btn: 'Price updated · Review & apply',
            bundle_addons_tab: 'Add-ons',
            bundle_addons_title: 'Customize Options / Add-ons',
            bundle_addons_step_label: 'Options & Add-ons',
            bundle_step_prompt: 'Select {max} {label}',
            bundle_cat_all: 'All',
            bundle_fallback_label: 'Items',
            bundle_mod_pending: 'Options required',
            bundle_mod_optional: 'Optional add-ons',
            bundle_included: 'Included',
            bundle_unavailable_remove: 'Unavailable, please remove',
            bundle_empty_choices: 'No items available',
            bundle_btn_remain: 'Select {remain} more {label} <span style="font-size: 13px; font-weight: 600; opacity: 0.85; margin-left: 4px;">(Incomplete)</span>',
            bundle_btn_remain_count: 'Select {remain} more {label} <span style="font-size: 13px; font-weight: 600; opacity: 0.85; margin-left: 4px;">({current}/{max})</span>',
            bundle_btn_choose_addon: 'Select "{name}" <span style="font-size: 13px; font-weight: 600; opacity: 0.85; margin-left: 4px;">(Combo Option)</span>',
            bundle_btn_confirm_ready: 'Confirm Combo <span style="font-size: 13px; font-weight: 600; opacity: 0.9; margin-left: 4px;">(Ready)</span>',
            bundle_btn_confirm_label: 'Confirm {label}{price}',
            bundle_err_max_selected: 'Maximum {max} {label} selected',
            bundle_err_min_selected: 'Please select at least {min} {label}',
            bundle_err_portion_incomplete: '"{item}" #{n} is missing {label}. Tap "+" or "Adjust" to complete.',
            bundle_err_portion_group: '"{item}" #{n} has not completed {label}',
            bundle_err_portion_remain: '"{item}" #{n} needs {remain} more for {label}',
            bundle_back_select: '← Back',
            cart_item_removed: 'Removed',
            cart_custom_settings: 'Custom Options',
            cart_combo_discount: 'Combo Savings',
            cart_combo_saved: 'Combo discount applied: -${amount}!',
            cart_combo_more: 'Selected {selected}/{required}: add {remain} more to save ${amount}!',
            cart_item_unit: 'item(s)',
            cart_no_extra_label: 'Note:',
            threshold_hint: 'Min spend ${min} (${diff} more)',
            threshold_alert: '"{title}" requires food subtotal of at least ${min} (current ${current}, add ${diff} more).',
            threshold_submit_alert: '"{name}" requires food subtotal of at least ${min} (current ${current}, add ${diff} more).',
            threshold_subtotal_min_alert: '{title}: Minimum food spend is ${min}. Please adjust your cart.',
            alert_store_paused: 'Orders are temporarily paused. Please try again later.',
            alert_cart_empty: 'Please add items to your cart first.',
            alert_cart_all_oos: 'All items in your cart are sold out. Please select other items.',
            alert_select_required_global: 'Please select "{title}" (Required)',
            alert_select_required_item: 'Please choose "{mod}" for {item} (#{n}).',
            alert_max_per_order: '"{item}" is limited to {max} per order (you have {qty}).',
            alert_enter_table: 'Please enter your table number so our staff can serve your order.',
            confirm_closed_title: 'Store Currently Closed',
            confirm_closed_dinein: 'Store opens at <b>{day} {time}</b>.<br>Do you still want to submit a pre-order for dine-in?',
            confirm_closed_pickup: 'Store opens at <b>{day} {time}</b>.<br>Do you still want to place a pre-order?',
            alert_select_pickup_time: 'Please select an estimated pickup time.',
            alert_time_past: 'Pickup time cannot be earlier than now.',
            alert_time_closed: 'Selected pickup time is outside operating hours. Please choose another slot.',
            alert_busy_min_time: 'Kitchen is busy. Earliest pickup is {time} (at least 1 hour from now).',
            alert_linepay_new_takeaway_only: 'LINE Pay is only supported for new takeaway orders.',
            alert_bootstrap_incomplete: 'Could not verify the full menu. Your cart is saved; please try again.',
            alert_options_changed_review: 'Some options in your cart changed with the updated menu. Please review and submit again.',
            alert_line_login_failed: 'LINE sign-in failed. Please try again.',
            alert_oos_partial_title: 'Sold-Out Items',
            alert_oos_partial_body: 'The following sold-out items were removed from your cart:',
            alert_oos_partial_footer: 'Your total has been updated. Review your cart and submit again.',
            alert_oos_all_body: 'All selected items have sold out:',
            alert_oos_all_footer: 'Please return to the menu to pick other items.',
            alert_append_oos_partial_body: 'The following add-on items sold out and were removed:',
            alert_append_oos_partial_footer: 'Your total has been updated. Please submit again.',
            alert_append_oos_all_body: 'Your add-on items have sold out:',
            alert_edit_oos_all_body: 'All replacement items have sold out:',
            alert_edit_oos_partial_footer: 'Total recalculated. Please review and submit again.',
            alert_append_success_title: 'Add-on Sent!',
            alert_append_success_body: 'Your extra items were sent to the kitchen.<br>Added total: ${total}',
            alert_edit_success_title: 'Order Updated!',
            alert_edit_no_delta: 'No price difference ($0)',
            alert_edit_delta_add: 'Additional amount: +${delta}',
            alert_edit_delta_refund: 'Refund difference: ${delta}',
            alert_edit_success_body: 'Your updated order has been received.<br><strong>New Total: ${total}</strong> ({deltaMsg})<br>Check LINE for order confirmation and progress.',
            alert_order_success_title: 'Order Placed!',
            alert_order_success_body: 'The store received your order. Check LINE for confirmation and status updates.',
            err_option_price_changed: 'Item prices changed. Please confirm your selections.',
            err_option_unavailable: 'An item or option sold out. Please select again.',
            err_option_min_subtotal: 'Order subtotal does not meet the minimum for this option.',
            err_option_generic: 'Item options changed. Please review your selections.',
            err_bundle_changed: 'Combo options changed. Please review.',
            err_updated_amount: 'Updated amount',
            err_submit_failed: 'Order submission failed',
            err_unconfirmed_retry: 'Order status could not be confirmed. Your cart is kept; please try again.',
            err_timeout: 'Connection timed out. Please tap submit again.',
            err_submit_retry_box: 'Order failed:<br><br><span style="color:#ef4444; font-weight:700;">{error}</span><br><br>Check your connection and try again.',
            table_prefix: 'Table {table}',
            global_flavor_section_title: 'Taste & Options',
            nav_checkout: 'Checkout',
            custom_panel_lock_title: 'Sign in with LINE to customize options',
            custom_panel_lock_btn: 'Sign in with LINE',
            item_limit_badge: 'Limit {max}',
            customize_card_label: 'Customize (Add-ons / Spice / Note)',
            sold_out_today: 'Sold Out',
            bundle_v3_option_btn: 'Options',
            bundle_adjust_label_addons: 'Edit {label} / Add-ons',
            bundle_adjust_combo: 'Edit Combo / Add-ons',
            bundle_adjust_label: 'Edit {label}',
            bundle_adjust_sides: 'Edit Combo Sides',
            threshold_opt_alert: 'Option "{name}" requires a minimum food subtotal of ${min} (current: ${current}, add ${diff} more).',
            item_category_fallback: 'Item',
            uoc_pick_exact: 'Choose {min}',
            uoc_pick_range: 'Choose {min}–{max}',
            uoc_not_customized: 'Not customized',
            uoc_complete_required: 'Complete required',
            uoc_min_subtotal_not_met: 'Minimum order not met',
            uoc_decrease: 'Decrease',
            uoc_increase: 'Increase',
            uoc_select: 'Select',
            uoc_unavailable: 'Unavailable',
            uoc_remove: 'Remove',
            uoc_selected_prefix: 'Selected',
            uoc_empty_options: 'No options available',
            cart_topping_fallback: 'Add-ons',
            cart_note_prefix: 'Note: {note}',
            cart_drink_prefix: '↳ Drink: {drinks}',
            cart_edit_item_aria: 'Edit {name}',
            cart_remove_item_aria: 'Remove {name}',
            cart_remove_one_aria: 'Remove 1 {name}',
            cart_all_portions: 'All {qty}',
            cart_portions_join: '#{list}',
            cart_bundle_promo_line: '{cat} Bundle ({count}×, saved ${saved})',
            cart_addon_prefix: '+ Add-on: {label}',
            cart_threshold_banner: 'Minimum order not met for {list}. Current food subtotal is ${current}; add more items or change selection.',
            cart_edit_all_oos_note: '(All items in your order are sold out. Please select replacement items above.)',
            cart_edit_delta_line: 'Original ${orig} → New ${total}',
            cart_total_label: 'Total',
            cart_max_limit_short: '"{item}" is limited to {max} per order',
            dinein_onsite_label: 'Dine-in',
            edit_round_select_aria: 'Select round to edit',
            edit_round_label: 'Round {n}',
            edit_round_switch_confirm: 'Switch round and discard current edits?',
            portion_suffix: ' (#{n})',
            hours_open_fallback: 'opening',
            err_linepay_generic: 'Please check payment status',
            outside_schedule_badge: 'Unavailable now',
            schedule_window_badge: 'Served: {label}',
            alert_schedule_items_removed: 'These items are not served at your selected pickup time. Please remove them or change pickup time: {items}',
            cart_outside_schedule: 'Not served at selected time'
        },

        'vi': {
            page_default_title: 'Đặt món trực tuyến',
            page_store_title: '{brand} · Đặt món',
            fallback_brand_generic: 'Đặt món trực tuyến',
            fallback_brand_benmi: 'Bản Mễ',
            tenant_unknown_title: 'Không xác định được quán',
            tenant_unknown_desc: 'Vui lòng quay lại liên kết ban đầu của quán và đăng nhập LINE lại.',
            edit_loading_title: 'Đang tải đơn hàng',
            edit_loading_sub: 'Đang kiểm tra món còn và tổng tiền, vui lòng đợi...',
            desktop_guest: 'Khách',
            desktop_logged_in: 'Đã đăng nhập',
            desktop_login_prompt: 'Đăng nhập tài khoản LINE để bắt đầu đặt món',
            desktop_login_btn: 'Đăng nhập LINE',
            center_auth_title: 'Đăng nhập LINE để đặt món',
            center_auth_desc: 'Tùy chỉnh món ăn, thêm vào giỏ và nhận thông báo tiến độ đơn hàng qua LINE.',
            center_auth_btn: 'Đăng nhập bằng LINE',
            desktop_qr_title: 'Vui lòng quét mã bằng LINE trên điện thoại',
            desktop_qr_desc: 'Để nhận thông báo tiến độ món và ưu đãi, quán chỉ hỗ trợ đặt qua LINE di động.',
            status_open: 'Đang mở',
            status_closed: 'Đang nghỉ',
            status_today_closed: 'Hết giờ hôm nay',
            status_paused: 'Tạm ngưng',
            status_busy: 'Đang đông (+1h)',
            waiting_ahead: 'Đang chờ: ',
            waiting_orders_unit: ' đơn',
            hours_label: 'Giờ mở cửa',
            lang_label: 'Ngôn ngữ',
            lang_select_aria: 'Chọn ngôn ngữ hiển thị',
            hours_loading: 'Đang tải...',
            hours_expand: 'Mở rộng',
            hours_collapse: 'Thu gọn',
            hours_today: 'Hôm nay',
            hours_today_prefix: 'Hôm nay',
            hours_tomorrow: 'Ngày mai',
            hours_day_after: 'Ngày kia',
            hours_tomorrow_short: 'Ngày mai',
            hours_off: 'Nghỉ',
            hours_today_off: 'Hôm nay nghỉ',
            hours_shop_off: 'Nghỉ',
            hours_shop_closed_short: 'Đóng cửa',
            hours_next_day: 'Qua ngày',
            hours_reserved_badge: 'Đặt trước',
            days_short: ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'],
            banner_paused_title: 'Quán tạm ngưng nhận đơn',
            banner_paused_desc: 'Hiện quán chưa nhận đơn mới. Mong quý khách thông cảm!',
            banner_closed_desc: 'Quán đã đóng cửa hôm nay, tạm ngưng nhận đơn mới.',
            banner_busy_title: 'Quán đang rất đông (+1 tiếng)',
            banner_busy_desc: 'Hiện đơn tại quầy khá đông, thời gian chuẩn bị dự kiến kéo dài thêm 1 giờ.',
            banner_append_title: 'Đang gọi thêm món',
            banner_append_desc: 'Gọi thêm cho <strong id="append-mode-table">{table}</strong> (<span id="append-mode-key">{key}</span>)',
            banner_append_new_btn: 'Đơn mới',
            banner_table_label: 'Số bàn:',
            banner_table_desc: 'Đặt món tại bàn · Món sẽ được phục vụ tận bàn của bạn',
            banner_edit_title: 'Đã bỏ món hết hàng',
            banner_edit_desc: 'Đơn <strong id="edit-order-mode-key">{key}</strong> có món đã hết. Vui lòng chọn lại món thay thế.',
            dining_takeaway: 'Mang về',
            dining_dinein: 'Ăn tại quán',
            dining_method_label: 'Hình thức',
            checkout_cart_title: 'Giỏ hàng của bạn',
            cart_empty: '(Chưa chọn món nào)',
            pickup_time_title: 'Giờ lấy món',
            order_time_title: 'Giờ đặt món',
            table_number_label: 'Số bàn',
            table_required_badge: 'Bắt buộc',
            table_placeholder: 'Nhập số bàn (VD: 1, 05, A2...)',
            pickup_eta_label: 'Giờ lấy dự kiến',
            pickup_tap_change: 'Thay đổi',
            pickup_aria_select: 'Chọn giờ lấy món',
            pickup_default_primary: 'Nhanh nhất (Làm ngay)',
            pickup_default_secondary: 'Hôm nay · Chạm để đổi giờ',
            pickup_select_prompt_primary: 'Vui lòng chọn giờ lấy món',
            pickup_select_prompt_secondary: 'Chạm để chọn ngày và khung giờ',
            pickup_asap_primary: 'Nhanh nhất (~{time})',
            pickup_asap_sec_prep: '{day} · Chuẩn bị khoảng {min} phút',
            pickup_asap_sec_now: '{day} · Quán làm ngay',
            pickup_slot_primary: 'Lấy lúc {time}',
            pickup_slot_sec: '{day} · Giờ hẹn trước',
            dinein_live_title: 'Ăn tại bàn · Làm ngay',
            dinein_live_badge: 'Làm mới tại quầy',
            dinein_order_time_label: 'Giờ đặt:',
            dinein_live_note: '* Bếp sẽ làm ngay theo thứ tự đơn sau khi gửi. Vui lòng chú ý số đơn của bạn.',
            asap_mode_title: 'Chế độ xếp đơn trực tiếp',
            asap_mode_badge: 'Làm ngay',
            asap_mode_time_label: 'Giờ đặt dự kiến:',
            asap_mode_note: '* Đơn sẽ vào hàng chờ theo giờ hiện tại và được làm tươi theo thứ tự.',
            asap_busy_suffix: '{time} (Quán đông: khoảng 1 giờ xong)',
            pickup_open_first: 'Mẻ đầu khi mở cửa (~{time})',
            pickup_eta_busy: 'Quán đông: sớm nhất sau ~{min} phút ({time})',
            pickup_eta_minutes: 'Dự kiến sau ~{min} phút ({time})',
            pickup_eta_now: 'Làm ngay ({time})',
            other_requests_title: 'Ghi chú đơn',
            note_placeholder: 'Nhập ghi chú hoặc yêu cầu riêng...',
            powered_by_tagline: 'Hệ thống đặt món LINE ↗',
            payment_method_title: 'Phương thức thanh toán',
            payment_linepay_description: 'Thanh toán trực tuyến',
            payment_counter_title: 'Thanh toán tại quầy',
            payment_counter_description: 'Thanh toán tại quầy sau khi dùng bữa',
            payment_pickup_description: 'Thanh toán tại quầy khi nhận món',
            btn_pay_with_linepay: 'Đến LINE Pay thanh toán',
            btn_submit_order: 'Xác nhận đặt món',
            btn_submit_append: 'Xác nhận gọi thêm',
            btn_go_checkout: 'Đến thanh toán',
            btn_select_items_first: 'Hãy chọn món',
            empty_cart_hint: 'Hãy thêm món vào giỏ hàng để tiếp tục.',
            btn_store_paused: 'Quán tạm dừng nhận đơn',
            btn_store_closed: 'Hết giờ hôm nay',
            btn_sold_out: 'Đã hết món',
            btn_validating: 'Đang kiểm tra món...',
            btn_order_submitted: 'Đã gửi đơn',
            btn_append_submitted: 'Đã gửi gọi thêm',
            btn_edit_updated: 'Đã cập nhật đơn',
            btn_edit_loading: 'Đang tải đơn...',
            btn_edit_failed: 'Tải đơn thất bại, hãy tải lại',
            btn_linepay_pending: 'Xử lý thanh toán đang chờ',
            alert_header: 'Thông báo',
            btn_confirm: 'Xác nhận',
            btn_cancel: 'Hủy',
            btn_close: 'Đóng',
            btn_done: 'Xong',
            btn_next: 'Tiếp theo',
            btn_back: 'Quay lại',
            confirm_submit: 'Xác nhận gửi',
            notice_modal_title: 'Thông báo của quán',
            notice_ack_label: 'Đã đọc, không hiện lại lần sau',
            notice_ok_btn: 'Đã hiểu',
            pickup_modal_title: 'Chọn giờ lấy món',
            pickup_asap_badge: 'Nhanh nhất',
            pickup_asap_title: 'Quán làm ngay',
            pickup_asap_default_desc: 'Dự kiến sẵn sàng sau 15-20 phút',
            pickup_slots_title: 'Hoặc chọn giờ cụ thể',
            pickup_slots_hint: 'Mỗi khung 15 phút',
            pickup_slots_empty_off: 'Hôm nay quán nghỉ',
            pickup_slots_empty_today_closed: 'Hôm nay đã hết giờ mở cửa. Vui lòng chọn ngày khác.',
            pickup_slots_empty_none: 'Không có khung giờ khả dụng trong ngày này',
            pickup_confirm_btn: 'Xác nhận giờ',
            pickup_confirm_btn_time: 'Xác nhận ({time})',
            pickup_more_label: 'Thêm',
            pickup_more_sub: 'Lịch',
            pickup_more_title: 'Chọn ngày khác',
            pickup_period_morning: 'Sáng / Trưa',
            pickup_period_afternoon: 'Buổi chiều',
            pickup_period_evening: 'Buổi tối',
            pickup_period_count: '{count} khung giờ',
            sold_out: 'Hết món',
            sold_out_badge: 'Hết',
            customizable: 'Tùy chọn',
            customize_btn: 'Tùy chỉnh',
            customize_group_fallback: 'Tùy chọn',
            combo_btn: 'Chọn combo',
            option_required: 'Bắt buộc',
            option_required_badge: '*Bắt buộc',
            option_required_min: 'Bắt buộc (ít nhất {min})',
            option_min_badge: 'Ít nhất {min}',
            option_max_badge: 'Tối đa {max}',
            option_range_badge: 'Chọn {min}-{max}',
            option_optional: 'Tùy chọn',
            option_optional_max: 'Tùy chọn (tối đa {max})',
            option_min_spend: 'Từ ${amount}',
            sub_option_title_prefix: '↳ {opt} - Topping / Quy cách:',
            sub_option_hint: 'Chạm {opt} để chọn thêm',
            portion_n: 'Phần {n}',
            portion_add_new: '+ Thêm một phần',
            portion_add_nth: '+ Thêm phần {n}',
            portion_editing: 'Sửa phần {n}',
            portion_base_price: 'Giá gốc ${price}',
            copy_prev_choice: 'Sao chép lựa chọn phần trước',
            copy_prev_same: 'Giống phần trước',
            individual_note: 'Ghi chú riêng',
            note_short_placeholder: 'Khẩu vị / Ghi chú',
            add_to_cart: 'Thêm vào giỏ',
            confirm_update: 'Cập nhật',
            confirm_with_price: 'Xác nhận · ${price}',
            finish_setup: 'Hoàn tất',
            finish_setup_extra: 'Hoàn tất (+${extra})',
            loading_options: 'Đang tải tùy chọn…',
            wizard_steps_aria: 'Các bước lựa chọn',
            opt_err_check_required_oos: 'Vui lòng kiểm tra lựa chọn bắt buộc và lựa chọn đã hết món.',
            opt_err_complete: 'Vui lòng chọn đủ tùy chọn.',
            opt_err_all_oos: 'Nhóm "{name}" hiện đã hết toàn bộ lựa chọn.',
            opt_err_choose: 'Vui lòng chọn "{name}"',
            opt_err_min: '"{name}" cần chọn ít nhất {min} mục',
            opt_err_max: '"{name}" chỉ được chọn tối đa {max} mục',
            opt_err_need_complete_bundle: '{item} · Phần {n}: Vui lòng chọn "{group}"',
            bundle_title_default: 'Combo',
            bundle_prompt_default: 'Chọn món kèm',
            bundle_count_label: 'Đã chọn <strong id="bundle-modal-current-count">{current}</strong>/<span id="bundle-modal-max-count">{max}</span>',
            bundle_quota_full: 'Đủ rồi',
            bundle_quota_done: 'Hoàn tất',
            bundle_quota_pending: 'Chưa chọn',
            bundle_price_changed_btn: 'Giá đã thay đổi · Xem và áp dụng',
            bundle_addons_tab: 'Tùy chọn',
            bundle_addons_title: 'Tùy chỉnh món / Topping / Khẩu vị',
            bundle_addons_step_label: 'Tùy chỉnh món & Topping',
            bundle_step_prompt: 'Chọn {max} {label}',
            bundle_cat_all: 'Tất cả',
            bundle_fallback_label: 'Món kèm',
            bundle_mod_pending: 'Cần chọn tùy chỉnh',
            bundle_mod_optional: 'Có thể tùy chỉnh',
            bundle_included: 'Đã bao gồm',
            bundle_unavailable_remove: 'Không khả dụng, hãy bỏ',
            bundle_empty_choices: 'Hiện chưa có món khả dụng',
            bundle_btn_remain: 'Cần chọn thêm {remain} {label} <span style="font-size: 13px; font-weight: 600; opacity: 0.85; margin-left: 4px;">(Chưa xong)</span>',
            bundle_btn_remain_count: 'Cần chọn thêm {remain} {label} <span style="font-size: 13px; font-weight: 600; opacity: 0.85; margin-left: 4px;">({current}/{max})</span>',
            bundle_btn_choose_addon: 'Chọn "{name}" <span style="font-size: 13px; font-weight: 600; opacity: 0.85; margin-left: 4px;">(Tùy chọn combo)</span>',
            bundle_btn_confirm_ready: 'Xác nhận combo <span style="font-size: 13px; font-weight: 600; opacity: 0.9; margin-left: 4px;">(Hoàn tất)</span>',
            bundle_btn_confirm_label: 'Xác nhận {label}{price}',
            bundle_err_max_selected: 'Đã chọn tối đa {max} {label}',
            bundle_err_min_selected: 'Vui lòng chọn ít nhất {min} {label}',
            bundle_err_portion_incomplete: '"{item}" phần {n} chưa chọn xong {label}. Nhấn "+" hoặc "Điều chỉnh" để hoàn tất.',
            bundle_err_portion_group: '"{item}" phần {n} chưa hoàn tất {label}',
            bundle_err_portion_remain: '"{item}" phần {n} cần chọn thêm {remain} {label}',
            bundle_back_select: '← Quay lại',
            cart_item_removed: 'Đã bỏ',
            cart_custom_settings: 'Tùy chỉnh món',
            cart_combo_discount: 'Ưu đãi combo',
            cart_combo_saved: 'Đã áp dụng ưu đãi combo, giảm $${amount}!',
            cart_combo_more: 'Đã chọn {selected}/{required}: thêm {remain} nữa để giảm $${amount}!',
            cart_item_unit: 'món',
            cart_no_extra_label: 'Ghi chú:',
            threshold_hint: 'Tối thiểu ${min} (thiếu ${diff})',
            threshold_alert: '"{title}" yêu cầu tổng tiền món tối thiểu ${min} (hiện ${current}, thiếu ${diff}).',
            threshold_submit_alert: '"{name}" yêu cầu tổng tiền món tối thiểu ${min} (hiện ${current}, thiếu ${diff}).',
            threshold_subtotal_min_alert: '{title}: Tổng tiền món phải đạt tối thiểu ${min}. Vui lòng điều chỉnh giỏ hàng.',
            alert_store_paused: 'Quán tạm ngưng nhận đơn. Vui lòng thử lại sau!',
            alert_cart_empty: 'Vui lòng chọn món thêm vào giỏ hàng trước.',
            alert_cart_all_oos: 'Các món trong giỏ hàng đã hết. Vui lòng chọn món khác.',
            alert_select_required_global: 'Vui lòng chọn "{title}" (bắt buộc)',
            alert_select_required_item: 'Vui lòng chọn "{mod}" cho {item} (Phần {n}).',
            alert_max_per_order: '"{item}" giới hạn {max} phần/đơn (đang chọn {qty}).',
            alert_enter_table: 'Vui lòng nhập số bàn để nhân viên phục vụ!',
            confirm_closed_title: 'Quán đang ngoài giờ mở cửa',
            confirm_closed_dinein: 'Quán mở lại vào <b>{day} {time}</b>.<br>Bạn có chắc muốn đặt trước đơn ăn tại bàn ngay bây giờ?',
            confirm_closed_pickup: 'Quán mở lại vào <b>{day} {time}</b>.<br>Bạn có chắc muốn đặt trước đơn ngay bây giờ?',
            alert_select_pickup_time: 'Vui lòng chọn giờ lấy món dự kiến.',
            alert_time_past: 'Giờ lấy món không được sớm hơn hiện tại.',
            alert_time_closed: 'Giờ lấy đã chọn nằm ngoài giờ mở cửa. Vui lòng chọn giờ khác!',
            alert_busy_min_time: 'Quán đang đông, giờ lấy sớm nhất là {time} (sau ít nhất 1 giờ).',
            alert_linepay_new_takeaway_only: 'LINE Pay chỉ hỗ trợ đơn mang về mới.',
            alert_bootstrap_incomplete: 'Chưa tải được thực đơn đầy đủ. Giỏ hàng đã được giữ lại; vui lòng thử lại.',
            alert_options_changed_review: 'Tùy chọn trong giỏ hàng đã được cập nhật theo thực đơn. Vui lòng kiểm tra và gửi lại đơn.',
            alert_line_login_failed: 'Đăng nhập LINE thất bại, vui lòng thử lại',
            alert_oos_partial_title: 'Món đã hết hàng',
            alert_oos_partial_body: 'Các món đã hết hàng sau vừa được gỡ khỏi giỏ hàng:',
            alert_oos_partial_footer: 'Tổng tiền đã được tính lại, vui lòng kiểm tra và gửi lại đơn.',
            alert_oos_all_body: 'Rất tiếc, các món bạn chọn đều đã hết:',
            alert_oos_all_footer: 'Vui lòng quay lại thực đơn để chọn món khác!',
            alert_append_oos_partial_body: 'Các món gọi thêm sau đã hết hàng và được gỡ bỏ:',
            alert_append_oos_partial_footer: 'Tổng tiền đã cập nhật, vui lòng xác nhận gọi thêm lại.',
            alert_append_oos_all_body: 'Các món gọi thêm của bạn đã hết hàng:',
            alert_edit_oos_all_body: 'Các món thay thế bạn chọn đã hết hàng:',
            alert_edit_oos_partial_footer: 'Tổng tiền đã cập nhật, vui lòng xác nhận lại.',
            alert_append_success_title: 'Đã gửi món gọi thêm!',
            alert_append_success_body: 'Bếp đã nhận được món gọi thêm của bạn!<br>Tổng gọi thêm: ${total}',
            alert_edit_success_title: 'Đã cập nhật đơn hàng!',
            alert_edit_no_delta: 'Không chênh lệch ($0)',
            alert_edit_delta_add: 'Cần bù thêm ${delta}',
            alert_edit_delta_refund: 'Quán hoàn lại ${delta}',
            alert_edit_success_body: 'Quán đã nhận đơn cập nhật của bạn!<br><strong>Tổng mới: ${total}</strong> ({deltaMsg})<br>Vui lòng xem chi tiết và tiến độ trong LINE.',
            alert_order_success_title: 'Đặt món thành công!',
            alert_order_success_body: 'Quán đã nhận được đơn của bạn. Vui lòng kiểm tra xác nhận và tiến độ trên LINE.',
            err_option_price_changed: 'Giá món đã thay đổi. Vui lòng xác nhận lại tùy chọn.',
            err_option_unavailable: 'Một món hoặc tùy chọn đã hết hàng. Vui lòng chọn lại.',
            err_option_min_subtotal: 'Giỏ hàng chưa đạt giá trị tối thiểu cho tùy chọn này. Vui lòng chọn lại.',
            err_option_generic: 'Tùy chọn của món đã thay đổi. Vui lòng xác nhận lại.',
            err_bundle_changed: 'Nội dung combo đã thay đổi, vui lòng xác nhận lại',
            err_updated_amount: 'Số tiền cập nhật',
            err_submit_failed: 'Gửi đơn thất bại',
            err_unconfirmed_retry: 'Chưa xác nhận được kết quả. Giỏ hàng được giữ lại; vui lòng thử gửi lại.',
            err_timeout: 'Hết thời gian kết nối, vui lòng bấm gửi lại',
            err_submit_retry_box: 'Gửi đơn thất bại:<br><br><span style="color:#ef4444; font-weight:700;">{error}</span><br><br>Vui lòng kiểm tra mạng và thử lại.',
            table_prefix: 'Bàn {table}',
            global_flavor_section_title: 'Tùy chọn khẩu vị',
            nav_checkout: 'Thanh toán',
            custom_panel_lock_title: 'Vui lòng đăng nhập LINE để tùy chỉnh món',
            custom_panel_lock_btn: 'Đăng nhập LINE',
            item_limit_badge: 'Giới hạn {max}',
            customize_card_label: 'Tùy chỉnh (Topping / Cay / Ghi chú)',
            sold_out_today: 'Hết món hôm nay',
            bundle_v3_option_btn: 'Tùy chọn',
            bundle_adjust_label_addons: 'Đổi {label} / Topping',
            bundle_adjust_combo: 'Đổi combo / Topping',
            bundle_adjust_label: 'Đổi {label}',
            bundle_adjust_sides: 'Đổi món kèm combo',
            threshold_opt_alert: 'Tùy chọn "{name}" yêu cầu tổng món từ ${min} (hiện tại: ${current}, cần thêm ${diff}).',
            item_category_fallback: 'Món',
            uoc_pick_exact: 'Chọn {min}',
            uoc_pick_range: 'Chọn {min}–{max}',
            uoc_not_customized: 'Chưa tùy chỉnh',
            uoc_complete_required: 'Cần chọn đủ',
            uoc_min_subtotal_not_met: 'Chưa đạt giá trị món tối thiểu',
            uoc_decrease: 'Giảm',
            uoc_increase: 'Tăng',
            uoc_select: 'Chọn',
            uoc_unavailable: 'Không còn khả dụng',
            uoc_remove: 'Gỡ',
            uoc_selected_prefix: 'Đã chọn',
            uoc_empty_options: 'Chưa có lựa chọn',
            cart_topping_fallback: 'Topping',
            cart_note_prefix: 'Ghi chú: {note}',
            cart_drink_prefix: '↳ Đồ uống: {drinks}',
            cart_edit_item_aria: 'Chỉnh sửa {name}',
            cart_remove_item_aria: 'Xóa {name}',
            cart_remove_one_aria: 'Xóa 1 phần {name}',
            cart_all_portions: 'Tất cả {qty} phần',
            cart_portions_join: 'Phần {list}',
            cart_bundle_promo_line: 'Combo {cat} ({count} nhóm, tiết kiệm ${saved})',
            cart_addon_prefix: '+ Thêm: {label}',
            cart_threshold_banner: 'Chưa đạt mức tối thiểu cho {list}. Tổng món hiện tại là ${current}; vui lòng thêm món hoặc đổi tùy chọn.',
            cart_edit_all_oos_note: '(Tất cả món trong đơn đã hết. Vui lòng chọn món thay thế ở thực đơn bên trên.)',
            cart_edit_delta_line: 'Đơn gốc ${orig} → Mới ${total}',
            cart_total_label: 'Tổng cộng',
            cart_max_limit_short: '"{item}" giới hạn tối đa {max} phần/đơn',
            dinein_onsite_label: 'Ăn tại quán',
            edit_round_select_aria: 'Chọn đợt cần sửa',
            edit_round_label: 'Đợt {n}',
            edit_round_switch_confirm: 'Chuyển đợt và bỏ bản nháp đang chỉnh?',
            portion_suffix: ' (Phần {n})',
            hours_open_fallback: 'giờ mở cửa',
            err_linepay_generic: 'Vui lòng kiểm tra lại thanh toán',
            outside_schedule_badge: 'Ngoài giờ bán',
            schedule_window_badge: 'Phục vụ: {label}',
            alert_schedule_items_removed: 'Các món sau không phục vụ vào giờ nhận đã chọn. Vui lòng bỏ món hoặc đổi giờ nhận: {items}',
            cart_outside_schedule: 'Không bán vào giờ đã chọn'
        }
    };

    function normalizeLocale(raw) {
        if (!raw) return null;
        var s = String(raw).trim();
        if (!s) return null;
        var lower = s.toLowerCase().replace(/_/g, '-');
        if (lower === 'zh-tw' || lower === 'zh-hant' || lower === 'zh' || lower === 'tw' || lower.indexOf('zh-hant') === 0 || lower.indexOf('zh-tw') === 0) {
            return 'zh-TW';
        }
        if (lower === 'vi' || lower === 'vn' || lower.indexOf('vi-') === 0) {
            return 'vi';
        }
        if (lower === 'en' || lower.indexOf('en-') === 0) {
            return 'en';
        }
        return null;
    }

    function readExplicitUrlLang() {
        try {
            if (!global.location) return null;
            var sp = new URLSearchParams(global.location.search || '');
            var direct = normalizeLocale(sp.get('lang'));
            if (direct) return direct;

            var liffState = sp.get('liff.state');
            if (liffState) {
                var decoded = liffState;
                try { decoded = decodeURIComponent(liffState); } catch (e) { }
                var qIdx = decoded.indexOf('?');
                var stateParams = new URLSearchParams(qIdx >= 0 ? decoded.slice(qIdx + 1).split('#')[0] : decoded);
                var fromState = normalizeLocale(stateParams.get('lang'));
                if (fromState) return fromState;
            }

            if (global.location.hash) {
                var h = global.location.hash.replace(/^#/, '');
                var hqIdx = h.indexOf('?');
                var hp = new URLSearchParams(hqIdx >= 0 ? h.slice(hqIdx + 1) : h);
                var fromHash = normalizeLocale(hp.get('lang'));
                if (fromHash) return fromHash;
            }
        } catch (e) { }
        return null;
    }

    function resolveTenantId(tenant) {
        if (tenant && tenant.id) return String(tenant.id);
        if (global.__INITIAL_TENANT_ID) return String(global.__INITIAL_TENANT_ID);
        if (typeof global.getTenantIdFromUrl === 'function') {
            var id = global.getTenantIdFromUrl();
            if (id) return String(id);
        }
        return 'benmi';
    }

    function resolveSupportedLocales(tenant) {
        if (!isI18nActiveForTenant(tenant)) {
            return [normalizeLocale(tenant && tenant.locale) || 'zh-TW'];
        }
        var base = ['zh-TW', 'en', 'vi'];
        if (tenant && Array.isArray(tenant.supportedLocales) && tenant.supportedLocales.length > 0) {
            var parsed = [];
            tenant.supportedLocales.forEach(function (loc) {
                var norm = normalizeLocale(loc);
                if (norm && parsed.indexOf(norm) === -1) parsed.push(norm);
            });
            var primary = normalizeLocale(tenant.locale) || 'zh-TW';
            if (parsed.indexOf(primary) === -1) parsed.unshift(primary);
            if (parsed.length > 0) return parsed;
        }
        return base;
    }

    function isI18nActiveForTenant(tenant) {
        if (!tenant) return false;
        if (tenant.i18nEnabled === true) return true;
        if (tenant.i18nEnabled === false) return false;
        var feats = Array.isArray(tenant.features) ? tenant.features : [];
        return feats.indexOf('multilingual') !== -1 || feats.indexOf('i18n') !== -1;
    }

    function syncLocaleGlobals(locale) {
        var resolved = normalizeLocale(locale) || 'zh-TW';
        global.currentClientLocale = resolved;
        global.currentLocale = resolved;
        if (global.document && global.document.documentElement) {
            global.document.documentElement.lang = resolved;
        }
        return resolved;
    }

    function detectNavigatorLocale(supported) {
        try {
            var liffLang = (typeof global.liff !== 'undefined' && typeof global.liff.getLanguage === 'function')
                ? global.liff.getLanguage()
                : '';
            var navLang = liffLang ||
                (global.navigator && (global.navigator.language || (Array.isArray(global.navigator.languages) ? global.navigator.languages[0] : ''))) ||
                '';
            if (!navLang) return null;
            var lower = String(navLang).trim().toLowerCase().replace(/_/g, '-');
            if (lower.indexOf('zh') === 0) {
                return supported.indexOf('zh-TW') !== -1 ? 'zh-TW' : null;
            }
            if (lower.indexOf('vi') === 0) {
                return supported.indexOf('vi') !== -1 ? 'vi' : (supported.indexOf('en') !== -1 ? 'en' : null);
            }
            if (lower.indexOf('en') === 0) {
                return supported.indexOf('en') !== -1 ? 'en' : null;
            }
            if (supported.indexOf('en') !== -1) return 'en';
        } catch (e) { }
        return null;
    }

    function initClientLocale(tenant) {
        var activeTenant = tenant || (global.bootstrapData && global.bootstrapData.tenant) || null;
        var primary = normalizeLocale(activeTenant && activeTenant.locale) || 'zh-TW';
        var explicitUrlLang = readExplicitUrlLang();
        var enabled = isI18nActiveForTenant(activeTenant);
        var supported = resolveSupportedLocales(activeTenant);

        if (global.isStaffOrderMode) {
            var staffDocLang = normalizeLocale(global.document && global.document.documentElement && global.document.documentElement.lang) || primary;
            var staffMenuLocale = enabled ? staffDocLang : primary;
            global.currentClientLocale = staffMenuLocale;
            global.currentLocale = staffMenuLocale;
            return staffMenuLocale;
        }

        if (!enabled) {
            return syncLocaleGlobals(primary);
        }

        var chosen = null;
        if (explicitUrlLang && (supported.indexOf(explicitUrlLang) !== -1 || SUPPORTED_LOCALES.indexOf(explicitUrlLang) !== -1)) {
            chosen = explicitUrlLang;
        }

        var tenantId = resolveTenantId(activeTenant);
        if (!chosen) {
            try {
                var saved = global.localStorage && global.localStorage.getItem('client_locale:' + tenantId);
                var normSaved = normalizeLocale(saved);
                if (normSaved && supported.indexOf(normSaved) !== -1) {
                    chosen = normSaved;
                }
            } catch (e) { }
        }

        if (!chosen) {
            var detected = detectNavigatorLocale(supported);
            if (detected) chosen = detected;
        }

        if (!chosen) chosen = primary;
        return syncLocaleGlobals(chosen);
    }

    function ct(key, vars) {
        var locale = normalizeLocale(global.currentClientLocale || global.currentLocale || (global.document && global.document.documentElement && global.document.documentElement.lang)) || 'zh-TW';
        var dict = CLIENT_I18N[locale] || CLIENT_I18N['zh-TW'];
        var fallbackDict = CLIENT_I18N['zh-TW'];
        var template = Object.prototype.hasOwnProperty.call(dict, key)
            ? dict[key]
            : (Object.prototype.hasOwnProperty.call(fallbackDict, key) ? fallbackDict[key] : key);

        if (typeof template !== 'string') return template;
        if (!vars || typeof vars !== 'object') return template;
        return template.replace(/\{([a-zA-Z0-9_]+)\}/g, function (_, name) {
            return Object.prototype.hasOwnProperty.call(vars, name) && vars[name] !== undefined && vars[name] !== null
                ? String(vars[name])
                : '';
        });
    }

    var FIELD_ALIASES = {
        badgeText: ['badge_text'],
        badge_text: ['badgeText'],
        title: ['name'],
        name: ['title'],
        subtitle: ['brandSubtitle', 'brand_subtitle'],
        brandSubtitle: ['brand_subtitle', 'subtitle'],
        brand_subtitle: ['brandSubtitle', 'subtitle'],
        brandName: ['brand_name'],
        brand_name: ['brandName'],
        address: ['storeAddress', 'store_address'],
        storeAddress: ['store_address', 'address'],
        store_address: ['storeAddress', 'address'],
        shortName: ['short_name'],
        short_name: ['shortName'],
        promoLabel: ['promo_label'],
        promo_label: ['promoLabel'],
        deliveryPolicy: ['delivery_policy'],
        delivery_policy: ['deliveryPolicy']
    };

    function pickFieldFromEntry(entry, field) {
        if (!entry || typeof entry !== 'object') return '';
        if (typeof entry[field] === 'string' && entry[field].trim()) return entry[field].trim();
        var snake = String(field || '').replace(/([A-Z])/g, function (m) { return '_' + m.toLowerCase(); });
        if (snake !== field && typeof entry[snake] === 'string' && entry[snake].trim()) return entry[snake].trim();
        var aliases = FIELD_ALIASES[field];
        if (Array.isArray(aliases)) {
            for (var i = 0; i < aliases.length; i++) {
                var a = aliases[i];
                if (typeof entry[a] === 'string' && entry[a].trim()) return entry[a].trim();
            }
        }
        return '';
    }

    function locText(entity, field, fallback) {
        var baseFallback = fallback !== undefined && fallback !== null
            ? String(fallback)
            : (entity && entity[field] !== undefined && entity[field] !== null ? String(entity[field]) : '');

        if (!entity || typeof entity !== 'object') return baseFallback;
        var locale = normalizeLocale(global.currentClientLocale || global.currentLocale || (global.document && global.document.documentElement && global.document.documentElement.lang)) || 'zh-TW';
        var i18n = entity.i18n;
        if (i18n && typeof i18n === 'object') {
            var directEntry = i18n[locale];
            var found = pickFieldFromEntry(directEntry, field);
            if (found) return found;

            // Check normalized keys inside i18n map if key casing differs
            var keys = Object.keys(i18n);
            for (var i = 0; i < keys.length; i++) {
                if (normalizeLocale(keys[i]) === locale) {
                    var normFound = pickFieldFromEntry(i18n[keys[i]], field);
                    if (normFound) return normFound;
                }
            }
        }
        return baseFallback;
    }

    function locSubOptionText(optionObj, subName) {
        var rawName = (subName && typeof subName === 'object')
            ? String(subName.name || '')
            : (subName !== undefined && subName !== null ? String(subName) : '');

        if (optionObj && typeof optionObj === 'object' && rawName) {
            var locale = normalizeLocale(global.currentClientLocale || global.currentLocale || (global.document && global.document.documentElement && global.document.documentElement.lang)) || 'zh-TW';
            var i18n = optionObj.i18n;
            if (i18n && typeof i18n === 'object') {
                var matchEntry = i18n[locale];
                if (!matchEntry) {
                    var keys = Object.keys(i18n);
                    for (var k = 0; k < keys.length; k++) {
                        if (normalizeLocale(keys[k]) === locale) {
                            matchEntry = i18n[keys[k]];
                            break;
                        }
                    }
                }
                var subMap = matchEntry && (matchEntry.sub_options || matchEntry.subOptions);
                if (subMap && typeof subMap === 'object' && typeof subMap[rawName] === 'string' && subMap[rawName].trim()) {
                    return subMap[rawName].trim();
                }
            }
        }

        if (subName && typeof subName === 'object') {
            return locText(subName, 'name', rawName);
        }
        if (!optionObj || typeof optionObj !== 'object') return rawName;
        var subs = optionObj.subOptions || optionObj.sub_options || [];
        if (Array.isArray(subs) && subs.length > 0) {
            for (var i = 0; i < subs.length; i++) {
                var sub = subs[i];
                if (!sub) continue;
                if (typeof sub === 'string') {
                    if (sub === rawName) return sub;
                } else if (sub.name === rawName || String(sub.id) === rawName) {
                    return locText(sub, 'name', sub.name || rawName);
                }
            }
        }
        return rawName;
    }

    function formatLocalizedHours(parsedHours, localeOverride) {
        var locale = normalizeLocale(localeOverride || global.currentClientLocale || 'zh-TW') || 'zh-TW';
        var dict = CLIENT_I18N[locale] || CLIENT_I18N['zh-TW'];
        var daysName = dict.days_short || ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        var nextTag = '<span style="font-size: 11px; background: #eff6ff; color: #2563eb; padding: 1px 5px; border-radius: 4px; font-weight: 800; border: 1px solid #bfdbfe; margin-right: 3px; vertical-align: middle;">' + dict.hours_next_day + '</span>';
        var formatShifts = function (shifts) {
            return shifts.map(function (s) {
                if (!s || !s.start || !s.end) return '';
                var startParts = String(s.start || '0:0').split(':').map(Number);
                var endParts = String(s.end || '0:0').split(':').map(Number);
                var isOvernight = ((endParts[0] * 60) + (endParts[1] || 0)) <= ((startParts[0] * 60) + (startParts[1] || 0));
                return s.start + ' - ' + (isOvernight ? nextTag : '') + s.end;
            }).filter(Boolean).join(', ');
        };

        var lines = [];
        for (var i = 1; i <= 7; i++) {
            var dayIndex = i % 7;
            var dayShifts = (parsedHours && (parsedHours[dayIndex] || parsedHours[String(dayIndex)])) || [];
            var hoursStr = dayShifts.length > 0 ? formatShifts(dayShifts) : '<span style="color: #dc2626;">' + dict.hours_off + '</span>';
            lines.push({ dayIndex: dayIndex, dayName: daysName[dayIndex], hoursHtml: hoursStr, isOff: dayShifts.length === 0 });
        }
        return {
            daysName: daysName,
            lines: lines,
            dict: dict,
            formatShifts: formatShifts
        };
    }

    function applyClientStaticI18n() {
        var doc = global.document;
        if (!doc) return;

        var textEls = doc.querySelectorAll('[data-i18n]');
        textEls.forEach(function (el) {
            var key = el.getAttribute('data-i18n');
            if (!key) return;
            var val = ct(key);
            if (typeof val === 'string') {
                el.textContent = val;
            }
        });

        var placeholderEls = doc.querySelectorAll('[data-i18n-placeholder]');
        placeholderEls.forEach(function (el) {
            var key = el.getAttribute('data-i18n-placeholder');
            if (!key) return;
            var val = ct(key);
            if (typeof val === 'string') {
                el.setAttribute('placeholder', val);
            }
        });

        var ariaEls = doc.querySelectorAll('[data-i18n-aria-label]');
        ariaEls.forEach(function (el) {
            var key = el.getAttribute('data-i18n-aria-label');
            if (!key) return;
            var val = ct(key);
            if (typeof val === 'string') {
                el.setAttribute('aria-label', val);
            }
        });

        var titleEls = doc.querySelectorAll('[data-i18n-title]');
        titleEls.forEach(function (el) {
            var key = el.getAttribute('data-i18n-title');
            if (!key) return;
            var val = ct(key);
            if (typeof val === 'string') {
                el.setAttribute('title', val);
            }
        });
    }

    function renderClientLanguageSwitcher(tenant) {
        var doc = global.document;
        if (!doc) return;
        var container = doc.getElementById('client-lang-switcher');
        if (!container) return;

        var activeTenant = tenant || (global.bootstrapData && global.bootstrapData.tenant) || null;
        var enabled = isI18nActiveForTenant(activeTenant);
        var supported = resolveSupportedLocales(activeTenant);
        var explicitUrlLang = readExplicitUrlLang();
        if (explicitUrlLang && supported.indexOf(explicitUrlLang) === -1) {
            supported = SUPPORTED_LOCALES.slice();
        }

        if (global.isStaffOrderMode || !enabled || supported.length < 2) {
            container.style.display = 'none';
            return;
        }

        var current = normalizeLocale(global.currentClientLocale || global.currentLocale) || 'zh-TW';
        var optionsHtml = supported.map(function (loc) {
            var label = LOCALE_NATIVE_LABELS[loc] || LOCALE_SHORT_LABELS[loc] || loc;
            var selectedAttr = (loc === current) ? ' selected' : '';
            return '<option value="' + loc + '"' + selectedAttr + '>' + label + '</option>';
        }).join('');

        var selectEl = doc.getElementById('client-lang-select');
        if (selectEl) {
            selectEl.innerHTML = optionsHtml;
            selectEl.value = current;
        } else {
            container.innerHTML = '<select id="client-lang-select" name="locale" class="client-lang-select" onchange="setClientLocale(this.value)">' + optionsHtml + '</select>';
        }
        container.style.display = 'flex';
    }

    function refreshOpenModalsForLocale() {
        try {
            if (global.UnifiedOptions && typeof global.UnifiedOptions.refresh === 'function') {
                global.UnifiedOptions.refresh();
            }
        } catch (e) { }
        try {
            if (typeof global.bundleRefreshLocale === 'function') {
                global.bundleRefreshLocale();
            }
        } catch (e) { }
    }

    function setClientLocale(locale) {
        var norm = normalizeLocale(locale) || 'zh-TW';
        var tenant = (global.bootstrapData && global.bootstrapData.tenant) || null;
        var tenantId = resolveTenantId(tenant);

        syncLocaleGlobals(norm);

        try {
            if (global.localStorage) {
                global.localStorage.setItem('client_locale:' + tenantId, norm);
            }
        } catch (e) { }

        applyClientStaticI18n();
        renderClientLanguageSwitcher(tenant);

        if (tenant && typeof global.applyTenantTheme === 'function') {
            global.applyTenantTheme(tenant, true);
        }
        if (typeof global.renderStoreOperatingHours === 'function') {
            global.renderStoreOperatingHours();
        }
        if (typeof global.renderDynamicCatalog === 'function') {
            global.renderDynamicCatalog();
        }
        if (global.bootstrapData && global.bootstrapData.customizations && typeof global.renderCustomizationsPanel === 'function') {
            global.renderCustomizationsPanel(global.bootstrapData.customizations);
        }
        if (typeof global.applyPickupConfig === 'function') {
            global.applyPickupConfig();
        }
        if (typeof global.syncPickupTimeDisplay === 'function') {
            global.syncPickupTimeDisplay();
        }
        if (typeof global.updateTotal === 'function') {
            global.updateTotal();
        }
        if (typeof global.updateFooterButtonState === 'function') {
            global.updateFooterButtonState();
        }
        refreshOpenModalsForLocale();
    }

    // Initialize early default cleanly without overriding an already-set locale
    if (!global.currentClientLocale) {
        var earlyUrlLang = readExplicitUrlLang();
        syncLocaleGlobals(earlyUrlLang || 'zh-TW');
    }

    var ClientI18n = {
        SUPPORTED_LOCALES: SUPPORTED_LOCALES,
        LOCALE_SHORT_LABELS: LOCALE_SHORT_LABELS,
        LOCALE_NATIVE_LABELS: LOCALE_NATIVE_LABELS,
        DICTIONARY: CLIENT_I18N,
        normalizeLocale: normalizeLocale,
        readExplicitUrlLang: readExplicitUrlLang,
        isI18nActiveForTenant: isI18nActiveForTenant,
        initClientLocale: initClientLocale,
        setClientLocale: setClientLocale,
        applyClientStaticI18n: applyClientStaticI18n,
        renderClientLanguageSwitcher: renderClientLanguageSwitcher,
        locText: locText,
        locSubOptionText: locSubOptionText,
        formatLocalizedHours: formatLocalizedHours,
        ct: ct
    };

    global.ClientI18n = ClientI18n;
    global.ct = ct;
    global.locText = locText;
    global.locSubOptionText = locSubOptionText;
    global.formatLocalizedHours = formatLocalizedHours;
    global.initClientLocale = initClientLocale;
    global.renderClientLanguageSwitcher = renderClientLanguageSwitcher;
    global.applyClientStaticI18n = applyClientStaticI18n;
    global.setClientLocale = setClientLocale;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = ClientI18n;
    }
})(typeof window !== 'undefined' ? window : globalThis);
