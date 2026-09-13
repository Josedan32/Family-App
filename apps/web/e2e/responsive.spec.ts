import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const ROUTES = ["/login", "/registro"];

for (const route of ROUTES) {
  test(`${route} has no accessibility violations`, async ({ page }) => {
    await page.goto(route);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test(`${route} never scrolls horizontally`, async ({ page }) => {
    for (const width of [375, 768, 1280]) {
      await page.setViewportSize({ width, height: 812 });
      await page.goto(route);
      const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(overflows, `horizontal overflow at ${width}px`).toBe(false);
    }
  });
}

test("the bottom nav clears the safe area on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/login");
  const usesVh = await page.evaluate(() =>
    [...document.styleSheets]
      .flatMap((sheet) => {
        try {
          return [...sheet.cssRules].map((rule) => rule.cssText);
        } catch {
          return [];
        }
      })
      .some((text) => /:\s*100vh/.test(text)),
  );
  // 100vh on iOS Safari is the height WITHOUT the toolbar.
  expect(usesVh).toBe(false);
});
