import type { Page } from "@playwright/test";
import { expect, openSection, settled, test } from "./helpers";

// The dialogs of the page: the question before the beam angles open, the help
// pictures behind the "?" buttons, and the dispute of a figure.

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await settled(page);
});

const angles = 'details[data-sub="ang-h"]';

/**
 * Where an open dialog stands and where the earlier page puts it (its lines 1506
 * to 1510) in a window no taller than one and a half screens: in the middle of
 * the window, and at least 16 pixels from its upper and lower edge.
 */
async function place(
  page: Page,
  id: string,
): Promise<{ styleTop: string; top: number; expected: number; height: number }> {
  return page.locator(`#${id}`).evaluate((dialog) => {
    const el = dialog as HTMLElement;
    if (window.innerHeight > 1.5 * screen.height) throw new Error("the window is a tall frame");
    const height = el.offsetHeight;
    const expected = Math.max(
      16,
      Math.min((window.innerHeight - height) / 2, window.innerHeight - height - 16),
    );
    return { styleTop: el.style.top, top: el.getBoundingClientRect().top, expected, height };
  });
}

/** An open dialog stands where the earlier page puts it, and the page has written that place to it. */
async function expectPlaced(page: Page, id: string): Promise<void> {
  await expect(page.locator(`#${id}`)).toHaveAttribute("open", "");
  const at = await place(page, id);
  expect(at.styleTop, id).toBe(`${at.expected}px`);
  expect(Math.abs(at.top - at.expected), id).toBeLessThanOrEqual(0.5);
}

test.describe("the question before the beam angles open", () => {
  test("Cancel leaves them closed, OK opens them, and closing needs no question", async ({
    page,
  }) => {
    await page.locator(`${angles} > summary`).click();
    await expect(page.locator("#ang-dlg")).toHaveAttribute("open", "");
    await expect(page.locator(angles)).not.toHaveAttribute("open", "");
    await page.locator('#ang-dlg button[value="cancel"]').click();
    await expect(page.locator("#ang-dlg")).not.toHaveAttribute("open", "");
    await expect(page.locator(angles)).not.toHaveAttribute("open", "");
    await expect(page.locator(`${angles} > summary`)).toBeFocused();

    await page.locator(`${angles} > summary`).click();
    await page.locator("#ang-dlg .dlg-ok").click();
    await expect(page.locator("#ang-dlg")).not.toHaveAttribute("open", "");
    await expect(page.locator(angles)).toHaveAttribute("open", "");
    await expect(page.locator("#cone0")).toBeVisible();

    await page.locator(`${angles} > summary`).click();
    await expect(page.locator(angles)).not.toHaveAttribute("open", "");
    await expect(page.locator("#ang-dlg")).not.toHaveAttribute("open", "");
  });

  test("Escape leaves them closed, and the dialog sits inside the window", async ({ page }) => {
    await page.locator(`${angles} > summary`).click();
    const dialog = page.locator("#ang-dlg");
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    const viewport = page.viewportSize();
    if (!box || !viewport) throw new Error("no dialog box");
    expect(box.y).toBeGreaterThanOrEqual(16);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height - 16 + 0.5);
    expect(await dialog.evaluate((el) => (el as HTMLElement).style.top)).toMatch(/^[\d.]+px$/);
    // The OK button is not the one in focus: Enter does not open the angles by accident.
    await expect(page.locator("#ang-dlg .dlg-ok")).not.toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).not.toHaveAttribute("open", "");
    await expect(page.locator(angles)).not.toHaveAttribute("open", "");
  });

  test("Escape leaves them closed also after an earlier OK", async ({ page }) => {
    await page.locator(`${angles} > summary`).click();
    await page.locator("#ang-dlg .dlg-ok").click();
    await expect(page.locator(angles)).toHaveAttribute("open", "");
    await page.locator(`${angles} > summary`).click();
    await expect(page.locator(angles)).not.toHaveAttribute("open", "");
    // The question again: the answer of the first time does not count for this one.
    await page.locator(`${angles} > summary`).click();
    await expect(page.locator("#ang-dlg")).toHaveAttribute("open", "");
    await page.keyboard.press("Escape");
    await expect(page.locator("#ang-dlg")).not.toHaveAttribute("open", "");
    await expect(page.locator(`${angles} > summary`)).toBeFocused();
    await expect(page.locator(angles)).not.toHaveAttribute("open", "");
    await expect(page.locator("#cone0")).toBeHidden();
  });

  test("the question stands in the middle of the window", async ({ page }) => {
    await page.locator(`${angles} > summary`).click();
    await expectPlaced(page, "ang-dlg");
  });

  test("the beam angles stay closed after a reload, whatever was saved", async ({ page }) => {
    await page.locator(`${angles} > summary`).click();
    await page.locator("#ang-dlg .dlg-ok").click();
    await expect(page.locator(angles)).toHaveAttribute("open", "");
    await settled(page);
    await page.reload();
    await settled(page);
    await expect(page.locator(angles)).not.toHaveAttribute("open", "");
  });
});

