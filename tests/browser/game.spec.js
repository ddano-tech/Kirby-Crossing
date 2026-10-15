import { test, expect } from "@playwright/test";
async function walk(page, key, ms) {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}
async function position(page) {
  return page.evaluate(() => window.__dreamside.player);
}
async function go(page, x, y) {
  for (let n = 0; n < 70; n++) {
    const p = await position(page);
    if (Math.hypot(p.x - x, p.y - y) < 9) return;
    const dx = x - p.x,
      dy = y - p.y,
      horizontal = Math.abs(dx) > Math.abs(dy),
      distance = Math.abs(horizontal ? dx : dy);
    await walk(
      page,
      horizontal ? (dx > 0 ? "d" : "a") : dy > 0 ? "s" : "w",
      Math.min(200, Math.max(30, (distance / 210) * 1000)),
    );
  }
  throw Error(
    "Could not reach " +
      x +
      "," +
      y +
      " from " +
      JSON.stringify(await position(page)),
  );
}
test("island loop: gathering, shop, garden, neighbors, home and save", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator("#area")).toContainText("ISLAND LIFE");
  await go(page, 1370, 1190);
  await page.keyboard.press("e");
  await expect
    .poll(() => page.evaluate(() => window.__dreamside.state.fruit))
    .toBe(3);
  await page.keyboard.press("e");
  await expect
    .poll(() => page.evaluate(() => window.__dreamside.state.wood))
    .toBe(2);
  await go(page, 1370, 1100);
  await go(page, 1050, 1100);
  await go(page, 1050, 1150);
  await page.keyboard.press("b");
  await page.getByRole("button", { name: /Plant a seed/ }).click();
  await expect
    .poll(() => page.evaluate(() => window.__dreamside.state.garden.length))
    .toBe(1);
  await page.keyboard.press("b");
  await page.getByRole("button", { name: "Place furniture" }).click();
  await expect
    .poll(() => page.evaluate(() => window.__dreamside.state.placed.length))
    .toBe(1);
  await go(page, 1150, 900);
  await go(page, 1200, 765);
  await page.keyboard.press("e");
  await expect(page.locator("#menu")).toContainText("Nook’s Market");
  await page.getByRole("button", { name: "Sell gathered items" }).click();
  await expect
    .poll(() => page.evaluate(() => window.__dreamside.state.bells))
    .toBe(240);
  await page.getByRole("button", { name: /Flower seeds/ }).click();
  await expect
    .poll(() => page.evaluate(() => window.__dreamside.state.bells))
    .toBe(200);
  await page.keyboard.press("Escape");
  await go(page, 1050, 710);
  await page.keyboard.press("e");
  await expect(page.locator("#dialog")).toContainText("Isabelle");
  await page.keyboard.press("e");
  await go(page, 850, 1000);
  await go(page, 640, 945);
  await page.keyboard.press("e");
  await expect(page.locator("#menu")).toContainText("Home, sweet home");
  await page.keyboard.press("Escape");
  await page.keyboard.press("b");
  await page.getByRole("button", { name: "Save & close" }).click();
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => window.__dreamside.state.bells))
    .toBe(200);
  await expect
    .poll(() => page.evaluate(() => window.__dreamside.state.placed.length))
    .toBe(1);
  expect(errors).toEqual([]);
  await page.screenshot({ path: "test-results/island.png", fullPage: true });
});
test("portal, platform movement, floating, exit and gamepad input", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.mockPad = null;
    navigator.getGamepads = () => (window.mockPad ? [window.mockPad] : []);
  });
  await page.goto("/");
  await go(page, 1050, 430);
  await page.keyboard.press("e");
  await expect(page.locator("#menu")).toContainText("Starfall Portal");
  await page.getByRole("button", { name: "01 · Peachwood Skyway" }).click();
  await expect
    .poll(() => page.evaluate(() => window.__dreamside.mode))
    .toBe("level");
  await page.waitForTimeout(600);
  const before = await position(page);
  await page.keyboard.down(" ");
  await walk(page, "d", 650);
  const floating = await position(page);
  await page.keyboard.up(" ");
  expect(floating.x).toBeGreaterThan(before.x + 90);
  expect(floating.y).toBeLessThan(before.y - 40);
  await page.screenshot({ path: "test-results/trail.png" });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Return to island" }).click();
  await expect
    .poll(() => page.evaluate(() => window.__dreamside.mode))
    .toBe("island");
  await page.evaluate(() => {
    window.mockPad = {
      id: "DualSense Wireless Controller",
      axes: [1, 0],
      buttons: Array.from({ length: 18 }, () => ({ pressed: false, value: 0 })),
    };
  });
  const start = await position(page);
  await page.waitForTimeout(350);
  expect((await position(page)).x).toBeGreaterThan(start.x + 40);
  await expect(page.locator("#controller")).toContainText(
    "Controller connected",
  );
  await page.evaluate(() => {
    window.mockPad.axes = [0, 0];
    window.mockPad.buttons[3] = { pressed: true, value: 1 };
  });
  await expect(page.locator("#menu")).toContainText("Your pockets");
  await page.evaluate(() => {
    window.mockPad.buttons[3] = { pressed: false, value: 0 };
    window.mockPad.buttons[1] = { pressed: true, value: 1 };
  });
  await expect(page.locator("#menu")).toBeHidden();
});
test("small screen controls and help", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator("#help").click();
  await expect(page.locator("#help-panel")).toBeVisible();
  await expect(page.locator("#help-panel")).toContainText("PS5");
  await page.locator("#close-help").click();
  await expect(page.locator("#help-panel")).toBeHidden();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
});

