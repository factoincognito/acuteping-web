/**
 * The choice of transducers against the earlier page (legacy/src/p2.js, lines
 * 167 and 170 to 222), in two ways. The expected values of the first part were
 * printed by those lines themselves, run unchanged in Node against a stand-in
 * for the page's elements; a long text is held as its digest and its length.
 * The second part compares what the functions write with what the earlier page
 * wrote when it was recorded in a browser (`fixtures/legacy/`).
 */
import { IMG, LIVE } from "./presets";
import { LIVE_RATED } from "./sources";
import {
  alignOf,
  anglesView,
  combined,
  coneLabel,
  frequencyChoice,
  KEYS,
  liveAnglesView,
  livePreset,
  liveView,
  nameFor,
  namesOf,
  namesView,
  primary,
  primaryView,
  secondary,
  secondaryView,
  THICKNESS,
  TRANSDUCERS,
} from "./transducers";
import type { Cone, ImagingPreset, Preset, SavedValue, SectionView, UiState } from "./types";

/** FNV-1a, 32 bit, over the UTF-8 bytes, as eight hex digits (the digest of fixtures/README.md). */
function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(text)) {
    h = Math.imul(h ^ byte, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** A text as the expected values hold it: its digest and its length. */
const digest = (text: string): [string, number] => [fnv1a(text), text.length];

/** A value as the lines below hold it: nothing for one that is not there. */
const shown = (v: number | string | undefined): string => (v === undefined ? "" : String(v));

/** One frequency as a line: name (`-`: none), frequency, angle, depth, the rating, and `sec` when a second transducer adds it. */
const coneLine = (c: Cone): string =>
  [
    c.n === undefined ? "-" : c.n,
    c.f,
    c.a,
    shown(c.r),
    shown(c.c),
    shown(c.s),
    shown(c.rc),
    shown(c.rs),
    c.sec ? "sec" : "",
  ].join("|");

/** A preset as the expected values hold it; the order of the keys is the order of the digest. */
const presetLines = (p: Preset) => ({
  label: p.label,
  names: p.names,
  note: digest(p.note),
  edge: p.edge,
  edgeSrc: p.edgeSrc,
  cone: p.cone.map(coneLine),
  down: p.down.map(coneLine),
  side: p.side.map(coneLine),
  keys: Object.keys(p).join(","),
});

/** The html a view writes to an element, or a text that equals nothing when it writes none. */
const htmlOf = (view: SectionView, key: string): string => view[key]?.html ?? `no html for ${key}`;

const IMAGING_KEYS = Object.keys(IMG);
const LIVE_KEYS = Object.keys(LIVE);
/** Every imaging key, no key, and a key that names nothing. */
const ANY_IMAGING = [...IMAGING_KEYS, "", "nope"];
const ANY_LIVE = [...LIVE_KEYS, "", "nope"];
const HUMMINBIRD = ["hb_xm9hw", "hb_xm14hw", "hb_xm14cmsi", "hb_xnt9hw150", "hb_xm920"];
const transducers: Readonly<Record<string, ImagingPreset>> = TRANSDUCERS;

describe("TRANSDUCERS: the imaging presets as the page offers them", () => {
  it("gives each its brand and its short name", () => {
    expect(
      Object.entries(transducers).map(([key, p]) => `${key} brand=${p.brand} short=${p.short}`),
    ).toEqual([
      "lowrance brand=lowrance short=transom HD",
      "lowrance_nose brand=lowrance short=nosecone",
      "hb_xm9hw brand=humminbird short=XM 9 HW",
      "hb_xm14hw brand=humminbird short=XM 14 HW",
      "hb_xm14cmsi brand=humminbird short=XM 14 CMSI",
      "hb_xnt9hw150 brand=humminbird short=XNT 9 HW",
      "hb_xm920 brand=humminbird short=XM 9 20",
      "other brand=other short=other",
    ]);
  });

  it("keeps everything a rated preset has", () => {
    for (const p of Object.values(transducers)) {
      expect(Object.keys(p)).toEqual([
        "label",
        "names",
        "note",
        "cone",
        "down",
        "side",
        "edge",
        "edgeSrc",
        "fc",
        "fs",
        "ec",
        "brand",
        "short",
      ]);
    }
    expect(presetLines(TRANSDUCERS.lowrance).cone).toEqual([
      "Medium CHIRP|83 kHz|50|305|2|ht1|5|aihd|",
      "High CHIRP|200 kHz|20|305|2|ht1|5|aihd|",
    ]);
  });
});

describe("THICKNESS: the fan thicknesses the page starts with", () => {
  it("is 3 degrees for down imaging and 2 for side imaging", () => {
    expect(THICKNESS).toEqual({ dst: 3, sst: 2 });
  });
});

describe("primaryView: the list of imaging transducers", () => {
  it("offers every preset, in order, by its label", () => {
    const html = htmlOf(primaryView(), "img-p");
    expect(digest(html)).toEqual(["b32bc4ad", 561]);
    expect(
      html.startsWith(
        '<option value="lowrance">Lowrance Active Imaging HD 3-in-1 (Medium/High)</option>',
      ),
    ).toBe(true);
    expect(
      html.endsWith(
        '<option value="other">Other (Garmin or anything else: enter your own)</option>',
      ),
    ).toBe(true);
    expect(Object.keys(primaryView())).toEqual(["img-p"]);
  });
});

describe("primary: the chosen imaging transducer", () => {
  it.each(IMAGING_KEYS)("is the preset of the key %s", (key) => {
    expect(primary(key)).toBe(transducers[key]);
  });

  it("is the first Lowrance preset when nothing, or nothing known, is chosen", () => {
    expect(primary("")).toBe(TRANSDUCERS.lowrance);
    expect(primary("nope")).toBe(TRANSDUCERS.lowrance);
  });
});

describe("livePreset: the chosen live sonar", () => {
  const live: Readonly<Record<string, unknown>> = LIVE_RATED;

  it.each(LIVE_KEYS)("is the preset of the key %s", (key) => {
    expect(livePreset(key)).toBe(live[key]);
  });

  it("is ActiveTarget 2 when nothing, or nothing known, is chosen", () => {
    expect(livePreset("")).toBe(LIVE_RATED.at2);
    expect(livePreset("nope")).toBe(LIVE_RATED.at2);
  });
});

describe("secondary: the second imaging transducer", () => {
  it("is the chosen preset itself", () => {
    expect(secondary("lowrance", "lowrance_nose")).toBe(TRANSDUCERS.lowrance_nose);
  });

  it.each(ANY_IMAGING)("with the first transducer %j: any other preset, of any brand", (first) => {
    for (const second of ANY_IMAGING) {
      const taken = second !== "" && second !== "nope" && second !== first;
      expect(secondary(first, second)).toBe(taken ? transducers[second] : null);
    }
  });
});

describe("secondaryView: the list of second transducers", () => {
  // first transducer, the presets offered, whether the field is hidden, digest and length of the html
  const expected: [string, string[], boolean, string, number][] = [
    ["lowrance", ["lowrance_nose"], false, "04e0dae2", 116],
    ["lowrance_nose", ["lowrance"], false, "e5da1e3b", 111],
    ["hb_xm9hw", ["hb_xm14hw", "hb_xm14cmsi", "hb_xnt9hw150", "hb_xm920"], false, "6c6dd146", 288],
    ["hb_xm14hw", ["hb_xm9hw", "hb_xm14cmsi", "hb_xnt9hw150", "hb_xm920"], false, "bd96d996", 286],
    ["hb_xm14cmsi", ["hb_xm9hw", "hb_xm14hw", "hb_xnt9hw150", "hb_xm920"], false, "cef00942", 283],
    ["hb_xnt9hw150", ["hb_xm9hw", "hb_xm14hw", "hb_xm14cmsi", "hb_xm920"], false, "2ec5cb78", 269],
    ["hb_xm920", ["hb_xm9hw", "hb_xm14hw", "hb_xm14cmsi", "hb_xnt9hw150"], false, "5da62a16", 288],
    ["other", [], true, "6440cc54", 30],
    // No first transducer, or an unknown one: the brand is the fallback's, and the fallback itself is offered.
    ["", ["lowrance", "lowrance_nose"], false, "61416f65", 197],
    ["nope", ["lowrance", "lowrance_nose"], false, "61416f65", 197],
  ];

  it.each(expected)(
    "for %j offers the other presets of its brand",
    (first, offered, hidden, fnv, length) => {
      for (const current of ANY_IMAGING) {
        const view = secondaryView(first, current);
        expect(Object.keys(view)).toEqual(["img-s", "img-s-f"]);
        expect(digest(htmlOf(view, "img-s"))).toEqual([fnv, length]);
        expect(view["img-s-f"]).toEqual({ hidden });
        // The choice stays when it is still offered, and is None otherwise.
        expect(view["img-s"]?.value).toBe(offered.includes(current) ? current : "");
      }
    },
  );

  it("writes None first, then one option for each preset", () => {
    expect(secondaryView("lowrance", "")["img-s"]).toEqual({
      html: '<option value="">None</option><option value="lowrance_nose">Lowrance Active Imaging 3-in-1 (Recon nosecone)</option>',
      value: "",
    });
    expect(secondaryView("other", "lowrance")).toEqual({
      "img-s": { html: '<option value="">None</option>', value: "" },
      "img-s-f": { hidden: true },
    });
  });
});

describe("liveView: the list of live sonars", () => {
  const LOWRANCE: [string[], string, number] = [["at2", "at2xl", "other"], "c725ab84", 162];
  const HB: [string[], string, number] = [["ml2", "other"], "4ec0cae5", 104];
  // first transducer, the live sonars offered, digest and length of the html
  const expected: [string, string[], string, number][] = [
    ["lowrance", ...LOWRANCE],
    ["lowrance_nose", ...LOWRANCE],
    ...HUMMINBIRD.map((key): [string, string[], string, number] => [key, ...HB]),
    ["other", ["at2", "at2xl", "lvs34", "ml2", "other"], "a118a86d", 273],
    ["", ...LOWRANCE],
    ["nope", ...LOWRANCE],
  ];

  it.each(expected)(
    "for %j offers the live sonars of its brand, and Other",
    (first, offered, fnv, length) => {
      for (const current of ANY_LIVE) {
        const view = liveView(first, current);
        expect(Object.keys(view)).toEqual(["live-p"]);
        expect(digest(htmlOf(view, "live-p"))).toEqual([fnv, length]);
        // The choice stays when it is still offered, and is the first of the list otherwise.
        expect(view["live-p"]?.value).toBe(offered.includes(current) ? current : offered[0]);
      }
    },
  );

  it("writes one option for each live sonar", () => {
    expect(liveView("hb_xm920", "at2")).toEqual({
      "live-p": {
        html: '<option value="ml2">Humminbird MEGA Live 2</option><option value="other">Other (enter your own)</option>',
        value: "ml2",
      },
    });
  });
});

describe("combined: the transducer the page calculates with", () => {
  it.each(IMAGING_KEYS)(
    "is the first transducer %s itself without a second, or with itself as the second",
    (key) => {
      expect(combined(key, "")).toBe(transducers[key]);
      expect(combined(key, "nope")).toBe(transducers[key]);
      expect(combined(key, key)).toBe(transducers[key]);
    },
  );

  // first, second, digest of the combined preset as `presetLines` gives it
  it.each([
    ["lowrance", "lowrance_nose", "3599ad92"],
    ["lowrance_nose", "lowrance", "ba01bf0c"],
    ["hb_xm9hw", "hb_xm14hw", "0edc2225"],
    ["hb_xm9hw", "hb_xm14cmsi", "482e7a24"],
    ["hb_xm9hw", "hb_xnt9hw150", "faa9e822"],
    ["hb_xm9hw", "hb_xm920", "e034ea2e"],
    ["hb_xm14hw", "hb_xm9hw", "8075b93a"],
    ["hb_xm14hw", "hb_xm14cmsi", "c8f11309"],
    ["hb_xm14hw", "hb_xnt9hw150", "30be12eb"],
    ["hb_xm14hw", "hb_xm920", "c0ceb41f"],
    ["hb_xm14cmsi", "hb_xm9hw", "b5c70781"],
    ["hb_xm14cmsi", "hb_xm14hw", "adaa4494"],
    ["hb_xm14cmsi", "hb_xnt9hw150", "917acbd9"],
    ["hb_xm14cmsi", "hb_xm920", "5d9ce493"],
    ["hb_xnt9hw150", "hb_xm9hw", "5f277ad1"],
    ["hb_xnt9hw150", "hb_xm14hw", "79885658"],
    ["hb_xnt9hw150", "hb_xm14cmsi", "8ebedab2"],
    ["hb_xnt9hw150", "hb_xm920", "cbc3f87a"],
    ["hb_xm920", "hb_xm9hw", "ba9e5b64"],
    ["hb_xm920", "hb_xm14hw", "5ca90caf"],
    ["hb_xm920", "hb_xm14cmsi", "597980dd"],
    ["hb_xm920", "hb_xnt9hw150", "21bcdb6d"],
    // Pairs of two brands, which the page's lists never offer.
    ["lowrance", "hb_xm9hw", "16fb2bc5"],
    ["hb_xm920", "other", "291f2f8d"],
    ["other", "lowrance", "0a0ec692"],
    // The only pairs with a frequency of the same text under two names (83 and 200 kHz).
    ["lowrance", "hb_xm920", "80d4c675"],
    ["hb_xm920", "lowrance", "83e95930"],
    ["lowrance_nose", "hb_xm920", "24593a1e"],
    ["hb_xm920", "lowrance_nose", "84170d5b"],
  ])("%s with %s is the earlier page's combination", (first, second, fnv) => {
    expect(fnv1a(JSON.stringify(presetLines(combined(first, second))))).toBe(fnv);
  });

  it("takes a frequency of the second for another when its name differs, though the frequency is the same", () => {
    // 83 and 200 kHz: Medium CHIRP and High CHIRP on the Lowrance, no name on the Humminbird XM 9 20.
    expect(presetLines(combined("lowrance", "hb_xm920")).cone).toEqual([
      "Medium CHIRP|83 kHz|50|305|2|ht1|5|aihd|",
      "High CHIRP|200 kHz|20|305|2|ht1|5|aihd|",
      "|83 kHz (XM 9 20)|60||5|hbart|||sec",
      "|200 kHz (XM 9 20)|20||5|hbart|||sec",
    ]);
    expect(presetLines(combined("hb_xm920", "lowrance")).cone).toEqual([
      "|83 kHz|60||5|hbart|||",
      "|200 kHz|20||5|hbart|||",
      "Medium CHIRP|83 kHz (transom HD)|50|305|2|ht1|5|aihd|sec",
      "High CHIRP|200 kHz (transom HD)|20|305|2|ht1|5|aihd|sec",
    ]);
    expect(presetLines(combined("lowrance_nose", "hb_xm920")).cone).toEqual([
      "Medium CHIRP|83 kHz|50|305|2|ht1|5|nose|",
      "High CHIRP|200 kHz|20|305|2|ht1|5|nose|",
      "|83 kHz (XM 9 20)|60||5|hbart|||sec",
      "|200 kHz (XM 9 20)|20||5|hbart|||sec",
    ]);
    expect(presetLines(combined("hb_xm920", "lowrance_nose")).cone).toEqual([
      "|83 kHz|60||5|hbart|||",
      "|200 kHz|20||5|hbart|||",
      "Medium CHIRP|83 kHz (nosecone)|50|305|2|ht1|5|nose|sec",
      "High CHIRP|200 kHz (nosecone)|20|305|2|ht1|5|nose|sec",
    ]);
  });

  it("adds the frequencies only the second has, marked with its short name; CHIRP in a frequency does not make it another", () => {
    expect(presetLines(combined("lowrance", "lowrance_nose"))).toEqual({
      label:
        "Lowrance Active Imaging HD 3-in-1 (Medium/High) + Lowrance Active Imaging 3-in-1 (Recon nosecone)",
      names: { side: "SideScan", down: "DownScan" },
      note: ["2a271f5f", 1078],
      edge: 5,
      edgeSrc: "An example",
      cone: ["Medium CHIRP|83 kHz|50|305|2|ht1|5|aihd|", "High CHIRP|200 kHz|20|305|2|ht1|5|aihd|"],
      down: [
        "-|700 kHz CHIRP|51|46|2|bbm|5|aihd|",
        "-|1200 kHz CHIRP|30|27|2|bbm|5|aihd|",
        "-|455 kHz (nosecone)|75|91|3|bbm|5|nose|sec",
        "-|800 kHz (nosecone)|45|91|3|bbm|5|nose|sec",
      ],
      side: [
        "-|455 kHz CHIRP|85|91|1|ht58|5|aihd|",
        "-|1075 kHz CHIRP|36|46|1||5|aihd|",
        "-|800 kHz (nosecone)|48|46|1||5|nose|sec",
      ],
      keys: "label,names,note,cone,down,side,edge,edgeSrc",
    });
  });

  it("drops a frequency of the second that the first has, also when its angle differs", () => {
    // 800 kHz to the side: 86° on the first, 55° on the second.
    expect(presetLines(combined("hb_xm9hw", "hb_xm14hw"))).toEqual({
      label: "Humminbird XM 9 HW MSI T + Humminbird XM 14 HW MSI T",
      names: { side: "Side Imaging", down: "Down Imaging" },
      note: ["974249d5", 926],
      edge: 4,
      edgeSrc: "Not published; set so the fan reaches straight down",
      cone: ["CHIRP Wide|140–200 kHz|42||5|hbart|||", "CHIRP Narrow|180–240 kHz|25||5|hbart|||"],
      down: [
        "-|455 kHz|75|122|5|hbart|5|hbart|",
        "-|800 kHz|45|38|5|hbart|5|hbart|",
        "-|MEGA Imaging+|75|61|5|hbart|5|hbart|",
      ],
      side: [
        "-|455 kHz|86|244|5|hbart|5|hbart|",
        "-|800 kHz|86|76|5|hbart|5|hbart|",
        "-|MEGA Imaging+|86|122|5|hbart|5|hbart|",
      ],
      keys: "label,names,note,cone,down,side,edge,edgeSrc",
    });
  });

  it("gives an added frequency every key, also those the second transducer leaves out", () => {
    const added = combined("hb_xm920", "other").down.find((c) => c.sec);
    expect(added).toBeDefined();
    expect(Object.keys(added ?? {})).toEqual([
      "f",
      "n",
      "a",
      "r",
      "src",
      "c",
      "s",
      "rc",
      "rs",
      "sec",
    ]);
    expect(presetLines(combined("hb_xm920", "other")).cone).toEqual([
      "|83 kHz|60||5|hbart|||",
      "|200 kHz|20||5|hbart|||",
      "|Low (other)|50||1||||sec",
      "|High (other)|20||1||||sec",
    ]);
  });

  it("keeps the first transducer's names, edge and edge source, and leaves the presets as they are", () => {
    const before = JSON.stringify(TRANSDUCERS);
    const both = combined("hb_xm14cmsi", "hb_xm920");
    expect(both.names).toBe(TRANSDUCERS.hb_xm14cmsi.names);
    expect([both.edge, both.edgeSrc]).toEqual([
      15,
      "Not published; set so the fan reaches straight down",
    ]);
    expect(JSON.stringify(TRANSDUCERS)).toBe(before);
  });
});

describe("namesOf: the names the page shows", () => {
  const SCOUT = { live: "ActiveTarget 2", flat: "Scout", wide: "Scout Wide" };

  it.each([
    ["at2", SCOUT],
    ["at2xl", { live: "ActiveTarget 2 XL", flat: "Scout XL", wide: "Scout XL 360" }],
    ["lvs34", { live: "LiveScope Plus", flat: "Perspective", wide: "Perspective Wide" }],
    ["ml2", { live: "MEGA Live 2", flat: "Landscape", wide: "Landscape Wide" }],
    ["other", { live: "Live sonar", flat: "Flat mode", wide: "Flat mode Wide" }],
    ["", SCOUT],
    ["nope", SCOUT],
  ])(
    "takes the live names of %j, with a wide mode named after the flat one where it has none",
    (key, names) => {
      expect(namesOf("lowrance", key)).toEqual({ side: "SideScan", down: "DownScan", ...names });
    },
  );

  it.each([
    ["lowrance", "SideScan", "DownScan"],
    ["lowrance_nose", "SideScan", "DownScan"],
    ...HUMMINBIRD.map((key) => [key, "Side Imaging", "Down Imaging"]),
    ["other", "Side imaging", "Down imaging"],
    ["", "SideScan", "DownScan"],
    ["nope", "SideScan", "DownScan"],
  ])("takes the imaging names of %j", (key, side, down) => {
    expect(namesOf(key, "at2")).toEqual({ side, down, ...SCOUT });
  });

  it("has the keys side, down, live, flat and wide, in that order", () => {
    expect(Object.keys(namesOf("other", "other"))).toEqual([
      "side",
      "down",
      "live",
      "flat",
      "wide",
    ]);
  });
});

describe("namesView: the label of the choice of two live transducers", () => {
  it.each([
    ["at2", "Two, for Scout Wide"],
    ["at2xl", "Two, for Scout XL 360"],
    ["lvs34", "Two, for Perspective Wide"],
    ["ml2", "Two, for Landscape Wide"],
    ["other", "Two, for Flat mode Wide"],
  ])("for %s names the wide mode", (key, text) => {
    expect(namesView(namesOf("lowrance", key))).toEqual({ "at-n2": { text } });
  });
});

describe("nameFor: the name an element marked with a name key shows", () => {
  const names = namesOf("lowrance", "at2");

  it.each([
    ["side", "SideScan"],
    ["down", "DownScan"],
    ["live", "ActiveTarget 2"],
    ["flat", "Scout"],
    ["wide", "Scout Wide"],
  ])("is the name of the key %s", (key, name) => {
    expect(nameFor(names, key)).toBe(name);
  });

  it("is nothing for a key that is no name, so that the element keeps its text", () => {
    expect(nameFor(names, "nope")).toBeUndefined();
    expect(nameFor(names, "")).toBeUndefined();
  });
});

describe("coneLabel: how a 2D frequency is labelled", () => {
  it("puts the name before the frequency, and leaves out a name that is empty or not there", () => {
    expect(coneLabel({ n: "Medium CHIRP", f: "83 kHz" })).toBe("Medium CHIRP, 83 kHz");
    expect(coneLabel({ n: "", f: "83 kHz" })).toBe("83 kHz");
    expect(coneLabel({ f: "Low" })).toBe("Low");
  });
});

describe("alignOf and anglesView: how the narrower side fans are aimed", () => {
  const INNER = ['<option value="inner" selected>', '<option value="center">'];
  const CENTER = ['<option value="inner">', '<option value="center" selected>'];

  // the field's value (null: the field is not there yet), the saved value, the options as written
  const cases: [string | null, SavedValue | undefined, string[]][] = [
    [null, undefined, INNER],
    [null, "inner", INNER],
    [null, "center", CENTER],
    [null, "", INNER],
    [null, true, INNER],
    [null, "other", INNER],
    ["inner", "center", INNER],
    ["center", undefined, CENTER],
    ["center", "inner", CENTER],
    ["", "center", INNER],
  ];

  it.each(cases)("field %j, saved %j", (field, saved, options) => {
    const html = htmlOf(anglesView(TRANSDUCERS.lowrance, alignOf(field, saved)), "ang-img");
    const written =
      /<select id="ssalign"[^>]*>(<option value="inner"[^>]*>)[^<]*<\/option>(<option value="center"[^>]*>)/.exec(
        html,
      );
    expect(written?.slice(1)).toEqual(options);
  });

  it("alignOf takes the field's value when the field is there, else the saved one, else inner", () => {
    expect(alignOf("center", "inner")).toBe("center");
    expect(alignOf("", "center")).toBe("");
    expect(alignOf(null, "center")).toBe("center");
    expect(alignOf(null, true)).toBe(true);
    expect(alignOf(null, "")).toBe("inner");
    expect(alignOf(null, false)).toBe("inner");
    expect(alignOf(null, undefined)).toBe("inner");
  });
});

describe("anglesView: the angles of the imaging transducer", () => {
  // first, second, digest and length of the html, with the narrower fans aimed at the inner edge
  it.each([
    ["lowrance", "", "2d5ad2ec", 4317],
    ["lowrance", "lowrance_nose", "ab13e465", 5921],
    ["lowrance_nose", "", "6ab8bda6", 4224],
    ["lowrance_nose", "lowrance", "9379540a", 5850],
    ["hb_xm9hw", "", "6a0b1219", 4944],
    ["hb_xm9hw", "hb_xm14hw", "01b14857", 5464],
    ["hb_xm9hw", "hb_xm14cmsi", "b5122132", 5543],
    ["hb_xm9hw", "hb_xnt9hw150", "de9d047a", 6185],
    ["hb_xm9hw", "hb_xm920", "c804ddc8", 6694],
    ["hb_xm14hw", "", "894d1f85", 4951],
    ["hb_xm14hw", "hb_xm9hw", "abe693dd", 5470],
    ["hb_xm14hw", "hb_xm14cmsi", "1844858c", 5550],
    ["hb_xm14hw", "hb_xnt9hw150", "e8bc860c", 6192],
    ["hb_xm14hw", "hb_xm920", "2b00b93e", 6701],
    ["hb_xm14cmsi", "", "bc50d41d", 4349],
    ["hb_xm14cmsi", "hb_xm9hw", "18f15bd7", 5563],
    ["hb_xm14cmsi", "hb_xm14hw", "5d330a7d", 5566],
    ["hb_xm14cmsi", "hb_xnt9hw150", "2a6a4876", 5590],
    ["hb_xm14cmsi", "hb_xm920", "9153e5d0", 6794],
    ["hb_xnt9hw150", "", "1a4492a5", 4269],
    ["hb_xnt9hw150", "hb_xm9hw", "ab8adab9", 6190],
    ["hb_xnt9hw150", "hb_xm14hw", "da4c1a4f", 6195],
    ["hb_xnt9hw150", "hb_xm14cmsi", "38b99b4e", 5581],
    ["hb_xnt9hw150", "hb_xm920", "ad0e9a78", 6009],
    ["hb_xm920", "", "49664a6c", 4775],
    ["hb_xm920", "hb_xm9hw", "ac3ca0e1", 6701],
    ["hb_xm920", "hb_xm14hw", "a60519b1", 6706],
    ["hb_xm920", "hb_xm14cmsi", "4fbb990c", 6793],
    ["hb_xm920", "hb_xnt9hw150", "284cabba", 6011],
    ["other", "", "ddfacb25", 3516],
  ])("%s with %j writes the earlier page's html", (first, second, fnv, length) => {
    const view = anglesView(combined(first, second), "inner");
    expect(Object.keys(view)).toEqual(["ang-img"]);
    expect(digest(htmlOf(view, "ang-img"))).toEqual([fnv, length]);
  });

  it.each([
    ["lowrance", "", "7c73ede0", 4317],
    ["lowrance", "lowrance_nose", "253aa8d5", 5921],
  ])(
    "%s with %j, aimed around the center line, writes the earlier page's html",
    (first, second, fnv, length) => {
      expect(digest(htmlOf(anglesView(combined(first, second), "center"), "ang-img"))).toEqual([
        fnv,
        length,
      ]);
    },
  );

  it("ends with the choice of how the narrower fans are aimed and the place of the side imaging message", () => {
    const html = htmlOf(anglesView(TRANSDUCERS.lowrance, "inner"), "ang-img");
    expect(/<div class="field".*$/.exec(html)?.[0]).toBe(
      '<div class="field" style="padding-top:0.4rem"><label for="ssalign">Narrower fans are aimed</label><select id="ssalign" class="sel" data-save><option value="inner" selected>Down to the same inner edge as the widest (no extra gap)</option><option value="center">Around the same center line (opens a gap under the boat)</option></select><p class="hint">Not published. Objects straight under the boat showing on both sides at every frequency means the inner-edge choice matches your unit. Thickness scales with width either way.</p></div><p class="err" id="ass-err" hidden></p></div>',
    );
  });
});

describe("frequencyChoice: the chosen frequencies after the transducer changed", () => {
  /** A saved view state as it comes out of storage, which may hold anything. */
  const saved = (json: string): UiState => JSON.parse(json);

  // The first transducer; the saved choice; the choice it leaves. Lowrance has two
  // frequencies of each kind; the Humminbird XM 9 HW two of 2D and three of the others.
  it.each([
    ["lowrance", '{"f2d":"0","fds":"0","ssf":"0"}', '{"f2d":"0","fds":"0","ssf":"0"}'],
    ["lowrance", '{"f2d":"1","fds":"1","ssf":"1"}', '{"f2d":"1","fds":"1","ssf":"1"}'],
    ["lowrance", '{"f2d":"2","fds":"2","ssf":"2"}', '{"f2d":"0","fds":"0","ssf":"0"}'],
    ["lowrance", '{"f2d":"3","fds":"3","ssf":"3"}', '{"f2d":"0","fds":"0","ssf":"0"}'],
    ["lowrance", '{"f2d":"","fds":"x","ssf":"-1"}', '{"f2d":"","fds":"0","ssf":"-1"}'],
    ["lowrance", '{"f2d":"1.5","fds":" 1 ","ssf":"1e0"}', '{"f2d":"1.5","fds":" 1 ","ssf":"1e0"}'],
    ["lowrance", '{"f2d":1,"fds":null,"ssf":true}', '{"f2d":1,"fds":null,"ssf":true}'],
    ["lowrance", "{}", '{"f2d":"0","fds":"0","ssf":"0"}'],
    ["hb_xm9hw", '{"f2d":"0","fds":"0","ssf":"0"}', '{"f2d":"0","fds":"0","ssf":"0"}'],
    ["hb_xm9hw", '{"f2d":"1","fds":"1","ssf":"1"}', '{"f2d":"1","fds":"1","ssf":"1"}'],
    ["hb_xm9hw", '{"f2d":"2","fds":"2","ssf":"2"}', '{"f2d":"0","fds":"2","ssf":"2"}'],
    ["hb_xm9hw", '{"f2d":"3","fds":"3","ssf":"3"}', '{"f2d":"0","fds":"0","ssf":"0"}'],
    ["hb_xm9hw", '{"f2d":"","fds":"x","ssf":"-1"}', '{"f2d":"","fds":"0","ssf":"-1"}'],
    ["hb_xm9hw", '{"f2d":"1.5","fds":" 1 ","ssf":"1e0"}', '{"f2d":"1.5","fds":" 1 ","ssf":"1e0"}'],
    ["hb_xm9hw", '{"f2d":1,"fds":null,"ssf":true}', '{"f2d":1,"fds":null,"ssf":true}'],
    ["hb_xm9hw", "{}", '{"f2d":"0","fds":"0","ssf":"0"}'],
  ])("%s, saved %s", (first, before, after) => {
    expect(JSON.stringify(frequencyChoice(saved(before), combined(first, "")))).toBe(after);
  });

  it("counts the frequencies a second transducer adds", () => {
    // Lowrance with the nosecone: two of 2D, four of down imaging, three of side imaging.
    const ui = saved('{"f2d":"2","fds":"3","ssf":"2"}');
    expect(frequencyChoice(ui, combined("lowrance", "lowrance_nose"))).toEqual({
      f2d: "0",
      fds: "3",
      ssf: "2",
    });
  });

  it("returns the three choices and leaves the saved state as it is", () => {
    const ui = saved('{"f2d":"9","fds":"9","ssf":"9","db":"ss"}');
    expect(Object.keys(frequencyChoice(ui, TRANSDUCERS.lowrance))).toEqual(["f2d", "fds", "ssf"]);
    expect(JSON.stringify(ui)).toBe('{"f2d":"9","fds":"9","ssf":"9","db":"ss"}');
  });
});

describe("liveAnglesView: the angles of the live sonar", () => {
  // the live sonar, digest and length of the html
  it.each([
    ["at2", "1087d0d9", 801],
    ["at2xl", "60e33d58", 761],
    ["lvs34", "dd0046fc", 704],
    ["ml2", "fb8693c0", 669],
    ["other", "b8605882", 600],
    ["", "1087d0d9", 801],
    ["nope", "1087d0d9", 801],
  ])("%j writes the earlier page's html", (key, fnv, length) => {
    const view = liveAnglesView(livePreset(key));
    expect(Object.keys(view)).toEqual(["ang-live"]);
    expect(digest(htmlOf(view, "ang-live"))).toEqual([fnv, length]);
  });

  it("writes a row for the width and one for the thickness, each with its source and confidence", () => {
    expect(liveAnglesView(LIVE_RATED.at2)).toEqual({
      "ang-live": {
        html: '<div class="agrp"><h3>ActiveTarget 2</h3><div class="arow"><label for="atw">Fan width</label><div class="ain"><input id="atw" type="text" inputmode="decimal" autocomplete="off" value="135" data-save data-def="135"><span>°</span></div><p class="src" data-src="atw">Bass Pro Shops article on ActiveTarget 2 (Scout); Lowrance publishes none · confidence 3/5</p></div><div class="arow"><label for="att">Slice thickness</label><div class="ain"><input id="att" type="text" inputmode="decimal" autocomplete="off" value="18" data-save data-def="18"><span>°</span></div><p class="src" data-src="att">Third-party figure for the first ActiveTarget (The Idaho Fisherman), repeated for ActiveTarget 2 by other blogs; not published by Lowrance · confidence 2/5</p></div><p class="err" id="aat-err" hidden></p></div>',
      },
    });
  });
});

// ---------------------------------------------------------------------------
// The recorded page (fixtures/README.md)
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
/** The section of the page that holds the choice of transducers. */
const SECTION = "set";

/** A text the recording holds in full, or as its digest and length. */
type RecordedText = string | { fnv1a: string; length: number };

/** How the earlier page left one element, as far as this test reads it. */
interface RecordedPatch {
  text?: RecordedText;
  html?: RecordedText;
  hidden?: boolean;
  value?: string;
}

/** What a recording started from, as far as this test reads it. */
interface RecordedScenario {
  name: string;
  seed: { v?: Record<string, SavedValue> } | null;
  steps: unknown;
  fields: Record<string, string | boolean>;
  ui: UiState;
}

interface RecordedFile {
  scenario: RecordedScenario;
  patches: Record<string, RecordedPatch | { same: string }>;
}

interface RecordedIndex {
  schemes: string[];
  scenarios: { name: string }[];
  omitted: Record<string, string>;
}

const read = <T>(path: string): T => JSON.parse(readFileSync(`${RECORDED}/${path}`, "utf8"));
const index = read<RecordedIndex>("index.json");

/** A section file of a scenario and scheme (`<scenario>/<scheme>`), or the file the index says it equals. */
function sectionFile(at: string): RecordedFile {
  let path = `${at}/${SECTION}.json`;
  for (let equal = index.omitted[path]; equal !== undefined; equal = index.omitted[path])
    path = equal;
  return read<RecordedFile>(path);
}

/** The patch of one element, read where a `same` says it is. */
function recorded(at: string, key: string): RecordedPatch | undefined {
  let patch = sectionFile(at).patches[key];
  for (let hops = 0; patch !== undefined && "same" in patch; hops += 1) {
    if (hops > 2) throw new Error(`${at}, ${key}: more than two "same" in a row`);
    patch = sectionFile(patch.same).patches[key];
  }
  return patch;
}

/** What a recording started from, read from a file of its own: one a section equals holds another scenario. */
function scenarioOf(name: string): RecordedScenario {
  const own = ["page", SECTION]
    .map((section) => `${name}/light/${section}.json`)
    .find((path) => existsSync(`${RECORDED}/${path}`));
  if (own === undefined) throw new Error(`${name}: no file of its own to read the scenario from`);
  return read<RecordedFile>(own).scenario;
}

/**
 * The html the script wrote, from the html the browser gave back: the browser
 * writes an attribute without a value as `name=""`, and the shell has added a
 * "?" button to each label (legacy lines 1735 to 1742, which stay in the shell).
 */
const asWritten = (html: string): string =>
  html
    .replace(
      /<button type="button" class="qm" data-help="[^"]*" aria-label="Show what this setting means">\?<\/button>/g,
      "",
    )
    .replace(/ (data-save|hidden|selected)=""/g, " $1");

/** A text the view writes against the recorded one. */
function expectText(
  written: string,
  was: RecordedText | undefined,
  normalise: (text: string) => string,
): void {
  if (typeof was !== "string") throw new Error("the recording does not hold this text in full");
  expect(written).toBe(normalise(was));
}

/** The scenarios that choose transducers, and the two the others refer to. */
const CHOSEN = index.scenarios
  .map((scenario) => scenario.name)
  .filter(
    (name) =>
      /^(preset|second|live)-/.test(name) ||
      ["defaults", "all-open", "align-center"].includes(name),
  );

describe("against the recorded page", () => {
  it("reads the scenarios that choose a transducer, in light and dark", () => {
    expect(CHOSEN).toEqual([
      "defaults",
      "all-open",
      "preset-lowrance-nose",
      "preset-hb-xm9hw",
      "preset-hb-xm14hw",
      "preset-hb-xm14cmsi",
      "preset-hb-xnt9hw150",
      "preset-hb-xm920",
      "preset-other",
      "second-lowrance-with-lowrance-nose",
      "second-lowrance-nose-with-lowrance",
      "second-hb-xm9hw-with-hb-xm14hw",
      "second-hb-xm14hw-with-hb-xm14cmsi",
      "second-hb-xm14cmsi-with-hb-xnt9hw150",
      "second-hb-xnt9hw150-with-hb-xm920",
      "second-hb-xm920-with-hb-xm9hw",
      "live-at2-single",
      "live-at2xl",
      "live-at2xl-single",
      "live-other",
      "live-lvs34",
      "live-ml2",
      "live-at2-with-other",
      "align-center",
    ]);
    expect(index.schemes).toEqual(["light", "dark"]);
  });

  it("covers every imaging preset, seven pairs, every live sonar and both ways of aiming", () => {
    const scenarios = CHOSEN.map(scenarioOf);
    const chosen = (field: string) =>
      [...new Set(scenarios.map((s) => String(s.fields[field])))].sort();
    expect(chosen("img-p")).toEqual([...IMAGING_KEYS].sort());
    expect(chosen("live-p")).toEqual([...LIVE_KEYS].sort());
    expect(chosen("ssalign")).toEqual(["center", "inner"]);
    expect(scenarios.filter((s) => s.fields["img-s"] !== "")).toHaveLength(7);
  });

  describe.each(
    CHOSEN.flatMap((name) => index.schemes.map((scheme): [string, string] => [name, scheme])),
  )("%s, %s", (name, scheme) => {
    const scenario = scenarioOf(name);
    const field = (id: string): string => String(scenario.fields[id]);
    const first = field("img-p");
    const second = field("img-s");
    const live = field("live-p");
    // The angles are written while the page loads, before the field of the aim exists: from the saved value.
    const view: SectionView = {
      ...primaryView(),
      ...secondaryView(first, second),
      ...liveView(first, live),
      ...namesView(namesOf(first, live)),
      ...anglesView(combined(first, second), alignOf(null, scenario.seed?.v?.ssalign)),
      ...liveAnglesView(livePreset(live)),
    };

    it("starts from a saved state alone, so that the fields say what the functions were given", () => {
      expect(scenario.name).toBe(name);
      expect(scenario.steps).toBeNull();
    });

    it("writes the keys of KEYS, and the recording has them all", () => {
      expect(Object.keys(view).sort()).toEqual([...KEYS].sort());
      for (const key of KEYS) expect(recorded(`${name}/${scheme}`, key)).toBeDefined();
    });

    it.each([...KEYS])("leaves %s as the earlier page left it", (key) => {
      const patch = view[key] ?? {};
      const was = recorded(`${name}/${scheme}`, key) ?? {};
      expect(Object.keys(patch).length).toBeGreaterThan(0);
      if (patch.html !== undefined) expectText(patch.html, was.html, asWritten);
      if (patch.text !== undefined) expectText(patch.text, was.text, (text) => text);
      if (patch.value !== undefined) expect(patch.value).toBe(was.value);
      if (patch.hidden !== undefined) expect(patch.hidden).toBe(was.hidden);
      expect(
        Object.keys(patch).filter((facet) => !["html", "text", "value", "hidden"].includes(facet)),
      ).toEqual([]);
    });

    it("leaves the chosen frequencies the page saved as they are", () => {
      const { f2d, fds, ssf } = scenario.ui;
      expect(frequencyChoice(scenario.ui, combined(first, second))).toEqual({ f2d, fds, ssf });
    });
  });
});
