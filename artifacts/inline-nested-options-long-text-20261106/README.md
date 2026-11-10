# Long option label verification

Branch: codex/inline-nested-options. Worktree: /private/tmp/benmi-inline-options-20261106. Follow-up to eaee068f.

The previous preview covered short names. The before run reproduced row stretching and overflow: short options were stretched to 105–117px by a long sibling; unbroken parent text overflowed the item popup.

Child options now wrap intrinsically: short choices remain compact, long choices use available row width, sibling cards retain their natural height. Labels are fully shown, with checkbox/name/price in separate stable positions.

64 UI cases passed across Chromium and WebKit, widths 320/375/390/768: short CJK, long CJK, unbroken Latin, mixed-language text and surcharges. Both order-wide and item choices are covered. All source checks and 12 existing selection/price tests passed. Original short-name selection and checkout scenarios also passed on both browsers.

At 390px, the formerly stretched short options measure 48px; the long order child measures 57px and the long item child with price measures 81px. Original IDs, selection and pricing are preserved.

Only synthetic local fixtures and intercepted browser requests were used. No production deployment or database write. Before/after JSON measurements and PNGs are included.
