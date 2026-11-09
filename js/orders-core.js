// ==========================================
// Benmi POS - Module: Core & Polling Engine
// ==========================================

const _coreHostname = window.location.hostname;
const _coreParams = new URLSearchParams(window.location.search);
const _forcedEnv = window.POS_BUNDLED_ENV || _coreParams.get("env") || (() => {
  try { return localStorage.getItem("pos_env_override"); } catch (e) { return null; }
})();

const _isDev = (
  _forcedEnv === "dev" ||
  ((_coreHostname === "localhost" || _coreHostname === "127.0.0.1" || !_coreHostname) && _forcedEnv !== "prod") ||
  _coreHostname.startsWith("dev.") ||
  _coreHostname.includes(".dev.") ||
  _coreHostname.includes("-dev.") ||
  _coreHostname.startsWith("dev-") ||
  (!_forcedEnv && _coreHostname.endsWith(".pages.dev") && !["benmi-order.pages.dev","staging.benmi-order.pages.dev"].includes(_coreHostname))
);
const _isStaging = (
  _forcedEnv === "staging" ||
  _coreHostname.startsWith("staging.") ||
  _coreHostname.includes(".staging.") ||
  _coreHostname.includes("-staging.") ||
  _coreHostname.startsWith("test.") ||
  _coreHostname.includes(".test.") ||
  _coreHostname.includes("-test.")
);
const WORKER_BASE = _isDev
  ? "https://platform-worker-dev.thuanmnc.workers.dev"
  : (_isStaging
    ? "https://platform-worker-staging.thuanmnc.workers.dev"
    : "https://benmi-worker-official.thuanmnc.workers.dev");

var POS_SVG = {
  takeaway: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-1px; margin-right:4px;"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"></path><path d="M3 6h18"></path><path d="M16 10a4 4 0 0 1-8 0"></path></svg>`,
  dineIn: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-1px; margin-right:4px;"><path d="M18 2v6a3 3 0 0 1-3 3 3 3 0 0 1-3-3V2"></path><path d="M15 2v10"></path><path d="M15 14v8"></path><path d="M6 2v20"></path><path d="M6 2a3 3 0 0 1 3 3v3a3 3 0 0 1-3 3"></path></svg>`,
  clock: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-1px; margin-right:4px; opacity:0.65;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`,
  receipt: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-1px; margin-right:4px; opacity:0.65;"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"></path><path d="M16 8h-8"></path><path d="M16 12h-8"></path><path d="M10 16h-4"></path></svg>`,
  sliders: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px; margin-right:6px;"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg>`,
  edit: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-1px;"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path><path d="m15 5 4 4"></path></svg>`,
  trash: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-1px;"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path><line x1="10" x2="10" y1="11" y2="17"></line><line x1="14" x2="14" y1="11" y2="17"></line></svg>`,
  settings: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path><circle cx="12" cy="12" r="3"></circle></svg>`,
  tag: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-1px;"><path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"></path><path d="M7 7h.01"></path></svg>`,
  image: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-1px;"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"></rect><circle cx="9" cy="9" r="2"></circle><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"></path></svg>`,
  plus: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-1px;"><path d="M5 12h14"></path><path d="M12 5v14"></path></svg>`,
  printer: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-1px; margin-right:4px;"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>`,
  note: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-1px; margin-right:4px; opacity:0.75;"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>`,
  check: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px; margin-right:4px;"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
  checkCircle: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="16 10 11 15 8 12"></polyline></svg>`,
  checkAll: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px; margin-right:4px;"><polyline points="18 6 7 17 2 12"></polyline><path d="m22 10-7.5 7.5L13 16"></path></svg>`,
  eye: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px; margin-right:4px;"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle></svg>`,
  inbox: `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"></polyline><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path></svg>`,
  partyCheck: `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`,
  user: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px; margin-right:4px;"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`,
  x: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>`,
  flame: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px; margin-right:4px;"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"></path></svg>`,
  sparkles: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px; margin-right:4px;"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"></path><path d="M5 3v4"></path><path d="M19 17v4"></path><path d="M3 5h4"></path><path d="M17 19h4"></path></svg>`,
  copy: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px; margin-right:4px;"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path></svg>`,
  fileText: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px; margin-right:4px;"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"></path><path d="M14 2v4a2 2 0 0 0 2 2h4"></path><path d="M10 9H8"></path><path d="M16 13H8"></path><path d="M16 17H8"></path></svg>`,
  search: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px; margin-right:4px;"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg>`,
  calendar: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px; margin-right:4px;"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"></rect><line x1="16" x2="16" y1="2" y2="6"></line><line x1="8" x2="8" y1="2" y2="6"></line><line x1="3" x2="21" y1="10" y2="10"></line></svg>`,
  folder: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px; margin-right:4px;"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"></path></svg>`,
  folderOpen: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px; margin-right:4px;"><path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"></path></svg>`,
  sliders: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px; margin-right:4px;"><line x1="4" x2="20" y1="21" y2="21"></line><line x1="4" x2="20" y1="14" y2="14"></line><line x1="4" x2="20" y1="7" y2="7"></line><circle cx="8" cy="7" r="2"></circle><circle cx="16" cy="14" r="2"></circle><circle cx="12" cy="21" r="2"></circle></svg>`,
  edit: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px; margin-right:4px;"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>`,
  trash: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px; margin-right:4px;"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path><line x1="10" x2="10" y1="11" y2="17"></line><line x1="14" x2="14" y1="11" y2="17"></line></svg>`,
  plus: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px; margin-right:4px;"><line x1="12" x2="12" y1="5" y2="19"></line><line x1="5" x2="19" y1="12" y2="12"></line></svg>`,
  image: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px; margin-right:4px;"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"></rect><circle cx="9" cy="9" r="2"></circle><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"></path></svg>`,
  grip: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><circle cx="9" cy="5" r="1"></circle><circle cx="9" cy="12" r="1"></circle><circle cx="9" cy="19" r="1"></circle><circle cx="15" cy="5" r="1"></circle><circle cx="15" cy="12" r="1"></circle><circle cx="15" cy="19" r="1"></circle></svg>`,
  save: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px; margin-right:4px;"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>`,
  settings: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px; margin-right:4px;"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path><circle cx="12" cy="12" r="3"></circle></svg>`,
  tag: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-1px;"><path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"></path><path d="M7 7h.01"></path></svg>`,
  bundle: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-1px; margin-right:4px;"><rect width="7" height="7" x="3" y="3" rx="1"></rect><rect width="7" height="7" x="14" y="3" rx="1"></rect><rect width="7" height="7" x="14" y="14" rx="1"></rect><rect width="7" height="7" x="3" y="14" rx="1"></rect></svg>`,
  modify: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-1px; margin-right:4px;"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"></path><path d="M16 16h5v5"></path></svg>`,
  layers: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-1px; margin-right:4px;"><path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.9a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/></svg>`
};
window.POS_SVG = POS_SVG;

function isNativeAppPlatform() {
  if (typeof window === "undefined") return false;
  if (window.IS_NATIVE_APP === true) return true;
  try {
    const params = new URLSearchParams(window.location.search);
    const p = params.get("platform");
    if (p === "app" || params.get("app") === "1") return true;
    if (p === "web" || params.get("web") === "1") return false;
    if (window.Capacitor) {
      if (typeof window.Capacitor.isNativePlatform === "function" && window.Capacitor.isNativePlatform()) return true;
      if (typeof window.Capacitor.getPlatform === "function" && window.Capacitor.getPlatform() !== "web") return true;
      if (typeof window.Capacitor.isPluginAvailable === "function" && window.Capacitor.isPluginAvailable("ThermalPrinter")) return true;
    }
    if (window.AndroidBridge || window.androidBridge) return true;
    if (typeof navigator !== "undefined" && navigator.userAgent && navigator.userAgent.includes("BenmiPOS")) return true;
  } catch (e) {}
  return Boolean(window.IS_NATIVE_APP);
}
window.isNativeAppPlatform = isNativeAppPlatform;

const _isProd = !_isDev && !_isStaging;
window._isProdEnv = _isProd;

function shouldHideWebPrinter() {
  if (typeof window === "undefined") return false;
  if (isNativeAppPlatform()) return false;
  try {
    const params = new URLSearchParams(window.location.search);
    const hp = params.get("hide_printer");
    if (hp === "1") return true;
    if (hp === "0") return false;
    return !!_isProd;
  } catch (e) {
    return !!_isProd;
  }
}
window.shouldHideWebPrinter = shouldHideWebPrinter;

