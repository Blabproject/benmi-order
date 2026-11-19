/**
 * Shared Pure Time-Based Menu & Operating Shift Evaluator
 * Used identically across Customer Menu (Browser), POS (Browser), and Cloudflare Worker (TypeScript).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
    module.exports.default = api;
  } else if (root) {
    root.MenuSchedule = api;
    if (root.window && typeof root.window === 'object') {
      root.window.MenuSchedule = api;
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function parseMinutes(hhmm, isEnd) {
    if (typeof hhmm !== 'string') return NaN;
    const match = hhmm.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return NaN;
    const h = Number(match[1]);
    const m = Number(match[2]);
    if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 24 || m < 0 || m > 59) return NaN;
    if (h === 24 && m !== 0) return NaN;
    if (isEnd && (hhmm.trim() === '00:00' || hhmm.trim() === '24:00' || (h === 0 && m === 0))) {
      return 1440;
    }
    return h * 60 + m;
  }

  // All weekly ranges use the restaurant's local weekday/time, independent of browser timezone.
  function normalizeBusinessHours(input) {
    const raw = typeof input === 'string' ? JSON.parse(input) : input;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('INVALID_OPERATING_HOURS');
    if (Object.keys(raw).some(key => !/^[0-6]$/.test(key))) throw new Error('INVALID_OPERATING_HOURS');
    const result = {};
    for (let day = 0; day < 7; day++) {
      const ranges = raw[day] === undefined ? [] : raw[day];
      if (!Array.isArray(ranges)) throw new Error('INVALID_OPERATING_HOURS');
      result[day] = ranges.map(range => {
        if (!range || !Number.isFinite(parseMinutes(range.start, false)) || parseMinutes(range.start, false) >= 1440 || !Number.isFinite(parseMinutes(range.end, true))) throw new Error('INVALID_OPERATING_HOURS');
        return { start: pad2(Math.floor(parseMinutes(range.start, false) / 60)) + ':' + pad2(parseMinutes(range.start, false) % 60), end: pad2(Math.floor(parseMinutes(range.end, true) / 60)) + ':' + pad2(parseMinutes(range.end, true) % 60) };
      });
    }
    return result;
  }

  function shiftCoverageIssues(shifts, hoursInput) {
    const hours = normalizeBusinessHours(hoursInput), intervals = [];
    function range(day, start, end) {
      const a = parseMinutes(start, false), b = parseMinutes(end, true);
      if (!Number.isInteger(day) || day < 0 || day > 6 || !Number.isFinite(a) || a >= 1440 || !Number.isFinite(b)) throw new Error('INVALID_SHIFT_TIME');
      return [day * 1440 + a, day * 1440 + b + (b <= a ? 1440 : 0)];
    }
    for (let day = 0; day < 7; day++) for (const h of hours[day]) {
      const [a, b] = range(day, h.start, h.end);
      for (const offset of [-10080, 0, 10080]) intervals.push([a + offset, b + offset]);
    }
    intervals.sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const current of intervals) {
      const last = merged[merged.length - 1];
      if (last && current[0] <= last[1]) last[1] = Math.max(last[1], current[1]);
      else merged.push([...current]);
    }
    const issues = [];
    for (const shift of shifts || []) {
      if (shift.isActive === false) continue;
      for (const w of shift.windows || []) {
        if (w.isActive === false) continue;
        const [a, b] = range(Number(w.dayOfWeek), w.startTime, w.endTime);
        if (!merged.some(([start, end]) => start <= a && end >= b)) issues.push({ shiftId: shift.id, shiftName: shift.name, dayOfWeek: Number(w.dayOfWeek), startTime: w.startTime, endTime: w.endTime });
      }
    }
    return issues;
  }

  function getTaipeiParts(input) {
    if (input && typeof input === 'object' && !(input instanceof Date)) {
      const dateStr = typeof input.dateStr === 'string' ? input.dateStr.trim() : '';
      const timeStr = typeof input.timeStr === 'string' ? input.timeStr.trim() : '';
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr) && /^\d{1,2}:\d{2}$/.test(timeStr)) {
        const [y, mo, d] = dateStr.split('-').map(Number);
        const [h, mi] = timeStr.split(':').map(Number);
        const dt = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0));
        return {
          year: y,
          month: mo,
          day: d,
          dayOfWeek: dt.getUTCDay(),
          hour: h,
          minute: mi,
          minutesOfDay: h * 60 + mi,
          dateStr,
          timeStr: `${pad2(h)}:${pad2(mi)}`
        };
      }
      if (typeof input.minutesOfDay === 'number' && Number.isInteger(input.dayOfWeek)) {
        return {
          year: input.year || 2026,
          month: input.month || 1,
          day: input.day || 1,
          dayOfWeek: ((input.dayOfWeek % 7) + 7) % 7,
          hour: Math.floor(input.minutesOfDay / 60) % 24,
          minute: input.minutesOfDay % 60,
          minutesOfDay: input.minutesOfDay,
          dateStr: input.dateStr || '',
          timeStr: `${pad2(Math.floor(input.minutesOfDay / 60) % 24)}:${pad2(input.minutesOfDay % 60)}`
        };
      }
    }

    if (typeof input === 'string' && input.trim()) {
      const cleaned = input.replace(/\s*\([^)]*\)/g, '').trim();
      const dtMatch = cleaned.match(/^(\d{4}-\d{2}-\d{2})[T\s]+(\d{1,2}:\d{2})/);
      if (dtMatch) {
        return getTaipeiParts({ dateStr: dtMatch[1], timeStr: dtMatch[2] });
      }
      const timeOnlyMatch = cleaned.match(/^(\d{1,2}:\d{2})$/);
      if (timeOnlyMatch) {
        const base = getTaipeiParts(new Date());
        return getTaipeiParts({ dateStr: base.dateStr, timeStr: timeOnlyMatch[1] });
      }
    }

    // Use UTC+8 calculation when input is a Date (or browser-local Date from getTaiwanDate)
    const now = input instanceof Date && !isNaN(input.getTime()) ? input : new Date();
    try {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Taipei',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        hour12: false
      });
      const parts = formatter.formatToParts(now);
      const map = {};
      for (const p of parts) map[p.type] = p.value;
      const year = Number(map.year);
      const month = Number(map.month);
      const day = Number(map.day);
      const hour = Number(map.hour) % 24;
      const minute = Number(map.minute);
      const dayOfWeek = new Date(Date.UTC(year, month - 1, day, 12, 0, 0)).getUTCDay();
      return {
        year,
        month,
        day,
        dayOfWeek,
        hour,
        minute,
        minutesOfDay: hour * 60 + minute,
        dateStr: `${year}-${pad2(month)}-${pad2(day)}`,
        timeStr: `${pad2(hour)}:${pad2(minute)}`
      };
    } catch (_) {
      const tw = new Date(now.getTime() + 8 * 3600000);
      const year = tw.getUTCFullYear();
      const month = tw.getUTCMonth() + 1;
      const day = tw.getUTCDate();
      const hour = tw.getUTCHours();
      const minute = tw.getUTCMinutes();
      return {
        year,
        month,
        day,
        dayOfWeek: tw.getUTCDay(),
        hour,
        minute,
        minutesOfDay: hour * 60 + minute,
        dateStr: `${year}-${pad2(month)}-${pad2(day)}`,
        timeStr: `${pad2(hour)}:${pad2(minute)}`
      };
    }
  }

  function normalizeWindows(windows) {
    if (!Array.isArray(windows)) return [];
    return windows
      .map(w => {
        if (!w || typeof w !== 'object') return null;
        const day = Number(w.dayOfWeek ?? w.day_of_week);
        const startTime = String(w.startTime ?? w.start_time ?? w.start ?? '').trim();
        const endTime = String(w.endTime ?? w.end_time ?? w.end ?? '').trim();
        if (!Number.isInteger(day) || day < 0 || day > 6) return null;
        if (Number.isNaN(parseMinutes(startTime, false)) || Number.isNaN(parseMinutes(endTime, true))) return null;
        return {
          id: w.id || undefined,
          dayOfWeek: day,
          startTime: startTime.length === 4 ? `0${startTime}` : startTime,
          endTime: endTime.length === 4 ? `0${endTime}` : endTime,
          isActive: w.isActive !== undefined ? Boolean(w.isActive) : (w.is_active !== undefined ? Boolean(w.is_active) : true)
        };
      })
      .filter(Boolean);
  }

  function normalizeOperatingShifts(shifts) {
    if (!Array.isArray(shifts)) return [];
    return shifts
      .map((s, idx) => {
        if (!s || typeof s !== 'object' || !s.id) return null;
        const shiftType = s.shiftType === 'menu_window' || s.shift_type === 'menu_window' ? 'menu_window' : 'operating';
        return {
          id: String(s.id),
          name: String(s.name || '').trim() || `Shift ${idx + 1}`,
          i18n: (s.i18n && typeof s.i18n === 'object' && !Array.isArray(s.i18n)) ? s.i18n : {},
          shiftType,
          sortOrder: Number(s.sortOrder ?? s.sort_order ?? idx),
          isActive: s.isActive !== undefined ? Boolean(s.isActive) : (s.is_active !== undefined ? Boolean(s.is_active) : true),
          windows: normalizeWindows(s.windows)
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  function hasOperatingShifts(shifts) {
    return Array.isArray(shifts) && shifts.some(s => s && s.isActive !== false && s.shiftType !== 'menu_window');
  }

  function projectOperatingHoursMap(shifts) {
    const map = { '0': [], '1': [], '2': [], '3': [], '4': [], '5': [], '6': [] };
    const normalized = normalizeOperatingShifts(shifts);
    for (const shift of normalized) {
      if (shift.isActive === false || shift.shiftType !== 'operating') continue;
      for (const win of shift.windows) {
        if (win.isActive === false) continue;
        const key = String(win.dayOfWeek);
        const exists = map[key].some(entry => entry.start === win.startTime && entry.end === win.endTime);
        if (!exists) {
          map[key].push({
            start: win.startTime,
            end: win.endTime,
            shiftId: shift.id,
            shiftName: shift.name
          });
        }
      }
    }
    for (const day of Object.keys(map)) {
      map[day].sort((a, b) => (parseMinutes(a.start, false) || 0) - (parseMinutes(b.start, false) || 0));
    }
    return map;
  }

  function isMinuteInWindow(minuteOfDay, startStr, endStr, fromYesterday, inclusiveEnd) {
    const startMin = parseMinutes(startStr, false);
    let endMin = parseMinutes(endStr, true);
    if (Number.isNaN(startMin) || Number.isNaN(endMin)) return false;
    // Legacy convention: 12:00 PM start to 12:00 AM coded as 12:00
    if (startMin >= 720 && endStr === '12:00') endMin = 1440;
    const isOvernight = endMin < startMin;
    if (fromYesterday) {
      return isOvernight && (inclusiveEnd ? minuteOfDay <= endMin : minuteOfDay < endMin);
    }
    if (isOvernight) {
      return minuteOfDay >= startMin;
    }
    return minuteOfDay >= startMin && (inclusiveEnd ? minuteOfDay <= endMin : minuteOfDay < endMin);
  }

  function isShiftActiveAt(shift, targetInput, options) {
    if (!shift || shift.isActive === false) return false;
    const inclusiveEnd = Boolean(options && options.inclusiveEnd);
    const parts = getTaipeiParts(targetInput);
    const yesterday = (parts.dayOfWeek + 6) % 7;
    const windows = Array.isArray(shift.windows) ? shift.windows : [];
    for (const win of windows) {
      if (win.isActive === false) continue;
      if (Number(win.dayOfWeek) === parts.dayOfWeek && isMinuteInWindow(parts.minutesOfDay, win.startTime, win.endTime, false, inclusiveEnd)) {
        return true;
      }
      if (Number(win.dayOfWeek) === yesterday && isMinuteInWindow(parts.minutesOfDay, win.startTime, win.endTime, true, inclusiveEnd)) {
        return true;
      }
    }
    return false;
  }

  function isLegacyHoursOpenAt(legacyHours, targetInput, options) {
    if (!legacyHours || typeof legacyHours !== 'object') return false;
    const inclusiveEnd = Boolean(options && options.inclusiveEnd);
    const parts = getTaipeiParts(targetInput);
    const yesterday = (parts.dayOfWeek + 6) % 7;
    const todayShifts = legacyHours[parts.dayOfWeek] || legacyHours[String(parts.dayOfWeek)] || [];
    if (Array.isArray(todayShifts)) {
      for (const s of todayShifts) {
        if (s && s.start && s.end && isMinuteInWindow(parts.minutesOfDay, s.start, s.end, false, inclusiveEnd)) {
          return true;
        }
      }
    }
    const yShifts = legacyHours[yesterday] || legacyHours[String(yesterday)] || [];
    if (Array.isArray(yShifts)) {
      for (const s of yShifts) {
        if (s && s.start && s.end && isMinuteInWindow(parts.minutesOfDay, s.start, s.end, true, inclusiveEnd)) {
          return true;
        }
      }
    }
    return false;
  }

  function isStoreOpenAt(shifts, legacyHours, targetInput, options) {
    // Named shifts control menu availability; only the store hours control opening.
    return isLegacyHoursOpenAt(legacyHours, targetInput, options);
  }

  function getLocalizedShiftName(shift, locale) {
    if (!shift) return '';
    if (locale && shift.i18n && shift.i18n[locale] && shift.i18n[locale].name) {
      return shift.i18n[locale].name;
    }
    return shift.name || '';
  }

  function formatShiftsLabel(shiftsList, locale) {
    if (!Array.isArray(shiftsList) || shiftsList.length === 0) return '';
    const labels = shiftsList.map(shift => {
      const name = getLocalizedShiftName(shift, locale);
      const uniqueRanges = [];
      for (const win of shift.windows || []) {
        if (win.isActive === false) continue;
        const range = `${win.startTime}-${win.endTime}`;
        if (!uniqueRanges.includes(range)) uniqueRanges.push(range);
      }
      if (uniqueRanges.length === 1) return name ? `${name} (${uniqueRanges[0]})` : uniqueRanges[0];
      return name || uniqueRanges.join(', ');
    }).filter(Boolean);
    return labels.join(locale === 'vi' ? ', ' : '、');
  }

  function evaluateSelectedShifts(shiftIds, shifts, legacyHours, targetInput, hideWhenUnavailable, optionsOrLocale) {
    const opts = typeof optionsOrLocale === 'string' ? { locale: optionsOrLocale } : (optionsOrLocale || {});
    const locale = opts.locale;
    const normalized = normalizeOperatingShifts(shifts);
    const idSet = new Set((Array.isArray(shiftIds) ? shiftIds : []).map(String));
    const matchedShifts = normalized.filter(s => idSet.has(s.id) && s.isActive !== false);
    const hasConfiguredStore = Boolean(
      legacyHours && typeof legacyHours === 'object' && Object.values(legacyHours).some(arr => Array.isArray(arr) && arr.length > 0)
    );

    const activeShifts = matchedShifts.filter(s => {
      if (!isShiftActiveAt(s, targetInput, opts)) return false;
      if (s.shiftType === 'menu_window' && hasConfiguredStore) {
        return isStoreOpenAt(normalized, legacyHours, targetInput, opts);
      }
      return true;
    });

    const available = activeShifts.length > 0;
    return {
      available,
      hidden: !available && Boolean(hideWhenUnavailable),
      mode: 'selected_shifts',
      shiftIds: Array.from(idSet),
      activeShiftIds: activeShifts.map(s => s.id),
      activeShiftNames: activeShifts.map(s => getLocalizedShiftName(s, locale)),
      scheduleLabel: formatShiftsLabel(matchedShifts, locale)
    };
  }

  function resolveCategoryAvailability(category, shifts, legacyHours, targetInput, optionsOrLocale) {
    const mode = category?.availabilityMode === 'selected_shifts' || category?.availability_mode === 'selected_shifts'
      ? 'selected_shifts'
      : 'all_shifts';
    const hideWhenUnavailable = Boolean(category?.hideWhenUnavailable ?? category?.hide_when_unavailable);
    if (mode !== 'selected_shifts') {
      return {
        available: true,
        hidden: false,
        mode: 'all_shifts',
        shiftIds: [],
        activeShiftIds: [],
        activeShiftNames: [],
        scheduleLabel: ''
      };
    }
    const shiftIds = Array.isArray(category?.shiftIds)
      ? category.shiftIds
      : (Array.isArray(category?.shift_ids) ? category.shift_ids : []);
    return evaluateSelectedShifts(shiftIds, shifts, legacyHours, targetInput, hideWhenUnavailable, optionsOrLocale);
  }

  function resolveItemAvailability(category, item, shifts, legacyHours, targetInput, optionsOrLocale) {
    const rawItemMode = item?.availabilityMode ?? item?.availability_mode ?? 'inherit';
    const itemMode = (rawItemMode === 'all_shifts' || rawItemMode === 'selected_shifts') ? rawItemMode : 'inherit';
    if (itemMode === 'inherit') {
      return resolveCategoryAvailability(category, shifts, legacyHours, targetInput, optionsOrLocale);
    }
    if (itemMode === 'all_shifts') {
      return {
        available: true,
        hidden: false,
        mode: 'all_shifts',
        shiftIds: [],
        activeShiftIds: [],
        activeShiftNames: [],
        scheduleLabel: ''
      };
    }
    const hideWhenUnavailable = Boolean(
      item?.hideWhenUnavailable ?? item?.hide_when_unavailable ?? category?.hideWhenUnavailable ?? category?.hide_when_unavailable
    );
    const shiftIds = Array.isArray(item?.shiftIds)
      ? item.shiftIds
      : (Array.isArray(item?.shift_ids) ? item.shift_ids : []);
    return evaluateSelectedShifts(shiftIds, shifts, legacyHours, targetInput, hideWhenUnavailable, optionsOrLocale);
  }

  return {
    parseMinutes,
    normalizeBusinessHours,
    shiftCoverageIssues,
    getTaipeiParts,
    normalizeOperatingShifts,
    hasOperatingShifts,
    projectOperatingHoursMap,
    isShiftActiveAt,
    isStoreOpenAt,
    formatShiftsLabel,
    resolveCategoryAvailability,
    resolveItemAvailability
  };
});