test.describe("the help pictures", () => {
  test("a setting's button opens its picture, title and explanation", async ({ page }) => {
    await page.locator('label[for="dep"] > button.qm').click();
    const dialog = page.locator("#help-dlg");
    await expect(dialog).toHaveAttribute("open", "");
    await expect(page.locator("#help-h")).toHaveText("Depth under the transducer");
    await expect(page.locator("#help-sub")).toBeHidden();
    await expect(page.locator("#help-fig svg")).toHaveAttribute("viewBox", "0 0 340 196");
    await expect(page.locator("#help-fig svg text").first()).not.toBeEmpty();
    await expect(page.locator("#help-x")).toContainText(
      "From the transducer face straight down to the bottom.",
    );
    await expect(page.locator("#help-note")).toHaveText("Drawn with your current settings.");
    // The button does not act as its label: the field is not focused.
    await expect(page.locator("#dep")).not.toBeFocused();
    await dialog.locator(".dlg-ok").click();
    await expect(dialog).not.toHaveAttribute("open", "");
  });

  test("the picture of a setting and the picture of a figure stand in the middle of the window", async ({
    page,
  }) => {
    await page.locator('label[for="dep"] > button.qm').click();
    await expectPlaced(page, "help-dlg");
    await page.locator("#help-dlg .dlg-ok").click();
    // A button far down the page: the dialog stands in the window, not at the button.
    await openSection(page, "data");
    const card = page.locator('#data-list details[data-sub="dt-hb_xm9hw"]');
    await card.locator("summary").click();
    await card.locator(".drow button.qm").first().click();
    await expectPlaced(page, "help-dlg");
  });

  test("the picture is drawn with the values of the fields and the names of the brand", async ({
    page,
  }) => {
    await page.locator("#dep").fill("25");
    await page.locator('label[for="dep"] > button.qm').click();
    await expect(page.locator("#help-fig")).toContainText("25.0 m");
    await page.locator("#help-dlg .dlg-ok").click();
    await page.locator("#img-p").selectOption("hb_xm920");
    await page.locator('label[for="ssr"] > button.qm').click();
    await expect(page.locator("#help-h")).toHaveText("Side Imaging range per side");
    await page.locator("#help-dlg .dlg-ok").click();
    await page.locator('label[for="atsb"] > button.qm').click();
    await expect(page.locator("#help-h")).toHaveText("Landscape beam center, below horizontal");
    await expect(page.locator('#help-x [data-n="flat"]')).toHaveText("Landscape");
  });

  test("an angle's button names the frequency it belongs to", async ({ page }) => {
    await page.locator(`${angles} > summary`).click();
    await page.locator("#ang-dlg .dlg-ok").click();
    await page.locator('label[for="cone1"] > button.qm').click();
    await expect(page.locator("#help-h")).toHaveText("2D cone width");
    await expect(page.locator("#help-sub")).toHaveText("Setting: High CHIRP, 200 kHz");
    await expect(page.locator("#help-sub")).toBeVisible();
    await expect(page.locator("#help-fig")).toContainText("20°");
    await page.locator("#help-dlg .dlg-ok").click();
    await page.locator('label[for="ssalign"] > button.qm').click();
    await expect(page.locator("#help-h")).toHaveText("How the narrower fans are aimed");
    await expect(page.locator("#help-sub")).toBeHidden();
  });

  test("every setting with a button has a picture", async ({ page }) => {
    await page.locator(`${angles} > summary`).click();
    await page.locator("#ang-dlg .dlg-ok").click();
    const buttons = page.locator("label[for] > button.qm");
    const count = await buttons.count();
    expect(count).toBe(20);
    for (let i = 0; i < count; i++) {
      await buttons.nth(i).click();
      await expect(page.locator("#help-dlg")).toHaveAttribute("open", "");
      await expect(page.locator("#help-h")).not.toBeEmpty();
      await expect(page.locator("#help-fig svg")).toHaveAttribute("viewBox", /^0 0 340 [\d.]+$/);
      await page.locator("#help-dlg .dlg-ok").click();
      await expect(page.locator("#help-dlg")).not.toHaveAttribute("open", "");
    }
  });

  test("every figure's button in Data and sources draws a picture that stands in the window", async ({
    page,
  }) => {
    await openSection(page, "data");
    await page.locator('#sec-data [data-secall="1"]').click();
    const buttons = page.locator("#data-list .drow button.qm");
    const count = await buttons.count();
    expect(count).toBe(112);
    for (let i = 0; i < count; i++) {
      await buttons.nth(i).click();
      await expect(page.locator("#help-dlg"), `figure button ${i}`).toHaveAttribute("open", "");
      await expect(page.locator("#help-h"), `figure button ${i}`).not.toBeEmpty();
      await expect(page.locator("#help-fig svg"), `figure button ${i}`).toHaveAttribute(
        "viewBox",
        /^0 0 340 [\d.]+$/,
      );
      await expectPlaced(page, "help-dlg");
      await page.locator("#help-dlg .dlg-ok").click();
      await expect(page.locator("#help-dlg")).not.toHaveAttribute("open", "");
    }
  });

  test("a figure's button draws the picture with the preset's figure", async ({ page }) => {
    await openSection(page, "data");
    const card = page.locator('#data-list details[data-sub="dt-hb_xm9hw"]');
    await card.locator("summary").click();
    const row = card.locator(".drow", { hasText: "Side Imaging 455 kHz, max range per side" });
    await row.locator("button.qm").click();
    await expect(page.locator("#help-dlg")).toHaveAttribute("open", "");
    await expect(page.locator("#help-h")).toHaveText("SideScan range per side");
    await expect(page.locator("#help-sub")).toHaveText(
      "Humminbird XM 9 HW MSI T: Side Imaging 455 kHz, max range per side, 244 m",
    );
    await expect(page.locator("#help-fig")).toContainText("244.0 m");
    await expect(page.locator("#help-note")).toHaveText(
      "Drawn with this preset figure; everything else in the picture uses your current settings.",
    );
    // The card stays open: the button does not act as the card's heading.
    await page.locator("#help-dlg .dlg-ok").click();
    await expect(card).toHaveAttribute("open", "");
  });
});

