/**
 * Light and shadow against the earlier page (legacy/src/p2.js, lines 1357 to
 * 1492), in two ways. The expected values of the first part were printed by
 * those lines themselves, run unchanged in Node against a stand-in for the
 * page's elements, once in en-US and once in sv-SE. The second part compares
 * what the view writes with what the earlier page wrote when it was recorded
 * in a browser (`fixtures/legacy/`), in every scenario of the set.
 */
import { createFormatter, rad } from "./format";
import {
  type Fish,
  KEYS,
  lightShadowView,
  lsBottom,
  lsCast,
  lsClasses,
  lsRays,
} from "./lightshadow";
import { equipment, num, parseSettings } from "./settings";
import { combined, livePreset, namesOf, THICKNESS } from "./transducers";
import type { ElementPatch, Point, RawFields, SavedValue, SectionView, UiState } from "./types";

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

/** The colour of the lit beam in the light theme of the page (`--s4`). */
const LIGHT_S4 = "#c98500";

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
    lsfx: "12",
    lsfh: "3",
  };
  for (const [i, c] of p.cone.entries()) fields[`cone${i}`] = String(c.a);
  for (const [i, c] of p.down.entries()) fields[`down${i}`] = String(c.a);
  for (const [i, c] of p.side.entries()) fields[`side${i}`] = String(c.a);
  return { ...fields, ...over };
}

/** The number fields of the section's own, which the shell reads as `num()` does. */
const LOCAL_NUMBERS = ["lsfx", "lsfh"] as const;

/** What the view gets for a page with the given fields and view state. */
function inputOf(
  fields: RawFields,
  ui: Pick<UiState, "lsB" | "lsA">,
  locale: string,
  s4: string | undefined,
) {
  const first = String(fields["img-p"]);
  const live = String(fields["live-p"]);
  const local: Record<string, number> = {};
  for (const id of LOCAL_NUMBERS) {
    const text = fields[id];
    local[id] = num(typeof text === "string" ? text : undefined);
  }
  return {
    settings: parseSettings(fields, combined(first, String(fields["img-s"]))),
    eq: equipment(fields, livePreset(live)),
    ui,
    names: namesOf(first, live),
    local,
    theme: { colours: (s4 === undefined ? {} : { "--s4": s4 }) as Record<string, string> },
    fmt: createFormatter(locale),
  };
}

/**
 * The views computed so far, by everything the view is given. A view costs about half a second under Jest
 * (the rays and the classes, run in a context where `Math` is a slow global), and the 226 recordings of the
 * section hold 54 different inputs (light and dark are two), so each is computed once and compared with every
 * recording it stands for. A key tells -0, NaN and the infinities apart, as the digits of JSON would not.
 */
const computed = new Map<string, SectionView>();
function viewOfInput(input: ReturnType<typeof inputOf>, locale: string): SectionView {
  const key = `${locale}|${JSON.stringify(input, (_name, value: unknown) =>
    typeof value === "number" && (!Number.isFinite(value) || Object.is(value, -0))
      ? `number ${Object.is(value, -0) ? "-0" : String(value)}`
      : value,
  )}`;
  let view = computed.get(key);
  if (view === undefined) {
    view = lightShadowView(input);
    computed.set(key, view);
  }
  return view;
}

/** What a row changes of the page as it starts. */
interface Over {
  locale?: string;
  /** The depth, as the field holds it. */
  dep?: string;
  /** The bottom and the beam angle the visitor chose: `ui.lsB` and `ui.lsA`. */
  lsB?: string;
  lsA?: string;
  /** The fish distance and height, as their fields hold them. */
  lsfx?: string;
  lsfh?: string;
  /** The colour of the lit beam. */
  s4?: string;
}

/** The view of the page as it starts, with the changes of a row. */
function viewOf(o: Over = {}): SectionView {
  const fields = fieldsOf({
    dep: o.dep ?? "10",
    lsfx: o.lsfx ?? "12",
    lsfh: o.lsfh ?? "3",
  });
  const ui = { lsB: o.lsB ?? "rock", lsA: o.lsA ?? "low" };
  const locale = o.locale ?? "en-US";
  return viewOfInput(inputOf(fields, ui, locale, o.s4 ?? LIGHT_S4), locale);
}

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

/** What stands for an element the view does not write. */
const NOT = "(not written)";

/**
 * What was written to one element, as one line: `t:` its text, `r:` the rows
 * of a result list, `h:` any other html (a long one as its digest and length,
 * and after `x:` the texts it shows), whether it is hidden, and its attributes.
 */