function syncPlatformClasses() {
  const isApp = isNativeAppPlatform();
  const hideWebPrinter = shouldHideWebPrinter();
  window.IS_NATIVE_APP = isApp;
  if (typeof document !== "undefined") {
    [document.documentElement, document.body].forEach(el => {
      if (el && el.classList && typeof el.classList.toggle === "function") {
        el.classList.toggle("is-native-app", isApp);
        el.classList.toggle("is-web-platform", !isApp);
        el.classList.toggle("is-prod-env", _isProd);
        el.classList.toggle("is-non-prod-env", !_isProd);
        el.classList.toggle("hide-web-printer", hideWebPrinter);
      }
    });
  }
}
syncPlatformClasses();
if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
  document.addEventListener("DOMContentLoaded", syncPlatformClasses);
}

function getTenantIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get("tenant") || params.get("tenant_id");
  if (fromUrl && fromUrl.trim()) {
    return fromUrl.trim();
  }

  // Check URL pathname for RESTful routing: e.g. /:tenant/orders or /:tenant
  if (typeof window !== "undefined" && window.location && window.location.pathname) {
    const pathParts = window.location.pathname.split("/").filter(Boolean);
    const RESERVED_PATHS = [
      "orders", "orders.html", "index", "index.html",
      "landing", "landing.html", "marketplace", "marketplace.html",
      "css", "js", "icons", "fonts", "sound", "audio", "dist", "api"
    ];

    // Pattern 1: /:tenant/orders (e.g. /bsc/orders)
    if (pathParts.length >= 2 && pathParts[1] === "orders") {
      const candidate = pathParts[0].trim();
      if (candidate && !RESERVED_PATHS.includes(candidate)) {
        return candidate;
      }
    }

    // Pattern 2: /:tenant (e.g. /bsc on pos.blabfood.app or custom domain)
    if (pathParts.length === 1) {
      const candidate = pathParts[0].trim();
      if (candidate && !candidate.includes(".") && !RESERVED_PATHS.includes(candidate)) {
        return candidate;
      }
    }
  }

  try {
    const savedTenant = localStorage.getItem("pos_device_tenant_id");
    if (savedTenant && savedTenant.trim()) {
      return savedTenant.trim();
    }
  } catch (e) {}
  // When running in a standard web browser (not native app), default to "benmi" to avoid blocking login modal
  if (typeof isNativeAppPlatform === "function" && !isNativeAppPlatform()) {
    return "benmi";
  }
  return "";
}

function applyTenantBranding(tenant) {
  if (!tenant) return;
  const brandName = tenant.brandName || tenant.name || "Blab POS";
  window.currentTenantBrandName = tenant.brandName || tenant.name || '';
  const bTitle = document.getElementById('brand-title');
  const bLogo = document.getElementById('brand-logo');

  if (bTitle) bTitle.innerText = brandName;
  document.title = `${brandName} POS`;

  if (bLogo) {
    if (tenant.logoUrl) {
      bLogo.src = tenant.logoUrl;
      bLogo.style.display = "block";
    } else {
      bLogo.style.display = "none";
      bLogo.removeAttribute("src");
    }
  }

  if (tenant && Array.isArray(tenant.features)) {
    window.currentTenantFeatures = tenant.features;
  } else {
    window.currentTenantFeatures = [];
  }
  document.documentElement.style.setProperty('--primary', '#00b900');
  initMobileBrandInfo();
}

var tenantCustomizations = [];
window.tenantCustomizations = tenantCustomizations;
window.tenantItemPriceMap = {};

function updatePosCatalogPriceMap(catalog) {
  if (!catalog) return;
  var priceMap = {};
  var categories = Array.isArray(catalog) ? catalog : Object.values(catalog);
  categories.forEach(function(cat) {
    if (cat && Array.isArray(cat.items)) {
      cat.items.forEach(function(item) {
        if (item && item.name && typeof item.price === 'number') {
          var rawName = String(item.name).trim();
          priceMap[rawName] = item.price;
          var clean = rawName.replace(/\s*\([^\)]+\)/g, '').trim();
          if (clean && priceMap[clean] == null) {
            priceMap[clean] = item.price;
          }
        }
      });
    }
  });
  window.tenantItemPriceMap = Object.assign(window.tenantItemPriceMap || {}, priceMap);
}
window.updatePosCatalogPriceMap = updatePosCatalogPriceMap;

function lookupItemPrice(name) {
  if (!name || typeof name !== 'string') return null;
  var trimmed = name.trim();
  var map = window.tenantItemPriceMap || {};
  if (map[trimmed] != null) return map[trimmed];
  var clean = trimmed.replace(/\s*\([^\)]+\)/g, '').trim();
  if (map[clean] != null) return map[clean];
  if (typeof currentMenuData !== 'undefined' && Array.isArray(currentMenuData)) {
    for (var i = 0; i < currentMenuData.length; i++) {
      var cat = currentMenuData[i];
      if (cat && Array.isArray(cat.items)) {
        for (var j = 0; j < cat.items.length; j++) {
          var item = cat.items[j];
          if (item && (item.name === trimmed || item.name === clean) && typeof item.price === 'number') {
            return item.price;
          }
        }
      }
    }
  }
  return null;
}
window.lookupItemPrice = lookupItemPrice;

function updatePosOptionIdMap(data) {
  if (!data) return;
  const map = window.posOptionIdMap || new Map();
  window.posOptionIdMap = map;
  for (const [id, name] of Object.entries(data.optionDisplayNames || {})) {
    if (typeof name === 'string' && name) map.set(id, name);
  }
  if (Array.isArray(data.modifiers)) {
    data.modifiers.forEach(m => (m.options || []).forEach(o => {
      if (o.id && o.name) map.set(String(o.id), o.name);
    }));
  }
  if (Array.isArray(data.catalog)) {
    data.catalog.forEach(c => (c.items || []).forEach(it => {
      if (it.id && it.name) map.set(String(it.id), it.name);
      if (Array.isArray(it.modifierGroups)) {
        it.modifierGroups.forEach(mg => (mg.options || []).forEach(o => {
          if (o.id && o.name) map.set(String(o.id), o.name);
        }));
      }
    }));
  }
  if (Array.isArray(data.customizations)) {
    data.customizations.forEach(g => (g.options || []).forEach(o => {
      if (o.id && o.name) map.set(String(o.id), o.name);
    }));
  }
}
window.updatePosOptionIdMap = updatePosOptionIdMap;

async function initTenantBranding() {
  const tenantId = getTenantIdFromUrl();
  if (!tenantId) {
    if (typeof isNativeAppPlatform === "function" && isNativeAppPlatform() && typeof showStoreActivationModal === "function") {
      showStoreActivationModal();
    }
    return;
  }

  // 1. Instant Cache Render (0ms latency, eliminates any flash of unstyled content)
  try {
    const cached = localStorage.getItem("tenant_branding_" + tenantId) || localStorage.getItem("tenant_theme_" + tenantId);
    if (cached) {
      applyTenantBranding(JSON.parse(cached));
    }
    const cachedCust = localStorage.getItem("tenant_customizations_" + tenantId);
    if (cachedCust) {
      window.tenantCustomizations = JSON.parse(cachedCust);
      tenantCustomizations = window.tenantCustomizations;
    }
    const cachedCat = localStorage.getItem("tenant_catalog_" + tenantId);
    if (cachedCat) {
      updatePosCatalogPriceMap(JSON.parse(cachedCat));
    }
    const cachedBootstrap = localStorage.getItem("tenant_bootstrap_" + tenantId);
    if (cachedBootstrap) {
      updatePosOptionIdMap(JSON.parse(cachedBootstrap));
    }
  } catch(e) {}

  // 2. Fetch fresh config from Server and update cache
  try {
    const res = await fetch(`${WORKER_BASE}/api/tenant/bootstrap?tenant_id=${tenantId}&_t=${Date.now()}`);
    if (res.ok) {
      const data = await res.json();
      if (getTenantIdFromUrl() !== tenantId) return;
      try {
        localStorage.setItem("tenant_bootstrap_" + tenantId, JSON.stringify(data));
      } catch(e) {}
      updatePosOptionIdMap(data);
      if (data.tenant) {
        try {
          localStorage.setItem("tenant_branding_" + tenantId, JSON.stringify(data.tenant));
          localStorage.setItem("tenant_theme_" + tenantId, JSON.stringify(data.tenant));
        } catch(e) {}
        applyTenantBranding(data.tenant);
      }
      if (Array.isArray(data.customizations) && data.customizations.length > 0) {
        window.tenantCustomizations = data.customizations;
        tenantCustomizations = data.customizations;
        try {
          localStorage.setItem("tenant_customizations_" + tenantId, JSON.stringify(data.customizations));
        } catch(e) {}
        if (window.reviewingOrder && typeof formatContentHtml === "function") {
          const elCont = document.getElementById("review-content");
          if (elCont) elCont.innerHTML = formatContentHtml(window.reviewingOrder);
        }
      } else {
        window.tenantCustomizations = [];
        tenantCustomizations = [];
        try {
          localStorage.removeItem("tenant_customizations_" + tenantId);
        } catch(e) {}
        if (window.reviewingOrder && typeof formatContentHtml === "function") {
          const elCont = document.getElementById("review-content");
          if (elCont) elCont.innerHTML = formatContentHtml(window.reviewingOrder);
        }
      }
      if (data.catalog) {
        try {
          localStorage.setItem("tenant_catalog_" + tenantId, JSON.stringify(data.catalog));
        } catch(e) {}
        updatePosCatalogPriceMap(data.catalog);
        if (typeof renderAll === "function") {
          renderAll();
        }
      }
      if (typeof checkStaffOrderingCapability === "function") {
        checkStaffOrderingCapability();
      }
    }
  } catch(e) {}
}
initTenantBranding();

