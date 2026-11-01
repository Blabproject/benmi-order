#!/usr/bin/env node

/**
 * Static Analyzer & Scope Linter for Benmi Order Frontend
 * 
 * Verifies:
 * 1. Syntax correctness across all JavaScript files.
 * 2. Shared Lexical Scope validation: Detects duplicate top-level `const`, `let`, `class`
 *    declarations across `<script>` tags loaded in the same HTML page.
 * 3. VM Context Simulation: Evaluates all scripts in order within a mock browser context
 *    to catch undefined variables, scope errors, and initialization crashes.
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execSync } = require("child_process");

const ROOT_DIR = path.resolve(__dirname, "..");
const HTML_FILES = ["orders.html", "index.html", "marketplace.html", "staff-order.html"];

const COLORS = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m"
};

let hasErrors = false;

console.log(`${COLORS.bold}${COLORS.cyan}====================================================${COLORS.reset}`);
console.log(`${COLORS.bold}${COLORS.cyan}🔍 Running Frontend Static Analyzer & Scope Linter${COLORS.reset}`);
console.log(`${COLORS.bold}${COLORS.cyan}====================================================${COLORS.reset}\n`);

// 1. Check syntax of all JS files in js/ directory
console.log(`${COLORS.bold}1. Checking syntax on individual JS files...${COLORS.reset}`);
const jsDir = path.join(ROOT_DIR, "js");
if (fs.existsSync(jsDir)) {
  const files = fs.readdirSync(jsDir).filter(f => f.endsWith(".js"));
  files.forEach(file => {
    const fullPath = path.join(jsDir, file);
    try {
      execSync(`node --check "${fullPath}"`, { stdio: "pipe" });
      console.log(`  ${COLORS.green}✓${COLORS.reset} js/${file}`);
    } catch (err) {
      hasErrors = true;
      console.error(`  ${COLORS.red}✗ Syntax error in js/${file}:${COLORS.reset}\n`, err.stderr?.toString() || err.message);
    }
  });
}

// Helper: Extract script tags from HTML file
function extractScriptSources(htmlFilePath) {
  const content = fs.readFileSync(htmlFilePath, "utf8");
  const scriptRegex = /<script\s+[^>]*src=["']([^"']+)["'][^>]*>/gi;
  const sources = [];
  let match;
  while ((match = scriptRegex.exec(content)) !== null) {
    const src = match[1].split("?")[0]; // Strip cache buster query
    if (!src.startsWith("http://") && !src.startsWith("https://") && !src.startsWith("//")) {
      sources.push(src);
    }
  }
  return sources;
}

// Helper: Extract top-level let, const, class declarations from a JS file
function findTopLevelDeclarations(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split("\n");
  const decls = [];

  let inBlockComment = false;
  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (inBlockComment) {
      if (trimmed.includes("*/")) inBlockComment = false;
      return;
    }
    if (trimmed.startsWith("/*")) {
      if (!trimmed.includes("*/")) inBlockComment = true;
      return;
    }
    if (trimmed.startsWith("//")) return;

    // Check top-level (0 indentation or minimal export) const, let, class
    const declMatch = line.match(/^(?:const|let|class)\s+([a-zA-Z0-9_$]+)/);
    if (declMatch) {
      decls.push({
        type: declMatch[0].split(/\s+/)[0],
        name: declMatch[1],
        line: idx + 1
      });
    }
  });

  return decls;
}

// 2. Check each HTML file for cross-script lexical collisions
console.log(`\n${COLORS.bold}2. Checking Lexical Scope Collisions across HTML script tags...${COLORS.reset}`);

