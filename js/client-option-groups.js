/* Canonical option groups use the existing cart/receipt snapshot envelope. */
(() => {
  let context = null;
  const IMAGE_WAIT_MS = 2000;
  const esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const vi = () =>
    (typeof currentLocale !== "undefined"
      ? currentLocale
      : document.documentElement.lang) === "vi";
  const msg = (zh, vn) => (vi() ? vn : zh);
  const options = (g) => g.eligibleItems || g.options || [];
  const minimum = (g) =>
    g.included
      ? options(g).reduce((n, o) => n + Number(o.quantity || 1), 0)
      : Number(g.minSelection ?? g.minQuantity ?? 0);
  const maximum = (g) =>
    g.included ? minimum(g) : Number(g.maxSelection ?? g.maxQuantity ?? 1);
  function merchandiseSubtotal() {
    let sum = typeof calculateCurrentFoodSubtotal === "function"
      ? calculateCurrentFoodSubtotal()
      : Object.keys(cart || {}).reduce((n, key) => {
          const info = resolveCatalogItem(key);
          return (
            n +
            Number(info?.targetItem?.price ?? info?.basePrice ?? info?.price ?? 0) *
              Number(cart[key] || 0)
          );
        }, 0);
    if (context) {
      if (context.index >= Number(cart[context.key] || 0)) {
        sum += Number(context.price) + extra(context.groups || []);
      } else if (typeof window.bundlePortionExtra === "function" && window.bundleCartData?.[context.key]?.[context.index]) {
        sum += extra(context.groups || []) - Number(window.bundlePortionExtra(window.bundleCartData[context.key][context.index]) || 0);
      }
    }
    return sum;
  }
  const unavailable = (o) =>
    o.isOutOfStock ||
    (o.eligibilityRules || []).some(
      (r) => Number(r.min_order_subtotal || 0) > merchandiseSubtotal(),
    );
  function defaults(groups, saved = []) {
    return groups.map((g) => {
      const old = saved.find(
        (s) => s.groupId === g.id || s.groupId === g.metadata?.legacyGroupId,
      );
      return {
        groupId: g.id,
        groupName: g.name,
        items: old
          ? old.items.flatMap((s) =>
              Array.from({ length: Number(s.quantity || 1) }, () => {
                const o = options(g).find(
                  (o) =>
                    o.id === (s.optionId || s.itemId) ||
                    o.productId === s.itemId,
                );
                return o ? make(o, s) : s;
              }),
            )
          : options(g)
              .filter((o) => !unavailable(o) && (g.included || o.isDefault))
              .flatMap((o) =>
                Array.from(
                  { length: g.included ? Number(o.quantity || 1) : 1 },
                  () => make(o),
                ),
              ),
      };
    });
  }
  function restore(rule, saved = [], legacy = {}, legacyProductChoice = "") {
    const selections = [...saved];
    for (const g of rule.groups) {
      if (
        selections.some(
          (v) => v.groupId === g.id || v.groupId === g.metadata?.legacyGroupId,
        )
      )
        continue;
      const aliases = [
        g.id,
        g.metadata?.source_id,
        g.metadata?.slug,
        g.metadata?.legacy_key,
        g.name,
      ].filter(Boolean);
      const selected = aliases.map((id) => legacy.single?.[id]).find(Boolean);
      const multiple = aliases
        .map((id) => legacy.multiple?.[id])
        .find((v) => Array.isArray(v));
      const choices = options(g).filter(
        (o) =>
          o.name === selected ||
          multiple?.includes(o.name) ||
          legacy.multiple?.[o.name] === true ||
          (!g.included &&
            maximum(g) === 1 &&
            o.productId &&
            o.name === legacyProductChoice),
      );
      if (choices.length)
        selections.push({
          groupId: g.id,
          items: choices.map((o) => ({
            optionId: o.id,
            itemId: o.productId || o.id,
            quantity: 1,
          })),
        });
    }
    return defaults(rule.groups, selections);
  }
  function make(o, s = {}) {
    return {
      itemId: o.productId || o.id,
      optionId: o.id,
      name: o.name,
      quantity: 1,
      surcharge: Number(o.price || 0),
      groups: defaults(
        o.optionGroups || [],
        s.groups ||
          (o.optionGroups || []).map((g) => ({
            groupId: g.id,
            items: (s.modifiers || [])
              .filter((m) => m.groupId === g.id)
              .map((m) => ({
                optionId:
                  m.optionId || options(g).find((v) => v.name === m.name)?.id,
                quantity: 1,
              })),
          })),
      ),
      subOptions: (s.subOptions || []).map((sub) => {
        const current = (o.subOptions || []).find(
          (candidate) => (candidate.id || candidate.name || candidate) === (sub.id || sub.name),
        );
        // Keep unavailable selections visible for removal; refresh prices before reconfirming.
        return current
          ? { ...sub, name: typeof current === "string" ? current : current.name, price: Number(current.price || 0) }
          : sub;
      }),
    };
  }
  function extra(groups) {
    return groups.reduce(
      (sum, g) =>
        sum +
        g.items.reduce(
          (n, i) =>
            n +
            (i.surcharge +
              extra(i.groups || []) +
              (i.subOptions || []).reduce(
                (s, o) => s + Number(o.price || 0),
                0,
              )) *
              Number(i.quantity || 1),
          0,
        ),
      0,
    );
  }
  function invalidSubs(option, item) {
    const subs = item.subOptions || [];
    return (
      new Set(subs.map((s) => s.id || s.name)).size !== subs.length ||
      subs.some((s) => {
        const current = (option.subOptions || []).find(
          (o) => (o.id || o.name || o) === (s.id || s.name),
        );
        return (
          !current ||
          current.isOutOfStock ||
          current.isOos ||
          Number(current.price || 0) !== Number(s.price || 0)
        );
      })
    );
  }
  function invalid(groups, saved) {
    if (!saved || saved.length !== groups.length) {
      return groups.some((g) => minimum(g) > 0 || g.included);
    }
    return groups.some((g) => {
      const selections = saved.find((s) => s.groupId === g.id)?.items || [],
        count = selections.reduce((sum, i) => sum + Number(i.quantity || 1), 0);
      if (count < minimum(g) || count > maximum(g)) return true;
      if (
        !g.allowRepeats &&
        !g.included &&
        new Set(selections.map((s) => s.optionId)).size !== selections.length
      )
        return true;
      if (
        g.included &&
        options(g).some(
          (o) =>
            selections.filter((s) => s.optionId === o.id).length !==
            Number(o.quantity || 1),
        )
      )
        return true;
      return selections.some((i) => {
        const o = options(g).find((o) => o.id === (i.optionId || i.itemId));
        return (
          !o ||
          unavailable(o) ||
          Number(o.price || 0) !== i.surcharge ||
          invalidSubs(o, i) ||
          invalid(o.optionGroups || [], i.groups || [])
        );
      });
    });
  }
  // Presentation follows the original chip popup and stepped bundle picker.
  // Every control still edits the canonical v3 option snapshot.
  const simpleGroup = (g) =>
    !g.included &&
    !g.allowRepeats &&
    options(g).every((o) => !o.productId && !(o.optionGroups || []).length);
  const presentation = (rule) =>
    (rule.groups || []).every(simpleGroup) ? "chips" : "wizard";
  const copy = (value) => JSON.parse(JSON.stringify(value));
  const priceLabel = (value) => `+$${Number(value || 0)}`;
  function groupHint(g) {
    if (g.included) return msg("已包含", "Có sẵn trong món");
    return minimum(g) === maximum(g)
      ? msg(`選擇 ${minimum(g)} 樣`, `Chọn ${minimum(g)}`)
      : msg(
          `選擇 ${minimum(g)}–${maximum(g)} 樣`,
          `Chọn ${minimum(g)}–${maximum(g)}`,
        );
  }
  function child(path) {
    const indexes = path.split(".").map(Number),
      si = indexes.pop();
    const { group, selection } = locate(indexes.join("."));
    const item = selection.items[si];
    return {
      item,
      option: options(group).find((o) => o.id === item.optionId),
      group,
    };
  }
  function drawSubs(option, item, path) {
    return `<div class="modifier-checkbox-grid">${(option.subOptions || [])
      .map((sub, index) => {
        const chosen = (item.subOptions || []).some(
          (value) => (value.id || value.name) === (sub.id || sub.name || sub),
        );
        const unavailable = sub.isOutOfStock || sub.isOos;
        return `<label class="modifier-checkbox-chip ${chosen ? "active" : ""}"><input type="checkbox" data-sub="${path}" data-index="${index}" ${unavailable && !chosen ? "disabled" : ""} ${chosen ? "checked" : ""}><span>${esc(sub.name || sub)}${Number(sub.price) ? ` ${priceLabel(sub.price)}` : ""}${unavailable ? ` · ${esc(msg("已售完", "Hết món"))}` : ""}</span></label>`;
      })
      .join("")}</div>`;
  }
  function optionImageSource(option) {
    const url = String(option.imageUrl || "").trim();
    if (!url) return "";
    return /^(?:https?:)?\/\//.test(url) ? url : (window.WORKER_BASE || "") + url;
  }
  function prepareOptionImage(src) {
    if (context.images.has(src)) return context.images.get(src);
    const entry = { state: "pending" };
    context.images.set(src, entry);
    entry.promise = new Promise((resolve) => {
      let image;
      entry.finish = (ready = false) => {
        if (entry.state !== "pending") return;
        entry.state = ready ? "ready" : "failed";
        clearTimeout(entry.timer);
        if (image) image.onload = image.onerror = null;
        resolve();
      };
      entry.timer = setTimeout(() => entry.finish(), IMAGE_WAIT_MS);
      try {
        image = new Image();
        image.onerror = () => entry.finish();
        image.onload = () => {
          if (!image.naturalWidth) return entry.finish();
          try {
            Promise.resolve(image.decode ? image.decode() : undefined).then(
              () => entry.finish(true),
              () => entry.finish(),
            );
          } catch (_) {
            entry.finish();
          }
        };
        image.src = src;
      } catch (_) {
        entry.finish();
      }
    });
    return entry;
  }
  function drawGroup(g, selection, key) {
    const chips = simpleGroup(g),
      total = selection.items.length;
    const title = `<div class="modifier-group-title"><span>${esc(g.name)}</span><span class="${minimum(g) ? "modifier-required-badge" : "modifier-optional-badge"}">${esc(groupHint(g))}</span></div>`;
    const details = (o, item, si) => {
      const path = `${key}.${si}`,
        label = `${item.name}${g.allowRepeats || g.included ? ` · ${si + 1}` : ""}`;
      const subs = (o.subOptions || []).length
        ? `<div class="uoc-inline-subs"><strong>${esc(label)}</strong>${drawSubs(o, item, path)}</div>`
        : "";
      if (!(o.optionGroups || []).length) return subs;
      const names = (item.groups || [])
        .flatMap((group) => group.items.map((choice) => choice.name))
        .join("、");
      return `${subs}<div class="bundle-v2-detail"><div><strong>${esc(label)}</strong><small class="bundle-v2-mod-labels">${esc(names || msg("尚未自訂", "Chưa tùy chỉnh"))}</small>${invalid(o.optionGroups, item.groups) ? `<small class="bundle-v2-mod-pending">${esc(msg("請完成必選項目", "Cần chọn đủ"))}</small>` : ""}</div><button type="button" class="bundle-v2-mod-btn" data-child="${path}">${esc(msg("自訂", "Tùy chỉnh"))}</button></div>`;
    };
    const rows = options(g)
      .map((o, oi) => {
        const selected = selection.items.flatMap((item, si) =>
          item.optionId === o.id ? [{ item, si }] : [],
        );
        const chosen = selected.length;
        const blocked = unavailable(o),
          full = total >= maximum(g),
          addDisabled =
            blocked ||
            g.included ||
            (full && (maximum(g) !== 1 || chosen)) ||
            (!g.allowRepeats && chosen);
        const warning = blocked
          ? o.isOutOfStock
            ? msg("已售完", "Hết món")
            : (o.eligibilityRules || []).find(
                (r) => Number(r.min_order_subtotal) > merchandiseSubtotal(),
              )?.error_message ||
              msg("未達最低餐點金額", "Chưa đạt giá trị món tối thiểu")
          : "";
        if (chips)
          return `<button type="button" class="${maximum(g) === 1 ? "modifier-pill" : "modifier-checkbox-chip"} ${chosen ? "active" : ""}" data-choose="${key}" data-option="${oi}" aria-pressed="${Boolean(chosen)}" ${blocked || (full && !chosen && maximum(g) !== 1) ? "disabled" : ""}><span>${esc(o.name)}</span>${Number(o.price) ? `<small>${priceLabel(o.price)}</small>` : ""}${warning ? `<small>${esc(warning)}</small>` : ""}</button>`;
        const imageSrc = optionImageSource(o);
        const image = context.images.get(imageSrc)?.state === "ready"
          ? `<img class="uoc-item-image" src="${esc(imageSrc)}" alt="" width="48" height="48">`
          : "";
        return `<div class="uoc-option-entry"><div class="bundle-item-card ${chosen ? "selected" : ""} ${blocked ? "sold-out" : ""}"><div class="bundle-item-info">${image}<div><span>${esc(o.name)}</span><small>${priceLabel(o.price)}${warning ? ` · ${esc(warning)}` : ""}</small></div></div><div class="bundle-stepper">${g.included ? `<span class="bundle-v2-badge-fixed">×${chosen}</span>` : chosen ? `<button type="button" class="bundle-btn-minus" data-minus="${key}" data-option="${oi}" aria-label="${esc(msg("減少", "Giảm") + " " + o.name)}">−</button><span class="bundle-qty-val">${chosen}</span><button type="button" class="bundle-btn-plus" data-add="${key}" data-option="${oi}" ${addDisabled ? "disabled" : ""} aria-label="${esc(msg("增加", "Tăng") + " " + o.name)}">+</button>` : `<button type="button" class="bundle-btn-add" data-add="${key}" data-option="${oi}" ${addDisabled ? "disabled" : ""} aria-label="${esc(msg("選擇", "Chọn") + " " + o.name)}">+</button>`}</div></div>${selected.map(({ item, si }) => details(o, item, si)).join("")}</div>`;
      })
      .join("");
    const detachedDetails = selection.items
      .map((item, si) => {
        const o = options(g).find((o) => o.id === item.optionId);
        if (!o)
          return `<div class="bundle-v2-detail"><span>${esc(item.name)} · ${esc(msg("已無法選擇", "Không còn khả dụng"))}</span><button type="button" data-remove="${key}" data-index="${si}" ${g.included ? "disabled" : ""}>${esc(msg("移除", "Gỡ"))}</button></div>`;
        return chips ? details(o, item, si) : "";
      })
      .join("");
    return `<section class="uoc-group" data-group="${key}">${title}${!chips ? `<p class="uoc-count">${esc(msg("已選", "Đã chọn"))} ${total}/${maximum(g)}</p>` : ""}<div class="${chips ? (maximum(g) === 1 ? "modifier-pills-row" : "modifier-checkbox-grid") : "uoc-items"}">${rows || `<p>${esc(msg("目前沒有可選項目", "Chưa có lựa chọn"))}</p>`}</div>${detachedDetails}</section>`;
  }
  function root() {
    let el = document.getElementById("unified-option-modal");
    if (el) return el;
    el = document.createElement("div");
    el.id = "unified-option-modal";
    el.hidden = true;
    el.innerHTML =
      '<section class="uoc-panel" role="dialog" aria-modal="true" aria-labelledby="uoc-title"><header><button type="button" data-back hidden></button><h2 id="uoc-title" tabindex="-1"></h2><button type="button" data-close>×</button></header><div class="uoc-portion-tabs"></div><nav class="bundle-v2-step-nav" aria-label=""></nav><div class="uoc-image-status" role="status" aria-live="polite" aria-atomic="true"></div><div class="uoc-body"></div><footer><p role="alert"></p><button type="button" data-confirm></button></footer></section>';
    // A photo can disappear after preflight. Replace the list with loading
    // before rebuilding it, rather than collapsing an image inside a live row.
    el.addEventListener("error", (event) => {
      const image = event.target;
      if (!context || !image.isConnected || !image.classList?.contains("uoc-item-image")) return;
      const entry = { state: "pending" };
      entry.promise = new Promise((resolve) => {
        entry.finish = () => {
          clearTimeout(entry.timer);
          entry.state = "failed";
          resolve();
        };
        entry.timer = setTimeout(entry.finish, 100);
      });
      context.images.set(image.getAttribute("src"), entry);
      render();
    }, true);
    el.addEventListener("click", (event) => {
      if (event.target === el || event.target.closest("[data-close]"))
        return close();
      const b = event.target.closest("button");
      if (!b || b.disabled || !context) return;
      if (b.dataset.portion !== undefined)
        return switchPortion(Number(b.dataset.portion));
      if (b.dataset.step !== undefined) {
        context.step = Number(b.dataset.step);
        context.error = "";
        return render(true, `[data-step="${context.step}"]`);
      }
      if (b.dataset.child !== undefined) {
        context.views.push({
          path: b.dataset.child,
          scroll: el.querySelector(".uoc-body").scrollTop,
          focus: `[data-child="${b.dataset.child}"]`,
        });
        context.error = "";
        return render(true);
      }
      if (b.dataset.back !== undefined) return goBack();
      if (b.dataset.copy !== undefined) {
        const previous =
          context.drafts[context.index - 1] || loadPortion(context.index - 1);
        context.groups = copy(previous.groups);
        context.note = previous.note;
        context.error = "";
        return render(true);
      }
      if (b.dataset.remove !== undefined) {
        locate(b.dataset.remove).selection.items.splice(
          Number(b.dataset.index),
          1,
        );
        context.error = "";
        return render();
      }
      const key = b.dataset.choose ?? b.dataset.add ?? b.dataset.minus;
      if (key !== undefined) {
        const { group, selection } = locate(key),
          o = options(group)[Number(b.dataset.option)];
        if (
          !o ||
          group.included ||
          (unavailable(o) && b.dataset.minus === undefined)
        )
          return;
        const idx = selection.items.findLastIndex((s) => s.optionId === o.id);
        let added = false;
        if (
          b.dataset.minus !== undefined ||
          (b.dataset.choose !== undefined && idx >= 0)
        ) {
          if (idx >= 0) selection.items.splice(idx, 1);
        } else if (!group.allowRepeats && idx >= 0) return;
        else if (maximum(group) === 1) {
          selection.items = [make(o)];
          added = true;
        } else if (selection.items.length < maximum(group)) {
          selection.items.push(make(o));
          added = true;
        }
        context.error = "";
        if (
          added &&
          invalid(o.optionGroups || [], selection.items.at(-1).groups)
        ) {
          const path = `${key}.${selection.items.length - 1}`;
          context.views.push({
            path,
            scroll: el.querySelector(".uoc-body").scrollTop,
            focus: `[data-child="${path}"]`,
          });
          return render(true);
        }
        return render();
      }
      if (b.dataset.confirm !== undefined) confirm();
    });
    el.addEventListener("input", (event) => {
      if (event.target.dataset.note !== undefined)
        context.note = event.target.value.slice(0, 50);
    });
    el.addEventListener("change", (event) => {
      const input = event.target;
      if (input.dataset.sub === undefined) return;
      const { item, option } = child(input.dataset.sub),
        s = option.subOptions[Number(input.dataset.index)];
      if (!s || (input.checked && (s.isOutOfStock || s.isOos))) return;
      const id = s.id || s.name || s;
      item.subOptions = item.subOptions.filter((s) => (s.id || s.name) !== id);
      if (input.checked)
        item.subOptions.push({
          id,
          name: s.name || s,
          price: Number(s.price || 0),
        });
      context.error = "";
      render();
    });
    el.addEventListener("focusin", (event) => {
      const step = event.target.closest("[data-step]");
      if (step) revealStep(el.querySelector("nav"), step);
    });
    el.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        return context.views.length ? goBack() : close();
      }
      if (event.key !== "Tab") return;
      const list = [
          ...el.querySelectorAll(
            "button:not(:disabled),input:not(:disabled),textarea",
          ),
        ].filter((e) => e.getClientRects().length),
        first = list[0],
        last = list.at(-1);
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !list.includes(document.activeElement))
      ) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    });
    document.body.appendChild(el);
    return el;
  }
  function locate(path) {
    const indexes = path.split(".").map(Number);
    let groups = context.rule.groups,
      selections = context.groups;
    while (indexes.length > 1) {
      const gi = indexes.shift(),
        si = indexes.shift(),
        item = selections[gi].items[si],
        o = options(groups[gi]).find((o) => o.id === item.optionId);
      groups = o.optionGroups;
      selections = item.groups;
    }
    return { group: groups[indexes[0]], selection: selections[indexes[0]] };
  }
  function focusSelector(el) {
    for (const key of [
      "choose",
      "add",
      "minus",
      "child",
      "sub",
      "step",
      "portion",
      "confirm",
      "copy",
      "note",
      "close",
      "back",
    ]) {
      if (el?.dataset[key] !== undefined)
        return `[data-${key}="${el.dataset[key]}"]${el.dataset.option !== undefined ? `[data-option="${el.dataset.option}"]` : ""}${el.dataset.index !== undefined ? `[data-index="${el.dataset.index}"]` : ""}`;
    }
    return null;
  }
  function revealStep(nav, step) {
    if (nav.hidden || !nav.clientWidth || !step) return;
    // Scroll only this strip: scrollIntoView would also move the sheet/body.
    const strip = nav.getBoundingClientRect(),
      button = step.getBoundingClientRect(),
      left = button.left - strip.left,
      right = button.right - strip.left;
    if (left < 8 || button.width > nav.clientWidth - 16)
      nav.scrollLeft += left - 8;
    else if (right > nav.clientWidth - 8)
      nav.scrollLeft += right - nav.clientWidth + 8;
  }
  function render(reset = false, restoreFocus = null) {
    const session = context;
    const renderVersion = ++session.renderVersion;
    const el = root(),
      body = el.querySelector(".uoc-body"),
      nav = el.querySelector("nav"),
      navScroll = nav.scrollLeft,
      previousStep = nav.querySelector('[aria-current="step"]')?.dataset.step,
      scroll = reset ? 0 : body.scrollTop,
      focus = restoreFocus || focusSelector(document.activeElement);
    const view = context.views.at(-1),
      nested = view ? child(view.path) : null;
    const visibleGroups = nested
      ? nested.option.optionGroups || []
      : context.rule.groups.filter((_, gi) => context.mode === "chips" || gi === context.step);
    const sources = new Set(visibleGroups.filter(g => !simpleGroup(g))
      .flatMap(g => options(g).map(optionImageSource)).filter(Boolean));
    const pending = [...sources].map(prepareOptionImage)
      .filter(entry => entry.state === "pending").map(entry => entry.promise);
    const loading = pending.length > 0;
    el.className = `uoc-overlay ${context.mode === "chips" ? "uoc-simple" : "uoc-wizard"}`;
    el.querySelector(".uoc-panel").className =
      `uoc-panel ${context.mode === "chips" ? "popup-box" : "bundle-modal-sheet"}`;
    el.querySelector("h2").textContent = nested
      ? nested.item.name
      : context.name;
    const back = el.querySelector("[data-back]");
    back.hidden = !nested;
    back.textContent = msg("返回", "Quay lại");
    const qty = Number(cart[context.key] || 0);
    const portions = el.querySelector(".uoc-portion-tabs");
    portions.hidden = Boolean(nested) || !qty;
    portions.innerHTML = Array.from(
      { length: qty + 1 },
      (_, index) =>
        `<button type="button" class="portion-tab-btn ${index === context.index ? "active" : ""}" data-portion="${index}" aria-pressed="${index === context.index}">${esc(index === qty ? msg("＋ 新增一份", "+ Thêm một phần") : msg(`第 ${index + 1} 份`, `Phần ${index + 1}`))}</button>`,
    ).join("");
    nav.hidden =
      Boolean(nested) ||
      context.mode === "chips" ||
      context.rule.groups.length < 2;
    nav.setAttribute("aria-label", msg("選擇步驟", "Các bước lựa chọn"));
    nav.innerHTML = context.rule.groups
      .map(
        (g, gi) =>
          `<button type="button" class="bundle-v2-nav ${gi === context.step ? "active" : ""}" data-step="${gi}" aria-current="${gi === context.step ? "step" : "false"}">${!invalid([g], [context.groups[gi]]) ? "✓ " : ""}${esc(g.name)}</button>`,
      )
      .join("");
    body.setAttribute("aria-busy", String(loading));
    const loadingText = msg("載入選項中…", "Đang tải tùy chọn…");
    el.querySelector(".uoc-image-status").textContent = loading ? loadingText : "";
    if (loading) {
      body.innerHTML = `<div class="uoc-image-loading" aria-hidden="true"><span class="uoc-image-spinner"></span><span>${esc(loadingText)}</span></div>`;
      Promise.all(pending).then(() => {
        if (context !== session || session.renderVersion !== renderVersion) return;
        render(false, focusSelector(document.activeElement) || focus);
        body.scrollTop = scroll;
      });
    } else if (nested) {
      body.innerHTML =
        (nested.option.optionGroups || [])
          .map((g, gi) =>
            drawGroup(g, nested.item.groups[gi], `${view.path}.${gi}`),
          )
          .join("");
    } else {
      body.innerHTML =
        (context.index > 0
          ? `<button type="button" class="bundle-v2-copy btn-copy-prev-custom" data-copy>${esc(msg("複製上一份的選擇", "Sao chép lựa chọn phần trước"))}</button>`
          : "") +
        context.rule.groups
          .map((g, gi) =>
            context.mode === "chips" || gi === context.step
              ? drawGroup(g, context.groups[gi], String(gi))
              : "",
          )
          .join("") +
        `<label class="uoc-note"><span>${esc(msg("個別備註", "Ghi chú riêng"))}</span><textarea data-note maxlength="50" rows="2">${esc(context.note)}</textarea></label>`;
    }
    body.scrollTop = scroll;
    const b = el.querySelector("[data-confirm]");
    b.disabled = loading;
    b.textContent = nested
      ? msg("完成", "Xong")
      : context.mode === "wizard" &&
          context.step < context.rule.groups.length - 1
        ? msg("下一步", "Tiếp theo")
        : `${msg("確認", "Xác nhận")} · $${Number(context.price) + extra(context.groups)}`;
    el.querySelector('[role="alert"]').textContent = context.error || "";
    el.querySelector("[data-close]").setAttribute(
      "aria-label",
      msg("關閉", "Đóng"),
    );
    nav.scrollLeft = navScroll;
    const target = focus && (!reset || restoreFocus) ? el.querySelector(focus) : null;
    (target && !target.disabled && target.getClientRects().length
      ? target
      : el.querySelector("h2")
    ).focus({ preventScroll: true });
    if (previousStep !== String(context.step))
      revealStep(nav, nav.querySelector('[aria-current="step"]'));
  }
  function goBack() {
    const view = context.views.pop();
    if (!view) return;
    context.error = "";
    render(false, view.focus);
    root().querySelector(".uoc-body").scrollTop = view.scroll;
  }
  function loadPortion(index) {
    return {
      groups: restore(
        context.rule,
        window.bundleCartData?.[context.key]?.[index]?.groups,
        window.customizeData?.[context.key]?.[index],
        window.comboDrinkData?.[context.name]?.[index],
      ),
      note: window.customizeData?.[context.key]?.[index]?.note || "",
    };
  }
  function switchPortion(index) {
    context.drafts[context.index] = {
      groups: copy(context.groups),
      note: context.note,
    };
    context.index = index;
    const portion = context.drafts[index] || loadPortion(index);
    context.groups = copy(portion.groups);
    context.note = portion.note;
    context.step = 0;
    context.error = "";
    context.views = [];
    render(true);
  }
  function close() {
    root().hidden = true;
    document.querySelectorAll("[data-uoc-inert]").forEach((el) => {
      el.inert = false;
      delete el.dataset.uocInert;
    });
    const focus = context?.focus,
      overflow = context?.overflow || "";
    context?.images.forEach(entry => entry.finish?.());
    context = null;
    document.body.style.overflow = overflow;
    focus?.focus();
  }
  function receipt(groups) {
    return groups.map((g) => ({
      ...g,
      items: g.items.map((i) => {
        const nested = receipt(i.groups || []);
        return {
          ...i,
          price: 0,
          groups: nested,
          modifiers: [
            ...nested.flatMap((g) =>
              g.items.map((i) => ({
                groupId: g.groupId,
                name: `${i.name}${i.quantity > 1 ? ` ×${i.quantity}` : ""}${i.modifiers?.length ? ` (${i.modifiers.map((m) => m.name).join("、")})` : ""}`,
                price:
                  (i.surcharge +
                    (i.modifiers || []).reduce(
                      (s, m) => s + Number(m.price || 0),
                      0,
                    )) *
                  i.quantity,
              })),
            ),
            ...(i.subOptions || []),
          ],
        };
      }),
    }));
  }
  function confirm() {
    const view = context.views.at(-1);
    if (view) {
      const nested = child(view.path);
      if (invalid(nested.option.optionGroups || [], nested.item.groups)) {
        context.error = msg(
          "請檢查必選項目與已售完的選項",
          "Vui lòng kiểm tra lựa chọn bắt buộc và lựa chọn đã hết món",
        );
        return render();
      }
      return goBack();
    }
    if (
      context.mode === "wizard" &&
      context.step < context.rule.groups.length - 1 &&
      !invalid(
        [context.rule.groups[context.step]],
        [context.groups[context.step]],
      )
    ) {
      context.step++;
      context.error = "";
      return render(true);
    }
    if (invalid(context.rule.groups, context.groups)) {
      context.step = context.rule.groups.findIndex((g, gi) =>
        invalid([g], [context.groups[gi]]),
      );
      context.error = msg(
        "請檢查必選項目與已售完的選項",
        "Vui lòng kiểm tra lựa chọn bắt buộc và lựa chọn đã hết món",
      );
      return render(true);
    }
    const { key, index, cat, name } = context;
    window.bundleCartData = window.bundleCartData || {};
    window.bundleCartData[key] = window.bundleCartData[key] || [];
    window.customizeData = window.customizeData || {};
    window.customizeData[key] = window.customizeData[key] || [];
    window.customizeData[key][index] = {
      single: {},
      multiple: {},
      note: context.note,
    };
    window.bundleCartData[key][index] = {
      portionIndex: index,
      groups: receipt(context.groups),
    };
    cart[key] = Math.max(Number(cart[key] || 0), index + 1);
    const qty = document.getElementById(`qty-${cat}-${name}`);
    if (qty) qty.textContent = String(cart[key]);
    const b = document.getElementById(`bundle-edit-btn-${cat}-${name}`);
    if (b) b.style.display = "flex";
    close();
    updateTotal();
  }
  window.UnifiedOptions = {
    restore,
    receipt,
    presentation,
    open(cat, name, index) {
      const key = cat + "_" + name,
        info = resolveCatalogItem(key),
        rule = info.bundleRule || info.targetItem?.bundleRule;
      if (!rule?.groups?.length) return;
      if (context) close();
      index = Number.isInteger(index)
        ? Math.max(0, Math.min(index, Number(cart[key] || 0)))
        : Number(cart[key] || 0);
      context = {
        key,
        cat,
        name,
        rule,
        index,
        price: info.targetItem?.price ?? info.price ?? 0,
        groups: restore(
          rule,
          window.bundleCartData?.[key]?.[index]?.groups,
          window.customizeData?.[key]?.[index],
          window.comboDrinkData?.[name]?.[index],
        ),
        focus: document.activeElement,
        overflow: document.body.style.overflow,
        mode: presentation(rule),
        step: 0,
        views: [],
        drafts: {},
        images: new Map(),
        renderVersion: 0,
        error: "",
        note: window.customizeData?.[key]?.[index]?.note || "",
      };
      root().hidden = false;
      root().querySelector("nav").innerHTML = "";
      root().querySelector("nav").scrollLeft = 0;
      for (const el of document.body.children)
        if (el !== root() && !el.inert) {
          el.dataset.uocInert = "1";
          el.inert = true;
        }
      document.body.style.overflow = "hidden";
      render();
      root().querySelector("h2").focus();
    },
    valid(rule, portion) {
      return !invalid(rule.groups, portion?.groups);
    },
  };
})();
