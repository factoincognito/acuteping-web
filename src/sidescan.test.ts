/**
 * SideScan against the earlier page (legacy/src/p2.js, lines 297 to 500 and
 * 518 to 585), in two ways. The expected values of the first part were printed
 * by those lines themselves, run unchanged in Node against a stand-in for the
 * page's elements and for the canvas, once in en-US and once in sv-SE. The
 * second part compares what the view writes and what the painter draws with
 * what the earlier page wrote and drew when it was recorded in a browser
 * (`fixtures/legacy/`), in every scenario of the set.
 */
import { createFormatter } from "./format";
import { equipment, num, parseSettings } from "./settings";
import {
  CANVAS,
  dashAt,
  ERR_DEPTHS,
  KEYS,
  paintSideScan,
  relDash,
  relSolid,
  sideScanView,
  solidAt,
} from "./sidescan";
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
function fieldsOf(over: RawFields = {}, first = "lowrance"): RawFields {
  const p = combined(first, "");
  const l = livePreset("at2");
  const fields: Record<string, SavedValue> = {
    "img-p": first,
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
    ssR: "20",
    s1: "20",
    s2: "24",
    ro: "7.1",
    rs: "14.1",
  };
  for (const [i, c] of p.cone.entries()) fields[`cone${i}`] = String(c.a);
  for (const [i, c] of p.down.entries()) fields[`down${i}`] = String(c.a);
  for (const [i, c] of p.side.entries()) fields[`side${i}`] = String(c.a);
  return { ...fields, ...over };
}

/** The saved view state as the page starts with it, with some of it changed. */
const uiOf = (over: Partial<UiState> = {}): UiState => ({ ...UI_DEFAULTS, sub: {}, ...over });

/** The number fields of the section's own, which the shell reads as `num()` does. */
const LOCAL_NUMBERS = ["ssR", "s1", "s2", "ro", "rs"] as const;

/** What the view and the painter get for a page with the given fields and view state. */
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
  if (typeof fields.ssalign === "string") local.ssalign = fields.ssalign;
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

/** The view of the page as it starts, with some fields and some of the view state changed. */
const viewOf = (
  over: RawFields = {},
  ui: Partial<UiState> = {},
  locale = "en-US",
  first = "lowrance",
): SectionView => sideScanView(inputOf(fieldsOf(over, first), uiOf(ui), locale));

/** A result list as "term=value" for each row, when the html is nothing else. */
function rows(html: string): string[] | undefined {
  const found = [...html.matchAll(/<div><dt>([^<]*)<\/dt><dd>([^<]*)<\/dd><\/div>/g)];
  if (found.length === 0 || found.map(([row]) => row).join("") !== html) return undefined;
  return found.map(([, term, value]) => `${term}=${value}`);
}

/** The texts a picture shows, in the order they stand in its html. */
const textsOf = (html: string): string[] =>
  [...html.matchAll(/>([^<]*)<\/text>/g)].map(([, text]) => String(text));

/** From this length an html is told as its digest and length, with the texts it shows. */
const LONG = 160;

/**
 * What was written to one element, as one line: `t:` its text, `r:` the rows
 * of a result list, `h:` any other html (a long one as its digest and length,
 * and after `x:` the texts it shows), whether it is hidden, and its attributes.
 */
function told(p: ElementPatch): string {
  const parts: string[] = [];
  if (p.text !== undefined) parts.push(`t:${p.text}`);
  if (p.html !== undefined) {
    const list = rows(p.html);
    if (list) parts.push(`r:${list.join("|")}`);
    else if (p.html.length > LONG) {
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
      throw new Error("the simulated screen is never resized");
    },
  };
  return { surface, log };
}

/** The size of the canvas `sim` in the page's markup. */
const SIM_WIDTH = 360;
const SIM_HEIGHT = 400;

/**
 * The height of the stand-in canvas: a tenth of the page's, at its full width.
 * The earlier lines were run on a stand-in of this size too. Every pixel costs
 * some twenty reads of `Math`, which are slow where Jest runs a test, so only
 * the pictures that are compared with the browser's are drawn at full height.
 */
const STAND_IN_HEIGHT = 40;

/** The width the stand-in canvas gives each character of a text it measures. */
const CHAR_WIDTH = 7.224609375;

/** How the stand-in canvas measures a text. */
const standInMeasure = (text: string, font: string): Measured => ({
  font,
  width: text.length * CHAR_WIDTH,
});

/** What the painter draws for an input, on the stand-in canvas. */
function drawn(input: ReturnType<typeof inputOf>, height = STAND_IN_HEIGHT): Entry[] {
  const { surface, log } = recordingSurface(SIM_WIDTH, height, standInMeasure);
  paintSideScan(surface, input);
  return log;
}

/** A log as its number of entries and its digest. */
const logSum = (log: Entry[]): string => `${log.length}:${fnv1a(JSON.stringify(log))}`;

/** The texts a log writes, each with where it stands. */
const logTexts = (log: Entry[]): string[] =>
  log.filter((entry) => entry[0] === "fillText").map((entry) => entry.slice(1).join("@"));

// ---------------------------------------------------------------------------
// The first part: against the earlier lines run in Node
// ---------------------------------------------------------------------------

/** A message element without a message. */
const NO_ERR = "t: [hidden]";

describe("what the module names", () => {
  it("lists the elements the view writes and the canvas the painter draws", () => {
    expect(KEYS).toEqual([
      "bottom-tool",
      "susp-tool",
      "err-svg",
      "rel-svg",
      "rel-tab",
      "ss-serr",
      "ssR-err",
      "out-label",
      "out-x",
      "out-note",
      "compare",
      "c1",
      "c2",
      "sketch",
      "b-err",
      "b-res",
      "b-h",
      "b-x",
      "s-err",
      "s-res",
      "s-d",
      "s-a",
      "s-x",
      "sim-vals",
      "sim-cap",
      "ssb-back",
      "ssb-top",
      "ssb-res",
    ]);
    expect(new Set(KEYS).size).toBe(KEYS.length);
    expect(CANVAS).toBe("sim");
  });

  it("has the depths of the two error graphs (line 433)", () => {
    expect(ERR_DEPTHS).toEqual([1, 3, 5, 8, 10]);
  });
});

describe("the page as it starts", () => {
  const SECTION = ["bottom-tool", "susp-tool", "ss-serr"];

  it("writes all 28 elements", () => {
    const view = viewOf();
    expect(Object.keys(view).sort()).toEqual([...KEYS].sort());
    expect(toldOf(view, SECTION)).toEqual(["[shown]", "[hidden]", NO_ERR]);
    expect(digestOf(view)).toBe("4ef02d1f");
  });

  it("writes the same in sv-SE with decimal commas", () => {
    const view = viewOf({}, {}, "sv-SE");
    expect(Object.keys(view).sort()).toEqual([...KEYS].sort());
    expect(digestOf(view)).toBe("7f24dcf5");
  });

  it("writes the sketch of a target on the bottom, tag for tag (lines 298 to 323)", () => {
    expect(viewOf().sketch).toEqual({
      html: '<line x1="8" y1="14" x2="312" y2="14" stroke="var(--water)" stroke-width="1.2"/><rect x="8" y="146" width="304" height="6" fill="var(--ground)" opacity="0.6"/><line x1="8" y1="146" x2="312" y2="146" stroke="var(--muted)" stroke-width="1.2"/><line x1="24" y1="24" x2="24" y2="146" stroke="var(--muted)" stroke-width="1" stroke-dasharray="3 3"/><text x="30" y="88" font-family="var(--font-data)" font-size="11" fill="var(--muted)">H 10.0</text><line x1="24" y1="22" x2="238.7743001385408" y2="146" stroke="var(--accent)" stroke-width="2"/><line x1="24" y1="156" x2="238.7743001385408" y2="156" stroke="var(--fg)" stroke-width="1"/><circle cx="238.7743001385408" cy="146" r="4.5" fill="var(--accent)" stroke="var(--surface)" stroke-width="2"/><text x="131.3871500692704" y="170" text-anchor="middle" font-family="var(--font-data)" font-size="11" fill="var(--fg)">horizontal 17.3 m</text><text x="137.3871500692704" y="78" font-family="var(--font-data)" font-size="11" fill="var(--accent)">screen 20.0 m</text><circle cx="24" cy="22" r="4" fill="var(--fg)"/>',
    });
  });

  it("writes the sketch of a target in the water column, tag for tag", () => {
    expect(viewOf({ ssR: "9.9" }).sketch).toEqual({
      html: '<line x1="8" y1="14" x2="312" y2="14" stroke="var(--water)" stroke-width="1.2"/><rect x="8" y="146" width="304" height="6" fill="var(--ground)" opacity="0.6"/><line x1="8" y1="146" x2="312" y2="146" stroke="var(--muted)" stroke-width="1.2"/><line x1="24" y1="24" x2="24" y2="146" stroke="var(--muted)" stroke-width="1" stroke-dasharray="3 3"/><text x="30" y="88" font-family="var(--font-data)" font-size="11" fill="var(--muted)">H 10.0</text><path d="M 146.76 22 A 122.76 122.76 0 0 1 24 144.76" fill="none" stroke="var(--accent)" stroke-width="2" stroke-dasharray="5 4"/><text x="154.76" y="111.932" font-family="var(--font-data)" font-size="11" fill="var(--accent)">could be anywhere on this arc</text><circle cx="24" cy="22" r="4" fill="var(--fg)"/>',
    });
  });
});

