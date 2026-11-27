/**
 * Data and sources against the earlier page (legacy/src/p2.js, lines 1493 to
 * 1567), in two ways. The expected values of the first part were printed by
 * those lines themselves, run unchanged in Node against a stand-in for the
 * page's elements and its `document` (the click handler of line 1556 was
 * driven with a stand-in event), in en-US and in sv-SE. Large texts are held
 * as a digest and a length (FNV-1a of the UTF-8 bytes, as `fixtures/README.md`
 * does); the small ones in full. The second part compares what the view writes
 * with what the earlier page wrote when it was recorded in a browser
 * (`fixtures/legacy/`), in every scenario of the set.
 */
import {
  DISPUTE_KEYS,
  dataRowAt,
  dataRows,
  dataView,
  dialogTop,
  disputeView,
  esc,
  KEYS,
  pips,
} from "./datacards";
import { createFormatter } from "./format";
import { CONF } from "./sources";
import type { DataRow, Formatter, SectionView } from "./types";

/** FNV-1a, 32 bit, over bytes, as eight hex digits (fixtures/README.md). */
function fnv1aOf(bytes: Uint8Array): string {
  let h = 0x811c9dc5;
  for (const byte of bytes) h = Math.imul(h ^ byte, 0x01000193) >>> 0;
  return h.toString(16).padStart(8, "0");
}

/** A text as its digest and its length in characters, which is how the expected values hold a large one. */
const dig = (text: string): string => `${fnv1aOf(new TextEncoder().encode(text))}:${text.length}`;

/** The three fields the view reads: the first, the second imaging transducer and the live sonar. */
type Used = readonly [string, string, string];

/** What the view gets for a page whose three transducer fields hold `used`. */
function inputOf(used: Used, locale = "en-US") {
  return {
    local: { "img-p": used[0], "img-s": used[1], "live-p": used[2] },
    fmt: createFormatter(locale),
  };
}

/** The page as it starts. */
const START: Used = ["lowrance", "", "at2"];

/** The key of the element the earlier page writes the date the sources were checked to (it has no id). */
const CK_KEY =
  "sec-data > div:nth-child(2) > section:nth-child(1) > details:nth-child(1) > div:nth-child(2) > p:nth-child(1) > span:nth-child(1)";

/** The text of an element's patch, or a marker when the view does not write it. */
const NOT = "(not written)";
const textOf = (view: SectionView, key: string): string => view[key]?.text ?? NOT;
const htmlOf = (view: SectionView, key: string): string => view[key]?.html ?? NOT;

describe("what the module names", () => {
  it("writes the cards, the scale and the date of the checks, and a dispute writes its dialog", () => {
    expect([...KEYS]).toEqual(["cf-scale", "data-list", CK_KEY]);
    expect([...DISPUTE_KEYS]).toEqual([
      "dsp-who",
      "dsp-name",
      "dsp-val",
      "dsp-conf",
      "dsp-src",
      "dsp-mail",
      "dsp-copy",
      "nod-what",
    ]);
  });
});

describe("the confidence pips (pips, line 1495)", () => {
  const PIPS = (colour: string, on: number, c: string, title: string): string =>
    `<span class="pips" style="--pc:${colour}" title="Confidence ${c} of 5: ${title}">${'<i class="on"></i>'.repeat(on)}${"<i></i>".repeat(5 - Math.min(on, 5))}<b>${c}/5</b></span>`;

  it.each([
    [1, "var(--s7)", "Example or chosen value with no source"],
    [
      2,
      "var(--s2)",
      "Forum or blog figure that can't be traced to the manufacturer, or an estimate calculated from a level 3 figure",
    ],
    [3, "var(--s4)", "Dealer, retailer or magazine figure, checked that the source says it"],
    [
      4,
      "var(--s1)",
      "Manufacturer material, but incomplete (for example no measuring convention) or passed on by others",
    ],
    [5, "var(--s8)", "Manufacturer specification, checked against the source"],
  ])("level %d: %s, filled up to it, with the scale's own words", (c, colour, title) => {
    expect(pips(c)).toBe(PIPS(colour, c, String(c), title));
  });

  it("writes the figures of a level the scale does not have as the earlier page does: a colour and a title that say undefined", () => {
    expect(pips(0)).toBe(
      '<span class="pips" style="--pc:undefined" title="Confidence 0 of 5: undefined"><i></i><i></i><i></i><i></i><i></i><b>0/5</b></span>',
    );
    expect(pips(6)).toBe(
      '<span class="pips" style="--pc:undefined" title="Confidence 6 of 5: undefined"><i class="on"></i><i class="on"></i><i class="on"></i><i class="on"></i><i class="on"></i><b>6/5</b></span>',
    );
    expect(pips(2.5)).toBe(
      '<span class="pips" style="--pc:undefined" title="Confidence 2.5 of 5: undefined"><i class="on"></i><i class="on"></i><i></i><i></i><i></i><b>2.5/5</b></span>',
    );
  });

  it("writes a figure that has no level as the earlier page does: undefined everywhere", () => {
    // Added after the module was written (review round 1): `rc` of a depth or range without one
    // reaches `pips` as `undefined` on the earlier page (lines 1505 and 1495); no preset has such a figure.
    expect(pips(undefined)).toBe(
      '<span class="pips" style="--pc:undefined" title="Confidence undefined of 5: undefined"><i></i><i></i><i></i><i></i><i></i><b>undefined/5</b></span>',
    );
  });

  it("takes the title from the scale of sources.ts", () => {
    for (const c of [1, 2, 3, 4, 5] as const) expect(pips(c)).toContain(`: ${CONF[c]}"`);
  });
});

