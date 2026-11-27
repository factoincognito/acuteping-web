/**
 * Distance behind the boat against the earlier page (legacy/src/p2.js, lines
 * 1770 to 1794), in two ways. The expected values of the first part were
 * printed by those lines themselves, run unchanged in Node against a stand-in
 * for the page's elements, once in en-US and once in sv-SE. The second part
 * compares what the view writes with what the earlier page wrote when it was
 * recorded in a browser (`fixtures/legacy/`), in every scenario of the set.
 */
import { behindView, KEYS } from "./behind";
import { createFormatter } from "./format";
import { equipment, num, parseSettings } from "./settings";
import { combined, livePreset, namesOf, THICKNESS } from "./transducers";
import type { ElementPatch, RawFields, SavedValue, SectionView, UiState } from "./types";

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
    tscr: "20",
    frac: "50",
  };
  for (const [i, c] of p.cone.entries()) fields[`cone${i}`] = String(c.a);
  for (const [i, c] of p.down.entries()) fields[`down${i}`] = String(c.a);
  for (const [i, c] of p.side.entries()) fields[`side${i}`] = String(c.a);
  return { ...fields, ...over };
}

/** The number fields of the section's own, which the shell reads as `num()` does. */
const LOCAL_NUMBERS = ["tscr", "frac"] as const;

/** What the view gets for a page with the given fields and screen, in a locale. */
function inputOf(fields: RawFields, db: string, locale: string) {
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
    ui: { db },
    names: namesOf(first, live),
    local,
    fmt: createFormatter(locale),
  };
}

/** What a row changes of the page as it starts. */
interface Over {
  locale?: string;
  /** The screen the visitor chose: `ui.db`. */
  db?: string;
  /** The tick boxes of side imaging, 2D and down imaging. */
  ss?: boolean;
  d2?: boolean;
  ds?: boolean;
  sog?: string;
  sogu?: string;
  tscr?: string;
  frac?: string;
  /** The names of the side and down imaging, as the legacy `N` has them. */
  side?: string;
  down?: string;
}

/** The view of the page as it starts, with the changes of a row. */
function viewOf(o: Over = {}): SectionView {
  const fields = fieldsOf({
    "eq-ss": o.ss ?? true,
    "eq-2d": o.d2 ?? true,
    "eq-ds": o.ds ?? true,
    sog: o.sog ?? "2",
    sogu: o.sogu ?? "kn",
    tscr: o.tscr ?? "20",
    frac: o.frac ?? "50",
  });
  const input = inputOf(fields, o.db ?? "ss", o.locale ?? "en-US");
  const names = { side: o.side ?? "SideScan", down: o.down ?? "DownScan" };
  return behindView({ ...input, names });
}

/** What stands for an element the view does not write. */
const NOT = "(not written)";

/** What was written to one element, as one line: `t:` its text, whether it is hidden, and its attributes. */
function told(p: ElementPatch | undefined): string {
  if (p === undefined) return NOT;
  const parts: string[] = [];
  if (p.text !== undefined) parts.push(`t:${p.text}`);
  if (p.html !== undefined) parts.push(`h:${p.html}`);
  if (p.hidden !== undefined) parts.push(p.hidden ? "[hidden]" : "[shown]");
  if (p.attrs !== undefined) {
    const attrs = Object.entries(p.attrs).sort(([a], [b]) => (a < b ? -1 : 1));
    parts.push(`{${attrs.map(([name, value]) => `${name}=${value}`).join(",")}}`);
  }
  return parts.join(" ");
}

/** The elements a row tells, in the order of its expected values. */
const TOLD = [
  "dbt > button:nth-child(1)",
  "dbt > button:nth-child(2)",
  "frac-l",
  "frac-hint",
  "sw-hint",
  "db-err",
  "db-out",
  "db-t",
  "db-v",
] as const;

/** What the view writes to each of the elements of `TOLD`, as `told` tells it. */
const toldOf = (view: SectionView): string[] => TOLD.map((key) => told(view[key]));

/** A text longer than this is told by its start, its length and its digest. */
const SHORT = 40;

const shorten = (s: string): string =>
  s.length > SHORT ? `${s.slice(0, 12)}…${s.length}:${fnv1a(s)}` : s;

/**
 * What the view writes as one line: which of the two screens is pressed, the
 * label of the position, the start of the digests of the two hints, the
 * message and whether it is shown, and the three results.
 */
function gist(view: SectionView): string {
  const pressed = [1, 2]
    .map((i) => view[`dbt > button:nth-child(${i})`]?.attrs?.["aria-pressed"])
    .join("/");
  const text = (key: string): string => {
    const t = view[key]?.text;
    return t === undefined ? NOT : shorten(t);
  };
  const raw = (key: string): string => view[key]?.text ?? NOT;
  const err = view["db-err"];
  return [
    pressed,
    text("frac-l"),
    `${fnv1a(raw("frac-hint")).slice(0, 4)}${fnv1a(raw("sw-hint")).slice(0, 4)}`,
    err ? `${err.text}${err.hidden ? " [hidden]" : " [shown]"}` : NOT,
    text("db-out"),
    text("db-t"),
    text("db-v"),
  ].join(" | ");
}

// ---------------------------------------------------------------------------
// The first part: against the earlier lines run in Node
// ---------------------------------------------------------------------------

