/**
 * ActiveTarget against the earlier page (legacy/src/p2.js, lines 756 to 972),
 * in two ways. The expected values of the first part were printed by those
 * lines themselves, run unchanged in Node against a stand-in for the page's
 * elements and for its eight canvases, in en-US and in sv-SE. The second part
 * compares what the views write and what the painters draw with what the
 * earlier page wrote and drew when it was recorded in a browser
 * (`fixtures/legacy/`), in every scenario of the set.
 *
 * Two things stand between the earlier lines and this test, and both parts
 * state them where they matter. The earlier `drawBeam` reads the pixels of its
 * canvas back after it has filled it with the background colour (line 868);
 * the port makes that buffer itself (docs/SPEC.md 3.3), so its log holds a
 * `createImageData` where the earlier log holds a `getImageData`. And whether
 * a pixel on the 135 degree line of the wide beam is inside depends on the last
 * bit of `Math.atan2`, which the recording browser and Node round differently
 * (`browserAtan2`).
 */
import {
  activeTargetView,
  BEAM_CANVAS,
  BEAM_DELAY_MS,
  BEAM_MODES,
  beamMember,
  beamModes,
  beamView,
  CANVAS_DOWN,
  CANVAS_FLAT,
  CANVAS_FORWARD,
  CANVAS_WIDE,
  KEYS,
  paintBeam,
  paintDown,
  paintFlat,
  paintForward,
  paintWide,
} from "./activetarget";
import { createFormatter } from "./format";
import { equipment, hiddenFor, num, parseSettings } from "./settings";
import { combined, livePreset, namesOf, THICKNESS } from "./transducers";
import type {
  BeamMode,
  Ctx2D,
  ElementPatch,
  RawFields,
  SavedValue,
  SectionView,
  Surface,
} from "./types";

// ---------------------------------------------------------------------------
// Math.atan2 next to the 135 degree line
// ---------------------------------------------------------------------------

/** Pi, as its first 76 digits without the point. */
const PI_DIGITS = "3141592653589793238462643383279502884197169399375105820974944592307816406286";

/** The binary places the whole numbers below keep. */
const PLACES = 240n;

/** Pi times 2^PLACES, as a whole number. */
const PI_SCALED = (BigInt(PI_DIGITS) << PLACES) / 10n ** BigInt(PI_DIGITS.length - 1);

/** The size of a finite number times 2^PLACES, as a whole number. */
function scaled(v: number): bigint {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, Math.abs(v));
  const bits = view.getBigUint64(0);
  const exponent = Number((bits >> 52n) & 0x7ffn);
  const fraction = bits & 0xfffffffffffffn;
  const mantissa = exponent === 0 ? fraction : fraction | (1n << 52n);
  const shift = BigInt(exponent === 0 ? -1074 : exponent - 1075) + PLACES;
  return shift >= 0n ? mantissa << shift : mantissa >> -shift;
}

/** `Math.atan2` as the engine that runs this test has it. */
const engineAtan2 = Math.atan2;

/**
 * `Math.atan2` as the recording browser rounds it next to the 135 degree line:
 * to the nearest number. The earlier `beamMember` (line 855) asks whether a
 * bearing is over the edge of the wide beam, which is 135 degrees for the fan
 * of the page as it starts, and the pixels of the picture from above lie on
 * that very line. Their bearing differs from the edge by less than the last
 * bit, so the rounding of `atan2` decides whether a pixel is drawn. Node's
 * `atan2` and the recording browser's (Chromium 153) differ there: of the 236
 * such bearings of the page-size picture, Node 22 gives another last bit for
 * six. With this function in place of `Math.atan2` the earlier lines, run in
 * Node, draw what the browser recorded in all 336 recordings. Any other
 * bearing is the engine's own.
 */
function browserAtan2(y: number, x: number): number {
  // Whether the point lies next to the 135 degree line, told without a look-up: a painter asks millions of times.
  if (!(x < 0 && x > -1e300) || y === 0) return engineAtan2(y, x);
  const off = -x - (y < 0 ? -y : y);
  const next = 1e-9 * -x;
  if (!(off <= next && off >= -next)) return engineAtan2(y, x);
  const a = scaled(x);
  const b = scaled(y);
  // atan2(|y|, -a) is 3 pi / 4 + atan(t) with t = (a - |y|) / (a + |y|), and atan(t) is t for a t this small.
  const value = (3n * PI_SCALED) / 4n + ((a - b) << PLACES) / (a + b);
  // The numbers from 2 to 4 are 2^-51 apart.
  const step = PLACES - 51n;
  const result = Number((value + (1n << (step - 1n))) >> step) * 2 ** -51;
  return y < 0 ? -result : result;
}

// In place from the first line of this file that draws to the last.
Math.atan2 = browserAtan2;
afterAll(() => {
  Math.atan2 = engineAtan2;
});

// ---------------------------------------------------------------------------
// What a test gives the module and how it reads what comes back
// ---------------------------------------------------------------------------

/** `Math.imul`, looked up once: a digest of a picture's pixels calls it for every byte. */
const imul = Math.imul;

/** FNV-1a, 32 bit, over bytes, as eight hex digits (the digest of fixtures/README.md). */
function fnv1aOf(bytes: Uint8Array | Uint8ClampedArray): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) h = imul(h ^ (bytes[i] ?? 0), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, "0");
}

/** The digest of a text: of its UTF-8 bytes. */
const fnv1a = (text: string): string => fnv1aOf(new TextEncoder().encode(text));

/** The two fonts of the page, as the page's style gives them. */
const FONT_DATA = "'JetBrains Mono', ui-monospace, 'SFMono-Regular', Menlo, monospace";
const FONT_BODY = "'Barlow', system-ui, -apple-system, 'Segoe UI', sans-serif";

/** The custom properties the section resolves, as the page has them in light and in dark. */
const LIGHT: Readonly<Record<string, string>> = {
  "--surface": "#ffffff",
  "--muted": "#56645f",
  "--water": "#2f6f86",
  "--fg": "#14201e",
  "--accent": "#9a5a00",
  "--c2d": "#2a78d6",
  "--font-body": FONT_BODY,
  "--font-data": FONT_DATA,
};
const DARK: Readonly<Record<string, string>> = {
  "--surface": "#162120",
  "--muted": "#9aa9a5",
  "--water": "#74b6cf",
  "--fg": "#e4ebe9",
  "--accent": "#e6a640",
  "--c2d": "#3987e5",
  "--font-body": FONT_BODY,
  "--font-data": FONT_DATA,
};

/**
 * The fields of the page as it starts, with some changed: each angle field
 * holds its preset's angle (legacy lines 209 to 220).
 */
function fieldsOf(over: RawFields = {}): RawFields {
  const p = combined("lowrance", "");
  const l = livePreset("at2");
  const fields: Record<string, SavedValue> = {
    "img-p": "lowrance",
    "img-s": "",
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
    fx: "15",
    fz: "5",
    fy: "1.5",
    sr: "20",
  };
  for (const [i, c] of p.cone.entries()) fields[`cone${i}`] = String(c.a);
  for (const [i, c] of p.down.entries()) fields[`down${i}`] = String(c.a);
  for (const [i, c] of p.side.entries()) fields[`side${i}`] = String(c.a);
  return { ...fields, ...over };
}

/** The number fields of the section's own, which the shell reads as `num()` does. */
const LOCAL_NUMBERS = ["fx", "fz", "fy", "sr"] as const;

/** What the views and the painters get for a page with the given fields. */
function inputOf(fields: RawFields, locale: string, theme: Readonly<Record<string, string>>) {
  const first = String(fields["img-p"]);
  const live = String(fields["live-p"]);
  const local: Record<string, number | string> = {};
  for (const id of LOCAL_NUMBERS) {
    const text = fields[id];
    local[id] = num(typeof text === "string" ? text : undefined);
  }
  return {
    settings: parseSettings(fields, combined(first, String(fields["img-s"]))),
    eq: equipment(fields, livePreset(live)),
    names: namesOf(first, live),
    local,
    theme: { colours: theme },
    fmt: createFormatter(locale),
  };
}

type Input = ReturnType<typeof inputOf>;

/** The size of a canvas, in pixels: its width and its height. */
type Size = readonly [number, number];

/** How a row differs from the page as it starts, besides its fields. */
interface Setup {
  /** The locale; en-US unless given. */
  locale?: string;
  /** The size of each screen's canvas, by canvas; `STAND_IN` unless given. */
  sizes?: Readonly<Record<string, Size>>;
  /** The width of each beam's canvas; `BEAM_STAND_IN` unless given. */
  width?: number;
  /** The custom properties of the page's style; `LIGHT` unless given. */
  theme?: Readonly<Record<string, string>>;
}

/** The input of a row: the fields changed, and its setup. */
const inputFor = (over: RawFields = {}, setup: Setup = {}): Input =>
  inputOf(fieldsOf(over), setup.locale ?? "en-US", setup.theme ?? LIGHT);

/** The view of the page as it starts, with some fields changed, and a setup. */
const viewOf = (over: RawFields = {}, setup: Setup = {}): SectionView =>
  activeTargetView(inputFor(over, setup));

/** The texts a picture shows, in the order they stand in its html. */
const textsOf = (html: string): string[] =>
  [...html.matchAll(/>([^<]*)<\/text>/g)].map(([, text]) => String(text));

/** From this length an html is told as its digest and length, with the texts it shows. */
const LONG = 160;

/**
 * What was written to one element, as one line: `t:` its text, `h:` its html
 * (a long one as its digest and length, and after `x:` the texts it shows), and
 * whether it is hidden.
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
  return parts.join(" ");
}

/** What stands for an element a view does not write. */
const NOT = "(not written)";

/** What a view writes to each of some elements, as `told` tells it. */
const toldOf = (view: SectionView, keys: readonly string[]): string[] =>
  keys.map((key) => {
    const patch = view[key];
    return patch ? told(patch) : NOT;
  });

/** The rows of a table, each as its cells with `|` between. */
const tableOf = (html: string): string[] =>
  [...html.matchAll(/<tr>(.*?)<\/tr>/g)].map(([, row]) =>
    [...String(row).matchAll(/<t[dh][^>]*>([^<]*)<\/t[dh]>/g)]
      .map(([, cell]) => String(cell))
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

/** The pixels a painter asks for and puts back. */
interface Image {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

function isImage(v: unknown): v is Image {
  return typeof v === "object" && v !== null && "data" in v && v.data instanceof Uint8ClampedArray;
}

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

/** What a canvas answers when a text is measured: the font it measured in, and the width. */
interface Measured {
  font: string;
  width: number;
}

/**
 * A canvas that keeps a log of what is done to its context and of each change
 * of its height, as the recorder of the fixtures does, and answers
 * `measureText` with what `measure` gives for the text and the font set at that
 * moment.
 */
function recordingSurface(
  width: number,
  height: number,
  measure: (text: string, font: string) => Measured,
): { surface: Surface; log: Entry[] } {
  const log: Entry[] = [];
  let high = height;
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
    get height() {
      return high;
    },
    ctx,
    resize(to: number) {
      log.push(["#height", encode(to)]);
      high = to;
      return ctx;
    },
  };
  return { surface, log };
}

/** The four simulated screens, by canvas, with their painter. */
const SCREENS = [CANVAS_FORWARD, CANVAS_DOWN, CANVAS_FLAT, CANVAS_WIDE] as const;
type Screen = (typeof SCREENS)[number];
const SCREEN_PAINTERS: Readonly<Record<Screen, (surface: Surface, input: Input) => void>> = {
  [CANVAS_FORWARD]: paintForward,
  [CANVAS_DOWN]: paintDown,
  [CANVAS_FLAT]: paintFlat,
  [CANVAS_WIDE]: paintWide,
};

/** The size of each screen's canvas in the page's markup. */
const PAGE: Readonly<Record<Screen, Size>> = {
  scrF: [360, 260],
  scrD: [360, 230],
  scrS: [360, 260],
  scrW: [360, 300],
};

/**
 * The size of the stand-in canvases of the screens: a third of the page's. The
 * earlier lines were run on stand-ins of this size too. A pixel costs some ten
 * calls of `Math`, which are slow where Jest runs a test, so only a few
 * pictures of the first part and the pictures that are compared with the
 * browser's are drawn at the page's size.
 */
const STAND_IN: Readonly<Record<Screen, Size>> = {
  scrF: [120, 90],
  scrD: [120, 80],
  scrS: [120, 90],
  scrW: [120, 100],
};

/** The width of a beam's canvas in the page's markup, the height all four start with, and the stand-in's width. */
const BEAM_PAGE = 240;
const BEAM_START_HEIGHT = 220;
const BEAM_STAND_IN = 60;

/** The width the stand-in canvas gives each character of a text it measures. */
const CHAR_WIDTH = 6.6015625;

/** How the stand-in canvas measures a text. */
const standInMeasure = (text: string, font: string): Measured => ({
  font,
  width: text.length * CHAR_WIDTH,
});

/** What the painter of one screen draws for an input, on a canvas of the given size. */
function drawn(id: Screen, input: Input, size: Size = STAND_IN[id]): Entry[] {
  const { surface, log } = recordingSurface(size[0], size[1], standInMeasure);
  SCREEN_PAINTERS[id](surface, input);
  return log;
}

/** What the painter of one beam draws for an input, on a canvas of the given width. */
function beamDrawn(
  mode: BeamMode,
  input: Input,
  width: number = BEAM_STAND_IN,
  height: number = BEAM_START_HEIGHT,
): Entry[] {
  const { surface, log } = recordingSurface(width, height, standInMeasure);
  paintBeam(mode, surface, input);
  return log;
}

/** The line under one beam for an input and the width of its canvas, or `NOT`. */
const beamText = (mode: BeamMode, input: Input, width: number = BEAM_STAND_IN): string =>
  beamView(mode, width, input)[`bv${mode}-t`]?.text ?? NOT;

/** A log as its number of entries and its digest. */
const logSum = (log: Entry[]): string => `${log.length}:${fnv1a(JSON.stringify(log))}`;

/** The texts a log writes, each with where it stands. */
const logTexts = (log: Entry[]): string[] =>
  log.filter((entry) => entry[0] === "fillText").map((entry) => entry.slice(1).join("@"));

/** The log of a canvas on which nothing is drawn. */
const NOTHING = "0:741638a5";

/** The pixels of a canvas that is `w` by `h`, all of one colour and opaque, or all empty, as their digest. */
const filledDigests = new Map<string, string>();
function filledDigest(w: number, h: number, hex: string | null): string {
  const key = `${w} ${h} ${hex}`;
  let digest = filledDigests.get(key);
  if (digest === undefined) {
    const data = new Uint8ClampedArray(w * h * 4);
    if (hex !== null) {
      const rgb = [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));
      for (let o = 0; o < data.length; o += 4)
        data.set([rgb[0] ?? 0, rgb[1] ?? 0, rgb[2] ?? 0, 255], o);
    }
    digest = fnv1aOf(data);
    filledDigests.set(key, digest);
  }
  return digest;
}

// ---------------------------------------------------------------------------
// The first part: against the earlier lines run in Node
// ---------------------------------------------------------------------------

/** A message element without a message, and an element that shows a dash. */
const NO_ERR = "t: [hidden]";
const DASH = "t:—";

/** The setup of the locale with decimal commas. */
const SV: Setup = { locale: "sv-SE" };

/** The live sonar unticked. */
const UNTICKED: RawFields = { "eq-at": false };

/**
 * Numbers that are round nowhere, so that another order of the same arithmetic
 * gives another last digit; and a depth so small that the bottom's depth less
 * the transducer's is not the depth. The rows with them were added after the
 * module was written, for variants of it that the other rows could not tell.
 */
const ODD: RawFields = {
  dep: "7.3",
  atr: "23.7",
  zt: "0.37",
  atw: "111",
  att: "13.3",
  atsb: "23.9",
  atfa: "37.1",
  fx: "9.7",
  fz: "4.5",
  fy: "1.9",
  sr: "11.3",
};
const TINY: RawFields = { dep: "0.1", zt: "0.3", atr: "1" };

/** The elements of the fish in Forward and Down, and of the flat mode. */
const FISH = ["pos-err", "f-in", "f-x", "f-z", "dn-in", "dn-y", "dn-z"];
const FLAT = ["sc-err", "sc-z", "sc-x", "sc-b1", "sc-b2", "sc-f", "sc-fw"];

describe("the bearing next to 135 degrees, as the recording browser rounds it", () => {
  it("gives the browser's number where Node 22 gives another, and the same elsewhere", () => {
    // The first two of each row are a pixel of the wide beam's picture; the third is what Chromium 153 answers.
    const cases: [number, number, number][] = [
      [-13.577586206896548, -13.577586206896552, -2.3561944901923453],
      [-12.801724137931032, -12.801724137931036, -2.3561944901923453],
      [-5.043103448275865, -5.043103448275861, -2.3561944901923444],
      [29.870689655172413, -29.870689655172413, 2.356194490192345],
      [-30.905172413793103, -30.905172413793103, -2.356194490192345],
    ];
    for (const [y, x, browser] of cases) expect(browserAtan2(y, x)).toBe(browser);
    for (const [y, x] of [
      [1, 1],
      [1, -2],
      [0, -1],
      [-3, 0],
      [5, -5.001],
    ] as const) {
      expect(browserAtan2(y, x)).toBe(engineAtan2(y, x));
    }
  });
});