describe("the reading of a screen distance (ssReading and drawSketch, lines 298 to 340)", () => {
  const READING = ["ssR-err", "out-label", "out-x", "out-note", "compare", "c1", "c2", "sketch"];
  const ON_BOTTOM = "t:Horizontal distance to target on the bottom";
  const IN_WATER = "t:Target is inside the water column band";
  const NOTE =
    't:It is closer than the bottom, so on a flat bottom it is off the bottom. Its depth and position can only be found from its shadow. Use "Suspended object" below. [shown]';
  const NO_READING = [
    "t:Enter the distance you read on the screen, 0 m or more. [shown]",
    NOT,
    "t:—",
    "[hidden]",
    "[hidden]",
    NOT,
    NOT,
    "h:",
  ];

  // what is tested, the fields changed, the locale, the eight elements, the digest of the whole view
  const cases: [string, RawFields, string, string[], string][] = [
    [
      "a target on the bottom",
      {},
      "en-US",
      [
        NO_ERR,
        ON_BOTTOM,
        "t:17.3 m",
        "[hidden]",
        "[shown]",
        "t:20.0 m (2.7 too far)",
        "t:10.0 m (7.3 too short)",
        "h:3d3a8280:1054 x:H 10.0|horizontal 17.3 m|screen 20.0 m",
      ],
      "4ef02d1f",
    ],
    [
      "the depth itself: the point under the boat",
      { ssR: "10" },
      "en-US",
      [
        NO_ERR,
        ON_BOTTOM,
        "t:0.00 m",
        "[hidden]",
        "[shown]",
        "t:10.0 m (10.0 too far)",
        "t:0.00 m (0.00 too short)",
        "h:d8adde3e:979 x:H 10.0|horizontal 0.00 m|screen 10.0 m",
      ],
      "dc1304c6",
    ],
    [
      "just under the depth: in the water column",
      { ssR: "9.9" },
      "en-US",
      [
        NO_ERR,
        IN_WATER,
        "t:—",
        NOTE,
        "[hidden]",
        NOT,
        NOT,
        "h:2d54fb8d:752 x:H 10.0|could be anywhere on this arc",
      ],
      "7ff44e81",
    ],
    [
      "zero is a distance",
      { ssR: "0" },
      "en-US",
      [
        NO_ERR,
        IN_WATER,
        "t:—",
        NOTE,
        "[hidden]",
        NOT,
        NOT,
        "h:beac3cec:725 x:H 10.0|could be anywhere on this arc",
      ],
      "456701ca",
    ],
    ["a negative distance: the message, no sketch", { ssR: "-1" }, "en-US", NO_READING, "569c73b4"],
    ["a blank field: the message", { ssR: "" }, "en-US", NO_READING, "569c73b4"],
    ["a text: the message", { ssR: "abc" }, "en-US", NO_READING, "569c73b4"],
    [
      "a decimal comma",
      { ssR: "12,5" },
      "en-US",
      [
        NO_ERR,
        ON_BOTTOM,
        "t:7.5 m",
        "[hidden]",
        "[shown]",
        "t:12.5 m (5.0 too far)",
        "t:2.5 m (5.0 too short)",
        "h:f3afe775:985 x:H 10.0|horizontal 7.5 m|screen 12.5 m",
      ],
      "e720c332",
    ],
    [
      "a distance far out",
      { ssR: "1e3" },
      "en-US",
      [
        NO_ERR,
        ON_BOTTOM,
        "t:999.9 m",
        "[hidden]",
        "[shown]",
        "t:1000.0 m (0.05 too far)",
        "t:990.0 m (9.9 too short)",
        "h:07beef87:1147 x:H 10.0|horizontal 999.9 m|screen 1000.0 m",
      ],
      "fea2cf75",
    ],
    [
      "shallow water, a target in the water column",
      { dep: "0.4", ssR: "0.3" },
      "en-US",
      [
        NO_ERR,
        IN_WATER,
        "t:—",
        NOTE,
        "[hidden]",
        NOT,
        NOT,
        "h:def2fced:732 x:H 0.40|could be anywhere on this arc",
      ],
      "0de043e3",
    ],
    [
      "shallow water, a target on the bottom",
      { dep: "0.4", ssR: "0.45" },
      "en-US",
      [
        NO_ERR,
        ON_BOTTOM,
        "t:0.21 m",
        "[hidden]",
        "[shown]",
        "t:0.45 m (0.24 too far)",
        "t:0.05 m (0.16 too short)",
        "h:a780b8ec:1040 x:H 0.40|horizontal 0.21 m|screen 0.45 m",
      ],
      "66661fb2",
    ],
    [
      "sv-SE, a target on the bottom",
      { ssR: "12,5" },
      "sv-SE",
      [
        NO_ERR,
        ON_BOTTOM,
        "t:7,5 m",
        "[hidden]",
        "[shown]",
        "t:12,5 m (5,0 too far)",
        "t:2,5 m (5,0 too short)",
        "h:11aaa597:985 x:H 10,0|horizontal 7,5 m|screen 12,5 m",
      ],
      "e0cf3424",
    ],
    [
      "sv-SE, a target in the water column",
      { ssR: "9,9" },
      "sv-SE",
      [
        NO_ERR,
        IN_WATER,
        "t:—",
        NOTE,
        "[hidden]",
        NOT,
        NOT,
        "h:466e2e37:752 x:H 10,0|could be anywhere on this arc",
      ],
      "7f016281",
    ],
    [
      "a depth under 0.22 m: the sketch is drawn as for a distance of 0.5 m",
      { dep: "0.1", ssR: "0.05" },
      "en-US",
      [
        NO_ERR,
        IN_WATER,
        "t:—",
        NOTE,
        "[hidden]",
        NOT,
        NOT,
        "h:6839c73b:749 x:H 0.10|could be anywhere on this arc",
      ],
      "00548d0f",
    ],
    [
      "a depth of 2 cm: the text of the arc stays 8 above the bottom line",
      { dep: "0.02", ssR: "0.019" },
      "en-US",
      [
        NO_ERR,
        IN_WATER,
        "t:—",
        NOTE,
        "[hidden]",
        NOT,
        NOT,
        "h:9dae52d0:778 x:H 0.02|could be anywhere on this arc",
      ],
      "2307ff5c",
    ],
    [
      "values that are not round: the place on the bottom to the last digit",
      { dep: "0.5", ssR: "0.85" },
      "en-US",
      [
        NO_ERR,
        ON_BOTTOM,
        "t:0.69 m",
        "[hidden]",
        "[shown]",
        "t:0.85 m (0.16 too far)",
        "t:0.35 m (0.34 too short)",
        "h:f448b937:1059 x:H 0.50|horizontal 0.69 m|screen 0.85 m",
      ],
      "6fefef74",
    ],
  ];

  it.each(cases)("%s", (_what, fields, locale, expected, digest) => {
    const view = viewOf(fields, {}, locale);
    expect(toldOf(view, READING)).toEqual(expected);
    expect(digestOf(view)).toBe(digest);
  });

  it("takes a number field that is given as a text for no number", () => {
    const input = inputOf(fieldsOf(), uiOf(), "en-US");
    const view = sideScanView({ ...input, local: { ...input.local, ssR: "20" } });
    expect(toldOf(view, READING)).toEqual(NO_READING);
    expect(digestOf(view)).toBe("569c73b4");
  });

  it("takes a number field that is not given for no number", () => {
    const input = inputOf(fieldsOf(), uiOf(), "en-US");
    const { ssR: _left, ...local } = input.local;
    expect(digestOf(sideScanView({ ...input, local }))).toBe("569c73b4");
  });
});

/** What the simulated screen says under it without an object. */
const NO_OBJECT = "t:Fix the shadow values above to place the object. Range 25 m per side.";

/** The log of the simulated screen without an object, at the first depth, and its texts. */
const EMPTY_SCREEN = "78:6ebf3dfc";
const EMPTY_SCREEN_TEXTS = [
  "10@252@11",
  "10@108@11",
  "20@324@11",
  "20@36@11",
  "Port@4@34",
  "Stbd 25 m@356@34",
  "depth H 10.0 m@244@35",
];

describe("the two shadow tools (ssShadow, lines 341 to 353)", () => {
  const BOTTOM = ["b-err", "b-res", "b-h", "b-x"];
  const SUSPENDED = ["s-err", "s-res", "s-d", "s-a", "s-x"];
  const B_OK = [NO_ERR, "[shown]", "t:2.1 m", "t:17.3 m"];
  const S_OK = [NO_ERR, "[shown]", "t:5.0 m", "t:5.0 m", "t:5.0 m"];
  const bWrong = (message: string): string[] => [`t:${message} [shown]`, "[hidden]", NOT, NOT];
  const sWrong = (message: string): string[] => [...bWrong(message), NOT];
  const B_START =
    "The shadow start must be at or beyond the depth (10.0 m). A shadow always falls on the bottom.";
  const B_END = "The shadow end must be farther out than its start.";
  const S_RANGE = "Enter where the object is drawn, more than 0 m.";
  const S_SHADOW =
    "The shadow must be at or beyond the depth (10.0 m). A shadow always falls on the bottom.";
  const S_CLOSER = "The object must be drawn closer than its shadow.";
  const SUSP = { ssMode: "susp" };

  // what is tested, the fields changed, the view state changed, the bottom tool, the suspended tool, the digest
  const cases: [string, RawFields, Partial<UiState>, string[], string[], string][] = [
    ["both tools with their first values", {}, {}, B_OK, S_OK, "4ef02d1f"],
    ["a shadow start under the depth", { s1: "9.9" }, {}, bWrong(B_START), S_OK, "33305228"],
    ["a blank shadow start", { s1: "" }, {}, bWrong(B_START), S_OK, "33305228"],
    [
      "a shadow start at the depth: the object is under the boat",
      { s1: "10" },
      {},
      [NO_ERR, "[shown]", "t:10.0 m", "t:0.00 m"],
      S_OK,
      "93f5b33e",
    ],
    ["a shadow end at its start", { s2: "20" }, {}, bWrong(B_END), S_OK, "0593a51d"],
    ["a blank shadow end", { s2: "" }, {}, bWrong(B_END), S_OK, "0593a51d"],
    [
      "a shadow end just beyond its start",
      { s2: "20.1" },
      {},
      [NO_ERR, "[shown]", "t:0.07 m", "t:17.3 m"],
      S_OK,
      "ea73e856",
    ],
    [
      "start and end both wrong: the start is named",
      { s1: "5", s2: "4" },
      {},
      bWrong(B_START),
      S_OK,
      "33305228",
    ],
    ["an object drawn at 0", { ro: "0" }, SUSP, B_OK, sWrong(S_RANGE), "65c60b06"],
    ["a blank object distance", { ro: "" }, SUSP, B_OK, sWrong(S_RANGE), "65c60b06"],
    ["a negative object distance", { ro: "-1" }, SUSP, B_OK, sWrong(S_RANGE), "65c60b06"],
    [
      "an object's shadow under the depth",
      { ro: "5", rs: "9.9" },
      SUSP,
      B_OK,
      sWrong(S_SHADOW),
      "1ad469bc",
    ],
    ["a blank object's shadow", { rs: "" }, SUSP, B_OK, sWrong(S_SHADOW), "1ad469bc"],
    [
      "an object's shadow at the depth: the object is under the boat",
      { ro: "5", rs: "10" },
      SUSP,
      B_OK,
      [NO_ERR, "[shown]", "t:5.0 m", "t:5.0 m", "t:0.00 m"],
      "4390704c",
    ],
    [
      "an object as far out as its shadow",
      { ro: "14.1" },
      SUSP,
      B_OK,
      sWrong(S_CLOSER),
      "03f7c63f",
    ],
    ["an object beyond its shadow", { ro: "15" }, SUSP, B_OK, sWrong(S_CLOSER), "03f7c63f"],
    [
      "both tools wrong: each has its message",
      { s1: "5", ro: "0" },
      {},
      bWrong(B_START),
      sWrong(S_RANGE),
      "b353c1dc",
    ],
    [
      "values that are not round: the height of the object on the bottom",
      { dep: "5", s1: "10", s2: "35" },
      {},
      [NO_ERR, "[shown]", "t:3.7 m", "t:8.7 m"],
      [NO_ERR, "[shown]", "t:2.5 m", "t:2.5 m", "t:6.6 m"],
      "0a00aa3b",
    ],
    [
      "values that are not round: the depth of the suspended object",
      { dep: "1.5", ro: "3.5", rs: "5" },
      SUSP,
      [NO_ERR, "[shown]", "t:0.25 m", "t:19.9 m"],
      [NO_ERR, "[shown]", "t:1.1 m", "t:0.45 m", "t:3.3 m"],
      "e4f86c94",
    ],
  ];

  it.each(cases)("%s", (_what, fields, ui, bottom, suspended, digest) => {
    const view = viewOf(fields, ui);
    expect(toldOf(view, BOTTOM)).toEqual(bottom);
    expect(toldOf(view, SUSPENDED)).toEqual(suspended);
    expect(digestOf(view)).toBe(digest);
  });

  it("writes the depth in the messages as the locale writes it", () => {
    const view = viewOf({ dep: "7,5", s1: "7", rs: "7" }, {}, "sv-SE");
    expect(toldOf(view, BOTTOM)).toEqual(
      bWrong(
        "The shadow start must be at or beyond the depth (7,5 m). A shadow always falls on the bottom.",
      ),
    );
    expect(toldOf(view, SUSPENDED)).toEqual(
      sWrong(
        "The shadow must be at or beyond the depth (7,5 m). A shadow always falls on the bottom.",
      ),
    );
    expect(digestOf(view)).toBe("8b033149");
  });
});

