// A small DOM adapter for event-driven drawer tests. Visual/layout checks run
// separately in the browser; these tests execute the unmodified POS script.
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const decode = (s) => String(s).replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

class Element {
  constructor(tag, doc) {
    this.tagName = tag.toUpperCase(); this.doc = doc; this.children = []; this.attributes = {}; this.dataset = {};
    this.listeners = {}; this.parentElement = null; this.scrollTop = 0; this.value = ''; this.text = '';
    this.hidden = false; this.inert = false; this.disabled = false; this.checked = false; this.open = false;
    this.classList = {
      contains: (name) => (this.attributes.class || '').split(/\s+/).includes(name),
      toggle: (name, on) => {
        const set = new Set((this.attributes.class || '').split(/\s+/).filter(Boolean));
        if (on ?? !set.has(name)) set.add(name); else set.delete(name);
        this.attributes.class = [...set].join(' ');
      },
      add: (name) => this.classList.toggle(name, true), remove: (name) => this.classList.toggle(name, false),
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
    if (key === 'value') this.value = decode(value);
  }
  getAttribute(key) { return this.attributes[key] ?? null; }
  appendChild(el) { el.parentElement = this; this.children.push(el); return el; }
  set innerHTML(html) {
    this._html = html; this.children.forEach((el) => { el.parentElement = null; }); this.children = []; this.text = '';
    const stack = [this];
    for (const token of html.match(/<[^>]*>|[^<]+/g) || []) {
      if (token.startsWith('</')) { stack.pop(); continue; }
      if (!token.startsWith('<')) { stack.at(-1).text += decode(token); continue; }
      const tag = token.match(/^<([\w-]+)/)?.[1]; if (!tag) continue;
      const el = new Element(tag, this.doc);
      const attrs = token.slice(tag.length + 1, -1);
      for (const attr of attrs.matchAll(/([^\s=]+)(?:="([^"]*)")?/g)) el.setAttribute(attr[1], decode(attr[2] || ''));
      stack.at(-1).appendChild(el);
      if (!['input', 'img', 'br', 'hr'].includes(tag) && !token.endsWith('/>')) stack.push(el);
    }
    for (const select of this.querySelectorAll('select')) select.value = (select.querySelectorAll('option').find((el) => 'selected' in el.attributes) || select.children[0])?.value || '';
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

async function setup({ included = false, source = false, lang = 'vi' } = {}) {
  const doc = { createElement: (tag) => new Element(tag, doc) };
  doc.body = new Element('body', doc); doc.activeElement = doc.body;
  doc.getElementById = (id) => doc.body.querySelector(`#${id}`);
  doc.querySelectorAll = (s) => doc.body.querySelectorAll(s);
  const launch = doc.body.appendChild(new Element('button', doc)); launch.id = 'launch-option'; launch.focus();
  let catalog = {
    products: [{id:'meal',category_id:'food',name:'Bánh mì',price:100}, {id:'coffee',category_id:'drinks',name:'Cà phê',price:48}, {id:'tea',category_id:'drinks',name:'Trà đen',price:37}],
    categories: [{id:'food',name:'Món ăn',category_type:'catalog'}, {id:'drinks',name:'Đồ uống',category_type:'catalog'}],
    groups: [{id:'drinks',name:'Chọn đồ uống',revision:1,minSelection:1,maxSelection:1,included,allowRepeats:false,
      sources: source ? [{type:'category',categoryId:'drinks'}] : [],
      options: [{id:'coffee_option',productId:'coffee',name:'Tên lưu cũ',price:0,quantity:1,isDefault:false,subOptions:[],eligibilityRules:[],metadata:{keep:'coffee'}},
        {id:'custom',name:'Topping',price:5,quantity:1,subOptions:['Nóng'],metadata:{keep:'custom'}}], metadata:{keep:'group'}, labels:{}}],
    links:[{groupId:'drinks',itemId:'meal',optionIds:null,disabled:false}], categoryLinks:[],
  };
  const posts = [], responses = [];
  const context = {
    document: doc, I18N: {vi:{},'zh-TW':{}}, currentLang: lang, console, crypto: webcrypto,
    WORKER_BASE:'https://test.invalid', getTenantIdFromUrl: () => 'tenant',
    syncMenuDataFromDOM() {}, renderMenuCategories() {}, renderMenuCategoryEditor() {}, checkMenuDirty() {},
    canonicalMenuSnapshot: JSON.stringify, activeCategoryIndex:0,
    currentMenuData:[{id:'food',databaseId:'food',items:[{id:'meal',name:'Bản nháp khác',price:999}],groups:[{id:'drinks',canonicalId:'drinks',title:'Chọn đồ uống'}]}],
    savedMenuSnapshot: JSON.stringify([{id:'food',databaseId:'food',items:[{id:'meal',name:'Bánh mì',price:100}],groups:[{id:'drinks',canonicalId:'drinks',title:'Chọn đồ uống'}]}]),
    fetch: async (url, request) => {
      if (!request) return {ok:true,json:async()=>structuredClone(catalog)};
      const payload = JSON.parse(request.body); posts.push(payload);
      const queued = responses.shift(); if (queued) return queued;
      const next = structuredClone(catalog);
      if (url.includes('/api/menu/product?')) {
        const index = next.products.findIndex((p) => p.id === payload.id);
        next.products[index] = {...next.products[index],name:payload.name,price:payload.price,
          category_id:payload.categoryId,badge_text:payload.badgeText,is_recommended:payload.isRecommended,
          image_key:payload.imageKey ? payload.imageKey : null,menu_revision:payload.revision+1};
        next.links = next.links.filter((l) => l.itemId !== payload.id)
          .concat(payload.links.map((l) => ({...l,itemId:payload.id})));
      } else {
        const index = next.groups.findIndex((g) => g.id === payload.id);
        next.groups[index] = {...payload,revision:payload.revision+1};
      }
      catalog = next;
      return {ok:true,json:async()=>({catalog:structuredClone(catalog)})};
    },
  };
  context.t = (key, args) => (context.I18N[context.currentLang][key] || key).replace(/\{(\w+)\}/g, (_, k) => args?.[k] ?? '');
  context.window = context; vm.createContext(context);
  vm.runInContext(fs.readFileSync('js/orders-option-groups.js','utf8'), context);
  await context.UnifiedMenu.load();
  const drawer = () => doc.getElementById('unified-menu-drawer');
  const emit = (type, target, props = {}) => { const event = {target,preventDefault(){},stopPropagation(){},...props}; for (const fn of drawer().listeners[type] || []) fn(event); };
  const get = (selector) => { const el = drawer().querySelector(selector); if (!el) throw new Error(`Missing UI control: ${selector}`); return el; };
  const click = async (action, attrs = '') => { const el = get(`[data-action="${action}"]${attrs}`); el.focus(); emit('click', el); await new Promise(setImmediate); };
  const input = (key, value) => { const el = get(`[data-field="${key}"]`); el.focus(); if (el.type === 'checkbox') el.checked = value; else el.value = String(value); emit('input', el); };
  return { context, doc, drawer, get, click, input, emit, posts, responses, launch, catalog:()=>catalog };
}
module.exports = { setup, Element };
