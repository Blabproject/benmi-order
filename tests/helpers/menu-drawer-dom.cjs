// JSDOM adapter for event-driven drawer tests executing the real React + TypeScript
// option-groups bridge compiled via Vite.
const { JSDOM } = require('jsdom');
const { webcrypto } = require('node:crypto');
const { getOptionGroupsBridgeBundleCode } = require('./option-groups-bundle.cjs');

async function setup({ included = false, source = false, lang = 'vi' } = {}) {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'http://localhost/orders.html',
    pretendToBeVisual: true,
    runScripts: 'dangerously',
  });

  const win = dom.window;
  const doc = win.document;

  if (!win.crypto) {
    Object.defineProperty(win, 'crypto', { value: webcrypto, configurable: true });
  }
  win.requestAnimationFrame = (fn) => setTimeout(fn, 0);
  win.cancelAnimationFrame = (id) => clearTimeout(id);
  win.HTMLElement.prototype.scrollIntoView = () => {};
  win.HTMLElement.prototype.getClientRects = function getClientRects() {
    for (let node = this; node && node.nodeType === 1; node = node.parentElement) {
      if (node.hasAttribute('hidden') || node.hasAttribute('inert')) return [];
      if (
        node.parentElement &&
        node.parentElement.tagName === 'DETAILS' &&
        !node.parentElement.open &&
        node.tagName !== 'SUMMARY'
      ) {
        return [];
      }
    }
    return [{}];
  };

  const launch = doc.createElement('button');
  launch.id = 'launch-option';
  doc.body.appendChild(launch);
  launch.focus();

  let catalog = {
    products: [
      { id: 'meal', category_id: 'food', name: 'Bánh mì', price: 100 },
      { id: 'coffee', category_id: 'drinks', name: 'Cà phê', price: 48 },
      { id: 'tea', category_id: 'drinks', name: 'Trà đen', price: 37 },
    ],
    categories: [
      { id: 'food', name: 'Món ăn', category_type: 'catalog' },
      { id: 'drinks', name: 'Đồ uống', category_type: 'catalog' },
    ],
    groups: [
      {
        id: 'drinks',
        name: 'Chọn đồ uống',
        revision: 1,
        minSelection: 1,
        maxSelection: 1,
        included,
        allowRepeats: false,
        sources: source ? [{ type: 'category', categoryId: 'drinks' }] : [],
        options: [
          {
            id: 'coffee_option',
            productId: 'coffee',
            name: 'Tên lưu cũ',
            price: 0,
            quantity: 1,
            isDefault: false,
            subOptions: [],
            eligibilityRules: [],
            metadata: { keep: 'coffee' },
          },
          {
            id: 'custom',
            name: 'Topping',
            price: 5,
            quantity: 1,
            subOptions: ['Nóng'],
            metadata: { keep: 'custom' },
          },
        ],
        metadata: { keep: 'group' },
        labels: {},
      },
    ],
    links: [{ groupId: 'drinks', itemId: 'meal', optionIds: null, disabled: false }],
    categoryLinks: [],
  };

  const posts = [];
  const endpoints = [];
  const responses = [];

  win.I18N = { vi: {}, 'zh-TW': {} };
  win.currentLang = lang;
  win.WORKER_BASE = 'https://test.invalid';
  win.getTenantIdFromUrl = () => 'tenant';
  win.syncMenuDataFromDOM = () => {};
  win.renderMenuCategories = () => {};
  win.renderMenuCategoryEditor = () => {};
  win.checkMenuDirty = () => {};
  win.canonicalMenuSnapshot = JSON.stringify;
  win.activeCategoryIndex = 0;
  win.currentMenuData = [
    {
      id: 'food',
      databaseId: 'food',
      items: [{ id: 'meal', name: 'Bản nháp khác', price: 999 }],
      groups: [{ id: 'drinks', canonicalId: 'drinks', title: 'Chọn đồ uống' }],
    },
  ];
  win.savedMenuSnapshot = JSON.stringify([
    {
      id: 'food',
      databaseId: 'food',
      items: [{ id: 'meal', name: 'Bánh mì', price: 100 }],
      groups: [{ id: 'drinks', canonicalId: 'drinks', title: 'Chọn đồ uống' }],
    },
  ]);

  win.fetch = async (url, request) => {
    if (!request || !request.body) {
      return {
        ok: true,
        status: 200,
        json: async () => structuredClone(catalog),
      };
    }
    const payload = JSON.parse(request.body);
    posts.push(payload);
    endpoints.push({ url, payload });
    const queued = responses.shift();
    if (queued) return queued;

    const next = structuredClone(catalog);
    if (url.includes('/api/menu/stock-status?')) {
      const isOos = payload.status === 'out_of_stock';
      for (const grp of next.groups || []) {
        if (payload.group_id && grp.id !== payload.group_id) continue;
        for (const opt of grp.options || []) {
          if (opt.id === payload.option_id || opt.name === payload.name) {
            opt.isLocallyOutOfStock = isOos;
            opt.isOutOfStock = isOos;
            opt.outOfStockUntil = isOos ? '9999-12-31T23:59:59.000Z' : null;
          }
        }
      }
      catalog = next;
      return { ok: true, status: 200, json: async () => ({ success: true }) };
    }

    if (url.includes('/api/menu/product?')) {
      const index = next.products.findIndex((p) => p.id === payload.id);
      if (index >= 0) {
        next.products[index] = {
          ...next.products[index],
          name: payload.name,
          price: payload.price,
          category_id: payload.categoryId,
          badge_text: payload.badgeText,
          description:
            payload.description !== undefined
              ? String(payload.description ?? '').trim() || null
              : next.products[index].description,
          i18n:
            payload.i18n !== undefined
              ? payload.i18n
              : next.products[index].i18n,
          is_recommended: payload.isRecommended,
          image_key: payload.imageKey ? payload.imageKey : null,
          menu_revision: Number(payload.revision || 0) + 1,
        };
      }
      next.links = next.links
        .filter((l) => l.itemId !== payload.id)
        .concat((payload.links || []).map((l) => ({ ...l, itemId: payload.id })));
    } else if (url.includes('/api/menu/option-group?')) {
      const index = next.groups.findIndex((g) => g.id === payload.id);
      if (index >= 0) {
        if (payload.delete) {
          next.groups.splice(index, 1);
        } else {
          next.groups[index] = { ...payload, revision: Number(payload.revision || 0) + 1 };
        }
      } else if (!payload.delete) {
        next.groups.push({
          ...payload,
          id: payload.id || `grp_${Date.now()}`,
          revision: 1,
        });
      }
      if (!payload.delete && Array.isArray(payload.itemIds)) {
        next.links = next.links.filter((l) => l.groupId !== payload.id);
        for (const pid of payload.itemIds) {
          next.links.push({ groupId: payload.id, itemId: pid, optionIds: null, disabled: false });
        }
      }
    }

    catalog = next;
    return { ok: true, status: 200, json: async () => ({ catalog: structuredClone(catalog) }) };
  };

  win.t = (key, args) =>
    String(win.I18N?.[win.currentLang]?.[key] || key).replace(
      /\{(\w+)\}/g,
      (_, k) => args?.[k] ?? ''
    );

  const code = await getOptionGroupsBridgeBundleCode();
  win.eval(code);
  await win.UnifiedMenu.load();

  const drawer = () => doc.getElementById('unified-menu-drawer');
  const get = (selector) => {
    const el = drawer()?.querySelector(selector);
    if (!el) throw new Error(`Missing UI control: ${selector}`);
    return el;
  };

  const flushTicks = async () => {
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setImmediate(r));
  };

  const emit = (type, target, props = {}) => {
    if (!target) return;
    if (type === 'keydown' || type === 'keyup') {
      const evt = new win.KeyboardEvent(type, {
        bubbles: true,
        cancelable: true,
        key: props.key || '',
      });
      target.dispatchEvent(evt);
      return;
    }
    if (type === 'focus' || type === 'blur') {
      const evt = new win.FocusEvent(type, { bubbles: true });
      target.dispatchEvent(evt);
      return;
    }
    if (type === 'click') {
      target.click();
      return;
    }
    const evt = new win.Event(type, { bubbles: true, cancelable: true });
    Object.assign(evt, props);
    target.dispatchEvent(evt);
  };

  const click = async (action, attrs = '') => {
    const el = get(`[data-action="${action}"]${attrs}`);
    el.focus();
    el.click();
    await flushTicks();
  };

  const input = (key, value) => {
    const el = get(`[data-field="${key}"]`);
    el.focus();
    if (el.type === 'checkbox') {
      if (el.checked !== Boolean(value)) {
        el.click();
      }
      return;
    }
    if (el.tagName === 'SELECT') {
      const setter = Object.getOwnPropertyDescriptor(win.HTMLSelectElement.prototype, 'value').set;
      setter.call(el, String(value));
      el.dispatchEvent(new win.Event('change', { bubbles: true }));
      return;
    }
    const proto = el.tagName === 'TEXTAREA' ? win.HTMLTextAreaElement.prototype : win.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, String(value));
    el.dispatchEvent(new win.Event('input', { bubbles: true }));
    el.dispatchEvent(new win.Event('change', { bubbles: true }));
  };

  return {
    context: win,
    doc,
    drawer,
    get,
    click,
    input,
    emit,
    posts,
    endpoints,
    responses,
    launch,
    catalog: () => catalog,
  };
}

