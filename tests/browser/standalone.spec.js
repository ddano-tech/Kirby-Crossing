import { test, expect } from "@playwright/test";
test("self-contained production HTML needs no external resources and persists gameplay", async ({
  page,
}) => {
  const errors = [],
    network = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("http**://**/*", (route) => {
    if (route.request().isNavigationRequest()) return route.continue();
    network.push(route.request().url());
    route.abort();
  });
  await page.goto("http://127.0.0.1:4173");
  await expect.poll(() => page.evaluate(() => !!window.__dreamside)).toBe(true);
  await page.context().setOffline(true);
  await page.keyboard.press("b");
  await expect(page.locator("#menu")).toContainText("Your pockets");
  await page.getByRole("button", { name: /Plant a seed/ }).click();
  await expect
    .poll(() => page.evaluate(() => window.__dreamside.state.garden.length))
    .toBe(1);
  await page.context().setOffline(false);
  await page.reload();
  await page.context().setOffline(true);
  await expect
    .poll(() => page.evaluate(() => window.__dreamside.state.garden.length))
    .toBe(1);
  expect(network).toEqual([]);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: "test-results/standalone.png",
    fullPage: true,
  });
});
