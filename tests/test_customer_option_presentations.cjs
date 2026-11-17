const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { Element } = require("./helpers/menu-drawer-dom.cjs");
function setup(groups, { lang = "vi", qty = 0, saved = [], notes = [] } = {}) {
  const doc = {
    createElement(tag) {
      const e = new Element(tag, doc);
      e.style = {};
      return e;
    },
  };
  doc.body = doc.createElement("body");
  doc.body.style.overflow = "auto";
  doc.documentElement = { lang };
  doc.activeElement = doc.body;
  doc.getElementById = (id) => doc.body.querySelector("#" + id);
  doc.querySelectorAll = (s) => doc.body.querySelectorAll(s);
  const launch = doc.body.appendChild(doc.createElement("button"));
  launch.focus();
  const rule = { version: 3, groups };
  const key = "food_Meal";
  let updates = 0;
  const context = {
    document: doc,
    console,
    setTimeout,
    clearTimeout,
    Image: class {
      naturalWidth = 48;
      set src(value) {
        queueMicrotask(() => value.includes("missing") ? this.onerror?.() : this.onload?.());
      }
      decode() { return Promise.resolve(); }
    },
    currentLocale: lang,
    cart: { [key]: qty },
    bundleCartData: { [key]: structuredClone(saved) },
    customizeData: { [key]: structuredClone(notes) },
    resolveCatalogItem: () => ({
      targetItem: { price: 100, bundleRule: rule },
      bundleRule: rule,
    }),
    updateTotal() {
      updates++;
    },
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(
    fs.readFileSync("js/client-option-groups.js", "utf8"),
    context,
  );
  const modal = () => doc.getElementById("unified-option-modal");
  const get = (s) => {
    const e = modal().querySelector(s);
    assert.ok(e, `Missing ${s}`);
    return e;
  };
  const emit = (type, target, extra = {}) => {
    for (const fn of modal().listeners[type] || [])
      fn({ target, preventDefault() {}, stopPropagation() {}, ...extra });
  };
  const click = (s) => {
    const e = get(s);
    e.focus();
    emit("click", e);
  };
  return {
    context,
    rule,
    key,
    doc,
    launch,
    modal,
    get,
    click,
    emit,
    updates: () => updates,
    open: (index) => context.UnifiedOptions.open("food", "Meal", index),
  };
}
const option = (id, price = 0, extra = {}) => ({
  id,
  name: id,
  price,
  ...extra,
});
const group = (id, options, extra = {}) => ({
  id,
  name: id,
  minSelection: 0,
  maxSelection: 1,
  eligibleItems: options,
  ...extra,
});

test("option rows wait for image checks and omit failed thumbnails before revealing text", async () => {
  const app = setup([
    group("Sides", [
      option("No photo", 0, { productId: "no-photo" }),
      option("Blank photo", 0, { productId: "blank-photo", imageUrl: "   " }),
      option("Missing photo", 0, { productId: "missing", imageUrl: "/missing.jpg" }),
      option("With photo", 0, { productId: "photo", imageUrl: "/photo.jpg" }),
    ], { maxSelection: 6, allowRepeats: true }),
  ]);
  app.open(0);
  assert.equal(app.get('.uoc-body').getAttribute('aria-busy'), 'true');
  assert.equal(app.modal().querySelectorAll('.bundle-item-card').length, 0);
  await new Promise(setImmediate);
  assert.equal(app.get('.uoc-body').getAttribute('aria-busy'), 'false');
  assert.equal(app.modal().querySelector('img[src="/missing.jpg"]'), null);
  assert.equal(app.modal().querySelectorAll(".uoc-item-image").length, 1);
  assert.equal(app.get('img[src="/photo.jpg"]').hidden, false);
  app.click('[data-add="0"][data-option="0"]');
  assert.equal(app.modal().querySelector('img[src="/missing.jpg"]'), null);
  assert.equal(app.modal().querySelectorAll(".uoc-item-image").length, 1);
  app.emit('error', app.get('img[src="/photo.jpg"]'));
  assert.equal(app.get('.uoc-body').getAttribute('aria-busy'), 'true');
  assert.equal(app.modal().querySelectorAll('.bundle-item-card').length, 0);
  await new Promise(resolve => setTimeout(resolve, 120));
  assert.equal(app.modal().querySelectorAll('.uoc-item-image').length, 0);
  assert.equal(app.get('[data-add="0"][data-option="0"]').disabled, false);
});

test("simple canonical options use the original chip popup, enforce bounds and preserve notes/pricing", () => {
  const app = setup([
    group("Spice", [option("Mild"), option("Hot")], { minSelection: 1 }),
    group("Toppings", [option("Egg", 5), option("Meat", 10)], {
      maxSelection: 2,
    }),
  ]);
  app.open(0);
  assert.equal(app.modal().classList.contains("uoc-simple"), true);
  assert.equal(app.get("nav").hidden, true);
  app.click("[data-confirm]");
  assert.equal(app.context.cart[app.key], 0);
  assert.match(app.get('[role="alert"]').textContent, /bắt buộc/);
  app.click('[data-choose="0"][data-option="0"]');
  app.click('[data-choose="0"][data-option="1"]');
  assert.equal(
    app.get('[data-choose="0"][data-option="0"]').getAttribute("aria-pressed"),
    "false",
  );
  app.click('[data-choose="1"][data-option="0"]');
  app.click('[data-choose="1"][data-option="1"]');
  const note = app.get("[data-note]");
  note.value = "Ít sốt";
  app.emit("input", note);
  assert.match(app.get("[data-confirm]").textContent, /\$115/);
  app.click("[data-confirm]");
  const saved = app.context.bundleCartData[app.key][0];
  assert.equal(saved.groups[0].items[0].optionId, "Hot");
  assert.equal(saved.groups[1].items.length, 2);
  assert.equal(app.context.UnifiedOptions.valid(app.rule, saved), true);
  assert.equal(app.context.customizeData[app.key][0].note, "Ít sốt");
  assert.equal(app.updates(), 1);
  assert.equal(app.doc.activeElement, app.launch);
  assert.equal(app.doc.body.style.overflow, "auto");
});

test("wizard keeps server group order, repeat portions and independent child configuration with zero retail surcharge", () => {
  const temp = group("Temperature", [option("Hot", 2), option("Cold")], {
    minSelection: 1,
  });
  const coffee = option("Coffee", 0, {
    productId: "coffee",
    retailPrice: 48,
    optionGroups: [temp],
    subOptions: [{ id: "milk", name: "Milk", price: 3 }],
  });
  const app = setup([
    group("Drinks", [coffee], {
      minSelection: 2,
      maxSelection: 2,
      allowRepeats: true,
    }),
    group("Spice", [option("Mild")], { minSelection: 1 }),
  ]);
  app.open(0);
  assert.equal(app.modal().classList.contains("uoc-wizard"), true);
  assert.deepEqual(
    app
      .get("nav")
      .querySelectorAll("button")
      .map((b) => b.dataset.step),
    ["0", "1"],
  );
  app.click('[data-add="0"][data-option="0"]');
  assert.equal(app.get("h2").textContent, "Coffee");
  assert.equal(app.modal().querySelector('[data-sub="0.0"]'), null);
  app.click("[data-confirm]");
  assert.match(app.get('[role="alert"]').textContent, /bắt buộc/);
  app.click('[data-choose="0.0.0"][data-option="0"]');
  app.click("[data-confirm]");
  const milk = app.get('[data-sub="0.0"][data-index="0"]');
  milk.checked = true;
  app.emit("change", milk);
  app.click('[data-add="0"][data-option="0"]');
  app.click('[data-choose="0.1.0"][data-option="1"]');
  app.click("[data-confirm]");
  assert.equal(app.get('[data-sub="0.1"][data-index="0"]').checked, false);
  assert.equal(app.get('[data-add="0"][data-option="0"]').disabled, true);
  app.click("[data-confirm]");
  assert.ok(app.get('[data-choose="1"][data-option="0"]'));
  app.click('[data-choose="1"][data-option="0"]');
  assert.match(app.get("[data-confirm]").textContent, /\$105/);
  app.click("[data-confirm]");
  const portion = app.context.bundleCartData[app.key][0];
  assert.equal(portion.groups[0].items.length, 2);
  assert.equal(portion.groups[0].items[0].groups[0].items[0].optionId, "Hot");
  assert.equal(portion.groups[0].items[1].groups[0].items[0].optionId, "Cold");
  assert.equal(portion.groups[0].items[0].subOptions[0].price, 3);
  assert.equal(app.context.UnifiedOptions.valid(app.rule, portion), true);
});

test("opening, canceling, switching and copying portions never write until confirmation", () => {
  const groups = [group("Topping", [option("Egg", 5), option("Meat", 10)])];
  const saved = [
    {
      groups: [
        { groupId: "Topping", items: [{ optionId: "Egg", quantity: 1 }] },
      ],
    },
  ];
  const app = setup(groups, { qty: 1, saved, notes: [{ note: "No onion" }] });
  const before = JSON.stringify([
    app.context.cart,
    app.context.bundleCartData,
    app.context.customizeData,
  ]);
  app.open(0);
  app.click('[data-choose="0"][data-option="1"]');
  app.click('[data-portion="1"]');
  app.click("[data-copy]");
  assert.equal(
    app.get('[data-choose="0"][data-option="1"]').getAttribute("aria-pressed"),
    "true",
  );
  app.click('[data-portion="0"]');
  assert.equal(
    app.get('[data-choose="0"][data-option="1"]').getAttribute("aria-pressed"),
    "true",
  );
  app.click("[data-close]");
  assert.equal(
    JSON.stringify([
      app.context.cart,
      app.context.bundleCartData,
      app.context.customizeData,
    ]),
    before,
  );
  assert.equal(app.updates(), 0);
  app.open(1);
  app.click("[data-copy]");
  assert.equal(
    app.get('[data-choose="0"][data-option="0"]').getAttribute("aria-pressed"),
    "true",
  );
  app.click("[data-confirm]");
  assert.equal(app.context.cart[app.key], 2);
  assert.equal(
    app.context.bundleCartData[app.key][1].groups[0].items[0].optionId,
    "Egg",
  );
  assert.equal(app.context.customizeData[app.key][1].note, "No onion");
});

test("fixed counts stay read-only; stock and nested choices block invalid checkout; Traditional Chinese labels", () => {
  const app = setup(
    [
      group(
        "Included",
        [option("Drink", 0, { productId: "drink", quantity: 2 })],
        { included: true },
      ),
    ],
    { lang: "zh-TW" },
  );
  app.open(0);
  assert.equal(app.get("[data-confirm]").textContent, "確認 · $100");
  assert.equal(app.modal().querySelector("[data-add]"), null);
  app.click("[data-confirm]");
  assert.equal(
    app.context.bundleCartData[app.key][0].groups[0].items.length,
    2,
  );
  const oos = setup([
    group("Drink", [option("Unavailable", 0, { isOutOfStock: true })], {
      minSelection: 1,
    }),
  ]);
  oos.open(0);
  assert.equal(oos.get("[data-choose]").disabled, true);
  oos.click("[data-confirm]");
  assert.equal(oos.context.cart[oos.key], 0);
});

test("nested navigation preserves parent scroll and focus, and keyboard trap includes the note field", () => {
  const app = setup([
    group("Drink", [
      option("Coffee", 0, {
        productId: "coffee",
        optionGroups: [group("Temperature", [option("Hot")])],
        isDefault: true,
      }),
    ]),
  ]);
  app.open(0);
  app.get(".uoc-body").scrollTop = 130;
  app.click('[data-child="0.0"]');
  app.emit("keydown", app.doc.activeElement, { key: "Escape" });
  assert.equal(app.get(".uoc-body").scrollTop, 130);
  assert.equal(app.doc.activeElement, app.get('[data-child="0.0"]'));
  app.get("[data-confirm]").focus();
  app.emit("keydown", app.doc.activeElement, { key: "Tab" });
  assert.equal(app.doc.activeElement, app.get("[data-close]"));
  app.emit("keydown", app.doc.activeElement, { key: "Escape" });
  assert.equal(app.modal().hidden, true);
  assert.equal(app.doc.activeElement, app.launch);
});

test("customer cards keep their badge without adding a separate recommendation icon", () => {
  for (const lang of ["vi", "zh-TW"]) {
    const app = setup([], { lang });
    app.context.bootstrapData = { catalog: [], translations: {} };
    vm.runInContext(fs.readFileSync("js/client-menu.js", "utf8"), app.context);
    const base = {
      name: "Meal",
      price: 100,
      badgeText: "推薦",
      isRecommended: false,
    };
    let card = app.context.createDynamicItemCard("food", base);
    assert.equal(card.querySelector(".item-recommended-icon"), null);
    card = app.context.createDynamicItemCard("food", {
      ...base,
      isRecommended: true,
    });
    assert.equal(card.querySelector(".item-recommended-icon"), null);
    assert.equal(card.querySelectorAll(".badge").length, 1);
    assert.equal(card.querySelector(".badge").textContent, "推薦");
  }
});

test('customer descriptions use only the current tenant catalog and translations', () => {
  const app = setup([], { lang: 'zh-TW' });
  app.context.bootstrapData = { catalog: [], translations: {} };
  app.context.itemTranslations = { '火腿': 'Vietnamese Ham' };
  vm.runInContext(fs.readFileSync('js/client-menu.js', 'utf8'), app.context);
  const item = { name: '火腿', price: 10 };
  assert.doesNotMatch(app.context.createDynamicItemCard('food', item).textContent, /Vietnamese Ham/);
  assert.match(app.context.createDynamicItemCard('food', { ...item, description: '店家提供的說明' }).textContent, /店家提供的說明/);
  app.context.bootstrapData.translations = { '火腿': 'Tenant translation' };
  assert.match(app.context.createDynamicItemCard('food', item).textContent, /Tenant translation/);
});

test("unavailable linked child choices are rejected and can be removed without losing the parent selection", () => {
  const coffee = option("Coffee", 0, {
    productId: "coffee",
    isDefault: true,
    subOptions: [{ id: "milk", name: "Milk", price: 3, isOutOfStock: true }],
  });
  const ruleGroups = [group("Drinks", [coffee], { minSelection: 1 })];
  const saved = [
    {
      groups: [
        {
          groupId: "Drinks",
          items: [
            {
              optionId: "Coffee",
              quantity: 1,
              subOptions: [{ id: "milk", name: "Milk", price: 3 }],
            },
          ],
        },
      ],
    },
  ];
  const app = setup(ruleGroups, { qty: 1, saved });
  app.open(0);
  app.click("[data-confirm]");
  assert.equal(app.modal().hidden, false);
  assert.equal(app.updates(), 0);
  assert.equal(app.modal().querySelector('[data-child="0.0"]'), null);
  const milk = app.get('[data-sub="0.0"][data-index="0"]');
  assert.equal(milk.disabled, false);
  milk.checked = false;
  app.emit("change", milk);
  app.click("[data-confirm]");
  assert.equal(
    app.context.bundleCartData[app.key][0].groups[0].items[0].subOptions.length,
    0,
  );
  assert.equal(
    app.context.UnifiedOptions.valid(
      app.rule,
      app.context.bundleCartData[app.key][0],
    ),
    true,
  );
});

test("menu-linked choice keeps existing custom child checkboxes under their parent in wizard", () => {
  for (const lang of ["vi", "zh-TW"]) {
    const app = setup([
      group("Sides", [
        option("Egg", 5, { subOptions: [{ id: "soft", name: "Soft", price: 2 }] }),
        option("Tofu", 4, { subOptions: [{ id: "crispy", name: "Crispy", price: 3 }] }),
        option("Menu dish", 6, { productId: "menu-product" }),
      ], { maxSelection: 3 }),
    ], { lang });
    app.open(0);
    assert.equal(app.modal().classList.contains("uoc-wizard"), true);
    for (let index = 0; index < 3; index++)
      app.click(`[data-add="0"][data-option="${index}"]`);
    assert.equal(app.modal().querySelectorAll("[data-child]").length, 0);
    assert.equal(app.modal().querySelectorAll(".uoc-inline-subs").length, 2);
    for (const [path, parent] of [["0.0", "Egg"], ["0.1", "Tofu"]]) {
      const input = app.get(`[data-sub="${path}"][data-index="0"]`);
      assert.match(input.closest(".uoc-option-entry").textContent, new RegExp(parent));
      input.checked = true;
      app.emit("change", input);
    }
    assert.match(app.get("[data-confirm]").textContent, /\$120/);
    app.click("[data-confirm]");
    const saved = app.context.bundleCartData[app.key][0];
    assert.deepEqual(saved.groups[0].items.map((item) => item.subOptions.length), [1, 1, 0]);
    assert.equal(app.context.UnifiedOptions.valid(app.rule, saved), true);
    app.open(0);
    assert.equal(app.get('[data-sub="0.0"][data-index="0"]').checked, true);
    assert.equal(app.get('[data-sub="0.1"][data-index="0"]').checked, true);
    assert.equal(app.modal().querySelectorAll("[data-child]").length, 0);
  }
});

test("custom topping children remain inline chips within the original simple popup", () => {
  const app = setup([
    group("Topping", [
      option("Egg", 5, {
        subOptions: [{ id: "soft", name: "Soft", price: 2 }],
      }),
    ]),
  ]);
  app.open(0);
  app.click('[data-choose="0"][data-option="0"]');
  assert.equal(app.modal().classList.contains("uoc-simple"), true);
  assert.equal(app.modal().querySelector("[data-child]"), null);
  const soft = app.get('[data-sub="0.0"][data-index="0"]');
  soft.checked = true;
  app.emit("change", soft);
  assert.match(app.get("[data-confirm]").textContent, /\$107/);
  app.click("[data-confirm]");
  assert.equal(
    app.context.bundleCartData[app.key][0].groups[0].items[0].subOptions[0].id,
    "soft",
  );
});

test('customer menu renders before any optional locale global exists, using the document language', () => {
  for (const lang of ['vi','zh-TW']) {
    const app=setup([], {lang}); delete app.context.currentLocale;
    app.context.bootstrapData={catalog:[],translations:{}};
    vm.runInContext(fs.readFileSync('js/client-menu.js','utf8'),app.context);
    const card=app.context.createDynamicItemCard('food',{name:'Meal',price:100,isRecommended:true,bundleRule:{version:3,groups:[]}});
    assert.equal(card.querySelector('.item-recommended-icon'),null);
    assert.match(card.querySelector('.bundle-edit-btn').textContent, lang==='vi'?/Tuỳ chọn/:/選項/);
  }
});
