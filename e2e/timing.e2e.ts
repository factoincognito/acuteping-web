import type { Page } from "@playwright/test";
import { expect, gotoWith, openSection, picture, settled, test } from "./helpers";

// What the page does over time: the stopwatch, the copy buttons and their way
// out when the clipboard cannot be written, and the beams of the live sonar,
// which are drawn a moment after their section.

test.describe("the stopwatch", () => {
  test("counts while it runs and fills in the crossing time when it stops", async ({ page }) => {
    await page.goto("/");
    await openSection(page, "db");
    const button = page.locator("#sw-btn");
    await expect(button).toHaveText("Start stopwatch");
    await expect(button).toHaveAttribute("aria-pressed", "false");
    await button.click();
    await expect(button).toHaveText("Stop");
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#sw-out")).toHaveText(/^\d+\.\d s$/);
    await page.waitForTimeout(450);
    await button.click();
    await expect(button).toHaveText("Start stopwatch");
    await expect(button).toHaveAttribute("aria-pressed", "false");
    const measured = await page.locator("#sw-out").innerText();
    expect(measured).toMatch(/^measured \d+\.\d s$/);
    const seconds = measured.replace(/^measured | s$/g, "");
    expect(Number(seconds)).toBeGreaterThanOrEqual(0.4);
    expect(Number(seconds)).toBeLessThan(10);
    await expect(page.locator("#tscr")).toHaveValue(seconds);
    // The page calculates with the measured time.
    await expect(page.locator("#db-err")).toBeHidden();
    await expect(page.locator("#db-t")).toHaveText(/ s ago$/);
    // The count has stopped.
    await page.waitForTimeout(250);
    await expect(page.locator("#sw-out")).toHaveText(measured);
  });

  test("measures the time between its two clicks", async ({ page }) => {
    await page.clock.install();
    await page.goto("/");
    await openSection(page, "db");
    await page.clock.pauseAt(new Date(Date.now() + 60_000));
    await page.locator("#sw-btn").click();
    await page.clock.runFor(12_340);
    await expect(page.locator("#sw-out")).toHaveText("12.3 s");
    await page.locator("#sw-btn").click();
    await expect(page.locator("#sw-out")).toHaveText("measured 12.3 s");
    await expect(page.locator("#tscr")).toHaveValue("12.3");
    await page.clock.runFor(100);
    // 2 kn for 12.3 s, at 50% of the screen.
    await expect(page.locator("#db-out")).toHaveText("6.3 m back");
    await expect(page.locator("#db-t")).toHaveText("6.2 s ago");
  });

  // Legacy line 1967 sets its start time back to null when it stops, so the next click starts it.
  test("measures again after it has measured once", async ({ page }) => {
    await page.clock.install();
    await page.goto("/");
    await openSection(page, "db");
    await page.clock.pauseAt(new Date(Date.now() + 60_000));
    const button = page.locator("#sw-btn");
    await button.click();
    await page.clock.runFor(2_100);
    await button.click();
    await expect(page.locator("#sw-out")).toHaveText("measured 2.1 s");
    await expect(button).toHaveText("Start stopwatch");
    await button.click();
    await expect(button).toHaveText("Stop");
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await page.clock.runFor(5_300);
    await expect(page.locator("#sw-out")).toHaveText("5.3 s");
    await button.click();
    await expect(button).toHaveText("Start stopwatch");
    await expect(page.locator("#sw-out")).toHaveText("measured 5.3 s");
    await expect(page.locator("#tscr")).toHaveValue("5.3");
  });

  test.describe("in a locale with decimal commas", () => {
    test.use({ locale: "sv-SE" });

    test("fills in the time with a comma, and the page reads it back", async ({ page }) => {
      await page.clock.install();
      await page.goto("/");
      await openSection(page, "db");
      await page.clock.pauseAt(new Date(Date.now() + 60_000));
      await page.locator("#sw-btn").click();
      await page.clock.runFor(12_340);
      await expect(page.locator("#sw-out")).toHaveText("12,3 s");
      await page.locator("#sw-btn").click();
      await expect(page.locator("#sw-out")).toHaveText("measured 12,3 s");
      await expect(page.locator("#tscr")).toHaveValue("12,3");
      await page.clock.runFor(100);
      await expect(page.locator("#db-err")).toBeHidden();
      await expect(page.locator("#db-out")).toHaveText("6,3 m back");
    });
  });
});

