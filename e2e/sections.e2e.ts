import { expect, openSection, picture, SECTIONS, saved, settled, test } from "./helpers";

// Each section opens and renders, for a first visitor: the defaults of the page
// (a Lowrance transducer with ActiveTarget 2, 10 m deep, 2 kn).

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await settled(page);
});

test("starts with Settings open and the other sections closed", async ({ page }) => {
  for (const section of SECTIONS) {
    const open = await page
      .locator(`#sec-${section}`)
      .evaluate((el) => (el as HTMLDetailsElement).open);
    expect(open, section).toBe(section === "set");
  }
  expect((await saved(page)).ui.open).toEqual({ set: true });
});

test("Settings lists the transducers, the angles of the chosen one and a help button for each setting", async ({
  page,
}) => {
  await expect(page.locator("#img-p option")).toHaveCount(8);
  await expect(page.locator("#img-p")).toHaveValue("lowrance");
  await expect(page.locator("#img-s option")).toHaveText([
    "None",
    "Lowrance Active Imaging 3-in-1 (Recon nosecone)",
  ]);
  await expect(page.locator("#live-p option")).toHaveText([
    "Lowrance ActiveTarget 2",
    "Lowrance ActiveTarget 2 XL",
    "Other (enter your own)",
  ]);
  await expect(page.locator("#at-n2")).toHaveText("Two, for Scout Wide");
  // The angle fields are written by the script, each with its preset's angle and its source.
  const angles = await page
    .locator("#ang-img input[data-def], #ang-live input[data-def]")
    .evaluateAll((inputs) =>
      inputs.map((el) => `${el.id}=${(el as HTMLInputElement).value}/${el.dataset.def}`),
    );
  expect(angles).toEqual([
    "cone0=50/50",
    "cone1=20/20",
    "down0=51/51",
    "down1=30/30",
    "dst=3/3",
    "side0=85/85",
    "side1=36/36",
    "sso=5/5",
    "sst=2/2",
    "atw=135/135",
    "att=18/18",
  ]);
  await expect(page.locator('#ang-img [data-src="cone0"]')).toContainText("confidence 2/5");
  // One "?" button in the label of every setting that has a help picture.
  const helped = await page
    .locator("label[for] > button.qm")
    .evaluateAll((buttons) => buttons.map((b) => (b as HTMLElement).dataset.help));
  expect(helped).toEqual([
    "at-n",
    "atsb",
    "atfa",
    "dep",
    "sog",
    "ssr",
    "atr",
    "zt",
    "cone0",
    "cone1",
    "down0",
    "down1",
    "dst",
    "side0",
    "side1",
    "sso",
    "sst",
    "ssalign",
    "atw",
    "att",
  ]);
  // No message while the defaults stand.
  for (const id of ["dep-err", "sog-err", "ssr-err", "atr-err", "zt-err", "mnt-err", "eq-err"]) {
    await expect(page.locator(`#${id}`)).toBeHidden();
  }
  // The beam angles are closed until the visitor confirms.
  await expect(page.locator('details[data-sub="ang-h"]')).not.toHaveAttribute("open", "");
});

test("Light and shadow draws the beam, the strip and the results", async ({ page }) => {
  await openSection(page, "ls");
  await expect(page.locator("#ctx-ls")).toContainText("Depth 10.0 m");
  await expect(page.locator("#ls-err")).toBeHidden();
  await expect(page.locator("#ls-svg")).toHaveAttribute("viewBox", "0 0 340 201");
  expect(await page.locator("#ls-svg > *").count()).toBeGreaterThan(700);
  expect(await page.locator("#ls-scr rect").count()).toBeGreaterThan(100);
  await expect(page.locator("#ls-leg span")).toHaveCount(4);
  await expect(page.locator("#ls-res dt")).toHaveText([
    "Fish echo on the screen",
    "Its shadow on the bottom",
    "Shadow on the screen",
    "Bottom hidden by the bottom itself",
    "Bottom lit",
  ]);
  await expect(page.locator('#lsb button[aria-pressed="true"]')).toHaveText("Rock");
  await expect(page.locator('#lsa button[aria-pressed="true"]')).toHaveText("Low, like SideScan");
});

