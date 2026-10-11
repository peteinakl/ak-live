import test from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedTrafficTile, budgetDay, isFresh } from '../worker/limits.js';

test('traffic tiles over central Auckland are allowed', () => {
  // z14 tile covering the CBD (174.76, -36.85)
  assert.equal(isAllowedTrafficTile(14, 16145, 9998), true);
  assert.equal(isAllowedTrafficTile(10, 1009, 624), true);
});

test('traffic tiles outside zoom range or Auckland are rejected', () => {
  assert.equal(isAllowedTrafficTile(9, 504, 313), false);
  assert.equal(isAllowedTrafficTile(16, 32290, 20046), false);
  // z14 tile over Wellington (174.78, -41.29)
  assert.equal(isAllowedTrafficTile(14, 16146, 10258), false);
  assert.equal(isAllowedTrafficTile(14, 1.5, 9998), false);
});

test('budget day rolls over at UTC midnight', () => {
  assert.equal(budgetDay(Date.UTC(2026, 9, 11, 23, 59)), '2026-10-11');
  assert.equal(budgetDay(Date.UTC(2026, 9, 12, 0, 0)), '2026-10-12');
});

test('a fetch is fresh only within its TTL', () => {
  const now = 1_000_000;
  assert.equal(isFresh(now - 19_000, 20, now), true);
  assert.equal(isFresh(now - 20_000, 20, now), false);
  assert.equal(isFresh(0, 20, now), false);
});
