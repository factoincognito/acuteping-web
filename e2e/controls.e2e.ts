import { expect, gotoAllOpen, openSection, picture, saved, settled, test } from "./helpers";

// The controls of the page: the steppers, the buttons that choose one of
// several, the chips, the sonars, the transducers and the buttons of the page.

test.describe("the steppers", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await settled(page);
  });

  const plus = (id: string) => `.stepper button[data-for="${id}"]:last-child`;
  const minus = (id: string) => `.stepper button[data-for="${id}"]:first-child`;

  test("add and take away the step of their field and the page follows", async ({ page }) => {
    await page.locator(plus("dep")).click();
    await expect(page.locator("#dep")).toHaveValue("10.5");
    await expect(page.locator("#ctx-ls")).toContainText("Depth 10.5 m");
    await page.locator(minus("dep")).click();
    await page.locator(minus("dep")).click();
    await expect(page.locator("#dep")).toHaveValue("9.5");
    await page.locator(plus("ssr")).click();
    await expect(page.locator("#ssr")).toHaveValue("45");
    await page.locator(plus("zt")).click();
    await expect(page.locator("#zt")).toHaveValue("0.6");
    await page.locator(minus("atsb")).click();
    await expect(page.locator("#atsb")).toHaveValue("19");
    await settled(page);
    expect((await saved(page)).v).toMatchObject({ dep: "9.5", ssr: "45", zt: "0.6", atsb: "19" });
  });

  test("stop at 0 and count from 0 when the field holds no number", async ({ page }) => {
    await page.locator("#dep").fill("0.2");
    await page.locator(minus("dep")).click();
    await expect(page.locator("#dep")).toHaveValue("0");
    await expect(page.locator("#dep-err")).toHaveText("Enter a depth greater than 0 m.");
    await page.locator("#dep").fill("abc");
    await page.locator(plus("dep")).click();
    await expect(page.locator("#dep")).toHaveValue("0.5");
    await expect(page.locator("#dep-err")).toBeHidden();
    await page.locator("#sog").fill("");
    await page.locator(minus("sog")).click();
    await expect(page.locator("#sog")).toHaveValue("0");
  });

  test("round to one decimal", async ({ page }) => {
    await page.locator("#dep").fill("3.14159");
    await page.locator(plus("dep")).click();
    await expect(page.locator("#dep")).toHaveValue("3.6");
    await page.locator("#zt").fill("0.25");
    await page.locator(plus("zt")).click();
    await expect(page.locator("#zt")).toHaveValue("0.4");
  });
});

test.describe("in a locale with decimal commas", () => {
  test.use({ locale: "sv-SE" });

  test("the steppers write a comma and the page reads it back", async ({ page }) => {
    await page.goto("/");
    await settled(page);
    await page.locator("#dep").fill("12,5");
    await settled(page);
    await expect(page.locator("#ctx-ls")).toContainText("Depth 12,5 m");
    await page.locator('.stepper button[data-for="dep"]:last-child').click();
    await expect(page.locator("#dep")).toHaveValue("13");
    await page.locator('.stepper button[data-for="dep"]:first-child').click();
    await expect(page.locator("#dep")).toHaveValue("12,5");
    await page.locator('.stepper button[data-for="zt"]:last-child').click();
    await expect(page.locator("#zt")).toHaveValue("0,6");
    await expect(page.locator("#dep-err")).toBeHidden();
    await expect(page.locator("#zt-err")).toBeHidden();
  });
});

