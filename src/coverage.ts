/**
 * 2D and DownScan (docs/SPEC.md 2.2): the earlier page's lines 586 to 755.
 * What the section writes is a `SectionView` by element id (`coverageView`),
 * and what it draws on its two simulated screens goes through an injected
 * `Surface`, one painter for each canvas (`paintScreen2d`, `paintScreenDs`).
 * Nothing here finds an element, reads a field or a style: the section's own
 * fields and the style are given.
 */
import { hash, lerpColor, map2d, mapLive } from "./colour";
import { deg, NO_VALUE, niceRange, rad } from "./format";
import { checkSettings } from "./settings";
import { combined } from "./transducers";
import type {
  ConeSetting,
  ElementPatch,
  Equipment,
  Formatter,
  Names,
  SectionLocal,
  SectionView,
  Settings,
  Surface,
  Theme,
  UiState,
} from "./types";

/** The elements `coverageView` writes, by id. */
export const KEYS = [
  "vs-serr",
  "o-cone",
  "o-fan",
  "cov-svg",
  "cov-graph",
  "fq-table",
  "fq-note",
  "off-err",
  "o-shown",
  "o-err",
  "o-ang",
  "o-in2d",
  "o-inds",
  "o-max2d",
  "o-maxds",
  "off-graph",
  "arch-err",
  "arch-res",
  "a-top",
  "a-end",
  "a-h",
  "a-len",
  "ds-len",
  "cap-2d",
  "cap-ds",
] as const;

/** The canvas `paintScreen2d` draws on, by id. */
export const CANVAS_2D = "scr2d";

/** The canvas `paintScreenDs` draws on, by id. */
export const CANVAS_DS = "scrds";

/** The section's own number fields: a target's depth and side distance, a fish's, and the screen time. */
const FIELD_TARGET_DEPTH = "z";
const FIELD_TARGET_SIDE = "x";
const FIELD_FISH_DEPTH = "zf";
const FIELD_FISH_SIDE = "y";
const FIELD_SCREEN_TIME = "scrT";

/** The two choices of transducer, whose label and note stand over the table of frequencies. */
const FIELD_FIRST = "img-p";
const FIELD_SECOND = "img-s";

/** The custom property that names the font of the page's figures. */
const FONT_DATA = "--font-data";

/** The seconds the screens show when the field holds no time over 0. */
const SCREEN_SECONDS = 20;

/** The messages of the section that name no value, word for word as the earlier page has them. */
const MESSAGES = {
  targetDepth: "Enter a target depth greater than 0 m.",
  side: "Enter a side distance of 0 m or more.",
  fishDepth: "Enter a fish depth greater than 0 m.",
  speed: "Enter a speed in Settings.",
} as const;

/** The frame of the two graphs, in the units of their pictures. */
const FRAME = { width: 340, left: 38, top: 10, bottom: 180, right: 10 } as const;

/**
 * The steps of the width axis: up to the first number of a pair the axis has
 * steps of the second, in metres.
 */
const WIDTH_STEPS: readonly (readonly [number, number])[] = [
  [3, 0.5],
  [6, 1],
  [15, 2.5],
  [30, 5],
  [60, 10],
];

/** The step of the width axis beyond the last of `WIDTH_STEPS`. */
const WIDTH_STEP_BEYOND = 20;

/** The least depth the graph of width against depth reaches, in metres, and its two steps. */
const DEPTH_AXIS = { least: 30, step: 5, stepBeyond: 10 } as const;

/**
 * The graph of a target off to the side: it reaches `angle` degrees from
 * straight down and `error` per cent, in steps of 5.
 */
const OFFSET_GRAPH = { angle: 40, angleStep: 5, error: 30, errorStep: 5 } as const;

/**
 * The marks of a screen's depth scale: a screen that reaches up to the first
 * number of a pair has a mark every second number, in metres.
 */
const MARK_STEPS: readonly (readonly [number, number])[] = [
  [10, 2],
  [25, 5],
  [60, 10],
];

/** The distance between the marks of a screen that reaches further. */
const MARK_STEP_BEYOND = 25;

/** The colours of the two screens' lines and labels, which are the same in light and dark. */
const SCREEN = {
  rangeLine: "rgba(255,255,255,0.15)",
  markUnder: "rgba(0,0,0,0.6)",
  text: "#ffffff",
  centreLine: "rgba(255,255,255,0.35)",
  labelUnder: "rgba(0,0,0,0.65)",
} as const;

