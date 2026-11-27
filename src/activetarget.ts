/**
 * ActiveTarget (docs/SPEC.md 2.2): the earlier page's lines 756 to 972. What
 * the section writes at once is a `SectionView` by element id
 * (`activeTargetView`); what it draws on its four simulated screens goes
 * through an injected `Surface`, one painter for each canvas (`paintForward`,
 * `paintDown`, `paintFlat`, `paintWide`); and the picture of each beam, which
 * the earlier page draws a moment later (`BEAM_DELAY_MS`), has a painter
 * (`paintBeam`) and a view of the line under it (`beamView`). Nothing here
 * finds an element, reads a field or a style, or keeps a timer: the section's
 * own fields and the style are given, and the timer is the shell's.
 */
import { hash, mapLive, parseColour } from "./colour";
import { deg, NO_VALUE, rad } from "./format";
import { checkSettings } from "./settings";
import type {
  BeamMode,
  Ctx2D,
  ElementPatch,
  Equipment,
  Formatter,
  Names,
  Rgb,
  SectionLocal,
  SectionView,
  Settings,
  Surface,
  Theme,
} from "./types";

/**
 * The elements the views write, by id: the eighteen of `activeTargetView`,
 * then the line under each beam, which `beamView` writes.
 */
export const KEYS = [
  "at-serr",
  "slice-table",
  "slice-svg",
  "pos-err",
  "edge-err",
  "f-in",
  "f-x",
  "f-z",
  "dn-in",
  "dn-y",
  "dn-z",
  "sc-err",
  "sc-b1",
  "sc-b2",
  "sc-z",
  "sc-x",
  "sc-f",
  "sc-fw",
  "bvF-t",
  "bvD-t",
  "bvS-t",
  "bvW-t",
] as const;

/** The canvas `paintForward` draws on, by id. */
export const CANVAS_FORWARD = "scrF";

/** The canvas `paintDown` draws on, by id. */
export const CANVAS_DOWN = "scrD";

/** The canvas `paintFlat` draws on, by id. */
export const CANVAS_FLAT = "scrS";

/** The canvas `paintWide` draws on, by id. */
export const CANVAS_WIDE = "scrW";

/** The modes whose beam is drawn, in the order the earlier page draws them (line 915). */
export const BEAM_MODES: readonly BeamMode[] = ["F", "D", "S", "W"];

/** The canvas `paintBeam` draws each mode's beam on, by id. */
export const BEAM_CANVAS: Readonly<Record<BeamMode, string>> = {
  F: "bvF",
  D: "bvD",
  S: "bvS",
  W: "bvW",
};

/** The element `beamView` writes the line under each mode's beam to, by id. */
const BEAM_LINE: Readonly<Record<BeamMode, string>> = {
  F: "bvF-t",
  D: "bvD-t",
  S: "bvS-t",
  W: "bvW-t",
};

/**
 * The milliseconds the earlier page waits after it has rendered the section
 * before it draws the beams (lines 914 and 915). A render that gets past the
 * check of Settings starts the wait again, and the beams drawn at its end are
 * those of the settings of that render. A render that stops at the message of
 * Settings (line 920) returns before the timer is touched: the beams of an
 * earlier render are still drawn when its wait ends, from the settings it
 * captured, while the message is showing. The shell keeps the timer and the
 * input the beams are drawn from, and does not clear it for a stopped render.
 */
export const BEAM_DELAY_MS = 120;

/** The section's own number fields: the fish ahead, its depth, its distance to the side, and the screen distance. */
const FIELD_AHEAD = "fx";
const FIELD_DEPTH = "fz";
const FIELD_SIDE = "fy";
const FIELD_SCREEN = "sr";

/** The custom properties that name the font of the page's figures and of its text. */
const FONT_DATA = "--font-data";
const FONT_BODY = "--font-body";

/** The custom properties a beam's picture takes its colours from. */
const STYLE = {
  background: "--surface",
  line: "--muted",
  water: "--water",
  mark: "--fg",
  bottom: "--accent",
  beam: "--c2d",
} as const;

/** The messages of the section that name no value, word for word as the earlier page has them. */
const MESSAGES = {
  ahead: "Enter a distance ahead of 0 m or more.",
  side: "Enter a side distance of 0 m or more.",
  screen: "Enter a screen distance greater than 0 m.",
  fishFirst: "Fix the fish above first.",
} as const;

/** The distances of the table of the slice, in metres; the picture reaches to the last. */
const SLICE_DISTANCES: readonly number[] = [5, 10, 20, 30, 45];
const SLICE_REACH = 45;

/** The distances the picture of the slice marks, in metres. */
const SLICE_MARKS: readonly number[] = [10, 20, 30];

/**
 * The marks of a picture's distance scale: a picture that reaches up to the
 * first number of a pair has a mark every second number, in metres.
 */
const MARK_STEPS: readonly (readonly [number, number])[] = [
  [20, 5],
  [50, 10],
];

/** The distance between the marks of a picture that reaches further. */
const MARK_STEP_BEYOND = 20;

/** The colours of the four screens' lines and labels, which are the same in light and dark. */
const SCREEN = {
  outside: [8, 6, 4],
  ring: "rgba(255,255,255,0.18)",
  labelUnder: "rgba(0,0,0,0.65)",
  text: "#ffffff",
} as const;

/**
 * `Math`, looked up once. The loops over the pixels of a picture call it
 * millions of times, and where the tests run a look-up of the global costs
 * more than the call. Each function is still read from it when it is called.
 */
const M = Math;

/** The results of the fish in Forward and Down, and those of the flat mode that a wrong value blanks. */
const FISH_RESULTS = ["f-in", "f-x", "f-z", "dn-in", "dn-y", "dn-z"] as const;
const FLAT_RESULTS = ["sc-z", "sc-x", "sc-f", "sc-fw"] as const;

/**
 * What the view reads of a section's input (the `ViewInput` of docs/SPEC.md
 * 3.2, which has these five under the same names).
 */
interface ActiveTargetInput {
  readonly settings: Settings;
  readonly eq: Equipment;
  readonly names: Pick<Names, "live" | "flat">;
  readonly local: SectionLocal;
  readonly fmt: Formatter;
}

/** What a screen's painter reads of a section's input: as the view, with the style, and of the names the flat mode's. */
interface ScreenInput extends Omit<ActiveTargetInput, "names"> {
  readonly names: Pick<Names, "flat">;
  readonly theme: Theme;
}

