const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createClientContext() {
  const elements = {};
  function createElement(tagName) {
    const el = {
      tagName: tagName.toUpperCase(),
      style: {},
      attributes: {},
      children: [],
      classList: {
        classes: new Set(),
        add(c) { this.classes.add(c); },
        remove(c) { this.classes.delete(c); },
        contains(c) { return this.classes.has(c); },
      },
      getAttribute(k) { return this.attributes[k] || null; },
      setAttribute(k, v) { this.attributes[k] = String(v); },
      removeAttribute(k) { delete this.attributes[k]; },
      hasAttribute(k) { return k in this.attributes; },
      closest(sel) {
        if (sel === 'label' && this.parentElement && this.parentElement.tagName === 'LABEL') {
          return this.parentElement;
        }
        if (sel === '.threshold-disabled' && this.classList.contains('threshold-disabled')) return this;
        return null;
      },
      querySelector(sel) { return null; },
      querySelectorAll(sel) { return []; },
      addEventListener() {},
      removeEventListener() {},
      click() {},
    };
    return el;
  }

  const domElements = new Map();
  const context = {
    console,
    window: null,
    document: {
      getElementById(id) {
        if (!domElements.has(id)) {
          const el = createElement('div');
          el.id = id;
          domElements.set(id, el);
        }
        return domElements.get(id);
      },
      querySelector(sel) {
        if (sel.includes(':checked')) {
          const nameMatch = sel.match(/input\[name="([^"]+)"\]:checked/);
          if (nameMatch) {
            const name = nameMatch[1];
            for (const el of domElements.values()) {
              if (el.tagName === 'INPUT' && el.name === name && el.checked) {
                return el;
              }
            }
          }
        }
        return null;
      },
      querySelectorAll(sel) {
        const results = [];
        if (sel.includes('.custom-panel input[data-min-subtotal]')) {
          for (const el of domElements.values()) {
            if (el.tagName === 'INPUT' && el.hasAttribute('data-min-subtotal')) {
              results.push(el);
            }
          }
        } else if (sel.includes('input[name=')) {
          const match = sel.match(/input\[name="([^"]+)"\]/);
          if (match) {
            const name = match[1];
            for (const el of domElements.values()) {
              if (el.tagName === 'INPUT' && el.name === name) {
                results.push(el);
              }
            }
          }
        }
        return results;
      },
      addEventListener() {},
      body: createElement('body'),
      documentElement: { style: { setProperty() {}, getPropertyValue() { return ''; } } },
    },
    location: { search: '', hostname: 'localhost' },
    localStorage: { getItem: () => null, setItem() {} },
    sessionStorage: { getItem: () => null, setItem() {} },
    navigator: { userAgent: 'Node' },
    addEventListener() {},
    removeEventListener() {},
    setTimeout: (fn) => setTimeout(fn, 0),
    clearTimeout: (id) => clearTimeout(id),
    setInterval: () => 1,
    clearInterval: () => {},
    URLSearchParams,
    AbortController,
    AbortSignal,
    domElements,
    createElement,
  };
  context.window = context;
  vm.createContext(context);

  for (const file of [
    'js/client-core.js',
    'js/client-cart.js',
  ]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context, { filename: file });
  }

  return context;
}

test('Bowl threshold customization: auto-promotes to $0 at >= $250 and reverts to $5 when < $250', () => {
  const app = createClientContext();

  // Create bowl options in DOM
  const labelPaid = app.createElement('label');
  const inputPaid = app.createElement('input');
  inputPaid.type = 'radio';
  inputPaid.name = 'opt-mg_cust_yanxiansuji_bowl';
  inputPaid.value = '加購提碗 (+5元)';
  inputPaid.setAttribute('data-option-id', 'opt_yzs_bowl_paid');
  inputPaid.setAttribute('data-price', '5');
  // The real renderer omits data-min-subtotal for the paid fallback.
  inputPaid.checked = true;
  inputPaid.parentElement = labelPaid;

  const labelFree = app.createElement('label');
  const inputFree = app.createElement('input');
  inputFree.type = 'radio';
  inputFree.name = 'opt-mg_cust_yanxiansuji_bowl';
  inputFree.value = '滿$250免費附提碗';
  inputFree.setAttribute('data-option-id', 'opt_yzs_bowl_free');
  inputFree.setAttribute('data-price', '0');
  inputFree.setAttribute('data-min-subtotal', '250');
  inputFree.checked = false;
  inputFree.parentElement = labelFree;

  app.domElements.set('input_paid', inputPaid);
  app.domElements.set('input_free', inputFree);

  // Initial state: subtotal is 200 (< 250)
  app.calculateCurrentFoodSubtotal = () => 200;

  // Run updateCustomizationThresholdUI
  app.updateCustomizationThresholdUI();

  // 1. Paid option remains checked, Free option is disabled
  assert.equal(inputPaid.checked, true, 'Paid bowl should be checked when subtotal < 250');
  assert.equal(inputFree.disabled, true, 'Free bowl should be disabled when subtotal < 250');
  assert.equal(labelFree.classList.contains('threshold-disabled'), true);

  // 2. Subtotal increases to 260 (>= 250)
  app.calculateCurrentFoodSubtotal = () => 260;
  app.updateCustomizationThresholdUI();

  // Free option should be enabled AND auto-promoted to checked!
  assert.equal(inputFree.disabled, false, 'Free bowl should be enabled when subtotal >= 250');
  assert.equal(inputFree.checked, true, 'Free bowl should be auto-promoted to checked when subtotal >= 250');
  assert.equal(labelFree.classList.contains('threshold-disabled'), false);
  assert.equal(inputPaid.disabled, true, 'Paid bowl should be disabled when the free bowl is eligible');

  // 3. Subtotal drops back to 150 (< 250)
  app.calculateCurrentFoodSubtotal = () => 150;
  app.updateCustomizationThresholdUI();

  // Free option should be disabled AND revert fallback to paid option!
  assert.equal(inputFree.disabled, true, 'Free bowl should be disabled when subtotal drops below 250');
  assert.equal(inputPaid.checked, true, 'Paid bowl should be re-selected automatically when subtotal drops below 250');
  assert.equal(inputPaid.disabled, false, 'Paid bowl should be enabled again below the threshold');
});

