/**
 * The transducer presets (docs/SPEC.md 2.2): the imaging transducers, the live
 * sonars and their brands, as the earlier page had them. Data only. The
 * confidence level and the source of each figure are added in `sources.ts`.
 */
import type { LiveData, PresetData } from "./types";

/** Where every Humminbird imaging figure comes from. */
export const HB_SRC = "Humminbird help article on Side Imaging transducers, measured at −10 dB";

/** The source text of a figure that no one publishes. */
export const EX = "Not published; an example";

/** The imaging transducers, by key, in the order the page offers them. */
export const IMG = {
  lowrance: {
    label: "Lowrance Active Imaging HD 3-in-1 (Medium/High)",
    names: { side: "SideScan", down: "DownScan" },
    note: "Frequencies from Lowrance's product page for the Medium/High version: Medium and High CHIRP (83/200 kHz), DownScan 700/1200 kHz and SideScan 455/1075 kHz; the installation manual lists all four DownScan and SideScan frequencies as CHIRP. Lowrance publishes no beam angles. 2D is a forum estimate; the DownScan angles are estimates scaled by wavelength from a dealer's 45° at 800 kHz (a figure identical to Humminbird's published Down Imaging one); SideScan 1075 kHz is 455 kHz scaled the same way.",
    cone: [
      {
        f: "83 kHz",
        r: 305,
        n: "Medium CHIRP",
        a: 50,
        src: "One user on The Hull Truth forum, calculated from the 200 kHz figure; for the non-HD Active Imaging",
      },
      {
        f: "200 kHz",
        r: 305,
        n: "High CHIRP",
        a: 20,
        src: 'Same forum user: "around 20 degrees"; no Lowrance source',
      },
    ],
    down: [
      {
        f: "700 kHz CHIRP",
        r: 46,
        a: 51,
        src: "Estimate: dealer figure of 45° at 800 kHz × 800/700",
      },
      {
        f: "1200 kHz CHIRP",
        r: 27,
        a: 30,
        src: "Estimate: dealer figure of 45° at 800 kHz × 800/1200",
      },
    ],
    side: [
      {
        f: "455 kHz CHIRP",
        r: 91,
        a: 85,
        src: "Chosen so the fan reaches straight down (boulder test). A forum user quotes Lowrance support as 58° per side, without saying how it is aimed.",
      },
      { f: "1075 kHz CHIRP", r: 46, a: 36, src: "Estimate: 455 kHz × 455/1075" },
    ],
    edge: 5,
    edgeSrc: "An example",
  },
  lowrance_nose: {
    label: "Lowrance Active Imaging 3-in-1 (Recon nosecone)",
    names: { side: "SideScan", down: "DownScan" },
    note: "Frequencies from the Recon Active Imaging 3-in-1 Nose Cone installation guide (988-13199-001): 2D 83 kHz Medium CHIRP and 200 kHz High CHIRP, DownScan and SideScan 455/800 kHz. Lowrance publishes no beam angles. The 2D angles are a forum estimate for this non-HD Active Imaging; the DownScan angles are a dealer's general Lowrance figures (identical to Humminbird's published Down Imaging ones); SideScan 800 kHz is 455 kHz scaled by wavelength.",
    cone: [
      {
        f: "83 kHz",
        r: 305,
        n: "Medium CHIRP",
        a: 50,
        src: "One user on The Hull Truth forum, calculated from the 200 kHz figure; for the non-HD Active Imaging",
      },
      {
        f: "200 kHz",
        r: 305,
        n: "High CHIRP",
        a: 20,
        src: 'Same forum user: "around 20 degrees"; no Lowrance source',
      },
    ],
    down: [
      {
        f: "455 kHz",
        r: 91,
        a: 75,
        src: 'Blue Bottle Marine dealer guide: "Down Imaging is typically 800 kHz (45°) and 455 kHz (75°)", a general statement, not a Lowrance specification',
      },
      { f: "800 kHz", r: 91, a: 45, src: "Same dealer guide" },
    ],
    side: [
      {
        f: "455 kHz",
        r: 91,
        a: 85,
        src: "Chosen so the fan reaches straight down (boulder test). Not published.",
      },
      { f: "800 kHz", r: 46, a: 48, src: "Estimate: 455 kHz × 455/800" },
    ],
    edge: 5,
    edgeSrc: "An example",
  },
  hb_xm9hw: {
    label: "Humminbird XM 9 HW MSI T",
    names: { side: "Side Imaging", down: "Down Imaging" },
    note: "Side and Down Imaging angles and ranges are from Humminbird's help article on Side Imaging transducers, measured where the echo is 10 dB below the center. 2D is Dual Spectrum CHIRP (Full 150–220, Narrow 180–240, Wide 140–200 kHz per the product page). The Wide and Narrow angles are from the same help article, which gives them for Dual Spectrum CHIRP at −10 dB but doesn't say they are the 2D cone angles.",
    cone: [
      { f: "140–200 kHz", n: "CHIRP Wide", a: 42, src: HB_SRC },
      { f: "180–240 kHz", n: "CHIRP Narrow", a: 25, src: HB_SRC },
    ],
    down: [
      { f: "455 kHz", r: 122, a: 75, src: HB_SRC },
      { f: "800 kHz", r: 38, a: 45, src: HB_SRC },
      { f: "MEGA Imaging+", r: 61, a: 75, src: HB_SRC },
    ],
    side: [
      { f: "455 kHz", r: 244, a: 86, src: HB_SRC },
      { f: "800 kHz", r: 76, a: 86, src: HB_SRC },
      { f: "MEGA Imaging+", r: 122, a: 86, src: HB_SRC },
    ],
    edge: 4,
    edgeSrc: "Not published; set so the fan reaches straight down",
  },
  hb_xm14hw: {
    label: "Humminbird XM 14 HW MSI T",
    names: { side: "Side Imaging", down: "Down Imaging" },
    note: "Side and Down Imaging angles and ranges are from Humminbird's help article on Side Imaging transducers, measured where the echo is 10 dB below the center. 2D is Dual Spectrum CHIRP (Full 150–220, Narrow 180–240, Wide 140–200 kHz per the product page). The Wide and Narrow angles are from the same help article, which gives them for Dual Spectrum CHIRP at −10 dB but doesn't say they are the 2D cone angles.",
    cone: [
      { f: "140–200 kHz", n: "CHIRP Wide", a: 42, src: HB_SRC },
      { f: "180–240 kHz", n: "CHIRP Narrow", a: 25, src: HB_SRC },
    ],
    down: [
      { f: "455 kHz", r: 122, a: 75, src: HB_SRC },
      { f: "800 kHz", r: 38, a: 45, src: HB_SRC },
      { f: "MEGA Imaging+", r: 76, a: 75, src: HB_SRC },
    ],
    side: [
      { f: "455 kHz", r: 244, a: 86, src: HB_SRC },
      { f: "800 kHz", r: 76, a: 55, src: HB_SRC },
      { f: "MEGA Imaging+", r: 152, a: 86, src: HB_SRC },
    ],
    edge: 4,
    edgeSrc: "Not published; set so the widest fan reaches straight down",
  },
  hb_xm14cmsi: {
    label: "Humminbird XM 14 HW CMSI T",
    names: { side: "Side Imaging", down: "Down Imaging" },
    note: "Side and Down Imaging angles and ranges are from Humminbird's help article on Side Imaging transducers, measured where the echo is 10 dB below the center; the article lists 455 kHz and MEGA Imaging+ for this transducer, not 800 kHz. 2D is Dual Spectrum CHIRP (Full 150–220, Narrow 180–240, Wide 140–200 kHz per the product page). The Wide and Narrow angles are from the same help article, which gives them for Dual Spectrum CHIRP at −10 dB but doesn't say they are the 2D cone angles.",
    cone: [
      { f: "140–200 kHz", n: "CHIRP Wide", a: 42, src: HB_SRC },
      { f: "180–240 kHz", n: "CHIRP Narrow", a: 25, src: HB_SRC },
    ],
    down: [
      { f: "455 kHz", r: 122, a: 75, src: HB_SRC },
      { f: "MEGA Imaging+", r: 61, a: 70, src: HB_SRC },
    ],
    side: [
      { f: "455 kHz", r: 244, a: 75, src: HB_SRC },
      { f: "MEGA Imaging+", r: 122, a: 75, src: HB_SRC },
    ],
    edge: 15,
    edgeSrc: "Not published; set so the fan reaches straight down",
  },
  hb_xnt9hw150: {
    label: "Humminbird XNT 9 HW MSI 150 T (HELIX 7)",
    names: { side: "Side Imaging", down: "Down Imaging" },
    note: "Side and Down Imaging angles and ranges are from Humminbird's help article on Side Imaging transducers, measured where the echo is 10 dB below the center. 2D is Dual Spectrum CHIRP (Full 150–220, Narrow 180–240, Wide 140–200 kHz per the product page). The Wide and Narrow angles are from the same help article, which gives them for Dual Spectrum CHIRP at −10 dB but doesn't say they are the 2D cone angles.",
    cone: [
      { f: "140–200 kHz", n: "CHIRP Wide", a: 42, src: HB_SRC },
      { f: "180–240 kHz", n: "CHIRP Narrow", a: 25, src: HB_SRC },
    ],
    down: [
      { f: "455 kHz", r: 38, a: 75, src: HB_SRC },
      { f: "MEGA Imaging", r: 23, a: 75, src: HB_SRC },
    ],
    side: [
      { f: "455 kHz", r: 146, a: 75, src: HB_SRC },
      { f: "MEGA Imaging", r: 76, a: 75, src: HB_SRC },
    ],
    edge: 15,
    edgeSrc: "Not published; set so the fan reaches straight down",
  },
  hb_xm920: {
    label: "Humminbird XM 9 20 MSI T",
    names: { side: "Side Imaging", down: "Down Imaging" },
    note: "Side and Down Imaging angles and ranges are from Humminbird's help article on Side Imaging transducers, measured where the echo is 10 dB below the center. 2D is DualBeam Plus; the 60° (83 kHz) and 20° (200 kHz) are from the same help article, also measured at −10 dB.",
    cone: [
      { f: "83 kHz", n: "", a: 60, src: HB_SRC },
      { f: "200 kHz", n: "", a: 20, src: HB_SRC },
    ],
    down: [
      { f: "455 kHz", r: 122, a: 75, src: HB_SRC },
      { f: "800 kHz", r: 38, a: 45, src: HB_SRC },
      { f: "MEGA Imaging", r: 38, a: 75, src: HB_SRC },
    ],
    side: [
      { f: "455 kHz", r: 244, a: 86, src: HB_SRC },
      { f: "800 kHz", r: 76, a: 55, src: HB_SRC },
      { f: "MEGA Imaging", r: 76, a: 86, src: HB_SRC },
    ],
    edge: 4,
    edgeSrc: "Not published; set so the widest fan reaches straight down",
  },
  other: {
    label: "Other (Garmin or anything else: enter your own)",
    names: { side: "Side imaging", down: "Down imaging" },
    note: "Example figures to replace with your transducer's. Garmin doesn't list ClearVü or SideVü beam angles on its product pages, as far as could be found.",
    cone: [
      { f: "Low", n: "", a: 50, src: "Example" },
      { f: "High", n: "", a: 20, src: "Example" },
    ],
    down: [
      { f: "Low", a: 75, src: "Example" },
      { f: "High", a: 45, src: "Example" },
    ],
    side: [
      { f: "Low", a: 85, src: "Example" },
      { f: "High", a: 55, src: "Example" },
    ],
    edge: 5,
    edgeSrc: "Example",
  },
} as const satisfies Readonly<Record<string, PresetData>>;

