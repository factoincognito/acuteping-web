/**
 * The compared views against the earlier page (legacy/src/p2.js, lines 973 to
 * 1356), in two ways. The expected values of the first part were printed by
 * those lines themselves, run unchanged in Node against a stand-in for the
 * page's elements, its style and the canvas, in en-US and in sv-SE. The second
 * part compares what the views write and what the painter draws with what the
 * earlier page wrote and drew when it was recorded in a browser
 * (`fixtures/legacy/`), in every scenario of the set.
 *
 * The recording browser (Chromium 153) rounds `Math.sin`, `Math.cos`,
 * `Math.tan`, `Math.atan`, `Math.asin` and `Math.acos` correctly, which Node 22
 * does not always do: of the 3,702 calls of the first four that the earlier
 * lines make in the recorded scenarios, 94 give another last bit in Node 22.
 * The numbers the views write are not rounded (the lines of a footprint, the
 * coordinates of a polygon), so a test of them depends on that bit. Every test
 * of this file therefore runs with those six functions replaced by correctly
 * rounded ones (`browserMath`), as the expected values were printed; the
 * module itself uses `Math` as the engine has it.
 */

import {
  type AtGeometry,
  atFootTxt,
  atGeo,
  beamList,
  beamRays,
  behindView,
  bRange,
  buildScene,
  cmpList,
  compareView,
  fanTriangles,
  footprintView,
  KEYS,
  paintScene,
  rtag,
  sideView,
} from "./beams";
import { createFormatter } from "./format";
import { equipment, parseSettings } from "./settings";
import { combined, livePreset, namesOf, THICKNESS } from "./transducers";
import type {
  Ctx2D,
  RawFields,
  SavedValue,
  Scene3d,
  Scene3dState,
  SectionView,
  Surface,
} from "./types";

// ---------------------------------------------------------------------------
// The browser's rounding of the functions of Math that the earlier lines use
// ---------------------------------------------------------------------------

/** Bits after the point of the fixed-point numbers the rounding is worked in. */
const FIXED_BITS = 320n;
const ONE = 1n << FIXED_BITS;

/** arctan(1/n) in fixed point, for a whole number n. */
function atanInverse(n: bigint): bigint {
  const n2 = n * n;
  let term = ONE / n;
  let sum = term;
  for (let k = 1n; term !== 0n; k++) {
    term /= n2;
    const part = term / (2n * k + 1n);
    sum += k % 2n === 1n ? -part : part;
  }
  return sum;
}

/** Pi in fixed point, by Machin's formula. */
const PI_FIXED = 4n * (4n * atanInverse(5n) - atanInverse(239n));
const HALF_PI_FIXED = PI_FIXED >> 1n;

/** A finite number as a fixed-point whole number, exactly. */
function toFixed(x: number): bigint {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, x);
  const bits = view.getBigUint64(0);
  const sign = bits >> 63n ? -1n : 1n;
  const exponent = Number((bits >> 52n) & 0x7ffn);
  let mantissa = bits & ((1n << 52n) - 1n);
  let power = -1074;
  if (exponent !== 0) {
    mantissa |= 1n << 52n;
    power = exponent - 1075;
  }
  const shift = BigInt(power) + FIXED_BITS;
  return sign * (shift >= 0n ? mantissa << shift : mantissa >> -shift);
}

/** A fixed-point number as the nearest number. */
const fromFixed = (v: bigint): number => Number(v) / 2 ** Number(FIXED_BITS);

/** Sine and cosine of a fixed-point number between -pi/4 and pi/4. */
function sinCosSmall(r: bigint): [bigint, bigint] {
  const r2 = (r * r) >> FIXED_BITS;
  let s = 0n;
  let term = r;
  for (let m = 0n; term !== 0n; m++) {
    s += m % 2n === 0n ? term : -term;
    term = (term * r2) >> FIXED_BITS;
    term /= (2n * m + 2n) * (2n * m + 3n);
  }
  let c = 0n;
  term = ONE;
  for (let m = 0n; term !== 0n; m++) {
    c += m % 2n === 0n ? term : -term;
    term = (term * r2) >> FIXED_BITS;
    term /= (2n * m + 1n) * (2n * m + 2n);
  }
  return [s, c];
}

/** The quarter turns nearest to a fixed-point number, and what is left of it. */
function quarters(fx: bigint): [bigint, bigint] {
  const half = HALF_PI_FIXED >> 1n;
  const q = fx < 0n ? -((-fx + half) / HALF_PI_FIXED) : (fx + half) / HALF_PI_FIXED;
  return [q, fx - q * HALF_PI_FIXED];
}

/** Sine and cosine of a number, correctly rounded. */
function crSinCos(x: number): [number, number] {
  const [q, r] = quarters(toFixed(x));
  const [s, c] = sinCosSmall(r);
  const turn = ((q % 4n) + 4n) % 4n;
  const pick: [bigint, bigint] =
    turn === 0n ? [s, c] : turn === 1n ? [c, -s] : turn === 2n ? [-s, -c] : [-c, s];
  return [fromFixed(pick[0]), fromFixed(pick[1])];
}

/** Integer square root. */
function isqrt(n: bigint): bigint {
  if (n < 2n) return n;
  let x = 1n << BigInt((n.toString(2).length + 1) >> 1);
  for (;;) {
    const y = (x + n / x) >> 1n;
    if (y >= x) return x;
    x = y;
  }
}

/** Arctangent of a fixed-point number. */
function atanFixed(v: bigint): bigint {
  if (v < 0n) return -atanFixed(-v);
  if (v > ONE) return HALF_PI_FIXED - atanFixed((ONE << FIXED_BITS) / v);
  let halvings = 0n;
  let x = v;
  while (x > ONE >> 6n) {
    x = (x << FIXED_BITS) / (ONE + isqrt(ONE * ONE + x * x));
    halvings++;
  }
  const x2 = (x * x) >> FIXED_BITS;
  let sum = 0n;
  let term = x;
  for (let k = 0n; term !== 0n; k++) {
    const part = term / (2n * k + 1n);
    sum += k % 2n === 0n ? part : -part;
    term = (term * x2) >> FIXED_BITS;
  }
  return sum << halvings;
}

/** Arcsine of a fixed-point number from -1 to 1. */
function asinFixed(fx: bigint): bigint {
  if (fx === ONE) return HALF_PI_FIXED;
  if (fx === -ONE) return -HALF_PI_FIXED;
  return atanFixed((fx << FIXED_BITS) / isqrt(ONE * ONE - fx * fx));
}

const crSin = (x: number): number => crSinCos(x)[0];
const crCos = (x: number): number => crSinCos(x)[1];

function crTan(x: number): number {
  const [q, r] = quarters(toFixed(x));
  const [s, c] = sinCosSmall(r);
  const [top, bottom] = q % 2n === 0n ? [s, c] : [-c, s];
  return fromFixed((top << FIXED_BITS) / bottom);
}

const crAtan = (x: number): number => fromFixed(atanFixed(toFixed(x)));
const crAsin = (x: number): number =>
  Math.abs(x) <= 1 ? fromFixed(asinFixed(toFixed(x))) : Number.NaN;
const crAcos = (x: number): number =>
  Math.abs(x) <= 1 ? fromFixed(HALF_PI_FIXED - asinFixed(toFixed(x))) : Number.NaN;

/** A function of one number that is worked out once for each number it is given; 0, NaN and the infinities are the engine's. */
function remembered(
  own: (x: number) => number,
  engine: (x: number) => number,
): (x: number) => number {
  const seen = new Map<number, number>();
  return (x) => {
    if (x === 0 || !Number.isFinite(x)) return engine(x);
    let v = seen.get(x);
    if (v === undefined) {
      v = own(x);
      seen.set(x, v);
    }
    return v;
  };
}

const ENGINE = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  atan: Math.atan,
  asin: Math.asin,
  acos: Math.acos,
};

beforeAll(() => {
  Math.sin = remembered(crSin, ENGINE.sin);
  Math.cos = remembered(crCos, ENGINE.cos);
  Math.tan = remembered(crTan, ENGINE.tan);
  Math.atan = remembered(crAtan, ENGINE.atan);
  Math.asin = remembered(crAsin, ENGINE.asin);
  Math.acos = remembered(crAcos, ENGINE.acos);
});

afterAll(() => {
  Object.assign(Math, ENGINE);
});

describe("the browser's rounding that the tests run with", () => {
  it("gives the numbers Chromium 153 gave where Node 22 gives another last bit", () => {
    // Each row was asked of Chromium 153 and of Node 22: the browser's number, then Node's.
    const cases: [string, number, number, number][] = [
      ["sin", 2.0943951023931957, 0.8660254037844385, 0.8660254037844386],
      ["sin", -2.1598449493429825, -0.8314696123025455, -0.8314696123025453],
      ["cos", -0.9890199094634535, 0.5495089780708059, 0.549508978070806],
      ["cos", 0.7417649320975901, 0.737277336810124, 0.7372773368101241],
      ["atan", 3.666060555964672, 1.3045023096767137, 1.3045023096767139],
    ];
    for (const [fn, x, browser] of cases) {
      const f = Math[fn as "sin" | "cos" | "atan"];
      expect(f(x)).toBe(browser);
    }
  });

  it("keeps the sign of zero and passes on what is not finite", () => {
    expect(Object.is(Math.sin(-0), -0)).toBe(true);
    expect(Math.cos(0)).toBe(1);
    expect(Math.tan(Number.NaN)).toBeNaN();
    expect(Math.asin(2)).toBeNaN();
    expect(Math.acos(-2)).toBeNaN();
    expect(Math.atan(Number.POSITIVE_INFINITY)).toBe(Math.PI / 2);
  });
});

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

/** The custom properties of the page's root in the light scheme, as the recorder resolved them. */
const LIGHT: Readonly<Record<string, string>> = {
  "--accent": "#9a5a00",
  "--accent-soft": "#f5e7d0",
  "--bad": "#a8261d",
  "--bg": "#eef2f1",
  "--c": "",
  "--c2d": "#2a78d6",
  "--cds": "#eb6834",
  "--fg": "#14201e",
  "--font-body": "'Barlow', system-ui, -apple-system, 'Segoe UI', sans-serif",
  "--font-data": "'JetBrains Mono', ui-monospace, 'SFMono-Regular', Menlo, monospace",
  "--font-display": "'Barlow Semi Condensed', 'Arial Narrow', 'Helvetica Neue', sans-serif",
  "--ground": "#d9d2c3",
  "--line": "#c8d2cf",
  "--muted": "#56645f",
  "--s1": "#2a78d6",
  "--s2": "#eb6834",
  "--s3": "#1baf7a",
  "--s4": "#c98500",
  "--s5": "#d55181",
  "--s6": "#4a3aa7",
  "--s7": "#e34948",
  "--s8": "#008300",
  "--surface": "#ffffff",
  "--water": "#2f6f86",
};

/** The 3D view as the page starts with it. */
const START_3D = { yaw: -0.6, pitch: 0.45, zoom: 1, zx: 1 };

/** The ids of the beams the page can list, in the order it lists them. */
const BEAM_IDS = [
  "side0",
  "side1",
  "side2",
  "cone0",
  "cone1",
  "down0",
  "down1",
  "down2",
  "live",
  "livel",
  "livef",
  "lives",
  "livew",
] as const;

/** Which beams are ticked when a first visitor opens the section: all but the second and third side fan. */
const TICKED_AT_START: Readonly<Record<string, boolean>> = Object.fromEntries(
  BEAM_IDS.map((id) => [id, !/^side[12]/.test(id)]),
);

const ALL: Readonly<Record<string, boolean>> = Object.fromEntries(BEAM_IDS.map((id) => [id, true]));
const NONE: Readonly<Record<string, boolean>> = Object.fromEntries(
  BEAM_IDS.map((id) => [id, false]),
);
const only = (...ids: string[]): Record<string, boolean> => ({
  ...NONE,
  ...Object.fromEntries(ids.map((id) => [id, true])),
});

/**
 * The fields of the page as it starts, for the given transducers, with some
 * changed: each angle field holds its preset's angle (legacy lines 209 to 220).
 */
function fieldsOf(over: RawFields, first: string, second: string, live: string): RawFields {
  const p = combined(first, second);
  const l = livePreset(live);
  const fields: Record<string, SavedValue> = {
    "img-p": first,
    "img-s": second,
    "live-p": live,
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
  };
  for (const [i, c] of p.cone.entries()) fields[`cone${i}`] = String(c.a);
  for (const [i, c] of p.down.entries()) fields[`down${i}`] = String(c.a);
  for (const [i, c] of p.side.entries()) fields[`side${i}`] = String(c.a);
  return { ...fields, ...over };
}

/** What a case of the first part sets: the transducers, the fields that differ, the beams ticked and the locale. */
interface Case {
  readonly name: string;
  readonly first?: string;
  readonly second?: string;
  readonly live?: string;
  readonly over?: RawFields;
  readonly behind?: Readonly<Record<string, boolean>>;
  readonly locale?: string;
}

const CASES: readonly Case[] = [
  { name: "start" },
  { name: "all beams ticked", behind: ALL },
  { name: "none ticked", behind: NONE },
  { name: "sv-SE", locale: "sv-SE", behind: ALL },
  { name: "deep water, 60 m", over: { dep: "60" }, behind: ALL },
  { name: "shallow water, 0.4 m", over: { dep: "0.4" }, behind: ALL },
  { name: "side range under the depth", over: { ssr: "5" }, behind: ALL },
  {
    name: "side range 100, over the 91 m of the first frequency",
    over: { ssr: "100" },
    behind: ALL,
  },
  { name: "live range under the depth", over: { atr: "8" }, behind: ALL },
  { name: "live range equal to the depth", over: { atr: "10" }, behind: ALL },
  {
    name: "live range the next number over the depth",
    over: { atr: "10.000000000000002" },
    behind: ALL,
  },
  { name: "live fan 180 degrees", over: { atw: "180" }, behind: ALL },
  { name: "live fan just under 180 degrees", over: { atw: "179.999999999" }, behind: ALL },
  {
    name: "live fan 179.99999994, just short of a ring",
    over: { atw: "179.99999994" },
    behind: ALL,
  },
  { name: "live fan 179.99999995, just a ring", over: { atw: "179.99999995" }, behind: ALL },
  { name: "live fan 20 degrees, slice 5", over: { atw: "20", att: "5" }, behind: ALL },
  { name: "live mounts at the edges", over: { atsb: "0", atfa: "90" }, behind: ALL },
  { name: "live mounts steep", over: { atsb: "89.5", atfa: "0" }, behind: ALL },
  { name: "live slice 89.9 degrees", over: { att: "89.9" }, behind: ALL },
  { name: "side fans aimed at the center line", over: { ssalign: "center" }, behind: ALL },
  { name: "side upper edge 0", over: { sso: "0" }, behind: ALL },
  { name: "only the side fans", behind: only("side0", "side1") },
  {
    name: "Humminbird pair, MEGA Live 2",
    first: "hb_xm9hw",
    second: "hb_xm14hw",
    live: "ml2",
    behind: ALL,
  },
  {
    name: "Humminbird single, one live transducer",
    first: "hb_xm920",
    live: "ml2",
    over: { "at-n": "1" },
    behind: ALL,
  },
  { name: "other preset", first: "other", live: "other", behind: ALL },
  {
    name: "Lowrance nose cone, two live transducers",
    first: "lowrance_nose",
    live: "at2xl",
    behind: ALL,
  },
  { name: "sonars not equipped", over: { "eq-ss": false, "eq-ds": false }, behind: ALL },
  {
    name: "only live sonar equipped",
    over: { "eq-ss": false, "eq-ds": false, "eq-2d": false },
    behind: ALL,
  },
  {
    name: "depth 305 m, the 2D cones' own limit",
    over: { dep: "305" },
    behind: only("cone0", "cone1"),
  },
  {
    name: "depth the next number over 305",
    over: { dep: "305.00000000000006" },
    behind: only("cone0", "cone1"),
  },
  {
    name: "depth the next number under 305",
    over: { dep: "304.99999999999994" },
    behind: only("cone0", "cone1"),
  },
  {
    name: "a depth under the cones' limit, 304",
    over: { dep: "304" },
    behind: only("cone0", "cone1"),
  },
  {
    name: "depth equal to a down fan's limit, 46",
    over: { dep: "46", ssr: "100" },
    behind: ALL,
  },
  { name: "invalid depth", over: { dep: "0" }, behind: ALL },
  { name: "invalid side angles", over: { side0: "200" }, behind: ALL },
  { name: "invalid cone angle", over: { cone0: "130" }, behind: ALL },
  { name: "invalid down angles", over: { down0: "160" }, behind: ALL },
  { name: "invalid live settings", over: { atw: "0" }, behind: ALL },
  { name: "invalid live range", over: { atr: "-1" }, behind: ALL },
  { name: "invalid mount", over: { atsb: "95" }, behind: ALL },
];

/** The cases a view draws: those the page does not stop at a message of Settings. */
const INVALID = new Set([
  "invalid depth",
  "invalid side angles",
  "invalid cone angle",
  "invalid down angles",
  "invalid live settings",
  "invalid live range",
  "invalid mount",
]);
const DRAWN = CASES.filter((c) => !INVALID.has(c.name));

const caseNamed = (name: string): Case => {
  const found = CASES.find((c) => c.name === name);
  if (found === undefined) throw new Error(`no case ${name}`);
  return found;
};

/** What the views get for a case. */
function inputOf(c: Case, colours: Readonly<Record<string, string>> = LIGHT) {
  const first = c.first ?? "lowrance";
  const second = c.second ?? "";
  const live = c.live ?? "at2";
  const fields = fieldsOf(c.over ?? {}, first, second, live);
  return inputFromFields(fields, { ...TICKED_AT_START, ...c.behind }, c.locale ?? "en-US", colours);
}

/** What the views get for the fields of a page and its ticked beams. */
function inputFromFields(
  fields: RawFields,
  behind: Readonly<Record<string, boolean>>,
  locale: string,
  colours: Readonly<Record<string, string>>,
) {
  const first = String(fields["img-p"]);
  const live = String(fields["live-p"]);
  const local: Record<string, number | string> = {};
  if (typeof fields.ssalign === "string") local.ssalign = fields.ssalign;
  return {
    settings: parseSettings(fields, combined(first, String(fields["img-s"]))),
    eq: equipment(fields, livePreset(live)),
    ui: { behind },
    names: namesOf(first, live),
    local,
    theme: { colours },
    scene3d: START_3D,
    fmt: createFormatter(locale),
  };
}

/** A result list as "term=value" for each row, when the html is nothing else. */
function rows(html: string): { list: string[]; count: number } | undefined {
  const found = [...html.matchAll(/<div><dt>([^<]*)<\/dt><dd>([^<]*)<\/dd><\/div>/g)];
  if (found.length === 0 || found.map(([row]) => row).join("") !== html) return undefined;
  return { list: found.map(([, term, value]) => `${term}=${value}`), count: found.length };
}

/** The texts a picture shows, in the order they stand in its html. */
const textsOf = (html: string): string[] =>
  [...html.matchAll(/>([^<]*)<\/text>/g)].map(([, text]) => String(text));

/** From this length an html is told as its digest and length. */
const LONG = 160;

/**
 * What was written to one element, as one line: `t:` its text, `r:` the rows
 * of a result list (all of them with `full`, else their number and the digest
 * of the html), `h:` any other html (a long one as its digest and length, and
 * with `full` after `x:` the texts it shows), whether it is hidden, and its
 * attributes.
 */