async function ensureTenantCustomizations() {
  if (Array.isArray(window.tenantCustomizations) && window.tenantCustomizations.length > 0) {
    return window.tenantCustomizations;
  }
  const tenantId = getTenantIdFromUrl();
  try {
    const cached = localStorage.getItem("tenant_customizations_" + tenantId);
    if (cached) {
      window.tenantCustomizations = JSON.parse(cached);
      tenantCustomizations = window.tenantCustomizations;
      if (window.tenantCustomizations.length > 0) return window.tenantCustomizations;
    }
    const res = await fetch(`${WORKER_BASE}/api/tenant/bootstrap?tenant_id=${tenantId}&_t=${Date.now()}`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.customizations) && data.customizations.length > 0) {
        window.tenantCustomizations = data.customizations;
        tenantCustomizations = data.customizations;
        try {
          localStorage.setItem("tenant_customizations_" + tenantId, JSON.stringify(data.customizations));
        } catch(e) {}
        return data.customizations;
      } else {
        window.tenantCustomizations = [];
        tenantCustomizations = [];
        try {
          localStorage.removeItem("tenant_customizations_" + tenantId);
        } catch(e) {}
        return [];
      }
    }
  } catch(e) {}
  return window.tenantCustomizations || [];
}
window.ensureTenantCustomizations = ensureTenantCustomizations;

// Global POS State
var VALID_POS_TABS = ["live", "history", "menu", "reports", "settings", "payments", "staff-order"];

function getInitialTab() {
  if (typeof window === "undefined") return "live";

  // 1. Check URL hash (e.g. #menu, #history, #reports, #settings, #live)
  try {
    const rawHash = (window.location.hash || "").replace(/^#/, "").trim().toLowerCase();
    if (rawHash && VALID_POS_TABS.includes(rawHash)) {
      if (rawHash === "reports" && typeof isNativeAppPlatform === "function" && isNativeAppPlatform()) {
        return "live";
      }
      return rawHash;
    }
  } catch (e) {}

  // 2. Check query param (e.g. ?tab=menu)
  try {
    const params = new URLSearchParams(window.location.search);
    const queryTab = (params.get("tab") || "").trim().toLowerCase();
    if (queryTab && VALID_POS_TABS.includes(queryTab)) {
      if (queryTab === "reports" && typeof isNativeAppPlatform === "function" && isNativeAppPlatform()) {
        return "live";
      }
      return queryTab;
    }
  } catch (e) {}

  // 3. Check sessionStorage fallback
  try {
    const saved = (sessionStorage.getItem("pos_active_tab") || "").trim().toLowerCase();
    if (saved && VALID_POS_TABS.includes(saved)) {
      if (saved === "reports" && typeof isNativeAppPlatform === "function" && isNativeAppPlatform()) {
        return "live";
      }
      return saved;
    }
  } catch (e) {}

  return "live";
}
window.VALID_POS_TABS = VALID_POS_TABS;
window.getInitialTab = getInitialTab;

var latestOrders = [];
var pendingNewOrders = [];
var reviewingOrder = null;
var currentOrderKey = null;
var activeTab = getInitialTab();
var newAlertSnoozeUntilMs = 0;
var snoozedNewOrderKeys = new Set();
var newAlertSnoozeTimerId = null;
var localOverrides = {};
var knownOrderKeys = new Set();
var knownOrderRounds = new Map();
var knownOrderModified = new Set();
var unacknowledgedAppends = new Map();
var processingKeys = new Set();
var isFirstLoad = true;
var lastOrdersETag = "";

window.latestOrders = latestOrders;
window.pendingNewOrders = pendingNewOrders;
window.reviewingOrder = reviewingOrder;
window.unacknowledgedAppends = unacknowledgedAppends;
window.snoozedNewOrderKeys = snoozedNewOrderKeys;

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function parsePickupTimeMs(timeStr, createdAtMs) {
  if (!timeStr || typeof timeStr !== "string") return Number(createdAtMs) || NaN;
  const m = timeStr.match(/(\d{4}-\d{2}-\d{2})[T\s]+(\d{1,2}):(\d{2})/);
  if (m) {
    const hh = m[2].padStart(2, "0");
    const min = m[3].padStart(2, "0");
    const iso = `${m[1]}T${hh}:${min}:00`;
    const ms = new Date(iso).getTime();
    if (!Number.isNaN(ms)) return ms;
  }
  const timeOnly = timeStr.match(/(\d{1,2}):(\d{2})/);
  if (timeOnly) {
    const base = createdAtMs ? new Date(createdAtMs) : new Date();
    const yyyy = base.getFullYear();
    const mm = String(base.getMonth() + 1).padStart(2, "0");
    const dd = String(base.getDate()).padStart(2, "0");
    const hh = String(parseInt(timeOnly[1], 10)).padStart(2, "0");
    const min = String(parseInt(timeOnly[2], 10)).padStart(2, "0");
    const iso = `${yyyy}-${mm}-${dd}T${hh}:${min}:00`;
    const ms = new Date(iso).getTime();
    if (!Number.isNaN(ms)) return ms;
  }
  return Number(createdAtMs) || NaN;
}

function getOrderEffectiveDineInTimeMs(order) {
  if (!order) return Date.now();
  const appended = order.lastAppendedAt || order.last_appended_at;
  if (appended) {
    const ms = typeof appended === "number" ? appended : new Date(String(appended).includes("Z") ? appended : appended + "Z").getTime();
    if (!Number.isNaN(ms) && ms > 0) return ms;
  }
  if (order.createdAt && !Number.isNaN(Number(order.createdAt))) {
    return Number(order.createdAt);
  }
  if (order.time) {
    const ms = parsePickupTimeMs(order.time);
    if (!Number.isNaN(ms)) return ms;
  }
  return Date.now();
}

function sortByPickupTimeAsc(a, b) {
  const isADineIn = typeof isOrderDineIn === "function" ? isOrderDineIn(a) : a?.diningOption === "dine_in";
  const isBDineIn = typeof isOrderDineIn === "function" ? isOrderDineIn(b) : b?.diningOption === "dine_in";

  const at = isADineIn ? getOrderEffectiveDineInTimeMs(a) : parsePickupTimeMs(a?.time, a?.createdAt);
  const bt = isBDineIn ? getOrderEffectiveDineInTimeMs(b) : parsePickupTimeMs(b?.time, b?.createdAt);

  if (Number.isNaN(at) && Number.isNaN(bt)) return (a?.createdAt || 0) - (b?.createdAt || 0);
  if (Number.isNaN(at)) return (a?.createdAt || 0) - bt;
  if (Number.isNaN(bt)) return at - (b?.createdAt || 0);
  if (at === bt) return (a?.createdAt || 0) - (b?.createdAt || 0);
  return at - bt;
}

function formatEta(timeStr) {
  const target = parsePickupTimeMs(timeStr);
  if (Number.isNaN(target)) return "-";
  const diffMs = target - Date.now();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin <= 0) {
    const elapsed = Math.abs(diffMin);
    if (elapsed < 60) {
      return t("etaArrived", { min: elapsed });
    }
    if (elapsed < 1440) {
      const h = Math.floor(elapsed / 60);
      const m = elapsed % 60;
      return m > 0 ? t("etaArrivedHours", { h, m }) : t("etaArrivedHoursOnly", { h });
    }
    if (elapsed < 10080) {
      const d = Math.floor(elapsed / 1440);
      const h = Math.floor((elapsed % 1440) / 60);
      return (d < 2 && h > 0) ? t("etaArrivedDaysHours", { d, h }) : t("etaArrivedDays", { d });
    }
    const w = Math.floor(elapsed / 10080);
    return t("etaArrivedWeeks", { w });
  }

  if (diffMin < 60) return t("etaMinutes", { min: diffMin });
  if (diffMin < 1440) {
    const h = Math.floor(diffMin / 60);
    const m = diffMin % 60;
    return m > 0 ? t("etaHours", { h, m }) : t("etaHoursOnly", { h });
  }
  if (diffMin < 10080) {
    const d = Math.floor(diffMin / 1440);
    const h = Math.floor((diffMin % 1440) / 60);
    return (d < 2 && h > 0) ? t("etaDaysHours", { d, h }) : t("etaDays", { d });
  }
  const w = Math.floor(diffMin / 10080);
  return t("etaWeeks", { w });
}

