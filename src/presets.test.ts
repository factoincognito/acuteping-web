/**
 * The preset data against the earlier page's (legacy/src/p2.js, lines 41 to 121
 * and 168 to 169). Every expected value here was printed by those lines
 * themselves, run unchanged in Node; a long text is held as its digest and its
 * length. The texts themselves are compared, in full, with the recorded page in
 * `transducers.test.ts`.
 */
import { EX, HB_SRC, IBR, IMG, LBR, LIVE } from "./presets";
import type { ConeData, LiveData, PresetData } from "./types";

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

/** One frequency as a line: name (`-` when it has none), frequency, angle, depth or range (empty when it has none). */
const line = (c: ConeData): string =>
  [c.n === undefined ? "-" : c.n, c.f, c.a, c.r === undefined ? "" : c.r].join("|");

/** The source texts of a preset's frequencies, in the order 2D, down, side. */
const sources = (p: PresetData): string =>
  [...p.cone, ...p.down, ...p.side].map((c) => c.src).join("\n");

interface ExpectedImaging {
  label: string;
  names: { side: string; down: string };
  edge: number;
  edgeSrc: string;
  note: [string, number];
  cone: string[];
  down: string[];
  side: string[];
  src: [string, number];
}

const LOWRANCE_NAMES = { side: "SideScan", down: "DownScan" };
const HUMMINBIRD_NAMES = { side: "Side Imaging", down: "Down Imaging" };
const HB_CHIRP = ["CHIRP Wide|140–200 kHz|42|", "CHIRP Narrow|180–240 kHz|25|"];
const EDGE_FAN = "Not published; set so the fan reaches straight down";
const EDGE_WIDEST = "Not published; set so the widest fan reaches straight down";

const IMAGING: Record<string, ExpectedImaging> = {
  lowrance: {
    label: "Lowrance Active Imaging HD 3-in-1 (Medium/High)",
    names: LOWRANCE_NAMES,
    edge: 5,
    edgeSrc: "An example",
    note: ["f54cdc0f", 497],
    cone: ["Medium CHIRP|83 kHz|50|305", "High CHIRP|200 kHz|20|305"],
    down: ["-|700 kHz CHIRP|51|46", "-|1200 kHz CHIRP|30|27"],
    side: ["-|455 kHz CHIRP|85|91", "-|1075 kHz CHIRP|36|46"],
    src: ["fb22af8f", 432],
  },
  lowrance_nose: {
    label: "Lowrance Active Imaging 3-in-1 (Recon nosecone)",
    names: LOWRANCE_NAMES,
    edge: 5,
    edgeSrc: "An example",
    note: ["9b7ea9a4", 445],
    cone: ["Medium CHIRP|83 kHz|50|305", "High CHIRP|200 kHz|20|305"],
    down: ["-|455 kHz|75|91", "-|800 kHz|45|91"],
    side: ["-|455 kHz|85|91", "-|800 kHz|48|46"],
    src: ["495b85ab", 417],
  },
  hb_xm9hw: {
    label: "Humminbird XM 9 HW MSI T",
    names: HUMMINBIRD_NAMES,
    edge: 4,
    edgeSrc: EDGE_FAN,
    note: ["5cccc963", 406],
    cone: HB_CHIRP,
    down: ["-|455 kHz|75|122", "-|800 kHz|45|38", "-|MEGA Imaging+|75|61"],
    side: ["-|455 kHz|86|244", "-|800 kHz|86|76", "-|MEGA Imaging+|86|122"],
    src: ["b90cb14d", 575],
  },
  hb_xm14hw: {
    label: "Humminbird XM 14 HW MSI T",
    names: HUMMINBIRD_NAMES,
    edge: 4,
    edgeSrc: EDGE_WIDEST,
    note: ["5cccc963", 406],
    cone: HB_CHIRP,
    down: ["-|455 kHz|75|122", "-|800 kHz|45|38", "-|MEGA Imaging+|75|76"],
    side: ["-|455 kHz|86|244", "-|800 kHz|55|76", "-|MEGA Imaging+|86|152"],
    src: ["b90cb14d", 575],
  },
  hb_xm14cmsi: {
    label: "Humminbird XM 14 HW CMSI T",
    names: HUMMINBIRD_NAMES,
    edge: 15,
    edgeSrc: EDGE_FAN,
    note: ["aab6ebd3", 484],
    cone: HB_CHIRP,
    down: ["-|455 kHz|75|122", "-|MEGA Imaging+|70|61"],
    side: ["-|455 kHz|75|244", "-|MEGA Imaging+|75|122"],
    src: ["4495088d", 431],
  },
  hb_xnt9hw150: {
    label: "Humminbird XNT 9 HW MSI 150 T (HELIX 7)",
    names: HUMMINBIRD_NAMES,
    edge: 15,
    edgeSrc: EDGE_FAN,
    note: ["5cccc963", 406],
    cone: HB_CHIRP,
    down: ["-|455 kHz|75|38", "-|MEGA Imaging|75|23"],
    side: ["-|455 kHz|75|146", "-|MEGA Imaging|75|76"],
    src: ["4495088d", 431],
  },
  hb_xm920: {
    label: "Humminbird XM 9 20 MSI T",
    names: HUMMINBIRD_NAMES,
    edge: 4,
    edgeSrc: EDGE_WIDEST,
    note: ["e2bafad7", 267],
    cone: ["|83 kHz|60|", "|200 kHz|20|"],
    down: ["-|455 kHz|75|122", "-|800 kHz|45|38", "-|MEGA Imaging|75|38"],
    side: ["-|455 kHz|86|244", "-|800 kHz|55|76", "-|MEGA Imaging|86|76"],
    src: ["b90cb14d", 575],
  },
  other: {
    label: "Other (Garmin or anything else: enter your own)",
    names: { side: "Side imaging", down: "Down imaging" },
    edge: 5,
    edgeSrc: "Example",
    note: ["e0a5bc98", 148],
    cone: ["|Low|50|", "|High|20|"],
    down: ["-|Low|75|", "-|High|45|"],
    side: ["-|Low|85|", "-|High|55|"],
    src: ["f34cedd5", 47],
  },
};

