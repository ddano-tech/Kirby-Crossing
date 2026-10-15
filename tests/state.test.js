import test from "node:test";
import assert from "node:assert/strict";
import {
  freshState,
  loadState,
  sell,
  buy,
  harvest,
  rewardLevel,
  SAVE_KEY,
} from "../src/state.js";
test("save loading tolerates corrupt storage and rejects invalid balances", () => {
  assert.deepEqual(loadState({ getItem: () => "{" }), freshState());
  const value = { ...freshState(), bells: -5, seeds: "oops", fruit: 9 };
  const loaded = loadState({ getItem: () => JSON.stringify(value) });
  assert.equal(loaded.bells, 120);
  assert.equal(loaded.seeds, 3);
  assert.equal(loaded.fruit, 9);
  assert.equal(SAVE_KEY, "kirby-crossing-v1");
});
test("selling pays correct value and cannot sell the same items twice", () => {
  const s = { ...freshState(), fruit: 3, fish: 2, shells: 4, wood: 2 };
  assert.equal(sell(s), 360);
  assert.equal(s.bells, 480);
  assert.equal(sell(s), 0);
  assert.equal(s.bells, 480);
});
test("purchases require funds and consume the advertised amount", () => {
  const s = freshState();
  assert.equal(buy(s, "seeds", 40), true);
  assert.equal(s.seeds, 4);
  assert.equal(s.bells, 80);
  assert.equal(buy(s, "furniture", 120), false);
  assert.equal(s.bells, 80);
});
test("crops mature after a minute and cannot be repeatedly harvested", () => {
  const s = freshState();
  s.garden.push({ x: 500, y: 500, time: 1000 });
  assert.equal(harvest(s, 0, 60000), false);
  assert.equal(harvest(s, 0, 61000), true);
  assert.equal(s.fruit, 3);
  assert.equal(harvest(s, 0, 61001), false);
});
test("first completion bonus only awarded once per trail", () => {
  const s = freshState();
  assert.equal(rewardLevel(s, 0), true);
  assert.equal(rewardLevel(s, 0), false);
  assert.equal(s.bells, 370);
  assert.equal(s.stars, 5);
  assert.equal(rewardLevel(s, 1), true);
});