/** What the view of a beam's line reads of a section's input. */
interface BeamInput {
  readonly settings: Settings;
  readonly eq: Equipment;
  readonly fmt: Formatter;
}

/** What a beam's painter reads of a section's input. */
interface BeamPaintInput {
  readonly settings: Settings;
  readonly eq: Equipment;
  readonly theme: Theme;
}

/** A number field of the section's own; a field that is not given, or given as a text, is no number. */
function localNumber(local: SectionLocal, id: string): number {
  const value = local[id];
  return typeof value === "number" ? value : Number.NaN;
}

/** A message in its element, which is hidden when there is none (`showErr`, line 12). */
function shownIn(message: string): ElementPatch {
  return { text: message, hidden: message === "" };
}

/** Which check of Settings stops the section: the depth, the range, the transducer's depth, the angles, the mount angles, or none. */
type Fault = "" | "dep" | "atr" | "zt" | "aat" | "mnt";

/**
 * The check of Settings that stops the section (`renderAT`, line 918): the
 * first of the five that fails. The four of the live sonar are not checked
 * when it is not ticked, as Settings does not check them.
 */
function faultOf(a: Settings, eq: Equipment): Fault {
  const E = checkSettings(a, eq);
  if (E.dep) return "dep";
  if (E.atr) return "atr";
  if (E.zt) return "zt";
  if (E.aat) return "aat";
  return E.mnt ? "mnt" : "";
}

/** The live sonar as the section calculates with it (`renderAT`, lines 921 and 926). */
interface Slice {
  /** The width of the fan, in degrees. */
  readonly fw: number;
  /** The thickness of the slice, in degrees. */
  readonly t: number;
  /** The depth of the transducer, in metres below the surface. */
  readonly zt: number;
  /** The depth of the bottom, in metres below the surface. */
  readonly d: number;
  /** The centre of the flat mode's beam, in degrees below horizontal. */
  readonly sb: number;
  /** The range, in metres. */
  readonly R: number;
}

const sliceOf = (a: Settings): Slice => ({
  fw: a.atw,
  t: a.att,
  zt: a.zt,
  d: a.dep + a.zt,
  sb: a.atsb,
  R: a.atr,
});

/** What is wrong with the fish: its distance ahead, its depth, its distance to the side, or nothing. */
type FishFault = "" | "ahead" | "depth" | "side";

/** The fish, as its three fields give it. */
interface Fish {
  /** Its distance ahead of the transducer, in metres. */
  readonly fx: number;
  /** Its depth, in metres below the surface. */
  readonly fz: number;
  /** Its distance to the side of the aim line, in metres, to either side. */
  readonly fy: number;
  readonly fault: FishFault;
}

/**
 * The fish (`renderAT`, lines 923 and 924): reads the fields `fx`, `fz` and
 * `fy`. A distance to the other side is the same distance. The first of its
 * three checks that fails is its fault.
 */
function fishOf(local: SectionLocal, s: Slice): Fish {
  const fx = localNumber(local, FIELD_AHEAD);
  const fz = localNumber(local, FIELD_DEPTH);
  const fy = Math.abs(localNumber(local, FIELD_SIDE));
  let fault: FishFault = "";
  if (!(fx >= 0)) fault = "ahead";
  else if (!(fz > s.zt && fz < s.d)) fault = "depth";
  else if (!(fy >= 0)) fault = "side";
  return { fx, fz, fy, fault };
}

/** The fish in the Forward view (`renderAT`, lines 929 to 935). */
interface ForwardFish {
  /** How far off the centre of the slice it is, in degrees. */
  readonly phi: number;
  /** Whether it is within the slice's thickness. */
  readonly inFan: boolean;
  /** Whether the screen shows it. */
  readonly inside: boolean;
  /** Where it is drawn: ahead of the transducer and below the surface, in metres. */
  readonly dx: number;
  readonly dz: number;
}

function forwardOf(fish: Fish, s: Slice): ForwardFish {
  const zr = fish.fz - s.zt;
  const rho = Math.hypot(fish.fx, zr);
  const phi = deg(Math.atan2(fish.fy, rho));
  const k = Math.hypot(rho, fish.fy) / rho;
  const inFan = phi <= s.t / 2;
  const inside = inFan && Math.abs(deg(Math.atan2(fish.fx, zr)) - 45) <= 45 + 1e-9;
  return { phi, inFan, inside, dx: fish.fx * k, dz: s.zt + zr * k };
}

/** The fish in the Down view (`renderAT`, lines 936 to 941). */
interface DownFish {
  /** How far off the centre of the slice it is, in degrees. */
  readonly phi: number;
  /** Whether the screen shows it: it is within the slice's thickness and the fan's width. */
  readonly inside: boolean;
  /** Where it is drawn: to the side of the transducer and below the surface, in metres. */
  readonly dy: number;
  readonly dz: number;
}

function downOf(fish: Fish, s: Slice): DownFish {
  const zr = fish.fz - s.zt;
  const rho = Math.hypot(fish.fy, zr);
  const phi = deg(Math.atan2(fish.fx, rho));
  const k = Math.hypot(rho, fish.fx) / rho;
  const inside = phi <= s.t / 2 && deg(Math.atan2(fish.fy, zr)) <= s.fw / 2;
  return { phi, inside, dy: fish.fy * k, dz: s.zt + zr * k };
}

/** Where the flat mode's slice meets the bottom (`renderAT`, lines 947 and 948). */
interface Reach {
  /** The depth under the transducer as the section has it: the bottom's depth less the transducer's. */
  readonly H: number;
  /** The upper and the lower edge of the slice, in radians below horizontal. */
  readonly up: number;
  readonly dn: number;
  /** The distance on the screen from which the slice touches the bottom, in metres; Infinity for never. */
  readonly b1: number;
  /** The distance from which the whole slice is on the bottom, in metres; Infinity for never. */
  readonly b2: number;
}

function reachOf(s: Slice): Reach {
  const up = rad(s.sb - s.t / 2);
  const dn = rad(s.sb + s.t / 2);
  const H = s.d - s.zt;
  return {
    H,
    up,
    dn,
    b1: dn > 0 ? H / Math.sin(dn) : Number.POSITIVE_INFINITY,
    b2: up > 0 ? H / Math.sin(up) : Number.POSITIVE_INFINITY,
  };
}