test.describe("the buttons that choose one of several", () => {
  test.beforeEach(async ({ page }) => {
    await gotoAllOpen(page);
  });

  test("the shadow tool of SideScan", async ({ page }) => {
    await page.locator('#ssmode button[data-v="susp"]').click();
    await expect(page.locator('#ssmode button[data-v="susp"]')).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.locator('#ssmode button[data-v="bottom"]')).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect(page.locator("#susp-tool")).toBeVisible();
    await expect(page.locator("#bottom-tool")).toBeHidden();
    await expect(page.locator("#sim-cap")).toContainText("Suspended object 5.0 m below");
    expect((await saved(page)).ui.ssMode).toBe("susp");
  });

  test("the frequencies of SideScan, 2D and DownScan", async ({ page }) => {
    await page.locator("#ssf button").nth(1).click();
    await expect(page.locator("#ssf button").nth(1)).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#ssb-res dd").first()).toContainText("1075 kHz CHIRP, 36° fan");
    await page.locator("#f2d button").nth(1).click();
    await expect(page.locator("#cap-2d")).toHaveText("2D sonar High CHIRP 200 kHz, 20° cone");
    await expect(page.locator("#o-cone")).toHaveText("3.5 m across");
    await page.locator("#fds button").nth(1).click();
    await expect(page.locator("#cap-ds")).toHaveText(
      "DownScan 1200 kHz CHIRP, 30° fan, 3.0° thick",
    );
    expect(await saved(page)).toMatchObject({ ui: { ssf: "1", f2d: "1", fds: "1" } });
  });

  test("the bottom and the beam of Light and shadow", async ({ page }) => {
    const before = await page.locator("#ls-svg").innerHTML();
    await page.locator('#lsb button[data-v="drop"]').click();
    await expect(page.locator('#lsb button[data-v="drop"]')).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.locator("#ls-svg")).toHaveAttribute("viewBox", "0 0 340 314");
    expect(await page.locator("#ls-svg").innerHTML()).not.toBe(before);
    await page.locator('#lsa button[data-v="steep"]').click();
    await expect(page.locator('#lsa button[aria-pressed="true"]')).toHaveText(
      "Steep, like DownScan",
    );
    await expect(page.locator("#ls-res dt").last()).toHaveText("Bottom lit");
    await settled(page);
    expect(await saved(page)).toMatchObject({ ui: { lsB: "drop", lsA: "steep" } });
  });

  test("the screen of Distance behind the boat", async ({ page }) => {
    await page.locator('#dbt button[data-v="vs"]').click();
    await expect(page.locator('#dbt button[data-v="vs"]')).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#frac-l")).toHaveText("Echo's distance from the right edge");
    await expect(page.locator("#frac-hint")).toContainText("On 2D and DownScan");
    expect((await saved(page)).ui.db).toBe("vs");
  });
});

test.describe("the chips of the SideScan graphs", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await openSection(page, "ss");
  });

  test("a depth of the error graph is hidden and shown again", async ({ page }) => {
    const chip = page.locator("#err-chips button").nth(1);
    await expect(chip).toHaveAttribute("aria-pressed", "true");
    await chip.click();
    await expect(chip).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator("#err-svg path")).toHaveCount(8);
    expect((await saved(page)).ui.errOn).toEqual({
      1: true,
      3: false,
      5: true,
      8: true,
      10: true,
    });
    await chip.click();
    await expect(page.locator("#err-svg path")).toHaveCount(10);
  });

  test("the depth of the relative-error graph is chosen", async ({ page }) => {
    await page.locator("#rel-chips button").nth(4).click();
    await expect(page.locator('#rel-chips button[aria-pressed="true"]')).toHaveText("10 m");
    await expect(page.locator("#rel-tab dt").first()).toHaveText("Depth 10.0 m");
    expect((await saved(page)).ui.relDepth).toBe(10);
  });
});

test.describe("the sonars on the boat", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await settled(page);
  });

  test("a sonar that is not ticked hides its section, its fields and its formulas", async ({
    page,
  }) => {
    await page.locator("#eq-at").uncheck();
    await expect(page.locator("#sec-at")).toBeHidden();
    await expect(page.locator("#live-p")).toBeHidden();
    await expect(page.locator("#atr")).toBeHidden();
    await expect(page.locator("#sec-ss")).toBeVisible();
    await page.locator("#eq-ss").uncheck();
    await expect(page.locator("#sec-ss")).toBeHidden();
    await expect(page.locator("#ssr")).toBeHidden();
    await expect(page.locator("#sec-db")).toBeVisible();
    await expect(page.locator("#eq-err")).toBeHidden();
  });

  test("with no sonar ticked the page says so and hides the compared beams", async ({ page }) => {
    for (const id of ["eq-ss", "eq-ds", "eq-2d", "eq-at"]) await page.locator(`#${id}`).uncheck();
    await expect(page.locator("#eq-err")).toHaveText(
      "Tick at least one sonar to see its sections.",
    );
    await expect(page.locator("#sec-cmp")).toBeHidden();
    await expect(page.locator("#sec-db")).toBeHidden();
    await expect(page.locator("#sec-ls")).toBeVisible();
    await page.locator("#eq-2d").check();
    await expect(page.locator("#eq-err")).toBeHidden();
    await expect(page.locator("#sec-cmp")).toBeVisible();
    await expect(page.locator("#sec-vs")).toBeVisible();
  });

  test("one live transducer hides what two give", async ({ page }) => {
    await openSection(page, "at");
    await expect(page.locator("#scrW")).toBeVisible();
    await page.locator("#at-n").selectOption("1");
    await expect(page.locator("#scrW")).toBeHidden();
    await expect(page.locator("#bvW-t")).toBeHidden();
  });
});