function told(p: SectionView[string], full: boolean): string {
  const parts: string[] = [];
  if (p.text !== undefined) parts.push(`t:${p.text}`);
  if (p.html !== undefined) {
    const list = rows(p.html);
    if (list) parts.push(full ? `r:${list.list.join("|")}` : `r:${list.count}:${fnv1a(p.html)}`);
    else if (p.html.length > LONG) {
      parts.push(
        `h:${fnv1a(p.html)}:${p.html.length}${full ? ` x:${textsOf(p.html).join("|")}` : ""}`,
      );
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

/** The cases whose result rows are told in full. */
const FULL_ROWS = new Set([
  "start",
  "all beams ticked",
  "sv-SE",
  "deep water, 60 m",
  "shallow water, 0.4 m",
  "side range 100, over the 91 m of the first frequency",
  "Humminbird pair, MEGA Live 2",
  "depth the next number under 305",
  "depth the next number over 305",
  "none ticked",
]);

/** What a view writes to some elements, as `told` tells it. */
const toldOf = (view: SectionView, keys: readonly string[], full: boolean): string[] =>
  keys.map((key) => {
    const patch = view[key];
    return patch ? told(patch, full) : NOT;
  });

// ---------------------------------------------------------------------------
// The first part: against the earlier lines run in Node
// ---------------------------------------------------------------------------

describe("the beams of the page (beamList, lines 975 to 986)", () => {
  /** A beam as the earlier lines made it, written out. */
  const asJson = (list: readonly object[]): string[] => list.map((b) => JSON.stringify(b));
  const listOf = (name: string) => {
    const input = inputOf(caseNamed(name));
    return asJson(beamList(input.settings, input.names));
  };

  it("lists a Lowrance transducer with ActiveTarget 2, the first side fan dotted", () => {
    expect(listOf("start")).toEqual([
      '{"id":"side0","eq":"ss","name":"SideScan 455 kHz CHIRP","maxr":91,"kf":1,"col":"var(--s1)","dash":"2 3"}',
      '{"id":"side1","eq":"ss","name":"SideScan 1075 kHz CHIRP","maxr":46,"kf":0.4235294117647059,"col":"var(--s1)","dash":"6 4"}',
      '{"id":"cone0","eq":"2d","name":"2D Medium CHIRP 83 kHz","maxr":305,"kind":"cone","ang":50,"col":"var(--s3)","dash":""}',
      '{"id":"cone1","eq":"2d","name":"2D High CHIRP 200 kHz","maxr":305,"kind":"cone","ang":20,"col":"var(--s2)","dash":""}',
      '{"id":"down0","eq":"ds","name":"DownScan 700 kHz CHIRP","maxr":46,"kind":"fan","ang":51,"th":3,"col":"var(--s4)","dash":"6 4"}',
      '{"id":"down1","eq":"ds","name":"DownScan 1200 kHz CHIRP","maxr":27,"kind":"fan","ang":30,"th":3,"col":"var(--s5)","dash":"6 4"}',
      '{"id":"live","eq":"at","name":"ActiveTarget 2 Down, fan across","kind":"at","ang":135,"th":18,"rot":false,"col":"var(--s7)","dash":"10 3 2 3"}',
      '{"id":"livel","eq":"at","name":"ActiveTarget 2 Down, fan along keel","kind":"at","ang":135,"th":18,"rot":true,"col":"var(--s8)","dash":"10 3 2 3"}',
      '{"id":"livef","eq":"at","name":"ActiveTarget 2 Forward","kind":"at","mode":"F","ang":135,"th":18,"col":"var(--s2)","dash":"10 3 2 3"}',
      '{"id":"lives","eq":"at","name":"Scout","kind":"at","mode":"S","ang":135,"th":18,"col":"var(--s5)","dash":"10 3 2 3"}',
      '{"id":"livew","eq":"atw","name":"Scout Wide (two units)","kind":"at","mode":"W","ang":135,"th":18,"col":"var(--s6)","dash":"10 3 2 3"}',
    ]);
  });

  it("lists two Humminbird transducers with three side fans and the third down fan dotted", () => {
    expect(listOf("Humminbird pair, MEGA Live 2")).toEqual([
      '{"id":"side0","eq":"ss","name":"Side Imaging 455 kHz","maxr":244,"kf":1,"col":"var(--s1)","dash":"2 3"}',
      '{"id":"side1","eq":"ss","name":"Side Imaging 800 kHz","maxr":76,"kf":1,"col":"var(--s1)","dash":"6 4"}',
      '{"id":"side2","eq":"ss","name":"Side Imaging MEGA Imaging+","maxr":122,"kf":1,"col":"var(--s1)","dash":"2 3"}',
      '{"id":"cone0","eq":"2d","name":"2D CHIRP Wide 140–200 kHz","kind":"cone","ang":42,"col":"var(--s3)","dash":""}',
      '{"id":"cone1","eq":"2d","name":"2D CHIRP Narrow 180–240 kHz","kind":"cone","ang":25,"col":"var(--s2)","dash":""}',
      '{"id":"down0","eq":"ds","name":"Down Imaging 455 kHz","maxr":122,"kind":"fan","ang":75,"th":3,"col":"var(--s4)","dash":"6 4"}',
      '{"id":"down1","eq":"ds","name":"Down Imaging 800 kHz","maxr":38,"kind":"fan","ang":45,"th":3,"col":"var(--s5)","dash":"6 4"}',
      '{"id":"down2","eq":"ds","name":"Down Imaging MEGA Imaging+","maxr":61,"kind":"fan","ang":75,"th":3,"col":"var(--s6)","dash":"2 3"}',
      '{"id":"live","eq":"at","name":"MEGA Live 2 Down, fan across","kind":"at","ang":120,"th":20,"rot":false,"col":"var(--s7)","dash":"10 3 2 3"}',
      '{"id":"livel","eq":"at","name":"MEGA Live 2 Down, fan along keel","kind":"at","ang":120,"th":20,"rot":true,"col":"var(--s8)","dash":"10 3 2 3"}',
      '{"id":"livef","eq":"at","name":"MEGA Live 2 Forward","kind":"at","mode":"F","ang":120,"th":20,"col":"var(--s2)","dash":"10 3 2 3"}',
      '{"id":"lives","eq":"at","name":"Landscape","kind":"at","mode":"S","ang":120,"th":20,"col":"var(--s5)","dash":"10 3 2 3"}',
      '{"id":"livew","eq":"atw","name":"Landscape Wide (two units)","kind":"at","mode":"W","ang":120,"th":20,"col":"var(--s6)","dash":"10 3 2 3"}',
    ]);
  });

  it("lists the other preset without a greatest range, and its second fan as a share of the first", () => {
    expect(listOf("other preset")).toEqual([
      '{"id":"side0","eq":"ss","name":"Side imaging Low","kf":1,"col":"var(--s1)","dash":"2 3"}',
      '{"id":"side1","eq":"ss","name":"Side imaging High","kf":0.6470588235294118,"col":"var(--s1)","dash":"6 4"}',
      '{"id":"cone0","eq":"2d","name":"2D Low","kind":"cone","ang":50,"col":"var(--s3)","dash":""}',
      '{"id":"cone1","eq":"2d","name":"2D High","kind":"cone","ang":20,"col":"var(--s2)","dash":""}',
      '{"id":"down0","eq":"ds","name":"Down imaging Low","kind":"fan","ang":75,"th":3,"col":"var(--s4)","dash":"6 4"}',
      '{"id":"down1","eq":"ds","name":"Down imaging High","kind":"fan","ang":45,"th":3,"col":"var(--s5)","dash":"6 4"}',
      '{"id":"live","eq":"at","name":"Live sonar Down, fan across","kind":"at","ang":135,"th":20,"rot":false,"col":"var(--s7)","dash":"10 3 2 3"}',
      '{"id":"livel","eq":"at","name":"Live sonar Down, fan along keel","kind":"at","ang":135,"th":20,"rot":true,"col":"var(--s8)","dash":"10 3 2 3"}',
      '{"id":"livef","eq":"at","name":"Live sonar Forward","kind":"at","mode":"F","ang":135,"th":20,"col":"var(--s2)","dash":"10 3 2 3"}',
      '{"id":"lives","eq":"at","name":"Flat mode","kind":"at","mode":"S","ang":135,"th":20,"col":"var(--s5)","dash":"10 3 2 3"}',
      '{"id":"livew","eq":"atw","name":"Flat mode Wide (two units)","kind":"at","mode":"W","ang":135,"th":20,"col":"var(--s6)","dash":"10 3 2 3"}',
    ]);
  });
});

describe("the range of a beam and its tag (bRange line 1089, rtag lines 1094 to 1098)", () => {
  // what is tested, then for each beam: its id, its range in metres and its tag
  const cases: [string, string[]][] = [
    [
      "start",
      [
        "side0:40:range 40 m · ",
        "side1:40:range 40 m · ",
        "cone0:305:max depth 305 m · ",
        "cone1:305:max depth 305 m · ",
        "down0:46:max depth 46 m · ",
        "down1:27:max depth 27 m · ",
        "live:30:range 30 m · ",
        "livel:30:range 30 m · ",
        "livef:30:range 30 m · ",
        "lives:30:range 30 m · ",
        "livew:30:range 30 m · ",
      ],
    ],
    [
      "side range 100, over the 91 m of the first frequency",
      [
        "side0:91:range 91 m (frequency max) · ",
        "side1:46:range 46 m (frequency max) · ",
        "cone0:305:max depth 305 m · ",
        "cone1:305:max depth 305 m · ",
        "down0:46:max depth 46 m · ",
        "down1:27:max depth 27 m · ",
        "live:30:range 30 m · ",
        "livel:30:range 30 m · ",
        "livef:30:range 30 m · ",
        "lives:30:range 30 m · ",
        "livew:30:range 30 m · ",
      ],
    ],
    [
      "live range under the depth",
      [
        "side0:40:range 40 m · ",
        "side1:40:range 40 m · ",
        "cone0:305:max depth 305 m · ",
        "cone1:305:max depth 305 m · ",
        "down0:46:max depth 46 m · ",
        "down1:27:max depth 27 m · ",
        "live:8:range 8 m · ",
        "livel:8:range 8 m · ",
        "livef:8:range 8 m · ",
        "lives:8:range 8 m · ",
        "livew:8:range 8 m · ",
      ],
    ],
    [
      "Humminbird pair, MEGA Live 2",
      [
        "side0:40:range 40 m · ",
        "side1:40:range 40 m · ",
        "side2:40:range 40 m · ",
        "cone0:10000:",
        "cone1:10000:",
        "down0:122:max depth 122 m · ",
        "down1:38:max depth 38 m · ",
        "down2:61:max depth 61 m · ",
        "live:30:range 30 m · ",
        "livel:30:range 30 m · ",
        "livef:30:range 30 m · ",
        "lives:30:range 30 m · ",
        "livew:30:range 30 m · ",
      ],
    ],
    [
      "other preset",
      [
        "side0:40:range 40 m · ",
        "side1:40:range 40 m · ",
        "cone0:10000:",
        "cone1:10000:",
        "down0:10000:",
        "down1:10000:",
        "live:30:range 30 m · ",
        "livel:30:range 30 m · ",
        "livef:30:range 30 m · ",
        "lives:30:range 30 m · ",
        "livew:30:range 30 m · ",
      ],
    ],
  ];

  it.each(cases)("%s", (name, expected) => {
    const input = inputOf(caseNamed(name));
    const list = beamList(input.settings, input.names);
    expect(
      list.map((b) => `${b.id}:${bRange(input.settings, b)}:${rtag(input.fmt, input.settings, b)}`),
    ).toEqual(expected);
  });

  it("gives a side fan the range of Settings unless its frequency stops sooner, and 10,000 m to a beam without a limit", () => {
    const a = { ssr: 40, atr: 30 };
    expect(bRange(a, { kf: 0.5, maxr: 91 })).toBe(40);
    expect(bRange(a, { kf: 0.5, maxr: 20 })).toBe(20);
    expect(bRange(a, { kf: 0.5 })).toBe(40);
    expect(bRange(a, { kind: "at", maxr: 5 })).toBe(30);
    expect(bRange(a, { kind: "cone", maxr: 305 })).toBe(305);
    expect(bRange(a, { kind: "cone" })).toBe(1e4);
    expect(bRange(a, { kind: "cone", maxr: 0 })).toBe(1e4);
  });

  it("treats a share of zero or not a number as no side fan, as the earlier lines do (a falsy kf)", () => {
    const a = { ssr: 40, atr: 30 };
    expect(bRange(a, { kf: 0, maxr: 20, kind: "cone" })).toBe(20);
    expect(bRange(a, { kf: Number.NaN, kind: "at" })).toBe(30);
  });

  it("says a range is the frequency's own only where it is under the range of Settings", () => {
    const f = createFormatter("en-US");
    const a = { ssr: 40, atr: 30 };
    expect(rtag(f, a, { kf: 1, maxr: 40 })).toBe("range 40 m · ");
    expect(rtag(f, a, { kf: 1, maxr: 39.99 })).toBe("range 40 m (frequency max) · ");
    expect(rtag(f, a, { kf: 1, maxr: 39.4 })).toBe("range 39 m (frequency max) · ");
    expect(rtag(f, a, { kind: "at" })).toBe("range 30 m · ");
    expect(rtag(f, a, { maxr: 305 })).toBe("max depth 305 m · ");
    expect(rtag(f, a, {})).toBe("");
  });
});

describe("the beams that are drawn (cmpList, line 1099)", () => {
  // the case, then the ids of the beams drawn
  const cases: [string, string][] = [
    ["start", "side0 cone0 cone1 down0 down1 live livel livef lives livew"],
    ["all beams ticked", "side0 side1 cone0 cone1 down0 down1 live livel livef lives livew"],
    ["none ticked", ""],
    ["only the side fans", "side0 side1"],
    [
      "Humminbird pair, MEGA Live 2",
      "side0 side1 side2 cone0 cone1 down0 down1 down2 live livel livef lives",
    ],
    ["other preset", "side0 side1 cone0 cone1 down0 down1 live livel livef lives"],
    ["sonars not equipped", "cone0 cone1 live livel livef lives livew"],
    ["only live sonar equipped", "live livel livef lives livew"],
    ["depth 305 m, the 2D cones' own limit", "cone0 cone1"],
  ];

  it.each(cases)("%s", (name, expected) => {
    const input = inputOf(caseNamed(name));
    const ids = cmpList(input.settings, input.names, input.eq, input.ui.behind).map((b) => b.id);
    expect(ids.join(" ")).toBe(expected);
  });

  it("leaves out a beam whose tick is missing from the saved state", () => {
    const input = inputOf(caseNamed("all beams ticked"));
    const ids = cmpList(input.settings, input.names, input.eq, { cone0: true }).map((b) => b.id);
    expect(ids).toEqual(["cone0"]);
  });
});

/** The geometry of the live sonar's beam as one digest and the counts, as the tests of it tell it. */
function geoSummary(g: AtGeometry): string {
  const json = JSON.stringify({
    R: g.R,
    dirs: g.dirs.map((d) => [d.v[0], d.v[1], d.v[2], d.c, d.az ?? null]),
    pts: g.pts,
    foot: g.foot ?? null,
    fx: g.fx ?? null,
    ring: g.ring ? [g.ring.h1, g.ring.h2, g.ring.span, g.ring.azs] : null,
    rays: g.rays.map((r) => [r.p[0], r.p[1], r.p[2], r.c, r.az ?? null]),
    xr: g.xr ?? null,
    yr: g.yr ?? null,
  });
  return `${fnv1a(json)} ${g.dirs.length}/${g.pts.length}/${g.rays.length}/${g.foot ? (g.foot[0]?.length ?? 0) : 0}`;
}

describe("the live sonar's beam on the bottom (atGeo, lines 988 to 1029, and atFootTxt, lines 1030 to 1035)", () => {
  // what is tested, then for the forward, the flat and the wide beam: the digest of the geometry,
  // the numbers of directions, points, rays and corners of the footprint, and the text
  const cases: [string, string[]][] = [
    [
      "start",
      [
        "ce9e8f6a 129/369/129/82 | range 30 m · bottom from 4.1 m behind to 28.3 m ahead, up to 8.5 m wide",
        "f403acae 296/518/296/148 | range 30 m · a band of bottom across 135°, 18.0 to 28.3 m out (horizontally)",
        "d0c31cba 304/532/304/152 | range 30 m · a band of bottom across 270°, 18.0 to 28.3 m out (horizontally)",
      ],
    ],
    [
      "sv-SE",
      [
        "ce9e8f6a 129/369/129/82 | range 30 m · bottom from 4,1 m behind to 28,3 m ahead, up to 8,5 m wide",
        "f403acae 296/518/296/148 | range 30 m · a band of bottom across 135°, 18,0 to 28,3 m out (horizontally)",
        "d0c31cba 304/532/304/152 | range 30 m · a band of bottom across 270°, 18,0 to 28,3 m out (horizontally)",
      ],
    ],
    [
      "deep water, 60 m",
      [
        "96dc4c43 123/0/123/0 | range 30 m · doesn't reach the bottom",
        "844c8bfb 222/0/222/0 | range 30 m · doesn't reach the bottom",
        "28ebd8bb 228/0/228/0 | range 30 m · doesn't reach the bottom",
      ],
    ],
    [
      "shallow water, 0.4 m",
      [
        "34832d79 129/369/129/82 | range 30 m · bottom from 0.17 m behind to 30.0 m ahead, up to 2.0 m wide",
        "04bb8ba7 222/518/222/148 | range 30 m · a band of bottom across 135°, 0.72 to 2.1 m out (horizontally)",
        "6675d7a7 228/532/228/152 | range 30 m · a band of bottom across 270°, 0.72 to 2.1 m out (horizontally)",
      ],
    ],
    [
      "live range under the depth",
      [
        "892b82cf 123/0/123/0 | range 8 m · doesn't reach the bottom",
        "48c281b5 222/0/222/0 | range 8 m · doesn't reach the bottom",
        "262665cb 228/0/228/0 | range 8 m · doesn't reach the bottom",
      ],
    ],
    [
      "live range equal to the depth",
      [
        "db11447a 123/0/123/0 | range 10 m · doesn't reach the bottom",
        "8c952619 222/0/222/0 | range 10 m · doesn't reach the bottom",
        "32acfa17 228/0/228/0 | range 10 m · doesn't reach the bottom",
      ],
    ],
    [
      "live range the next number over the depth",
      [
        "fb6ed12e 135/369/135/82 | range 10 m · bottom from 0.00 m behind to 0.00 m ahead, up to 0.00 m wide",
        "bea0f286 222/0/222/0 | range 10 m · doesn't reach the bottom",
        "de0f0838 228/0/228/0 | range 10 m · doesn't reach the bottom",
      ],
    ],
    [
      "live fan 180 degrees",
      [
        "17ef4f84 129/369/129/82 | range 30 m · bottom from 10.0 m behind to 28.3 m ahead, up to 8.3 m wide",
        "1d8b43f1 296/518/296/148 | range 30 m · a band of bottom across 180°, 18.0 to 28.3 m out (horizontally)",
        "4d23717f 304/532/304/152 | range 30 m · a ring of bottom all around, 18.0 to 28.3 m out",
      ],
    ],
    [
      "live fan just under 180 degrees",
      [
        "5aeb000b 129/369/129/82 | range 30 m · bottom from 10.0 m behind to 28.3 m ahead, up to 8.3 m wide",
        "7c099cd2 296/518/296/148 | range 30 m · a band of bottom across 180°, 18.0 to 28.3 m out (horizontally)",
        "08bae3ea 304/532/304/152 | range 30 m · a ring of bottom all around, 18.0 to 28.3 m out",
      ],
    ],
    [
      "live fan 179.99999994, just short of a ring",
      [
        "127c34ee 129/369/129/82 | range 30 m · bottom from 10.0 m behind to 28.3 m ahead, up to 8.3 m wide",
        "c1c852f7 296/518/296/148 | range 30 m · a band of bottom across 180°, 18.0 to 28.3 m out (horizontally)",
        "2dba9dea 304/532/304/152 | range 30 m · a band of bottom across 360°, 18.0 to 28.3 m out (horizontally)",
      ],
    ],
    [
      "live fan 179.99999995, just a ring",
      [
        "2d74ea76 129/369/129/82 | range 30 m · bottom from 10.0 m behind to 28.3 m ahead, up to 8.3 m wide",
        "15f529b5 296/518/296/148 | range 30 m · a band of bottom across 180°, 18.0 to 28.3 m out (horizontally)",
        "94391556 304/532/304/152 | range 30 m · a ring of bottom all around, 18.0 to 28.3 m out",
      ],
    ],
    [
      "live fan 20 degrees, slice 5",
      [
        "8430362c 123/369/123/82 | range 30 m · bottom from 7.0 m ahead to 14.3 m ahead, up to 1.5 m wide",
        "5a80d7c1 296/518/296/148 | range 30 m · a band of bottom across 20°, 24.1 to 28.3 m out (horizontally)",
        "a310001a 296/518/296/148 | range 30 m · a band of bottom across 40°, 24.1 to 28.3 m out (horizontally)",
      ],
    ],
    [
      "live mounts at the edges",
      [
        "c5afc679 123/369/123/82 | range 30 m · bottom from 24.1 m behind to 24.1 m ahead, up to 8.3 m wide",
        "4515a18d 222/0/222/0 | range 30 m · doesn't reach the bottom",
        "2eb85e8b 228/0/228/0 | range 30 m · doesn't reach the bottom",
      ],
    ],
    [
      "live mounts steep",
      [
        "921ce43c 129/369/129/82 | range 30 m · bottom from 4.1 m ahead to 28.3 m ahead, up to 9.0 m wide",
        "7d7ce390 222/518/222/148 | range 30 m · a band of bottom across 135°, -1.5 to 1.7 m out (horizontally)",
        "9f326566 228/532/228/152 | range 30 m · a band of bottom across 270°, -1.5 to 1.7 m out (horizontally)",
      ],
    ],
    [
      "live slice 89.9 degrees",
      [
        "a37ce8e4 129/369/129/82 | range 30 m · bottom from 4.1 m behind to 28.3 m ahead, up to 41.5 m wide",
        "ef44ef22 296/518/296/148 | range 30 m · a band of bottom across 135°, 4.7 to 28.3 m out (horizontally)",
        "d5ff17f5 304/532/304/152 | range 30 m · a band of bottom across 270°, 4.7 to 28.3 m out (horizontally)",
      ],
    ],
    [
      "Humminbird pair, MEGA Live 2",
      [
        "9e392eba 129/369/129/82 | range 30 m · bottom from 2.7 m behind to 28.3 m ahead, up to 9.6 m wide",
        "f269ee05 296/518/296/148 | range 30 m · a band of bottom across 120°, 17.3 to 28.3 m out (horizontally)",
        "6369f765 304/532/304/152 | range 30 m · a band of bottom across 240°, 17.3 to 28.3 m out (horizontally)",
      ],
    ],
    [
      "other preset",
      [
        "6d729608 129/369/129/82 | range 30 m · bottom from 4.1 m behind to 28.3 m ahead, up to 9.5 m wide",
        "c4abe6af 296/518/296/148 | range 30 m · a band of bottom across 135°, 17.3 to 28.3 m out (horizontally)",
        "78cf91e6 304/532/304/152 | range 30 m · a band of bottom across 270°, 17.3 to 28.3 m out (horizontally)",
      ],
    ],
    [
      "Lowrance nose cone, two live transducers",
      [
        "f82ca2f0 129/369/129/82 | range 30 m · bottom from 10.0 m behind to 28.3 m ahead, up to 9.3 m wide",
        "66a7c9ad 296/518/296/148 | range 30 m · a band of bottom across 180°, 17.3 to 28.3 m out (horizontally)",
        "23a863fa 304/532/304/152 | range 30 m · a ring of bottom all around, 17.3 to 28.3 m out",
      ],
    ],
    [
      "invalid depth",
      [
        "0fbd2528 123/369/123/82 | range 30 m · bottom from -0.00 m ahead to — m ahead, up to — m wide",
        "f7a829fb 222/0/222/0 | range 30 m · doesn't reach the bottom",
        "4a5e27b6 228/0/228/0 | range 30 m · doesn't reach the bottom",
      ],
    ],
    [
      "invalid live settings",
      [
        "a62561bb 123/0/123/0 | range 30 m · doesn't reach the bottom",
        "78d61a4d 292/511/292/146 | range 30 m · a band of bottom across 0°, 18.0 to 28.3 m out (horizontally)",
        "78d61a4d 292/511/292/146 | range 30 m · a band of bottom across 0°, 18.0 to 28.3 m out (horizontally)",
      ],
    ],
    [
      "invalid live range",
      [
        "6c45f0e8 123/0/123/0 | range -1 m · doesn't reach the bottom",
        "508e0487 222/0/222/0 | range -1 m · doesn't reach the bottom",
        "574e31f9 228/0/228/0 | range -1 m · doesn't reach the bottom",
      ],
    ],
    [
      "invalid mount",
      [
        "ce9e8f6a 129/369/129/82 | range 30 m · bottom from 4.1 m behind to 28.3 m ahead, up to 8.5 m wide",
        "31af90c0 222/518/222/148 | range 30 m · a band of bottom across 135°, -2.5 to 0.70 m out (horizontally)",
        "47a3688a 228/532/228/152 | range 30 m · a band of bottom across 270°, -2.5 to 0.70 m out (horizontally)",
      ],
    ],
  ];

  it.each(cases)("%s", (name, expected) => {
    const input = inputOf(caseNamed(name));
    const list = beamList(input.settings, input.names);
    const told3 = ["livef", "lives", "livew"].map((id) => {
      const b = list.find((x) => x.id === id);
      if (b === undefined) throw new Error(`no beam ${id}`);
      const g = atGeo(b, input.settings);
      return `${geoSummary(g)} | ${atFootTxt(input.fmt, b, input.settings, g)}`;
    });
    expect(told3).toEqual(expected);
  });
});

describe("the footprints seen from above (drawFootprint, lines 1100 to 1153)", () => {
  const KEYS = ["fp-svg", "fp-res"];

  // what is tested, the message of the TypeError if the earlier lines throw one, and the two elements
  const cases: [string, string | null, string[]][] = [
    [
      "start",
      null,
      [
        "h:93debd5c:12949 x:10 m|20 m|30 m|40 m|↑ heading|port|starboard|20 m|10.0 m deep",
        "r:SideScan 455 kHz CHIRP=range 40 m · 77.5 m wide strip of bottom: from under the boat out to 38.7 m each side; up to 1.4 m long front to back|2D Medium CHIRP 83 kHz=max depth 305 m · 9.3 m circle|2D High CHIRP 200 kHz=max depth 305 m · 3.5 m circle|DownScan 700 kHz CHIRP=max depth 46 m · 9.5 m wide × 0.52–0.58 m long|DownScan 1200 kHz CHIRP=max depth 27 m · 5.4 m wide × 0.52–0.54 m long|ActiveTarget 2 Down, fan across=range 30 m · 48.3 m wide × 3.2–8.3 m long|ActiveTarget 2 Down, fan along keel=range 30 m · 48.3 m long (front to back) × 3.2–8.3 m wide|ActiveTarget 2 Forward=range 30 m · bottom from 4.1 m behind to 28.3 m ahead, up to 8.5 m wide|Scout=range 30 m · a band of bottom across 135°, 18.0 to 28.3 m out (horizontally)|Scout Wide (two units)=range 30 m · a band of bottom across 270°, 18.0 to 28.3 m out (horizontally)",
      ],
    ],
    [
      "all beams ticked",
      null,
      [
        "h:0774f4e8:14667 x:10 m|20 m|30 m|40 m|↑ heading|port|starboard|20 m|10.0 m deep",
        "r:SideScan 455 kHz CHIRP=range 40 m · 77.5 m wide strip of bottom: from under the boat out to 38.7 m each side; up to 1.4 m long front to back|SideScan 1075 kHz CHIRP=range 40 m · 14.5 m wide strip of bottom: from under the boat out to 7.3 m each side; up to 0.18 m long front to back|2D Medium CHIRP 83 kHz=max depth 305 m · 9.3 m circle|2D High CHIRP 200 kHz=max depth 305 m · 3.5 m circle|DownScan 700 kHz CHIRP=max depth 46 m · 9.5 m wide × 0.52–0.58 m long|DownScan 1200 kHz CHIRP=max depth 27 m · 5.4 m wide × 0.52–0.54 m long|ActiveTarget 2 Down, fan across=range 30 m · 48.3 m wide × 3.2–8.3 m long|ActiveTarget 2 Down, fan along keel=range 30 m · 48.3 m long (front to back) × 3.2–8.3 m wide|ActiveTarget 2 Forward=range 30 m · bottom from 4.1 m behind to 28.3 m ahead, up to 8.5 m wide|Scout=range 30 m · a band of bottom across 135°, 18.0 to 28.3 m out (horizontally)|Scout Wide (two units)=range 30 m · a band of bottom across 270°, 18.0 to 28.3 m out (horizontally)",
      ],
    ],
    [
      "none ticked",
      null,
      [
        "h:6e79851a:852 x:↑ heading|port|starboard|1 m|10.0 m deep",
        "r:No beams selected=tap one above",
      ],
    ],
    [
      "sv-SE",
      null,
      [
        "h:386484b2:14667 x:10 m|20 m|30 m|40 m|↑ heading|port|starboard|20 m|10,0 m deep",
        "r:SideScan 455 kHz CHIRP=range 40 m · 77,5 m wide strip of bottom: from under the boat out to 38,7 m each side; up to 1,4 m long front to back|SideScan 1075 kHz CHIRP=range 40 m · 14,5 m wide strip of bottom: from under the boat out to 7,3 m each side; up to 0,18 m long front to back|2D Medium CHIRP 83 kHz=max depth 305 m · 9,3 m circle|2D High CHIRP 200 kHz=max depth 305 m · 3,5 m circle|DownScan 700 kHz CHIRP=max depth 46 m · 9,5 m wide × 0,52–0,58 m long|DownScan 1200 kHz CHIRP=max depth 27 m · 5,4 m wide × 0,52–0,54 m long|ActiveTarget 2 Down, fan across=range 30 m · 48,3 m wide × 3,2–8,3 m long|ActiveTarget 2 Down, fan along keel=range 30 m · 48,3 m long (front to back) × 3,2–8,3 m wide|ActiveTarget 2 Forward=range 30 m · bottom from 4,1 m behind to 28,3 m ahead, up to 8,5 m wide|Scout=range 30 m · a band of bottom across 135°, 18,0 to 28,3 m out (horizontally)|Scout Wide (two units)=range 30 m · a band of bottom across 270°, 18,0 to 28,3 m out (horizontally)",
      ],
    ],
    [
      "deep water, 60 m",
      null,
      [
        "h:13c93a1f:1871 x:10 m|20 m|30 m|↑ heading|port|starboard|10 m|60.0 m deep",
        "r:SideScan 455 kHz CHIRP=range 40 m · doesn't reach the bottom|SideScan 1075 kHz CHIRP=range 40 m · doesn't reach the bottom|2D Medium CHIRP 83 kHz=max depth 305 m · 56.0 m circle|2D High CHIRP 200 kHz=max depth 305 m · 21.2 m circle|DownScan 700 kHz CHIRP=max depth 46 m · doesn't reach the bottom|DownScan 1200 kHz CHIRP=max depth 27 m · doesn't reach the bottom|ActiveTarget 2 Down, fan across=range 30 m · doesn't reach the bottom|ActiveTarget 2 Down, fan along keel=range 30 m · doesn't reach the bottom|ActiveTarget 2 Forward=range 30 m · doesn't reach the bottom|Scout=range 30 m · doesn't reach the bottom|Scout Wide (two units)=range 30 m · doesn't reach the bottom",
      ],
    ],
    [
      "shallow water, 0.4 m",
      null,
      [
        "h:ba4b3ab2:14656 x:10 m|20 m|30 m|↑ heading|port|starboard|20 m|0.40 m deep",
        "r:SideScan 455 kHz CHIRP=range 40 m · 9.1 m wide strip of bottom: from under the boat out to 4.6 m each side; up to 0.16 m long front to back|SideScan 1075 kHz CHIRP=range 40 m · 0.58 m wide strip of bottom: from under the boat out to 0.29 m each side; up to 0.01 m long front to back|2D Medium CHIRP 83 kHz=max depth 305 m · 0.37 m circle|2D High CHIRP 200 kHz=max depth 305 m · 0.14 m circle|DownScan 700 kHz CHIRP=max depth 46 m · 0.38 m wide × 0.02–0.02 m long|DownScan 1200 kHz CHIRP=max depth 27 m · 0.21 m wide × 0.02–0.02 m long|ActiveTarget 2 Down, fan across=range 30 m · 1.9 m wide × 0.13–0.33 m long|ActiveTarget 2 Down, fan along keel=range 30 m · 1.9 m long (front to back) × 0.13–0.33 m wide|ActiveTarget 2 Forward=range 30 m · bottom from 0.17 m behind to 30.0 m ahead, up to 2.0 m wide|Scout=range 30 m · a band of bottom across 135°, 0.72 to 2.1 m out (horizontally)|Scout Wide (two units)=range 30 m · a band of bottom across 270°, 0.72 to 2.1 m out (horizontally)",
      ],
    ],
    ["side range under the depth", null, ["h:6312cfbb:10892", "r:11:8cb4201d"]],
    [
      "side range 100, over the 91 m of the first frequency",
      null,
      [
        "h:54794190:14873 x:20 m|40 m|60 m|80 m|↑ heading|port|starboard|50 m|10.0 m deep",
        "r:SideScan 455 kHz CHIRP=range 91 m (frequency max) · 180.9 m wide strip of bottom: from under the boat out to 90.4 m each side; up to 3.2 m long front to back|SideScan 1075 kHz CHIRP=range 46 m (frequency max) · 14.5 m wide strip of bottom: from under the boat out to 7.3 m each side; up to 0.18 m long front to back|2D Medium CHIRP 83 kHz=max depth 305 m · 9.3 m circle|2D High CHIRP 200 kHz=max depth 305 m · 3.5 m circle|DownScan 700 kHz CHIRP=max depth 46 m · 9.5 m wide × 0.52–0.58 m long|DownScan 1200 kHz CHIRP=max depth 27 m · 5.4 m wide × 0.52–0.54 m long|ActiveTarget 2 Down, fan across=range 30 m · 48.3 m wide × 3.2–8.3 m long|ActiveTarget 2 Down, fan along keel=range 30 m · 48.3 m long (front to back) × 3.2–8.3 m wide|ActiveTarget 2 Forward=range 30 m · bottom from 4.1 m behind to 28.3 m ahead, up to 8.5 m wide|Scout=range 30 m · a band of bottom across 135°, 18.0 to 28.3 m out (horizontally)|Scout Wide (two units)=range 30 m · a band of bottom across 270°, 18.0 to 28.3 m out (horizontally)",
      ],
    ],
    ["live range under the depth", null, ["h:e1262ae7:7722", "r:11:e11456b0"]],
    ["live range equal to the depth", null, ["h:4e9b1ff9:9930", "r:11:551dbe83"]],
    ["live range the next number over the depth", null, ["h:c46f2810:11034", "r:11:fed4ca43"]],
    ["live fan 180 degrees", null, ["h:d6181ea4:14684", "r:11:f1fec6b7"]],
    ["live fan just under 180 degrees", null, ["h:d6181ea4:14684", "r:11:f1fec6b7"]],
    ["live fan 179.99999994, just short of a ring", null, ["h:d6181ea4:14684", "r:11:ea06dcda"]],
    ["live fan 179.99999995, just a ring", null, ["h:d6181ea4:14684", "r:11:f1fec6b7"]],
    ["live fan 20 degrees, slice 5", null, ["h:e31c53ec:14530", "r:11:8a989e9b"]],
    ["live mounts at the edges", null, ["h:23a5b39a:11004", "r:11:8899ec78"]],
    ["live mounts steep", null, ["h:124f55bb:14832", "r:11:b12f5e1f"]],
    ["live slice 89.9 degrees", null, ["h:d8846550:14666", "r:11:e86f2add"]],
    ["side fans aimed at the center line", null, ["h:803766e0:14663", "r:11:95a793b3"]],
    ["side upper edge 0", null, ["h:1b456efa:14665", "r:11:2c452655"]],
    ["only the side fans", null, ["h:03d6adf8:5307", "r:2:3517f607"]],
    [
      "Humminbird pair, MEGA Live 2",
      null,
      [
        "h:fdf623c4:15575 x:10 m|20 m|30 m|40 m|↑ heading|port|starboard|20 m|10.0 m deep",
        "r:Side Imaging 455 kHz=range 40 m · 77.5 m wide strip of bottom: from under the boat out to 38.7 m each side; up to 1.4 m long front to back|Side Imaging 800 kHz=range 40 m · 77.5 m wide strip of bottom: from under the boat out to 38.7 m each side; up to 1.4 m long front to back|Side Imaging MEGA Imaging+=range 40 m · 77.5 m wide strip of bottom: from under the boat out to 38.7 m each side; up to 1.4 m long front to back|2D CHIRP Wide 140–200 kHz=7.7 m circle|2D CHIRP Narrow 180–240 kHz=4.4 m circle|Down Imaging 455 kHz=max depth 122 m · 15.3 m wide × 0.52–0.66 m long|Down Imaging 800 kHz=max depth 38 m · 8.3 m wide × 0.52–0.57 m long|Down Imaging MEGA Imaging+=max depth 61 m · 15.3 m wide × 0.52–0.66 m long|MEGA Live 2 Down, fan across=range 30 m · 34.6 m wide × 3.5–7.1 m long|MEGA Live 2 Down, fan along keel=range 30 m · 34.6 m long (front to back) × 3.5–7.1 m wide|MEGA Live 2 Forward=range 30 m · bottom from 2.7 m behind to 28.3 m ahead, up to 9.6 m wide|Landscape=range 30 m · a band of bottom across 120°, 17.3 to 28.3 m out (horizontally)",
      ],
    ],
    ["Humminbird single, one live transducer", null, ["h:0e654c18:15609", "r:12:7a58fd88"]],
    ["other preset", null, ["h:93394f35:12811", "r:10:864c6de3"]],
    ["Lowrance nose cone, two live transducers", null, ["h:150a8521:14704", "r:11:d09027f0"]],
    ["sonars not equipped", null, ["h:f7b72499:8694", "r:7:b5a0e81a"]],
    ["only live sonar equipped", null, ["h:f42f5af6:8477", "r:5:0d267878"]],
    [
      "depth 305 m, the 2D cones' own limit",
      "Cannot read properties of undefined (reading 'map')",
      [NOT, NOT],
    ],
    [
      "depth the next number over 305",
      null,
      [
        "h:6166055d:853 x:↑ heading|port|starboard|1 m|305.0 m deep",
        "r:2D Medium CHIRP 83 kHz=max depth 305 m · doesn't reach the bottom|2D High CHIRP 200 kHz=max depth 305 m · doesn't reach the bottom",
      ],
    ],
    [
      "depth the next number under 305",
      null,
      [
        "h:98bcccb7:1069 x:↑ heading|port|starboard|1 m|305.0 m deep",
        "r:2D Medium CHIRP 83 kHz=max depth 305 m · 0.00 m circle|2D High CHIRP 200 kHz=max depth 305 m · 0.00 m circle",
      ],
    ],
    ["a depth under the cones' limit, 304", null, ["h:d3db66c8:1622", "r:2:0ff199d3"]],
    ["depth equal to a down fan's limit, 46", null, ["h:44d5532f:4907", "r:11:4045dc5d"]],
  ];

  it.each(cases)("%s", (name, thrown, expected) => {
    const input = inputOf(caseNamed(name));
    if (thrown !== null) {
      expect(() => footprintView(input)).toThrow(new TypeError(thrown));
      return;
    }
    const view = footprintView(input);
    expect(Object.keys(view).sort()).toEqual([...KEYS].sort());
    expect(toldOf(view, KEYS, FULL_ROWS.has(name))).toEqual(expected);
  });

  it("covers every case the page draws", () => {
    expect(cases.map(([name]) => name).sort()).toEqual(DRAWN.map((c) => c.name).sort());
  });
});

describe("the footprints' rings and scale bar at the limits of their steps (drawFootprint, lines 1124 to 1131)", () => {
  // The rows of this describe were added after the module was written, for survivors of the mutation round
  // (commit c8a9275): changes of the ring step and of the scale bar that the other rows could not tell.
  // Only one beam is ticked, so that the picture reaches as far as the beam does: the first side fan reaches
  // the square root of (range squared less depth squared), so a depth and a range of a Pythagorean triple
  // give a reach in whole metres, and the next number up a reach just over it; the live sonar's forward
  // beam reaches about as far as its range. The rows are the picture's texts and what the rows say.
  const SIDE_ONLY = only("side0");
  const LIVE_ONLY = only("livef");
  const rowsOf: [string, Case, string[]][] = [
    [
      "side fan, reach 1.5",
      { name: "x", over: { dep: "2", ssr: "2.5" }, behind: SIDE_ONLY },
      [
        "h:22fad626:2832 x:1 m|↑ heading|port|starboard|1 m|2.0 m deep",
        "r:SideScan 455 kHz CHIRP=range 3 m · 3.0 m wide strip of bottom: from under the boat out to 1.5 m each side; up to 0.09 m long front to back",
      ],
    ],
    [
      "side fan, reach 3",
      { name: "x", over: { dep: "4", ssr: "5" }, behind: SIDE_ONLY },
      [
        "h:6bc273c0:3311 x:1 m|2 m|3 m|↑ heading|port|starboard|2 m|4.0 m deep",
        "r:SideScan 455 kHz CHIRP=range 5 m · 6.0 m wide strip of bottom: from under the boat out to 3.0 m each side; up to 0.17 m long front to back",
      ],
    ],
    [
      "side fan, reach 3, the next number up",
      { name: "x", over: { dep: "4", ssr: "5.000001" }, behind: SIDE_ONLY },
      [
        "h:d33b09d1:2832 x:2 m|↑ heading|port|starboard|2 m|4.0 m deep",
        "r:SideScan 455 kHz CHIRP=range 5 m · 6.0 m wide strip of bottom: from under the boat out to 3.0 m each side; up to 0.17 m long front to back",
      ],
    ],
    [
      "side fan, reach 5",
      { name: "x", over: { dep: "12", ssr: "13" }, behind: SIDE_ONLY },
      [
        "h:f3479267:2977 x:2 m|4 m|↑ heading|port|starboard|2 m|12.0 m deep",
        "r:SideScan 455 kHz CHIRP=range 13 m · 10.0 m wide strip of bottom: from under the boat out to 5.0 m each side; up to 0.45 m long front to back",
      ],
    ],
    [
      "side fan, reach 8",
      { name: "x", over: { dep: "6", ssr: "10" }, behind: SIDE_ONLY },
      [
        "h:89b91def:3423 x:2 m|4 m|6 m|8 m|↑ heading|port|starboard|5 m|6.0 m deep",
        "r:SideScan 455 kHz CHIRP=range 10 m · 16.0 m wide strip of bottom: from under the boat out to 8.0 m each side; up to 0.35 m long front to back",
      ],
    ],
    [
      "side fan, reach 8, the next number up",
      { name: "x", over: { dep: "6", ssr: "10.000001" }, behind: SIDE_ONLY },
      [
        "h:d776317f:2831 x:5 m|↑ heading|port|starboard|5 m|6.0 m deep",
        "r:SideScan 455 kHz CHIRP=range 10 m · 16.0 m wide strip of bottom: from under the boat out to 8.0 m each side; up to 0.35 m long front to back",
      ],
    ],
    [
      "side fan, reach 12",
      { name: "x", over: { dep: "5", ssr: "13" }, behind: SIDE_ONLY },
      [
        "h:f93151f6:3081 x:5 m|10 m|↑ heading|port|starboard|5 m|5.0 m deep",
        "r:SideScan 455 kHz CHIRP=range 13 m · 24.0 m wide strip of bottom: from under the boat out to 12.0 m each side; up to 0.45 m long front to back",
      ],
    ],
    [
      "side fan, reach 20",
      { name: "x", over: { dep: "21", ssr: "29" }, behind: SIDE_ONLY },
      [
        "h:4d82994e:3416 x:5 m|10 m|15 m|20 m|↑ heading|port|starboard|10 m|21.0 m deep",
        "r:SideScan 455 kHz CHIRP=range 29 m · 40.0 m wide strip of bottom: from under the boat out to 20.0 m each side; up to 1.0 m long front to back",
      ],
    ],
    [
      "side fan, reach 20, the next number up",
      { name: "x", over: { dep: "21", ssr: "29.000001" }, behind: SIDE_ONLY },
      [
        "h:87366673:3084 x:10 m|20 m|↑ heading|port|starboard|10 m|21.0 m deep",
        "r:SideScan 455 kHz CHIRP=range 29 m · 40.0 m wide strip of bottom: from under the boat out to 20.0 m each side; up to 1.0 m long front to back",
      ],
    ],
    [
      "side fan, reach 30",
      { name: "x", over: { dep: "16", ssr: "34" }, behind: SIDE_ONLY },
      [
        "h:51523785:3316 x:10 m|20 m|30 m|↑ heading|port|starboard|20 m|16.0 m deep",
        "r:SideScan 455 kHz CHIRP=range 34 m · 60.0 m wide strip of bottom: from under the boat out to 30.0 m each side; up to 1.2 m long front to back",
      ],
    ],
    [
      "side fan, reach 40",
      { name: "x", over: { dep: "9", ssr: "41" }, behind: SIDE_ONLY },
      [
        "h:19eecec7:3416 x:10 m|20 m|30 m|40 m|↑ heading|port|starboard|20 m|9.0 m deep",
        "r:SideScan 455 kHz CHIRP=range 41 m · 80.0 m wide strip of bottom: from under the boat out to 40.0 m each side; up to 1.4 m long front to back",
      ],
    ],
    [
      "side fan, reach 40, the next number up",
      { name: "x", over: { dep: "9", ssr: "41.000001" }, behind: SIDE_ONLY },
      [
        "h:80727efe:3081 x:20 m|40 m|↑ heading|port|starboard|20 m|9.0 m deep",
        "r:SideScan 455 kHz CHIRP=range 41 m · 80.0 m wide strip of bottom: from under the boat out to 40.0 m each side; up to 1.4 m long front to back",
      ],
    ],
    [
      "side fan, reach 60",
      { name: "x", over: { dep: "11", ssr: "61" }, behind: SIDE_ONLY },
      [
        "h:622be9b1:3313 x:20 m|40 m|60 m|↑ heading|port|starboard|20 m|11.0 m deep",
        "r:SideScan 455 kHz CHIRP=range 61 m · 120.0 m wide strip of bottom: from under the boat out to 60.0 m each side; up to 2.1 m long front to back",
      ],
    ],
    [
      "live range 143, the scale bar still 50 m",
      { name: "x", over: { dep: "10", atr: "143" }, behind: LIVE_ONLY },
      [
        "h:24078fe7:3738 x:20 m|40 m|60 m|80 m|100 m|120 m|140 m|↑ heading|port|starboard|50 m|10.0 m deep",
        "r:ActiveTarget 2 Forward=range 143 m · bottom from 4.1 m behind to 142.6 m ahead, up to 27.1 m wide",
      ],
    ],
    [
      "live range 144.5, the scale bar 100 m",
      { name: "x", over: { dep: "10", atr: "144.5" }, behind: LIVE_ONLY },
      [
        "h:9d2248b6:3766 x:20 m|40 m|60 m|80 m|100 m|120 m|140 m|↑ heading|port|starboard|100 m|10.0 m deep",
        "r:ActiveTarget 2 Forward=range 145 m · bottom from 4.1 m behind to 144.2 m ahead, up to 27.2 m wide",
      ],
    ],
    [
      "live range 150",
      { name: "x", over: { dep: "10", atr: "150" }, behind: LIVE_ONLY },
      [
        "h:6811a67f:4025 x:20 m|40 m|60 m|80 m|100 m|120 m|140 m|160 m|↑ heading|port|starboard|100 m|10.0 m deep",
        "r:ActiveTarget 2 Forward=range 150 m · bottom from 4.1 m behind to 149.7 m ahead, up to 27.8 m wide",
      ],
    ],
  ];

  it.each(rowsOf)("%s", (_name, c, expected) => {
    const view = footprintView(inputOf(c));
    expect(toldOf(view, ["fp-svg", "fp-res"], true)).toEqual(expected);
  });
});

describe("the side view in very shallow water (drawSide, lines 1178 to 1221)", () => {
  // The rows of this describe were added after the module was written, for survivors of the mutation round
  // (commit 69f853f): a change of the distance of "level with the transducer" that the other rows could not tell.
  // The depth under which the side view is scaled as if it were 0.1 m (line 1208), and the distance
  // under which a beam's first point on the bottom is "level with the transducer" (line 1186): at 0.15 m
  // the live sonar's forward beam starts 0.06 m behind, at 0.1 m and under it is level.
  const shallow: [string, string[]][] = [
    [
      "0.15",
      [
        "h:64214211:3785 x:← stern|bow →|0.15 m deep {viewBox=0 0 340 43}",
        "r:SideScan 455 kHz CHIRP=range 40 m · up to 0.06 m front to back on the bottom|SideScan 1075 kHz CHIRP=range 40 m · up to 0.00 m front to back on the bottom|Scout Wide (two units)=range 30 m · 1.3 m front to back on the bottom, from 0.55 m behind to 0.77 m ahead|Scout=range 30 m · 0.67 m front to back on the bottom, from 0.10 m ahead to 0.77 m ahead|ActiveTarget 2 Forward=range 30 m · 30.1 m front to back on the bottom, from 0.06 m behind to 30.0 m ahead|ActiveTarget 2 Down, fan along keel=range 30 m · up to 0.72 m front to back on the bottom|2D Medium CHIRP 83 kHz=max depth 305 m · up to 0.14 m front to back on the bottom|2D High CHIRP 200 kHz=max depth 305 m · up to 0.05 m front to back on the bottom|ActiveTarget 2 Down, fan across=range 30 m · up to 0.12 m front to back on the bottom|DownScan 700 kHz CHIRP=max depth 46 m · up to 0.01 m front to back on the bottom|DownScan 1200 kHz CHIRP=max depth 27 m · up to 0.01 m front to back on the bottom",
      ],
    ],
    [
      "0.1",
      [
        "h:c376f69c:3807 x:← stern|bow →|0.10 m deep {viewBox=0 0 340 43}",
        "r:SideScan 455 kHz CHIRP=range 40 m · up to 0.04 m front to back on the bottom|SideScan 1075 kHz CHIRP=range 40 m · up to 0.00 m front to back on the bottom|Scout Wide (two units)=range 30 m · 0.88 m front to back on the bottom, from 0.36 m behind to 0.51 m ahead|Scout=range 30 m · 0.45 m front to back on the bottom, from 0.07 m ahead to 0.51 m ahead|ActiveTarget 2 Forward=range 30 m · 30.0 m front to back on the bottom, from level with the transducer to 30.0 m ahead|ActiveTarget 2 Down, fan along keel=range 30 m · up to 0.48 m front to back on the bottom|2D Medium CHIRP 83 kHz=max depth 305 m · up to 0.09 m front to back on the bottom|2D High CHIRP 200 kHz=max depth 305 m · up to 0.04 m front to back on the bottom|ActiveTarget 2 Down, fan across=range 30 m · up to 0.08 m front to back on the bottom|DownScan 700 kHz CHIRP=max depth 46 m · up to 0.01 m front to back on the bottom|DownScan 1200 kHz CHIRP=max depth 27 m · up to 0.01 m front to back on the bottom",
      ],
    ],
    [
      "0.05",
      [
        "h:68d22944:3782 x:← stern|bow →|0.05 m deep {viewBox=0 0 340 43}",
        "r:SideScan 455 kHz CHIRP=range 40 m · up to 0.02 m front to back on the bottom|SideScan 1075 kHz CHIRP=range 40 m · up to 0.00 m front to back on the bottom|Scout Wide (two units)=range 30 m · 0.44 m front to back on the bottom, from 0.18 m behind to 0.26 m ahead|Scout=range 30 m · 0.22 m front to back on the bottom, from level with the transducer to 0.26 m ahead|ActiveTarget 2 Forward=range 30 m · 30.0 m front to back on the bottom, from level with the transducer to 30.0 m ahead|ActiveTarget 2 Down, fan along keel=range 30 m · up to 0.24 m front to back on the bottom|2D Medium CHIRP 83 kHz=max depth 305 m · up to 0.05 m front to back on the bottom|2D High CHIRP 200 kHz=max depth 305 m · up to 0.02 m front to back on the bottom|ActiveTarget 2 Down, fan across=range 30 m · up to 0.04 m front to back on the bottom|DownScan 700 kHz CHIRP=max depth 46 m · up to 0.00 m front to back on the bottom|DownScan 1200 kHz CHIRP=max depth 27 m · up to 0.00 m front to back on the bottom",
      ],
    ],
  ];

  it.each(shallow)("side view at a depth of %s m", (dep, expected) => {
    const view = sideView(inputOf({ name: "x", over: { dep }, behind: ALL }));
    expect(toldOf(view, ["side-svg", "side-res"], true)).toEqual(expected);
  });
});

describe("the 3D scene and its drawing: the least reach (build3D, line 1227)", () => {
  // The rows of this describe were added after the module was written, for a survivor of the mutation
  // round (commit 69f853f): a change of the scene's least reach that the other rows could not tell.
  // with no beam the scene reaches the least of 3 m (to 4 on the grid) in water under 5 m
  // what is tested, the depth, the scene, and the log of the canvas
  const least: [string, string, string][] = [
    ["1", "1/4/0/0 010c94de", "132:1f02c86c"],
    ["4.99", "4.99/4/0/0 010c94de", "132:48ab777f"],
    ["5", "5/4/0/0 010c94de", "132:e10fbe48"],
    ["5.5", "5.5/4/0/0 010c94de", "132:fac68add"],
  ];

  it.each(least)("no beam ticked at a depth of %s m", (dep, scene, log) => {
    const input = inputOf({ name: "x", over: { dep }, behind: NONE });
    expect(sceneSum(buildScene(input))).toBe(scene);
    expect(logSum(drawn(input))).toBe(log);
  });
});

/** The seven elements of the section, in the order the rows of the arithmetic describes tell them. */
const SECTION_KEYS = [
  "fp-svg",
  "fp-res",
  "ssb-all",
  "allb-res",
  "side-svg",
  "side-res",
  "cmp-serr",
] as const;

/** What a row of the arithmetic describes sets: the transducers and the fields that differ; all beams are ticked. */
type Spec = Pick<Case, "first" | "second" | "live" | "over">;

/**
 * The whole section for one input: the scene and the canvas log as part 4 tells them, and each
 * element of the section (a long html as its digest and length, a list of rows as their number and digest).
 */
function expectSection(label: string, spec: Spec, scene: string, log: string, views: string[]) {
  const input = inputOf({ name: label, behind: ALL, ...spec });
  expect(sceneSum(buildScene(input))).toBe(scene);
  expect(logSum(drawn(input))).toBe(log);
  expect(toldOf(compareView(input), SECTION_KEYS, false)).toEqual(views);
}

describe("the order of floating-point arithmetic at typed values (round 1 of the review of PR #82)", () => {
  // The rows of this describe were added after the module was written. A change of the order of the
  // operations of a formula (`a / b` as `a * (1 / b)`, `a * b * c` as `a * (b * c)`) that gives a value
  // one unit in the last place off passes every row above, and still changes a number the page writes
  // unrounded (the points of a picture, the scene's triangles) or a rounded one at a tie. Each row is an
  // input a visitor types (one or two decimals; two ranges are written in full) that shows one such
  // change of `beams.ts`: line 1137 (`ext * 1.1`, the scene's reach), line 1130 (the fan's angle on the
  // bottom in the scene) and line 558 (the same in the picture), line 786 (`top + H * s + 2`, the
  // height of the view from behind), and line 435 (`2 * r.span * 180 / Math.PI`, the width of a fan in
  // the text). Expected values are printed by the legacy lines run in Node, never by the port.
  const rows: [string, Spec, string, string, string[]][] = [
    [
      "depth 150, side range 8, live range 42.5",
      { over: { dep: "150", ssr: "8", atr: "42.5" } },
      "150/100/520/85 b27d5510",
      "5121:d400a176",
      [
        "h:13199bd0:1866",
        "r:11:7c03eb93",
        "h:fa7e834b:7069 {viewBox=0 0 340 262}",
        "r:11:8d92cb3e",
        "h:66b78326:3292 {viewBox=0 0 340 262}",
        "r:11:151450dd",
        "t: [hidden]",
      ],
    ],
    [
      "depth 45.05, a fan just under its limit",
      { over: { dep: "45.05" } },
      "45.05/44/600/86 ab4eb161",
      "5770:73d60c24",
      [
        "h:35c85140:2719",
        "r:11:3ef8c646",
        "h:7775819d:7258 {viewBox=0 0 340 220}",
        "r:11:1424e84b",
        "h:0ecbe903:3368 {viewBox=0 0 340 262}",
        "r:11:6a9fbd0c",
        "t: [hidden]",
      ],
    ],
    [
      "depth 40, both ranges 46",
      { over: { dep: "40", ssr: "46", atr: "46" } },
      "40/51/969/93 2c70bb9a",
      "8722:8586293e",
      [
        "h:62141762:9306",
        "r:11:3d91a67d",
        "h:ebb0f7d8:5770 {viewBox=0 0 340 179}",
        "r:11:1e7d12c1",
        "h:5f56d491:4012 {viewBox=0 0 340 179}",
        "r:11:c1de106a",
        "t: [hidden]",
      ],
    ],
    [
      "depth 4.9, ranges 4.9 and the next number up",
      { over: { dep: "4.9", ssr: "4.9", atr: "4.900000000000001" } },
      "4.9/6/910/90 a3b49008",
      "8268:34cc8c32",
      [
        "h:6819e757:7091",
        "r:11:89164545",
        "h:78f9fa68:6944 {viewBox=0 0 340 200}",
        "r:11:ecd373bd",
        "h:a812a1f6:3764 {viewBox=0 0 340 199}",
        "r:11:87290c60",
        "t: [hidden]",
      ],
    ],
    [
      "depth 0.45, side range the next number over 10",
      { over: { dep: "0.45", ssr: "10.000000000000002" } },
      "0.45/33/1346/96 1b9ca5f0",
      "11796:7ff04e7b",
      [
        "h:6a40b91a:14655",
        "r:11:fca85d1c",
        "h:c86aa19b:4302 {viewBox=0 0 340 56}",
        "r:11:170090a3",
        "h:fdc03ca1:3831 {viewBox=0 0 340 45}",
        "r:11:6e576969",
        "t: [hidden]",
      ],
    ],
    [
      "depth 0.05, the other live preset",
      { live: "other", over: { dep: "0.05" } },
      "0.05/33/1120/94 d777e84d",
      "9971:d70f64c9",
      [
        "h:a861cf56:12706",
        "r:10:83fe5f33",
        "h:092f8e1b:4046 {viewBox=0 0 340 44}",
        "r:10:d4c5d742",
        "h:1f32c784:3535 {viewBox=0 0 340 43}",
        "r:10:42bd8be7",
        "t: [hidden]",
      ],
    ],
    [
      "depth 0.05, LiveScope Plus",
      { live: "lvs34", over: { dep: "0.05" } },
      "0.05/33/1120/94 d777e84d",
      "9971:d70f64c9",
      [
        "h:a861cf56:12706",
        "r:10:e6abcb8e",
        "h:092f8e1b:4046 {viewBox=0 0 340 44}",
        "r:10:fcd6bd33",
        "h:1f32c784:3535 {viewBox=0 0 340 43}",
        "r:10:168fbd1e",
        "t: [hidden]",
      ],
    ],
    [
      "Humminbird 1400, MEGA fan 107.6, depth 46.8",
      { first: "hb_xm14hw", over: { dep: "46.8", down2: "107.6" } },
      "46.8/68/752/90 71c6f4ce",
      "6958:b060be13",
      [
        "h:fe2e7d55:4034",
        "r:13:7bba1a69",
        "h:2f8914f2:8472 {viewBox=0 0 340 162}",
        "r:13:bf9592cd",
        "h:f1348e15:3802 {viewBox=0 0 340 262}",
        "r:13:1aaf42b6",
        "t: [hidden]",
      ],
    ],
    [
      "live fan 5.5 degrees",
      { over: { atw: "5.5" } },
      "10/44/1338/96 0d75e14f",
      "11764:7d152b72",
      [
        "h:fdfa3d8d:14530",
        "r:11:6a031f9a",
        "h:5dd6b625:4421 {viewBox=0 0 340 82}",
        "r:11:4473de0a",
        "h:e03a8664:3826 {viewBox=0 0 340 96}",
        "r:11:5e63a7ac",
        "t: [hidden]",
      ],
    ],
    // The next ten rows come from the arithmetic round over the whole module (round 1 of the review): changes
    // of the order of operations of 34 formulas that passed every row above and change the page for typed
    // input. Each row is a page as a visitor sets it (all beams ticked, one or two decimals); ten of them
    // together show all 34 (found by drawing 3,000 such pages with each change and keeping a small cover).
    [
      "typed input 1: hb_xm14hw and hb_xm9hw, at2, depth 3.7",
      {
        first: "hb_xm14hw",
        second: "hb_xm9hw",
        over: {
          dep: "3.7",
          ssr: "3.7",
          atr: "3.7",
          atw: "109.9",
          att: "20.8",
          atsb: "67.7",
          atfa: "62.7",
          sso: "3.2",
          sst: "4.3",
          dst: "4.9",
          zt: "0.4",
          ssalign: "inner",
        },
      },
      "3.7/5/992/93 de22dc2a",
      "8905:d6c44d91",
      [
        "h:920e74c5:7317",
        "r:13:b1f2d492",
        "h:693bf6d8:8403 {viewBox=0 0 340 200}",
        "r:13:8c8fec21",
        "h:a32adc77:4102 {viewBox=0 0 340 201}",
        "r:13:0ea8bad3",
        "t: [hidden]",
      ],
    ],
    [
      "typed input 2: hb_xm920, lvs34, depth 18.6",
      {
        first: "hb_xm920",
        live: "lvs34",
        over: {
          dep: "18.6",
          ssr: "141.1",
          atr: "23.7",
          atw: "149.1",
          att: "77.6",
          atsb: "54.1",
          atfa: "6.3",
          sso: "6.6",
          sst: "4.2",
          dst: "4.7",
          zt: "0.2",
          ssalign: "inner",
          cone0: "67.3",
          cone1: "69.1",
          down0: "51.1",
          down1: "106.8",
          down2: "45.1",
          side0: "61.2",
          side1: "65.7",
          side2: "45.3",
        },
      },
      "18.6/105/1337/100 dce4f4c6",
      "11792:52050c5c",
      [
        "h:cf61d15e:15963",
        "r:12:c0632770",
        "h:3f80fd03:5299 {viewBox=0 0 340 73}",
        "r:12:48eaafa4",
        "h:69791e35:4428 {viewBox=0 0 340 166}",
        "r:12:db17f546",
        "t: [hidden]",
      ],
    ],
    [
      "typed input 3: hb_xm14cmsi, ml2, depth 29.8",
      {
        first: "hb_xm14cmsi",
        live: "ml2",
        over: {
          dep: "29.8",
          ssr: "41.15",
          atr: "55.68",
          atw: "170.74",
          att: "60.72",
          atsb: "17.84",
          atfa: "13.18",
          sso: "12.88",
          sst: "0.92",
          dst: "3.35",
          zt: "2.25",
          ssalign: "center",
        },
      },
      "29.8/62/1121/94 b3d64a99",
      "9946:2657eb17",
      [
        "h:6467bb30:12153",
        "r:10:88980479",
        "h:06e37885:5220 {viewBox=0 0 340 127}",
        "r:10:f88fb666",
        "h:e1c1ac4f:4060 {viewBox=0 0 340 126}",
        "r:10:0a00985f",
        "t: [hidden]",
      ],
    ],
    [
      "typed input 4: hb_xnt9hw150, ml2, depth 13.69",
      {
        first: "hb_xnt9hw150",
        live: "ml2",
        over: {
          dep: "13.69",
          ssr: "37.92",
          atr: "93.89",
          atw: "111.7",
          att: "31.53",
          atsb: "88.55",
          atfa: "41.36",
          sso: "4.47",
          sst: "4.97",
          dst: "2.99",
          zt: "1.82",
          ssalign: "center",
          cone0: "91.33",
          cone1: "47.43",
          down0: "27.27",
          down1: "69.92",
          side0: "46.35",
          side1: "30.78",
        },
      },
      "13.69/104/1120/94 cb651167",
      "10003:3aa097d3",
      [
        "h:5c8e6d5f:13210",
        "r:10:a8153b0f",
        "h:9664ef58:4733 {viewBox=0 0 340 99}",
        "r:10:669eb5bd",
        "h:342da17d:3673 {viewBox=0 0 340 65}",
        "r:10:7a152014",
        "t: [hidden]",
      ],
    ],
    [
      "typed input 5: lowrance, other, depth 0.8",
      {
        live: "other",
        over: {
          dep: "0.8",
          ssr: "0.8",
          atr: "0.8",
          atw: "131.7",
          att: "67.9",
          atsb: "28.2",
          atfa: "44.8",
          sso: "7.5",
          sst: "5.1",
          dst: "0.7",
          zt: "0",
          ssalign: "center",
          cone0: "71.1",
          cone1: "77",
          down0: "67.6",
          down1: "74.3",
          side0: "38.2",
          side1: "18.6",
        },
      },
      "0.8/4/765/88 9d9390fe",
      "7044:82d788b6",
      [
        "h:3734c405:5396",
        "r:10:85bd9957",
        "h:987c1a98:6304 {viewBox=0 0 340 168}",
        "r:10:be268f58",
        "h:e2e4bffb:3386 {viewBox=0 0 340 168}",
        "r:10:48398d0c",
        "t: [hidden]",
      ],
    ],
    [
      "typed input 6: hb_xnt9hw150, ml2, depth 5.12",
      {
        first: "hb_xnt9hw150",
        live: "ml2",
        over: {
          dep: "5.12",
          ssr: "3.81",
          atr: "73.62",
          atw: "166.61",
          att: "56.75",
          atsb: "69.06",
          atfa: "20.68",
          sso: "1.63",
          sst: "4.62",
          dst: "1.62",
          zt: "2.91",
          ssalign: "center",
        },
      },
      "5.12/81/992/90 5cf44a18",
      "8911:d14c6066",
      [
        "h:2bc26f25:9498",
        "r:10:f08d50cc",
        "h:9bdd72ca:5573 {viewBox=0 0 340 61}",
        "r:10:3e1a7df2",
        "h:725c5952:3276 {viewBox=0 0 340 53}",
        "r:10:bba7d084",
        "t: [hidden]",
      ],
    ],
    [
      "typed input 7: hb_xm14cmsi and lowrance, at2xl, depth 8",
      {
        first: "hb_xm14cmsi",
        second: "lowrance",
        live: "at2xl",
        over: {
          dep: "8",
          ssr: "27.97",
          atr: "8.98",
          atw: "93.51",
          att: "59.5",
          atsb: "54.72",
          atfa: "86.89",
          sso: "9.65",
          sst: "3.83",
          dst: "4.38",
          zt: "1.74",
          ssalign: "inner",
        },
      },
      "8/31/1564/102 cbfa6c7e",
      "13594:86376196",
      [
        "h:473af320:17146",
        "r:13:1a1458d2",
        "h:9bbc10a4:5817 {viewBox=0 0 340 88}",
        "r:13:c1aab3ca",
        "h:84c3f61c:4790 {viewBox=0 0 340 197}",
        "r:13:6b99b67b",
        "t: [hidden]",
      ],
    ],
    [
      "typed input 8: lowrance, at2xl, depth 67.7",
      {
        live: "at2xl",
        over: {
          dep: "67.7",
          ssr: "98.9",
          atr: "3.9",
          atw: "110.9",
          att: "68.4",
          atsb: "29.4",
          atfa: "66.4",
          sso: "0.3",
          sst: "3.4",
          dst: "5.6",
          zt: "2",
          ssalign: "center",
        },
      },
      "67.7/101/584/87 c4c5b305",
      "5651:d6dbc53f",
      [
        "h:4fd42f98:3550",
        "r:11:2b6160c3",
        "h:a4c5c60d:6884 {viewBox=0 0 340 159}",
        "r:11:3c3daffc",
        "h:66bbfd44:3339 {viewBox=0 0 340 262}",
        "r:11:c48138d3",
        "t: [hidden]",
      ],
    ],
    [
      "typed input 9: lowrance, at2, depth 43",
      {
        over: {
          dep: "43",
          ssr: "43",
          atr: "43",
          atw: "5.53",
          att: "27.48",
          atsb: "9.97",
          atfa: "12.2",
          sso: "1.98",
          sst: "4.22",
          dst: "4.98",
          zt: "1.88",
          ssalign: "inner",
        },
      },
      "43/48/758/88 7744d3af",
      "7052:3d639a8f",
      [
        "h:bd7ea488:4824",
        "r:11:07913cb7",
        "h:62b85ec2:7272 {viewBox=0 0 340 199}",
        "r:11:3961bf19",
        "h:f0b46703:3477 {viewBox=0 0 340 199}",
        "r:11:cfaa7c81",
        "t: [hidden]",
      ],
    ],
    [
      "typed input 10: other and lowrance_nose, ml2, depth 0.4",
      {
        first: "other",
        second: "lowrance_nose",
        live: "ml2",
        over: {
          dep: "0.4",
          ssr: "58.2",
          atr: "56",
          atw: "90.5",
          att: "16.1",
          atsb: "13.1",
          atfa: "54.9",
          sso: "2.6",
          sst: "3.8",
          dst: "5.9",
          zt: "0.5",
          ssalign: "center",
        },
      },
      "0.4/10/1335/100 3591052c",
      "11712:7ea0616d",
      [
        "h:e6a1be04:14906",
        "r:12:212d5f39",
        "h:b1350c26:4954 {viewBox=0 0 340 50}",
        "r:12:4578ebc3",
        "h:494b2b14:4075 {viewBox=0 0 340 56}",
        "r:12:7285a77b",
        "t: [hidden]",
      ],
    ],
  ];

  it.each(rows)("%s", (label, spec, scene, log, views) => {
    expectSection(label, spec, scene, log, views);
  });
});

describe("the exact limit of a side fan's reach (xO > xIn, legacy lines 523, 1047, 1106 and 1262)", () => {
  // The rows of this describe were added after the module was written, for the mutation round. A side
  // fan reaches the bottom only where its outer edge `xO` is farther out than its inner edge `xIn`.
  // With the fan of the second frequency (its width 0.42 of the widest), the fans centred (field
  // `ssalign`) and a range written in full, the reach `sqrt(R * R - d * d)` is exactly `d / tan(aIn)`,
  // so `xO` equals `xIn`: the beam is not drawn, and `>=` in its place would draw it as a line.
  // The ranges were found by trying the numbers next to hypot(d, xIn) for each typed depth in steps of
  // 0.1 m; the next number down gives a smaller reach, and the next up a larger one. The values
  // are printed by the legacy lines run in Node.
  const rows: [string, Spec, string, string, string[]][] = [
    [
      "depth 0.9, range 0.9890530825922429",
      { over: { dep: "0.9", ssr: "0.9890530825922429", ssalign: "center" } },
      "0.9/33/1281/94 14bfc7a7",
      "11259:6385202f",
      [
        "h:6ba426ff:12937",
        "r:11:09934265",
        "h:c307c883:5906 {viewBox=0 0 340 73}",
        "r:11:6f455c45",
        "h:1fa874cd:3738 {viewBox=0 0 340 47}",
        "r:11:3e169136",
        "t: [hidden]",
      ],
    ],
    [
      "depth 6.3, range 6.9233715781457",
      { over: { dep: "6.3", ssr: "6.9233715781457", ssalign: "center" } },
      "6.3/33/1281/94 ab36138e",
      "11259:3f67b6d6",
      [
        "h:5010acd4:12764",
        "r:11:c48c5285",
        "h:6dd3c9ad:5925 {viewBox=0 0 340 76}",
        "r:11:27529248",
        "h:a4ac791f:3777 {viewBox=0 0 340 75}",
        "r:11:350dd9db",
        "t: [hidden]",
      ],
    ],
    [
      "depth 7.2, range 7.912424660737943",
      { over: { dep: "7.2", ssr: "7.912424660737943", ssalign: "center" } },
      "7.2/33/1281/94 a69ec98c",
      "11259:34236014",
      [
        "h:be4aa24d:12730",
        "r:11:e432b081",
        "h:47d46440:5926 {viewBox=0 0 340 81}",
        "r:11:5dcea4fb",
        "h:a78a7a7a:3784 {viewBox=0 0 340 80}",
        "r:11:6e2ba1e5",
        "t: [hidden]",
      ],
    ],
    [
      "depth 6.3, the range the next number down",
      { over: { dep: "6.3", ssr: "6.923371578145699", ssalign: "center" } },
      "6.3/33/1281/94 18e2101c",
      "11259:bd99fbf0",
      [
        "h:5010acd4:12764",
        "r:11:c48c5285",
        "h:f334eb33:5903 {viewBox=0 0 340 76}",
        "r:11:27529248",
        "h:a4ac791f:3777 {viewBox=0 0 340 75}",
        "r:11:350dd9db",
        "t: [hidden]",
      ],
    ],
    [
      "depth 6.3, the range the next number up",
      { over: { dep: "6.3", ssr: "6.923371578145701", ssalign: "center" } },
      "6.3/33/1345/96 148d80c5",
      "11789:ea1edf3f",
      [
        "h:2d21e750:14482",
        "r:11:9c3daaf2",
        "h:b4dff977:6195 {viewBox=0 0 340 76}",
        "r:11:11477d77",
        "h:a4ac791f:3777 {viewBox=0 0 340 75}",
        "r:11:5ae3d9a8",
        "t: [hidden]",
      ],
    ],
  ];

  it.each(rows)("%s", (label, spec, scene, log, views) => {
    expectSection(label, spec, scene, log, views);
  });
});

describe("the 3D scene and its drawing: where labels lie near one another (render3D, line 1321)", () => {
  // The rows of this describe were added after the module was written, for the mutation round. A label is
  // left out when another lies within 90 px across and 26 px up or down (`LABEL.nearX`, `LABEL.nearY`);
  // a view that the visitor reaches by dragging, wheel or the zoom buttons turns one pair of labels at
  // a time over the limit, so changing a limit by one pixel changes which labels are drawn. The views were
  // found by drawing the module with a limit changed and keeping those where the canvas log differs;
  // the logs are printed by the legacy lines run in Node.
  const views: [string, Partial<Scene3dState>, string][] = [
    [
      "the vertical limit, zoomed out, from the left",
      { yaw: -0.95, pitch: 0, zoom: 0.5, zx: 1 },
      "10888:4a546ab2",
    ],
    [
      "the vertical limit, zoomed out, tilted",
      { yaw: -1, pitch: 0.15, zoom: 0.5, zx: 1 },
      "10888:4cb3ba38",
    ],
    ["the horizontal limit", { yaw: -0.3, pitch: 0.2, zoom: 1, zx: 1 }, "10889:877dc5d1"],
    [
      "the horizontal limit, zoomed out",
      { yaw: 0.6, pitch: -0.1, zoom: 0.5, zx: 1 },
      "10888:232e7eb9",
    ],
  ];

  it.each(views)("%s", (_what, state, log) => {
    expect(logSum(drawn(inputOf(caseNamed("start")), state))).toBe(log);
  });
});

describe("the view from behind (drawBehind, lines 1036 to 1083)", () => {
  const KEYS = ["ssb-all", "allb-res"];

  // what is tested, the message of the error the earlier lines throw if they do, and the two elements
  const cases: [string, string | null, string[]][] = [
    [
      "start",
      null,
      [
        "h:38a20cce:3900 x:port|starboard|10.0 m deep {viewBox=0 0 340 82}",
        "r:SideScan 455 kHz CHIRP=range 40 m · 77.5 m wide strip of bottom: from under the boat out to 38.7 m each side|Scout Wide (two units)=range 30 m · 56.6 m wide on the bottom, side to side|Scout=range 30 m · 52.3 m wide on the bottom, side to side|ActiveTarget 2 Forward=range 30 m · 8.5 m wide on the bottom, side to side|ActiveTarget 2 Down, fan across (135°)=range 30 m · 48.3 m wide on the bottom|DownScan 700 kHz CHIRP (51°)=max depth 46 m · 9.5 m wide on the bottom|2D Medium CHIRP 83 kHz (50°)=max depth 305 m · 9.3 m wide on the bottom|DownScan 1200 kHz CHIRP (30°)=max depth 27 m · 5.4 m wide on the bottom|2D High CHIRP 200 kHz (20°)=max depth 305 m · 3.5 m wide on the bottom|ActiveTarget 2 Down, fan along keel (18°)=range 30 m · 3.2 m wide on the bottom",
      ],
    ],
    [
      "all beams ticked",
      null,
      [
        "h:ce17b99b:4444 x:port|starboard|10.0 m deep {viewBox=0 0 340 82}",
        "r:SideScan 455 kHz CHIRP=range 40 m · 77.5 m wide strip of bottom: from under the boat out to 38.7 m each side|SideScan 1075 kHz CHIRP=range 40 m · 14.5 m wide strip of bottom: from under the boat out to 7.3 m each side|Scout Wide (two units)=range 30 m · 56.6 m wide on the bottom, side to side|Scout=range 30 m · 52.3 m wide on the bottom, side to side|ActiveTarget 2 Forward=range 30 m · 8.5 m wide on the bottom, side to side|ActiveTarget 2 Down, fan across (135°)=range 30 m · 48.3 m wide on the bottom|DownScan 700 kHz CHIRP (51°)=max depth 46 m · 9.5 m wide on the bottom|2D Medium CHIRP 83 kHz (50°)=max depth 305 m · 9.3 m wide on the bottom|DownScan 1200 kHz CHIRP (30°)=max depth 27 m · 5.4 m wide on the bottom|2D High CHIRP 200 kHz (20°)=max depth 305 m · 3.5 m wide on the bottom|ActiveTarget 2 Down, fan along keel (18°)=range 30 m · 3.2 m wide on the bottom",
      ],
    ],
    [
      "none ticked",
      null,
      [
        "h:e60a32a1:569 x:port|starboard|10.0 m deep {viewBox=0 0 340 262}",
        "r:No beams selected=tap one above",
      ],
    ],
    [
      "sv-SE",
      null,
      [
        "h:07ec5d09:4444 x:port|starboard|10,0 m deep {viewBox=0 0 340 82}",
        "r:SideScan 455 kHz CHIRP=range 40 m · 77,5 m wide strip of bottom: from under the boat out to 38,7 m each side|SideScan 1075 kHz CHIRP=range 40 m · 14,5 m wide strip of bottom: from under the boat out to 7,3 m each side|Scout Wide (two units)=range 30 m · 56,6 m wide on the bottom, side to side|Scout=range 30 m · 52,3 m wide on the bottom, side to side|ActiveTarget 2 Forward=range 30 m · 8,5 m wide on the bottom, side to side|ActiveTarget 2 Down, fan across (135°)=range 30 m · 48,3 m wide on the bottom|DownScan 700 kHz CHIRP (51°)=max depth 46 m · 9,5 m wide on the bottom|2D Medium CHIRP 83 kHz (50°)=max depth 305 m · 9,3 m wide on the bottom|DownScan 1200 kHz CHIRP (30°)=max depth 27 m · 5,4 m wide on the bottom|2D High CHIRP 200 kHz (20°)=max depth 305 m · 3,5 m wide on the bottom|ActiveTarget 2 Down, fan along keel (18°)=range 30 m · 3,2 m wide on the bottom",
      ],
    ],
    [
      "deep water, 60 m",
      null,
      [
        "h:daf25610:7245 x:port|starboard|60.0 m deep {viewBox=0 0 340 262}",
        "r:SideScan 455 kHz CHIRP=range 40 m · doesn't reach the bottom|SideScan 1075 kHz CHIRP=range 40 m · doesn't reach the bottom|Scout Wide (two units)=range 30 m · doesn't reach the bottom|Scout=range 30 m · doesn't reach the bottom|ActiveTarget 2 Forward=range 30 m · doesn't reach the bottom|ActiveTarget 2 Down, fan across=range 30 m · doesn't reach the bottom|DownScan 700 kHz CHIRP=max depth 46 m · doesn't reach the bottom|2D Medium CHIRP 83 kHz (50°)=max depth 305 m · 56.0 m wide on the bottom|DownScan 1200 kHz CHIRP=max depth 27 m · doesn't reach the bottom|2D High CHIRP 200 kHz (20°)=max depth 305 m · 21.2 m wide on the bottom|ActiveTarget 2 Down, fan along keel=range 30 m · doesn't reach the bottom",
      ],
    ],
    [
      "shallow water, 0.4 m",
      null,
      [
        "h:24c4949f:4282 x:port|starboard|0.40 m deep {viewBox=0 0 340 56}",
        "r:SideScan 455 kHz CHIRP=range 40 m · 9.1 m wide strip of bottom: from under the boat out to 4.6 m each side|SideScan 1075 kHz CHIRP=range 40 m · 0.58 m wide strip of bottom: from under the boat out to 0.29 m each side|Scout Wide (two units)=range 30 m · 4.1 m wide on the bottom, side to side|Scout=range 30 m · 3.8 m wide on the bottom, side to side|ActiveTarget 2 Forward=range 30 m · 2.0 m wide on the bottom, side to side|ActiveTarget 2 Down, fan across (135°)=range 30 m · 1.9 m wide on the bottom|DownScan 700 kHz CHIRP (51°)=max depth 46 m · 0.38 m wide on the bottom|2D Medium CHIRP 83 kHz (50°)=max depth 305 m · 0.37 m wide on the bottom|DownScan 1200 kHz CHIRP (30°)=max depth 27 m · 0.21 m wide on the bottom|2D High CHIRP 200 kHz (20°)=max depth 305 m · 0.14 m wide on the bottom|ActiveTarget 2 Down, fan along keel (18°)=range 30 m · 0.13 m wide on the bottom",
      ],
    ],
    ["side range under the depth", null, ["h:52aa95ba:5903 {viewBox=0 0 340 96}", "r:11:4104addd"]],
    [
      "side range 100, over the 91 m of the first frequency",
      null,
      [
        "h:6c2c5e03:4351 x:port|starboard|10.0 m deep {viewBox=0 0 340 60}",
        "r:SideScan 455 kHz CHIRP=range 91 m (frequency max) · 180.9 m wide strip of bottom: from under the boat out to 90.4 m each side|SideScan 1075 kHz CHIRP=range 46 m (frequency max) · 14.5 m wide strip of bottom: from under the boat out to 7.3 m each side|Scout Wide (two units)=range 30 m · 56.6 m wide on the bottom, side to side|Scout=range 30 m · 52.3 m wide on the bottom, side to side|ActiveTarget 2 Forward=range 30 m · 8.5 m wide on the bottom, side to side|ActiveTarget 2 Down, fan across (135°)=range 30 m · 48.3 m wide on the bottom|DownScan 700 kHz CHIRP (51°)=max depth 46 m · 9.5 m wide on the bottom|2D Medium CHIRP 83 kHz (50°)=max depth 305 m · 9.3 m wide on the bottom|DownScan 1200 kHz CHIRP (30°)=max depth 27 m · 5.4 m wide on the bottom|2D High CHIRP 200 kHz (20°)=max depth 305 m · 3.5 m wide on the bottom|ActiveTarget 2 Down, fan along keel (18°)=range 30 m · 3.2 m wide on the bottom",
      ],
    ],
    ["live range under the depth", null, ["h:66cba7c1:4842 {viewBox=0 0 340 82}", "r:11:e7bba7d4"]],
    [
      "live range equal to the depth",
      null,
      ["h:dc94eb5d:5056 {viewBox=0 0 340 82}", "r:11:8dad473b"],
    ],
    [
      "live range the next number over the depth",
      null,
      ["h:9b3bbaf6:5275 {viewBox=0 0 340 82}", "r:11:914d77d4"],
    ],
    ["live fan 180 degrees", null, ["h:2f9b4f34:4566 {viewBox=0 0 340 82}", "r:11:9ee699cf"]],
    [
      "live fan just under 180 degrees",
      null,
      ["h:b76212a2:4577 {viewBox=0 0 340 82}", "r:11:9ee699cf"],
    ],
    [
      "live fan 179.99999994, just short of a ring",
      null,
      ["h:7b456022:4566 {viewBox=0 0 340 82}", "r:11:9ee699cf"],
    ],
    [
      "live fan 179.99999995, just a ring",
      null,
      ["h:0c014749:4564 {viewBox=0 0 340 82}", "r:11:9ee699cf"],
    ],
    [
      "live fan 20 degrees, slice 5",
      null,
      ["h:d893e238:4423 {viewBox=0 0 340 82}", "r:11:16b55aba"],
    ],
    ["live mounts at the edges", null, ["h:aaf0ca07:4124 {viewBox=0 0 340 82}", "r:11:87574a47"]],
    ["live mounts steep", null, ["h:43ee22a9:4411 {viewBox=0 0 340 82}", "r:11:f2452e53"]],
    ["live slice 89.9 degrees", null, ["h:c08fa1c9:4439 {viewBox=0 0 340 82}", "r:11:5a15ca00"]],
    [
      "side fans aimed at the center line",
      null,
      ["h:2a69bbe6:4474 {viewBox=0 0 340 82}", "r:11:ea616d17"],
    ],
    ["side upper edge 0", null, ["h:0123d640:4563 {viewBox=0 0 340 82}", "r:11:2ba92cda"]],
    ["only the side fans", null, ["h:7522ab60:1823 {viewBox=0 0 340 82}", "r:2:c9a5e707"]],
    [
      "Humminbird pair, MEGA Live 2",
      null,
      [
        "h:85d5c38f:5231 x:port|starboard|10.0 m deep {viewBox=0 0 340 82}",
        "r:Side Imaging 455 kHz=range 40 m · 77.5 m wide strip of bottom: from under the boat out to 38.7 m each side|Side Imaging 800 kHz=range 40 m · 77.5 m wide strip of bottom: from under the boat out to 38.7 m each side|Side Imaging MEGA Imaging+=range 40 m · 77.5 m wide strip of bottom: from under the boat out to 38.7 m each side|Landscape=range 30 m · 49.0 m wide on the bottom, side to side|MEGA Live 2 Forward=range 30 m · 9.6 m wide on the bottom, side to side|MEGA Live 2 Down, fan across (120°)=range 30 m · 34.6 m wide on the bottom|Down Imaging 455 kHz (75°)=max depth 122 m · 15.3 m wide on the bottom|Down Imaging MEGA Imaging+ (75°)=max depth 61 m · 15.3 m wide on the bottom|Down Imaging 800 kHz (45°)=max depth 38 m · 8.3 m wide on the bottom|2D CHIRP Wide 140–200 kHz (42°)=7.7 m wide on the bottom|2D CHIRP Narrow 180–240 kHz (25°)=4.4 m wide on the bottom|MEGA Live 2 Down, fan along keel (20°)=range 30 m · 3.5 m wide on the bottom",
      ],
    ],
    [
      "Humminbird single, one live transducer",
      null,
      ["h:f8ab58ff:5106 {viewBox=0 0 340 82}", "r:12:da4f63cb"],
    ],
    ["other preset", null, ["h:cc91937f:4135 {viewBox=0 0 340 82}", "r:10:8dce8ef9"]],
    [
      "Lowrance nose cone, two live transducers",
      null,
      ["h:0d30eb7a:4564 {viewBox=0 0 340 82}", "r:11:e1d05de2"],
    ],
    ["sonars not equipped", null, ["h:c4505951:2665 {viewBox=0 0 340 96}", "r:7:f6e756fb"]],
    ["only live sonar equipped", null, ["h:d90b4791:2139 {viewBox=0 0 340 96}", "r:5:0fe7d984"]],
    // Drawn before the footprints, which throw at 305 m: the page has written this when it stops.
    [
      "depth 305 m, the 2D cones' own limit",
      null,
      ["h:1c7b3afe:2107 {viewBox=0 0 340 262}", "r:2:196b3ef2"],
    ],
    [
      "depth the next number over 305",
      null,
      [
        "h:0aa28a6f:1994 x:port|starboard|305.0 m deep {viewBox=0 0 340 262}",
        "r:2D Medium CHIRP 83 kHz=max depth 305 m · doesn't reach the bottom|2D High CHIRP 200 kHz=max depth 305 m · doesn't reach the bottom",
      ],
    ],
    [
      "depth the next number under 305",
      null,
      [
        "h:80caf9c6:2187 x:port|starboard|305.0 m deep {viewBox=0 0 340 262}",
        "r:2D Medium CHIRP 83 kHz (50°)=max depth 305 m · 0.00 m wide on the bottom|2D High CHIRP 200 kHz (20°)=max depth 305 m · 0.00 m wide on the bottom",
      ],
    ],
    [
      "a depth under the cones' limit, 304",
      null,
      ["h:b4c89e8e:1831 {viewBox=0 0 340 262}", "r:2:cca9b5b4"],
    ],
    [
      "depth equal to a down fan's limit, 46",
      null,
      ["h:86138ef6:6686 {viewBox=0 0 340 122}", "r:11:7bd14994"],
    ],
  ];

  it.each(cases)("%s", (name, thrown, expected) => {
    const input = inputOf(caseNamed(name));
    if (thrown !== null) {
      expect(() => behindView(input)).toThrow(new TypeError(thrown));
      return;
    }
    const view = behindView(input);
    expect(Object.keys(view).sort()).toEqual([...KEYS].sort());
    expect(toldOf(view, KEYS, FULL_ROWS.has(name))).toEqual(expected);
  });

  it("covers every case the page draws", () => {
    expect(cases.map(([name]) => name).sort()).toEqual(DRAWN.map((c) => c.name).sort());
  });
});

describe("the rays of a beam seen from the side (beamRays, lines 1161 to 1177)", () => {
  // what is tested, then for each beam that is no live sonar mode: its id, the digest of its rays
  // (the point and whether it meets the bottom), and the number of rays and of those that do
  const cases: [string, string[]][] = [
    [
      "start",
      [
        "side0: 20436369 68/60",
        "side1: 588159e7 68/68",
        "cone0: 1bef1a74 37/37",
        "cone1: 6bf3b0b0 37/37",
        "down0: f0bfd8f0 34/34",
        "down1: 758348de 34/34",
        "live: 522d4b90 34/34",
        "livel: 648bcd44 34/34",
      ],
    ],
    [
      "deep water, 60 m",
      [
        "side0: c6d27379 68/0",
        "side1: 320c99c1 68/0",
        "cone0: ecaa01af 37/37",
        "cone1: 3c549559 37/37",
        "down0: aa5737fa 34/0",
        "down1: e30d0d4e 34/0",
        "live: 11a1c662 34/0",
        "livel: 7ae42380 34/0",
      ],
    ],
    [
      "shallow water, 0.4 m",
      [
        "side0: 24d660d7 68/68",
        "side1: 7f1206b1 68/68",
        "cone0: cf12c42e 37/37",
        "cone1: ab998b0b 37/37",
        "down0: 6d931954 34/34",
        "down1: 6d4e1de2 34/34",
        "live: fd8b6f7a 34/34",
        "livel: a10bb63e 34/34",
      ],
    ],
    [
      "live range under the depth",
      [
        "side0: 20436369 68/60",
        "side1: 588159e7 68/68",
        "cone0: 1bef1a74 37/37",
        "cone1: 6bf3b0b0 37/37",
        "down0: f0bfd8f0 34/34",
        "down1: 758348de 34/34",
        "live: 4bcdd3b6 34/0",
        "livel: 0659a4d4 34/0",
      ],
    ],
    [
      "live fan 20 degrees, slice 5",
      [
        "side0: 20436369 68/60",
        "side1: 588159e7 68/68",
        "cone0: 1bef1a74 37/37",
        "cone1: 6bf3b0b0 37/37",
        "down0: f0bfd8f0 34/34",
        "down1: 758348de 34/34",
        "live: 7b51ef8e 34/34",
        "livel: 9a30abe2 34/34",
      ],
    ],
    [
      "side fans aimed at the center line",
      [
        "side0: 20436369 68/60",
        "side1: 2e57abef 68/68",
        "cone0: 1bef1a74 37/37",
        "cone1: 6bf3b0b0 37/37",
        "down0: f0bfd8f0 34/34",
        "down1: 758348de 34/34",
        "live: 522d4b90 34/34",
        "livel: 648bcd44 34/34",
      ],
    ],
    [
      "Humminbird pair, MEGA Live 2",
      [
        "side0: 83914027 68/60",
        "side1: 83914027 68/60",
        "side2: 83914027 68/60",
        "cone0: 27dce1c9 37/37",
        "cone1: 00b25914 37/37",
        "down0: 8570565c 34/34",
        "down1: 0b58642c 34/34",
        "down2: 8570565c 34/34",
        "live: e102c514 34/34",
        "livel: 871ec3bc 34/34",
      ],
    ],
    [
      "other preset",
      [
        "side0: 20436369 68/60",
        "side1: 01eb7767 68/68",
        "cone0: 1bef1a74 37/37",
        "cone1: 6bf3b0b0 37/37",
        "down0: 8570565c 34/34",
        "down1: 0b58642c 34/34",
        "live: abe8c4d8 34/34",
        "livel: 94c024b4 34/34",
      ],
    ],
    [
      "depth the next number under 305",
      [
        "side0: c6d27379 68/0",
        "side1: 320c99c1 68/0",
        "cone0: 2d320ccc 37/1",
        "cone1: a0b4ce19 37/1",
        "down0: aa5737fa 34/0",
        "down1: e30d0d4e 34/0",
        "live: 11a1c662 34/0",
        "livel: 7ae42380 34/0",
      ],
    ],
  ];

  it.each(cases)("%s", (name, expected) => {
    const input = inputOf(caseNamed(name));
    const align = typeof input.local.ssalign === "string" ? input.local.ssalign : undefined;
    const told = beamList(input.settings, input.names)
      .filter((b) => !b.mode)
      .map((b) => {
        const rays = beamRays(b, input.settings, align);
        const json = JSON.stringify(rays.map((r) => [r.p[0], r.p[1], r.p[2], r.bottom]));
        return `${b.id}: ${fnv1a(json)} ${rays.length}/${rays.filter((r) => r.bottom).length}`;
      });
    expect(told).toEqual(expected);
  });
});

describe("the side view (drawSide, lines 1178 to 1221)", () => {
  const KEYS = ["side-svg", "side-res"];

  // what is tested, the message of the error the earlier lines throw if they do, and the two elements
  const cases: [string, string | null, string[]][] = [
    [
      "start",
      null,
      [
        "h:33afa7b4:3603 x:← stern|bow →|10.0 m deep {viewBox=0 0 340 95}",
        "r:SideScan 455 kHz CHIRP=range 40 m · up to 1.4 m front to back on the bottom|Scout Wide (two units)=range 30 m · 48.3 m front to back on the bottom, from 20.0 m behind to 28.3 m ahead|Scout=range 30 m · 21.4 m front to back on the bottom, from 6.9 m ahead to 28.3 m ahead|ActiveTarget 2 Forward=range 30 m · 32.4 m front to back on the bottom, from 4.1 m behind to 28.3 m ahead|ActiveTarget 2 Down, fan along keel=range 30 m · up to 48.3 m front to back on the bottom|2D Medium CHIRP 83 kHz=max depth 305 m · up to 9.3 m front to back on the bottom|2D High CHIRP 200 kHz=max depth 305 m · up to 3.5 m front to back on the bottom|ActiveTarget 2 Down, fan across=range 30 m · up to 8.3 m front to back on the bottom|DownScan 700 kHz CHIRP=max depth 46 m · up to 0.58 m front to back on the bottom|DownScan 1200 kHz CHIRP=max depth 27 m · up to 0.54 m front to back on the bottom",
      ],
    ],
    [
      "all beams ticked",
      null,
      [
        "h:ed3294a5:3888 x:← stern|bow →|10.0 m deep {viewBox=0 0 340 95}",
        "r:SideScan 455 kHz CHIRP=range 40 m · up to 1.4 m front to back on the bottom|SideScan 1075 kHz CHIRP=range 40 m · up to 0.18 m front to back on the bottom|Scout Wide (two units)=range 30 m · 48.3 m front to back on the bottom, from 20.0 m behind to 28.3 m ahead|Scout=range 30 m · 21.4 m front to back on the bottom, from 6.9 m ahead to 28.3 m ahead|ActiveTarget 2 Forward=range 30 m · 32.4 m front to back on the bottom, from 4.1 m behind to 28.3 m ahead|ActiveTarget 2 Down, fan along keel=range 30 m · up to 48.3 m front to back on the bottom|2D Medium CHIRP 83 kHz=max depth 305 m · up to 9.3 m front to back on the bottom|2D High CHIRP 200 kHz=max depth 305 m · up to 3.5 m front to back on the bottom|ActiveTarget 2 Down, fan across=range 30 m · up to 8.3 m front to back on the bottom|DownScan 700 kHz CHIRP=max depth 46 m · up to 0.58 m front to back on the bottom|DownScan 1200 kHz CHIRP=max depth 27 m · up to 0.54 m front to back on the bottom",
      ],
    ],
    [
      "none ticked",
      null,
      [
        "h:58eb8f6a:568 x:← stern|bow →|10.0 m deep {viewBox=0 0 340 262}",
        "r:No beams selected=tap one above",
      ],
    ],
    [
      "sv-SE",
      null,
      [
        "h:35c926a7:3888 x:← stern|bow →|10,0 m deep {viewBox=0 0 340 95}",
        "r:SideScan 455 kHz CHIRP=range 40 m · up to 1,4 m front to back on the bottom|SideScan 1075 kHz CHIRP=range 40 m · up to 0,18 m front to back on the bottom|Scout Wide (two units)=range 30 m · 48,3 m front to back on the bottom, from 20,0 m behind to 28,3 m ahead|Scout=range 30 m · 21,4 m front to back on the bottom, from 6,9 m ahead to 28,3 m ahead|ActiveTarget 2 Forward=range 30 m · 32,4 m front to back on the bottom, from 4,1 m behind to 28,3 m ahead|ActiveTarget 2 Down, fan along keel=range 30 m · up to 48,3 m front to back on the bottom|2D Medium CHIRP 83 kHz=max depth 305 m · up to 9,3 m front to back on the bottom|2D High CHIRP 200 kHz=max depth 305 m · up to 3,5 m front to back on the bottom|ActiveTarget 2 Down, fan across=range 30 m · up to 8,3 m front to back on the bottom|DownScan 700 kHz CHIRP=max depth 46 m · up to 0,58 m front to back on the bottom|DownScan 1200 kHz CHIRP=max depth 27 m · up to 0,54 m front to back on the bottom",
      ],
    ],
    [
      "deep water, 60 m",
      null,
      [
        "h:6b23aca3:3227 x:← stern|bow →|60.0 m deep {viewBox=0 0 340 262}",
        "r:SideScan 455 kHz CHIRP=range 40 m · doesn't reach the bottom|SideScan 1075 kHz CHIRP=range 40 m · doesn't reach the bottom|Scout Wide (two units)=range 30 m · doesn't reach the bottom|Scout=range 30 m · doesn't reach the bottom|ActiveTarget 2 Forward=range 30 m · doesn't reach the bottom|ActiveTarget 2 Down, fan along keel=range 30 m · doesn't reach the bottom|2D Medium CHIRP 83 kHz=max depth 305 m · up to 56.0 m front to back on the bottom|2D High CHIRP 200 kHz=max depth 305 m · up to 21.2 m front to back on the bottom|ActiveTarget 2 Down, fan across=range 30 m · doesn't reach the bottom|DownScan 700 kHz CHIRP=max depth 46 m · doesn't reach the bottom|DownScan 1200 kHz CHIRP=max depth 27 m · doesn't reach the bottom",
      ],
    ],
    [
      "shallow water, 0.4 m",
      null,
      [
        "h:9ea302eb:3809 x:← stern|bow →|0.40 m deep {viewBox=0 0 340 45}",
        "r:SideScan 455 kHz CHIRP=range 40 m · up to 0.16 m front to back on the bottom|SideScan 1075 kHz CHIRP=range 40 m · up to 0.01 m front to back on the bottom|Scout Wide (two units)=range 30 m · 3.5 m front to back on the bottom, from 1.5 m behind to 2.1 m ahead|Scout=range 30 m · 1.8 m front to back on the bottom, from 0.28 m ahead to 2.1 m ahead|ActiveTarget 2 Forward=range 30 m · 30.2 m front to back on the bottom, from 0.17 m behind to 30.0 m ahead|ActiveTarget 2 Down, fan along keel=range 30 m · up to 1.9 m front to back on the bottom|2D Medium CHIRP 83 kHz=max depth 305 m · up to 0.37 m front to back on the bottom|2D High CHIRP 200 kHz=max depth 305 m · up to 0.14 m front to back on the bottom|ActiveTarget 2 Down, fan across=range 30 m · up to 0.33 m front to back on the bottom|DownScan 700 kHz CHIRP=max depth 46 m · up to 0.02 m front to back on the bottom|DownScan 1200 kHz CHIRP=max depth 27 m · up to 0.02 m front to back on the bottom",
      ],
    ],
    ["side range under the depth", null, ["h:cfa876e2:3598 {viewBox=0 0 340 95}", "r:11:e0d9ba68"]],
    [
      "side range 100, over the 91 m of the first frequency",
      null,
      [
        "h:b15a0962:3868 x:← stern|bow →|10.0 m deep {viewBox=0 0 340 95}",
        "r:SideScan 455 kHz CHIRP=range 91 m (frequency max) · up to 3.2 m front to back on the bottom|SideScan 1075 kHz CHIRP=range 46 m (frequency max) · up to 0.18 m front to back on the bottom|Scout Wide (two units)=range 30 m · 48.3 m front to back on the bottom, from 20.0 m behind to 28.3 m ahead|Scout=range 30 m · 21.4 m front to back on the bottom, from 6.9 m ahead to 28.3 m ahead|ActiveTarget 2 Forward=range 30 m · 32.4 m front to back on the bottom, from 4.1 m behind to 28.3 m ahead|ActiveTarget 2 Down, fan along keel=range 30 m · up to 48.3 m front to back on the bottom|2D Medium CHIRP 83 kHz=max depth 305 m · up to 9.3 m front to back on the bottom|2D High CHIRP 200 kHz=max depth 305 m · up to 3.5 m front to back on the bottom|ActiveTarget 2 Down, fan across=range 30 m · up to 8.3 m front to back on the bottom|DownScan 700 kHz CHIRP=max depth 46 m · up to 0.58 m front to back on the bottom|DownScan 1200 kHz CHIRP=max depth 27 m · up to 0.54 m front to back on the bottom",
      ],
    ],
    [
      "live range under the depth",
      null,
      ["h:605b3baf:3874 {viewBox=0 0 340 239}", "r:11:9c022a1a"],
    ],
    [
      "live range equal to the depth",
      null,
      ["h:47ba3b9b:3880 {viewBox=0 0 340 199}", "r:11:cd8efa4a"],
    ],
    [
      "live range the next number over the depth",
      null,
      ["h:8653dea0:4067 {viewBox=0 0 340 199}", "r:11:a9a598ad"],
    ],
    ["live fan 180 degrees", null, ["h:d0eceb52:3992 {viewBox=0 0 340 95}", "r:11:f6beef64"]],
    [
      "live fan just under 180 degrees",
      null,
      ["h:a7992f96:4016 {viewBox=0 0 340 95}", "r:11:f6beef64"],
    ],
    [
      "live fan 179.99999994, just short of a ring",
      null,
      ["h:0af5f76e:4002 {viewBox=0 0 340 95}", "r:11:f6beef64"],
    ],
    [
      "live fan 179.99999995, just a ring",
      null,
      ["h:0b829572:4007 {viewBox=0 0 340 95}", "r:11:f6beef64"],
    ],
    [
      "live fan 20 degrees, slice 5",
      null,
      ["h:388f4a03:3828 {viewBox=0 0 340 97}", "r:11:cbbc8e5a"],
    ],
    ["live mounts at the edges", null, ["h:f70ff6b3:3522 {viewBox=0 0 340 95}", "r:11:274ad65e"]],
    ["live mounts steep", null, ["h:f349d95b:3916 {viewBox=0 0 340 95}", "r:11:4c8058c1"]],
    ["live slice 89.9 degrees", null, ["h:71c06a83:3928 {viewBox=0 0 340 95}", "r:11:26766284"]],
    [
      "side fans aimed at the center line",
      null,
      ["h:c02cdceb:3888 {viewBox=0 0 340 95}", "r:11:4aaf24da"],
    ],
    ["side upper edge 0", null, ["h:2d4bb32c:3855 {viewBox=0 0 340 95}", "r:11:1e6e9395"]],
    ["only the side fans", null, ["h:bd059569:1265 {viewBox=0 0 340 262}", "r:2:33c9071a"]],
    [
      "Humminbird pair, MEGA Live 2",
      null,
      [
        "h:852ac21d:4311 x:← stern|bow →|10.0 m deep {viewBox=0 0 340 95}",
        "r:Side Imaging 455 kHz=range 40 m · up to 1.4 m front to back on the bottom|Side Imaging 800 kHz=range 40 m · up to 1.4 m front to back on the bottom|Side Imaging MEGA Imaging+=range 40 m · up to 1.4 m front to back on the bottom|Landscape=range 30 m · 19.6 m front to back on the bottom, from 8.7 m ahead to 28.3 m ahead|MEGA Live 2 Forward=range 30 m · 31.0 m front to back on the bottom, from 2.7 m behind to 28.3 m ahead|MEGA Live 2 Down, fan along keel=range 30 m · up to 34.6 m front to back on the bottom|2D CHIRP Wide 140–200 kHz=up to 7.7 m front to back on the bottom|2D CHIRP Narrow 180–240 kHz=up to 4.4 m front to back on the bottom|MEGA Live 2 Down, fan across=range 30 m · up to 7.1 m front to back on the bottom|Down Imaging 455 kHz=max depth 122 m · up to 0.66 m front to back on the bottom|Down Imaging 800 kHz=max depth 38 m · up to 0.57 m front to back on the bottom|Down Imaging MEGA Imaging+=max depth 61 m · up to 0.66 m front to back on the bottom",
      ],
    ],
    [
      "Humminbird single, one live transducer",
      null,
      ["h:08e14dd3:4243 {viewBox=0 0 340 95}", "r:12:52d8ae4c"],
    ],
    ["other preset", null, ["h:8945b582:3583 {viewBox=0 0 340 95}", "r:10:1d27b346"]],
    [
      "Lowrance nose cone, two live transducers",
      null,
      ["h:d853de53:3995 {viewBox=0 0 340 95}", "r:11:1502a187"],
    ],
    ["sonars not equipped", null, ["h:37daf81d:2690 {viewBox=0 0 340 95}", "r:7:e71a9b7a"]],
    ["only live sonar equipped", null, ["h:80b0c961:2168 {viewBox=0 0 340 95}", "r:5:0ca45182"]],
    // Alone, the side view has no error at 305 m: it is the footprints that throw, and the page stops there.
    [
      "depth 305 m, the 2D cones' own limit",
      null,
      ["h:a63ad054:1008 {viewBox=0 0 340 262}", "r:2:296455d3"],
    ],
    [
      "depth the next number over 305",
      null,
      [
        "h:2445736d:895 x:← stern|bow →|305.0 m deep {viewBox=0 0 340 262}",
        "r:2D Medium CHIRP 83 kHz=max depth 305 m · doesn't reach the bottom|2D High CHIRP 200 kHz=max depth 305 m · doesn't reach the bottom",
      ],
    ],
    [
      "depth the next number under 305",
      null,
      [
        "h:a63ad054:1008 x:← stern|bow →|305.0 m deep {viewBox=0 0 340 262}",
        "r:2D Medium CHIRP 83 kHz=max depth 305 m · up to 0.00 m front to back on the bottom|2D High CHIRP 200 kHz=max depth 305 m · up to 0.00 m front to back on the bottom",
      ],
    ],
    [
      "a depth under the cones' limit, 304",
      null,
      ["h:217507b0:1008 {viewBox=0 0 340 262}", "r:2:7b9ddfb5"],
    ],
    [
      "depth equal to a down fan's limit, 46",
      null,
      ["h:62c7004b:3367 {viewBox=0 0 340 262}", "r:11:c65060a0"],
    ],
  ];

  it.each(cases)("%s", (name, thrown, expected) => {
    const input = inputOf(caseNamed(name));
    if (thrown !== null) {
      expect(() => sideView(input)).toThrow(new TypeError(thrown));
      return;
    }
    const view = sideView(input);
    expect(Object.keys(view).sort()).toEqual([...KEYS].sort());
    expect(toldOf(view, KEYS, FULL_ROWS.has(name))).toEqual(expected);
  });

  it("covers every case the page draws", () => {
    expect(cases.map(([name]) => name).sort()).toEqual(DRAWN.map((c) => c.name).sort());
  });
});

/** One entry of a canvas log (fixtures/README.md). */
type Entry = unknown[];

/** A value as a canvas log holds it. */
function encode(v: unknown): unknown {
  if (typeof v === "number") {
    if (Number.isFinite(v)) return Object.is(v, -0) ? { $: "-0" } : v;
    return { $: String(v) };
  }
  if (Array.isArray(v)) return v.map(encode);
  return v;
}

/**
 * A canvas that keeps a log of what is done to its context, as the recorder of
 * the fixtures does: a call as its name and arguments, an assignment as `=` and
 * its name and value.
 */
function recordingSurface(width: number, height: number): { surface: Surface; log: Entry[] } {
  const log: Entry[] = [];
  const set: Record<string, unknown> = {};
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
        log.push([name, ...args.map(encode)]);
      };
    },
  });
  const surface: Surface = {
    width,
    height,
    ctx,
    resize: () => {
      throw new Error("the 3D view is never resized");
    },
  };
  return { surface, log };
}

