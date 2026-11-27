/**
 * The sources and the confidence of the calculator's figures (docs/SPEC.md
 * 2.2): the source registry `SRC`, the confidence scale `CONF`, the date the
 * sources were last checked, and the presets of `presets.ts` with the confidence
 * level and the source of each figure. Data, and the few lines that join it.
 */
import { IMG, LIVE } from "./presets";
import type {
  Cone,
  ConeData,
  Confidence,
  LiveData,
  LivePreset,
  PresetData,
  RatedPreset,
  Source,
} from "./types";

/** When the sources were last checked, as the page shows it. */
export const CK = "30 Sep 2026";

/** The source registry: every source a figure of the calculator names, by key. */
export const SRC = {
  aihd: {
    t: "Lowrance Active Imaging HD installation manual (988-13115-001), specifications",
    u: "https://d347awuzx0kdse.cloudfront.net/advtridentb2c/product-download/000-16062-001_um.pdf",
  },
  nose: {
    t: "Lowrance Recon Active Imaging 3-in-1 nose cone installation guide (988-13199-001)",
    u: "https://productimageserver.com/literature/installations/104592IN.pdf",
  },
  ht1: {
    t: "The Hull Truth forum: Lowrance HD 3-in-1 transducer cone angles",
    u: "https://www.thehulltruth.com/marine-electronics-forum/1389496-lowrance-hd-3-1-transducer-cone-angles.html",
  },
  ht58: {
    t: "The Hull Truth forum: Lowrance 3-in-1 side scan angle (support quoted as 58° per side)",
    u: "https://www.thehulltruth.com/marine-electronics-forum/1322801-lowrance-3-1-side-scan-angle.html",
  },
  bbm: {
    t: "Blue Bottle Marine, Lowrance 101 (dealer guide)",
    u: "https://www.bluebottlemarine.com/lowrance-101/",
  },
  hbart: {
    t: "Humminbird help: Side Imaging transducers, operating frequencies and areas of coverage",
    u: "https://humminbird-help.johnsonoutdoors.com/hc/en-us/articles/4412768103831-Side-Imaging-Transducers-Operating-Frequencies-and-Areas-of-Coverage",
  },
  bps: {
    t: "Bass Pro Shops 1Source: ActiveTarget 2 walk-through",
    u: "https://1source.basspro.com/news-tips/fishing-gear/36254/lowrance-activetarget-2-walk-through-pro-tips-and-running-multiple-live-sonars-same-time",
  },
  idaho: {
    t: "The Idaho Fisherman: live sonar compared",
    u: "https://theidahofisherman.com/fish-finder/live-view/",
  },
  ffc: {
    t: "Fishfinder Coach: ActiveTarget 2 vs ActiveTarget 2 XL",
    u: "https://fishfindercoach.com/blogs/fishfinder-coach/lowrance-activetarget-2-vs-activetarget-2-xl-what-is-the-difference",
  },
  lowxl: {
    t: "Lowrance ActiveTarget 2 XL specifications",
    u: "https://www.lowrance.com/activetarget-2-xl/specifications/",
  },
  bcast: {
    t: "The Bass Cast: Lowrance unveils ActiveTarget 2 XL (launch press release, 14 Jan 2026)",
    u: "https://thebasscast.com/2026/01/14/lowrance-unveils-activetarget-2-xl/",
  },
  garmin: {
    t: "Garmin LiveScope Plus LVS34 installation instructions, specifications",
    u: "https://www8.garmin.com/manuals/webhelp/GUID-B524FC8E-CB9A-4156-B565-59B23B4E0E6F/EN-US/GUID-A5E281B5-D074-4792-915A-8D7C768BF110.html",
  },
  ml2: {
    t: "Humminbird MEGA Live 2 product page, specifications",
    u: "https://humminbird.johnsonoutdoors.com/us/shop/accessories/mega-live/mega-live-2-forward-facing-sonar",
  },
} as const satisfies Readonly<Record<string, Source>>;

/** The confidence scale: what each level says about a figure. */
export const CONF: Readonly<Record<Confidence, string>> = {
  5: "Manufacturer specification, checked against the source",
  4: "Manufacturer material, but incomplete (for example no measuring convention) or passed on by others",
  3: "Dealer, retailer or magazine figure, checked that the source says it",
  2: "Forum or blog figure that can't be traced to the manufacturer, or an estimate calculated from a level 3 figure",
  1: "Example or chosen value with no source",
};