describe("what the module names", () => {
  it("lists the elements the views write", () => {
    expect(KEYS).toEqual([
      "at-serr",
      "slice-table",
      "slice-svg",
      "pos-err",
      "edge-err",
      "f-in",
      "f-x",
      "f-z",
      "dn-in",
      "dn-y",
      "dn-z",
      "sc-err",
      "sc-b1",
      "sc-b2",
      "sc-z",
      "sc-x",
      "sc-f",
      "sc-fw",
      "bvF-t",
      "bvD-t",
      "bvS-t",
      "bvW-t",
    ]);
    expect(new Set(KEYS).size).toBe(KEYS.length);
  });

  it("names the canvases the painters draw on", () => {
    expect([CANVAS_FORWARD, CANVAS_DOWN, CANVAS_FLAT, CANVAS_WIDE]).toEqual([
      "scrF",
      "scrD",
      "scrS",
      "scrW",
    ]);
    expect(BEAM_MODES).toEqual(["F", "D", "S", "W"]);
    expect(BEAM_CANVAS).toEqual({ F: "bvF", D: "bvD", S: "bvS", W: "bvW" });
  });

  it("has the beams the earlier page draws, the wide one with two transducers only, and their delay (line 915)", () => {
    expect(beamModes(inputFor().eq)).toEqual(["F", "D", "S", "W"]);
    expect(beamModes(inputFor({ "at-n": "1" }).eq)).toEqual(["F", "D", "S"]);
    expect(beamModes(inputFor({ "live-p": "lvs34" }).eq)).toEqual(["F", "D", "S"]);
    expect(BEAM_DELAY_MS).toBe(120);
  });
});

describe("the page as it starts", () => {
  it("writes the 18 elements of the section itself", () => {
    const view = viewOf();
    expect(Object.keys(view).sort()).toEqual(
      [...KEYS].filter((key) => !key.startsWith("bv")).sort(),
    );
    expect(toldOf(view, ["at-serr"])).toEqual([NO_ERR]);
    expect(digestOf(view)).toBe("a03f4288");
  });

  it("writes the same in sv-SE with decimal commas", () => {
    const view = viewOf({}, SV);
    expect(Object.keys(view)).toHaveLength(18);
    expect(digestOf(view)).toBe("787d6842");
  });

  it("writes the table of the slice, tag for tag (lines 758 to 761)", () => {
    expect(viewOf()["slice-table"]).toEqual({
      html: '<tr><th>Distance</th><th>5 m</th><th>10 m</th><th>20 m</th><th>30 m</th><th>45 m</th></tr><tr><td>Slice thickness</td><td class="n">1.6 m</td><td class="n">3.2 m</td><td class="n">6.3 m</td><td class="n">9.5 m</td><td class="n">14.3 m</td></tr>',
    });
  });

  it("writes the picture of the slice, tag for tag (lines 762 to 774)", () => {
    expect(viewOf()["slice-svg"]).toEqual({
      html: '<polygon points="20,70 320,22.484667902639117 320,117.51533209736088" fill="var(--c2d)" fill-opacity="0.16" stroke="var(--c2d)" stroke-width="1.5"/><line x1="20" x2="320" y1="70" y2="70" stroke="var(--muted)" stroke-width="0.8" stroke-dasharray="3 3"/><line x1="86.66666666666667" x2="86.66666666666667" y1="59.441037311697585" y2="80.55896268830242" stroke="var(--fg)" stroke-width="1.2"/><text x="86.66666666666667" y="142" text-anchor="middle" font-family="var(--font-data)" font-size="11" fill="var(--fg)">3.2 m</text><text x="86.66666666666667" y="158" text-anchor="middle" font-family="var(--font-data)" font-size="11" fill="var(--muted)">at 10 m</text><line x1="153.33333333333334" x2="153.33333333333334" y1="48.88207462339516" y2="91.11792537660483" stroke="var(--fg)" stroke-width="1.2"/><text x="153.33333333333334" y="142" text-anchor="middle" font-family="var(--font-data)" font-size="11" fill="var(--fg)">6.3 m</text><text x="153.33333333333334" y="158" text-anchor="middle" font-family="var(--font-data)" font-size="11" fill="var(--muted)">at 20 m</text><line x1="220" x2="220" y1="38.32311193509274" y2="101.67688806490726" stroke="var(--fg)" stroke-width="1.2"/><text x="220" y="142" text-anchor="middle" font-family="var(--font-data)" font-size="11" fill="var(--fg)">9.5 m</text><text x="220" y="158" text-anchor="middle" font-family="var(--font-data)" font-size="11" fill="var(--muted)">at 30 m</text><circle cx="20" cy="70" r="4" fill="var(--fg)"/><text x="320" y="14" text-anchor="end" font-size="11" fill="var(--muted)">to scale</text>',
    });
  });
});

describe("the message of the section (renderAT, lines 918 to 920)", () => {
  const DEPTH = "t:Fix the depth in Settings. [shown]";
  const RANGE = "t:Fix the live sonar range in Settings. [shown]";
  const TRANSDUCER = "t:Fix the transducer depth in Settings. [shown]";
  const ANGLES = "t:Fix the ActiveTarget 2 angles in Settings. [shown]";
  const MOUNT = "t:Fix the ActiveTarget 2 mount angles in Settings. [shown]";

  /** What is tested, the fields changed, the message, how many elements are written, and the digest of all of them. */
  type Row = [what: string, fields: RawFields, message: string, written: number, digest: string];
  const cases: Row[] = [
    ["no depth", { dep: "" }, DEPTH, 1, "95434314"],
    ["a depth of 0", { dep: "0" }, DEPTH, 1, "95434314"],
    ["depth and range wrong: the depth is named", { dep: "-1", atr: "0" }, DEPTH, 1, "95434314"],
    ["a range of 0", { atr: "0" }, RANGE, 1, "ba5028eb"],
    ["no range", { atr: "" }, RANGE, 1, "ba5028eb"],
    [
      "range and transducer depth wrong: the range is named",
      { atr: "abc", zt: "-1" },
      RANGE,
      1,
      "ba5028eb",
    ],
    ["a transducer above the surface", { zt: "-0.1" }, TRANSDUCER, 1, "1c2a69df"],
    [
      "transducer depth and angles wrong: the transducer depth is named",
      { zt: "", atw: "0" },
      TRANSDUCER,
      1,
      "1c2a69df",
    ],
    ["a fan width of 0", { atw: "0" }, ANGLES, 1, "959931e2"],
    ["a fan width of 181", { atw: "181" }, ANGLES, 1, "959931e2"],
    ["a thickness of 0", { att: "0" }, ANGLES, 1, "959931e2"],
    ["a thickness of 90", { att: "90" }, ANGLES, 1, "959931e2"],
    [
      "angles and mount angles wrong: the angles are named",
      { att: "90", atsb: "90" },
      ANGLES,
      1,
      "959931e2",
    ],
    ["a flat mount angle of -1", { atsb: "-1" }, MOUNT, 1, "a0e2388d"],
    ["a flat mount angle of 90", { atsb: "90" }, MOUNT, 1, "a0e2388d"],
    ["a forward mount angle of -1", { atfa: "-1" }, MOUNT, 1, "a0e2388d"],
    ["a forward mount angle of 91", { atfa: "91" }, MOUNT, 1, "a0e2388d"],
    [
      "another brand's angles",
      { "live-p": "lvs34", atw: "0" },
      "t:Fix the LiveScope Plus angles in Settings. [shown]",
      1,
      "e7159dcb",
    ],
    [
      "another brand's mount angles",
      { "live-p": "ml2", atfa: "91" },
      "t:Fix the MEGA Live 2 mount angles in Settings. [shown]",
      1,
      "45c0a006",
    ],
    [
      "a live sonar without a brand",
      { "live-p": "other", att: "" },
      "t:Fix the Live sonar angles in Settings. [shown]",
      1,
      "137a22ca",
    ],
    [
      "the depth wrong and the live sonar not ticked",
      { ...UNTICKED, dep: "0" },
      DEPTH,
      1,
      "95434314",
    ],
    ["a transducer at the surface: the valid edge", { zt: "0" }, NO_ERR, 18, "cb522e29"],
    ["a fan width of 180: the valid edge", { atw: "180" }, NO_ERR, 18, "a03f4288"],
    ["a thickness of 89.9", { att: "89.9" }, NO_ERR, 18, "a565999a"],
    ["a flat mount angle of 0: the valid edge", { atsb: "0" }, NO_ERR, 18, "94b3774f"],
    ["a flat mount angle of 89.9", { atsb: "89.9" }, NO_ERR, 18, "5eb85c7c"],
    ["a forward mount angle of 0: the valid edge", { atfa: "0" }, NO_ERR, 18, "a03f4288"],
    ["a forward mount angle of 90: the valid edge", { atfa: "90" }, NO_ERR, 18, "a03f4288"],
    ["a range of 0.5", { atr: "0.5" }, NO_ERR, 18, "a03f4288"],
    ["a depth typed as 1e1", { dep: "1e1" }, NO_ERR, 18, "a03f4288"],
    ["no speed, which the section does not read", { sog: "" }, NO_ERR, 18, "a03f4288"],
    [
      "everything of the live sonar wrong while it is not ticked",
      { ...UNTICKED, atr: "0", zt: "-1", atw: "0", att: "90", atsb: "90", atfa: "91" },
      NO_ERR,
      18,
      "1a29d1af",
    ],
  ];

  it.each(cases)("%s", (_what, fields, message, written, digest) => {
    const view = viewOf(fields);
    expect(toldOf(view, ["at-serr"])).toEqual([message]);
    expect(Object.keys(view)).toHaveLength(written);
    expect(digestOf(view)).toBe(digest);
  });

  it("writes nothing but the message while a setting is wrong", () => {
    expect(viewOf({ atr: "0" })).toEqual({
      "at-serr": { text: "Fix the live sonar range in Settings.", hidden: false },
    });
  });
});

describe("the slice (sliceTable, lines 757 to 775, and the edge's error, line 927)", () => {
  const HEAD = "Distance|5 m|10 m|20 m|30 m|45 m";

  /** What is tested, the fields changed, the setup, the table's rows, the picture, the edge's error, and the digest of the view. */
  type Row = [
    what: string,
    fields: RawFields,
    setup: Setup,
    table: string[],
    picture: string,
    edge: string,
    digest: string,
  ];
  const cases: Row[] = [
    [
      "the page as it starts",
      {},
      {},
      [HEAD, "Slice thickness|1.6 m|3.2 m|6.3 m|9.5 m|14.3 m"],
      "h:b54cdf94:1557 x:3.2 m|at 10 m|6.3 m|at 20 m|9.5 m|at 30 m|to scale",
      "t:drawn 1.2% too far out",
      "a03f4288",
    ],
    [
      "the page as it starts, in sv-SE",
      {},
      SV,
      [HEAD, "Slice thickness|1,6 m|3,2 m|6,3 m|9,5 m|14,3 m"],
      "h:8c0b20e6:1557 x:3,2 m|at 10 m|6,3 m|at 20 m|9,5 m|at 30 m|to scale",
      "t:drawn 1,2% too far out",
      "787d6842",
    ],
    [
      "a slice of 22 degrees: the widest drawn to scale",
      { att: "22" },
      {},
      [HEAD, "Slice thickness|1.9 m|3.9 m|7.8 m|11.7 m|17.5 m"],
      "h:7d045ec7:1552 x:3.9 m|at 10 m|7.8 m|at 20 m|11.7 m|at 30 m|to scale",
      "t:drawn 1.9% too far out",
      "e4d97943",
    ],
    [
      "a slice of 23 degrees: the narrowest drawn exaggerated",
      { att: "23" },
      {},
      [HEAD, "Slice thickness|2.0 m|4.1 m|8.1 m|12.2 m|18.3 m"],
      "h:ab15be63:1529 x:4.1 m|at 10 m|8.1 m|at 20 m|12.2 m|at 30 m|width exaggerated to fit",
      "t:drawn 2.0% too far out",
      "41d45644",
    ],
    [
      "a slice of 89.9 degrees",
      { att: "89.9" },
      {},
      [HEAD, "Slice thickness|10.0 m|20.0 m|39.9 m|59.9 m|89.8 m"],
      "h:b0827a99:1515 x:20.0 m|at 10 m|39.9 m|at 20 m|59.9 m|at 30 m|width exaggerated to fit",
      "t:drawn 41.3% too far out",
      "a565999a",
    ],
    [
      "a slice of 0.1 degrees",
      { att: "0.1" },
      {},
      [HEAD, "Slice thickness|0.01 m|0.02 m|0.03 m|0.05 m|0.08 m"],
      "h:a3ec5d0c:1556 x:0.02 m|at 10 m|0.03 m|at 20 m|0.05 m|at 30 m|to scale",
      "t:drawn 0.0% too far out",
      "4d80770b",
    ],
    [
      "a slice of 1 degree",
      { att: "1" },
      {},
      [HEAD, "Slice thickness|0.09 m|0.17 m|0.35 m|0.52 m|0.79 m"],
      "h:a98f0441:1556 x:0.17 m|at 10 m|0.35 m|at 20 m|0.52 m|at 30 m|to scale",
      "t:drawn 0.0% too far out",
      "05e5a480",
    ],
    [
      "a slice of 45 degrees",
      { att: "45" },
      {},
      [HEAD, "Slice thickness|4.1 m|8.3 m|16.6 m|24.9 m|37.3 m"],
      "h:103f3f66:1514 x:8.3 m|at 10 m|16.6 m|at 20 m|24.9 m|at 30 m|width exaggerated to fit",
      "t:drawn 8.2% too far out",
      "0968e405",
    ],
    [
      "a slice of 45 degrees, in sv-SE",
      { att: "45" },
      SV,
      [HEAD, "Slice thickness|4,1 m|8,3 m|16,6 m|24,9 m|37,3 m"],
      "h:1444d058:1514 x:8,3 m|at 10 m|16,6 m|at 20 m|24,9 m|at 30 m|width exaggerated to fit",
      "t:drawn 8,2% too far out",
      "d9c6f931",
    ],
    [
      "a slice of 13.3 degrees",
      { att: "13.3" },
      {},
      [HEAD, "Slice thickness|1.2 m|2.3 m|4.7 m|7.0 m|10.5 m"],
      "h:d9128926:1554 x:2.3 m|at 10 m|4.7 m|at 20 m|7.0 m|at 30 m|to scale",
      "t:drawn 0.7% too far out",
      "e51af12e",
    ],
  ];

  it.each(cases)("%s", (_what, fields, setup, table, picture, edge, digest) => {
    const view = viewOf(fields, setup);
    expect(tableOf(view["slice-table"]?.html ?? "")).toEqual(table);
    expect(toldOf(view, ["slice-svg", "edge-err"])).toEqual([picture, edge]);
    expect(digestOf(view)).toBe(digest);
  });
});