function isOrderElapsedMode(order) {
  if (!order) return false;
  // Scheduling settings affect new orders, not the meaning of existing pickup times.
  return typeof isOrderDineIn === "function"
    ? isOrderDineIn(order)
    : (order.diningOption || order.dining_option) === "dine_in";
}

function formatOrderSubmissionTime(order) {
  if (!order) return "-";
  let createdMs = 0;
  if (order.createdAt) {
    createdMs = typeof order.createdAt === "number" ? order.createdAt : new Date(String(order.createdAt).includes("Z") ? order.createdAt : order.createdAt + "Z").getTime();
  }
  if (!createdMs || Number.isNaN(createdMs)) {
    createdMs = parsePickupTimeMs(order.time);
  }
  if (!createdMs || Number.isNaN(createdMs)) return "-";

  const d = new Date(createdMs + 8 * 3600000);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function formatSubmissionElapsedTime(order) {
  let createdMs = 0;
  if (order?.createdAt) {
    createdMs = typeof order.createdAt === "number" ? order.createdAt : new Date(String(order.createdAt).includes("Z") ? order.createdAt : order.createdAt + "Z").getTime();
  }
  if (!createdMs || Number.isNaN(createdMs)) {
    createdMs = parsePickupTimeMs(order?.time);
  }
  if (!createdMs || Number.isNaN(createdMs)) {
    return t("dineInElapsedJustNow");
  }

  const diffMs = Date.now() - createdMs;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin <= 0) {
    return t("dineInElapsedJustNow");
  }
  if (diffMin < 60) {
    return t("dineInElapsedMinutes", { min: diffMin });
  }
  if (diffMin < 1440) {
    const h = Math.floor(diffMin / 60);
    const m = diffMin % 60;
    return m > 0 ? t("dineInElapsedHours", { h, m }) : t("dineInElapsedHoursOnly", { h });
  }
  if (diffMin < 10080) {
    const d = Math.floor(diffMin / 1440);
    const h = Math.floor((diffMin % 1440) / 60);
    return (d < 2 && h > 0) ? t("dineInElapsedDaysHours", { d, h }) : t("dineInElapsedDays", { d });
  }
  const w = Math.floor(diffMin / 10080);
  return t("dineInElapsedWeeks", { w });
}

function formatDineInElapsedTime(order) {
  return formatSubmissionElapsedTime(order);
}

function formatDineInTimeDisplay(order) {
  return formatOrderSubmissionTime(order);
}

function shortItems(input, maybeOrder) {
  if (!input && !maybeOrder) return "";

  const order = (input && typeof input === 'object') ? input : (maybeOrder && typeof maybeOrder === 'object' ? maybeOrder : null);
  const rawContent = (typeof input === 'string') ? input : (order ? String(order.content || '') : '');

  const resolveVal = (val) => {
    if (!val || typeof val !== 'string') return '';
    const clean = val.replace(/^[↳\-+•*]\s*/, '').trim();
    if (typeof window !== 'undefined' && window.posOptionIdMap && window.posOptionIdMap.has(clean)) {
      return window.posOptionIdMap.get(clean);
    }
    return clean;
  };

  // 1. Structured items branch: if order has array of items
  if (order && Array.isArray(order.items) && order.items.length > 0) {
    const dishSummaries = [];
    order.items.forEach(it => {
      const name = (it.item_name || it.name || '').replace(/\$[\d,.]+/g, '').trim();
      if (!name) return;
      const qty = parseInt(it.quantity, 10) || 1;
      const optTexts = [];

      // Extract options from selected_options
      let opts = it.selected_options || it.options;
      if (typeof opts === 'string') {
        try { opts = JSON.parse(opts); } catch(e) {}
      }
      if (Array.isArray(opts)) {
        opts.forEach(o => {
          let choice = typeof o === 'string' ? o : (o.choice || o.name || '');
          if (choice) {
            choice = resolveVal(choice);
            if (choice && !optTexts.includes(choice)) optTexts.push(choice);
          }
        });
      } else if (typeof opts === 'string' && opts.trim()) {
        opts.split(/[、,\n]+/).forEach(s => {
          let choice = resolveVal(s);
          if (choice && !optTexts.includes(choice)) optTexts.push(choice);
        });
      }

      // Extract bundle selections if any
      if (it.bundle_snapshot_json || it.bundleSelections) {
        try {
          const bSnap = typeof it.bundle_snapshot_json === 'string' ? JSON.parse(it.bundle_snapshot_json) : (it.bundleSelections || null);
          if (bSnap && Array.isArray(bSnap.portions)) {
            bSnap.portions.forEach(p => (p.groups || []).forEach(g => (g.items || []).forEach(bi => {
              let bName = resolveVal(bi.name || bi.itemName);
              if (bName && !optTexts.includes(bName)) optTexts.push(bName);
            })));
          }
        } catch(e) {}
      }

      const optStr = optTexts.length > 0 ? ` (${optTexts.join('、')})` : '';
      dishSummaries.push(`${qty}份 x ${name}${optStr}`);
    });

    if (dishSummaries.length > 0) {
      return dishSummaries.join(' · ');
    }
  }

  // 2. Content text parsing branch: parse raw content lines
  if (!rawContent) return "";
  const lines = rawContent.split('\n').map(s => s.trim()).filter(Boolean);
  const dishes = [];
  let currentDish = null;

  const isMetadataHeader = (line) => {
    return /^(?:訂單編號|取餐時間|點餐時間|用餐方式|桌號|聯絡電話|備註|付款方式|總金額|總計|📍|📞|👤|📝|💰|🧂|📦|----\s*|====\s*)/.test(line) ||
           /^(?:客製化設定|客製設定|口味設定)[：:]/.test(line);
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isMetadataHeader(line)) continue;

    // Check if line is a dish item
    const dishMatch = line.match(/^(\d+)\s*(?:份|x|X)\s*(?:x\s*)?(.+)$/) || line.match(/^(.+?)\s*[xX*]\s*(\d+)$/);
    const isSubOption = line.startsWith('↳') || line.startsWith('-') || line.startsWith('+') || line.startsWith('•') || line.startsWith('*');

    if (dishMatch && !isSubOption) {
      const qty = parseInt(dishMatch[1] || dishMatch[2], 10) || 1;
      const name = (dishMatch[2] || dishMatch[1] || '').replace(/\$[\d,.]+/g, '').trim();
      currentDish = { qty, name, options: [] };
      dishes.push(currentDish);
      continue;
    }

    if (isSubOption && currentDish) {
      const optText = line.replace(/^[↳\-+•*]\s*/, '').trim();
      // Match portion prefix e.g. "第一份: yzs_fl_06, yzs_fl_06" or "飲料選擇 (二擇一): 綠茶 x1"
      const portionMatch = optText.match(/^(?:第[\d一二三四五六七八九十]+份|[^:：]+)[：:]\s*(.+)$/);
      const choicesStr = portionMatch ? portionMatch[1] : optText;

      const subTokens = choicesStr.split(/[、,，]+/).map(t => {
        const cleanTok = t.replace(/\s*\(\+?\$?\d+.*?\)/g, '').replace(/\s*x\s*\d+$/g, '').trim();
        return resolveVal(cleanTok);
      }).filter(Boolean);

      subTokens.forEach(tok => {
        if (!currentDish.options.includes(tok)) {
          currentDish.options.push(tok);
        }
      });
      continue;
    }
  }

  if (dishes.length > 0) {
    return dishes.map(d => `${d.qty}份 x ${d.name}${d.options.length > 0 ? ` (${d.options.join('、')})` : ''}`).join(' · ');
  }

  // Fallback: take up to 6 non-metadata lines, resolving any option IDs
  const cleanLines = lines.filter(l => !isMetadataHeader(l)).map(l => resolveVal(l));
  return cleanLines.slice(0, 6).join(' · ');
}

function countItemsFromContent(content) {
  if (!content) return 0;
  const lines = String(content).split("\n").map(s => s.trim()).filter(Boolean);
  let total = 0;
  for (const line of lines) {
    // Match "1份 x 商品名" or "2份x商品名"
    const m = line.match(/^(\d+)\s*份\s*[xX×]\s*.+/);
    if (m) total += parseInt(m[1], 10);
  }
  return total;
}