interface ExpectedLive {
  label: string;
  names: { live: string; flat: string; wide: string };
  dual: boolean;
  w: number;
  t: number;
  srcW: [string, number];
  srcT: [string, number];
}

const LIVE_SONARS: Record<string, ExpectedLive> = {
  at2: {
    label: "Lowrance ActiveTarget 2",
    names: { live: "ActiveTarget 2", flat: "Scout", wide: "Scout Wide" },
    dual: true,
    w: 135,
    t: 18,
    srcW: ["48d26de8", 73],
    srcT: ["df71cf90", 138],
  },
  at2xl: {
    label: "Lowrance ActiveTarget 2 XL",
    names: { live: "ActiveTarget 2 XL", flat: "Scout XL", wide: "Scout XL 360" },
    dual: true,
    w: 180,
    t: 20,
    srcW: ["b92ee40d", 110],
    srcT: ["ef13f23b", 58],
  },
  lvs34: {
    label: "Garmin LiveScope Plus (LVS34)",
    names: { live: "LiveScope Plus", flat: "Perspective", wide: "" },
    dual: false,
    w: 135,
    t: 20,
    srcW: ["2eb31ee6", 58],
    srcT: ["f6a0bd17", 56],
  },
  ml2: {
    label: "Humminbird MEGA Live 2",
    names: { live: "MEGA Live 2", flat: "Landscape", wide: "" },
    dual: false,
    w: 120,
    t: 20,
    srcW: ["14db907b", 47],
    srcT: ["e4d4de18", 35],
  },
  other: {
    label: "Other (enter your own)",
    names: { live: "Live sonar", flat: "Flat mode", wide: "" },
    dual: false,
    w: 135,
    t: 20,
    srcW: ["12931341", 7],
    srcT: ["12931341", 7],
  },
};

describe("the two texts several presets share", () => {
  it("are the earlier page's", () => {
    expect(HB_SRC).toBe("Humminbird help article on Side Imaging transducers, measured at −10 dB");
    expect(EX).toBe("Not published; an example");
  });
});