test("fishing timing, shell gathering and museum donation", async ({
  page,
}) => {
  await page.goto("/");
  await go(page, 1050, 1400);
  await go(page, 1099, 1434);
  await page.keyboard.press("e");
  await expect
    .poll(() => page.evaluate(() => window.__dreamside.state.shells))
    .toBe(1);
  await go(page, 1040, 1480);
  await page.keyboard.press("e");
  await expect(page.locator("#prompt")).toContainText("A BITE!", {
    timeout: 6000,
  });
  await page.keyboard.press("e");
  await expect
    .poll(() => page.evaluate(() => window.__dreamside.state.fish))
    .toBe(1);
  await go(page, 1260, 1320);
  await page.keyboard.press("e");
  await expect(page.locator("#menu")).toContainText("Dreamside Museum");
  await page.getByRole("button", { name: "Donate a fish" }).click();
  await expect
    .poll(() => page.evaluate(() => window.__dreamside.state.museum.fish))
    .toBe(true);
  await expect
    .poll(() => page.evaluate(() => window.__dreamside.state.fish))
    .toBe(0);
  await page.getByRole("button", { name: "Donate a fish" }).click();
  await expect
    .poll(() => page.evaluate(() => window.__dreamside.state.fish))
    .toBe(0);
  await page.getByRole("button", { name: "Donate a shell" }).click();
  await expect
    .poll(() => page.evaluate(() => window.__dreamside.state.museum.shell))
    .toBe(true);
});

for (const trail of [0, 1, 2])
  test(`complete trail ${trail + 1} with actual keyboard movement and bank rewards`, async ({
    page,
  }) => {
    await page.goto("/");
    await go(page, 1050, 430);
    await page.keyboard.press("e");
    await page.locator("#menu button").nth(trail).click();
    await expect
      .poll(() => page.evaluate(() => window.__dreamside.mode))
      .toBe("level");
    const base = [
      { x: 585, y: 420 },
      { x: 885, y: 350 },
      { x: 1220, y: 430 },
      { x: 1545, y: 340 },
      { x: 1850, y: 410 },
      { x: 2140, y: 330 },
      { x: 2440, y: 430 },
      { x: 2590, y: 430 },
    ];
    for (let i = 0; i < base.length; i++) {
      const target = base[i];
      const platformIndex = Math.min(i + 1, 7);
      const ground =
        target.y -
        (trail === 1
          ? (platformIndex % 2) * 45
          : trail === 2
            ? (platformIndex % 3) * 30
            : 0);
      for (let tick = 0; tick < 120; tick++) {
        if ((await page.evaluate(() => window.__dreamside.mode)) === "reward")
          break;
        const p = await position(page);
        if (Math.abs(p.x - target.x) < 12 && p.ground) break;
        await page.keyboard.up("d");
        await page.keyboard.up("a");
        if (Math.abs(p.x - target.x) > 10)
          await page.keyboard.down(p.x < target.x ? "d" : "a");
        if (
          ((Math.abs(p.x - target.x) > 12 && p.y > ground - 110) ||
            p.y > ground - 20) &&
          p.vy >= 0
        ) {
          await page.keyboard.up(" ");
          await page.keyboard.down(" ");
        }
        if (Math.abs(p.x - target.x) < 12 && p.y < ground - 50)
          await page.keyboard.up(" ");
        if (tick % 3 === 0) await page.keyboard.press("x");
        await page.waitForTimeout(80);
      }
    }
    await page.keyboard.up("d");
    await page.keyboard.up("a");
    await page.keyboard.up(" ");
    await expect
      .poll(() => page.evaluate(() => window.__dreamside.mode))
      .toBe("reward");
    await expect(page.locator("#dialog")).toContainText("Trail complete!");
    await expect
      .poll(() =>
        page.evaluate(
          (id) => window.__dreamside.state.completed.includes(id),
          trail,
        ),
      )
      .toBe(true);
    expect(
      await page.evaluate(() => window.__dreamside.state.bells),
    ).toBeGreaterThanOrEqual(370);
    await page.keyboard.press("e");
    await expect
      .poll(() => page.evaluate(() => window.__dreamside.mode))
      .toBe("island");
    await page.reload();
    await expect
      .poll(() =>
        page.evaluate(
          (id) => window.__dreamside.state.completed.includes(id),
          trail,
        ),
      )
      .toBe(true);
  });

test("storage and controller restrictions do not prevent keyboard play", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("Storage is blocked", "SecurityError");
      },
    });
    navigator.getGamepads = () => {
      throw new DOMException("Controllers are blocked", "SecurityError");
    };
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect.poll(() => page.evaluate(() => !!window.__dreamside)).toBe(true);
  const start = await position(page);
  await walk(page, "d", 250);
  expect((await position(page)).x).toBeGreaterThan(start.x + 25);
  await page.keyboard.press("b");
  await page.getByRole("button", { name: "Save & close" }).click();
  await expect(page.locator("#toast")).toContainText("Storage is unavailable");
  expect(errors).toEqual([]);
});

test("Kirby can inhale an enemy and fire the stored star", async ({ page }) => {
  await page.goto("/");
  await go(page, 1050, 430);
  await page.keyboard.press("e");
  await page.locator("#menu button").first().click();
  await page.waitForTimeout(500);
  await page.keyboard.down(" ");
  await walk(page, "d", 1640);
  await page.keyboard.up(" ");
  await expect
    .poll(async () => (await position(page)).ground, { timeout: 4000 })
    .toBe(true);
  await page.keyboard.press("x");
  await expect.poll(async () => (await position(page)).ability).toBe(true);
  await page.keyboard.press("x");
  await expect.poll(async () => (await position(page)).ability).toBe(false);
});
