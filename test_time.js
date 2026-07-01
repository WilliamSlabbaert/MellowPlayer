// node test_time.js — sanity check for time parsing/formatting.
const a = require('assert');

function parseTime(s) {
  if (typeof s === 'number') return isFinite(s) ? s : NaN;
  s = String(s ?? '').trim();
  if (!s) return NaN;
  if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s);
  const parts = s.split(':').map(p => p.trim());
  if (parts.some(p => !/^\d+(\.\d+)?$/.test(p))) return NaN;
  const nums = parts.map(Number);
  if (nums.length === 2) return nums[0] * 60 + nums[1];
  if (nums.length === 3) return nums[0] * 3600 + nums[1] * 60 + nums[2];
  return NaN;
}
function fmt(t) {
  if (!isFinite(t)) return '0:00';
  t = Math.max(0, Math.floor(t));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  const mm = h ? String(m).padStart(2, '0') : String(m);
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

a.strictEqual(parseTime('90'), 90);
a.strictEqual(parseTime('1:30'), 90);
a.strictEqual(parseTime('1:00:00'), 3600);
a.strictEqual(parseTime('0:05.5'), 5.5);
a.strictEqual(parseTime(0), 0);
a.strictEqual(parseTime(42.5), 42.5);
a.ok(Number.isNaN(parseTime('abc')));
a.ok(Number.isNaN(parseTime('')));
a.ok(Number.isNaN(parseTime(null)));
a.ok(Number.isNaN(parseTime(Infinity)));
a.strictEqual(fmt(0), '0:00');
a.strictEqual(fmt(65), '1:05');
a.strictEqual(fmt(3661), '1:01:01');
a.strictEqual(fmt(NaN), '0:00');
console.log('ok');