/**
 * What the view reads of a section's input (the `ViewInput` of docs/SPEC.md
 * 3.2, which has these six under the same names).
 */
interface CoverageInput {
  readonly settings: Settings;
  readonly eq: Equipment;
  readonly ui: Pick<UiState, "f2d" | "fds">;
  readonly names: Pick<Names, "side" | "down">;
  readonly local: SectionLocal;
  readonly fmt: Formatter;
}

/** What a painter reads of a section's input: as the view, with the style and without the names. */
interface ScreenInput extends Omit<CoverageInput, "names"> {
  readonly theme: Theme;
}

/** A number field of the section's own; a field that is not given, or given as a text, is no number. */
function localNumber(local: SectionLocal, id: string): number {
  const value = local[id];
  return typeof value === "number" ? value : Number.NaN;
}

/** A choice of the page; one that is not given, or given as a number, is no choice. */
function localChoice(local: SectionLocal, id: string): string {
  const value = local[id];
  return typeof value === "string" ? value : "";
}

/** A message in its element, which is hidden when there is none (`showErr`, line 12). */
function shownIn(message: string): ElementPatch {
  return { text: message, hidden: message === "" };
}

/** The frame of a graph: its html, and where a value stands across and up. */
interface Frame {
  readonly g: string;
  X(v: number): number;
  Y(v: number): number;
}

/**
 * The frame of a graph (`axes`, lines 587 to 597): a line and a number for
 * every `ystep` up to `ymax`, a number for every `xstep` up to `xmax`, and the
 * two captions. A value over `ymax` stands at the top. The numbers up are
 * written with one decimal for a step under 1 and as whole numbers otherwise,
 * the numbers across always as whole numbers, with a decimal point in every
 * locale, as the earlier page writes them. The earlier function also takes the
 * frame, which both its calls give alike (`FRAME`), and a unit for the numbers
 * up, which both give empty.
 */
export function axes(
  xmax: number,
  xstep: number,
  xlab: string,
  ymax: number,
  ystep: number,
  ylab: string,
): Frame {
  const { width: W, left: L, top: T, bottom: B, right: Rm } = FRAME;
  const X = (v: number): number => L + (v / xmax) * (W - L - Rm);
  const Y = (v: number): number => B - (Math.min(v, ymax) / ymax) * (B - T);
  let g = "";
  for (let yv = 0; yv <= ymax + 1e-9; yv += ystep) {
    g += `<line x1="${L}" x2="${W - Rm}" y1="${Y(yv)}" y2="${Y(yv)}" stroke="var(--line)" stroke-width="${yv === 0 ? 1.2 : 0.6}"/>`;
    g += `<text x="${L - 6}" y="${Y(yv) + 4}" text-anchor="end" font-family="var(--font-data)" font-size="11" fill="var(--muted)">${ystep < 1 ? yv.toFixed(1) : Math.round(yv)}</text>`;
  }
  for (let xv = 0; xv <= xmax + 1e-9; xv += xstep) {
    g += `<text x="${X(xv)}" y="${B + 16}" text-anchor="middle" font-family="var(--font-data)" font-size="11" fill="var(--muted)">${Math.round(xv)}</text>`;
  }
  g += `<text x="${(L + W - Rm) / 2}" y="${B + 32}" text-anchor="middle" font-size="11" fill="var(--muted)">${xlab}</text>`;
  g += `<text x="4" y="${T}" font-size="11" fill="var(--muted)" dominant-baseline="hanging">${ylab}</text>`;
  return { g, X, Y };
}

/**
 * The step of the width axis for a greatest width of `max` metres (`stepOf`,
 * line 598). A width that is no number has the step beyond the last.
 */
export function stepOf(max: number): number {
  for (const [limit, step] of WIDTH_STEPS) if (max <= limit) return step;
  return WIDTH_STEP_BEYOND;
}

/** Which check of Settings stops the section: the depth, the 2D angles, the down imaging angles, or none. */
type Fault = "" | "dep" | "a2d" | "ads";

/**
 * The check of Settings that stops the section (`renderVS`, line 707): the
 * first of the depth, the 2D angles and the down imaging angles that fails.
 * The angles of a sonar that is not ticked are not checked, as Settings does
 * not check them.
 */
function faultOf(a: Settings, eq: Equipment): Fault {
  const E = checkSettings(a, eq);
  if (E.dep) return "dep";
  if (E.a2d) return "a2d";
  return E.ads ? "ads" : "";
}