describe("the simulated screen (drawSim, lines 354 to 431)", () => {
  const SIM = ["sim-vals", "sim-cap"];
  const SCREEN_TEXTS = [
    "10@240@11",
    "10@120@11",
    "20@300@11",
    "20@60@11",
    "Port@4@34",
    "Stbd 30 m@356@34",
    "depth H 10.0 m@232@35",
  ];
  const SUSPENDED_VALUES =
    "r:Depth under transducer (H)=10.0 m|Screen distance to object (slant)=7.1 m|True horizontal distance=5.0 m|Object depth below transducer=5.0 m|Height above bottom=5.0 m|Shadow on screen at=14.1 m [shown]";
  const SUSPENDED_SAYS =
    "t:Suspended object 5.0 m below the transducer, starboard side, passed and now halfway down. Range 20 m per side.";
  const SUSPENDED_SCREEN = "107:d9902aca";
  const SUSPENDED_TEXTS = [
    "5@225@11",
    "5@135@11",
    "10@270@11",
    "10@90@11",
    "15@315@11",
    "15@45@11",
    "Port@4@34",
    "Stbd 20 m@356@34",
    "depth H 10.0 m@262@35",
    "screen 7.1 m@227.34765625@-34",
  ];
  const BOTTOM_VALUES =
    "r:Depth under transducer (H)=10.0 m|Screen distance to object (slant)=20.0 m|True horizontal distance=17.3 m|Object depth (on the bottom)=10.0 m|Object height=2.1 m|Shadow ends on screen at=24.0 m [shown]";
  const BOTTOM_SAYS =
    "t:Object on the bottom, about 2.1 m tall, starboard side, passed and now halfway down. Range 30 m per side.";
  const BOTTOM_SCREEN = "97:b35ba39f";
  const BOTTOM_TEXTS = [...SCREEN_TEXTS, "screen 20.0 m@240@-34"];
  const SUSP = { ssMode: "susp" };

  // what is tested, the fields changed, the view state changed, the values and the line under
  // the screen, the log of the canvas, its texts, the digest of the whole view
  const cases: [string, RawFields, Partial<UiState>, string[], string, string[], string][] = [
    [
      "an object on the bottom",
      {},
      {},
      [BOTTOM_VALUES, BOTTOM_SAYS],
      BOTTOM_SCREEN,
      BOTTOM_TEXTS,
      "4ef02d1f",
    ],
    [
      "the bottom tool wrong: no object, the values hidden",
      { s1: "9.9" },
      {},
      ["[hidden]", NO_OBJECT],
      EMPTY_SCREEN,
      EMPTY_SCREEN_TEXTS,
      "33305228",
    ],
    [
      "a suspended object",
      {},
      SUSP,
      [SUSPENDED_VALUES, SUSPENDED_SAYS],
      SUSPENDED_SCREEN,
      SUSPENDED_TEXTS,
      "e48e3f96",
    ],
    [
      "the suspended tool wrong: no object",
      { ro: "0" },
      SUSP,
      ["[hidden]", NO_OBJECT],
      EMPTY_SCREEN,
      EMPTY_SCREEN_TEXTS,
      "65c60b06",
    ],
    [
      "the suspended tool chosen, the bottom tool wrong: the suspended object",
      { s1: "5" },
      SUSP,
      [SUSPENDED_VALUES, SUSPENDED_SAYS],
      SUSPENDED_SCREEN,
      SUSPENDED_TEXTS,
      "dab5dd64",
    ],
    [
      "the bottom tool chosen, the suspended tool wrong: the object on the bottom",
      { ro: "0" },
      {},
      [BOTTOM_VALUES, BOTTOM_SAYS],
      BOTTOM_SCREEN,
      BOTTOM_TEXTS,
      "c06e1677",
    ],
    [
      "a tool that is neither: the suspended object, as the earlier page draws it",
      {},
      { ssMode: "neither" },
      [SUSPENDED_VALUES, SUSPENDED_SAYS],
      SUSPENDED_SCREEN,
      SUSPENDED_TEXTS,
      "6c78cb23",
    ],
    [
      "an object on the bottom under the boat",
      { s1: "10" },
      {},
      [
        "r:Depth under transducer (H)=10.0 m|Screen distance to object (slant)=10.0 m|True horizontal distance=0.00 m|Object depth (on the bottom)=10.0 m|Object height=10.0 m|Shadow ends on screen at=24.0 m [shown]",
        "t:Object on the bottom, about 10.0 m tall, starboard side, passed and now halfway down. Range 30 m per side.",
      ],
      "97:a2f052d9",
      [...SCREEN_TEXTS, "screen 10.0 m@230.9599609375@-34"],
      "93f5b33e",
    ],
    [
      "a suspended object under the boat",
      { ro: "5", rs: "10" },
      SUSP,
      [
        "r:Depth under transducer (H)=10.0 m|Screen distance to object (slant)=5.0 m|True horizontal distance=0.00 m|Object depth below transducer=5.0 m|Height above bottom=5.0 m|Shadow on screen at=10.0 m [shown]",
        "t:Suspended object 5.0 m below the transducer, starboard side, passed and now halfway down. Range 15 m per side.",
      ],
      "97:9141a45c",
      [
        "5@240@11",
        "5@120@11",
        "10@300@11",
        "10@60@11",
        "Port@4@34",
        "Stbd 15 m@356@34",
        "depth H 10.0 m@292@35",
        "screen 5.0 m@227.34765625@-34",
      ],
      "4390704c",
    ],
    [
      "deeper water: a mark every 10 m",
      { dep: "30", s1: "40", s2: "45" },
      {},
      [
        "r:Depth under transducer (H)=30.0 m|Screen distance to object (slant)=40.0 m|True horizontal distance=26.5 m|Object depth (on the bottom)=30.0 m|Object height=6.3 m|Shadow ends on screen at=45.0 m [shown]",
        "t:Object on the bottom, about 6.3 m tall, starboard side, passed and now halfway down. Range 60 m per side.",
      ],
      "127:458d5c49",
      [
        "10@210@11",
        "10@150@11",
        "20@240@11",
        "20@120@11",
        "30@270@11",
        "30@90@11",
        "40@300@11",
        "40@60@11",
        "50@330@11",
        "50@30@11",
        "Port@4@34",
        "Stbd 60 m@356@34",
        "depth H 30.0 m@262@35",
        "screen 40.0 m@240@-34",
      ],
      "ce5f2b15",
    ],
    [
      "very deep water: a mark every 25 m, no object",
      { dep: "100", ssR: "150" },
      {},
      ["[hidden]", "t:Fix the shadow values above to place the object. Range 250 m per side."],
      "148:f974657c",
      [
        "25@198@11",
        "25@162@11",
        "50@216@11",
        "50@144@11",
        "75@234@11",
        "75@126@11",
        "100@252@11",
        "100@108@11",
        "125@270@11",
        "125@90@11",
        "150@288@11",
        "150@72@11",
        "175@306@11",
        "175@54@11",
        "200@324@11",
        "200@36@11",
        "225@342@11",
        "225@18@11",
        "Port@4@34",
        "Stbd 250 m@356@34",
        "depth H 100.0 m@244@35",
      ],
      "3bdf006e",
    ],
    [
      "shallow water: a mark every 5 m",
      { dep: "2", s1: "3", s2: "4" },
      {},
      [
        "r:Depth under transducer (H)=2.0 m|Screen distance to object (slant)=3.0 m|True horizontal distance=2.2 m|Object depth (on the bottom)=2.0 m|Object height=0.71 m|Shadow ends on screen at=4.0 m [shown]",
        "t:Object on the bottom, about 0.71 m tall, starboard side, passed and now halfway down. Range 10 m per side.",
      ],
      "87:74ccfa5f",
      [
        "5@270@11",
        "5@90@11",
        "Port@4@34",
        "Stbd 10 m@356@34",
        "depth H 2.0 m@208@35",
        "screen 3.0 m@227.34765625@-34",
      ],
      "f4382f60",
    ],
    [
      "a long shadow: the range grows with it",
      { s1: "10", s2: "60" },
      {},
      [
        "r:Depth under transducer (H)=10.0 m|Screen distance to object (slant)=10.0 m|True horizontal distance=0.00 m|Object depth (on the bottom)=10.0 m|Object height=10.0 m|Shadow ends on screen at=60.0 m [shown]",
        "t:Object on the bottom, about 10.0 m tall, starboard side, passed and now halfway down. Range 80 m per side.",
      ],
      "107:615ccfc1",
      [
        "25@236.25@11",
        "25@123.75@11",
        "50@292.5@11",
        "50@67.5@11",
        "75@348.75@11",
        "75@11.25@11",
        "Port@4@34",
        "Stbd 80 m@356@34",
        "depth H 10.0 m@194.5@35",
        "screen 10.0 m@230.9599609375@-34",
      ],
      "62bb02fb",
    ],
    [
      "a depth whose 1.4 times is just under a range step: that step",
      { dep: "10.5", s1: "10.5", s2: "11" },
      {},
      [
        "r:Depth under transducer (H)=10.5 m|Screen distance to object (slant)=10.5 m|True horizontal distance=0.00 m|Object depth (on the bottom)=10.5 m|Object height=10.5 m|Shadow ends on screen at=11.0 m [shown]",
        "t:Object on the bottom, about 10.5 m tall, starboard side, passed and now halfway down. Range 15 m per side.",
      ],
      "97:104bebb6",
      [
        "5@240@11",
        "5@120@11",
        "10@300@11",
        "10@60@11",
        "Port@4@34",
        "Stbd 15 m@356@34",
        "depth H 10.5 m@298@35",
        "screen 10.5 m@243@-34",
      ],
      "c348e7d4",
    ],
    [
      "a depth whose 1.4 times is just over a range step, with a near shadow: the next step",
      { dep: "11", s1: "11", s2: "11.5" },
      {},
      [
        "r:Depth under transducer (H)=11.0 m|Screen distance to object (slant)=11.0 m|True horizontal distance=0.00 m|Object depth (on the bottom)=11.0 m|Object height=11.0 m|Shadow ends on screen at=11.5 m [shown]",
        "t:Object on the bottom, about 11.0 m tall, starboard side, passed and now halfway down. Range 20 m per side.",
      ],
      "107:38e4f7a7",
      [
        "5@225@11",
        "5@135@11",
        "10@270@11",
        "10@90@11",
        "15@315@11",
        "15@45@11",
        "Port@4@34",
        "Stbd 20 m@356@34",
        "depth H 11.0 m@271@35",
        "screen 11.0 m@230.9599609375@-34",
      ],
      "ef10ca82",
    ],
    [
      "no object, a depth whose 2.5 times is just over a range step: the next step",
      { dep: "6.1", s1: "5" },
      {},
      ["[hidden]", "t:Fix the shadow values above to place the object. Range 20 m per side."],
      "88:4d6c96a9",
      [
        "5@225@11",
        "5@135@11",
        "10@270@11",
        "10@90@11",
        "15@315@11",
        "15@45@11",
        "Port@4@34",
        "Stbd 20 m@356@34",
        "depth H 6.1 m@226.9@35",
      ],
      "7d73b8a0",
    ],
    [
      "a suspended object far out: its least height and the least widths of object and shadow",
      { ro: "20", rs: "40" },
      SUSP,
      [
        "r:Depth under transducer (H)=10.0 m|Screen distance to object (slant)=20.0 m|True horizontal distance=19.4 m|Object depth below transducer=5.0 m|Height above bottom=5.0 m|Shadow on screen at=40.0 m [shown]",
        "t:Suspended object 5.0 m below the transducer, starboard side, passed and now halfway down. Range 60 m per side.",
      ],
      "127:1d563744",
      [
        "10@210@11",
        "10@150@11",
        "20@240@11",
        "20@120@11",
        "30@270@11",
        "30@90@11",
        "40@300@11",
        "40@60@11",
        "50@330@11",
        "50@30@11",
        "Port@4@34",
        "Stbd 60 m@356@34",
        "depth H 10.0 m@202@35",
        "screen 20.0 m@230.9599609375@-34",
      ],
      "0099e188",
    ],
    [
      "a suspended object next to the boat: it is drawn on the centre column too",
      { ro: "0.3" },
      SUSP,
      [
        "r:Depth under transducer (H)=10.0 m|Screen distance to object (slant)=0.30 m|True horizontal distance=0.21 m|Object depth below transducer=0.21 m|Height above bottom=9.8 m|Shadow on screen at=14.1 m [shown]",
        "t:Suspended object 0.21 m below the transducer, starboard side, passed and now halfway down. Range 20 m per side.",
      ],
      "107:6882b159",
      [
        "5@225@11",
        "5@135@11",
        "10@270@11",
        "10@90@11",
        "15@315@11",
        "15@45@11",
        "Port@4@34",
        "Stbd 20 m@356@34",
        "depth H 10.0 m@262@35",
        "screen 0.30 m@230.9599609375@-34",
      ],
      "009e9a97",
    ],
    [
      "values that are not round: the depth of the suspended object, in the values and in the line",
      { dep: "1.5", ro: "3.5", rs: "5" },
      SUSP,
      [
        "r:Depth under transducer (H)=1.5 m|Screen distance to object (slant)=3.5 m|True horizontal distance=3.3 m|Object depth below transducer=1.1 m|Height above bottom=0.45 m|Shadow on screen at=5.0 m [shown]",
        "t:Suspended object 1.1 m below the transducer, starboard side, passed and now halfway down. Range 10 m per side.",
      ],
      "87:106eb4ff",
      [
        "5@270@11",
        "5@90@11",
        "Port@4@34",
        "Stbd 10 m@356@34",
        "depth H 1.5 m@199@35",
        "screen 3.5 m@227.34765625@-34",
      ],
      "e4f86c94",
    ],
    [
      "values that are not round: the height of the object on the bottom",
      { dep: "5", s1: "10", s2: "35" },
      {},
      [
        "r:Depth under transducer (H)=5.0 m|Screen distance to object (slant)=10.0 m|True horizontal distance=8.7 m|Object depth (on the bottom)=5.0 m|Object height=3.7 m|Shadow ends on screen at=35.0 m [shown]",
        "t:Object on the bottom, about 3.7 m tall, starboard side, passed and now halfway down. Range 50 m per side.",
      ],
      "117:58b2f661",
      [
        "10@216@11",
        "10@144@11",
        "20@252@11",
        "20@108@11",
        "30@288@11",
        "30@72@11",
        "40@324@11",
        "40@36@11",
        "Port@4@34",
        "Stbd 50 m@356@34",
        "depth H 5.0 m@190@35",
        "screen 10.0 m@230.9599609375@-34",
      ],
      "0a00aa3b",
    ],
    [
      "values that are not round: where the two depth lines stand",
      { dep: "2.3", s1: "2.99", s2: "6.67" },
      {},
      [
        "r:Depth under transducer (H)=2.3 m|Screen distance to object (slant)=3.0 m|True horizontal distance=1.9 m|Object depth (on the bottom)=2.3 m|Object height=1.6 m|Shadow ends on screen at=6.7 m [shown]",
        "t:Object on the bottom, about 1.6 m tall, starboard side, passed and now halfway down. Range 10 m per side.",
      ],
      "87:7db37393",
      [
        "5@270@11",
        "5@90@11",
        "Port@4@34",
        "Stbd 10 m@356@34",
        "depth H 2.3 m@213.4@35",
        "screen 3.0 m@227.34765625@-34",
      ],
      "2fbd0bc7",
    ],
    [
      "values that are not round: the distance of each pixel from the boat",
      { dep: "20", ro: "14", rs: "30" },
      SUSP,
      [
        "r:Depth under transducer (H)=20.0 m|Screen distance to object (slant)=14.0 m|True horizontal distance=10.4 m|Object depth below transducer=9.3 m|Height above bottom=10.7 m|Shadow on screen at=30.0 m [shown]",
        "t:Suspended object 9.3 m below the transducer, starboard side, passed and now halfway down. Range 40 m per side.",
      ],
      "107:2b452315",
      [
        "10@225@11",
        "10@135@11",
        "20@270@11",
        "20@90@11",
        "30@315@11",
        "30@45@11",
        "Port@4@34",
        "Stbd 40 m@356@34",
        "depth H 20.0 m@262@35",
        "screen 14.0 m@230.9599609375@-34",
      ],
      "10b73b0f",
    ],
  ];

  it.each(cases)("%s", (_what, fields, ui, expected, screen, texts, digest) => {
    const input = inputOf(fieldsOf(fields), uiOf(ui), "en-US");
    const view = sideScanView(input);
    const log = drawn(input);
    expect(toldOf(view, SIM)).toEqual(expected);
    expect(logTexts(log)).toEqual(texts);
    expect(logSum(log)).toBe(screen);
    expect(digestOf(view)).toBe(digest);
  });

  it("draws the screen at the page's size as the earlier lines do, entry for entry", () => {
    const log = drawn(inputOf(fieldsOf(), uiOf(), "en-US"), SIM_HEIGHT);
    expect(logSum(log)).toBe("97:d02c40d5");
    expect(log.slice(0, 12)).toEqual([
      ["=fillStyle", "#0b0703"],
      ["fillRect", 0, 0, 360, 400],
      ["createImageData", 360, 400, { $: "ImageData", w: 360, h: 400, fnv1a: "9ae7a5c5" }],
      ["putImageData", { $: "ImageData", w: 360, h: 400, fnv1a: "d73bb1e4" }, 0, 0],
      ["=strokeStyle", "rgba(255,220,160,0.35)"],
      ["setLineDash", [4, 5]],
      ["=lineWidth", 1],
      ["beginPath"],
      ["moveTo", 180, 0],
      ["lineTo", 180, 400],
      ["stroke"],
      ["=font", `11px ${FONT_DATA}`],
    ]);
    expect(log.slice(-25)).toEqual([
      ["measureText", "depth H 10.0 m", { font: `12px ${FONT_DATA}`, width: 101.14453125 }],
      ["=fillStyle", "rgba(0,0,0,0.75)"],
      ["fillRect", 126.85546875, 22, 109.14453125, 17],
      ["=fillStyle", "#7fcbff"],
      ["=textAlign", "right"],
      ["fillText", "depth H 10.0 m", 232, 35],
      ["=strokeStyle", "#ffffff"],
      ["=fillStyle", "#ffffff"],
      ["=lineWidth", 1.5],
      ["beginPath"],
      ["moveTo", 180, 154],
      ["lineTo", 300, 154],
      ["moveTo", 180, 149],
      ["lineTo", 180, 159],
      ["moveTo", 300, 149],
      ["lineTo", 300, 159],
      ["moveTo", 300, 159],
      ["lineTo", 300, 188],
      ["stroke"],
      ["measureText", "screen 20.0 m", { font: `12px ${FONT_DATA}`, width: 93.919921875 }],
      ["=fillStyle", "rgba(0,0,0,0.65)"],
      ["fillRect", 189.0400390625, 134, 101.919921875, 16],
      ["=fillStyle", "#ffffff"],
      ["=textAlign", "center"],
      ["fillText", "screen 20.0 m", 240, 146],
    ]);
  });

  it("writes the texts of the screen as the locale writes them", () => {
    const input = inputOf(fieldsOf({ dep: "7,5" }), uiOf(SUSP), "sv-SE");
    const view = sideScanView(input);
    const log = drawn(input);
    expect(toldOf(view, SIM)).toEqual([
      "r:Depth under transducer (H)=7,5 m|Screen distance to object (slant)=7,1 m|True horizontal distance=6,0 m|Object depth below transducer=3,8 m|Height above bottom=3,7 m|Shadow on screen at=14,1 m [shown]",
      "t:Suspended object 3,8 m below the transducer, starboard side, passed and now halfway down. Range 20 m per side.",
    ]);
    expect(logTexts(log).slice(-2)).toEqual([
      "depth H 7,5 m@239.5@35",
      "screen 7,1 m@227.34765625@-34",
    ]);
    expect(logSum(log)).toBe("107:1eb0d03c");
    expect(digestOf(view)).toBe("1e0f2262");
    expect(logSum(drawn(inputOf(fieldsOf(), uiOf(), "sv-SE")))).toBe("97:f1368f1b");
  });

  it("sets a font without a family when the style names none, as the earlier page does", () => {
    const input = inputOf(fieldsOf(), uiOf(), "en-US", {});
    const log = drawn(input);
    expect(log.filter((entry) => entry[0] === "=font")).toEqual([
      ["=font", "11px "],
      ["=font", "12px "],
    ]);
    expect(logSum(log)).toBe("97:3695de1f");
    expect(digestOf(sideScanView(input))).toBe("4ef02d1f");
  });

  it("draws nothing while the depth is wrong, and the whole screen once it is right again", () => {
    const { surface, log } = recordingSurface(SIM_WIDTH, STAND_IN_HEIGHT, standInMeasure);
    paintSideScan(surface, inputOf(fieldsOf({ dep: "0" }), uiOf(), "en-US"));
    paintSideScan(surface, inputOf(fieldsOf({ dep: "" }), uiOf(), "en-US"));
    expect(log).toEqual([]);
    paintSideScan(surface, inputOf(fieldsOf(), uiOf(), "en-US"));
    expect(logSum(log)).toBe(BOTTOM_SCREEN);
  });
});