describe("the escaping of a text (esc, line 1496)", () => {
  it.each([
    ["", ""],
    ["a&b", "a&amp;b"],
    ["<x>", "&lt;x&gt;"],
    ['"q"', "&quot;q&quot;"],
    ["it's", "it's"],
    ["&amp;", "&amp;amp;"],
    ['&&<<>>""', "&amp;&amp;&lt;&lt;&gt;&gt;&quot;&quot;"],
    ["a\nb", "a\nb"],
  ])("%j becomes %j", (text, escaped) => {
    expect(esc(text)).toBe(escaped);
  });

  it("writes a value that is no text as its text, as String does", () => {
    expect(esc(5)).toBe("5");
    expect(esc(undefined)).toBe("undefined");
    expect(esc(null)).toBe("null");
  });
});

describe("where a dialog goes (placeDlg, lines 1506 to 1510)", () => {
  // [top of the button, height of the dialog, height of the window, height of the screen, top of the dialog]
  it.each([
    [100, 300, 800, 900, "250px"],
    [0, 300, 800, 900, "250px"],
    [700, 300, 800, 900, "250px"],
    [100, 900, 800, 900, "16px"],
    [100, 300, 2000, 900, "16px"],
    [1000, 300, 2000, 900, "850px"],
    [50, 200, 1400, 900, "16px"],
    [500, 200.5, 801, 900, "300.25px"],
    [-50, 300, 800, 900, "250px"],
    [100, 300, 1350, 900, "525px"],
    [100, 300, 1351, 900, "16px"],
    // The four rows below were added after the module was written (commit 356fa91), for a survivor
    // of the mutation round: the bottom margin of the dialog.
    [1900, 300, 2000, 900, "1684px"],
    [1e9, 300, 2000, 900, "1684px"],
    [1700, 300, 2000, 900, "1550px"],
    [1684, 300, 2000, 900, "1534px"],
    // End of the rows added after the module (commit 356fa91).
    // The two rows below were added after the module was written (review round 1), for the order
    // of the arithmetic of `1.5 * screenHeight`: with a screen 1200 high, `1.5 / (1 / 1200)` is
    // 1799.9999999999998, and a window 1800 high is not more than the earlier page's 1800.
    [100, 300, 1800, 1200, "750px"],
    [1700, 300, 1800, 1200, "750px"],
    // The two rows below were added after the module was written (review round 2, finding 4): a
    // dialog height of a whole number of 1/60 px (Firefox's layout unit), where
    // `windowHeight - height - 16` and `windowHeight - (height + 16)` write another last digit.
    [1744, 225.36666666666667, 1251, 768, "1009.6333333333332px"],
    [1744, 211.08333333333334, 1251, 768, "1023.9166666666667px"],
    [Number.NaN, 300, 800, 900, "250px"],
    [100, Number.NaN, 800, 900, "NaNpx"],
    [100, 300, 0, 0, "16px"],
    [10.25, 99.5, 640.75, 480, "270.625px"],
    [1e9, 300, 800, 900, "250px"],
  ])(
    "button at %d, dialog %d high, window %d, screen %d: top %s",
    (nearTop, height, windowHeight, screenHeight, top) => {
      expect(dialogTop(nearTop, height, windowHeight, screenHeight)).toBe(top);
    },
  );
});

describe("the figure a button names (the lookup of lines 1558 and 1746)", () => {
  const rows = dataRows(inputOf(START));
  const named = (row: DataRow | undefined): string =>
    row ? `${row.who.slice(0, 10)}|${row.name}` : "undefined";

  it.each([
    ["d0", "Lowrance A|Frequencies"],
    ["d5", "Lowrance A|DownScan 700 kHz CHIRP, fan width"],
    ["d119", "All imagin|SideScan fan thickness, front to back"],
    ["d120", "undefined"],
    ["d", "Lowrance A|Frequencies"],
    ["x3", "Lowrance A|2D High CHIRP 200 kHz, cone width"],
    ["d-1", "undefined"],
    ["d1.5", "undefined"],
    ["d 7 ", "Lowrance A|DownScan 1200 kHz CHIRP, fan width"],
    ["d0x10", "Lowrance A|2D Medium CHIRP 83 kHz, max depth"],
    ["d1e1", "Lowrance A|SideScan 455 kHz CHIRP, max range per side"],
    ["d+2", "Lowrance A|2D Medium CHIRP 83 kHz, max depth"],
    ["d00", "Lowrance A|Frequencies"],
    ["", "Lowrance A|Frequencies"],
  ])("the attribute %j names %s", (attribute, expected) => {
    expect(named(dataRowAt(rows, attribute))).toBe(expected);
  });
});