describe("the fish in Forward and Down (renderAT, lines 923 to 942)", () => {
  const AHEAD = "t:Enter a distance ahead of 0 m or more. [shown]";
  const DEPTH =
    "t:The fish must be below the transducer (0.50 m) and above the bottom (10.5 m below the surface). [shown]";
  const SIDE = "t:Enter a side distance of 0 m or more. [shown]";

  /** The seven elements while the fish is wrong: its message, and a dash in the six results. */
  const wrong = (message: string): string[] => [message, DASH, DASH, DASH, DASH, DASH, DASH];

  /** The seven elements of the page as it starts. */
  const START = [
    NO_ERR,
    "t:yes, 5.5° off center",
    "t:15.1 m (really 15.0 m)",
    "t:5.0 m (really 5.0 m)",
    "t:no, 72.5° off center (edge 9.0°)",
    DASH,
    DASH,
  ];

  /** What is tested, the fields changed, the setup, the seven elements of `FISH`, and the digest of the view. */
  type Row = [what: string, fields: RawFields, setup: Setup, written: string[], digest: string];
  const cases: Row[] = [
    ["the page as it starts", {}, {}, START, "a03f4288"],
    ["a fish 1 m behind", { fx: "-1" }, {}, wrong(AHEAD), "48f15e69"],
    ["no distance ahead", { fx: "" }, {}, wrong(AHEAD), "48f15e69"],
    ["a distance ahead that is no number", { fx: "abc" }, {}, wrong(AHEAD), "48f15e69"],
    [
      "a fish straight below: the valid edge",
      { fx: "0" },
      {},
      [
        NO_ERR,
        "t:no, 18.4° off center (edge 9.0°)",
        DASH,
        DASH,
        "t:yes, 0.0° off center",
        "t:1.5 m (really 1.5 m)",
        "t:5.0 m (really 5.0 m)",
      ],
      "4faa2eab",
    ],
    [
      "distance ahead and depth wrong: the distance is named",
      { fx: "-1", fz: "0.5" },
      {},
      wrong(AHEAD),
      "48f15e69",
    ],
    ["a fish at the transducer's depth", { fz: "0.5" }, {}, wrong(DEPTH), "f6790e88"],
    [
      "a fish just below the transducer",
      { fz: "0.51" },
      {},
      [
        NO_ERR,
        "t:yes, 5.7° off center",
        "t:15.1 m (really 15.0 m)",
        "t:0.51 m (really 0.51 m)",
        "t:no, 84.3° off center (edge 9.0°)",
        DASH,
        DASH,
      ],
      "fd1185cc",
    ],
    ["a fish at the bottom", { fz: "10.5" }, {}, wrong(DEPTH), "f6790e88"],
    [
      "a fish just above the bottom",
      { fz: "10.4" },
      {},
      [
        NO_ERR,
        "t:yes, 4.8° off center",
        "t:15.1 m (really 15.0 m)",
        "t:10.4 m (really 10.4 m)",
        "t:no, 56.3° off center (edge 9.0°)",
        DASH,
        DASH,
      ],
      "9e9960c0",
    ],
    [
      "depth and side distance wrong: the depth is named",
      { fz: "", fy: "abc" },
      {},
      wrong(DEPTH),
      "f6790e88",
    ],
    ["a side distance that is no number", { fy: "abc" }, {}, wrong(SIDE), "23882cc3"],
    ["no side distance", { fy: "" }, {}, wrong(SIDE), "23882cc3"],
    ["a fish 1.5 m to the other side: taken as 1.5 m", { fy: "-1.5" }, {}, START, "a03f4288"],
    [
      "a fish on the aim line",
      { fy: "0" },
      {},
      [
        NO_ERR,
        "t:yes, 0.0° off center",
        "t:15.0 m (really 15.0 m)",
        "t:5.0 m (really 5.0 m)",
        "t:no, 73.3° off center (edge 9.0°)",
        DASH,
        DASH,
      ],
      "dbc29d63",
    ],
    [
      "a fish 5 m to the side: outside the Forward slice",
      { fy: "5" },
      {},
      [
        NO_ERR,
        "t:no, 17.7° off center (edge 9.0°)",
        DASH,
        DASH,
        "t:no, 65.8° off center (edge 9.0°)",
        DASH,
        DASH,
      ],
      "838768ab",
    ],
    [
      "a fish 0.5 m ahead: inside the Down slice",
      { fx: "0.5" },
      {},
      [
        NO_ERR,
        "t:no, 18.3° off center (edge 9.0°)",
        DASH,
        DASH,
        "t:yes, 6.0° off center",
        "t:1.5 m (really 1.5 m)",
        "t:5.0 m (really 5.0 m)",
      ],
      "b03f7053",
    ],
    [
      "a fish 20 m to the side: outside the Down fan, which the text does not say",
      { fx: "0.2", fy: "20" },
      {},
      [
        NO_ERR,
        "t:no, 77.3° off center (edge 9.0°)",
        DASH,
        DASH,
        "t:no, 0.6° off center (edge 9.0°)",
        DASH,
        DASH,
      ],
      "6e699177",
    ],
    [
      "the fish exactly on the edge of the Forward slice",
      { att: "10.94249890686686" },
      {},
      [
        NO_ERR,
        "t:yes, 5.5° off center",
        "t:15.1 m (really 15.0 m)",
        "t:5.0 m (really 5.0 m)",
        "t:no, 72.5° off center (edge 5.5°)",
        DASH,
        DASH,
      ],
      "78f1f056",
    ],
    [
      "the fish just outside the edge of the Forward slice",
      { att: "10.942498906866854" },
      {},
      [
        NO_ERR,
        "t:no, 5.5° off center (edge 5.5°)",
        DASH,
        DASH,
        "t:no, 72.5° off center (edge 5.5°)",
        DASH,
        DASH,
      ],
      "aa058630",
    ],
    [
      "the fish exactly on the edge of the Down slice",
      { fx: "0.5", att: "12.034569728064064" },
      {},
      [
        NO_ERR,
        "t:no, 18.3° off center (edge 6.0°)",
        DASH,
        DASH,
        "t:yes, 6.0° off center",
        "t:1.5 m (really 1.5 m)",
        "t:5.0 m (really 5.0 m)",
      ],
      "70dcd437",
    ],
    [
      "the fish just outside the edge of the Down slice",
      { fx: "0.5", att: "12.034569728064058" },
      {},
      [
        NO_ERR,
        "t:no, 18.3° off center (edge 6.0°)",
        DASH,
        DASH,
        "t:no, 6.0° off center (edge 6.0°)",
        DASH,
        DASH,
      ],
      "239ddedf",
    ],
    [
      "the fish exactly on the edge of a Down fan of 90 degrees",
      { atw: "90", fx: "0.1", fy: "4.5" },
      {},
      [
        NO_ERR,
        "t:no, 45.0° off center (edge 9.0°)",
        DASH,
        DASH,
        "t:yes, 0.9° off center",
        "t:4.5 m (really 4.5 m)",
        "t:5.0 m (really 5.0 m)",
      ],
      "6bd62fc9",
    ],
    [
      "the fish just outside a Down fan of 89.99 degrees",
      { atw: "89.99", fx: "0.1", fy: "4.5" },
      {},
      [
        NO_ERR,
        "t:no, 45.0° off center (edge 9.0°)",
        DASH,
        DASH,
        "t:no, 0.9° off center (edge 9.0°)",
        DASH,
        DASH,
      ],
      "f72cc8e6",
    ],
    [
      "a deeper transducer",
      { zt: "2", fz: "2.5" },
      {},
      [
        NO_ERR,
        "t:yes, 5.7° off center",
        "t:15.1 m (really 15.0 m)",
        "t:2.5 m (really 2.5 m)",
        "t:no, 84.0° off center (edge 9.0°)",
        DASH,
        DASH,
      ],
      "b9552f55",
    ],
    [
      "a fish below the bottom of another depth",
      { dep: "3.2", zt: "0.25", fz: "9" },
      {},
      wrong(
        "t:The fish must be below the transducer (0.25 m) and above the bottom (3.5 m below the surface). [shown]",
      ),
      "21cf2fd0",
    ],
    [
      "the page as it starts, in sv-SE",
      {},
      SV,
      [
        NO_ERR,
        "t:yes, 5,5° off center",
        "t:15,1 m (really 15,0 m)",
        "t:5,0 m (really 5,0 m)",
        "t:no, 72,5° off center (edge 9,0°)",
        DASH,
        DASH,
      ],
      "787d6842",
    ],
    [
      "a fish at the transducer's depth, typed with a comma, in sv-SE",
      { fz: "0,5" },
      SV,
      wrong(
        "t:The fish must be below the transducer (0,50 m) and above the bottom (10,5 m below the surface). [shown]",
      ),
      "e24e3f6e",
    ],
    [
      "a fish 1000 m ahead",
      { fx: "1e3" },
      {},
      [
        NO_ERR,
        "t:yes, 0.1° off center",
        "t:1000.0 m (really 1000.0 m)",
        "t:5.0 m (really 5.0 m)",
        "t:no, 89.7° off center (edge 9.0°)",
        DASH,
        DASH,
      ],
      "18425918",
    ],
    [
      "a slice of 60 degrees and a fish 3 m to the side",
      { att: "60", fy: "3" },
      {},
      [
        NO_ERR,
        "t:yes, 10.8° off center",
        "t:15.3 m (really 15.0 m)",
        "t:5.1 m (really 5.0 m)",
        "t:no, 70.2° off center (edge 30.0°)",
        DASH,
        DASH,
      ],
      "866d5ea7",
    ],
    [
      "odd numbers all round",
      ODD,
      {},
      [
        NO_ERR,
        "t:no, 10.2° off center (edge 6.7°)",
        DASH,
        DASH,
        "t:no, 64.9° off center (edge 6.7°)",
        DASH,
        DASH,
      ],
      "230ceef5",
    ],
    [
      "odd numbers all round, the fish 0.3 m ahead",
      { ...ODD, fx: "0.3" },
      {},
      [
        NO_ERR,
        "t:no, 24.6° off center (edge 6.7°)",
        DASH,
        DASH,
        "t:yes, 3.8° off center",
        "t:1.9 m (really 1.9 m)",
        "t:4.5 m (really 4.5 m)",
      ],
      "cdfec91e",
    ],
  ];

  it.each(cases)("%s", (_what, fields, setup, written, digest) => {
    const view = viewOf(fields, setup);
    expect(toldOf(view, FISH)).toEqual(written);
    expect(digestOf(view)).toBe(digest);
  });

  it("takes a number field that is given as a text for no number", () => {
    const input = inputFor();
    const view = activeTargetView({ ...input, local: { ...input.local, fx: "15" } });
    expect(toldOf(view, FISH)).toEqual(wrong(AHEAD));
    expect(digestOf(view)).toBe("48f15e69");
  });

  it("takes a number field that is not given for no number", () => {
    const input = inputFor();
    const view = activeTargetView({ ...input, local: { fx: 15, fz: 5, sr: 20 } });
    expect(toldOf(view, FISH)).toEqual(wrong(SIDE));
    expect(digestOf(view)).toBe("23882cc3");
  });
});

describe("the flat mode (renderAT, lines 944 to 967)", () => {
  const SCREEN = "t:Enter a screen distance greater than 0 m. [shown]";
  const FIRST = "t:Fix the fish above first. [shown]";
  const Z = "t:4.3 to 10.2 m below the surface";
  const X = "t:17.5 to 19.6 m";
  const B1 = "t:20.6 m on screen";
  const B2 = "t:52.4 m on screen";
  const NEVER = "t:never, the top of the slice stays in open water";
  const SEEN = "t:yes, drawn at 15.7 m (really 15.1 m away horizontally)";
  const SEEN_WIDE = "t:yes, drawn at 15.7 m";
  const ALL_BOTTOM = "t:on the bottom (the slice is all bottom here)";
  const SAME_LIMIT = "t:no, same depth limit as single Scout";
  const OUTSIDE = "t:no, it is 20.0° below horizontal; the slice covers 11.0° to 29.0°";

  /** What is tested, the fields changed, the setup, the seven elements of `FLAT`, and the digest of the view. */
  type Row = [what: string, fields: RawFields, setup: Setup, written: string[], digest: string];

  /** A fish to the side of the fan, a fish on the 45 degree line, and one 45 degrees below horizontal. */
  const BEARING: RawFields = { fx: "5", fy: "20", fz: "8" };
  const DIAGONAL: RawFields = { fx: "4", fy: "4", fz: "2.56" };
  const ELEVATION_45: RawFields = { fx: "3", fy: "4", fz: "5.5", att: "10" };

  const cases: Row[] = [
    ["the page as it starts", {}, {}, [NO_ERR, Z, X, B1, B2, SEEN, SEEN_WIDE], "a03f4288"],
    [
      "a screen distance of 0",
      { sr: "0" },
      {},
      [SCREEN, DASH, DASH, B1, B2, DASH, DASH],
      "346110f8",
    ],
    ["no screen distance", { sr: "" }, {}, [SCREEN, DASH, DASH, B1, B2, DASH, DASH], "346110f8"],
    [
      "a screen distance of -1",
      { sr: "-1" },
      {},
      [SCREEN, DASH, DASH, B1, B2, DASH, DASH],
      "346110f8",
    ],
    ["the fish wrong", { fx: "-1" }, {}, [FIRST, DASH, DASH, B1, B2, DASH, DASH], "48f15e69"],
    [
      "screen distance and fish wrong: the screen distance is named",
      { sr: "0", fx: "-1" },
      {},
      [SCREEN, DASH, DASH, B1, B2, DASH, DASH],
      "48a9e50c",
    ],
    [
      "a screen distance of 29 m: the slice reaches the bottom",
      { sr: "29" },
      {},
      [NO_ERR, "t:6.0 to 10.5 m below the surface", "t:27.2 to 28.5 m", B1, B2, SEEN, SEEN_WIDE],
      "21f77539",
    ],
    [
      "a screen distance of 0.5 m",
      { sr: "0.5" },
      {},
      [NO_ERR, "t:0.60 to 0.74 m below the surface", "t:0.44 to 0.49 m", B1, B2, SEEN, SEEN_WIDE],
      "9cb89bb9",
    ],
    [
      "a mount angle of 5 degrees: the top of the slice points up",
      { atsb: "5" },
      {},
      [
        NO_ERR,
        "t:0.00 to 5.3 m below the surface",
        "t:19.4 to 20.0 m",
        "t:41.3 m on screen",
        NEVER,
        "t:no, it is 16.6° below horizontal; the slice covers 0.0° to 14.0°",
        SAME_LIMIT,
      ],
      "7c820056",
    ],
    [
      "a mount angle of 0 degrees: the slice reaches the surface",
      { atsb: "0" },
      {},
      [
        NO_ERR,
        "t:0.00 to 3.6 m below the surface",
        "t:19.8 to 20.0 m",
        "t:63.9 m on screen",
        NEVER,
        "t:no, it is 16.6° below horizontal; the slice covers 0.0° to 9.0°",
        SAME_LIMIT,
      ],
      "94b3774f",
    ],
    [
      "a mount angle of 9 degrees: the top of the slice is level",
      { atsb: "9" },
      {},
      [
        NO_ERR,
        "t:0.50 to 6.7 m below the surface",
        "t:19.0 to 20.0 m",
        "t:32.4 m on screen",
        NEVER,
        SEEN,
        SEEN_WIDE,
      ],
      "8fb79913",
    ],
    [
      "a mount angle of 60 degrees: the slice is all bottom",
      { atsb: "60" },
      {},
      [
        NO_ERR,
        ALL_BOTTOM,
        "t:17.3 m",
        "t:10.7 m on screen",
        "t:12.9 m on screen",
        "t:no, it is 16.6° below horizontal; the slice covers 51.0° to 69.0°",
        SAME_LIMIT,
      ],
      "0851c9c2",
    ],
    [
      "a slice whose lower edge points straight down, read just under the transducer",
      { atsb: "80", att: "20", zt: "0.3", sr: "0.1" },
      {},
      [
        NO_ERR,
        "t:0.39 to 0.40 m below the surface",
        "t:0.00 to 0.03 m",
        "t:10.0 m on screen",
        "t:10.6 m on screen",
        "t:no, it is 17.3° below horizontal; the slice covers 70.0° to 90.0°",
        SAME_LIMIT,
      ],
      "29ab3fd2",
    ],
    [
      "a fish too deep for the slice",
      { fx: "3", fz: "9" },
      {},
      [
        NO_ERR,
        Z,
        X,
        B1,
        B2,
        "t:no, it is 68.5° below horizontal; the slice covers 11.0° to 29.0°",
        SAME_LIMIT,
      ],
      "72dcabef",
    ],
    [
      "a fish outside the fan to the side, which the text does not say",
      BEARING,
      {},
      [NO_ERR, Z, X, B1, B2, OUTSIDE, "t:yes, drawn at 21.9 m"],
      "600d5c3f",
    ],
    [
      "the same fish and a fan of 40 degrees: outside the wide view too",
      { ...BEARING, atw: "40" },
      {},
      [NO_ERR, Z, X, B1, B2, OUTSIDE, "t:no, outside the 80° view"],
      "904aa6c2",
    ],
    [
      "a fish exactly on the edge of a fan of 90 degrees",
      { ...DIAGONAL, atw: "90" },
      {},
      [
        NO_ERR,
        Z,
        X,
        B1,
        B2,
        "t:yes, drawn at 6.0 m (really 5.7 m away horizontally)",
        "t:yes, drawn at 6.0 m",
      ],
      "c927bbff",
    ],
    [
      "the same fish just outside a fan of 89.99 degrees",
      { ...DIAGONAL, atw: "89.99" },
      {},
      [NO_ERR, Z, X, B1, B2, OUTSIDE, "t:yes, drawn at 6.0 m"],
      "4c59dc51",
    ],
    [
      "a fish exactly on the edge of the wide view of a fan of 45 degrees",
      { ...DIAGONAL, atw: "45" },
      {},
      [NO_ERR, Z, X, B1, B2, OUTSIDE, "t:yes, drawn at 6.0 m"],
      "4c59dc51",
    ],
    [
      "the same fish just outside the wide view of a fan of 44.99 degrees",
      { ...DIAGONAL, atw: "44.99" },
      {},
      [NO_ERR, Z, X, B1, B2, OUTSIDE, "t:no, outside the 90° view"],
      "851cc4c1",
    ],
    [
      "a fish exactly on the lower edge of the slice",
      { ...ELEVATION_45, atsb: "40" },
      {},
      [
        NO_ERR,
        ALL_BOTTOM,
        "t:17.3 m",
        "t:14.1 m on screen",
        "t:17.4 m on screen",
        "t:yes, drawn at 7.1 m (really 5.0 m away horizontally)",
        "t:yes, drawn at 7.1 m",
      ],
      "aa8d216e",
    ],
    [
      "the same fish just under the lower edge",
      { ...ELEVATION_45, atsb: "39.99" },
      {},
      [
        NO_ERR,
        ALL_BOTTOM,
        "t:17.3 m",
        "t:14.1 m on screen",
        "t:17.4 m on screen",
        "t:no, it is 45.0° below horizontal; the slice covers 35.0° to 45.0°",
        SAME_LIMIT,
      ],
      "0df59bea",
    ],
    [
      "a fish exactly on the upper edge of the slice",
      { ...ELEVATION_45, atsb: "50" },
      {},
      [
        NO_ERR,
        ALL_BOTTOM,
        "t:17.3 m",
        "t:12.2 m on screen",
        "t:14.1 m on screen",
        "t:yes, drawn at 7.1 m (really 5.0 m away horizontally)",
        "t:yes, drawn at 7.1 m",
      ],
      "1c09dbbd",
    ],
    [
      "the same fish just over the upper edge",
      { ...ELEVATION_45, atsb: "50.01" },
      {},
      [
        NO_ERR,
        ALL_BOTTOM,
        "t:17.3 m",
        "t:12.2 m on screen",
        "t:14.1 m on screen",
        "t:no, it is 45.0° below horizontal; the slice covers 45.0° to 55.0°",
        SAME_LIMIT,
      ],
      "45907a65",
    ],
    [
      "one transducer: the wide view's line is written all the same",
      { "at-n": "1" },
      {},
      [NO_ERR, Z, X, B1, B2, SEEN, SEEN_WIDE],
      "a03f4288",
    ],
    [
      "the page as it starts, in sv-SE",
      {},
      SV,
      [
        NO_ERR,
        "t:4,3 to 10,2 m below the surface",
        "t:17,5 to 19,6 m",
        "t:20,6 m on screen",
        "t:52,4 m on screen",
        "t:yes, drawn at 15,7 m (really 15,1 m away horizontally)",
        "t:yes, drawn at 15,7 m",
      ],
      "787d6842",
    ],
    [
      "a mount angle of -20 degrees while the live sonar is not ticked",
      { ...UNTICKED, atsb: "-20" },
      {},
      [
        NO_ERR,
        "t:0.00 to -3.3 m below the surface",
        "t:19.6 to 20.0 m",
        "t:never",
        NEVER,
        "t:no, it is 16.6° below horizontal; the slice covers 0.0° to -11.0°",
        SAME_LIMIT,
      ],
      "abd3cdd9",
    ],
    [
      "a depth of 0.1 m under a transducer 0.3 m down",
      { dep: "0.1", zt: "0.3", atr: "1", fz: "0.35", fx: "0.2", fy: "0", sr: "0.2" },
      {},
      [
        NO_ERR,
        "t:0.34 to 0.40 m below the surface",
        "t:0.17 to 0.20 m",
        "t:0.21 m on screen",
        "t:0.52 m on screen",
        "t:yes, drawn at 0.21 m (really 0.20 m away horizontally)",
        "t:yes, drawn at 0.21 m",
      ],
      "913d18d2",
    ],
    [
      "another brand, with the fish too deep",
      { "live-p": "lvs34", fx: "3", fz: "9" },
      {},
      [
        NO_ERR,
        Z,
        X,
        B1,
        B2,
        "t:no, it is 68.5° below horizontal; the slice covers 11.0° to 29.0°",
        "t:no, same depth limit as single Perspective",
      ],
      "b6a7bfbb",
    ],
    [
      "a depth of 40 m and a screen distance of 45 m",
      { dep: "40", atr: "60", sr: "45" },
      {},
      [
        NO_ERR,
        "t:9.1 to 22.3 m below the surface",
        "t:39.4 to 44.2 m",
        "t:82.5 m on screen",
        "t:209.6 m on screen",
        SEEN,
        SEEN_WIDE,
      ],
      "a93c5b0b",
    ],
    [
      "odd numbers all round",
      ODD,
      {},
      [
        NO_ERR,
        "t:3.7 to 6.1 m below the surface",
        "t:9.7 to 10.8 m",
        "t:14.4 m on screen",
        "t:24.6 m on screen",
        "t:yes, drawn at 10.7 m (really 9.9 m away horizontally)",
        "t:yes, drawn at 10.7 m",
      ],
      "230ceef5",
    ],
    [
      "odd numbers all round, the slice all bottom",
      { ...ODD, atsb: "61.7", sr: "9.1" },
      {},
      [
        NO_ERR,
        ALL_BOTTOM,
        "t:5.4 m",
        "t:7.9 m on screen",
        "t:8.9 m on screen",
        "t:no, it is 22.7° below horizontal; the slice covers 55.1° to 68.4°",
        SAME_LIMIT,
      ],
      "85fbf546",
    ],
    // The rows after this comment were added after the module was written, for variants of it that the other rows could not tell.
    [
      "a fish at 45.2° and a fan of 90°: the single Scout fan",
      { atw: "90", fx: "10", fy: "10.1" },
      {},
      [
        NO_ERR,
        Z,
        X,
        B1,
        B2,
        "t:no, it is 17.6° below horizontal; the slice covers 11.0° to 29.0°",
        "t:yes, drawn at 14.9 m",
      ],
      "ff3ebc2a",
    ],
    [
      "a fish at 45.2° and a fan of 45°: the wide fan",
      { atw: "45", fx: "10", fy: "10.1" },
      {},
      [
        NO_ERR,
        Z,
        X,
        B1,
        B2,
        "t:no, it is 17.6° below horizontal; the slice covers 11.0° to 29.0°",
        "t:no, outside the 90° view",
      ],
      "d2825900",
    ],
    [
      "a screen distance of 52.408430641678486 m: the slice meets the bottom exactly",
      { sr: "52.408430641678486" },
      {},
      [NO_ERR, ALL_BOTTOM, "t:51.4 m", B1, B2, SEEN, SEEN_WIDE],
      "4a3adc30",
    ],
    [
      "a slice at 88.5° to 89.5°, a depth of 10 m and a screen distance of 10.004 m: all bottom, barely out",
      { atsb: "89", att: "1", dep: "10", zt: "0", sr: "10.004" },
      {},
      [
        NO_ERR,
        ALL_BOTTOM,
        "t:0.28 m",
        "t:10.0 m on screen",
        "t:10.0 m on screen",
        "t:no, it is 18.3° below horizontal; the slice covers 88.5° to 89.5°",
        SAME_LIMIT,
      ],
      "91307125",
    ],
    [
      "a fan of 23.25° and a fish 76° to the side: the wide screen says outside the view of a width on a half degree",
      { atw: "23.25", fx: "5", fy: "20" },
      {},
      [
        NO_ERR,
        Z,
        X,
        B1,
        B2,
        "t:no, it is 12.3° below horizontal; the slice covers 11.0° to 29.0°",
        "t:no, outside the 47° view",
      ],
      "5a8f15e8",
    ],
  ];

  it.each(cases)("%s", (_what, fields, setup, written, digest) => {
    const view = viewOf(fields, setup);
    expect(toldOf(view, FLAT)).toEqual(written);
    expect(digestOf(view)).toBe(digest);
  });
});

