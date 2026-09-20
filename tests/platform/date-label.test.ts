import test from 'node:test';
import assert from 'node:assert/strict';
import {dateLabel} from '../../lib/date-label.ts';
test('calendar dates retain their day across extreme timezones', () => {
  const previous = process.env.TZ;
  try { for (const tz of ['America/Los_Angeles', 'Pacific/Kiritimati', 'UTC']) {
    process.env.TZ = tz;
    assert.equal(dateLabel('2026-10-20'), 'Oct 20, 2026');
    assert.equal(dateLabel('2026-01-01'), 'Jan 1, 2026');
    assert.equal(dateLabel('2024-02-29'), 'Feb 29, 2024');
  }} finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
});
test('blank, malformed, rolled-over and non-calendar dates stay explicitly unset', () => {
  for (const value of [null, undefined, '', '2026-02-29', '1900-02-29', '2026-04-31', '2026-00-10', '2026-13-01', '2026-01-00', '0000-01-01', '2026-1-1', '2026-01-01T00:00:00Z', 'garbage']) assert.equal(dateLabel(value), 'Date not set');
  assert.equal(dateLabel('2000-02-29'), 'Feb 29, 2000');
  assert.equal(dateLabel('0099-12-31'), 'Dec 31, 0099');
});
