import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import "@fontsource/playfair-display/500.css";
import "@fontsource/playfair-display/500-italic.css";
import {
  loadState,
  SAVE_KEY,
  sell,
  buy,
  harvest,
  rewardLevel,
} from "./state.js";
const $ = (s) => document.querySelector(s),
  canvas = $("#game"),
  ctx = canvas.getContext("2d");
let state = loadState({ getItem: (key) => localStorage.getItem(key) }),
  W = 1200,
  H = 650,
  scale = 1,
  dpr = 1,
  time = 0,
  last = 0,
  mode = "island",
  level = 0,
  menuIndex = 0,
  toastUntil = 0,
  dialogOpen = false,
  menuActions = [],
  padPrevious = {},
  fishing = null,
  attack = 0,
  invincible = 0,
  levelStars = 0;
const keys = new Set(),
  pressed = new Set(),
  camera = { x: 0, y: 0 },
  player = {
    x: 1050,
    y: 1100,
    vx: 0,
    vy: 0,
    facing: 1,
    ground: false,
    hp: 5,
    ability: false,
  },
  world = { w: 2100, h: 1700 };
const trees = [
  [470, 420],
  [620, 340],
  [1480, 380],
  [1620, 530],
  [500, 700],
  [1510, 820],
  [600, 1030],
  [1370, 1190],
  [440, 1170],
  [1570, 1090],
  [770, 530],
  [1320, 520],
  [770, 1260],
  [1440, 670],
];
const villagers = [
  {
    name: "Maple",
    kind: "bear",
    x: 780,
    y: 790,
    color: "#b88b69",
    line: "This island feels brighter with you here! Bring me 3 pieces of fruit and we can have a picnic.",
    need: "fruit",
    amount: 3,
  },
  {
    name: "Rosie",
    kind: "cat",
    x: 1330,
    y: 1010,
    color: "#8298ca",
    line: "A pink superstar! So cute! Could you find 2 seashells for my beach collection?",
    need: "shells",
    amount: 2,
  },
  {
    name: "Isabelle",
    kind: "dog",
    x: 1050,
    y: 650,
    color: "#e5c16d",
    line: "Welcome to Dreamside! Your home is west of the plaza. The Starfall Portal is in the northern grove. Can you bring me a fish for our island welcome party?",
    need: "fish",
    amount: 1,
  },
];
const shells = Array.from({ length: 14 }, (_, i) => ({
  x: 350 + i * 107,
  y: 1400 + Math.sin(i * 2) * 34,
}));
const buildings = [
  {
    x: 640,
    y: 870,
    w: 150,
    h: 125,
    name: "YOUR HOME",
    type: "home",
    color: "#b4cfb6",
  },
  {
    x: 1200,
    y: 650,
    w: 170,
    h: 135,
    name: "NOOK’S MARKET",
    type: "shop",
    color: "#79a58f",
  },
  {
    x: 1260,
    y: 1220,
    w: 150,
    h: 125,
    name: "MUSEUM",
    type: "museum",
    color: "#b6aaa0",
  },
];
let platforms = [],
  enemies = [],
  starItems = [],
  goal;
