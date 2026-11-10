# Inline nested option UI

Branch: codex/inline-nested-options. Worktree: /private/tmp/benmi-inline-options-20261106. Base: deployed frontend 289a04c3 (independent of customer history/reorder work).

Order-wide children stay inside their selected parent row, before the next primary choice. Canonical item sub-options render immediately below their own single/multiple parent choices, rather than at the group footer. Nested groups stack primary choices vertically and show compact two-column child choices with 48px targets. Flat groups retain their existing layout.

Preview uses actual read-only Jiangjiejie bootstrap data for the reported order-wide group, plus a synthetic canonical item fixture. All browser traffic was intercepted locally, LINE login simulated and all writes blocked. Production was not modified.

Validation: npm run check passed; 12 existing target tests passed; 6 browser checks passed in each of Chromium and WebKit, with zero browser errors or write attempts. Includes 320/390/768px order-wide geometry and item single/multiple child identity and price preservation. Graphify refreshed.

Screenshots:
- order-options-chromium-390.png: the reported real group, middle choice expanded before the next parent.
- item-options-viewport-chromium-390.png: canonical item popup with children attached to their own parents.
- Corresponding WebKit and 320/768px screenshots are included.