/**
 * The chosen 2D and down imaging frequency (line 710): the one the saved view
 * state names, or the first for a choice that names none of the list. Throws a
 * TypeError when a list is empty, where the earlier page fails in the same
 * way.
 */
function chosen(
  a: Settings,
  ui: Pick<UiState, "f2d" | "fds">,
): { readonly c2: ConeSetting; readonly cd: ConeSetting } {
  const c2 = a.cone[Number(ui.f2d)] ?? a.cone[0];
  const cd = a.down[Number(ui.fds)] ?? a.down[0];
  if (!c2 || !cd) throw new TypeError("the transducer has no 2D or no down imaging frequency");
  return { c2, cd };
}

/**
 * The picture from behind the boat (`drawCoverage`, lines 601 to 622): the
 * cone and the fan of the sonars that are ticked down to the bottom at the
 * depth `d`, each with its width under it. `t2` and `ts` are the two angles,
 * `down` the name of down imaging. The picture is as high as what is drawn.
 */
function behindPicture(
  f: Formatter,
  d: number,
  t2: number,
  ts: number,
  eq: Equipment,
  down: string,
): ElementPatch {
  const on2 = eq["2d"];
  const onS = eq.ds;
  const hw2 = d * Math.tan(rad(t2 / 2));
  const hws = d * Math.tan(rad(ts / 2));
  const s = Math.min(128 / d, 140 / Math.max(on2 ? hw2 : 0, onS ? hws : 0, 0.01));
  const cx = 160;
  const ty = 22;
  const yb = ty + d * s;
  let g = "";
  g += '<line x1="8" y1="16" x2="312" y2="16" stroke="var(--water)" stroke-width="1.2"/>';
  g += `<rect x="8" y="${yb}" width="304" height="10" fill="var(--ground)" opacity="0.6"/>`;
  if (onS) {
    g += `<polygon points="${cx},${ty} ${cx - hws * s},${yb} ${cx + hws * s},${yb}" fill="var(--cds)" fill-opacity="0.14" stroke="var(--cds)" stroke-width="1.5" stroke-dasharray="5 4"/>`;
  }
  if (on2) {
    g += `<polygon points="${cx},${ty} ${cx - hw2 * s},${yb} ${cx + hw2 * s},${yb}" fill="var(--c2d)" fill-opacity="0.18" stroke="var(--c2d)" stroke-width="1.5"/>`;
  }
  g += `<line x1="8" y1="${yb}" x2="312" y2="${yb}" stroke="var(--muted)" stroke-width="1.2"/>`;
  g += `<circle cx="${cx}" cy="${ty}" r="4" fill="var(--fg)"/>`;
  let yy = yb + 22;
  const dim = (hw: number, col: string, text: string): void => {
    g += `<line x1="${cx - hw * s}" x2="${cx + hw * s}" y1="${yy}" y2="${yy}" stroke="${col}" stroke-width="1.5"/>`;
    g += `<line x1="${cx - hw * s}" x2="${cx - hw * s}" y1="${yy - 4}" y2="${yy + 4}" stroke="${col}" stroke-width="1.5"/>`;
    g += `<line x1="${cx + hw * s}" x2="${cx + hw * s}" y1="${yy - 4}" y2="${yy + 4}" stroke="${col}" stroke-width="1.5"/>`;
    g += `<text x="${cx}" y="${yy + 16}" text-anchor="middle" font-family="var(--font-data)" font-size="11" fill="var(--fg)">${text}</text>`;
    yy += 28;
  };
  if (on2) dim(hw2, "var(--c2d)", `2D ${f.fmt(2 * hw2)} m`);
  if (onS) dim(hws, "var(--cds)", `${down} ${f.fmt(2 * hws)} m`);
  g += `<text x="${cx + 8}" y="${(ty + yb) / 2}" font-family="var(--font-data)" font-size="11" fill="var(--muted)">${f.fmt(d)} m</text>`;
  return { attrs: { viewBox: `0 0 320 ${Math.ceil(yy - 4)}` }, html: g };
}

/**
 * The graph of the width on the bottom against the depth (`drawCoverage`,
 * lines 624 to 632): a line for each sonar that is ticked, out to a depth that
 * holds one and a half times the depth `d`, and a mark on each at the depth.
 */