describe("the error graph (drawErr, lines 434 to 463)", () => {
  const AXIS = "0|5|10|15|20|25|30|Distance on screen (m)|m";
  const none = { 1: false, 3: false, 5: false, 8: false, 10: false };

  // what is tested, the depths ticked, the graph, the digest of the whole view
  const cases: [string, Record<string, boolean>, string, string][] = [
    [
      "all five depths, with the two marks of 10 m",
      { 1: true, 3: true, 5: true, 8: true, 10: true },
      `h:e1962a3a:15667 x:0|2|4|6|8|10|${AXIS}|2.7|7.3`,
      "4ef02d1f",
    ],
    [
      "no depth: an empty graph up to 1 m",
      none,
      `h:937252e9:1667 x:0.0|0.5|1.0|${AXIS}`,
      "e37bada0",
    ],
    ["no entry at all: the same", {}, `h:937252e9:1667 x:0.0|0.5|1.0|${AXIS}`, "e37bada0"],
    ["1 m: steps of 0.5", { 1: true }, `h:8b8ea683:4506 x:0.0|0.5|1.0|${AXIS}`, "ac530676"],
    [
      "1 m and 3 m: steps of 1",
      { 1: true, 3: true },
      `h:8a3e566d:7480 x:0|1|2|3|${AXIS}`,
      "93e44a84",
    ],
    ["5 m: steps of 1", { 5: true }, `h:2e7c3790:4887 x:0|1|2|3|4|5|${AXIS}`, "5fe2c9f9"],
    ["8 m: steps of 2", { 8: true }, `h:f880e44c:4292 x:0|2|4|6|8|${AXIS}`, "28c63c43"],
    [
      "10 m alone: its two marks",
      { 10: true },
      `h:cc05ca4d:5069 x:0|2|4|6|8|10|${AXIS}|2.7|7.3`,
      "0c666142",
    ],
    [
      "all but 10 m: no marks",
      { 1: true, 3: true, 5: true, 8: true, 10: false },
      `h:761a1e78:12603 x:0|2|4|6|8|${AXIS}`,
      "60e0b62f",
    ],
  ];

  it.each(cases)("%s", (_what, errOn, graph, digest) => {
    const view = viewOf({}, { errOn });
    expect(toldOf(view, ["err-svg"])).toEqual([graph]);
    expect(digestOf(view)).toBe(digest);
  });

  it("draws a depth whose saved choice is not `true` but counts as true", () => {
    // The saved state is JSON: it can hold a number where the type names true or false.
    const ui: UiState = { ...uiOf(), ...JSON.parse('{"errOn":{"5":1}}') };
    const view = sideScanView(inputOf(fieldsOf(), ui, "en-US"));
    expect(toldOf(view, ["err-svg"])).toEqual([`h:2e7c3790:4887 x:0|1|2|3|4|5|${AXIS}`]);
    expect(digestOf(view)).toBe("5fe2c9f9");
  });

  it("draws two lines for each depth ticked", () => {
    const paths = (errOn: Record<string, boolean>): number =>
      (viewOf({}, { errOn })["err-svg"]?.html ?? "").split("<path ").length - 1;
    expect(paths(none)).toBe(0);
    expect(paths({ 5: true })).toBe(2);
    expect(paths({ 1: true, 3: true, 5: true, 8: true, 10: true })).toBe(10);
  });

  it("writes its numbers with a decimal point in every locale, as the earlier page does", () => {
    const graph = (errOn: Record<string, boolean>): string[] =>
      toldOf(viewOf({}, { errOn }, "sv-SE"), ["err-svg"]);
    expect(graph({ 1: true })).toEqual([`h:8b8ea683:4506 x:0.0|0.5|1.0|${AXIS}`]);
    expect(graph({ 10: true })).toEqual([`h:cc05ca4d:5069 x:0|2|4|6|8|10|${AXIS}|2.7|7.3`]);
    expect(digestOf(viewOf({}, { errOn: { 1: true } }, "sv-SE"))).toBe("11a29e08");
    expect(digestOf(viewOf({}, { errOn: { 10: true } }, "sv-SE"))).toBe("e0c76f34");
  });
});