describe("what the module names", () => {
  it("lists the elements the view writes", () => {
    expect(KEYS).toEqual([
      "dbt > button:nth-child(1)",
      "dbt > button:nth-child(2)",
      "frac-l",
      "frac-hint",
      "sw-hint",
      "db-err",
      "db-out",
      "db-t",
      "db-v",
    ]);
  });
});

/** The first two elements of a row: the side screen pressed, or the 2D or down screen. */
const SIDE_PRESSED = ["{aria-pressed=true}", "{aria-pressed=false}"];
const FLAT_PRESSED = ["{aria-pressed=false}", "{aria-pressed=true}"];

/** The hint under the stopwatch, for each of the two screens; it names no sonar. */
const STOPWATCH_SIDE =
  "t:Tap Start when a mark enters at the top edge, and Stop when it leaves the bottom edge. The time is filled in above. Measure again after changing range, depth or ping speed.";
const STOPWATCH_FLAT =
  "t:Tap Start when a mark enters at the right edge, and Stop when it leaves the left edge. The time is filled in above. Measure again after changing range, depth or ping speed.";

/** The label, the hint and the stopwatch hint of the side screen, with the name of side imaging as the Lowrance preset has it. */
const SIDE_TEXTS = [
  "t:Echo's distance from the top edge",
  "t:On the SideScan screen the newest ping is at the top. Halfway down is 50%, the bottom edge is 100%. Combine the result with the true horizontal distance from the SideScan section to get where the echo lies.",
  STOPWATCH_SIDE,
];

/** The same for the 2D or down screen. */
const FLAT_TEXTS = [
  "t:Echo's distance from the right edge",
  "t:On 2D and DownScan the newest ping is at the right edge. Halfway across is 50%, the left edge is 100%.",
  STOPWATCH_FLAT,
];

/** The same as `SIDE_TEXTS` with the names another brand has. */
const SIDE_TEXTS_IMAGING = [
  "t:Echo's distance from the top edge",
  "t:On the Side Imaging screen the newest ping is at the top. Halfway down is 50%, the bottom edge is 100%. Combine the result with the true horizontal distance from the Side Imaging section to get where the echo lies.",
  STOPWATCH_SIDE,
];

/** The same as `FLAT_TEXTS` with the names another brand has. */
const FLAT_TEXTS_IMAGING = [
  "t:Echo's distance from the right edge",
  "t:On 2D and Down Imaging the newest ping is at the right edge. Halfway across is 50%, the left edge is 100%.",
  STOPWATCH_FLAT,
];

/** The three results of a row that has none: a dash each. */
const DASHES = ["t:—", "t:—", "t:—"];

/** The message element without a message. */
const NO_ERR = "t: [hidden]";

type Told = readonly [string, Over, readonly string[]];

