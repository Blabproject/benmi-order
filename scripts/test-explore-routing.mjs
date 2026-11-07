import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { test } from "node:test";

const source = (await readFile(new URL("../functions/_middleware.js", import.meta.url), "utf8"))
  .replace("export async function", "async function");

async function dispatch(url) {
  let servedAsset;
  const sandbox = { URL, Request, Response, Headers };
  vm.runInNewContext(source, sandbox);
  const response = await sandbox.onRequest({
    request: new Request(url),
    env: {
      ASSETS: {
        fetch: async (request) => {
          servedAsset = request.url;
          return new Response("marketplace document", { headers: { "Content-Type": "text/html" } });
        },
      },
    },
    next: async () => new Response("default document"),
  });
  return { response, servedAsset };
}

test("explore root serves marketplace without redirect and retains query", async () => {
  const result = await dispatch("https://explore.blabfood.app/?source=qr");
  assert.equal(result.response.status, 200);
  assert.equal(new URL(result.servedAsset).pathname, "/marketplace");
  assert.equal(new URL(result.servedAsset).search, "?source=qr");
  assert.equal(result.response.headers.get("location"), null);
});

test("pos.blabfood.app serves orders at root, /:tenant/orders, and /:tenant while retaining query", async () => {
  for (const [url, expectedSearch] of [
    ["https://pos.blabfood.app/", ""],
    ["https://pos.blabfood.app/index.html", ""],
    ["https://pos.blabfood.app/?tenant_id=bsc", "?tenant_id=bsc"],
    ["https://pos.blabfood.app/bsc/orders", ""],
    ["https://pos.blabfood.app/bsc/orders?env=prod", "?env=prod"],
    ["https://pos.blabfood.app/bsc", ""],
    ["https://pos.blabfood.app/orders", ""],
  ]) {
    const result = await dispatch(url);
    assert.equal(result.response.status, 200, `Expected 200 for ${url}`);
    assert.equal(new URL(result.servedAsset).pathname, "/orders", `Expected /orders for ${url}`);
    assert.equal(new URL(result.servedAsset).search, expectedSearch, `Expected search ${expectedSearch} for ${url}`);
    assert.equal(result.response.headers.get("location"), null);
  }
});

test("other domains, static assets, and reserved paths retain existing Pages behavior", async () => {
  for (const url of [
    "https://blabfood.app/",
    "https://benmi-order.pages.dev/",
    "https://explore.blabfood.app/marketplace",
    "https://explore.blabfood.app/js/marketplace.js",
    "https://pos.blabfood.app/css/orders.css",
    "https://pos.blabfood.app/js/orders-core.js",
    "https://pos.blabfood.app/favicon.ico",
    "https://pos.blabfood.app/manifest.json",
  ]) {
    const result = await dispatch(url);
    assert.equal(result.servedAsset, undefined, `Expected pass-through for ${url}`);
    assert.equal(await result.response.text(), "default document");
  }
});



test("POS staff mode serves the shared customer menu instead of the dashboard", async () => {
  for (const entry of ['/', '/index.html']) {
    const result = await dispatch(`https://pos.blabfood.app${entry}?mode=staff&tenant_id=demo&embedded=1`);
    assert.equal(result.response.status, 200);
    assert.equal(new URL(result.servedAsset).pathname, '/');
    assert.equal(new URL(result.servedAsset).searchParams.get('mode'), 'staff');
    assert.equal(new URL(result.servedAsset).searchParams.get('tenant_id'), 'demo');
    assert.equal(result.response.headers.get('location'), null);
  }
});