test.describe("the dispute of a figure", () => {
  test("shows the figure with its source and writes the email", async ({ page }) => {
    await openSection(page, "data");
    const card = page.locator('#data-list details[data-sub="dt-lowrance"]');
    await card.locator("summary").click();
    await card
      .locator(".drow", { hasText: "2D Medium CHIRP 83 kHz, cone width" })
      .locator("[data-dispute]")
      .click();
    const dialog = page.locator("#dsp-dlg");
    await expect(dialog).toHaveAttribute("open", "");
    await expect(page.locator("#dsp-who")).toHaveText(
      "Lowrance Active Imaging HD 3-in-1 (Medium/High)",
    );
    await expect(page.locator("#dsp-name")).toHaveText("2D Medium CHIRP 83 kHz, cone width");
    await expect(page.locator("#dsp-val")).toHaveText("50°");
    await expect(page.locator("#dsp-conf")).toContainText("2/5");
    await expect(page.locator("#dsp-conf")).toContainText("Forum or blog figure");
    await expect(page.locator("#dsp-src a")).toHaveAttribute(
      "href",
      "https://www.thehulltruth.com/marine-electronics-forum/1389496-lowrance-hd-3-1-transducer-cone-angles.html",
    );
    const subject =
      "Dispute: Lowrance Active Imaging HD 3-in-1 (Medium/High), 2D Medium CHIRP 83 kHz, cone width";
    const href = await page.locator("#dsp-mail").getAttribute("href");
    expect(href).toContain(`mailto:sonar@sugo.se?subject=${encodeURIComponent(subject)}&body=`);
    expect(decodeURIComponent(href ?? "")).toContain(
      "Value in the calculator: 50° (confidence 2/5)\nCurrent source: One user on The Hull Truth forum",
    );
    const details = await page.locator("#dsp-copy").getAttribute("data-copy");
    expect(details).toContain(`To: sonar@sugo.se\nSubject: ${subject}\n\nTransducer: `);
    expect(details).toContain("\n\nWhat I think it should be:\n\nSource (link):\n");
    await dialog.locator(".dlg-ok").click();
    await expect(dialog).not.toHaveAttribute("open", "");
  });

  test("both dialogs of a dispute stand in the middle of the window", async ({ page }) => {
    await openSection(page, "data");
    const card = page.locator('#data-list details[data-sub="dt-lowrance"]');
    await card.locator("summary").click();
    await card.locator("[data-dispute]").first().click();
    await expectPlaced(page, "dsp-dlg");
    await page.locator("#dsp-dlg .dlg-ok").click();
    const other = page.locator('#data-list details[data-sub="dt-other"]');
    await other.locator("summary").click();
    await other.locator("[data-dispute]").first().click();
    await expectPlaced(page, "nod-dlg");
  });

  test("a figure of the preset named Other cannot be disputed, and the page says why", async ({
    page,
  }) => {
    await openSection(page, "data");
    const card = page.locator('#data-list details[data-sub="dt-other"]');
    await card.locator("summary").click();
    await card.locator("[data-dispute]").first().click();
    await expect(page.locator("#nod-dlg")).toHaveAttribute("open", "");
    await expect(page.locator("#dsp-dlg")).not.toHaveAttribute("open", "");
    await expect(page.locator("#nod-what")).toHaveText(
      "Other (Garmin or anything else: enter your own): Frequencies, 6 listed",
    );
    await page.locator("#nod-dlg .dlg-ok").click();
    await expect(page.locator("#nod-dlg")).not.toHaveAttribute("open", "");
  });
});
