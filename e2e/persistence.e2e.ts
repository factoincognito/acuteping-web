import {
  expect,
  gotoWith,
  openSection,
  recording,
  STORAGE_KEY,
  saved,
  savedText,
  settled,
  test,
  withoutOpenCards,
} from "./helpers";

// What the page saves and what it loads again: the storage key, the fields and
// the view state stay those of the earlier page, so a state it saved still loads.

test("saves every field and the view state under the earlier page's key", async ({ page }) => {
  await page.goto("/");
  await settled(page);
  const keys = await page.evaluate(() => Object.keys(localStorage));
  expect(keys).toEqual([STORAGE_KEY]);
  const state = await saved(page);
  expect(Object.keys(state)).toEqual(["v", "ui"]);
  // Every field of the page is saved, in the order of the page: a tick box as true or false.
  const fields = recording("defaults", "light").scenario.fields;
  expect(state.v).toEqual(fields);
  expect(Object.keys(state.v)).toEqual(Object.keys(fields));
  const onPage = await page
    .locator("[data-save]")
    .evaluateAll((els) =>
      els.map((el) => [
        el.id,
        (el as HTMLInputElement).type === "checkbox"
          ? (el as HTMLInputElement).checked
          : (el as HTMLInputElement).value,
      ]),
    );
  expect(Object.fromEntries(onPage)).toEqual(fields);
  expect(Object.keys(state.ui)).toEqual([
    "open",
    "lsB",
    "lsA",
    "ssMode",
    "ssf",
    "f2d",
    "fds",
    "db",
    "relDepth",
    "errOn",
    "behind",
    "fp",
    "sub",
  ]);
  // As the earlier page saved it, but for the cards that are noted as open (see `withoutOpenCards`).
  const recorded = recording("defaults", "light").scenario.ui;
  expect(withoutOpenCards(state.ui)).toEqual(withoutOpenCards(recorded));
  expect(Object.keys(recorded.sub as object)).toEqual(
    expect.arrayContaining(Object.keys(state.ui.sub as object)),
  );
});