/** What stops the results of the flat mode: the screen distance, the fish, or nothing. */
type FlatFault = "" | "screen" | "fish";

/** The check of the flat mode (`renderAT`, line 945): the screen distance first, then the fish. */
function flatFaultOf(sr: number, fish: Fish): FlatFault {
  if (!(sr > 0)) return "screen";
  return fish.fault === "" ? "" : "fish";
}

/** The fish in the flat mode's two views (`renderAT`, lines 960 to 966). */
interface FlatFish {
  /** Its distance from the transducer along the surface and in a straight line, in metres. */
  readonly hf: number;
  readonly rf: number;
  /** How far below horizontal it is, in degrees. */
  readonly el: number;
  /** Whether it is within the slice's thickness. */
  readonly elOk: boolean;
  /** Whether the flat screen shows it, and whether the wide one does. */
  readonly inside: boolean;
  readonly insideWide: boolean;
  /** Where it is drawn: to the side of the transducer and ahead of it, in metres. */
  readonly du: number;
  readonly dw: number;
}

function flatFishOf(fish: Fish, s: Slice): FlatFish {
  const zr = fish.fz - s.zt;
  const hf = Math.hypot(fish.fx, fish.fy);
  const el = deg(Math.atan2(zr, hf));
  const br = deg(Math.atan2(fish.fy, fish.fx));
  const rf = Math.hypot(hf, zr);
  const elOk = el >= s.sb - s.t / 2 && el <= s.sb + s.t / 2;
  return {
    hf,
    rf,
    el,
    elOk,
    inside: elOk && Math.abs(br) <= s.fw / 2,
    insideWide: elOk && Math.abs(br) <= Math.min(s.fw, 180),
    du: rf * Math.sin(rad(br)),
    dw: rf * Math.cos(rad(br)),
  };
}

/**
 * The table and the picture of the slice (`sliceTable`, lines 757 to 775): how
 * thick a slice of `t` degrees is at each of `SLICE_DISTANCES`, and the slice
 * seen from above out to `SLICE_REACH` metres, with its width exaggerated when
 * it would not fill the picture otherwise.
 */
function sliceView(f: Formatter, t: number): SectionView {
  const thickness = (r: number): string => `${f.fmt(2 * r * Math.tan(rad(t / 2)))} m`;
  let h = `<tr><th>Distance</th>${SLICE_DISTANCES.map((r) => `<th>${r} m</th>`).join("")}</tr>`;
  h += `<tr><td>Slice thickness</td>${SLICE_DISTANCES.map((r) => `<td class="n">${thickness(r)}</td>`).join("")}</tr>`;
  const L = 20;
  const W = 340;
  const s = (W - L - 20) / SLICE_REACH;
  const cy = 70;
  const hw = (r: number): number => r * Math.tan(rad(t / 2)) * s;
  const sc = Math.min(1, 60 / Math.max(hw(SLICE_REACH), 1));
  const far = L + SLICE_REACH * s;
  let g = "";
  g += `<polygon points="${L},${cy} ${far},${cy - hw(SLICE_REACH) * sc} ${far},${cy + hw(SLICE_REACH) * sc}" fill="var(--c2d)" fill-opacity="0.16" stroke="var(--c2d)" stroke-width="1.5"/>`;
  g += `<line x1="${L}" x2="${far}" y1="${cy}" y2="${cy}" stroke="var(--muted)" stroke-width="0.8" stroke-dasharray="3 3"/>`;
  for (const r of SLICE_MARKS) {
    const x = L + r * s;
    const h2 = hw(r) * sc;
    g += `<line x1="${x}" x2="${x}" y1="${cy - h2}" y2="${cy + h2}" stroke="var(--fg)" stroke-width="1.2"/>`;
    g += `<text x="${x}" y="${cy + 72}" text-anchor="middle" font-family="var(--font-data)" font-size="11" fill="var(--fg)">${thickness(r)}</text>`;
    g += `<text x="${x}" y="${cy + 88}" text-anchor="middle" font-family="var(--font-data)" font-size="11" fill="var(--muted)">at ${r} m</text>`;
  }
  g += `<circle cx="${L}" cy="${cy}" r="4" fill="var(--fg)"/>`;
  g += `<text x="${far}" y="14" text-anchor="end" font-size="11" fill="var(--muted)">${sc < 1 ? "width exaggerated to fit" : "to scale"}</text>`;
  return { "slice-table": { html: h }, "slice-svg": { html: g } };
}

/**
 * The fish in Forward and in Down (`renderAT`, lines 924 to 942): whether each
 * view shows it, how far off the centre of the slice it is, and where it is
 * drawn. While the fish is wrong its message is shown and the six results are
 * a dash.
 */
function fishView(f: Formatter, s: Slice, fish: Fish): SectionView {
  const messages: Readonly<Record<FishFault, string>> = {
    "": "",
    ahead: MESSAGES.ahead,
    depth: `The fish must be below the transducer (${f.fmt(s.zt)} m) and above the bottom (${f.fmt(s.d)} m below the surface).`,
    side: MESSAGES.side,
  };
  const view: Record<string, ElementPatch> = { "pos-err": shownIn(messages[fish.fault]) };
  if (fish.fault !== "") {
    for (const key of FISH_RESULTS) view[key] = { text: NO_VALUE };
    return view;
  }
  const edge = f.num(s.t / 2, 1);
  const fwd = forwardOf(fish, s);
  view["f-in"] = {
    text: fwd.inFan
      ? `yes, ${f.num(fwd.phi, 1)}° off center`
      : `no, ${f.num(fwd.phi, 1)}° off center (edge ${edge}°)`,
  };
  view["f-x"] = {
    text: fwd.inFan ? `${f.fmt(fwd.dx)} m (really ${f.fmt(fish.fx)} m)` : NO_VALUE,
  };
  view["f-z"] = {
    text: fwd.inFan ? `${f.fmt(fwd.dz)} m (really ${f.fmt(fish.fz)} m)` : NO_VALUE,
  };
  const down = downOf(fish, s);
  view["dn-in"] = {
    text: down.inside
      ? `yes, ${f.num(down.phi, 1)}° off center`
      : `no, ${f.num(down.phi, 1)}° off center (edge ${edge}°)`,
  };
  view["dn-y"] = {
    text: down.inside ? `${f.fmt(down.dy)} m (really ${f.fmt(fish.fy)} m)` : NO_VALUE,
  };
  view["dn-z"] = {
    text: down.inside ? `${f.fmt(down.dz)} m (really ${f.fmt(fish.fz)} m)` : NO_VALUE,
  };
  return view;
}

