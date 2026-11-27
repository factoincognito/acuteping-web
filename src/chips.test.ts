/**
 * The beam chips and the legend against the earlier page (legacy/src/p2.js,
 * lines 1837, 1838, 1841, 1845 to 1865 and 1868 to 1870), in two ways. The
 * expected values of the first part were printed by those lines themselves,
 * run unchanged in Node against a stand-in for the page's elements, with the
 * page's own `beamList` and `cmpList` (lines 975 to 986 and 1099) to make the
 * list of beams; long texts are held as a digest and a length (FNV-1a of the
 * UTF-8 bytes, as `fixtures/README.md` does). The second part compares what
 * the module computes with what the earlier page wrote when it was recorded in
 * a browser (`fixtures/legacy/`), in every scenario of the set.
 *
 * The module takes the list of beams as it is given; the list is made by
 * `beamList` and `cmpList` of `beams.ts` (lines 975 to 986 and 1099), which the
 * calls below pass to the module as they are: that is the typed proof that a
 * `Beam` of `beams.ts` is a `ChipBeam`. That the list is the earlier page's is
 * pinned by its digest (`beams` of each row).
 */
import { beamList, cmpList } from "./beams";
import { type ChipBeam, chipDefaults, chipGroups, drawnLegend, lineSw, TICK } from "./chips";
import { equipment, parseSettings } from "./settings";
import { loadState } from "./state";
import { combined, livePreset, namesOf } from "./transducers";
import type { BeamLegend, ChipGroup, Equipment, RawFields, SavedValue } from "./types";

/** FNV-1a, 32 bit, over bytes, as eight hex digits (fixtures/README.md). */
function fnv1aOf(bytes: Uint8Array): string {
  let h = 0x811c9dc5;
  for (const byte of bytes) h = Math.imul(h ^ byte, 0x01000193) >>> 0;
  return h.toString(16).padStart(8, "0");
}

/** A text as its digest and its length in characters, which is how the expected values hold a long one. */
const dig = (text: string): string => `${fnv1aOf(new TextEncoder().encode(text))}:${text.length}`;

// ---------------------------------------------------------------------------
// What a test gives the module
// ---------------------------------------------------------------------------

/** The fields of the page for chosen transducers, with some changed (legacy lines 209 to 220). */
function fieldsOf(
  img: string,
  sec: string,
  live: string,
  over: Readonly<Record<string, SavedValue>>,
): RawFields {
  const p = combined(img, sec);
  const l = livePreset(live);
  const fields: Record<string, SavedValue> = {
    "img-p": img,
    "img-s": sec,
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
    dst: "3",
    sso: String(p.edge),
    sst: "2",
    ssalign: "inner",
    atw: String(l.w),
    att: String(l.t),
  };
  for (const [i, c] of p.cone.entries()) fields[`cone${i}`] = String(c.a);
  for (const [i, c] of p.down.entries()) fields[`down${i}`] = String(c.a);
  for (const [i, c] of p.side.entries()) fields[`side${i}`] = String(c.a);
  return { ...fields, ...over };
}

/**
 * The wrap of chips as the page's elements are, in the form the stand-in
 * serialises them: what the earlier lines 1849 to 1864 build from a list of
 * groups (the page sets the type, the class, the sonar's mark, the colour, the
 * state and the id, in that order).
 */
function wrapHtml(groups: readonly ChipGroup[]): string {
  return groups
    .map(
      (g) =>
        `<div class="bgrp" data-eq="${g.eq}"><p class="bgrp-h">${g.heading}</p><div class="chips">${g.items
          .map(
            (item) =>
              `<button type="button" class="tog"${item.eq === null ? "" : ` data-eq="${item.eq}"`} style="--c: ${item.colour};" aria-pressed="${item.pressed}" data-bid="${item.id}">${item.html}</button>`,
          )
          .join("")}</div></div>`,
    )
    .join("");
}

/** A storage that holds the saved state of a first visit, or one with these view states. */
function storageOf(ui: object | undefined) {
  return {
    getItem: (): string | null => (ui === undefined ? null : JSON.stringify({ v: {}, ui })),
    setItem: (): void => undefined,
  };
}

/** The key under which the page keeps its state is not read by `loadState`'s test double. */
type Seed = Readonly<{
  behind: Readonly<Record<string, unknown>>;
  fp: Readonly<Record<string, unknown>>;
}>;

/** One page: the transducers, the fields changed, the saved view state and the locale. */
type Case = readonly [
  name: string,
  img: string,
  sec: string,
  live: string,
  over: Readonly<Record<string, SavedValue>>,
  seed: Seed | undefined,
  locale: string,
];

const ALL_FALSE_BEHIND = {
  side0: false,
  side1: false,
  side2: false,
  cone0: false,
  cone1: false,
  down0: false,
  down1: false,
  down2: false,
  live: false,
  livel: false,
  livef: false,
  lives: false,
  livew: false,
};

