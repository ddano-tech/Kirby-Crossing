export const SAVE_KEY = "kirby-crossing-v1";
export function freshState() {
  return {
    version: 1,
    bells: 120,
    fruit: 0,
    fish: 0,
    shells: 0,
    wood: 0,
    seeds: 3,
    furniture: 2,
    stars: 0,
    home: 1,
    friendship: {},
    garden: [],
    placed: [],
    collected: {},
    completed: [],
    museum: { fish: false, shell: false },
    day: 0,
  };
}
export function loadState(storage) {
  try {
    const s = JSON.parse(storage.getItem(SAVE_KEY));
    if (s?.version !== 1) return freshState();
    const clean = freshState();
    for (const k of [
      "bells",
      "fruit",
      "fish",
      "shells",
      "wood",
      "seeds",
      "furniture",
      "stars",
      "home",
      "day",
    ])
      if (Number.isFinite(s[k]) && s[k] >= 0) clean[k] = s[k];
    for (const k of ["garden", "placed", "completed"])
      if (Array.isArray(s[k])) clean[k] = s[k];
    for (const k of ["friendship", "collected", "museum"])
      if (s[k] && typeof s[k] === "object" && !Array.isArray(s[k]))
        clean[k] = s[k];
    return clean;
  } catch {
    return freshState();
  }
}
export function sell(s) {
  const earned = s.fruit * 30 + s.fish * 80 + s.shells * 20 + s.wood * 15;
  s.bells += earned;
  s.fruit = s.fish = s.shells = s.wood = 0;
  return earned;
}
export function buy(s, item, cost) {
  if (s.bells < cost) return false;
  s.bells -= cost;
  s[item]++;
  return true;
}
export function harvest(s, index, now) {
  const p = s.garden[index];
  if (!p || now - p.time < 60000) return false;
  s.fruit += 3;
  p.time = now;
  return true;
}
export function rewardLevel(s, level) {
  if (s.completed.includes(level)) return false;
  s.completed.push(level);
  s.bells += 250;
  s.stars += 5;
  return true;
}
