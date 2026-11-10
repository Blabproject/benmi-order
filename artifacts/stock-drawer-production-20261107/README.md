# Stock drawer production release

Production deployment: a7a427b3-d0f1-4a9a-bd75-f4fd615a61c0. Source commit: 3fd153728816f05e3f9a830ea826eea4a36ed8ce, branch codex/stock-drawer-production.

Published only the stock drawer changes to orders.html, js/orders-menu.js and js/orders-i18n.js, plus css/orders-stock.css and release metadata. Production was based on deployment 53496c31-54fd-4d51-89dc-12034bbaaa52; 80 other files and all 23 downloadable APKs were preserved. The existing Pages middleware source was bundled with Cloudflare's Pages runtime for the Direct Upload API. The backend was not deployed.

Validation: 35/35 release suites passed; exact release source stock integration tests passed with real local D1; 9 compiled middleware routing cases passed; 13 live asset/domain reads matched the payload; APK download hash matched; backend health commit stayed 1c334b78f9632e4edd76931352454e2afe067e5d. Live downloaded UI component tests passed on Chromium and WebKit across phone/tablet layouts and both languages. Those browser tests mocked stock writes and did not modify production menu data.

Rollback target: 53496c31-54fd-4d51-89dc-12034bbaaa52. The user's main checkout and unrelated working changes were preserved.