function widthGraph(d: number, t2: number, ts: number, eq: Equipment): string {
  const on2 = eq["2d"];
  const onS = eq.ds;
  const hw2 = d * Math.tan(rad(t2 / 2));
  const hws = d * Math.tan(rad(ts / 2));
  const xmax = Math.max(DEPTH_AXIS.least, niceRange(d * 1.5));
  const ymax0 = 2 * xmax * Math.tan(rad(Math.max(on2 ? t2 : 0, onS ? ts : 0) / 2));
  const ys = stepOf(ymax0);
  const ymax = Math.ceil(ymax0 / ys) * ys;
  const ax = axes(
    xmax,
    xmax <= DEPTH_AXIS.least ? DEPTH_AXIS.step : DEPTH_AXIS.stepBeyond,
    "Depth (m)",
    ymax,
    ys,
    "m",
  );
  let g = ax.g;
  if (on2) {
    g += `<line x1="${ax.X(0)}" y1="${ax.Y(0)}" x2="${ax.X(xmax)}" y2="${ax.Y(2 * xmax * Math.tan(rad(t2 / 2)))}" stroke="var(--c2d)" stroke-width="2"/>`;
  }
  if (onS) {
    g += `<line x1="${ax.X(0)}" y1="${ax.Y(0)}" x2="${ax.X(xmax)}" y2="${ax.Y(2 * xmax * Math.tan(rad(ts / 2)))}" stroke="var(--cds)" stroke-width="2" stroke-dasharray="6 4"/>`;
  }
  g += `<line x1="${ax.X(d)}" x2="${ax.X(d)}" y1="${FRAME.top}" y2="${FRAME.bottom}" stroke="var(--muted)" stroke-width="0.8" stroke-dasharray="2 3"/>`;
  if (on2) {
    g += `<circle cx="${ax.X(d)}" cy="${ax.Y(2 * hw2)}" r="4" fill="var(--c2d)" stroke="var(--surface)" stroke-width="2"/>`;
  }
  if (onS) {
    g += `<circle cx="${ax.X(d)}" cy="${ax.Y(2 * hws)}" r="4" fill="var(--cds)" stroke="var(--surface)" stroke-width="2"/>`;
  }
  return g;
}

/**
 * The table of frequencies and its note (`freqTable`, lines 693 to 705): a row
 * for each frequency of the sonars that are ticked, with its angle, its width
 * on the bottom at the depth `d` and the error at its edge; for side imaging
 * its range. An angle that is not the preset's is marked, and the note says
 * so. The note starts with the label and the note of the transducers chosen
 * (`PC`, line 188), which are read from the two choices `img-p` and `img-s`;
 * a choice that is not given is no choice, which is the first preset. The
 * angles of side imaging are written as they are: the section has no check for
 * them.
 */
function frequencyView(
  f: Formatter,
  a: Settings,
  d: number,
  eq: Equipment,
  names: Pick<Names, "side" | "down">,
  local: SectionLocal,
): SectionView {
  const rows: { readonly c: ConeSetting; readonly mode: string; readonly side: boolean }[] = [];
  if (eq["2d"]) {
    for (const c of a.cone) rows.push({ c, mode: `2D${c.n ? ` ${c.n}` : ""}`, side: false });
  }
  if (eq.ds) for (const c of a.down) rows.push({ c, mode: names.down, side: false });
  if (eq.ss) for (const c of a.side) rows.push({ c, mode: `${names.side}, per side`, side: true });
  let h =
    "<tr><th>Freq</th><th>Use</th><th>Angle</th><th>Width on bottom</th><th>Edge err.</th></tr>";
  for (const q of rows) {
    const an = q.c.a;
    const mod = an !== q.c.def;
    let w = `${f.fmt(2 * d * Math.tan(rad(an / 2)))} m`;
    let e = `${f.num((1 / Math.cos(rad(an / 2)) - 1) * 100, 1)}%`;
    if (q.side) {
      w = q.c.r ? `max ${f.num(q.c.r, 0)} m out` : NO_VALUE;
      e = NO_VALUE;
    }
    h += `<tr><td class="n">${q.c.f}</td><td>${q.mode}</td><td class="n"${mod ? ' style="color:var(--accent)"' : ""}>${f.num(an, 0)}°${mod ? "*" : ""}</td><td class="n">${w}</td><td class="n">${e}</td></tr>`;
  }
  const p = combined(localChoice(local, FIELD_FIRST), localChoice(local, FIELD_SECOND));
  const changed = rows.some((q) => q.c.a !== q.c.def) ? " * your value, not the preset's." : "";
  return {
    "fq-table": { html: h },
    "fq-note": {
      text: `${p.label}. ${p.note}${changed} Widths and edge errors are at your depth.`,
    },
  };
}