function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch {
    toast("Storage is unavailable. Progress lasts only for this session.");
  }
}
function toast(t) {
  $("#toast").textContent = t;
  $("#toast").style.opacity = 1;
  toastUntil = time + 4;
}
function resize() {
  const r = canvas.getBoundingClientRect();
  W = r.width;
  H = r.height;
  dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  scale = Math.max(0.5, Math.min(W / 1100, H / 600));
  if (mode === "island") {
    camera.x = Math.max(
      0,
      Math.min(world.w - W / scale, player.x - W / scale / 2),
    );
    camera.y = Math.max(
      0,
      Math.min(world.h - H / scale, player.y - H / scale / 2),
    );
  }
}
new ResizeObserver(resize).observe(canvas);
function action(k) {
  pressed.add(k.toLowerCase());
}
addEventListener("keydown", (e) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key))
    e.preventDefault();
  if (!e.repeat) action(e.key);
  keys.add(e.key.toLowerCase());
});
addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
addEventListener("blur", () => {
  keys.clear();
  pressed.clear();
  last = 0;
});
for (const b of document.querySelectorAll("[data-key]")) {
  b.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    b.setPointerCapture(e.pointerId);
    keys.add(b.dataset.key);
    action(b.dataset.key);
  });
  for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
    b.addEventListener(event, () => keys.delete(b.dataset.key));
}
$("#help").onclick = () => {
  $("#help-panel").classList.toggle("hidden");
  keys.clear();
};
$("#close-help").onclick = () => $("#help-panel").classList.add("hidden");
function gamepad() {
  let pads = [];
  try {
    pads = navigator.getGamepads?.() || [];
  } catch {
    /* Keyboard play remains available when browser policy blocks controllers. */
  }
  const pad = Array.from(pads).find(Boolean);
  if (!pad) {
    $("#controller").textContent = "⌨ Keyboard ready · Connect a controller";
    padPrevious = {};
    return { x: 0, y: 0, jump: false };
  }
  $("#controller").textContent =
    "◉ Controller connected · DualSense compatible";
  const mapping = {
    0: "e",
    1: "escape",
    2: " ",
    3: "b",
    7: "x",
    9: "b",
    12: "arrowup",
    13: "arrowdown",
    14: "arrowleft",
    15: "arrowright",
  };
  for (const [i, k] of Object.entries(mapping)) {
    const held = pad.buttons[i]?.pressed;
    if (held && !padPrevious[i]) action(k);
    padPrevious[i] = held;
  }
  const direction =
    pad.axes[1] > 0.55 ? "arrowdown" : pad.axes[1] < -0.55 ? "arrowup" : null;
  if (
    direction &&
    (padPrevious.axis !== direction || time > (padPrevious.repeat || 0))
  ) {
    action(direction);
    padPrevious.repeat = time + 0.22;
  }
  padPrevious.axis = direction;
  const dead = (n) => (Math.abs(n || 0) > 0.18 ? n : 0);
  return {
    x:
      dead(pad.axes[0]) +
      (pad.buttons[15]?.pressed ? 1 : 0) -
      (pad.buttons[14]?.pressed ? 1 : 0),
    y:
      dead(pad.axes[1]) +
      (pad.buttons[13]?.pressed ? 1 : 0) -
      (pad.buttons[12]?.pressed ? 1 : 0),
    jump: pad.buttons[2]?.pressed,
  };
}
function closeUI() {
  dialogOpen = false;
  $("#dialog").classList.add("hidden");
  $("#menu").classList.add("hidden");
  menuActions = [];
}
function say(name, text) {
  closeUI();
  dialogOpen = true;
  const d = $("#dialog");
  d.replaceChildren();
  const h = document.createElement("h3");
  h.textContent = name;
  const p = document.createElement("p");
  p.textContent = text;
  const small = document.createElement("small");
  small.textContent = "E / × to continue";
  d.append(h, p, small);
  d.classList.remove("hidden");
}
function menu(title, description, items) {
  closeUI();
  menuIndex = 0;
  menuActions = items;
  const el = $("#menu");
  el.replaceChildren();
  const h = document.createElement("h2");
  h.textContent = title;
  const p = document.createElement("p");
  p.textContent = description;
  el.append(h, p);
  items.forEach(([label, fn], i) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.onclick = () => {
      fn();
      save();
    };
    b.onpointerenter = () => {
      menuIndex = i;
      selectMenu();
    };
    el.append(b);
  });
  const hint = document.createElement("small");
  hint.textContent = "↑ ↓ / D-pad to choose · E / × confirm · Esc / ○ close";
  el.append(hint);
  el.classList.remove("hidden");
  selectMenu();
}
function selectMenu() {
  document
    .querySelectorAll("#menu button")
    .forEach((b, i) => b.classList.toggle("selected", i === menuIndex));
  document
    .querySelector("#menu .selected")
    ?.scrollIntoView({ block: "nearest" });
}
function inventory() {
  menu(
    "Your pockets",
    `${state.bells} bells · ${state.stars} stars\nFruit ${state.fruit} · Fish ${state.fish} · Shells ${state.shells} · Wood ${state.wood}\nSeeds ${state.seeds} · Furniture ${state.furniture}`,
    [
      [
        `Plant a seed (${state.seeds})`,
        () => {
          if (mode !== "island") return toast("Plant back on your island.");
          if (!state.seeds) return toast("Pick up seeds at Nook’s Market.");
          if (
            player.y < 360 ||
            player.y > 1340 ||
            state.garden.some(
              (p) => Math.hypot(p.x - player.x, p.y - player.y) < 65,
            ) ||
            nearBuilding()
          )
            return toast("Find an open patch of grass.");
          state.seeds--;
          state.garden.push({ x: player.x, y: player.y, time: Date.now() });
          closeUI();
          toast("Planted! Your crop grows in one minute.");
        },
      ],
      [
        "Place furniture",
        () => {
          if (mode !== "island") return toast("Decorate back on your island.");
          if (!state.furniture) return toast("Buy furniture at the market.");
          if (nearBuilding() || player.y < 360 || player.y > 1340)
            return toast("Find an open patch of grass.");
          state.furniture--;
          state.placed.push({ x: player.x, y: player.y + 25 });
          closeUI();
          toast("A lovely spot for a garden bench.");
        },
      ],
      [
        "Sleep until tomorrow",
        () => {
          if (mode !== "island") return toast("Return home before resting.");
          state.day++;
          state.collected = {};
          player.hp = 5;
          closeUI();
          toast("A new island day! Fruit and shells have returned.");
        },
      ],
      [
        "Save & close",
        () => {
          save();
          closeUI();
          toast("Island saved in this browser.");
        },
      ],
    ],
  );
}
function shop() {
  menu("Nook’s Market", `Welcome, welcome! You have ${state.bells} bells.`, [
    [
      "Sell gathered items",
      () => {
        const earned = sell(state);
        toast(
          earned
            ? `Sold your finds for ${earned} bells!`
            : "Gather fruit, fish, shells, or wood to sell.",
        );
        shop();
      },
    ],
    [
      "Flower seeds · 40 bells",
      () => {
        toast(
          buy(state, "seeds", 40)
            ? "Seeds tucked into your pocket."
            : "You need 40 bells.",
        );
        shop();
      },
    ],
    [
      "Garden bench · 120 bells",
      () => {
        toast(
          buy(state, "furniture", 120)
            ? "Furniture tucked into your pocket."
            : "You need 120 bells.",
        );
        shop();
      },
    ],
    [
      "Improve home · 500 bells",
      () => {
        if (state.home >= 3) return toast("Your home is fully upgraded!");
        if (!buy(state, "home", 500)) return toast("Save up 500 bells first.");
        toast("Your home has a lovely new addition!");
        shop();
      },
    ],
    ["Leave shop", closeUI],
  ]);
}
function nearBuilding() {
  return buildings.some(
    (b) =>
      Math.abs(player.x - b.x) < b.w / 2 + 28 &&
      player.y > b.y - 100 &&
      player.y < b.y + 35,
  );
}
function nearby() {
  const p = player;
  if (Math.hypot(p.x - 1050, p.y - 335) < 110)
    return { label: "Enter Starfall Portal", run: () => levelSelect() };
  for (const b of buildings)
    if (Math.hypot(p.x - b.x, p.y - (b.y + 55)) < 110)
      return {
        label:
          b.type === "shop"
            ? "Visit Nook’s Market"
            : b.type === "home"
              ? "Visit your home"
              : "Visit the museum",
        run: () => {
          if (b.type === "shop") shop();
          else if (b.type === "home")
            menu(
              "Home, sweet home",
              `Your cozy island home · Level ${state.home}. Decorate outside with furniture from your pockets.`,
              [
                [
                  "Rest & restore hearts",
                  () => {
                    player.hp = 5;
                    closeUI();
                    toast("Feeling refreshed!");
                  },
                ],
                ["Open pockets", inventory],
                ["Step outside", closeUI],
              ],
            );
          else
            menu(
              "Dreamside Museum",
              "Donate your first finds to begin a little island collection.",
              [
                [
                  "Donate a fish",
                  () => {
                    if (state.museum.fish)
                      return toast("A fish is already on display.");
                    if (!state.fish)
                      return toast("Catch a fish by the shore first.");
                    state.fish--;
                    state.museum.fish = true;
                    toast("Your fish is now on display!");
                  },
                ],
                [
                  "Donate a shell",
                  () => {
                    if (state.museum.shell)
                      return toast("A shell is already on display.");
                    if (!state.shells)
                      return toast("Gather a shell from the beach.");
                    state.shells--;
                    state.museum.shell = true;
                    toast("Your shell is now on display!");
                  },
                ],
                ["Leave museum", closeUI],
              ],
            );
        },
      };
  for (const v of villagers)
    if (Math.hypot(p.x - v.x, p.y - v.y) < 75)
      return {
        label: `Talk to ${v.name}`,
        run: () => {
          if (!state.friendship[v.name] && state[v.need] >= v.amount) {
            state[v.need] -= v.amount;
            state.friendship[v.name] = 1;
            state.bells += 150;
            say(
              v.name,
              "You remembered! Thank you so much. Here are 150 bells for being such a wonderful neighbor.",
            );
          } else
            say(
              v.name,
              state.friendship[v.name]
                ? "It’s so good to see you again! There’s always a place for you on Dreamside."
                : v.line,
            );
          save();
        },
      };
  for (let i = 0; i < trees.length; i++) {
    const [x, y] = trees[i];
    if (Math.hypot(p.x - x, p.y - y) < 80)
      return {
        label: state.collected["t" + i]
          ? "Gather fallen wood"
          : "Shake fruit tree",
        run: () => {
          const k = "t" + i;
          if (!state.collected[k]) {
            state.fruit += 3;
            state.collected[k] = 1;
            toast("Picked 3 peaches!");
          } else if (!state.collected["w" + i]) {
            state.wood += 2;
            state.collected["w" + i] = 1;
            toast("Gathered 2 pieces of wood.");
          } else toast("This tree needs a new day to grow more.");
          save();
        },
      };
  }
  for (let i = 0; i < shells.length; i++) {
    const s = shells[i];
    if (!state.collected["s" + i] && Math.hypot(p.x - s.x, p.y - s.y) < 60)
      return {
        label: "Pick up seashell",
        run: () => {
          state.collected["s" + i] = 1;
          state.shells++;
          toast("A seashell for your collection.");
          save();
        },
      };
  }
  for (let i = 0; i < state.garden.length; i++) {
    const g = state.garden[i];
    if (Math.hypot(p.x - g.x, p.y - g.y) < 45)
      return {
        label: Date.now() - g.time >= 60000 ? "Harvest garden" : "Check garden",
        run: () => {
          toast(
            harvest(state, i, Date.now())
              ? "Harvested 3 sweet fruits!"
              : "Growing happily. Ready in " +
                  Math.ceil((60000 - (Date.now() - g.time)) / 1000) +
                  " seconds.",
          );
          save();
        },
      };
  }
  if (p.y > 1420 || p.x < 310 || p.x > 1790)
    return {
      label: "Cast fishing rod",
      run: () => {
        if (fishing) return;
        fishing = {
          start: time,
          bite: time + 1.5 + Math.random() * 2,
          x: player.x,
          y: player.y,
        };
        toast("Wait for a bite… then press E / ×!");
      },
    };
  return null;
}
function levelSelect() {
  menu(
    "The Starfall Portal",
    "Follow your island friends through three dreamy platforming trails.",
    [
      ["01 · Peachwood Skyway", () => startLevel(0)],
      ["02 · Moonlit Market", () => startLevel(1)],
      ["03 · Cloudtop Garden", () => startLevel(2)],
      ["Stay on the island", closeUI],
    ],
  );
}
function startLevel(n) {
  closeUI();
  level = n;
  mode = "level";
  player.x = 100;
  player.y = 340;
  player.vx = player.vy = 0;
  player.hp = 5;
  player.ability = false;
  camera.x = 0;
  levelStars = 0;
  fishing = null;
  platforms = [
    { x: 0, y: 470, w: 410 },
    { x: 470, y: 420, w: 230 },
    { x: 770, y: 350, w: 230 },
    { x: 1080, y: 430, w: 280 },
    { x: 1430, y: 340, w: 230 },
    { x: 1730, y: 410, w: 240 },
    { x: 2030, y: 330, w: 220 },
    { x: 2310, y: 430, w: 440 },
  ];
  if (n === 1)
    platforms = platforms.map((p, i) => ({ ...p, y: p.y - (i % 2) * 45 }));
  if (n === 2)
    platforms = platforms.map((p, i) => ({ ...p, y: p.y - (i % 3) * 30 }));
  enemies = [
    { x: 580, y: 0, left: 490, right: 670 },
    { x: 1200, y: 0, left: 1100, right: 1320 },
    { x: 1850, y: 0, left: 1750, right: 1930 },
    { x: 2460, y: 0, left: 2340, right: 2680 },
  ].map((e, i) => ({
    ...e,
    y: platforms[[1, 3, 5, 7][i]].y - 22,
    dir: 1,
    alive: true,
  }));
  starItems = platforms.slice(1).flatMap((p) =>
    [0, 1, 2].map((i) => ({
      x: p.x + 45 + i * 48,
      y: p.y - 80,
      taken: false,
    })),
  );
  goal = { x: 2590, y: platforms[7].y - 35 };
  toast("Collect stars, jump & float. R2 / X to inhale, then fire a star!");
}
function returnIsland() {
  mode = "island";
  player.x = 1050;
  player.y = 430;
  resize();
  player.vx = player.vy = 0;
  player.hp = 5;
  player.ability = false;
  closeUI();
  save();
}
function update(dt, pad) {
  if (pressed.has("escape")) {
    if (!$("#help-panel").classList.contains("hidden"))
      $("#help-panel").classList.add("hidden");
    else if (dialogOpen || menuActions.length) closeUI();
    else if (mode === "level")
      menu("A little breather", "Your island is always waiting for you.", [
        ["Keep adventuring", closeUI],
        ["Return to island", returnIsland],
      ]);
  }
  if (!$("#help-panel").classList.contains("hidden")) return;
  if (menuActions.length) {
    if (pressed.has("arrowdown") || pressed.has("s")) {
      menuIndex = (menuIndex + 1) % menuActions.length;
      selectMenu();
    }
    if (pressed.has("arrowup") || pressed.has("w")) {
      menuIndex = (menuIndex - 1 + menuActions.length) % menuActions.length;
      selectMenu();
    }
    if (pressed.has("e") || pressed.has("enter")) {
      const fn = menuActions[menuIndex]?.[1];
      fn?.();
      save();
    }
    return;
  }
  if (dialogOpen) {
    if (pressed.has("e") || pressed.has("enter")) closeUI();
    return;
  }
  if (pressed.has("b")) {
    inventory();
    return;
  }
  let mx =
    (keys.has("d") || keys.has("arrowright") ? 1 : 0) -
    (keys.has("a") || keys.has("arrowleft") ? 1 : 0) +
    pad.x;
  let my =
    (keys.has("s") || keys.has("arrowdown") ? 1 : 0) -
    (keys.has("w") || keys.has("arrowup") ? 1 : 0) +
    pad.y;
  mx = Math.max(-1, Math.min(1, mx));
  my = Math.max(-1, Math.min(1, my));
  if (mx) player.facing = Math.sign(mx);
  if (mode === "island") {
    const length = Math.max(1, Math.hypot(mx, my)),
      ox = player.x,
      oy = player.y;
    player.x = Math.max(
      270,
      Math.min(1830, player.x + (mx / length) * 210 * dt),
    );
    player.y = Math.max(
      290,
      Math.min(1480, player.y + (my / length) * 210 * dt),
    );
    if (
      buildings.some(
        (b) =>
          Math.abs(player.x - b.x) < b.w / 2 + 10 &&
          player.y > b.y - 75 &&
          player.y < b.y + 12,
      )
    ) {
      player.x = ox;
      player.y = oy;
    }
    if (pressed.has(" ")) player.vy = -220;
    player.vy += dt * 650;
    player.vx = Math.min(0, player.vx + player.vy * dt);
    if (player.vx === 0) player.vy = 0;
    const near = nearby();
    $("#prompt").style.display = near || fishing ? "block" : "none";
    $("#prompt").textContent = fishing
      ? time >= fishing.bite
        ? "E / × · A BITE! Reel it in!"
        : "Wait for the bobber…"
      : `E / × · ${near?.label || ""}`;
    if (fishing) {
      if (Math.hypot(player.x - fishing.x, player.y - fishing.y) > 60) {
        fishing = null;
        toast("Reeled in. Find another fishing spot.");
      } else if (time - fishing.bite > 1.5) {
        fishing = null;
        toast("The fish got away. Try again!");
      } else if (pressed.has("e") || pressed.has("enter")) {
        if (time >= fishing.bite) {
          state.fish++;
          toast("Caught a sea bass! Worth 80 bells.");
          save();
        } else toast("Too early! Let the fish bite first.");
        fishing = null;
      }
    } else if (pressed.has("e") || pressed.has("enter")) near?.run();
    camera.x += (player.x - W / scale / 2 - camera.x) * Math.min(1, dt * 7);
    camera.y += (player.y - H / scale / 2 - camera.y) * Math.min(1, dt * 7);
    camera.x = Math.max(0, Math.min(world.w - W / scale, camera.x));
    camera.y = Math.max(0, Math.min(world.h - H / scale, camera.y));
  } else {
    const oldY = player.y;
    player.vx = mx * 250;
    player.x = Math.max(20, Math.min(2715, player.x + player.vx * dt));
    const jump = keys.has(" ") || pad.jump;
    if (pressed.has(" ")) {
      player.vy = player.ground ? -460 : -260;
      player.ground = false;
    }
    if (jump && !player.ground && player.vy > 50) player.vy = 50;
    player.vy += dt * (jump ? 360 : 1050);
    player.y += player.vy * dt;
    player.ground = false;
    for (const p of platforms) {
      if (
        player.x + 20 > p.x &&
        player.x - 20 < p.x + p.w &&
        oldY + 25 <= p.y + 3 &&
        player.y + 25 >= p.y &&
        player.vy >= 0
      ) {
        player.y = p.y - 25;
        player.vy = 0;
        player.ground = true;
      }
    }
    if (pressed.has("x")) {
      attack = 0.35;
      if (player.ability) {
        let hit = false;
        for (const e of enemies)
          if (
            e.alive &&
            Math.abs(e.x - player.x) < 350 &&
            Math.abs(e.y - player.y) < 90 &&
            (e.x - player.x) * player.facing > 0
          ) {
            e.alive = false;
            hit = true;
          }
        player.ability = false;
        toast(hit ? "Star shot!" : "Whoosh!");
      } else {
        const e = enemies.find(
          (e) =>
            e.alive &&
            Math.abs(e.x - player.x) < 130 &&
            Math.abs(e.y - player.y) < 65 &&
            (e.x - player.x) * player.facing > 0,
        );
        if (e) {
          e.alive = false;
          player.ability = true;
          toast("Inhaled! Press X / R2 to fire a star.");
        }
      }
    }
    attack = Math.max(0, attack - dt);
    invincible = Math.max(0, invincible - dt);
    for (const e of enemies) {
      if (!e.alive) continue;
      e.x += e.dir * 55 * dt;
      if (e.x > e.right || e.x < e.left) e.dir *= -1;
      if (Math.hypot(player.x - e.x, player.y - e.y) < 37 && !invincible) {
        player.hp--;
        invincible = 1.6;
        player.vy = -260;
        player.x = Math.max(20, player.x - 50 * player.facing);
        toast("Ouch! Float over enemies or inhale them.");
      }
    }
    for (const s of starItems)
      if (!s.taken && Math.hypot(player.x - s.x, player.y - s.y) < 40) {
        s.taken = true;
        levelStars++;
      }
    if (player.y > 760 || player.hp <= 0) {
      player.hp = 5;
      player.x = 100;
      player.y = 320;
      player.vy = 0;
      invincible = 2;
      toast("A soft landing back at the start. Your collected stars are safe.");
    }
    if (Math.hypot(player.x - goal.x, player.y - goal.y) < 60) {
      state.stars += levelStars;
      const first = rewardLevel(state, level);
      state.bells += levelStars * 5;
      save();
      say(
        "A starry little victory",
        `Trail complete! ${levelStars} stars collected and ${levelStars * 5} bells earned.${first ? " First visit bonus: 250 bells and 5 stars!" : ""} Your friends are waiting back on the island.`,
      );
      mode = "reward";
    }
    camera.x +=
      (Math.max(0, Math.min(2750 - W / scale, player.x - (W / scale) * 0.35)) -
        camera.x) *
      Math.min(1, dt * 7);
    camera.y = 30;
    $("#prompt").style.display = "none";
  }
}
function ellipse(x, y, rx, ry, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}
function rect(x, y, w, h, color, r = 0) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}
function text(t, x, y, size = 12, color = "#49644b", align = "center") {
  ctx.fillStyle = color;
  ctx.font = `600 ${size}px 'DM Sans', sans-serif`;
  ctx.textAlign = align;
  ctx.fillText(t, x, y);
}
function star(x, y, r, color = "#f9df86") {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5,
      q = i % 2 ? r * 0.46 : r;
    ctx.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q);
  }
  ctx.closePath();
  ctx.fill();
}
function tree(x, y, index) {
  ellipse(x, y + 17, 49, 18, "#496f4930");
  rect(x - 9, y - 60, 18, 75, "#a67c56", 6);
  rect(x + 2, y - 45, 5, 54, "#8e6847", 3);
  ellipse(x, y - 85, 63, 56, "#6a9a69");
  ellipse(x - 26, y - 100, 39, 35, "#82ad78");
  ellipse(x + 22, y - 109, 38, 35, "#7faa71");
  ellipse(x - 7, y - 127, 33, 28, "#8db87a");
  if (!state.collected["t" + index])
    for (const [a, b] of [
      [-32, -84],
      [23, -106],
      [13, -60],
    ]) {
      ellipse(x + a, y + b, 10, 10, "#f2b29a");
      ellipse(x + a + 3, y + b - 3, 6, 7, "#f7c5a5");
    }
}
function house(b) {
  const { x, y, w, h } = b;
  ellipse(x, y + 30, w * 0.64, 24, "#426f4330");
  rect(x - w / 2, y - h * 0.65, w, h * 0.8, "#f0e8c8", 8);
  rect(x - w / 2 - 12, y - h * 0.7, w + 24, 15, "#e9ddbb", 4);
  ctx.fillStyle = b.color;
  ctx.beginPath();
  ctx.moveTo(x - w / 2 - 18, y - h * 0.65);
  ctx.lineTo(x - w / 2 + 10, y - h - 15);
  ctx.lineTo(x + w / 2 - 10, y - h - 15);
  ctx.lineTo(x + w / 2 + 18, y - h * 0.65);
  ctx.fill();
  for (let i = 0; i < 5; i++)
    rect(x - w / 2 + (i * w) / 5, y - h * 0.9, w / 5 - 4, 5, "#ffffff18", 2);
  rect(x - 19, y - 42, 38, 61, "#916d52", 20);
  ellipse(x + 10, y - 9, 3, 3, "#dbbe7b");
  for (const sx of [-1, 1]) {
    rect(x + sx * 49 - 14, y - 49, 28, 27, "#9fc6bf", 4);
    rect(x + sx * 49 - 1, y - 49, 2, 27, "#fff0d4");
    rect(x + sx * 49 - 14, y - 36, 28, 2, "#fff0d4");
  }
  rect(x - 63, y - 80, 126, 24, "#fff8da", 5);
  text(b.name, x, y - 64, 9, "#5b7055");
  if (b.type === "home" && state.home > 1) {
    rect(x + w / 2 - 5, y - 50, 45, 68, "#f0e8c8", 5);
    rect(x + w / 2 - 10, y - 63, 55, 16, b.color, 4);
  }
}
function villager(v) {
  const { x, y, color, kind } = v;
  ellipse(x, y + 21, 20, 7, "#4a704030");
  ellipse(x - 8, y + 16, 7, 6, "#906c55");
  ellipse(x + 8, y + 16, 7, 6, "#906c55");
  ellipse(x, y, 17, 21, kind === "dog" ? "#8cbb97" : "#e4c38e");
  if (kind === "cat") {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x - 18, y - 22);
    ctx.lineTo(x - 19, y - 51);
    ctx.lineTo(x - 2, y - 34);
    ctx.lineTo(x + 18, y - 51);
    ctx.lineTo(x + 18, y - 18);
    ctx.fill();
  } else {
    ellipse(
      x - 20,
      y - 28,
      kind === "dog" ? 9 : 11,
      kind === "dog" ? 23 : 11,
      color,
    );
    ellipse(
      x + 20,
      y - 28,
      kind === "dog" ? 9 : 11,
      kind === "dog" ? 23 : 11,
      color,
    );
  }
  ellipse(x, y - 26, 23, 21, color);
  ellipse(x - 7, y - 29, 2.4, 3.7, "#3b4140");
  ellipse(x + 7, y - 29, 2.4, 3.7, "#3b4140");
  ellipse(x, y - 20, 3, 2, "#514c43");
  ellipse(x - 13, y - 20, 4, 2, "#efbdab");
  ellipse(x + 13, y - 20, 4, 2, "#efbdab");
  rect(x - 11, y - 6, 22, 5, "#fff3d3", 2);
}
function kirby(x, y) {
  ellipse(x, y + 25, 25, 8, "#53604726");
  if (invincible > 0 && Math.floor(time * 10) % 2) return;
  const bob = mode === "island" ? player.vx : 0;
  y += bob;
  ellipse(x - 13, y + 18, 14, 9, "#cb6483");
  ellipse(x + 13, y + 18, 14, 9, "#d4718b");
  ellipse(x - 25, y + 2, 11, 9, "#f4a5bb");
  ellipse(x + 25, y + 2, 11, 9, "#f4a5bb");
  ellipse(x, y - 1, 26, 25, "#f5b1c6");
  ellipse(x - 7, y - 9, 4, 8, "#3a465e");
  ellipse(x + 7, y - 9, 4, 8, "#3a465e");
  ellipse(x - 7, y - 12, 1.5, 3, "#fff");
  ellipse(x + 7, y - 12, 1.5, 3, "#fff");
  ellipse(x - 16, y + 2, 5, 3, "#e789a8");
  ellipse(x + 16, y + 2, 5, 3, "#e789a8");
  if (attack > 0 && !player.ability)
    ellipse(x + player.facing * 12, y + 5, 6, 8, "#b34e77");
  else {
    ctx.strokeStyle = "#a85978";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(x, y + 1, 4, 0, Math.PI);
    ctx.stroke();
  }
  if (player.ability) star(x, y - 38, 10);
}
function portal(x, y) {
  ellipse(x, y + 20, 90, 25, "#556e7130");
  for (let i = 0; i < 7; i++)
    rect(x - 75 + i * 22, y + 13, 21, 16, "#d6d9bd", 3);
  ctx.save();
  ctx.translate(x, y - 65);
  ctx.shadowColor = "#c0a4ff";
  ctx.shadowBlur = 25;
  ellipse(0, 0, 55, 82, "#b7b4db");
  ellipse(0, 0, 45, 71, "#737eae");
  ellipse(0, 0, 37, 64, "#9dadd6");
  for (let i = 0; i < 12; i++) {
    const a = time * 0.35 + i * 2.4;
    star(
      Math.cos(a) * (15 + i * 2),
      Math.sin(a) * (25 + i * 3),
      3 + (i % 3),
      "#f3edd4",
    );
  }
  ctx.restore();
  rect(x - 104, y - 173, 208, 32, "#fff3cb", 8);
  text("✦ STARFALL PORTAL ✦", x, y - 152, 12, "#747c69");
  text("KIRBY’S DREAM TRAILS", x, y + 57, 9, "#697b69");
}
function drawIsland() {
  rect(0, 0, 2100, 1700, "#96c9ca");
  for (let i = 0; i < 70; i++) {
    const x = (i * 173 + Math.sin(time * 0.4 + i) * 12) % 2100,
      y = (i * 239) % 1700;
    rect(x, y, 22, 2, "#d1eddf60", 2);
  }
  rect(220, 230, 1660, 1320, "#e6d9ad", 180);
  rect(270, 260, 1560, 1140, "#abc88a", 140);
  rect(310, 290, 1480, 1070, "#bad197", 100);
  for (let i = 0; i < 500; i++) {
    const x = 340 + ((i * 137.4) % 1410),
      y = 310 + ((i * 197.7) % 1000);
    ellipse(x, y, 2, 2, i % 3 ? "#a1bc7b70" : "#d5e0ac80");
  }
  rect(1005, 430, 90, 880, "#d6cfab", 30);
  rect(680, 868, 630, 70, "#d6cfab", 35);
  rect(1015, 745, 305, 60, "#d6cfab", 20);
  ellipse(1050, 920, 125, 105, "#dcd4b6");
  ellipse(1050, 920, 107, 90, "#e7dfc2");
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    ellipse(1050 + Math.cos(a) * 83, 920 + Math.sin(a) * 68, 5, 5, "#c0b99d");
  }
  ellipse(1050, 920, 40, 31, "#98bdb0");
  ellipse(1050, 916, 31, 22, "#b4d7c6");
  ellipse(1050, 898, 10, 10, "#cde6ce");
  rect(1044, 871, 12, 27, "#c9d3b5", 5);
  ellipse(1050, 869, 23, 9, "#e5e3c6");
  for (let i = 0; i < 35; i++) {
    const x = 365 + ((i * 169) % 1370),
      y = 370 + ((i * 233) % 890);
    if (Math.abs(x - 1050) < 140) continue;
    for (let j = 0; j < 5; j++) {
      const a = (j * Math.PI * 2) / 5;
      ellipse(
        x + Math.cos(a) * 5,
        y + Math.sin(a) * 5,
        4,
        4,
        i % 3 === 0 ? "#eab4ac" : "#f6edce",
      );
    }
    ellipse(x, y, 2, 2, "#dfbe6a");
  }
  portal(1050, 335);
  for (let i = 0; i < shells.length; i++)
    if (!state.collected["s" + i]) {
      const s = shells[i];
      ellipse(s.x, s.y, 11, 7, "#fff0d2");
      for (let j = 0; j < 4; j++) {
        ctx.strokeStyle = "#d7bf9d";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y + 5);
        ctx.lineTo(s.x - 7 + j * 4, s.y - 4);
        ctx.stroke();
      }
    }
  for (const g of state.garden) {
    rect(g.x - 17, g.y - 9, 34, 22, "#9b8660", 5);
    if (Date.now() - g.time >= 60000) {
      for (const [a, b] of [
        [-8, -9],
        [8, -14],
        [0, -22],
      ])
        ellipse(g.x + a, g.y + b, 7, 7, "#edb69b");
    } else {
      rect(g.x - 2, g.y - 19, 4, 15, "#689369", 2);
      ellipse(g.x - 6, g.y - 17, 7, 4, "#77a36b");
      ellipse(g.x + 6, g.y - 22, 7, 4, "#77a36b");
    }
  }
  const objects = [
    ...trees.map(([x, y], i) => ({ y, draw: () => tree(x, y, i) })),
    ...buildings.map((b) => ({ y: b.y, draw: () => house(b) })),
    ...villagers.map((v) => ({ y: v.y, draw: () => villager(v) })),
    ...state.placed.map((p) => ({
      y: p.y,
      draw: () => {
        rect(p.x - 28, p.y - 15, 56, 12, "#a4805b", 3);
        rect(p.x - 27, p.y - 36, 54, 16, "#bd9c6b", 3);
        rect(p.x - 22, p.y - 2, 5, 14, "#8a7653");
        rect(p.x + 17, p.y - 2, 5, 14, "#8a7653");
      },
    })),
    { y: player.y, draw: () => kirby(player.x, player.y) },
  ];
  objects.sort((a, b) => a.y - b.y).forEach((o) => o.draw());
  if (fishing) {
    ctx.strokeStyle = "#e9e6cf";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(player.x + 12, player.y - 10);
    ctx.lineTo(player.x + 65, player.y + 45);
    ctx.stroke();
    ellipse(
      player.x + 65,
      player.y + 45 + Math.sin(time * 8) * 3,
      6,
      4,
      time >= fishing.bite ? "#ed9079" : "#e7d6b0",
    );
    if (time >= fishing.bite)
      text("!", player.x + 65, player.y + 20, 28, "#fff3c9");
  }
  // Northern direction marker remains visible on the island path.
  rect(1130, 500, 110, 35, "#b89c70", 4);
  text("↑ PORTAL", 1185, 523, 12, "#fff3cc");
  rect(1180, 535, 8, 35, "#a68c63", 2);
}
function drawLevel() {
  const bg = level === 1 ? "#8595b4" : level === 2 ? "#a1c6c3" : "#b5d6cc";
  rect(-1000, -500, 6000, 2000, bg);
  for (let i = 0; i < 18; i++) {
    const x = i * 240 - 100 + ((time * 3) % 120),
      y = 70 + ((i * 73) % 240);
    ellipse(x, y, 65, 18, "#f6f3df55");
    ellipse(x - 20, y - 10, 30, 20, "#f6f3df55");
  }
  for (const p of platforms) {
    rect(p.x, p.y, p.w, 180, "#b5a17b", 15);
    rect(p.x, p.y, p.w, 23, "#87ae7d", 12);
    rect(p.x + 10, p.y + 22, p.w - 20, 7, "#d0c39d", 3);
    for (let i = 0; i < p.w / 50; i++)
      ellipse(p.x + 25 + i * 50, p.y + 60 + (i % 3) * 27, 5, 3, "#97876b40");
    if (p.x > 0) {
      tree(p.x + p.w - 45, p.y - 2, 100);
      rect(p.x + 12, p.y - 25, 30, 21, "#d9c7a7", 3);
      text("✿", p.x + 27, p.y - 10, 15, "#829c70");
    }
  }
  for (const s of starItems)
    if (!s.taken) star(s.x, s.y + Math.sin(time * 3 + s.x) * 5, 12);
  for (const e of enemies)
    if (e.alive) {
      ellipse(e.x - 8, e.y + 18, 9, 5, "#a67d59");
      ellipse(e.x + 8, e.y + 18, 9, 5, "#a67d59");
      ellipse(e.x, e.y, 20, 20, "#e7ac78");
      ellipse(e.x, e.y + 2, 13, 14, "#f1d6ac");
      ellipse(e.x - 5, e.y - 3, 2.5, 4, "#51544d");
      ellipse(e.x + 5, e.y - 3, 2.5, 4, "#51544d");
    }
  const friend = {
    name: "Isabelle",
    kind: "dog",
    x: 2480,
    y: platforms[7].y - 10,
    color: "#e5c16d",
  };
  villager(friend);
  portal(goal.x, goal.y + 30);
  kirby(player.x, player.y);
  if (attack > 0) {
    star(
      player.x + player.facing * (60 + (1 - attack / 0.35) * 120),
      player.y,
      18,
      "#fff0a9",
    );
  }
  text("FLOAT WITH SPACE / □", 180, 390, 11, "#587d70");
}
function render() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  ctx.scale(scale, scale);
  ctx.translate(-camera.x, -camera.y);
  if (mode === "island") drawIsland();
  else drawLevel();
  ctx.restore();
  $("#bells").textContent = state.bells.toLocaleString();
  $("#hearts").textContent = "♥".repeat(Math.max(0, player.hp));
  $("#stars").textContent =
    ` · ✦ ${state.stars + (mode === "level" ? levelStars : 0)} stars`;
  $("#area").textContent =
    mode === "island" ? "✿ ISLAND LIFE" : "✦ DREAM TRAILS";
  $("#location").textContent =
    mode === "island"
      ? "Dreamside Island"
      : ["Peachwood Skyway", "Moonlit Market", "Cloudtop Garden"][level];
  $("#objective").textContent =
    mode === "island"
      ? state.completed.length
        ? "Grow your island. There’s always another adventure."
        : "Meet your neighbors. Find the Starfall Portal."
      : "Collect stars. Inhale enemies. Reach the far portal.";
  $("#season").textContent =
    mode === "island"
      ? `☀ Island day ${state.day + 1} · Take life at your pace`
      : `✦ Trail ${level + 1} / 3 · ${levelStars} stars collected`;
  if (time > toastUntil) $("#toast").style.opacity = 0;
}
function frame(now) {
  const dt = Math.min((now - last) / 1000 || 0, 0.04);
  last = now;
  time += dt;
  const pad = gamepad();
  if (mode === "reward") {
    if (
      dialogOpen &&
      (pressed.has("e") || pressed.has("enter") || pressed.has("escape"))
    )
      returnIsland();
  } else update(dt, pad);
  render();
  pressed.clear();
  requestAnimationFrame(frame);
}
resize();
requestAnimationFrame(frame);
$("#clock").textContent = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
}).format(new Date());
addEventListener("pagehide", save);
setInterval(save, 15000);
toast("Welcome home! E / × to interact · ? for controls");
// Read-only state exposure lets browser smoke tests verify actual gameplay outcomes.
window.__dreamside = {
  get state() {
    return JSON.parse(JSON.stringify(state));
  },
  get player() {
    return { ...player };
  },
  get mode() {
    return mode;
  },
  get camera() {
    return { ...camera };
  },
};