test.describe("the transducers", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await settled(page);
  });

  test("another brand brings its names, its second transducers, its live sonars and its angles", async ({
    page,
  }) => {
    await page.locator("#img-p").selectOption("hb_xm920");
    await expect(page.locator('#sec-ss > summary [data-n="side"]')).toHaveText("Side Imaging");
    await expect(page.locator('#sec-vs > summary [data-n="down"]')).toHaveText("Down Imaging");
    await expect(page.locator('#sec-at > summary [data-n="live"]')).toHaveText("MEGA Live 2");
    await expect(page.locator("#img-s option")).toHaveCount(5);
    await expect(page.locator("#live-p option")).toHaveText([
      "Humminbird MEGA Live 2",
      "Other (enter your own)",
    ]);
    await expect(page.locator("#live-p")).toHaveValue("ml2");
    await expect(page.locator("#at-n2")).toHaveText("Two, for Landscape Wide");
    // MEGA Live 2 takes one transducer: the choice of two is hidden.
    await expect(page.locator("#at-n")).toBeHidden();
    await expect(page.locator("#cone0")).toHaveValue("60");
    await expect(page.locator("#side2")).toHaveValue("86");
    await expect(page.locator("#atw")).toHaveValue("120");
    await expect(page.locator('label[for="side2"] > button.qm')).toHaveCount(1);
    await openSection(page, "data");
    await expect(page.locator("#data-list .inuse")).toHaveCount(2);
    await expect(page.locator('#data-list details[data-sub="dt-hb_xm920"] .inuse')).toHaveCount(1);
  });

  test("a second transducer adds the frequencies the first has not", async ({ page }) => {
    await page.locator("#img-s").selectOption("lowrance_nose");
    await expect(page.locator('label[for="down2"]')).toContainText(
      "455 kHz (nosecone), fan side to side",
    );
    await expect(page.locator("#down2")).toHaveValue("75");
    await expect(page.locator("#side2")).toHaveValue("48");
    await openSection(page, "vs");
    await expect(page.locator("#fds button")).toHaveCount(4);
    await expect(page.locator("#fq-note")).toContainText("Second transducer, ");
  });

  test("the transducer named Other has no second one and every live sonar", async ({ page }) => {
    await page.locator("#img-p").selectOption("other");
    await expect(page.locator("#img-s-f")).toBeHidden();
    await expect(page.locator("#live-p option")).toHaveCount(5);
    await expect(page.locator('#sec-ss > summary [data-n="side"]')).toHaveText("Side imaging");
  });

  test("Data and sources marks the second transducer as in use when it is chosen", async ({
    page,
  }) => {
    await openSection(page, "data");
    const inUse = (): Promise<(string | null)[]> =>
      page
        .locator("#data-list .inuse")
        .evaluateAll((marks) =>
          marks.map((mark) => mark.closest("details")?.getAttribute("data-sub") ?? null),
        );
    expect(await inUse()).toEqual(["dt-lowrance", "dt-at2-l"]);
    await page.locator("#img-s").selectOption("lowrance_nose");
    await expect(page.locator("#down2")).toHaveValue("75");
    expect(await inUse()).toEqual(["dt-lowrance", "dt-lowrance_nose", "dt-at2-l"]);
    await page.locator("#img-s").selectOption("");
    await expect(page.locator("#down2")).toHaveCount(0);
    expect(await inUse()).toEqual(["dt-lowrance", "dt-at2-l"]);
  });

  test("another live sonar brings the names of its brand, and is the one in use", async ({
    page,
  }) => {
    await page.locator("#img-p").selectOption("other");
    await expect(page.locator("#live-p")).toHaveValue("at2");
    await expect(page.locator('#sec-at > summary [data-n="live"]')).toHaveText("ActiveTarget 2");
    await openSection(page, "data");
    await page.locator("#live-p").selectOption("ml2");
    await expect(page.locator("#atw")).toHaveValue("120");
    await expect(page.locator('#sec-at > summary [data-n="live"]')).toHaveText("MEGA Live 2");
    await expect(page.locator('#sec-at > summary [data-n="flat"]')).toHaveText("Landscape");
    await expect(page.locator("#at-n2")).toHaveText("Two, for Landscape Wide");
    await expect(page.locator('#data-list details[data-sub="dt-ml2-l"] .inuse')).toHaveCount(1);
    await expect(page.locator('#data-list details[data-sub="dt-at2-l"] .inuse')).toHaveCount(0);
    await page.locator("#live-p").selectOption("lvs34");
    await expect(page.locator('#sec-at > summary [data-n="live"]')).toHaveText("LiveScope Plus");
    await expect(page.locator('#sec-at > summary [data-n="flat"]')).toHaveText("Perspective");
    await expect(page.locator("#at-n2")).toHaveText("Two, for Perspective Wide");
  });

  test("an angle that is changed is marked, checked, and reset to the preset's", async ({
    page,
  }) => {
    await page.locator('details[data-sub="ang-h"] > summary').click();
    await page.locator("#ang-dlg .dlg-ok").click();
    await page.locator("#cone0").fill("55");
    await expect(page.locator('[data-src="cone0"]')).toHaveClass("src mod");
    await expect(page.locator('[data-src="cone1"]')).toHaveClass("src");
    await page.locator("#cone0").fill("130");
    await expect(page.locator("#a2d-err")).toHaveText("Cone angles must be between 0° and 120°.");
    await page.locator("#atw").fill("100");
    await page.locator("#ang-reset").click();
    await expect(page.locator("#cone0")).toHaveValue("50");
    await expect(page.locator("#atw")).toHaveValue("135");
    await expect(page.locator('[data-src="cone0"]')).toHaveClass("src");
    await expect(page.locator("#a2d-err")).toBeHidden();
  });

  test("a section that a setting stops says which setting", async ({ page }) => {
    await openSection(page, "ss");
    await openSection(page, "vs");
    await page.locator("#dep").fill("");
    await expect(page.locator("#ss-serr")).toHaveText("Fix the depth in Settings.");
    await expect(page.locator("#vs-serr")).toHaveText("Fix the depth in Settings.");
    await page.locator("#dep").fill("10");
    await expect(page.locator("#ss-serr")).toBeHidden();
    await page.locator("#ssr").fill("0");
    await expect(page.locator("#ss-serr")).toHaveText("Fix the SideScan range in Settings.");
    await expect(page.locator("#ssb-res")).toBeEmpty();
    await expect(page.locator("#out-x")).toHaveText("17.3 m");
  });

  test("All beams compared keeps what it showed under the message of a wrong setting", async ({
    page,
  }) => {
    await openSection(page, "cmp");
    await expect(page.locator("#allb-cnt")).toHaveText("10 of 11 shown");
    const shown = async (): Promise<unknown> => {
      await settled(page);
      return {
        list: await page.locator("#allb-res").innerHTML(),
        above: await page.locator("#fp-res").innerHTML(),
        side: await page.locator("#side-svg").innerHTML(),
        legends: await page
          .locator("#sec-cmp [data-drawn]")
          .evaluateAll((all) => all.map((el) => el.innerHTML)),
        view: await picture(page, "b3d"),
      };
    };
    const before = await shown();
    await page.locator("#dep").fill("");
    await expect(page.locator("#cmp-serr")).toHaveText("Fix the depth in Settings.");
    // A beam is hidden while the setting is wrong: the chip is pressed, nothing is drawn again.
    await page.locator('#allb-chips .tog[data-bid="cone0"]').click();
    await expect(page.locator('#allb-chips .tog[data-bid="cone0"]')).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(await shown()).toEqual(before);
    await expect(page.locator("#allb-cnt")).toHaveText("10 of 11 shown");
    // With the setting right again the section is drawn, without the beam.
    await page.locator("#dep").fill("10");
    await expect(page.locator("#cmp-serr")).toBeHidden();
    await expect(page.locator("#allb-cnt")).toHaveText("9 of 11 shown");
    await expect(page.locator("#side-svg polygon")).toHaveCount(9);
    expect(await shown()).not.toEqual(before);
  });
});

