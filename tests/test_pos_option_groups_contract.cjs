const test = require("node:test");
const assert = require("node:assert/strict");
const { webcrypto } = require("node:crypto");
const { JSDOM } = require("jsdom");
const { getOptionGroupsBridgeBundleCode } = require("./helpers/option-groups-bundle.cjs");
const { schemaTrueFixture } = require("./helpers/option-groups.cjs");

async function setupPOSContract(tenantId = "jiangjiejie") {
  const f = schemaTrueFixture();
  await f.api.loadOptionCatalog(f.env, tenantId);

  const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
    url: "http://localhost/orders.html",
    pretendToBeVisual: true,
    runScripts: "dangerously",
  });
  const win = dom.window;
  const doc = win.document;

  if (!win.crypto) {
    Object.defineProperty(win, "crypto", { value: webcrypto, configurable: true });
  }
  win.requestAnimationFrame = (fn) => setTimeout(fn, 0);
  win.cancelAnimationFrame = (id) => clearTimeout(id);
  win.HTMLElement.prototype.scrollIntoView = () => {};
  win.HTMLElement.prototype.getClientRects = function getClientRects() {
    for (let node = this; node && node.nodeType === 1; node = node.parentElement) {
      if (node.hasAttribute("hidden") || node.hasAttribute("inert")) return [];
    }
    return [{}];
  };

  // Setup menu containers expected by option-groups-bridge
  const menuCategories = doc.createElement("div");
  menuCategories.id = "menu-categories";
  doc.body.appendChild(menuCategories);
  const menuEditorBody = doc.createElement("div");
  menuEditorBody.id = "menu-editor-body";
  doc.body.appendChild(menuEditorBody);
  const menuEditorTitle = doc.createElement("div");
  menuEditorTitle.id = "menu-editor-title";
  doc.body.appendChild(menuEditorTitle);
  const btnEdit = doc.createElement("button");
  btnEdit.id = "btn-option-group-edit";
  doc.body.appendChild(btnEdit);
  const btnAdd = doc.createElement("button");
  btnAdd.id = "btn-option-group-add";
  btnAdd.appendChild(doc.createElement("span"));
  doc.body.appendChild(btnAdd);

  const interceptedRequests = [];

  win.I18N = {
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
  };
  win.currentLang = "vi";
  win.WORKER_BASE = "https://test.platform.workers.dev";
  win.getTenantIdFromUrl = () => tenantId;
  win.syncMenuDataFromDOM = () => {};
  win.renderMenuCategories = () => {};
  win.renderMenuCategoryEditor = () => {};
  win.checkMenuDirty = () => {};
  win.canonicalMenuSnapshot = JSON.stringify;
  win.activeCategoryIndex = 0;
  win.currentMenuData = [];
  win.savedMenuSnapshot = "[]";
  win.t = (key, args) =>
    (win.I18N[win.currentLang][key] || key).replace(
      /\{(\w+)\}/g,
      (_, k) => args?.[k] ?? ""
    );

  win.fetch = async (url, request) => {
    if (!request || request.method === "GET") {
      const cat = await f.api.loadOptionCatalog(f.env, tenantId);
      return { ok: true, json: async () => structuredClone(cat) };
    }
    const payload = JSON.parse(request.body);
    interceptedRequests.push({ url: String(url), payload });

    const kind = String(url).includes("/product?") ? "product" : "group";
    const apiRes = await f.api.saveOptionEntity(
      new Request(String(url), {
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
  };

  const bundleCode = await getOptionGroupsBridgeBundleCode();
  win.eval(bundleCode);

  await win.UnifiedMenu.load();

  const drawer = () => doc.getElementById("unified-menu-drawer");
  const flushTicks = async () => {
    await new Promise((r) => setTimeout(r, 0));
    await new Promise(setImmediate);
  };
  const emit = (type, target, props = {}) => {
    if (!target) return;
    const evt = new win.Event(type, { bubbles: true, cancelable: true });
    Object.assign(evt, props);
    target.dispatchEvent(evt);
  };
  const get = (selector) => {
    const el = drawer()?.querySelector(selector);
    if (!el) throw new Error(`Missing UI control: ${selector}`);
    return el;
  };
  const click = async (action, attrs = "") => {
    const el = get(`[data-action="${action}"]${attrs}`);
    el.focus();
    el.click();
    await flushTicks();
  };
  const input = (key, value) => {
    const el = get(`[data-field="${key}"]`);
    el.focus();
    if (el.type === "checkbox") {
      if (el.checked !== Boolean(value)) el.click();
      return;
    }
    const proto =
      el.tagName === "TEXTAREA"
        ? win.HTMLTextAreaElement.prototype
        : win.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    setter.call(el, String(value));
    el.dispatchEvent(new win.Event("input", { bubbles: true }));
    el.dispatchEvent(new win.Event("change", { bubbles: true }));
  };

  return {
    context: win,
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

  // 10. User edits a product's description in POS, saves to D1, then clears it to null
  const firstProduct = updatedCatalog.products[0];
  app.context.currentMenuData = [
    {
      id: firstProduct.category_id,
      databaseId: firstProduct.category_id,
      items: [
        {
          id: firstProduct.id,
          name: firstProduct.name,
          price: firstProduct.price,
          description: firstProduct.description || "",
          menuRevision: firstProduct.menu_revision,
        },
      ],
    },
  ];
  await app.context.UnifiedMenu.product(0, 0);
  app.input("description", "Thịt heo nướng mật ong, rau thơm");
  await app.click("save");

  const afterDescSave = await app.f.api.loadOptionCatalog(app.f.env, app.tenantId);
  const savedProd = afterDescSave.products.find((p) => p.id === firstProduct.id);
  assert.equal(savedProd.description, "Thịt heo nướng mật ong, rau thơm");

  await app.context.UnifiedMenu.product(firstProduct.id, "product");
  app.input("description", "");
  await app.click("save");

  const afterDescClear = await app.f.api.loadOptionCatalog(app.f.env, app.tenantId);
  const clearedProd = afterDescClear.products.find((p) => p.id === firstProduct.id);
  assert.equal(clearedProd.description, null);

  app.f.db.close();
});