function told(p: ElementPatch | undefined): string {
  if (p === undefined) return NOT;
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

/** The elements a readable row tells, in the order of its expected values. */
const TOLD = ["ls-err", "ls-svg", "ls-scr", "ls-res"] as const;

/** What the view writes to each of the elements of `TOLD`, as `told` tells it. */
const toldOf = (view: SectionView): string[] => TOLD.map((key) => told(view[key]));

/** The length and digest of the html a view wrote to an element. */
const sumOf = (p: ElementPatch | undefined): string =>
  p?.html === undefined ? NOT : `${fnv1a(p.html)}:${p.html.length}`;

/**
 * What the view writes as one line: the message and whether it is shown, the
 * `viewBox` of the picture, and the digest and length of the picture, of the
 * strip and of the results.
 */
function gist(view: SectionView): string {
  const err = view["ls-err"];
  return [
    err ? `${err.text}${err.hidden ? " [hidden]" : " [shown]"}` : NOT,
    view["ls-svg"]?.attrs?.viewBox ?? NOT,
    sumOf(view["ls-svg"]),
    sumOf(view["ls-scr"]),
    sumOf(view["ls-res"]),
  ].join(" | ");
}

/** A number as the expected values write it: every digit, and the sign of a negative zero. */
const show = (v: number | undefined): string => (Object.is(v, -0) ? "-0" : String(v ?? Number.NaN));

/** The digest of a bottom: every point with every digit. */
const bottomDigest = (pts: readonly Point[]): string =>
  fnv1a(pts.map(([x, z]) => `${show(x)},${show(z)}`).join(";"));

// ---------------------------------------------------------------------------
// The first part: against the earlier lines run in Node
// ---------------------------------------------------------------------------

describe("what the module names", () => {
  it("lists the elements the view writes", () => {
    expect(KEYS).toEqual(["ls-err", "ls-svg", "ls-leg", "ls-scr", "ls-res"]);
  });
});

describe("lsBottom", () => {
  /** The points of the bottom the table reads: the first, one in the flat part, one in the step, one beyond, the last. */
  const PICK = [0, 100, 308, 400, 700];

  const cases: readonly (readonly [
    string,
    number,
    number,
    number,
    string,
    readonly (readonly [number, number, number])[],
  ])[] = [
    [
      "flat",
      10,
      50,
      701,
      "31ee568c",
      [
        [0, 0, 10],
        [100, 7.142857142857143, 10],
        [308, 22, 10],
        [400, 28.571428571428573, 10],
        [700, 50, 10],
      ],
    ],
    [
      "up",
      10,
      50,
      701,
      "3b96f282",
      [
        [0, 0, 10],
        [100, 7.142857142857143, 10],
        [308, 22, 8.833333333333334],
        [400, 28.571428571428573, 7.397722060252672],
        [700, 50, 5.5],
      ],
    ],
    [
      "down",
      10,
      50,
      701,
      "c4cd8340",
      [
        [0, 0, 10],
        [100, 7.142857142857143, 10],
        [308, 22, 11.555555555555555],
        [400, 28.571428571428573, 13.469703919663104],
        [700, 50, 16],
      ],
    ],
    [
      "drop",
      10,
      50,
      701,
      "6b4150c8",
      [
        [0, 0, 10],
        [100, 7.142857142857143, 10],
        [308, 22, 10],
        [400, 28.571428571428573, 17],
        [700, 50, 17],
      ],
    ],
    [
      "wave",
      10,
      50,
      701,
      "f3551ca1",
      [
        [0, 0, 10],
        [100, 7.142857142857143, 9.85372447902724],
        [308, 22, 8.69097726024042],
        [400, 28.571428571428573, 11.325378174375928],
        [700, 50, 8.847822587748881],
      ],
    ],
    [
      "rock",
      10,
      50,
      701,
      "f00586cb",
      [
        [0, 0, 10],
        [100, 7.142857142857143, 10],
        [308, 22, 8.2],
        [400, 28.571428571428573, 10],
        [700, 50, 10],
      ],
    ],
    [
      "foo",
      10,
      50,
      701,
      "31ee568c",
      [
        [0, 0, 10],
        [100, 7.142857142857143, 10],
        [308, 22, 10],
        [400, 28.571428571428573, 10],
        [700, 50, 10],
      ],
    ],
    [
      "flat",
      3.3,
      16.5,
      701,
      "1f9a128c",
      [
        [0, 0, 3.3],
        [100, 2.357142857142857, 3.3],
        [308, 7.26, 3.3],
        [400, 9.428571428571429, 3.3],
        [700, 16.5, 3.3],
      ],
    ],
    [
      "up",
      3.3,
      16.5,
      701,
      "6a482cdf",
      [
        [0, 0, 3.3],
        [100, 2.357142857142857, 3.3],
        [308, 7.26, 2.9149999999999996],
        [400, 9.428571428571429, 2.4412482798833812],
        [700, 16.5, 1.815],
      ],
    ],
    [
      "down",
      3.3,
      16.5,
      701,
      "96d27607",
      [
        [0, 0, 3.3],
        [100, 2.357142857142857, 3.3],
        [308, 7.26, 3.8133333333333335],
        [400, 9.428571428571429, 4.445002293488824],
        [700, 16.5, 5.279999999999999],
      ],
    ],
    [
      "drop",
      3.3,
      16.5,
      701,
      "56ef2ad5",
      [
        [0, 0, 3.3],
        [100, 2.357142857142857, 3.3],
        [308, 7.26, 3.3],
        [400, 9.428571428571429, 5.609999999999999],
        [700, 16.5, 5.609999999999999],
      ],
    ],
    [
      "wave",
      3.3,
      16.5,
      701,
      "0c524247",
      [
        [0, 0, 3.3],
        [100, 2.357142857142857, 3.251729078078989],
        [308, 7.26, 2.8680224958793383],
        [400, 9.428571428571429, 3.737374797544056],
        [700, 16.5, 2.9197814539571305],
      ],
    ],
    [
      "rock",
      3.3,
      16.5,
      701,
      "2f3b6981",
      [
        [0, 0, 3.3],
        [100, 2.357142857142857, 3.3],
        [308, 7.26, 2.7059999999999995],
        [400, 9.428571428571429, 3.3],
        [700, 16.5, 3.3],
      ],
    ],
    [
      "foo",
      3.3,
      16.5,
      701,
      "1f9a128c",
      [
        [0, 0, 3.3],
        [100, 2.357142857142857, 3.3],
        [308, 7.26, 3.3],
        [400, 9.428571428571429, 3.3],
        [700, 16.5, 3.3],
      ],
    ],
    [
      "flat",
      100,
      500,
      701,
      "32f7cb41",
      [
        [0, 0, 100],
        [100, 71.42857142857143, 100],
        [308, 220, 100],
        [400, 285.7142857142857, 100],
        [700, 500, 100],
      ],
    ],
    [
      "up",
      100,
      500,
      701,
      "b509f88f",
      [
        [0, 0, 100],
        [100, 71.42857142857143, 100],
        [308, 220, 88.33333333333333],
        [400, 285.7142857142857, 73.97722060252673],
        [700, 500, 55],
      ],
    ],
    [
      "down",
      100,
      500,
      701,
      "47513146",
      [
        [0, 0, 100],
        [100, 71.42857142857143, 100],
        [308, 220, 115.55555555555556],
        [400, 285.7142857142857, 134.69703919663104],
        [700, 500, 160],
      ],
    ],
    [
      "drop",
      100,
      500,
      701,
      "803be467",
      [
        [0, 0, 100],
        [100, 71.42857142857143, 100],
        [308, 220, 100],
        [400, 285.7142857142857, 170],
        [700, 500, 170],
      ],
    ],
    [
      "wave",
      100,
      500,
      701,
      "11a88c5d",
      [
        [0, 0, 100],
        [100, 71.42857142857143, 98.53724479027241],
        [308, 220, 86.90977260240419],
        [400, 285.7142857142857, 113.25378174375929],
        [700, 500, 88.47822587748878],
      ],
    ],
    [
      "rock",
      100,
      500,
      701,
      "96f4657b",
      [
        [0, 0, 100],
        [100, 71.42857142857143, 100],
        [308, 220, 82],
        [400, 285.7142857142857, 100],
        [700, 500, 100],
      ],
    ],
    [
      "foo",
      100,
      500,
      701,
      "32f7cb41",
      [
        [0, 0, 100],
        [100, 71.42857142857143, 100],
        [308, 220, 100],
        [400, 285.7142857142857, 100],
        [700, 500, 100],
      ],
    ],
    [
      "flat",
      0.05,
      0.25,
      701,
      "a704b567",
      [
        [0, 0, 0.05],
        [100, 0.03571428571428571, 0.05],
        [308, 0.11, 0.05],
        [400, 0.14285714285714285, 0.05],
        [700, 0.25, 0.05],
      ],
    ],
    [
      "up",
      0.05,
      0.25,
      701,
      "31933f77",
      [
        [0, 0, 0.05],
        [100, 0.03571428571428571, 0.05],
        [308, 0.11, 0.04416666666666667],
        [400, 0.14285714285714285, 0.03698861030126337],
        [700, 0.25, 0.0275],
      ],
    ],
    [
      "down",
      0.05,
      0.25,
      701,
      "8f6bd204",
      [
        [0, 0, 0.05],
        [100, 0.03571428571428571, 0.05],
        [308, 0.11, 0.05777777777777778],
        [400, 0.14285714285714285, 0.06734851959831552],
        [700, 0.25, 0.08],
      ],
    ],
    [
      "drop",
      0.05,
      0.25,
      701,
      "7c8c6585",
      [
        [0, 0, 0.05],
        [100, 0.03571428571428571, 0.05],
        [308, 0.11, 0.05],
        [400, 0.14285714285714285, 0.08499999999999999],
        [700, 0.25, 0.08499999999999999],
      ],
    ],
    [
      "wave",
      0.05,
      0.25,
      701,
      "1a7c7eb6",
      [
        [0, 0, 0.05],
        [100, 0.03571428571428571, 0.049268622395136207],
        [308, 0.11, 0.0434548863012021],
        [400, 0.14285714285714285, 0.056626890871879644],
        [700, 0.25, 0.044239112938744406],
      ],
    ],
    [
      "rock",
      0.05,
      0.25,
      701,
      "5e159514",
      [
        [0, 0, 0.05],
        [100, 0.03571428571428571, 0.05],
        [308, 0.11, 0.041],
        [400, 0.14285714285714285, 0.05],
        [700, 0.25, 0.05],
      ],
    ],
    [
      "foo",
      0.05,
      0.25,
      701,
      "a704b567",
      [
        [0, 0, 0.05],
        [100, 0.03571428571428571, 0.05],
        [308, 0.11, 0.05],
        [400, 0.14285714285714285, 0.05],
        [700, 0.25, 0.05],
      ],
    ],
    // Depths of the page's own fields at which the order of the arithmetic shows in the last digit: 0.12 * H
    // against 0.12 / (1 / H) in the drop (found by a round of arithmetic mutants), and 0.14 * H and 1.3 * H in the wave.
    [
      "drop",
      3.7,
      18.5,
      701,
      "97c2441e",
      [
        [0, 0, 3.7],
        [100, 2.642857142857143, 3.7],
        [308, 8.14, 3.7],
        [400, 10.571428571428571, 6.29],
        [700, 18.5, 6.29],
      ],
    ],
    [
      "wave",
      6.3,
      31.5,
      701,
      "5b22dfb8",
      [
        [0, 0, 6.3],
        [100, 4.5, 6.207846421787162],
        [308, 13.86, 5.475315673951464],
        [400, 18, 7.134988249856835],
        [700, 31.5, 5.574128230281796],
      ],
    ],
  ];

  it.each(cases)(
    "%s, depth %s, width %s: 701 points, with every digit",
    (kind, H, X, n, digest, picks) => {
      const pts = lsBottom(kind, H, X);
      expect(pts).toHaveLength(n);
      expect(bottomDigest(pts)).toBe(digest);
      expect(PICK.map((i) => [i, pts[i]?.[0], pts[i]?.[1]])).toEqual(picks);
    },
  );

  // The edge of the rock at a depth of 10 m: two points are exactly as far
  // from its centre as its radius, and `Math.abs(dx) < r` leaves them on the flat bottom.
  it("leaves the two points that are a radius from the rock's centre on the flat bottom", () => {
    const pts = lsBottom("rock", 10, 50);
    expect(pts[280]).toEqual([20, 10]);
    expect(pts[281]?.[1]).toBeLessThan(10);
    expect(pts[335]?.[1]).toBeLessThan(10);
    expect(pts[336]).toEqual([24, 10]);
  });

  const odd: readonly (readonly [
    string,
    number,
    number,
    number,
    string,
    readonly (readonly [number, string, string])[],
  ])[] = [
    [
      "rock",
      0,
      0,
      701,
      "c664176b",
      [
        [0, "0", "0"],
        [1, "0", "0"],
        [700, "0", "0"],
      ],
    ],
    [
      "wave",
      -1,
      -5,
      701,
      "3e7066bd",
      [
        [0, "-0", "-1"],
        [1, "-0.007142857142857143", "-1"],
        [700, "-5", "-0.8847822587748881"],
      ],
    ],
    [
      "up",
      10,
      0,
      701,
      "399c3a48",
      [
        [0, "0", "10"],
        [1, "0", "10"],
        [700, "0", "10"],
      ],
    ],
    [
      "flat",
      10,
      -50,
      701,
      "6350b2e3",
      [
        [0, "-0", "10"],
        [1, "-0.07142857142857142", "10"],
        [700, "-50", "10"],
      ],
    ],
    [
      "up",
      Number.NaN,
      Number.NaN,
      701,
      "1405c7a3",
      [
        [0, "NaN", "NaN"],
        [1, "NaN", "NaN"],
        [700, "NaN", "NaN"],
      ],
    ],
    [
      "drop",
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
      701,
      "369a6433",
      [
        [0, "NaN", "NaN"],
        [1, "Infinity", "NaN"],
        [700, "Infinity", "NaN"],
      ],
    ],
  ];

  it.each(odd)(
    "%s with a depth of %s and a width of %s (nothing is checked): the same 701 points",
    (kind, H, X, n, digest, picks) => {
      const pts = lsBottom(kind, H, X);
      expect(pts).toHaveLength(n);
      expect(bottomDigest(pts)).toBe(digest);
      expect([0, 1, 700].map((i) => [i, show(pts[i]?.[0]), show(pts[i]?.[1])] as const)).toEqual(
        picks,
      );
    },
  );
});

describe("lsCast", () => {
  const BOTTOMS: Readonly<Record<string, readonly Point[]>> = {
    flat4: [
      [0, 5],
      [4, 5],
      [8, 5],
      [12, 5],
    ],
    slope: [
      [0, 2],
      [10, 6],
    ],
    kink: [
      [0, 4],
      [3, 4],
      [6, 7],
    ],
    kink1: [
      [0, 1],
      [1, 1],
      [2, 3],
    ],
    back: [
      [10, 5],
      [0, 5],
    ],
    left: [
      [-10, 5],
      [0, 5],
    ],
    one: [[0, 5]],
    empty: [],
    rock10: lsBottom("rock", 10, 50),
    drop10: lsBottom("drop", 10, 50),
    wave10: lsBottom("wave", 10, 50),
    wide: [
      [-1, 5],
      [1, 5],
    ],
    "short 9e-13": [
      [0, 5],
      [9e-13, 5],
    ],
    "short 1e-12": [
      [0, 5],
      [1e-12, 5],
    ],
    "short 1.1e-12": [
      [0, 5],
      [1.1e-12, 5],
    ],
    "z 1e-6": [
      [-1, 1e-6],
      [1, 1e-6],
    ],
    "z 1.0000000000000002e-6": [
      [-1, 1.0000000000000002e-6],
      [1, 1.0000000000000002e-6],
    ],
  };

  const RAYS: Readonly<Record<string, readonly [number, number]>> = {
    down: [0, 1],
    "0.6/0.8": [0.6, 0.8],
    "45": [Math.cos(Math.PI / 4), Math.sin(Math.PI / 4)],
    horizontal: [1, 0],
    "1/1": [1 / Math.sqrt(2), 1 / Math.sqrt(2)],
    "1/3": [1 / Math.sqrt(10), 3 / Math.sqrt(10)],
    up: [0, -1],
    "6 degrees": [Math.cos(rad(6)), Math.sin(rad(6))],
    "55 degrees": [Math.cos(rad(55)), Math.sin(rad(55))],
    "60 degrees": [Math.cos(rad(60)), Math.sin(rad(60))],
    "90 degrees": [Math.cos(rad(90)), Math.sin(rad(90))],
  };

  const FISH: Readonly<Record<string, Fish | null>> = {
    none: null,
    ahead: { x: 12, z: 6.736, a: 0.6, b: 0.264 },
    tangent: { x: 3, z: 1, a: 1, b: 1 },
    around: { x: 0, z: 0, a: 1, b: 1 },
    behind: { x: -5, z: 0, a: 1, b: 1 },
    near: { x: 4, z: 3, a: 1, b: 1 },
    far: { x: 12, z: 8, a: 1, b: 1 },
    inFront: { x: 2.4, z: 3.2, a: 0.5, b: 0.5 },
    beyond: { x: 7.2, z: 9.6, a: 0.5, b: 0.5 },
    centre: { x: 5, z: 5, a: 1.5, b: 0.4 },
  };

  /** What a cast gives: the distance, what was met, which segment of the bottom, and how square-on. */
  type Expected = { t: number; k?: string; i?: number; c?: number };

  const cases: readonly (readonly [string, string, string, string, number, Expected])[] = [
    ["flat4, down, fish none, R 100", "flat4", "down", "none", 100, { t: 5, k: "bot", i: 0, c: 1 }],
    [
      "flat4, 0.6/0.8, fish none, R 100",
      "flat4",
      "0.6/0.8",
      "none",
      100,
      { t: 6.25, k: "bot", i: 0, c: 0.8 },
    ],
    [
      "flat4, 45, fish none, R 100",
      "flat4",
      "45",
      "none",
      100,
      { t: 7.0710678118654755, k: "bot", i: 1, c: 0.7071067811865475 },
    ],
    [
      "flat4, horizontal, fish none, R 100",
      "flat4",
      "horizontal",
      "none",
      100,
      { t: 100, k: "none", c: 0 },
    ],
    [
      "short 9e-13, down, fish none, R 100",
      "short 9e-13",
      "down",
      "none",
      100,
      { t: 100, k: "none", c: 0 },
    ],
    [
      "short 1e-12, down, fish none, R 100",
      "short 1e-12",
      "down",
      "none",
      100,
      { t: 5, k: "bot", i: 0, c: 1 },
    ],
    [
      "short 1.1e-12, down, fish none, R 100",
      "short 1.1e-12",
      "down",
      "none",
      100,
      { t: 5, k: "bot", i: 0, c: 1 },
    ],
    ["z 1e-6, down, fish none, R 100", "z 1e-6", "down", "none", 100, { t: 100, k: "none", c: 0 }],
    [
      "z 1.0000000000000002e-6, down, fish none, R 100",
      "z 1.0000000000000002e-6",
      "down",
      "none",
      100,
      { t: 1.0000000000000002e-6, k: "bot", i: 0, c: 1 },
    ],
    ["flat4, up, fish none, R 100", "flat4", "up", "none", 100, { t: 100, k: "none", c: 0 }],
    [
      "slope, down, fish none, R 100",
      "slope",
      "down",
      "none",
      100,
      { t: 2, k: "bot", i: 0, c: 0.9284766908852592 },
    ],
    [
      "slope, 1/1, fish none, R 100",
      "slope",
      "1/1",
      "none",
      100,
      { t: 4.714045207910317, k: "bot", i: 0, c: 0.3939192985791676 },
    ],
    [
      "slope, 1/3, fish none, R 100",
      "slope",
      "1/3",
      "none",
      100,
      { t: 2.4325212770525995, k: "bot", i: 0, c: 0.7633862853691143 },
    ],
    [
      "kink, 0.6/0.8, fish none, R 100",
      "kink",
      "0.6/0.8",
      "none",
      100,
      { t: 4.999999999999999, k: "bot", i: 0, c: 0.8 },
    ],
    ["kink, down, fish none, R 100", "kink", "down", "none", 100, { t: 4, k: "bot", i: 0, c: 1 }],
    [
      "kink1, 1/1, fish none, R 100",
      "kink1",
      "1/1",
      "none",
      100,
      { t: Math.SQRT2, k: "bot", i: 0, c: 0.7071067811865475 },
    ],
    ["back, down, fish none, R 100", "back", "down", "none", 100, { t: 5, k: "bot", i: 0, c: 0 }],
    [
      "back, 0.6/0.8, fish none, R 100",
      "back",
      "0.6/0.8",
      "none",
      100,
      { t: 6.25, k: "bot", i: 0, c: 0 },
    ],
    ["left, down, fish none, R 100", "left", "down", "none", 100, { t: 5, k: "bot", i: 0, c: 1 }],
    ["wide, down, fish none, R 5", "wide", "down", "none", 5, { t: 5, k: "bot", i: 0, c: 1 }],
    [
      "wide, down, fish none, R 4.999999999999999",
      "wide",
      "down",
      "none",
      4.999999999999999,
      { t: 4.999999999999999, k: "none", c: 0 },
    ],
    ["one, down, fish none, R 100", "one", "down", "none", 100, { t: 100, k: "none", c: 0 }],
    ["empty, down, fish none, R 100", "empty", "down", "none", 100, { t: 100, k: "none", c: 0 }],
    ["flat4, down, fish none, R 5", "flat4", "down", "none", 5, { t: 5, k: "bot", i: 0, c: 1 }],
    [
      "flat4, down, fish none, R 4.999999999999999",
      "flat4",
      "down",
      "none",
      4.999999999999999,
      { t: 4.999999999999999, k: "none", c: 0 },
    ],
    [
      "flat4, down, fish none, R Infinity",
      "flat4",
      "down",
      "none",
      Number.POSITIVE_INFINITY,
      { t: 5, k: "bot", i: 0, c: 1 },
    ],
    [
      "one, down, fish none, R Infinity",
      "one",
      "down",
      "none",
      Number.POSITIVE_INFINITY,
      { t: Number.POSITIVE_INFINITY },
    ],
    [
      "empty, down, fish none, R Infinity",
      "empty",
      "down",
      "none",
      Number.POSITIVE_INFINITY,
      { t: Number.POSITIVE_INFINITY },
    ],
    [
      "rock10, 6 degrees, fish none, R 50",
      "rock10",
      "6 degrees",
      "none",
      50,
      { t: 50, k: "none", c: 0 },
    ],
    [
      "rock10, 55 degrees, fish none, R 50",
      "rock10",
      "55 degrees",
      "none",
      50,
      { t: 12.20774588761456, k: "bot", i: 98, c: 0.8191520442889918 },
    ],
    [
      "rock10, 60 degrees, fish none, R 50",
      "rock10",
      "60 degrees",
      "none",
      50,
      { t: 11.547005383792516, k: "bot", i: 80, c: 0.8660254037844386 },
    ],
    [
      "rock10, 90 degrees, fish none, R 50",
      "rock10",
      "90 degrees",
      "none",
      50,
      { t: 10, k: "bot", i: 0, c: 1 },
    ],
    [
      "drop10, 6 degrees, fish none, R 50",
      "drop10",
      "6 degrees",
      "none",
      50,
      { t: 50, k: "none", c: 0 },
    ],
    [
      "drop10, 60 degrees, fish none, R 50",
      "drop10",
      "60 degrees",
      "none",
      50,
      { t: 11.547005383792516, k: "bot", i: 80, c: 0.8660254037844386 },
    ],
    [
      "wave10, 6 degrees, fish none, R 50",
      "wave10",
      "6 degrees",
      "none",
      50,
      { t: 50, k: "none", c: 0 },
    ],
    [
      "wave10, 45, fish none, R 50",
      "wave10",
      "45",
      "none",
      50,
      { t: 12.835094757761684, k: "bot", i: 127, c: 0.9107348937763959 },
    ],
    [
      "rock10, 45, fish ahead, R 50",
      "rock10",
      "45",
      "ahead",
      50,
      { t: 14.142135623730951, k: "bot", i: 140, c: 0.7071067811865475 },
    ],
    [
      "rock10, 6 degrees, fish ahead, R 50",
      "rock10",
      "6 degrees",
      "ahead",
      50,
      { t: 50, k: "none", c: 0 },
    ],
    [
      "flat4, horizontal, fish tangent, R 100",
      "flat4",
      "horizontal",
      "tangent",
      100,
      { t: 3, k: "fish", c: 1 },
    ],
    [
      "flat4, horizontal, fish around, R 100",
      "flat4",
      "horizontal",
      "around",
      100,
      { t: 100, k: "none", c: 0 },
    ],
    [
      "flat4, horizontal, fish behind, R 100",
      "flat4",
      "horizontal",
      "behind",
      100,
      { t: 100, k: "none", c: 0 },
    ],
    [
      "flat4, 0.6/0.8, fish near, R 100",
      "flat4",
      "0.6/0.8",
      "near",
      100,
      { t: 6.25, k: "bot", i: 0, c: 0.8 },
    ],
    [
      "flat4, 0.6/0.8, fish far, R 100",
      "flat4",
      "0.6/0.8",
      "far",
      100,
      { t: 6.25, k: "bot", i: 0, c: 0.8 },
    ],
    ["flat4, down, fish near, R 100", "flat4", "down", "near", 100, { t: 5, k: "bot", i: 0, c: 1 }],
    ["flat4, 0.6/0.8, fish near, R 3", "flat4", "0.6/0.8", "near", 3, { t: 3, k: "none", c: 0 }],
    [
      "flat4, 0.6/0.8, fish tangent, R 100",
      "flat4",
      "0.6/0.8",
      "tangent",
      100,
      { t: 6.25, k: "bot", i: 0, c: 0.8 },
    ],
    [
      "flat4, 0.6/0.8, fish inFront, R 100",
      "flat4",
      "0.6/0.8",
      "inFront",
      100,
      { t: 3.5, k: "fish", c: 1 },
    ],
    [
      "flat4, 0.6/0.8, fish beyond, R 100",
      "flat4",
      "0.6/0.8",
      "beyond",
      100,
      { t: 6.25, k: "bot", i: 0, c: 0.8 },
    ],
    [
      "flat4, 45, fish centre, R 100",
      "flat4",
      "45",
      "centre",
      100,
      { t: 6.524482789456347, k: "fish", c: 1 },
    ],
    [
      "flat4, down, fish centre, R 100",
      "flat4",
      "down",
      "centre",
      100,
      { t: 5, k: "bot", i: 0, c: 1 },
    ],
    [
      "flat4, 0.6/0.8, fish inFront, R 3",
      "flat4",
      "0.6/0.8",
      "inFront",
      3,
      { t: 3, k: "none", c: 0 },
    ],
  ];

  it.each(cases)("%s", (_label, bottom, ray, fish, R, expected) => {
    const B = BOTTOMS[bottom];
    const r = RAYS[ray];
    const f = FISH[fish];
    expect(B).toBeDefined();
    expect(r).toBeDefined();
    expect(f).toBeDefined();
    if (B === undefined || r === undefined || f === undefined) return;
    expect(lsCast(r[0], r[1], B, f, R)).toEqual(expected);
  });
});

describe("lsRays", () => {
  const R = 50;
  const FISH: Readonly<Record<string, Fish | null>> = {
    none: null,
    fish: { x: 12, z: 6.736, a: 0.6, b: 0.264 },
    fishLow: { x: 30, z: 9.5, a: 1.2, b: 0.5 },
  };
  const ANGLES: Readonly<Record<string, readonly [number, number]>> = {
    low: [rad(6), rad(60)],
    steep: [rad(55), rad(90)],
  };

  /** One ray as one text, with every digit. */
  const flat = (r: ReturnType<typeof lsRays>[number]): string =>
    `${show(r.dx)},${show(r.dz)},${r.h.k},${show(r.h.t)},${show(r.h.c)},${r.g.k},${show(r.g.t)},${show(r.g.c)}`;

  const cases: readonly (readonly [
    string,
    string,
    string,
    number,
    string,
    readonly number[],
    readonly string[],
  ])[] = [
    [
      "flat",
      "low",
      "none",
      1401,
      "e70c2515",
      [],
      [
        "0.9945218953682733,0.10452846326765346,none,50,0,none,50,0",
        "0.838670567945424,0.544639035015027,bot,18.360784587766634,0.544639035015027,bot,18.360784587766634,0.544639035015027",
        "0.5000000000000001,0.8660254037844386,bot,11.547005383792516,0.8660254037844386,bot,11.547005383792516,0.8660254037844386",
      ],
    ],
    [
      "flat",
      "low",
      "fish",
      1401,
      "cebea608",
      [81, 565, 645],
      [
        "0.9945218953682733,0.10452846326765346,none,50,0,none,50,0",
        "0.838670567945424,0.544639035015027,bot,18.360784587766634,0.544639035015027,bot,18.360784587766634,0.544639035015027",
        "0.5000000000000001,0.8660254037844386,bot,11.547005383792516,0.8660254037844386,bot,11.547005383792516,0.8660254037844386",
      ],
    ],
    [
      "flat",
      "low",
      "fishLow",
      1401,
      "367e7824",
      [56, 273, 328],
      [
        "0.9945218953682733,0.10452846326765346,none,50,0,none,50,0",
        "0.838670567945424,0.544639035015027,bot,18.360784587766634,0.544639035015027,bot,18.360784587766634,0.544639035015027",
        "0.5000000000000001,0.8660254037844386,bot,11.547005383792516,0.8660254037844386,bot,11.547005383792516,0.8660254037844386",
      ],
    ],
    [
      "flat",
      "steep",
      "none",
      1401,
      "8eb3d184",
      [],
      [
        "0.573576436351046,0.8191520442889918,bot,12.20774588761456,0.8191520442889918,bot,12.20774588761456,0.8191520442889918",
        "0.3007057995042733,0.9537169507482268,bot,10.485291251408107,0.9537169507482268,bot,10.485291251408107,0.9537169507482268",
        "6.123233995736766e-17,1,bot,10,1,bot,10,1",
      ],
    ],
    [
      "rock",
      "low",
      "none",
      1401,
      "3c756f85",
      [],
      [
        "0.9945218953682733,0.10452846326765346,none,50,0,none,50,0",
        "0.838670567945424,0.544639035015027,bot,18.360784587766634,0.544639035015027,bot,18.360784587766634,0.544639035015027",
        "0.5000000000000001,0.8660254037844386,bot,11.547005383792516,0.8660254037844386,bot,11.547005383792516,0.8660254037844386",
      ],
    ],
    [
      "rock",
      "low",
      "fish",
      1401,
      "731c20f8",
      [81, 565, 645],
      [
        "0.9945218953682733,0.10452846326765346,none,50,0,none,50,0",
        "0.838670567945424,0.544639035015027,bot,18.360784587766634,0.544639035015027,bot,18.360784587766634,0.544639035015027",
        "0.5000000000000001,0.8660254037844386,bot,11.547005383792516,0.8660254037844386,bot,11.547005383792516,0.8660254037844386",
      ],
    ],
    [
      "rock",
      "low",
      "fishLow",
      1401,
      "e9210bb0",
      [56, 273, 328],
      [
        "0.9945218953682733,0.10452846326765346,none,50,0,none,50,0",
        "0.838670567945424,0.544639035015027,bot,18.360784587766634,0.544639035015027,bot,18.360784587766634,0.544639035015027",
        "0.5000000000000001,0.8660254037844386,bot,11.547005383792516,0.8660254037844386,bot,11.547005383792516,0.8660254037844386",
      ],
    ],
    [
      "up",
      "low",
      "none",
      1401,
      "e37f7237",
      [],
      [
        "0.9945218953682733,0.10452846326765346,none,50,0,none,50,0",
        "0.838670567945424,0.544639035015027,bot,18.10171536695808,0.6139115942344523,bot,18.10171536695808,0.6139115942344523",
        "0.5000000000000001,0.8660254037844386,bot,11.547005383792516,0.8660254037844386,bot,11.547005383792516,0.8660254037844386",
      ],
    ],
    [
      "up",
      "low",
      "fish",
      1401,
      "4cdb876b",
      [81, 565, 645],
      [
        "0.9945218953682733,0.10452846326765346,none,50,0,none,50,0",
        "0.838670567945424,0.544639035015027,bot,18.10171536695808,0.6139115942344523,bot,18.10171536695808,0.6139115942344523",
        "0.5000000000000001,0.8660254037844386,bot,11.547005383792516,0.8660254037844386,bot,11.547005383792516,0.8660254037844386",
      ],
    ],
    [
      "down",
      "low",
      "none",
      1401,
      "e47e3bfd",
      [],
      [
        "0.9945218953682733,0.10452846326765346,none,50,0,none,50,0",
        "0.838670567945424,0.544639035015027,bot,18.848085144375172,0.42897329713009685,bot,18.848085144375172,0.42897329713009685",
        "0.5000000000000001,0.8660254037844386,bot,11.547005383792516,0.8660254037844386,bot,11.547005383792516,0.8660254037844386",
      ],
    ],
    [
      "down",
      "low",
      "fish",
      1401,
      "24b2e95f",
      [81, 565, 645],
      [
        "0.9945218953682733,0.10452846326765346,none,50,0,none,50,0",
        "0.838670567945424,0.544639035015027,bot,18.848085144375172,0.42897329713009685,bot,18.848085144375172,0.42897329713009685",
        "0.5000000000000001,0.8660254037844386,bot,11.547005383792516,0.8660254037844386,bot,11.547005383792516,0.8660254037844386",
      ],
    ],
    [
      "down",
      "low",
      "fishLow",
      1401,
      "8032c392",
      [56, 273, 328],
      [
        "0.9945218953682733,0.10452846326765346,none,50,0,none,50,0",
        "0.838670567945424,0.544639035015027,bot,18.848085144375172,0.42897329713009685,bot,18.848085144375172,0.42897329713009685",
        "0.5000000000000001,0.8660254037844386,bot,11.547005383792516,0.8660254037844386,bot,11.547005383792516,0.8660254037844386",
      ],
    ],
    [
      "drop",
      "low",
      "none",
      1401,
      "f62d2001",
      [],
      [
        "0.9945218953682733,0.10452846326765346,none,50,0,none,50,0",
        "0.838670567945424,0.544639035015027,bot,18.360784587766634,0.544639035015027,bot,18.360784587766634,0.544639035015027",
        "0.5000000000000001,0.8660254037844386,bot,11.547005383792516,0.8660254037844386,bot,11.547005383792516,0.8660254037844386",
      ],
    ],
    [
      "drop",
      "low",
      "fish",
      1401,
      "12172bb4",
      [81, 565, 645],
      [
        "0.9945218953682733,0.10452846326765346,none,50,0,none,50,0",
        "0.838670567945424,0.544639035015027,bot,18.360784587766634,0.544639035015027,bot,18.360784587766634,0.544639035015027",
        "0.5000000000000001,0.8660254037844386,bot,11.547005383792516,0.8660254037844386,bot,11.547005383792516,0.8660254037844386",
      ],
    ],
    [
      "drop",
      "low",
      "fishLow",
      1401,
      "286f382a",
      [56, 273, 328],
      [
        "0.9945218953682733,0.10452846326765346,none,50,0,none,50,0",
        "0.838670567945424,0.544639035015027,bot,18.360784587766634,0.544639035015027,bot,18.360784587766634,0.544639035015027",
        "0.5000000000000001,0.8660254037844386,bot,11.547005383792516,0.8660254037844386,bot,11.547005383792516,0.8660254037844386",
      ],
    ],
    [
      "wave",
      "low",
      "none",
      1401,
      "e5444bcb",
      [],
      [
        "0.9945218953682733,0.10452846326765346,none,50,0,none,50,0",
        "0.838670567945424,0.544639035015027,bot,20.61418196240289,0.7827962643981339,bot,20.61418196240289,0.7827962643981339",
        "0.5000000000000001,0.8660254037844386,bot,11.615965586480927,0.8782757863107652,bot,11.615965586480927,0.8782757863107652",
      ],
    ],
    [
      "wave",
      "low",
      "fish",
      1401,
      "91a317e1",
      [81, 565, 645],
      [
        "0.9945218953682733,0.10452846326765346,none,50,0,none,50,0",
        "0.838670567945424,0.544639035015027,bot,20.61418196240289,0.7827962643981339,bot,20.61418196240289,0.7827962643981339",
        "0.5000000000000001,0.8660254037844386,bot,11.615965586480927,0.8782757863107652,bot,11.615965586480927,0.8782757863107652",
      ],
    ],
    [
      "wave",
      "low",
      "fishLow",
      1401,
      "04ff6538",
      [56, 273, 328],
      [
        "0.9945218953682733,0.10452846326765346,none,50,0,none,50,0",
        "0.838670567945424,0.544639035015027,bot,20.61418196240289,0.7827962643981339,bot,20.61418196240289,0.7827962643981339",
        "0.5000000000000001,0.8660254037844386,bot,11.615965586480927,0.8782757863107652,bot,11.615965586480927,0.8782757863107652",
      ],
    ],
    [
      "wave",
      "steep",
      "none",
      1401,
      "aaf0acde",
      [],
      [
        "0.573576436351046,0.8191520442889918,bot,12.097648867538668,0.9368249150383681,bot,12.097648867538668,0.9368249150383681",
        "0.3007057995042733,0.9537169507482268,bot,10.485291251408107,0.9537169507482268,bot,10.485291251408107,0.9537169507482268",
        "6.123233995736766e-17,1,bot,10,1,bot,10,1",
      ],
    ],
  ];

  it.each(cases)(
    "%s bottom, %s beam, fish %s: 1401 rays, every digit",
    (kind, angles, fishName, n, digest, hits, picks) => {
      const a = ANGLES[angles];
      const fish = FISH[fishName];
      expect(a).toBeDefined();
      expect(fish).toBeDefined();
      if (a === undefined || fish === undefined) return;
      const rays = lsRays(a[0], a[1], lsBottom(kind, 10, 50), fish, R);
      expect(rays).toHaveLength(n);
      expect(fnv1a(rays.map(flat).join(";"))).toBe(digest);
      const fishHits = rays.flatMap((r, i) => (r.h.k === "fish" ? [i] : []));
      expect(fishHits.length === 0 ? [] : [fishHits.length, fishHits[0], fishHits.at(-1)]).toEqual(
        hits,
      );
      expect(
        [0, 700, 1400].map((i) => {
          const ray = rays[i];
          return ray === undefined ? NOT : flat(ray);
        }),
      ).toEqual(picks);
    },
  );

  // The fish of typed fields (distance and height of the page's own fields, on a flat bottom) at depths other
  // than 10, as the page builds it (`a` is half the length, `b` is 0.22 of it): the fish ellipse is not scale
  // free, so the order of its arithmetic shows in the last digit of some of the rays at these depths and not at
  // 10 (found by a round of arithmetic mutants: the squares of `fish.a` and `fish.b`, `ox * ox`, the divisions).
  const typed: readonly (readonly [
    string,
    string,
    number,
    Fish,
    number,
    string,
    readonly number[],
  ])[] = [
    [
      "flat, low beam, depth 1.5, fish 0.6 out and 0.5 up",
      "flat",
      1.5,
      { x: 0.6, z: 0.824, a: 0.4, b: 0.17600000000000002 },
      1401,
      "5b406c96",
      [574, 827, 1400],
    ],
    [
      "flat, low beam, depth 1.5, fish 1.8 out and 0.5 up",
      "flat",
      1.5,
      { x: 1.8, z: 0.824, a: 0.4, b: 0.17600000000000002 },
      1401,
      "05466301",
      [353, 325, 677],
    ],
    [
      "flat, low beam, depth 7.3, fish 2.9 out and 2.2 up",
      "flat",
      7.3,
      { x: 2.9, z: 4.90728, a: 0.438, b: 0.19272 },
      1401,
      "d486e70f",
      [114, 1287, 1400],
    ],
    [
      "flat, low beam, depth 8.1, fish 3.2 out and 2.4 up",
      "flat",
      8.1,
      { x: 3.2, z: 5.486159999999999, a: 0.486, b: 0.21384 },
      1401,
      "10eee6a3",
      [105, 1296, 1400],
    ],
    [
      "flat, low beam, depth 0.5, fish 0.8 out and 0.1 up",
      "flat",
      0.5,
      { x: 0.8, z: 0.224, a: 0.4, b: 0.17600000000000002 },
      1401,
      "a60750ed",
      [741, 0, 740],
    ],
  ];

  it.each(typed)("%s: 1401 rays, every digit", (_label, kind, H, fish, n, digest, hits) => {
    const rays = lsRays(rad(6), rad(60), lsBottom(kind, H, 5 * H), fish, 5 * H);
    expect(rays).toHaveLength(n);
    expect(fnv1a(rays.map(flat).join(";"))).toBe(digest);
    const fishHits = rays.flatMap((r, i) => (r.h.k === "fish" ? [i] : []));
    expect([fishHits.length, fishHits[0], fishHits.at(-1)]).toEqual(hits);
  });
});

describe("lsClasses", () => {
  const R = 50;
  const H = 10;
  const FISH: Readonly<Record<string, Fish | null>> = {
    none: null,
    fish: { x: 12, z: 6.736, a: 0.6, b: 0.264 },
    fishLow: { x: 30, z: 9.5, a: 1.2, b: 0.5 },
  };
  const ANGLES: Readonly<Record<string, readonly [number, number]>> = {
    low: [rad(6), rad(60)],
    steep: [rad(55), rad(90)],
  };

  const cases: readonly (readonly [
    string,
    string,
    string,
    number,
    string,
    Record<string, number>,
  ])[] = [
    ["flat", "low", "none", 701, "91aa1cef", { out: 96, lit: 605 }],
    ["flat", "low", "fish", 701, "d7f5b91f", { out: 96, lit: 573, fish: 32 }],
    ["flat", "low", "fishLow", 701, "be342fdd", { out: 96, lit: 547, fish: 58 }],
    ["flat", "steep", "none", 701, "2b4bd189", { lit: 99, out: 602 }],
    ["rock", "low", "none", 701, "1929d0fb", { out: 96, lit: 542, terr: 63 }],
    ["rock", "low", "fish", 701, "af1fe5ab", { out: 96, lit: 510, fish: 32, terr: 63 }],
    ["rock", "low", "fishLow", 701, "ab58bd89", { out: 96, lit: 484, terr: 63, fish: 58 }],
    ["up", "low", "none", 701, "442b5439", { out: 86, lit: 615 }],
    ["up", "low", "fish", 701, "4978daab", { out: 86, lit: 591, fish: 24 }],
    ["down", "low", "none", 701, "4c8d21be", { out: 118, lit: 583 }],
    ["down", "low", "fish", 701, "e738c3ed", { out: 118, lit: 524, fish: 59 }],
    ["down", "low", "fishLow", 701, "84d82511", { out: 118, lit: 582, fish: 1 }],
    ["drop", "low", "none", 701, "16c0f22a", { out: 123, lit: 363, terr: 215 }],
    ["drop", "low", "fish", 701, "b759e81a", { out: 123, lit: 331, fish: 32, terr: 215 }],
    ["wave", "low", "none", 701, "5fae9576", { out: 93, lit: 406, terr: 202 }],
    ["wave", "low", "fish", 701, "8352177c", { out: 93, lit: 390, fish: 16, terr: 202 }],
    ["wave", "low", "fishLow", 701, "1ab853f0", { out: 93, lit: 386, terr: 202, fish: 20 }],
    ["wave", "steep", "none", 701, "2375eae5", { lit: 98, out: 603 }],
  ];

  it.each(cases)(
    "%s bottom, %s beam, fish %s: the class and the brightness of each of 701 points",
    (kind, angles, fishName, n, digest, counts) => {
      const a = ANGLES[angles];
      const fish = FISH[fishName];
      expect(a).toBeDefined();
      expect(fish).toBeDefined();
      if (a === undefined || fish === undefined) return;
      const classes = lsClasses(lsBottom(kind, H, 50), a[0], a[1], R, H, fish);
      expect(classes).toHaveLength(n);
      const flat = (c: (typeof classes)[number]): string =>
        `${c.s}${c.s === "out" ? "" : show(c.c)}`;
      expect(fnv1a(classes.map(flat).join(";"))).toBe(digest);
      const tally: Record<string, number> = {};
      for (const c of classes) tally[c.s] = (tally[c.s] ?? 0) + 1;
      expect(tally).toEqual(counts);
    },
  );
});

/** The first two elements of a readable row's text for the viewBox are told with `told`. */
type Told = readonly [string, Over, readonly string[]];

describe("what the section writes, element by element", () => {
  const readable: readonly Told[] = [
    [
      "flat, low",
      { lsB: "flat", lsA: "low" },
      [
        "t: [hidden]",
        "h:657f5483:138574 x:transducer (the flashlight)|10.0 m deep · 50.0 m across · depth ×2.5 {viewBox=0 0 340 201}",
        "h:4a95d54c:17575 x:first bottom echo|fish|fish shadow|0 → 50.0 m from the transducer",
        "r:Fish echo on the screen=13.2 m from the transducer (really 12.0 m out, 3.0 m above the bottom)|Its shadow on the bottom=16.7 to 18.9 m out (2.2 m long)|Shadow on the screen=19.5 to 21.4 m; the gap after the fish echo is 6.3 m|Bottom hidden by the bottom itself=none: every part of the bottom inside the beam faces the light|Bottom lit=from 5.8 to 48.9 m out",
      ],
    ],
    [
      "flat, steep",
      { lsB: "flat", lsA: "steep" },
      [
        "t: [hidden]",
        "h:162715b0:139029 x:transducer (the flashlight)|10.0 m deep · 50.0 m across · depth ×2.5 {viewBox=0 0 340 201}",
        "h:ecab586f:1462 x:first bottom echo|0 → 50.0 m from the transducer",
        "r:Fish=outside the beam, or hidden behind the bottom: no echo, no shadow. This beam reaches the bottom only out to 7.0 m; move the fish closer|Bottom hidden by the bottom itself=none: every part of the bottom inside the beam faces the light|Bottom lit=from 0.00 to 7.0 m out",
      ],
    ],
    [
      "rock, low",
      { lsB: "rock", lsA: "low" },
      [
        "t: [hidden]",
        "h:bf0ba12c:138700 x:transducer (the flashlight)|10.0 m deep · 50.0 m across · depth ×2.5 {viewBox=0 0 340 201}",
        "h:fc160e3d:15380 x:first bottom echo|fish|fish shadow|0 → 50.0 m from the transducer",
        "r:Fish echo on the screen=13.2 m from the transducer (really 12.0 m out, 3.0 m above the bottom)|Its shadow on the bottom=16.7 to 18.9 m out (2.2 m long)|Shadow on the screen=19.5 to 21.4 m; the gap after the fish echo is 6.3 m|Bottom hidden by the bottom itself=22.9 to 27.3 m out (black on the screen)|Bottom lit=from 5.8 to 48.9 m out",
      ],
    ],
    [
      "rock, steep",
      { lsB: "rock", lsA: "steep" },
      [
        "t: [hidden]",
        "h:2f17075b:139029 x:transducer (the flashlight)|10.0 m deep · 50.0 m across · depth ×2.5 {viewBox=0 0 340 201}",
        "h:ecab586f:1462 x:first bottom echo|0 → 50.0 m from the transducer",
        "r:Fish=outside the beam, or hidden behind the bottom: no echo, no shadow. This beam reaches the bottom only out to 7.0 m; move the fish closer|Bottom hidden by the bottom itself=none: every part of the bottom inside the beam faces the light|Bottom lit=from 0.00 to 7.0 m out",
      ],
    ],
    [
      "up, low",
      { lsB: "up", lsA: "low" },
      [
        "t: [hidden]",
        "h:04176a5b:138523 x:transducer (the flashlight)|10.0 m deep · 50.0 m across · depth ×2.5 {viewBox=0 0 340 201}",
        "h:957aab68:17778 x:first bottom echo|fish|fish shadow|0 → 50.0 m from the transducer",
        "r:Fish echo on the screen=13.2 m from the transducer (really 12.0 m out, 3.0 m above the bottom)|Its shadow on the bottom=16.4 to 18.0 m out (1.6 m long)|Shadow on the screen=19.0 to 20.4 m; the gap after the fish echo is 5.8 m|Bottom hidden by the bottom itself=none: every part of the bottom inside the beam faces the light|Bottom lit=from 5.8 to 49.6 m out",
      ],
    ],
    [
      "up, steep",
      { lsB: "up", lsA: "steep" },
      [
        "t: [hidden]",
        "h:d3a88969:139029 x:transducer (the flashlight)|10.0 m deep · 50.0 m across · depth ×2.5 {viewBox=0 0 340 201}",
        "h:ecab586f:1462 x:first bottom echo|0 → 50.0 m from the transducer",
        "r:Fish=outside the beam, or hidden behind the bottom: no echo, no shadow. This beam reaches the bottom only out to 7.0 m; move the fish closer|Bottom hidden by the bottom itself=none: every part of the bottom inside the beam faces the light|Bottom lit=from 0.00 to 7.0 m out",
      ],
    ],
    [
      "down, low",
      { lsB: "down", lsA: "low" },
      [
        "t: [hidden]",
        "h:686b0c5b:138700 x:transducer (the flashlight)|10.0 m deep · 50.0 m across · depth ×2.5 {viewBox=0 0 340 298}",
        "h:4c9bf56b:16576 x:first bottom echo|fish|fish shadow|0 → 50.0 m from the transducer",
        "r:Fish echo on the screen=13.2 m from the transducer (really 12.0 m out, 3.0 m above the bottom)|Its shadow on the bottom=17.6 to 21.8 m out (4.1 m long)|Shadow on the screen=20.6 to 24.7 m; the gap after the fish echo is 7.4 m|Bottom hidden by the bottom itself=none: every part of the bottom inside the beam faces the light|Bottom lit=from 5.8 to 47.4 m out",
      ],
    ],
    [
      "down, steep",
      { lsB: "down", lsA: "steep" },
      [
        "t: [hidden]",
        "h:19ef92fd:139029 x:transducer (the flashlight)|10.0 m deep · 50.0 m across · depth ×2.5 {viewBox=0 0 340 298}",
        "h:ecab586f:1462 x:first bottom echo|0 → 50.0 m from the transducer",
        "r:Fish=outside the beam, or hidden behind the bottom: no echo, no shadow. This beam reaches the bottom only out to 7.0 m; move the fish closer|Bottom hidden by the bottom itself=none: every part of the bottom inside the beam faces the light|Bottom lit=from 0.00 to 7.0 m out",
      ],
    ],
    [
      "drop, low",
      { lsB: "drop", lsA: "low" },
      [
        "t: [hidden]",
        "h:411afd05:139085 x:transducer (the flashlight)|10.0 m deep · 50.0 m across · depth ×2.5 {viewBox=0 0 340 314}",
        "h:2df53b2f:9978 x:first bottom echo|fish|fish shadow|0 → 50.0 m from the transducer",
        "r:Fish echo on the screen=13.2 m from the transducer (really 12.0 m out, 3.0 m above the bottom)|Its shadow on the bottom=16.7 to 18.9 m out (2.2 m long)|Shadow on the screen=19.5 to 21.4 m; the gap after the fish echo is 6.3 m|Bottom hidden by the bottom itself=22.1 to 37.4 m out (black on the screen)|Bottom lit=from 5.8 to 47.0 m out",
      ],
    ],
    [
      "drop, steep",
      { lsB: "drop", lsA: "steep" },
      [
        "t: [hidden]",
        "h:e466387c:139029 x:transducer (the flashlight)|10.0 m deep · 50.0 m across · depth ×2.5 {viewBox=0 0 340 314}",
        "h:ecab586f:1462 x:first bottom echo|0 → 50.0 m from the transducer",
        "r:Fish=outside the beam, or hidden behind the bottom: no echo, no shadow. This beam reaches the bottom only out to 7.0 m; move the fish closer|Bottom hidden by the bottom itself=none: every part of the bottom inside the beam faces the light|Bottom lit=from 0.00 to 7.0 m out",
      ],
    ],
    [
      "wave, low",
      { lsB: "wave", lsA: "low" },
      [
        "t: [hidden]",
        "h:52152e88:138990 x:transducer (the flashlight)|10.0 m deep · 50.0 m across · depth ×2.5 {viewBox=0 0 340 223}",
        "h:2ecb7ea8:11071 x:first bottom echo|fish|fish shadow|0 → 50.0 m from the transducer",
        "r:Fish echo on the screen=12.9 m from the transducer (really 12.0 m out, 3.0 m above the bottom)|Its shadow on the bottom=19.1 to 20.1 m out (1.1 m long)|Shadow on the screen=21.6 to 22.3 m; the gap after the fish echo is 8.7 m|Bottom hidden by the bottom itself=24.0 to 30.4 m out, 36.6 to 44.5 m out (black on the screen)|Bottom lit=from 5.9 to 49.2 m out",
      ],
    ],
    [
      "wave, steep",
      { lsB: "wave", lsA: "steep" },
      [
        "t: [hidden]",
        "h:75a02f35:139032 x:transducer (the flashlight)|10.0 m deep · 50.0 m across · depth ×2.5 {viewBox=0 0 340 223}",
        "h:127f068f:1394 x:first bottom echo|0 → 50.0 m from the transducer",
        "r:Fish=outside the beam, or hidden behind the bottom: no echo, no shadow. This beam reaches the bottom only out to 6.9 m; move the fish closer|Bottom hidden by the bottom itself=none: every part of the bottom inside the beam faces the light|Bottom lit=from 0.00 to 6.9 m out",
      ],
    ],
    [
      "depth 0.4, rock, low",
      { dep: "0.4", lsB: "rock", lsA: "low", lsfx: "0.48", lsfh: "0.12" },
      [
        "t:That puts the fish above the surface; lower the height. [shown]",
        "h:1b187f34:138390 x:transducer (the flashlight)|0.40 m deep · 2.0 m across · depth ×2.5 {viewBox=0 0 340 200}",
        "h:d12bcf2f:15748 x:first bottom echo|0 → 2.0 m from the transducer",
        "r:Bottom hidden by the bottom itself=0.91 to 1.1 m out (black on the screen)|Bottom lit=from 0.23 to 2.0 m out",
      ],
    ],
    [
      "depth 0.4, drop, steep",
      { dep: "0.4", lsB: "drop", lsA: "steep", lsfx: "0.48", lsfh: "0.12" },
      [
        "t:That puts the fish above the surface; lower the height. [shown]",
        "h:fad38728:138924 x:transducer (the flashlight)|0.40 m deep · 2.0 m across · depth ×2.5 {viewBox=0 0 340 314}",
        "h:c61bac78:1461 x:first bottom echo|0 → 2.0 m from the transducer",
        "r:Bottom hidden by the bottom itself=none: every part of the bottom inside the beam faces the light|Bottom lit=from 0.00 to 0.28 m out",
      ],
    ],
    [
      "depth 0.4, up, low",
      { dep: "0.4", lsB: "up", lsA: "low", lsfx: "0.48", lsfh: "0.12" },
      [
        "t:That puts the fish above the surface; lower the height. [shown]",
        "h:2416099e:138229 x:transducer (the flashlight)|0.40 m deep · 2.0 m across · depth ×2.5 {viewBox=0 0 340 200}",
        "h:aac41878:17871 x:first bottom echo|0 → 2.0 m from the transducer",
        "r:Bottom hidden by the bottom itself=none: every part of the bottom inside the beam faces the light|Bottom lit=from 0.23 to 2.0 m out",
      ],
    ],
    [
      "depth 100, rock, low",
      { dep: "100", lsB: "rock", lsA: "low", lsfx: "120", lsfh: "30" },
      [
        "t: [hidden]",
        "h:d32ba475:138702 x:transducer (the flashlight)|100.0 m deep · 500.0 m across · depth ×2.5 {viewBox=0 0 340 200}",
        "h:c8c119f1:15381 x:first bottom echo|fish|fish shadow|0 → 500.0 m from the transducer",
        "r:Fish echo on the screen=132.2 m from the transducer (really 120.0 m out, 30.0 m above the bottom)|Its shadow on the bottom=167.1 to 189.3 m out (22.1 m long)|Shadow on the screen=194.8 to 214.5 m; the gap after the fish echo is 62.6 m|Bottom hidden by the bottom itself=228.6 to 272.9 m out (black on the screen)|Bottom lit=from 57.9 to 489.3 m out",
      ],
    ],
    [
      'fish distance "0"',
      { lsfx: "0" },
      [
        "t: [hidden]",
        "h:1d0bfc85:138494 x:transducer (the flashlight)|10.0 m deep · 50.0 m across · depth ×2.5 {viewBox=0 0 340 201}",
        "h:6446e43a:15749 x:first bottom echo|0 → 50.0 m from the transducer",
        "r:Fish=outside the beam, or hidden behind the bottom: no echo, no shadow|Bottom hidden by the bottom itself=22.9 to 27.3 m out (black on the screen)|Bottom lit=from 5.8 to 48.9 m out",
      ],
    ],
    [
      'fish distance "50"',
      { lsfx: "50" },
      [
        "t: [hidden]",
        "h:6380aace:138720 x:transducer (the flashlight)|10.0 m deep · 50.0 m across · depth ×2.5 {viewBox=0 0 340 201}",
        "h:ba0a10df:15927 x:first bottom echo|fish|0 → 50.0 m from the transducer",
        "r:Fish echo on the screen=49.9 m from the transducer (really 50.0 m out, 3.0 m above the bottom)|Its shadow=lands beyond the beam's reach, so the screen shows the fish but no shadow|Bottom hidden by the bottom itself=22.9 to 27.3 m out (black on the screen)|Bottom lit=from 5.8 to 48.9 m out",
      ],
    ],
    [
      'fish distance "50.00000000000001"',
      { lsfx: "50.00000000000001" },
      [
        "t:Enter a fish distance from 0 to 50.0 m (5 × the depth). [shown]",
        "h:0b914826:138391 x:transducer (the flashlight)|10.0 m deep · 50.0 m across · depth ×2.5 {viewBox=0 0 340 201}",
        "h:6446e43a:15749 x:first bottom echo|0 → 50.0 m from the transducer",
        "r:Bottom hidden by the bottom itself=22.9 to 27.3 m out (black on the screen)|Bottom lit=from 5.8 to 48.9 m out",
      ],
    ],
    [
      'fish distance "-0.01"',
      { lsfx: "-0.01" },
      [
        "t:Enter a fish distance from 0 to 50.0 m (5 × the depth). [shown]",
        "h:0b914826:138391 x:transducer (the flashlight)|10.0 m deep · 50.0 m across · depth ×2.5 {viewBox=0 0 340 201}",
        "h:6446e43a:15749 x:first bottom echo|0 → 50.0 m from the transducer",
        "r:Bottom hidden by the bottom itself=22.9 to 27.3 m out (black on the screen)|Bottom lit=from 5.8 to 48.9 m out",
      ],
    ],
    [
      'fish distance "abc"',
      { lsfx: "abc" },
      [
        "t:Enter a fish distance from 0 to 50.0 m (5 × the depth). [shown]",
        "h:0b914826:138391 x:transducer (the flashlight)|10.0 m deep · 50.0 m across · depth ×2.5 {viewBox=0 0 340 201}",
        "h:6446e43a:15749 x:first bottom echo|0 → 50.0 m from the transducer",
        "r:Bottom hidden by the bottom itself=22.9 to 27.3 m out (black on the screen)|Bottom lit=from 5.8 to 48.9 m out",
      ],
    ],
    [
      'fish height "0"',
      { lsfh: "0" },
      [
        "t: [hidden]",
        "h:d28abbb6:138755 x:transducer (the flashlight)|10.0 m deep · 50.0 m across · depth ×2.5 {viewBox=0 0 340 201}",
        "h:88476ac2:15946 x:first bottom echo|fish|fish shadow|0 → 50.0 m from the transducer",
        "r:Fish echo on the screen=15.0 m from the transducer (really 12.0 m out, 0.00 m above the bottom)|Its shadow on the bottom=11.6 to 13.0 m out (1.4 m long)|Shadow on the screen=15.3 to 16.4 m; the gap after the fish echo is 0.38 m|Bottom hidden by the bottom itself=22.9 to 27.3 m out (black on the screen)|Bottom lit=from 5.8 to 48.9 m out",
      ],
    ],
    [
      'fish height "9.496"',
      { lsfh: "9.496" },
      [
        "t:That puts the fish above the surface; lower the height. [shown]",
        "h:0b914826:138391 x:transducer (the flashlight)|10.0 m deep · 50.0 m across · depth ×2.5 {viewBox=0 0 340 201}",
        "h:6446e43a:15749 x:first bottom echo|0 → 50.0 m from the transducer",
        "r:Bottom hidden by the bottom itself=22.9 to 27.3 m out (black on the screen)|Bottom lit=from 5.8 to 48.9 m out",
      ],
    ],
    [
      'fish height "-0.01"',
      { lsfh: "-0.01" },
      [
        "t:Enter a height of 0 m or more. [shown]",
        "h:0b914826:138391 x:transducer (the flashlight)|10.0 m deep · 50.0 m across · depth ×2.5 {viewBox=0 0 340 201}",
        "h:6446e43a:15749 x:first bottom echo|0 → 50.0 m from the transducer",
        "r:Bottom hidden by the bottom itself=22.9 to 27.3 m out (black on the screen)|Bottom lit=from 5.8 to 48.9 m out",
      ],
    ],
    [
      'fish height "x"',
      { lsfh: "x" },
      [
        "t:Enter a height of 0 m or more. [shown]",
        "h:0b914826:138391 x:transducer (the flashlight)|10.0 m deep · 50.0 m across · depth ×2.5 {viewBox=0 0 340 201}",
        "h:6446e43a:15749 x:first bottom echo|0 → 50.0 m from the transducer",
        "r:Bottom hidden by the bottom itself=22.9 to 27.3 m out (black on the screen)|Bottom lit=from 5.8 to 48.9 m out",
      ],
    ],
    [
      "fish at the limit of the surface, depth 8, height 7.5968",
      { dep: "8", lsB: "flat", lsfh: "7.5968", lsfx: "10" },
      [
        "t:That puts the fish above the surface; lower the height. [shown]",
        "h:7ad0aca6:138264 x:transducer (the flashlight)|8.0 m deep · 40.0 m across · depth ×2.5 {viewBox=0 0 340 200}",
        "h:1e0c6bd6:17944 x:first bottom echo|0 → 40.0 m from the transducer",
        "r:Bottom hidden by the bottom itself=none: every part of the bottom inside the beam faces the light|Bottom lit=from 4.6 to 39.1 m out",
      ],
    ],
    [
      "fish at the limit of the surface, depth 8, height 7.596799999999999",
      { dep: "8", lsB: "flat", lsfh: "7.596799999999999", lsfx: "10" },
      [
        "t: [hidden]",
        "h:dea2e09a:138367 x:transducer (the flashlight)|8.0 m deep · 40.0 m across · depth ×2.5 {viewBox=0 0 340 200}",
        "h:1e0c6bd6:17944 x:first bottom echo|0 → 40.0 m from the transducer",
        "r:Fish=outside the beam, or hidden behind the bottom: no echo, no shadow|Bottom hidden by the bottom itself=none: every part of the bottom inside the beam faces the light|Bottom lit=from 4.6 to 39.1 m out",
      ],
    ],
    [
      "fish at the limit of the surface, depth 8, height 7.596800000000001",
      { dep: "8", lsB: "flat", lsfh: "7.596800000000001", lsfx: "10" },
      [
        "t:That puts the fish above the surface; lower the height. [shown]",
        "h:7ad0aca6:138264 x:transducer (the flashlight)|8.0 m deep · 40.0 m across · depth ×2.5 {viewBox=0 0 340 200}",
        "h:1e0c6bd6:17944 x:first bottom echo|0 → 40.0 m from the transducer",
        "r:Bottom hidden by the bottom itself=none: every part of the bottom inside the beam faces the light|Bottom lit=from 4.6 to 39.1 m out",
      ],
    ],
    [
      "fish at the limit of the surface, depth 9.7, height 9.21112",
      { dep: "9.7", lsB: "flat", lsfh: "9.21112", lsfx: "10" },
      [
        "t:That puts the fish above the surface; lower the height. [shown]",
        "h:720b02d1:138264 x:transducer (the flashlight)|9.7 m deep · 48.5 m across · depth ×2.5 {viewBox=0 0 340 200}",
        "h:9d3db9ef:17944 x:first bottom echo|0 → 48.5 m from the transducer",
        "r:Bottom hidden by the bottom itself=none: every part of the bottom inside the beam faces the light|Bottom lit=from 5.6 to 47.5 m out",
      ],
    ],
    [
      "sv-SE, rock, low, 12,5, 3,5",
      { locale: "sv-SE", lsB: "rock", lsA: "low", lsfx: "12,5", lsfh: "3,5" },
      [
        "t: [hidden]",
        "h:6582e64b:138677 x:transducer (the flashlight)|10,0 m deep · 50,0 m across · depth ×2,5 {viewBox=0 0 340 201}",
        "h:b82b2393:15877 x:first bottom echo|fish|fish shadow|0 → 50,0 m from the transducer",
        "r:Fish echo on the screen=13,4 m from the transducer (really 12,5 m out, 3,5 m above the bottom)|Its shadow on the bottom=18,9 to 20,1 m out (1,2 m long)|Shadow on the screen=21,3 to 22,4 m; the gap after the fish echo is 7,9 m|Bottom hidden by the bottom itself=22,9 to 27,3 m out (black on the screen)|Bottom lit=from 5,8 to 48,9 m out",
      ],
    ],
    [
      "sv-SE, flat, low, abc, 3",
      { locale: "sv-SE", lsB: "flat", lsA: "low", lsfx: "abc", lsfh: "3" },
      [
        "t:Enter a fish distance from 0 to 50,0 m (5 × the depth). [shown]",
        "h:6cd5cfc9:138265 x:transducer (the flashlight)|10,0 m deep · 50,0 m across · depth ×2,5 {viewBox=0 0 340 201}",
        "h:67d54557:17944 x:first bottom echo|0 → 50,0 m from the transducer",
        "r:Bottom hidden by the bottom itself=none: every part of the bottom inside the beam faces the light|Bottom lit=from 5,8 to 48,9 m out",
      ],
    ],
    [
      "sv-SE, flat, low, 0,5, -1",
      { locale: "sv-SE", lsB: "flat", lsA: "low", lsfx: "0,5", lsfh: "-1" },
      [
        "t:Enter a height of 0 m or more. [shown]",
        "h:6cd5cfc9:138265 x:transducer (the flashlight)|10,0 m deep · 50,0 m across · depth ×2,5 {viewBox=0 0 340 201}",
        "h:67d54557:17944 x:first bottom echo|0 → 50,0 m from the transducer",
        "r:Bottom hidden by the bottom itself=none: every part of the bottom inside the beam faces the light|Bottom lit=from 5,8 to 48,9 m out",
      ],
    ],
    [
      "sv-SE, depth 0,4",
      { locale: "sv-SE", dep: "0,4", lsfx: "2", lsfh: "0,1" },
      [
        "t:That puts the fish above the surface; lower the height. [shown]",
        "h:e439bc4a:138390 x:transducer (the flashlight)|0,40 m deep · 2,0 m across · depth ×2,5 {viewBox=0 0 340 200}",
        "h:9a970061:15748 x:first bottom echo|0 → 2,0 m from the transducer",
        "r:Bottom hidden by the bottom itself=0,91 to 1,1 m out (black on the screen)|Bottom lit=from 0,23 to 2,0 m out",
      ],
    ],
    ['depth "0"', { dep: "0" }, ["t:Fix the depth in Settings. [shown]", NOT, NOT, NOT]],
    ['depth "abc"', { dep: "abc" }, ["t:Fix the depth in Settings. [shown]", NOT, NOT, NOT]],
    // Rows added after a mutation round: each is an input some changed copy of the module did not tell apart.
    [
      "fish touching the transducer, depth 11, height 10.4192",
      { dep: "11", lsB: "flat", lsA: "low", lsfx: "0", lsfh: "10.4192" },
      [
        "t: [hidden]",
        "h:125af3cb:138367 x:transducer (the flashlight)|11.0 m deep · 55.0 m across · depth ×2.5 {viewBox=0 0 340 200}",
        "h:fb6193cc:17944 x:first bottom echo|0 → 55.0 m from the transducer",
        "r:Fish=outside the beam, or hidden behind the bottom: no echo, no shadow|Bottom hidden by the bottom itself=none: every part of the bottom inside the beam faces the light|Bottom lit=from 6.4 to 53.8 m out",
      ],
    ],
    [
      "fish just under the surface above the transducer, height 9.4",
      { lsB: "flat", lsA: "low", lsfx: "0", lsfh: "9.4" },
      [
        "t: [hidden]",
        "h:54013ee7:136709 x:transducer (the flashlight)|10.0 m deep · 50.0 m across · depth ×2.5 {viewBox=0 0 340 201}",
        "h:36aef151:9953 x:first bottom echo|fish|fish shadow|0 → 50.0 m from the transducer",
        "r:Fish echo on the screen=0.08 m from the transducer (really 0.00 m out, 9.4 m above the bottom)|Its shadow on the bottom=5.8 to 28.9 m out (23.1 m long)|Shadow on the screen=11.5 to 30.5 m; the gap after the fish echo is 11.5 m|Bottom hidden by the bottom itself=none: every part of the bottom inside the beam faces the light|Bottom lit=from 28.9 to 48.9 m out",
      ],
    ],
    [
      "steep beam, fish at the end of the lit stretch, 7 m out",
      { lsB: "flat", lsA: "steep", lsfx: "7", lsfh: "3" },
      [
        "t: [hidden]",
        "h:becdc9cd:139029 x:transducer (the flashlight)|10.0 m deep · 50.0 m across · depth ×2.5 {viewBox=0 0 340 201}",
        "h:ecab586f:1462 x:first bottom echo|0 → 50.0 m from the transducer",
        "r:Fish=outside the beam, or hidden behind the bottom: no echo, no shadow|Bottom hidden by the bottom itself=none: every part of the bottom inside the beam faces the light|Bottom lit=from 0.00 to 7.0 m out",
      ],
    ],
    [
      "unknown bottom and angle",
      { lsB: "foo", lsA: "other" },
      [
        "t: [hidden]",
        "h:657f5483:138574 x:transducer (the flashlight)|10.0 m deep · 50.0 m across · depth ×2.5 {viewBox=0 0 340 201}",
        "h:4a95d54c:17575 x:first bottom echo|fish|fish shadow|0 → 50.0 m from the transducer",
        "r:Fish echo on the screen=13.2 m from the transducer (really 12.0 m out, 3.0 m above the bottom)|Its shadow on the bottom=16.7 to 18.9 m out (2.2 m long)|Shadow on the screen=19.5 to 21.4 m; the gap after the fish echo is 6.3 m|Bottom hidden by the bottom itself=none: every part of the bottom inside the beam faces the light|Bottom lit=from 5.8 to 48.9 m out",
      ],
    ],
  ];

  it.each(readable)("%s", (_label, over, expected) => {
    const view = viewOf(over);
    expect(toldOf(view)).toEqual(expected);
    expect(Object.keys(view).filter((key) => !(KEYS as readonly string[]).includes(key))).toEqual(
      [],
    );
  });
});

// The earlier page writes "Bottom lit: from a to b" from the start of the first lit stretch to the end of the last
// (line 1491), so the span takes in the stretches that are not lit, the fish's shadow and the bottom's own
// shadow, which the lines above it tell (legacy defect 10 of the description).
describe("the lit span of the results", () => {
  it.each([
    [
      "rock, low beam, fish 20 m out and 0.5 m up",
      { lsB: "rock", lsA: "low", lsfx: "20", lsfh: "0.5" },
      "Its shadow on the bottom=20.1 to 20.3 m out (0.21 m long)",
      "Bottom hidden by the bottom itself=22.9 to 27.3 m out (black on the screen)",
      "Bottom lit=from 5.8 to 48.9 m out",
    ],
    [
      "wave, low beam, fish 30 m out and 2 m up",
      { lsB: "wave", lsA: "low", lsfx: "30", lsfh: "2" },
      "Its shadow on the bottom=32.4 to 33.0 m out (0.64 m long)",
      "Bottom hidden by the bottom itself=24.0 to 30.4 m out, 36.6 to 44.5 m out (black on the screen)",
      "Bottom lit=from 5.9 to 49.2 m out",
    ],
  ])("%s", (_label, over, shadow, hidden, lit) => {
    const list = rows(viewOf(over)["ls-res"]?.html ?? "");
    expect(list).toContain(shadow);
    expect(list).toContain(hidden);
    expect(list?.at(-1)).toBe(lit);
  });
});

describe("the legend", () => {
  const LEGEND = (s4: string): string =>
    `<span><i style="border-top:8px solid ${s4};opacity:0.6"></i>lit by the beam</span><span><i style="border-top:8px solid var(--fg);opacity:0.3"></i>in the beam, but in shadow</span><span><i style="border-top:3px solid var(--fg)"></i>bottom in shadow</span><span><i style="border-top:3px solid ${s4}"></i>bottom lit (brighter = more square-on)</span>`;

  it.each([["#c98500"], ["#123456"], [""]])("names the colour of the lit beam, %p", (s4) => {
    expect(viewOf({ s4 })["ls-leg"]).toEqual({ html: LEGEND(s4) });
  });

  it("is written whatever the fish, and not at all while the depth fails", () => {
    expect(viewOf({ lsfx: "abc" })["ls-leg"]).toEqual({ html: LEGEND(LIGHT_S4) });
    expect(viewOf({ dep: "0" })["ls-leg"]).toBeUndefined();
  });

  it("takes the colour from the theme, and has none when the theme gives none", () => {
    const fields = fieldsOf();
    const input = inputOf(fields, { lsB: "rock", lsA: "low" }, "en-US", undefined);
    expect(lightShadowView(input)["ls-leg"]).toEqual({ html: LEGEND("") });
  });
});

describe("what the section writes, as one line for each row", () => {
  const bulk: readonly (readonly [string, Over, string])[] = [
    [
      "depth 0.05, rock, low",
      { dep: "0.05", lsB: "rock", lsA: "low", lsfx: "0.06", lsfh: "0.02" },
      "That puts the fish above the surface; lower the height. [shown] | 0 0 340 200 | 5e6cb9b4:138391 | 73add612:15749 | 61eed68a:165",
    ],
    [
      "depth 0.05, drop, steep",
      { dep: "0.05", lsB: "drop", lsA: "steep", lsfx: "0.06", lsfh: "0.02" },
      "That puts the fish above the surface; lower the height. [shown] | 0 0 340 314 | 7a85e838:138925 | 09809f03:1462 | 369ecc9c:187",
    ],
    [
      "depth 0.05, up, low",
      { dep: "0.05", lsB: "up", lsA: "low", lsfx: "0.06", lsfh: "0.02" },
      "That puts the fish above the surface; lower the height. [shown] | 0 0 340 200 | 6f105292:138230 | fea2a303:17872 | 29b71100:187",
    ],
    [
      "depth 1, rock, low",
      { dep: "1", lsB: "rock", lsA: "low", lsfx: "1.2", lsfh: "0.3" },
      " [hidden] | 0 0 340 200 | f25bf83d:138257 | 7967d49a:9505 | cc4fd937:484",
    ],
    [
      "depth 1, drop, steep",
      { dep: "1", lsB: "drop", lsA: "steep", lsfx: "1.2", lsfh: "0.3" },
      " [hidden] | 0 0 340 314 | 9ef1169f:139029 | 3c9ae11f:1461 | 0264ffbb:356",
    ],
    [
      "depth 1, up, low",
      { dep: "1", lsB: "up", lsA: "low", lsfx: "1.2", lsfh: "0.3" },
      " [hidden] | 0 0 340 200 | 72966298:137963 | 9459a851:13883 | 87143bd1:490",
    ],
    [
      "depth 2.5, rock, low",
      { dep: "2.5", lsB: "rock", lsA: "low", lsfx: "3", lsfh: "0.75" },
      " [hidden] | 0 0 340 201 | c46df273:138626 | 6ae504c6:14749 | b388bcec:464",
    ],
    [
      "depth 2.5, drop, steep",
      { dep: "2.5", lsB: "drop", lsA: "steep", lsfx: "3", lsfh: "0.75" },
      " [hidden] | 0 0 340 314 | eae3be30:139030 | 2dc9a630:1462 | aeaa9281:354",
    ],
    [
      "depth 2.5, up, low",
      { dep: "2.5", lsB: "up", lsA: "low", lsfx: "3", lsfh: "0.75" },
      " [hidden] | 0 0 340 201 | 73188381:138481 | 5644a56b:16575 | e4182307:488",
    ],
    [
      "depth 3, rock, low",
      { dep: "3", lsB: "rock", lsA: "low", lsfx: "3.6", lsfh: "0.9" },
      " [hidden] | 0 0 340 200 | 710c81ec:138648 | 0fe19d4d:14818 | d14debc2:464",
    ],
    [
      "depth 3, drop, steep",
      { dep: "3", lsB: "drop", lsA: "steep", lsfx: "3.6", lsfh: "0.9" },
      " [hidden] | 0 0 340 314 | af7f1bcd:139028 | 3f54a6b6:1534 | 22469779:354",
    ],
    [
      "depth 3, up, low",
      { dep: "3", lsB: "up", lsA: "low", lsfx: "3.6", lsfh: "0.9" },
      " [hidden] | 0 0 340 200 | 19364806:138491 | d24e233c:16929 | 353c8b42:488",
    ],
    [
      "depth 7.3, rock, low",
      { dep: "7.3", lsB: "rock", lsA: "low", lsfx: "8.76", lsfh: "2.19" },
      " [hidden] | 0 0 340 200 | 90892eaa:138699 | be89ce68:15380 | 949a6e62:469",
    ],
    [
      "depth 7.3, drop, steep",
      { dep: "7.3", lsB: "drop", lsA: "steep", lsfx: "8.76", lsfh: "2.19" },
      " [hidden] | 0 0 340 314 | 3cd8ddea:139028 | 79776e3a:1462 | 09960019:354",
    ],
    [
      "depth 7.3, up, low",
      { dep: "7.3", lsB: "up", lsA: "low", lsfx: "8.76", lsfh: "2.19" },
      " [hidden] | 0 0 340 200 | 473cae56:138522 | 234d9b31:17778 | 065bcd6b:491",
    ],
    [
      "depth 33.3, rock, low",
      { dep: "33.3", lsB: "rock", lsA: "low", lsfx: "39.96", lsfh: "9.99" },
      " [hidden] | 0 0 340 200 | 322e7f37:138701 | 4dc37118:15381 | f5e1d3f8:475",
    ],
    [
      "depth 33.3, drop, steep",
      { dep: "33.3", lsB: "drop", lsA: "steep", lsfx: "39.96", lsfh: "9.99" },
      " [hidden] | 0 0 340 314 | dccd5c21:139030 | 2c1c04a6:1463 | ef9c3101:356",
    ],
    [
      "depth 33.3, up, low",
      { dep: "33.3", lsB: "up", lsA: "low", lsfx: "39.96", lsfh: "9.99" },
      " [hidden] | 0 0 340 200 | 40c24075:138524 | 42de7f27:17779 | dc58a194:497",
    ],
    [
      "depth 100, drop, steep",
      { dep: "100", lsB: "drop", lsA: "steep", lsfx: "120", lsfh: "30" },
      " [hidden] | 0 0 340 314 | 6b02e81a:139031 | 6b5b857f:1463 | 8e8d75af:356",
    ],
    [
      "depth 100, up, low",
      { dep: "100", lsB: "up", lsA: "low", lsfx: "120", lsfh: "30" },
      " [hidden] | 0 0 340 200 | 854e4fab:138525 | c9e41d5a:17779 | 49b0ce21:504",
    ],
    [
      "depth 250, rock, low",
      { dep: "250", lsB: "rock", lsA: "low", lsfx: "300", lsfh: "75" },
      " [hidden] | 0 0 340 200 | 2ab20f37:138703 | 745155dc:15382 | 3a5ef852:487",
    ],
    [
      "depth 250, drop, steep",
      { dep: "250", lsB: "drop", lsA: "steep", lsfx: "300", lsfh: "75" },
      " [hidden] | 0 0 340 314 | 3684b949:139032 | 604b0442:1464 | 9bc03bb5:358",
    ],
    [
      "depth 250, up, low",
      { dep: "250", lsB: "up", lsA: "low", lsfx: "300", lsfh: "75" },
      " [hidden] | 0 0 340 200 | 2dd388a9:138526 | f0958065:17780 | 7587520d:507",
    ],
    [
      'fish distance "0.5"',
      { lsfx: "0.5" },
      " [hidden] | 0 0 340 201 | 3f268b8d:138495 | 6446e43a:15749 | 502a5a3d:262",
    ],
    [
      'fish distance "5"',
      { lsfx: "5" },
      " [hidden] | 0 0 340 201 | 462f5a33:138769 | c7d2af70:16155 | 4e8ee0d3:467",
    ],
    [
      'fish distance "10"',
      { lsfx: "10" },
      " [hidden] | 0 0 340 201 | c2f6fb42:138696 | ec9c2743:15521 | 87da573d:471",
    ],
    [
      'fish distance "22"',
      { lsfx: "22" },
      " [hidden] | 0 0 340 201 | cd14299d:138829 | 99202f1c:13891 | c5ae1b11:472",
    ],
    [
      'fish distance "35"',
      { lsfx: "35" },
      " [hidden] | 0 0 340 201 | a9d116ad:138720 | 985a663e:15933 | 1096a678:398",
    ],
    [
      'fish distance "-1e-17"',
      { lsfx: "-1e-17" },
      "Enter a fish distance from 0 to 50.0 m (5 × the depth). [shown] | 0 0 340 201 | 0b914826:138391 | 6446e43a:15749 | b94dd04d:164",
    ],
    [
      'fish distance ""',
      { lsfx: "" },
      "Enter a fish distance from 0 to 50.0 m (5 × the depth). [shown] | 0 0 340 201 | 0b914826:138391 | 6446e43a:15749 | b94dd04d:164",
    ],
    [
      'fish distance " "',
      { lsfx: " " },
      "Enter a fish distance from 0 to 50.0 m (5 × the depth). [shown] | 0 0 340 201 | 0b914826:138391 | 6446e43a:15749 | b94dd04d:164",
    ],
    [
      'fish distance "1e1"',
      { lsfx: "1e1" },
      " [hidden] | 0 0 340 201 | c2f6fb42:138696 | ec9c2743:15521 | 87da573d:471",
    ],
    [
      'fish distance "12,5"',
      { lsfx: "12,5" },
      " [hidden] | 0 0 340 201 | b707e430:138704 | 7a6acd0e:15380 | 1f8e5d2b:471",
    ],
    [
      'fish distance "Infinity"',
      { lsfx: "Infinity" },
      "Enter a fish distance from 0 to 50.0 m (5 × the depth). [shown] | 0 0 340 201 | 0b914826:138391 | 6446e43a:15749 | b94dd04d:164",
    ],
    [
      'fish distance "0x10"',
      { lsfx: "0x10" },
      " [hidden] | 0 0 340 201 | b750cf74:138742 | 7ab28954:16165 | cf6850da:472",
    ],
    [
      'fish height "0.5"',
      { lsfh: "0.5" },
      " [hidden] | 0 0 340 201 | b4a1c4e9:138757 | 70fd64ea:15802 | b7a68881:472",
    ],
    [
      'fish height "9"',
      { lsfh: "9" },
      " [hidden] | 0 0 340 201 | b651ba6d:138494 | 6446e43a:15749 | 502a5a3d:262",
    ],
    [
      'fish height "9.4"',
      { lsfh: "9.4" },
      " [hidden] | 0 0 340 201 | cd160600:138494 | 6446e43a:15749 | 502a5a3d:262",
    ],
    [
      'fish height "9.49"',
      { lsfh: "9.49" },
      " [hidden] | 0 0 340 201 | 758ddfdf:138494 | 6446e43a:15749 | 502a5a3d:262",
    ],
    [
      'fish height "9.495999999999999"',
      { lsfh: "9.495999999999999" },
      " [hidden] | 0 0 340 201 | b872c7c4:138494 | 6446e43a:15749 | 502a5a3d:262",
    ],
    [
      'fish height "9.5"',
      { lsfh: "9.5" },
      "That puts the fish above the surface; lower the height. [shown] | 0 0 340 201 | 0b914826:138391 | 6446e43a:15749 | b94dd04d:164",
    ],
    [
      'fish height "10"',
      { lsfh: "10" },
      "That puts the fish above the surface; lower the height. [shown] | 0 0 340 201 | 0b914826:138391 | 6446e43a:15749 | b94dd04d:164",
    ],
    [
      'fish height "-0"',
      { lsfh: "-0" },
      " [hidden] | 0 0 340 201 | d28abbb6:138755 | 88476ac2:15946 | 9d11f815:474",
    ],
    [
      'fish height ""',
      { lsfh: "" },
      "Enter a height of 0 m or more. [shown] | 0 0 340 201 | 0b914826:138391 | 6446e43a:15749 | b94dd04d:164",
    ],
    [
      'fish height "1e-9"',
      { lsfh: "1e-9" },
      " [hidden] | 0 0 340 201 | d28abbb6:138755 | 88476ac2:15946 | d522f91c:473",
    ],
    [
      "fish at the edge of the range, depth 8, distance 40",
      { dep: "8", lsfx: "40", lsfh: "0" },
      " [hidden] | 0 0 340 200 | 89fc0435:138495 | 9661da4d:15749 | afc537b0:333",
    ],
    [
      "fish at the edge of the range, depth 8, distance 40.00000000000001",
      { dep: "8", lsfx: "40.00000000000001", lsfh: "0" },
      "Enter a fish distance from 0 to 40.0 m (5 × the depth). [shown] | 0 0 340 200 | ad518657:138390 | 9661da4d:15749 | e314fb2e:164",
    ],
    [
      "fish at the edge of the range, depth 33.3, distance 166.5",
      { dep: "33.3", lsfx: "166.5", lsfh: "0" },
      " [hidden] | 0 0 340 200 | 4009bbd5:138497 | a0fb459d:15750 | 0f7a7054:336",
    ],
    [
      "fish at the edge of the range, depth 33.3, distance 166.50000000000003",
      { dep: "33.3", lsfx: "166.50000000000003", lsfh: "0" },
      "Enter a fish distance from 0 to 166.5 m (5 × the depth). [shown] | 0 0 340 200 | f92272d1:138392 | a0fb459d:15750 | df4d53dd:166",
    ],
    [
      "fish at the edge of the range, depth 0.4, distance 2",
      { dep: "0.4", lsfx: "2", lsfh: "0" },
      " [hidden] | 0 0 340 200 | 974e1823:138718 | 6ed0a6fb:15723 | 38979394:467",
    ],
    [
      "flat, low, fish 20 out and 1 up",
      { lsB: "flat", lsA: "low", lsfx: "20", lsfh: "1" },
      " [hidden] | 0 0 340 201 | 89c191c2:138648 | 8a1c7dff:17724 | 5a6050bf:493",
    ],
    [
      "flat, low, fish 30 out and 0 up",
      { lsB: "flat", lsA: "low", lsfx: "30", lsfh: "0" },
      " [hidden] | 0 0 340 201 | 09dad754:138652 | 6f568685:17724 | 06e222cf:495",
    ],
    [
      "flat, low, fish 6 out and 2 up",
      { lsB: "flat", lsA: "low", lsfx: "6", lsfh: "2" },
      " [hidden] | 0 0 340 201 | 83fd8bc4:138635 | a0fb0f8d:18422 | 7bac9406:489",
    ],
    [
      "flat, low, fish 45 out and 6 up",
      { lsB: "flat", lsA: "low", lsfx: "45", lsfh: "6" },
      " [hidden] | 0 0 340 201 | 3bbefdb3:138369 | 1cb4eee9:17944 | 3e37789e:284",
    ],
    [
      "flat, steep, fish 20 out and 1 up",
      { lsB: "flat", lsA: "steep", lsfx: "20", lsfh: "1" },
      " [hidden] | 0 0 340 201 | 8d676949:139030 | ecab586f:1462 | 47103a81:354",
    ],
    [
      "flat, steep, fish 30 out and 0 up",
      { lsB: "flat", lsA: "steep", lsfx: "30", lsfh: "0" },
      " [hidden] | 0 0 340 201 | 56108944:139030 | ecab586f:1462 | 47103a81:354",
    ],
    [
      "flat, steep, fish 6 out and 2 up",
      { lsB: "flat", lsA: "steep", lsfx: "6", lsfh: "2" },
      " [hidden] | 0 0 340 201 | acf49336:139251 | d5cf39d5:1935 | 84770e98:407",
    ],
    [
      "flat, steep, fish 45 out and 6 up",
      { lsB: "flat", lsA: "steep", lsfx: "45", lsfh: "6" },
      " [hidden] | 0 0 340 201 | 6438bfca:139029 | ecab586f:1462 | 47103a81:354",
    ],
    [
      "rock, low, fish 20 out and 1 up",
      { lsB: "rock", lsA: "low", lsfx: "20", lsfh: "1" },
      " [hidden] | 0 0 340 201 | 7c012773:138734 | 1d84c1b6:16238 | eda9d3e6:473",
    ],
    [
      "rock, low, fish 30 out and 0 up",
      { lsB: "rock", lsA: "low", lsfx: "30", lsfh: "0" },
      " [hidden] | 0 0 340 201 | adfb9137:138778 | 7621b232:15529 | 1aa7ee04:473",
    ],
    [
      "rock, low, fish 6 out and 2 up",
      { lsB: "rock", lsA: "low", lsfx: "6", lsfh: "2" },
      " [hidden] | 0 0 340 201 | a760f331:138761 | f54765e2:16227 | c9cd7695:467",
    ],
    [
      "rock, low, fish 45 out and 6 up",
      { lsB: "rock", lsA: "low", lsfx: "45", lsfh: "6" },
      " [hidden] | 0 0 340 201 | 12c5a0aa:138495 | 6446e43a:15749 | 502a5a3d:262",
    ],
    [
      "rock, steep, fish 20 out and 1 up",
      { lsB: "rock", lsA: "steep", lsfx: "20", lsfh: "1" },
      " [hidden] | 0 0 340 201 | e518039c:139030 | ecab586f:1462 | 47103a81:354",
    ],
    [
      "rock, steep, fish 30 out and 0 up",
      { lsB: "rock", lsA: "steep", lsfx: "30", lsfh: "0" },
      " [hidden] | 0 0 340 201 | 34ab394d:139030 | ecab586f:1462 | 47103a81:354",
    ],
    [
      "rock, steep, fish 6 out and 2 up",
      { lsB: "rock", lsA: "steep", lsfx: "6", lsfh: "2" },
      " [hidden] | 0 0 340 201 | 3b91556d:139251 | d5cf39d5:1935 | 84770e98:407",
    ],
    [
      "rock, steep, fish 45 out and 6 up",
      { lsB: "rock", lsA: "steep", lsfx: "45", lsfh: "6" },
      " [hidden] | 0 0 340 201 | 76a0399d:139029 | ecab586f:1462 | 47103a81:354",
    ],
    [
      "up, low, fish 20 out and 1 up",
      { lsB: "up", lsA: "low", lsfx: "20", lsfh: "1" },
      " [hidden] | 0 0 340 201 | b3eeed9a:138597 | da486e4a:17866 | 6f9900cb:493",
    ],
    [
      "up, low, fish 30 out and 0 up",
      { lsB: "up", lsA: "low", lsfx: "30", lsfh: "0" },
      " [hidden] | 0 0 340 201 | 524d6e89:138599 | 65afc71f:17864 | cb79dda4:495",
    ],
    [
      "up, low, fish 6 out and 2 up",
      { lsB: "up", lsA: "low", lsfx: "6", lsfh: "2" },
      " [hidden] | 0 0 340 201 | fdaaf352:138600 | 6f12bfcf:18350 | 83a22b70:489",
    ],
    [
      "up, low, fish 45 out and 6 up",
      { lsB: "up", lsA: "low", lsfx: "45", lsfh: "6" },
      "That puts the fish above the surface; lower the height. [shown] | 0 0 340 201 | 75075d65:138230 | e1cd5c6f:17872 | 084982c8:186",
    ],
    [
      "up, steep, fish 20 out and 1 up",
      { lsB: "up", lsA: "steep", lsfx: "20", lsfh: "1" },
      " [hidden] | 0 0 340 201 | 3511432c:139030 | ecab586f:1462 | 47103a81:354",
    ],
    [
      "up, steep, fish 30 out and 0 up",
      { lsB: "up", lsA: "steep", lsfx: "30", lsfh: "0" },
      " [hidden] | 0 0 340 201 | 9db24df3:139030 | ecab586f:1462 | 47103a81:354",
    ],
    [
      "up, steep, fish 6 out and 2 up",
      { lsB: "up", lsA: "steep", lsfx: "6", lsfh: "2" },
      " [hidden] | 0 0 340 201 | 695a9bc7:139251 | d5cf39d5:1935 | 84770e98:407",
    ],
    [
      "up, steep, fish 45 out and 6 up",
      { lsB: "up", lsA: "steep", lsfx: "45", lsfh: "6" },
      "That puts the fish above the surface; lower the height. [shown] | 0 0 340 201 | 17741a77:138925 | ecab586f:1462 | 50865e4b:186",
    ],
    [
      "down, low, fish 20 out and 1 up",
      { lsB: "down", lsA: "low", lsfx: "20", lsfh: "1" },
      " [hidden] | 0 0 340 298 | e7e7fddc:138816 | 92b55dc0:16017 | 6936092f:493",
    ],
    [
      "down, low, fish 30 out and 0 up",
      { lsB: "down", lsA: "low", lsfx: "30", lsfh: "0" },
      " [hidden] | 0 0 340 298 | e8e159bb:138784 | ea295641:16796 | 93392327:495",
    ],
    [
      "down, low, fish 6 out and 2 up",
      { lsB: "down", lsA: "low", lsfx: "6", lsfh: "2" },
      " [hidden] | 0 0 340 298 | e7ffeefa:138707 | 204a7c60:18417 | 44e3be6c:489",
    ],
    [
      "down, low, fish 45 out and 6 up",
      { lsB: "down", lsA: "low", lsfx: "45", lsfh: "6" },
      " [hidden] | 0 0 340 298 | 34e264c2:138666 | 42868ccf:18125 | 38a920ce:420",
    ],
    [
      "down, steep, fish 20 out and 1 up",
      { lsB: "down", lsA: "steep", lsfx: "20", lsfh: "1" },
      " [hidden] | 0 0 340 298 | cb68a2cc:139030 | ecab586f:1462 | 47103a81:354",
    ],
    [
      "down, steep, fish 30 out and 0 up",
      { lsB: "down", lsA: "steep", lsfx: "30", lsfh: "0" },
      " [hidden] | 0 0 340 298 | 3f4e1dc5:139030 | ecab586f:1462 | 47103a81:354",
    ],
    [
      "down, steep, fish 6 out and 2 up",
      { lsB: "down", lsA: "steep", lsfx: "6", lsfh: "2" },
      " [hidden] | 0 0 340 298 | c41a46ff:139251 | d5cf39d5:1935 | 84770e98:407",
    ],
    [
      "down, steep, fish 45 out and 6 up",
      { lsB: "down", lsA: "steep", lsfx: "45", lsfh: "6" },
      " [hidden] | 0 0 340 298 | d08818b1:139030 | ecab586f:1462 | 47103a81:354",
    ],
    [
      "drop, low, fish 20 out and 1 up",
      { lsB: "drop", lsA: "low", lsfx: "20", lsfh: "1" },
      " [hidden] | 0 0 340 314 | 9995aa85:139197 | 7c85ac8c:9489 | 213baeca:471",
    ],
    [
      "drop, low, fish 30 out and 0 up",
      { lsB: "drop", lsA: "low", lsfx: "30", lsfh: "0" },
      " [hidden] | 0 0 340 314 | 0a6b26ab:138881 | 2ed45958:10347 | 65a54ec3:262",
    ],
    [
      "drop, low, fish 6 out and 2 up",
      { lsB: "drop", lsA: "low", lsfx: "6", lsfh: "2" },
      " [hidden] | 0 0 340 314 | 49075246:139146 | 918004fc:10825 | 5b5b712b:467",
    ],
    [
      "drop, low, fish 45 out and 6 up",
      { lsB: "drop", lsA: "low", lsfx: "45", lsfh: "6" },
      " [hidden] | 0 0 340 314 | 41f19393:139105 | 1d027de2:10531 | b4f418d3:398",
    ],
    [
      "drop, steep, fish 20 out and 1 up",
      { lsB: "drop", lsA: "steep", lsfx: "20", lsfh: "1" },
      " [hidden] | 0 0 340 314 | add06771:139030 | ecab586f:1462 | 47103a81:354",
    ],
    [
      "drop, steep, fish 30 out and 0 up",
      { lsB: "drop", lsA: "steep", lsfx: "30", lsfh: "0" },
      " [hidden] | 0 0 340 314 | 60bc21e0:139030 | ecab586f:1462 | 47103a81:354",
    ],
    [
      "drop, steep, fish 6 out and 2 up",
      { lsB: "drop", lsA: "steep", lsfx: "6", lsfh: "2" },
      " [hidden] | 0 0 340 314 | 243b83ee:139251 | d5cf39d5:1935 | 84770e98:407",
    ],
    [
      "drop, steep, fish 45 out and 6 up",
      { lsB: "drop", lsA: "steep", lsfx: "45", lsfh: "6" },
      " [hidden] | 0 0 340 314 | a386bfcd:139030 | ecab586f:1462 | 47103a81:354",
    ],
    [
      "wave, low, fish 20 out and 1 up",
      { lsB: "wave", lsA: "low", lsfx: "20", lsfh: "1" },
      " [hidden] | 0 0 340 223 | a6638725:139067 | b4840700:11002 | 9acb1c29:492",
    ],
    [
      "wave, low, fish 30 out and 0 up",
      { lsB: "wave", lsA: "low", lsfx: "30", lsfh: "0" },
      " [hidden] | 0 0 340 223 | 3db7b5ef:139053 | fd1a80a4:11511 | 9e491f0a:494",
    ],
    [
      "wave, low, fish 6 out and 2 up",
      { lsB: "wave", lsA: "low", lsfx: "6", lsfh: "2" },
      " [hidden] | 0 0 340 223 | c9c18550:139072 | 867d7e4e:11571 | 5d007ac7:487",
    ],
    [
      "wave, low, fish 45 out and 6 up",
      { lsB: "wave", lsA: "low", lsfx: "45", lsfh: "6" },
      " [hidden] | 0 0 340 223 | 0e9f588d:138816 | d9d33a45:10811 | 9f0d869a:282",
    ],
    [
      "wave, steep, fish 20 out and 1 up",
      { lsB: "wave", lsA: "steep", lsfx: "20", lsfh: "1" },
      " [hidden] | 0 0 340 223 | 639fc264:139033 | 127f068f:1394 | f846d489:354",
    ],
    [
      "wave, steep, fish 30 out and 0 up",
      { lsB: "wave", lsA: "steep", lsfx: "30", lsfh: "0" },
      " [hidden] | 0 0 340 223 | b8b833ef:139033 | 127f068f:1394 | f846d489:354",
    ],
    [
      "wave, steep, fish 6 out and 2 up",
      { lsB: "wave", lsA: "steep", lsfx: "6", lsfh: "2" },
      " [hidden] | 0 0 340 223 | 35bf3c6d:139256 | 4ba94791:1938 | f061c763:407",
    ],
    [
      "wave, steep, fish 45 out and 6 up",
      { lsB: "wave", lsA: "steep", lsfx: "45", lsfh: "6" },
      " [hidden] | 0 0 340 223 | c13ad2a6:139032 | 127f068f:1394 | f846d489:354",
    ],
    [
      "sv-SE, wave, steep, 20, 1",
      { locale: "sv-SE", lsB: "wave", lsA: "steep", lsfx: "20", lsfh: "1" },
      " [hidden] | 0 0 340 223 | 362518c6:139033 | 57910541:1394 | 585295cb:354",
    ],
    [
      "sv-SE, drop, low, 30, 0",
      { locale: "sv-SE", lsB: "drop", lsA: "low", lsfx: "30", lsfh: "0" },
      " [hidden] | 0 0 340 314 | cfd554d9:138881 | c00b21f2:10347 | 0a41accf:262",
    ],
    [
      'depth "-1"',
      { dep: "-1" },
      "Fix the depth in Settings. [shown] | (not written) | (not written) | (not written) | (not written)",
    ],
    [
      'depth ""',
      { dep: "" },
      "Fix the depth in Settings. [shown] | (not written) | (not written) | (not written) | (not written)",
    ],
    [
      'depth "1e-320"',
      { dep: "1e-320" },
      "Enter a fish distance from 0 to 0.00 m (5 × the depth). [shown] | 0 0 340 Infinity | 745e369e:169724 | 79567b06:200 | 1918e330:187",
    ],
    [
      "empty bottom",
      { lsB: "", lsA: "" },
      " [hidden] | 0 0 340 201 | 657f5483:138574 | 4a95d54c:17575 | dc2e8353:493",
    ],
    [
      "steep in capitals",
      { lsA: "STEEP" },
      " [hidden] | 0 0 340 201 | bf0ba12c:138700 | fc160e3d:15380 | 78016d38:471",
    ],
    [
      "theme colour #123456",
      { s4: "#123456" },
      " [hidden] | 0 0 340 201 | fb752bcc:138700 | fc160e3d:15380 | 78016d38:471",
    ],
    [
      "theme colour empty",
      { s4: "" },
      " [hidden] | 0 0 340 201 | 469a55c6:135109 | fc160e3d:15380 | 78016d38:471",
    ],
    [
      "theme colour in the steep beam",
      { s4: "#123456", lsA: "steep" },
      " [hidden] | 0 0 340 201 | 7526c7fb:139029 | ecab586f:1462 | 47103a81:354",
    ],
    // Rows added after a mutation round: each is an input some changed copy of the module did not tell apart.
    // Depths under 0.01 m, at which the tolerance eps = 0.004 * H + 1e-6 of the classes (the 1e-6, the sign
    // and the 0.004) changes the class of a point of the wave bottom, and so the picture. The fish is lost at
    // these depths (the page's own messages); the results read 0.00 m throughout.
    [
      "depth 0.00001, wave, low beam",
      { dep: "0.00001", lsB: "wave", lsA: "low" },
      "Enter a fish distance from 0 to 0.00 m (5 × the depth). [shown] | 0 0 340 223 | 3a14cc23:138684 | bc6aafe6:10811 | 3d83c726:185",
    ],
    [
      "depth 0.00015, wave, low beam",
      { dep: "0.00015", lsB: "wave", lsA: "low" },
      "Enter a fish distance from 0 to 0.00 m (5 × the depth). [shown] | 0 0 340 223 | 58c82c78:138712 | bc6aafe6:10811 | 3d83c726:185",
    ],
    [
      "depth 0.001, wave, low beam, fish 0.005 m out and 9.4 m up",
      { dep: "0.001", lsB: "wave", lsA: "low", lsfx: "0.005", lsfh: "9.4" },
      "That puts the fish above the surface; lower the height. [shown] | 0 0 340 223 | c6e1ca27:138712 | 729a6a93:10811 | 3d83c726:185",
    ],
    // A depth at which the scale of the picture, (W - 2 * pad) / Xw, and its reciprocal form differ in the last
    // digit and a coordinate of the picture lands on the other side of a rounding to one decimal.
    [
      "depth 18.6, flat, low beam, fish 9.3 m out and 3.7 m up",
      { dep: "18.6", lsB: "flat", lsA: "low", lsfx: "9.3", lsfh: "3.7" },
      " [hidden] | 0 0 340 200 | 58f9d3d2:138631 | f9501c43:18348 | 7a95eaa5:493",
    ],
    // A depth at which the half-length of the fish times the scale, fish.a * sc, differs from its reciprocal form in
    // a coordinate of the fish ellipse.
    [
      "depth 6.4, wave, low beam, fish 7.7 m out and 1.9 m up",
      { dep: "6.4", lsB: "wave", lsA: "low", lsfx: "7.7", lsfh: "1.9" },
      " [hidden] | 0 0 340 223 | c6f54419:138986 | a56b224a:11073 | d5bc2774:490",
    ],
    [
      "fish touching the transducer, steep beam",
      { dep: "11", lsB: "flat", lsA: "steep", lsfx: "0", lsfh: "10.4192" },
      " [hidden] | 0 0 340 200 | f97ddbe2:139027 | 3f52716a:1462 | 30317aa8:284",
    ],
    [
      "fish just under the surface, 0.5 m out, height 9.4",
      { lsB: "flat", lsA: "low", lsfx: "0.5", lsfh: "9.4" },
      " [hidden] | 0 0 340 201 | 66954251:136556 | 6b68a597:962 | bbac180a:433",
    ],
    [
      "steep beam, fish at 7 m, rock",
      { lsB: "rock", lsA: "steep", lsfx: "7", lsfh: "1" },
      " [hidden] | 0 0 340 201 | 81c64eab:139029 | ecab586f:1462 | d21b695b:284",
    ],
    [
      "steep beam, fish 5.8 m out, 1 m up",
      { lsB: "flat", lsA: "steep", lsfx: "5.8", lsfh: "1" },
      " [hidden] | 0 0 340 201 | 7f84ec0a:139279 | 7576e245:1650 | 1b15aca9:490",
    ],
    [
      "rock, low, fish on the step of the rock, 22.2 out",
      { lsB: "rock", lsA: "low", lsfx: "22.2", lsfh: "0" },
      " [hidden] | 0 0 340 201 | eed2752a:138796 | 6790c14b:15246 | dad2945d:493",
    ],
    [
      "rock, low, fish 22.6 out",
      { lsB: "rock", lsA: "low", lsfx: "22.6", lsfh: "0" },
      " [hidden] | 0 0 340 201 | a96e83db:138796 | 0fa754a3:15390 | 313a98d9:493",
    ],
    [
      "drop, low, fish on the step, 22.6 out",
      { lsB: "drop", lsA: "low", lsfx: "22.6", lsfh: "0" },
      " [hidden] | 0 0 340 314 | d766af84:138881 | 2ed45958:10347 | 65a54ec3:262",
    ],
    [
      "up, low, fish on the slope, 21.5 out",
      { lsB: "up", lsA: "low", lsfx: "21.5", lsfh: "6" },
      " [hidden] | 0 0 340 201 | fd40daa3:138771 | 69cf5dd0:14337 | e2c06ce5:494",
    ],
    [
      "wave, low, fish at the end of the range, 49.99 out",
      { lsB: "wave", lsA: "low", lsfx: "49.99", lsfh: "0" },
      " [hidden] | 0 0 340 223 | dae7f76c:138817 | d9d33a45:10811 | e78c4d56:353",
    ],
    [
      "wave, low, fish 49.5 out, 3 up",
      { lsB: "wave", lsA: "low", lsfx: "49.5", lsfh: "3" },
      " [hidden] | 0 0 340 223 | 85d05f40:139039 | 0bd5a780:10995 | 376e23c5:418",
    ],
    [
      "rock, low, fish 20 out, 0.5 up",
      { lsB: "rock", lsA: "low", lsfx: "20", lsfh: "0.5" },
      " [hidden] | 0 0 340 201 | c4cc0886:138728 | 5df6e6a0:16238 | edb24c43:474",
    ],
    [
      "up, low, fish 45 out, 0.5 up",
      { lsB: "up", lsA: "low", lsfx: "45", lsfh: "0.5" },
      " [hidden] | 0 0 340 201 | bb90450d:138554 | 1b4cc30e:18219 | 62276242:495",
    ],
    // Review round 2: the order of the arithmetic of the printed coordinates. A search over typed depths (two
    // decimals, 0.01 to 200) on every bottom and both beams, and typed fish distances and heights, wrote the
    // expression of every coordinate in every order of its operations (scale `(W - 2 * pad) / Xw` and `sc * 2.5`
    // written into the product, factors in each order, `a / b` as `a * (1 / b)` and the like, the sum
    // `top + z * sz + 22` in each grouping) and kept each typed view in which some order prints a different digit
    // or a different height; these rows are the fewest views that tell apart every such order. Each expected
    // value was printed by the legacy lines, and, for the first two (the review's own), also by the legacy lines
    // with the order changed: `cy` as `top + fish.z * sc * DEPTH_STRETCH` prints 5a420046 for the first and
    // `cx` as `pad + (fish.x * (W - 2 * pad)) / Xw` prints 88e30a1c for the second.
    [
      "depth 5.76, up, low beam, fish 24.5 m out and 0 m up",
      { dep: "5.76", lsB: "up", lsA: "low", lsfx: "24.5", lsfh: "0" },
      " [hidden] | 0 0 340 201 | ecd40f35:138698 | 360442ff:15890 | 98eebb1e:495",
    ],
    [
      "depth 8.64, flat, low beam, fish 4.3 m out and 1 m up",
      { dep: "8.64", lsB: "flat", lsA: "low", lsfx: "4.3", lsfh: "1" },
      " [hidden] | 0 0 340 200 | b2ad33ef:138610 | 9f1ee6e6:18489 | 692711b5:490",
    ],
    [
      "depth 0.64, flat, low beam, fish 0 m out and 0 m up",
      { dep: "0.64", lsB: "flat", lsA: "low", lsfx: "0", lsfh: "0" },
      " [hidden] | 0 0 340 200 | cd20a7a1:138467 | 5310dc4e:18788 | c5feed78:496",
    ],
    [
      "depth 0.72, flat, low beam, fish 0.4 m out and 0.09 m up",
      { dep: "0.72", lsB: "flat", lsA: "low", lsfx: "0.4", lsfh: "0.09" },
      " [hidden] | 0 0 340 201 | cddf9a42:137875 | 9a3261f2:15811 | 93468815:492",
    ],
    [
      "depth 1.92, flat, low beam, fish 0 m out and 0 m up",
      { dep: "1.92", lsB: "flat", lsA: "low", lsfx: "0", lsfh: "0" },
      " [hidden] | 0 0 340 200 | ed497a93:138368 | 06852fd7:17943 | fa9219df:283",
    ],
    [
      "depth 1.36, flat, low beam, fish 0.7 m out and 0.13 m up",
      { dep: "1.36", lsB: "flat", lsA: "low", lsfx: "0.7", lsfh: "0.13" },
      " [hidden] | 0 0 340 200 | e03daffa:138731 | 0a439b4c:18363 | 4f49db56:491",
    ],
    [
      "depth 1.04, flat, low beam, fish 0.5 m out and 0.37 m up",
      { dep: "1.04", lsB: "flat", lsA: "low", lsfx: "0.5", lsfh: "0.37" },
      " [hidden] | 0 0 340 200 | c8782407:137861 | cad687bc:14878 | 0e1120d2:491",
    ],
    [
      "depth 1.28, flat, low beam, fish 0 m out and 0 m up",
      { dep: "1.28", lsB: "flat", lsA: "low", lsfx: "0", lsfh: "0" },
      " [hidden] | 0 0 340 200 | 072f22c1:138368 | 31c568e2:17943 | 21f6e6fa:284",
    ],
    [
      "depth 1.6, drop, steep beam, fish 7.9 m out and 1.4 m up",
      { dep: "1.6", lsB: "drop", lsA: "steep", lsfx: "7.9", lsfh: "1.4" },
      " [hidden] | 0 0 340 314 | 33a47edf:139030 | 513adf02:1461 | 65677a39:354",
    ],
    [
      "depth 0.13, up, low beam, fish 12 m out and 3 m up",
      { dep: "0.13", lsB: "up", lsA: "low", lsfx: "12", lsfh: "3" },
      "Enter a fish distance from 0 to 0.65 m (5 × the depth). [shown] | 0 0 340 200 | 45bf6b51:138230 | 84513b7f:17872 | 3ceaeb53:187",
    ],
    [
      "depth 0.24, down, low beam, fish 1.1 m out and 0.01 m up",
      { dep: "0.24", lsB: "down", lsA: "low", lsfx: "1.1", lsfh: "0.01" },
      " [hidden] | 0 0 340 298 | 2d54ae7a:138771 | ecacfb06:15512 | 13b10146:493",
    ],
    [
      "depth 0.48, down, low beam, fish 2.3 m out and 0.1 m up",
      { dep: "0.48", lsB: "down", lsA: "low", lsfx: "2.3", lsfh: "0.1" },
      " [hidden] | 0 0 340 298 | 9a33d8f4:138667 | ce3ee890:18218 | 4bbbf22e:419",
    ],
    [
      "depth 3.52, rock, steep beam, fish 16 m out and 2 m up",
      { dep: "3.52", lsB: "rock", lsA: "steep", lsfx: "16", lsfh: "2" },
      " [hidden] | 0 0 340 200 | 3ecdf3b2:139028 | 429ea0ea:1534 | 93f701a1:354",
    ],
    [
      "depth 0.32, drop, low beam, fish 1.5 m out and 0.2 m up",
      { dep: "0.32", lsB: "drop", lsA: "low", lsfx: "1.5", lsfh: "0.2" },
      " [hidden] | 0 0 340 314 | d4d1bb41:139038 | d3068a95:13152 | 25f8bb7a:396",
    ],
    [
      "depth 43.2, wave, low beam, fish 14.5 m out and 1.8 m up",
      { dep: "43.2", lsB: "wave", lsA: "low", lsfx: "14.5", lsfh: "1.8" },
      " [hidden] | 0 0 340 223 | 4437fb62:138817 | 09fbd7e7:10812 | e38630aa:288",
    ],
    [
      "depth 0.88, drop, low beam, fish 4.2 m out and 0.11 m up",
      { dep: "0.88", lsB: "drop", lsA: "low", lsfx: "4.2", lsfh: "0.11" },
      " [hidden] | 0 0 340 314 | b35b5a3f:139106 | 30fadaf1:10584 | 33096032:395",
    ],
    // The surface limit of the fish, `fishZ > fl * 0.2`, with `fl = 0.12 * H` written `(H * 12) / 100` and the like (the
    // review's depth 186.25 and height 176.863): the heights at which the limit is hit to the last bit have three
    // decimals; no height of one or two decimals does, for any depth of two decimals.
    [
      "depth 186.25, flat, low beam, fish 0 m out and 176.863 m up",
      { dep: "186.25", lsB: "flat", lsA: "low", lsfx: "0", lsfh: "176.863" },
      " [hidden] | 0 0 340 200 | b4ef85bf:138369 | 1e7eca42:17945 | ba65f500:287",
    ],
    [
      "depth 133.75, flat, low beam, fish 0 m out and 127.009 m up",
      { dep: "133.75", lsB: "flat", lsA: "low", lsfx: "0", lsfh: "127.009" },
      "That puts the fish above the surface; lower the height. [shown] | 0 0 340 200 | 54237877:138267 | 94097c78:17945 | b0cce987:188",
    ],
    // Depths so large that the earlier page's arithmetic overflows (legacy defect 3).
    [
      'depth "1e154"',
      { dep: "1e154" },
      " [hidden] | 0 0 340 200 | cccb6b1e:138800 | 528bcb20:15902 | 91de3611:874",
    ],
    [
      'depth "1e155"',
      { dep: "1e155" },
      " [hidden] | 0 0 340 NaN | c723109b:139371 | d251e2dd:16465 | eb6a6ab1:1206",
    ],
    [
      'depth "1e300"',
      { dep: "1e300" },
      " [hidden] | 0 0 340 NaN | 8f124378:139159 | f4c6d8b9:499 | 192d1caf:1458",
    ],
    [
      'depth "1e308"',
      { dep: "1e308" },
      "That puts the fish above the surface; lower the height. [shown] | 0 0 340 38 | 66649eb5:125670 | 76141c24:197 | c517292d:125",
    ],
  ];

  it.each(bulk)("%s", (_label, over, expected) => {
    expect(gist(viewOf(over))).toBe(expected);
  });
});

describe("what the view leaves alone", () => {
  it("writes the five elements of KEYS when the depth passes, whatever the fish, and only the message when it fails", () => {
    for (const over of [{}, { lsfx: "abc" }, { lsfh: "-1" }, { lsB: "drop", lsA: "steep" }]) {
      expect(Object.keys(viewOf(over)).sort()).toEqual([...KEYS].sort());
    }
    for (const over of [{ dep: "0" }, { dep: "-3" }, { dep: "" }, { dep: "x" }]) {
      expect(Object.keys(viewOf(over))).toEqual(["ls-err"]);
    }
  });

  // The shell gives a field as `num` reads it (a number or NaN). The view is not told anything else, but a
  // field that is not a finite number is no number to it, as in the earlier page's `num` (line 11): the
  // view is the one of a field that holds NaN, whose messages and pictures the rows above pin.
  const noDistance = "Enter a fish distance from 0 to 50.0 m (5 × the depth).";
  const noHeight = "Enter a height of 0 m or more.";
  it.each([
    ["a distance given as a text", { lsfx: "12", lsfh: 3 }, { lsfx: "abc" }, noDistance],
    ["a distance that is not given", { lsfh: 3 }, { lsfx: "abc" }, noDistance],
    [
      "an infinite distance",
      { lsfx: Number.POSITIVE_INFINITY, lsfh: 3 },
      { lsfx: "abc" },
      noDistance,
    ],
    ["a height given as a text", { lsfx: 12, lsfh: "3" }, { lsfh: "abc" }, noHeight],
    ["a height that is not given", { lsfx: 12 }, { lsfh: "abc" }, noHeight],
    ["an infinite height", { lsfx: 12, lsfh: Number.POSITIVE_INFINITY }, { lsfh: "abc" }, noHeight],
    [
      "a negative infinite height",
      { lsfx: 12, lsfh: Number.NEGATIVE_INFINITY },
      { lsfh: "abc" },
      noHeight,
    ],
  ])("takes %s for no number", (_label, local, nan, message) => {
    const input = inputOf(fieldsOf({ dep: "10" }), { lsB: "rock", lsA: "low" }, "en-US", LIGHT_S4);
    const view = lightShadowView({ ...input, local });
    expect(view["ls-err"]).toEqual({ text: message, hidden: false });
    expect(view).toEqual(viewOf(nan));
  });

  it("takes finite numbers as they are", () => {
    const input = inputOf(fieldsOf({ dep: "10" }), { lsB: "rock", lsA: "low" }, "en-US", LIGHT_S4);
    const view = lightShadowView({ ...input, local: { lsfx: 12, lsfh: 3 } });
    expect(view).toEqual(viewOf());
    expect(view["ls-err"]).toEqual({ text: "", hidden: true });
  });

  it("does not write whether the section is open, or which bottom and angle button is pressed (the shell)", () => {
    const view = viewOf();
    expect(Object.keys(view).some((key) => key.startsWith("l") && key.includes(">"))).toBe(false);
    expect(view["ls-svg"]?.hidden).toBeUndefined();
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

/** The section of the page Light and shadow is recorded in. */
const SECTION_FILE = "ls";

/** A long html as the recorder holds it in a scenario that is not a base: its digest and its length. */
interface Digest {
  fnv1a: string;
  length: number;
}

/** How the earlier page left one element. */
interface RecordedPatch {
  text?: string;
  html?: string | Digest;
  hidden?: boolean;
  attrs?: Record<string, string | null>;
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

/**
 * The section file of a scenario and scheme (`<scenario>/<scheme>`), or the
 * file the index says it equals; none when the page wrote nothing in the
 * section in that scenario.
 */
function sectionFile(at: string): RecordedFile | undefined {
  let path = `${at}/${SECTION_FILE}.json`;
  for (let equal = index.omitted[path]; equal !== undefined; equal = index.omitted[path])
    path = equal;
  return existsSync(`${RECORDED}/${path}`) ? read<RecordedFile>(path) : undefined;
}

/** The patch of one element. */
function recorded(at: string, key: string): RecordedPatch | undefined {
  let value = sectionFile(at)?.patches[key];
  for (let hops = 0; value !== undefined && "same" in value; hops += 1) {
    if (hops > 2) throw new Error(`${at}, ${key}: more than two "same" in a row`);
    value = sectionFile(value.same)?.patches[key];
  }
  return value;
}

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
 * chart is compared with the recorded one, name and value. An html the
 * recorder holds as its digest is held so here too.
 */
function asRecorded(patch: ElementPatch, digested: boolean): RecordedPatch {
  const out: RecordedPatch = {};
  if (patch.text !== undefined) {
    out.text = patch.text;
    out.html = escaped(patch.text);
  }
  if (patch.html !== undefined) {
    const html = asRead(patch.html);
    out.html = digested ? { fnv1a: fnv1a(html), length: html.length } : html;
    out.text = html.replace(/<[^>]*>/g, "");
  }
  if (patch.hidden !== undefined) out.hidden = patch.hidden;
  if (patch.attrs !== undefined) out.attrs = { ...patch.attrs };
  return out;
}

const SCENARIOS = index.scenarios.map((scenario) => scenario.name);
const PAIRS = SCENARIOS.flatMap((name) =>
  index.schemes.map((scheme): [string, string] => [name, scheme]),
);

/** Whether the earlier page rendered the section: it is open (line 1812), whatever is ticked. */
const isRendered = (s: RecordedScenario): boolean => s.ui.open.ls === true;

/** Whether the depth passes its check in Settings (line 253). */
const hasDepth = (s: RecordedScenario): boolean => num(String(s.fields.dep)) > 0;

describe("against the recorded page", () => {
  it("reads every scenario, in light and dark, two of them in sv-SE", () => {
    expect(SCENARIOS).toHaveLength(168);
    expect(index.schemes).toEqual(["light", "dark"]);
    expect(
      index.scenarios.filter((scenario) => scenario.locale !== "en-US").map((s) => s.locale),
    ).toEqual(["sv-SE", "sv-SE"]);
  });

  it("has recordings with the section rendered and without, with the depth failing and passing", () => {
    const rendered = PAIRS.filter(([name]) => isRendered(scenarioOf(name)));
    const drawn = rendered.filter(([name]) => hasDepth(scenarioOf(name)));
    expect([PAIRS.length, rendered.length, drawn.length]).toEqual([336, 226, 218]);
  });

  it("has recordings of every message of the section, of every bottom and of both beams", () => {
    const seen = new Set<string>();
    const shapes = new Set<string>();
    for (const [name, scheme] of PAIRS) {
      const text = recorded(`${name}/${scheme}`, "ls-err")?.text;
      if (text !== undefined) seen.add(text.replace(/\d.*$/, "…"));
      const s = scenarioOf(name);
      if (isRendered(s)) shapes.add(`${s.ui.lsB} ${s.ui.lsA}`);
    }
    expect([...seen].sort()).toEqual([
      "",
      "Enter a fish distance from …",
      "Enter a height of …",
      "Fix the depth in Settings.",
      "That puts the fish above the surface; lower the height.",
    ]);
    expect([...shapes].sort()).toEqual([
      "down low",
      "down steep",
      "drop low",
      "drop steep",
      "flat low",
      "flat steep",
      "rock low",
      "rock steep",
      "up low",
      "up steep",
      "wave low",
      "wave steep",
    ]);
  });

  describe.each(PAIRS)("%s, %s", (name, scheme) => {
    const at = `${name}/${scheme}`;
    const scenario = scenarioOf(name);
    const was: Record<string, RecordedPatch> = {};
    for (const key of KEYS) {
      const patch = recorded(at, key);
      if (patch !== undefined) was[key] = patch;
    }

    if (!isRendered(scenario)) {
      it("did not render the section: no element of KEYS was written", () => {
        expect(scenario.name).toBe(name);
        expect(Object.keys(was)).toEqual([]);
      });
      return;
    }

    it("leaves the elements of KEYS as the earlier page left them, and writes no other", () => {
      expect(scenario.name).toBe(name);
      const view = viewOfInput(
        inputOf(
          scenario.fields,
          { lsB: scenario.ui.lsB, lsA: scenario.ui.lsA },
          scenario.locale,
          scenario.theme["--s4"],
        ),
        scenario.locale,
      );
      const left: Record<string, RecordedPatch> = {};
      for (const [key, patch] of Object.entries(view)) {
        left[key] = asRecorded(patch, typeof was[key]?.html === "object");
      }
      expect(Object.keys(left).sort()).toEqual(Object.keys(was).sort());
      expect(left).toEqual(was);
      expect(Object.keys(view).filter((key) => !(KEYS as readonly string[]).includes(key))).toEqual(
        [],
      );
    });
  });
});