describe("the figures (drow and buildData, lines 1497 to 1545)", () => {
  const rows = dataRows(inputOf(START));
  const canon = (list: readonly DataRow[]): unknown[] =>
    list.map((r) => [
      r.who,
      r.name,
      r.val,
      r.c,
      r.text,
      r.source ? [r.source.t, r.source.u] : null,
      r.noDispute,
      r.helpKey ?? null,
      r.helpValue ?? null,
    ]);

  it("lists 120 figures: 112 with a '?' button, and the 10 of the two presets named Other that cannot be disputed", () => {
    expect(rows).toHaveLength(120);
    expect(rows.filter((r) => r.helpKey !== undefined)).toHaveLength(112);
    expect(rows.flatMap((r, i) => (r.noDispute ? [i] : []))).toEqual([
      100, 101, 102, 103, 104, 105, 106, 107, 116, 117,
    ]);
  });

  it("holds each figure as the earlier page's list does", () => {
    expect(dig(JSON.stringify(canon(rows)))).toBe("7b139812:39839");
  });

  it("holds the first figure of each kind as the earlier page does", () => {
    const LOWRANCE = "Lowrance Active Imaging HD 3-in-1 (Medium/High)";
    const AIHD = [
      "Lowrance Active Imaging HD installation manual (988-13115-001), specifications",
      "https://d347awuzx0kdse.cloudfront.net/advtridentb2c/product-download/000-16062-001_um.pdf",
    ];
    const HT1 = [
      "The Hull Truth forum: Lowrance HD 3-in-1 transducer cone angles",
      "https://www.thehulltruth.com/marine-electronics-forum/1389496-lowrance-hd-3-1-transducer-cone-angles.html",
    ];
    expect(canon([0, 1, 2, 9, 11, 13, 105, 116, 118].map((i) => rows[i] as DataRow))).toEqual([
      [
        LOWRANCE,
        "Frequencies",
        "6 listed",
        5,
        "Medium CHIRP 83 kHz, High CHIRP 200 kHz, DownScan 700 kHz CHIRP, DownScan 1200 kHz CHIRP, SideScan 455 kHz CHIRP, SideScan 1075 kHz CHIRP",
        AIHD,
        false,
        null,
        null,
      ],
      [
        LOWRANCE,
        "2D Medium CHIRP 83 kHz, cone width",
        "50°",
        2,
        "One user on The Hull Truth forum, calculated from the 200 kHz figure; for the non-HD Active Imaging",
        HT1,
        false,
        "cone",
        50,
      ],
      [
        LOWRANCE,
        "2D Medium CHIRP 83 kHz, max depth",
        "305 m",
        5,
        "Maximum depth in the specification",
        AIHD,
        false,
        "maxd",
        305,
      ],
      [
        LOWRANCE,
        "SideScan 455 kHz CHIRP, fan width",
        "85°",
        1,
        "Chosen so the fan reaches straight down (boulder test). A forum user quotes Lowrance support as 58° per side, without saying how it is aimed.",
        [
          "The Hull Truth forum: Lowrance 3-in-1 side scan angle (support quoted as 58° per side)",
          "https://www.thehulltruth.com/marine-electronics-forum/1322801-lowrance-3-1-side-scan-angle.html",
        ],
        false,
        "side",
        85,
      ],
      [
        LOWRANCE,
        "SideScan 1075 kHz CHIRP, fan width",
        "36°",
        1,
        "Estimate: 455 kHz × 455/1075",
        null,
        false,
        "side",
        36,
      ],
      [LOWRANCE, "SideScan upper fan edge", "5°", 1, "An example", null, false, "sso", 5],
      [
        "Other (Garmin or anything else: enter your own)",
        "Side imaging Low, fan width",
        "85°",
        1,
        "Example",
        null,
        true,
        "side",
        85,
      ],
      ["Other (enter your own)", "Fan width", "135°", 1, "Example", null, true, "atw", 135],
      [
        "All imaging transducers",
        "DownScan fan thickness, front to back",
        "3°",
        1,
        "Not published; an example",
        null,
        false,
        "dst",
        3,
      ],
    ]);
  });

  it("does not depend on which transducers are in use", () => {
    const others: Used[] = [
      ["other", "", "other"],
      ["hb_xm9hw", "hb_xm14hw", "ml2"],
      ["x", "y", "z"],
    ];
    for (const used of others) expect(canon(dataRows(inputOf(used)))).toEqual(canon(rows));
  });

  it("writes every maximum depth and range as whole metres with the formatter, in en-US and in sv-SE", () => {
    const digits: number[] = [];
    const spy: Formatter = {
      ...createFormatter("en-US"),
      num: (n, d) => {
        digits.push(d);
        return createFormatter("en-US").num(n, d);
      },
    };
    const own = dataRows({ ...inputOf(START), fmt: spy });
    expect(digits.length).toBeGreaterThan(0);
    expect(new Set(digits)).toEqual(new Set([0]));
    expect(canon(own)).toEqual(canon(rows));
    expect(canon(dataRows(inputOf(START, "sv-SE")))).toEqual(canon(rows));
  });

  it("has a level of 5 and a source for each of the 38 depths and ranges: the presets give a level wherever they give a depth", () => {
    // The earlier page writes a row for `c.r` with `c.rc` as its level; `rc` is set wherever `r` is.
    const limits = rows.filter((r) => r.helpKey === "maxd" || r.helpKey === "ssr");
    expect(limits).toHaveLength(38);
    for (const r of limits) {
      expect(r.c).toBe(5);
      expect(r.source).toBeDefined();
    }
  });
});