describe("what the section writes, element by element", () => {
  const rows: readonly Told[] = [
    [
      'screen "ss", all',
      { db: "ss", ss: true, d2: true, ds: true },
      [...SIDE_PRESSED, ...SIDE_TEXTS, NO_ERR, "t:10.3 m back", "t:10.0 s ago", "t:1.03 m/s"],
    ],
    [
      'screen "ss", 2d only',
      { db: "ss", ss: false, d2: true, ds: false },
      [...FLAT_PRESSED, ...FLAT_TEXTS, NO_ERR, "t:10.3 m back", "t:10.0 s ago", "t:1.03 m/s"],
    ],
    [
      'screen "vs", ss only',
      { db: "vs", ss: true, d2: false, ds: false },
      [...SIDE_PRESSED, ...SIDE_TEXTS, NO_ERR, "t:10.3 m back", "t:10.0 s ago", "t:1.03 m/s"],
    ],
    [
      'time "0.1"',
      { tscr: "0.1" },
      [...SIDE_PRESSED, ...SIDE_TEXTS, NO_ERR, "t:0.05 m back", "t:0.05 s ago", "t:1.03 m/s"],
    ],
    [
      'time "0"',
      { tscr: "0" },
      [...SIDE_PRESSED, ...SIDE_TEXTS, "t:Enter the crossing time in seconds. [shown]", ...DASHES],
    ],
    [
      'time "abc"',
      { tscr: "abc" },
      [...SIDE_PRESSED, ...SIDE_TEXTS, "t:Enter the crossing time in seconds. [shown]", ...DASHES],
    ],
    [
      'position "0"',
      { frac: "0" },
      [...SIDE_PRESSED, ...SIDE_TEXTS, NO_ERR, "t:0.00 m back", "t:0.00 s ago", "t:1.03 m/s"],
    ],
    [
      'position "100"',
      { frac: "100" },
      [...SIDE_PRESSED, ...SIDE_TEXTS, NO_ERR, "t:20.6 m back", "t:20.0 s ago", "t:1.03 m/s"],
    ],
    [
      'position "100.1"',
      { frac: "100.1" },
      [...SIDE_PRESSED, ...SIDE_TEXTS, "t:Enter a position from 0 to 100%. [shown]", ...DASHES],
    ],
    [
      'position "-1"',
      { frac: "-1" },
      [...SIDE_PRESSED, ...SIDE_TEXTS, "t:Enter a position from 0 to 100%. [shown]", ...DASHES],
    ],
    [
      'speed "0" kn',
      { sog: "0", sogu: "kn" },
      [...SIDE_PRESSED, ...SIDE_TEXTS, "t:Enter a speed in Settings. [shown]", ...DASHES],
    ],
    [
      'speed "5.5" kn',
      { sog: "5.5", sogu: "kn" },
      [...SIDE_PRESSED, ...SIDE_TEXTS, NO_ERR, "t:28.3 m back", "t:10.0 s ago", "t:2.83 m/s"],
    ],
    [
      'speed "1e308" kn',
      { sog: "1e308", sogu: "kn" },
      [...SIDE_PRESSED, ...SIDE_TEXTS, NO_ERR, "t:— m back", "t:10.0 s ago", "t:∞ m/s"],
    ],
    [
      "sv-SE, time 7,3, position 33,3, speed 3,5",
      { locale: "sv-SE", tscr: "7,3", frac: "33,3", sog: "3,5" },
      [...SIDE_PRESSED, ...SIDE_TEXTS, NO_ERR, "t:4,4 m back", "t:2,4 s ago", "t:1,80 m/s"],
    ],
    [
      "sv-SE, time 20, position 50, speed 2",
      { locale: "sv-SE", tscr: "20", frac: "50", sog: "2" },
      [...SIDE_PRESSED, ...SIDE_TEXTS, NO_ERR, "t:10,3 m back", "t:10,0 s ago", "t:1,03 m/s"],
    ],
    [
      "sv-SE, time 0,1, position 100, speed 0,01",
      { locale: "sv-SE", tscr: "0,1", frac: "100", sog: "0,01" },
      [...SIDE_PRESSED, ...SIDE_TEXTS, NO_ERR, "t:0,00 m back", "t:0,10 s ago", "t:0,01 m/s"],
    ],
    [
      "sv-SE, time x, position 50, speed 2",
      { locale: "sv-SE", tscr: "x", frac: "50", sog: "2" },
      [...SIDE_PRESSED, ...SIDE_TEXTS, "t:Enter the crossing time in seconds. [shown]", ...DASHES],
    ],
    [
      "sv-SE, time 20, position 101, speed 2",
      { locale: "sv-SE", tscr: "20", frac: "101", sog: "2" },
      [...SIDE_PRESSED, ...SIDE_TEXTS, "t:Enter a position from 0 to 100%. [shown]", ...DASHES],
    ],
    [
      "sv-SE, time 20, position 50, speed 0",
      { locale: "sv-SE", tscr: "20", frac: "50", sog: "0" },
      [...SIDE_PRESSED, ...SIDE_TEXTS, "t:Enter a speed in Settings. [shown]", ...DASHES],
    ],
    [
      "other names, screen ss",
      { db: "ss", side: "Side Imaging", down: "Down Imaging" },
      [
        ...SIDE_PRESSED,
        ...SIDE_TEXTS_IMAGING,
        NO_ERR,
        "t:10.3 m back",
        "t:10.0 s ago",
        "t:1.03 m/s",
      ],
    ],
    [
      "other names, screen vs",
      { db: "vs", side: "Side Imaging", down: "Down Imaging" },
      [
        ...FLAT_PRESSED,
        ...FLAT_TEXTS_IMAGING,
        NO_ERR,
        "t:10.3 m back",
        "t:10.0 s ago",
        "t:1.03 m/s",
      ],
    ],
    [
      "ice-cold: time 20, position 50 at 25 km/h",
      { sog: "25", sogu: "kmh" },
      [...SIDE_PRESSED, ...SIDE_TEXTS, NO_ERR, "t:69.4 m back", "t:10.0 s ago", "t:6.94 m/s"],
    ],
  ];

  it.each(rows)("%s", (_label, over, expected) => {
    const view = viewOf(over);
    expect(toldOf(view)).toEqual(expected);
    expect(Object.keys(view).filter((key) => !(KEYS as readonly string[]).includes(key))).toEqual(
      [],
    );
  });
});

