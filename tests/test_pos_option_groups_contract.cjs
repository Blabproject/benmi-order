const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");
const { Element } = require("./helpers/menu-drawer-dom.cjs");
const { schemaTrueFixture } = require("./helpers/option-groups.cjs");

async function setupPOSContract(tenantId = "jiangjiejie") {
  const f = schemaTrueFixture();
  const realCatalog = await f.api.loadOptionCatalog(f.env, tenantId);

  const doc = { createElement: (tag) => new Element(tag, doc) };
  doc.body = new Element("body", doc);
  doc.activeElement = doc.body;
  doc.getElementById = (id) => doc.body.querySelector(`#${id}`);
  doc.querySelectorAll = (s) => doc.body.querySelectorAll(s);

  // Setup mock menu containers that orders-option-groups.js expects
  const menuCategories = doc.body.appendChild(new Element("div", doc));
  menuCategories.id = "menu-categories";
  const menuEditorBody = doc.body.appendChild(new Element("div", doc));
  menuEditorBody.id = "menu-editor-body";
  const menuEditorTitle = doc.body.appendChild(new Element("div", doc));
  menuEditorTitle.id = "menu-editor-title";
  const btnEdit = doc.body.appendChild(new Element("button", doc));
  btnEdit.id = "btn-option-group-edit";
  const btnAdd = doc.body.appendChild(new Element("button", doc));
  btnAdd.id = "btn-option-group-add";
  btnAdd.appendChild(new Element("span", doc));

  const interceptedRequests = [];

  const context = {
    document: doc,
    I18N: {
      vi: {
        ugAdd: "Thêm lựa chọn",
        ugCustom: "Tùy chọn tự tạo",
        ugApply: "Áp dụng",
        ugSaveGroup: "Lưu nhóm",
        ugRemoveOption: "Xóa tùy chọn",
      },
      "zh-TW": {
        ugAdd: "新增選項",
        ugCustom: "自訂選項",
        ugApply: "套用",
        ugSaveGroup: "儲存群組",
        ugRemoveOption: "刪除選項",
      },
    },
    currentLang: "vi",
    console,
    crypto: webcrypto,
    WORKER_BASE: "https://test.platform.workers.dev",
    getTenantIdFromUrl: () => tenantId,
    syncMenuDataFromDOM() {},
    renderMenuCategories() {},
    renderMenuCategoryEditor() {},
    checkMenuDirty() {},
    canonicalMenuSnapshot: JSON.stringify,
    activeCategoryIndex: 0,
    currentMenuData: [],
    savedMenuSnapshot: "[]",
    fetch: async (url, request) => {
      if (!request || request.method === "GET") {
        const cat = await f.api.loadOptionCatalog(f.env, tenantId);
        return { ok: true, json: async () => structuredClone(cat) };
      }
      const payload = JSON.parse(request.body);
      interceptedRequests.push({ url, payload });

      const kind = url.includes("/product?") ? "product" : "group";
      const apiRes = await f.api.saveOptionEntity(
        new Request(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: request.body,
        }),
        f.env,
        kind
      );
      const apiBody = await apiRes.json();
      return {
        ok: apiRes.status === 200,
        status: apiRes.status,
        json: async () => apiBody,
      };
    },
  };

  context.t = (key, args) =>
    (context.I18N[context.currentLang][key] || key).replace(
      /\{(\w+)\}/g,
      (_, k) => args?.[k] ?? ""
    );
  context.window = context;
  vm.createContext(context);
  vm.runInContext(
    fs.readFileSync("js/orders-option-groups.js", "utf8"),
    context
  );

  await context.UnifiedMenu.load();

  const drawer = () => doc.getElementById("unified-menu-drawer");
  const emit = (type, target, props = {}) => {
    const event = {
      target,
      preventDefault() {},
      stopPropagation() {},
      ...props,
    };
    for (const fn of drawer().listeners[type] || []) fn(event);
  };
  const get = (selector) => {
    const el = drawer().querySelector(selector);
    if (!el) throw new Error(`Missing UI control: ${selector}`);
    return el;
  };
  const click = async (action, attrs = "") => {
    const el = get(`[data-action="${action}"]${attrs}`);
    el.focus();
    emit("click", el);
    await new Promise(setImmediate);
  };
  const input = (key, value) => {
    const el = get(`[data-field="${key}"]`);
    el.focus();
    if (el.type === "checkbox") el.checked = value;
    else el.value = String(value);
    emit("input", el);
  };

  return {
    context,
    doc,
    drawer,
    get,
    click,
    input,
    emit,
    interceptedRequests,
    f,
    tenantId,
  };
}

test("POS simulated DOM / SQLite contract: User opens combo group in POS, adds custom option, and saves to D1 without error", async () => {
  const app = await setupPOSContract("jiangjiejie");
  const groupId = "ug_rule_jj_combo_a1_0"; // Nhóm 請選擇 6 樣配菜

  // 1. User opens group drawer in POS
  app.context.UnifiedMenu.group(groupId);
  assert.ok(app.drawer(), "Unified drawer must exist");
  assert.equal(app.drawer().hidden, false, "Drawer must be open");

  // 2. User clicks 'Thêm lựa chọn' (add-option)
  await app.click("add-option");

  // 3. User chooses 'Tùy chọn tự tạo' (custom)
  await app.click("custom");

  // 4. User inputs option name and price
  app.input("option.name", "Test Custom Option từ POS");
  app.input("option.price", 20);

  // 5. User clicks 'Áp dụng' (apply) to commit option into group draft
  await app.click("apply");

  // 6. User clicks 'Lưu nhóm' (save) to persist to backend
  await app.click("save");

  // 7. Assert request was sent and backend D1 accepted it with 200 OK
  assert.ok(
    app.interceptedRequests.length >= 1,
    "At least one save request must be sent"
  );
  const lastReq = app.interceptedRequests.at(-1);
  assert.equal(lastReq.payload.id, groupId);

  // 8. Assert DB reflects the new option
  const updatedCatalog = await app.f.api.loadOptionCatalog(
    app.f.env,
    app.tenantId
  );
  const savedGroup = updatedCatalog.groups.find((g) => g.id === groupId);
  assert.ok(
    savedGroup.options.some((o) => o.name === "Test Custom Option từ POS"),
    "Created custom option must persist in the SQLite fixture"
  );

  // 9. Verify bundle rule in D1 was properly shadow-synced without UNIQUE constraint error
  const bundleRule = app.f.api.projectOptionRule(updatedCatalog, "jj_combo_a1");
  assert.ok(bundleRule, "Combo A1 bundle rule must be generated");
  const comboGroup = bundleRule.groups.find((g) => g.id === groupId);
  assert.ok(
    comboGroup.eligibleItems.some(
      (item) => item.name === "Test Custom Option từ POS"
    ),
    "New custom option must be eligible in combo bundle rule"
  );

  app.f.db.close();
});