const decodeHtml = (s) =>
  String(s)
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

class LegacyMockElement {
  constructor(tag, doc) {
    this.tagName = tag.toUpperCase();
    this.doc = doc;
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.listeners = {};
    this.parentElement = null;
    this.scrollTop = 0;
    this.value = '';
    this.text = '';
    this.hidden = false;
    this.inert = false;
    this.disabled = false;
    this.checked = false;
    this.open = false;
    this.classList = {
      contains: (name) => (this.attributes.class || '').split(/\s+/).includes(name),
      toggle: (name, on) => {
        const set = new Set((this.attributes.class || '').split(/\s+/).filter(Boolean));
        if (on ?? !set.has(name)) set.add(name);
        else set.delete(name);
        this.attributes.class = [...set].join(' ');
      },
      add: (name) => this.classList.toggle(name, true),
      remove: (name) => this.classList.toggle(name, false),
    };
  }
  get id() { return this.attributes.id; }
  set id(value) { this.setAttribute('id', value); }
  set className(value) { this.setAttribute('class', value); }
  get type() { return this.attributes.type || ''; }
  get isConnected() { return this === this.doc.body || Boolean(this.parentElement?.isConnected); }
  setAttribute(key, value) {
    this.attributes[key] = String(value);
    if (key.startsWith('data-')) this.dataset[key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(value);
    if (['hidden', 'disabled', 'checked', 'open'].includes(key)) this[key] = true;
    if (key === 'value') this.value = decodeHtml(value);
  }
  getAttribute(key) { return this.attributes[key] ?? null; }
  appendChild(el) { el.parentElement = this; this.children.push(el); return el; }
  set innerHTML(html) {
    this._html = html;
    this.children.forEach((el) => { el.parentElement = null; });
    this.children = [];
    this.text = '';
    const stack = [this];
    for (const token of html.match(/<[^>]*>|[^<]+/g) || []) {
      if (token.startsWith('</')) { stack.pop(); continue; }
      if (!token.startsWith('<')) { stack.at(-1).text += decodeHtml(token); continue; }
      const tag = token.match(/^<([\w-]+)/)?.[1];
      if (!tag) continue;
      const el = new LegacyMockElement(tag, this.doc);
      const attrs = token.slice(tag.length + 1, -1);
      for (const attr of attrs.matchAll(/([^\s=]+)(?:="([^"]*)")?/g)) el.setAttribute(attr[1], decodeHtml(attr[2] || ''));
      stack.at(-1).appendChild(el);
      if (!['input', 'img', 'br', 'hr'].includes(tag) && !token.endsWith('/>')) stack.push(el);
    }
    for (const select of this.querySelectorAll('select')) {
      select.value = (select.querySelectorAll('option').find((el) => 'selected' in el.attributes) || select.children[0])?.value || '';
    }
  }
  get innerHTML() { return this._html || ''; }
  get textContent() { return this.text + this.children.map((el) => el.textContent).join(''); }
  set textContent(value) { this.children.forEach((el) => { el.parentElement = null; }); this.children = []; this.text = String(value); }
  matches(selector) {
    selector = selector.trim();
    if (selector.includes(':not(:disabled)')) { if (this.disabled) return false; selector = selector.replace(':not(:disabled)', ''); }
    const base = selector.replace(/\[[^\]]*\]/g, '');
    const tag = base.match(/^[\w-]+/)?.[0]; if (tag && this.tagName !== tag.toUpperCase()) return false;
    const id = base.match(/#([\w-]+)/)?.[1]; if (id && this.id !== id) return false;
    for (const [, cls] of base.matchAll(/\.([\w-]+)/g)) if (!this.classList.contains(cls)) return false;
    for (const [, key, value] of selector.matchAll(/\[([^=\]]+)(?:="([^"]*)")?\]/g)) {
      const actual = key.startsWith('data-') ? this.dataset[key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] : this.getAttribute(key);
      if (actual == null || (value !== undefined && actual !== value)) return false;
    }
    return true;
  }
  querySelectorAll(selector) {
    const result = [], selectors = selector.split(',');
    const walk = (node) => { for (const child of node.children) { if (selectors.some((s) => child.matches(s))) result.push(child); walk(child); } };
    walk(this); return result;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) || null; }
  addEventListener(type, callback) { (this.listeners[type] ||= []).push(callback); }
  focus() { this.doc.activeElement = this; }
  getClientRects() {
    for (let node = this; node; node = node.parentElement) if (node.hidden || node.inert || (node.parentElement?.tagName === 'DETAILS' && !node.parentElement.open && node.tagName !== 'SUMMARY')) return [];
    return [{}];
  }
}

module.exports = { setup, Element: LegacyMockElement };
