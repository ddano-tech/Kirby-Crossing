import test from 'node:test';
import assert from 'node:assert/strict';
import {gamepadInput, forGame} from './static/mapping.js';

test('standard DualSense layout maps face buttons, options, direction and stick', () => {
  const buttons = Array.from({length: 17}, (_, i) => ({pressed: [0, 1, 9, 12].includes(i)}));
  assert.deepEqual(gamepadInput({connected: true, mapping: 'standard', buttons, axes: [.6, -.8]}),
    {buttons: ['B', 'A', 'START', 'D_UP'], stick: [.6, .8], cstick: [0, -0]});
});
test('unknown and disconnected controllers produce neutral input', () => {
  for (const pad of [null, {connected: false}, {connected: true, mapping: ''}]) {
    assert.deepEqual(gamepadInput(pad), {buttons: [], stick: [0, 0], cstick: [0, 0]});
  }
});
test('stick drift and invalid axes cannot send unintended movement', () => {
  assert.deepEqual(gamepadInput({connected: true, mapping: 'standard', buttons: [], axes: [.1, NaN]}).stick, [0, -0]);
});
test('Kirby receives digital movement while Animal Crossing keeps analog input', () => {
  const input = {buttons: ['A'], stick: [-1, 0]};
  assert.deepEqual(forGame('kirby64-vc', input), {buttons: ['A', 'D_LEFT'], stick: [-1, 0]});
  assert.deepEqual(forGame('animal-crossing', input), input);
});
