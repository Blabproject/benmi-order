// Android owns this device preference, including restoration before the POS loads.
(function () {
  const modes = ['auto', 'portrait', 'landscape'];
  let selected = 'landscape';
  let ready = false;
  let busy = false;

  function getPlugin() {
    return window.Capacitor?.Plugins?.POSScreenOrientation;
  }

  function syncControls() {
    document.querySelectorAll('input[name="pos-screen-orientation"]').forEach(input => {
      input.checked = ready && input.value === selected;
      input.disabled = busy || !ready;
    });
  }

  function setStatus(key) {
    const status = document.getElementById('pos-screen-orientation-status');
    if (!status) return;
    status.dataset.posDisplayI18n = key;
    status.textContent = t(key);
  }

  window.loadPOSScreenOrientationSetting = async function () {
    const section = document.getElementById('pos-screen-orientation');
    if (!section || busy) return;
    const native = typeof window.isNativeAppPlatform === 'function' && window.isNativeAppPlatform();
    section.hidden = !native;
    if (!native) return;
    const plugin = getPlugin();
    if (!plugin || typeof plugin.getMode !== 'function' || typeof plugin.setMode !== 'function') {
      ready = false;
      syncControls();
      setStatus('orientationUpdateRequired');
      return;
    }
    busy = true;
    syncControls();
    try {
      const result = await plugin.getMode();
      if (!modes.includes(result?.mode)) throw new Error('Invalid orientation response');
      selected = result.mode;
      ready = true;
      setStatus('orientationDeviceHint');
    } catch (error) {
      ready = false;
      setStatus('orientationLoadFailed');
    } finally {
      busy = false;
      syncControls();
    }
  };

  window.selectPOSScreenOrientation = async function (mode) {
    if (busy || !ready || !modes.includes(mode)) {
      syncControls();
      return;
    }
    busy = true;
    syncControls();
    try {
      const result = await getPlugin().setMode({ mode });
      if (!modes.includes(result?.mode)) throw new Error('Invalid orientation response');
      selected = result.mode;
      setStatus('orientationSaved');
    } catch (error) {
      setStatus('orientationSaveFailed');
    } finally {
      busy = false;
      syncControls();
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.loadPOSScreenOrientationSetting);
  } else {
    window.loadPOSScreenOrientationSetting();
  }
})();