/**
 * The graph of a target off to the side (`drawOff`, lines 634 to 647): by how
 * many per cent a target is drawn too deep at each angle from straight down,
 * the edge of each sonar that is ticked, where it lies inside the graph, and
 * the target's mark at `alpha` degrees, or none for `null` and beyond the
 * graph.
 */
function offsetGraph(
  t2: number,
  ts: number,
  alpha: number | null,
  eq: Equipment,
  down: string,
): string {
  const ax = axes(
    OFFSET_GRAPH.angle,
    OFFSET_GRAPH.angleStep,
    "Angle from straight down (°)",
    OFFSET_GRAPH.error,
    OFFSET_GRAPH.errorStep,
    "%",
  );
  let g = ax.g;
  let p = "";
  for (let k = 0; k <= 80; k++) {
    const an = k * 0.5;
    p += `${p ? "L" : "M"}${ax.X(an).toFixed(1)} ${ax.Y((1 / Math.cos(rad(an)) - 1) * 100).toFixed(1)}`;
  }
  g += `<path d="${p}" fill="none" stroke="var(--fg)" stroke-width="2"/>`;
  const edges: (readonly [number, string, string])[] = [];
  if (eq["2d"]) edges.push([t2 / 2, "var(--c2d)", "2D edge"]);
  if (eq.ds) edges.push([ts / 2, "var(--cds)", `${down} edge`]);
  for (const [i, e] of edges.entries()) {
    if (e[0] > OFFSET_GRAPH.angle) continue;
    g += `<line x1="${ax.X(e[0])}" x2="${ax.X(e[0])}" y1="${FRAME.top}" y2="${FRAME.bottom}" stroke="${e[1]}" stroke-width="1.5" stroke-dasharray="4 3"/>`;
    const right = ax.X(e[0]) < 250;
    g += `<text x="${ax.X(e[0]) + (right ? 5 : -5)}" y="${24 + i * 14}" text-anchor="${right ? "start" : "end"}" font-size="11" fill="var(--fg)">${e[2]}</text>`;
  }
  if (alpha !== null && alpha <= OFFSET_GRAPH.angle) {
    g += `<circle cx="${ax.X(alpha)}" cy="${ax.Y((1 / Math.cos(rad(alpha)) - 1) * 100)}" r="5" fill="var(--accent)" stroke="var(--surface)" stroke-width="2"/>`;
  }
  return g;
}

/**
 * A target off to the side (`renderVS`, lines 716 to 729): where it is drawn,
 * by how much too deep, its angle from straight down, whether it is inside
 * each beam, the worst case at each beam's edge, and the graph. Reads the
 * fields `z` and `x`. With a depth that is not over 0 or a side distance that
 * is not 0 or more, the message is shown, the depth drawn is a dash, the graph
 * has no mark, and the six results keep what they had.
 */
function offsetView(
  f: Formatter,
  t2: number,
  ts: number,
  eq: Equipment,
  down: string,
  local: SectionLocal,
): SectionView {
  const view: Record<string, ElementPatch> = {};
  const z = localNumber(local, FIELD_TARGET_DEPTH);
  const x = localNumber(local, FIELD_TARGET_SIDE);
  let offErr = "";
  if (!(z > 0)) offErr = MESSAGES.targetDepth;
  else if (!(x >= 0)) offErr = MESSAGES.side;
  view["off-err"] = shownIn(offErr);
  let alpha: number | null = null;
  if (offErr === "") {
    const shown = Math.sqrt(z * z + x * x);
    alpha = deg(Math.atan(x / z));
    view["o-shown"] = { text: `${f.fmt(shown)} m` };
    view["o-err"] = { text: `${f.fmt(shown - z)} m (${f.num((shown / z - 1) * 100, 1)}%)` };
    view["o-ang"] = { text: `${f.num(alpha, 0)}°` };
    view["o-in2d"] = {
      text: alpha <= t2 / 2 ? "yes" : `no, outside (edge at ${f.num(t2 / 2, 0)}°)`,
    };
    view["o-inds"] = {
      text: alpha <= ts / 2 ? "yes" : `no, outside (edge at ${f.num(ts / 2, 0)}°)`,
    };
    view["o-max2d"] = {
      text: `${f.fmt(z / Math.cos(rad(t2 / 2)) - z)} m (${f.num((1 / Math.cos(rad(t2 / 2)) - 1) * 100, 1)}%)`,
    };
    view["o-maxds"] = {
      text: `${f.fmt(z / Math.cos(rad(ts / 2)) - z)} m (${f.num((1 / Math.cos(rad(ts / 2)) - 1) * 100, 1)}%)`,
    };
  } else view["o-shown"] = { text: NO_VALUE };
  view["off-graph"] = { html: offsetGraph(t2, ts, alpha, eq, down) };
  return view;
}