describe("the four simulated screens (lines 776 to 849)", () => {
  /** The fish of the rows of the flat mode. */
  const BEARING: RawFields = { fx: "5", fy: "20", fz: "8" };

  /** What is tested, the fields changed, the setup, and the log of each screen as `logSum` gives it. */
  type Row = [
    what: string,
    fields: RawFields,
    setup: Setup,
    logs: readonly [scrF: string, scrD: string, scrS: string, scrW: string],
  ];
  const AT_PAGE_SIZE: Setup = { sizes: PAGE };
  const cases: Row[] = [
    ["the page as it starts", {}, {}, ["49:76cce0ea", "30:44da7745", "54:af91187d", "54:718af11d"]],
    [
      "the page as it starts, at the page's size",
      {},
      AT_PAGE_SIZE,
      ["49:fa83973d", "30:28cdaace", "54:bf9e163d", "54:a8ecd78f"],
    ],
    [
      "the page as it starts, in sv-SE",
      {},
      SV,
      ["49:3402dfc6", "30:ddd5e901", "54:2a489b59", "54:24add321"],
    ],
    [
      "a range of 20 m: a ring every 5 m",
      { atr: "20" },
      {},
      ["59:fa09714a", "30:5633827c", "57:dac31358", "57:0370d8f1"],
    ],
    [
      "a range of 21 m: a ring every 10 m",
      { atr: "21" },
      {},
      ["39:de1472e9", "30:82009b41", "44:6004c6b7", "44:277f7aeb"],
    ],
    [
      "a range of 50 m: a ring every 10 m",
      { atr: "50" },
      {},
      ["69:eac7bd82", "30:9c268eba", "74:b6fc9398", "74:4e2dddcc"],
    ],
    [
      "a range of 51 m: a ring every 20 m",
      { atr: "51" },
      {},
      ["39:d2dc3500", "30:72692052", "44:72cf166c", "44:6ded4fac"],
    ],
    [
      "a range of 5 m: the bottom is out of range",
      { atr: "5" },
      {},
      ["29:9ef234de", "30:b2bf3bd8", "27:197cac57", "27:407e259b"],
    ],
    [
      "a range of 0.5 m",
      { atr: "0.5" },
      {},
      ["19:73ae1632", "30:b2bf3bd8", "17:409b6a17", "17:2cf81088"],
    ],
    [
      "the fish wrong",
      { fx: "-1" },
      {},
      ["49:211cf870", "30:44da7745", "54:ede4e262", "54:ad3d587d"],
    ],
    [
      "a fish straight below",
      { fx: "0" },
      {},
      ["49:211cf870", "30:ade731a7", "54:ede4e262", "54:ad3d587d"],
    ],
    [
      "a fish straight below on the aim line: the edge of the Forward view",
      { fx: "0", fy: "0" },
      {},
      ["49:64eb3270", "30:11991f02", "54:ede4e262", "54:ad3d587d"],
    ],
    [
      "a fish 0.5 m ahead: inside the Down slice",
      { fx: "0.5" },
      {},
      ["49:211cf870", "30:be3b769e", "54:ede4e262", "54:ad3d587d"],
    ],
    [
      "a fish 5 m to the side: outside the Forward slice",
      { fy: "5" },
      {},
      ["49:211cf870", "30:44da7745", "54:f815bf6f", "54:64be3636"],
    ],
    [
      "a fish 20 m to the side: outside the Down fan",
      { fx: "0.2", fy: "20" },
      {},
      ["49:211cf870", "30:44da7745", "54:ede4e262", "54:73043c14"],
    ],
    [
      "a fan of 180 degrees",
      { atw: "180" },
      {},
      ["49:76cce0ea", "30:d86f140c", "54:08d31fa3", "54:62923795"],
    ],
    [
      "a fan of 60 degrees",
      { atw: "60" },
      {},
      ["49:76cce0ea", "30:67bc60de", "54:9d175e3c", "54:f48e801e"],
    ],
    [
      "a fan of 90 degrees",
      { atw: "90" },
      {},
      ["49:76cce0ea", "30:c8328a0b", "54:2a338daa", "54:08d31fa3"],
    ],
    [
      "a fan of 40 degrees and a fish outside it",
      { ...BEARING, atw: "40" },
      {},
      ["49:211cf870", "30:97ab24cb", "54:7126531a", "54:5fd369d9"],
    ],
    [
      "a fish outside the fan to the side, inside the wide view",
      BEARING,
      {},
      ["49:211cf870", "30:44da7745", "54:ede4e262", "54:3703d919"],
    ],
    [
      "one transducer: no wide view",
      { "at-n": "1" },
      {},
      ["49:76cce0ea", "30:44da7745", "54:af91187d", NOTHING],
    ],
    [
      "another brand without a wide view, the fish wrong",
      { "live-p": "lvs34", fx: "-1" },
      {},
      ["49:211cf870", "30:44da7745", "54:a5ecf364", NOTHING],
    ],
    [
      "another model with a wide view, the fish wrong",
      { "live-p": "at2xl", fx: "-1" },
      {},
      ["49:211cf870", "30:44da7745", "54:c1724cc1", "54:ae725e00"],
    ],
    [
      "a mount angle of 5 degrees: the top of the slice never meets the bottom",
      { atsb: "5" },
      {},
      ["49:76cce0ea", "30:44da7745", "47:3af15a4f", "47:18140a73"],
    ],
    [
      "a thin slice over a shallow bottom",
      { dep: "2", att: "0.5" },
      {},
      ["49:7dc08bb2", "30:c27f180c", "54:1e159268", "54:37359437"],
    ],
    [
      "a mount angle of 60 degrees",
      { atsb: "60" },
      {},
      ["49:76cce0ea", "30:44da7745", "54:87579eae", "54:4e221a9d"],
    ],
    [
      "the bottom starts exactly at the range",
      { atsb: "80", att: "20", atr: "10" },
      {},
      ["39:a4ad49d6", "30:b2bf3bd8", "44:a7e21bbc", "44:779afc6d"],
    ],
    [
      "a depth of 0.1 m under a transducer 0.3 m down",
      { dep: "0.1", zt: "0.3", atr: "1", fz: "0.35", fx: "0.2", fy: "0", sr: "0.2" },
      {},
      ["19:4e479e2e", "30:7cbeb22d", "24:81f6cd08", "24:860a14b1"],
    ],
    [
      "a depth of 40 m: the bottom is below the Down screen",
      { dep: "40" },
      {},
      ["49:30aa5493", "30:433dd14c", "47:7b5206eb", "47:42e6f699"],
    ],
    [
      "a fish 25 m ahead, at the page's size: its label is held inside the Forward screen",
      { fx: "25" },
      AT_PAGE_SIZE,
      ["49:10918bcb", "30:28cdaace", "54:d2a3f0cc", "54:c0a7ef91"],
    ],
    [
      "a fish far to the side, at the page's size: its label is held inside the flat screen",
      { fx: "8", fy: "16", fz: "7" },
      AT_PAGE_SIZE,
      ["49:7d3feddc", "30:28cdaace", "54:6bfa319a", "54:d11e2972"],
    ],
    [
      "a narrow Forward screen, as wide as it is high",
      {},
      { sizes: { ...STAND_IN, scrF: [60, 90] } },
      ["49:f56ca801", "30:44da7745", "54:af91187d", "54:718af11d"],
    ],
    [
      "a fan of 60 degrees, at the page's size",
      { atw: "60" },
      AT_PAGE_SIZE,
      ["49:fa83973d", "30:be615223", "54:56484922", "54:949483f1"],
    ],
    [
      "a fan of 180 degrees, at the page's size",
      { atw: "180" },
      AT_PAGE_SIZE,
      ["49:fa83973d", "30:39d68380", "54:f214d0bd", "54:90fe7846"],
    ],
    [
      "a deeper transducer",
      { zt: "3", fz: "6" },
      {},
      ["49:685a1a34", "30:6d627e2d", "54:ffe2f2e9", "54:5d7efcbf"],
    ],
    [
      "a transducer at the surface",
      { zt: "0" },
      {},
      ["49:d1faa017", "30:5276ee6d", "54:83b49fe4", "54:692dd2db"],
    ],
    [
      "a thickness of 45 degrees",
      { att: "45" },
      {},
      ["49:76cce0ea", "30:44da7745", "54:9538e54f", "54:25d113bf"],
    ],
    [
      "a screen distance of 0: the flat screens are drawn without the fish",
      { sr: "0" },
      {},
      ["49:76cce0ea", "30:44da7745", "54:ede4e262", "54:ad3d587d"],
    ],
    [
      "a range that is wrong: nothing is drawn",
      { atr: "0" },
      {},
      [NOTHING, NOTHING, NOTHING, NOTHING],
    ],
    [
      "a depth that is wrong: nothing is drawn",
      { dep: "" },
      {},
      [NOTHING, NOTHING, NOTHING, NOTHING],
    ],
    [
      "odd numbers all round",
      ODD,
      {},
      ["39:13f2ba6f", "30:cffcf81f", "44:34813b99", "44:8ee3b777"],
    ],
    [
      "odd numbers all round, at the page's size",
      ODD,
      AT_PAGE_SIZE,
      ["39:cbda5a81", "30:ec26069b", "44:345937a3", "44:89d67c5a"],
    ],
    [
      "odd numbers all round, the fish 0.3 m ahead, at the page's size",
      { ...ODD, fx: "0.3" },
      AT_PAGE_SIZE,
      ["39:cbda5a81", "30:61fa49a2", "44:979aa6ad", "44:1901500f"],
    ],
    [
      "a fan of 175 degrees",
      { atw: "175" },
      {},
      ["49:76cce0ea", "30:84c26c0e", "54:c25e8bbe", "54:19e648fd"],
    ],
    [
      "a depth of 0.1 m under a transducer 0.3 m down, at the page's size",
      { ...TINY, fz: "0.35", fx: "0.2", fy: "0", sr: "0.2" },
      AT_PAGE_SIZE,
      ["19:877167eb", "30:aa90363f", "24:fc96f616", "24:83947286"],
    ],
    // The rows after this comment were added after the module was written, for variants of it that the other rows could not tell.
    [
      "a fish at 45.2° and a fan of 90°: the single Scout fan",
      { atw: "90", fx: "10", fy: "10.1" },
      {},
      ["49:211cf870", "30:c8328a0b", "54:2597800f", "54:97e8823c"],
    ],
    [
      "a fish at 45.2° and a fan of 45°: the wide fan",
      { atw: "45", fx: "10", fy: "10.1" },
      {},
      ["49:211cf870", "30:6f3ebd7a", "54:c0175beb", "54:2597800f"],
    ],
    [
      "a fish 0.35 m ahead, 5 m down, a range of 70 m: its disc lands on a pixel",
      { atr: "70", zt: "0", dep: "10", fx: "0.35", fy: "0", fz: "5" },
      {},
      ["49:41963438", "30:f861d370", "54:9775c55d", "54:3b18b08f"],
    ],
    [
      "a fish 0.35 m to the side, 5 m down, a fan of 180°: its disc lands on a pixel",
      { atr: "50", atw: "180", zt: "0", dep: "10", fx: "0", fy: "0.35", fz: "5" },
      {},
      ["69:c63a0a27", "30:87e32361", "74:4d2ee0e7", "74:2074c888"],
    ],
    [
      "a bottom 0.23431337983185427 m deep: a pixel 0.3 m from where the bottom starts",
      { atr: "10", zt: "0", dep: "0.23431337983185427", fz: "0.1", fx: "1", fy: "0.1" },
      {},
      ["39:2220d2b2", "30:10f15bed", "44:8fcf2b4d", "44:61ab82cc"],
    ],
    [
      "a fish 0.1 m under a transducer 0.5 m down and 15 m ahead: 89.6° from straight down",
      { dep: "1", fz: "0.6" },
      {},
      ["49:c8157474", "30:f5682780", "54:1a36e0c0", "54:d891d79f"],
    ],
  ];

  it.each(cases)("%s", (_what, fields, setup, logs) => {
    const input = inputFor(fields, setup);
    const sizes = setup.sizes ?? STAND_IN;
    expect(SCREENS.map((id) => logSum(drawn(id, input, sizes[id])))).toEqual(logs);
  });

  it("writes the texts of the page as it starts where the earlier lines write them", () => {
    const input = inputFor();
    expect(SCREENS.map((id) => logTexts(drawn(id, input)))).toEqual([
      [
        "10 m@41.333333333333336@24",
        "20 m@64.66666666666667@24",
        "30 m@88@24",
        "bottom 10.5 m@114@29.333333333333336",
        "fish 15.1 m ahead, 5.0 m deep@-70@12.548055170973853",
      ],
      [
        "port@8@72",
        "starboard@112@72",
        "bottom 10.5 m@60@22.039870004873233",
        "fish outside the slice@8@20",
      ],
      [
        "10 m@64@60.07974000974646",
        "20 m@64@42.03987000487323",
        "30 m@64@24",
        "bottom starts 20.6 m@112@32.90939542418525",
        "fish 15.7 m@40@29.87989442870662",
      ],
      [
        "10 m@64@57.33333333333333",
        "20 m@64@40.666666666666664",
        "30 m@64@24",
        "bottom starts 20.6 m@112@31.622244339544764",
        "fish 15.7 m@40@27.90990476623493",
      ],
    ]);
  });

  it("writes the same texts at the page's size", () => {
    const input = inputFor();
    expect(SCREENS.map((id) => logTexts(drawn(id, input, PAGE[id])))).toEqual([
      [
        "10 m@98@24",
        "20 m@178@24",
        "30 m@258@24",
        "bottom 10.5 m@354@86",
        "fish 15.1 m ahead, 5.0 m deep@142.54920195398688@38.16476058619607",
      ],
      [
        "port@8@222",
        "starboard@352@222",
        "bottom 10.5 m@180@65.335558016569",
        "fish outside the slice@8@20",
      ],
      [
        "10 m@184@146.671116033138",
        "20 m@184@85.335558016569",
        "30 m@184@24",
        "bottom starts 20.6 m@352@73.49194444222987",
        "fish 15.7 m@197.60150329921044@91.99164105760254",
      ],
      [
        "10 m@184@117.72583002030481",
        "20 m@184@70.8629150101524",
        "30 m@184@24",
        "bottom starts 20.6 m@352@59.92623452511525",
        "fish 15.7 m@195.3359474932803@71.22927009765434",
      ],
    ]);
  });

  it("names the flat mode on both flat screens when the fish is not in them", () => {
    const input = inputFor({ "live-p": "at2xl", fx: "-1" });
    expect(logTexts(drawn(CANVAS_FLAT, input)).at(-1)).toBe("fish not in this Scout XL view@8@73");
    expect(logTexts(drawn(CANVAS_WIDE, input)).at(-1)).toBe("fish not in this Scout XL view@8@104");
  });

  it("holds a label inside the Forward and the flat screen, at the page's size", () => {
    expect(logTexts(drawn(CANVAS_FORWARD, inputFor({ fx: "25" }), PAGE.scrF)).at(-1)).toBe(
      "fish 25.0 m ahead, 5.0 m deep@170@38.06271174791131",
    );
    const side = inputFor({ fx: "8", fy: "16", fz: "7" });
    expect(logTexts(drawn(CANVAS_FLAT, side, PAGE.scrS)).at(-1)).toBe(
      "fish 19.0 m@280@135.79934012396214",
    );
    expect(logTexts(drawn(CANVAS_WIDE, side, PAGE.scrW)).at(-1)).toBe(
      "fish 19.0 m@267.77714499664@104.70017253213717",
    );
  });

  it("sets the height of the two flat screens, and only when it is not the height they need", () => {
    const input = inputFor();
    const flat = drawn(CANVAS_FLAT, input);
    const wide = drawn(CANVAS_WIDE, input);
    expect([flat[0], wide[0]]).toEqual([
      ["#height", 79],
      ["#height", 110],
    ]);
    const flatAgain = drawn(CANVAS_FLAT, input, [120, 79]);
    const wideAgain = drawn(CANVAS_WIDE, input, [120, 110]);
    expect([logSum(flatAgain), logSum(wideAgain)]).toEqual(["53:b1c8704f", "53:20d452af"]);
    expect([flatAgain, wideAgain]).toEqual([flat.slice(1), wide.slice(1)]);
    expect(drawn(CANVAS_FORWARD, input).some((entry) => entry[0] === "#height")).toBe(false);
    expect(drawn(CANVAS_DOWN, input).some((entry) => entry[0] === "#height")).toBe(false);
  });

  it("sets a font without a family when the style names none, as the earlier page does", () => {
    const input = inputFor({}, { theme: {} });
    const logs = SCREENS.map((id) => drawn(id, input));
    expect(logs.map(logSum)).toEqual(["49:c339085a", "30:38dcd8c9", "54:af1659cd", "54:896b00d5"]);
    const fonts = new Set(logs.flat().flatMap((entry) => (entry[0] === "=font" ? [entry[1]] : [])));
    expect([...fonts]).toEqual(["11px "]);
  });
});