function formatPickupTimeDisplay(timeStr, fallbackCreatedAt, orderContent) {
  let clean = timeStr ? String(timeStr).replace(/\s*\([^)]*\)/g, '').trim() : "";
  
  // If clean is empty, "-" or "Unknown", try extracting from orderContent
  if ((!clean || clean === "Unknown" || clean === "-") && orderContent) {
    const match = String(orderContent).match(/(?:取餐時間|訂餐時間|點餐時間)[：:]\s*([^\n\r]+)/);
    if (match && match[1]) {
      clean = match[1].replace(/\s*\([^)]*\)/g, '').trim();
    }
  }

  // If still empty or "Unknown", fallback to createdAt
  if (!clean || clean === "Unknown" || clean === "-") {
    if (fallbackCreatedAt) {
      const dt = typeof fallbackCreatedAt === "number" ? fallbackCreatedAt : new Date(String(fallbackCreatedAt).endsWith("Z") ? fallbackCreatedAt : fallbackCreatedAt + "Z").getTime();
      if (!Number.isNaN(dt) && dt > 0) {
        const d = new Date(dt + 8 * 3600000);
        const yyyy = d.getUTCFullYear();
        const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
        const dd = String(d.getUTCDate()).padStart(2, "0");
        const hh = String(d.getUTCHours()).padStart(2, "0");
        const min = String(d.getUTCMinutes()).padStart(2, "0");

        const today = new Date();
        const twDate = new Date(today.getTime() + 8 * 3600000);
        const twY = twDate.getUTCFullYear();
        const twM = String(twDate.getUTCMonth() + 1).padStart(2, "0");
        const twD = String(twDate.getUTCDate()).padStart(2, "0");

        if (`${yyyy}-${mm}-${dd}` === `${twY}-${twM}-${twD}`) {
          return `${hh}:${min}`;
        } else {
          return `${mm}/${dd} ${hh}:${min}`;
        }
      }
    }
    return "-";
  }
  
  // If format is "YYYY-MM-DD HH:mm", check if YYYY-MM-DD is today in Taiwan time
  const m = clean.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}:\d{2})$/);
  if (m) {
    const today = new Date();
    const twDate = new Date(today.getTime() + 8 * 3600000);
    const twY = twDate.getUTCFullYear();
    const twM = String(twDate.getUTCMonth() + 1).padStart(2, "0");
    const twD = String(twDate.getUTCDate()).padStart(2, "0");
    const datePart = `${m[1]}-${m[2]}-${m[3]}`;
    const todayPart = `${twY}-${twM}-${twD}`;
    
    if (datePart === todayPart) {
      return m[4];
    } else {
      return `${m[2]}/${m[3]} ${m[4]}`;
    }
  }
  return clean;
}

function formatOrderTotal(order) {
  if (order?.total !== undefined && order?.total !== null && !isNaN(order.total) && Number(order.total) > 0) {
    return `$${Number(order.total).toLocaleString()}`;
  }
  if (order?.content) {
    const match = String(order.content).match(/💰\s*總金額[：:]\s*\$?(\d+)/) || String(order.content).match(/Tổng\s*(?:tiền)?[：:]\s*(\d+)/i);
    if (match) {
      return `$${Number(match[1]).toLocaleString()}`;
    }
  }
  return order?.total !== undefined && order?.total !== null && order?.total !== "" ? `$${order.total}` : "-";
}

function parsePortionCustomizations(rawOpts) {
  if (!rawOpts) return null;
  const str = String(rawOpts).trim();
  if (!/(?:第\s*[一二三四五六七八九十\d]+\s*份|Phần\s*\d+)/i.test(str)) {
    return null;
  }

  const regex = /(?:^|[、\n])\s*(第\s*[一二三四五六七八九十\d]+\s*份|Phần\s*\d+)[:：\s]?\s*/gi;
  const matches = [];
  let m;
  while ((m = regex.exec(str)) !== null) {
    matches.push({
      index: m.index,
      matchLength: m[0].length,
      label: m[1].replace(/\s+/g, '')
    });
  }

  if (matches.length === 0) return null;

  let commonChips = [];
  if (matches[0].index > 0) {
    const preContent = str.substring(0, matches[0].index).trim();
    if (preContent) {
      const raw = preContent.split(/[、,，\n]+/).map(s => s.trim()).filter(Boolean);
      commonChips = [...new Set(raw.map(c => (window.posOptionIdMap && window.posOptionIdMap.has(c)) ? window.posOptionIdMap.get(c) : c))];
    }
  }

  const portions = [];
  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i];
    const contentStart = cur.index + cur.matchLength;
    const nextIndex = (i + 1 < matches.length) ? matches[i + 1].index : str.length;
    const rawContent = str.substring(contentStart, nextIndex).trim();
    const rawChips = rawContent.split(/[、,，\n]+/).map(s => s.trim()).filter(Boolean);
    const resolvedChips = rawChips.map(c => (window.posOptionIdMap && window.posOptionIdMap.has(c)) ? window.posOptionIdMap.get(c) : c);
    const chips = [...new Set(resolvedChips)];
    portions.push({
      label: cur.label,
      chips: chips
    });
  }

  return portions.length > 0 ? { commonChips, portions } : null;
}
window.parsePortionCustomizations = parsePortionCustomizations;

function isDineInSupported() {
  const hasFeature = Array.isArray(window.currentTenantFeatures)
    ? window.currentTenantFeatures.includes('dine_in')
    : false;
  const isAllowed = window.allowDineIn !== false;
  return hasFeature && isAllowed;
}
window.isDineInSupported = isDineInSupported;