describe("the relative-error graph and its table (drawRel, lines 469 to 499)", () => {
  const REL = ["rel-svg", "rel-tab"];
  const SHARES = "Distance on screen (m)|10%|5%|2%|1%";
  const Y = "0%|5%|10%|15%|20%";
  const AT_5 = [
    `h:976b1ac5:8035 x:${Y}|0|10|20|30|40|50|${SHARES}`,
    "r:Depth 5.0 m=screen distance|Under 10% from=solid 12.0 m · dashed 47.6 m|Under 5% from=solid 16.4 m · dashed 97.6 m|Under 2% from=solid 25.4 m · dashed 247.5 m|Under 1% from=solid 35.6 m · dashed 497.5 m",
  ];
  const AT_8 = [
    `h:b4345f9b:8071 x:${Y}|0|10|20|30|40|50|60|70|${SHARES}`,
    "r:Depth 8.0 m=screen distance|Under 10% from=solid 19.2 m · dashed 76.2 m|Under 5% from=solid 26.2 m · dashed 156.1 m|Under 2% from=solid 40.6 m · dashed 396.0 m|Under 1% from=solid 57.0 m · dashed 796.0 m",
  ];

  // the depth chosen, as the saved state can hold it; the graph and the table; the digest of the whole view
  const cases: [string, unknown, string[], string][] = [
    [
      "1 m",
      1,
      [
        `h:1f0c0dad:9636 x:${Y}|0|5|10|15|20|25|30|${SHARES}`,
        "r:Depth 1.0 m=screen distance|Under 10% from=solid 2.4 m · dashed 9.5 m|Under 5% from=solid 3.3 m · dashed 19.5 m|Under 2% from=solid 5.1 m · dashed 49.5 m|Under 1% from=solid 7.1 m · dashed 99.5 m",
      ],
      "b0e21b16",
    ],
    [
      "3 m",
      3,
      [
        `h:9de58b71:8204 x:${Y}|0|5|10|15|20|25|30|${SHARES}`,
        "r:Depth 3.0 m=screen distance|Under 10% from=solid 7.2 m · dashed 28.6 m|Under 5% from=solid 9.8 m · dashed 58.5 m|Under 2% from=solid 15.2 m · dashed 148.5 m|Under 1% from=solid 21.4 m · dashed 298.5 m",
      ],
      "cae10e0b",
    ],
    ["5 m", 5, AT_5, "4ef02d1f"],
    ["8 m", 8, AT_8, "db668395"],
    [
      "10 m",
      10,
      [
        `h:4b953c76:8403 x:${Y}|0|10|20|30|40|50|60|70|80|90|${SHARES}`,
        "r:Depth 10.0 m=screen distance|Under 10% from=solid 24.0 m · dashed 95.3 m|Under 5% from=solid 32.8 m · dashed 195.1 m|Under 2% from=solid 50.7 m · dashed 495.1 m|Under 1% from=solid 71.2 m · dashed 995.0 m",
      ],
      "ae42d70d",
    ],
    ["8 m saved as a text", "8", AT_8, "db668395"],
    ["a depth that is not one of the five: 5 m", 7, AT_5, "4ef02d1f"],
    ["nothing saved: 5 m", null, AT_5, "4ef02d1f"],
    ["a text that is no number: 5 m", "deep", AT_5, "4ef02d1f"],
  ];

  it.each(cases)("%s", (_what, relDepth, expected, digest) => {
    // The saved state is JSON: it can hold what the type of the view state does not name.
    const ui: UiState = { ...uiOf(), ...JSON.parse(JSON.stringify({ relDepth })) };
    const view = sideScanView(inputOf(fieldsOf(), ui, "en-US"));
    expect(toldOf(view, REL)).toEqual(expected);
    expect(digestOf(view)).toBe(digest);
  });

  it("writes the table as the locale writes it, and the graph's numbers as they are", () => {
    const view = viewOf({}, { relDepth: 10 }, "sv-SE");
    expect(toldOf(view, REL)).toEqual([
      `h:4b953c76:8403 x:${Y}|0|10|20|30|40|50|60|70|80|90|${SHARES}`,
      "r:Depth 10,0 m=screen distance|Under 10% from=solid 24,0 m · dashed 95,3 m|Under 5% from=solid 32,8 m · dashed 195,1 m|Under 2% from=solid 50,7 m · dashed 495,1 m|Under 1% from=solid 71,2 m · dashed 995,0 m",
    ]);
    expect(digestOf(view)).toBe("855a3c47");
  });
});

describe("the four functions of the relative-error graph (lines 464 to 467)", () => {
  const FUNCTIONS = { relSolid, relDash, solidAt, dashAt };

  // the function, its two arguments, what the earlier function gives
  const cases: [keyof typeof FUNCTIONS, number, number, number][] = [
    ["relSolid", 20, 10, 0.1547005383792514],
    ["relSolid", 12.5, 5, 0.09108945117996199],
    ["relSolid", 10, 10, Number.POSITIVE_INFINITY],
    ["relSolid", 5, 10, Number.NaN],
    ["relSolid", Number.NaN, 10, Number.NaN],
    ["relDash", 20, 10, 0.42264973081037427],
    ["relDash", 12.5, 5, 0.3453463292920228],
    ["relDash", 10, 10, Number.NaN],
    ["relDash", 5, 10, Number.NaN],
    ["relDash", Number.NaN, 10, Number.NaN],
    ["solidAt", 0.1, 5, 12.001983962979578],
    ["solidAt", 0.05, 5, 16.39824499830363],
    ["solidAt", 0.02, 5, 25.37344835035474],
    ["solidAt", 0.01, 5, 35.61995360085916],
    ["solidAt", 0.01, 10, 71.23990720171832],
    ["solidAt", 0.1, 1, 2.4003967925959153],
    ["solidAt", 0, 5, Number.POSITIVE_INFINITY],
    ["solidAt", -2, 5, Number.POSITIVE_INFINITY],
    ["solidAt", -1, 5, Number.NaN],
    ["solidAt", Number.NaN, 5, Number.NaN],
    ["solidAt", 0.1, 0, 0],
    ["dashAt", 0.1, 5, 47.63157894736842],
    ["dashAt", 0.05, 5, 97.56410256410251],
    ["dashAt", 0.02, 5, 247.52525252525245],
    ["dashAt", 0.01, 5, 497.51256281407075],
    ["dashAt", 0.01, 10, 995.0251256281415],
    ["dashAt", 0.1, 1, 9.526315789473687],
    ["dashAt", 0, 5, 5000000],
    ["dashAt", 1, 5, 5.000000500000001],
    ["dashAt", 2, 5, 5.000000500000001],
    ["dashAt", Number.NaN, 5, 5.000000500000001],
    ["dashAt", 0.1, 0, 0],
    // Values that are not round, where another order of the arithmetic gives other digits.
    ["relDash", 1.03, 1, 0.8784338652290337],
    ["relSolid", 1.03, 1, 3.1737706271365065],
    ["relDash", 7.3, 3, 0.3538763832242782],
    ["relSolid", 7.3, 3, 0.09690753545645792],
  ];

  it.each(cases)("%s(%d, %d) is %d", (name, a, b, expected) => {
    expect(FUNCTIONS[name](a, b)).toBe(expected);
  });
});