test("SideScan reads a distance, a shadow and the beam, and draws its graphs and its screen", async ({
  page,
}) => {
  await openSection(page, "ss");
  await expect(page.locator("#ctx-ss")).toContainText("Depth 10.0 m");
  await expect(page.locator("#ctx-ss")).toContainText("Fans 85° / 36°");
  await expect(page.locator("#out-x")).toHaveText("17.3 m");
  await expect(page.locator("#c1")).toHaveText("20.0 m (2.7 too far)");
  await expect(page.locator("#c2")).toHaveText("10.0 m (7.3 too short)");
  await expect(page.locator("#sketch > *")).not.toHaveCount(0);
  await expect(page.locator("#bottom-tool")).toBeVisible();
  await expect(page.locator("#susp-tool")).toBeHidden();
  await expect(page.locator("#b-h")).toHaveText("2.1 m");
  await expect(page.locator("#b-x")).toHaveText("17.3 m");
  await expect(page.locator("#ssf button")).toHaveText(["455 kHz CHIRP", "1075 kHz CHIRP"]);
  await expect(page.locator("#ssb-back")).toHaveAttribute("viewBox", /^0 0 340 \d+$/);
  await expect(page.locator("#ssb-res dt").first()).toHaveText("Frequency drawn");
  await expect(page.locator("#err-chips button")).toHaveText(["1 m", "3 m", "5 m", "8 m", "10 m"]);
  await expect(page.locator("#err-svg path")).toHaveCount(10);
  await expect(page.locator("#rel-chips button")).toHaveCount(5);
  await expect(page.locator('#rel-chips button[aria-pressed="true"]')).toHaveText("5 m");
  await expect(page.locator("#rel-tab dt").first()).toHaveText("Depth 5.0 m");
  await expect(page.locator("#sim-cap")).toContainText("Object on the bottom, about 2.1 m tall");
  await expect(page.locator("#sim-vals dt")).toHaveCount(6);
  expect((await picture(page, "sim")).colours).toBeGreaterThan(8);
});

test("2D and DownScan gives the coverage, the table, the off-center target, the arch and both screens", async ({
  page,
}) => {
  await openSection(page, "vs");
  await expect(page.locator("#o-cone")).toHaveText("9.3 m across");
  await expect(page.locator("#o-fan")).toHaveText("9.5 m wide");
  await expect(page.locator("#f2d button")).toHaveText([
    "Medium CHIRP 83 kHz",
    "High CHIRP 200 kHz",
  ]);
  await expect(page.locator("#fds button")).toHaveText(["700 kHz CHIRP", "1200 kHz CHIRP"]);
  await expect(page.locator("#cov-svg polygon")).toHaveCount(2);
  await expect(page.locator("#cov-graph circle")).toHaveCount(2);
  await expect(page.locator("#fq-table tr")).toHaveCount(7);
  await expect(page.locator("#fq-note")).toContainText(
    "Lowrance Active Imaging HD 3-in-1 (Medium/High).",
  );
  await expect(page.locator("#o-shown")).toHaveText("8.2 m");
  await expect(page.locator("#o-ang")).toHaveText("14°");
  await expect(page.locator("#off-graph path")).toHaveCount(1);
  await expect(page.locator("#a-top")).toHaveText("6.0 m");
  await expect(page.locator("#a-end")).toHaveText("6.6 m");
  await expect(page.locator("#cap-2d")).toHaveText("2D sonar Medium CHIRP 83 kHz, 50° cone");
  await expect(page.locator("#cap-ds")).toHaveText("DownScan 700 kHz CHIRP, 51° fan, 3.0° thick");
  expect((await picture(page, "scr2d")).colours).toBeGreaterThan(8);
  expect((await picture(page, "scrds")).colours).toBeGreaterThan(8);
});

test("ActiveTarget gives the slice, the fish and the flat mode, draws its screens and, a moment later, its beams", async ({
  page,
}) => {
  await openSection(page, "at");
  await expect(page.locator("#ctx-at")).toContainText("Slice 135° × 18°");
  await expect(page.locator("#slice-table tr")).toHaveCount(2);
  await expect(page.locator("#slice-svg > *")).not.toHaveCount(0);
  await expect(page.locator("#f-in")).toHaveText("yes, 5.5° off center");
  await expect(page.locator("#dn-in")).toContainText("no, ");
  await expect(page.locator("#edge-err")).toHaveText("drawn 1.2% too far out");
  await expect(page.locator("#sc-b1")).toHaveText("20.6 m on screen");
  await expect(page.locator("#sc-f")).toContainText("yes, drawn at 15.7 m");
  for (const id of ["scrF", "scrD", "scrS", "scrW"]) {
    expect((await picture(page, id)).colours, id).toBeGreaterThan(8);
  }
  // The four beams are drawn 120 ms after the section: their lines are empty until then.
  await expect(page.locator("#bvF-t")).toContainText("Hits the bottom from ");
  await expect(page.locator("#bvD-t")).toContainText("Hits the bottom in a strip ");
  await expect(page.locator("#bvS-t")).toContainText("Hits the bottom in a band ");
  await expect(page.locator("#bvW-t")).toContainText("across 270°");
  for (const id of ["bvF", "bvD", "bvS", "bvW"]) {
    expect((await picture(page, id)).colours, id).toBeGreaterThan(2);
  }
});

