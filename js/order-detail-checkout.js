/* Typed checkout boundary. The legacy builder remains only for old deployments. */
var DetailCheckout = (function () {
  const enabled = () => typeof bootstrapData !== 'undefined' && bootstrapData?.orderDetailVersion === 1;
  const storageKey = () => `order_detail_pending:${typeof getTenantIdFromUrl === 'function' ? getTenantIdFromUrl() : ''}`;
  let pending = null;
  let context = null;
  const sources = new Map();
  function selections() {
    return (bootstrapData.customizations || []).map(group => {
      const selected = Array.from(document.getElementsByName(`opt-${group.key}`)).filter(el => el.checked);
      return { groupId: group.id || group.key, items: selected.map(el => {
        const container = el.closest('.flavor-option-container');
        const subs = container ? Array.from(container.querySelectorAll('.sub-opt-chk:checked')).map(s => ({ id: s.dataset.subId || s.value })) : [];
        return { optionId: el.dataset.optionId, quantity: 1, groups: [], subOptions: subs };
      }) };
    });
  }
  function items() {
    const result = [];
    for (const key of Object.keys(cart)) {
      const quantity = Number(cart[key]);
      if (quantity <= 0) continue;
      const info = resolveCatalogItem(key);
      const groups = window.bundleCartData?.[key] || [];
      const notes = Array.from({ length: quantity }, (_, i) => String(customizeData[key]?.[i]?.note || customizeData[key]?.[i]?.customText || '').trim());
      const originals = sources.get(key) || [];
      let offset = 0;
      const chunks = originals.length ? originals.map((line, i) => ({ line,
        quantity: i === originals.length - 1 ? quantity - originals.slice(0, i).reduce((n, l) => n + l.quantity, 0) : Math.min(line.quantity, quantity - originals.slice(0, i).reduce((n, l) => n + l.quantity, 0)) })) : [{ line: null, quantity }];
      for (const chunk of chunks) {
        if (chunk.quantity <= 0) continue;
        const portions = groups.slice(offset, offset + chunk.quantity).map((p, i) => ({ ...p, portionIndex: i }));
        result.push({ lineId: chunk.line?.lineId, itemId: info.itemId, quantity: chunk.quantity,
          note: chunk.line?.note || '', portionNotes: notes.slice(offset, offset + chunk.quantity),
          bundleSelections: portions.length ? { version: 3, portions } : null, options: [] });
        offset += chunk.quantity;
      }
    }
    return result;
  }
  async function prepare(payload) {
    if (!enabled()) return payload;
    const key = payload.parent_order_key || payload.order_key;
    if (key && !context) {
      const res = await fetch(`${WORKER_BASE}/api/order/edit-context?key=${encodeURIComponent(key)}&tenant_id=${encodeURIComponent(payload.tenant_id)}`);
      if (!res.ok) throw new Error('Không tải được đơn / 無法讀取訂單');
      context = (await res.json()).order;
    }
    const modern = { ...payload, detailVersion: 1, items: items(), orderSelections: selections(),
      expectedDetailRevision: key ? context?.detailRevision || 0 : undefined,
      targetRound: payload.order_key ? window.detailTargetRound : undefined };
    const fingerprint = JSON.stringify({ key, items: modern.items, groups: modern.orderSelections, note: modern.note,
      total: modern.appended_total ?? modern.new_total ?? modern.total, revision: modern.expectedDetailRevision,
      target: modern.targetRound, dining: modern.dining_option, table: modern.table_number });
    try { pending ||= JSON.parse(sessionStorage.getItem(storageKey()) || 'null'); } catch (_) {}
    if (pending?.fingerprint === fingerprint) return pending.payload;
    modern.operationId = crypto.randomUUID();
    if (!key) modern.uuid = modern.operationId;
    pending = { fingerprint, payload: modern };
    try { sessionStorage.setItem(storageKey(), JSON.stringify(pending)); } catch (_) {}
    return modern;
  }
  function completed() {
    pending = null;
    try { sessionStorage.removeItem(storageKey()); } catch (_) {}
  }
  function setContext(order) { context = order; }
  function register(key, line) {
    if (!sources.has(key)) sources.set(key, []);
    sources.get(key).push(line);
  }
  return { enabled, selections, items, prepare, completed, setContext, register };
})();
