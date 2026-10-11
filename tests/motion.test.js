import test from 'node:test';
import assert from 'node:assert/strict';
import { MotionStore } from '../js/utils/motion.js';
const entity = (id, x, heading = 0) => ({ id, position: [x, 0], bearing: heading });
test('interpolation follows stable IDs when feed ordering changes', () => {
  const store = new MotionStore(100);
  store.update([entity('a', 0), entity('b', 20)], 'id', 0);
  store.update([entity('b', 30), entity('a', 10)], 'id', 10);
  const data = store.get(60);
  assert.equal(data.find(d => d.id === 'a').position[0], 5);
  assert.equal(data.find(d => d.id === 'b').position[0], 25);
});
test('heading takes shortest arc; positions stop at observation without extrapolation', () => {
  const store = new MotionStore(100);
  store.update([entity('a', 0, 350)], 'id', 0);
  store.update([entity('a', 10, 10)], 'id', 10);
  assert.equal(store.get(60)[0].bearing, 0);
  assert.equal(store.get(300)[0].position[0], 10);
  assert.equal(store.isAnimating(300), false);
});
test('new updates begin at rendered point; new IDs and reduced motion appear directly', () => {
  const store = new MotionStore(100);
  store.update([entity('a', 0)], 'id', 0);
  store.update([entity('a', 10)], 'id', 10);
  store.update([entity('a', 20), entity('c', 42)], 'id', 60);
  assert.equal(store.get(60).find(d => d.id === 'a').position[0], 5);
  assert.equal(store.get(60).find(d => d.id === 'c').position[0], 42);
  store.update([entity('a', 40)], 'id', 80, true);
  assert.deepEqual(store.get(80).map(d => d.position[0]), [40]);
});