test.describe("the buttons of the page", () => {
  test("Expand section in Settings opens its cards but not the beam angles, and asks nothing", async ({
    page,
  }) => {
    await page.goto("/");
    await settled(page);
    await page.locator('#sec-set button[data-secall="0"]').click();
    await expect(page.locator("#sec-set")).toHaveAttribute("open", "");
    expect(
      await page
        .locator("#sec-set details.sub")
        .evaluateAll((all) => all.some((d) => (d as HTMLDetailsElement).open)),
    ).toBe(false);
    await page.locator('#sec-set button[data-secall="1"]').click();
    expect(
      await page
        .locator("#sec-set details.sub")
        .evaluateAll((all) =>
          all.map((d) => `${d.getAttribute("data-sub")}:${(d as HTMLDetailsElement).open}`),
        ),
    ).toEqual(["eq-h:true", "cond-h:true", "ang-h:false"]);
    await expect(page.locator("#ang-dlg")).not.toHaveAttribute("open", "");
    await expect(page.locator("#cone0")).toBeHidden();
    // Open beam angles stay open at Expand section, and Collapse section closes them.
    await page.locator('details[data-sub="ang-h"] > summary').click();
    await page.locator("#ang-dlg .dlg-ok").click();
    await expect(page.locator('details[data-sub="ang-h"]')).toHaveAttribute("open", "");
    await page.locator('#sec-set button[data-secall="1"]').click();
    await expect(page.locator('details[data-sub="ang-h"]')).toHaveAttribute("open", "");
    await page.locator('#sec-set button[data-secall="0"]').click();
    await expect(page.locator('details[data-sub="ang-h"]')).not.toHaveAttribute("open", "");
  });

  test("Expand all and Collapse all open and close every section and card, but for the beam angles", async ({
    page,
  }) => {
    await page.goto("/");
    await settled(page);
    await page.locator('button[data-all="1"]').click();
    await settled(page);
    expect(
      await page
        .locator("details.sec")
        .evaluateAll((all) => all.every((d) => (d as HTMLDetailsElement).open)),
    ).toBe(true);
    await expect(page.locator('details[data-sub="ang-h"]')).not.toHaveAttribute("open", "");
    expect(
      await page
        .locator("details.sub:not([data-guard])")
        .evaluateAll((all) => all.every((d) => (d as HTMLDetailsElement).open)),
    ).toBe(true);
    await expect(page.locator("#out-x")).toHaveText("17.3 m");
    await page.locator('button[data-all="0"]').click();
    await settled(page);
    expect(
      await page
        .locator("details.sec, details.sub")
        .evaluateAll((all) => all.some((d) => (d as HTMLDetailsElement).open)),
    ).toBe(false);
    await expect
      .poll(async () => (await saved(page)).ui.open)
      .toEqual({
        set: false,
        ls: false,
        ss: false,
        vs: false,
        at: false,
        cmp: false,
        db: false,
        data: false,
        math: false,
      });
  });

  test("the buttons of a section open and close its cards without closing the section", async ({
    page,
  }) => {
    await page.goto("/");
    await openSection(page, "ss");
    await page.locator('#sec-ss button[data-secall="0"]').click();
    await expect(page.locator("#sec-ss")).toHaveAttribute("open", "");
    expect(
      await page
        .locator("#sec-ss details.sub")
        .evaluateAll((all) => all.some((d) => (d as HTMLDetailsElement).open)),
    ).toBe(false);
    await page.locator('#sec-ss button[data-secall="1"]').click();
    expect(
      await page
        .locator("#sec-ss details.sub")
        .evaluateAll((all) => all.every((d) => (d as HTMLDetailsElement).open)),
    ).toBe(true);
    // On a closed section, Expand section opens it too.
    await page.locator('#sec-vs button[data-secall="1"]').click();
    await expect(page.locator("#sec-vs")).toHaveAttribute("open", "");
    await expect(page.locator("#o-cone")).toHaveText("9.3 m across");
  });

  test("Change in Settings opens Settings", async ({ page }) => {
    await gotoAllOpen(page);
    await page.locator("#sec-set > summary .st").click();
    await expect(page.locator("#sec-set")).not.toHaveAttribute("open", "");
    await page.locator("#ctx-db button[data-goto]").click();
    await expect(page.locator("#sec-set")).toHaveAttribute("open", "");
    await expect(page.locator("#sec-set")).toBeInViewport();
  });
});