test("keeps what a visitor set across a reload", async ({ page }) => {
  await page.goto("/");
  await settled(page);
  await page.locator("#dep").fill("7.5");
  await page.locator("#img-p").selectOption("hb_xm920");
  await page.locator("#img-s").selectOption("hb_xm9hw");
  await page.locator("#eq-at").uncheck();
  await page.locator("#sogu").selectOption("kmh");
  await openSection(page, "ss");
  await page.locator("#ssR").fill("18");
  await page.locator('#ssmode button[data-v="susp"]').click();
  await page.locator("#err-chips button").nth(1).click();
  await page.locator('details[data-sub="sim-h"] > summary').click();
  await openSection(page, "db");
  await page.locator('#dbt button[data-v="vs"]').click();
  await page.locator("#frac").fill("25");
  await settled(page);
  const before = await saved(page);
  expect(before.v.dep).toBe("7.5");
  expect((before.ui.sub as Record<string, boolean>)["sim-h"]).toBe(false);

  await page.reload();
  await settled(page);
  await expect(page.locator("#dep")).toHaveValue("7.5");
  await expect(page.locator("#img-p")).toHaveValue("hb_xm920");
  await expect(page.locator("#img-s")).toHaveValue("hb_xm9hw");
  await expect(page.locator("#eq-at")).not.toBeChecked();
  await expect(page.locator("#sogu")).toHaveValue("kmh");
  await expect(page.locator("#ssR")).toHaveValue("18");
  await expect(page.locator("#frac")).toHaveValue("25");
  await expect(page.locator("#sec-ss")).toHaveAttribute("open", "");
  await expect(page.locator("#sec-db")).toHaveAttribute("open", "");
  await expect(page.locator("#sec-at")).toBeHidden();
  await expect(page.locator('#ssmode button[data-v="susp"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("#susp-tool")).toBeVisible();
  await expect(page.locator("#bottom-tool")).toBeHidden();
  await expect(page.locator("#err-chips button").nth(1)).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator('details[data-sub="sim-h"]')).not.toHaveAttribute("open", "");
  await expect(page.locator('#dbt button[data-v="vs"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#frac-l")).toHaveText("Echo's distance from the right edge");
  // The names of the brand that was chosen, and the angles of its transducers.
  await expect(page.locator('#sec-ss > summary [data-n="side"]')).toHaveText("Side Imaging");
  await expect(page.locator("#cone0")).toHaveValue("60");
  await expect(page.locator("#side3")).toHaveValue("86");
  await expect(page.locator("#ctx-db")).toContainText("SOG 2.0 km/h");
  // Loading and drawing again saves the same state.
  const after = await saved(page);
  expect(after.v).toEqual(before.v);
  expect(Object.keys(after.v)).toEqual(Object.keys(before.v));
  expect(withoutOpenCards(after.ui)).toEqual(withoutOpenCards(before.ui));
});

test("keeps a beam angle a visitor changed across a reload, and calculates with it", async ({
  page,
}) => {
  await page.goto("/");
  await settled(page);
  await page.locator('details[data-sub="ang-h"] > summary').click();
  await page.locator("#ang-dlg .dlg-ok").click();
  // An angle of the transducer, one of the live sonar, and the way the fans are aimed.
  await page.locator("#cone0").fill("33");
  await page.locator("#side1").fill("41");
  await page.locator("#atw").fill("100");
  await page.locator("#ssalign").selectOption({ index: 1 });
  const aimed = await page.locator("#ssalign").inputValue();
  await settled(page);
  const before = await saved(page);
  expect(before.v).toMatchObject({ cone0: "33", side1: "41", atw: "100", ssalign: aimed });

  await page.reload();
  await settled(page);
  await expect(page.locator("#cone0")).toHaveValue("33");
  await expect(page.locator("#side1")).toHaveValue("41");
  await expect(page.locator("#atw")).toHaveValue("100");
  await expect(page.locator("#ssalign")).toHaveValue(aimed);
  // The angles are marked as changed, and the page saves them again as they are.
  await expect(page.locator('[data-src="cone0"]')).toHaveClass("src mod");
  await expect(page.locator('[data-src="atw"]')).toHaveClass("src mod");
  const after = await saved(page);
  expect(after.v).toEqual(before.v);
  // The cone at 10 m with 33 degrees: 2 x 10 x tan(16.5 degrees) = 5.9 m.
  await openSection(page, "vs");
  await expect(page.locator("#o-cone")).toHaveText("5.9 m across");
});

test("loads the beam angles of a saved state over those of its transducers", async ({ page }) => {
  await gotoWith(page, {
    v: {
      "img-p": "hb_xm920",
      "img-s": "hb_xm9hw",
      "live-p": "ml2",
      cone0: "44",
      side3: "70",
      atw: "99",
    },
    ui: {},
  });
  await expect(page.locator("#img-s")).toHaveValue("hb_xm9hw");
  await expect(page.locator("#live-p")).toHaveValue("ml2");
  await expect(page.locator("#cone0")).toHaveValue("44");
  await expect(page.locator("#side3")).toHaveValue("70");
  await expect(page.locator("#atw")).toHaveValue("99");
  // An angle that was not saved is the transducer's own.
  await expect(page.locator("#side2")).toHaveValue("86");
  expect((await saved(page)).v).toMatchObject({ cone0: "44", side3: "70", atw: "99" });
});

test("saves a card that is closed at once, without waiting for a new drawing", async ({ page }) => {
  await page.goto("/");
  await settled(page);
  await settled(page);
  const card = page.locator('details[data-sub="cond-h"]');
  await expect(card).toHaveAttribute("open", "");
  // Nothing else is written while the test waits: the state is the card's own save.
  const writes = await page.evaluate(() => {
    const seen: string[] = [];
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      seen.push(key);
      setItem.call(this, key, value);
    };
    (window as unknown as { writes: string[] }).writes = seen;
    return seen.length;
  });
  expect(writes).toBe(0);
  await card.locator("> summary").click();
  await expect(card).not.toHaveAttribute("open", "");
  await expect
    .poll(async () => ((await saved(page)).ui.sub as Record<string, boolean>)["cond-h"])
    .toBe(false);
  expect(await page.evaluate(() => (window as unknown as { writes: string[] }).writes)).toEqual([
    STORAGE_KEY,
  ]);
  await page.reload();
  await settled(page);
  await expect(page.locator('details[data-sub="cond-h"]')).not.toHaveAttribute("open", "");
  // The same for a section.
  await page.locator("#sec-set > summary .st").click();
  await expect.poll(async () => (await saved(page)).ui.open).toMatchObject({ set: false });
});

// Legacy writes the open sections only where a section opens or closes (line 1977), the closed cards
// where a card does (1897) and the depths of the error graph where one is pressed (1833): a beam,
// a stepper and Reset angles (lines 1861, 1942 and 1955) leave all three as they are.
test("a beam, a stepper and Reset angles keep the open sections, the closed cards and the hidden depths across a reload", async ({
  page,
}) => {
  await page.goto("/");
  for (const section of ["set", "ss", "cmp"] as const) await openSection(page, section);
  const card = page.locator('details[data-sub="v3"]');
  await card.locator("> summary").click();
  await expect(card).not.toHaveAttribute("open", "");
  const depths = page.locator("#err-chips button");
  await depths.first().click();
  const pressed = (): Promise<(string | null)[]> =>
    depths.evaluateAll((all) => all.map((chip) => chip.getAttribute("aria-pressed")));
  const hidden = await pressed();
  expect(hidden[0]).toBe("false");
  await page.evaluate(() => document.getElementById("ang-reset")?.click());
  await settled(page);
  await page.locator('#allb-chips .tog[data-bid="cone0"]').click();
  await settled(page);
  await page.locator('.stepper button[data-for="dep"]:last-child').click();
  await settled(page);
  await page.reload();
  await settled(page);
  for (const section of ["set", "ss", "cmp"]) {
    await expect(
      page.locator(`#sec-${section}`),
      `the section ${section} is still open`,
    ).toHaveAttribute("open", "");
  }
  await expect(card, "the closed card is still closed").not.toHaveAttribute("open", "");
  expect(await pressed(), "the depths of the error graph").toEqual(hidden);
});

test("loads a state the earlier page saved, and saves it back unchanged", async ({ page }) => {
  const { scenario } = recording("saved-by-page", "light");
  const seed = scenario.seed;
  if (!seed) throw new Error("the recording has no saved state");
  await gotoWith(page, seed);
  for (const [id, value] of Object.entries(scenario.fields)) {
    const field = page.locator(`[id="${id}"]`);
    if (typeof value === "boolean") expect(await field.isChecked(), id).toBe(value);
    else await expect(field, id).toHaveValue(value);
  }
  await expect(page.locator("#sec-set")).toHaveAttribute("open", "");
  await expect(page.locator("#sec-ss")).toHaveAttribute("open", "");
  await expect(page.locator("#sec-db")).toHaveAttribute("open", "");
  await expect(page.locator("#sec-vs")).not.toHaveAttribute("open", "");
  await expect(page.locator('details[data-sub="sim-h"]')).not.toHaveAttribute("open", "");
  await expect(page.locator("#susp-tool")).toBeVisible();
  await expect(page.locator('#dbt button[data-v="vs"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#out-x")).toHaveText("16.4 m");
  await expect(page.locator("#db-out")).toHaveText("2.8 m back");
  // The state the page saves after loading is the state it was given, key for key.
  expect(await savedText(page)).toBe(JSON.stringify(seed));
  expect((await saved(page)).ui).toEqual(scenario.ui);
});

test("starts from the defaults when what is saved is no state", async ({ page }) => {
  await gotoWith(page, "{ this is not JSON");
  await expect(page.locator("#dep")).toHaveValue("10");
  await expect(page.locator("#sec-set")).toHaveAttribute("open", "");
  await expect(page.locator("#ctx-ls")).toContainText("Depth 10.0 m");
  expect((await saved(page)).v).toEqual(recording("defaults", "light").scenario.fields);
});

test("leaves a saved field that is empty at the value of the markup", async ({ page }) => {
  await gotoWith(page, { v: { dep: "", sog: "3", "eq-ss": false }, ui: {} });
  await expect(page.locator("#dep")).toHaveValue("10");
  await expect(page.locator("#sog")).toHaveValue("3");
  await expect(page.locator("#eq-ss")).not.toBeChecked();
});