test.describe("the copy buttons", () => {
  const open = async (page: Page): Promise<void> => {
    await page.goto("/");
    await settled(page);
    await page.locator('details[data-sub="ang-h"] > summary').click();
    await expect(page.locator("#ang-dlg")).toHaveAttribute("open", "");
  };
  const button = "#ang-dlg button[data-copy]";

  test("write the address to the clipboard, say so, and take their label back", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await open(page);
    await page.locator(button).click();
    await expect(page.locator(button)).toHaveText("Copied");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("sonar@sugo.se");
    await expect(page.locator(button)).toHaveText("Copy address", { timeout: 4000 });
    // The label is the button's own again when it is used a second time.
    await page.locator(button).click();
    await expect(page.locator(button)).toHaveText("Copied");
    await expect(page.locator(button)).toHaveAttribute("data-lab", "Copy address");
  });

  test("fall back to the selection when the page has no clipboard", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
      const calls: string[] = [];
      (window as unknown as { copied: string[] }).copied = calls;
      document.execCommand = (command: string): boolean => {
        const field = document.querySelector("textarea");
        calls.push(
          field
            ? [
                command,
                field.value.slice(field.selectionStart, field.selectionEnd),
                field.readOnly,
                field.style.position,
                field.style.opacity,
                field.parentElement?.localName,
              ].join("|")
            : `${command}|no field`,
        );
        return true;
      };
    });
    await open(page);
    await page.locator(button).click();
    await expect(page.locator(button)).toHaveText("Copied");
    expect(await page.evaluate(() => (window as unknown as { copied: string[] }).copied)).toEqual([
      "copy|sonar@sugo.se|true|fixed|0|p",
    ]);
    // The field the text was selected in is gone again.
    await expect(page.locator("textarea")).toHaveCount(0);
    await expect(page.locator(button)).toHaveText("Copy address", { timeout: 4000 });
  });

  test("fall back when the clipboard refuses, and say what to do when that fails too", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: () => Promise.reject(new Error("refused")) },
        configurable: true,
      });
      document.execCommand = (): boolean => false;
    });
    await open(page);
    await page.locator(button).click();
    await expect(page.locator(button)).toHaveText("Select and copy the address");
    await expect(page.locator("textarea")).toHaveCount(0);
    await expect(page.locator(button)).toHaveText("Copy address", { timeout: 4000 });
  });

  test("fall back to the selection when the clipboard refuses, and say Copied when that works", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const calls: string[] = [];
      (window as unknown as { copied: string[] }).copied = calls;
      Object.defineProperty(navigator, "clipboard", {
        value: {
          writeText: (text: string) => {
            calls.push(`clipboard|${text}`);
            return Promise.reject(new Error("refused"));
          },
        },
        configurable: true,
      });
      document.execCommand = (command: string): boolean => {
        const field = document.querySelector("textarea");
        calls.push(
          `${command}|${field ? field.value.slice(field.selectionStart, field.selectionEnd) : "no field"}`,
        );
        return true;
      };
    });
    await open(page);
    await page.locator(button).click();
    await expect(page.locator(button)).toHaveText("Copied");
    expect(await page.evaluate(() => (window as unknown as { copied: string[] }).copied)).toEqual([
      "clipboard|sonar@sugo.se",
      "copy|sonar@sugo.se",
    ]);
    await expect(page.locator("textarea")).toHaveCount(0);
  });

  test("say what happened for two and a half seconds", async ({ page }) => {
    await page.clock.install();
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
      document.execCommand = (): boolean => true;
    });
    await open(page);
    await page.clock.pauseAt(new Date(Date.now() + 60_000));
    await page.locator(button).click();
    await expect(page.locator(button)).toHaveText("Copied");
    await page.clock.runFor(2400);
    await expect(page.locator(button)).toHaveText("Copied");
    await page.clock.runFor(150);
    await expect(page.locator(button)).toHaveText("Copy address");
    // The same for the words of a copy that failed.
    await page.evaluate(() => {
      document.execCommand = (): boolean => false;
    });
    await page.locator(button).click();
    await expect(page.locator(button)).toHaveText("Select and copy the address");
    await page.clock.runFor(2400);
    await expect(page.locator(button)).toHaveText("Select and copy the address");
    await page.clock.runFor(150);
    await expect(page.locator(button)).toHaveText("Copy address");
  });

  test("say that copying failed when the selection throws, on a button that copies details", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
      document.execCommand = (): boolean => {
        throw new Error("no copy here");
      };
    });
    await page.goto("/");
    await openSection(page, "data");
    const card = page.locator('#data-list details[data-sub="dt-lowrance"]');
    await card.locator("summary").click();
    await card.locator("[data-dispute]").first().click();
    await expect(page.locator("#dsp-dlg")).toHaveAttribute("open", "");
    await page.locator("#dsp-copy").click();
    await expect(page.locator("#dsp-copy")).toHaveText("Copy failed");
    await expect(page.locator("#dsp-copy")).toHaveText("Copy details", { timeout: 4000 });
    // As on the earlier page: the field the text was selected in is not taken
    // away when the selection throws, and it lies over the buttons.
    await expect(page.locator("#dsp-dlg textarea")).toHaveCount(1);
    const address = page.locator('#dsp-dlg button[data-copy="sonar@sugo.se"]');
    await address.evaluate((button) => (button as HTMLElement).click());
    await expect(address).toHaveText("Select and copy the address");
    await expect(page.locator("#dsp-dlg textarea")).toHaveCount(2);
  });
});

