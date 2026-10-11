import test from 'node:test';
import assert from 'node:assert/strict';
import { TransportQuality, observationTime, distanceMetres, classifyRoute } from '../js/utils/transport-quality.js';
const now = 1_800_000_000_000;
const point = (metres, seconds, extra = {}) => ({ id: 'a', routeId: 'BUS-75', position: [174.76, -36.85 + metres / 111_195], timestamp: (now + seconds * 1000) / 1000, reportedSpeed: 100, ...extra });
function step(store, metres, seconds, extra) { return store.process([point(metres, seconds, extra)], now + seconds * 1000)[0]; }

test('uses observation timestamps and GPS displacement instead of a 360 km/h feed reading', () => {
  const store = new TransportQuality();
  assert.equal(step(store, 0, 0).speed, null);
  const moving = step(store, 100, 10);
  assert.ok(Math.abs(moving.speed - 10) < .1);
  assert.equal(moving.speedSource, 'estimated');
});
test('repeated or out-of-order observation cannot create an artificial speed or move the anchor', () => {
  const store = new TransportQuality();
  step(store, 0, 0);
  const moving = step(store, 100, 10);
  const duplicate = step(store, 500, 10);
  assert.deepEqual(duplicate.position, moving.position);
  assert.equal(duplicate.speed, moving.speed);
  const older = step(store, 50, 5);
  assert.deepEqual(older.position, moving.position);
});
test('rejects GPS teleport, recovers against last accepted anchor, and does not draw return spike', () => {
  const store = new TransportQuality();
  step(store, 0, 0); step(store, 100, 10);
  const jump = step(store, 5000, 20);
  assert.equal(jump.speed, null);
  assert.equal(jump.positionQuality, 'rejected');
  assert.equal(jump.timestamp, now + 10_000);
  assert.deepEqual(jump.position, point(100, 10).position);
  assert.ok(Math.abs(step(store, 300, 30).speed - 10) < .1);
});
test('rejects excessive inferred acceleration even when absolute speed is below ceiling', () => {
  const store = new TransportQuality();
  step(store, 0, 0); step(store, 20, 10);
  assert.equal(step(store, 420, 20).positionQuality, 'rejected');
});
test('GPS jitter produces a stop and stale or missing timestamps make speed unavailable', () => {
  const store = new TransportQuality();
  step(store, 0, 0); step(store, 100, 10);
  assert.equal(step(store, 104, 20).speed, 0);
  const stale = store.process([point(104, 20)], now + 150_000)[0];
  assert.equal(stale.speed, null);
  assert.equal(store.process([point(104, 20, { timestamp: null })], now + 20_000)[0].speed, null);
});
test('gaps reset estimates; a persistently displaced vehicle can re-anchor after two minutes', () => {
  const store = new TransportQuality();
  step(store, 0, 0); step(store, 100, 10);
  assert.equal(step(store, 5000, 20).speed, null);
  assert.equal(step(store, 5100, 140).speed, null);
  assert.ok(Math.abs(step(store, 5200, 150).speed - 10) < .1);
});
test('median suppresses a plausible isolated speed spike', () => {
  const store = new TransportQuality();
  step(store, 0, 0); step(store, 100, 10); step(store, 200, 20);
  assert.ok(Math.abs(step(store, 450, 30).speed - 10) < .1);
});
test('timestamp normalization, route uncertainty and distance handle expected formats', () => {
  assert.equal(observationTime(now / 1000), now);
  assert.equal(observationTime(now), now);
  assert.equal(observationTime('bad'), null);
  assert.equal(classifyRoute('MTIA-209'), 'unknown');
  assert.equal(classifyRoute('FERRY-1'), 'ferry');
  assert.equal(classifyRoute('WEST-1'), 'train');
  assert.equal(distanceMetres([174.76, -36.85], [174.76, -36.85]), 0);
});
