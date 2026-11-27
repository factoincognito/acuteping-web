/**
 * 2D and DownScan against the earlier page (legacy/src/p2.js, lines 586 to
 * 755), in two ways. The expected values of the first part were printed by
 * those lines themselves, run unchanged in Node against a stand-in for the
 * page's elements and for the two canvases, in en-US and in sv-SE. The second
 * part compares what the view writes and what the two painters draw with what
 * the earlier page wrote and drew when it was recorded in a browser
 * (`fixtures/legacy/`), in every scenario of the set.
 */
import {
  axes,
  CANVAS_2D,
  CANVAS_DS,
  coverageView,
  KEYS,
  paintScreen2d,
  paintScreenDs,
  stepOf,
} from "./coverage";
import { createFormatter } from "./format";
import { equipment, hiddenFor, num, parseSettings } from "./settings";
import { UI_DEFAULTS } from "./state";
import { combined, livePreset, namesOf, THICKNESS } from "./transducers";
import type {
  Ctx2D,
  ElementPatch,
  RawFields,
  SavedValue,
  SectionView,
  Surface,
  UiState,
} from "./types";

// ---------------------------------------------------------------------------
// What a test gives the module and how it reads what comes back
// ---------------------------------------------------------------------------

/** FNV-1a, 32 bit, over bytes, as eight hex digits (the digest of fixtures/README.md). */
function fnv1aOf(bytes: Iterable<number>): string {
  let h = 0x811c9dc5;
  for (const byte of bytes) h = Math.imul(h ^ byte, 0x01000193) >>> 0;
  return h.toString(16).padStart(8, "0");
}

/** The digest of a text: of its UTF-8 bytes. */
const fnv1a = (text: string): string => fnv1aOf(new TextEncoder().encode(text));

/** The font of the page's figures, as the page's style gives it. */
const FONT_DATA = "'JetBrains Mono', ui-monospace, 'SFMono-Regular', Menlo, monospace";

/** The custom properties the first part resolves. */
const THEME: Readonly<Record<string, string>> = { "--font-data": FONT_DATA };

/**
 * The fields of the page as it starts, for the given transducers, with some
 * changed: each angle field holds its preset's angle (legacy lines 209 to 220).
 */
function fieldsOf(over: RawFields = {}, first = "lowrance", second = ""): RawFields {
  const p = combined(first, second);
  const l = livePreset("at2");
  const fields: Record<string, SavedValue> = {
    "img-p": first,
    "img-s": second,
    "live-p": "at2",
    "eq-ss": true,
    "eq-ds": true,
    "eq-2d": true,
    "eq-at": true,
    "at-n": "2",
    atsb: "20",
    atfa: "45",
    dep: "10",
    sog: "2",
    sogu: "kn",
    ssr: "40",
    atr: "30",
    zt: "0.5",
    dst: String(THICKNESS.dst),
    sso: String(p.edge),
    sst: String(THICKNESS.sst),
    ssalign: "inner",
    atw: String(l.w),
    att: String(l.t),
    z: "8",
    x: "2",
    zf: "6",
    y: "0",
    scrT: "20",
  };
  for (const [i, c] of p.cone.entries()) fields[`cone${i}`] = String(c.a);
  for (const [i, c] of p.down.entries()) fields[`down${i}`] = String(c.a);
  for (const [i, c] of p.side.entries()) fields[`side${i}`] = String(c.a);
  return { ...fields, ...over };
}

/** The saved view state as the page starts with it, with some of it changed. */
const uiOf = (over: Partial<UiState> = {}): UiState => ({ ...UI_DEFAULTS, sub: {}, ...over });

/** A value of the saved view state that is not the text the page saves there. */
const saved = (value: unknown): string => value as string;

/** The number fields of the section's own, which the shell reads as `num()` does. */
const LOCAL_NUMBERS = ["z", "x", "zf", "y", "scrT"] as const;

/** The two choices of transducer, which the section reads for the note of its table. */
const LOCAL_CHOICES = ["img-p", "img-s"] as const;

/** What the view and the painters get for a page with the given fields and view state. */
function inputOf(
  fields: RawFields,
  ui: UiState,
  locale: string,
  theme: Readonly<Record<string, string>> = THEME,
) {
  const first = String(fields["img-p"]);
  const live = String(fields["live-p"]);
  const local: Record<string, number | string> = {};
  for (const id of LOCAL_NUMBERS) {
    const text = fields[id];
    local[id] = num(typeof text === "string" ? text : undefined);
  }
  for (const id of LOCAL_CHOICES) {
    const value = fields[id];
    if (typeof value === "string") local[id] = value;
  }
  return {
    settings: parseSettings(fields, combined(first, String(fields["img-s"]))),
    eq: equipment(fields, livePreset(live)),
    ui,
    names: namesOf(first, live),
    local,
    theme: { colours: theme },
    fmt: createFormatter(locale),
  };
}

type Input = ReturnType<typeof inputOf>;

/** How a row differs from the page as it starts, besides its fields. */
interface Setup {
  /** The saved view state that is changed. */
  ui?: Partial<UiState>;
  /** The locale; en-US unless given. */
  locale?: string;
  /** The first and the second transducer. */
  first?: string;
  second?: string;
  /** The size of both canvases, in pixels; `STAND_IN` unless given. */
  size?: readonly [number, number];
  /** The custom properties of the page's style. */
  theme?: Readonly<Record<string, string>>;
}

/** The input of a row: the fields changed, and its setup. */
const inputFor = (over: RawFields = {}, setup: Setup = {}): Input =>
  inputOf(
    fieldsOf(over, setup.first ?? "lowrance", setup.second ?? ""),
    uiOf(setup.ui),
    setup.locale ?? "en-US",
    setup.theme ?? THEME,
  );

/** The view of the page as it starts, with some fields changed, and a setup. */
const viewOf = (over: RawFields = {}, setup: Setup = {}): SectionView =>
  coverageView(inputFor(over, setup));

/** The texts a picture shows, in the order they stand in its html. */
const textsOf = (html: string): string[] =>
  [...html.matchAll(/>([^<]*)<\/text>/g)].map(([, text]) => String(text));

/** From this length an html is told as its digest and length, with the texts it shows. */
const LONG = 160;

/**
 * What was written to one element, as one line: `t:` its text, `h:` its html
 * (a long one as its digest and length, and after `x:` the texts it shows),
 * whether it is hidden, and its attributes.
 */
function told(p: ElementPatch): string {
  const parts: string[] = [];
  if (p.text !== undefined) parts.push(`t:${p.text}`);
  if (p.html !== undefined) {
    if (p.html.length > LONG) {
      parts.push(`h:${fnv1a(p.html)}:${p.html.length} x:${textsOf(p.html).join("|")}`);
    } else parts.push(`h:${p.html}`);
  }
  if (p.hidden !== undefined) parts.push(p.hidden ? "[hidden]" : "[shown]");
  if (p.attrs !== undefined) {
    const attrs = Object.entries(p.attrs).sort(([a], [b]) => (a < b ? -1 : 1));
    parts.push(`{${attrs.map(([name, value]) => `${name}=${value}`).join(",")}}`);
  }
  return parts.join(" ");
}

/** What stands for an element the view does not write. */
const NOT = "(not written)";

/** What the view writes to each of some elements, as `told` tells it. */
const toldOf = (view: SectionView, keys: readonly string[]): string[] =>
  keys.map((key) => {
    const patch = view[key];
    return patch ? told(patch) : NOT;
  });

/** The rows of a table, each as its cells with `|` between; a cell with a style of its own in brackets. */
const tableOf = (html: string): string[] =>
  [...html.matchAll(/<tr>(.*?)<\/tr>/g)].map(([, row]) =>
    [...String(row).matchAll(/<t[dh]([^>]*)>([^<]*)<\/t[dh]>/g)]
      .map(([, attrs, cell]) => (String(attrs).includes("style") ? `[${cell}]` : String(cell)))
      .join("|"),
  );

/** The digest of everything a view writes, in one fixed order. */
function digestOf(view: SectionView): string {
  const ordered = Object.keys(view)
    .sort()
    .map((key) => [key, Object.entries(view[key] ?? {}).sort(([a], [b]) => (a < b ? -1 : 1))]);
  return fnv1a(JSON.stringify(ordered));
}

/** One entry of a canvas log (fixtures/README.md). */
type Entry = unknown[];

/** A value as a canvas log holds it. */
function encode(v: unknown): unknown {
  if (typeof v === "number") {
    if (Number.isFinite(v)) return Object.is(v, -0) ? { $: "-0" } : v;
    return { $: String(v) };
  }
  if (Array.isArray(v)) return v.map(encode);
  if (isImage(v)) return { $: "ImageData", w: v.width, h: v.height, fnv1a: fnv1aOf(v.data) };
  return v;
}

