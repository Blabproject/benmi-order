const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('js/orders-core.js', 'utf8');
const fixedNow = new Date('2026-11-07T12:00:00Z').getTime();
class FixedDate extends Date {
  constructor(...args) {
    if (args.length === 0) super(fixedNow);
    else super(...args);
  }
  static now() {
    return fixedNow;
  }
}
const ctx = vm.createContext({ Date: FixedDate, allowScheduledPickup: false, t: (key, values) => ({key, ...values}) });
for (const name of ['parsePickupTimeMs', 'formatEta', 'isOrderElapsedMode', 'formatSubmissionElapsedTime']) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf('\nfunction ', start + 1);
  vm.runInContext(source.slice(start, end), ctx);
}
for (const time of ['2026-09-12 12:00', '', '即刻', 'Làm ngay']) {
  assert.equal(ctx.isOrderElapsedMode({ diningOption: 'takeaway', time }), false);
}
assert.equal(ctx.isOrderElapsedMode({ diningOption: 'dine_in' }), true);
assert.equal(ctx.isOrderElapsedMode({ dining_option: 'dine_in' }), true);
const future = new FixedDate(fixedNow + 90 * 60000);
const local = `${future.getFullYear()}-${String(future.getMonth()+1).padStart(2,'0')}-${String(future.getDate()).padStart(2,'0')} ${String(future.getHours()).padStart(2,'0')}:${String(future.getMinutes()).padStart(2,'0')}`;
assert.equal(ctx.formatEta(local).key, 'etaHours');
assert.equal(ctx.formatEta(local).h, 1);
assert.equal(ctx.formatEta('即刻'), '-');

// Relative time formatting test cases (Past & Future)
function toTimeStr(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

const now = fixedNow;
// 1. Past orders (arrived / overdue elapsed time)
assert.equal(ctx.formatEta(toTimeStr(now - 30 * 60000)).key, 'etaArrived');
assert.equal(ctx.formatEta(toTimeStr(now - 30 * 60000)).min, 30);

assert.equal(ctx.formatEta(toTimeStr(now - 75 * 60000)).key, 'etaArrivedHours');
assert.equal(ctx.formatEta(toTimeStr(now - 75 * 60000)).h, 1);
assert.equal(ctx.formatEta(toTimeStr(now - 75 * 60000)).m, 15);

assert.equal(ctx.formatEta(toTimeStr(now - 120 * 60000)).key, 'etaArrivedHoursOnly');
assert.equal(ctx.formatEta(toTimeStr(now - 120 * 60000)).h, 2);

// User's exact bug scenario: 1702 minutes ago (~28h = 1 day 4 hours)
assert.equal(ctx.formatEta(toTimeStr(now - 1702 * 60000)).key, 'etaArrivedDaysHours');
assert.equal(ctx.formatEta(toTimeStr(now - 1702 * 60000)).d, 1);
assert.equal(ctx.formatEta(toTimeStr(now - 1702 * 60000)).h, 4);

assert.equal(ctx.formatEta(toTimeStr(now - 3000 * 60000)).key, 'etaArrivedDays');
assert.equal(ctx.formatEta(toTimeStr(now - 3000 * 60000)).d, 2);

assert.equal(ctx.formatEta(toTimeStr(now - 12000 * 60000)).key, 'etaArrivedWeeks');
assert.equal(ctx.formatEta(toTimeStr(now - 12000 * 60000)).w, 1);

// 2. Future orders
assert.equal(ctx.formatEta(toTimeStr(now + 30 * 60000)).key, 'etaMinutes');
assert.equal(ctx.formatEta(toTimeStr(now + 30 * 60000)).min, 30);

assert.equal(ctx.formatEta(toTimeStr(now + 120 * 60000)).key, 'etaHoursOnly');
assert.equal(ctx.formatEta(toTimeStr(now + 120 * 60000)).h, 2);

assert.equal(ctx.formatEta(toTimeStr(now + 1500 * 60000)).key, 'etaDaysHours');
assert.equal(ctx.formatEta(toTimeStr(now + 1500 * 60000)).d, 1);

assert.equal(ctx.formatEta(toTimeStr(now + 3000 * 60000)).key, 'etaDays');
assert.equal(ctx.formatEta(toTimeStr(now + 3000 * 60000)).d, 2);

assert.equal(ctx.formatEta(toTimeStr(now + 12000 * 60000)).key, 'etaWeeks');
assert.equal(ctx.formatEta(toTimeStr(now + 12000 * 60000)).w, 1);

// 3. Dine-in submission elapsed time
assert.equal(ctx.formatSubmissionElapsedTime({ createdAt: now }).key, 'dineInElapsedJustNow');
assert.equal(ctx.formatSubmissionElapsedTime({ createdAt: now - 10 * 60000 }).key, 'dineInElapsedMinutes');
assert.equal(ctx.formatSubmissionElapsedTime({ createdAt: now - 10 * 60000 }).min, 10);
assert.equal(ctx.formatSubmissionElapsedTime({ createdAt: now - 75 * 60000 }).key, 'dineInElapsedHours');
assert.equal(ctx.formatSubmissionElapsedTime({ createdAt: now - 75 * 60000 }).h, 1);
assert.equal(ctx.formatSubmissionElapsedTime({ createdAt: now - 75 * 60000 }).m, 15);
assert.equal(ctx.formatSubmissionElapsedTime({ createdAt: now - 120 * 60000 }).key, 'dineInElapsedHoursOnly');
assert.equal(ctx.formatSubmissionElapsedTime({ createdAt: now - 120 * 60000 }).h, 2);
assert.equal(ctx.formatSubmissionElapsedTime({ createdAt: now - 1702 * 60000 }).key, 'dineInElapsedDaysHours');
assert.equal(ctx.formatSubmissionElapsedTime({ createdAt: now - 1702 * 60000 }).d, 1);
assert.equal(ctx.formatSubmissionElapsedTime({ createdAt: now - 1702 * 60000 }).h, 4);
assert.equal(ctx.formatSubmissionElapsedTime({ createdAt: now - 3000 * 60000 }).key, 'dineInElapsedDays');
assert.equal(ctx.formatSubmissionElapsedTime({ createdAt: now - 3000 * 60000 }).d, 2);
assert.equal(ctx.formatSubmissionElapsedTime({ createdAt: now - 12000 * 60000 }).key, 'dineInElapsedWeeks');
assert.equal(ctx.formatSubmissionElapsedTime({ createdAt: now - 12000 * 60000 }).w, 1);

console.log('PASS: takeaway countdown independent of scheduling setting; dine-in elapsed; missing pickup stays unknown; relative time splits into minutes, hours, days, weeks');
