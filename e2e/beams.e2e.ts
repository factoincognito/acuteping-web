import type { Page } from "@playwright/test";
import { expect, openSection, picture, saved, settled, test } from "./helpers";

// All beams compared: the 3D view under the pointer, the wheel and its buttons,
// and the choice of beams with its legends.

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await openSection(page, "cmp");
});

test.describe("the 3D view", () => {
  const view = async (page: Page): Promise<number> => {
    await settled(page);
    return (await picture(page, "b3d")).digest;
  };
  /** The middle of the view, in whole pixels, with the view in the middle of the window. */
  const centre = async (page: Page): Promise<{ x: number; y: number }> => {
    await page.locator("#b3d").evaluate((canvas) => canvas.scrollIntoView({ block: "center" }));
    const box = await page.locator("#b3d").boundingBox();
    if (!box) throw new Error("the 3D view has no box");
    return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
  };
  /** Presses the pointer on the middle of the view, moves it in one step, and lets go. */
  const drag = async (page: Page, dx: number, dy: number): Promise<void> => {
    const { x, y } = await centre(page);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx, y + dy);
    await page.mouse.up();
  };
  const press = async (page: Page, name: string, times = 1): Promise<number> => {
    for (let i = 0; i < times; i++) await page.locator(`button[data-v3="${name}"]`).click();
    return view(page);
  };

  test("turns under the pointer, and shows the hand that holds it", async ({ page }) => {
    const first = await view(page);
    const { x, y } = await centre(page);
    await expect(page.locator("#b3d")).toHaveCSS("cursor", "grab");
    await page.mouse.move(x, y);
    await page.mouse.down();
    await expect(page.locator("#b3d")).toHaveCSS("cursor", "grabbing");
    await page.mouse.move(x + 40, y + 10, { steps: 4 });
    const turned = await view(page);
    expect(turned).not.toBe(first);
    await page.mouse.up();
    await expect(page.locator("#b3d")).toHaveCSS("cursor", "grab");
    // Without the button held, the pointer turns nothing.
    await page.mouse.move(x - 30, y - 30, { steps: 3 });
    expect(await view(page)).toBe(turned);
    // The 3D button goes back to the first view.
    await page.locator('button[data-v3="iso"]').click();
    expect(await view(page)).toBe(first);
  });

  test("tilts 0.01 radians for each pixel, down to 0.2 radians under the surface and no further", async ({
    page,
  }) => {
    // The first view looks from 0.45 radians above the surface: 64 pixels up
    // leave it 0.19 radians under it, the 65th reaches the limit.
    await drag(page, 0, -64);
    const nearly = await view(page);
    await drag(page, 0, -1);
    const lowest = await view(page);
    expect(lowest).not.toBe(nearly);
    await drag(page, 0, -1);
    expect(await view(page)).toBe(lowest);
    await drag(page, 0, -60);
    expect(await view(page)).toBe(lowest);
    // Back to the first view, and to the limit in one move.
    await press(page, "iso");
    await drag(page, 0, -65);
    expect(await view(page)).toBe(lowest);
    // Sideways there is no limit: the view turns on.
    await drag(page, -65, 0);
    const turned = await view(page);
    expect(turned).not.toBe(lowest);
    await drag(page, -65, 0);
    expect(await view(page)).not.toBe(turned);
  });

  test("turns against the pointer and tilts with it, 0.01 radians for each pixel either way", async ({
    page,
  }) => {
    // The first view looks from 0.6 radians to the left and 0.45 radians above;
    // the view from behind is level and straight. 60 pixels to the right and 45
    // down lead from the one to the other, and the same way back.
    const first = await view(page);
    const behind = await press(page, "behind");
    expect(behind).not.toBe(first);
    await drag(page, 60, 45);
    expect(await view(page)).toBe(first);
    await drag(page, -60, -45);
    expect(await view(page)).toBe(behind);
    // In two moves of one drag: each move counts from where the last one ended.
    const { x, y } = await centre(page);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 20, y + 15);
    expect(await view(page)).not.toBe(first);
    await page.mouse.move(x + 60, y + 45);
    await page.mouse.up();
    expect(await view(page)).toBe(first);
    // A longer way round: the turn has no limit, 100 pixels on and 40 back.
    await press(page, "behind");
    await drag(page, 100, 45);
    expect(await view(page)).not.toBe(first);
    await drag(page, -40, 0);
    expect(await view(page)).toBe(first);
  });

  test("tilts up to straight above and no further", async ({ page }) => {
    const above = await press(page, "above");
    await press(page, "behind");
    // From level, straight above is 1.5708 radians: 157 pixels are 1.57, the 158th is the limit.
    await drag(page, 0, 158);
    expect(await view(page)).toBe(above);
    await drag(page, 0, 60);
    expect(await view(page)).toBe(above);
    // 20 pixels back is 0.2 radians off it.
    await drag(page, 0, -20);
    const off = await view(page);
    expect(off).not.toBe(above);
    await drag(page, 0, 20);
    expect(await view(page)).toBe(above);
  });

  test("a wheel turned sideways zooms out, as one turned towards the visitor", async ({ page }) => {
    const turn = async (deltaX: number, deltaY: number): Promise<number> => {
      const { x, y } = await centre(page);
      await page.mouse.move(x, y);
      await page.mouse.wheel(deltaX, deltaY);
      return view(page);
    };
    const once = await turn(0, 120);
    const twice = await turn(0, 120);
    expect(twice).not.toBe(once);
    // The page again, with the view as it starts.
    await page.reload();
    await openSection(page, "cmp");
    expect(await turn(0, 120)).toBe(once);
    expect(await turn(120, 0)).toBe(twice);
  });

  test("zooms with the wheel, and the page does not scroll", async ({ page }) => {
    const first = await view(page);
    const { x, y } = await centre(page);
    await page.mouse.move(x, y);
    const before = await page.evaluate(() => window.scrollY);
    await page.mouse.wheel(0, -120);
    const nearer = await view(page);
    expect(nearer).not.toBe(first);
    expect(await page.evaluate(() => window.scrollY)).toBe(before);
    await page.mouse.wheel(0, 120);
    expect(await view(page)).not.toBe(nearer);
  });

  test("the wheel zooms in by 1.1 away from the visitor and out by 0.9 towards, between 0.3 and 6 times", async ({
    page,
  }) => {
    const { x, y } = await centre(page);
    const wheel = async (times: number, deltaY: number): Promise<number> => {
      await page.mouse.move(x, y);
      for (let i = 0; i < times; i++) {
        await page.mouse.wheel(0, deltaY);
        await settled(page);
      }
      return view(page);
    };
    // 1.1 to the 18th is 5.56, to the 19th 6.12: the 19th turn reaches the most, 6 times.
    const eighteen = await wheel(18, -120);
    const most = await wheel(1, -120);
    expect(most).not.toBe(eighteen);
    expect(await wheel(1, -120)).toBe(most);
    // The zoom button knows the same limit.
    expect(await press(page, "in")).toBe(most);
    // 6 times 0.9 to the 28th is 0.314, to the 29th 0.283: the 29th turn reaches the least, 0.3 times.
    const twentyEight = await wheel(28, 120);
    const least = await wheel(1, 120);
    expect(least).not.toBe(twentyEight);
    expect(await wheel(1, 120)).toBe(least);
    expect(await press(page, "out")).toBe(least);
    expect(least).not.toBe(most);
    // 0.3 times 1.1 to the 31st is 5.76, to the 32nd 6.33.
    expect(await wheel(31, -120)).not.toBe(most);
    expect(await wheel(1, -120)).toBe(most);
  });

  test("has a button for each fixed view and for the zoom", async ({ page }) => {
    const first = await view(page);
    const seen = new Set([first]);
    for (const name of ["behind", "above", "side"]) {
      await page.locator(`button[data-v3="${name}"]`).click();
      const shown = await view(page);
      expect(seen.has(shown), name).toBe(false);
      seen.add(shown);
    }
    await page.locator('button[data-v3="iso"]').click();
    expect(await view(page)).toBe(first);
    await page.locator('button[data-v3="in"]').click();
    const nearer = await view(page);
    expect(nearer).not.toBe(first);
    await page.locator('button[data-v3="out"]').click();
    expect(await view(page)).toBe(first);
  });

  test("a zoom button zooms by 1.25, between 0.3 and 6 times", async ({ page }) => {
    // 1.25 to the 8th is 5.96, under the most of 6 times: the 9th press reaches it.
    const eight = await press(page, "in", 8);
    const most = await press(page, "in");
    expect(most).not.toBe(eight);
    expect(await press(page, "in")).toBe(most);
    // 6 divided by 1.25 to the 13th is 0.330, by the 14th 0.264: the 14th press reaches the least.
    const thirteen = await press(page, "out", 13);
    const least = await press(page, "out");
    expect(least).not.toBe(thirteen);
    expect(await press(page, "out")).toBe(least);
    // 0.3 times 1.25 to the 13th is 5.46, to the 14th 6.82.
    expect(await press(page, "in", 13)).not.toBe(most);
    expect(await press(page, "in")).toBe(most);
  });

  test("the view from the side is the view from behind turned a quarter to the left", async ({
    page,
  }) => {
    // A quarter turn is 1.5708 radians and a pixel is 0.01, so no drag ends exactly
    // there: 157 pixels to the left end 0.0008 radians before it. The picture after
    // them is nearer to the Side button's than the pictures a pixel before and after.
    /** How many pixels the view differs in from the picture kept under `name`; keeps it when there is none. */
    const differing = async (name: string): Promise<number> => {
      await settled(page);
      return page.evaluate((key) => {
        const canvas = document.getElementById("b3d") as HTMLCanvasElement;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("no 2D context on b3d");
        const now = new Uint32Array(
          ctx.getImageData(0, 0, canvas.width, canvas.height).data.buffer.slice(0),
        );
        const kept = window as unknown as { kept?: Record<string, Uint32Array> };
        kept.kept ??= {};
        const before = kept.kept[key];
        if (!before) {
          kept.kept[key] = now;
          return 0;
        }
        let count = 0;
        for (let i = 0; i < now.length; i++) if (now[i] !== before[i]) count++;
        return count;
      }, name);
    };
    await press(page, "side");
    await differing("side");
    const off: Record<number, number> = {};
    for (const pixels of [150, 156, 157, 158, 164]) {
      await press(page, "behind");
      await drag(page, -pixels, 0);
      off[pixels] = await differing("side");
    }
    const nearest = off[157] ?? Number.NaN;
    for (const pixels of [156, 158]) {
      expect(nearest, `157 against ${pixels} pixels`).toBeLessThan(0.75 * (off[pixels] ?? 0));
    }
    expect(off[156]).toBeLessThan(off[150] ?? 0);
    expect(off[158]).toBeLessThan(off[164] ?? 0);
    // To the right it is the other side of the boat: far from this picture.
    await press(page, "behind");
    await drag(page, 157, 0);
    expect(await differing("side")).toBeGreaterThan(2 * nearest);
  });

  test("the zoom ends at 6 and at 0.3 times, to within a few parts in a thousand", async ({
    page,
  }) => {
    const wheel = async (deltaY: number, times: number): Promise<void> => {
      const { x, y } = await centre(page);
      await page.mouse.move(x, y);
      for (let i = 0; i < times; i++) {
        await page.mouse.wheel(0, deltaY);
        await settled(page);
      }
    };
    const wheelOut = (times: number): Promise<void> => wheel(120, times);
    const wheelIn = (times: number): Promise<void> => wheel(-120, times);
    const again = async (): Promise<void> => {
      await page.reload();
      await openSection(page, "cmp");
    };
    const most = await press(page, "in", 12);
    const least = await press(page, "out", 30);
    // 0.81 times 1.25 to the 9th is 6.035: over the most. (1.25 to the 8th, 5.96, is under it:
    // the test of the zoom buttons.)
    await again();
    await wheelOut(2);
    expect(await press(page, "in", 9)).toBe(most);
    // 0.9 to the 5th divided by 1.25 to the 3rd is 0.3023: over the least.
    await again();
    await wheelOut(5);
    expect(await press(page, "out", 3)).not.toBe(least);
    // 0.9 to the 3rd divided by 1.25 to the 4th is 0.2986: under it.
    await again();
    await wheelOut(3);
    expect(await press(page, "out", 4)).toBe(least);
    // The same nearer to each limit. 0.81 times 1.1 to the 14th times 1.25 to the 3rd is 6.0078:
    // over the most by 0.13%.
    await again();
    await wheelOut(2);
    await wheelIn(14);
    expect(await press(page, "in", 3)).toBe(most);
    // 0.81 times 1.1 to the 21st is 5.9942: under the most by 0.1%.
    await again();
    await wheelOut(2);
    await wheelIn(21);
    expect(await view(page)).not.toBe(most);
    // 1.1 times 0.9 to the 6th, divided by 1.25 to the 3rd, is 0.2993: under the least.
    await again();
    await wheelIn(1);
    await wheelOut(6);
    expect(await press(page, "out", 3)).toBe(least);
    // 1.1 to the 6th times 0.9 to the 2nd, divided by 1.25 to the 7th, is 0.3009: over it.
    await again();
    await wheelIn(6);
    await wheelOut(2);
    expect(await press(page, "out", 7)).not.toBe(least);
  });

  test("stretches the depth two and four times, and says what the next click gives", async ({
    page,
  }) => {
    const button = page.locator('button[data-v3="zx"]');
    const first = await view(page);
    await expect(button).toHaveText("Stretch depth ×2");
    await button.click();
    await expect(button).toHaveText("Stretch depth ×4");
    await expect(button).toHaveAttribute("aria-pressed", "true");
    const twice = await view(page);
    expect(twice).not.toBe(first);
    await button.click();
    await expect(button).toHaveText("Stretch depth ×1");
    await expect(button).toHaveAttribute("aria-pressed", "true");
    expect(await view(page)).not.toBe(twice);
    await button.click();
    await expect(button).toHaveText("Stretch depth ×2");
    await expect(button).toHaveAttribute("aria-pressed", "false");
    expect(await view(page)).toBe(first);
  });

  test("a fixed view keeps the zoom, as legacy line 1344 sets the yaw and the pitch and nothing else", async ({
    page,
  }) => {
    const names = ["iso", "behind", "above", "side"];
    // Each fixed view at the zoom of the start.
    const atOne: Record<string, number> = {};
    for (const name of names) atOne[name] = await press(page, name);
    // Zoomed in twice (1.25 times 1.25), each fixed view is another picture than at 1, and
    // zooming out twice again leads back to the very picture it had at 1: only the zoom differs.
    await press(page, "in", 2);
    for (const name of names) {
      const zoomed = await press(page, name);
      expect(zoomed, `${name} at 1.5625 times`).not.toBe(atOne[name]);
      expect(await press(page, "out", 2), `${name}, zoomed out again`).toBe(atOne[name]);
      await press(page, "in", 2);
    }
    // The wheel zooms in the same way and a fixed view keeps its zoom too.
    await press(page, "out", 2);
    const { x, y } = await centre(page);
    await page.mouse.move(x, y);
    await page.mouse.wheel(0, -120);
    await settled(page);
    expect(await press(page, "behind")).not.toBe(atOne.behind);
  });

  test("a fixed view and a zoom button keep the stretch of the depth", async ({ page }) => {
    const names = ["iso", "behind", "above", "side"];
    const button = page.locator('button[data-v3="zx"]');
    const flat: Record<string, number> = {};
    for (const name of names) flat[name] = await press(page, name);
    await press(page, "iso");
    await button.click();
    await expect(button).toHaveText("Stretch depth ×4");
    for (const name of names) {
      const stretched = await press(page, name);
      expect(stretched, `${name} stretched`).not.toBe(flat[name]);
      await expect(button).toHaveText("Stretch depth ×4");
      await expect(button).toHaveAttribute("aria-pressed", "true");
      // A zoom button there and back leaves the stretched picture, not the flat one.
      await press(page, "in");
      expect(await press(page, "out"), `${name} stretched, zoomed in and out`).toBe(stretched);
      await expect(button).toHaveText("Stretch depth ×4");
      await expect(button).toHaveAttribute("aria-pressed", "true");
    }
    // The stretch is all that sets the stretched pictures apart: switched off, they are the flat ones.
    await button.click();
    await button.click();
    await expect(button).toHaveText("Stretch depth ×2");
    for (const name of names) {
      expect(await press(page, name), `${name} unstretched`).toBe(flat[name]);
    }
  });

  test("keeps its angle when the page is drawn again", async ({ page }) => {
    await page.locator('button[data-v3="above"]').click();
    const above = await view(page);
    await page.locator("#sog").fill("3");
    expect(await view(page)).toBe(above);
  });

  // Legacy writes the four numbers of the view (yaw, pitch, zoom, stretch) only in its 3D handlers, lines
  // 1332 (pointer), 1337 (wheel), 1341 (stretch), 1342 and 1343 (zoom) and 1344 (fixed views), and each
  // writes its own. No other control touches them: the next tests turn, zoom and stretch the view and
  // then use the other controls.
  type Step = (page: Page) => Promise<unknown>;
  const behind: Step = (page) => press(page, "behind");
  const inTwice: Step = (page) => press(page, "in", 2);
  const stretch: Step = (page) => press(page, "zx");
  const turn: Step = (page) => drag(page, 20, 10);
  const wheelIn: Step = async (page) => {
    const { x, y } = await centre(page);
    await page.mouse.move(x, y);
    await page.mouse.wheel(0, -120);
    await settled(page);
  };
  /** The picture the steps lead to, from a page loaded again. */
  const reach = async (page: Page, steps: Step[]): Promise<number> => {
    await page.goto("/");
    await openSection(page, "cmp");
    for (const step of steps) await step(page);
    return view(page);
  };
  /** A view that is turned, zoomed and stretched, none of it at its start value; returns the check that it is as it was. */
  const keepsView = async (page: Page): Promise<(after: string) => Promise<void>> => {
    await behind(page);
    await inTwice(page);
    await stretch(page);
    await turn(page);
    const remembered = await view(page);
    const button = page.locator('button[data-v3="zx"]');
    return async (after) => {
      expect(await view(page), `the picture after ${after}`).toBe(remembered);
      await expect(button, `the stretch button after ${after}`).toHaveText("Stretch depth ×4");
      await expect(button, `the stretch button after ${after}`).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    };
  };

  test("a drag keeps the zoom and the stretch", async ({ page }) => {
    await behind(page);
    await inTwice(page);
    const remembered = await stretch(page);
    await drag(page, 20, 10);
    expect(await view(page)).not.toBe(remembered);
    // Turned back by the same distance, it is the picture as it was: only the angle moved.
    await drag(page, -20, -10);
    expect(await view(page)).toBe(remembered);
  });

  test("the wheel keeps the angle and the stretch, whichever comes first", async ({ page }) => {
    const wheelLast = await reach(page, [behind, stretch, turn, wheelIn]);
    const wheelFirst = await reach(page, [wheelIn, behind, stretch, turn]);
    expect(wheelFirst).toBe(wheelLast);
  });

  test("the stretch keeps the angle and the zoom, whichever comes first", async ({ page }) => {
    const stretchLast = await reach(page, [behind, inTwice, turn, stretch]);
    const stretchFirst = await reach(page, [stretch, behind, inTwice, turn]);
    expect(stretchFirst).toBe(stretchLast);
  });

  test("a field, a button, a menu or a card of the settings draws the page again and keeps the view", async ({
    page,
  }) => {
    for (const section of ["set", "ss", "db"] as const) await openSection(page, section);
    // Select all first: it changes the beams, which the picture is taken after.
    await page.locator("#allb-all").click();
    const keeps = await keepsView(page);
    await page.locator("#sog").fill("3");
    await keeps("a field is changed");
    await page.locator('.stepper button[data-for="dep"]:last-child').click();
    await page.locator('.stepper button[data-for="dep"]:first-child').click();
    await keeps("a stepper goes up and down");
    await page.locator("#eq-ss").click();
    await page.locator("#eq-ss").click();
    await keeps("a box is ticked off and on");
    for (const menu of ["#img-p", "#img-s", "#live-p"]) {
      await page.locator(menu).dispatchEvent("change");
      await keeps(`${menu} says it changed`);
    }
    await page.locator('#ssmode button[aria-pressed="true"]').click();
    await keeps("the pressed button of a row is pressed again");
    await page.locator("#err-chips button").first().click();
    await page.locator("#err-chips button").first().click();
    await keeps("a depth of the error graph is hidden and shown");
    await page.locator('#rel-chips button[aria-pressed="true"]').click();
    await keeps("the depth of the relative error is chosen again");
    await page.locator("#sw-btn").click();
    await page.locator("#sw-btn").click();
    await page.locator("#tscr").fill("20");
    await keeps("the stopwatch is started and stopped");
    // Change in Settings draws nothing itself: the next field shows what it did.
    await page.locator("#ctx-db button[data-goto]").click();
    await page.locator("#sog").fill("3");
    await keeps("Change in Settings is pressed");
  });

  test("a beam, Reset angles, a section and a card draw the page again and keep the view", async ({
    page,
  }) => {
    await page.locator("#allb-all").click();
    const keeps = await keepsView(page);
    const chip = page.locator('#allb-chips .tog[data-bid="cone0"]');
    await chip.click();
    await chip.click();
    await keeps("a beam is hidden and shown");
    await page.evaluate(() => document.getElementById("ang-reset")?.click());
    await keeps("Reset angles");
    const section = page.locator("#sec-ss > summary .st");
    await section.click();
    await section.click();
    await keeps("a section is opened and closed");
    const card = page.locator("#sec-cmp details.sub:has(#b3d) > summary");
    await card.click();
    await card.click();
    await keeps("the 3D card is closed and opened");
    const change = page.locator("#sec-cmp details.sub:has(#b3d) [data-tosel]");
    await change.click();
    await change.click();
    await keeps("Change and Done of the 3D card");
    // Change and Done draw nothing themselves: Select all shows what they did.
    await page.locator("#allb-all").click();
    await keeps("Select all");
  });

  // The same for the controls that open a dialog or a card and write no state of the picture:
  // legacy leaves the four numbers of the view alone there too (lines 1332 to 1344 only).
  // A reset by one of them shows only in the next drawing of the page, so each step is followed
  // by an input event on a field, which draws, before the view is looked at.
  const keepsAfterDrawing = async (page: Page): Promise<(after: string) => Promise<void>> => {
    const keeps = await keepsView(page);
    return async (after) => {
      await page.locator("#sog").dispatchEvent("input");
      await keeps(after);
    };
  };

  test("a help picture, a dispute, a copy button and a card of Data and sources keep the view", async ({
    page,
  }) => {
    await openSection(page, "set");
    await openSection(page, "data");
    await page.locator("#allb-all").click();
    const keeps = await keepsAfterDrawing(page);
    await page.locator("#sec-set button.qm").first().click();
    await expect(page.locator("#help-dlg")).toHaveJSProperty("open", true);
    await keeps("the ? of a setting is pressed");
    await page.keyboard.press("Escape");
    const card = page.locator("#data-list details.sub > summary").first();
    await card.click();
    await keeps("a card of Data and sources is opened");
    await page.locator("#sec-data [data-hdat]").first().click();
    await expect(page.locator("#help-dlg")).toHaveJSProperty("open", true);
    await keeps("the ? of a figure is pressed");
    await page.keyboard.press("Escape");
    await page.locator("#sec-data [data-dispute]").first().click();
    await expect(page.locator("#dsp-dlg")).toHaveJSProperty("open", true);
    await keeps("a dispute button is pressed");
    await page.locator("#dsp-dlg button[data-copy]").first().click();
    await keeps("a copy button is pressed");
    await page.keyboard.press("Escape");
    await card.click();
    await keeps("a card of Data and sources is closed");
  });

  test("Expand all, Collapse all, Expand of a section and the answer to the angle question keep the view", async ({
    page,
  }) => {
    await page.locator("#allb-all").click();
    const keeps = await keepsAfterDrawing(page);
    await page.locator('#sec-cmp [data-secall="1"]').click();
    await keeps("Expand of a section is pressed");
    await page.locator('[data-all="0"]').click();
    await page.locator('[data-all="1"]').click();
    await keeps("Collapse all and Expand all are pressed");
    // Expand all leaves the card of the beam angles shut: opening it asks first.
    await page.locator("details.sub[data-guard] > summary").first().click();
    await expect(page.locator("#ang-dlg")).toHaveJSProperty("open", true);
    await keeps("the angle question is asked");
    await page.locator("#ang-dlg .dlg-ok").click();
    await expect(page.locator("details.sub[data-guard]").first()).toHaveAttribute("open", "");
    await keeps("the angle question is answered with OK");
  });

  test("lets go of the view when the browser takes the pointer away", async ({ page }) => {
    const { x, y } = await centre(page);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 30, y);
    const turned = await view(page);
    await expect(page.locator("#b3d")).toHaveCSS("cursor", "grabbing");
    await page.locator("#b3d").evaluate((canvas) => {
      canvas.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true, pointerId: 1 }));
    });
    await expect(page.locator("#b3d")).toHaveCSS("cursor", "grab");
    // The button is still held: the pointer turns nothing any more.
    await page.mouse.move(x + 80, y + 20, { steps: 3 });
    expect(await view(page)).toBe(turned);
    await page.mouse.up();
    await page.mouse.move(x, y, { steps: 2 });
    expect(await view(page)).toBe(turned);
  });

  test("follows a held pointer that leaves it, and lets go when the button is released outside", async ({
    page,
  }) => {
    await page.locator("#b3d").evaluate((canvas) => canvas.scrollIntoView({ block: "center" }));
    const box = await page.locator("#b3d").boundingBox();
    if (!box) throw new Error("the 3D view has no box");
    expect(box.y).toBeGreaterThan(60);
    const x = Math.round(box.x + box.width / 2);
    const y = Math.round(box.y + 20);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 20, y);
    const inside = await view(page);
    // 40 pixels above the view: it still turns with the pointer.
    await page.mouse.move(x + 60, y - 60);
    const outside = await view(page);
    expect(outside).not.toBe(inside);
    await page.mouse.up();
    await expect(page.locator("#b3d")).toHaveCSS("cursor", "grab");
    // Back over the view without the button: nothing turns.
    await page.mouse.move(x - 40, y + 30, { steps: 3 });
    expect(await view(page)).toBe(outside);
  });
});