/** The pixels a painter asks for and puts back. */
interface Image {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

function isImage(v: unknown): v is Image {
  return typeof v === "object" && v !== null && "data" in v && v.data instanceof Uint8ClampedArray;
}

/** What a canvas answers when a text is measured: the font it measured in, and the width. */
interface Measured {
  font: string;
  width: number;
}

/**
 * A canvas that keeps a log of what is done to its context, as the recorder of
 * the fixtures does, and answers `measureText` with what `measure` gives for
 * the text and the font set at that moment.
 */
function recordingSurface(
  width: number,
  height: number,
  measure: (text: string, font: string) => Measured,
): { surface: Surface; log: Entry[] } {
  const log: Entry[] = [];
  const set: Record<string, unknown> = { font: "10px sans-serif" };
  const ctx = new Proxy({} as Ctx2D, {
    set(_target, property, value) {
      set[String(property)] = value;
      log.push([`=${String(property)}`, encode(value)]);
      return true;
    },
    get(_target, property) {
      const name = String(property);
      if (name in set) return set[name];
      return (...args: unknown[]) => {
        const entry: Entry = [name, ...args.map(encode)];
        log.push(entry);
        if (name === "createImageData") {
          const w = Number(args[0]);
          const h = Number(args[1]);
          const made: Image = { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
          entry.push(encode(made));
          return made;
        }
        if (name === "measureText") {
          const measured = measure(String(args[0]), String(set.font));
          entry.push(measured);
          return { width: measured.width };
        }
        return undefined;
      };
    },
  });
  const surface: Surface = {
    width,
    height,
    ctx,
    resize: () => {
      throw new Error("the two screens are never resized");
    },
  };
  return { surface, log };
}

/** The two screens, by the equipment key of their sonar. */
type Kind = "2d" | "ds";

/** The painter of each screen. */
const PAINTERS = { "2d": paintScreen2d, ds: paintScreenDs } as const;

/** The size of the canvases `scr2d` and `scrds` in the page's markup. */
const PAGE_SIZE = [360, 230] as const;

/**
 * The size of the stand-in canvases: a fifth of the page's width, at its full
 * height. The earlier lines were run on stand-ins of this size too. A pixel
 * costs some ten calls of `Math`, which are slow where Jest runs a test, so
 * only a few pictures of the first part and the pictures that are compared
 * with the browser's are drawn at the page's width.
 */
const STAND_IN = [72, 230] as const;

/** The width the stand-in canvas gives each character of a text it measures. */
const CHAR_WIDTH = 6.6015625;

/** How the stand-in canvas measures a text. */
const standInMeasure = (text: string, font: string): Measured => ({
  font,
  width: text.length * CHAR_WIDTH,
});

/** What the painter of one screen draws for an input, on a stand-in canvas. */
function drawn(kind: Kind, input: Input, size: readonly [number, number] = STAND_IN): Entry[] {
  const { surface, log } = recordingSurface(size[0], size[1], standInMeasure);
  PAINTERS[kind](surface, input);
  return log;
}

/** A log as its number of entries and its digest. */
const logSum = (log: Entry[]): string => `${log.length}:${fnv1a(JSON.stringify(log))}`;

/** The texts a log writes, each with where it stands. */
const logTexts = (log: Entry[]): string[] =>
  log.filter((entry) => entry[0] === "fillText").map((entry) => entry.slice(1).join("@"));

/** The log of a screen on which nothing is drawn. */
const NOTHING = "0:741638a5";

// ---------------------------------------------------------------------------
// The first part: against the earlier lines run in Node
// ---------------------------------------------------------------------------

/** A message element without a message. */
const NO_ERR = "t: [hidden]";

/**
 * A row of the view: what is tested, the fields changed, the setup, how many
 * elements the earlier lines write, and the digest of all they write.
 */
type ViewRow = [what: string, fields: RawFields, setup: Setup, written: number, digest: string];

/** Requires of the view what the earlier lines gave for the row. */
function expectView([, fields, setup, written, digest]: ViewRow): void {
  const view = viewOf(fields, setup);
  expect(Object.keys(view)).toHaveLength(written);
  expect(digestOf(view)).toBe(digest);
}

/**
 * A row of the screens: what is tested, the fields changed, the setup, and the
 * log of the 2D screen and of the down imaging screen as `logSum` gives them.
 */
type ScreenRow = [what: string, fields: RawFields, setup: Setup, scr2d: string, scrds: string];

/** Requires of the two painters what the earlier lines gave for the row. */
function expectScreens([, fields, setup, scr2d, scrds]: ScreenRow): void {
  const input = inputFor(fields, setup);
  expect(logSum(drawn("2d", input, setup.size))).toBe(scr2d);
  expect(logSum(drawn("ds", input, setup.size))).toBe(scrds);
}

/** The setup of another brand, which calls its down imaging "Down Imaging". */
const OTHER_BRAND: Setup = { first: "hb_xm14hw" };

/** The setup of the locale with decimal commas. */
const SV: Setup = { locale: "sv-SE" };

/** The elements of a target off to the side, of a fish, and of what stands at the top. */
const OFF = ["off-err", "o-shown", "o-err", "o-ang", "o-in2d", "o-inds", "o-max2d", "o-maxds"];
const ARCH = ["arch-err", "arch-res", "a-top", "a-end", "a-h", "a-len", "ds-len"];
const TOP = ["o-cone", "o-fan", "cov-svg", "cap-2d", "cap-ds"];

/** The note of the first preset, without and with the sentence about a changed angle. */
const NOTE_START =
  "t:Lowrance Active Imaging HD 3-in-1 (Medium/High). Frequencies from Lowrance's product page for the Medium/High version: Medium and High CHIRP (83/200 kHz), DownScan 700/1200 kHz and SideScan 455/1075 kHz; the installation manual lists all four DownScan and SideScan frequencies as CHIRP. Lowrance publishes no beam angles. 2D is a forum estimate; the DownScan angles are estimates scaled by wavelength from a dealer's 45° at 800 kHz (a figure identical to Humminbird's published Down Imaging one); SideScan 1075 kHz is 455 kHz scaled the same way.";
const NOTE_END = " Widths and edge errors are at your depth.";
const NOTE_CHANGED = " * your value, not the preset's.";

/** The graph of a target off to the side as the page starts, with the target's mark and without. */
const OFF_GRAPH =
  "h:42dee0b9:4366 x:0|5|10|15|20|25|30|0|5|10|15|20|25|30|35|40|Angle from straight down (°)|%|2D edge|DownScan edge";
const OFF_GRAPH_NO_MARK =
  "h:df4e1c24:4241 x:0|5|10|15|20|25|30|0|5|10|15|20|25|30|35|40|Angle from straight down (°)|%|2D edge|DownScan edge";

describe("what the module names", () => {
  it("lists the elements the view writes and the two canvases the painters draw", () => {
    expect(KEYS).toEqual([
      "vs-serr",
      "o-cone",
      "o-fan",
      "cov-svg",
      "cov-graph",
      "fq-table",
      "fq-note",
      "off-err",
      "o-shown",
      "o-err",
      "o-ang",
      "o-in2d",
      "o-inds",
      "o-max2d",
      "o-maxds",
      "off-graph",
      "arch-err",
      "arch-res",
      "a-top",
      "a-end",
      "a-h",
      "a-len",
      "ds-len",
      "cap-2d",
      "cap-ds",
    ]);
    expect(new Set(KEYS).size).toBe(KEYS.length);
    expect(CANVAS_2D).toBe("scr2d");
    expect(CANVAS_DS).toBe("scrds");
  });
});

describe("the page as it starts", () => {
  it("writes all 25 elements, each as the earlier lines write it", () => {
    const view = viewOf();
    expect(Object.keys(view).sort()).toEqual([...KEYS].sort());
    expect(toldOf(view, KEYS)).toEqual([
      NO_ERR,
      "t:9.3 m across",
      "t:9.5 m wide",
      "h:918e75e1:1616 x:2D 9.3 m|DownScan 9.5 m|10.0 m {viewBox=0 0 320 224}",
      "h:87c81ae3:3196 x:0|5|10|15|20|25|30|0|5|10|15|20|25|30|Depth (m)|m",
      "h:2bf32cee:883 x:",
      NOTE_START + NOTE_END,
      NO_ERR,
      "t:8.2 m",
      "t:0.25 m (3.1%)",
      "t:14°",
      "t:yes",
      "t:yes",
      "t:0.83 m (10.3%)",
      "t:0.86 m (10.8%)",
      OFF_GRAPH,
      NO_ERR,
      "[shown]",
      "t:6.0 m",
      "t:6.6 m",
      "t:0.62 m",
      "t:5.4 s (5.6 m of travel)",
      "t:0.31 s (0.31 m of travel)",
      "t:2D sonar Medium CHIRP 83 kHz, 50° cone",
      "t:DownScan 700 kHz CHIRP, 51° fan, 3.0° thick",
    ]);
    expect(digestOf(view)).toBe("e620c48a");
  });

  it("writes the picture from behind, tag for tag (drawCoverage, lines 600 to 622)", () => {
    expect(viewOf()["cov-svg"]).toEqual({
      attrs: { viewBox: "0 0 320 224" },
      html: '<line x1="8" y1="16" x2="312" y2="16" stroke="var(--water)" stroke-width="1.2"/><rect x="8" y="150" width="304" height="10" fill="var(--ground)" opacity="0.6"/><polygon points="160,22 98.9471318146355,150 221.0528681853645,150" fill="var(--cds)" fill-opacity="0.14" stroke="var(--cds)" stroke-width="1.5" stroke-dasharray="5 4"/><polygon points="160,22 100.31261975616017,150 219.6873802438398,150" fill="var(--c2d)" fill-opacity="0.18" stroke="var(--c2d)" stroke-width="1.5"/><line x1="8" y1="150" x2="312" y2="150" stroke="var(--muted)" stroke-width="1.2"/><circle cx="160" cy="22" r="4" fill="var(--fg)"/><line x1="100.31261975616017" x2="219.6873802438398" y1="172" y2="172" stroke="var(--c2d)" stroke-width="1.5"/><line x1="100.31261975616017" x2="100.31261975616017" y1="168" y2="176" stroke="var(--c2d)" stroke-width="1.5"/><line x1="219.6873802438398" x2="219.6873802438398" y1="168" y2="176" stroke="var(--c2d)" stroke-width="1.5"/><text x="160" y="188" text-anchor="middle" font-family="var(--font-data)" font-size="11" fill="var(--fg)">2D 9.3 m</text><line x1="98.9471318146355" x2="221.0528681853645" y1="200" y2="200" stroke="var(--cds)" stroke-width="1.5"/><line x1="98.9471318146355" x2="98.9471318146355" y1="196" y2="204" stroke="var(--cds)" stroke-width="1.5"/><line x1="221.0528681853645" x2="221.0528681853645" y1="196" y2="204" stroke="var(--cds)" stroke-width="1.5"/><text x="160" y="216" text-anchor="middle" font-family="var(--font-data)" font-size="11" fill="var(--fg)">DownScan 9.5 m</text><text x="168" y="86" font-family="var(--font-data)" font-size="11" fill="var(--muted)">10.0 m</text>',
    });
  });

  it("writes the table of frequencies, tag for tag (freqTable, lines 693 to 703)", () => {
    expect(viewOf()["fq-table"]).toEqual({
      html: '<tr><th>Freq</th><th>Use</th><th>Angle</th><th>Width on bottom</th><th>Edge err.</th></tr><tr><td class="n">83 kHz</td><td>2D Medium CHIRP</td><td class="n">50°</td><td class="n">9.3 m</td><td class="n">10.3%</td></tr><tr><td class="n">200 kHz</td><td>2D High CHIRP</td><td class="n">20°</td><td class="n">3.5 m</td><td class="n">1.5%</td></tr><tr><td class="n">700 kHz CHIRP</td><td>DownScan</td><td class="n">51°</td><td class="n">9.5 m</td><td class="n">10.8%</td></tr><tr><td class="n">1200 kHz CHIRP</td><td>DownScan</td><td class="n">30°</td><td class="n">5.4 m</td><td class="n">3.5%</td></tr><tr><td class="n">455 kHz CHIRP</td><td>SideScan, per side</td><td class="n">85°</td><td class="n">max 91 m out</td><td class="n">—</td></tr><tr><td class="n">1075 kHz CHIRP</td><td>SideScan, per side</td><td class="n">36°</td><td class="n">max 46 m out</td><td class="n">—</td></tr>',
    });
  });
});

describe("the section as a whole (renderVS, lines 706 to 710)", () => {
  const cases: ViewRow[] = [
    ["the page as it starts", {}, {}, 25, "e620c48a"],
    ["the page as it starts, in sv-SE", {}, SV, 25, "ba0e0d3a"],
    ["a depth of 0", { dep: "0" }, {}, 1, "6fafc6b2"],
    ["a blank depth", { dep: "" }, {}, 1, "6fafc6b2"],
    ["a negative depth", { dep: "-3" }, {}, 1, "6fafc6b2"],
    ["a cone of 0°", { cone0: "0" }, {}, 1, "2f881b09"],
    ["the second cone at 120°", { cone1: "120" }, {}, 1, "2f881b09"],
    ["a cone just under 120°", { cone0: "119.9" }, {}, 25, "348602d0"],
    ["a down fan of 150°", { down0: "150" }, {}, 1, "cf5f57bc"],
    ["a down fan just under 150°", { down1: "149.9" }, {}, 25, "f3d6a269"],
    ["a thickness of 0°", { dst: "0" }, {}, 1, "cf5f57bc"],
    ["a thickness of 30°", { dst: "30" }, {}, 1, "cf5f57bc"],
    ["a thickness just under 30°", { dst: "29.9" }, {}, 25, "1cdf7ae2"],
    ["a blank thickness", { dst: "" }, {}, 1, "cf5f57bc"],
    [
      "a down fan of 0°, with the name another brand gives its down imaging",
      { down0: "0" },
      OTHER_BRAND,
      1,
      "80c25d9d",
    ],
    ["depth and cone both wrong: the depth is named", { dep: "0", cone0: "0" }, {}, 1, "6fafc6b2"],
    [
      "cone and down fan both wrong: the 2D angles are named",
      { cone0: "0", down0: "0" },
      {},
      1,
      "2f881b09",
    ],
    [
      "a wrong cone without 2D ticked: no message, the cone's values are dashes",
      { "eq-2d": false, cone0: "" },
      {},
      25,
      "29101418",
    ],
    [
      "a wrong down fan without down imaging ticked: no message",
      { "eq-ds": false, down0: "", dst: "" },
      {},
      25,
      "f1dac8a6",
    ],
    ["a cone of 200° without 2D ticked", { "eq-2d": false, cone0: "200" }, {}, 25, "d803c4cd"],
    ["neither 2D nor down imaging ticked", { "eq-2d": false, "eq-ds": false }, {}, 25, "e4a48580"],
    [
      "neither ticked, and side imaging not either",
      { "eq-2d": false, "eq-ds": false, "eq-ss": false },
      {},
      25,
      "cf3b4abf",
    ],
    ["a wrong range of side imaging: not this section's", { ssr: "0" }, {}, 25, "e620c48a"],
  ];

  it.each(cases)("%s", (...row) => {
    expectView(row);
  });

  // The matrix of docs/SPEC.md 3.1 for the message of the section: the field that fails, the
  // setup, the message.
  const wrong: [string, RawFields, Setup, string][] = [
    ["a depth of 0", { dep: "0" }, {}, "Fix the depth in Settings."],
    ["a cone of 0°", { cone0: "0" }, {}, "Fix the 2D angles in Settings."],
    ["a down fan of 150°", { down0: "150" }, {}, "Fix the DownScan angles in Settings."],
    ["a thickness of 30°", { dst: "30" }, {}, "Fix the DownScan angles in Settings."],
    [
      "a down fan of 0° of another brand",
      { down0: "0" },
      OTHER_BRAND,
      "Fix the Down Imaging angles in Settings.",
    ],
  ];

  it.each(wrong)(
    "writes only the message and draws no screen: %s",
    (_what, fields, setup, message) => {
      const input = inputFor(fields, setup);
      const view = coverageView(input);
      expect(Object.keys(view)).toEqual(["vs-serr"]);
      expect(view["vs-serr"]).toEqual({ text: message, hidden: false });
      expect(drawn("2d", input)).toEqual([]);
      expect(drawn("ds", input)).toEqual([]);
    },
  );

  it("does not check the angles of a sonar that is not ticked, and writes its values as they are", () => {
    const no2d = viewOf({ "eq-2d": false, cone0: "" });
    expect(toldOf(no2d, ["vs-serr", ...TOP])).toEqual([
      NO_ERR,
      "t:— m across",
      "t:9.5 m wide",
      "h:0e39cba0:1014 x:DownScan 9.5 m|10.0 m {viewBox=0 0 320 196}",
      "t:2D sonar Medium CHIRP 83 kHz, NaN° cone",
      "t:DownScan 700 kHz CHIRP, 51° fan, 3.0° thick",
    ]);
    expect(toldOf(no2d, OFF)).toEqual([
      NO_ERR,
      "t:8.2 m",
      "t:0.25 m (3.1%)",
      "t:14°",
      "t:no, outside (edge at NaN°)",
      "t:yes",
      "t:— m (NaN%)",
      "t:0.86 m (10.8%)",
    ]);
    expect(toldOf(no2d, ARCH)).toEqual([
      NO_ERR,
      "[shown]",
      "t:6.0 m",
      "t:— m",
      "t:— m",
      "t:— s (— m of travel)",
      "t:0.31 s (0.31 m of travel)",
    ]);
    const noDs = viewOf({ "eq-ds": false, down0: "", dst: "" });
    expect(toldOf(noDs, ["vs-serr", ...TOP])).toEqual([
      NO_ERR,
      "t:9.3 m across",
      "t:— m wide",
      "h:ba4e808a:993 x:2D 9.3 m|10.0 m {viewBox=0 0 320 196}",
      "t:2D sonar Medium CHIRP 83 kHz, 50° cone",
      "t:DownScan 700 kHz CHIRP, NaN° fan, NaN° thick",
    ]);
    expect(toldOf(noDs, ARCH).slice(-1)).toEqual(["t:— s (— m of travel)"]);
  });

  it("keeps nothing from one call to the next: a right page after a wrong one gives the whole view", () => {
    expect(digestOf(viewOf({ dep: "0" }))).toBe("6fafc6b2");
    expect(digestOf(viewOf({ z: "0" }))).toBe("b6c7d7fa");
    expect(digestOf(viewOf({ zf: "0" }))).toBe("cd1d2d56");
    expect(digestOf(viewOf())).toBe("e620c48a");
  });

  it("does not change what it is given", () => {
    const input = inputFor();
    const before = JSON.stringify([input.settings, input.eq, input.ui, input.names, input.local]);
    coverageView(input);
    drawn("2d", input);
    drawn("ds", input);
    expect(JSON.stringify([input.settings, input.eq, input.ui, input.names, input.local])).toBe(
      before,
    );
  });

  it("takes a number field that is given as a text, or is not given, for no number", () => {
    // The digests are those of the blank field: a field the page does not have is no number
    // either (`num`, line 11).
    const blank: [string, string][] = [
      ["z", "b6c7d7fa"],
      ["x", "a879ff00"],
      ["zf", "cd1d2d56"],
      ["y", "661a896f"],
    ];
    const input = inputFor();
    for (const [id, digest] of blank) {
      expect(digestOf(coverageView({ ...input, local: { ...input.local, [id]: "8" } }))).toBe(
        digest,
      );
      const { [id]: _left, ...local } = input.local;
      expect(digestOf(coverageView({ ...input, local }))).toBe(digest);
    }
    const { scrT: _left, ...local } = input.local;
    expect(logSum(drawn("2d", { ...input, local }))).toBe("49:e0cac99f");
    expect(logSum(drawn("2d", { ...input, local: { ...local, scrT: "40" } }))).toBe("49:e0cac99f");
  });

  it("takes a choice of transducer that is not given for the first preset", () => {
    // The digest is the one of a choice the page does not know (`PI`, line 172).
    const input = inputFor();
    const { "img-p": _first, "img-s": _second, ...local } = input.local;
    expect(digestOf(coverageView({ ...input, local }))).toBe("e620c48a");
    expect(digestOf(coverageView({ ...input, local: { ...local, "img-p": 1, "img-s": 2 } }))).toBe(
      "e620c48a",
    );
  });

  it("fails as the earlier page does when the transducer has no 2D or no down frequency", () => {
    // Line 710 reads the angle of a frequency that is not there: a TypeError in the earlier page
    // too, after the message of the section is written. No preset is without frequencies.
    const input = inputFor();
    const noCone = { ...input, settings: { ...input.settings, cone: [] } };
    const noDown = { ...input, settings: { ...input.settings, down: [] } };
    for (const without of [noCone, noDown]) {
      expect(() => coverageView(without)).toThrow(TypeError);
      for (const paint of [paintScreen2d, paintScreenDs]) {
        const { surface, log } = recordingSurface(STAND_IN[0], STAND_IN[1], standInMeasure);
        expect(() => paint(surface, without)).toThrow(TypeError);
        expect(log).toEqual([]);
      }
    }
    const wrongDepth = { ...noCone, settings: { ...noCone.settings, dep: 0 } };
    expect(Object.keys(coverageView(wrongDepth))).toEqual(["vs-serr"]);
  });
});

describe("the frequencies chosen (line 710)", () => {
  const cases: ViewRow[] = [
    ["the second 2D frequency", {}, { ui: { f2d: "1" } }, 25, "27ea0aa2"],
    ["the second down frequency", {}, { ui: { fds: "1" } }, 25, "8635da84"],
    [
      "both second frequencies, in sv-SE",
      {},
      { ui: { f2d: "1", fds: "1" }, locale: "sv-SE" },
      25,
      "2cc7846b",
    ],
    [
      "a 2D frequency the transducer does not have: the first",
      {},
      { ui: { f2d: "2" } },
      25,
      "e620c48a",
    ],
    ["a down frequency that is no number: the first", {}, { ui: { fds: "x" } }, 25, "e620c48a"],
    ["a frequency saved as 1.5: the first", {}, { ui: { f2d: "1.5", fds: "1.5" } }, 25, "e620c48a"],
    ["a frequency saved as -1: the first", {}, { ui: { f2d: "-1", fds: "-1" } }, 25, "e620c48a"],
    [
      "a frequency saved as the number 1",
      {},
      { ui: { f2d: saved(1), fds: saved(1) } },
      25,
      "09ae1abb",
    ],
    [
      "a frequency saved as an empty text: the first",
      {},
      { ui: { f2d: "", fds: "" } },
      25,
      "e620c48a",
    ],
    [
      "the third down frequency of a transducer that has three",
      {},
      { first: "hb_xm14hw", ui: { fds: "2" } },
      25,
      "0ff01bb8",
    ],
  ];

  it.each(cases)("%s", (...row) => {
    expectView(row);
  });

  it("writes the widths, the picture and the lines over the screens for the frequencies chosen", () => {
    expect(toldOf(viewOf({}, { ui: { f2d: "1", fds: "1" }, locale: "sv-SE" }), TOP)).toEqual([
      "t:3,5 m across",
      "t:5,4 m wide",
      "h:2152e62c:1632 x:2D 3,5 m|DownScan 5,4 m|10,0 m {viewBox=0 0 320 224}",
      "t:2D sonar High CHIRP 200 kHz, 20° cone",
      "t:DownScan 1200 kHz CHIRP, 30° fan, 3,0° thick",
    ]);
    expect(toldOf(viewOf({}, { first: "hb_xm14hw", ui: { fds: "2" } }), TOP)).toEqual([
      "t:7.7 m across",
      "t:15.3 m wide",
      "h:550c2f27:1633 x:2D 7.7 m|Down Imaging 15.3 m|10.0 m {viewBox=0 0 320 224}",
      "t:2D sonar CHIRP Wide 140–200 kHz, 42° cone",
      "t:Down Imaging MEGA Imaging+, 75° fan, 3.0° thick",
    ]);
  });

  it("writes a 2D frequency without a name without one over its screen", () => {
    expect(toldOf(viewOf({}, { first: "hb_xm920" }), TOP)).toEqual([
      "t:11.5 m across",
      "t:15.3 m wide",
      "h:0c91507a:1622 x:2D 11.5 m|Down Imaging 15.3 m|10.0 m {viewBox=0 0 320 224}",
      "t:2D sonar 83 kHz, 60° cone",
      "t:Down Imaging 455 kHz, 75° fan, 3.0° thick",
    ]);
  });
});

describe("the widths and the picture from behind (drawCoverage, lines 600 to 622)", () => {
  const cases: ViewRow[] = [
    ["a depth that is not round", { dep: "7.3" }, {}, 25, "52002ce7"],
    ["a depth that is not round, in sv-SE", { dep: "7,3" }, SV, 25, "21725c43"],
    ["only 2D ticked", { "eq-ds": false }, {}, 25, "b7d39cc6"],
    ["only down imaging ticked", { "eq-2d": false }, {}, 25, "76717921"],
    ["a cone of 100°: the picture is as wide as it gets", { cone0: "100" }, {}, 25, "f68baab0"],
    ["a cone of 96° and a fan of 94°", { cone0: "96", down0: "94" }, {}, 25, "cc2a7416"],
    ["a fan of 140°, wider than the cone", { down0: "140" }, {}, 25, "68091bef"],
    ["a depth of 5 mm: the picture's width has a floor", { dep: "0.005" }, {}, 20, "9c00266c"],
    ["a depth of 9 mm", { dep: "0.009", cone0: "93.7" }, {}, 20, "4418f997"],
    ["shallow water", { dep: "0.4" }, {}, 20, "399714bb"],
    [
      "angles that are not round",
      { dep: "13.7", cone0: "47.3", down0: "61.9" },
      {},
      25,
      "44b82f67",
    ],
    [
      "only 2D ticked, shallow water",
      { "eq-ds": false, dep: "0.4", zf: "0.2" },
      {},
      25,
      "0102c4cc",
    ],
    [
      "only down imaging ticked, shallow water",
      { "eq-2d": false, dep: "0.4", zf: "0.2" },
      {},
      25,
      "88e0ea1e",
    ],
    ["the name another brand gives its down imaging", {}, OTHER_BRAND, 25, "2d70427c"],
  ];

  it.each(cases)("%s", (...row) => {
    expectView(row);
  });

  it("draws a beam and its measure only for a sonar that is ticked, and sets the height to what is drawn", () => {
    const picture = (fields: RawFields): string => toldOf(viewOf(fields), ["cov-svg"])[0] ?? "";
    expect(picture({})).toBe(
      "h:918e75e1:1616 x:2D 9.3 m|DownScan 9.5 m|10.0 m {viewBox=0 0 320 224}",
    );
    expect(picture({ "eq-ds": false })).toBe(
      "h:ba4e808a:993 x:2D 9.3 m|10.0 m {viewBox=0 0 320 196}",
    );
    expect(picture({ "eq-2d": false })).toBe(
      "h:0e39cba0:1014 x:DownScan 9.5 m|10.0 m {viewBox=0 0 320 196}",
    );
    expect(picture({ "eq-2d": false, "eq-ds": false })).toBe(
      "h:2ffbbbe5:391 x:10.0 m {viewBox=0 0 320 168}",
    );
  });

  it("writes the widths at the depth, and a lower picture for a wide beam or a very small depth", () => {
    expect(toldOf(viewOf({ dep: "7.3" }), TOP.slice(0, 3))).toEqual([
      "t:6.8 m across",
      "t:7.0 m wide",
      "h:c3a2eced:1615 x:2D 6.8 m|DownScan 7.0 m|7.3 m {viewBox=0 0 320 224}",
    ]);
    expect(toldOf(viewOf({ cone0: "100" }), TOP.slice(0, 3))).toEqual([
      "t:23.8 m across",
      "t:9.5 m wide",
      "h:d639c94b:1813 x:2D 23.8 m|DownScan 9.5 m|10.0 m {viewBox=0 0 320 214}",
    ]);
    expect(toldOf(viewOf({ dep: "0.005" }), TOP.slice(0, 3))).toEqual([
      "t:0.00 m across",
      "t:0.00 m wide",
      "h:79c37496:1615 x:2D 0.00 m|DownScan 0.00 m|0.01 m {viewBox=0 0 320 166}",
    ]);
  });
});

describe("the graph of width against depth (lines 624 to 632)", () => {
  const cases: ViewRow[] = [
    ["a depth of 20 m: the graph still reaches 30 m", { dep: "20" }, {}, 25, "9d21b9a9"],
    ["a depth of 21 m: the graph reaches 40 m", { dep: "21" }, {}, 25, "8b612fbb"],
    ["a depth of 33.4 m: the graph reaches 60 m", { dep: "33.4" }, {}, 25, "51e08092"],
    ["a depth of 100 m: the graph reaches 150 m", { dep: "100" }, {}, 25, "010348be"],
    ["a depth of 101 m: the graph reaches 200 m", { dep: "101" }, {}, 25, "d6e17503"],
    ["a depth of 250 m", { dep: "250" }, {}, 25, "43370137"],
    [
      "narrow beams: the width axis in steps of 0.5",
      { cone0: "5", down0: "4" },
      {},
      25,
      "76209647",
    ],
    ["beams of 10°: steps of 1", { cone0: "10", down0: "9" }, {}, 25, "c26a99c3"],
    [
      "beams of 20°: steps of 2.5, written as whole numbers",
      { cone0: "20", down0: "19" },
      {},
      25,
      "9f8cd5c7",
    ],
    ["beams of 75°: steps of 10", { cone0: "75", down0: "74" }, {}, 25, "97e0a835"],
    ["beams of 100°: steps of 20", { cone0: "100", down0: "110" }, {}, 25, "c3f83c64"],
    [
      "only 2D ticked, a narrow cone under a wide fan that is not drawn",
      { "eq-ds": false, cone0: "8", down0: "140" },
      {},
      25,
      "32a8d2f6",
    ],
    [
      "only down imaging ticked, a narrow fan under a wide cone that is not drawn",
      { "eq-2d": false, cone0: "110", down0: "12" },
      {},
      25,
      "53ef9935",
    ],
  ];

  it.each(cases)("%s", (...row) => {
    expectView(row);
  });

  it("writes the numbers of both axes as the earlier lines write them, a step of 2.5 as whole numbers", () => {
    const graph = (fields: RawFields, setup: Setup = {}): string =>
      toldOf(viewOf(fields, setup), ["cov-graph"])[0] ?? "";
    expect(graph({})).toBe("h:87c81ae3:3196 x:0|5|10|15|20|25|30|0|5|10|15|20|25|30|Depth (m)|m");
    expect(graph({ cone0: "20", down0: "19" })).toBe(
      "h:abe4a6ee:2818 x:0|3|5|8|10|13|0|5|10|15|20|25|30|Depth (m)|m",
    );
    expect(graph({ cone0: "5", down0: "4" })).toBe(
      "h:cd27d2f7:3203 x:0.0|0.5|1.0|1.5|2.0|2.5|3.0|0|5|10|15|20|25|30|Depth (m)|m",
    );
    expect(graph({ dep: "21" })).toBe("h:5f3ab961:2289 x:0|10|20|30|40|0|10|20|30|40|Depth (m)|m");
    expect(graph({ "eq-2d": false }, OTHER_BRAND)).toBe(
      "h:edf29930:2607 x:0|10|20|30|40|50|0|5|10|15|20|25|30|Depth (m)|m",
    );
  });
});

describe("the steps of the width axis (stepOf, line 598)", () => {
  // the greatest width, the step the earlier function gives
  const cases: [number, number][] = [
    [0, 0.5],
    [2.5, 0.5],
    [3, 0.5],
    [3.5, 1],
    [5.5, 1],
    [6, 1],
    [6.5, 2.5],
    [14.5, 2.5],
    [15, 2.5],
    [15.5, 5],
    [29.5, 5],
    [30, 5],
    [30.5, 10],
    [59.5, 10],
    [60, 10],
    [60.5, 20],
    [1e9, 20],
    [-1, 0.5],
    [Number.NaN, 20],
  ];

  it.each(cases)("a greatest width of %d m has steps of %d m", (max, step) => {
    expect(stepOf(max)).toBe(step);
  });
});

describe("the frame of the two graphs (axes, lines 587 to 597)", () => {
  it("draws a line and a number for every step up to the greatest value, when the steps do not add up exactly too", () => {
    // 0.1 three times is a little over 0.3: the earlier loops allow for it.
    const ax = axes(0.3, 0.1, "x", 0.3, 0.1, "y");
    expect(told({ html: ax.g })).toBe("h:e8e6c1d8:1560 x:0.0|0.1|0.2|0.3|0|0|0|0|x|y");
    expect([0, 0.15, 0.3, 1].map(ax.X)).toEqual([38, 184, 330, 1011.3333333333334]);
    expect([0, 0.15, 0.3, 1, -0.1].map(ax.Y)).toEqual([180, 95, 10, 10, 236.66666666666669]);
  });

  it("writes the numbers of the across axis and of an up axis with steps of 1 or more as whole numbers", () => {
    const ax = axes(7, 2.6, "Depth (m)", 6, 1.2, "m");
    expect(told({ html: ax.g })).toBe("h:5969a29e:1724 x:0|1|2|4|5|6|0|3|5|Depth (m)|m");
    expect([3.3, 7].map(ax.X)).toEqual([175.65714285714284, 330]);
    expect([2.2, 100, -1].map(ax.Y)).toEqual([117.66666666666666, 10, 208.33333333333334]);
  });

  it("is the frame of the graph of a target off to the side, where a value over the greatest is drawn at the top", () => {
    const ax = axes(40, 5, "Angle from straight down (°)", 30, 5, "%");
    expect(told({ html: ax.g })).toBe(
      "h:8ebac1aa:2810 x:0|5|10|15|20|25|30|0|5|10|15|20|25|30|35|40|Angle from straight down (°)|%",
    );
    expect([29, 40].map(ax.X)).toEqual([249.7, 330]);
    expect([30.5, 12.5].map(ax.Y)).toEqual([10, 109.16666666666666]);
  });
});

describe("the table of frequencies (freqTable, lines 693 to 705)", () => {
  const cases: ViewRow[] = [
    [
      "an angle that is not the preset's: marked, and the note says so",
      { cone0: "45" },
      {},
      25,
      "9376ed0e",
    ],
    ["a side fan that is not the preset's", { side1: "30" }, {}, 25, "1190603a"],
    ["a down fan that is not the preset's, in sv-SE", { down1: "30,5" }, SV, 25, "46a90f69"],
    [
      "a changed cone without 2D ticked: no mark and no note",
      { "eq-2d": false, cone0: "45" },
      {},
      25,
      "69a940d8",
    ],
    [
      "a changed side fan without side imaging ticked: no mark and no note",
      { "eq-ss": false, side0: "60" },
      {},
      25,
      "229a8cbb",
    ],
    ["side imaging not ticked: no rows for it", { "eq-ss": false }, {}, 25, "229a8cbb"],
    [
      "a blank side fan: written as it is, the section has no check for it",
      { side0: "" },
      {},
      25,
      "52eeb4da",
    ],
    [
      "a transducer without names for its 2D frequencies",
      {},
      { first: "hb_xm920" },
      25,
      "3eae608c",
    ],
    ["a transducer without published ranges: dashes", {}, { first: "other" }, 25, "032fd717"],
    ["a transducer of another brand", {}, OTHER_BRAND, 25, "2d70427c"],
    [
      "a second transducer: its frequencies and the note of both",
      {},
      { first: "hb_xm9hw", second: "hb_xm14hw" },
      25,
      "62109459",
    ],
    [
      "a second transducer, a frequency it adds chosen",
      {},
      { first: "lowrance", second: "lowrance_nose", ui: { fds: "2" } },
      25,
      "a45bfcda",
    ],
    [
      "a second transducer that is the first: none",
      {},
      { first: "lowrance", second: "lowrance" },
      25,
      "e620c48a",
    ],
    ["a transducer the page does not know: the first preset", {}, { first: "" }, 25, "e620c48a"],
  ];

  it.each(cases)("%s", (...row) => {
    expectView(row);
  });

  const HEAD = "Freq|Use|Angle|Width on bottom|Edge err.";
  const SIDE = [
    "455 kHz CHIRP|SideScan, per side|85°|max 91 m out|—",
    "1075 kHz CHIRP|SideScan, per side|36°|max 46 m out|—",
  ];
  const table = (fields: RawFields, setup: Setup = {}): string[] =>
    tableOf(viewOf(fields, setup)["fq-table"]?.html ?? "");
  const note = (fields: RawFields, setup: Setup = {}): string =>
    toldOf(viewOf(fields, setup), ["fq-note"])[0] ?? "";

  it("marks an angle that is not the preset's, and says so in the note", () => {
    expect(table({ cone0: "45" })).toEqual([
      HEAD,
      "83 kHz|2D Medium CHIRP|[45°*]|8.3 m|8.2%",
      "200 kHz|2D High CHIRP|20°|3.5 m|1.5%",
      "700 kHz CHIRP|DownScan|51°|9.5 m|10.8%",
      "1200 kHz CHIRP|DownScan|30°|5.4 m|3.5%",
      ...SIDE,
    ]);
    expect(viewOf({ cone0: "45" })["fq-table"]?.html).toContain(
      '<td class="n" style="color:var(--accent)">45°*</td>',
    );
    expect(note({ cone0: "45" })).toBe(NOTE_START + NOTE_CHANGED + NOTE_END);
    expect(note({})).toBe(NOTE_START + NOTE_END);
  });

  it("writes the numbers as the locale writes them", () => {
    expect(table({ down1: "30,5" }, SV)).toEqual([
      HEAD,
      "83 kHz|2D Medium CHIRP|50°|9,3 m|10,3%",
      "200 kHz|2D High CHIRP|20°|3,5 m|1,5%",
      "700 kHz CHIRP|DownScan|51°|9,5 m|10,8%",
      "1200 kHz CHIRP|DownScan|[31°*]|5,5 m|3,6%",
      ...SIDE,
    ]);
    expect(note({ down1: "30,5" }, SV)).toBe(NOTE_START + NOTE_CHANGED + NOTE_END);
  });

  it("lists only the sonars that are ticked, and counts a changed angle only among them", () => {
    expect(table({ "eq-ss": false, side0: "60" })).toEqual([
      HEAD,
      "83 kHz|2D Medium CHIRP|50°|9.3 m|10.3%",
      "200 kHz|2D High CHIRP|20°|3.5 m|1.5%",
      "700 kHz CHIRP|DownScan|51°|9.5 m|10.8%",
      "1200 kHz CHIRP|DownScan|30°|5.4 m|3.5%",
    ]);
    expect(note({ "eq-ss": false, side0: "60" })).toBe(NOTE_START + NOTE_END);
    expect(table({ "eq-2d": false, "eq-ds": false, "eq-ss": false })).toEqual([HEAD]);
    expect(note({ "eq-2d": false, "eq-ds": false, "eq-ss": false })).toBe(NOTE_START + NOTE_END);
  });

  it("writes a side fan that is no number as it is: the section does not check side imaging", () => {
    expect(table({ side0: "" })).toEqual([
      HEAD,
      "83 kHz|2D Medium CHIRP|50°|9.3 m|10.3%",
      "200 kHz|2D High CHIRP|20°|3.5 m|1.5%",
      "700 kHz CHIRP|DownScan|51°|9.5 m|10.8%",
      "1200 kHz CHIRP|DownScan|30°|5.4 m|3.5%",
      "455 kHz CHIRP|SideScan, per side|[NaN°*]|max 91 m out|—",
      "1075 kHz CHIRP|SideScan, per side|36°|max 46 m out|—",
    ]);
    expect(note({ side0: "" })).toBe(NOTE_START + NOTE_CHANGED + NOTE_END);
  });

  it("names a 2D frequency without a name as 2D alone, and writes a dash for a range that is not published", () => {
    expect(table({}, { first: "hb_xm920" })).toEqual([
      HEAD,
      "83 kHz|2D|60°|11.5 m|15.5%",
      "200 kHz|2D|20°|3.5 m|1.5%",
      "455 kHz|Down Imaging|75°|15.3 m|26.0%",
      "800 kHz|Down Imaging|45°|8.3 m|8.2%",
      "MEGA Imaging|Down Imaging|75°|15.3 m|26.0%",
      "455 kHz|Side Imaging, per side|86°|max 244 m out|—",
      "800 kHz|Side Imaging, per side|55°|max 76 m out|—",
      "MEGA Imaging|Side Imaging, per side|86°|max 76 m out|—",
    ]);
    expect(note({}, { first: "hb_xm920" })).toBe(
      "t:Humminbird XM 9 20 MSI T. Side and Down Imaging angles and ranges are from Humminbird's help article on Side Imaging transducers, measured where the echo is 10 dB below the center. 2D is DualBeam Plus; the 60° (83 kHz) and 20° (200 kHz) are from the same help article, also measured at −10 dB. Widths and edge errors are at your depth.",
    );
    expect(table({}, { first: "other" })).toEqual([
      HEAD,
      "Low|2D|50°|9.3 m|10.3%",
      "High|2D|20°|3.5 m|1.5%",
      "Low|Down imaging|75°|15.3 m|26.0%",
      "High|Down imaging|45°|8.3 m|8.2%",
      "Low|Side imaging, per side|85°|—|—",
      "High|Side imaging, per side|55°|—|—",
    ]);
    expect(note({}, { first: "other" })).toBe(
      "t:Other (Garmin or anything else: enter your own). Example figures to replace with your transducer's. Garmin doesn't list ClearVü or SideVü beam angles on its product pages, as far as could be found. Widths and edge errors are at your depth.",
    );
  });

  it("writes the label and the note of both transducers when there is a second one", () => {
    const both: Setup = { first: "hb_xm9hw", second: "hb_xm14hw" };
    expect(table({}, both)).toEqual([
      HEAD,
      "140–200 kHz|2D CHIRP Wide|42°|7.7 m|7.1%",
      "180–240 kHz|2D CHIRP Narrow|25°|4.4 m|2.4%",
      "455 kHz|Down Imaging|75°|15.3 m|26.0%",
      "800 kHz|Down Imaging|45°|8.3 m|8.2%",
      "MEGA Imaging+|Down Imaging|75°|15.3 m|26.0%",
      "455 kHz|Side Imaging, per side|86°|max 244 m out|—",
      "800 kHz|Side Imaging, per side|86°|max 76 m out|—",
      "MEGA Imaging+|Side Imaging, per side|86°|max 122 m out|—",
    ]);
    expect(note({}, both)).toBe(
      "t:Humminbird XM 9 HW MSI T + Humminbird XM 14 HW MSI T. Side and Down Imaging angles and ranges are from Humminbird's help article on Side Imaging transducers, measured where the echo is 10 dB below the center. 2D is Dual Spectrum CHIRP (Full 150–220, Narrow 180–240, Wide 140–200 kHz per the product page). The Wide and Narrow angles are from the same help article, which gives them for Dual Spectrum CHIRP at −10 dB but doesn't say they are the 2D cone angles. Second transducer, Humminbird XM 14 HW MSI T: Side and Down Imaging angles and ranges are from Humminbird's help article on Side Imaging transducers, measured where the echo is 10 dB below the center. 2D is Dual Spectrum CHIRP (Full 150–220, Narrow 180–240, Wide 140–200 kHz per the product page). The Wide and Narrow angles are from the same help article, which gives them for Dual Spectrum CHIRP at −10 dB but doesn't say they are the 2D cone angles. Only the frequencies the second transducer adds are listed for it. Widths and edge errors are at your depth.",
    );
  });
});

describe("a target off to the side (lines 716 to 729, and drawOff, lines 634 to 647)", () => {
  const cases: ViewRow[] = [
    ["a target depth of 0", { z: "0" }, {}, 19, "b6c7d7fa"],
    ["a blank target depth", { z: "" }, {}, 19, "b6c7d7fa"],
    ["a negative target depth", { z: "-2" }, {}, 19, "b6c7d7fa"],
    ["a negative side distance", { x: "-0.5" }, {}, 19, "a879ff00"],
    ["a blank side distance", { x: "" }, {}, 19, "a879ff00"],
    [
      "target depth and side distance both wrong: the depth is named",
      { z: "0", x: "-1" },
      {},
      19,
      "b6c7d7fa",
    ],
    ["a target straight under the boat", { x: "0" }, {}, 25, "be728bbd"],
    [
      "a target at 45°, beams of 90°: on the edge counts as inside",
      { z: "5", x: "5", cone0: "90", down0: "90" },
      {},
      25,
      "4be11744",
    ],
    [
      "a target at 45°, beams just under 90°: outside",
      { z: "5", x: "5", cone0: "89.9", down0: "89.9" },
      {},
      25,
      "530c90e7",
    ],
    ["a target outside the cone and inside the fan", { z: "8", x: "3.8" }, {}, 25, "a3384e60"],
    ["a target outside both", { z: "8", x: "6" }, {}, 25, "32588aea"],
    ["a target outside both, in sv-SE", { z: "8", x: "6,5" }, SV, 25, "12fd3fe9"],
    [
      "a target just inside 40° from straight down: marked on the graph",
      { z: "1", x: "0.839" },
      {},
      25,
      "803d3455",
    ],
    ["a target just beyond 40°: not marked", { z: "1", x: "0.8392" }, {}, 25, "532b6478"],
    [
      "a target at 40° to the last digit: marked",
      { z: "1", x: "0.8390996311772799" },
      {},
      25,
      "36059789",
    ],
    ["values that are not round", { z: "7.3", x: "1.9" }, {}, 25, "fbb2ad10"],
    ["a shallow target far to the side", { z: "0.3", x: "12" }, {}, 25, "ec7ba66b"],
    [
      "a cone of 80°: its edge is drawn at the end of the graph",
      { cone0: "80" },
      {},
      25,
      "72023377",
    ],
    ["a cone of 80.1°: its edge is beyond the graph", { cone0: "80.1" }, {}, 25, "fe97d737"],
    ["a cone of 58°: its label to the right of the edge", { cone0: "58" }, {}, 25, "bf8b43e3"],
    ["a cone of 58.2°: its label to the left", { cone0: "58.2" }, {}, 25, "87c0dc83"],
    ["a fan of 58.2°", { down0: "58.2" }, {}, 25, "f54e9272"],
    [
      "a fan of 81°: beyond the graph, the cone's edge keeps its place",
      { down0: "81" },
      {},
      25,
      "3866112c",
    ],
    [
      "only down imaging ticked: its edge has the first place",
      { "eq-2d": false },
      {},
      25,
      "76717921",
    ],
    ["only 2D ticked: one edge", { "eq-ds": false }, {}, 25, "b7d39cc6"],
    ["another brand's name on the fan's edge", {}, OTHER_BRAND, 25, "2d70427c"],
  ];

  it.each(cases)("%s", (...row) => {
    expectView(row);
  });

  // The matrix of docs/SPEC.md 3.1 for the message of the target: the field that fails, the message.
  const wrong: [string, RawFields, string][] = [
    ["a target depth of 0", { z: "0" }, "Enter a target depth greater than 0 m."],
    ["a blank target depth", { z: "" }, "Enter a target depth greater than 0 m."],
    ["a negative side distance", { x: "-0.5" }, "Enter a side distance of 0 m or more."],
    ["a blank side distance", { x: "" }, "Enter a side distance of 0 m or more."],
  ];

  it.each(wrong)(
    "shows the message, a dash for the depth drawn and no mark on the graph, and leaves the six results as they were: %s",
    (_what, fields, message) => {
      const input = inputFor(fields);
      const view = coverageView(input);
      expect(toldOf(view, OFF)).toEqual([
        `t:${message} [shown]`,
        "t:—",
        NOT,
        NOT,
        NOT,
        NOT,
        NOT,
        NOT,
      ]);
      expect(toldOf(view, ["off-graph"])).toEqual([OFF_GRAPH_NO_MARK]);
      // The rest of the section is written as it is for a right target.
      expect(Object.keys(view)).toHaveLength(19);
      expect(toldOf(view, ARCH)).toEqual([
        NO_ERR,
        "[shown]",
        "t:6.0 m",
        "t:6.6 m",
        "t:0.62 m",
        "t:5.4 s (5.6 m of travel)",
        "t:0.31 s (0.31 m of travel)",
      ]);
      expect(logSum(drawn("2d", input))).toBe("49:e0cac99f");
      expect(logSum(drawn("ds", input))).toBe("49:cc0fb282");
    },
  );

  it("writes where the target is drawn, by how much too deep, and whether it is inside each beam", () => {
    expect(toldOf(viewOf({ z: "5", x: "5", cone0: "90", down0: "90" }), OFF)).toEqual([
      NO_ERR,
      "t:7.1 m",
      "t:2.1 m (41.4%)",
      "t:45°",
      "t:yes",
      "t:yes",
      "t:2.1 m (41.4%)",
      "t:2.1 m (41.4%)",
    ]);
    expect(toldOf(viewOf({ z: "5", x: "5", cone0: "89.9", down0: "89.9" }), OFF)).toEqual([
      NO_ERR,
      "t:7.1 m",
      "t:2.1 m (41.4%)",
      "t:45°",
      "t:no, outside (edge at 45°)",
      "t:no, outside (edge at 45°)",
      "t:2.1 m (41.3%)",
      "t:2.1 m (41.3%)",
    ]);
    expect(toldOf(viewOf({ z: "8", x: "3.8" }), OFF)).toEqual([
      NO_ERR,
      "t:8.9 m",
      "t:0.86 m (10.7%)",
      "t:25°",
      "t:no, outside (edge at 25°)",
      "t:yes",
      "t:0.83 m (10.3%)",
      "t:0.86 m (10.8%)",
    ]);
    expect(toldOf(viewOf({ x: "0" }), OFF)).toEqual([
      NO_ERR,
      "t:8.0 m",
      "t:0.00 m (0.0%)",
      "t:0°",
      "t:yes",
      "t:yes",
      "t:0.83 m (10.3%)",
      "t:0.86 m (10.8%)",
    ]);
  });

  it("writes the target's numbers as the locale writes them", () => {
    expect(toldOf(viewOf({ z: "8", x: "6,5" }, SV), OFF)).toEqual([
      NO_ERR,
      "t:10,3 m",
      "t:2,3 m (28,8%)",
      "t:39°",
      "t:no, outside (edge at 25°)",
      "t:no, outside (edge at 26°)",
      "t:0,83 m (10,3%)",
      "t:0,86 m (10,8%)",
    ]);
  });

  it("draws on the graph the edges of the sonars that are ticked, out to 40°, and the target's mark out to 40°", () => {
    const graph = (fields: RawFields, setup: Setup = {}): string =>
      toldOf(viewOf(fields, setup), ["off-graph"])[0] ?? "";
    expect(graph({})).toBe(OFF_GRAPH);
    expect(graph({ z: "1", x: "0.8392" })).toBe(OFF_GRAPH_NO_MARK);
    expect(graph({ cone0: "80.1" })).toBe(
      "h:c822ff92:4169 x:0|5|10|15|20|25|30|0|5|10|15|20|25|30|35|40|Angle from straight down (°)|%|DownScan edge",
    );
    expect(graph({ "eq-2d": false }, OTHER_BRAND)).toBe(
      "h:07e1d6fd:4135 x:0|5|10|15|20|25|30|0|5|10|15|20|25|30|35|40|Angle from straight down (°)|%|Down Imaging edge",
    );
  });
});

describe("a fish passing under the boat (lines 731 to 747)", () => {
  const cases: ViewRow[] = [
    ["a fish depth of 0", { zf: "0" }, {}, 20, "cd1d2d56"],
    ["a blank fish depth", { zf: "" }, {}, 20, "cd1d2d56"],
    ["a fish at the bottom", { zf: "10" }, {}, 20, "74728383"],
    ["a fish below the bottom, in sv-SE", { dep: "7,5", zf: "8" }, SV, 20, "0b7e0b24"],
    ["a fish just above the bottom", { zf: "9.9" }, {}, 25, "e4886ab9"],
    ["a blank distance to the side of the track", { y: "" }, {}, 20, "661a896f"],
    ["a text as the distance to the side", { y: "abc" }, {}, 20, "661a896f"],
    ["a negative distance to the side: taken as positive", { y: "-2" }, {}, 25, "d251d3ea"],
    ["a speed of 0", { sog: "0" }, {}, 20, "f58aecae"],
    ["a blank speed", { sog: "" }, {}, 20, "f58aecae"],
    [
      "fish depth and side distance both wrong: the depth is named",
      { zf: "0", y: "" },
      {},
      20,
      "cd1d2d56",
    ],
    [
      "a fish below the bottom and a blank side distance: the bottom is named",
      { zf: "12", y: "" },
      {},
      20,
      "74728383",
    ],
    [
      "a blank side distance and no speed: the side distance is named",
      { y: "", sog: "0" },
      {},
      20,
      "661a896f",
    ],
    ["a fish to the side, inside both beams", { y: "2" }, {}, 25, "d251d3ea"],
    ["a fish outside the cone and inside the fan", { y: "2.83" }, {}, 25, "5396b052"],
    ["a fish outside both", { y: "3" }, {}, 25, "1e7566e4"],
    [
      "a fish inside the cone and outside the narrower fan",
      { y: "2" },
      { ui: { fds: "1" } },
      25,
      "1fd92565",
    ],
    ["a fish outside both, in sv-SE", { y: "3,5" }, SV, 25, "3b5df04a"],
    ["a speed in km/h", { sogu: "kmh", sog: "7.4" }, {}, 25, "a8b938dc"],
    [
      "values that are not round",
      { dep: "13.7", zf: "4.3", y: "1.1", sog: "3.7", dst: "2.5" },
      {},
      25,
      "a6b537ff",
    ],
    [
      "a slow boat: a long time in the beam",
      { sog: "0.05", zf: "9", y: "0.5" },
      {},
      25,
      "c0d422bc",
    ],
    [
      "a cone of 0° without 2D ticked: a fish on the track is on the cone's edge, which is inside",
      { "eq-2d": false, cone0: "0" },
      {},
      25,
      "b3d0e99f",
    ],
    [
      "a fan of 0° without down imaging ticked: a fish on the track is on the fan's edge, which is inside",
      { "eq-ds": false, down0: "0" },
      {},
      25,
      "ca559789",
    ],
  ];

  it.each(cases)("%s", (...row) => {
    expectView(row);
  });

  // The matrix of docs/SPEC.md 3.1 for the message of the fish: the field that fails, the
  // setup, the message.
  const wrong: [string, RawFields, Setup, string][] = [
    ["a fish depth of 0", { zf: "0" }, {}, "Enter a fish depth greater than 0 m."],
    ["a blank fish depth", { zf: "" }, {}, "Enter a fish depth greater than 0 m."],
    ["a fish at the bottom", { zf: "10" }, {}, "The fish has to be above the bottom (10.0 m)."],
    [
      "a fish below the bottom, in sv-SE",
      { dep: "7,5", zf: "8" },
      SV,
      "The fish has to be above the bottom (7,5 m).",
    ],
    ["a blank side distance", { y: "" }, {}, "Enter a side distance of 0 m or more."],
    ["a speed of 0", { sog: "0" }, {}, "Enter a speed in Settings."],
    ["a blank speed", { sog: "" }, {}, "Enter a speed in Settings."],
  ];

  it.each(wrong)(
    "shows the message, hides the results and leaves them as they were, and draws the screens without the fish: %s",
    (_what, fields, setup, message) => {
      const input = inputFor(fields, setup);
      const view = coverageView(input);
      expect(toldOf(view, ARCH)).toEqual([
        `t:${message} [shown]`,
        "[hidden]",
        NOT,
        NOT,
        NOT,
        NOT,
        NOT,
      ]);
      // The rest of the section is written.
      expect(Object.keys(view)).toHaveLength(20);
      expect(toldOf(view, ["vs-serr", "off-err"])).toEqual([NO_ERR, NO_ERR]);
      expect(view["o-shown"]?.text).toMatch(/^8[.,]2 m$/);
      for (const kind of ["2d", "ds"] as const) {
        const texts = logTexts(drawn(kind, input));
        expect(texts.filter((text) => text.startsWith("fish"))).toEqual([]);
        expect(texts.filter((text) => text.startsWith("bottom"))).toHaveLength(1);
      }
    },
  );

  it("draws the screens of a wrong fish as the earlier lines draw them", () => {
    const input = inputFor({ zf: "0" });
    expect(logTexts(drawn("2d", input))).toEqual([
      "5@69@89.33333333333333",
      "10@69@158.66666666666666",
      "now@68@11",
      "bottom 10.0 m@8@147.66666666666666",
    ]);
    expect(logSum(drawn("2d", input))).toBe("43:dcae35b3");
    expect(logSum(drawn("ds", input))).toBe("43:4cf408d5");
  });

  it("writes the arch of a fish inside the cone, and that there is none outside it", () => {
    const toTheSide = [
      NO_ERR,
      "[shown]",
      "t:6.3 m",
      "t:6.6 m",
      "t:0.30 m",
      "t:3.8 s (3.9 m of travel)",
      "t:0.32 s (0.33 m of travel)",
    ];
    expect(toldOf(viewOf({ y: "2" }), ARCH)).toEqual(toTheSide);
    // A distance to the other side is taken as the same distance (line 731).
    expect(toldOf(viewOf({ y: "-2" }), ARCH)).toEqual(toTheSide);
    expect(toldOf(viewOf({ y: "2.83" }), ARCH)).toEqual([
      NO_ERR,
      "[shown]",
      "t:no arch, fish outside the cone",
      "t:—",
      "t:—",
      "t:cone reaches 2.8 m to the side at 6.0 m",
      "t:0.34 s (0.35 m of travel)",
    ]);
    expect(toldOf(viewOf({ y: "3" }), ARCH)).toEqual([
      NO_ERR,
      "[shown]",
      "t:no arch, fish outside the cone",
      "t:—",
      "t:—",
      "t:cone reaches 2.8 m to the side at 6.0 m",
      "t:never, outside the 51° fan",
    ]);
    expect(toldOf(viewOf({ y: "2" }, { ui: { fds: "1" } }), ARCH)).toEqual([
      NO_ERR,
      "[shown]",
      "t:6.3 m",
      "t:6.6 m",
      "t:0.30 m",
      "t:3.8 s (3.9 m of travel)",
      "t:never, outside the 30° fan",
    ]);
  });

  it("takes a fish exactly on the edge of a beam for inside it", () => {
    // A beam of 0° that is not ticked is not checked, and reaches 0 m to the side: the edge.
    expect(toldOf(viewOf({ "eq-2d": false, cone0: "0" }), ARCH)).toEqual([
      NO_ERR,
      "[shown]",
      "t:6.0 m",
      "t:6.0 m",
      "t:0.00 m",
      "t:0.00 s (0.00 m of travel)",
      "t:0.31 s (0.31 m of travel)",
    ]);
    expect(toldOf(viewOf({ "eq-ds": false, down0: "0" }), ARCH).slice(-1)).toEqual([
      "t:0.31 s (0.31 m of travel)",
    ]);
  });

  it("writes the fish's numbers as the locale writes them, and the times at the speed in metres a second", () => {
    expect(toldOf(viewOf({ y: "3,5" }, SV), ARCH)).toEqual([
      NO_ERR,
      "[shown]",
      "t:no arch, fish outside the cone",
      "t:—",
      "t:—",
      "t:cone reaches 2,8 m to the side at 6,0 m",
      "t:never, outside the 51° fan",
    ]);
    expect(toldOf(viewOf({ sogu: "kmh", sog: "7.4" }), ARCH)).toEqual([
      NO_ERR,
      "[shown]",
      "t:6.0 m",
      "t:6.6 m",
      "t:0.62 m",
      "t:2.7 s (5.6 m of travel)",
      "t:0.15 s (0.31 m of travel)",
    ]);
  });
});

describe("what stands over the two screens (lines 752 and 753)", () => {
  const cases: ViewRow[] = [
    ["a thickness that is not round", { dst: "2.55" }, {}, 25, "2b61d23e"],
    ["a thickness that is not round, in sv-SE", { dst: "2,55" }, SV, 25, "cafb1eea"],
  ];

  it.each(cases)("%s", (...row) => {
    expectView(row);
  });
});

describe("the two screens (drawScreen, lines 648 to 692, and lines 748 to 751)", () => {
  const cases: ScreenRow[] = [
    ["the page as it starts", {}, {}, "49:e0cac99f", "49:cc0fb282"],
    ["the page as it starts, in sv-SE", {}, SV, "49:9ae5462b", "49:d4893276"],
    ["at the page's size", {}, { size: PAGE_SIZE }, "49:d76246eb", "49:bdca2c8a"],
    ["on a canvas of another shape", {}, { size: [51, 97] }, "49:c25e2144", "49:a8c4d3a7"],
    ["without a font in the style", {}, { theme: {} }, "49:a2d7410d", "49:2ca672f4"],
    ["a wrong depth: nothing is drawn", { dep: "0" }, {}, NOTHING, NOTHING],
    ["a wrong cone: nothing is drawn", { cone0: "0" }, {}, NOTHING, NOTHING],
    ["a wrong down fan: nothing is drawn", { down0: "150" }, {}, NOTHING, NOTHING],
    ["only 2D ticked: one screen", { "eq-ds": false }, {}, "49:e0cac99f", NOTHING],
    ["only down imaging ticked: one screen", { "eq-2d": false }, {}, NOTHING, "49:cc0fb282"],
    ["neither ticked: no screen", { "eq-2d": false, "eq-ds": false }, {}, NOTHING, NOTHING],
    ["the second frequencies", {}, { ui: { f2d: "1", fds: "1" } }, "49:f5b7971f", "49:163ec921"],
    ["a screen time of 0: 20 s", { scrT: "0" }, {}, "49:e0cac99f", "49:cc0fb282"],
    ["a blank screen time: 20 s", { scrT: "" }, {}, "49:e0cac99f", "49:cc0fb282"],
    ["a negative screen time: 20 s", { scrT: "-5" }, {}, "49:e0cac99f", "49:cc0fb282"],
    ["a screen time of 40 s", { scrT: "40" }, {}, "49:6bc34c30", "49:cc0fb282"],
    ["a screen time of 7.5 s", { scrT: "7.5" }, {}, "49:30b095c1", "49:0dcf71e3"],
    ["a screen time of half a second", { scrT: "0.5" }, {}, "49:07c90b7f", "49:d52554d2"],
    [
      "a depth of 3 m: the screen reaches 5 m",
      { dep: "3", zf: "2" },
      {},
      "49:3baff319",
      "49:680eaf0b",
    ],
    [
      "a depth of 4 m: the screen reaches 10 m",
      { dep: "4", zf: "2" },
      {},
      "71:62d36c52",
      "71:e11db995",
    ],
    [
      "a depth of 6 m: the screen reaches 10 m",
      { dep: "6", zf: "4" },
      {},
      "71:7d542543",
      "71:caafb69b",
    ],
    [
      "a depth of 8 m: the screen reaches 10 m",
      { dep: "8", zf: "5" },
      {},
      "71:eec7fa68",
      "71:0be85658",
    ],
    [
      "a depth of 8.1 m: the screen reaches 15 m",
      { dep: "8.1", zf: "5" },
      {},
      "49:e5cbee24",
      "49:2b9cabfa",
    ],
    [
      "a depth of 11.99 m: the screen reaches 15 m",
      { dep: "11.99" },
      {},
      "49:d66ff293",
      "49:d9efbad5",
    ],
    [
      "a depth of 12.01 m: the screen reaches 20 m",
      { dep: "12.01" },
      {},
      "60:f3610f35",
      "60:3613e51a",
    ],
    [
      "a depth of 20 m: the screen reaches 25 m",
      { dep: "20", zf: "12" },
      {},
      "71:26c93c65",
      "71:9df485c4",
    ],
    [
      "a depth of 24 m: the screen reaches 30 m",
      { dep: "24", zf: "12" },
      {},
      "49:480a08ad",
      "49:d7679d13",
    ],
    [
      "a depth of 48 m: the screen reaches 60 m",
      { dep: "48", zf: "30" },
      {},
      "82:7b711c59",
      "82:7ab58057",
    ],
    [
      "a depth of 50 m: the screen reaches 80 m",
      { dep: "50", zf: "30" },
      {},
      "60:8e0cce49",
      "60:c401e8fa",
    ],
    [
      "a depth of 130 m: the screen reaches 200 m",
      { dep: "130", zf: "60" },
      {},
      "104:fe03fb09",
      "104:3c356bca",
    ],
    ["shallow water", { dep: "0.6", zf: "0.4" }, {}, "49:603717b5", "49:a91b1d3b"],
    ["no fish: a wrong fish depth", { zf: "0" }, {}, "43:dcae35b3", "43:4cf408d5"],
    ["no fish: no speed", { sog: "0" }, {}, "43:dcae35b3", "43:4cf408d5"],
    ["no fish: a blank side distance", { y: "" }, {}, "43:dcae35b3", "43:4cf408d5"],
    ["a fish to the side, inside both beams", { y: "2" }, {}, "49:35dcc6d1", "49:f9d66252"],
    ["a fish to the side, on the other side", { y: "-2" }, {}, "49:35dcc6d1", "49:f9d66252"],
    ["a fish outside the cone and inside the fan", { y: "2.83" }, {}, "49:d6768460", "49:aea308c6"],
    ["a fish outside both", { y: "3" }, {}, "49:d6768460", "49:80b04c46"],
    [
      "a fish inside the cone and outside the narrower fan",
      { y: "2" },
      { ui: { fds: "1" } },
      "49:35dcc6d1",
      "49:bd4a4691",
    ],
    ["a fish near the surface", { zf: "0.5" }, {}, "49:1ca88b11", "49:44acb81f"],
    ["a fish just above the bottom", { zf: "9.9" }, {}, "49:d4862838", "49:c0e7f531"],
    ["a fast boat", { sog: "12" }, {}, "49:256fa22d", "49:cc0fb282"],
    ["a slow boat", { sog: "0.3" }, {}, "49:4f1c2c48", "49:477f5c06"],
    ["a speed in km/h", { sogu: "kmh", sog: "7.4" }, {}, "49:6bc34c30", "49:cc0fb282"],
    ["a thick fan", { dst: "20", y: "1" }, {}, "49:abb7a7c1", "49:f6db980a"],
    [
      "a slow boat, a fish to the side under a thick fan",
      { sog: "0.7", dst: "28", y: "2.5" },
      {},
      "49:c778ac51",
      "49:a56e71af",
    ],
    [
      "a slower boat, a fish to the side under a fan of 10°",
      { sog: "0.3", dst: "10", y: "2.5" },
      {},
      "49:7d8d8f1b",
      "49:c8f307f4",
    ],
    ["wide beams", { cone0: "110", down0: "140", y: "4" }, {}, "49:4530cff4", "49:88bf49cb"],
    ["narrow beams", { cone0: "9", down0: "7" }, {}, "49:d3eee998", "49:3ea9457d"],
    [
      "values that are not round",
      { dep: "13.7", zf: "4.3", y: "1.1", sog: "3.7", dst: "2.5", scrT: "17" },
      {},
      "60:4f0183cb",
      "60:c337fdc2",
    ],
    [
      "values that are not round, in sv-SE",
      { dep: "13,7", zf: "4,3", y: "1,1", sog: "3,7", dst: "2,5", scrT: "17" },
      SV,
      "60:9c3a9fbf",
      "60:78219012",
    ],
    ["another brand", {}, OTHER_BRAND, "49:77c46362", "49:b482c50f"],
    // A line of the picture exactly at the limit of the fish's mark: the screen reaches 50 m,
    // the mark is 0.25 m thick to either side of 6 m, and line 42 is at 6.25 m. It is water.
    [
      "a depth of 40 m: the line at the very limit of the fish's mark is not part of it",
      { dep: "40" },
      {},
      "71:d10a7160",
      "71:51197987",
    ],
    [
      "a depth of 17.5 m, a fish at 3 m: the same at a range of 25 m",
      { dep: "17.5", zf: "3" },
      {},
      "71:91656391",
      "71:8e6f29cc",
    ],
    // A line of the picture exactly at the limit of the bottom line: the screen reaches 250 m,
    // the bottom line is 1.5 m thick, and line 172 is at 187.5 m. It is the band below.
    [
      "a depth of 186 m: the line at the very limit of the bottom line is not part of it",
      { dep: "186" },
      {},
      "126:57585ef2",
      "126:0319a327",
    ],
    // The pairs below stand on either side of a limit of the picture, 0.1 mm apart.
    [
      "a fish whose mark just reaches one more line of the down screen",
      { zf: "5.8442" },
      {},
      "49:2f4ce033",
      "49:8c967ec3",
    ],
    ["a fish whose mark just misses that line", { zf: "5.8443" }, {}, "49:1a6a29c1", "49:bf7400c7"],
    [
      "a fish whose arch just reaches one more line of the 2D screen",
      { zf: "5.8892" },
      {},
      "49:7e1ace68",
      "49:f894f5bf",
    ],
    ["a fish whose arch just misses that line", { zf: "5.8893" }, {}, "49:25920abd", "49:0c00da0f"],
    [
      "at 6 m, a mark that just reaches one more line of the down screen",
      { dep: "6", zf: "2.9446" },
      {},
      "71:864e0117",
      "71:56542fb8",
    ],
    [
      "at 6 m, a mark that just misses it",
      { dep: "6", zf: "2.9447" },
      {},
      "71:4038e16b",
      "71:fc6748ab",
    ],
    [
      "at 6 m, an arch that just reaches one more line of the 2D screen",
      { dep: "6", zf: "2.9846" },
      {},
      "71:56fe09c4",
      "71:5f66c013",
    ],
    [
      "at 6 m, an arch that just misses it",
      { dep: "6", zf: "2.9847" },
      {},
      "71:58b9bc76",
      "71:21746c29",
    ],
    [
      "a bottom line that just takes one more line of the screen",
      { dep: "10.1204" },
      {},
      "49:02750e4a",
      "49:ff1d172e",
    ],
    ["a bottom line that just leaves it", { dep: "10.1203" }, {}, "49:ab433818", "49:c49adfdc"],
    [
      "at 20 m, a bottom line that just takes one more line",
      { dep: "19.9222", zf: "12" },
      {},
      "71:8cbbc63f",
      "71:e3d00dae",
    ],
    [
      "at 20 m, a bottom line that just leaves it",
      { dep: "19.9221", zf: "12" },
      {},
      "71:73de59d2",
      "71:eb2ddd75",
    ],
  ];

  it.each(cases)("%s", (...row) => {
    expectScreens(row);
  });

  /** The log of a screen of the page as it starts, at the page's size, for the picture that is put. */
  const pageLog = (picture: string): Entry[] => [
    ["createImageData", 360, 230, { $: "ImageData", w: 360, h: 230, fnv1a: "6894a8c5" }],
    ["putImageData", { $: "ImageData", w: 360, h: 230, fnv1a: picture }, 0, 0],
    ["=font", `11px ${FONT_DATA}`],
    ["=textAlign", "right"],
    ["=strokeStyle", "rgba(255,255,255,0.15)"],
    ["setLineDash", [2, 6]],
    ["beginPath"],
    ["moveTo", 0, 85.33333333333333],
    ["lineTo", 334, 85.33333333333333],
    ["stroke"],
    ["setLineDash", []],
    ["=fillStyle", "rgba(0,0,0,0.6)"],
    ["fillRect", 335, 77.33333333333333, 24, 14],
    ["=fillStyle", "#ffffff"],
    ["fillText", "5", 357, 89.33333333333333],
    ["=strokeStyle", "rgba(255,255,255,0.15)"],
    ["setLineDash", [2, 6]],
    ["beginPath"],
    ["moveTo", 0, 154.66666666666666],
    ["lineTo", 334, 154.66666666666666],
    ["stroke"],
    ["setLineDash", []],
    ["=fillStyle", "rgba(0,0,0,0.6)"],
    ["fillRect", 335, 146.66666666666666, 24, 14],
    ["=fillStyle", "#ffffff"],
    ["fillText", "10", 357, 158.66666666666666],
    ["=fillStyle", "rgba(0,0,0,0.6)"],
    ["fillRect", 324, 0, 36, 14],
    ["=fillStyle", "#ffffff"],
    ["fillText", "now", 356, 11],
    ["=strokeStyle", "rgba(255,255,255,0.35)"],
    ["setLineDash", [3, 4]],
    ["beginPath"],
    ["moveTo", 180, 14],
    ["lineTo", 180, 224],
    ["stroke"],
    ["setLineDash", []],
    ["=textAlign", "left"],
    ["measureText", "fish 6.0 m", { font: `11px ${FONT_DATA}`, width: 66.015625 }],
    ["=fillStyle", "rgba(0,0,0,0.65)"],
    ["fillRect", 186, 76.2, 74.015625, 15],
    ["=fillStyle", "#ffffff"],
    ["fillText", "fish 6.0 m", 190, 87.2],
    ["=textAlign", "left"],
    ["measureText", "bottom 10.0 m", { font: `11px ${FONT_DATA}`, width: 85.8203125 }],
    ["=fillStyle", "rgba(0,0,0,0.65)"],
    ["fillRect", 4, 136.66666666666666, 93.8203125, 15],
    ["=fillStyle", "#ffffff"],
    ["fillText", "bottom 10.0 m", 8, 147.66666666666666],
  ];

  it("draws both screens at the page's size as the earlier lines do, entry for entry", () => {
    const input = inputFor();
    expect(drawn("2d", input, PAGE_SIZE)).toEqual(pageLog("1a3dfb8b"));
    expect(drawn("ds", input, PAGE_SIZE)).toEqual(pageLog("5e2d7241"));
  });

  it("writes the depth marks, the fish and the bottom where the earlier lines write them", () => {
    const texts = (fields: RawFields, setup: Setup = {}): string[] =>
      logTexts(drawn("2d", inputFor(fields, setup)));
    expect(texts({})).toEqual([
      "5@69@89.33333333333333",
      "10@69@158.66666666666666",
      "now@68@11",
      "fish 6.0 m@46@87.2",
      "bottom 10.0 m@8@147.66666666666666",
    ]);
    expect(texts({ y: "3" })).toEqual([
      "5@69@89.33333333333333",
      "10@69@158.66666666666666",
      "now@68@11",
      "fish outside the beam@46@99.2",
      "bottom 10.0 m@8@147.66666666666666",
    ]);
    expect(texts({ dep: "6", zf: "4" })).toEqual([
      "2@69@61.6",
      "4@69@103.2",
      "6@69@144.8",
      "8@69@186.4",
      "now@68@11",
      "fish 4.0 m@46@87.2",
      "bottom 6.0 m@8@133.8",
    ]);
    expect(texts({ dep: "48", zf: "30" })).toEqual([
      "10@69@54.666666666666664",
      "20@69@89.33333333333333",
      "30@69@124",
      "40@69@158.66666666666666",
      "50@69@193.33333333333334",
      "now@68@11",
      "fish 30.0 m@46@108",
      "bottom 48.0 m@8@175.4",
    ]);
    expect(texts({ dep: "50", zf: "30" })).toEqual([
      "25@69@85",
      "50@69@150",
      "75@69@215",
      "now@68@11",
      "fish 30.0 m@46@82",
      "bottom 50.0 m@8@139",
    ]);
  });

  it("writes the texts of the screens as the locale writes them", () => {
    const input = inputFor(
      { dep: "13,7", zf: "4,3", y: "1,1", sog: "3,7", dst: "2,5", scrT: "17" },
      SV,
    );
    for (const kind of ["2d", "ds"] as const) {
      expect(logTexts(drawn(kind, input))).toEqual([
        "5@69@72",
        "10@69@124",
        "15@69@176",
        "now@68@11",
        "fish 4,4 m@46@50.16006932403807",
        "bottom 13,7 m@8@151.48",
      ]);
    }
  });

  it("sets a font without a family when the style names none, as the earlier page does", () => {
    const log = drawn("2d", inputFor({}, { theme: {} }));
    expect(log.filter((entry) => entry[0] === "=font")).toEqual([["=font", "11px "]]);
  });

  it("draws nothing while the section is wrong, and the whole screen once it is right again", () => {
    for (const kind of ["2d", "ds"] as const) {
      const { surface, log } = recordingSurface(STAND_IN[0], STAND_IN[1], standInMeasure);
      PAINTERS[kind](surface, inputFor({ dep: "0" }));
      PAINTERS[kind](surface, inputFor({ cone1: "120" }));
      PAINTERS[kind](surface, inputFor({ dst: "" }));
      expect(log).toEqual([]);
      PAINTERS[kind](surface, inputFor());
      expect(logSum(log)).toBe(kind === "2d" ? "49:e0cac99f" : "49:cc0fb282");
    }
  });
});

// ---------------------------------------------------------------------------
// The second part: the recorded page (fixtures/README.md)
// ---------------------------------------------------------------------------

// The project's TypeScript does not load the Node types (tsconfig `types`), so
// the two things this test needs from Node are described here.
declare const __dirname: string;
interface FileSystem {
  existsSync(path: string): boolean;
  readFileSync(path: string, encoding: "utf8"): string;
}
const { existsSync, readFileSync } = jest.requireActual<FileSystem>("node:fs");

const RECORDED = `${__dirname}/../fixtures/legacy`;

/** The section of the page 2D and DownScan is recorded in. */
const SECTION_FILE = "vs";

/** How the earlier page left one element. */
interface RecordedPatch {
  text?: string;
  html?: string;
  hidden?: boolean;
  attrs?: Record<string, string | null>;
}

/** What one task of the page did to a canvas: its log, or the earlier pass it equals. */
interface RecordedPass {
  by: string;
  log?: Entry[];
  repeats?: number;
}

interface RecordedCanvas {
  width: number;
  height: number;
  passes: RecordedPass[];
}

/** A value that is held in the same section of another scenario and scheme. */
interface Same {
  same: string;
}

/** What a recording started from, as far as this test reads it. */
interface RecordedScenario {
  name: string;
  locale: string;
  fields: Record<string, string | boolean>;
  ui: UiState;
  theme: Record<string, string>;
}

interface RecordedFile {
  scenario: RecordedScenario;
  patches: Record<string, RecordedPatch | Same>;
  canvases?: Record<string, RecordedCanvas | Same>;
}

interface RecordedIndex {
  schemes: string[];
  scenarios: { name: string; locale: string }[];
  omitted: Record<string, string>;
}

const files = new Map<string, unknown>();
function read<T>(path: string): T {
  if (!files.has(path)) files.set(path, JSON.parse(readFileSync(`${RECORDED}/${path}`, "utf8")));
  return files.get(path) as T;
}
const index = read<RecordedIndex>("index.json");

/** A section without a file and without a line in the index: nothing was written and nothing drawn. */
const NO_FILE: Pick<RecordedFile, "patches"> = { patches: {} };

/** The section file of a scenario and scheme (`<scenario>/<scheme>`), or the file the index says it equals. */
function sectionFile(at: string): Pick<RecordedFile, "patches" | "canvases"> {
  let path = `${at}/${SECTION_FILE}.json`;
  for (let equal = index.omitted[path]; equal !== undefined; equal = index.omitted[path])
    path = equal;
  return existsSync(`${RECORDED}/${path}`) ? read<RecordedFile>(path) : NO_FILE;
}

/** A value of a section file, read where a `same` says it is. */
function resolved<T extends object>(
  at: string,
  key: string,
  held: (file: Pick<RecordedFile, "patches" | "canvases">) => T | Same | undefined,
): T | undefined {
  let value = held(sectionFile(at));
  for (let hops = 0; value !== undefined && "same" in value; hops += 1) {
    if (hops > 2) throw new Error(`${at}, ${key}: more than two "same" in a row`);
    value = held(sectionFile(value.same));
  }
  return value;
}

/** The patch of one element. */
const recorded = (at: string, key: string): RecordedPatch | undefined =>
  resolved<RecordedPatch>(at, key, (file) => file.patches[key]);

/** The log of one canvas. */
const recordedCanvas = (at: string, id: string): RecordedCanvas | undefined =>
  resolved<RecordedCanvas>(at, id, (file) => file.canvases?.[id]);

/** What a recording started from, read from a file of its own: one a section equals holds another scenario. */
function scenarioOf(name: string): RecordedScenario {
  const own = ["page", "set"]
    .map((section) => `${name}/light/${section}.json`)
    .find((path) => existsSync(`${RECORDED}/${path}`));
  if (own === undefined) throw new Error(`${name}: no file of its own to read the scenario from`);
  return read<RecordedFile>(own).scenario;
}

/**
 * An html as the browser gives it back: the script writes an empty element as
 * `<line …/>`, and `innerHTML` reads it as `<line …></line>`.
 */
const asRead = (html: string): string =>
  html.replace(/<([a-z]+)((?:\s[^<>]*?)?)\/>/g, "<$1$2></$1>");

/** A text as `innerHTML` gives it back. */
const escaped = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * The element whose rows the browser puts into a table body: the script writes
 * `<tr>` rows straight into the table `fq-table` (line 703), and `innerHTML`
 * reads them back inside a `<tbody>`.
 */
const TABLE = "fq-table";

/**
 * The attributes of a patch of the view as a recording holds them
 * (fixtures/README.md): each under the name the element has it by, in that
 * name's own case, with its value. This is the one place that knows it, so the
 * `viewBox` the view sets on the picture from behind is compared with the
 * recorded one, name and value. The value is also pinned in the first part,
 * against the earlier lines.
 */
const attrsAsRecorded = (attrs: Readonly<Record<string, string>>): Record<string, string> => ({
  ...attrs,
});

/**
 * A patch of the view as the recorder holds it (fixtures/README.md): a content
 * that was written is held as text and as html, whichever way it was written.
 */
function asRecorded(key: string, patch: ElementPatch): RecordedPatch {
  const out: RecordedPatch = {};
  if (patch.text !== undefined) {
    out.text = patch.text;
    out.html = escaped(patch.text);
  }
  if (patch.html !== undefined) {
    out.html = key === TABLE ? `<tbody>${asRead(patch.html)}</tbody>` : asRead(patch.html);
    out.text = out.html.replace(/<[^>]*>/g, "");
  }
  if (patch.hidden !== undefined) out.hidden = patch.hidden;
  if (patch.attrs !== undefined) out.attrs = attrsAsRecorded(patch.attrs);
  return out;
}

/**
 * The elements of `KEYS` that are also marked with a sonar in the page's
 * markup (`data-eq`), with their mark. The earlier page hides each with its
 * sonar (`applyEq`, line 269, which is `hiddenFor` of `settings.ts` and the
 * shell's to apply), so their recorded patch holds a `hidden` that the view of
 * this module does not write.
 */
const MARKED: Readonly<Record<string, string>> = { "cap-2d": "2d", "cap-ds": "ds" };

const SCENARIOS = index.scenarios.map((scenario) => scenario.name);
const PAIRS = SCENARIOS.flatMap((name) =>
  index.schemes.map((scheme): [string, string] => [name, scheme]),
);

/**
 * Whether the earlier page rendered the section: it is open and not hidden,
 * which it is when neither 2D nor down imaging is ticked (line 1808, and the
 * `data-eq` of the section).
 */
const isRendered = (scenario: RecordedScenario): boolean =>
  scenario.ui.open.vs === true &&
  (scenario.fields["eq-2d"] === true || scenario.fields["eq-ds"] === true);

/** The canvas of each screen. */
const CANVASES = { "2d": CANVAS_2D, ds: CANVAS_DS } as const;
const KINDS = ["2d", "ds"] as const;

/**
 * Everything the earlier lines of one screen read once they draw it (lines 648
 * to 692 and 748 to 749), as one text: the depth, the angle of the chosen
 * frequency, for down imaging the fan's thickness, the fish's depth and
 * distance to the side, the speed in metres a second, the screen time, the
 * locale and the font. The size of the canvas and what it measures come from
 * the recording of the canvas.
 *
 * Two tests use it together, because a picture at the page's size is slow to
 * draw here (see `STAND_IN`). The first draws every recorded screen on a low
 * canvas and requires the picture of the first recording with the same text:
 * so the painter reads nothing of its input but what is in this text. The
 * second can then draw the page-size picture once for each text, and compares
 * it with the recorded log of every recording that has that text.
 */
function screenReads(kind: Kind, scenario: RecordedScenario, input: Input): string {
  const a = input.settings;
  const beam =
    kind === "2d"
      ? (a.cone[Number(scenario.ui.f2d)] ?? a.cone[0])
      : (a.down[Number(scenario.ui.fds)] ?? a.down[0]);
  return JSON.stringify([
    kind,
    a.dep,
    beam?.a,
    kind === "ds" ? a.dst : null,
    scenario.fields.zf,
    scenario.fields.y,
    a.ms,
    scenario.fields.scrT,
    scenario.locale,
    scenario.theme["--font-data"],
  ]);
}

/** The size of the canvas on which every recorded screen is drawn once more, in pixels. */
const LOW = [48, 30] as const;

/** The low picture of the first recording with each text of `screenReads`, as `logSum` gives it. */
const lowPictures = new Map<string, string>();

/** The page-size pictures drawn so far, by the text of `screenReads`, the size and the widths measured. */
const pageSize = new Map<string, Entry[]>();

describe("against the recorded page", () => {
  it("reads every scenario, in light and dark, two of them in sv-SE", () => {
    expect(SCENARIOS).toHaveLength(168);
    expect(index.schemes).toEqual(["light", "dark"]);
    expect(
      index.scenarios.filter((scenario) => scenario.locale !== "en-US").map((s) => s.locale),
    ).toEqual(["sv-SE", "sv-SE"]);
  });

  it("has recordings with the section rendered and without, and with each screen drawn and without", () => {
    const rendered = PAIRS.filter(([name]) => isRendered(scenarioOf(name)));
    const with2d = rendered.filter(([name, scheme]) =>
      recordedCanvas(`${name}/${scheme}`, "scr2d"),
    );
    const withDs = rendered.filter(([name, scheme]) =>
      recordedCanvas(`${name}/${scheme}`, "scrds"),
    );
    const wrong = rendered.filter(
      ([name, scheme]) => recorded(`${name}/${scheme}`, "vs-serr")?.hidden === false,
    );
    expect([PAIRS.length, rendered.length, with2d.length, withDs.length, wrong.length]).toEqual([
      336, 206, 170, 170, 26,
    ]);
  });

  it("has recordings of every message of the section, with the first brand's name", () => {
    const seen = new Set<string>();
    for (const [name, scheme] of PAIRS) {
      for (const key of ["vs-serr", "off-err", "arch-err"]) {
        const text = recorded(`${name}/${scheme}`, key)?.text;
        if (text !== undefined) seen.add(`${key}: ${text.replace(/\(\d.*$/, "(…")}`);
      }
    }
    expect([...seen].sort()).toEqual([
      "arch-err: ",
      "arch-err: Enter a fish depth greater than 0 m.",
      "arch-err: Enter a side distance of 0 m or more.",
      "arch-err: Enter a speed in Settings.",
      "arch-err: The fish has to be above the bottom (…",
      "off-err: ",
      "off-err: Enter a side distance of 0 m or more.",
      "off-err: Enter a target depth greater than 0 m.",
      "vs-serr: ",
      "vs-serr: Fix the 2D angles in Settings.",
      "vs-serr: Fix the DownScan angles in Settings.",
      "vs-serr: Fix the depth in Settings.",
    ]);
  });

  it("has recordings of the picture's viewBox, by name and value, for one sonar and for two", () => {
    const seen = new Set<string>();
    for (const [name, scheme] of PAIRS) {
      const attrs = recorded(`${name}/${scheme}`, "cov-svg")?.attrs;
      if (attrs !== undefined) seen.add(JSON.stringify(attrs));
    }
    expect([...seen].sort()).toEqual(['{"viewBox":"0 0 320 196"}', '{"viewBox":"0 0 320 224"}']);
  });

  describe.each(PAIRS)("%s, %s", (name, scheme) => {
    const at = `${name}/${scheme}`;
    const scenario = scenarioOf(name);
    const input = inputOf(scenario.fields, scenario.ui, scenario.locale, scenario.theme);
    const was: Record<string, RecordedPatch> = {};
    const hiddenWas: Record<string, boolean | undefined> = {};
    for (const key of KEYS) {
      const patch = recorded(at, key);
      if (patch === undefined) continue;
      if (key in MARKED) {
        // What `applyEq` wrote is the shell's; the rest of the patch is this module's.
        const { hidden, ...own } = patch;
        hiddenWas[key] = hidden;
        if (Object.keys(own).length > 0) was[key] = own;
      } else was[key] = patch;
    }

    it("hid the two lines over the screens with their sonar, which is not this module's to write", () => {
      expect(scenario.name).toBe(name);
      for (const [key, mark] of Object.entries(MARKED)) {
        if (key in hiddenWas) expect(hiddenWas[key]).toBe(hiddenFor(input.eq, mark));
      }
    });

    if (!isRendered(scenario)) {
      it("did not render the section: no element of KEYS was written and nothing was drawn", () => {
        expect(Object.keys(was)).toEqual([]);
        for (const kind of KINDS) expect(recordedCanvas(at, CANVASES[kind])).toBeUndefined();
      });
      return;
    }

    it("leaves the elements of KEYS as the earlier page left them, and writes no other", () => {
      const view = coverageView(input);
      const left: Record<string, RecordedPatch> = {};
      for (const [key, patch] of Object.entries(view)) left[key] = asRecorded(key, patch);
      expect(Object.keys(left).sort()).toEqual(Object.keys(was).sort());
      expect(left).toEqual(was);
      expect(Object.keys(view).filter((key) => !(KEYS as readonly string[]).includes(key))).toEqual(
        [],
      );
    });

    describe.each(KINDS)("the screen of %s", (kind) => {
      const canvas = recordedCanvas(at, CANVASES[kind]);

      if (canvas === undefined) {
        it("draws nothing, as the earlier page drew nothing", () => {
          expect(drawn(kind, input, PAGE_SIZE)).toEqual([]);
        });
        return;
      }

      const reads = screenReads(kind, scenario, input);

      it("draws, on a low canvas, what it draws for every recording that gives the screen the same to read", () => {
        const own = logSum(drawn(kind, input, LOW));
        const first = lowPictures.get(reads) ?? own;
        lowPictures.set(reads, first);
        expect(own).toBe(first);
      });

      it("draws the screen as the earlier page drew it, entry for entry", () => {
        const logs = canvas.passes.flatMap((pass) => (pass.log === undefined ? [] : [pass.log]));
        expect(logs.length).toBeGreaterThan(0);
        for (const pass of canvas.passes) {
          // A pass without a log is one that equals an earlier pass, which has one.
          if (pass.log === undefined) expect(canvas.passes[pass.repeats ?? -1]?.log).toBeDefined();
        }
        for (const log of logs) {
          // The widths the browser measured, by text, so that no font of this machine is asked.
          const measured = new Map<string, Measured>();
          for (const entry of log) {
            if (entry[0] === "measureText") measured.set(String(entry[1]), entry[2] as Measured);
          }
          const once = JSON.stringify([reads, canvas.width, canvas.height, [...measured]]);
          let painted = pageSize.get(once);
          if (painted === undefined) {
            const made = recordingSurface(
              canvas.width,
              canvas.height,
              (text) =>
                measured.get(text) ?? { font: "not measured by the earlier page", width: 0 },
            );
            PAINTERS[kind](made.surface, input);
            painted = made.log;
            pageSize.set(once, painted);
          }
          expect(painted).toEqual(log);
        }
      });
    });
  });

  it("draws the page-size screens for 19 different sets of what each screen reads", () => {
    for (const kind of KINDS) {
      const sets = new Set<string>();
      for (const [name, scheme] of PAIRS) {
        const scenario = scenarioOf(name);
        if (!isRendered(scenario) || !recordedCanvas(`${name}/${scheme}`, CANVASES[kind])) continue;
        sets.add(
          screenReads(
            kind,
            scenario,
            inputOf(scenario.fields, scenario.ui, scenario.locale, scenario.theme),
          ),
        );
      }
      expect(sets.size).toBe(19);
    }
  });
});
