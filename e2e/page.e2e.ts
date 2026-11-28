import { readFileSync } from "node:fs";
import {
  expect,
  gotoAllOpen,
  recording,
  SECTIONS,
  settled,
  sidewaysOverflow,
  test,
} from "./helpers";

// The page as a whole: its wrapper, its style and its width with everything open.
// Runs at phone and desktop width, in light and dark mode (see playwright.config.ts).

test("has the title of the project, the heading of the calculator and the licence in its footer", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Acuteping - Sonar Geometry Calculator");
  await expect(page.locator("h1")).toHaveText("Sonar Geometry Calculator");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
    "content",
    "width=device-width, initial-scale=1, viewport-fit=cover",
  );
  await expect(page.locator("footer .lic")).toContainText(
    "Required Notice: Copyright 2026 Adam Smolowicz",
  );
  // The calculator's markup stands directly in the body, and the script comes after it.
  expect(await page.evaluate(() => document.body.firstElementChild?.className)).toBe("wrap");
  expect(await page.evaluate(() => document.body.lastElementChild?.localName)).toBe("script");
  expect(await page.evaluate(() => getComputedStyle(document.body).margin)).toBe("0px");
});

test("shows the version of package.json in its footer", async ({ page }) => {
  const { version } = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
  expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  await page.goto("/");
  const line = page.locator("footer .ver");
  await expect(line).toHaveCount(1);
  await expect(line).toBeVisible();
  await expect(line).toHaveText(`Version ${version}.`);
  // The line holds no link: the footer's links are the ones the next test counts.
  await expect(line.locator("a")).toHaveCount(0);
});

test("links its footer to the public repository and to the licence text and the changelog in it, and to nothing else", async ({
  page,
}) => {
  await page.goto("/");
  const links = page.locator("footer a");
  // The licence paragraph already links to the licence's own page; the source paragraph adds three.
  await expect(links).toHaveCount(4);
  const repository = "https://github.com/factoincognito/acuteping-web";
  const source = page.locator("footer .src");
  await expect(source).toHaveCount(1);
  const hrefs = await source.locator("a").evaluateAll((anchors) =>
    anchors.map((a) => ({
      href: a.getAttribute("href"),
      target: a.getAttribute("target"),
      rel: a.getAttribute("rel"),
    })),
  );
  expect(hrefs).toEqual([
    { href: repository, target: "_blank", rel: "noopener" },
    { href: `${repository}/blob/main/LICENSE`, target: "_blank", rel: "noopener" },
    { href: `${repository}/blob/main/CHANGELOG.md`, target: "_blank", rel: "noopener" },
  ]);
  // Every link of the footer is shown and can be reached by keyboard.
  for (const link of await links.all()) {
    await expect(link).toBeVisible();
    await expect(link).not.toHaveAttribute("tabindex", /.*/);
  }
});

test("resolves every custom property of the style to the value the earlier page had", async ({
  page,
  colorScheme,
}) => {
  await page.goto("/");
  const theme = recording("all-open", colorScheme === "dark" ? "dark" : "light").scenario.theme;
  const resolved = await page.evaluate((names) => {
    const style = getComputedStyle(document.documentElement);
    return Object.fromEntries(names.map((name) => [name, style.getPropertyValue(name).trim()]));
  }, Object.keys(theme));
  expect(resolved).toEqual(theme);
  // No custom property besides those: the build adds none of its own.
  const named = await page.evaluate(() => {
    const names = new Set<string>();
    const walk = (rules: CSSRuleList): void => {
      for (const rule of rules) {
        if (rule instanceof CSSStyleRule) {
          for (const name of rule.style) if (name.startsWith("--")) names.add(name);
        }
        if (rule instanceof CSSGroupingRule) walk(rule.cssRules);
      }
    };
    for (const sheet of document.styleSheets) walk(sheet.cssRules);
    return [...names].sort();
  });
  expect(named).toEqual(Object.keys(theme).sort());
});

test("uses the fonts the style names, without a web font", async ({ page }) => {
  await page.goto("/");
  const families = await page.evaluate(() => ({
    body: getComputedStyle(document.body).fontFamily,
    heading: getComputedStyle(document.querySelector("h1") as Element).fontFamily,
    links: document.querySelectorAll('link[rel="stylesheet"], link[rel="preconnect"]').length,
  }));
  expect(families.body).toBe('Barlow, system-ui, -apple-system, "Segoe UI", sans-serif');
  expect(families.heading).toBe(
    '"Barlow Semi Condensed", "Arial Narrow", "Helvetica Neue", sans-serif',
  );
  expect(families.links).toBe(0);
});

test("stays inside the viewport with every section and card open", async ({ page }) => {
  await gotoAllOpen(page);
  for (const section of SECTIONS) {
    await expect(page.locator(`#sec-${section}`)).toHaveAttribute("open", "");
  }
  // The beams of the live sonar are drawn a moment after the section.
  await expect(page.locator("#bvF-t")).not.toBeEmpty();
  await settled(page);
  expect(await sidewaysOverflow(page), "page scrolls sideways").toBeLessThanOrEqual(0);
});

test("stays inside the viewport with the beam angles and the beam choices open", async ({
  page,
}) => {
  await gotoAllOpen(page);
  await page.locator('details[data-sub="ang-h"] > summary').click();
  await page.locator("#ang-dlg .dlg-ok").click();
  await expect(page.locator('details[data-sub="ang-h"]')).toHaveAttribute("open", "");
  for (const card of ["behind", "fp", "side", "v3"]) {
    await page.locator(`details[data-sub="${card}"] [data-tosel]`).click();
    await expect(page.locator(`details[data-sub="${card}"] [data-inlsel]`)).toBeVisible();
  }
  await settled(page);
  expect(await sidewaysOverflow(page), "page scrolls sideways").toBeLessThanOrEqual(0);
});