const CASES: readonly Case[] = [
  ["default", "lowrance", "", "at2", {}, undefined, "en-US"],
  ["other", "other", "", "other", {}, undefined, "en-US"],
  ["hb3", "hb_xm9hw", "", "at2xl", {}, undefined, "en-US"],
  ["second", "hb_xm9hw", "hb_xm14hw", "ml2", {}, undefined, "en-US"],
  ["lvs34", "lowrance_nose", "", "lvs34", {}, undefined, "en-US"],
  ["zero-angles", "lowrance", "", "at2", { side0: "0", side1: "0" }, undefined, "en-US"],
  ["zero-first", "lowrance", "", "at2", { side0: "0", side1: "10" }, undefined, "en-US"],
  [
    "blank-angles",
    "lowrance",
    "",
    "at2",
    { side0: " ", side1: " ", cone0: " " },
    undefined,
    "en-US",
  ],
  [
    "saved-partial",
    "lowrance",
    "",
    "at2",
    {},
    { behind: { side0: false, cone0: false, livef: false }, fp: { side0: true, down2: true } },
    "en-US",
  ],
  [
    "saved-all-false",
    "lowrance",
    "",
    "at2",
    {},
    {
      behind: ALL_FALSE_BEHIND,
      fp: {
        cone0: false,
        cone1: false,
        down0: false,
        down1: false,
        down2: false,
        live: false,
        livel: false,
        side0: false,
        side1: false,
        livef: false,
        lives: false,
        livew: false,
      },
    },
    "en-US",
  ],
  [
    "saved-odd",
    "lowrance",
    "",
    "at2",
    {},
    {
      behind: { side0: 1, cone0: "yes", down0: 0, live: null, down1: "" },
      fp: { cone0: "", down1: "x", live: null },
    },
    "en-US",
  ],
  ["saved-empty", "lowrance", "", "at2", {}, { behind: {}, fp: {} }, "en-US"],
  [
    "saved-hb3",
    "hb_xm9hw",
    "",
    "at2xl",
    {},
    {
      behind: { side1: true, side2: true, cone0: false, down1: false },
      fp: { side0: true, down2: true, cone1: false },
    },
    "en-US",
  ],
  [
    "eq-ss-only",
    "lowrance",
    "",
    "at2",
    { "eq-ds": false, "eq-2d": false, "eq-at": false },
    undefined,
    "en-US",
  ],
  [
    "eq-none",
    "lowrance",
    "",
    "at2",
    { "eq-ss": false, "eq-ds": false, "eq-2d": false, "eq-at": false },
    undefined,
    "en-US",
  ],
  [
    "eq-at-single",
    "lowrance",
    "",
    "at2",
    { "eq-ss": false, "eq-ds": false, "eq-2d": false, "at-n": "1" },
    undefined,
    "en-US",
  ],
  [
    "eq-at-not-dual",
    "lowrance",
    "",
    "ml2",
    { "eq-ss": false, "eq-ds": false, "eq-2d": false },
    undefined,
    "en-US",
  ],
  ["eq-2d-ds", "hb_xm920", "", "at2xl", { "eq-ss": false, "eq-at": false }, undefined, "en-US"],
  ["sv", "hb_xm14hw", "", "at2", { side0: "85,5", cone1: "25,5", dst: "3,5" }, undefined, "sv-SE"],
  ["all-hidden-beams", "lowrance", "", "at2", {}, { behind: ALL_FALSE_BEHIND, fp: {} }, "en-US"],
];

/** What the module computes for a case, in the steps the page takes at its start. */
function runCase([, img, sec, live, over, seed]: Case) {
  const fields = fieldsOf(img, sec, live, over);
  const settings = parseSettings(fields, combined(img, sec));
  const names = namesOf(img, live);
  const eq = equipment(fields, livePreset(live));
  const state = loadState(storageOf(seed));
  const beams = beamList(settings, names);
  const before = JSON.stringify({ behind: state.ui.behind, fp: state.ui.fp });
  const defaults = chipDefaults(beams, state.ui.behind, state.ui.fp);
  const groups = chipGroups(names, beams, defaults.behind);
  const legend = drawnLegend(cmpList(settings, names, eq, defaults.behind), beams, eq);
  return { beams, before, defaults, groups, legend };
}

// ---------------------------------------------------------------------------
// The expected values, printed by the earlier lines
// ---------------------------------------------------------------------------

/**
 * By case: the digest of the list of beams, of the view state before and after
 * the defaults, of the chips' html, the count the legend says and the digest of
 * its html.
 */
const EXPECTED: Readonly<
  Record<
    string,
    readonly [
      beams: string,
      before: string,
      after: string,
      html: string,
      count: string,
      legend: string,
    ]
  >