describe("IMG: the imaging transducers", () => {
  const presets: Readonly<Record<string, PresetData>> = IMG;

  it("lists them in the order the page offers them", () => {
    expect(Object.keys(IMG)).toEqual([
      "lowrance",
      "lowrance_nose",
      "hb_xm9hw",
      "hb_xm14hw",
      "hb_xm14cmsi",
      "hb_xnt9hw150",
      "hb_xm920",
      "other",
    ]);
    expect(Object.keys(IMAGING)).toEqual(Object.keys(IMG));
  });

  it.each(Object.entries(IMAGING))(
    "%s has the earlier page's figures and texts",
    (key, expected) => {
      const preset = presets[key];
      expect(preset).toBeDefined();
      if (preset === undefined) return;
      expect({
        label: preset.label,
        names: preset.names,
        edge: preset.edge,
        edgeSrc: preset.edgeSrc,
        note: digest(preset.note),
        cone: preset.cone.map(line),
        down: preset.down.map(line),
        side: preset.side.map(line),
        src: digest(sources(preset)),
      }).toEqual(expected);
    },
  );

  it("holds nothing but the preset's own data: no confidence level, source key or brand yet", () => {
    for (const preset of Object.values(presets)) {
      expect(Object.keys(preset).sort()).toEqual([
        "cone",
        "down",
        "edge",
        "edgeSrc",
        "label",
        "names",
        "note",
        "side",
      ]);
      for (const c of [...preset.cone, ...preset.down, ...preset.side]) {
        expect(["a", "f", "n", "r", "src"]).toEqual(expect.arrayContaining(Object.keys(c)));
      }
    }
  });

  it("gives the Humminbird frequencies the one Humminbird source text", () => {
    for (const key of ["hb_xm9hw", "hb_xm14hw", "hb_xm14cmsi", "hb_xnt9hw150", "hb_xm920"]) {
      const preset = presets[key];
      expect(preset).toBeDefined();
      expect([...new Set(sources(preset ?? IMG.other).split("\n"))]).toEqual([HB_SRC]);
    }
  });
});

describe("LIVE: the live sonars", () => {
  const presets: Readonly<Record<string, LiveData>> = LIVE;

  it("lists them in the order the page offers them", () => {
    expect(Object.keys(LIVE)).toEqual(["at2", "at2xl", "lvs34", "ml2", "other"]);
    expect(Object.keys(LIVE_SONARS)).toEqual(Object.keys(LIVE));
  });

  it.each(Object.entries(LIVE_SONARS))(
    "%s has the earlier page's figures and texts",
    (key, expected) => {
      const preset = presets[key];
      expect(preset).toBeDefined();
      if (preset === undefined) return;
      expect({
        label: preset.label,
        names: preset.names,
        dual: preset.dual,
        w: preset.w,
        t: preset.t,
        srcW: digest(preset.srcW),
        srcT: digest(preset.srcT),
      }).toEqual(expected);
      expect(Object.keys(preset).sort()).toEqual([
        "dual",
        "label",
        "names",
        "srcT",
        "srcW",
        "t",
        "w",
      ]);
    },
  );
});

describe("the brand maps", () => {
  it("IBR gives each imaging transducer its brand and its short name", () => {
    expect(IBR).toEqual({
      lowrance: ["lowrance", "transom HD"],
      lowrance_nose: ["lowrance", "nosecone"],
      hb_xm9hw: ["humminbird", "XM 9 HW"],
      hb_xm14hw: ["humminbird", "XM 14 HW"],
      hb_xm14cmsi: ["humminbird", "XM 14 CMSI"],
      hb_xnt9hw150: ["humminbird", "XNT 9 HW"],
      hb_xm920: ["humminbird", "XM 9 20"],
      other: ["other", "other"],
    });
    expect(Object.keys(IBR)).toEqual(Object.keys(IMG));
  });

  it("LBR gives each live sonar its brand", () => {
    expect(LBR).toEqual({
      at2: "lowrance",
      at2xl: "lowrance",
      lvs34: "garmin",
      ml2: "humminbird",
      other: "other",
    });
    expect(Object.keys(LBR)).toEqual(Object.keys(LIVE));
  });
});
