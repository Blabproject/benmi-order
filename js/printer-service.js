// ==========================================================
// Benmi POS - Thermal Printer Service & Native Bridge
// Supports: Auto-Print after Order Acceptance + Manual On-Demand Print
// Target Hardware: ESC/POS LAN/Wi-Fi Printers on Port 9100
// ==========================================================

(function (window) {
  'use strict';

  const DEFAULT_SETTINGS = {
    autoPrintNewOrders: false,
    cashier: {
      enabled: true,
      interface_type: 'network', // 'network' | 'bluetooth'
      protocol: 'esc_pos',        // 'esc_pos' | 'tspl'
      tspl_label_size: '100x150', // '100x150' | '76x130' | '50x30' | 'custom'
      tspl_custom_width_mm: 100,
      tspl_custom_height_mm: 150,
      tspl_mode: 'summary',       // 'summary' | 'item_stickers'
      tspl_dpi: 203,              // 203 | 300
      tspl_x_offset_mm: 0,        // Horizontal offset mm
      tspl_y_offset_mm: 0,        // Vertical offset mm
      ip: '192.168.1.100',
      port: 9100,
      mac_address: '',
      device_name: '',
      paperWidth: 80,
      feedBeforeCutMm: 80,
      autoCut: true
    },
    kitchen: {
      enabled: true,
      interface_type: 'network', // 'network' | 'bluetooth'
      protocol: 'tspl',        // 'esc_pos' | 'tspl'
      tspl_label_size: '40x30',   // '100x150' | '76x130' | '50x30' | '40x30' | 'custom'
      tspl_custom_width_mm: 40,
      tspl_custom_height_mm: 30,
      tspl_mode: 'item_stickers', // 'summary' | 'item_stickers'
      tspl_dpi: 203,              // 203 | 300
      tspl_x_offset_mm: 0,        // Horizontal offset mm
      tspl_y_offset_mm: 0,        // Vertical offset mm
      ip: '192.168.1.101',
      port: 9100,
      mac_address: '',
      device_name: '',
      paperWidth: 80,
      feedBeforeCutMm: 80,
      autoCut: true
    }
  };

  class PrinterService {
    constructor() {
      this.isNative = this.checkIsNative();
      this._printQueue = Promise.resolve();
      this._inFlightOrderKeys = new Set();
      this.isPrinting = false;
      this.activeJobsCount = 0;
      console.log(`[PrinterService] Initialized. Native Bridge: ${this.isNative ? 'ACTIVE ✅' : 'BROWSER FALLBACK 🌐'}`);
    }

    enqueuePrintTask(taskFn) {
      this.activeJobsCount = (this.activeJobsCount || 0) + 1;
      this._setPrintingState(true);

      const queuedPromise = this._printQueue.then(async () => {
        try {
          return await taskFn();
        } finally {
          this.activeJobsCount = Math.max(0, (this.activeJobsCount || 1) - 1);
          if (this.activeJobsCount === 0) {
            this._setPrintingState(false);
          }
        }
      }).catch(err => {
        this.activeJobsCount = Math.max(0, (this.activeJobsCount || 1) - 1);
        if (this.activeJobsCount === 0) {
          this._setPrintingState(false);
        }
        throw err;
      });

      this._printQueue = queuedPromise.catch(() => {});
      return queuedPromise;
    }

    _setPrintingState(busy) {
      const wasBusy = this.isPrinting;
      this.isPrinting = busy;
      if (typeof window !== 'undefined') {
        if (typeof document !== 'undefined') {
          const printControls = document.querySelectorAll('[data-print-action], #btn-review-quick-print');
          printControls.forEach(el => {
            el.classList.toggle('is-printing', busy);
            if (busy) {
              if (!el.hasAttribute('data-prev-disabled')) {
                el.setAttribute('data-prev-disabled', el.disabled ? 'true' : 'false');
              }
              el.disabled = true;
            } else {
              const wasDisabled = el.getAttribute('data-prev-disabled') === 'true';
              el.disabled = wasDisabled;
              el.removeAttribute('data-prev-disabled');
            }
          });
          if (!busy && typeof window.updatePrintActionAvailability === 'function') {
            window.updatePrintActionAvailability();
          }
        }
        if (wasBusy !== busy) {
          window.dispatchEvent(new CustomEvent('pos-printer-state-change', {
            detail: { isPrinting: busy, activeJobsCount: this.activeJobsCount }
          }));
        }
      }
    }

    isPrinterBusy() {
      return !!(this.isPrinting || (this.activeJobsCount > 0));
    }

    checkIsNative() {
      if (typeof window === 'undefined') return false;
      const hasPlugin = !!(
        window.Capacitor &&
        ((typeof window.Capacitor.isPluginAvailable === 'function' && window.Capacitor.isPluginAvailable('ThermalPrinter')) ||
         (window.Capacitor.Plugins && window.Capacitor.Plugins.ThermalPrinter))
      );
      return hasPlugin;
    }

    getPlugin() {
      if (typeof window !== 'undefined' && window.Capacitor && window.Capacitor.Plugins) {
        return window.Capacitor.Plugins.ThermalPrinter;
      }
      return null;
    }

    notifyToast(message, type = 'info') {
      if (typeof showToast === 'function') {
        showToast(message, type);
      } else if (typeof window !== 'undefined' && typeof window.showToast === 'function') {
        window.showToast(message, type);
      }
    }

    // --- 1. SETTINGS & STORAGE (Multi-Tenant isolated) ---
    getTenantId() {
      if (typeof getTenantIdFromUrl === 'function') {
        const tid = getTenantIdFromUrl();
        if (tid) return tid;
      }
      if (typeof window !== 'undefined' && window.__INITIAL_TENANT_ID) {
        return window.__INITIAL_TENANT_ID;
      }
      if (typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem('pos_device_tenant_id');
        if (saved && saved.trim()) return saved.trim();
      }
      const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
      return params.get('tenant') || params.get('tenant_id') || 'benmi';
    }

    getSettings() {
      const tenantId = this.getTenantId();
      const storageKey = `pos_printer_settings_${tenantId}`;
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          return {
            autoPrintNewOrders: parsed.autoPrintNewOrders ?? DEFAULT_SETTINGS.autoPrintNewOrders,
            cashier: { ...DEFAULT_SETTINGS.cashier, ...(parsed.cashier || {}), protocol: 'esc_pos' },
            kitchen: { ...DEFAULT_SETTINGS.kitchen, ...(parsed.kitchen || {}), protocol: 'tspl' }
          };
        }
      } catch (e) {
        console.warn('[PrinterService] Failed to load settings:', e);
      }
      return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    }

    async getPairedBluetoothDevices() {
      if (this._btDevicesPromise) {
        return this._btDevicesPromise;
      }
      this._btDevicesPromise = (async () => {
        const plugin = this.getPlugin();
        this.isNative = this.checkIsNative();
        if (this.isNative && plugin && typeof plugin.getPairedBluetoothDevices === 'function') {
          try {
            const res = await plugin.getPairedBluetoothDevices();
            return res;
          } catch (e) {
            console.error('[PrinterService] Failed to get paired Bluetooth devices:', e);
            throw e;
          }
        }
        // Browser fallback simulated devices
        return {
          supported: false,
          enabled: false,
          devices: [
            { name: 'Xprinter XP-58IIH (Simulated)', address: '00:11:22:33:44:55', type: 1 },
            { name: 'Epson TM-T88VI-BT (Simulated)', address: 'AA:BB:CC:DD:EE:FF', type: 1 }
          ]
        };
      })();
      try {
        return await this._btDevicesPromise;
      } finally {
        this._btDevicesPromise = null;
      }
    }

    saveSettings(newSettings) {
      const tenantId = this.getTenantId();
      const storageKey = `pos_printer_settings_${tenantId}`;
      try {
        localStorage.setItem(storageKey, JSON.stringify({ ...newSettings, cashier: { ...newSettings.cashier, protocol: 'esc_pos' }, kitchen: { ...newSettings.kitchen, protocol: 'tspl' } }));
        return true;
      } catch (e) {
        console.error('[PrinterService] Failed to save settings:', e);
        return false;
      }
    }

    isStationConfigured(station, config = null) {
      const target = config || this.getSettings()?.[station] || {};
      if (!target.enabled) return false;
      return target.interface_type === 'bluetooth'
        ? !!String(target.mac_address || '').trim()
        : !!String(target.ip || '').trim();
    }

    getPrintCapabilities() {
      const settings = this.getSettings() || {};
      return {
        bill: this.isStationConfigured('cashier', settings.cashier),
        stickers: this.isStationConfigured('kitchen', settings.kitchen)
      };
    }

    canPrintFullOrder() {
      const capabilities = this.getPrintCapabilities();
      return capabilities.bill && capabilities.stickers;
    }

    // --- 2. DEDUPLICATION SET (Prevent duplicate auto-printing) ---
    getPrintedOrders() {
      const tenantId = this.getTenantId();
      const storageKey = `pos_printed_orders_${tenantId}`;
      try {
        const raw = localStorage.getItem(storageKey);
        return raw ? JSON.parse(raw) : [];
      } catch (e) {
        return [];
      }
    }

    isOrderAlreadyPrinted(orderKey) {
      if (!orderKey) return false;
      const printedList = this.getPrintedOrders();
      return printedList.includes(orderKey);
    }

    markOrderAsPrinted(orderKey) {
      if (!orderKey) return;
      const tenantId = this.getTenantId();
      const storageKey = `pos_printed_orders_${tenantId}`;
      try {
        let list = this.getPrintedOrders();
        if (!list.includes(orderKey)) {
          list.push(orderKey);
          if (list.length > 500) {
            list = list.slice(list.length - 500);
          }
          localStorage.setItem(storageKey, JSON.stringify(list));
        }
      } catch (e) {
        console.warn('[PrinterService] Failed to mark order printed:', e);
      }
    }

    // --- 3. AUTO-PRINT TRIGGER ---
    async handleIncomingOrders(ordersList) {
      const settings = this.getSettings();
      if (!settings.autoPrintNewOrders) return;
      if (!Array.isArray(ordersList) || ordersList.length === 0) return;

      if (!this._inFlightOrderKeys) {
        this._inFlightOrderKeys = new Set();
      }

      for (const order of ordersList) {
        // Staff orders are already confirmed when the employee submits them.
        // Customer orders must be explicitly accepted on this POS before printing.
        if (order?.key && order.source === 'staff') {
          await this.handleStaffRounds(order,1,1,'auto_print_new');
          const latestRound = Number(order.round_count || order.roundCount || order.detailSnapshot?.rounds?.at(-1)?.roundNumber) || 1;
          if (latestRound > 1) await this.handleStaffRounds(order,2,latestRound,'auto_print_round');
        }
      }
    }

    async handleAcceptedOrder(order) {
      if (!this.getSettings().autoPrintNewOrders) return;
      if (!order?.key || order.source === 'staff' || (order.status || '').toUpperCase() !== 'ACCEPTED') return;

      const key = order.key;
      const legacyKey = order.legacyKey;
      this._inFlightOrderKeys ||= new Set();
      if (this.isOrderAlreadyPrinted(key) || (legacyKey && this.isOrderAlreadyPrinted(legacyKey))) return;
      if (this._inFlightOrderKeys.has(key) || (legacyKey && this._inFlightOrderKeys.has(legacyKey))) return;

      this._inFlightOrderKeys.add(key);
      if (legacyKey) this._inFlightOrderKeys.add(legacyKey);

      console.log(`[PrinterService] Auto-printing accepted order #${key}...`);
      try {
        await this.printDualStation(order);
      } catch (err) {
        console.error(`[PrinterService] Auto-print failed for #${key}:`, err);
      } finally {
        // A failed/offline station may have printed partially. Staff can manually reprint.
        this.markOrderAsPrinted(key);
        if (legacyKey) this.markOrderAsPrinted(legacyKey);
        this._inFlightOrderKeys.delete(key);
        if (legacyKey) this._inFlightOrderKeys.delete(legacyKey);
      }
    }

    async handleAppendedRounds(appendedList) {
      if (!this.getSettings().autoPrintNewOrders || !Array.isArray(appendedList)) return;
      for (const entry of appendedList) {
        if (entry.order?.source === 'staff') await this.handleStaffRounds(entry.order,entry.fromRound,entry.toRound,'auto_print_round');
      }
    }

    async handleStaffRounds(order, from, to, capability) {
      if (!this.getSettings().autoPrintNewOrders || !window.staffOrderingCapabilities?.[capability]) return;
      const settings = this.getSettings();
      const snapshot = order.detailSnapshot;
      if (!snapshot?.rounds?.length) return;
      this._inFlightOrderKeys ||= new Set();
      this._inFlightStaffRounds ||= new Set();
      for (const round of snapshot.rounds.filter(r=>r.roundNumber >= from && r.roundNumber <= to)) {
        if (round.legacyContent !== undefined) continue;
        const roundKey = `${this.getTenantId()}:${order.orderId || order.key}:${round.roundNumber}`;
        if (this._inFlightStaffRounds.has(roundKey)) continue;
        this._inFlightStaffRounds.add(roundKey);
        try {
        const detailSnapshot = {schemaVersion:1,rounds:[round],total:round.total};
        const ticket = {...order,detailSnapshot,total:round.total,content:window.OrderDetailView.text(detailSnapshot),
          items:(order.items || []).filter(i=>Number(i.round_number) === round.roundNumber)};
        for (const station of ['cashier','kitchen']) {
          if (!this.isStationConfigured(station,settings[station])) continue;
          const key = `staff:${this.getTenantId()}:${order.orderId || order.key}:round:${round.roundNumber}:${station}`;
          if (this.isOrderAlreadyPrinted(key) || this._inFlightOrderKeys.has(key)) continue;
          this._inFlightOrderKeys.add(key);
          try {
            if (station === 'cashier') await this.printCashierReceipt(ticket,settings.cashier);
            else await this.printKitchenTicket(ticket,settings.kitchen);
          } catch (error) {
            console.error('[StaffPrint]',{key,error});
          } finally {
            // A failed bridge may have printed partially. Retry is an explicit manual action.
            this.markOrderAsPrinted(key);
            this._inFlightOrderKeys.delete(key);
          }
        }
        } finally { this._inFlightStaffRounds.delete(roundKey); }
      }
    }

    // --- 4. PRINT DISPATCHERS ---
    async printDualStation(order) {
      const settings = this.getSettings();
      const results = [];
      const isCashierConfigured = this.isStationConfigured('cashier', settings.cashier);
      const isKitchenConfigured = this.isStationConfigured('kitchen', settings.kitchen);

      // Native printer bridges are not reliably re-entrant. Keep the order deterministic:
      // bill first, then every sticker for the order.
      if (isCashierConfigured) {
        try {
          results.push({ station: 'cashier', result: await this.printCashierReceipt(order, settings.cashier) });
        } catch (error) {
          results.push({ station: 'cashier', error });
          console.error(`[PrinterService] Cashier print failed for #${order.key}:`, error);
        }
      }
      if (isKitchenConfigured) {
        try {
          results.push({ station: 'kitchen', result: await this.printKitchenTicket(order, settings.kitchen) });
        } catch (error) {
          results.push({ station: 'kitchen', error });
          console.error(`[PrinterService] Sticker print failed for #${order.key}:`, error);
        }
      }

      if (results.length === 0) {
        console.warn('[PrinterService] No printer stations are enabled in settings.');
        return { success: false, reason: 'NO_PRINTERS_ENABLED' };
      }
      return { success: results.every(entry => !entry.error), results };
    }

    async printManual(orderKey, stationTarget = 'all') {
      const order = this.resolveOrder(orderKey);
      if (!order) {
        if (typeof showToast === 'function') showToast(`❌ 找不到訂單 #${orderKey}`);
        return;
      }

      const settings = this.getSettings();
      const tasks = [];
      const canPrintBill = this.isStationConfigured('cashier', settings.cashier);
      const canPrintStickers = this.isStationConfigured('kitchen', settings.kitchen);

      if ((stationTarget === 'all' || stationTarget === 'cashier') && canPrintBill) {
        tasks.push({ station: 'cashier', run: () => this.printCashierReceipt(order, settings.cashier) });
      }
      if ((stationTarget === 'all' || stationTarget === 'kitchen') && canPrintStickers) {
        tasks.push({ station: 'kitchen', run: () => this.printKitchenTicket(order, settings.kitchen) });
      }

      if (tasks.length === 0) {
        this.notifyToast('⚠️ 請先在設定中啟用印表機', 'warning');
        return;
      }

      if (this.isPrinterBusy()) {
        const queueNotice = (typeof t === 'function' && t('printerBusyQueued')) || '⏳ 已加入列印排程，將依序出單...';
        this.notifyToast(queueNotice, 'info');
      }

      const results = [];
      try {
        this.notifyToast(`🖨️ 正在列印訂單 #${orderKey}...`, 'info');
        // Keep manual full-order reprints in the same bill -> stickers order as autoprint,
        // while isolating per-station errors so an unconfigured/offline station does not block the other.
        for (const task of tasks) {
          try {
            const res = await task.run();
            results.push({ station: task.station, result: res });
          } catch (stationErr) {
            console.error(`[PrinterService] Manual print failed on station [${task.station}]:`, stationErr);
            results.push({ station: task.station, error: stationErr });
          }
        }
        const succeeded = results.filter(r => !r.error);
        const failed = results.filter(r => r.error);
        if (succeeded.length > 0) {
          this.markOrderAsPrinted(orderKey);
        }
        if (failed.length === 0) {
          this.notifyToast(`✅ 訂單 #${orderKey} 列印完成！`, 'success');
        } else if (succeeded.length > 0) {
          const firstErr = failed[0].error;
          this.notifyToast(`⚠️ 部分列印完成 (另一台印表機連線失敗: ${firstErr?.message || firstErr})`, 'warning');
        } else {
          const firstErr = failed[0].error;
          this.notifyToast(`❌ 列印失敗: ${firstErr?.message || firstErr}`, 'error');
        }
      } catch (err) {
        console.error('[PrinterService] Manual print failed:', err);
        this.notifyToast(`❌ 列印失敗: ${err.message || err}`, 'error');
      }
    }

    async printFullOrder(orderKey) {
      if (!this.canPrintFullOrder()) {
        this.notifyToast('⚠️ 請先啟用收銀 Bill 與貼紙印表機', 'warning');
        return;
      }
      return this.printManual(orderKey, 'all');
    }

    async printCashierOnly(orderKey) {
      return this.printManual(orderKey, 'cashier');
    }

    async printSingleItemSticker(orderKey, itemIndex) {
      const order = this.resolveOrder(orderKey);
      if (!order) {
        if (typeof showToast === 'function') showToast(`❌ 找不到訂單 #${orderKey}`);
        return;
      }
      const items = this.parseOrderItems(order, true);
      const idx = parseInt(itemIndex, 10);
      if (isNaN(idx) || idx < 0 || idx >= items.length) {
        if (typeof showToast === 'function') showToast('❌ 找不到該項餐點');
        return;
      }
      const targetItem = items[idx];
      const settings = this.getSettings();
      const config = settings.kitchen;
      if (!this.isStationConfigured('kitchen', config)) {
        if (typeof showToast === 'function') showToast('⚠️ 請先在設定中啟用印表機');
        return;
      }

      const dim = this.resolveLabelDimensions(config);
      try {
        const itemLabelName = targetItem.name + (targetItem.originalQty > 1 ? ` (${targetItem.unitIndex}/${targetItem.originalQty})` : '');
        if (typeof showToast === 'function') showToast(`🏷️ 正在列印「${itemLabelName}」貼紙...`);
        const png = this.drawItemStickerToCanvas(targetItem, order, idx + 1, items.length, dim.widthMm, dim.heightMm, dim.dpi);
        await this.transmitReceiptBitmap(png, config, `Single Sticker #${order.key} (${idx + 1}/${items.length})`);
        if (typeof showToast === 'function') {
          const successMsg = (typeof t === 'function' && t('printSingleItemSuccess', { name: itemLabelName })) || `✅ 已列印「${itemLabelName}」貼紙！`;
          showToast(successMsg);
        }
      } catch (err) {
        console.error('[PrinterService] Single item print failed:', err);
        if (typeof showToast === 'function') showToast(`❌ 列印失敗: ${err.message || err}`);
      }
    }

    async printItemRangeStickers(orderKey, startIndex, count, itemName = '') {
      const order = this.resolveOrder(orderKey);
      if (!order) {
        if (typeof showToast === 'function') showToast(`❌ 找不到訂單 #${orderKey}`);
        return;
      }
      const items = this.parseOrderItems(order, true);
      const start = parseInt(startIndex, 10);
      const qty = parseInt(count, 10) || 1;
      if (isNaN(start) || start < 0 || start >= items.length) {
        if (typeof showToast === 'function') showToast('❌ 找不到該項餐點');
        return;
      }
      const settings = this.getSettings();
      const config = settings.kitchen;
      if (!this.isStationConfigured('kitchen', config)) {
        if (typeof showToast === 'function') showToast('⚠️ 請先在設定中啟用印表機');
        return;
      }

      const dim = this.resolveLabelDimensions(config);
      try {
        const end = Math.min(start + qty, items.length);
        const totalToPrint = end - start;
        const displayName = itemName || items[start].name;
        if (typeof showToast === 'function') {
          const printingMsg = (typeof t === 'function' && t('printPortionsPrinting', { count: totalToPrint, name: displayName }))
            || `🏷️ 正在列印「${displayName}」${totalToPrint} 張貼紙...`;
          showToast(printingMsg);
        }
        for (let i = start; i < end; i++) {
          const it = items[i];
          const png = this.drawItemStickerToCanvas(it, order, i + 1, items.length, dim.widthMm, dim.heightMm, dim.dpi);
          await this.transmitReceiptBitmap(png, config, `Sticker #${order.key} (${i + 1}/${items.length})`);
        }
        if (typeof showToast === 'function') {
          const successMsg = (typeof t === 'function' && t('printPortionsSuccess', { count: totalToPrint, name: displayName }))
            || `✅ 已列印「${displayName}」${totalToPrint} 張貼紙！`;
          showToast(successMsg);
        }
      } catch (err) {
        console.error('[PrinterService] Print range stickers failed:', err);
        if (typeof showToast === 'function') showToast(`❌ 列印失敗: ${err.message || err}`);
      }
    }

    async printQuickModifierSticker(text, orderContext = null) {
      const cleanText = String(text || '').trim();
      if (!cleanText) return;

      const settings = this.getSettings();
      const config = settings.kitchen;
      if (!this.isStationConfigured('kitchen', config)) {
        if (typeof showToast === 'function') showToast('⚠️ 請先在設定中啟用印表機');
        return;
      }

      const dim = this.resolveLabelDimensions(config);
      try {
        if (typeof showToast === 'function') {
          const printingMsg = (typeof t === 'function' && t('quickStickerPrinting')) || `🏷️ 正在列印備註貼紙: 「${cleanText}」...`;
          showToast(printingMsg);
        }
        const png = this.drawQuickNoteStickerToCanvas(cleanText, orderContext, dim.widthMm, dim.heightMm, dim.dpi);
        await this.transmitReceiptBitmap(png, config, `Quick Note Sticker: ${cleanText}`);
        if (typeof showToast === 'function') {
          const successMsg = (typeof t === 'function' && t('quickStickerSuccess', { text: cleanText })) || `✅ 已出標籤: 「${cleanText}」！`;
          showToast(successMsg);
        }
      } catch (err) {
        console.error('[PrinterService] Quick note print failed:', err);
        if (typeof showToast === 'function') showToast(`❌ 列印失敗: ${err.message || err}`);
      }
    }

    resolveOrder(orderKey) {
      if (typeof latestOrders !== 'undefined' && Array.isArray(latestOrders)) {
        const found = latestOrders.find(o => o && String(o.key) === String(orderKey));
        if (found) return found;
      }
      if (typeof lastHistoryOrders !== 'undefined' && Array.isArray(lastHistoryOrders)) {
        const found = lastHistoryOrders.find(o => o && String(o.key) === String(orderKey));
        if (found) return found;
      }
      if (typeof historyOrders !== 'undefined' && Array.isArray(historyOrders)) {
        const found = historyOrders.find(o => o && String(o.key) === String(orderKey));
        if (found) return found;
      }
      if (typeof reviewingOrder !== 'undefined' && reviewingOrder && String(reviewingOrder.key) === String(orderKey)) {
        return reviewingOrder;
      }
      return null;
    }

    resolveLabelDimensions(config) {
      const preset = config.tspl_label_size || '100x150';
      const dpi = parseInt(config.tspl_dpi, 10) === 300 ? 300 : 203;
      const xOffsetMm = Number(config.tspl_x_offset_mm) || 0;
      const yOffsetMm = Number(config.tspl_y_offset_mm) || 0;

      let widthMm = 100;
      let heightMm = 150;

      if (preset === '100x150') { widthMm = 100; heightMm = 150; }
      else if (preset === '76x130') { widthMm = 76; heightMm = 130; }
      else if (preset === '50x30') { widthMm = 50; heightMm = 30; }
      else if (preset === '40x30') { widthMm = 40; heightMm = 30; }
      else if (preset === 'custom') {
        widthMm = parseInt(config.tspl_custom_width_mm, 10) || 100;
        heightMm = parseInt(config.tspl_custom_height_mm, 10) || 150;
      }

      return { widthMm, heightMm, dpi, xOffsetMm, yOffsetMm };
    }

    stripPrintOptionSurcharges(value) {
      // Only remove price annotations from printed options; preserve quantities and notes.
      return String(value).replace(/[ \t]*[（(]\s*\+\s*\$\s*\d[\d,]*(?:\.\d+)?\s*[)）]/g, '').trim();
    }

    // Keep in sync with backend utils/order-item-notes; the contract tests cover both runtimes.
    itemNoteKey(value, labeledOnly = false) {
      let text = String(value || '').trim();
      const portion = text.match(/^(第\s*[\d一二三四五六七八九十]+\s*份|Phần\s*\d+)\s*[:：]\s*/i);
      if (portion) text = text.slice(portion[0].length);
      const label = text.match(/^(?:備註|Ghi chú|Note)\s*[:：]\s*/i);
      if (labeledOnly && !label) return null;
      if (label) text = text.slice(label[0].length);
      const portionId = portion ? (portion[1].match(/\d+/)?.[0] || portion[1].replace(/\s/g, '')) : '';
      return `${portionId}:${text.trim().normalize('NFC')}`;
    }

    remainingItemNote(rawOptions, note) {
      let options = rawOptions;
      if (typeof options === 'string') {
        const text = options;
        try { options = JSON.parse(text); } catch { options = text.split('\n'); }
      }
      const represented = new Set((Array.isArray(options) ? options : []).map(option =>
        this.itemNoteKey(typeof option === 'string' ? option : option?.choice || option?.name || '', true)
      ).filter(key => key !== null));
      return String(note || '').trim()
        .split(/\s*\|\s*(?=(?:第\s*[\d一二三四五六七八九十]+\s*份|Phần\s*\d+)\s*[:：])/i)
        .filter(entry => {
          const key = this.itemNoteKey(entry);
          return entry && key !== null && !represented.has(key);
        })
        .join(' | ');
    }

    resolveOptionIdToName(val) {
      if (!val || typeof val !== 'string') return val;
      const trimmed = val.trim();
      if (typeof window !== 'undefined' && window.posOptionIdMap && window.posOptionIdMap.has(trimmed)) {
        return window.posOptionIdMap.get(trimmed);
      }
      return trimmed;
    }

    formatPrintOptions(value) {
      if (!value) return '';
      const resolveText = (t) => this.resolveOptionIdToName(t);

      if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(value);
          if (Array.isArray(parsed)) return this.formatPrintOptions(parsed);
          // JSON scalar strings/numbers can be the literal display name of an option.
          return resolveText(this.stripPrintOptionSurcharges(value));
        } catch {
          const stripped = this.stripPrintOptionSurcharges(value);
          const parts = stripped.split(/[、,，]+/).map(s => resolveText(s.trim())).filter(Boolean);
          return [...new Set(parts)].join('、');
        }
      }
      if (Array.isArray(value)) {
        const portionGroups = {};
        const otherOptions = [];
        let hasPortions = false;
        value.forEach(option => {
          let text = typeof option === 'string' ? option : (option.choice || option.name || '');
          if (!text) return;
          text = resolveText(text);
          const cleanText = this.stripPrintOptionSurcharges(text).replace(/^[↳\-+•*]\s*/, '').trim();
          const m = cleanText.match(/^(第(?:\d+|[一二三四五六七八九十]+)份)[：:]\s*(.+)$/);
          if (m) {
            hasPortions = true;
            const pKey = m[1];
            if (!portionGroups[pKey]) portionGroups[pKey] = [];
            const subChoices = m[2].split(/[、,，]+/).map(s => resolveText(s.trim())).filter(Boolean);
            subChoices.forEach(sc => {
              if (!portionGroups[pKey].includes(sc)) portionGroups[pKey].push(sc);
            });
          } else {
            const choices = cleanText.split(/[、,，]+/).map(s => resolveText(s.trim())).filter(Boolean);
            choices.forEach(c => {
              if (!otherOptions.includes(c)) otherOptions.push(c);
            });
          }
        });
        if (hasPortions) {
          const lines = Object.entries(portionGroups).map(([p, arr]) => `${p}: ${[...new Set(arr)].join('、')}`);
          if (otherOptions.length > 0) lines.unshift([...new Set(otherOptions)].join('、'));
          return lines.join('\n');
        }
        const cleaned = [];
        const seenLegacy = new Set();
        value.forEach(option => {
          let t = typeof option === 'string' ? option : (option.choice || option.name || '');
          t = resolveText(t);
          const clean = this.stripPrintOptionSurcharges(t);
          if (!clean) return;
          if (option && typeof option === 'object' && option.groupId) {
            cleaned.push(clean);
          } else if (!seenLegacy.has(clean)) {
            seenLegacy.add(clean);
            cleaned.push(clean);
          }
        });
        return cleaned.join('、');
      }
      return '';
    }

    parseBundleSnapshotData(value) {
      if (!value) return null;
      if (typeof value === 'string') {
        try { return JSON.parse(value); } catch { return null; }
      }
      return typeof value === 'object' ? value : null;
    }

    extractBundleOptions(bundleData, qty = 1) {
      if (!bundleData) return [];
      const portions = Array.isArray(bundleData.portions) ? bundleData.portions : (Array.isArray(bundleData) ? bundleData : null);
      if (!portions || portions.length === 0) return [];

      const result = [];
      portions.forEach((p, pIdx) => {
        const pNum = (typeof p.portionIndex === 'number') ? p.portionIndex + 1 : pIdx + 1;
        const pPrefix = portions.length > 1 ? `第${pNum}份: ` : '';
        (p.groups || []).forEach(g => {
          const gName = g.groupName || g.group_name || '配菜';
          const itemsStr = (g.items || []).map(bi => {
            const bName = bi.name || bi.item_name || '';
            const bQty = Number(bi.quantity) || 1;
            const bQtyStr = bQty > 1 ? ` x${bQty}` : '';
            const bSur = Number(bi.surcharge || 0) + (bi.modifiers || []).reduce((sum, mod) => sum + Number(mod.price || 0), 0);
            const bSurStr = bSur > 0 ? ` (+$${bSur})` : '';
            const modNames = (bi.modifiers || []).map(mod => mod.name).filter(Boolean).join('、');
            return `${bName}${bQtyStr}${modNames ? ` (${modNames})` : ''}${bSurStr}`;
          }).filter(Boolean).join('、');

          if (itemsStr) {
            result.push({
              group: gName,
              choice: `${pPrefix}${gName}：${itemsStr}`,
              price: 0
            });
          }
        });
      });
      return result;
    }

    getGlobalCustomizations(order) {
      if (!order) return [];
      if (typeof OrderDetailView !== 'undefined' && OrderDetailView.isSnapshot(order.detailSnapshot))
        return OrderDetailView.globalChoices(order.detailSnapshot);
      return LegacyOrderAdapter.globalChoices(order);
    }

    parseOrderItems(order, expand = true) {
      if (typeof OrderDetailView !== 'undefined' && OrderDetailView.isSnapshot(order?.detailSnapshot))
        return OrderDetailView.printItems(order.detailSnapshot, expand);
      return LegacyOrderAdapter.items.call(this, order, expand);
    }

    // --- 5. RECEIPT & LABEL BUILDERS ---
    async printCashierReceipt(order, config) {
      if (config.protocol === 'tspl') {
        const dim = this.resolveLabelDimensions(config);
        if (config.tspl_mode === 'item_stickers') {
          const items = this.parseOrderItems(order, true);
          const results = [];
          for (let idx = 0; idx < items.length; idx++) {
            const it = items[idx];
            const png = this.drawItemStickerToCanvas(it, order, idx + 1, items.length, dim.widthMm, dim.heightMm, dim.dpi);
            results.push(await this.transmitReceiptBitmap(png, config, `Sticker #${order.key} (${idx + 1}/${items.length})`));
          }
          return results;
        } else {
          const base64Png = this.drawOrderLabelToCanvas(order, false, dim.widthMm, dim.heightMm, dim.dpi);
          return this.transmitReceiptBitmap(base64Png, config, `TSPL Label #${order.key}`);
        }
      }
      const base64Png = this.drawReceiptToCanvas(order, false, config.paperWidth || 80);
      return this.transmitReceiptBitmap(base64Png, config, `Cashier #${order.key}`);
    }

    async printKitchenTicket(order, config) {
      if (config.protocol === 'tspl') {
        const dim = this.resolveLabelDimensions(config);
        if (config.tspl_mode === 'item_stickers') {
          const items = this.parseOrderItems(order);
          const results = [];
          for (let idx = 0; idx < items.length; idx++) {
            const it = items[idx];
            const png = this.drawItemStickerToCanvas(it, order, idx + 1, items.length, dim.widthMm, dim.heightMm, dim.dpi);
            results.push(await this.transmitReceiptBitmap(png, config, `Kitchen Sticker #${order.key} (${idx + 1}/${items.length})`));
          }
          return results;
        } else {
          const base64Png = this.drawOrderLabelToCanvas(order, true, dim.widthMm, dim.heightMm, dim.dpi);
          return this.transmitReceiptBitmap(base64Png, config, `Kitchen TSPL Label #${order.key}`);
        }
      }
      const base64Png = this.drawReceiptToCanvas(order, true, config.paperWidth || 80);
      return this.transmitReceiptBitmap(base64Png, config, `Kitchen #${order.key}`);
    }

    async testPrint(stationType, targetConfig = null) {
      const config = targetConfig || (stationType === 'kitchen' ? this.getSettings().kitchen : this.getSettings().cashier);
      const isKitchen = stationType === 'kitchen';

      const mockOrder = {
        key: 'TEST-01',
        customer: '測試列印員',
        diningOption: 'dine_in',
        tableNumber: '88',
        time: new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false }),
        content: '2份 x 測試招牌特餐\n   ↳ 大辣、不加蔥\n1份 x 鮮奶茶',
        total: 180,
        note: '這是一張測試列印單據，用於檢驗 TCP Socket / 藍牙 / TSPL 排版。',
        createdAt: Date.now()
      };

      if (config.protocol === 'tspl') {
        const dim = this.resolveLabelDimensions(config);
        if (config.tspl_mode === 'item_stickers') {
          const mockItem = { name: '測試招牌特餐', quantity: 2, options: '大辣、不加蔥', note: '少冰' };
          const base64Png = this.drawItemStickerToCanvas(mockItem, mockOrder, 1, 2, dim.widthMm, dim.heightMm, dim.dpi);
          return this.transmitReceiptBitmap(base64Png, config, `Test-${stationType}-TSPL-Sticker`);
        } else {
          const base64Png = this.drawOrderLabelToCanvas(mockOrder, isKitchen, dim.widthMm, dim.heightMm, dim.dpi);
          return this.transmitReceiptBitmap(base64Png, config, `Test-${stationType}-TSPL-Label`);
        }
      }

      const base64Png = this.drawReceiptToCanvas(mockOrder, isKitchen, config.paperWidth || 80);
      return this.transmitReceiptBitmap(base64Png, config, `Test-${stationType}`);
    }

    // Format date as [M/D] (no leading zero) and combine with HH:mm
    formatShortDateTime(timeStr, createdAt) {
      let month = null;
      let day = null;
      if (timeStr) {
        const m = String(timeStr).match(/(?:(\d{4})[-/])?(\d{1,2})[-/](\d{1,2})/);
        if (m) {
          month = parseInt(m[2], 10);
          day = parseInt(m[3], 10);
        }
      }
      if (!month || !day) {
        let d = null;
        if (createdAt) {
          const ms = typeof createdAt === 'number'
            ? createdAt
            : new Date(String(createdAt).endsWith('Z') ? createdAt : createdAt + 'Z').getTime();
          if (!Number.isNaN(ms) && ms > 0) {
            d = new Date(ms);
          }
        }
        if (!d || isNaN(d.getTime())) {
          d = new Date();
        }
        month = d.getMonth() + 1;
        day = d.getDate();
      }

      let cleanTime = String(timeStr || '').match(/\d{1,2}:\d{2}/)?.[0];
      if (!cleanTime) {
        let d = null;
        if (createdAt) {
          const ms = typeof createdAt === 'number'
            ? createdAt
            : new Date(String(createdAt).endsWith('Z') ? createdAt : createdAt + 'Z').getTime();
          if (!Number.isNaN(ms) && ms > 0) {
            d = new Date(ms);
          }
        }
        if (!d || isNaN(d.getTime())) {
          d = new Date();
        }
        cleanTime = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
      }

      return `${month}/${day} ${cleanTime}`;
    }

    // --- 6. PURE HTML5 CANVAS RECEIPT PAINTER (Zero-Taint, 100% Crisp Typography) ---
    // Measure first, then paint at the required height so large fonts never clip.
    wrapPrintText(ctx, text, maxWidth) {
      const result = [];
      for (const paragraph of String(text ?? '').split('\n')) {
        let line = '';
        for (const char of paragraph) {
          const candidate = line + char;
          const width = typeof ctx.measureText === 'function'
            ? ctx.measureText(candidate).width : candidate.length * (parseFloat(ctx.font.match(/[\d.]+px/)?.[0]) || 24);
          if (line && width > maxWidth) {
            // Keep Latin words together when a previous space can wrap the row.
            const split = candidate.lastIndexOf(' ');
            if (split > 0 && /^[\x20-\x7e]+$/.test(candidate)) {
              result.push(candidate.slice(0, split + 1)); line = candidate.slice(split + 1);
            } else { result.push(line); line = char; }
          }
          else line = candidate;
        }
        result.push(line);
      }
      return result;
    }

    drawReceiptToCanvas(order, isKitchen, paperWidth = 80) {
      const width = Number(paperWidth) === 58 ? 384 : 576;
      // Keep only a small top/bottom quiet zone. The cutter feed is handled
      // after the raster payload, so a large canvas padding here wastes paper
      // at the beginning of every receipt.
      const padding = Number(paperWidth) === 58 ? 1 : 1;
      const available = width - padding * 2;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      const ctx = canvas.getContext('2d');
      const operations = [];
      let y = padding;
      const row = (left, size, right = '', weight = 'normal', centered = false, rightSize = null, rightWeight = null) => {
        const font = `${weight} ${size}px sans-serif`;
        const rWeight = rightWeight || weight;
        const rSize = rightSize || size;
        const rFont = `${rWeight} ${rSize}px sans-serif`;
        ctx.font = rFont;
        const gap = 16;
        const maxRightWidth = available * 0.52;
        const rightWidth = right ? Math.min(maxRightWidth,
          typeof ctx.measureText === 'function' ? ctx.measureText(String(right)).width : maxRightWidth) : 0;
        ctx.font = font;
        const leftLines = this.wrapPrintText(ctx, left, available - (right ? rightWidth + gap : 0));
        ctx.font = rFont;
        const rightLines = right ? this.wrapPrintText(ctx, right, rightWidth) : [];
        const lineHeight = Math.ceil(Math.max(size, rSize) * 1.25);
        leftLines.forEach((text, i) => operations.push({
          text, x: centered ? width / 2 : padding,
          y: y + i * lineHeight, font, align: centered ? 'center' : 'left'
        }));
        rightLines.forEach((text, i) => operations.push({
          text, x: width - padding,
          y: y + i * lineHeight, font: rFont, align: 'right'
        }));
        y += Math.max(leftLines.length, rightLines.length) * lineHeight + 6;
      };
      const divider = () => { y += 8; operations.push({ line: true, y }); y += 16; };
      const brand = window.currentTenantBrandName || order.storeName || order.tenantName || '';
      if (brand) row(brand, 51, '', 'normal', true);
      if (isKitchen) row('廚房出餐聯', 45, '', 'normal', true);
      divider();
      const diningText = order.diningOption === 'dine_in'
        ? '內用 ' + (order.tableNumber ? '桌號：' + order.tableNumber : '')
        : '外帶自取';
      row('#' + (order.displayKey || order.key), 36, diningText, 'bold', false, 32, 'bold');
      row('顧客：' + (order.customer || '顧客'), 29, '', 'normal');
      row('時間：' + (order.time || ''), 29, '', 'normal');
      divider();

      const globalCustomizations = this.getGlobalCustomizations(order);
      if (globalCustomizations && globalCustomizations.length > 0) {
        const flavorTitle = (typeof t === 'function' && t('flavorTitle')) || '口味與客製設定';
        row(`【${flavorTitle}】`, 32, '', 'bold');
        for (const gc of globalCustomizations) {
          const text = gc.label ? `${gc.label}：${gc.value}` : `${gc.value}`;
          row('  • ' + text, 29, '', 'normal');
        }
        divider();
      }

      for (const item of this.parseOrderItems(order, false)) {
        if (item.round) row(item.round, 30, '', 'normal');
        row(item.quantity + ' x ' + item.name, isKitchen ? 42 : 36, isKitchen ? '' : (item.price || '—'), 'normal');
        if (item.options) {
          const optLines = String(item.options).split('\n').map(l => l.trim()).filter(Boolean);
          optLines.forEach(l => {
            const clean = l.replace(/^[↳\-+•－]\s*/, '').trim();
            row('  ↳ ' + clean, 30, '', 'normal');
          });
        }
        if (item.note) {
          const noteLines = String(item.note).split('\n').map(l => l.trim()).filter(Boolean);
          noteLines.forEach(l => {
            const clean = l.replace(/^[↳\-+•－*]\s*/, '').trim();
            row('  * ' + clean, 30, '', 'normal');
          });
        }
      }
      if (order.note?.trim()) { divider(); row('備註：' + order.note, 29, '', 'normal'); }
      if (!isKitchen) {
        divider();
        row('應收總計', 48, '$' + (order.total ?? 0), 'bold');

        // --- Con dấu vuông đã thanh toán online (Square Stamp Inline Right) ---
        const isOnlinePaid = Boolean(
          (order?.payment && String(order.payment.status).toUpperCase() === 'PAID') ||
          (order?.payment_status && String(order.payment_status).toUpperCase() === 'PAID') ||
          (order?.paymentStatus && String(order.paymentStatus).toUpperCase() === 'PAID')
        );

        const paymentText = order.payment
          ? 'LINE Pay · ' + (typeof t === 'function' ? t('payment' + order.payment.status) : order.payment.status)
          : (isOnlinePaid ? '線上支付 · 已付款' : '');

        if (paymentText || isOnlinePaid) {
          if (isOnlinePaid) {
            const is58 = Number(paperWidth) === 58;
            const scale = is58 ? 0.75 : 1.0;
            const stampW = Math.round(140 * scale);
            const stampH = Math.round(42 * scale);
            const textH = Math.ceil(29 * 1.25);
            const rowH = Math.max(textH, stampH);

            const textY = y + 4;
            if (paymentText) {
              operations.push({
                text: paymentText,
                x: padding,
                y: textY,
                font: 'normal 29px sans-serif',
                align: 'left'
              });
            }

            const stampCx = width - padding - Math.round(stampW / 2) - 6;
            const stampCy = textY + Math.round(textH / 2) - 3;
            operations.push({
              stamp: true,
              style: 'square',
              x: stampCx,
              y: stampCy,
              paperWidth: Number(paperWidth) || 80
            });

            y += rowH + 16;
          } else {
            row(paymentText, 29, '', 'normal');
          }
        }

        divider();
        // Keep the Chinese greeting and attribution on separate centered rows.
        // Sharing one row made both strings wrap on narrow 58 mm paper.
        row('謝謝光臨，祝您用餐愉快！', 25, '', 'normal', true);
        row('Powered by Blab', 22, '', 'normal', true);
      }
      canvas.height = Math.ceil(y + padding);
      const paint = canvas.getContext('2d');
      paint.fillStyle = '#fff';
      paint.fillRect(0, 0, width, canvas.height);
      paint.fillStyle = '#000';
      paint.textBaseline = 'top';
      for (const op of operations) {
        if (op.line) {
          this.drawDashedLine(paint, padding, width - padding, op.y);
        } else if (op.stamp) {
          this.drawPaidStamp(paint, op.x, op.y, op.paperWidth, op.style);
        } else {
          paint.font = op.font;
          paint.textAlign = op.align;
          paint.fillText(op.text, op.x, op.y);
        }
      }
      const dataUrl = canvas.toDataURL('image/png');
      canvas.width = 0;
      canvas.height = 0;
      return dataUrl;
    }

    drawPaidStamp(ctx, cx, cy, paperWidth = 80, style = 'square') {
      if (typeof ctx.save === 'function') ctx.save();
      if (typeof ctx.translate === 'function') ctx.translate(cx, cy);
      if (typeof ctx.rotate === 'function') ctx.rotate(-5 * Math.PI / 180);

      const is58 = Number(paperWidth) === 58;
      const scale = is58 ? 0.75 : 1.0;

      if (style === 'circle') {
        const r = Math.round(62 * scale);
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = Math.round(4 * scale);
        if (typeof ctx.beginPath === 'function') ctx.beginPath();
        if (typeof ctx.arc === 'function') ctx.arc(0, 0, r, 0, Math.PI * 2);
        if (typeof ctx.stroke === 'function') ctx.stroke();

        ctx.lineWidth = Math.max(1, Math.round(1.5 * scale));
        const inset = Math.round(6 * scale);
        if (typeof ctx.beginPath === 'function') ctx.beginPath();
        if (typeof ctx.arc === 'function') ctx.arc(0, 0, r - inset, 0, Math.PI * 2);
        if (typeof ctx.stroke === 'function') ctx.stroke();

        ctx.fillStyle = '#000000';
        ctx.font = `900 ${Math.round(30 * scale)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (typeof ctx.fillText === 'function') ctx.fillText('已 付 款', 0, Math.round(-6 * scale));

        ctx.font = `bold ${Math.round(14 * scale)}px sans-serif`;
        if (typeof ctx.fillText === 'function') ctx.fillText('★ PAID ★', 0, Math.round(22 * scale));
      } else {
        // Default: Compact Square / Rectangular double border stamp (方印)
        const w = Math.round(140 * scale);
        const h = Math.round(42 * scale);

        // Outer border
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = Math.round(3 * scale);
        if (typeof ctx.strokeRect === 'function') {
          ctx.strokeRect(-w / 2, -h / 2, w, h);
        } else if (typeof ctx.stroke === 'function') {
          this.drawRoundRectPath(ctx, -w / 2, -h / 2, w, h, 0);
          ctx.stroke();
        }

        // Inner border
        ctx.lineWidth = Math.max(1, Math.round(1.2 * scale));
        const inset = Math.round(3.5 * scale);
        if (typeof ctx.strokeRect === 'function') {
          ctx.strokeRect(-w / 2 + inset, -h / 2 + inset, w - inset * 2, h - inset * 2);
        } else if (typeof ctx.stroke === 'function') {
          this.drawRoundRectPath(ctx, -w / 2 + inset, -h / 2 + inset, w - inset * 2, h - inset * 2, 0);
          ctx.stroke();
        }

        // Text "已 付 款"
        ctx.fillStyle = '#000000';
        ctx.font = `900 ${Math.round(23 * scale)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (typeof ctx.fillText === 'function') ctx.fillText('已 付 款', 0, 1);
      }
      if (typeof ctx.restore === 'function') ctx.restore();
    }

    drawRoundRectPath(ctx, x, y, w, h, r) {
      if (typeof ctx.beginPath !== 'function') return;
      ctx.beginPath();
      if (typeof ctx.arcTo === 'function') {
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
      } else if (typeof ctx.rect === 'function') {
        ctx.rect(x, y, w, h);
      }
      if (typeof ctx.closePath === 'function') ctx.closePath();
    }

    drawDashedLine(ctx, x1, x2, y) {
      ctx.save();
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(x1, y);
      ctx.lineTo(x2, y);
      ctx.stroke();
      ctx.restore();
    }

    // --- 7. TSPL CANVAS PAINTERS (Order Summary Label & Individual Cup/Item Stickers) ---
    drawOrderLabelToCanvas(order, isKitchen, widthMm = 100, heightMm = 150, dpi = 203) {
      const dining = order.diningOption === 'dine_in' ? '桌:' + (order.tableNumber || '-') : '外帶';
      const body = this.parseOrderItems(order, false).map(item =>
        [item.quantity + ' x ' + item.name, item.options, item.note].filter(Boolean).join('\n')).join('\n');
      return this.drawStickerLayout(
        [window.currentTenantBrandName, '#' + (order.displayKey || order.key), dining].filter(Boolean).join(' '),
        [body, order.note].filter(Boolean).join('\n'),
        isKitchen ? (order.customer || '') : '應收總計：$' + (order.total ?? 0),
        widthMm, heightMm, dpi, [60, 36, 52]);
    }

    // Fixed paper: grow typography to the requested target, then fit all text.
    drawStickerLayout(header, body, footer, widthMm, heightMm, dpi, sizes) {
      const scale = dpi === 300 ? 300 / 203 : 1;
      const width = Math.round(widthMm * (dpi === 300 ? 11.811 : 8));
      const height = Math.round(heightMm * (dpi === 300 ? 11.811 : 8));
      const padding = Math.round(10 * scale);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#000'; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
      const available = width - padding * 2;
      const topHeight = Math.round((height - padding * 2) * 0.22);
      const bottomHeight = Math.round((height - padding * 2) * 0.18);
      const gap = Math.round(6 * scale);
      const draw = (text, top, boxHeight, target, weight = 'normal') => {
        let size = Math.round(target * scale);
        let lines;
        do {
          ctx.font = `${weight} ${size}px sans-serif`;
          lines = this.wrapPrintText(ctx, text, available);
          if (lines.length * Math.ceil(size * 1.15) <= boxHeight) break;
          size--;
        } while (size > 1);
        const lineHeight = Math.ceil(size * 1.15);
        lines.forEach((line, i) => ctx.fillText(line, padding, top + i * lineHeight));
      };
      draw(header, padding, topHeight, sizes[0], 'normal');
      draw(body, padding + topHeight + gap, height - padding * 2 - topHeight - bottomHeight - gap * 2, sizes[1], 'normal');
      draw(footer, height - padding - bottomHeight, bottomHeight, sizes[2], 'normal');
      const dataUrl = canvas.toDataURL('image/png');
      canvas.width = 0;
      canvas.height = 0;
      return dataUrl;
    }

    drawItemStickerToCanvas(item, orderContext, itemIdx, totalItems, widthMm = 40, heightMm = 30, dpi = 203) {
      const compact = widthMm <= 42;
      const dining = orderContext.diningOption === 'dine_in' ? '桌:' + (orderContext.tableNumber || '-') : '外帶';
      const header = '#' + (orderContext.displayKey || orderContext.key) + ' ' + dining + ' [' + itemIdx + '/' + totalItems + ']';
      const body = [item.name + ' x' + item.quantity, item.options, item.note].filter(Boolean).join('\n');
      const dateTime = this.formatShortDateTime(orderContext.time, orderContext.createdAt);
      return this.drawStickerLayout(header, body, (orderContext.customer || '顧客') + ' ' + dateTime,
        widthMm, heightMm, dpi, compact ? [28, 36, 22] : [34, 45, 26]);
    }

    drawQuickNoteStickerToCanvas(text, orderContext = null, widthMm = 40, heightMm = 30, dpi = 203) {
      const compact = widthMm <= 42;
      const context = orderContext || {};
      const dateTime = this.formatShortDateTime(context.time, context.createdAt);
      return this.drawStickerLayout(context.key ? '#' + (context.displayKey || context.key) : '備註',
        String(text || '').trim(), (window.currentTenantBrandName || '') + ' ' + dateTime,
        widthMm, heightMm, dpi, compact ? [26, 72, 22] : [32, 90, 26]);
    }

    async transmitReceiptBitmap(base64Png, config, logTitle) {
      return this.enqueuePrintTask(async () => {
        const interfaceType = config.interface_type || 'network';
        const protocol = config.protocol || 'esc_pos';
        const dim = this.resolveLabelDimensions(config);
        const paperWidth = parseInt(config.paperWidth, 10) || 80;
        const autoCut = config.autoCut !== false;
        const plugin = this.getPlugin();
        this.isNative = this.checkIsNative();

        if (interfaceType === 'bluetooth') {
          const macAddress = (config.mac_address || '').trim();
          const deviceName = config.device_name || macAddress || 'Bluetooth Printer';

          if (!macAddress) {
            throw new Error('未選擇藍牙印表機 (Please select a paired Bluetooth printer)');
          }

          if (this.isNative && plugin && typeof plugin.printBluetooth === 'function') {
            console.log(`[PrinterService] 📡 Transmitting ${protocol.toUpperCase()} raster bitmap via Native Bluetooth SPP [${deviceName} (${macAddress})]...`);
            const btPayload = {
              macAddress: macAddress,
              base64Image: base64Png,
              protocol: protocol,
              paperWidth: paperWidth,
              autoCut: autoCut,
              feedBeforeCutMm: Number(config.feedBeforeCutMm) || 80,
              labelWidthMm: dim.widthMm,
              labelHeightMm: dim.heightMm,
              dpi: dim.dpi,
              xOffsetMm: dim.xOffsetMm,
              yOffsetMm: dim.yOffsetMm,
              timeoutMs: 8000
            };
            let res;
            try {
              res = await plugin.printBluetooth(btPayload);
            } catch (btErr) {
              if (String(btErr?.message || btErr).includes('BLUETOOTH_CONNECT') && typeof plugin.getPairedBluetoothDevices === 'function') {
                await this.getPairedBluetoothDevices();
                res = await plugin.printBluetooth(btPayload);
              } else {
                throw btErr;
              }
            }
            console.log(`[PrinterService] ✅ Native Bluetooth print success for [${logTitle}]:`, res);
            return res;
          } else {
            console.log(`[PrinterService] 🌐 Browser Simulator: Print job generated for [${logTitle}] -> Bluetooth ${deviceName} (${macAddress}) [${protocol.toUpperCase()}]`);
            this.openBrowserPreview(base64Png, logTitle, `Bluetooth: ${deviceName} (${macAddress})`, `Protocol: ${protocol.toUpperCase()}`);
            return { success: true, simulated: true, interface: 'bluetooth', protocol, macAddress };
          }
        } else {
          // Network TCP Socket
          const ip = (config.ip || '').trim();
          const port = parseInt(config.port, 10) || 9100;

          if (!ip) {
            throw new Error('未設定印表機 IP 位址 (No printer IP address configured)');
          }

          if (this.isNative && plugin && typeof plugin.printBitmap === 'function') {
            console.log(`[PrinterService] 🚀 Transmitting ${protocol.toUpperCase()} raster bitmap via Native TCP Socket ${ip}:${port}...`);
            const res = await plugin.printBitmap({
              ip: ip,
              port: port,
              base64Image: base64Png,
              protocol: protocol,
              paperWidth: paperWidth,
              autoCut: autoCut,
              feedBeforeCutMm: Number(config.feedBeforeCutMm) || 80,
              labelWidthMm: dim.widthMm,
              labelHeightMm: dim.heightMm,
              dpi: dim.dpi,
              xOffsetMm: dim.xOffsetMm,
              yOffsetMm: dim.yOffsetMm,
              timeoutMs: 5000
            });
            console.log(`[PrinterService] ✅ Native print success for [${logTitle}]:`, res);
            return res;
          } else {
            console.log(`[PrinterService] 🌐 Browser Simulator: Print job generated for [${logTitle}] -> ${ip}:${port} [${protocol.toUpperCase()}]`);
            this.openBrowserPreview(base64Png, logTitle, `Network IP: ${ip}:${port}`, `Protocol: ${protocol.toUpperCase()}`);
            return { success: true, simulated: true, interface: 'network', protocol, ip, port };
          }
        }
      });
    }

    async testConnection(config) {
      const interfaceType = config.interface_type || 'network';
      const plugin = this.getPlugin();
      this.isNative = this.checkIsNative();

      if (interfaceType === 'bluetooth') {
        const macAddress = (config.mac_address || '').trim();
        if (!macAddress) throw new Error('未選擇藍牙印表機 (No Bluetooth printer selected)');
        if (this.isNative && plugin && typeof plugin.testBluetoothConnection === 'function') {
          try {
            return await plugin.testBluetoothConnection({ macAddress });
          } catch (btErr) {
            if (String(btErr?.message || btErr).includes('BLUETOOTH_CONNECT') && typeof plugin.getPairedBluetoothDevices === 'function') {
              await this.getPairedBluetoothDevices();
              return await plugin.testBluetoothConnection({ macAddress });
            }
            throw btErr;
          }
        }
        return { success: true, simulated: true, macAddress };
      } else {
        const ip = (config.ip || '').trim();
        const port = parseInt(config.port, 10) || 9100;
        if (!ip) throw new Error('未輸入印表機 IP (No printer IP entered)');
        if (this.isNative && plugin && typeof plugin.testConnection === 'function') {
          return await plugin.testConnection({ ip, port, timeoutMs: 2500 });
        }
        return { success: true, simulated: true, ip, port };
      }
    }

    openBrowserPreview(base64Png, title, targetInfo, portOrType) {
      const previewWindow = window.open('', '_blank');
      if (previewWindow) {
        previewWindow.document.write(`
          <html>
            <head><title>Print Preview - ${title}</title></head>
            <body style="background:#1e293b; color:#fff; font-family:sans-serif; display:flex; flex-direction:column; align-items:center; padding:20px;">
              <h3>🖨️ Thermal Print Simulation (${title})</h3>
              <p style="color:#94a3b8;">Target: <b>${targetInfo}</b> | <span style="background:#059669; color:#fff; padding:2px 8px; border-radius:4px;">${portOrType || ''}</span></p>
              <div style="background:#fff; padding:10px; border-radius:8px; box-shadow:0 4px 12px rgba(0,0,0,0.5); max-width:90%;">
                <img src="${base64Png}" style="display:block; max-width:100%; height:auto;" />
              </div>
            </body>
          </html>
        `);
        if (typeof previewWindow.document.close === 'function') {
          previewWindow.document.close();
        }
      }
    }
  }

  window.PrinterService = new PrinterService();

})(window);
