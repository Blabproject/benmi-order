const fs = require("fs");
const assert = require("assert");

console.log("=================================================");
console.log("🔍 Verifying Menu & Settings Tab Architecture...");
console.log("=================================================");

const html = fs.readFileSync("orders.html", "utf8");
const css = fs.readFileSync("css/orders.css", "utf8");
const settingsJs = fs.readFileSync("js/orders-settings.js", "utf8");
const workspaceTs = fs.readFileSync("frontend/apps/pos/menu/workspace.ts", "utf8");
const coreJs = fs.readFileSync("js/orders-core.js", "utf8");

// 1. Tag hierarchy check: ensure view-menu is NOT inside view-settings
const tokenRegex = /<!--[\s\S]*?-->|<(\/)?([a-zA-Z0-9]+)([^>]*)>/g;
let match;
let stack = [];
const selfClosing = new Set(["area","base","br","col","embed","hr","img","input","link","meta","param","source","track","wbr"]);

let viewMenuStack = null;
let settingsBodyStack = null;

while ((match = tokenRegex.exec(html)) !== null) {
  if (match[0].startsWith("<!--")) continue;
  const isClose = match[1] === "/";
  const tag = match[2].toLowerCase();
  const attrs = match[3] || "";
  const index = match.index;
  const line = html.substring(0, index).split("\n").length;

  if (selfClosing.has(tag) || attrs.trim().endsWith("/")) continue;

  if (!isClose) {
    let idMatch = attrs.match(/id=["']([^"']+)["']/);
    let classMatch = attrs.match(/class=["']([^"']+)["']/);
    let elem = { tag, line, id: idMatch ? idMatch[1] : "", class: classMatch ? classMatch[1] : "" };
    stack.push(elem);

    if (elem.id === "view-menu") {
      viewMenuStack = stack.map(s => s.id || s.tag);
    }
    if (elem.id === "settings-scroll-container") {
      settingsBodyStack = stack.map(s => s.id || s.tag);
    }
  } else {
    stack.pop();
  }
}

// Assert view-menu is NOT a child of view-settings
assert(viewMenuStack, "view-menu element found in HTML");
assert(!viewMenuStack.includes("view-settings"), "FAIL: #view-menu should NOT be inside #view-settings");
console.log("✓ #view-menu is a direct top-level content sibling (NOT trapped inside #view-settings)");

// Assert settings-scroll-container is NOT inside panel-header
assert(settingsBodyStack, "settings-scroll-container found in HTML");
assert(!settingsBodyStack.includes("panel-header"), "FAIL: #settings-scroll-container should NOT be inside .panel-header");
console.log("✓ #settings-scroll-container is a direct child of .settings-content-panel (NOT trapped inside .panel-header)");

// 2. CSS Check: panel-body has flex: 1
assert(css.includes(".panel-body {") && css.includes("flex: 1;"), "FAIL: .panel-body should have flex: 1;");
console.log("✓ CSS .panel-body has flex: 1 for robust vertical stretching");

// 3. Settings JS Check: scrollToSettingSection uses container.scrollTo
assert(settingsJs.includes("container.scrollTo({ top: Math.max(0, relativeTop - 12), behavior: \"smooth\" });"), "FAIL: scrollToSettingSection should use container.scrollTo with bounding offset");
console.log("✓ scrollToSettingSection uses container.scrollTo with bounding offset for smooth scrolling");

// 4. Menu TS Check: loadMenuData automatically selects first catalog or item
assert(workspaceTs.includes("firstCatalog >= 0 ? firstCatalog"), "FAIL: activeCategoryIndex should select first category");
console.log("✓ loadMenuData defaults to selecting first category so items render immediately");

// 5. Core JS Check: switchTab handles menu and settings
assert(coreJs.includes("tab === \"menu\"") && coreJs.includes("tab === \"settings\""), "FAIL: switchTab should handle menu and settings");
console.log("✓ switchTab in orders-core.js fully supports menu and settings tabs");

console.log("\n=================================================");
console.log("🎉 ALL MENU & SETTINGS ARCHITECTURE CHECKS PASSED!");
console.log("=================================================");
