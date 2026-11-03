import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import config from '../benmi-worker-official/cloudflare.config.ts';
import { resolveDatabase, parseQueryResults } from '../benmi-worker-official/scripts/cloudflare-d1.cjs';

// The retained pre-migration config is the reference for resource identity.
const legacy = JSON.parse(fs.readFileSync(new URL('../benmi-worker-official/wrangler.jsonc', import.meta.url), 'utf8'));

for (const mode of ['dev', 'test', 'production']) {
  test(`${mode}: preserve Worker, account, database, KV, variables and secret references`, () => {
    const original = mode === 'production' ? legacy : { ...legacy, ...legacy.env[mode] };
    const migrated = config({ mode, isPreview: false });
    const worker = migrated.worker;
    assert.equal(migrated.accountId, original.account_id);
    assert.equal(worker.name, original.name);
    assert.equal(worker.entrypoint, original.main);
    assert.equal(worker.compatibilityDate, original.compatibility_date);
    assert.equal(worker.workersDev, original.workers_dev);
    assert.equal(worker.previewUrls, original.preview_urls);
    const expected = {};
    for (const [key, value] of Object.entries(original.vars)) expected[key] = { type: 'text', value };
    for (const { binding, database_name: name, database_id: id } of original.d1_databases) {
      expected[binding] = { type: 'd1', name, id };
    }
    for (const { binding, id } of original.kv_namespaces) expected[binding] = { type: 'kv', id };
    for (const { binding, store_id: storeId, secret_name: secretName } of original.secrets_store_secrets) {
      expected[binding] = { type: 'secrets-store-secret', storeId, secretName };
    }
    if (mode === 'dev') {
      expected.PAYMENT_ALLOW_LIVE_IN_DEV = {type:'text',value:'true'};
      expected.UNIFIED_MENU_ENABLED = {type:'text',value:'true'};
      expected.ORDER_STATE = {type:'kv',id:'f85c539e10df45049780abe25631f082'};
      assert.notEqual(expected.ORDER_STATE.id, config({mode:'test'}).worker.env.ORDER_STATE.id);
    }
    for (const key of ["UNIFIED_MENU_ENABLED", "ORDER_DETAIL_READS", "ORDER_DETAIL_WRITES"]) expected[key] = { type: "text", value: "true" };
    assert.match(worker.env.BUILD_COMMIT.value, /^[a-f0-9]{40}$/);
    assert.equal(worker.env.BUILD_ENVIRONMENT.value, mode === "test" ? "staging" : mode);
    assert.match(worker.env.BUILD_DIRTY.value, /^(true|false)$/);
    const { BUILD_COMMIT, BUILD_ENVIRONMENT, BUILD_DIRTY, ...resourceBindings } = worker.env;
    assert.deepEqual(resourceBindings, expected);
    assert.equal(worker.observability.logs.persist, original.observability.logs.persist);
    assert.equal(worker.observability.logs.invocationLogs, original.observability.logs.invocation_logs);
    assert.equal(worker.observability.headSamplingRate, original.observability.head_sampling_rate);
    assert.equal(worker.observability.traces.enabled, original.observability.traces.enabled);
  });
}

test('staging alias and default production target are preserved', () => {
  assert.deepEqual(config({ mode: 'staging' }), config({ mode: 'test' }));
  assert.deepEqual(config({ mode: undefined }), config({ mode: 'production' }));
});

test('unknown mode and cross-environment database selection fail before a request', () => {
  assert.throws(() => config({ mode: 'stagin' }), /Unknown Cloudflare mode/);
  assert.throws(() => resolveDatabase('blab-db-production', 'dev'), /does not match/);
  assert.throws(() => resolveDatabase('missing-database'), /does not match/);
  assert.equal(resolveDatabase('blab-db-dev', 'dev').id, legacy.env.dev.d1_databases[0].database_id);
  assert.equal(resolveDatabase(legacy.env.test.d1_databases[0].database_id).id, legacy.env.test.d1_databases[0].database_id);
});

test('all query results are retained, and failed or malformed responses are rejected', () => {
  const results = [{ success: true, results: [{ value: 1 }] }, { success: true, results: [{ value: 2 }] }];
  assert.deepEqual(parseQueryResults(JSON.stringify(results)), results);
  assert.deepEqual(parseQueryResults(JSON.stringify({ success: true, result: results })), results);
  assert.throws(() => parseQueryResults(JSON.stringify({ success: false })), /query failed/);
  assert.throws(() => parseQueryResults(JSON.stringify([{ success: false, results: [] }])), /Unexpected/);
  assert.throws(() => parseQueryResults('{}'), /Unexpected/);
  assert.throws(() => parseQueryResults('not json'));
});
