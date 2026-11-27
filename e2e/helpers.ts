import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test as base, expect, type Page } from "@playwright/test";

/** The key the page saves its state under. */
export const STORAGE_KEY = "sonar-geometry";

/** The sections of the page, by the name each has in the saved state. */
export const SECTIONS = ["set", "ls", "ss", "vs", "at", "cmp", "db", "data", "math"] as const;

export type Section = (typeof SECTIONS)[number];

/** What the page saves: the value of every field, and the view state. */
export interface Saved {
  v: Record<string, string | boolean>;
  ui: Record<string, unknown>;
}

/**
 * Every test of the page runs with this: it fails on a console error, on an
 * uncaught error and on a request for anything but the page's own document.
 */
export const test = base.extend<{ watched: undefined }>({
  watched: [
    async ({ page, baseURL }, use) => {
      const problems: string[] = [];
      const requested = new Set<string>();
      page.on("console", (message) => {
        if (message.type() === "error") problems.push(`console error: ${message.text()}`);
      });
      page.on("pageerror", (error) => problems.push(`uncaught error: ${error.message}`));
      page.on("request", (request) => requested.add(request.url()));
      await use(undefined);
      expect(problems).toEqual([]);
      expect([...requested], "page loaded more than its own document").toEqual([`${baseURL}/`]);
    },
    { auto: true },
  ],
});

export { expect };

/** Waits until the page has drawn what an event asked for: two animation frames. */
export async function settled(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<null>((done) => {
        requestAnimationFrame(() => requestAnimationFrame(() => done(null)));
      }),
  );
}

/** Opens a section the way a visitor does, by its title, unless it is open. */
export async function openSection(page: Page, section: Section): Promise<void> {
  const details = page.locator(`#sec-${section}`);
  if (!(await details.evaluate((el) => (el as HTMLDetailsElement).open))) {
    await details.locator("> summary .st").click();
  }
  await expect(details).toHaveAttribute("open", "");
  await settled(page);
}

/** The state the page has saved. */
export async function saved(page: Page): Promise<Saved> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), STORAGE_KEY);
}

/**
 * The view state without the cards that are noted as open. A card the markup
 * has open is noted as open when its toggle event reaches the page's script,
 * which depends on how fast the page was read; a card that is not noted loads
 * as open too, so the two states are the same to a visitor.
 */
export function withoutOpenCards(ui: Record<string, unknown>): Record<string, unknown> {
  const sub = (ui.sub ?? {}) as Record<string, boolean>;
  return { ...ui, sub: Object.fromEntries(Object.entries(sub).filter(([, open]) => !open)) };
}

/** The text the page has saved its state as. */
export async function savedText(page: Page): Promise<string | null> {
  return page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
}

/** Loads the page as a visitor who has `state` saved. */
export async function gotoWith(page: Page, state: unknown): Promise<void> {
  await page.addInitScript(
    ([key, value]) => {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
    },
    [STORAGE_KEY, typeof state === "string" ? state : JSON.stringify(state)] as const,
  );
  await page.goto("/");
  await settled(page);
}

/** Loads the page with every section open. */
export async function gotoAllOpen(page: Page): Promise<void> {
  await gotoWith(page, { v: {}, ui: { open: Object.fromEntries(SECTIONS.map((s) => [s, true])) } });
}

/**
 * A digest of what a canvas shows and how many colours it has: a canvas
 * nothing was drawn on has one colour.
 */
export async function picture(
  page: Page,
  id: string,
): Promise<{ digest: number; colours: number }> {
  return page.evaluate((canvasId) => {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error(`no 2D context on ${canvasId}`);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const words = new Uint32Array(data.buffer);
    const seen = new Set<number>();
    let digest = 0x811c9dc5;
    for (const word of words) {
      if (seen.size < 64) seen.add(word);
      digest = Math.imul(digest ^ word, 0x01000193);
    }
    return { digest: digest >>> 0, colours: seen.size };
  }, id);
}

/** How far the document is wider than the window, in pixels. */
export async function sidewaysOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

/** One recording of the earlier page, as `fixtures/README.md` describes a file. */
export interface Recording {
  scenario: {
    seed: Saved | null;
    fields: Record<string, string | boolean>;
    ui: Record<string, unknown>;
    theme: Record<string, string>;
  };
}

/** The `page` file of a recorded scenario of the earlier page, in one colour scheme. */
export function recording(scenario: string, scheme: "light" | "dark"): Recording {
  const file = join(__dirname, "..", "fixtures", "legacy", scenario, scheme, "page.json");
  return JSON.parse(readFileSync(file, "utf8"));
}