describe("what the section writes, as one line for each row", () => {
  const rows: readonly (readonly [string, Over, string])[] = [
    [
      'screen "ss", ss only',
      { db: "ss", ss: true, d2: false, ds: false },
      "true/false | Echo's distance from the top edge | 9987803a |  [hidden] | 10.3 m back | 10.0 s ago | 1.03 m/s",
    ],
    [
      'screen "ss", ds only',
      { db: "ss", ss: false, d2: false, ds: true },
      "false/true | Echo's distance from the right edge | 7351259a |  [hidden] | 10.3 m back | 10.0 s ago | 1.03 m/s",
    ],
    [
      'screen "ss", 2d and ds',
      { db: "ss", ss: false, d2: true, ds: true },
      "false/true | Echo's distance from the right edge | 7351259a |  [hidden] | 10.3 m back | 10.0 s ago | 1.03 m/s",
    ],
    [
      'screen "ss", none',
      { db: "ss", ss: false, d2: false, ds: false },
      "true/false | Echo's distance from the top edge | 9987803a |  [hidden] | 10.3 m back | 10.0 s ago | 1.03 m/s",
    ],
    [
      'screen "ss", ss and 2d',
      { db: "ss", ss: true, d2: true, ds: false },
      "true/false | Echo's distance from the top edge | 9987803a |  [hidden] | 10.3 m back | 10.0 s ago | 1.03 m/s",
    ],
    [
      'screen "ss", ss and ds',
      { db: "ss", ss: true, d2: false, ds: true },
      "true/false | Echo's distance from the top edge | 9987803a |  [hidden] | 10.3 m back | 10.0 s ago | 1.03 m/s",
    ],
    [
      'screen "vs", all',
      { db: "vs", ss: true, d2: true, ds: true },
      "false/true | Echo's distance from the right edge | 7351259a |  [hidden] | 10.3 m back | 10.0 s ago | 1.03 m/s",
    ],
    [
      'screen "vs", 2d only',
      { db: "vs", ss: false, d2: true, ds: false },
      "false/true | Echo's distance from the right edge | 7351259a |  [hidden] | 10.3 m back | 10.0 s ago | 1.03 m/s",
    ],
    [
      'screen "vs", ds only',
      { db: "vs", ss: false, d2: false, ds: true },
      "false/true | Echo's distance from the right edge | 7351259a |  [hidden] | 10.3 m back | 10.0 s ago | 1.03 m/s",
    ],
    [
      'screen "vs", 2d and ds',
      { db: "vs", ss: false, d2: true, ds: true },
      "false/true | Echo's distance from the right edge | 7351259a |  [hidden] | 10.3 m back | 10.0 s ago | 1.03 m/s",
    ],
    [
      'screen "vs", none',
      { db: "vs", ss: false, d2: false, ds: false },
      "true/false | Echo's distance from the top edge | 9987803a |  [hidden] | 10.3 m back | 10.0 s ago | 1.03 m/s",
    ],
    [
      'screen "vs", ss and 2d',
      { db: "vs", ss: true, d2: true, ds: false },
      "false/true | Echo's distance from the right edge | 7351259a |  [hidden] | 10.3 m back | 10.0 s ago | 1.03 m/s",
    ],
    [
      'screen "vs", ss and ds',
      { db: "vs", ss: true, d2: false, ds: true },
      "false/true | Echo's distance from the right edge | 7351259a |  [hidden] | 10.3 m back | 10.0 s ago | 1.03 m/s",
    ],
    [
      'screen "xx", all',
      { db: "xx", ss: true, d2: true, ds: true },
      "false/false | Echo's distance from the right edge | 7351259a |  [hidden] | 10.3 m back | 10.0 s ago | 1.03 m/s",
    ],
    [
      'screen "xx", ss only',
      { db: "xx", ss: true, d2: false, ds: false },
      "false/false | Echo's distance from the right edge | 7351259a |  [hidden] | 10.3 m back | 10.0 s ago | 1.03 m/s",
    ],
    [
      'screen "xx", 2d only',
      { db: "xx", ss: false, d2: true, ds: false },
      "false/false | Echo's distance from the right edge | 7351259a |  [hidden] | 10.3 m back | 10.0 s ago | 1.03 m/s",
    ],
    [
      'screen "xx", ds only',
      { db: "xx", ss: false, d2: false, ds: true },
      "false/false | Echo's distance from the right edge | 7351259a |  [hidden] | 10.3 m back | 10.0 s ago | 1.03 m/s",
    ],
    [
      'screen "xx", 2d and ds',
      { db: "xx", ss: false, d2: true, ds: true },
      "false/false | Echo's distance from the right edge | 7351259a |  [hidden] | 10.3 m back | 10.0 s ago | 1.03 m/s",
    ],
    [
      'screen "xx", none',
      { db: "xx", ss: false, d2: false, ds: false },
      "false/false | Echo's distance from the right edge | 7351259a |  [hidden] | 10.3 m back | 10.0 s ago | 1.03 m/s",
    ],
    [
      'screen "xx", ss and 2d',
      { db: "xx", ss: true, d2: true, ds: false },
      "false/false | Echo's distance from the right edge | 7351259a |  [hidden] | 10.3 m back | 10.0 s ago | 1.03 m/s",
    ],
    [
      'screen "xx", ss and ds',
      { db: "xx", ss: true, d2: false, ds: true },
      "false/false | Echo's distance from the right edge | 7351259a |  [hidden] | 10.3 m back | 10.0 s ago | 1.03 m/s",
    ],
    [
      'screen "", all',
      { db: "", ss: true, d2: true, ds: true },
      "false/false | Echo's distance from the right edge | 7351259a |  [hidden] | 10.3 m back | 10.0 s ago | 1.03 m/s",
    ],
    [
      'screen "", ss only',
      { db: "", ss: true, d2: false, ds: false },
      "false/false | Echo's distance from the right edge | 7351259a |  [hidden] | 10.3 m back | 10.0 s ago | 1.03 m/s",
    ],
    [
      'screen "", 2d only',
      { db: "", ss: false, d2: true, ds: false },
      "false/false | Echo's distance from the right edge | 7351259a |  [hidden] | 10.3 m back | 10.0 s ago | 1.03 m/s",
    ],
    [
      'screen "", ds only',
      { db: "", ss: false, d2: false, ds: true },
      "false/false | Echo's distance from the right edge | 7351259a |  [hidden] | 10.3 m back | 10.0 s ago | 1.03 m/s",
    ],
    [
      'screen "", 2d and ds',
      { db: "", ss: false, d2: true, ds: true },
      "false/false | Echo's distance from the right edge | 7351259a |  [hidden] | 10.3 m back | 10.0 s ago | 1.03 m/s",
    ],
    [
      'screen "", none',
      { db: "", ss: false, d2: false, ds: false },
      "false/false | Echo's distance from the right edge | 7351259a |  [hidden] | 10.3 m back | 10.0 s ago | 1.03 m/s",
    ],
    [
      'screen "", ss and 2d',
      { db: "", ss: true, d2: true, ds: false },
      "false/false | Echo's distance from the right edge | 7351259a |  [hidden] | 10.3 m back | 10.0 s ago | 1.03 m/s",
    ],
    [
      'screen "", ss and ds',
      { db: "", ss: true, d2: false, ds: true },
      "false/false | Echo's distance from the right edge | 7351259a |  [hidden] | 10.3 m back | 10.0 s ago | 1.03 m/s",
    ],
    [
      'time "20"',
      { tscr: "20" },
      "true/false | Echo's distance from the top edge | 9987803a |  [hidden] | 10.3 m back | 10.0 s ago | 1.03 m/s",
    ],
    [
      'time "1e-300"',
      { tscr: "1e-300" },
      "true/false | Echo's distance from the top edge | 9987803a |  [hidden] | 0.00 m back | 0.00 s ago | 1.03 m/s",
    ],
    [
      'time "-1"',
      { tscr: "-1" },
      "true/false | Echo's distance from the top edge | 9987803a | Enter the crossing time in seconds. [shown] | — | — | —",
    ],
    [
      'time ""',
      { tscr: "" },
      "true/false | Echo's distance from the top edge | 9987803a | Enter the crossing time in seconds. [shown] | — | — | —",
    ],
    [
      'time "1e308"',
      { tscr: "1e308" },
      "true/false | Echo's distance from the top edge | 9987803a |  [hidden] | — m back | — s ago | 1.03 m/s",
    ],
    [
      'time "20,5"',
      { tscr: "20,5" },
      "true/false | Echo's distance from the top edge | 9987803a |  [hidden] | 10.5 m back | 10.3 s ago | 1.03 m/s",
    ],
    [
      'time "1e-320"',
      { tscr: "1e-320" },
      "true/false | Echo's distance from the top edge | 9987803a |  [hidden] | 0.00 m back | 0.00 s ago | 1.03 m/s",
    ],
    [
      'time "Infinity"',
      { tscr: "Infinity" },
      "true/false | Echo's distance from the top edge | 9987803a | Enter the crossing time in seconds. [shown] | — | — | —",
    ],
    [
      'time "0x14"',
      { tscr: "0x14" },
      "true/false | Echo's distance from the top edge | 9987803a |  [hidden] | 10.3 m back | 10.0 s ago | 1.03 m/s",
    ],
    [
      'time " 7 "',
      { tscr: " 7 " },
      "true/false | Echo's distance from the top edge | 9987803a |  [hidden] | 3.6 m back | 3.5 s ago | 1.03 m/s",
    ],
    [
      'position "100.00000000000001"',
      { frac: "100.00000000000001" },
      "true/false | Echo's distance from the top edge | 9987803a | Enter a position from 0 to 100%. [shown] | — | — | —",
    ],
    [
      'position "-1e-300"',
      { frac: "-1e-300" },
      "true/false | Echo's distance from the top edge | 9987803a | Enter a position from 0 to 100%. [shown] | — | — | —",
    ],
    [
      'position "-0"',
      { frac: "-0" },
      "true/false | Echo's distance from the top edge | 9987803a |  [hidden] | -0.00 m back | -0.00 s ago | 1.03 m/s",
    ],
    [
      'position "0.1"',
      { frac: "0.1" },
      "true/false | Echo's distance from the top edge | 9987803a |  [hidden] | 0.02 m back | 0.02 s ago | 1.03 m/s",
    ],
    [
      'position "33.33"',
      { frac: "33.33" },
      "true/false | Echo's distance from the top edge | 9987803a |  [hidden] | 6.9 m back | 6.7 s ago | 1.03 m/s",
    ],
    [
      'position "66.67"',
      { frac: "66.67" },
      "true/false | Echo's distance from the top edge | 9987803a |  [hidden] | 13.7 m back | 13.3 s ago | 1.03 m/s",
    ],
    [
      'position ""',
      { frac: "" },
      "true/false | Echo's distance from the top edge | 9987803a | Enter a position from 0 to 100%. [shown] | — | — | —",
    ],
    [
      'position "abc"',
      { frac: "abc" },
      "true/false | Echo's distance from the top edge | 9987803a | Enter a position from 0 to 100%. [shown] | — | — | —",
    ],
    [
      'position "1e2"',
      { frac: "1e2" },
      "true/false | Echo's distance from the top edge | 9987803a |  [hidden] | 20.6 m back | 20.0 s ago | 1.03 m/s",
    ],
    [
      'position "99.99999999999999"',
      { frac: "99.99999999999999" },
      "true/false | Echo's distance from the top edge | 9987803a |  [hidden] | 20.6 m back | 20.0 s ago | 1.03 m/s",
    ],
    // The four one-decimal pairs of the page's own inputs (of 1.2 million tried) in which the product over
    // 100 and the product times 0.01 differ in the last place and so in the second decimal of the time.
    [
      "time 4.1, position 15",
      { tscr: "4.1", frac: "15" },
      "true/false | Echo's distance from the top edge | 9987803a |  [hidden] | 0.63 m back | 0.61 s ago | 1.03 m/s",
    ],
    [
      "time 8.2, position 7.5",
      { tscr: "8.2", frac: "7.5" },
      "true/false | Echo's distance from the top edge | 9987803a |  [hidden] | 0.63 m back | 0.61 s ago | 1.03 m/s",
    ],
    [
      "time 7.5, position 8.2",
      { tscr: "7.5", frac: "8.2" },
      "true/false | Echo's distance from the top edge | 9987803a |  [hidden] | 0.63 m back | 0.61 s ago | 1.03 m/s",
    ],
    [
      "time 15, position 4.1",
      { tscr: "15", frac: "4.1" },
      "true/false | Echo's distance from the top edge | 9987803a |  [hidden] | 0.63 m back | 0.61 s ago | 1.03 m/s",
    ],
    [
      "time 4.1, position 15 at 5.5 kn",
      { tscr: "4.1", frac: "15", sog: "5.5" },
      "true/false | Echo's distance from the top edge | 9987803a |  [hidden] | 1.7 m back | 0.61 s ago | 2.83 m/s",
    ],
    // Typed values (one decimal) found by a search of 29 million pairs and 333 million cases: the time
    // divided by the reciprocal of the position, and the speed divided by the reciprocal of the time, each
    // change the last place and so the text of these rows.
    [
      "time 0.3, position 5",
      { tscr: "0.3", frac: "5" },
      "true/false | Echo's distance from the top edge | 9987803a |  [hidden] | 0.02 m back | 0.02 s ago | 1.03 m/s",
    ],
    [
      "time 0.5, position 99",
      { tscr: "0.5", frac: "99" },
      "true/false | Echo's distance from the top edge | 9987803a |  [hidden] | 0.51 m back | 0.50 s ago | 1.03 m/s",
    ],
    [
      "time 25.2, position 100 at 12.5 kn",
      { tscr: "25.2", frac: "100", sog: "12.5" },
      "true/false | Echo's distance from the top edge | 9987803a |  [hidden] | 162.0 m back | 25.2 s ago | 6.43 m/s",
    ],
    [
      "time 25, position 75 at 16.8 kn",
      { tscr: "25", frac: "75", sog: "16.8" },
      "true/false | Echo's distance from the top edge | 9987803a |  [hidden] | 162.1 m back | 18.8 s ago | 8.64 m/s",
    ],
    // Review round 2: a search over every typed time (two decimals, 0.01 to 200), position (two decimals, 0 to 100) and
    // speed (one decimal, in knots and in km/h) for every order of `(T * p) / 100` and of `a.ms * t` (26 and 404
    // orders, none of them a power of two): the rows above tell 418 of the 430 that a typed input tells apart, and
    // these three the other 12.
    [
      "time 40, position 94.5 at 25 kn",
      { tscr: "40", frac: "94.5", sog: "25" },
      "true/false | Echo's distance from the top edge | 9987803a |  [hidden] | 486.1 m back | 37.8 s ago | 12.86 m/s",
    ],
    [
      "time 0.11, position 50",
      { tscr: "0.11", frac: "50" },
      "true/false | Echo's distance from the top edge | 9987803a |  [hidden] | 0.06 m back | 0.06 s ago | 1.03 m/s",
    ],
    [
      "time 37.5, position 48 at 7.5 kn",
      { tscr: "37.5", frac: "48", sog: "7.5" },
      "true/false | Echo's distance from the top edge | 9987803a |  [hidden] | 69.5 m back | 18.0 s ago | 3.86 m/s",
    ],
    [
      'position "50,5"',
      { frac: "50,5" },
      "true/false | Echo's distance from the top edge | 9987803a |  [hidden] | 10.4 m back | 10.1 s ago | 1.03 m/s",
    ],
    [
      'speed "0" kmh',
      { sog: "0", sogu: "kmh" },
      "true/false | Echo's distance from the top edge | 9987803a | Enter a speed in Settings. [shown] | — | — | —",
    ],
    [
      'speed "-1" kn',
      { sog: "-1", sogu: "kn" },
      "true/false | Echo's distance from the top edge | 9987803a | Enter a speed in Settings. [shown] | — | — | —",
    ],
    [
      'speed "-1" kmh',
      { sog: "-1", sogu: "kmh" },
      "true/false | Echo's distance from the top edge | 9987803a | Enter a speed in Settings. [shown] | — | — | —",
    ],
    [
      'speed "" kn',
      { sog: "", sogu: "kn" },
      "true/false | Echo's distance from the top edge | 9987803a | Enter a speed in Settings. [shown] | — | — | —",
    ],
    [
      'speed "" kmh',
      { sog: "", sogu: "kmh" },
      "true/false | Echo's distance from the top edge | 9987803a | Enter a speed in Settings. [shown] | — | — | —",
    ],
    [
      'speed "abc" kn',
      { sog: "abc", sogu: "kn" },
      "true/false | Echo's distance from the top edge | 9987803a | Enter a speed in Settings. [shown] | — | — | —",
    ],
    [
      'speed "abc" kmh',
      { sog: "abc", sogu: "kmh" },
      "true/false | Echo's distance from the top edge | 9987803a | Enter a speed in Settings. [shown] | — | — | —",
    ],
    [
      'speed "0.01" kn',
      { sog: "0.01", sogu: "kn" },
      "true/false | Echo's distance from the top edge | 9987803a |  [hidden] | 0.05 m back | 10.0 s ago | 0.01 m/s",
    ],
    [
      'speed "0.01" kmh',
      { sog: "0.01", sogu: "kmh" },
      "true/false | Echo's distance from the top edge | 9987803a |  [hidden] | 0.03 m back | 10.0 s ago | 0.00 m/s",
    ],
    [
      'speed "1" kn',
      { sog: "1", sogu: "kn" },
      "true/false | Echo's distance from the top edge | 9987803a |  [hidden] | 5.1 m back | 10.0 s ago | 0.51 m/s",
    ],
    [
      'speed "1" kmh',
      { sog: "1", sogu: "kmh" },
      "true/false | Echo's distance from the top edge | 9987803a |  [hidden] | 2.8 m back | 10.0 s ago | 0.28 m/s",
    ],
    [
      'speed "5.5" kmh',
      { sog: "5.5", sogu: "kmh" },
      "true/false | Echo's distance from the top edge | 9987803a |  [hidden] | 15.3 m back | 10.0 s ago | 1.53 m/s",
    ],
    [
      'speed "25" kn',
      { sog: "25", sogu: "kn" },
      "true/false | Echo's distance from the top edge | 9987803a |  [hidden] | 128.6 m back | 10.0 s ago | 12.86 m/s",
    ],
    [
      'speed "25" kmh',
      { sog: "25", sogu: "kmh" },
      "true/false | Echo's distance from the top edge | 9987803a |  [hidden] | 69.4 m back | 10.0 s ago | 6.94 m/s",
    ],
    [
      'speed "1e300" kn',
      { sog: "1e300", sogu: "kn" },
      "true/false | Echo's distance from the top edge | 9987803a |  [hidden] | 514444444444…310:94f59758 | 10.0 s ago | 514444444444…307:d65583b3",
    ],
    [
      'speed "1e300" kmh',
      { sog: "1e300", sogu: "kmh" },
      "true/false | Echo's distance from the top edge | 9987803a |  [hidden] | 277777777777…310:24bb765d | 10.0 s ago | 277777777777…307:d250e784",
    ],
    [
      'speed "1e308" kmh',
      { sog: "1e308", sogu: "kmh" },
      "true/false | Echo's distance from the top edge | 9987803a |  [hidden] | — m back | 10.0 s ago | 277777777777…315:b90fe624",
    ],
    [
      'speed "1e-320" kn',
      { sog: "1e-320", sogu: "kn" },
      "true/false | Echo's distance from the top edge | 9987803a |  [hidden] | 0.00 m back | 10.0 s ago | 0.00 m/s",
    ],
    [
      'speed "1e-320" kmh',
      { sog: "1e-320", sogu: "kmh" },
      "true/false | Echo's distance from the top edge | 9987803a |  [hidden] | 0.00 m back | 10.0 s ago | 0.00 m/s",
    ],
    [
      "no names",
      { side: "", down: "" },
      "true/false | Echo's distance from the top edge | 62cc803a |  [hidden] | 10.3 m back | 10.0 s ago | 1.03 m/s",
    ],
    [
      "speed and time invalid",
      { sog: "0", tscr: "0" },
      "true/false | Echo's distance from the top edge | 9987803a | Enter a speed in Settings. [shown] | — | — | —",
    ],
    [
      "time and position invalid",
      { tscr: "0", frac: "200" },
      "true/false | Echo's distance from the top edge | 9987803a | Enter the crossing time in seconds. [shown] | — | — | —",
    ],
    [
      "all three invalid",
      { sog: "0", tscr: "0", frac: "200" },
      "true/false | Echo's distance from the top edge | 9987803a | Enter a speed in Settings. [shown] | — | — | —",
    ],
    [
      "speed and position invalid",
      { sog: "", frac: "-1" },
      "true/false | Echo's distance from the top edge | 9987803a | Enter a speed in Settings. [shown] | — | — | —",
    ],
  ];

  it.each(rows)("%s", (_label, over, expected) => {
    expect(gist(viewOf(over))).toBe(expected);
  });
});

