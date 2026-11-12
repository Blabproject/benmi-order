// Conversational automation settings are tenant-wide and saved one switch at a time.
var posAISettings = { tenantId: null, values: null, busy: false, status: 'aiLoading', request: 0 };

function renderAISettings() {
  document.querySelectorAll('[data-ai-i18n]').forEach(function (el) {
    el.textContent = t(el.dataset.aiI18n);
  });
  if (document.getElementById('setting-card-ai')?.classList.contains('active') && typeof updateSettingsPanelHeaderTitle === 'function') {
    updateSettingsPanelHeaderTitle();
  }
  var state = posAISettings;
  document.querySelectorAll('[data-ai-setting]').forEach(function (input) {
    var key = input.dataset.aiSetting;
    input.checked = state.values ? state.values[key] !== false : false;
    input.disabled = state.busy || !state.values || (key !== 'enabled' && state.values.enabled === false);
    var label = input.closest('label');
    if (label) label.classList.toggle('ai-switch-disabled', input.disabled);
  });
  var fieldset = document.getElementById('ai-behaviors');
  if (fieldset) fieldset.disabled = state.busy || !state.values || state.values.enabled === false;
  var status = document.getElementById('ai-settings-status');
  if (status) {
    status.textContent = t(state.status);
    status.classList.toggle('ai-settings-error', state.status === 'aiLoadError' || state.status === 'aiSaveError');
  }
  var retry = document.getElementById('ai-settings-retry');
  if (retry) retry.hidden = state.status !== 'aiLoadError';
  var summary = document.getElementById('ai-settings-summary');
  if (summary) summary.textContent = state.values ? t(state.values.enabled ? 'aiEnabledSummary' : 'aiDisabledSummary') : '';
}

async function loadAISettings() {
  if (posAISettings.busy) return;
  var tenantId = getTenantIdFromUrl();
  var request = ++posAISettings.request;
  posAISettings.tenantId = tenantId;
  posAISettings.values = null;
  posAISettings.busy = true;
  posAISettings.status = 'aiLoading';
  renderAISettings();
  try {
    var response = await fetch(WORKER_BASE + '/api/config?tenant_id=' + encodeURIComponent(tenantId), { cache: 'no-store' });
    if (!response.ok) throw new Error('AI settings load failed');
    var data = await response.json();
    if (!data.aiSettings || typeof data.aiSettings.enabled !== 'boolean') throw new Error('AI settings unavailable');
    if (request !== posAISettings.request || tenantId !== getTenantIdFromUrl()) return;
    posAISettings.values = data.aiSettings;
    posAISettings.status = 'aiAutoSave';
  } catch (_) {
    if (request === posAISettings.request) posAISettings.status = 'aiLoadError';
  } finally {
    if (request === posAISettings.request) { posAISettings.busy = false; renderAISettings(); }
  }
}

async function changeAISetting(input) {
  var state = posAISettings;
  if (state.busy || !state.values || state.tenantId !== getTenantIdFromUrl()) return;
  var key = input.dataset.aiSetting;
  var before = state.values;
  var patch = {};
  patch[key] = input.checked;
  state.values = Object.assign({}, before, patch);
  state.busy = true;
  state.status = 'aiSaving';
  renderAISettings();
  try {
    var response = await fetch(WORKER_BASE + '/api/config?tenant_id=' + encodeURIComponent(state.tenantId), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aiSettings: patch })
    });
    if (!response.ok) throw new Error('AI settings save failed');
    var data = await response.json();
    if (!data.success || !data.aiSettings) throw new Error('AI settings save failed');
    state.values = data.aiSettings;
    state.status = 'aiSaved';
  } catch (_) {
    state.values = before;
    state.status = 'aiSaveError';
  } finally {
    state.busy = false;
    renderAISettings();
  }
}