/** What is wrong with the fish: its depth, that it is not above the bottom, its side distance, the speed, or nothing. */
type FishFault = "" | "depth" | "bottom" | "side" | "speed";

/** The fish that passes under the boat, as its fields and Settings give it. */
interface Fish {
  /** Its depth, in metres. */
  readonly zf: number;
  /** Its distance to the side of the track, in metres, to either side. */
  readonly y: number;
  /** The speed of the boat, in metres a second. */
  readonly v: number;
  readonly fault: FishFault;
}

/**
 * The fish (`renderVS`, lines 731 and 732): reads the fields `zf` and `y`, and
 * the speed of Settings. A distance to the other side is the same distance.
 * The first of its four checks that fails is its fault.
 */
function fishOf(a: Settings, local: SectionLocal): Fish {
  const zf = localNumber(local, FIELD_FISH_DEPTH);
  const y = Math.abs(localNumber(local, FIELD_FISH_SIDE));
  const v = a.ms;
  let fault: FishFault = "";
  if (!(zf > 0)) fault = "depth";
  else if (!(zf < a.dep)) fault = "bottom";
  else if (!(y >= 0)) fault = "side";
  else if (!(v > 0)) fault = "speed";
  return { zf, y, v, fault };
}

/**
 * A fish passing under the boat (`renderVS`, lines 731 to 747): where the top
 * and the ends of its arch are drawn on the 2D screen, how long it is in the
 * cone and how long in the fan. While the fish is wrong the message is shown
 * and the results are hidden and keep what they had.
 */
function archView(f: Formatter, a: Settings, t2: number, ts: number, fish: Fish): SectionView {
  const { zf, y, v, fault } = fish;
  const messages: Readonly<Record<FishFault, string>> = {
    "": "",
    depth: MESSAGES.fishDepth,
    bottom: `The fish has to be above the bottom (${f.fmt(a.dep)} m).`,
    side: MESSAGES.side,
    speed: MESSAGES.speed,
  };
  const view: Record<string, ElementPatch> = {
    "arch-err": shownIn(messages[fault]),
    "arch-res": { hidden: fault !== "" },
  };
  if (fault !== "") return view;
  const lim = zf * Math.tan(rad(t2 / 2));
  if (y > lim) {
    view["a-top"] = { text: "no arch, fish outside the cone" };
    view["a-end"] = { text: NO_VALUE };
    view["a-h"] = { text: NO_VALUE };
    view["a-len"] = { text: `cone reaches ${f.fmt(lim)} m to the side at ${f.fmt(zf)} m` };
  } else {
    const topD = Math.sqrt(zf * zf + y * y);
    const endD = zf / Math.cos(rad(t2 / 2));
    const Lc = 2 * Math.sqrt(lim * lim - y * y);
    view["a-top"] = { text: `${f.fmt(topD)} m` };
    view["a-end"] = { text: `${f.fmt(endD)} m` };
    view["a-h"] = { text: `${f.fmt(endD - topD)} m` };
    view["a-len"] = { text: `${f.fmt(Lc / v)} s (${f.fmt(Lc)} m of travel)` };
  }
  if (y > zf * Math.tan(rad(ts / 2))) {
    view["ds-len"] = { text: `never, outside the ${f.num(ts, 0)}° fan` };
  } else {
    const Ld = 2 * Math.hypot(zf, y) * Math.tan(rad(a.dst / 2));
    view["ds-len"] = { text: `${f.fmt(Ld / v)} s (${f.fmt(Ld)} m of travel)` };
  }
  return view;
}

/**
 * What the 2D and DownScan section writes (`renderVS`, lines 706 to 754, and
 * the functions it calls). Reads of `settings` what the checks of Settings
 * read and the speed `ms`, of `eq` the flags `ss`, `2d`, `ds` and `at`, of
 * `ui` the frequencies `f2d` and `fds`, of `names` the names `side` and
 * `down`, of `local` the fields `z`, `x`, `zf` and `y` as numbers and the
 * choices `img-p` and `img-s`, and `fmt`.
 *
 * The message of the section is always written. While the depth of Settings
 * fails, or the angles of 2D or of down imaging while that sonar is ticked,
 * nothing else is. The values of a sonar that is not ticked are written as
 * they are, also where its angle is no number: the page hides their rows. An
 * element that is not written keeps what it had.
 */