describe("the four beams (beamMember, drawBeam and drawBeams, lines 850 to 916)", () => {
  const F0 =
    "Hits the bottom from 4.0 m behind to 28.3 m ahead, up to 8.4 m wide. Top-view width scaled to fit.";
  const D0 =
    "Hits the bottom in a strip 47.3 m wide side to side and 8.1 m long. Top-view width to scale.";
  const S0 =
    "Hits the bottom in a band 18.0 to 28.3 m out from the transducer, across 135°. Top-view width to scale.";
  const W0 =
    "Hits the bottom in a band 18.0 to 28.3 m out from the transducer, across 270°. Top-view width to scale.";
  const NONE_F = "Doesn't reach the bottom at this depth and range. Top-view width scaled to fit.";
  const NONE = "Doesn't reach the bottom at this depth and range. Top-view width to scale.";

  /** Colours whose mix with the background is not a whole number, and rounds up (line 870). */
  const ROUNDS_UP: Readonly<Record<string, string>> = {
    ...LIGHT,
    "--surface": "#000000",
    "--c2d": "#020000",
    "--accent": "#020000",
  };

  /** The line under the Forward beam, the Down beam, and the flat and the wide beam. */
  const forward = (from: string, to: string, wide: string): string =>
    `Hits the bottom from ${from} to ${to} m ahead, up to ${wide} m wide. Top-view width scaled to fit.`;
  const strip = (wide: string, long: string): string =>
    `Hits the bottom in a strip ${wide} m wide side to side and ${long} m long. Top-view width to scale.`;
  const band = (from: string, to: string, across: string): string =>
    `Hits the bottom in a band ${from} to ${to} m out from the transducer, across ${across}°. Top-view width to scale.`;

  /**
   * What is tested, the fields changed, the setup, the log of each beam's
   * canvas as `logSum` gives it, and the line under each beam. In a log of the
   * earlier lines the fourth entry reads the pixels back (`getImageData`); it
   * stands here as the entry of the port, which makes them (`createImageData`).
   */
  type Row = [
    what: string,
    fields: RawFields,
    setup: Setup,
    logs: readonly [bvF: string, bvD: string, bvS: string, bvW: string],
    lines: readonly [bvF: string, bvD: string, bvS: string, bvW: string],
  ];
  const AT_PAGE_SIZE: Setup = { width: BEAM_PAGE };
  const cases: Row[] = [
    [
      "the page as it starts, at the page's size",
      {},
      AT_PAGE_SIZE,
      ["79:83053a99", "79:e36f9773", "79:9a16663b", "79:f7220419"],
      [forward("4.0 m behind", "28.1", "9.1"), strip("47.8", "8.0"), S0, W0],
    ],
    [
      "the page as it starts, at the page's size, in dark",
      {},
      { width: BEAM_PAGE, theme: DARK },
      ["79:c8ad8537", "79:afd02485", "79:a1f8d446", "79:d72a4185"],
      [forward("4.0 m behind", "28.1", "9.1"), strip("47.8", "8.0"), S0, W0],
    ],
    [
      "the page as it starts",
      {},
      {},
      ["79:0f6acdc7", "79:4d91b175", "79:a6a8cb50", "79:0af5dcb3"],
      [F0, D0, S0, W0],
    ],
    [
      "the page as it starts, in sv-SE",
      {},
      SV,
      ["79:0f6acdc7", "79:4d91b175", "79:a6a8cb50", "79:0af5dcb3"],
      [
        forward("4,0 m behind", "28,3", "8,4"),
        strip("47,3", "8,1"),
        band("18,0", "28,3", "135"),
        band("18,0", "28,3", "270"),
      ],
    ],
    [
      "a range of 5 m: no beam reaches the bottom",
      { atr: "5" },
      {},
      ["48:f074103e", "48:7fe13456", "48:fb04a01e", "48:0ecccd67"],
      [NONE_F, NONE, NONE, NONE],
    ],
    [
      "a range of 20 m: a mark every 5 m",
      { atr: "20" },
      {},
      ["89:ec41a15d", "89:26f68f45", "83:949ecd8d", "83:470a6ecc"],
      [forward("3.5 m behind", "17.3", "5.6"), strip("34.6", "5.4"), NONE, NONE],
    ],
    [
      "a range of 21 m: a mark every 10 m",
      { atr: "21" },
      {},
      ["69:22f18e63", "69:0fd8230f", "69:b1db3545", "69:cd488fe1"],
      [
        forward("3.6 m behind", "18.2", "5.9"),
        strip("36.3", "5.7"),
        band("18.0", "18.5", "135"),
        band("18.0", "18.5", "270"),
      ],
    ],
    [
      "a range of 50 m: a mark every 10 m",
      { atr: "50" },
      {},
      ["99:491cef2f", "99:ba6e5745", "99:4940aad6", "99:342bf4bb"],
      [
        forward("2.9 m behind", "47.1", "14.0"),
        strip("48.1", "5.8"),
        band("18.0", "49.0", "135"),
        band("18.0", "49.0", "270"),
      ],
    ],
    [
      "a range of 51 m: a mark every 20 m",
      { atr: "51" },
      {},
      ["69:eb9d2a16", "69:c7dcd68b", "69:74d6ad40", "69:3abed6c4"],
      [
        forward("2.9 m behind", "48.1", "14.3"),
        strip("45.1", "5.9"),
        band("18.0", "50.0", "135"),
        band("18.0", "50.0", "270"),
      ],
    ],
    [
      "a range of 100 m",
      { atr: "100" },
      {},
      ["99:7c5a51da", "99:97b69521", "99:13165b87", "99:c0b94de6"],
      [
        forward("1.9 m behind", "98.1", "28.1"),
        strip("42.3", "3.8"),
        band("18.0", "51.4", "135"),
        band("18.0", "51.4", "270"),
      ],
    ],
    [
      "a narrow fan aimed 10 degrees down: the Forward beam lands ahead only",
      { atfa: "10", atw: "60" },
      {},
      ["79:2792a9e8", "79:6ab8a85b", "79:772a2af6", "79:948e1de6"],
      [
        forward("12.1 m ahead", "28.3", "8.4"),
        strip("10.4", "3.5"),
        band("18.0", "28.3", "60"),
        band("18.0", "28.3", "120"),
      ],
    ],
    [
      "a forward mount angle of 90 degrees",
      { atfa: "90" },
      {},
      ["79:1a250625", "79:4d91b175", "79:a6a8cb50", "79:0af5dcb3"],
      [forward("23.7 m behind", "23.7", "7.7"), D0, S0, W0],
    ],
    [
      "a forward mount angle of 0 degrees",
      { atfa: "0" },
      {},
      ["79:601d067e", "79:4d91b175", "79:a6a8cb50", "79:0af5dcb3"],
      [forward("5.2 m ahead", "28.3", "8.4"), D0, S0, W0],
    ],
    [
      "a flat mount angle of 5 degrees",
      { atsb: "5" },
      {},
      ["79:0f6acdc7", "79:4d91b175", "73:bd3ae3d5", "73:695a4817"],
      [F0, D0, NONE, NONE],
    ],
    [
      "a flat mount angle of 60 degrees",
      { atsb: "60" },
      {},
      ["79:0f6acdc7", "79:4d91b175", "79:c1b1fc44", "79:2a7e9907"],
      [F0, D0, band("3.8", "8.1", "135"), band("3.8", "8.1", "270")],
    ],
    [
      "a flat mount angle of 0 degrees",
      { atsb: "0" },
      {},
      ["79:0f6acdc7", "79:4d91b175", "73:8f5935f3", "73:bcea2a68"],
      [F0, D0, NONE, NONE],
    ],
    [
      "a flat mount angle of 9 degrees: the top of the slice is level",
      { atsb: "9" },
      {},
      ["79:0f6acdc7", "79:4d91b175", "73:31e31d2b", "73:eac9d3f8"],
      [F0, D0, NONE, NONE],
    ],
    [
      "a fan of 180 degrees",
      { atw: "180" },
      {},
      ["79:f198f692", "79:95fcabaa", "79:d9a1ece1", "79:93c230ad"],
      [
        forward("9.8 m behind", "28.3", "8.4"),
        strip("56.5", "8.1"),
        band("18.0", "28.3", "180"),
        band("18.0", "28.3", "360"),
      ],
    ],
    [
      "a fan of 60 degrees",
      { atw: "60" },
      {},
      ["79:ff358f79", "79:6ab8a85b", "79:772a2af6", "79:948e1de6"],
      [
        forward("2.9 m ahead", "28.3", "8.4"),
        strip("10.4", "3.5"),
        band("18.0", "28.3", "60"),
        band("18.0", "28.3", "120"),
      ],
    ],
    [
      "a fan of 90 degrees",
      { atw: "90" },
      {},
      ["79:93cb3a54", "79:b6ebb3fa", "79:c961d945", "79:d9a1ece1"],
      [
        forward("0.58 m ahead", "28.3", "8.4"),
        strip("19.6", "3.5"),
        band("18.0", "28.3", "90"),
        band("18.0", "28.3", "180"),
      ],
    ],
    [
      "a fan of 40 degrees",
      { atw: "40" },
      {},
      ["79:884b4aa0", "79:683965c9", "79:c63813d2", "79:1832eb4f"],
      [
        forward("5.2 m ahead", "21.3", "6.1"),
        strip("5.8", "1.2"),
        band("18.0", "28.3", "40"),
        band("18.0", "28.3", "80"),
      ],
    ],
    [
      "a thickness of 45 degrees",
      { att: "45" },
      {},
      ["79:4b06192b", "79:ad93448d", "79:bfb5a0f1", "79:f972eb25"],
      [
        forward("4.0 m behind", "28.3", "20.9"),
        strip("47.3", "19.6"),
        band("10.9", "28.3", "135"),
        band("10.9", "28.3", "270"),
      ],
    ],
    [
      "a thickness of 2 degrees",
      { att: "2" },
      {},
      ["79:a397c861", "73:213b0967", "79:aa30a107", "79:beeaba98"],
      [
        forward("12.1 m ahead", "28.3", "0.54"),
        NONE,
        band("26.1", "28.3", "135"),
        band("26.1", "28.3", "270"),
      ],
    ],
    [
      "a thickness of 89.9 degrees",
      { att: "89.9" },
      {},
      ["79:b6c39fad", "79:d0d3c0a4", "79:f9b231ed", "79:8fafcc2b"],
      [
        forward("4.0 m behind", "28.3", "41.7"),
        strip("47.3", "40.4"),
        band("4.7", "28.3", "135"),
        band("4.7", "28.3", "270"),
      ],
    ],
    [
      "a transducer at the surface",
      { zt: "0" },
      {},
      ["79:a36d232e", "79:a994e1bd", "79:8577e60c", "79:c2cf0e65"],
      [F0, D0, S0, W0],
    ],
    [
      "a transducer 3 m down",
      { zt: "3" },
      {},
      ["79:33f74082", "79:9c55af9b", "79:365139e1", "79:364abea4"],
      [F0, D0, S0, W0],
    ],
    [
      "a depth of 3 m",
      { dep: "3" },
      {},
      ["79:aac0fc6f", "79:984a7a7a", "79:c4080c19", "79:ca5e9ecc"],
      [
        forward("0.58 m behind", "29.4", "8.4"),
        strip("12.7", "1.2"),
        band("5.4", "15.4", "135"),
        band("5.4", "15.4", "270"),
      ],
    ],
    [
      "a depth of 29 m",
      { dep: "29" },
      {},
      ["79:fad34192", "79:fc509aa8", "73:94c2ee64", "73:aad18589"],
      [forward("7.5 m behind", "7.5", "8.4"), strip("15.0", "8.1"), NONE, NONE],
    ],
    [
      "a depth of 30 m: the depth is the range",
      { dep: "30" },
      {},
      ["73:5a7c2411", "73:8372485e", "73:4029eabc", "73:bfec511a"],
      [NONE_F, NONE, NONE, NONE],
    ],
    [
      "a depth of 31.5 m: the last depth whose bottom line is drawn",
      { dep: "31.5" },
      {},
      ["73:3d618431", "73:dc055583", "73:9b6875d4", "73:9e9652ba"],
      [NONE_F, NONE, NONE, NONE],
    ],
    [
      "a depth of 31.6 m: no bottom line",
      { dep: "31.6" },
      {},
      ["68:0d973767", "68:39e0983f", "68:9923d5c2", "68:228a2e88"],
      [NONE_F, NONE, NONE, NONE],
    ],
    [
      "a depth of 0.1 m under a transducer 0.3 m down, a range of 1 m",
      { dep: "0.1", zt: "0.3", atr: "1" },
      {},
      ["49:a61dd463", "49:e1e52f6d", "49:46f422b9", "49:8bda8b31"],
      [
        forward("0.10 m ahead", "0.98", "0.27"),
        strip("0.42", "0.04"),
        band("0.18", "0.51", "135"),
        band("0.18", "0.51", "270"),
      ],
    ],
    [
      "a fan of 60 degrees, at the page's size",
      { atw: "60" },
      AT_PAGE_SIZE,
      ["79:a8e96325", "79:122de15d", "79:5893a2c0", "79:bd193d4f"],
      [
        forward("2.7 m ahead", "28.1", "9.1"),
        strip("11.1", "3.4"),
        band("18.0", "28.3", "60"),
        band("18.0", "28.3", "120"),
      ],
    ],
    [
      "a flat mount angle of 60 degrees and a range of 12 m, at the page's size",
      { atsb: "60", atr: "12" },
      AT_PAGE_SIZE,
      ["69:0c275c72", "69:0175136f", "69:2f0f9fbb", "69:87d26fd1"],
      [
        forward("4.1 m behind", "6.6", "3.6"),
        strip("13.1", "3.6"),
        band("3.8", "6.6", "135"),
        band("3.8", "6.6", "270"),
      ],
    ],
    [
      "a thickness of 0.5 degrees, at the page's size: the Down beam falls between the pixels",
      { att: "0.5" },
      AT_PAGE_SIZE,
      ["79:a91e1684", "73:605f22c9", "79:f01ce246", "79:9dc6c0c4"],
      [
        forward("9.7 m ahead", "28.1", "0.12"),
        NONE,
        band("27.1", "27.9", "135"),
        band("27.1", "27.9", "270"),
      ],
    ],
    [
      "one transducer: no wide beam",
      { "at-n": "1" },
      {},
      ["79:0f6acdc7", "79:4d91b175", "79:a6a8cb50", NOTHING],
      [F0, D0, S0, NOT],
    ],
    [
      "another brand without a wide mode",
      { "live-p": "lvs34" },
      {},
      ["79:0f6acdc7", "79:4d91b175", "79:a6a8cb50", NOTHING],
      [F0, D0, S0, NOT],
    ],
    [
      "a range that is wrong: nothing is drawn or written",
      { atr: "0" },
      {},
      [NOTHING, NOTHING, NOTHING, NOTHING],
      [NOT, NOT, NOT, NOT],
    ],
    [
      "a depth that is wrong: nothing is drawn or written",
      { dep: "" },
      {},
      [NOTHING, NOTHING, NOTHING, NOTHING],
      [NOT, NOT, NOT, NOT],
    ],
    [
      "odd numbers all round",
      ODD,
      {},
      ["69:2ccd964c", "69:64bc8fe7", "69:f54e68eb", "69:5bc522e1"],
      [
        forward("0.46 m ahead", "22.3", "4.9"),
        strip("21.0", "2.7"),
        band("12.4", "22.5", "111"),
        band("12.4", "22.5", "222"),
      ],
    ],
    [
      "odd numbers all round, at the page's size",
      ODD,
      AT_PAGE_SIZE,
      ["69:83f512ad", "69:f3f60ce3", "69:37bf4192", "69:c664628f"],
      [
        forward("0.31 m behind", "22.4", "5.5"),
        strip("21.0", "2.7"),
        band("12.4", "22.5", "111"),
        band("12.4", "22.5", "222"),
      ],
    ],
    [
      "a depth of 0.1 m under a transducer 0.3 m down, a range of 1 m, at the page's size",
      TINY,
      AT_PAGE_SIZE,
      ["49:9d99bb1b", "49:8a6377db", "49:f9f69e56", "49:8447bbd2"],
      [
        forward("0.04 m behind", "0.99", "0.30"),
        strip("0.47", "0.08"),
        band("0.18", "0.51", "135"),
        band("0.18", "0.51", "270"),
      ],
    ],
    // The rows after this comment were added after the module was written, for variants of it that the other rows could not tell.
    [
      "a range of 26 m and a tilt of 5.6615767652203°: a pixel on the edge of the Forward beam",
      { atr: "26", att: "5.6615767652203" },
      {},
      ["69:a47c660b", "69:8b64f019", "69:226a4a3b", "69:40e7da91"],
      [
        forward("3.5 m behind", "23.5", "1.0"),
        strip("47.0", "1.0"),
        band("23.8", "24.0", "135"),
        band("23.8", "24.0", "270"),
      ],
    ],
    [
      "a range of 26 m and a tilt of 86.98537414995465°: a pixel on the edge of the Down beam",
      { atr: "26", att: "86.98537414995465" },
      {},
      ["69:3b229987", "69:a76d5600", "69:e14d972b", "69:c679c282"],
      [
        forward("3.5 m behind", "23.5", "34.7"),
        strip("47.0", "35.0"),
        band("5.0", "24.0", "135"),
        band("5.0", "24.0", "270"),
      ],
    ],
    [
      "a range of 26 m, a depth of 10 m, a bottom slope of 60°",
      { atr: "26", zt: "0.5", atsb: "60", att: "30", dep: "10" },
      {},
      ["69:aadaf2e2", "69:0268593e", "69:629ad1bd", "69:a9c254bc"],
      [
        forward("3.5 m behind", "23.5", "12.4"),
        strip("47.0", "13.0"),
        band("2.7", "10.0", "135"),
        band("2.7", "10.0", "270"),
      ],
    ],
    [
      "a range of 29 m, a depth of 10 m, a bottom slope of 30°, at the page's size",
      { atr: "29", zt: "0.5", atsb: "30", att: "30", dep: "10" },
      AT_PAGE_SIZE,
      ["69:f8dc686e", "69:8ad79ee6", "69:53e627bb", "69:4764a609"],
      [
        forward("4.1 m behind", "27.1", "14.8"),
        strip("48.3", "13.8"),
        band("10.0", "27.2", "135"),
        band("10.0", "27.2", "270"),
      ],
    ],
    [
      "a depth of 9.5 m, a transducer 0.5 m down: pixels on the surface and on the bottom",
      { atr: "26", zt: "0.5", dep: "9.5" },
      {},
      ["69:63b418d3", "69:0013ae46", "69:b835f347", "69:09b4a5b4"],
      [
        forward("3.5 m behind", "23.5", "7.3"),
        strip("45.0", "7.0"),
        band("17.1", "24.2", "135"),
        band("17.1", "24.2", "270"),
      ],
    ],
    [
      "the same with a fan of 180° and no bottom slope",
      { atr: "26", zt: "0.5", dep: "9.5", atw: "180", atsb: "0" },
      {},
      ["69:a8a9de0e", "69:9caedaf3", "63:06a76e21", "63:e531a6ca"],
      [forward("9.5 m behind", "23.5", "7.3"), strip("47.0", "7.0"), NONE, NONE],
    ],
    [
      "colours that round up: a black background, a beam and a footprint of #020000",
      {},
      { theme: ROUNDS_UP },
      ["79:6f554df5", "79:fcbed397", "79:5f5ca932", "79:557960ea"],
      [F0, D0, S0, W0],
    ],
    [
      "a thickness of 45°, a range of 15 m, a transducer at the surface, a beam picture 61 px wide",
      { att: "45", atr: "15", zt: "0" },
      { width: 61 },
      ["79:bf88a732", "79:69fc6462", "79:176d306e", "79:7a5dafdd"],
      [
        forward("4.0 m behind", "10.8", "11.1"),
        strip("21.5", "11.3"),
        band("10.9", "11.2", "135"),
        band("10.9", "11.2", "270"),
      ],
    ],
    [
      "a forward mount angle of 90°, a range of 120 m, a beam picture 61 px wide",
      { atw: "20", atsb: "60", atfa: "90", atr: "120" },
      { width: 61 },
      ["109:2ad181d9", "109:a891f089", "109:fce9b666", "109:fce9b666"],
      [
        forward("0.00 m ahead", "0.00", "2.3"),
        strip("0.00", "0.00"),
        band("3.8", "8.1", "20"),
        band("3.8", "8.1", "40"),
      ],
    ],
    [
      "a range of 30 m over a depth of 29.99 m, a mount angle of 85° and a thickness of 30°, at the page's size",
      { atr: "30", dep: "29.99", zt: "0", atsb: "85", att: "30" },
      AT_PAGE_SIZE,
      ["79:3236f8a1", "79:d7723eb8", "79:89615f97", "79:59a3ca6a"],
      [
        forward("0.65 m behind", "0.65", "1.4"),
        strip("1.3", "1.3"),
        band("-5.3", "0.77", "135"),
        band("-5.3", "0.77", "270"),
      ],
    ],
    [
      "a fan of 5.5°: the width in the text of the wide beam lies on a half degree",
      { atw: "5.5" },
      {},
      ["79:c7801747", "73:807fb092", "79:a547cd5e", "79:6bbed205"],
      [
        forward("9.8 m ahead", "11.0", "3.8"),
        NONE,
        band("18.0", "28.3", "5"),
        band("18.0", "28.3", "11"),
      ],
    ],
    [
      "a fan of 106.5°: the width in the text of the flat beam lies on a half degree",
      { atw: "106.5" },
      {},
      ["79:851befc0", "79:feb11939", "79:69538364", "79:81bfdb81"],
      [
        forward("0.58 m behind", "28.3", "8.4"),
        strip("26.5", "3.5"),
        band("18.0", "28.3", "107"),
        band("18.0", "28.3", "213"),
      ],
    ],
    [
      "a fan of 2.75°: the width in the text of the wide beam lies on a half degree",
      { atw: "2.75" },
      {},
      ["79:c40e9276", "73:807fb092", "79:1cf192a3", "79:a547cd5e"],
      [
        forward("9.8 m ahead", "9.8", "3.8"),
        NONE,
        band("18.0", "28.3", "3"),
        band("18.0", "28.3", "5"),
      ],
    ],
    [
      "a fan of 51.25°: the width in the text of the wide beam lies on a half degree",
      { atw: "51.25" },
      {},
      ["79:db1e5650", "79:ab44f2b5", "79:0213e1e2", "79:44fc3473"],
      [
        forward("4.0 m ahead", "28.3", "8.4"),
        strip("8.1", "1.2"),
        band("18.0", "28.3", "51"),
        band("18.0", "28.3", "103"),
      ],
    ],
  ];

  it.each(cases)("%s", (_what, fields, setup, logs, lines) => {
    const input = inputFor(fields, setup);
    const width = setup.width ?? BEAM_STAND_IN;
    expect(BEAM_MODES.map((mode) => logSum(beamDrawn(mode, input, width)))).toEqual(logs);
    expect(BEAM_MODES.map((mode) => beamText(mode, input, width))).toEqual(lines);
  });

  it("writes one element for each beam, and none for the wide beam of one transducer", () => {
    const input = inputFor();
    expect(beamView("F", BEAM_PAGE, input)).toEqual({
      "bvF-t": {
        text: "Hits the bottom from 4.0 m behind to 28.1 m ahead, up to 9.1 m wide. Top-view width scaled to fit.",
      },
    });
    expect(Object.keys(beamView("W", BEAM_PAGE, input))).toEqual(["bvW-t"]);
    expect(beamView("W", BEAM_PAGE, inputFor({ "at-n": "1" }))).toEqual({});
    expect(beamView("S", BEAM_PAGE, inputFor({ atr: "0" }))).toEqual({});
  });

  it("draws the Forward beam of the page as it starts, entry for entry, up to its marks", () => {
    const log = beamDrawn("F", inputFor(), BEAM_PAGE);
    expect(log.slice(0, 36)).toEqual([
      ["#height", 141],
      ["=fillStyle", "#ffffff"],
      ["fillRect", 0, 0, 240, 141],
      ["createImageData", 240, 141, { $: "ImageData", w: 240, h: 141, fnv1a: "cd9c44c5" }],
      ["putImageData", { $: "ImageData", w: 240, h: 141, fnv1a: "78acede9" }, 0, 0],
      ["=lineWidth", 1.5],
      ["=strokeStyle", "#2f6f86"],
      ["beginPath"],
      ["moveTo", 0, 1.9333333333333333],
      ["lineTo", 240, 1.9333333333333333],
      ["stroke"],
      ["=strokeStyle", "#56645f"],
      ["beginPath"],
      ["moveTo", 0, 42.53333333333333],
      ["lineTo", 240, 42.53333333333333],
      ["stroke"],
      ["=strokeStyle", "#9a5a00"],
      ["=lineWidth", 4],
      ["beginPath"],
      ["moveTo", 104.5, 42.53333333333333],
      ["lineTo", 228.5, 42.53333333333333],
      ["stroke"],
      ["=fillStyle", "#14201e"],
      ["beginPath"],
      ["arc", 120, 3.8666666666666667, 3, 0, 7],
      ["fill"],
      ["beginPath"],
      ["arc", 120, 97.96574384705775, 3, 0, 7],
      ["fill"],
      ["=font", `10px ${FONT_BODY}`],
      ["=fillStyle", "#56645f"],
      ["=textAlign", "left"],
      ["fillText", "side view", 4, 10],
      ["fillText", "top view", 4, 67],
      ["=textAlign", "center"],
      ["=font", `10px ${FONT_DATA}`],
    ]);
    expect(logTexts(log)).toEqual([
      "side view@4@10",
      "top view@4@67",
      "-30@4@140",
      "-20@42.666666666666664@140",
      "-10@81.33333333333333@140",
      "0@120@140",
      "10@158.66666666666666@140",
      "20@197.33333333333334@140",
      "30@236@140",
      "ahead →@238@67",
    ]);
  });

  it("tells a canvas that is all background as the earlier lines read it back (line 868)", () => {
    // What the earlier `getImageData` gave for the Forward beam's canvas, just filled, in light and in dark.
    expect(filledDigest(240, 141, "#ffffff")).toBe("5fa34205");
    expect(filledDigest(240, 141, "#162120")).toBe("28ab94c5");
    // And the empty picture the port asks for in its place.
    expect(filledDigest(240, 141, null)).toBe("cd9c44c5");
  });

  it("sets the height of a beam's canvas only when it is not the height it needs", () => {
    const input = inputFor();
    const heights = [68, 109, 109, 109];
    const again = BEAM_MODES.map((mode, i) => beamDrawn(mode, input, BEAM_STAND_IN, heights[i]));
    expect(again.map(logSum)).toEqual(["78:56be03df", "78:9afc91f1", "78:14df004c", "78:a9756a87"]);
    expect(again.map((log) => log[0])).toEqual([
      ["=fillStyle", "#ffffff"],
      ["=fillStyle", "#ffffff"],
      ["=fillStyle", "#ffffff"],
      ["=fillStyle", "#ffffff"],
    ]);
    const first = BEAM_MODES.map((mode) => beamDrawn(mode, input));
    expect(first.map((log) => log[0])).toEqual(heights.map((height) => ["#height", height]));
    expect(again).toEqual(first.map((log) => log.slice(1)));
  });

  it("sets fonts without a family when the style names none, as the earlier page does", () => {
    const { "--font-data": _data, "--font-body": _body, ...colours } = LIGHT;
    const input = inputFor({}, { theme: colours });
    const logs = BEAM_MODES.map((mode) => beamDrawn(mode, input));
    expect(logs.map(logSum)).toEqual(["79:4a84d779", "79:eee5eadb", "79:e129fc86", "79:dfbb1535"]);
    const fonts = new Set(logs.flat().flatMap((entry) => (entry[0] === "=font" ? [entry[1]] : [])));
    expect([...fonts]).toEqual(["10px "]);
  });

  describe("whether a point is inside a beam (beamMember, lines 850 to 857)", () => {
    const r = (a: number): number => (a * Math.PI) / 180;

    /** The beam of the page as it starts, and three that differ in one angle, in degrees. */
    const beams = {
      start: { H: 10, R: 30, zt: 0.5, fa: r(45), hw: r(67.5), ht: r(9), sb: r(20) },
      level: { H: 10, R: 30, zt: 0.5, fa: r(45), hw: r(67.5), ht: r(9), sb: r(5) },
      half: { H: 10, R: 30, zt: 0.5, fa: r(45), hw: r(45), ht: r(9), sb: r(20) },
      full: { H: 10, R: 30, zt: 0.5, fa: r(45), hw: r(90), ht: r(9), sb: r(20) },
    } as const;

    /** The beam, the mode, the point ahead, to the side and down from the transducer, and whether it is inside. */
    type Row = [
      beam: keyof typeof beams,
      mode: BeamMode,
      x: number,
      y: number,
      z: number,
      inside: boolean,
    ];
    const cases: Row[] = [
      // The range, the surface and the bottom, which every mode has.
      ["level", "S", 30, 0, 0, true],
      ["level", "S", 30.001, 0, 0, false],
      ["level", "S", 0, 30, 0, false],
      ["start", "D", 0, 0, 10, true],
      ["start", "D", 0, 0, 10.001, false],
      ["start", "D", 0, 0, -0.5, false],
      ["start", "F", 0, 0, -0.5, false],
      ["start", "F", 0, 0, -0.501, false],
      ["start", "F", 29, 0, 9, false],
      // Forward: on the transducer, off to the side of the slice, and the fan from 45 - 67.5 to 45 + 67.5 degrees below ahead.
      ["start", "F", 0, 0, 0, true],
      ["start", "F", 0, 1, 0, true],
      ["start", "F", 0.0000005, 0, 0, true],
      ["start", "F", 10, 1.5, 0, true],
      ["start", "F", 10, 1.6, 0, false],
      ["start", "F", 10, -1.5, 0, true],
      ["start", "F", 10, -1.6, 0, false],
      ["start", "F", 10, 0, 5, true],
      ["start", "F", 10, 0, -0.4, true],
      ["start", "F", 0, 0, 5, true],
      ["start", "F", -2, 0, 5, true],
      ["start", "F", -2.1, 0, 5, false],
      ["start", "F", -5, 0, 5, false],
      ["half", "F", 5, 0, 0, true],
      ["half", "F", 5, 0, -0.1, false],
      ["half", "F", 0, 0, 5, true],
      ["half", "F", -0.001, 0, 5, false],
      // Down: on the transducer, ahead of the slice, and the fan to each side, below the transducer only.
      ["start", "D", 0, 0, 0, true],
      ["start", "D", 1, 0, 0, true],
      ["start", "D", 0, 0.0000005, 0, true],
      ["start", "D", 0.79, 0, 5, true],
      ["start", "D", 0.8, 0, 5, false],
      ["start", "D", -0.79, 0, 5, true],
      ["start", "D", -0.8, 0, 5, false],
      ["start", "D", 0, 12, 5, true],
      ["start", "D", 0, 12.1, 5, false],
      ["start", "D", 0, -12, 5, true],
      ["start", "D", 0, -12.1, 5, false],
      ["start", "D", 0, 5, 0, false],
      ["start", "D", 0, 5, -0.2, false],
      ["half", "D", 0, 5, 5, true],
      ["half", "D", 0, 5.001, 5, false],
      ["full", "D", 0, 5, 0, false],
      ["full", "D", 0, 5, 0.001, true],
      // Flat and wide: on the transducer, the fan to each side, twice as wide in the wide mode, and the slice from 11 to 29 degrees down.
      ["start", "S", 0, 0, 5, false],
      ["start", "W", 0, 0, 5, false],
      ["start", "S", 0.0000005, 0, 0, false],
      ["start", "S", 10, 0, 3.6, true],
      ["start", "S", 10, 0, 1.9, false],
      ["start", "S", 10, 0, 2, true],
      ["start", "S", 10, 0, 5.5, true],
      ["start", "S", 10, 0, 5.6, false],
      ["start", "S", 4, 9.6, 3.6, true],
      ["start", "S", 4, 9.7, 3.6, false],
      ["start", "S", 4, -9.6, 3.6, true],
      ["start", "S", 4, -9.7, 3.6, false],
      ["start", "W", 4, 9.7, 3.6, true],
      ["start", "W", -5, 4.9, 2.5, false],
      ["start", "W", -5, 5.1, 2.5, true],
      ["start", "W", -5, -4.9, 2.5, false],
      ["start", "S", -5, 0.1, 2.5, false],
      ["full", "S", -0.001, 5, 1.8, false],
      ["full", "S", 0.001, 5, 1.8, true],
      ["full", "W", -5, 0, 1.8, true],
      ["full", "W", -5, -0.001, 1.8, true],
      ["half", "W", -0.001, 5, 1.8, false],
      ["half", "W", 0.001, 5, 1.8, true],
      ["level", "S", 10, 0, 0, true],
      ["level", "S", 10, 0, -0.4, true],
      ["level", "S", 10, 0, 2.4, true],
      ["level", "S", 10, 0, 2.5, false],
      // A point within a thousandth of a millimetre of the transducer's axis, just outside it, and on the line between.
      ["start", "F", 0.00000095, 1, 0, true],
      ["start", "F", 0.000001, 1, 0, false],
      ["start", "F", 0.00000105, 1, 0, false],
      ["start", "D", 1, 0.00000095, 0, true],
      ["start", "D", 1, 0.000001, 0, false],
      ["start", "D", 1, 0.00000105, 0, false],
      ["level", "S", 0.00000095, 0, 0, false],
      ["level", "S", 0.000001, 0, 0, true],
      ["level", "S", 0.00000105, 0, 0, true],
    ];

    it.each(cases)("%s, %s: (%d, %d, %d) is inside: %s", (beam, mode, x, y, z, inside) => {
      expect(beamMember(mode, x, y, z, beams[beam])).toBe(inside);
    });
  });
});

