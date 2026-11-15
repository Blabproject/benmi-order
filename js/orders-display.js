// Device-local POS typography. Load before CSS so saved sizes apply at first paint.
(function () {
  if (document.currentScript?.hasAttribute("data-staff-only") && !window.isStaffOrderMode) return;
  const isStaff = window.isStaffOrderMode === true;
  const storageKey = "pos_text_size";
  const sizes = ["auto", "standard", "large", "extra-large"];
  let selected = "auto";
  try {
    const saved = localStorage.getItem(storageKey);
    if (sizes.includes(saved)) selected = saved;
  } catch (e) { /* A blocked store must not prevent POS startup. */ }
  if (isStaff && window.parent !== window) {
    try {
      const inherited = window.parent.getPOSTextSize?.();
      if (sizes.includes(inherited)) selected = inherited;
    } catch (e) { /* Standalone and cross-origin pages use the local preference. */ }
  }

  function syncControls() {
    document.querySelectorAll('input[name="pos-text-size"]').forEach(input => {
      input.checked = input.value === selected;
    });
  }

  function apply() {
    document.documentElement.setAttribute("data-pos-text-size", selected);
    if (isStaff) document.documentElement.style.setProperty("--pos-font-scale", window.getPOSTextScale());
    syncControls();
    if (typeof window.syncLiveMobileView === "function") window.syncLiveMobileView();
    const frame = document.getElementById("staff-order-iframe");
    frame?.contentWindow?.postMessage({ type: "POS_TEXT_SIZE", value: selected }, window.location.origin);
  }

  window.getPOSTextSize = () => selected;
  window.getPOSTextScale = function () {
    if (selected === "auto" && isStaff && window.parent !== window) {
      try {
        if (typeof window.parent.getPOSTextScale === "function") return window.parent.getPOSTextScale();
      } catch (e) { /* Use this viewport if the host is unavailable. */ }
    }
    if (selected === "extra-large") return 1.25;
    if (selected === "large" || (selected === "auto" && window.innerWidth >= 768)) return 1.125;
    return 1;
  };

  window.selectPOSTextSize = function (value) {
    if (!sizes.includes(value)) return;
    selected = value;
    try { localStorage.setItem(storageKey, selected); } catch (e) {}
    apply();
  };

  apply();
  document.addEventListener("DOMContentLoaded", syncControls);
  window.addEventListener("resize", apply, { passive: true });
  window.addEventListener("storage", event => {
    if (event.key !== storageKey && event.key !== null) return;
    selected = sizes.includes(event.newValue) ? event.newValue : "auto";
    apply();
  });
  if (isStaff && window.parent !== window) window.addEventListener("message", event => {
    if (event.source !== window.parent || event.origin !== window.location.origin || event.data?.type !== "POS_TEXT_SIZE") return;
    if (!sizes.includes(event.data.value)) return;
    selected = event.data.value;
    apply();
  });
})();