export function coverageView(input: CoverageInput): SectionView {
  const { settings: a, eq, ui, names, local, fmt: f } = input;
  const fault = faultOf(a, eq);
  if (fault !== "") {
    const bad = { dep: "depth", a2d: "2D angles", ads: `${names.down} angles` } as const;
    return { "vs-serr": shownIn(`Fix the ${bad[fault]} in Settings.`) };
  }
  const d = a.dep;
  const { c2, cd } = chosen(a, ui);
  const t2 = c2.a;
  const ts = cd.a;
  return {
    "vs-serr": shownIn(""),
    "o-cone": { text: `${f.fmt(2 * d * Math.tan(rad(t2 / 2)))} m across` },
    "o-fan": { text: `${f.fmt(2 * d * Math.tan(rad(ts / 2)))} m wide` },
    "cov-svg": behindPicture(f, d, t2, ts, eq, names.down),
    "cov-graph": { html: widthGraph(d, t2, ts, eq) },
    ...frequencyView(f, a, d, eq, names, local),
    ...offsetView(f, t2, ts, eq, names.down, local),
    ...archView(f, a, t2, ts, fishOf(a, local)),
    "cap-2d": { text: `2D sonar ${c2.n ? `${c2.n} ` : ""}${c2.f}, ${f.num(t2, 0)}° cone` },
    "cap-ds": {
      text: `${names.down} ${cd.f}, ${f.num(ts, 0)}° fan, ${f.num(a.dst, 1)}° thick`,
    },
  };
}

/** The two screens, by the equipment key of their sonar. */
type Kind = "2d" | "ds";

/** The distance between the depth marks of a screen that reaches `range` metres. */
function markStep(range: number): number {
  for (const [limit, step] of MARK_STEPS) if (range <= limit) return step;
  return MARK_STEP_BEYOND;
}

/**
 * One simulated screen (`drawScreen`, lines 648 to 692, with what `renderVS`
 * gives it, lines 748 to 751): the water, the bottom and the band below it as
 * the beam of the chosen frequency sees them over the screen time, the fish as
 * an arch on the 2D screen and as a mark on the down imaging screen, the depth
 * marks, and the labels of the fish and of the bottom. Draws at the size the
 * canvas has. Nothing is drawn while the section is stopped by a check of
 * Settings, or when the screen's sonar is not ticked; while the fish is wrong
 * the screen is drawn without it.
 */