describe("what the view leaves alone", () => {
  it("writes the nine elements of KEYS whatever the page holds, and no other", () => {
    for (const over of [{}, { tscr: "0" }, { sog: "0" }, { frac: "101" }, { db: "vs" }]) {
      expect(Object.keys(viewOf(over)).sort()).toEqual([...KEYS].sort());
    }
  });

  // The shell gives a field as `num` reads it (a number or NaN). The view is not told anything else, but a
  // field that is not a finite number is no number to it, as in the earlier page's `num` (line 11).
  const noTime = "Enter the crossing time in seconds.";
  const noPosition = "Enter a position from 0 to 100%.";
  it.each([
    ["a time given as a text", { tscr: "20", frac: 50 }, noTime],
    ["a time that is not given", { frac: 50 }, noTime],
    ["an infinite time", { tscr: Number.POSITIVE_INFINITY, frac: 50 }, noTime],
    ["a negative infinite time", { tscr: Number.NEGATIVE_INFINITY, frac: 50 }, noTime],
    ["a position given as a text", { tscr: 20, frac: "50" }, noPosition],
    ["a position that is not given", { tscr: 20 }, noPosition],
    ["an infinite position", { tscr: 20, frac: Number.POSITIVE_INFINITY }, noPosition],
    ["a negative infinite position", { tscr: 20, frac: Number.NEGATIVE_INFINITY }, noPosition],
  ])("takes %s for no number", (_label, local, message) => {
    const view = behindView({ ...inputOf(fieldsOf(), "ss", "en-US"), local });
    expect(view["db-err"]).toEqual({ text: message, hidden: false });
    expect([view["db-out"]?.text, view["db-t"]?.text, view["db-v"]?.text]).toEqual(["—", "—", "—"]);
  });

  it("takes finite numbers as they are", () => {
    const view = behindView({
      ...inputOf(fieldsOf(), "ss", "en-US"),
      local: { tscr: 20, frac: 50 },
    });
    expect(view["db-err"]).toEqual({ text: "", hidden: true });
    expect(view["db-t"]?.text).toBe("10.0 s ago");
  });

  it("does not write whether a screen's button is shown (the earlier page does that for the equipment, line 269)", () => {
    const view = viewOf({ ss: false, d2: false, ds: false });
    expect(view["dbt > button:nth-child(1)"]?.hidden).toBeUndefined();
    expect(view["dbt > button:nth-child(2)"]?.hidden).toBeUndefined();
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

/** The section of the page Distance behind the boat is recorded in. */
const SECTION_FILE = "db";

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
  ui: UiState;
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

/** A text as `innerHTML` gives it back. */
const escaped = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * A patch of the view as the recorder holds it (fixtures/README.md): a content
 * that was written is held as text and as html, and an attribute under its
 * name with its value.
 */
function asRecorded(patch: ElementPatch): RecordedPatch {
  const out: RecordedPatch = {};
  if (patch.text !== undefined) {
    out.text = patch.text;
    out.html = escaped(patch.text);
  }
  if (patch.hidden !== undefined) out.hidden = patch.hidden;
  if (patch.attrs !== undefined) out.attrs = { ...patch.attrs };
  return out;
}

const SCENARIOS = index.scenarios.map((scenario) => scenario.name);
const PAIRS = SCENARIOS.flatMap((name) =>
  index.schemes.map((scheme): [string, string] => [name, scheme]),
);

/**
 * Whether the earlier page rendered the section (line 1811): it is open, and
 * it is not hidden, which it is while none of side imaging, 2D and down imaging
 * is ticked (`data-eq="ss 2d ds"`, line 891).
 */
const isRendered = (s: RecordedScenario): boolean =>
  s.ui.open.db === true &&
  (s.fields["eq-ss"] === true || s.fields["eq-2d"] === true || s.fields["eq-ds"] === true);

/**
 * What was recorded for one of the two screens' buttons, as far as the view
 * writes it: the page also writes whether the button is hidden, from the
 * equipment (`applyEq`, line 269), which the shell does.
 */
function asWritten(key: string, patch: RecordedPatch): RecordedPatch {
  return key.startsWith("dbt >") ? { ...patch, hidden: undefined } : patch;
}

describe("against the recorded page", () => {
  it("reads every scenario, in light and dark, two of them in sv-SE", () => {
    expect(SCENARIOS).toHaveLength(168);
    expect(index.schemes).toEqual(["light", "dark"]);
    expect(
      index.scenarios.filter((scenario) => scenario.locale !== "en-US").map((s) => s.locale),
    ).toEqual(["sv-SE", "sv-SE"]);
  });

  it("has recordings with the section rendered and without it", () => {
    const rendered = PAIRS.filter(([name]) => isRendered(scenarioOf(name)));
    expect([PAIRS.length, rendered.length]).toEqual([336, 206]);
  });

  it("has recordings of every message of the section, and of both screens", () => {
    const seen = new Set<string>();
    for (const [name, scheme] of PAIRS) {
      for (const key of ["db-err", "frac-l"]) {
        const text = recorded(`${name}/${scheme}`, key)?.text;
        if (text !== undefined) seen.add(`${key}: ${text}`);
      }
    }
    expect([...seen].sort()).toEqual([
      "db-err: ",
      "db-err: Enter a position from 0 to 100%.",
      "db-err: Enter a speed in Settings.",
      "db-err: Enter the crossing time in seconds.",
      "frac-l: Echo's distance from the right edge",
      "frac-l: Echo's distance from the top edge",
    ]);
  });

  describe.each(PAIRS)("%s, %s", (name, scheme) => {
    const at = `${name}/${scheme}`;
    const scenario = scenarioOf(name);
    const was: Record<string, RecordedPatch> = {};
    for (const key of KEYS) {
      const patch = recorded(at, key);
      if (patch !== undefined) was[key] = asWritten(key, patch);
    }

    if (!isRendered(scenario)) {
      // The page did not render the section in these recordings, but they hold
      // the pressed state of the two buttons. That is not the section's doing:
      // `seg('dbt', 'db')` (earlier page, lines 1817 to 1823) presses each button
      // at start-up by the raw `ui.db`, with no fallback to the equipment, and
      // again on each click. In all 130 of these recordings `ui.db` is "ss", so
      // the first button is pressed and the second is not. The two states are
      // written here as literals, from those lines, and not computed by
      // `behindView`, whose fallback (side to flat when there is no side-scan
      // sonar) is not what `seg` does: the shell of step 12 must press the
      // buttons by `ui.db` as `seg` does, not by what `behindView` writes.
      // No other element of KEYS was written.
      it("did not render the section: only the buttons, pressed by ui.db, are held", () => {
        expect(scenario.name).toBe(name);
        expect(scenario.ui.db).toBe("ss");
        expect(Object.keys(was).sort()).toEqual([
          "dbt > button:nth-child(1)",
          "dbt > button:nth-child(2)",
        ]);
        expect(was).toEqual({
          "dbt > button:nth-child(1)": { attrs: { "aria-pressed": "true" } },
          "dbt > button:nth-child(2)": { attrs: { "aria-pressed": "false" } },
        });
      });
      return;
    }

    it("leaves the elements of KEYS as the earlier page left them, and writes no other", () => {
      expect(scenario.name).toBe(name);
      const view = behindView(inputOf(scenario.fields, scenario.ui.db, scenario.locale));
      const left: Record<string, RecordedPatch> = {};
      for (const [key, patch] of Object.entries(view)) left[key] = asRecorded(patch);
      expect(Object.keys(left).sort()).toEqual(Object.keys(was).sort());
      expect(left).toEqual(was);
      expect(Object.keys(view).filter((key) => !(KEYS as readonly string[]).includes(key))).toEqual(
        [],
      );
    });
  });
});