describe("the pictures at the page's own sizes, other ranges and fans (lines 776 to 916)", () => {
  /**
   * The fields changed, the log of each of the four screens at the page's size (`PAGE`),
   * and of each of the four beams at the page's width (`BEAM_PAGE`), as `logSum` gives them.
   * The fixtures record the page at a range of 30 m (and 0.5 m) only, and the rows at the
   * stand-in sizes cannot tell two orders of the same arithmetic apart, because the scales
   * of the pictures agree there: these rows were added after the module was written, with
   * the digests of the earlier lines' run, for the orders of arithmetic that only a page
   * size and a range other than the recorded ones tell apart.
   */
  type Row = [
    fields: RawFields,
    screens: readonly [scrF: string, scrD: string, scrS: string, scrW: string],
    beams: readonly [bvF: string, bvD: string, bvS: string, bvW: string],
  ];
  const cases: Row[] = [
    [
      { atr: "5", dep: "2" },
      ["29:1d23cff3", "30:601b5b3c", "34:afc44724", "34:5180364e"],
      ["59:a08c4f6b", "59:2edbbd14", "59:aad2056e", "59:9b9b87c2"],
    ],
    [
      { atr: "7", dep: "4" },
      ["29:8be36af7", "30:da04cdee", "27:9d067008", "27:8c7d458f"],
      ["59:6341712c", "59:e5843559", "53:913c3773", "53:9a1c2e7a"],
    ],
    [
      { atr: "10", dep: "7" },
      ["39:95386618", "30:641a97ce", "37:ee3fb599", "37:f0bfa1b4"],
      ["69:1fb2e1ad", "69:edbcd6f1", "63:e8961a2d", "63:c92a53d6"],
    ],
    [
      { atr: "15" },
      ["49:89ffadab", "30:d28f5799", "47:aca9c4f0", "47:18a6fbe8"],
      ["79:8b79e6d6", "79:c38a28fa", "73:7e4afee2", "73:ed0e7dba"],
    ],
    [
      { atr: "20" },
      ["59:e4eeef37", "30:8969cb7f", "57:76a79449", "57:d12328e2"],
      ["89:52a00d67", "89:06ac2c4b", "83:770d5977", "83:e1899633"],
    ],
    [
      { atr: "25" },
      ["39:05dd059b", "30:0e8cfba3", "44:ad70b967", "44:51e6eed5"],
      ["69:9c6b9fb5", "69:f8657882", "69:20e566b1", "69:8146cbb2"],
    ],
    [
      { atr: "40" },
      ["59:72aecd6c", "30:0fa13ebe", "64:61599d0d", "64:c30b2a96"],
      ["89:5bdc9025", "89:3289f6ab", "89:ff2a9d7d", "89:8ccdd7bf"],
    ],
    [
      { atr: "60" },
      ["49:07271e61", "30:0c899257", "54:5bf8780c", "54:b651dcb4"],
      ["79:f6431ea8", "79:541d69d4", "79:33c06d40", "79:9146b36e"],
    ],
    [
      { atr: "150" },
      ["89:6ea75586", "30:e1b091f9", "94:1c213932", "94:4198db4c"],
      ["119:b36e5206", "119:dbbfcf0a", "119:11fa039e", "119:45c1e353"],
    ],
    [
      { atr: "5", atw: "90", dep: "2" },
      ["29:1d23cff3", "30:a7977a50", "34:4a7ff986", "34:c0c27497"],
      ["59:69920304", "59:08727258", "59:487f6876", "59:9d302b59"],
    ],
    [
      { atr: "7", atw: "90", dep: "4" },
      ["29:8be36af7", "30:6fa21b6c", "27:f9a70d93", "27:35ea1b0c"],
      ["59:3f6087c1", "59:62620867", "53:81d637e6", "53:7882407e"],
    ],
    [
      { atr: "10", atw: "90", dep: "7" },
      ["39:95386618", "30:39d68aee", "37:b07e2219", "37:670b18bc"],
      ["69:d263df62", "69:c8465d74", "63:ddb31e5c", "63:47a461bf"],
    ],
    [
      { atr: "15", atw: "90" },
      ["49:89ffadab", "30:cd12c126", "47:93af2bc3", "47:cc721a3f"],
      ["79:b1731f46", "79:8c50c209", "73:cfcc962d", "73:7ed285cc"],
    ],
    [
      { atr: "20", atw: "90" },
      ["59:e4eeef37", "30:baf998f9", "57:20793bf3", "57:e0e1895e"],
      ["89:fdefdedb", "89:69761bd9", "83:4b3755c3", "83:297d498b"],
    ],
    [
      { atr: "25", atw: "90" },
      ["39:05dd059b", "30:412976e6", "44:423af6b5", "44:a6e8a32d"],
      ["69:cb18f21f", "69:2c398bb0", "69:c5e492cf", "69:ef8bd8d1"],
    ],
    [
      { atr: "40", atw: "90" },
      ["59:72aecd6c", "30:c66e3d86", "64:a90d4e0a", "64:e55087b9"],
      ["89:d66f9295", "89:dba0d37b", "89:b90805e2", "89:3fa17ca6"],
    ],
    [
      { atr: "60", atw: "90" },
      ["49:07271e61", "30:8d649d03", "54:b0e9e535", "54:b5e4be24"],
      ["79:36701f82", "79:d2edce7b", "79:95155c92", "79:35873ef0"],
    ],
    [
      { atr: "150", atw: "90" },
      ["89:6ea75586", "30:05c81ed1", "94:497f86a0", "94:c918b02d"],
      ["119:08c5da45", "119:70a23826", "119:fdbf627b", "119:1570dd96"],
    ],
    [
      { atr: "5", atw: "170", dep: "2" },
      ["29:1d23cff3", "30:65170fb4", "34:3cb63a7e", "34:ccfabba8"],
      ["59:bfb63796", "59:3cd785fb", "59:b3b3bac2", "59:708da804"],
    ],
    [
      { atr: "7", atw: "170", dep: "4" },
      ["29:8be36af7", "30:aae369cf", "27:67da1228", "27:0b69539b"],
      ["59:b94c9589", "59:e6dea3ac", "53:d05e2608", "53:5d9656cf"],
    ],
    [
      { atr: "10", atw: "170", dep: "7" },
      ["39:95386618", "30:c2364030", "37:018b9fcd", "37:d38b528d"],
      ["69:89dff331", "69:cf38e2f2", "63:50beddfd", "63:79a9536a"],
    ],
    [
      { atr: "15", atw: "170" },
      ["49:89ffadab", "30:9fddcf18", "47:851f3827", "47:3f884289"],
      ["79:c665a8ca", "79:4889c8ef", "73:a18dc59a", "73:4e9e52d5"],
    ],
    [
      { atr: "20", atw: "170" },
      ["59:e4eeef37", "30:a6188e2b", "57:d8a6c862", "57:57037ea8"],
      ["89:9da10dca", "89:dff5c86e", "83:a4f26a06", "83:f1dccdaa"],
    ],
    [
      { atr: "25", atw: "170" },
      ["39:05dd059b", "30:e51622e6", "44:de336266", "44:4565de7f"],
      ["69:22d59906", "69:fd61c105", "69:81f95181", "69:d5bd23d1"],
    ],
    [
      { atr: "40", atw: "170" },
      ["59:72aecd6c", "30:d889005f", "64:e34fb03a", "64:d32a8ed7"],
      ["89:a4dc943d", "89:c01dcfce", "89:30118b64", "89:809273bf"],
    ],
    [
      { atr: "60", atw: "170" },
      ["49:07271e61", "30:0dffd90c", "54:c6916396", "54:ed5ff5e9"],
      ["79:41c91b9b", "79:e2c75ca8", "79:ea78ea9b", "79:7b10f10d"],
    ],
    [
      { atr: "150", atw: "170" },
      ["89:6ea75586", "30:cf6c28a6", "94:948d0fa7", "94:a8f924d7"],
      ["119:4a8f9e39", "119:265adf86", "119:26923963", "119:b3252a01"],
    ],
  ];

  it.each(cases)("%j", (fields, screens, beams) => {
    const input = inputFor(fields);
    expect(SCREENS.map((id) => logSum(drawn(id, input, PAGE[id])))).toEqual(screens);
    expect(BEAM_MODES.map((mode) => logSum(beamDrawn(mode, input, BEAM_PAGE)))).toEqual(beams);
  });

  /**
   * Ten sets of values of one or two decimals, with the fish in the slice, at the stand-in
   * or the page's size and at beam widths of 60, 61, 239, 240 and 333 px. Added after the
   * module was written and after a run of mutants of the order of its arithmetic (`a / b`
   * as `a * (1 / b)`, `a * b` as `a / (1 / b)`, regroupings of sums and products, `hypot`
   * as a root of squares): each set makes one of the 17 mutants that the other rows did
   * not tell apart draw or write another page. The digests are those of the earlier lines.
   */
  type Mixed = [
    fields: RawFields,
    size: "stand-in" | "page",
    width: number,
    screens: readonly [scrF: string, scrD: string, scrS: string, scrW: string],
    beams: readonly [bvF: string, bvD: string, bvS: string, bvW: string],
  ];
  const mixed: Mixed[] = [
    [
      {
        atw: "91.1",
        att: "57.5",
        atsb: "70.8",
        atfa: "77",
        atr: "179",
        dep: "25",
        zt: "0.5",
        fx: "1.6",
        fy: "3.9",
        fz: "22.7",
        sr: "35.3",
      },
      "stand-in",
      60,
      ["99:f8b74a1d", "30:d25677ae", "104:1666adb9", "104:eb1153df"],
      ["129:fb5b81f9", "129:48959bec", "129:b23192d9", "129:cce79442"],
    ],
    [
      {
        atw: "111.9",
        att: "38.8",
        atsb: "42.7",
        atfa: "27",
        atr: "79",
        dep: "8.8",
        zt: "1.1",
        fx: "28.8",
        fy: "3.1",
        fz: "3.8",
        sr: "38.5",
      },
      "page",
      239,
      ["49:39c85912", "30:5860ea7e", "54:b88eb3da", "54:b5869b06"],
      ["79:4a769ed9", "79:93f099b5", "79:fa388513", "79:3c78e2eb"],
    ],
    [
      {
        atw: "94.2",
        att: "33.5",
        atsb: "73",
        atfa: "88",
        atr: "148",
        dep: "29",
        zt: "0.5",
        fx: "6.1",
        fy: "0.3",
        fz: "15.3",
        sr: "88.2",
      },
      "page",
      333,
      ["89:ee1c1508", "30:a5304f24", "94:100f97da", "94:e3eed32e"],
      ["119:c53aae1e", "119:53c04e26", "119:f956a322", "119:0c32d7fc"],
    ],
    [
      {
        atw: "126.8",
        att: "49.8",
        atsb: "50",
        atfa: "30",
        atr: "48",
        dep: "9",
        zt: "2.7",
        fx: "24.7",
        fy: "8.7",
        fz: "4.4",
        sr: "69.8",
      },
      "page",
      240,
      ["59:df230647", "30:7449ee85", "64:d84a38bf", "64:ee951bb4"],
      ["89:ffc7ed8e", "89:0bed1f1a", "89:3923e28f", "89:668fd9a3"],
    ],
    [
      {
        atw: "141.5",
        att: "22.1",
        atsb: "70",
        atfa: "8",
        atr: "60",
        dep: "14",
        zt: "2.5",
        fx: "3",
        fy: "4.9",
        fz: "4.5",
        sr: "89.2",
      },
      "stand-in",
      61,
      ["49:d6bcee46", "30:196f9bfc", "54:93ed7453", "54:1881287f"],
      ["79:0e473dee", "79:07206e36", "79:3e2cf800", "79:742e837d"],
    ],
    [
      {
        atw: "174",
        att: "27.6",
        atsb: "53",
        atfa: "41",
        atr: "30",
        dep: "12",
        zt: "0.5",
        fx: "24.9",
        fy: "12.5",
        fz: "5.1",
        sr: "50.9",
      },
      "page",
      239,
      ["49:96f73074", "30:43352039", "54:6245ce45", "54:ba19df3b"],
      ["79:ad386998", "79:0fbd6785", "79:5b8c3499", "79:2352369a"],
    ],
    [
      {
        atw: "106.5",
        att: "14.1",
        atsb: "42",
        atfa: "6",
        atr: "30",
        dep: "20",
        zt: "0.8",
        fx: "33.6",
        fy: "10.8",
        fz: "15.9",
        sr: "29.7",
      },
      "page",
      239,
      ["49:97416676", "30:76e41f46", "54:c9535c50", "54:a7ac4ca0"],
      ["79:3138f1b0", "79:306b1308", "79:4493e556", "79:acfa0a1a"],
    ],
    [
      {
        atw: "148.4",
        att: "35.7",
        atsb: "66.2",
        atfa: "58",
        atr: "44",
        dep: "13",
        zt: "0.2",
        fx: "14.5",
        fy: "14.7",
        fz: "3",
        sr: "45.8",
      },
      "page",
      333,
      ["59:96eadfd9", "30:7a106ba7", "64:214cdaa1", "64:747f4249"],
      ["89:29f3d9f3", "89:b816b862", "89:a85942eb", "89:5285e249"],
    ],
    [
      {
        atw: "175.5",
        att: "45.7",
        atsb: "74.5",
        atfa: "59",
        atr: "161",
        dep: "4.3",
        zt: "1.7",
        fx: "10.2",
        fy: "6.6",
        fz: "4",
        sr: "47.4",
      },
      "page",
      240,
      ["99:4f3a18fc", "30:a6fa72e5", "104:e546d0b8", "104:f38811f0"],
      ["129:5a023948", "129:2ac2164d", "129:05bac373", "129:ef26bcac"],
    ],
    [
      {
        atw: "139",
        att: "14.5",
        atsb: "17.3",
        atfa: "30",
        atr: "30",
        dep: "26",
        zt: "0.5",
        fx: "23.7",
        fy: "10.2",
        fz: "11.6",
        sr: "5.4",
      },
      "page",
      333,
      ["49:216a1152", "30:c603e5fa", "47:e149baa8", "47:160083e5"],
      ["79:4e3892ff", "79:5b319c7a", "73:1a6a67d6", "73:dea78447"],
    ],
  ];

  it.each(mixed)("%j at %s size, beams %d px", (fields, size, width, screens, beams) => {
    const input = inputFor(fields);
    const sizes = size === "page" ? PAGE : STAND_IN;
    expect(SCREENS.map((id) => logSum(drawn(id, input, sizes[id])))).toEqual(screens);
    expect(BEAM_MODES.map((mode) => logSum(beamDrawn(mode, input, width)))).toEqual(beams);
  });
});