function switchTab(tab) {
  if (activeTab === "menu" && tab !== "menu" && typeof confirmLeaveMenu === "function" && !confirmLeaveMenu()) {
    try {
      if (typeof window !== "undefined" && window.location && (window.location.hash || "") !== "#menu") {
        const revertUrl = new URL(window.location.href);
        revertUrl.hash = "menu";
        window.history.replaceState(null, "", revertUrl.toString());
      }
    } catch (e) {}
    return;
  }
  if (tab === "reports" && isNativeAppPlatform()) {
    tab = "live";
  }
  if (window.innerWidth <= 680 && typeof toggleSidebar === "function") {
    toggleSidebar(false);
  }
  if (activeTab === "settings" && tab !== "settings" && typeof resetStorePinChangeForm === "function") {
    resetStorePinChangeForm();
  }
  activeTab = tab;

  // Persist active tab to sessionStorage and URL hash (without creating redundant history entries)
  try {
    sessionStorage.setItem("pos_active_tab", tab);
    if (typeof window !== "undefined" && window.location) {
      const currentHash = (window.location.hash || "").replace(/^#/, "").trim().toLowerCase();
      const targetHash = tab === "live" ? "" : tab;
      if (currentHash !== targetHash) {
        const newUrl = new URL(window.location.href);
        newUrl.hash = targetHash;
        window.history.replaceState(null, "", newUrl.toString());
      }
    }
  } catch (e) {}

  const tabLive = document.getElementById("tab-live");
  const tabHistory = document.getElementById("tab-history");
  const tabReports = document.getElementById("tab-reports");
  const tabMenu = document.getElementById("tab-menu");
  const tabSettings = document.getElementById("tab-settings");
  const tabStaffOrder = document.getElementById("tab-staff-order");

  if (tabLive) tabLive.classList.toggle("active", tab === "live");
  if (tabHistory) tabHistory.classList.toggle("active", tab === "history");
  if (tabReports) tabReports.classList.toggle("active", tab === "reports");
  if (tabMenu) tabMenu.classList.toggle("active", tab === "menu");
  if (tabSettings) tabSettings.classList.toggle("active", tab === "settings");
  if (tabStaffOrder) tabStaffOrder.classList.toggle("active", tab === "staff-order");

  document.querySelectorAll(".mini-btn").forEach(t => t.classList.remove("active"));

  if (typeof updateSidebarActive === "function") {
    updateSidebarActive(tab);
  }

  const viewLive = document.getElementById("view-live");
  const viewHistory = document.getElementById("view-history");
  const viewReports = document.getElementById("view-reports");
  const viewSettings = document.getElementById("view-settings");
  const viewMenu = document.getElementById("view-menu");
  const viewStaffOrder = document.getElementById("view-staff-order");

  if (viewLive) viewLive.style.display = tab === "live" ? "flex" : "none";
  if (viewHistory) viewHistory.style.display = tab === "history" ? "block" : "none";
  if (viewReports) viewReports.style.display = tab === "reports" ? "block" : "none";
  if (viewSettings) viewSettings.style.display = tab === "settings" ? "block" : "none";
  if (viewMenu) viewMenu.style.display = tab === "menu" ? "block" : "none";
  if (viewStaffOrder) viewStaffOrder.style.display = tab === "staff-order" ? "block" : "none";
  const viewPayments = document.getElementById("view-payments");
  if (viewPayments) viewPayments.style.display = tab === "payments" ? "block" : "none";
  if (window.PaymentPOS && typeof PaymentPOS.onTabChange === "function") PaymentPOS.onTabChange(tab);

  syncStoreStatusPlacement(tab);

  if (typeof syncLiveMobileView === "function") syncLiveMobileView();

  if (tab === "live") {
    renderAll();
  } else if (tab === "history") {
    if (typeof updateHistoryFilterVisibility === "function") {
      updateHistoryFilterVisibility();
    }
    if (typeof fetchHistoryOrders === "function") {
      fetchHistoryOrders();
    } else if (typeof renderHistory === "function") {
      renderHistory(typeof lastHistoryOrders !== "undefined" ? lastHistoryOrders : []);
    }
  } else if (tab === "reports") {
    if (typeof fetchReportData === "function") {
      fetchReportData(typeof currentReportRange !== "undefined" ? currentReportRange : "today");
    }
  } else if (tab === "menu") {
    if (typeof openMenuSettings === "function") {
      openMenuSettings();
    }
  } else if (tab === "settings") {
    if (typeof openSettings === "function") {
      openSettings();
    }
  } else if (tab === "staff-order") {
    if (typeof initStaffOrderFrame === "function") {
      initStaffOrderFrame();
    }
  }
}
window.switchTab = switchTab;

if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  window.addEventListener("hashchange", () => {
    try {
      const rawHash = (window.location.hash || "").replace(/^#/, "").trim().toLowerCase();
      const targetTab = (typeof VALID_POS_TABS !== "undefined" && VALID_POS_TABS.includes(rawHash)) ? rawHash : "live";
      if (targetTab !== activeTab && typeof switchTab === "function") {
        switchTab(targetTab);
      }
    } catch (e) {}
  });
}

function initStaffOrderFrame() {
  const frame = document.getElementById("staff-order-iframe");
  if (!frame) return;
  const tenantId = (typeof getTenantIdFromUrl === "function" && getTenantIdFromUrl()) || "";
  if (!tenantId) return;

  const currentSrc = frame.getAttribute("src") || "";
  if (!currentSrc || currentSrc === "about:blank") {
    const environment = (typeof WORKER_BASE !== "undefined" && WORKER_BASE.includes("-staging."))
      ? "staging"
      : (typeof WORKER_BASE !== "undefined" && WORKER_BASE.includes("-dev."))
        ? "dev"
        : "prod";
    frame.src = `staff-order.html?tenant_id=${encodeURIComponent(tenantId)}&env=${environment}&embedded=1`;
  }
}
window.initStaffOrderFrame = initStaffOrderFrame;

if (typeof window !== "undefined" && !window.__staffOrderMessageListenerBound) {
  window.__staffOrderMessageListenerBound = true;
  window.addEventListener("message", (event) => {
    if (!event || !event.data) return;
    const data = event.data;
    if (data.type === "SWITCH_POS_TAB" && data.tab) {
      if (typeof switchTab === "function") {
        switchTab(data.tab);
      }
    } else if (data.type === "STAFF_ORDER_SUBMITTED") {
      if (typeof fetchOrders === "function") {
        fetchOrders();
      }
      if (typeof showToast === "function") {
        const isTakeaway = data.diningOption === "takeaway";
        const toastKey = isTakeaway ? "staffTakeawayOrderSubmittedToast" : "staffOrderSubmittedToast";
        const fallback = isTakeaway
          ? `Đơn mang đi đã gửi thành công! ${OrderCode.format(data.displayKey || "")}`
          : `Bàn đã gửi đơn thành công! ${OrderCode.format(data.displayKey || "")}`;
        const msg = (typeof t === "function" && t(toastKey, { key: OrderCode.format(data.displayKey || "") })) || fallback;
        showToast(msg, "success");
      }
    }
  });
}

let isFetchingOrders = false;

async function fetchOrders() {
  if (isFetchingOrders) return;
  isFetchingOrders = true;

  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), 8000) : null;

  try {
    const tenantId = getTenantIdFromUrl();
    if (!tenantId) return;
    const headers = { "X-Tenant-ID": tenantId };
    if (lastOrdersETag) {
      headers["If-None-Match"] = lastOrdersETag;
    }

    const fetchOptions = { headers };
    if (controller) {
      fetchOptions.signal = controller.signal;
    }

    const response = await fetch(`${WORKER_BASE}/api/orders?tenant_id=${tenantId}`, fetchOptions);
    if (response.status === 304) {
      // Even on 304, re-check snooze expiration for new alert
      if (typeof updateNewAlert === "function") updateNewAlert();
      return;
    }
    if (!response.ok) throw new Error(`fetch failed: ${response.status}`);

    const etag = response.headers.get("ETag");
    if (etag) lastOrdersETag = etag;

    let orders = await response.json();
    if (!Array.isArray(orders)) orders = [];

    // Deduplicate
    const uniqueMap = new Map();
    orders.forEach(o => { if (o?.key) uniqueMap.set(o.key, o); });
    latestOrders = Array.from(uniqueMap.values());

    // New arrivals => sound
    const newArrivals = latestOrders.filter(o => o && o.key && !knownOrderKeys.has(o.key));
    newArrivals.forEach(o => { if (o?.key) knownOrderKeys.add(o.key); });

    // Track round count increases on existing orders (Appended rounds)
    let hasNewlyAppendedRound = false;
    const newlyAppendedOrders = [];
    latestOrders.forEach(o => {
      if (o?.key) {
        const currentRound = Number(o.round_count || o.roundCount) || 1;
        if (!isFirstLoad && knownOrderRounds.has(o.key)) {
          const prevRound = knownOrderRounds.get(o.key);
          if (currentRound > prevRound) {
            hasNewlyAppendedRound = true;
            newlyAppendedOrders.push({ order: o, fromRound: prevRound + 1, toRound: currentRound });
            if (typeof localOverrides !== "undefined" && localOverrides[o.key]) {
              delete localOverrides[o.key];
            }
            if (typeof snoozedNewOrderKeys !== "undefined") {
              snoozedNewOrderKeys.delete(o.key);
            }
            if (typeof newAlertSnoozeUntilMs !== "undefined") {
              newAlertSnoozeUntilMs = 0;
            }
            unacknowledgedAppends.set(o.key, {
              key: o.key,
              round: currentRound,
              tableNumber: o.table_number || o.tableNumber || "",
              customer: o.customer_name || o.customer || "",
              time: Date.now()
            });
          }
        }
        knownOrderRounds.set(o.key, currentRound);
      }
    });

    // Track newly modified orders (customer changed sold-out items -> back to NEW)
    let hasNewlyModifiedOrder = false;
    latestOrders.forEach(o => {
      if (o?.key) {
        const isMod = !!(o.is_modified || o.isModified);
        if (!isFirstLoad && isMod && !knownOrderModified.has(o.key)) {
          hasNewlyModifiedOrder = true;
          if (typeof localOverrides !== "undefined" && localOverrides[o.key]) {
            delete localOverrides[o.key];
          }
          if (typeof snoozedNewOrderKeys !== "undefined") {
            snoozedNewOrderKeys.delete(o.key);
          }
          if (typeof newAlertSnoozeUntilMs !== "undefined") {
            newAlertSnoozeUntilMs = 0;
          }
        }
        if (isMod) {
          knownOrderModified.add(o.key);
        }
      }
    });

    // Check for new staff arrivals (which arrive directly as ACCEPTED)
    if (latestOrders.some(o=>o.source === "staff") && typeof checkStaffOrderingCapability === "function") await checkStaffOrderingCapability();
    const newStaffArrivals = newArrivals.filter(o => o && o.source === "staff" && o.status === "ACCEPTED");
    const hasNewStaffOrders = !isFirstLoad && newStaffArrivals.length > 0;

    // NEW orders, newly appended rounds, modified orders => alert sound (Staff orders are accepted and do NOT alarm)
    pendingNewOrders = latestOrders.filter(o => o && o.status === "NEW").slice().sort(sortByPickupTimeAsc);
    if (!isFirstLoad && ((newArrivals.length > 0 && pendingNewOrders.length > 0) || hasNewlyAppendedRound || hasNewlyModifiedOrder || unacknowledgedAppends.size > 0)) {
      if (typeof startContinuousAlarm === "function") startContinuousAlarm();
    }

    // Staff submissions are already confirmed; customer printing starts in updateStatus after acceptance.
    if (typeof PrinterService !== "undefined") {
      if (newStaffArrivals.length > 0) {
        PrinterService.handleIncomingOrders(newStaffArrivals);
      }
      if (newlyAppendedOrders.length > 0 && typeof PrinterService.handleAppendedRounds === "function") {
        PrinterService.handleAppendedRounds(newlyAppendedOrders);
      }
    }

    isFirstLoad = false;
    if (typeof updateNewAlert === "function") updateNewAlert();

    renderAll();
  } catch (e) {
    if (e.name === "AbortError") {
      console.warn("[Orders] fetchOrders timed out after 8s, releasing mutex for next cycle.");
      return;
    }
    console.error(e);
    const leftEl = document.getElementById("list-left");
    if (leftEl) leftEl.innerHTML = `<div style="text-align:center; padding: 22px; color:#d32f2f;">${escapeHtml(e?.message || e)}</div>`;
    const rightEl = document.getElementById("list-right");
    if (rightEl) rightEl.innerHTML = `<div style="text-align:center; padding: 22px; color:#d32f2f;">-</div>`;
    const histEl = document.getElementById("list-history");
    if (histEl) histEl.innerHTML = `<div style="text-align:center; padding: 22px; color:#d32f2f;">-</div>`;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    isFetchingOrders = false;
  }
}