describe("the cards (buildData, lines 1511 to 1555), as each choice of transducers marks them in use", () => {
  // The used transducers, and the digest and the length of the html of the list of cards.
  const LISTS: readonly (readonly [Used, string])[] = [
    [["lowrance", "", "at2"], "04279094:102710"],
    [["lowrance_nose", "", "at2"], "b9678c72:102710"],
    [["hb_xm9hw", "", "at2"], "5c2986ec:102710"],
    [["hb_xm14hw", "", "at2"], "0133aa26:102710"],
    [["hb_xm14cmsi", "", "at2"], "899ca916:102710"],
    [["hb_xnt9hw150", "", "at2"], "e9c54994:102710"],
    [["hb_xm920", "", "at2"], "e1eac134:102710"],
    [["other", "", "at2"], "8dc3b708:102743"],
    [["lowrance", "", "at2xl"], "e70d8e76:102710"],
    [["lowrance", "", "lvs34"], "2e2b4516:102710"],
    [["lowrance", "", "ml2"], "18735e1e:102710"],
    [["lowrance", "", "other"], "ad4ebb22:102743"],
    [["other", "", "other"], "6242675c:102710"],
    [["lowrance", "lowrance_nose", "at2"], "f0158260:102743"],
    [["hb_xm9hw", "hb_xm14hw", "ml2"], "775c81d6:102743"],
    [["hb_xm14cmsi", "hb_xnt9hw150", "lvs34"], "1c389efa:102743"],
    [["hb_xm920", "lowrance", "other"], "3bc28fe4:102776"],
    [["", "", ""], "0ba780f6:102644"],
    [["x", "y", "z"], "0ba780f6:102644"],
  ];

  it.each(LISTS)("%j writes the list the earlier page wrote", (used, digest) => {
    expect(dig(htmlOf(dataView(inputOf(used)), "data-list"))).toBe(digest);
  });

  it("gives the same list in sv-SE", () => {
    for (const [used, digest] of LISTS) {
      expect(dig(htmlOf(dataView(inputOf(used, "sv-SE")), "data-list"))).toBe(digest);
    }
  });

  /** The ids of the cards the list marks in use. */
  const inUse = (used: Used): string[] =>
    [
      ...htmlOf(dataView(inputOf(used)), "data-list").matchAll(
        /data-sub="([^"]+)"><summary><span class="eyebrow">[^<]*<span class="inuse">/g,
      ),
    ].map((m) => String(m[1]));

  it.each([
    [
      ["lowrance", "", "at2"],
      ["dt-lowrance", "dt-at2-l"],
    ],
    [
      ["other", "", "other"],
      ["dt-other", "dt-other-l"],
    ],
    [
      ["lowrance", "lowrance", "at2"],
      ["dt-lowrance", "dt-at2-l"],
    ],
    [
      ["hb_xm9hw", "hb_xm14hw", "ml2"],
      ["dt-hb_xm9hw", "dt-hb_xm14hw", "dt-ml2-l"],
    ],
    [["", "", ""], []],
    [["x", "y", "z"], []],
  ] as const)("%j marks %j in use", (used, ids) => {
    expect(inUse(used)).toEqual([...ids]);
  });

  it("marks the card of Other in use for a live sonar that is Other, and the live card of Other for an imaging one (the two share a key)", () => {
    expect(inUse(["lowrance", "", "other"])).toEqual(["dt-lowrance", "dt-other", "dt-other-l"]);
    expect(inUse(["other", "", "at2"])).toEqual(["dt-other", "dt-at2-l", "dt-other-l"]);
    expect(inUse(["hb_xm920", "lowrance", "other"])).toEqual([
      "dt-lowrance",
      "dt-hb_xm920",
      "dt-other",
      "dt-other-l",
    ]);
  });

  it("lists a card for each imaging transducer, then each live sonar, then the fan thicknesses", () => {
    const ids = [...htmlOf(dataView(inputOf(START)), "data-list").matchAll(/data-sub="([^"]+)"/g)];
    expect(ids.map((m) => m[1])).toEqual([
      "dt-lowrance",
      "dt-lowrance_nose",
      "dt-hb_xm9hw",
      "dt-hb_xm14hw",
      "dt-hb_xm14cmsi",
      "dt-hb_xnt9hw150",
      "dt-hb_xm920",
      "dt-other",
      "dt-at2-l",
      "dt-at2xl-l",
      "dt-lvs34-l",
      "dt-ml2-l",
      "dt-other-l",
      "dt-gen",
    ]);
  });

  it("writes the first figure of the first card as the earlier page does, with a source and without a '?' button", () => {
    expect(
      htmlOf(dataView(inputOf(START)), "data-list").startsWith(
        '<section class="panel"><details class="sub" data-sub="dt-lowrance"><summary><span class="eyebrow">Lowrance Active Imaging HD 3-in-1 (Medium/High)<span class="inuse">in use</span></span></summary><div class="subb"><div class="dtab"><div class="drow"><span class="dn">Frequencies</span><span class="dv">6 listed</span><span class="ds">Medium CHIRP 83 kHz, High CHIRP 200 kHz, DownScan 700 kHz CHIRP, DownScan 1200 kHz CHIRP, SideScan 455 kHz CHIRP, SideScan 1075 kHz CHIRP<br>Source: <a href="https://d347awuzx0kdse.cloudfront.net/advtridentb2c/product-download/000-16062-001_um.pdf" target="_blank" rel="noopener">Lowrance Active Imaging HD installation manual (988-13115-001), specifications</a> · checked 30 Sep 2026</span><span class="dm"><span class="pips" style="--pc:var(--s8)" title="Confidence 5 of 5: Manufacturer specification, checked against the source"><i class="on"></i><i class="on"></i><i class="on"></i><i class="on"></i><i class="on"></i><b>5/5</b></span><button type="button" class="mini" data-dispute="d0">Dispute</button></span></div><div class="drow"><span class="dn">2D Medium CHIRP 83 kHz, cone width<button type="button" class="qm" data-hdat="d1" aria-label="Show what this figure means">?</button></span>',
      ),
    ).toBe(true);
  });

  it("ends the list with the card of the fan thicknesses, which is never in use", () => {
    expect(
      htmlOf(dataView(inputOf(START)), "data-list").endsWith(
        '<section class="panel"><details class="sub" data-sub="dt-gen"><summary><span class="eyebrow">Fan thickness (all imaging transducers)</span></summary><div class="subb"><div class="dtab"><div class="drow"><span class="dn">DownScan fan thickness, front to back<button type="button" class="qm" data-hdat="d118" aria-label="Show what this figure means">?</button></span><span class="dv">3°</span><span class="ds">Not published; an example</span><span class="dm"><span class="pips" style="--pc:var(--s7)" title="Confidence 1 of 5: Example or chosen value with no source"><i class="on"></i><i></i><i></i><i></i><i></i><b>1/5</b></span><button type="button" class="mini" data-dispute="d118">Dispute</button></span></div><div class="drow"><span class="dn">SideScan fan thickness, front to back<button type="button" class="qm" data-hdat="d119" aria-label="Show what this figure means">?</button></span><span class="dv">2°</span><span class="ds">Not published; an example</span><span class="dm"><span class="pips" style="--pc:var(--s7)" title="Confidence 1 of 5: Example or chosen value with no source"><i class="on"></i><i></i><i></i><i></i><i></i><b>1/5</b></span><button type="button" class="mini" data-dispute="d119">Dispute</button></span></div></div></div></details></section>',
      ),
    ).toBe(true);
  });

  it("writes the scale of the five levels, highest first, and the date of the checks", () => {
    const view = dataView(inputOf(START));
    expect(dig(htmlOf(view, "cf-scale"))).toBe("fc07bb54:2006");
    expect(
      htmlOf(view, "cf-scale").startsWith('<div><dt><span class="pips" style="--pc:var(--s8)"'),
    ).toBe(true);
    expect(
      htmlOf(view, "cf-scale").endsWith(
        '<div><dt><span class="pips" style="--pc:var(--s7)" title="Confidence 1 of 5: Example or chosen value with no source"><i class="on"></i><i></i><i></i><i></i><i></i><b>1/5</b></span></dt><dd style="font-family:var(--font-body);text-align:left;margin-left:12px">Example or chosen value with no source</dd></div>',
      ),
    ).toBe(true);
    expect(view[CK_KEY]).toEqual({ text: "30 Sep 2026" });
  });

  it("writes exactly the three elements of KEYS, each with the content only", () => {
    const view = dataView(inputOf(START));
    expect(Object.keys(view).sort()).toEqual([...KEYS].sort());
    expect(Object.keys(view["data-list"] ?? {})).toEqual(["html"]);
    expect(Object.keys(view["cf-scale"] ?? {})).toEqual(["html"]);
    expect(Object.keys(view[CK_KEY] ?? {})).toEqual(["text"]);
  });

  it("reads a field that is not a text as no choice", () => {
    const view = dataView({ ...inputOf(START), local: { "img-p": 5, "img-s": 1, "live-p": 2 } });
    expect(dig(htmlOf(view, "data-list"))).toBe("0ba780f6:102644");
  });
});