> = {
  default: [
    "43a701d8:1397",
    "60075746:243",
    "ff225728:352",
    "5f0f537b:4832",
    "10 of 11 shown",
    "bfb2c4ea:1013",
  ],
  other: [
    "5aade6d1:1277",
    "60075746:243",
    "ff225728:352",
    "8d663c6c:4762",
    "9 of 10 shown",
    "7f37d31b:856",
  ],
  hb3: [
    "67de1dee:1614",
    "60075746:243",
    "ce32d858:366",
    "d61986ee:5639",
    "11 of 13 shown",
    "03c448ed:1134",
  ],
  second: [
    "faa107c5:1599",
    "60075746:243",
    "ce32d858:366",
    "a3ea982a:5618",
    "10 of 12 shown",
    "cc7b1220:1014",
  ],
  lvs34: [
    "814483c2:1383",
    "60075746:243",
    "ff225728:352",
    "3febdc84:4818",
    "9 of 10 shown",
    "6ac81a56:899",
  ],
  "zero-angles": [
    "a8fcd762:1386",
    "60075746:243",
    "f1fb4b50:350",
    "5f0f537b:4832",
    "10 of 11 shown",
    "bfb2c4ea:1013",
  ],
  "zero-first": [
    "86dd074d:1380",
    "60075746:243",
    "64c8e679:351",
    "5f0f537b:4832",
    "10 of 11 shown",
    "bfb2c4ea:1013",
  ],
  "blank-angles": [
    "9b159e16:1388",
    "60075746:243",
    "f1fb4b50:350",
    "5f0f537b:4832",
    "10 of 11 shown",
    "bfb2c4ea:1013",
  ],
  "saved-partial": [
    "43a701d8:1397",
    "abf3730b:271",
    "732392af:353",
    "b0a728ac:4835",
    "7 of 11 shown",
    "11bf27cd:711",
  ],
  "saved-all-false": [
    "43a701d8:1397",
    "8c578069:367",
    "8c578069:367",
    "b607d647:4842",
    "0 of 11 shown",
    "f723728f:43",
  ],
  "saved-odd": [
    "43a701d8:1397",
    "dfdd5bb5:232",
    "e0e04b39:341",
    "8d5e5116:4835",
    "7 of 11 shown",
    "cd3f0c13:700",
  ],
  "saved-empty": [
    "43a701d8:1397",
    "60075746:243",
    "ff225728:352",
    "5f0f537b:4832",
    "10 of 11 shown",
    "bfb2c4ea:1013",
  ],
  "saved-hb3": [
    "67de1dee:1614",
    "4cd369c3:256",
    "83fd31ef:365",
    "5e020cfa:5639",
    "11 of 13 shown",
    "202aff59:1136",
  ],
  "eq-ss-only": [
    "43a701d8:1397",
    "60075746:243",
    "ff225728:352",
    "5f0f537b:4832",
    "1 of 2 shown",
    "83dcfa84:101",
  ],
  "eq-none": [
    "43a701d8:1397",
    "60075746:243",
    "ff225728:352",
    "5f0f537b:4832",
    "0 of 0 shown",
    "f723728f:43",
  ],
  "eq-at-single": [
    "43a701d8:1397",
    "60075746:243",
    "ff225728:352",
    "5f0f537b:4832",
    "4 of 4 shown",
    "86999b22:409",
  ],
  "eq-at-not-dual": [
    "6d2c22b6:1396",
    "60075746:243",
    "ff225728:352",
    "6c1c80fd:4828",
    "4 of 4 shown",
    "7f459206:404",
  ],
  "eq-2d-ds": [
    "79773ebe:1595",
    "60075746:243",
    "ce32d858:366",
    "97a2689b:5604",
    "5 of 5 shown",
    "33d22dfd:477",
  ],
  sv: [
    "76d3c85b:1642",
    "60075746:243",
    "ce32d858:366",
    "5facc43c:5622",
    "11 of 13 shown",
    "bfb0675b:1120",
  ],
  "all-hidden-beams": [
    "43a701d8:1397",
    "86bbdb87:293",
    "a569efbf:363",
    "b607d647:4842",
    "0 of 11 shown",
    "f723728f:43",
  ],
};

describe("the line sample of a beam (lineSw, line 1837)", () => {
  // [the beam's dash pattern, its colour, the sample]
  it.each([
    ["", "var(--s1)", '<span class="sw" style="border-top:2.5px solid var(--s1)"></span>'],
    ["2 3", "var(--s2)", '<span class="sw" style="border-top:2.5px dotted var(--s2)"></span>'],
    ["10 3 2 3", "#abc", '<span class="sw" style="border-top:2.5px double #abc"></span>'],
    ["6 4", "red", '<span class="sw" style="border-top:2.5px dashed red"></span>'],
    ["x", "blue", '<span class="sw" style="border-top:2.5px dashed blue"></span>'],
    ["2  3", "c", '<span class="sw" style="border-top:2.5px dashed c"></span>'],
    [" 2 3", "c", '<span class="sw" style="border-top:2.5px dashed c"></span>'],
  ])("the dash %j in %s is %s", (dash, col, sample) => {
    expect(lineSw({ dash, col })).toBe(sample);
  });

  it("is a solid line for a beam without a dash pattern", () => {
    expect(lineSw({ dash: undefined, col: "green" })).toBe(
      '<span class="sw" style="border-top:2.5px solid green"></span>',
    );
    expect(lineSw({ dash: null, col: "c" })).toBe(
      '<span class="sw" style="border-top:2.5px solid c"></span>',
    );
  });
});