/**
 * The flat mode (`renderAT`, lines 944 to 967): from which distance on the
 * screen its slice touches the bottom and is all bottom, which are always
 * written; and, for the screen distance of the field `sr`, at which depths and
 * how far out a mark there can be, and whether the flat and the wide view show
 * the fish. While the screen distance or the fish is wrong, the message is
 * shown and those four results are a dash. `flat` is the flat mode's name.
 */
function flatView(
  f: Formatter,
  s: Slice,
  fish: Fish,
  local: SectionLocal,
  flat: string,
): SectionView {
  const sr = localNumber(local, FIELD_SCREEN);
  const fault = flatFaultOf(sr, fish);
  const messages: Readonly<Record<FlatFault, string>> = {
    "": "",
    screen: MESSAGES.screen,
    fish: MESSAGES.fishFirst,
  };
  const { H, up, dn, b1, b2 } = reachOf(s);
  const view: Record<string, ElementPatch> = {
    "sc-err": shownIn(messages[fault]),
    "sc-b1": { text: Number.isFinite(b1) ? `${f.fmt(b1)} m on screen` : "never" },
    "sc-b2": {
      text: Number.isFinite(b2)
        ? `${f.fmt(b2)} m on screen`
        : "never, the top of the slice stays in open water",
    },
  };
  if (fault !== "") {
    for (const key of FLAT_RESULTS) view[key] = { text: NO_VALUE };
    return view;
  }
  const zA = Math.max(0, s.zt + sr * Math.sin(up));
  const zB = Math.min(s.d, s.zt + sr * Math.sin(dn));
  if (zA >= s.d) {
    view["sc-z"] = { text: "on the bottom (the slice is all bottom here)" };
    view["sc-x"] = { text: `${f.fmt(Math.sqrt(Math.max(sr * sr - H * H, 0)))} m` };
  } else {
    view["sc-z"] = { text: `${f.fmt(zA)} to ${f.fmt(zB)} m below the surface` };
    const hA = Math.sqrt(Math.max(sr * sr - (zA - s.zt) * (zA - s.zt), 0));
    const hB = Math.sqrt(Math.max(sr * sr - (zB - s.zt) * (zB - s.zt), 0));
    view["sc-x"] = { text: `${f.fmt(Math.min(hA, hB))} to ${f.fmt(Math.max(hA, hB))} m` };
  }
  const m = flatFishOf(fish, s);
  view["sc-f"] = {
    text: m.inside
      ? `yes, drawn at ${f.fmt(m.rf)} m (really ${f.fmt(m.hf)} m away horizontally)`
      : `no, it is ${f.num(m.el, 1)}° below horizontal; the slice covers ${f.num(Math.max(s.sb - s.t / 2, 0), 1)}° to ${f.num(s.sb + s.t / 2, 1)}°`,
  };
  let wide = `no, same depth limit as single ${flat}`;
  if (m.insideWide) wide = `yes, drawn at ${f.fmt(m.rf)} m`;
  else if (m.elOk) wide = `no, outside the ${f.num(Math.min(2 * s.fw, 360), 0)}° view`;
  view["sc-fw"] = { text: wide };
  return view;
}

/**
 * What the ActiveTarget section writes at once (`renderAT`, lines 917 to 967,
 * and `sliceTable`). Reads of `settings` what the checks of Settings read; of
 * `eq` the flags `ss`, `2d`, `ds` and `at`; of `names` the names `live` and
 * `flat`; of `local` the fields `fx`, `fz`, `fy` and `sr` as numbers; and
 * `fmt`.
 *
 * The message of the section is always written. While the depth of Settings
 * fails, or the range, the transducer's depth, the angles or the mount angles
 * of the live sonar while it is ticked, nothing else is. Otherwise all eighteen
 * elements are written, those of a wrong fish or screen distance as a dash. An
 * element that is not written keeps what it had.
 */
export function activeTargetView(input: ActiveTargetInput): SectionView {
  const { settings: a, names, local, fmt: f } = input;
  const fault = faultOf(a, input.eq);
  if (fault !== "") {
    const bad = {
      dep: "depth",
      atr: "live sonar range",
      zt: "transducer depth",
      aat: `${names.live} angles`,
      mnt: `${names.live} mount angles`,
    } as const;
    return { "at-serr": shownIn(`Fix the ${bad[fault]} in Settings.`) };
  }
  const s = sliceOf(a);
  const fish = fishOf(local, s);
  return {
    "at-serr": shownIn(""),
    ...sliceView(f, s.t),
    ...fishView(f, s, fish),
    "edge-err": {
      text: `drawn ${f.num((1 / Math.cos(rad(s.t / 2)) - 1) * 100, 1)}% too far out`,
    },
    ...flatView(f, s, fish, local, names.flat),
  };
}

/** The distance between the marks of a picture that reaches `range` metres. */
function markStep(range: number): number {
  for (const [limit, step] of MARK_STEPS) if (range <= limit) return step;
  return MARK_STEP_BEYOND;
}

/**
 * A picture of echoes (`sector`, lines 776 to 784): each pixel in the colour of
 * the live sonar's palette for what `echo` gives for it, from 0 to 1, and the
 * colour of the screen's surround for an echo under 0.
 */