test.describe("the choice of beams", () => {
  const chips = (page: Page, within: string): Promise<string[]> =>
    page
      .locator(`${within} .tog`)
      .evaluateAll((all) =>
        all.map((chip) => `${chip.getAttribute("data-bid")}:${chip.getAttribute("aria-pressed")}`),
      );

  test("a beam is hidden and shown in every view, and the choice is saved", async ({ page }) => {
    const chip = page.locator('#allb-chips .tog[data-bid="cone0"]');
    await expect(chip).toHaveAttribute("aria-pressed", "true");
    const drawn = await picture(page, "b3d");
    await chip.click();
    await expect(chip).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator("#allb-cnt")).toHaveText("9 of 11 shown");
    await expect(page.locator("#allb-res dt")).toHaveCount(9);
    await expect(page.locator("#fp-res dt")).toHaveCount(9);
    await expect(page.locator("#side-svg polygon")).toHaveCount(9);
    await settled(page);
    expect((await picture(page, "b3d")).digest).not.toBe(drawn.digest);
    expect((await saved(page)).ui.behind).toMatchObject({ cone0: false, cone1: true });
    await chip.click();
    await expect(page.locator("#allb-cnt")).toHaveText("10 of 11 shown");
    await settled(page);
    expect((await picture(page, "b3d")).digest).toBe(drawn.digest);
  });

  test("Clear all and Select all", async ({ page }) => {
    await page.locator("#allb-none").click();
    await expect(page.locator("#allb-cnt")).toHaveText("0 of 11 shown");
    await expect(page.locator('#allb-chips .tog[aria-pressed="true"]')).toHaveCount(0);
    await expect(page.locator("#sec-cmp [data-drawn] .none").first()).toHaveText(
      "No beams selected",
    );
    await expect(page.locator("#allb-res")).toHaveText("No beams selectedtap one above");
    await expect(page.locator("#fp-res dt")).toHaveText("No beams selected");
    await page.locator("#allb-all").click();
    await expect(page.locator("#allb-cnt")).toHaveText("11 of 11 shown");
    await expect(page.locator('#allb-chips .tog[aria-pressed="false"]')).toHaveCount(0);
    await expect(page.locator("#side-svg polygon")).toHaveCount(11);
  });

  test("the beams of a sonar that is not ticked are not offered and not counted", async ({
    page,
  }) => {
    await page.locator("#eq-at").uncheck();
    await expect(page.locator("#allb-cnt")).toHaveText("5 of 6 shown");
    await expect(page.locator('#allb-chips .bgrp[data-eq="at"]')).toBeHidden();
    await expect(page.locator('#allb-chips .bgrp[data-eq="ss"]')).toBeVisible();
    await page.locator("#allb-all").click();
    await expect(page.locator("#allb-cnt")).toHaveText("6 of 6 shown");
    // The beams of the sonar that was not ticked keep their own choice.
    await page.locator("#eq-at").check();
    await expect(page.locator("#allb-cnt")).toHaveText("11 of 11 shown");
  });

  test("Clear all and Select all leave the beams of a sonar that is not ticked as they were", async ({
    page,
  }) => {
    await page.locator("#eq-at").uncheck();
    await expect(page.locator("#allb-cnt")).toHaveText("5 of 6 shown");
    await page.locator("#allb-none").click();
    await expect(page.locator("#allb-cnt")).toHaveText("0 of 6 shown");
    await page.locator("#eq-at").check();
    // The five beams of the live sonar are still chosen, the six that were cleared are not.
    await expect(page.locator("#allb-cnt")).toHaveText("5 of 11 shown");
    expect(await chips(page, "#allb-chips")).toEqual([
      "side0:false",
      "side1:false",
      "cone0:false",
      "cone1:false",
      "down0:false",
      "down1:false",
      "live:true",
      "livel:true",
      "livef:true",
      "lives:true",
      "livew:true",
    ]);
    expect((await saved(page)).ui.behind).toMatchObject({ side0: false, live: true, livew: true });
    // The other way: the side scan is not ticked, and Select all leaves its beam that was hidden.
    await page.locator("#eq-ss").uncheck();
    await page.locator("#allb-all").click();
    await expect(page.locator("#allb-cnt")).toHaveText("9 of 9 shown");
    await page.locator("#eq-ss").check();
    await expect(page.locator("#allb-cnt")).toHaveText("9 of 11 shown");
    await expect(page.locator('#allb-chips .tog[data-bid="side0"]')).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  test("each view opens the same choice next to its picture with Change, and closes it with Done", async ({
    page,
  }) => {
    const card = page.locator('details[data-sub="side"]');
    const change = card.locator("button[data-tosel]");
    const choice = card.locator("[data-inlsel]");
    await expect(choice).toBeHidden();
    await expect(change).toHaveText("Change");
    await expect(change).toHaveAttribute("aria-expanded", "false");
    await change.click();
    await expect(choice).toBeVisible();
    await expect(change).toHaveText("Done");
    await expect(change).toHaveAttribute("aria-expanded", "true");
    await expect(choice.locator(".tog")).toHaveCount(11);
    await expect(choice.locator("[data-cnt]")).toHaveText("10 of 11 shown");
    // The choice stands right after the picture.
    expect(
      await card
        .locator("#side-svg")
        .evaluate((svg) => svg.nextElementSibling?.matches("[data-inlsel]")),
    ).toBe(true);
    // A beam hidden here is hidden in the list at the top too, and the choice stays open.
    await choice.locator('.tog[data-bid="down0"]').click();
    await expect(page.locator('#allb-chips .tog[data-bid="down0"]')).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect(choice.locator('.tog[data-bid="down0"]')).toHaveAttribute("aria-pressed", "false");
    await expect(choice.locator("[data-cnt]")).toHaveText("9 of 11 shown");
    await expect(choice).toBeVisible();
    await expect(card.locator("button[data-tosel]")).toHaveText("Done");
    await choice.locator('button[data-setall="0"]').click();
    await expect(choice.locator("[data-cnt]")).toHaveText("0 of 11 shown");
    await expect(choice).toBeVisible();
    await card.locator("button[data-tosel]").click();
    await expect(choice).toBeHidden();
    await expect(card.locator("button[data-tosel]")).toHaveText("Change");
  });

  test("an open choice shows its chips as Clear all, Select all and another transducer leave them", async ({
    page,
  }) => {
    const side = 'details[data-sub="side"] [data-inlsel]';
    await page.locator('details[data-sub="side"] button[data-tosel]').click();
    await expect(page.locator(side)).toBeVisible();
    const first = await chips(page, "#allb-chips");
    expect(first).toHaveLength(11);
    expect(await chips(page, side)).toEqual(first);
    await page.locator(`${side} button[data-setall="0"]`).click();
    await expect(page.locator(`${side} [data-cnt]`)).toHaveText("0 of 11 shown");
    expect(await chips(page, side)).toEqual(first.map((chip) => chip.replace(/:.*/, ":false")));
    expect(await chips(page, "#allb-chips")).toEqual(await chips(page, side));
    // Select all at the top of the section reaches the open choice too.
    await page.locator("#allb-all").click();
    await expect(page.locator(`${side} [data-cnt]`)).toHaveText("11 of 11 shown");
    expect(await chips(page, side)).toEqual(first.map((chip) => chip.replace(/:.*/, ":true")));
    // A second transducer has three beams more: the open choice offers them.
    await page.locator("#img-s").selectOption("lowrance_nose");
    await expect(page.locator(`${side} [data-cnt]`)).toHaveText("13 of 14 shown");
    const more = await chips(page, "#allb-chips");
    expect(more).toHaveLength(14);
    expect(await chips(page, side)).toEqual(more);
    // A choice that is not open is filled when it opens.
    await page.locator('details[data-sub="fp"] button[data-tosel]').click();
    expect(await chips(page, 'details[data-sub="fp"] [data-inlsel]')).toEqual(more);
  });

  test("a choice opens without the beams of a sonar that is not ticked", async ({ page }) => {
    await page.locator("#eq-at").uncheck();
    await expect(page.locator("#allb-cnt")).toHaveText("5 of 6 shown");
    const card = page.locator('details[data-sub="side"]');
    await card.locator("button[data-tosel]").click();
    const choice = card.locator("[data-inlsel]");
    await expect(choice).toBeVisible();
    await expect(choice.locator(".tog")).toHaveCount(11);
    await expect(choice.locator('.bgrp[data-eq="at"]')).toBeHidden();
    await expect(choice.locator('.bgrp[data-eq="ss"]')).toBeVisible();
    expect(
      await choice
        .locator(".tog")
        .evaluateAll((all) =>
          all
            .filter((chip) => (chip as HTMLElement).offsetParent !== null)
            .map((chip) => chip.getAttribute("data-bid")),
        ),
    ).toEqual(["side0", "side1", "cone0", "cone1", "down0", "down1"]);
  });

  test("the choice of the 3D view stands after its picture", async ({ page }) => {
    const card = page.locator('details[data-sub="v3"]');
    await card.locator("button[data-tosel]").click();
    await expect(card.locator("[data-inlsel]")).toBeVisible();
    expect(
      await card.locator("#b3d").evaluate((cv) => cv.nextElementSibling?.matches("[data-inlsel]")),
    ).toBe(true);
    await expect(card.locator("[data-inlsel] .tog")).toHaveCount(11);
  });

  test("a click in a choice keeps the card where it is on the screen", async ({ page }) => {
    const card = page.locator('details[data-sub="side"]');
    await card.locator("button[data-tosel]").click();
    const choice = card.locator("[data-inlsel]");
    await choice.scrollIntoViewIfNeeded();
    const top = async (): Promise<number> =>
      choice.evaluate((el) => el.getBoundingClientRect().top);
    const before = await top();
    // Hiding every beam makes the pictures above this card lower.
    await choice.locator('button[data-setall="0"]').click();
    await expect(choice.locator("[data-cnt]")).toHaveText("0 of 11 shown");
    await settled(page);
    expect(Math.abs((await top()) - before)).toBeLessThanOrEqual(1);
  });

  // Legacy line 1813 forgets the card after the drawing that follows the click.
  test("the page does not scroll back to the card of an earlier click when a field changes later", async ({
    page,
  }) => {
    await page.locator("#allb-all").click();
    await page.locator('#allb-chips .tog[data-bid="cone0"]').click();
    await settled(page);
    await page.evaluate(() => window.scrollBy(0, 600));
    await settled(page);
    const scrolled = await page.evaluate(() => window.scrollY);
    expect(scrolled).toBeGreaterThan(300);
    // An input event, as typing does, without the scrolling that filling the field would do.
    await page.locator("#sog").evaluate((field) => {
      (field as HTMLInputElement).value = "3";
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await settled(page);
    await settled(page);
    expect(await page.evaluate(() => window.scrollY)).toBe(scrolled);
  });
});