describe("the beam of the chosen frequency (ssBeam, lines 518 to 574)", () => {
  const BEAM = ["ssb-back", "ssb-top", "ssb-res"];
  const TOP = "↑ heading|port fan|starboard fan";
  const NO_GAP = "Blind gap under the boat=none, the fans reach straight down";
  const FIRST = [
    "h:a3483d2d:1251 x:port|starboard|0–38.7 m {viewBox=0 0 340 103}",
    `h:c5ada921:5351 x:${TOP}|0|10|10|20|20|30|30|front-to-back ×9 to be visible`,
    `r:Frequency drawn=455 kHz CHIRP, 85° fan|Range used=40.0 m per side (maximum for this frequency 91.0 m)|${NO_GAP}|Bottom covered=77.5 m wide strip of bottom: from under the boat out to 38.7 m each side|Limited by=the range setting|Strip length at the outer edge=1.4 m front to back`,
  ];
  const SECOND = [
    "h:92c7435e:1140 x:port|starboard|0–7.3 m {viewBox=0 0 340 131}",
    `h:324a15ad:5180 x:${TOP}|0|10|10|20|20|front-to-back ×13 to be visible`,
    `r:Frequency drawn=1075 kHz CHIRP, 36° fan, drawn 0.42× as wide and thick as the widest|Range used=40.0 m per side (maximum for this frequency 46.0 m)|${NO_GAP}|Bottom covered=14.5 m wide strip of bottom: from under the boat out to 7.3 m each side|Limited by=the upper edge of the fan meeting the bottom|Strip length at the outer edge=0.18 m front to back`,
  ];

  // what is tested, the fields changed, the frequency chosen, the transducer, the three elements, the digest
  const cases: [string, RawFields, unknown, string, string[], string][] = [
    ["the first frequency", {}, "0", "lowrance", FIRST, "4ef02d1f"],
    [
      "the second frequency: a narrower fan at the inner edge",
      {},
      "1",
      "lowrance",
      SECOND,
      "3f46e1f3",
    ],
    ["the second frequency saved as a number", {}, 1, "lowrance", SECOND, "3f46e1f3"],
    [
      "the second frequency aimed around the center line: a gap under the boat",
      { ssalign: "center" },
      "1",
      "lowrance",
      [
        "h:b05a45f7:1314 x:port|starboard|gap 9.1 m|4.6–17.7 m {viewBox=0 0 340 108}",
        `h:d4b3b0fc:5415 x:${TOP}|0|10|10|20|20|30|30|front-to-back ×19 to be visible`,
        "r:Frequency drawn=1075 kHz CHIRP, 36° fan, drawn 0.42× as wide and thick as the widest|Range used=40.0 m per side (maximum for this frequency 46.0 m)|Blind gap under the boat=9.1 m wide|Bottom covered=2 × 13.1 m of bottom: from 4.6 to 17.7 m out each side, with a 9.1 m gap under the boat|Limited by=the upper edge of the fan meeting the bottom|Strip length at the outer edge=0.30 m front to back",
      ],
      "bf0253d8",
    ],
    [
      "the widest fan aimed around the center line: as before",
      { ssalign: "center" },
      "0",
      "lowrance",
      FIRST,
      "4ef02d1f",
    ],
    ["a frequency that is not there: the first", {}, "7", "lowrance", FIRST, "4ef02d1f"],
    ["a frequency that is a text: the first", {}, "abc", "lowrance", FIRST, "4ef02d1f"],
    ["a negative frequency: the first", {}, "-1", "lowrance", FIRST, "4ef02d1f"],
    [
      "a frequency under 1 that is no whole number: the first",
      {},
      "0.5",
      "lowrance",
      FIRST,
      "4ef02d1f",
    ],
    [
      "a frequency between the two: the first, not the second",
      {},
      "1.5",
      "lowrance",
      FIRST,
      "4ef02d1f",
    ],
    [
      "a range beyond the frequency's greatest: the greatest is used",
      { ssr: "200" },
      "0",
      "lowrance",
      [
        "h:dce0d432:1160 x:port|starboard|0–90.4 m {viewBox=0 0 340 80}",
        `h:2b3fc9a9:5351 x:${TOP}|0|25|25|50|50|75|75|front-to-back ×9 to be visible`,
        `r:Frequency drawn=455 kHz CHIRP, 85° fan|Range used=91.0 m per side (this frequency's maximum; your setting is 200.0 m)|${NO_GAP}|Bottom covered=180.9 m wide strip of bottom: from under the boat out to 90.4 m each side|Limited by=this frequency's maximum side range|Strip length at the outer edge=3.2 m front to back`,
      ],
      "3a8ad397",
    ],
    [
      "a range shorter than the depth: the bottom is not reached",
      { ssr: "5" },
      "0",
      "lowrance",
      [
        "h:220540c1:1422 x:port|starboard {viewBox=0 0 340 223}",
        `h:3bedf690:2757 x:${TOP}|0|front-to-back ×9 to be visible`,
        `r:Frequency drawn=455 kHz CHIRP, 85° fan|Range used=5.0 m per side (maximum for this frequency 91.0 m)|${NO_GAP}|Bottom covered=none, the range doesn't reach the bottom`,
      ],
      "56846773",
    ],
    [
      "a range equal to the depth: not reached either",
      { ssr: "10" },
      "0",
      "lowrance",
      [
        "h:33d9cc94:1629 x:port|starboard {viewBox=0 0 340 223}",
        `h:b434cb45:2975 x:${TOP}|0|5|5|front-to-back ×9 to be visible`,
        `r:Frequency drawn=455 kHz CHIRP, 85° fan|Range used=10.0 m per side (maximum for this frequency 91.0 m)|${NO_GAP}|Bottom covered=none, the range doesn't reach the bottom`,
      ],
      "953b2f3b",
    ],
    [
      "a range just beyond the depth: a mark every 5 m",
      { ssr: "12" },
      "0",
      "lowrance",
      [
        "h:d4d83ba9:1698 x:port|starboard|0–6.6 m {viewBox=0 0 340 196}",
        `h:63caeaa4:5140 x:${TOP}|0|5|5|10|10|front-to-back ×9 to be visible`,
        `r:Frequency drawn=455 kHz CHIRP, 85° fan|Range used=12.0 m per side (maximum for this frequency 91.0 m)|${NO_GAP}|Bottom covered=13.3 m wide strip of bottom: from under the boat out to 6.6 m each side|Limited by=the range setting|Strip length at the outer edge=0.42 m front to back`,
      ],
      "c9658810",
    ],
    [
      "a transducer without a published range",
      {},
      "0",
      "other",
      [
        FIRST[0] ?? "",
        FIRST[1] ?? "",
        `r:Frequency drawn=Low, 85° fan|Range used=40.0 m per side (no published maximum)|${NO_GAP}|Bottom covered=77.5 m wide strip of bottom: from under the boat out to 38.7 m each side|Limited by=the range setting|Strip length at the outer edge=1.4 m front to back`,
      ],
      "b969d0f5",
    ],
    [
      "without a published range, far out: the fan's upper edge limits",
      { ssr: "300" },
      "0",
      "other",
      [
        "h:2b40a5a4:1149 x:port|starboard|0–114.3 m {viewBox=0 0 340 68}",
        `h:97f5e47a:7578 x:${TOP}|0|25|25|50|50|75|75|100|100|125|125|150|150|175|175|200|200|225|225|250|250|275|275|front-to-back ×9 to be visible`,
        `r:Frequency drawn=Low, 85° fan|Range used=300.0 m per side (no published maximum)|${NO_GAP}|Bottom covered=228.6 m wide strip of bottom: from under the boat out to 114.3 m each side|Limited by=the upper edge of the fan meeting the bottom|Strip length at the outer edge=4.0 m front to back`,
      ],
      "93b2a64b",
    ],
    [
      "an upper edge at the horizon: only the range limits",
      { sso: "0" },
      "0",
      "lowrance",
      [
        "h:522f1db4:1320 x:port|starboard|gap 1.7 m|0.87–38.7 m {viewBox=0 0 340 102}",
        `h:f6df1136:5498 x:${TOP}|0|10|10|20|20|30|30|40|40|front-to-back ×9 to be visible`,
        "r:Frequency drawn=455 kHz CHIRP, 85° fan|Range used=40.0 m per side (maximum for this frequency 91.0 m)|Blind gap under the boat=1.7 m wide|Bottom covered=2 × 37.9 m of bottom: from 0.87 to 38.7 m out each side, with a 1.7 m gap under the boat|Limited by=the range setting|Strip length at the outer edge=1.4 m front to back",
      ],
      "231913e0",
    ],
    [
      "a fan that does not reach straight down: a gap",
      { sso: "20", side0: "60" },
      "0",
      "lowrance",
      [
        "h:285570ba:1304 x:port|starboard|gap 3.5 m|1.8–27.5 m {viewBox=0 0 340 105}",
        `h:e1689e67:5371 x:${TOP}|0|10|10|20|20|30|30|front-to-back ×9 to be visible`,
        "r:Frequency drawn=455 kHz CHIRP, 60° fan|Range used=40.0 m per side (maximum for this frequency 91.0 m)|Blind gap under the boat=3.5 m wide|Bottom covered=2 × 25.7 m of bottom: from 1.8 to 27.5 m out each side, with a 3.5 m gap under the boat|Limited by=the upper edge of the fan meeting the bottom|Strip length at the outer edge=1.0 m front to back",
      ],
      "a60c34ae",
    ],
    [
      "a steep fan",
      { sso: "60", side0: "30", side1: "20" },
      "0",
      "lowrance",
      [
        "h:f519fdc4:1127 x:port|starboard|0–5.8 m {viewBox=0 0 340 142}",
        `h:abb68e7c:5148 x:${TOP}|0|10|10|20|20|front-to-back ×5 to be visible`,
        `r:Frequency drawn=455 kHz CHIRP, 30° fan|Range used=40.0 m per side (maximum for this frequency 91.0 m)|${NO_GAP}|Bottom covered=11.5 m wide strip of bottom: from under the boat out to 5.8 m each side|Limited by=the upper edge of the fan meeting the bottom|Strip length at the outer edge=0.40 m front to back`,
      ],
      "196dc5e6",
    ],
    [
      "the third frequency of another transducer, a long range: a mark every 25 m",
      { ssr: "150" },
      "2",
      "hb_xm14hw",
      [
        "h:c29098e2:1133 x:port|starboard|0–143.0 m {viewBox=0 0 340 73}",
        `h:b5b2fa4f:5890 x:${TOP}|0|25|25|50|50|75|75|100|100|125|125|front-to-back ×9 to be visible`,
        `r:Frequency drawn=MEGA Imaging+, 86° fan|Range used=150.0 m per side (maximum for this frequency 152.0 m)|${NO_GAP}|Bottom covered=286.0 m wide strip of bottom: from under the boat out to 143.0 m each side|Limited by=the upper edge of the fan meeting the bottom|Strip length at the outer edge=5.0 m front to back`,
      ],
      "bbfca81c",
    ],
    [
      "a thin fan: drawn much thicker to be seen",
      { sst: "0.1" },
      "0",
      "lowrance",
      [
        FIRST[0] ?? "",
        `h:c37d2943:5353 x:${TOP}|0|10|10|20|20|30|30|front-to-back ×186 to be visible`,
        `r:Frequency drawn=455 kHz CHIRP, 85° fan|Range used=40.0 m per side (maximum for this frequency 91.0 m)|${NO_GAP}|Bottom covered=77.5 m wide strip of bottom: from under the boat out to 38.7 m each side|Limited by=the range setting|Strip length at the outer edge=0.07 m front to back`,
      ],
      "3d5eb387",
    ],
    [
      "a thick fan: drawn to scale",
      { sst: "29", dep: "30", ssr: "35" },
      "0",
      "lowrance",
      [
        "h:ff9ef518:1723 x:port|starboard|0–18.0 m {viewBox=0 0 340 200}",
        `h:39e57691:5554 x:${TOP}|0|10|10|20|20|30|30|to scale`,
        `r:Frequency drawn=455 kHz CHIRP, 85° fan|Range used=35.0 m per side (maximum for this frequency 91.0 m)|${NO_GAP}|Bottom covered=36.1 m wide strip of bottom: from under the boat out to 18.0 m each side|Limited by=the range setting|Strip length at the outer edge=18.1 m front to back`,
      ],
      "5f7bcad2",
    ],
    [
      "a fan that ends 1.5 cm from straight down: a gap, over the least of 5 mm",
      { sso: "4.9" },
      "0",
      "lowrance",
      [
        "h:0dd1254c:1416 x:port|starboard|gap 0.03 m|0.02–38.7 m {viewBox=0 0 340 103}",
        `h:6f95a061:5353 x:${TOP}|0|10|10|20|20|30|30|front-to-back ×9 to be visible`,
        "r:Frequency drawn=455 kHz CHIRP, 85° fan|Range used=40.0 m per side (maximum for this frequency 91.0 m)|Blind gap under the boat=0.03 m wide|Bottom covered=2 × 38.7 m of bottom: from 0.02 to 38.7 m out each side, with a 0.03 m gap under the boat|Limited by=the range setting|Strip length at the outer edge=1.4 m front to back",
      ],
      "8123edc0",
    ],
    [
      "a fan that ends 2 mm from straight down: no gap, under the least of 5 mm",
      { sso: "4.99" },
      "0",
      "lowrance",
      [
        "h:538e70cf:1274 x:port|starboard|0–38.7 m {viewBox=0 0 340 103}",
        `h:6c5c0b5c:5354 x:${TOP}|0|10|10|20|20|30|30|front-to-back ×9 to be visible`,
        `r:Frequency drawn=455 kHz CHIRP, 85° fan|Range used=40.0 m per side (maximum for this frequency 91.0 m)|${NO_GAP}|Bottom covered=77.5 m wide strip of bottom: from under the boat out to 38.7 m each side|Limited by=the range setting|Strip length at the outer edge=1.4 m front to back`,
      ],
      "ac5a2526",
    ],
    [
      "a second fan within a thousandth of the widest: not said to be drawn narrower",
      { side1: "84.95" },
      "1",
      "lowrance",
      [
        "h:384e232c:1250 x:port|starboard|0–38.7 m {viewBox=0 0 340 103}",
        `h:cdb26253:5353 x:${TOP}|0|10|10|20|20|30|30|front-to-back ×9 to be visible`,
        `r:Frequency drawn=1075 kHz CHIRP, 85° fan|Range used=40.0 m per side (maximum for this frequency 46.0 m)|${NO_GAP}|Bottom covered=77.5 m wide strip of bottom: from under the boat out to 38.7 m each side|Limited by=the range setting|Strip length at the outer edge=1.4 m front to back`,
      ],
      "e3c735b1",
    ],
    [
      "a second fan 0.94 times the widest: said to be drawn narrower",
      { side1: "80" },
      "1",
      "lowrance",
      [
        "h:dd81b8c1:1202 x:port|starboard|0–38.7 m {viewBox=0 0 340 103}",
        `h:35dd5ae3:5348 x:${TOP}|0|10|10|20|20|30|30|front-to-back ×10 to be visible`,
        `r:Frequency drawn=1075 kHz CHIRP, 80° fan, drawn 0.94× as wide and thick as the widest|Range used=40.0 m per side (maximum for this frequency 46.0 m)|${NO_GAP}|Bottom covered=77.5 m wide strip of bottom: from under the boat out to 38.7 m each side|Limited by=the range setting|Strip length at the outer edge=1.3 m front to back`,
      ],
      "03541625",
    ],
    [
      "a fan drawn under 1.05 times thicker: to scale",
      { sst: "18" },
      "0",
      "lowrance",
      [
        FIRST[0] ?? "",
        `h:fd85b2d2:5329 x:${TOP}|0|10|10|20|20|30|30|to scale`,
        `r:Frequency drawn=455 kHz CHIRP, 85° fan|Range used=40.0 m per side (maximum for this frequency 91.0 m)|${NO_GAP}|Bottom covered=77.5 m wide strip of bottom: from under the boat out to 38.7 m each side|Limited by=the range setting|Strip length at the outer edge=12.7 m front to back`,
      ],
      "c024cec1",
    ],
    [
      "a fan drawn between 1.05 and 1.5 times thicker: said to be drawn 1 time thicker",
      { sst: "15" },
      "0",
      "lowrance",
      [
        FIRST[0] ?? "",
        `h:a0d1d329:5351 x:${TOP}|0|10|10|20|20|30|30|front-to-back ×1 to be visible`,
        `r:Frequency drawn=455 kHz CHIRP, 85° fan|Range used=40.0 m per side (maximum for this frequency 91.0 m)|${NO_GAP}|Bottom covered=77.5 m wide strip of bottom: from under the boat out to 38.7 m each side|Limited by=the range setting|Strip length at the outer edge=10.5 m front to back`,
      ],
      "205b8422",
    ],
    [
      "a range a tenth of a millimetre short of where the upper edge meets the bottom: the range limits",
      { sso: "20", side0: "60", ssr: "29.237950032388802" },
      "0",
      "lowrance",
      [
        "h:fb865a7b:1331 x:port|starboard|gap 3.5 m|1.8–27.5 m {viewBox=0 0 340 121}",
        `h:4a46c986:5081 x:${TOP}|0|10|10|20|20|front-to-back ×9 to be visible`,
        "r:Frequency drawn=455 kHz CHIRP, 60° fan|Range used=29.2 m per side (maximum for this frequency 91.0 m)|Blind gap under the boat=3.5 m wide|Bottom covered=2 × 25.7 m of bottom: from 1.8 to 27.5 m out each side, with a 3.5 m gap under the boat|Limited by=the range setting|Strip length at the outer edge=1.0 m front to back",
      ],
      "4509ac2b",
    ],
    [
      "values that are not round: how far the range reaches along the bottom",
      { dep: "3.2", ssr: "55.5", sso: "3.3" },
      "0",
      "lowrance",
      [
        "h:bd69a3d0:1322 x:port|starboard|gap 0.19 m|0.09–55.4 m {viewBox=0 0 340 72}",
        `h:5df58008:5880 x:${TOP}|0|10|10|20|20|30|30|40|40|50|50|front-to-back ×9 to be visible`,
        "r:Frequency drawn=455 kHz CHIRP, 85° fan|Range used=55.5 m per side (maximum for this frequency 91.0 m)|Blind gap under the boat=0.19 m wide|Bottom covered=2 × 55.3 m of bottom: from 0.09 to 55.4 m out each side, with a 0.19 m gap under the boat|Limited by=the range setting|Strip length at the outer edge=1.9 m front to back",
      ],
      "622f2997",
    ],
    [
      "values that are not round: where the lower edge meets the bottom",
      { dep: "2.1", ssr: "91", sso: "12.5", side0: "70", sst: "1.7" },
      "0",
      "lowrance",
      [
        "h:67e95b05:1317 x:port|starboard|gap 0.55 m|0.28–9.5 m {viewBox=0 0 340 66}",
        `h:7a10f471:5444 x:${TOP}|0|25|25|50|50|75|75|front-to-back ×11 to be visible`,
        "r:Frequency drawn=455 kHz CHIRP, 70° fan|Range used=91.0 m per side (maximum for this frequency 91.0 m)|Blind gap under the boat=0.55 m wide|Bottom covered=2 × 9.2 m of bottom: from 0.28 to 9.5 m out each side, with a 0.55 m gap under the boat|Limited by=the upper edge of the fan meeting the bottom|Strip length at the outer edge=0.29 m front to back",
      ],
      "8f0a03af",
    ],
    [
      "a depth of 21 m: how much thicker the top view is drawn",
      { dep: "21" },
      "0",
      "lowrance",
      [
        "h:d7a969eb:1422 x:port|starboard|0–34.0 m {viewBox=0 0 340 147}",
        `h:5737ed89:5359 x:${TOP}|0|10|10|20|20|30|30|front-to-back ×9 to be visible`,
        `r:Frequency drawn=455 kHz CHIRP, 85° fan|Range used=40.0 m per side (maximum for this frequency 91.0 m)|${NO_GAP}|Bottom covered=68.1 m wide strip of bottom: from under the boat out to 34.0 m each side|Limited by=the range setting|Strip length at the outer edge=1.4 m front to back`,
      ],
      "15efa1fb",
    ],
  ];

  it.each(cases)("%s", (_what, fields, ssf, first, expected, digest) => {
    // The saved state is JSON: it can hold a number where the type names a text.
    const ui: UiState = { ...uiOf(), ...JSON.parse(JSON.stringify({ ssf })) };
    const view = sideScanView(inputOf(fieldsOf(fields, first), ui, "en-US"));
    expect(toldOf(view, BEAM)).toEqual(expected);
    expect(digestOf(view)).toBe(digest);
  });

  it("keeps a narrower fan at the inner edge on a page without the field that aims it", () => {
    const input = inputOf(fieldsOf(), uiOf({ ssf: "1" }), "en-US");
    const { ssalign: _left, ...local } = input.local;
    const view = sideScanView({ ...input, local });
    expect(toldOf(view, BEAM)).toEqual(SECOND);
    expect(digestOf(view)).toBe("3f46e1f3");
  });

  it("writes the numbers as the locale writes them", () => {
    const view = viewOf({ sso: "20", side0: "60" }, { ssf: "1" }, "sv-SE");
    expect(toldOf(view, BEAM)).toEqual([
      "h:734b14ed:1310 x:port|starboard|gap 3,5 m|1,8–10,4 m {viewBox=0 0 340 118}",
      `h:50ab78d3:5179 x:${TOP}|0|10|10|20|20|front-to-back ×11 to be visible`,
      "r:Frequency drawn=1075 kHz CHIRP, 36° fan, drawn 0,60× as wide and thick as the widest|Range used=40,0 m per side (maximum for this frequency 46,0 m)|Blind gap under the boat=3,5 m wide|Bottom covered=2 × 8,6 m of bottom: from 1,8 to 10,4 m out each side, with a 3,5 m gap under the boat|Limited by=the upper edge of the fan meeting the bottom|Strip length at the outer edge=0,30 m front to back",
    ]);
    expect(digestOf(view)).toBe("faa2f8e6");
  });

  it("names the frequencies the cases above rest on", () => {
    const sides = (first: string): [string, number, number | undefined][] =>
      combined(first, "").side.map((c) => [c.f, c.a, c.r]);
    expect(sides("lowrance")).toEqual([
      ["455 kHz CHIRP", 85, 91],
      ["1075 kHz CHIRP", 36, 46],
    ]);
    expect(sides("other")).toEqual([
      ["Low", 85, undefined],
      ["High", 55, undefined],
    ]);
    expect(sides("hb_xm14hw")[2]).toEqual(["MEGA Imaging+", 86, 152]);
  });

  it("fails as the earlier page does when the transducer has no side frequency", () => {
    const input = inputOf(fieldsOf(), uiOf(), "en-US");
    const settings = { ...input.settings, side: [], swmax: Number.NEGATIVE_INFINITY };
    expect(() => sideScanView({ ...input, settings })).toThrow(TypeError);
  });
});