function sector(ctx: Ctx2D, W: number, H: number, echo: (x: number, y: number) => number): void {
  const img = ctx.createImageData(W, H);
  const p = img.data;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const I = echo(x, y);
      const o = (y * W + x) * 4;
      const c = I < 0 ? SCREEN.outside : mapLive(I);
      p[o] = c[0];
      p[o + 1] = c[1];
      p[o + 2] = c[2];
      p[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

/** Where a label stands on its point: it starts there, ends there, or is centred on it. */
type Align = "left" | "right" | "center";

/** A text on a dark plate (`label`, lines 785 to 789), in the font of the page's figures. */
function label(
  ctx: Ctx2D,
  font: string,
  text: string,
  x: number,
  y: number,
  align: Align = "left",
): void {
  ctx.font = `11px ${font}`;
  ctx.textAlign = align;
  const w = ctx.measureText(text).width;
  let bx = x - 4;
  if (align === "right") bx = x - w - 4;
  else if (align === "center") bx = x - w / 2 - 4;
  ctx.fillStyle = SCREEN.labelUnder;
  ctx.fillRect(bx, y - 11, w + 8, 15);
  ctx.fillStyle = SCREEN.text;
  ctx.fillText(text, x, y);
}

/**
 * How strongly open water and the bottom echo at one pixel of the Forward and
 * the Down screen (lines 797 and 798, 817 and 818): `n` is the pixel's noise,
 * `depth` its depth and `d` the bottom's, in metres below the surface.
 */
function waterEcho(n: number, depth: number, d: number): number {
  if (depth >= d) {
    const bl = depth - d;
    return bl < 0.25 ? 0.95 : 0.35 * M.exp(-bl / 1.5) + 0.15 * n;
  }
  return 0.05 + 0.05 * n;
}

/**
 * The simulated Forward screen (`drawForward`, lines 790 to 809), on the
 * canvas `CANVAS_FORWARD` at the size it has: the quarter from straight ahead
 * to straight down out to the range, the bottom, the fish where the slice shows
 * it, a ring at each mark of the range, and the labels of the bottom and of the
 * fish. Reads of `settings` what the checks of Settings read, the depth `dep`,
 * the range `atr`, the transducer's depth `zt` and the thickness `att`; of `eq`
 * the flags `ss`, `2d`, `ds` and `at`; of `local` the fields `fx`, `fz` and
 * `fy`; of `theme` the font `--font-data`; and `fmt`. Nothing is drawn while
 * the section is stopped by a check of Settings; while the fish is wrong the
 * screen is drawn without it.
 */
export function paintForward(surface: Surface, input: ScreenInput): void {
  const { settings: a, fmt: f } = input;
  if (faultOf(a, input.eq) !== "") return;
  const P = sliceOf(a);
  const fish = fishOf(input.local, P);
  const at = fish.fault === "" ? forwardOf(fish, P) : null;
  const fwd = at?.inside ? at : null;
  const font = input.theme.colours[FONT_DATA] ?? "";
  const ctx = surface.ctx;
  const W = surface.width;
  const H = surface.height;
  const ox = 14;
  const oy = 12;
  const s = Math.min((W - 30) / P.R, (H - 20) / P.R);
  sector(ctx, W, H, (px, py) => {
    const u = (px - ox) / s;
    const b = (py - oy) / s;
    if (u < 0 || b < 0) return -1;
    if (M.hypot(u, b) > P.R) return -1;
    if (fwd && M.hypot(u - fwd.dx, b - (fwd.dz - P.zt)) < 0.35) return 0.98;
    return waterEcho(hash(px, py), P.zt + b, P.d);
  });
  ctx.strokeStyle = SCREEN.ring;
  ctx.setLineDash([2, 5]);
  const step = markStep(P.R);
  for (let m = step; m <= P.R; m += step) {
    ctx.beginPath();
    ctx.arc(ox, oy, m * s, 0, Math.PI / 2);
    ctx.stroke();
    label(ctx, font, `${m} m`, ox + m * s + 4, oy + 12);
  }
  ctx.setLineDash([]);
  label(ctx, font, `bottom ${f.fmt(P.d)} m`, W - 6, oy + (P.d - P.zt) * s - 6, "right");
  if (fwd) {
    label(
      ctx,
      font,
      `fish ${f.fmt(fwd.dx)} m ahead, ${f.fmt(fwd.dz)} m deep`,
      Math.min(ox + fwd.dx * s + 8, W - 190),
      oy + (fwd.dz - P.zt) * s - 10,
    );
  } else label(ctx, font, "fish outside the slice", W - 6, H - 8, "right");
}

/**
 * The simulated Down screen (`drawDown`, lines 810 to 826), on the canvas
 * `CANVAS_DOWN` at the size it has: the fan from side to side under the
 * transducer out to the range, the bottom, the fish where the slice shows it,
 * and the labels of the two sides, of the bottom and of the fish. Reads what
 * `paintForward` reads, and of `settings` the fan's width `atw`.
 */
export function paintDown(surface: Surface, input: ScreenInput): void {
  const { settings: a, fmt: f } = input;
  if (faultOf(a, input.eq) !== "") return;
  const P = sliceOf(a);
  const fish = fishOf(input.local, P);
  const at = fish.fault === "" ? downOf(fish, P) : null;
  const down = at?.inside ? at : null;
  const font = input.theme.colours[FONT_DATA] ?? "";
  const ctx = surface.ctx;
  const W = surface.width;
  const H = surface.height;
  const cx = W / 2;
  const oy = 10;
  const half = rad(P.fw / 2);
  const s = Math.min((H - 16) / P.R, (W / 2 - 10) / (P.R * Math.sin(Math.min(half, Math.PI / 2))));
  sector(ctx, W, H, (px, py) => {
    const u = (px - cx) / s;
    const b = (py - oy) / s;
    if (b < 0) return -1;
    if (M.hypot(u, b) > P.R || M.abs(M.atan2(u, b)) > half) return -1;
    if (down && M.hypot(u - down.dy, b - (down.dz - P.zt)) < 0.35) return 0.98;
    return waterEcho(hash(px, py), P.zt + b, P.d);
  });
  label(ctx, font, "port", 8, H - 8);
  label(ctx, font, "starboard", W - 8, H - 8, "right");
  label(
    ctx,
    font,
    `bottom ${f.fmt(P.d)} m`,
    cx,
    Math.min(oy + (P.d - P.zt) * s - 6, H - 24),
    "center",
  );
  if (down) {
    label(
      ctx,
      font,
      `fish ${f.fmt(down.dz)} m deep`,
      cx + down.dy * s + 8,
      oy + (down.dz - P.zt) * s - 10,
    );
  } else label(ctx, font, "fish outside the slice", 8, 20);
}

/**
 * One of the two flat screens (`drawScoutGen`, lines 827 to 849, with what
 * `renderAT` gives it, lines 968 and 969): the flat mode seen from above out to
 * the range, as wide as one fan or, for `wide`, as two; the bottom from where
 * the slice touches it; the fish where the view shows it; an arc at each mark
 * of the range; and the labels of where the bottom starts and of the fish. The
 * canvas is made as high as the view needs.
 */
function paintFlatScreen(surface: Surface, input: ScreenInput, wide: boolean): void {
  const { settings: a, local, fmt: f } = input;
  if (faultOf(a, input.eq) !== "") return;
  const P = sliceOf(a);
  const half = wide ? Math.min(rad(P.fw), Math.PI) : rad(P.fw / 2);
  const fish = fishOf(local, P);
  const at =
    flatFaultOf(localNumber(local, FIELD_SCREEN), fish) === "" ? flatFishOf(fish, P) : null;
  const shown = at && (wide ? at.insideWide : at.inside) ? at : null;
  const { b1: lo, b2: full } = reachOf(P);
  const font = input.theme.colours[FONT_DATA] ?? "";
  const W = surface.width;
  const back = Math.max(0, -Math.cos(half));
  const side = half >= Math.PI / 2 ? 1 : Math.sin(half);
  const s = Math.min((W / 2 - 10) / (P.R * side), 240 / (P.R * (1 + back)));
  const Hc = Math.ceil(P.R * (1 + back) * s + 24);
  const ctx = surface.height !== Hc ? surface.resize(Hc) : surface.ctx;
  const cx = W / 2;
  const oy = 12 + P.R * s;
  const meetsBottom = Number.isFinite(lo);
  const allBottom = Number.isFinite(full);
  sector(ctx, W, Hc, (px, py) => {
    const u = (px - cx) / s;
    const w = (oy - py) / s;
    const r = M.hypot(u, w);
    if (r > P.R || M.abs(M.atan2(u, w)) > half) return -1;
    if (shown && M.hypot(u - shown.du, w - shown.dw) < 0.45) return 0.98;
    const n = hash(px, py);
    let I = 0.05 + 0.05 * n;
    if (meetsBottom && r >= lo) {
      const k = allBottom ? M.min(1, (r - lo) / M.max(full - lo, 0.5)) : M.min(1, (r - lo) / 3);
      I = M.max(I, (0.25 + 0.35 * hash(px >> 2, py >> 2) + 0.15 * n) * (0.4 + 0.6 * k));
      if (r - lo < 0.3) I = M.max(I, 0.8);
    }
    return I;
  });
  ctx.strokeStyle = SCREEN.ring;
  ctx.setLineDash([2, 5]);
  const step = markStep(P.R);
  for (let m = step; m <= P.R; m += step) {
    ctx.beginPath();
    ctx.arc(cx, oy, m * s, -Math.PI / 2 - half, -Math.PI / 2 + half);
    ctx.stroke();
    label(ctx, font, `${m} m`, cx + 4, oy - m * s + 12);
  }
  ctx.setLineDash([]);
  ctx.fillStyle = SCREEN.text;
  ctx.beginPath();
  ctx.arc(cx, oy, 3, 0, 7);
  ctx.fill();
  if (Number.isFinite(lo) && lo <= P.R) {
    label(ctx, font, `bottom starts ${f.fmt(lo)} m`, W - 8, Math.max(oy - lo * s + 4, 14), "right");
  }
  if (shown) {
    label(
      ctx,
      font,
      `fish ${f.fmt(shown.rf)} m`,
      Math.min(cx + shown.du * s + 8, W - 80),
      oy - shown.dw * s - 8,
    );
  } else label(ctx, font, `fish not in this ${input.names.flat} view`, 8, Hc - 6);
}

/**
 * The simulated screen of the flat mode, on the canvas `CANVAS_FLAT`. Reads of
 * `settings` what the checks of Settings read, the depth `dep`, the range
 * `atr`, the transducer's depth `zt`, the fan's width `atw`, the thickness
 * `att` and the mount angle `atsb`; of `eq` the flags `ss`, `2d`, `ds` and
 * `at`; of `names` the name `flat`; of `local` the fields `fx`, `fz`, `fy` and
 * `sr`; of `theme` the font `--font-data`; and `fmt`. Nothing is drawn while
 * the section is stopped by a check of Settings; while the fish or the screen
 * distance is wrong the screen is drawn without the fish.
 */
export function paintFlat(surface: Surface, input: ScreenInput): void {
  paintFlatScreen(surface, input, false);
}

/**
 * The simulated screen of the wide mode, on the canvas `CANVAS_WIDE`. Reads
 * what `paintFlat` reads, and of `eq` the flag `atw`: nothing is drawn without
 * two transducers. Its label for a fish outside the view names the flat mode,
 * as the earlier page's does.
 */
export function paintWide(surface: Surface, input: ScreenInput): void {
  if (!input.eq.atw) return;
  paintFlatScreen(surface, input, true);
}

/** A beam as its picture is drawn (`renderAT`, line 970). */
interface Beam {
  /** The depth under the transducer, in metres. */
  readonly H: number;
  /** The range, in metres. */
  readonly R: number;
  /** The depth of the transducer below the surface, in metres. */
  readonly zt: number;
  /** The centre of the forward fan, in radians below horizontal. */
  readonly fa: number;
  /** Half the fan's width, in radians. */
  readonly hw: number;
  /** Half the slice's thickness, in radians. */
  readonly ht: number;
  /** The centre of the flat mode's beam, in radians below horizontal. */
  readonly sb: number;
}

const beamOf = (a: Settings): Beam => ({
  H: a.dep,
  R: a.atr,
  zt: a.zt,
  fa: rad(a.atfa),
  hw: rad(a.atw / 2),
  ht: rad(a.att / 2),
  sb: rad(a.atsb),
});

/**
 * Whether a point is inside the beam of a mode (`beamMember`, lines 850 to
 * 857). The point is `x` metres ahead of the transducer, `y` to the side and
 * `z` below it; no point is inside beyond the range, above the surface or
 * below the bottom. Forward is a fan in the plane ahead and down, Down a fan
 * from side to side under the transducer, the flat mode a fan around the boat
 * that is tilted down, and the wide mode that fan twice as wide.
 */
export function beamMember(mode: BeamMode, x: number, y: number, z: number, B: Beam): boolean {
  const r2 = x * x + y * y + z * z;
  if (r2 > B.R * B.R || z < -B.zt || z > B.H) return false;
  if (mode === "F") {
    const rho = M.hypot(x, z);
    if (rho < 1e-6) return true;
    if (M.atan2(M.abs(y), rho) > B.ht) return false;
    const an = M.atan2(z, x);
    return an >= B.fa - B.hw && an <= B.fa + B.hw;
  }
  if (mode === "D") {
    const rho = M.hypot(y, z);
    if (rho < 1e-6) return true;
    if (M.atan2(M.abs(x), rho) > B.ht) return false;
    return M.abs(M.atan2(y, z)) <= B.hw && z > 0;
  }
  const h = M.hypot(x, y);
  if (h < 1e-6) return false;
  if (M.abs(M.atan2(y, x)) > (mode === "W" ? M.min(2 * B.hw, M.PI) : B.hw)) return false;
  const e = M.atan2(z, h);
  return e >= B.sb - B.ht && e <= B.sb + B.ht;
}

/** The modes whose beam the earlier page draws (`drawBeams`, line 915): the wide one with two transducers only. */
export function beamModes(eq: Pick<Equipment, "atw">): readonly BeamMode[] {
  return eq.atw ? BEAM_MODES : BEAM_MODES.filter((mode) => mode !== "W");
}

/** Where the picture of a beam starts on the left, the space between its two views, and the steps a beam is sampled in. */
const BEAM_LEFT = 4;
const BEAM_GAP = 22;
const BEAM_SAMPLES = 24;

/** The frame of a beam's picture (`drawBeam`, lines 861 to 864): the view from the side over the view from above. */
interface Frame {
  /** The pixels to a metre. */
  readonly s: number;
  /** The depths at the top and at the bottom of the view from the side, in metres below the transducer. */
  readonly zTop: number;
  readonly zBot: number;
  /** The height of the view from the side, in pixels. */
  readonly sideH: number;
  /** The distance to each side that the view from above reaches, in metres. */
  readonly ymax: number;
  /** The height of the view from above, in pixels. */
  readonly topH: number;
  /** The height of the whole picture, in pixels. */
  readonly H: number;
}

function frameOf(mode: BeamMode, B: Beam, W: number): Frame {
  const xmin = -B.R;
  const xmax = B.R;
  const s = (W - 8) / (xmax - xmin);
  const zTop = -B.zt - 0.5;
  const zBot = Math.min(B.H, B.R) + 1.5;
  const sideH = Math.ceil((zBot - zTop) * s) + 4;
  const ymax = mode === "F" ? Math.max(B.R * Math.tan(B.ht) * 1.25, 2) : B.R;
  const topH = Math.ceil(2 * ymax * s) + 4;
  return { s, zTop, zBot, sideH, ymax, topH, H: sideH + BEAM_GAP + topH + 16 };
}

/** What a scan of a beam's picture marks: a pixel where the beam is in the water, and one where it is on the bottom. */
interface Marker {
  water(px: number, py: number): void;
  bottom(px: number, py: number): void;
}

/** Where a beam meets the bottom, from the pixels of the view from above. */
interface Footprint {
  /** The least and the greatest distance ahead, in metres; Infinity and -Infinity when no pixel is on the bottom. */
  readonly fx0: number;
  readonly fx1: number;
  /** The greatest distance to a side, in metres. */
  readonly fw: number;
}

/**
 * The pixels of a beam's picture (`drawBeam`, lines 871 to 886), `W` wide: in
 * the view from the side, each pixel whose column of water holds the beam at
 * one of `BEAM_SAMPLES` steps to the side; in the view from above, each pixel
 * on the bottom that the beam meets and, where it does not, each whose depth
 * holds the beam at one of the steps down. Gives where the beam meets the
 * bottom, which is read from the centres of the pixels. Without a `marker`
 * only that is worked out, from the bottom's pixels alone.
 */
function scan(mode: BeamMode, B: Beam, W: number, fr: Frame, marker: Marker | null): Footprint {
  const xmin = -B.R;
  const N = BEAM_SAMPLES;
  let fx0 = Number.POSITIVE_INFINITY;
  let fx1 = Number.NEGATIVE_INFINITY;
  let fw = 0;
  for (let px = 0; px < W; px++) {
    const x = xmin + (px - BEAM_LEFT + 0.5) / fr.s;
    if (marker) {
      for (let py = 0; py < fr.sideH; py++) {
        const z = fr.zTop + (py + 0.5) / fr.s;
        if (z < -B.zt || z > B.H) continue;
        let hit = false;
        for (let k = 0; k <= N && !hit; k++) {
          if (beamMember(mode, x, (k / N) * fr.ymax, z, B)) hit = true;
        }
        if (hit) marker.water(px, py);
      }
    }
    for (let qy = 0; qy < fr.topH; qy++) {
      const y = fr.ymax - (qy + 0.5) / fr.s;
      if (beamMember(mode, x, y, B.H, B)) {
        if (marker) marker.bottom(px, fr.sideH + BEAM_GAP + qy);
        if (x < fx0) fx0 = x;
        if (x > fx1) fx1 = x;
        if (M.abs(y) > fw) fw = M.abs(y);
      } else if (marker) {
        let on = false;
        for (let j = 0; j <= N && !on; j++) {
          if (beamMember(mode, x, y, -B.zt + (j / N) * (B.H + B.zt), B)) on = true;
        }
        if (on) marker.water(px, fr.sideH + BEAM_GAP + qy);
      }
    }
  }
  return { fx0, fx1, fw };
}

/**
 * The picture of one mode's beam (`drawBeam`, lines 859 to 901), on the canvas
 * `BEAM_CANVAS[mode]`, which is made as high as the picture needs: the beam
 * from the side over the beam from above, light where it is in the water and
 * dark where it meets the bottom, with the surface, the bottom, the transducer
 * and a scale of distances. Reads of `settings` what the checks of Settings
 * read, the depth `dep`, the range `atr`, the transducer's depth `zt`, the
 * fan's width `atw`, the thickness `att` and the mount angles `atfa` and
 * `atsb`; of `eq` the flags `ss`, `2d`, `ds`, `at` and `atw`; and of `theme`
 * the colours `--surface`, `--muted`, `--water`, `--fg`, `--accent` and `--c2d`
 * and the fonts `--font-body` and `--font-data`. Nothing is drawn while the
 * section is stopped by a check of Settings, nor for the wide mode without two
 * transducers.
 *
 * The earlier page fills the canvas with the background colour and reads its
 * pixels back; here the pixels are made in that colour (docs/SPEC.md 3.3),
 * which is the same picture for an opaque colour that `parseColour` reads.
 */
export function paintBeam(mode: BeamMode, surface: Surface, input: BeamPaintInput): void {
  const { settings: a, eq } = input;
  if (faultOf(a, eq) !== "" || (mode === "W" && !eq.atw)) return;
  const B = beamOf(a);
  const W = surface.width;
  const fr = frameOf(mode, B, W);
  const { s, sideH, H } = fr;
  const ctx = surface.height !== H ? surface.resize(H) : surface.ctx;
  const style = (name: string): string => input.theme.colours[name] ?? "";
  const bg = style(STYLE.background);
  const line = style(STYLE.line);
  const footC = style(STYLE.bottom);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const img = ctx.createImageData(W, H);
  const p = img.data;
  const cB = parseColour(style(STYLE.beam));
  const cF = parseColour(footC);
  const cBg = parseColour(bg);
  for (let o = 0; o < p.length; o += 4) {
    p[o] = cBg[0];
    p[o + 1] = cBg[1];
    p[o + 2] = cBg[2];
    p[o + 3] = 255;
  }
  const put = (px: number, py: number, c: Rgb, al: number): void => {
    const o = (py * W + px) * 4;
    p[o] = M.round(cBg[0] + (c[0] - cBg[0]) * al);
    p[o + 1] = M.round(cBg[1] + (c[1] - cBg[1]) * al);
    p[o + 2] = M.round(cBg[2] + (c[2] - cBg[2]) * al);
    p[o + 3] = 255;
  };
  const { fx0, fx1 } = scan(mode, B, W, fr, {
    water: (px, py) => put(px, py, cB, 0.35),
    bottom: (px, py) => put(px, py, cF, 0.75),
  });
  ctx.putImageData(img, 0, 0);
  const xmin = -B.R;
  const XS = (xx: number): number => BEAM_LEFT + (xx - xmin) * s;
  const ZS = (zz: number): number => (zz - fr.zTop) * s;
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = style(STYLE.water);
  ctx.beginPath();
  ctx.moveTo(0, ZS(-B.zt));
  ctx.lineTo(W, ZS(-B.zt));
  ctx.stroke();
  if (B.H <= fr.zBot) {
    ctx.strokeStyle = line;
    ctx.beginPath();
    ctx.moveTo(0, ZS(B.H));
    ctx.lineTo(W, ZS(B.H));
    ctx.stroke();
  }
  if (Number.isFinite(fx0)) {
    ctx.strokeStyle = footC;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(XS(fx0), ZS(B.H));
    ctx.lineTo(XS(fx1), ZS(B.H));
    ctx.stroke();
  }
  ctx.fillStyle = style(STYLE.mark);
  ctx.beginPath();
  ctx.arc(XS(0), ZS(0), 3, 0, 7);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(XS(0), sideH + BEAM_GAP + fr.ymax * s, 3, 0, 7);
  ctx.fill();
  ctx.font = `10px ${style(FONT_BODY)}`;
  ctx.fillStyle = line;
  ctx.textAlign = "left";
  ctx.fillText("side view", 4, 10);
  ctx.fillText("top view", 4, sideH + 14);
  ctx.textAlign = "center";
  ctx.font = `10px ${style(FONT_DATA)}`;
  const step = markStep(B.R);
  ctx.strokeStyle = line;
  ctx.lineWidth = 0.6;
  for (let m = -Math.floor(B.R / step) * step; m <= B.R; m += step) {
    ctx.beginPath();
    ctx.moveTo(XS(m), H - 14);
    ctx.lineTo(XS(m), H - 10);
    ctx.stroke();
    ctx.fillText(`${m}`, XS(m), H - 1);
  }
  ctx.beginPath();
  ctx.moveTo(0, H - 12);
  ctx.lineTo(W, H - 12);
  ctx.stroke();
  ctx.textAlign = "right";
  ctx.fillText("ahead →", W - 2, sideH + 14);
}

/**
 * The line under one mode's beam (`drawBeam`, lines 902 to 910): where the
 * beam meets the bottom, or that it does not. The earlier page reads this from
 * the pixels of the picture, so the line is that of a canvas `width` pixels
 * wide, which the shell gives as the canvas `BEAM_CANVAS[mode]` has it. Reads
 * of `settings` and `eq` what `paintBeam` reads, and `fmt`. Nothing is written
 * while the section is stopped by a check of Settings, nor for the wide mode
 * without two transducers: the line keeps what it had.
 */
export function beamView(mode: BeamMode, width: number, input: BeamInput): SectionView {
  const { settings: a, eq, fmt: f } = input;
  if (faultOf(a, eq) !== "" || (mode === "W" && !eq.atw)) return {};
  const B = beamOf(a);
  const { fx0, fx1, fw } = scan(mode, B, width, frameOf(mode, B, width), null);
  let txt: string;
  if (!Number.isFinite(fx0)) txt = "Doesn't reach the bottom at this depth and range.";
  else if (mode === "F") {
    const from = fx0 < 0 ? `${f.fmt(-fx0)} m behind` : `${f.fmt(fx0)} m ahead`;
    txt = `Hits the bottom from ${from} to ${f.fmt(fx1)} m ahead, up to ${f.fmt(2 * fw)} m wide.`;
  } else if (mode === "D") {
    txt = `Hits the bottom in a strip ${f.fmt(2 * fw)} m wide side to side and ${f.fmt(fx1 - fx0)} m long.`;
  } else {
    const h1 = B.H / Math.tan(B.sb + B.ht);
    const rmax = Math.sqrt(Math.max(B.R * B.R - B.H * B.H, 0));
    const h2 = B.sb - B.ht > 0 ? Math.min(B.H / Math.tan(B.sb - B.ht), rmax) : rmax;
    const across =
      mode === "W" ? Math.min((4 * B.hw * 180) / Math.PI, 360) : (2 * B.hw * 180) / Math.PI;
    txt = `Hits the bottom in a band ${f.fmt(h1)} to ${f.fmt(h2)} m out from the transducer, across ${f.num(across, 0)}°.`;
  }
  return {
    [BEAM_LINE[mode]]: {
      text: `${txt} Top-view width ${mode === "F" ? "scaled to fit" : "to scale"}.`,
    },
  };
}
