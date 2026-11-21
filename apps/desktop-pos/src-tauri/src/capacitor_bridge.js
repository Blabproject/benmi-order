(function () {
  if (typeof window === 'undefined') return;

  var host = '';
  try {
    host = String(window.location && window.location.hostname ? window.location.hostname : '').toLowerCase();
  } catch (e) {
    return;
  }

  var isAllowedOrigin =
    host === 'pos.blabfood.app' ||
    host === 'tauri.localhost' ||
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host.endsWith('.benmi-order.pages.dev');

  if (!isAllowedOrigin) return;

  function invokeTauri(cmd, args) {
    var tauriCore = window.__TAURI__ && window.__TAURI__.core;
    if (!tauriCore || typeof tauriCore.invoke !== 'function') {
      return Promise.reject(new Error('Tauri IPC bridge is unavailable on this origin.'));
    }
    return tauriCore.invoke(cmd, args || {}).catch(function (err) {
      var message = (err && typeof err === 'object' && err.message) ? err.message : String(err || 'Printer error');
      var wrapped = new Error(message);
      if (err && typeof err === 'object' && err.code) {
        wrapped.code = err.code;
      }
      throw wrapped;
    });
  }

  var thermalPrinter = {
    printTcp: function (options) {
      return invokeTauri('print_tcp', { request: options || {} });
    },
    printBitmap: function (options) {
      return invokeTauri('print_bitmap', { request: options || {} });
    },
    testConnection: function (options) {
      return invokeTauri('test_connection', { request: options || {} });
    },
    getPairedBluetoothDevices: function () {
      return invokeTauri('get_paired_bluetooth_devices', {});
    },
    printBluetooth: function (options) {
      return invokeTauri('print_bluetooth', { request: options || {} });
    },
    testBluetoothConnection: function (options) {
      return invokeTauri('test_bluetooth_connection', { request: options || {} });
    }
  };

  var existing = window.Capacitor || {};
  var existingPlugins = existing.Plugins || {};
  existingPlugins.ThermalPrinter = thermalPrinter;

  window.IS_NATIVE_APP = true;
  window.Capacitor = Object.assign({}, existing, {
    isNativePlatform: function () { return true; },
    getPlatform: function () { return '__DESKTOP_PLATFORM__'; },
    isPluginAvailable: function (name) {
      return name === 'ThermalPrinter';
    },
    Plugins: existingPlugins
  });
})();