test('Multi-tier threshold customization (jiangjiejie onion): both free ($0) and paid ($20) options requiring >= $100 remain enabled when subtotal >= $100', () => {
  const app = createClientContext();

  const labelNone = app.createElement('label');
  const inputNone = app.createElement('input');
  inputNone.type = 'radio';
  inputNone.name = 'opt-custom_mod_jj_onion';
  inputNone.value = '不要';
  inputNone.setAttribute('data-option-id', 'opt_onion_none');
  inputNone.setAttribute('data-price', '0');
  inputNone.checked = true;
  inputNone.disabled = false;
  inputNone.parentElement = labelNone;

  const labelReq = app.createElement('label');
  const inputReq = app.createElement('input');
  inputReq.type = 'radio';
  inputReq.name = 'opt-custom_mod_jj_onion';
  inputReq.value = '要';
  inputReq.setAttribute('data-option-id', 'opt_onion_regular');
  inputReq.setAttribute('data-price', '0');
  inputReq.setAttribute('data-min-subtotal', '100');
  inputReq.checked = false;
  inputReq.disabled = false;
  inputReq.parentElement = labelReq;

  const labelExtra = app.createElement('label');
  const inputExtra = app.createElement('input');
  inputExtra.type = 'radio';
  inputExtra.name = 'opt-custom_mod_jj_onion';
  inputExtra.value = '多';
  inputExtra.setAttribute('data-option-id', 'opt_onion_extra');
  inputExtra.setAttribute('data-price', '20');
  inputExtra.setAttribute('data-min-subtotal', '100');
  inputExtra.checked = false;
  inputExtra.disabled = false;
  inputExtra.parentElement = labelExtra;

  app.domElements.set('input_none', inputNone);
  app.domElements.set('input_req', inputReq);
  app.domElements.set('input_extra', inputExtra);

  // 1. Initial subtotal: 80 (< 100)
  app.calculateCurrentFoodSubtotal = () => 80;
  app.updateCustomizationThresholdUI();

  assert.equal(inputNone.checked, true, '不要 should be checked when subtotal < 100');
  assert.equal(inputNone.disabled, false, '不要 should be enabled');
  assert.equal(inputReq.disabled, true, '要 should be disabled when subtotal < 100');
  assert.equal(inputExtra.disabled, true, '多 should be disabled when subtotal < 100');
  assert.equal(labelExtra.classList.contains('threshold-disabled'), true);

  // 2. Subtotal increases to 220 (>= 100)
  app.calculateCurrentFoodSubtotal = () => 220;
  app.updateCustomizationThresholdUI();

  assert.equal(inputNone.disabled, false, '不要 should remain enabled');
  assert.equal(inputReq.disabled, false, '要 should be enabled when subtotal >= 100');
  assert.equal(inputExtra.disabled, false, '多 (+20) MUST BE ENABLED when subtotal >= 100 (never disabled by free replacement)');
  assert.equal(labelExtra.classList.contains('threshold-disabled'), false);

  // 3. User selects 多 (+$20)
  inputNone.checked = false;
  inputReq.checked = false;
  inputExtra.checked = true;

  app.updateCustomizationThresholdUI();

  assert.equal(inputExtra.checked, true, '多 should remain checked and not overridden by auto-promote');
  assert.equal(inputExtra.disabled, false, '多 should remain enabled');

  // 4. Subtotal drops back to 80 (< 100)
  app.calculateCurrentFoodSubtotal = () => 80;
  app.updateCustomizationThresholdUI();

  assert.equal(inputExtra.disabled, true, '多 should be disabled when subtotal drops below 100');
  assert.equal(inputNone.checked, true, 'Should fall back to default 不要 when subtotal drops below 100');
});