HTML_FILES.forEach(htmlFile => {
  const htmlPath = path.join(ROOT_DIR, htmlFile);
  if (!fs.existsSync(htmlPath)) return;

  console.log(`\n${COLORS.bold}📄 Analyzing ${htmlFile}:${COLORS.reset}`);
  const scripts = extractScriptSources(htmlPath);
  console.log(`  Found ${scripts.length} local scripts: ${COLORS.gray}${scripts.join(", ")}${COLORS.reset}`);

  const declaredIdentifiers = new Map();

  scripts.forEach(scriptSrc => {
    const scriptPath = path.join(ROOT_DIR, scriptSrc);
    if (!fs.existsSync(scriptPath)) {
      console.log(`  ${COLORS.yellow}⚠ Script not found on disk: ${scriptSrc}${COLORS.reset}`);
      return;
    }

    const decls = findTopLevelDeclarations(scriptPath);
    decls.forEach(d => {
      if (declaredIdentifiers.has(d.name)) {
        const prev = declaredIdentifiers.get(d.name);
        hasErrors = true;
        console.error(
          `  ${COLORS.red}✗ FATAL SCOPE ERROR: Identifier '${d.name}' (${d.type}) in '${scriptSrc}:${d.line}' has already been declared in '${prev.file}:${prev.line}'.\n` +
          `    In browser <script> tags, this throws 'Uncaught SyntaxError: Identifier "${d.name}" has already been declared' and stops script execution!${COLORS.reset}`
        );
      } else {
        declaredIdentifiers.set(d.name, {
          file: scriptSrc,
          line: d.line,
          type: d.type
        });
      }
    });
  });

  // 3. Browser Simulation in shared VM context
  console.log(`  ${COLORS.cyan}Simulating script execution sequence in shared VM context...${COLORS.reset}`);
  const sandbox = {
    addEventListener: () => {},
    removeEventListener: () => {},
    window: {},
    document: {
      addEventListener: () => {},
      removeEventListener: () => {},
      documentElement: { style: { setProperty: () => {} }, setAttribute: () => {} },
      getElementById: (id) => ({
        id,
        classList: { toggle: () => {}, add: () => {}, remove: () => {}, contains: () => false },
        style: {},
        innerHTML: "",
        innerText: "",
        textContent: "",
        dataset: {},
        setAttribute: () => {},
        appendChild: () => {},
        getElementsByClassName: () => [],
        querySelector: () => ({ innerText: "", innerHTML: "", textContent: "", classList: { contains: () => false } }),
        querySelectorAll: () => [],
        addEventListener: () => {},
        removeEventListener: () => {}
      }),
      querySelectorAll: () => [],
      querySelector: () => ({
        classList: { toggle: () => {}, add: () => {}, remove: () => {}, contains: () => false },
        style: {},
        innerHTML: "",
        innerText: "",
        textContent: "",
        dataset: {},
        setAttribute: () => {},
        addEventListener: () => {},
        removeEventListener: () => {}
      }),
      createElement: (tag) => ({
        tag,
        classList: { add: () => {}, remove: () => {}, toggle: () => {} },
        style: {},
        innerHTML: "",
        appendChild: () => {},
        querySelectorAll: () => [],
        addEventListener: () => {},
        removeEventListener: () => {}
      })
    },
    getComputedStyle: () => ({ display: "block" }),
    location: { hostname: "localhost", search: "?tenant=blab_demo" },
    navigator: { clipboard: { writeText: async () => {} }, userAgent: "Mozilla/5.0" },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    URLSearchParams: global.URLSearchParams,
    URL: global.URL,
    Intl: global.Intl,
    Date: global.Date,
    Math: global.Math,
    JSON: global.JSON,
    RegExp: global.RegExp,
    Array: global.Array,
    Object: global.Object,
    String: global.String,
    Number: global.Number,
    Boolean: global.Boolean,
    Promise: global.Promise,
    Set: global.Set,
    Map: global.Map,
    AudioContext: class {},
    webkitAudioContext: class {},
    console: {
      log: () => {},
      warn: () => {},
      error: console.error,
      info: () => {}
    },
    setTimeout: (fn) => setTimeout(fn, 0),
    setInterval: () => {},
    clearTimeout: () => {},
    clearInterval: () => {},
    fetch: async () => ({
      ok: true,
      status: 200,
      json: async () => ({}),
      headers: { get: () => null }
    }),
    alert: () => {},
    confirm: () => true
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  const vmContext = vm.createContext(sandbox);

  let vmExecutionPassed = true;
  for (const scriptSrc of scripts) {
    const scriptPath = path.join(ROOT_DIR, scriptSrc);
    if (!fs.existsSync(scriptPath)) continue;

    try {
      const code = fs.readFileSync(scriptPath, "utf8");
      vm.runInContext(code, vmContext, { filename: scriptSrc });
    } catch (err) {
      hasErrors = true;
      vmExecutionPassed = false;
      console.error(`  ${COLORS.red}✗ VM Execution failed when loading '${scriptSrc}':${COLORS.reset}`, err);
      break;
    }
  }

  if (vmExecutionPassed) {
    console.log(`  ${COLORS.green}✓ All scripts in ${htmlFile} loaded and initialized with 0 runtime errors.${COLORS.reset}`);
    if (typeof vmContext.applyLanguageToDOM === "function") {
      try {
        vmContext.applyLanguageToDOM();
        console.log(`  ${COLORS.green}✓ applyLanguageToDOM() executed with 0 runtime errors in ${htmlFile}.${COLORS.reset}`);
      } catch (err) {
        hasErrors = true;
        console.error(`  ${COLORS.red}✗ applyLanguageToDOM() crashed in '${htmlFile}':${COLORS.reset}`, err);
      }
    }
  }
});

console.log(`\n${COLORS.bold}${COLORS.cyan}====================================================${COLORS.reset}`);
if (hasErrors) {
  console.log(`${COLORS.bold}${COLORS.red}❌ FAILED: Frontend linter found errors. Please fix before deploying!${COLORS.reset}\n`);
  process.exit(1);
} else {
  console.log(`${COLORS.bold}${COLORS.green}✅ PASSED: Static syntax and shared-scope checks passed. Browser, persistence and deployment checks are separate.${COLORS.reset}\n`);
  process.exit(0);
}