/** The size of the canvas `b3d` in the page's markup. */
const B3D = { width: 680, height: 560 } as const;

/** What the painter draws for an input, in a state of the 3D view that is given over the input's. */
function drawn(input: ReturnType<typeof inputOf>, state: Partial<Scene3dState> = {}): Entry[] {
  const { surface, log } = recordingSurface(B3D.width, B3D.height);
  paintScene(surface, buildScene(input), { ...input, scene3d: { ...input.scene3d, ...state } });
  return log;
}

/** A log as its number of entries and its digest. */
const logSum = (log: Entry[]): string => `${log.length}:${fnv1a(JSON.stringify(log))}`;

/** The texts a log writes, each with where it stands. */
const logTexts = (log: Entry[]): string[] =>
  log.filter((entry) => entry[0] === "fillText").map((entry) => entry.slice(1).join("@"));

/** A scene as its depth, its reach, the number of its triangles and lines, and the digest of them. */
const sceneSum = (s: Scene3d): string =>
  `${s.H}/${s.ext}/${s.tris.length}/${s.lines.length} ${fnv1a(JSON.stringify({ tris: s.tris, lines: s.lines }))}`;

describe("the 3D scene and its drawing (build3D, lines 1226 to 1286, and render3D, lines 1287 to 1325)", () => {
  // what is tested, the scene (depth, reach, triangles, lines, digest), and the log of the canvas (entries, digest)
  const cases: [string, string, string][] = [
    ["start", "10/44/1233/92 f7bbbf0b", "10889:c40d1099"],
    ["all beams ticked", "10/44/1345/96 31e6044b", "11821:4f42db65"],
    ["none ticked", "10/7/0/0 010c94de", "164:72f39c97"],
    ["sv-SE", "10/44/1345/96 31e6044b", "11821:f6a124f7"],
    ["deep water, 60 m", "60/44/520/85 16961a2a", "5121:e762b46d"],
    ["shallow water, 0.4 m", "0.4/33/1345/96 bd6f5951", "11789:f88a56a6"],
    ["side range under the depth", "10/33/1217/92 1bf48bb5", "10729:afbb2e76"],
    [
      "side range 100, over the 91 m of the first frequency",
      "10/100/1345/96 be29e8a3",
      "11821:25084420",
    ],
    ["live range under the depth", "10/44/808/91 d5874e90", "7479:2341885f"],
    ["live range equal to the depth", "10/44/968/93 c533a4a4", "8777:4356cbee"],
    ["live range the next number over the depth", "10/44/1052/94 f77a6111", "9458:0380e95a"],
    ["live fan 180 degrees", "10/44/1345/96 0e832a68", "11821:b132a569"],
    ["live fan just under 180 degrees", "10/44/1345/96 17b5afcb", "11821:695f5724"],
    ["live fan 179.99999994, just short of a ring", "10/44/1345/96 85e22d90", "11821:35293755"],
    ["live fan 179.99999995, just a ring", "10/44/1345/96 7690534d", "11821:61031515"],
    ["live fan 20 degrees, slice 5", "10/44/1338/96 d315740b", "11764:d1a0b78b"],
    ["live mounts at the edges", "10/44/1198/94 00e00f6f", "10626:1f5c0ad2"],
    ["live mounts steep", "10/44/1345/96 d77577a3", "11821:83fc628f"],
    ["live slice 89.9 degrees", "10/44/1345/96 f43951d9", "11821:02a95007"],
    ["side fans aimed at the center line", "10/44/1345/96 4f6246f5", "11821:fdcd8731"],
    ["side upper edge 0", "10/44/1345/96 b4501377", "11821:40318680"],
    ["only the side fans", "10/44/224/8 f73603d0", "2060:3d1b1221"],
    ["Humminbird pair, MEGA Live 2", "10/44/1336/100 4ca055ea", "11785:946dde63"],
    ["Humminbird single, one live transducer", "10/44/1336/100 2b3e2272", "11785:80f4a508"],
    ["other preset", "10/44/1120/94 26e414c9", "10003:5945ac37"],
    ["Lowrance nose cone, two live transducers", "10/44/1345/96 6741478b", "11821:a2087515"],
    ["sonars not equipped", "10/33/913/84 24d4e1b5", "8225:54541565"],
    ["only live sonar equipped", "10/33/773/10 1820f456", "6439:45cefd1a"],
    ["depth 305 m, the 2D cones' own limit", "305/202/140/74 8cf9a944", "2110:75cd9847"],
    ["depth the next number over 305", "305.00000000000006/202/72/72 3d46a58c", "1548:9dfec70a"],
    ["depth the next number under 305", "304.99999999999994/202/140/74 e6dd1910", "2110:5a583b89"],
    ["a depth under the cones' limit, 304", "304/201/140/74 66944cc4", "2110:73ea564d"],
    ["depth equal to a down fan's limit, 46", "46/100/664/88 b57d5f70", "6300:d410942c"],
  ];

  it.each(cases)("%s", (name, scene, log) => {
    const input = inputOf(caseNamed(name));
    expect(sceneSum(buildScene(input))).toBe(scene);
    expect(logSum(drawn(input))).toBe(log);
  });

  it("covers every case the page draws", () => {
    expect(cases.map(([name]) => name).sort()).toEqual(DRAWN.map((c) => c.name).sort());
  });

  // what is tested, the state of the view, the log of the canvas (entries, digest)
  const states: [string, string, Partial<Scene3dState>, string][] = [
    ["start", "the page's start", {}, "10889:c40d1099"],
    ["start", "from behind", { yaw: 0, pitch: 0 }, "10889:6f7709b0"],
    ["start", "from above", { yaw: 0, pitch: Math.PI / 2 }, "10889:57f83516"],
    ["start", "from the side", { yaw: Math.PI / 2, pitch: 0 }, "10888:d0ab953f"],
    ["start", "depth stretched 2", { zx: 2 }, "10889:bab9acb9"],
    ["start", "depth stretched 4", { zx: 4 }, "10889:0c05fe3f"],
    ["start", "zoomed in to the limit", { zoom: 6 }, "10889:468d2318"],
    ["start", "zoomed out to the limit", { zoom: 0.3 }, "10888:bf352b10"],
    ["start", "turned and tilted past a limit", { yaw: 1.3, pitch: -0.2 }, "10888:6c163ad9"],
    ["sv-SE", "the page's start", {}, "11821:f6a124f7"],
    ["sv-SE", "from behind", { yaw: 0, pitch: 0 }, "11821:97be0e32"],
    ["sv-SE", "from above", { yaw: 0, pitch: Math.PI / 2 }, "11821:e612c32a"],
    ["sv-SE", "from the side", { yaw: Math.PI / 2, pitch: 0 }, "11820:1b7ae23b"],
    ["sv-SE", "depth stretched 2", { zx: 2 }, "11821:8929aeef"],
    ["sv-SE", "depth stretched 4", { zx: 4 }, "11821:c294429c"],
    ["sv-SE", "zoomed in to the limit", { zoom: 6 }, "11821:3ade9d38"],
    ["sv-SE", "zoomed out to the limit", { zoom: 0.3 }, "11820:a106f740"],
    ["sv-SE", "turned and tilted past a limit", { yaw: 1.3, pitch: -0.2 }, "11820:4a9c114a"],
    ["none ticked", "the page's start", {}, "164:72f39c97"],
    ["none ticked", "from behind", { yaw: 0, pitch: 0 }, "164:acb3097e"],
    ["none ticked", "from above", { yaw: 0, pitch: Math.PI / 2 }, "164:1390f19a"],
    ["none ticked", "from the side", { yaw: Math.PI / 2, pitch: 0 }, "163:5c704733"],
    ["none ticked", "depth stretched 2", { zx: 2 }, "164:c6c54d72"],
    ["none ticked", "depth stretched 4", { zx: 4 }, "164:68de8aeb"],
    ["none ticked", "zoomed in to the limit", { zoom: 6 }, "164:2077a91b"],
    ["none ticked", "zoomed out to the limit", { zoom: 0.3 }, "163:3203bd8e"],
    ["none ticked", "turned and tilted past a limit", { yaw: 1.3, pitch: -0.2 }, "164:5396df5b"],
    ["shallow water, 0.4 m", "the page's start", {}, "11789:f88a56a6"],
    ["shallow water, 0.4 m", "from behind", { yaw: 0, pitch: 0 }, "11788:cc3d1e8c"],
    ["shallow water, 0.4 m", "from above", { yaw: 0, pitch: Math.PI / 2 }, "11789:7bb578ee"],
    ["shallow water, 0.4 m", "from the side", { yaw: Math.PI / 2, pitch: 0 }, "11787:33a6711f"],
    ["shallow water, 0.4 m", "depth stretched 2", { zx: 2 }, "11789:5278e570"],
    ["shallow water, 0.4 m", "depth stretched 4", { zx: 4 }, "11789:8c8252bc"],
    ["shallow water, 0.4 m", "zoomed in to the limit", { zoom: 6 }, "11789:894c9b14"],
    ["shallow water, 0.4 m", "zoomed out to the limit", { zoom: 0.3 }, "11788:22f0f0d2"],
    [
      "shallow water, 0.4 m",
      "turned and tilted past a limit",
      { yaw: 1.3, pitch: -0.2 },
      "11789:dbd3a3fc",
    ],
    ["Humminbird pair, MEGA Live 2", "the page's start", {}, "11785:946dde63"],
    ["Humminbird pair, MEGA Live 2", "from behind", { yaw: 0, pitch: 0 }, "11785:801c0022"],
    [
      "Humminbird pair, MEGA Live 2",
      "from above",
      { yaw: 0, pitch: Math.PI / 2 },
      "11785:55849273",
    ],
    [
      "Humminbird pair, MEGA Live 2",
      "from the side",
      { yaw: Math.PI / 2, pitch: 0 },
      "11784:cee862d4",
    ],
    ["Humminbird pair, MEGA Live 2", "depth stretched 2", { zx: 2 }, "11785:5cf19717"],
    ["Humminbird pair, MEGA Live 2", "depth stretched 4", { zx: 4 }, "11785:251f2bd7"],
    ["Humminbird pair, MEGA Live 2", "zoomed in to the limit", { zoom: 6 }, "11785:b465e87f"],
    ["Humminbird pair, MEGA Live 2", "zoomed out to the limit", { zoom: 0.3 }, "11784:6362b9aa"],
    [
      "Humminbird pair, MEGA Live 2",
      "turned and tilted past a limit",
      { yaw: 1.3, pitch: -0.2 },
      "11784:acf539e4",
    ],
  ];

  it.each(states)("%s, %s", (name, _what, state, log) => {
    expect(logSum(drawn(inputOf(caseNamed(name)), state))).toBe(log);
  });

  it("writes the labels where the earlier lines put them, and leaves out one that lies near another", () => {
    const at = (state: Partial<Scene3dState>, locale = "start") =>
      logTexts(drawn(inputOf(caseNamed(locale)), state));
    expect(at({})).toEqual([
      "bow@198.34383110503174@166.1676445093446",
      "port@129.10734004849547@318.9874258108913",
      "starboard@550.8926599515046@193.47426603328842",
      "10.0 m deep@400.5574806087203@163.32586465541414",
      "grid 10 m@12@546",
    ]);
    // from the side the starboard label lies on the port one, and is left out
    expect(at({ yaw: Math.PI / 2, pitch: 0 })).toEqual([
      "bow@590.8776359724231@253.60294234296896",
      "port@340@253.60294234296896",
      "10.0 m deep@572.2941073818732@306.39705765703104",
      "grid 10 m@12@546",
    ]);
    expect(at({ zx: 2 }).slice(-1)).toEqual(["grid 10 m · depth stretched ×2@12@546"]);
    expect(at({ zx: 4 }).slice(-1)).toEqual(["grid 10 m · depth stretched ×4@12@546"]);
    expect(at({}, "sv-SE")[3]).toBe("10,0 m deep@400.5574806087203@163.32586465541414");
  });

  // the depth of 2D cones alone, the reach of the scene, and the grid text
  const grids: [string, number, string][] = [
    ["8", 6, "grid 2 m@12@546"],
    ["11.5", 8, "grid 2 m@12@546"],
    ["12.5", 9, "grid 5 m@12@546"],
    ["20", 14, "grid 5 m@12@546"],
    ["29.5", 20, "grid 5 m@12@546"],
    ["31", 21, "grid 10 m@12@546"],
    ["75", 50, "grid 10 m@12@546"],
    ["76", 51, "grid 25 m@12@546"],
  ];

  it.each(grids)("draws the grid at a depth of %s m, a reach of %s m, as %s", (dep, ext, grid) => {
    const input = inputOf({
      name: `2D cones alone at ${dep} m`,
      over: { dep },
      behind: only("cone0", "cone1"),
    });
    expect(buildScene(input).ext).toBe(ext);
    expect(logTexts(drawn(input)).slice(-1)).toEqual([grid]);
  });

  it("draws a scene built once at any angle, and again as it was", () => {
    const input = inputOf(caseNamed("start"));
    const scene = buildScene(input);
    const paint = (state: Partial<Scene3dState>): Entry[] => {
      const { surface, log } = recordingSurface(B3D.width, B3D.height);
      paintScene(surface, scene, { ...input, scene3d: { ...input.scene3d, ...state } });
      return log;
    };
    const first = logSum(paint({}));
    expect(logSum(paint({ yaw: 1, pitch: 1, zoom: 2, zx: 4 }))).not.toBe(first);
    expect(logSum(paint({}))).toBe(first);
    expect(first).toBe("10889:c40d1099");
  });

  // The footprint of a live sonar's fan on the bottom is narrow in the middle and wide at the
  // ends, a polygon that bends inward, and the side fans' footprints bend inward too. A footprint's
  // fill is its outline and nothing else: the triangles that fill it add up to its area and lie
  // inside it, with no part of the fill outside the outline (a darker strip along one side of the
  // hourglass, reported by Adam, 2026-11-28).
  type Ring = readonly (readonly number[])[];
  const area = (pts: Ring): number => {
    let sum = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i] as readonly number[];
      const b = pts[(i + 1) % pts.length] as readonly number[];
      sum += (a[0] as number) * (b[1] as number) - (b[0] as number) * (a[1] as number);
    }
    return Math.abs(sum) / 2;
  };
  const inside = (x: number, y: number, pts: Ring): boolean => {
    let hit = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[i] as readonly number[];
      const b = pts[j] as readonly number[];
      if (
        (a[1] as number) > y !== (b[1] as number) > y &&
        x <
          (((b[0] as number) - (a[0] as number)) * (y - (a[1] as number))) /
            ((b[1] as number) - (a[1] as number)) +
            (a[0] as number)
      ) {
        hit = !hit;
      }
    }
    return hit;
  };
  const outlinesOf = (scene: Scene3d): Ring[] =>
    scene.lines.filter((l) => l.w === 2 && l.d === "").map((l) => l.p.slice(0, -1));

  it.each(BEAM_IDS.map((id) => [id]))(
    "fills the footprint of %s alone exactly, with nothing outside its outline",
    (id) => {
      const scene = buildScene(inputOf({ name: `${id} alone`, behind: only(id) }));
      const outlines = outlinesOf(scene);
      const foot = scene.tris.filter((t) => t.foot);
      expect(foot.length > 0).toBe(outlines.length > 0);
      expect(foot.reduce((sum, t) => sum + area(t.p), 0)).toBeCloseTo(
        outlines.reduce((sum, o) => sum + area(o), 0),
        6,
      );
      for (const t of foot) {
        const cx = (t.p[0][0] + t.p[1][0] + t.p[2][0]) / 3;
        const cy = (t.p[0][1] + t.p[1][1] + t.p[2][1]) / 3;
        expect(outlines.some((o) => inside(cx, cy, o))).toBe(true);
      }
    },
  );

  it.each(cases.map(([name]) => [name]))(
    "%s: the exact fill changes the footprints' triangles and nothing else in the scene",
    (name) => {
      const input = inputOf(caseNamed(name));
      const exact = buildScene(input);
      const earlier = buildScene(input, fanTriangles);
      expect(exact.H).toBe(earlier.H);
      expect(exact.ext).toBe(earlier.ext);
      expect(exact.lines).toEqual(earlier.lines);
      expect(exact.tris.filter((t) => !t.foot)).toEqual(earlier.tris.filter((t) => !t.foot));
      const outlines = outlinesOf(exact);
      for (const t of exact.tris.filter((t) => t.foot)) {
        const cx = (t.p[0][0] + t.p[1][0] + t.p[2][0]) / 3;
        const cy = (t.p[0][1] + t.p[1][1] + t.p[2][1]) / 3;
        // A footprint of no size (a cone at its limit) has nothing to lie inside.
        if (area(t.p) > 0) expect(outlines.some((o) => inside(cx, cy, o))).toBe(true);
      }
    },
  );

  it("draws nothing before a scene is built, and leaves the canvas as it was", () => {
    const input = inputOf(caseNamed("start"));
    const { surface, log } = recordingSurface(B3D.width, B3D.height);
    paintScene(surface, null, input);
    expect(log).toEqual([]);
  });
});