describe("the section as a whole (renderSS, lines 576 to 584)", () => {
  const SECTION = ["bottom-tool", "susp-tool", "ss-serr"];
  const BEAM = ["ssb-back", "ssb-top", "ssb-res"];
  const BLANK = ["h:", "h:", "h:"];
  const NO_BEAM = [NOT, NOT, NOT];
  const ALWAYS = ["bottom-tool", "susp-tool", "err-svg", "rel-svg", "rel-tab", "ss-serr"];
  const fix = (what: string): string[] => [
    "[shown]",
    "[hidden]",
    `t:Fix the ${what} in Settings. [shown]`,
  ];

  // The matrix of docs/SPEC.md 3.1: the field that fails, the message of the section, how many
  // elements are written, how the three elements of the beam are left, the digest of the whole view
  const cases: [string, RawFields, string, string[], number, string[], string][] = [
    ["a depth of 0", { dep: "0" }, "lowrance", fix("depth"), 6, NO_BEAM, "d1b187de"],
    ["a blank depth", { dep: "" }, "lowrance", fix("depth"), 6, NO_BEAM, "d1b187de"],
    ["a range of 0", { ssr: "0" }, "lowrance", fix("SideScan range"), 28, BLANK, "13ab6eda"],
    ["a fan of 0°", { side0: "0" }, "lowrance", fix("SideScan angles"), 28, BLANK, "79dfcbc5"],
    [
      "an upper edge that takes the fan past straight down",
      { sso: "6" },
      "lowrance",
      fix("SideScan angles"),
      28,
      BLANK,
      "79dfcbc5",
    ],
    [
      "a thickness of 30°",
      { sst: "30" },
      "lowrance",
      fix("SideScan angles"),
      28,
      BLANK,
      "79dfcbc5",
    ],
    [
      "range and angles both wrong: the range is named",
      { ssr: "0", side0: "0" },
      "lowrance",
      fix("SideScan range"),
      28,
      BLANK,
      "13ab6eda",
    ],
    [
      "depth and range both wrong: the depth is named",
      { dep: "0", ssr: "0" },
      "lowrance",
      fix("depth"),
      6,
      NO_BEAM,
      "d1b187de",
    ],
    [
      "a blank range, with the name another brand gives its side imaging",
      { ssr: "" },
      "hb_xm14hw",
      fix("Side Imaging range"),
      28,
      BLANK,
      "b4558307",
    ],
    [
      "a thickness of 0°, with that name",
      { sst: "0" },
      "hb_xm14hw",
      fix("Side Imaging angles"),
      28,
      BLANK,
      "0f757cce",
    ],
  ];

  it.each(cases)("%s", (_what, fields, first, section, written, beam, digest) => {
    const view = viewOf(fields, {}, "en-US", first);
    expect(toldOf(view, SECTION)).toEqual(section);
    expect(Object.keys(view)).toHaveLength(written);
    expect(toldOf(view, BEAM)).toEqual(beam);
    expect(digestOf(view)).toBe(digest);
  });

  it("writes only the two graphs, the tools' state and the message while the depth is wrong", () => {
    const view = viewOf({ dep: "0" });
    expect(Object.keys(view).sort()).toEqual([...ALWAYS].sort());
    expect(toldOf(view, ["err-svg", "rel-svg"])).toEqual([
      "h:e1962a3a:15667 x:0|2|4|6|8|10|0|5|10|15|20|25|30|Distance on screen (m)|m|2.7|7.3",
      "h:976b1ac5:8035 x:0%|5%|10%|15%|20%|0|10|20|30|40|50|Distance on screen (m)|10%|5%|2%|1%",
    ]);
  });

  it("still writes the reading, the shadow tools and the screen while range or angles are wrong", () => {
    const wrong: RawFields[] = [{ ssr: "0" }, { side0: "0" }];
    for (const fields of wrong) {
      const input = inputOf(fieldsOf(fields), uiOf(), "en-US");
      const view = sideScanView(input);
      expect(toldOf(view, ["out-x", "c1", "b-h", "s-d", "sim-cap", "sketch"])).toEqual([
        "t:17.3 m",
        "t:20.0 m (2.7 too far)",
        "t:2.1 m",
        "t:5.0 m",
        "t:Object on the bottom, about 2.1 m tall, starboard side, passed and now halfway down. Range 30 m per side.",
        "h:3d3a8280:1054 x:H 10.0|horizontal 17.3 m|screen 20.0 m",
      ]);
      expect(logSum(drawn(input))).toBe("97:b35ba39f");
    }
  });

  it("shows the tool that is chosen, and neither for a choice that is no tool", () => {
    expect(toldOf(viewOf({}, { ssMode: "bottom" }), SECTION)).toEqual([
      "[shown]",
      "[hidden]",
      NO_ERR,
    ]);
    expect(toldOf(viewOf({}, { ssMode: "susp" }), SECTION)).toEqual([
      "[hidden]",
      "[shown]",
      NO_ERR,
    ]);
    expect(toldOf(viewOf({}, { ssMode: "neither" }), SECTION)).toEqual([
      "[hidden]",
      "[hidden]",
      NO_ERR,
    ]);
  });

  it("does not check range and angles when side imaging is not ticked, as Settings does not", () => {
    const range = viewOf({ "eq-ss": false, ssr: "0" });
    expect(toldOf(range, SECTION)).toEqual(["[shown]", "[hidden]", NO_ERR]);
    expect(toldOf(range, BEAM)).toEqual([
      "h:e0ce6e8e:1394 x:port|starboard {viewBox=0 0 340 62}",
      "h:7c44663b:2559 x:↑ heading|port fan|starboard fan|0|front-to-back ×∞ to be visible",
      "r:Frequency drawn=455 kHz CHIRP, 85° fan|Range used=0.00 m per side (maximum for this frequency 91.0 m)|Blind gap under the boat=none, the fans reach straight down|Bottom covered=none, the range doesn't reach the bottom",
    ]);
    expect(digestOf(range)).toBe("0d235437");
    const angles = viewOf({ "eq-ss": false, side0: "0" });
    expect(toldOf(angles, BEAM)).toEqual([
      "h:532247fd:740 x:port|starboard {viewBox=0 0 340 116}",
      "h:13df60b8:3307 x:↑ heading|port fan|starboard fan|0|10|10|20|20|30|30|front-to-back ×∞ to be visible",
      "r:Frequency drawn=455 kHz CHIRP, 0° fan, drawn 0.00× as wide and thick as the widest|Range used=40.0 m per side (maximum for this frequency 91.0 m)|Blind gap under the boat=23.0 m wide|Bottom covered=none, the range doesn't reach the bottom",
    ]);
    expect(digestOf(angles)).toBe("19af4237");
  });

  it("keeps nothing from one call to the next: a right depth after a wrong one gives the whole view", () => {
    expect(digestOf(viewOf({ dep: "0" }))).toBe("d1b187de");
    expect(digestOf(viewOf({ ssR: "-1" }))).toBe("569c73b4");
    expect(digestOf(viewOf())).toBe("4ef02d1f");
  });

  it("does not change what it is given", () => {
    const input = inputOf(fieldsOf(), uiOf(), "en-US");
    const before = JSON.stringify([input.settings, input.eq, input.ui, input.names, input.local]);
    sideScanView(input);
    drawn(input);
    expect(JSON.stringify([input.settings, input.eq, input.ui, input.names, input.local])).toBe(
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

/** The section of the page SideScan is recorded in. */
const SECTION_FILE = "ss";

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
 * A patch of the view as the recorder holds it (fixtures/README.md): a content
 * that was written is held as text and as html, whichever way it was written;
 * and an attribute is held under the name the element has it by, in that
 * name's own case, with its value, so the `viewBox` the view sets on the SVG
 * chart is compared with the recorded one, name and value.
 */
function asRecorded(patch: ElementPatch): RecordedPatch {
  const out: RecordedPatch = {};
  if (patch.text !== undefined) {
    out.text = patch.text;
    out.html = escaped(patch.text);
  }
  if (patch.html !== undefined) {
    out.html = asRead(patch.html);
    out.text = out.html.replace(/<[^>]*>/g, "");
  }
  if (patch.hidden !== undefined) out.hidden = patch.hidden;
  if (patch.attrs !== undefined) out.attrs = { ...patch.attrs };
  return out;
}

const SCENARIOS = index.scenarios.map((scenario) => scenario.name);
const PAIRS = SCENARIOS.flatMap((name) =>
  index.schemes.map((scheme): [string, string] => [name, scheme]),
);

/** Whether the earlier page rendered the section: it is open, and side imaging is ticked (line 1798). */
const isRendered = (scenario: RecordedScenario): boolean =>
  scenario.ui.open.ss === true && scenario.fields["eq-ss"] === true;

/** Whether the depth passes its check in Settings (line 253). */
const hasDepth = (scenario: RecordedScenario): boolean => num(String(scenario.fields.dep)) > 0;

/**
 * Everything the earlier lines of the simulated screen read (lines 354 to 421,
 * and the depth's check, line 253), as one text: the depth, the tool, the four
 * fields of the two tools, the locale and the font. The size of the canvas and
 * what it measures come from the recording of the canvas.
 *
 * Two tests use it together, because a picture at the page's size is slow to
 * draw here (see `STAND_IN_HEIGHT`). The first draws every recording on a
 * canvas `LOW_HEIGHT` high and requires the picture of the first recording
 * with the same text: so the painter reads nothing of its input but what is in
 * this text. The second can then draw the page-size picture once for each
 * text, and compares it with the recorded log of every recording that has
 * that text.
 */
const screenReads = ({ fields, ui, locale, theme }: RecordedScenario): string =>
  JSON.stringify([
    fields.dep,
    ui.ssMode,
    fields.s1,
    fields.s2,
    fields.ro,
    fields.rs,
    locale,
    theme["--font-data"],
  ]);

/** The height of the canvas on which every recording is drawn, in pixels. */
const LOW_HEIGHT = 8;

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

  it("has recordings with the section rendered and without, with the screen drawn and without", () => {
    const rendered = PAIRS.filter(([name]) => isRendered(scenarioOf(name)));
    const drawnOn = rendered.filter(([name]) => hasDepth(scenarioOf(name)));
    expect([PAIRS.length, rendered.length, drawnOn.length]).toEqual([336, 202, 194]);
  });

  it("has recordings of every message of the section, with the first brand's name, and of an emptied beam", () => {
    const seen = new Set<string>();
    for (const [name, scheme] of PAIRS) {
      for (const key of ["ss-serr", "ssR-err", "b-err", "s-err", "ssb-res"]) {
        const text = recorded(`${name}/${scheme}`, key)?.text;
        if (text !== undefined) seen.add(`${key}: ${text.replace(/\d.*$/, "…")}`);
      }
    }
    expect([...seen].sort()).toEqual([
      "b-err: ",
      "b-err: The shadow end must be farther out than its start.",
      "b-err: The shadow start must be at or beyond the depth (…",
      "s-err: ",
      "s-err: Enter where the object is drawn, more than …",
      "s-err: The object must be drawn closer than its shadow.",
      "s-err: The shadow must be at or beyond the depth (…",
      "ss-serr: ",
      "ss-serr: Fix the SideScan angles in Settings.",
      "ss-serr: Fix the SideScan range in Settings.",
      "ss-serr: Fix the depth in Settings.",
      "ssR-err: ",
      "ssR-err: Enter the distance you read on the screen, …",
      "ssb-res: ",
      "ssb-res: Frequency drawnLow, …",
      "ssb-res: Frequency drawn…",
    ]);
  });

  describe.each(PAIRS)("%s, %s", (name, scheme) => {
    const at = `${name}/${scheme}`;
    const scenario = scenarioOf(name);
    const input = inputOf(scenario.fields, scenario.ui, scenario.locale, scenario.theme);
    const was: Record<string, RecordedPatch> = {};
    for (const key of KEYS) {
      const patch = recorded(at, key);
      if (patch !== undefined) was[key] = patch;
    }
    const canvas = recordedCanvas(at, CANVAS);

    if (!isRendered(scenario)) {
      it("did not render the section: no element of KEYS was written and nothing was drawn", () => {
        expect(scenario.name).toBe(name);
        expect(Object.keys(was)).toEqual([]);
        expect(canvas).toBeUndefined();
      });
      return;
    }

    it("leaves the elements of KEYS as the earlier page left them, and writes no other", () => {
      expect(scenario.name).toBe(name);
      const view = sideScanView(input);
      const left: Record<string, RecordedPatch> = {};
      for (const [key, patch] of Object.entries(view)) left[key] = asRecorded(patch);
      expect(Object.keys(left).sort()).toEqual(Object.keys(was).sort());
      expect(left).toEqual(was);
      expect(Object.keys(view).filter((key) => !(KEYS as readonly string[]).includes(key))).toEqual(
        [],
      );
    });

    if (!hasDepth(scenario)) {
      it("draws nothing on the screen, as the earlier page drew nothing", () => {
        expect(canvas).toBeUndefined();
        expect(drawn(input)).toEqual([]);
      });
      return;
    }

    const reads = screenReads(scenario);

    it("draws, on a low canvas, what it draws for every recording that gives the screen the same to read", () => {
      const own = logSum(drawn(input, LOW_HEIGHT));
      const first = lowPictures.get(reads) ?? own;
      lowPictures.set(reads, first);
      expect(own).toBe(first);
    });

    it("draws the screen as the earlier page drew it, entry for entry", () => {
      expect(canvas).toBeDefined();
      const passes = canvas?.passes ?? [];
      const logs = passes.flatMap((pass) => (pass.log === undefined ? [] : [pass.log]));
      expect(logs.length).toBeGreaterThan(0);
      for (const pass of passes) {
        // A pass without a log is one that equals an earlier pass, which has one.
        if (pass.log === undefined) expect(passes[pass.repeats ?? -1]?.log).toBeDefined();
      }
      for (const log of logs) {
        // The widths the browser measured, by text, so that no font of this machine is asked.
        const measured = new Map<string, Measured>();
        for (const entry of log) {
          if (entry[0] === "measureText") measured.set(String(entry[1]), entry[2] as Measured);
        }
        const size = [canvas?.width ?? 0, canvas?.height ?? 0] as const;
        const once = JSON.stringify([reads, size, [...measured]]);
        let painted = pageSize.get(once);
        if (painted === undefined) {
          const made = recordingSurface(
            size[0],
            size[1],
            (text) => measured.get(text) ?? { font: "not measured by the earlier page", width: 0 },
          );
          paintSideScan(made.surface, input);
          painted = made.log;
          pageSize.set(once, painted);
        }
        expect(painted).toEqual(log);
      }
    });
  });

  it("draws the page-size screen for 15 different sets of what the screen reads", () => {
    const sets = new Set(
      SCENARIOS.map(scenarioOf)
        .filter((scenario) => isRendered(scenario) && hasDepth(scenario))
        .map(screenReads),
    );
    expect(sets.size).toBe(15);
  });
});