describe("the tick (TICK, line 1838)", () => {
  it("is the earlier page's svg", () => {
    expect(TICK).toBe(
      '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6.5 L5 9 L10 3" fill="none" stroke="var(--surface)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    );
  });
});

describe("the beams the test makes", () => {
  it.each(CASES)("%s: its list is the earlier page's list of beams", (...c) => {
    const exp = EXPECTED[c[0]];
    expect(dig(JSON.stringify(runCase(c).beams))).toBe(exp?.[0]);
  });
});

describe("the defaults of the chips' view state (the forEach of buildChips, line 1841)", () => {
  it.each(CASES)("%s: the state before and after the defaults is the earlier page's", (...c) => {
    const exp = EXPECTED[c[0]];
    const r = runCase(c);
    expect(dig(r.before)).toBe(exp?.[1]);
    expect(dig(JSON.stringify({ behind: r.defaults.behind, fp: r.defaults.fp }))).toBe(exp?.[2]);
  });

  // Added after the module was written (review round 2, finding 3). The saved state of the page
  // as it starts already holds a state for most beams, so `chipDefaults` fills nothing there, and
  // the rows above give each beam its id as its name. Here no state is stored (`{}` and `{}`) and
  // the beams are the real ones of the page, whose names differ from their ids: a test of the
  // name for the id (`side1` ticked on first load) shows. The expected objects were printed by the
  // earlier lines (line 1841) run unchanged in Node, with `ui.behind` and `ui.fp` emptied first.
  it.each([
    [
      "default",
      "lowrance",
      "",
      "at2",
      {},
      '{"behind":{"side0":true,"side1":false,"cone0":true,"cone1":true,"down0":true,"down1":true,"live":true,"livel":true,"livef":true,"lives":true,"livew":true},"fp":{"side0":false,"side1":false,"cone0":true,"cone1":true,"down0":true,"down1":true,"live":false,"livel":false,"livef":false,"lives":false,"livew":false}}',
    ],
    [
      "hb3",
      "hb_xm9hw",
      "",
      "at2xl",
      {},
      '{"behind":{"side0":true,"side1":false,"side2":false,"cone0":true,"cone1":true,"down0":true,"down1":true,"down2":true,"live":true,"livel":true,"livef":true,"lives":true,"livew":true},"fp":{"side0":false,"side1":false,"side2":false,"cone0":true,"cone1":true,"down0":true,"down1":true,"down2":false,"live":false,"livel":false,"livef":false,"lives":false,"livew":false}}',
    ],
    [
      "second",
      "hb_xm9hw",
      "hb_xm14hw",
      "ml2",
      {},
      '{"behind":{"side0":true,"side1":false,"side2":false,"cone0":true,"cone1":true,"down0":true,"down1":true,"down2":true,"live":true,"livel":true,"livef":true,"lives":true,"livew":true},"fp":{"side0":false,"side1":false,"side2":false,"cone0":true,"cone1":true,"down0":true,"down1":true,"down2":false,"live":false,"livel":false,"livef":false,"lives":false,"livew":false}}',
    ],
    [
      "lvs34",
      "lowrance_nose",
      "",
      "lvs34",
      {},
      '{"behind":{"side0":true,"side1":false,"cone0":true,"cone1":true,"down0":true,"down1":true,"live":true,"livel":true,"livef":true,"lives":true,"livew":true},"fp":{"side0":false,"side1":false,"cone0":true,"cone1":true,"down0":true,"down1":true,"live":false,"livel":false,"livef":false,"lives":false,"livew":false}}',
    ],
    [
      "zero-first",
      "lowrance",
      "",
      "at2",
      { side0: "0", side1: "10" },
      '{"behind":{"side0":true,"side1":false,"cone0":true,"cone1":true,"down0":true,"down1":true,"live":true,"livel":true,"livef":true,"lives":true,"livew":true},"fp":{"side0":true,"side1":false,"cone0":true,"cone1":true,"down0":true,"down1":true,"live":false,"livel":false,"livef":false,"lives":false,"livew":false}}',
    ],
  ])(
    "fills the defaults of the real beams of the %s page when nothing is stored",
    (_name, img, sec, live, over, expected) => {
      const fields = fieldsOf(img, sec, live, over);
      const beams = beamList(parseSettings(fields, combined(img, sec)), namesOf(img, live));
      const r = chipDefaults(beams, {}, {});
      expect(JSON.stringify({ behind: r.behind, fp: r.fp })).toBe(expected);
    },
  );

  it("gives the page as it starts these states", () => {
    const r = runCase(CASES[0] as Case);
    expect(JSON.stringify({ behind: r.defaults.behind, fp: r.defaults.fp })).toBe(
      '{"behind":{"side0":true,"side1":false,"side2":false,"cone0":true,"cone1":true,"down0":true,"down1":true,"down2":true,"live":true,"livel":true,"livef":true,"lives":true,"livew":true},"fp":{"cone0":true,"cone1":true,"down0":true,"down1":true,"down2":false,"live":false,"livel":false,"side0":false,"side1":false,"livef":false,"lives":false,"livew":false}}',
    );
  });

  it("shows a SideScan beam in the view from behind only for the first frequency, and in the footprints only where its fraction of the widest fan is zero or no number", () => {
    const beam = (id: string, kf?: number, kind?: string): ChipBeam => ({
      id,
      eq: "ss",
      name: id,
      col: "c",
      dash: "",
      ...(kf === undefined ? {} : { kf }),
      ...(kind === undefined ? {} : { kind }),
    });
    const list = [
      beam("side0", 1),
      beam("side1", 0.5),
      beam("side12", 0.25),
      beam("side2", 0),
      beam("sidex", Number.NaN),
      beam("other", undefined),
      beam("live", undefined, "at"),
      beam("down2", undefined),
      beam("down1", undefined, "fan"),
      beam("side20", 0.1),
      beam("aside1", 0.1),
    ];
    const r = chipDefaults(list, {}, {});
    expect(r.behind).toEqual({
      side0: true,
      side1: false,
      side12: false,
      side2: false,
      sidex: true,
      other: true,
      live: true,
      down2: true,
      down1: true,
      side20: false,
      aside1: true,
    });
    expect(r.fp).toEqual({
      side0: false,
      side1: false,
      side12: false,
      side2: true,
      sidex: true,
      other: true,
      live: false,
      down2: false,
      down1: true,
      side20: false,
      aside1: false,
    });
  });

  it("keeps a state that is set, whatever it is, and sets only what is undefined", () => {
    const list: ChipBeam[] = [
      { id: "a", eq: "ss", name: "a", col: "c", dash: "", kf: 1 },
      { id: "b", eq: "ss", name: "b", col: "c", dash: "", kf: 1 },
      { id: "c", eq: "ss", name: "c", col: "c", dash: "", kf: 1 },
    ];
    const behind = { a: false, b: undefined } as unknown as Record<string, boolean>;
    const fp = { a: true, c: null } as unknown as Record<string, boolean>;
    const r = chipDefaults(list, behind, fp);
    expect(r.behind).toEqual({ a: false, b: true, c: true });
    expect(r.fp).toEqual({ a: true, b: false, c: null });
    expect(Object.keys(r.behind)).toEqual(["a", "b", "c"]);
  });

  it("does not change the states it is given, and gives states of their own", () => {
    const list: ChipBeam[] = [{ id: "a", eq: "ss", name: "a", col: "c", dash: "", kf: 1 }];
    const behind: Record<string, boolean> = {};
    const fp: Record<string, boolean> = {};
    const r = chipDefaults(list, behind, fp);
    expect(behind).toEqual({});
    expect(fp).toEqual({});
    expect(r.behind).not.toBe(behind);
    expect(r.fp).not.toBe(fp);
  });
});

describe("the groups of chips (fillChips, lines 1844 to 1865)", () => {
  it.each(CASES)("%s: the chips are the earlier page's", (...c) => {
    const exp = EXPECTED[c[0]];
    expect(dig(wrapHtml(runCase(c).groups))).toBe(exp?.[3]);
  });

  const SYN_NAMES = { side: "SideScan", down: "DownScan", live: "AT" };

  const syntheticBeams = (): ChipBeam[] => [
    { id: "a", eq: "ss", name: "SideScan 455", col: "var(--s1)", dash: "" },
    { id: "b", eq: "ss", name: "SideScan", col: "red", dash: "2 3" },
    { id: "c", eq: "ss", name: "SideScanX 1", col: "#fff", dash: "6 4" },
    { id: "d", eq: "2d", name: "2D x", col: "c", dash: "10 3 2 3" },
    { id: "e", eq: "2d", name: "3D x", col: "c", dash: "zzz" },
    { id: "f", eq: "ds", name: "DownScan 1", col: "c", dash: "" },
    { id: "g", eq: "at", name: "AT Down", col: "c", dash: "" },
    { id: "h", eq: "atw", name: "AT Wide", col: "c", dash: "" },
    { id: "i", eq: "zz", name: "Nope", col: "c", dash: "" },
  ];

  it("takes the group's name off the front of a beam's name, only when a space follows it, and not for the live sonar", () => {
    const groups = chipGroups(SYN_NAMES, syntheticBeams(), {
      a: true,
      b: false,
      c: 1,
      d: 0,
      e: null,
      f: "x",
      g: true,
    } as unknown as Record<string, boolean>);
    expect(dig(wrapHtml(groups))).toBe("d5abefe8:3366");
    expect(
      groups.map((g) => [g.eq, g.heading, g.items.map((i) => [i.id, i.eq, i.pressed])]),
    ).toEqual([
      [
        "ss",
        "SideScan",
        [
          ["a", null, true],
          ["b", null, false],
          ["c", null, true],
        ],
      ],
      [
        "2d",
        "2D",
        [
          ["d", null, false],
          ["e", null, false],
        ],
      ],
      ["ds", "DownScan", [["f", null, true]]],
      [
        "at",
        "AT",
        [
          ["g", null, true],
          ["h", "atw", false],
        ],
      ],
    ]);
    expect(
      groups.map((g) => g.items.map((i) => i.html.match(/<span>([^<]*)<\/span>$/)?.[1])),
    ).toEqual([["455", "SideScan", "SideScanX 1"], ["x", "3D x"], ["1"], ["AT Down", "AT Wide"]]);
    expect(groups.map((g) => g.items.map((i) => i.colour))).toEqual([
      ["var(--s1)", "red", "#fff"],
      ["c", "c"],
      ["c"],
      ["c", "c"],
    ]);
  });

  it("builds a chip as the tick, the line sample and the name", () => {
    const [group] = chipGroups(SYN_NAMES, syntheticBeams(), { a: true });
    const [item] = group?.items ?? [];
    expect(item?.html).toBe(
      `<span class="bx">${TICK}</span>${lineSw({ dash: "", col: "var(--s1)" })}<span>455</span>`,
    );
  });

  it("leaves out a group without a beam, and a beam of no group", () => {
    expect(chipGroups(SYN_NAMES, [], {})).toEqual([]);
    expect(dig(wrapHtml(chipGroups(SYN_NAMES, [], {})))).toBe("811c9dc5:0");
    const only: ChipBeam[] = [{ id: "i", eq: "zz", name: "Nope", col: "c", dash: "" }];
    expect(chipGroups(SYN_NAMES, only, {})).toEqual([]);
  });

  it("writes the names of the groups as they are, without escaping them", () => {
    const beams: ChipBeam[] = [
      { id: "a", eq: "ss", name: "S<b> 1", col: "c1", dash: "" },
      { id: "b", eq: "ds", name: "D& 2", col: "c2", dash: "" },
      { id: "c", eq: "at", name: 'L" 3', col: "c3", dash: "" },
    ];
    const groups = chipGroups({ side: "S<b>", down: "D&", live: 'L"' }, beams, { a: true });
    expect(dig(wrapHtml(groups))).toBe("d372ca50:1369");
    expect(groups.map((g) => g.heading)).toEqual(["S<b>", "D&", 'L"']);
  });

  it("lists the live sonar's beams in one group, the wide one marked with its sonar", () => {
    const beams: ChipBeam[] = [
      { id: "x", eq: "at", name: "AT 1", col: "c", dash: "" },
      { id: "y", eq: "atw", name: "AT 2", col: "c", dash: "" },
    ];
    const groups = chipGroups(SYN_NAMES, beams, { x: true, y: true });
    expect(dig(wrapHtml(groups))).toBe("553ad9f3:838");
    expect(groups).toHaveLength(1);
  });

  it("strips a name that is the group's name and a space, to nothing, and strips from the front only", () => {
    const beams: ChipBeam[] = [
      { id: "x", eq: "ss", name: "", col: "c", dash: "" },
      { id: "y", eq: "ss", name: "SideScan ", col: "c", dash: "" },
      { id: "z", eq: "ss", name: " SideScan 1", col: "c", dash: "" },
    ];
    const groups = chipGroups(SYN_NAMES, beams, { y: true });
    expect(dig(wrapHtml(groups))).toBe("b37a5203:1200");
  });

  it("strips a space from the name of a group whose name is empty", () => {
    const beams: ChipBeam[] = [
      { id: "x", eq: "ss", name: " 1", col: "c", dash: "" },
      { id: "y", eq: "ds", name: "abc", col: "c", dash: "" },
    ];
    const groups = chipGroups({ side: "", down: "", live: "" }, beams, {});
    expect(dig(wrapHtml(groups))).toBe("7ec897e0:904");
  });

  it("puts a beam into the groups it belongs to, in the order of the groups, and the same id twice into two", () => {
    const beams: ChipBeam[] = [
      { id: "ss1", eq: "ss", name: "SideScan A", col: "c", dash: "" },
      { id: "ss1", eq: "2d", name: "2D A", col: "c", dash: "" },
      { id: "toString", eq: "ds", name: "DownScan B", col: "c", dash: "" },
    ];
    const groups = chipGroups(SYN_NAMES, beams, { toString: true });
    expect(dig(wrapHtml(groups))).toBe("19f3d5af:1381");
  });
});

describe("the legend (drawnLegend, lines 1867 to 1870)", () => {
  it.each(CASES)("%s: the count and the legend are the earlier page's", (...c) => {
    const exp = EXPECTED[c[0]];
    const { legend } = runCase(c);
    expect(legend.count).toBe(exp?.[4]);
    expect(dig(legend.html)).toBe(exp?.[5]);
  });

  it("writes the legend of the page as it starts: a sample and a name for each beam shown, in the order of the list", () => {
    const r = runCase(CASES[0] as Case);
    expect(r.legend).toEqual<BeamLegend>({
      count: "10 of 11 shown",
      html: '<span><span class="sw" style="border-top:2.5px dotted var(--s1)"></span>SideScan 455 kHz CHIRP</span><span><span class="sw" style="border-top:2.5px solid var(--s3)"></span>2D Medium CHIRP 83 kHz</span><span><span class="sw" style="border-top:2.5px solid var(--s2)"></span>2D High CHIRP 200 kHz</span><span><span class="sw" style="border-top:2.5px dashed var(--s4)"></span>DownScan 700 kHz CHIRP</span><span><span class="sw" style="border-top:2.5px dashed var(--s5)"></span>DownScan 1200 kHz CHIRP</span><span><span class="sw" style="border-top:2.5px double var(--s7)"></span>ActiveTarget 2 Down, fan across</span><span><span class="sw" style="border-top:2.5px double var(--s8)"></span>ActiveTarget 2 Down, fan along keel</span><span><span class="sw" style="border-top:2.5px double var(--s2)"></span>ActiveTarget 2 Forward</span><span><span class="sw" style="border-top:2.5px double var(--s5)"></span>Scout</span><span><span class="sw" style="border-top:2.5px double var(--s6)"></span>Scout Wide (two units)</span>',
    });
  });

  it("says that no beam is selected when none is shown, and counts the beams of the sonars that are on", () => {
    const r = runCase(CASES.find((c) => c[0] === "saved-all-false") as Case);
    expect(r.legend).toEqual<BeamLegend>({
      count: "0 of 11 shown",
      html: '<span class="none">No beams selected</span>',
    });
    const none = runCase(CASES.find((c) => c[0] === "eq-none") as Case);
    expect(none.legend).toEqual<BeamLegend>({
      count: "0 of 0 shown",
      html: '<span class="none">No beams selected</span>',
    });
  });

  it("counts the beams of the sonars that are on, not the beams that are shown", () => {
    const beams: ChipBeam[] = [
      { id: "a", eq: "ss", name: "A", col: "c", dash: "" },
      { id: "b", eq: "2d", name: "B", col: "c", dash: "" },
      { id: "c", eq: "atw", name: "C", col: "c", dash: "" },
    ];
    const eq: Equipment = { ss: true, "2d": false, ds: false, at: true, dual: true, atw: true };
    const legend = drawnLegend([beams[0] as ChipBeam], beams, eq);
    expect(legend.count).toBe("1 of 2 shown");
    expect(legend.html).toBe(
      '<span><span class="sw" style="border-top:2.5px solid c"></span>A</span>',
    );
  });

  // Added after the module was written (review round 1). The earlier page reads `eq[b.eq]` on a
  // plain object (line 1867), so a beam whose key is a name every object has counts as on. No beam
  // of the page has such a key, and the page's list cannot be given another, so the expected values
  // are read off the line, not printed by it.
  it.each(["constructor", "toString", "__proto__", "hasOwnProperty", "valueOf"])(
    "counts a beam whose sonar key is %s as one of a sonar that is on",
    (key) => {
      const beams: ChipBeam[] = [
        { id: "a", eq: "ss", name: "A", col: "c", dash: "" },
        { id: "b", eq: key, name: "B", col: "c", dash: "" },
        { id: "c", eq: "ds", name: "C", col: "c", dash: "" },
      ];
      const eq: Equipment = {
        ss: true,
        "2d": false,
        ds: false,
        at: false,
        dual: false,
        atw: false,
      };
      expect(drawnLegend([beams[0] as ChipBeam], beams, eq).count).toBe("1 of 2 shown");
    },
  );

  it("does not count a beam whose sonar key is not in the equipment and not inherited", () => {
    const beams: ChipBeam[] = [{ id: "b", eq: "nothing", name: "B", col: "c", dash: "" }];
    const eq: Equipment = { ss: true, "2d": true, ds: true, at: true, dual: true, atw: true };
    expect(drawnLegend([], beams, eq).count).toBe("0 of 0 shown");
  });

  it("writes a name as it is, without escaping it", () => {
    const beam: ChipBeam = { id: "a", eq: "ss", name: "A<b> & c", col: "c", dash: "2 3" };
    const eq: Equipment = { ss: true, "2d": false, ds: false, at: false, dual: false, atw: false };
    expect(drawnLegend([beam], [beam], eq).html).toBe(
      '<span><span class="sw" style="border-top:2.5px dotted c"></span>A<b> & c</span>',
    );
  });
});

// ---------------------------------------------------------------------------
// Against the recorded page
// ---------------------------------------------------------------------------

declare const __dirname: string;
interface FileSystem {
  existsSync(path: string): boolean;
  readFileSync(path: string, encoding: "utf8"): string;
}
const { existsSync, readFileSync } = jest.requireActual<FileSystem>("node:fs");

const RECORDED = `${__dirname}/../fixtures/legacy`;

/** The section of the page the chips and the legend are recorded in. */
const SECTION_FILE = "cmp";

/** A value too long to be held in full: its digest and its length (fixtures/README.md). */
interface Digest {
  fnv1a: string;
  length: number;
}

/** How the earlier page left one element. */
interface RecordedPatch {
  text?: string | Digest;
  html?: string | Digest;
}

/** A value that is held in the same section of another scenario and scheme. */
interface Same {
  same: string;
}

interface RecordedScenario {
  name: string;
  scheme: string;
  locale: string;
  fields: Record<string, string | boolean>;
  seed: { v: unknown; ui: object } | null;
  ui: { behind: Record<string, boolean>; fp: Record<string, boolean> };
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

/** The section file of a scenario and scheme (`<scenario>/<scheme>`), or the file the index says it equals. */
function sectionFile(at: string): RecordedFile {
  let path = `${at}/${SECTION_FILE}.json`;
  for (let equal = index.omitted[path]; equal !== undefined; equal = index.omitted[path])
    path = equal;
  return read<RecordedFile>(path);
}

/** The patch of one element, read where a `same` says it is. */
function recorded(at: string, key: string): RecordedPatch | undefined {
  let value: RecordedPatch | Same | undefined = sectionFile(at).patches[key];
  for (let hops = 0; value !== undefined && "same" in value; hops += 1) {
    if (hops > 2) throw new Error(`${at}, ${key}: more than two "same" in a row`);
    value = sectionFile(value.same).patches[key];
  }
  return value;
}

/** The keys of every element of the section that the earlier page wrote. */
const keysOf = (at: string): string[] => Object.keys(sectionFile(at).patches);

/** What a recording started from, read from a file of its own. */
function scenarioOf(name: string, scheme: string): RecordedScenario {
  const own = ["page", "set"]
    .map((section) => `${name}/${scheme}/${section}.json`)
    .find((path) => existsSync(`${RECORDED}/${path}`));
  if (own === undefined) throw new Error(`${name}: no file of its own to read the scenario from`);
  return read<RecordedFile>(own).scenario;
}

/**
 * An html as the browser gives it back: the script writes an empty element as
 * `<path …/>`, and `innerHTML` reads it as `<path …></path>`; the sonar marks
 * that `applyEq` (line 269, the shell's) hides the chips and groups with are
 * left out.
 */
const asRead = (html: string): string =>
  html.replace(/<([a-z]+)((?:\s[^<>]*?)?)\/>/g, "<$1$2></$1>").replace(/ hidden=""/g, "");

/** A recorded content equals a content: in full, or as the digest and the length of its UTF-8 bytes. */
function sameContent(recordedValue: string | Digest | undefined, own: string): boolean {
  if (recordedValue === undefined) return false;
  if (typeof recordedValue === "string") return recordedValue === own;
  return (
    recordedValue.fnv1a === fnv1aOf(new TextEncoder().encode(own)) &&
    recordedValue.length === own.length
  );
}

/**
 * What the shell adds after the legend of each of the four views that has one
 * (line 1871): its button, closed, as the browser gives it back.
 */
const CHANGE_BUTTON =
  '<button type="button" class="linkbtn" data-tosel="" aria-expanded="false">Change</button>';

const SCENARIOS = index.scenarios.map((scenario) => scenario.name);
const PAIRS = SCENARIOS.flatMap((name) =>
  index.schemes.map((scheme): [string, string] => [name, scheme]),
);

describe("against the recorded page", () => {
  it("reads every scenario, in light and dark, two of them in sv-SE", () => {
    expect(SCENARIOS).toHaveLength(168);
    expect(index.schemes).toEqual(["light", "dark"]);
    expect(
      index.scenarios.filter((scenario) => scenario.locale !== "en-US").map((s) => s.locale),
    ).toEqual(["sv-SE", "sv-SE"]);
  });

  it("has recordings of the chips in every scenario, and of the legend in those where the section was rendered", () => {
    let legends = 0;
    for (const [name, scheme] of PAIRS) {
      const at = `${name}/${scheme}`;
      expect(recorded(at, "allb-chips")).toBeDefined();
      if (recorded(at, "allb-cnt") !== undefined) legends += 1;
    }
    expect(PAIRS).toHaveLength(336);
    expect(legends).toBe(132);
  });

  describe.each(PAIRS)("%s, %s", (name, scheme) => {
    const at = `${name}/${scheme}`;
    const scenario = scenarioOf(name, scheme);
    const fields = scenario.fields;
    const text = (id: string): string => String(fields[id] ?? "");
    const img = text("img-p");
    const sec = text("img-s");
    const live = text("live-p");
    const settings = parseSettings(fields, combined(img, sec));
    const names = namesOf(img, live);
    const eq = equipment(fields, livePreset(live));
    const beams = beamList(settings, names);
    const state = loadState(storageOf(scenario.seed === null ? undefined : scenario.seed.ui));
    const defaults = chipDefaults(beams, state.ui.behind, state.ui.fp);

    it("saves the view state of the beams as the earlier page saved it, in the same order", () => {
      expect([scenario.name, scenario.scheme]).toEqual([name, scheme]);
      expect(JSON.stringify(Object.entries(defaults.behind))).toBe(
        JSON.stringify(Object.entries(scenario.ui.behind)),
      );
      expect(JSON.stringify(Object.entries(defaults.fp))).toBe(
        JSON.stringify(Object.entries(scenario.ui.fp)),
      );
    });

    it("leaves the chips as the earlier page left them", () => {
      const html = wrapHtml(chipGroups(names, beams, defaults.behind));
      // The chips are short, so the recording holds them in full and a difference shows. The
      // shell hides the chips of a sonar that is off (`hidden`, line 269), which is not the chips'.
      const left = recorded(at, "allb-chips")?.html;
      expect(typeof left).toBe("string");
      expect(asRead(html)).toBe(asRead(String(left)));
    });

    it("says what each view and the list of beams show, as the earlier page did, where it rendered the section", () => {
      const counts = keysOf(at).filter((key) => {
        const html = recorded(at, key)?.html;
        return typeof html === "string" && /^\d+ of \d+ shown$/.test(html);
      });
      const legends = keysOf(at).filter((key) => {
        const html = recorded(at, key)?.html;
        return typeof html === "string" && html.includes("data-tosel");
      });
      if (recorded(at, "allb-cnt") === undefined) {
        expect(counts).toEqual([]);
        expect(legends).toEqual([]);
        return;
      }
      expect(counts).toHaveLength(5);
      expect(legends).toHaveLength(4);
      const legend = drawnLegend(cmpList(settings, names, eq, defaults.behind), beams, eq);
      for (const key of counts) expect(recorded(at, key)?.text).toBe(legend.count);
      for (const key of legends) {
        expect(sameContent(recorded(at, key)?.html, asRead(legend.html + CHANGE_BUTTON))).toBe(
          true,
        );
      }
    });
  });
});
