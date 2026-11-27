import type { Page } from "@playwright/test";
import { expect, gotoAllOpen, settled, sidewaysOverflow, test } from "./helpers";

// The layout of the page in the states the legacy checks t1 to t8 looked at: nothing
// sticks out of its panel or card title, and the page does not scroll sideways.
// Runs at phone and desktop width, in light and dark mode (see playwright.config.ts).

/**
 * One line for each element that sticks out of its panel or the title of its
 * section by more than a pixel, on either side. Pictures are boxes of their own:
 * what is drawn inside an `svg` is not looked at, the `svg` itself is.
 */
async function stickingOut(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const found = new Set<string>();
    for (const box of document.querySelectorAll<HTMLElement>(".panel, details.sec > summary")) {
      if (!box.offsetParent) continue;
      const frame = box.getBoundingClientRect();
      for (const el of box.querySelectorAll<Element>("*")) {
        if (el.closest("svg") && el.localName !== "svg") continue;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0) continue;
        const by = Math.max(rect.right - frame.right, frame.left - rect.left);
        if (by <= 1) continue;
        const name = el.id ? `${el.localName}#${el.id}` : el.localName;
        found.add(`${name} by ${Math.round(by)} px: ${(el.textContent ?? "").trim().slice(0, 40)}`);
      }
    }
    return [...found];
  });
}

/**
 * Waits until the beams of the live sonar are drawn for the state the page is in.
 * The page writes their four texts 120 ms after the last change and a later change
 * cancels the wait, so the texts are read twice, longer apart than that, until two
 * reads are equal.
 */
async function beamsDrawn(page: Page): Promise<void> {
  const read = (): Promise<string> =>
    page.evaluate(() =>
      ["bvF-t", "bvD-t", "bvS-t", "bvW-t"]
        .map((id) => document.getElementById(id)?.textContent ?? "")
        .join("|"),
    );
  let before = await read();
  for (let attempt = 0; attempt < 20; attempt++) {
    await page.waitForTimeout(150);
    const after = await read();
    if (after === before) return;
    before = after;
  }
  throw new Error("the texts of the beams of the live sonar kept changing");
}

/** Fails, naming the state, when something sticks out or the page scrolls sideways. */
async function expectInside(page: Page, state: string): Promise<void> {
  await settled(page);
  await beamsDrawn(page);
  expect(await stickingOut(page), `${state}: sticks out of its panel`).toEqual([]);
  expect(await sidewaysOverflow(page), `${state}: page scrolls sideways`).toBeLessThanOrEqual(0);
}

/** The values of the options of a select, or of the buttons of a group. */
async function values(page: Page, selector: string, attribute?: string): Promise<string[]> {
  return page
    .locator(selector)
    .evaluateAll(
      (els, name) =>
        els.map((el) => (name ? (el.getAttribute(name) ?? "") : (el as HTMLOptionElement).value)),
      attribute,
    );
}

test("nothing sticks out of its panel with every section, card, choice and beam angle open", async ({
  page,
}) => {
  await gotoAllOpen(page);
  await page.locator('[data-all="1"]').click();
  await page.locator('details[data-sub="ang-h"] > summary').click();
  await page.locator("#ang-dlg .dlg-ok").click();
  await expect(page.locator('details[data-sub="ang-h"]')).toHaveAttribute("open", "");
  for (const card of ["behind", "fp", "side", "v3"]) {
    await page.locator(`details[data-sub="${card}"] [data-tosel]`).click();
    await expect(page.locator(`details[data-sub="${card}"] [data-inlsel]`)).toBeVisible();
  }
  // The beams of the live sonar are drawn a moment after the section.
  await expect(page.locator("#bvF-t")).not.toBeEmpty();
  await expectInside(page, "everything open");
});

test("nothing sticks out of its panel with each transducer and each live sonar it offers", async ({
  page,
}) => {
  await gotoAllOpen(page);
  const transducers = await values(page, "#img-p option");
  expect(transducers.length).toBeGreaterThan(1);
  let combinations = 0;
  for (const transducer of transducers) {
    await page.locator("#img-p").selectOption(transducer);
    for (const live of await values(page, "#live-p option")) {
      await page.locator("#live-p").selectOption(live);
      await expectInside(page, `${transducer} with ${live}`);
      combinations++;
    }
  }
  // A transducer without live sonars would leave the page unchecked.
  expect(combinations).toBeGreaterThanOrEqual(transducers.length);
});

test("nothing sticks out of its panel with each bottom and each beam of Light and shadow", async ({
  page,
}) => {
  await gotoAllOpen(page);
  const bottoms = await values(page, "#lsb button", "data-v");
  const aims = await values(page, "#lsa button", "data-v");
  expect(bottoms.length).toBeGreaterThan(1);
  expect(aims.length).toBeGreaterThan(1);
  for (const bottom of bottoms) {
    for (const aim of aims) {
      await page.locator(`#lsb button[data-v="${bottom}"]`).click();
      await page.locator(`#lsa button[data-v="${aim}"]`).click();
      await expectInside(page, `Light and shadow, bottom ${bottom}, beam ${aim}`);
      // Every pair gives results, and none of them is a failed calculation.
      const results = await page.locator("#ls-res").innerText();
      expect(results, `${bottom} ${aim}`).not.toBe("");
      expect(results, `${bottom} ${aim}`).not.toMatch(/NaN|undefined|Infinity/);
    }
  }
});

for (const live of ["at2", "at2xl"]) {
  test(`nothing sticks out of its panel as the beams of ${live} are chosen one by one, with a second transducer`, async ({
    page,
  }) => {
    await gotoAllOpen(page);
    await page.locator("#live-p").selectOption(live);
    await page.locator("#img-s").selectOption("lowrance_nose");
    await page.locator("#dep").fill("8");
    await page.locator("#atr").fill("30");
    await page.locator("#allb-none").click();
    await expectInside(page, `${live}, no beam chosen`);
    const chips = page.locator("#allb-chips button");
    const count = await chips.count();
    expect(count).toBeGreaterThan(1);
    for (let i = 0; i < count; i++) {
      const chip = chips.nth(i);
      const name = (await chip.innerText()).trim();
      await chip.click();
      await expect(chip).toHaveAttribute("aria-pressed", "true");
      await expectInside(page, `${live}, ${name} chosen`);
    }
    await expect(page.locator("#allb-cnt")).toHaveText(`${count} of ${count} shown`);
  });
}