describe("the section as one (renderCmp, lines 1349 to 1354)", () => {
  /** The six elements of the pictures and the results; the seventh is the message. */
  const PICTURES = ["allb-res", "fp-res", "fp-svg", "side-res", "side-svg", "ssb-all"];
  const HB = { first: "hb_xm9hw", second: "hb_xm14hw", live: "ml2" } as const;

  // what is tested, what differs from the start, the message as the page shows it, the elements written besides it
  const cases: [string, Omit<Case, "name">, string, string[]][] = [
    ["nothing wrong", {}, " [hidden]", PICTURES],
    ["depth 0", { over: { dep: "0" } }, "Fix the depth in Settings. [shown]", []],
    ["depth blank", { over: { dep: "" } }, "Fix the depth in Settings. [shown]", []],
    [
      "depth and side angles",
      { over: { dep: "0", side0: "200" } },
      "Fix the depth in Settings. [shown]",
      [],
    ],
    [
      "depth, with no sonar equipped",
      { over: { dep: "0", "eq-ss": false, "eq-ds": false, "eq-2d": false, "eq-at": false } },
      "Fix the depth in Settings. [shown]",
      [],
    ],
    [
      "side angle over its limit",
      { over: { side0: "200" } },
      "Fix the SideScan settings in Settings. [shown]",
      [],
    ],
    ["side range 0", { over: { ssr: "0" } }, "Fix the SideScan settings in Settings. [shown]", []],
    [
      "side range and 2D angle",
      { over: { ssr: "0", cone0: "130" } },
      "Fix the SideScan settings in Settings. [shown]",
      [],
    ],
    [
      "side edge negative",
      { over: { sso: "-1" } },
      "Fix the SideScan settings in Settings. [shown]",
      [],
    ],
    [
      "side edge and fan past straight down",
      { over: { sso: "80" } },
      "Fix the SideScan settings in Settings. [shown]",
      [],
    ],
    [
      "side thickness over its limit",
      { over: { sst: "100" } },
      "Fix the SideScan settings in Settings. [shown]",
      [],
    ],
    [
      "side wrong, SideScan not equipped, 2D angle wrong",
      { over: { side0: "200", cone0: "130", "eq-ss": false } },
      "Fix the 2D angles in Settings. [shown]",
      [],
    ],
    [
      "side wrong, SideScan not equipped",
      { over: { side0: "200", "eq-ss": false } },
      " [hidden]",
      PICTURES,
    ],
    [
      "2D angle over its limit",
      { over: { cone0: "130" } },
      "Fix the 2D angles in Settings. [shown]",
      [],
    ],
    [
      "2D angle wrong, 2D not equipped",
      { over: { cone0: "130", "eq-2d": false } },
      " [hidden]",
      PICTURES,
    ],
    [
      "2D angle and down angle",
      { over: { cone0: "130", down0: "160" } },
      "Fix the 2D angles in Settings. [shown]",
      [],
    ],
    [
      "down angle over its limit",
      { over: { down0: "160" } },
      "Fix the DownScan angles in Settings. [shown]",
      [],
    ],
    [
      "down thickness over its limit",
      { over: { dst: "100" } },
      "Fix the DownScan angles in Settings. [shown]",
      [],
    ],
    [
      "down angle wrong, down imaging not equipped",
      { over: { down0: "160", "eq-ds": false } },
      " [hidden]",
      PICTURES,
    ],
    [
      "down angle and live width",
      { over: { down0: "160", atw: "0" } },
      "Fix the DownScan angles in Settings. [shown]",
      [],
    ],
    [
      "live width 0",
      { over: { atw: "0" } },
      "Fix the ActiveTarget 2 settings in Settings. [shown]",
      [],
    ],
    [
      "live width over its limit",
      { over: { atw: "200" } },
      "Fix the ActiveTarget 2 settings in Settings. [shown]",
      [],
    ],
    [
      "live thickness over its limit",
      { over: { att: "100" } },
      "Fix the ActiveTarget 2 settings in Settings. [shown]",
      [],
    ],
    [
      "live range -1",
      { over: { atr: "-1" } },
      "Fix the ActiveTarget 2 settings in Settings. [shown]",
      [],
    ],
    [
      "live range 0",
      { over: { atr: "0" } },
      "Fix the ActiveTarget 2 settings in Settings. [shown]",
      [],
    ],
    [
      "live side mount 95",
      { over: { atsb: "95" } },
      "Fix the ActiveTarget 2 settings in Settings. [shown]",
      [],
    ],
    [
      "live side mount negative",
      { over: { atsb: "-1" } },
      "Fix the ActiveTarget 2 settings in Settings. [shown]",
      [],
    ],
    [
      "live forward mount over its limit",
      { over: { atfa: "91" } },
      "Fix the ActiveTarget 2 settings in Settings. [shown]",
      [],
    ],
    [
      "live wrong, live not equipped",
      { over: { atw: "0", "eq-at": false } },
      " [hidden]",
      PICTURES,
    ],
    ["speed 0 is no message of this section", { over: { sog: "0" } }, " [hidden]", PICTURES],
    [
      "depth of the target negative is no message of this section",
      { over: { zt: "-1" } },
      " [hidden]",
      PICTURES,
    ],
    [
      "Humminbird, side angle",
      { ...HB, over: { side0: "200" } },
      "Fix the Side Imaging settings in Settings. [shown]",
      [],
    ],
    [
      "Humminbird, down angle",
      { ...HB, over: { down0: "160" } },
      "Fix the Down Imaging angles in Settings. [shown]",
      [],
    ],
    [
      "Humminbird, live width",
      { ...HB, over: { atw: "0" } },
      "Fix the MEGA Live 2 settings in Settings. [shown]",
      [],
    ],
    [
      "sv-SE, depth",
      { locale: "sv-SE", over: { dep: "0" } },
      "Fix the depth in Settings. [shown]",
      [],
    ],
  ];

  it.each(cases)("%s", (name, changes, message, others) => {
    const view = compareView(inputOf({ name, ...changes }));
    const shown = view["cmp-serr"];
    expect(shown ? `${shown.text}${shown.hidden ? " [hidden]" : " [shown]"}` : NOT).toBe(message);
    expect(
      Object.keys(view)
        .filter((key) => key !== "cmp-serr")
        .sort(),
    ).toEqual(others);
  });

  it("writes the seven elements of KEYS and no other when nothing is wrong", () => {
    expect(KEYS).toEqual([
      "cmp-serr",
      "ssb-all",
      "allb-res",
      "fp-svg",
      "fp-res",
      "side-svg",
      "side-res",
    ]);
    expect(Object.keys(compareView(inputOf(caseNamed("start")))).sort()).toEqual([...KEYS].sort());
  });

  it("writes what the three views write, and the message beside them", () => {
    const input = inputOf(caseNamed("all beams ticked"));
    expect(compareView(input)).toEqual({
      "cmp-serr": { text: "", hidden: true },
      ...behindView(input),
      ...footprintView(input),
      ...sideView(input),
    });
  });

  it("throws where the footprints throw, at a depth equal to a cone's limit, and the earlier lines throw there too", () => {
    expect(() => compareView(inputOf(caseNamed("depth 305 m, the 2D cones' own limit")))).toThrow(
      new TypeError("Cannot read properties of undefined (reading 'map')"),
    );
  });

  it("stops at the depth before any other check, and a speed or a target depth stops nothing", () => {
    const text = (changes: Omit<Case, "name">): string | undefined =>
      compareView(inputOf({ name: "x", ...changes }))["cmp-serr"]?.text;
    expect(text({ over: { dep: "0", ssr: "0", cone0: "130", down0: "160", atw: "0" } })).toBe(
      "Fix the depth in Settings.",
    );
    expect(text({ over: { sog: "0", zt: "-1" } })).toBe("");
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

/** The section of the page All beams compared is recorded in. */
const SECTION_FILE = "cmp";

/** How the earlier page left one element. */
interface RecordedPatch {
  text?: string;
  html?: string;
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
  ui: { open: Record<string, boolean>; behind: Record<string, boolean> };
  scene3d: Scene3dState;
  theme: Record<string, string>;
}

/**
 * What one task of the page did to a canvas (fixtures/README.md): its log, the
 * earlier pass it equals, or, in a scenario that does not hold everything, the
 * number of entries of its log and the digest of that log.
 */
interface RecordedPass {
  by: string;
  log?: unknown[][];
  repeats?: number;
  entries?: number;
  fnv1a?: string;
  measured?: unknown[];
}

interface RecordedCanvas {
  width: number;
  height: number;
  passes: RecordedPass[];
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
function sectionFile(at: string): RecordedFile | undefined {
  let path = `${at}/${SECTION_FILE}.json`;
  for (let equal = index.omitted[path]; equal !== undefined; equal = index.omitted[path])
    path = equal;
  return existsSync(`${RECORDED}/${path}`) ? read<RecordedFile>(path) : undefined;
}

/** A value of a section file, read where a `same` says it is. */
function resolved<T extends object>(
  at: string,
  key: string,
  held: (file: RecordedFile) => T | Same | undefined,
): T | undefined {
  const first = sectionFile(at);
  let value = first ? held(first) : undefined;
  for (let hops = 0; value !== undefined && "same" in value; hops += 1) {
    if (hops > 2) throw new Error(`${at}, ${key}: more than two "same" in a row`);
    const next = sectionFile(value.same);
    value = next ? held(next) : undefined;
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
 * What a recording started from, read from a file of its own: the scenario of
 * the scheme, since the theme differs between light and dark. A file a section
 * equals holds another scenario.
 */
function scenarioAt(name: string, scheme: string): RecordedScenario {
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
 * A patch of the view as the recorder holds it (fixtures/README.md): a content
 * that was written is held as text and as html, whichever way it was written;
 * and an attribute is held under the name the element has it by, in that
 * name's own case, with its value, so the `viewBox` the view sets on an SVG
 * chart is compared with the recorded one, name and value.
 */
function asRecorded(patch: SectionView[string]): RecordedPatch {
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

/** Whether the earlier page rendered the section: it is open and a sonar is ticked (lines 269 to 271 and 1810). */
const isRendered = (scenario: RecordedScenario): boolean =>
  scenario.ui.open.cmp === true &&
  ["eq-ss", "eq-2d", "eq-ds", "eq-at"].some((id) => scenario.fields[id] === true);

/** What a recording gives the views. */
const inputOfRecording = (scenario: RecordedScenario) => ({
  ...inputFromFields(scenario.fields, scenario.ui.behind, scenario.locale, scenario.theme),
  scene3d: scenario.scene3d,
});

describe("against the recorded page: the footprints", () => {
  it("reads every scenario, in light and dark, two of them in sv-SE", () => {
    expect(SCENARIOS).toHaveLength(168);
    expect(index.schemes).toEqual(["light", "dark"]);
    expect(
      index.scenarios.filter((scenario) => scenario.locale !== "en-US").map((s) => s.locale),
    ).toEqual(["sv-SE", "sv-SE"]);
  });

  it("has recordings with the section rendered, and of those with the views drawn and without", () => {
    const rendered = PAIRS.filter(([name, scheme]) => isRendered(scenarioAt(name, scheme)));
    const drawnOn = rendered.filter(([name, scheme]) => recorded(`${name}/${scheme}`, "fp-svg"));
    expect([PAIRS.length, rendered.length, drawnOn.length]).toEqual([336, 192, 132]);
  });

  describe.each(PAIRS)("%s, %s", (name, scheme) => {
    const at = `${name}/${scheme}`;
    const scenario = scenarioAt(name, scheme);
    const was = {
      "fp-svg": recorded(at, "fp-svg"),
      "fp-res": recorded(at, "fp-res"),
    };

    if (was["fp-svg"] === undefined) {
      it("has no footprints in the recording: the section was not rendered, or Settings stopped it", () => {
        expect(scenario.name).toBe(name);
        expect(was["fp-res"]).toBeUndefined();
      });
      return;
    }

    it("leaves the footprints as the earlier page left them", () => {
      expect(scenario.name).toBe(name);
      const view = footprintView(inputOfRecording(scenario));
      expect(Object.keys(view).sort()).toEqual(["fp-res", "fp-svg"]);
      expect({
        "fp-svg": asRecorded(view["fp-svg"] ?? {}),
        "fp-res": asRecorded(view["fp-res"] ?? {}),
      }).toEqual(was);
    });
  });
});

describe("against the recorded page: the view from behind", () => {
  it("has the view from behind drawn in the same recordings as the footprints", () => {
    const rendered = PAIRS.filter(([name, scheme]) => isRendered(scenarioAt(name, scheme)));
    const drawnOn = rendered.filter(([name, scheme]) => recorded(`${name}/${scheme}`, "ssb-all"));
    expect([PAIRS.length, rendered.length, drawnOn.length]).toEqual([336, 192, 132]);
  });

  describe.each(PAIRS)("%s, %s", (name, scheme) => {
    const at = `${name}/${scheme}`;
    const scenario = scenarioAt(name, scheme);
    const was = {
      "ssb-all": recorded(at, "ssb-all"),
      "allb-res": recorded(at, "allb-res"),
    };

    if (was["ssb-all"] === undefined) {
      it("has no view from behind in the recording: the section was not rendered, or Settings stopped it", () => {
        expect(scenario.name).toBe(name);
        expect(was["allb-res"]).toBeUndefined();
      });
      return;
    }

    it("leaves the view from behind as the earlier page left it", () => {
      expect(scenario.name).toBe(name);
      const view = behindView(inputOfRecording(scenario));
      expect(Object.keys(view).sort()).toEqual(["allb-res", "ssb-all"]);
      expect({
        "ssb-all": asRecorded(view["ssb-all"] ?? {}),
        "allb-res": asRecorded(view["allb-res"] ?? {}),
      }).toEqual(was);
    });
  });
});

describe("against the recorded page: the side view", () => {
  it("has the side view drawn in the same recordings as the footprints", () => {
    const rendered = PAIRS.filter(([name, scheme]) => isRendered(scenarioAt(name, scheme)));
    const drawnOn = rendered.filter(([name, scheme]) => recorded(`${name}/${scheme}`, "side-svg"));
    expect([PAIRS.length, rendered.length, drawnOn.length]).toEqual([336, 192, 132]);
  });

  describe.each(PAIRS)("%s, %s", (name, scheme) => {
    const at = `${name}/${scheme}`;
    const scenario = scenarioAt(name, scheme);
    const was = {
      "side-svg": recorded(at, "side-svg"),
      "side-res": recorded(at, "side-res"),
    };

    if (was["side-svg"] === undefined) {
      it("has no side view in the recording: the section was not rendered, or Settings stopped it", () => {
        expect(scenario.name).toBe(name);
        expect(was["side-res"]).toBeUndefined();
      });
      return;
    }

    it("leaves the side view as the earlier page left it", () => {
      expect(scenario.name).toBe(name);
      const view = sideView(inputOfRecording(scenario));
      expect(Object.keys(view).sort()).toEqual(["side-res", "side-svg"]);
      expect({
        "side-svg": asRecorded(view["side-svg"] ?? {}),
        "side-res": asRecorded(view["side-res"] ?? {}),
      }).toEqual(was);
    });
  });
});

describe("against the recorded page: the 3D view", () => {
  const CANVAS = "b3d";

  it("has the 3D view drawn in the same recordings as the footprints, in whole and as digests", () => {
    const rendered = PAIRS.filter(([name, scheme]) => isRendered(scenarioAt(name, scheme)));
    const drawnOn = rendered.filter(([name, scheme]) =>
      recordedCanvas(`${name}/${scheme}`, CANVAS),
    );
    const passes = drawnOn.flatMap(
      ([name, scheme]) => recordedCanvas(`${name}/${scheme}`, CANVAS)?.passes ?? [],
    );
    expect([PAIRS.length, rendered.length, drawnOn.length]).toEqual([336, 192, 132]);
    expect([
      passes.length,
      passes.filter((pass) => pass.log !== undefined).length,
      passes.filter((pass) => pass.fnv1a !== undefined).length,
      passes.filter((pass) => pass.repeats !== undefined).length,
    ]).toEqual([264, 18, 114, 132]);
  });

  describe.each(PAIRS)("%s, %s", (name, scheme) => {
    const at = `${name}/${scheme}`;
    const scenario = scenarioAt(name, scheme);
    const canvas = recordedCanvas(at, CANVAS);

    if (canvas === undefined) {
      it("has no 3D view in the recording: the section was not rendered, or Settings stopped it", () => {
        expect(scenario.name).toBe(name);
        expect(recorded(at, "side-svg")).toBeUndefined();
      });
      return;
    }

    it("draws the 3D view as the earlier page drew it, entry for entry or by its digest", () => {
      const input = inputOfRecording(scenario);
      const { surface, log } = recordingSurface(canvas.width, canvas.height);
      // The earlier page fills a footprint from its first corner (`fanTriangles`); the page now fills it exactly, so this test asks for the earlier fill and proves that nothing else in the drawing has changed.
      paintScene(surface, buildScene(input, fanTriangles), input);
      expect([canvas.width, canvas.height]).toEqual([B3D.width, B3D.height]);
      expect(canvas.passes.length).toBeGreaterThan(0);
      for (const pass of canvas.passes) {
        if (pass.repeats !== undefined) {
          // A pass that equals an earlier one, which is drawn above.
          expect(canvas.passes[pass.repeats]?.repeats).toBeUndefined();
        } else if (pass.log !== undefined) expect(log).toEqual(pass.log);
        else {
          expect(pass.entries).toBe(log.length);
          expect(pass.fnv1a).toBe(fnv1a(JSON.stringify(log)));
          expect(pass.measured).toEqual([]);
        }
      }
    });
  });
});

describe("against the recorded page: the message and the section as one", () => {
  it("has the message in every recording with the section rendered, shown in 60 of them", () => {
    const rendered = PAIRS.filter(([name, scheme]) => isRendered(scenarioAt(name, scheme)));
    const shown = rendered.filter(
      ([name, scheme]) => recorded(`${name}/${scheme}`, "cmp-serr")?.hidden === false,
    );
    expect(rendered.every(([name, scheme]) => recorded(`${name}/${scheme}`, "cmp-serr"))).toBe(
      true,
    );
    expect([rendered.length, shown.length]).toEqual([192, 60]);
    expect(
      [
        ...new Set(shown.map(([name, scheme]) => recorded(`${name}/${scheme}`, "cmp-serr")?.text)),
      ].sort(),
    ).toEqual([
      "Fix the 2D angles in Settings.",
      "Fix the ActiveTarget 2 settings in Settings.",
      "Fix the DownScan angles in Settings.",
      "Fix the SideScan settings in Settings.",
      "Fix the depth in Settings.",
    ]);
  });

  describe.each(PAIRS)("%s, %s", (name, scheme) => {
    const at = `${name}/${scheme}`;
    const scenario = scenarioAt(name, scheme);

    if (!isRendered(scenario)) {
      it("did not render the section: no element of KEYS was written", () => {
        expect(scenario.name).toBe(name);
        for (const key of KEYS) expect(recorded(at, key)).toBeUndefined();
      });
      return;
    }

    it("leaves the elements of KEYS as the earlier page left them, and writes no other", () => {
      expect(scenario.name).toBe(name);
      const view = compareView(inputOfRecording(scenario));
      const left = Object.fromEntries(
        Object.entries(view).map(([key, patch]) => [key, asRecorded(patch)]),
      );
      const was = Object.fromEntries(
        KEYS.flatMap((key) => {
          const patch = recorded(at, key);
          return patch ? [[key, patch]] : [];
        }),
      );
      expect(left).toEqual(was);
    });
  });
});