function paintScreen(kind: Kind, surface: Surface, input: ScreenInput): void {
  const { settings: a, eq, local, fmt: f } = input;
  if (faultOf(a, eq) !== "") return;
  const { c2, cd } = chosen(a, input.ui);
  if (!eq[kind]) return;
  const is2d = kind === "2d";
  const d = a.dep;
  const { zf, y, v, fault } = fishOf(a, local);
  const fishOk = fault === "";
  let T = localNumber(local, FIELD_SCREEN_TIME);
  if (!(T > 0)) T = SCREEN_SECONDS;
  const R = niceRange(Math.max(d * 1.25, d + 2));
  const ctx = surface.ctx;
  const W = surface.width;
  const Hc = surface.height;
  const top = 16;
  const bot = Hc - 6;
  const py = (D: number): number => top + (D / R) * (bot - top);
  const img = ctx.createImageData(W, Hc);
  const px = img.data;
  const half = rad((is2d ? c2.a : cd.a) / 2);
  const band = d * (1 / Math.cos(half) - 1);
  const foreAft = rad(a.dst / 2);
  const edge = Math.max(0.12, R * 0.006);
  const th = is2d ? Math.max(0.1, R * 0.008) : Math.max(0.06, R * 0.005);
  for (let c = 0; c < W; c++) {
    let fish: { readonly r: number; readonly g: number } | null = null;
    if (fishOk) {
      const s = v * (((c - W / 2) * T) / W);
      if (is2d) {
        const h = Math.sqrt(s * s + y * y);
        const lim = zf * Math.tan(half);
        if (h <= lim) {
          fish = { r: Math.sqrt(zf * zf + h * h), g: 1 - 0.6 * (Math.atan(h / zf) / half) ** 2 };
        }
      } else if (y <= zf * Math.tan(half) && Math.abs(s) <= Math.hypot(zf, y) * Math.tan(foreAft)) {
        fish = { r: Math.sqrt(zf * zf + y * y + s * s), g: 1 };
      }
    }
    for (let yy = 0; yy < Hc; yy++) {
      const D = ((yy - top) / (bot - top)) * R;
      const n1 = hash(c, yy);
      const n2 = hash(c >> 2, yy >> 2);
      let I: number;
      if (D < 0) I = 0;
      else if (D < d) {
        I = (is2d ? 0.12 : 0.03) + 0.05 * n1 + (D < 0.8 ? 0.25 * n2 * (1 - D / 0.8) : 0);
      } else {
        const below = D - d;
        if (below < edge) I = 0.95;
        else if (below < band + edge) {
          I = 0.55 + 0.3 * n2 * (1 - (below - edge) / (band + 0.001)) + 0.1 * n1;
        } else {
          I =
            (is2d ? 0.3 : 0.18) * Math.exp(-(below - band) / (R * 0.12)) +
            0.08 * n1 +
            (is2d ? 0.1 : 0);
        }
      }
      if (fish && Math.abs(D - fish.r) < th) I = Math.max(I, 0.6 + 0.35 * fish.g);
      const col = is2d ? lerpColor(map2d, I) : mapLive(I);
      const o = (yy * W + c) * 4;
      px[o] = col[0];
      px[o + 1] = col[1];
      px[o + 2] = col[2];
      px[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  ctx.font = `11px ${input.theme.colours[FONT_DATA] ?? ""}`;
  const stp = markStep(R);
  ctx.textAlign = "right";
  for (let m = stp; m < R; m += stp) {
    ctx.strokeStyle = SCREEN.rangeLine;
    ctx.setLineDash([2, 6]);
    ctx.beginPath();
    ctx.moveTo(0, py(m));
    ctx.lineTo(W - 26, py(m));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = SCREEN.markUnder;
    ctx.fillRect(W - 25, py(m) - 8, 24, 14);
    ctx.fillStyle = SCREEN.text;
    ctx.fillText(String(m), W - 3, py(m) + 4);
  }
  ctx.fillStyle = SCREEN.markUnder;
  ctx.fillRect(W - 36, 0, 36, 14);
  ctx.fillStyle = SCREEN.text;
  ctx.fillText("now", W - 4, 11);
  ctx.strokeStyle = SCREEN.centreLine;
  ctx.setLineDash([3, 4]);
  ctx.beginPath();
  ctx.moveTo(W / 2, 14);
  ctx.lineTo(W / 2, bot);
  ctx.stroke();
  ctx.setLineDash([]);
  if (fishOk) {
    const shown = Math.sqrt(zf * zf + y * y);
    const visible = y <= zf * Math.tan(half);
    const lab = visible ? `fish ${f.fmt(shown)} m` : "fish outside the beam";
    const ly = visible ? py(shown) - 12 : py(zf);
    ctx.textAlign = "left";
    const tw = ctx.measureText(lab).width;
    ctx.fillStyle = SCREEN.labelUnder;
    ctx.fillRect(W / 2 + 6, ly - 11, tw + 8, 15);
    ctx.fillStyle = SCREEN.text;
    ctx.fillText(lab, W / 2 + 10, ly);
  }
  ctx.textAlign = "left";
  const bl = `bottom ${f.fmt(d)} m`;
  const bw = ctx.measureText(bl).width;
  ctx.fillStyle = SCREEN.labelUnder;
  ctx.fillRect(4, py(d) - 18, bw + 8, 15);
  ctx.fillStyle = SCREEN.text;
  ctx.fillText(bl, 8, py(d) - 7);
}

/**
 * The simulated 2D screen, on the canvas `CANVAS_2D`. Reads of `settings` what
 * the checks of Settings read, the depth `dep` and the speed `ms`; of `eq` the
 * flags `ss`, `2d`, `ds` and `at`; of `ui` the frequencies `f2d` and `fds`; of
 * `local` the fields `zf`, `y` and `scrT`; of `theme` the font `--font-data`;
 * and `fmt`.
 */
export function paintScreen2d(surface: Surface, input: ScreenInput): void {
  paintScreen("2d", surface, input);
}

/**
 * The simulated down imaging screen, on the canvas `CANVAS_DS`. Reads what
 * `paintScreen2d` reads, and of `settings` the fan's thickness `dst`.
 */
export function paintScreenDs(surface: Surface, input: ScreenInput): void {
  paintScreen("ds", surface, input);
}