test("All beams compared lists the beams, draws them from behind, from above and from the side, and in 3D", async ({
  page,
}) => {
  await openSection(page, "cmp");
  await expect(page.locator("#allb-cnt")).toHaveText("10 of 11 shown");
  await expect(page.locator("#allb-chips .bgrp-h")).toHaveText([
    "SideScan",
    "2D",
    "DownScan",
    "ActiveTarget 2",
  ]);
  await expect(page.locator("#allb-chips .tog")).toHaveCount(11);
  await expect(page.locator('#allb-chips .tog[aria-pressed="false"]')).toHaveText([
    "1075 kHz CHIRP",
  ]);
  const legends = page.locator("#sec-cmp [data-drawn]");
  await expect(legends).toHaveCount(4);
  await expect(legends.first().locator("span:not(.sw)")).toHaveCount(10);
  await expect(legends.first().locator("button[data-tosel]")).toHaveText("Change");
  await expect(page.locator("#ssb-all polygon")).not.toHaveCount(0);
  await expect(page.locator("#allb-res dt")).toHaveCount(10);
  await expect(page.locator("#fp-res dt")).toHaveCount(10);
  await expect(page.locator("#side-res dt")).toHaveCount(10);
  await expect(page.locator("#fp-svg polygon")).not.toHaveCount(0);
  await expect(page.locator("#side-svg polygon")).toHaveCount(10);
  expect((await picture(page, "b3d")).colours).toBeGreaterThan(8);
});

test("Distance behind the boat gives the distance, the time and the speed", async ({ page }) => {
  await openSection(page, "db");
  await expect(page.locator("#ctx-db")).toContainText("SOG 2.0 kn");
  await expect(page.locator('#dbt button[aria-pressed="true"]')).toHaveText("SideScan");
  await expect(page.locator("#frac-l")).toHaveText("Echo's distance from the top edge");
  await expect(page.locator("#frac-hint")).toContainText("On the SideScan screen");
  await expect(page.locator("#sw-hint")).toContainText("Tap Start when a mark enters");
  await expect(page.locator("#db-out")).toHaveText("10.3 m back");
  await expect(page.locator("#db-t")).toHaveText("10.0 s ago");
  await expect(page.locator("#db-v")).toHaveText("1.03 m/s");
  await expect(page.locator("#db-err")).toBeHidden();
});

test("Data and sources lists every transducer with its figures, and marks those in use", async ({
  page,
}) => {
  await openSection(page, "data");
  await expect(page.locator("#cf-scale > div")).toHaveCount(5);
  await expect(page.locator("#sec-data [data-ck]")).toHaveText("30 Sep 2026");
  await expect(page.locator("#data-list details.sub")).toHaveCount(14);
  await expect(page.locator("#data-list .inuse")).toHaveCount(2);
  await expect(page.locator("#data-list [data-dispute]")).toHaveCount(120);
  // A card opens on a click and shows its figures.
  const first = page.locator("#data-list details.sub").first();
  await first.locator("summary").click();
  await expect(first.locator(".drow")).toHaveCount(14);
  await expect(first.locator(".drow .dn").first()).toHaveText("Frequencies");
  // Which cards are open is saved, and kept when the list is written again.
  await expect.poll(async () => (await saved(page)).ui.sub).toMatchObject({ "dt-lowrance": true });
  await page.locator("#live-p").selectOption("at2xl");
  await settled(page);
  await expect(page.locator("#data-list details.sub").first()).toHaveAttribute("open", "");
});

test("The math shows the formulas of the sonars that are ticked", async ({ page }) => {
  await openSection(page, "math");
  await expect(page.locator("#sec-math section.panel")).toHaveCount(4);
  for (const id of ["m-ss", "m-vs", "m-at", "m-db"])
    await expect(page.locator(`#${id}`)).toBeVisible();
  await page.locator("#eq-at").uncheck();
  await settled(page);
  await expect(page.locator("#m-at")).toBeHidden();
  await expect(page.locator("#m-ss")).toBeVisible();
});

test("a section that is closed again is saved as closed", async ({ page }) => {
  await openSection(page, "db");
  expect((await saved(page)).ui.open).toEqual({ set: true, db: true });
  await page.locator("#sec-db > summary .st").click();
  await expect(page.locator("#sec-db")).not.toHaveAttribute("open", "");
  await expect.poll(async () => (await saved(page)).ui.open).toEqual({ set: true, db: false });
});