/**
 * A frequency with its rating: the confidence level `c` and the source key `s`
 * of its angle and, where `rc` is given, those of its depth or range.
 */
function rate(o: ConeData, c: Confidence, s: string, rc?: Confidence, rs?: string): Cone {
  return rc === undefined ? { ...o, c, s: s || "" } : { ...o, c, s: s || "", rc, rs: rs || "" };
}

/** A Humminbird preset rated: every figure is the manufacturer's, from its help article. */
function humminbird(p: PresetData): RatedPreset {
  return {
    ...p,
    cone: p.cone.map((c) => rate(c, 5, "hbart")),
    down: p.down.map((c) => rate(c, 5, "hbart", 5, "hbart")),
    side: p.side.map((c) => rate(c, 5, "hbart", 5, "hbart")),
    fc: 5,
    fs: "hbart",
    ec: 1,
  };
}

const L = IMG.lowrance;
const Nz = IMG.lowrance_nose;
const O = IMG.other;

/** The imaging presets with the confidence level and the source key of every figure. */
export const IMG_RATED: Readonly<Record<keyof typeof IMG, RatedPreset>> = {
  lowrance: {
    ...L,
    cone: [rate(L.cone[0], 2, "ht1", 5, "aihd"), rate(L.cone[1], 2, "ht1", 5, "aihd")],
    down: [rate(L.down[0], 2, "bbm", 5, "aihd"), rate(L.down[1], 2, "bbm", 5, "aihd")],
    side: [rate(L.side[0], 1, "ht58", 5, "aihd"), rate(L.side[1], 1, "", 5, "aihd")],
    fc: 5,
    fs: "aihd",
    ec: 1,
  },
  lowrance_nose: {
    ...Nz,
    cone: [rate(Nz.cone[0], 2, "ht1", 5, "nose"), rate(Nz.cone[1], 2, "ht1", 5, "nose")],
    down: [rate(Nz.down[0], 3, "bbm", 5, "nose"), rate(Nz.down[1], 3, "bbm", 5, "nose")],
    side: [rate(Nz.side[0], 1, "ht58", 5, "nose"), rate(Nz.side[1], 1, "", 5, "nose")],
    fc: 5,
    fs: "nose",
    ec: 1,
  },
  hb_xm9hw: humminbird(IMG.hb_xm9hw),
  hb_xm14hw: humminbird(IMG.hb_xm14hw),
  hb_xm14cmsi: humminbird(IMG.hb_xm14cmsi),
  hb_xnt9hw150: humminbird(IMG.hb_xnt9hw150),
  hb_xm920: humminbird(IMG.hb_xm920),
  other: {
    ...O,
    cone: O.cone.map((c) => rate(c, 1, "")),
    down: O.down.map((c) => rate(c, 1, "")),
    side: O.side.map((c) => rate(c, 1, "")),
    fc: 1,
    fs: "",
    ec: 1,
  },
};

/** The rating of a live sonar: confidence and source key of its width, then of its thickness. */
type LiveRating = readonly [cw: Confidence, sw: string, ct: Confidence, st: string];

/** The rating of each live sonar. */
const LIVE_RATING = {
  at2: [3, "bps", 2, "idaho"],
  at2xl: [5, "lowxl", 5, "lowxl"],
  lvs34: [5, "garmin", 5, "garmin"],
  ml2: [5, "ml2", 5, "ml2"],
  other: [1, "", 1, ""],
} as const satisfies Readonly<Record<keyof typeof LIVE, LiveRating>>;

/** A live sonar with its rating. */
function live(p: LiveData, [cw, sw, ct, st]: LiveRating): LivePreset {
  return { ...p, cw, sw, ct, st };
}

/** The live sonars with the confidence level and the source key of their figures. */
export const LIVE_RATED: Readonly<Record<keyof typeof LIVE, LivePreset>> = {
  at2: live(LIVE.at2, LIVE_RATING.at2),
  at2xl: live(LIVE.at2xl, LIVE_RATING.at2xl),
  lvs34: live(LIVE.lvs34, LIVE_RATING.lvs34),
  ml2: live(LIVE.ml2, LIVE_RATING.ml2),
  other: live(LIVE.other, LIVE_RATING.other),
};

/** What a source line ends with: the confidence level out of 5, or nothing for no level. */
export function confTag(c: number | undefined): string {
  return c ? ` · confidence ${c}/5` : "";
}