describe("the section as a whole (renderAT, lines 917 to 971)", () => {
  it("writes and draws nothing but the message while a setting is wrong, and everything once it is right again", () => {
    const wrong = inputFor({ zt: "-1" });
    expect(Object.keys(activeTargetView(wrong))).toEqual(["at-serr"]);
    expect(SCREENS.map((id) => logSum(drawn(id, wrong)))).toEqual([
      NOTHING,
      NOTHING,
      NOTHING,
      NOTHING,
    ]);
    expect(BEAM_MODES.map((mode) => logSum(beamDrawn(mode, wrong)))).toEqual([
      NOTHING,
      NOTHING,
      NOTHING,
      NOTHING,
    ]);
    expect(BEAM_MODES.map((mode) => beamText(mode, wrong))).toEqual([NOT, NOT, NOT, NOT]);
    const right = inputFor();
    expect(digestOf(activeTargetView(right))).toBe("a03f4288");
    expect(SCREENS.map((id) => logSum(drawn(id, right)))).toEqual([
      "49:76cce0ea",
      "30:44da7745",
      "54:af91187d",
      "54:718af11d",
    ]);
    expect(BEAM_MODES.map((mode) => logSum(beamDrawn(mode, right)))).toEqual([
      "79:0f6acdc7",
      "79:4d91b175",
      "79:a6a8cb50",
      "79:0af5dcb3",
    ]);
  });

  it("still writes the slice, the edge's error and where the bottom starts while the fish is wrong", () => {
    const view = viewOf({ fx: "-1" });
    expect(Object.keys(view)).toHaveLength(18);
    expect(toldOf(view, ["edge-err", "sc-b1", "sc-b2"])).toEqual([
      "t:drawn 1.2% too far out",
      "t:20.6 m on screen",
      "t:52.4 m on screen",
    ]);
    expect(tableOf(view["slice-table"]?.html ?? "")).toHaveLength(2);
  });

  it("draws the screens without the fish while the fish is wrong, and the beams as ever", () => {
    const input = inputFor({ fz: "0.5" });
    expect(SCREENS.map((id) => logTexts(drawn(id, input)).at(-1))).toEqual([
      "fish outside the slice@114@82",
      "fish outside the slice@8@20",
      "fish not in this Scout view@8@73",
      "fish not in this Scout view@8@104",
    ]);
    expect(BEAM_MODES.map((mode) => logSum(beamDrawn(mode, input)))).toEqual([
      "79:0f6acdc7",
      "79:4d91b175",
      "79:a6a8cb50",
      "79:0af5dcb3",
    ]);
  });

  it("does not check the live sonar's settings when it is not ticked, as Settings does not", () => {
    const input = inputFor({ ...UNTICKED, atsb: "-20" });
    expect(toldOf(activeTargetView(input), ["at-serr", "sc-b1"])).toEqual([NO_ERR, "t:never"]);
  });

  it("does not change what it is given", () => {
    const input = inputFor();
    const before = JSON.stringify([
      input.settings,
      input.eq,
      input.names,
      input.local,
      input.theme,
    ]);
    activeTargetView(input);
    for (const id of SCREENS) drawn(id, input);
    for (const mode of BEAM_MODES) {
      beamDrawn(mode, input);
      beamView(mode, BEAM_STAND_IN, input);
    }
    expect(JSON.stringify([input.settings, input.eq, input.names, input.local, input.theme])).toBe(
      before,
    );
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

/** The section of the page ActiveTarget is recorded in. */
const SECTION_FILE = "at";

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
  scheme: string;
  locale: string;
  fields: Record<string, string | boolean>;
  ui: { open: Record<string, boolean> };
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

/** The section file of a scenario and scheme (`<scenario>/<scheme>`), or the file the index says it equals. */
function sectionFile(at: string): RecordedFile {
  let path = `${at}/${SECTION_FILE}.json`;
  for (let equal = index.omitted[path]; equal !== undefined; equal = index.omitted[path])
    path = equal;
  return read<RecordedFile>(path);
}

/** A value of a section file, read where a `same` says it is. */
function resolved<T extends object>(
  at: string,
  key: string,
  held: (file: RecordedFile) => T | Same | undefined,
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

/**
 * What a recording started from, read from a file of its own: one a section
 * equals holds another scenario. The style differs between light and dark, and
 * the beams are drawn in its colours, so the scheme's own file is read.
 */
function scenarioOf(name: string, scheme: string): RecordedScenario {
  const own = ["page", "set"]
    .map((section) => `${name}/${scheme}/${section}.json`)
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
 * `<tr>` rows straight into the table `slice-table` (line 761), and `innerHTML`
 * reads them back inside a `<tbody>`.
 */
const TABLE = "slice-table";

/**
 * A patch of a view as the recorder holds it (fixtures/README.md): a content
 * that was written is held as text and as html, whichever way it was written.
 * No view of this module writes an attribute.
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
  return out;
}

/**
 * The element of `KEYS` that is also marked with a sonar in the page's markup
 * (`data-eq`), with its mark. The earlier page hides it with its sonar
 * (`applyEq`, line 269, which is `hiddenFor` of `settings.ts` and the shell's
 * to apply), so its recorded patch holds a `hidden` that no view of this module
 * writes.
 */
const MARKED: Readonly<Record<string, string>> = { "bvW-t": "atw" };

const SCENARIOS = index.scenarios.map((scenario) => scenario.name);
const PAIRS = SCENARIOS.flatMap((name) =>
  index.schemes.map((scheme): [string, string] => [name, scheme]),
);

/**
 * Whether the earlier page rendered the section: it is open and not hidden,
 * which it is when the live sonar is not ticked (line 1809, and the `data-eq`
 * of the section).
 */
const isRendered = (scenario: RecordedScenario): boolean =>
  scenario.ui.open.at === true && scenario.fields["eq-at"] === true;

/** The height each canvas of the section has in the page's markup, before the script sets one. */
const MARKUP_HEIGHT: Readonly<Record<string, number>> = {
  scrF: 260,
  scrD: 230,
  scrS: 260,
  scrW: 300,
  bvF: BEAM_START_HEIGHT,
  bvD: BEAM_START_HEIGHT,
  bvS: BEAM_START_HEIGHT,
  bvW: BEAM_START_HEIGHT,
};

/** The colours and fonts of the style that a beam's painter reads. */
const BEAM_STYLE = [
  "--surface",
  "--muted",
  "--water",
  "--fg",
  "--accent",
  "--c2d",
  "--font-body",
  "--font-data",
] as const;

/**
 * One canvas of the section: its id, its painter, the size of the narrow
 * canvas every recording is drawn on once more, whether it is a beam's, and
 * everything the earlier lines of the canvas read once they draw it, as one
 * text. The size of the canvas and what it measures come from the recording.
 *
 * Two tests use the text together, because a picture at the page's size is
 * slow to draw here (see `STAND_IN`). The first draws every recorded canvas on
 * a narrow one and requires the picture of the first recording with the same
 * text: so the painter reads nothing of its input but what is in this text. The
 * second can then draw the page-size picture once for each text, and compares
 * it with the recorded log of every recording that has that text.
 */
interface Canvas {
  id: string;
  beam: boolean;
  narrow: Size;
  paint(surface: Surface, input: Input): void;
  reads(scenario: RecordedScenario, input: Input): unknown[];
}

/** What every screen reads: the depth, the transducer's depth, the range, the fish, the thickness, the locale and the font. */
const screenReads = ({ fields: f, locale, theme }: RecordedScenario): unknown[] => [
  f.dep,
  f.zt,
  f.atr,
  f.fx,
  f.fy,
  f.fz,
  f.att,
  locale,
  theme["--font-data"],
];

/** What both flat screens read besides: the fan, the mount angle, the screen distance and the flat mode's name. */
const flatReads = (scenario: RecordedScenario, input: Input): unknown[] => [
  ...screenReads(scenario),
  scenario.fields.atw,
  scenario.fields.atsb,
  scenario.fields.sr,
  input.names.flat,
];

/** What every beam reads: the depth, the transducer's depth, the range, the fan, the thickness and the style. */
const beamReads = ({ fields: f, theme }: RecordedScenario): unknown[] => [
  f.dep,
  f.zt,
  f.atr,
  f.atw,
  f.att,
  ...BEAM_STYLE.map((name) => theme[name]),
];

const NARROW_SCREEN: Size = [48, 36];
const NARROW_BEAM: Size = [24, 30];

const CANVASES: readonly Canvas[] = [
  {
    id: CANVAS_FORWARD,
    beam: false,
    narrow: NARROW_SCREEN,
    paint: paintForward,
    reads: screenReads,
  },
  {
    id: CANVAS_DOWN,
    beam: false,
    narrow: NARROW_SCREEN,
    paint: paintDown,
    reads: (scenario) => [...screenReads(scenario), scenario.fields.atw],
  },
  { id: CANVAS_FLAT, beam: false, narrow: NARROW_SCREEN, paint: paintFlat, reads: flatReads },
  { id: CANVAS_WIDE, beam: false, narrow: NARROW_SCREEN, paint: paintWide, reads: flatReads },
  {
    id: BEAM_CANVAS.F,
    beam: true,
    narrow: NARROW_BEAM,
    paint: (surface, input) => paintBeam("F", surface, input),
    reads: (scenario) => [...beamReads(scenario), scenario.fields.atfa],
  },
  {
    id: BEAM_CANVAS.D,
    beam: true,
    narrow: NARROW_BEAM,
    paint: (surface, input) => paintBeam("D", surface, input),
    reads: beamReads,
  },
  {
    id: BEAM_CANVAS.S,
    beam: true,
    narrow: NARROW_BEAM,
    paint: (surface, input) => paintBeam("S", surface, input),
    reads: (scenario) => [...beamReads(scenario), scenario.fields.atsb],
  },
  {
    id: BEAM_CANVAS.W,
    beam: true,
    narrow: NARROW_BEAM,
    paint: (surface, input) => paintBeam("W", surface, input),
    reads: (scenario) => [...beamReads(scenario), scenario.fields.atsb],
  },
];

/** What a painter draws on a canvas of the given size, which measures with the stand-in. */
function painted(canvas: Canvas, input: Input, size: Size): Entry[] {
  const { surface, log } = recordingSurface(size[0], size[1], standInMeasure);
  canvas.paint(surface, input);
  return log;
}

/**
 * A recorded log of a beam's canvas as the port's log is. The earlier lines
 * fill the canvas with the background colour and read its pixels back
 * (`getImageData`, line 868); the port makes pixels of that colour itself
 * (docs/SPEC.md 3.3), so in place of that entry its log holds the making of an
 * empty picture of the same size. The recorded entry is required to hold the
 * pixels of a canvas that is all background, and the entry that puts the
 * finished picture is compared as it is: so the two pictures are the same.
 */
function asPort(log: Entry[], background: string): Entry[] {
  return log.map((entry) => {
    if (entry[0] !== "getImageData") return entry;
    const [, x, y, w, h, image] = entry;
    expect([x, y]).toEqual([0, 0]);
    expect(image).toEqual({
      $: "ImageData",
      w,
      h,
      fnv1a: filledDigest(Number(w), Number(h), background),
    });
    return [
      "createImageData",
      w,
      h,
      { $: "ImageData", w, h, fnv1a: filledDigest(Number(w), Number(h), null) },
    ];
  });
}

/** The narrow picture of the first recording with each text of what a canvas reads, as `logSum` gives it. */
const narrowPictures = new Map<string, string>();

/** The page-size pictures drawn so far, by the text of what the canvas reads, the size and the widths measured. */
const pageSize = new Map<string, Entry[]>();

describe("against the recorded page", () => {
  it("reads every scenario, in light and dark, two of them in sv-SE", () => {
    expect(SCENARIOS).toHaveLength(168);
    expect(index.schemes).toEqual(["light", "dark"]);
    expect(
      index.scenarios.filter((scenario) => scenario.locale !== "en-US").map((s) => s.locale),
    ).toEqual(["sv-SE", "sv-SE"]);
  });

  it("has recordings with the section rendered and without, stopped by a setting and not, with the wide mode and without", () => {
    const rendered = PAIRS.filter(([name, scheme]) => isRendered(scenarioOf(name, scheme)));
    const stopped = rendered.filter(
      ([name, scheme]) => recorded(`${name}/${scheme}`, "at-serr")?.hidden === false,
    );
    const drawnOn = (id: string): number =>
      PAIRS.filter(([name, scheme]) => recordedCanvas(`${name}/${scheme}`, id)).length;
    expect([PAIRS.length, rendered.length, stopped.length]).toEqual([336, 194, 36]);
    expect(CANVASES.map((canvas) => drawnOn(canvas.id))).toEqual([
      158, 158, 158, 128, 158, 158, 158, 128,
    ]);
  });

  it("has recordings of every message of the section, with the first brand's name", () => {
    const seen = new Set<string>();
    for (const [name, scheme] of PAIRS) {
      for (const key of ["at-serr", "pos-err", "sc-err"]) {
        const text = recorded(`${name}/${scheme}`, key)?.text;
        if (text !== undefined) seen.add(`${key}: ${text.replace(/\(\d.*$/, "(…")}`);
      }
    }
    expect([...seen].sort()).toEqual([
      "at-serr: ",
      "at-serr: Fix the ActiveTarget 2 angles in Settings.",
      "at-serr: Fix the ActiveTarget 2 mount angles in Settings.",
      "at-serr: Fix the depth in Settings.",
      "at-serr: Fix the live sonar range in Settings.",
      "at-serr: Fix the transducer depth in Settings.",
      "pos-err: ",
      "pos-err: Enter a distance ahead of 0 m or more.",
      "pos-err: Enter a side distance of 0 m or more.",
      "pos-err: The fish must be below the transducer (…",
      "sc-err: ",
      "sc-err: Enter a screen distance greater than 0 m.",
      "sc-err: Fix the fish above first.",
    ]);
  });

  describe.each(PAIRS)("%s, %s", (name, scheme) => {
    const at = `${name}/${scheme}`;
    const scenario = scenarioOf(name, scheme);
    const input = inputOf(scenario.fields, scenario.locale, scenario.theme);
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

    it("hid the line under the wide beam with its sonar, which is not this module's to write", () => {
      expect([scenario.name, scenario.scheme]).toEqual([name, scheme]);
      for (const [key, mark] of Object.entries(MARKED)) {
        if (key in hiddenWas) expect(hiddenWas[key]).toBe(hiddenFor(input.eq, mark));
      }
    });

    if (!isRendered(scenario)) {
      it("did not render the section: no element of KEYS was written and nothing was drawn", () => {
        expect(Object.keys(was)).toEqual([]);
        for (const canvas of CANVASES) expect(recordedCanvas(at, canvas.id)).toBeUndefined();
      });
      return;
    }

    it("leaves the elements of KEYS as the earlier page left them, and writes no other", () => {
      // The line under a beam is worked out for the width its canvas has, which is the recorded one.
      const view: Record<string, ElementPatch> = { ...activeTargetView(input) };
      for (const mode of BEAM_MODES) {
        const width = recordedCanvas(at, BEAM_CANVAS[mode])?.width ?? BEAM_PAGE;
        Object.assign(view, beamView(mode, width, input));
      }
      const left: Record<string, RecordedPatch> = {};
      for (const [key, patch] of Object.entries(view)) left[key] = asRecorded(key, patch);
      expect(Object.keys(left).sort()).toEqual(Object.keys(was).sort());
      expect(left).toEqual(was);
      expect(Object.keys(view).filter((key) => !(KEYS as readonly string[]).includes(key))).toEqual(
        [],
      );
    });

    describe.each(CANVASES)("the canvas $id", (canvas) => {
      const record = recordedCanvas(at, canvas.id);

      if (record === undefined) {
        it("draws nothing, as the earlier page drew nothing", () => {
          expect(painted(canvas, input, [BEAM_PAGE, MARKUP_HEIGHT[canvas.id] ?? 0])).toEqual([]);
        });
        return;
      }

      const reads = JSON.stringify([canvas.id, ...canvas.reads(scenario, input)]);

      it("draws, on a narrow canvas, what it draws for every recording that gives the canvas the same to read", () => {
        const own = logSum(painted(canvas, input, canvas.narrow));
        const first = narrowPictures.get(reads) ?? own;
        narrowPictures.set(reads, first);
        expect(own).toBe(first);
      });

      it("draws the canvas as the earlier page drew it, entry for entry", () => {
        const logs = record.passes.flatMap((pass) => (pass.log === undefined ? [] : [pass.log]));
        expect(logs.length).toBeGreaterThan(0);
        for (const pass of record.passes) {
          // A pass without a log is one that equals an earlier pass, which has one.
          if (pass.log === undefined) expect(record.passes[pass.repeats ?? -1]?.log).toBeDefined();
        }
        for (const log of logs) {
          // The widths the browser measured, by text, so that no font of this machine is asked.
          const measured = new Map<string, Measured>();
          for (const entry of log) {
            if (entry[0] === "measureText") measured.set(String(entry[1]), entry[2] as Measured);
          }
          // A pass that sets the height started from the markup's; any other from the height the canvas has.
          const resized = log[0]?.[0] === "#height";
          const start = resized ? (MARKUP_HEIGHT[canvas.id] ?? 0) : record.height;
          if (resized) expect(log[0]?.[1]).not.toBe(start);
          const once = JSON.stringify([reads, record.width, start, [...measured]]);
          let page = pageSize.get(once);
          if (page === undefined) {
            const made = recordingSurface(
              record.width,
              start,
              (text) =>
                measured.get(text) ?? { font: "not measured by the earlier page", width: 0 },
            );
            canvas.paint(made.surface, input);
            page = made.log;
            pageSize.set(once, page);
          }
          const background = scenario.theme["--surface"] ?? "";
          expect(page).toEqual(canvas.beam ? asPort(log, background) : log);
        }
      });
    });
  });

  it("draws the page-size pictures for these numbers of different sets of what each canvas reads", () => {
    const sets = new Map<string, Set<string>>();
    for (const [name, scheme] of PAIRS) {
      const scenario = scenarioOf(name, scheme);
      if (!isRendered(scenario)) continue;
      const input = inputOf(scenario.fields, scenario.locale, scenario.theme);
      for (const canvas of CANVASES) {
        if (!recordedCanvas(`${name}/${scheme}`, canvas.id)) continue;
        const set = sets.get(canvas.id) ?? new Set<string>();
        sets.set(canvas.id, set);
        set.add(JSON.stringify(canvas.reads(scenario, input)));
      }
    }
    expect(CANVASES.map((canvas) => sets.get(canvas.id)?.size)).toEqual([
      17, 20, 26, 23, 26, 22, 26, 22,
    ]);
  });
});