function renderAll() {
  if (!Array.isArray(latestOrders)) return;

  // Filter/Apply local overrides (ignore server data if override is < 15s old)
  const now = Date.now();
  const currentOrders = latestOrders.map(o => {
    const override = localOverrides[o.key];
    if (override && (now - override.time < 15000)) {
      return { ...o, status: override.status };
    }
    if (override && (now - override.time >= 15000)) {
      delete localOverrides[o.key];
    }
    return o;
  });

  const leftOrders = currentOrders
    .filter(o => o && (o.status === "NEW" || o.status === "ACCEPTED" || o.status === "WAITING_CUSTOMER_CHANGE" || o.status === "WAITING_CUSTOMER_REJECT"))
    .slice()
    .sort(sortByPickupTimeAsc);

  const rightOrders = currentOrders
    .filter(o => o && o.status === "DONE")
    .slice()
    .sort(sortByPickupTimeAsc);

  const historyOrders = currentOrders
    .filter(o => o && ["PICKED_UP", "REJECTED", "PAID"].includes(o.status))
    .slice()
    .sort((a, b) => (b?.createdAt || 0) - (a?.createdAt || 0));

  const cLeft = document.getElementById("count-left");
  if (cLeft) cLeft.innerText = String(leftOrders.length);
  const cRight = document.getElementById("count-right");
  if (cRight) cRight.innerText = String(rightOrders.length);
  const mobileLeft = document.getElementById("live-mobile-count-pending");
  if (mobileLeft) mobileLeft.innerText = String(leftOrders.length);
  const mobileRight = document.getElementById("live-mobile-count-ready");
  if (mobileRight) mobileRight.innerText = String(rightOrders.length);

  const sidebarLiveBadge = document.getElementById("sidebar-live-count");
  if (sidebarLiveBadge) {
    const totalLive = leftOrders.length + rightOrders.length;
    if (totalLive > 0) {
      sidebarLiveBadge.innerText = String(totalLive);
      sidebarLiveBadge.style.display = "inline-flex";
    } else {
      sidebarLiveBadge.style.display = "none";
    }
  }

  if (typeof updateDiningFilterStats === "function") {
    updateDiningFilterStats(leftOrders.concat(rightOrders));
  }

  if (activeTab === "live") {
    const preserveMobileScroll = typeof isLiveMobilePortrait === "function" && isLiveMobilePortrait();
    if (preserveMobileScroll) captureLiveScrollPositions();
    if (typeof renderListLeft === "function") renderListLeft(leftOrders);
    if (typeof renderListRight === "function") renderListRight(rightOrders);
    if (preserveMobileScroll) restoreLiveScrollPositions();
  } else if (activeTab === "history") {
    if (typeof lastHistoryOrders !== "undefined" && Array.isArray(lastHistoryOrders) && lastHistoryOrders.length > 0) {
      const existingKeys = new Set(lastHistoryOrders.map(o => o.key));
      historyOrders.forEach(o => {
        if (o && o.key && !existingKeys.has(o.key)) {
          lastHistoryOrders.unshift(o);
          existingKeys.add(o.key);
        }
      });
      if (typeof renderHistory === "function") renderHistory(lastHistoryOrders);
    } else if (typeof fetchHistoryOrders === "function") {
      fetchHistoryOrders();
    } else if (typeof renderHistory === "function") {
      renderHistory(historyOrders);
    }
  }

  // Keep open Order Detail modal countdown updated dynamically
  const revModal = document.getElementById("reviewModal");
  if (revModal && revModal.style.display !== "none" && typeof reviewingOrder !== "undefined" && reviewingOrder) {
    const updatedReviewOrder = (latestOrders && latestOrders.find(o => o && o.key === reviewingOrder.key)) || reviewingOrder;
    if (typeof updateReviewModalEta === "function") {
      updateReviewModalEta(updatedReviewOrder);
    }
  }
}

function copyToClipboard(text, msgZh, msgVi) {
  navigator.clipboard.writeText(text).then(() => {
    alert(currentLang === 'vi' ? msgVi : msgZh);
  }).catch(() => {
    alert(text);
  });
}

function closeModal() {
  document.querySelectorAll(".modal").forEach(m => {
    if (m.id !== "startShiftModal") {
      m.style.display = "none";
    }
  });
  reviewingOrder = null;
  currentOrderKey = null;
  if (typeof updateNewAlert === "function") updateNewAlert();
}

window.getTenantIdFromUrl = getTenantIdFromUrl;
window.applyTenantBranding = applyTenantBranding;
window.escapeHtml = escapeHtml;
window.parsePickupTimeMs = parsePickupTimeMs;
window.formatOrderTotal = formatOrderTotal;
window.getOrderEffectiveDineInTimeMs = getOrderEffectiveDineInTimeMs;
window.sortByPickupTimeAsc = sortByPickupTimeAsc;
window.formatEta = formatEta;
window.isOrderElapsedMode = isOrderElapsedMode;
window.formatOrderSubmissionTime = formatOrderSubmissionTime;
window.formatSubmissionElapsedTime = formatSubmissionElapsedTime;
window.formatDineInElapsedTime = formatDineInElapsedTime;
window.formatDineInTimeDisplay = formatDineInTimeDisplay;
window.shortItems = shortItems;
window.countItemsFromContent = countItemsFromContent;
window.formatPickupTimeDisplay = formatPickupTimeDisplay;
window.fetchOrders = fetchOrders;
window.renderAll = renderAll;
window.copyToClipboard = copyToClipboard;
window.closeModal = closeModal;



// ==========================================
// Vertical Sidebar Management (Uber Eats Tablet-First / Mobile Off-Canvas Drawer)
// ==========================================
function toggleSidebar(forceState) {
  const sidebar = document.getElementById("app-sidebar");
  if (!sidebar) return;
  const isExpanded = forceState !== undefined ? forceState : !sidebar.classList.contains("expanded");
  sidebar.classList.toggle("expanded", isExpanded);

  // Mobile drawer backdrop synchronization
  const backdrop = document.getElementById("sidebar-backdrop");
  if (backdrop) {
    backdrop.classList.toggle("active", isExpanded);
  }

  updateSidebarToggleIcon(isExpanded);

  // Tablet & Desktop: persist user preference to localStorage
  if (window.innerWidth > 680) {
    try {
      localStorage.setItem("pos_sidebar_expanded", isExpanded ? "1" : "0");
    } catch (e) {}
  }
}

function updateSidebarToggleIcon(isExpanded) {
  const button = document.getElementById("sidebar-toggle-btn");
  if (!button) return;
  const icon = button.querySelector(".sidebar-toggle-icon");
  const isMobile = window.innerWidth <= 680;
  if (icon) {
    if (isMobile) {
      // Mobile drawer inside header shows (X) close icon when opened
      icon.innerHTML = isExpanded
        ? '<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>'
        : '<line x1="4" x2="20" y1="12" y2="12"></line><line x1="4" x2="20" y1="6" y2="6"></line><line x1="4" x2="20" y1="18" y2="18"></line>';
    } else {
      icon.innerHTML = isExpanded
        ? '<polyline points="15 18 9 12 15 6"></polyline>'
        : '<line x1="4" x2="20" y1="12" y2="12"></line><line x1="4" x2="20" y1="6" y2="6"></line><line x1="4" x2="20" y1="18" y2="18"></line>';
    }
  }
  const isVietnamese = typeof currentLang !== "undefined" && currentLang === "vi";
  const label = isExpanded
    ? (isVietnamese ? (isMobile ? "Đóng menu" : "Thu gọn thanh bên") : (isMobile ? "關閉選單" : "收合側邊欄"))
    : (isVietnamese ? "Mở rộng thanh bên" : "展開側邊欄");
  button.setAttribute("aria-label", label);
  button.title = label;
}