/** The live sonars, by key, in the order the page offers them. */
export const LIVE = {
  at2: {
    label: "Lowrance ActiveTarget 2",
    names: { live: "ActiveTarget 2", flat: "Scout", wide: "Scout Wide" },
    dual: true,
    w: 135,
    t: 18,
    srcW: "Bass Pro Shops article on ActiveTarget 2 (Scout); Lowrance publishes none",
    srcT: "Third-party figure for the first ActiveTarget (The Idaho Fisherman), repeated for ActiveTarget 2 by other blogs; not published by Lowrance",
  },
  at2xl: {
    label: "Lowrance ActiveTarget 2 XL",
    names: { live: "ActiveTarget 2 XL", flat: "Scout XL", wide: "Scout XL 360" },
    dual: true,
    w: 180,
    t: 20,
    srcW: "Lowrance ActiveTarget 2 XL specifications: beam 20° × 180°. Two units give a 360° Scout XL view (HDS PRO only)",
    srcT: "Lowrance ActiveTarget 2 XL specifications: beam 20° × 180°",
  },
  lvs34: {
    label: "Garmin LiveScope Plus (LVS34)",
    names: { live: "LiveScope Plus", flat: "Perspective", wide: "" },
    dual: false,
    w: 135,
    t: 20,
    srcW: "Garmin LVS34 installation instructions: 135° front to back",
    srcT: "Garmin LVS34 installation instructions: 20° side to side",
  },
  ml2: {
    label: "Humminbird MEGA Live 2",
    names: { live: "MEGA Live 2", flat: "Landscape", wide: "" },
    dual: false,
    w: 120,
    t: 20,
    srcW: "Humminbird MEGA Live 2 product page: 20° × 120°",
    srcT: "Humminbird MEGA Live 2 product page",
  },
  other: {
    label: "Other (enter your own)",
    names: { live: "Live sonar", flat: "Flat mode", wide: "" },
    dual: false,
    w: 135,
    t: 20,
    srcW: "Example",
    srcT: "Example",
  },
} as const satisfies Readonly<Record<string, LiveData>>;

/** The brand and the short name of each imaging transducer. */
export const IBR = {
  lowrance: ["lowrance", "transom HD"],
  lowrance_nose: ["lowrance", "nosecone"],
  hb_xm9hw: ["humminbird", "XM 9 HW"],
  hb_xm14hw: ["humminbird", "XM 14 HW"],
  hb_xm14cmsi: ["humminbird", "XM 14 CMSI"],
  hb_xnt9hw150: ["humminbird", "XNT 9 HW"],
  hb_xm920: ["humminbird", "XM 9 20"],
  other: ["other", "other"],
} as const satisfies Readonly<Record<keyof typeof IMG, readonly [string, string]>>;

/** The brand of each live sonar. */
export const LBR = {
  at2: "lowrance",
  at2xl: "lowrance",
  lvs34: "garmin",
  ml2: "humminbird",
  other: "other",
} as const satisfies Readonly<Record<keyof typeof LIVE, string>>;