describe("a dispute (the click handler of lines 1556 to 1567)", () => {
  const rows = dataRows(inputOf(START));
  const viewOf = (i: number): SectionView => disputeView(rows[i] as DataRow);

  // Added after the module was written (review round 1). The expected values were printed by the
  // earlier page's lines for a figure whose level is `undefined`.
  it("writes a figure that has no level with the word undefined in the dialog, the mail and the copy", () => {
    const row: DataRow = {
      who: "W",
      name: "Nm",
      val: "5°",
      c: undefined,
      text: "T",
      source: undefined,
      noDispute: false,
      helpKey: undefined,
      helpValue: undefined,
    };
    const view = disputeView(row);
    expect(view["dsp-conf"]).toEqual({
      html: '<span class="pips" style="--pc:undefined" title="Confidence undefined of 5: undefined"><i></i><i></i><i></i><i></i><i></i><b>undefined/5</b></span> undefined',
    });
    expect(view["dsp-mail"]?.attrs?.href).toBe(
      "mailto:sonar@sugo.se?subject=Dispute%3A%20W%2C%20Nm&body=Transducer%3A%20W%0AFigure%3A%20Nm%0AValue%20in%20the%20calculator%3A%205%C2%B0%20(confidence%20undefined%2F5)%0ACurrent%20source%3A%20T%0A%0AWhat%20I%20think%20it%20should%20be%3A%0A%0ASource%20(link)%3A%0A",
    );
    expect(view["dsp-copy"]?.attrs?.["data-copy"]).toBe(
      "To: sonar@sugo.se\nSubject: Dispute: W, Nm\n\nTransducer: W\nFigure: Nm\nValue in the calculator: 5° (confidence undefined/5)\nCurrent source: T\n\nWhat I think it should be:\n\nSource (link):\n",
    );
  });

  /** What the earlier page's dialog holds after a click, in one shape for every row. */
  const canon = (view: SectionView) => ({
    who: textOf(view, "dsp-who") === NOT ? "" : textOf(view, "dsp-who"),
    name: textOf(view, "dsp-name") === NOT ? "" : textOf(view, "dsp-name"),
    val: textOf(view, "dsp-val") === NOT ? "" : textOf(view, "dsp-val"),
    conf: htmlOf(view, "dsp-conf") === NOT ? "" : htmlOf(view, "dsp-conf"),
    src: htmlOf(view, "dsp-src") === NOT ? "" : htmlOf(view, "dsp-src"),
    mail: view["dsp-mail"]?.attrs?.href ?? "",
    copy: view["dsp-copy"]?.attrs?.["data-copy"] ?? null,
    nod: textOf(view, "nod-what") === NOT ? "" : textOf(view, "nod-what"),
  });

  it("holds the dialog of every one of the 120 figures as the earlier page filled it", () => {
    expect(dig(JSON.stringify(rows.map((_, i) => canon(viewOf(i)))))).toBe("2ea767ec:205443");
  });

  it("fills the dialog with the figure, its level and its source with a link, and a mail and a copy of the same text", () => {
    const view = viewOf(0);
    expect(Object.keys(view).sort()).toEqual(
      ["dsp-conf", "dsp-copy", "dsp-mail", "dsp-name", "dsp-src", "dsp-val", "dsp-who"].sort(),
    );
    expect(view["dsp-who"]).toEqual({ text: "Lowrance Active Imaging HD 3-in-1 (Medium/High)" });
    expect(view["dsp-name"]).toEqual({ text: "Frequencies" });
    expect(view["dsp-val"]).toEqual({ text: "6 listed" });
    expect(view["dsp-conf"]).toEqual({
      html: '<span class="pips" style="--pc:var(--s8)" title="Confidence 5 of 5: Manufacturer specification, checked against the source"><i class="on"></i><i class="on"></i><i class="on"></i><i class="on"></i><i class="on"></i><b>5/5</b></span> Manufacturer specification, checked against the source',
    });
    expect(view["dsp-src"]).toEqual({
      html: 'Medium CHIRP 83 kHz, High CHIRP 200 kHz, DownScan 700 kHz CHIRP, DownScan 1200 kHz CHIRP, SideScan 455 kHz CHIRP, SideScan 1075 kHz CHIRP<br><a href="https://d347awuzx0kdse.cloudfront.net/advtridentb2c/product-download/000-16062-001_um.pdf" target="_blank" rel="noopener">Lowrance Active Imaging HD installation manual (988-13115-001), specifications</a>',
    });
    expect(view["dsp-mail"]).toEqual({
      attrs: {
        href: "mailto:sonar@sugo.se?subject=Dispute%3A%20Lowrance%20Active%20Imaging%20HD%203-in-1%20(Medium%2FHigh)%2C%20Frequencies&body=Transducer%3A%20Lowrance%20Active%20Imaging%20HD%203-in-1%20(Medium%2FHigh)%0AFigure%3A%20Frequencies%0AValue%20in%20the%20calculator%3A%206%20listed%20(confidence%205%2F5)%0ACurrent%20source%3A%20Medium%20CHIRP%2083%20kHz%2C%20High%20CHIRP%20200%20kHz%2C%20DownScan%20700%20kHz%20CHIRP%2C%20DownScan%201200%20kHz%20CHIRP%2C%20SideScan%20455%20kHz%20CHIRP%2C%20SideScan%201075%20kHz%20CHIRP%20(https%3A%2F%2Fd347awuzx0kdse.cloudfront.net%2Fadvtridentb2c%2Fproduct-download%2F000-16062-001_um.pdf)%0A%0AWhat%20I%20think%20it%20should%20be%3A%0A%0ASource%20(link)%3A%0A",
      },
    });
    expect(view["dsp-copy"]).toEqual({
      attrs: {
        "data-copy":
          "To: sonar@sugo.se\nSubject: Dispute: Lowrance Active Imaging HD 3-in-1 (Medium/High), Frequencies\n\nTransducer: Lowrance Active Imaging HD 3-in-1 (Medium/High)\nFigure: Frequencies\nValue in the calculator: 6 listed (confidence 5/5)\nCurrent source: Medium CHIRP 83 kHz, High CHIRP 200 kHz, DownScan 700 kHz CHIRP, DownScan 1200 kHz CHIRP, SideScan 455 kHz CHIRP, SideScan 1075 kHz CHIRP (https://d347awuzx0kdse.cloudfront.net/advtridentb2c/product-download/000-16062-001_um.pdf)\n\nWhat I think it should be:\n\nSource (link):\n",
      },
    });
  });

  it("writes a figure without a source with no link in the dialog and none in the mail", () => {
    const view = viewOf(11);
    expect(view["dsp-src"]).toEqual({ html: "Estimate: 455 kHz × 455/1075" });
    expect(view["dsp-conf"]?.html).toBe(
      '<span class="pips" style="--pc:var(--s7)" title="Confidence 1 of 5: Example or chosen value with no source"><i class="on"></i><i></i><i></i><i></i><i></i><b>1/5</b></span> Example or chosen value with no source',
    );
    expect(view["dsp-mail"]?.attrs?.href).toBe(
      "mailto:sonar@sugo.se?subject=Dispute%3A%20Lowrance%20Active%20Imaging%20HD%203-in-1%20(Medium%2FHigh)%2C%20SideScan%201075%20kHz%20CHIRP%2C%20fan%20width&body=Transducer%3A%20Lowrance%20Active%20Imaging%20HD%203-in-1%20(Medium%2FHigh)%0AFigure%3A%20SideScan%201075%20kHz%20CHIRP%2C%20fan%20width%0AValue%20in%20the%20calculator%3A%2036%C2%B0%20(confidence%201%2F5)%0ACurrent%20source%3A%20Estimate%3A%20455%20kHz%20%C3%97%20455%2F1075%0A%0AWhat%20I%20think%20it%20should%20be%3A%0A%0ASource%20(link)%3A%0A",
    );
    expect(view["dsp-copy"]?.attrs?.["data-copy"]).toBe(
      "To: sonar@sugo.se\nSubject: Dispute: Lowrance Active Imaging HD 3-in-1 (Medium/High), SideScan 1075 kHz CHIRP, fan width\n\nTransducer: Lowrance Active Imaging HD 3-in-1 (Medium/High)\nFigure: SideScan 1075 kHz CHIRP, fan width\nValue in the calculator: 36° (confidence 1/5)\nCurrent source: Estimate: 455 kHz × 455/1075\n\nWhat I think it should be:\n\nSource (link):\n",
    );
  });

  it("writes a fan thickness, which has no source key, with the text of its source only", () => {
    const view = viewOf(118);
    expect(view["dsp-src"]).toEqual({ html: "Not published; an example" });
    expect(view["dsp-copy"]?.attrs?.["data-copy"]).toBe(
      "To: sonar@sugo.se\nSubject: Dispute: All imaging transducers, DownScan fan thickness, front to back\n\nTransducer: All imaging transducers\nFigure: DownScan fan thickness, front to back\nValue in the calculator: 3° (confidence 1/5)\nCurrent source: Not published; an example\n\nWhat I think it should be:\n\nSource (link):\n",
    );
  });

  it("says that a figure of a preset named Other cannot be disputed, and writes nothing else", () => {
    for (const i of [100, 101, 102, 103, 104, 105, 106, 107, 116, 117]) {
      expect(Object.keys(viewOf(i))).toEqual(["nod-what"]);
    }
    expect(viewOf(105)).toEqual({
      "nod-what": {
        text: "Other (Garmin or anything else: enter your own): Side imaging Low, fan width, 85°",
      },
    });
    expect(viewOf(116)).toEqual({
      "nod-what": { text: "Other (enter your own): Fan width, 135°" },
    });
  });

  it("escapes the names in the dialog's html and not in its texts, and the figure's source text in both", () => {
    const row: DataRow = {
      who: "A&B <x>",
      name: 'N "q"',
      val: "1<2",
      c: 3,
      text: 't & <t> "t"',
      source: { t: "S & <s>", u: "https://x/?a=1&b=2" },
      noDispute: false,
      helpKey: undefined,
      helpValue: undefined,
    };
    const view = disputeView(row);
    expect(view["dsp-who"]).toEqual({ text: "A&B <x>" });
    expect(view["dsp-name"]).toEqual({ text: 'N "q"' });
    expect(view["dsp-val"]).toEqual({ text: "1<2" });
    expect(view["dsp-src"]).toEqual({
      html: 't &amp; &lt;t&gt; &quot;t&quot;<br><a href="https://x/?a=1&b=2" target="_blank" rel="noopener">S &amp; &lt;s&gt;</a>',
    });
    expect(view["dsp-conf"]?.html).toBe(`${pips(3)} ${esc(CONF[3])}`);
    expect(view["dsp-mail"]?.attrs?.href).toBe(
      "mailto:sonar@sugo.se?subject=Dispute%3A%20A%26B%20%3Cx%3E%2C%20N%20%22q%22&body=Transducer%3A%20A%26B%20%3Cx%3E%0AFigure%3A%20N%20%22q%22%0AValue%20in%20the%20calculator%3A%201%3C2%20(confidence%203%2F5)%0ACurrent%20source%3A%20t%20%26%20%3Ct%3E%20%22t%22%20(https%3A%2F%2Fx%2F%3Fa%3D1%26b%3D2)%0A%0AWhat%20I%20think%20it%20should%20be%3A%0A%0ASource%20(link)%3A%0A",
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

/** The section of the page the cards are recorded in. */
const SECTION_FILE = "data";

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
 * `<i/>`, and `innerHTML` reads it as `<i></i>`; a `"` in a text, which the
 * script wrote as `&quot;`, is read back as the character.
 */
const asRead = (html: string): string =>
  html.replace(/<([a-z]+)((?:\s[^<>]*?)?)\/>/g, "<$1$2></$1>").replace(/&quot;/g, '"');

/** A recorded content equals a content: in full, or as the digest and the length of its UTF-8 bytes. */
function sameContent(recordedValue: string | Digest | undefined, own: string): boolean {
  if (recordedValue === undefined) return false;
  if (typeof recordedValue === "string") return recordedValue === own;
  return (
    recordedValue.fnv1a === fnv1aOf(new TextEncoder().encode(own)) &&
    recordedValue.length === own.length
  );
}

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

  it("has a recording of the list in every scenario, and of its date and scale", () => {
    for (const [name, scheme] of PAIRS) {
      const at = `${name}/${scheme}`;
      expect(recorded(at, "data-list")).toBeDefined();
      expect(recorded(at, "cf-scale")).toBeDefined();
      expect(recorded(at, CK_KEY)).toBeDefined();
    }
  });

  describe.each(PAIRS)("%s, %s", (name, scheme) => {
    const at = `${name}/${scheme}`;
    const scenario = scenarioOf(name, scheme);
    const fields = scenario.fields;
    const text = (id: string): string => String(fields[id] ?? "");
    const view = dataView({
      local: { "img-p": text("img-p"), "img-s": text("img-s"), "live-p": text("live-p") },
      fmt: createFormatter(scenario.locale),
    });

    it("leaves the list, the scale and the date as the earlier page left them, and writes no other element", () => {
      expect([scenario.name, scenario.scheme]).toEqual([name, scheme]);
      expect(Object.keys(view).sort()).toEqual([...KEYS].sort());
      const list = recorded(at, "data-list");
      expect(sameContent(list?.html, asRead(view["data-list"]?.html ?? ""))).toBe(true);
      const scale = recorded(at, "cf-scale");
      expect(sameContent(scale?.html, asRead(view["cf-scale"]?.html ?? ""))).toBe(true);
      expect(recorded(at, CK_KEY)?.text).toBe(view[CK_KEY]?.text);
    });
  });
});