function initSidebarState() {
  const sidebar = document.getElementById("app-sidebar");
  if (!sidebar) return;
  let isExpanded = false;
  if (window.innerWidth > 680) {
    try {
      const saved = localStorage.getItem("pos_sidebar_expanded");
      isExpanded = saved === "1";
    } catch (e) {}
  } else {
    // Mobile always starts collapsed / closed off-canvas
    isExpanded = false;
  }
  sidebar.classList.toggle("expanded", isExpanded);
  const backdrop = document.getElementById("sidebar-backdrop");
  if (backdrop) backdrop.classList.remove("active");
  updateSidebarToggleIcon(isExpanded);
  initMobileBrandInfo();
}

function initMobileBrandInfo() {
  const bTitle = document.getElementById("brand-title");
  const mTitle = document.getElementById("sidebar-mobile-title");
  const mLogo = document.getElementById("sidebar-mobile-logo");
  const bLogo = document.getElementById("brand-logo");

  const brandName = (bTitle && bTitle.innerText.trim()) || "Blab POS";
  if (mTitle) {
    mTitle.innerText = brandName;
  }
  if (mLogo) {
    if (bLogo && bLogo.src && bLogo.style.display !== "none") {
      mLogo.innerHTML = `<img src="${bLogo.src}" alt="Logo" style="width:100%;height:100%;object-fit:cover;border-radius:10px;">`;
    } else {
      const initial = brandName.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '').charAt(0) || "B";
      mLogo.textContent = initial.toUpperCase();
    }
  }
}

// Window resize & accessibility handlers for mobile drawer
window.addEventListener("resize", () => {
  if (window.innerWidth <= 680) {
    const backdrop = document.getElementById("sidebar-backdrop");
    const sidebar = document.getElementById("app-sidebar");
    if (sidebar && !backdrop?.classList.contains("active") && sidebar.classList.contains("expanded")) {
      sidebar.classList.remove("expanded");
      updateSidebarToggleIcon(false);
    }
  } else {
    const backdrop = document.getElementById("sidebar-backdrop");
    if (backdrop) backdrop.classList.remove("active");
    try {
      const saved = localStorage.getItem("pos_sidebar_expanded");
      const isExpanded = saved === "1";
      const sidebar = document.getElementById("app-sidebar");
      if (sidebar) sidebar.classList.toggle("expanded", isExpanded);
      updateSidebarToggleIcon(isExpanded);
    } catch (e) {}
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && window.innerWidth <= 680) {
    const sidebar = document.getElementById("app-sidebar");
    if (sidebar && sidebar.classList.contains("expanded")) {
      toggleSidebar(false);
    }
  }
});

function updateSidebarActive(tabName) {
  const navItems = document.querySelectorAll(".sidebar-nav-item");
  navItems.forEach(item => {
    const itemTab = item.getAttribute("data-tab");
    item.classList.toggle("active", itemTab === tabName);
  });
  updatePageMainTitle(tabName);
  if (typeof showMainTopbar === "function") showMainTopbar();
}

function updatePageMainTitle(tabName) {
  const titleEl = document.getElementById("page-main-title");
  if (!titleEl) return;
  const currentLangCode = (typeof currentLang !== "undefined" ? currentLang : "zh-TW");
  const titles = {
    "live": currentLangCode === "vi" ? "Đơn hàng" : "訂單",
    "history": currentLangCode === "vi" ? "Lịch sử đơn" : "歷史訂單",
    "payments": typeof t === "function" ? t("paymentWorkspace") : (currentLangCode === "vi" ? "Thanh toán" : "付款管理"),
    "menu": currentLangCode === "vi" ? "Quản lý thực đơn" : "菜單管理",
    "settings": currentLangCode === "vi" ? "Cài đặt hệ thống" : "系統設定",
    "reports": currentLangCode === "vi" ? "Báo cáo doanh thu" : "營業報表",
    "staff-order": currentLangCode === "vi" ? "Nhận đơn tại bàn" : "桌邊點餐"
  };
  titleEl.textContent = titles[tabName] || (currentLangCode === "vi" ? "Đơn hàng" : "訂單");

  const brandBadge = document.getElementById("brand-badge-pill");
  if (brandBadge) {
    brandBadge.style.display = (tabName === "menu") ? "none" : "";
  }
}

// ==========================================
// Keep the main header visible without changing scroll-container geometry.
// Retain the initializer used by orders.html, but do not attach scroll handlers.
// ==========================================
function initSmartHeaderScroll() {
  const mainTopbar = document.getElementById("main-topbar");
  if (mainTopbar) mainTopbar.classList.remove("topbar-hidden");
}

window.initSmartHeaderScroll = initSmartHeaderScroll;

function syncStoreStatusPlacement(tab) {
  const dd = document.getElementById("store-status-dropdown");
  const isMenu = (tab === "menu");
  document.body.classList.toggle("is-menu-active", isMenu);
  document.body.classList.toggle("is-staff-order-active", tab === "staff-order");
  const mainTopbar = document.getElementById("main-topbar");
  if (mainTopbar) {
    mainTopbar.style.display = isMenu ? "none" : "";
  }
  if (!dd) return;
  if (isMenu) {
    const target = document.getElementById("menu-workspace-store-slot");
    if (target && dd.parentElement !== target) {
      target.appendChild(dd);
    }
  } else {
    const target = document.getElementById("main-topbar-right-slot") || document.querySelector(".main-topbar-right");
    if (target && dd.parentElement !== target) {
      target.appendChild(dd);
    }
  }
}

let _posToastTimer = null;
function showToast(message, type = "info") {
  if (!message || typeof document === "undefined" || !document.body || typeof document.createElement !== "function") return;
  let toastEl = typeof document.getElementById === "function" ? document.getElementById("pos-global-toast") : null;
  if (!toastEl) {
    toastEl = document.createElement("div");
    toastEl.id = "pos-global-toast";
    toastEl.setAttribute("role", "status");
    toastEl.setAttribute("aria-live", "polite");
    if (toastEl.style) {
      toastEl.style.cssText = "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:99999;max-width:min(92vw,520px);padding:12px 18px;border-radius:10px;background:#0f172a;color:#ffffff;font-size:15px;font-weight:700;line-height:1.4;box-shadow:0 10px 25px rgba(15,23,42,0.28);pointer-events:none;transition:opacity 0.2s ease;opacity:0;text-align:center;";
    }
    if (typeof document.body.appendChild === "function") {
      document.body.appendChild(toastEl);
    }
  }
  const text = String(message);
  toastEl.textContent = text;
  if (toastEl.style) {
    if (type === "error" || text.startsWith("❌")) {
      toastEl.style.background = "#dc2626";
    } else if (type === "warning" || text.startsWith("⚠️")) {
      toastEl.style.background = "#d97706";
    } else if (type === "success" || text.startsWith("✅")) {
      toastEl.style.background = "#059669";
    } else {
      toastEl.style.background = "#0f172a";
    }
    toastEl.style.display = "block";
    toastEl.style.opacity = "1";
  }
  if (_posToastTimer) clearTimeout(_posToastTimer);
  _posToastTimer = setTimeout(() => {
    if (toastEl && toastEl.style) {
      toastEl.style.opacity = "0";
      setTimeout(() => {
        if (toastEl && toastEl.style && toastEl.style.opacity === "0") {
          toastEl.style.display = "none";
        }
      }, 220);
    }
  }, 3200);
}

window.showToast = showToast;
window.syncStoreStatusPlacement = syncStoreStatusPlacement;
window.toggleSidebar = toggleSidebar;
window.initSidebarState = initSidebarState;
window.initMobileBrandInfo = initMobileBrandInfo;
window.updateSidebarActive = updateSidebarActive;
window.updatePageMainTitle = updatePageMainTitle;



// 1.5s Polling loop for active order updates - ALWAYS runs across all dashboard tabs!
setInterval(() => {
  fetchOrders();
}, 1500);

// Dynamic 10s timer to automatically refresh ETA time countdowns
setInterval(() => {
  if (activeTab === "live" || activeTab === "history") renderAll();
}, 10000);

// 1s timer to ensure new alert and alarms are evaluated without delay
setInterval(() => {
  if (typeof updateNewAlert === "function") updateNewAlert();
}, 1000);
