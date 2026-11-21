// Android owns this device preference, including restoration before the POS loads.
(function () {
  const modes = ['auto', 'portrait', 'landscape'];
  let available = false;
  let selected = null;
  let busy = false;
  let status = 'orientationDeviceHint';

  function getPlugin() {
    return window.Capacitor?.Plugins?.POSScreenOrientation;
  }

  function refreshView() {
    window.syncPOSSettingsView?.();
  }

  window.getPOSScreenOrientationSetting = () => ({ available, selected, busy, status });

  window.loadPOSScreenOrientationSetting = async function () {
    if (busy) return;
    const platform = window.Capacitor?.getPlatform?.();
    available = typeof window.isNativeAppPlatform === 'function'
      && window.isNativeAppPlatform()
      && !['windows', 'macos', 'linux'].includes(platform);
    if (!available) {
      refreshView();
      return;
    }
    const plugin = getPlugin();
    if (!plugin || typeof plugin.getMode !== 'function' || typeof plugin.setMode !== 'function') {
      selected = null;
      status = 'orientationUpdateRequired';
      refreshView();
      return;
    }
    busy = true;
    refreshView();
    try {
      const result = await plugin.getMode();
      if (!modes.includes(result?.mode)) throw new Error('Invalid orientation response');
      selected = result.mode;
      status = 'orientationDeviceHint';
    } catch (error) {
      selected = null;
      status = 'orientationLoadFailed';
    } finally {
      busy = false;
      refreshView();
    }
  };

  window.selectPOSScreenOrientation = async function (mode) {
    if (!available || busy || !selected || !modes.includes(mode)) return;
    busy = true;
    refreshView();
    try {
      const result = await getPlugin().setMode({ mode });
      if (!modes.includes(result?.mode)) throw new Error('Invalid orientation response');
      selected = result.mode;
      status = 'orientationSaved';
    } catch (error) {
      status = 'orientationSaveFailed';
    } finally {
      busy = false;
      refreshView();
    }
  };
})();