test.describe("the beams of the live sonar", () => {
  /** Types into a field as one event, without the wait a visitor's typing has. */
  const set = async (page: Page, id: string, value: string): Promise<void> => {
    await page.evaluate(
      ([fieldId, text]) => {
        const field = document.getElementById(fieldId) as HTMLInputElement;
        field.value = text;
        field.dispatchEvent(new Event("input", { bubbles: true }));
      },
      [id, value] as const,
    );
  };
  /** The page with the section open and its beams drawn, and the time stopped from then on. */
  const start = async (page: Page): Promise<string> => {
    await page.clock.install();
    await page.goto("/");
    await openSection(page, "at");
    await expect(page.locator("#bvS-t")).toContainText("Hits the bottom in a band ");
    await page.clock.pauseAt(new Date(Date.now() + 60_000));
    return page.locator("#bvS-t").innerText();
  };
  const line = (page: Page): Promise<string> => page.locator("#bvS-t").innerText();
  /** What the four pictures of the beams show. */
  const beams = async (page: Page): Promise<number[]> => {
    const drawn: number[] = [];
    for (const id of ["bvF", "bvD", "bvS", "bvW"]) drawn.push((await picture(page, id)).digest);
    return drawn;
  };

  test("are drawn 120 ms after the section, once, for the last change", async ({ page }) => {
    const first = await start(page);
    await set(page, "atr", "25");
    await page.clock.runFor(20);
    await expect(page.locator("#ctx-at")).toContainText("Range 25.0 m");
    expect(await line(page)).toBe(first);
    await page.clock.runFor(80);
    await set(page, "atr", "20");
    await page.clock.runFor(20);
    await expect(page.locator("#ctx-at")).toContainText("Range 20.0 m");
    // 120 ms after the first change: its beams are not drawn, the second change started the wait again.
    await page.clock.runFor(100);
    expect(await line(page)).toBe(first);
    await page.clock.runFor(30);
    const twenty = await line(page);
    // At 20 m the beam of the flat mode ends before the bottom.
    expect(twenty).toBe(
      "Doesn't reach the bottom at this depth and range. Top-view width to scale.",
    );
    await page.clock.runFor(500);
    expect(await line(page)).toBe(twenty);
  });

  test("of the last right settings are still drawn when a setting goes wrong before they are", async ({
    page,
  }) => {
    const first = await start(page);
    const firstBeams = await beams(page);
    // What the line says and what the beams look like for a range of 20 m, and back.
    await set(page, "atr", "20");
    await page.clock.runFor(200);
    const twenty = await line(page);
    const twentyBeams = await beams(page);
    expect(twenty).not.toBe(first);
    for (const [i, drawn] of twentyBeams.entries())
      expect(drawn, `beam ${i}`).not.toBe(firstBeams[i]);
    await set(page, "atr", "30");
    await page.clock.runFor(200);
    expect(await line(page)).toBe(first);
    expect(await beams(page)).toEqual(firstBeams);

    // The range again, and the depth emptied before the beams are drawn.
    await set(page, "atr", "20");
    await page.clock.runFor(20);
    await set(page, "dep", "");
    await page.clock.runFor(20);
    await expect(page.locator("#at-serr")).toHaveText("Fix the depth in Settings.");
    expect(await line(page)).toBe(first);
    expect(await beams(page)).toEqual(firstBeams);
    // The wait of the range's change ends: its beams are drawn, under the message,
    // with the depth the page had when the range changed, not with the empty one.
    await page.clock.runFor(100);
    expect(await line(page)).toBe(twenty);
    expect(await beams(page)).toEqual(twentyBeams);
    await expect(page.locator("#at-serr")).toHaveText("Fix the depth in Settings.");
    await page.clock.runFor(500);
    expect(await line(page)).toBe(twenty);
    expect(await beams(page)).toEqual(twentyBeams);
  });

  test("are not drawn at all when the section starts with a wrong setting", async ({ page }) => {
    await gotoWith(page, { v: { dep: "0" }, ui: { open: { set: true, at: true } } });
    await expect(page.locator("#at-serr")).toHaveText("Fix the depth in Settings.");
    await page.waitForTimeout(300);
    await expect(page.locator("#bvF-t")).toBeEmpty();
    await expect(page.locator("#f-in")).toBeEmpty();
  });
});
