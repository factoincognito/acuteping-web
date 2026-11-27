/**
 * SideScan (docs/SPEC.md 2.2): the earlier page's lines 297 to 500 and 518 to
 * 585. What the section writes is a `SectionView` by element id
 * (`sideScanView`), and what it draws on the simulated screen goes through an
 * injected `Surface` (`paintSideScan`). Nothing here finds an element, reads a
 * field or a style: the section's own fields and the style are given.
 */
import { hash, mapLive } from "./colour";
import { dl, NO_VALUE, niceRangeSS, rad } from "./format";
import { clipBelow, ssAngles, ssCover, ssRange } from "./geometry";
import { checkSettings } from "./settings";
import type {
  ElementPatch,
  Equipment,
  Formatter,
  Names,
  Point,
  SectionLocal,
  SectionView,
  Settings,
  Surface,
  Theme,
  UiState,
} from "./types";

/** The elements `sideScanView` writes, by id. */
export const KEYS = [
  "bottom-tool",
  "susp-tool",
  "err-svg",
  "rel-svg",
  "rel-tab",
  "ss-serr",
  "ssR-err",
  "out-label",
  "out-x",
  "out-note",
  "compare",
  "c1",
  "c2",
  "sketch",
  "b-err",
  "b-res",
  "b-h",
  "b-x",
  "s-err",
  "s-res",
  "s-d",
  "s-a",
  "s-x",
  "sim-vals",
  "sim-cap",
  "ssb-back",
  "ssb-top",
  "ssb-res",
] as const;

/** The canvas `paintSideScan` draws on, by id. */
export const CANVAS = "sim";

/**
 * The depths, in metres, of the error graph and of the relative-error graph
 * (line 433). The shell builds the chips of both graphs from them.
 */
export const ERR_DEPTHS: readonly number[] = [1, 3, 5, 8, 10];

/** The depth of the relative-error graph when the saved one is none of `ERR_DEPTHS`. */
const REL_DEPTH_FALLBACK = 5;

/** The shares of the true distance the relative-error graph marks and its table lists. */
const REL_SHARES: readonly number[] = [0.1, 0.05, 0.02, 0.01];

/** The values of `ui.ssMode`: the tool for an object on the bottom, and for a suspended one. */
const MODE_BOTTOM = "bottom";
const MODE_SUSPENDED = "susp";

/** The field that aims the narrower fans, and the section's own number fields. */
const FIELD_ALIGN = "ssalign";
const FIELD_READING = "ssR";
const FIELD_SHADOW_START = "s1";
const FIELD_SHADOW_END = "s2";
const FIELD_OBJECT = "ro";
const FIELD_OBJECT_SHADOW = "rs";

/** The custom property that names the font of the page's figures. */
const FONT_DATA = "--font-data";

/** Under this distance, in metres, a side fan is said to start under the boat. */
const NO_GAP_UNDER = 0.005;

/** The messages of the section that name no value, word for word as the earlier page has them. */
const MESSAGES = {
  reading: "Enter the distance you read on the screen, 0 m or more.",
  shadowEnd: "The shadow end must be farther out than its start.",
  objectRange: "Enter where the object is drawn, more than 0 m.",
  objectCloser: "The object must be drawn closer than its shadow.",
} as const;

/** The two sides of the boat, as the sign of the distance across: port, then starboard. */
const SIDES = [-1, 1] as const;

/** The frame of the two graphs, in the units of their pictures. */
const GRAPH = { left: 38, right: 10, top: 10, bottom: 214, width: 340 } as const;

/** The colours of the simulated screen, which are the same in light and dark. */
const SCREEN = {
  background: "#0b0703",
  centreLine: "rgba(255,220,160,0.35)",
  rangeLine: "rgba(255,220,160,0.18)",
  label: "rgba(255,230,190,0.85)",
  depthLineUnder: "rgba(0,0,0,0.75)",
  depthLine: "#4fb8ff",
  depthLabel: "#7fcbff",
  depthLabelUnder: "rgba(0,0,0,0.75)",
  object: "#ffffff",
  objectLabelUnder: "rgba(0,0,0,0.65)",
} as const;

/**
 * What the view reads of a section's input (the `ViewInput` of docs/SPEC.md
 * 3.2, which has these six under the same names).
 */
interface SideScanInput {
  readonly settings: Settings;
  readonly eq: Equipment;
  readonly ui: Pick<UiState, "ssMode" | "ssf" | "relDepth" | "errOn">;
  readonly names: Pick<Names, "side">;
  readonly local: SectionLocal;
  readonly fmt: Formatter;
}

/** What the painter reads of a section's input: as the view, with the style and without the names. */
interface SideScanPaintInput extends Omit<SideScanInput, "names"> {
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

/**
 * The sketch of a reading, seen from behind (`drawSketch`, lines 298 to 323):
 * the depth `H` and the distance `R` read on the screen, in metres. A target at
 * or beyond the depth is drawn on the bottom, a nearer one as the arc it can be
 * anywhere on. Without a depth over 0 or a distance of 0 or more there is no
 * sketch.
 */
function sketch(f: Formatter, H: number, R: number): string {
  if (!(H > 0) || !(R >= 0)) return "";
  const tx = 24;
  const ty = 22;
  const s = Math.min(276 / Math.max(R, 0.5), 124 / H);
  const yb = ty + H * s;
  let g = "";
  g += '<line x1="8" y1="14" x2="312" y2="14" stroke="var(--water)" stroke-width="1.2"/>';
  g += `<rect x="8" y="${yb}" width="304" height="${Math.max(172 - yb - 22, 6)}" fill="var(--ground)" opacity="0.6"/>`;
  g += `<line x1="8" y1="${yb}" x2="312" y2="${yb}" stroke="var(--muted)" stroke-width="1.2"/>`;
  g += `<line x1="${tx}" y1="${ty + 2}" x2="${tx}" y2="${yb}" stroke="var(--muted)" stroke-width="1" stroke-dasharray="3 3"/>`;
  g += `<text x="${tx + 6}" y="${(ty + yb) / 2 + 4}" font-family="var(--font-data)" font-size="11" fill="var(--muted)">H ${f.fmt(H)}</text>`;
  if (R >= H) {
    const x = Math.sqrt(R * R - H * H);
    const px = tx + x * s;
    g += `<line x1="${tx}" y1="${ty}" x2="${px}" y2="${yb}" stroke="var(--accent)" stroke-width="2"/>`;
    g += `<line x1="${tx}" y1="${yb + 10}" x2="${px}" y2="${yb + 10}" stroke="var(--fg)" stroke-width="1"/>`;
    g += `<circle cx="${px}" cy="${yb}" r="4.5" fill="var(--accent)" stroke="var(--surface)" stroke-width="2"/>`;
    const lx = Math.min(Math.max((tx + px) / 2, 60), 260);
    g += `<text x="${lx}" y="${yb + 24}" text-anchor="middle" font-family="var(--font-data)" font-size="11" fill="var(--fg)">horizontal ${f.fmt(x)} m</text>`;
    const mx = (tx + px) / 2 + 6;
    const my = (ty + yb) / 2 - 6;
    g += `<text x="${Math.min(mx, 250)}" y="${Math.max(my, 30)}" font-family="var(--font-data)" font-size="11" fill="var(--accent)">screen ${f.fmt(R)} m</text>`;
  } else {
    const r = R * s;
    g += `<path d="M ${tx + r} ${ty} A ${r} ${r} 0 0 1 ${tx} ${ty + r}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-dasharray="5 4"/>`;
    g += `<text x="${Math.min(tx + r + 8, 170)}" y="${Math.min(ty + r * 0.7 + 4, yb - 8)}" font-family="var(--font-data)" font-size="11" fill="var(--accent)">could be anywhere on this arc</text>`;
  }
  g += `<circle cx="${tx}" cy="${ty}" r="4" fill="var(--fg)"/>`;
  return g;
}

/**
 * The reading of a distance on the screen (`ssReading`, lines 324 to 340):
 * where on the bottom a target at that distance is, or that it is in the water
 * column. Reads the field `ssR`. With a distance that is no number, or under 0,
 * the message is shown and the label keeps what it had.
 */
function readingView(f: Formatter, H: number, local: SectionLocal): SectionView {
  const R = localNumber(local, FIELD_READING);
  const okR = R >= 0;
  const view: Record<string, ElementPatch> = {
    "ssR-err": shownIn(okR ? "" : MESSAGES.reading),
    sketch: { html: sketch(f, H, okR ? R : Number.NaN) },
  };
  if (okR && R >= H) {
    const x = Math.sqrt(R * R - H * H);
    view["out-label"] = { text: "Horizontal distance to target on the bottom" };
    view["out-x"] = { text: `${f.fmt(x)} m` };
    view["out-note"] = { hidden: true };
    view.compare = { hidden: false };
    view.c1 = { text: `${f.fmt(R)} m (${f.fmt(R - x)} too far)` };
    view.c2 = { text: `${f.fmt(R - H)} m (${f.fmt(x - (R - H))} too short)` };
  } else if (okR) {
    view["out-label"] = { text: "Target is inside the water column band" };
    view["out-x"] = { text: NO_VALUE };
    view["out-note"] = {
      text: 'It is closer than the bottom, so on a flat bottom it is off the bottom. Its depth and position can only be found from its shadow. Use "Suspended object" below.',
      hidden: false,
    };
    view.compare = { hidden: true };
  } else {
    view["out-x"] = { text: NO_VALUE };
    view["out-note"] = { hidden: true };
    view.compare = { hidden: true };
  }
  return view;
}

/**
 * The two shadow tools (`ssShadow`, lines 341 to 353): the height of an object
 * on the bottom from where its shadow starts and ends, and the depth of a
 * suspended object from where it and its shadow are drawn. Reads the fields
 * `s1`, `s2`, `ro` and `rs`. A tool whose values fail shows its message and
 * hides its results, which keep what they had.
 */
function shadowView(f: Formatter, H: number, local: SectionLocal): SectionView {
  const view: Record<string, ElementPatch> = {};
  const s1 = localNumber(local, FIELD_SHADOW_START);
  const s2 = localNumber(local, FIELD_SHADOW_END);
  let bErr = "";
  if (!(s1 >= H)) {
    bErr = `The shadow start must be at or beyond the depth (${f.fmt(H)} m). A shadow always falls on the bottom.`;
  } else if (!(s2 > s1)) bErr = MESSAGES.shadowEnd;
  view["b-err"] = shownIn(bErr);
  view["b-res"] = { hidden: bErr !== "" };
  if (bErr === "") {
    const x1 = Math.sqrt(s1 * s1 - H * H);
    const x2 = Math.sqrt(s2 * s2 - H * H);
    view["b-h"] = { text: `${f.fmt((H * (x2 - x1)) / x2)} m` };
    view["b-x"] = { text: `${f.fmt(x1)} m` };
  }
  const ro = localNumber(local, FIELD_OBJECT);
  const rs = localNumber(local, FIELD_OBJECT_SHADOW);
  let sErr = "";
  if (!(ro > 0)) sErr = MESSAGES.objectRange;
  else if (!(rs >= H)) {
    sErr = `The shadow must be at or beyond the depth (${f.fmt(H)} m). A shadow always falls on the bottom.`;
  } else if (!(ro < rs)) sErr = MESSAGES.objectCloser;
  view["s-err"] = shownIn(sErr);
  view["s-res"] = { hidden: sErr !== "" };
  if (sErr === "") {
    const d = (H * ro) / rs;
    view["s-d"] = { text: `${f.fmt(d)} m` };
    view["s-a"] = { text: `${f.fmt(H - d)} m` };
    view["s-x"] = { text: `${f.fmt((ro * Math.sqrt(rs * rs - H * H)) / rs)} m` };
  }
  return view;
}

/** The object the simulated screen shows: one on the bottom with its shadow, or a suspended one. */
type SimObject =
  | {
      readonly kind: "bottom";
      /** Where its shadow starts and ends on the screen, in metres. */
      readonly s1: number;
      readonly s2: number;
      /** Its height, in metres. */
      readonly h: number;
      /** The distance the screen has to reach, in metres. */
      readonly far: number;
    }
  | {
      readonly kind: "susp";
      /** Where it and its shadow are drawn on the screen, in metres. */
      readonly ro: number;
      readonly rs: number;
      readonly far: number;
    };

/**
 * The object of the simulated screen (`drawSim`, lines 358 to 365): the one of
 * the tool that is chosen, or none while that tool's values fail. Any choice
 * but the bottom tool is taken for the suspended one, as the earlier page does.
 */
function simObject(mode: string, H: number, local: SectionLocal): SimObject | null {
  if (mode === MODE_BOTTOM) {
    const s1 = localNumber(local, FIELD_SHADOW_START);
    const s2 = localNumber(local, FIELD_SHADOW_END);
    if (s1 >= H && s2 > s1) {
      const x1 = Math.sqrt(s1 * s1 - H * H);
      const x2 = Math.sqrt(s2 * s2 - H * H);
      return { kind: "bottom", s1, s2, h: (H * (x2 - x1)) / x2, far: s2 };
    }
    return null;
  }
  const ro = localNumber(local, FIELD_OBJECT);
  const rs = localNumber(local, FIELD_OBJECT_SHADOW);
  return ro > 0 && rs >= H && ro < rs ? { kind: "susp", ro, rs, far: rs + 1 } : null;
}

/** The range of the simulated screen to each side, in metres (line 366). */
function simRange(H: number, obj: SimObject | null): number {
  return niceRangeSS(Math.max(H * 1.4, obj ? obj.far * 1.25 : H * 2.5));
}

/** The distance between two marks of a picture that reaches `range` metres. */
function markStep(range: number): number {
  if (range <= 20) return 5;
  return range <= 60 ? 10 : 25;
}

/**
 * What stands under the simulated screen (`drawSim`, lines 415 to 430): the
 * values of the object it shows and the line that says what is seen. Without
 * an object the values are hidden and keep what they had.
 */
function simView(f: Formatter, H: number, mode: string, local: SectionLocal): SectionView {
  const obj = simObject(mode, H, local);
  const range = simRange(H, obj);
  if (!obj) {
    return {
      "sim-vals": { hidden: true },
      "sim-cap": {
        text: `Fix the shadow values above to place the object. Range ${range} m per side.`,
      },
    };
  }
  const depth: [string, string] = ["Depth under transducer (H)", `${f.fmt(H)} m`];
  if (obj.kind === "bottom") {
    return {
      "sim-vals": {
        html: dl([
          depth,
          ["Screen distance to object (slant)", `${f.fmt(obj.s1)} m`],
          ["True horizontal distance", `${f.fmt(Math.sqrt(obj.s1 * obj.s1 - H * H))} m`],
          ["Object depth (on the bottom)", `${f.fmt(H)} m`],
          ["Object height", `${f.fmt(obj.h)} m`],
          ["Shadow ends on screen at", `${f.fmt(obj.s2)} m`],
        ]),
        hidden: false,
      },
      "sim-cap": {
        text: `Object on the bottom, about ${f.fmt(obj.h)} m tall, starboard side, passed and now halfway down. Range ${range} m per side.`,
      },
    };
  }
  const dd = (H * obj.ro) / obj.rs;
  return {
    "sim-vals": {
      html: dl([
        depth,
        ["Screen distance to object (slant)", `${f.fmt(obj.ro)} m`],
        [
          "True horizontal distance",
          `${f.fmt((obj.ro * Math.sqrt(obj.rs * obj.rs - H * H)) / obj.rs)} m`,
        ],
        ["Object depth below transducer", `${f.fmt(dd)} m`],
        ["Height above bottom", `${f.fmt(H - dd)} m`],
        ["Shadow on screen at", `${f.fmt(obj.rs)} m`],
      ]),
      hidden: false,
    },
    "sim-cap": {
      text: `Suspended object ${f.fmt((H * obj.ro) / obj.rs)} m below the transducer, starboard side, passed and now halfway down. Range ${range} m per side.`,
    },
  };
}

/**
 * How strongly one pixel of the simulated screen echoes, from 0 to 1 (lines
 * 370 to 388): dark water column out to the depth `H`, a bright edge where the
 * bottom starts, then bottom that fades with the distance `r`; and on the
 * starboard side the object with its shadow. `px` and `y` are the pixel, `cx`
 * and `oy` the pixel the object is centred on, `mpp` the metres to a pixel.
 */
function echo(
  px: number,
  y: number,
  r: number,
  H: number,
  edgeW: number,
  obj: SimObject | null,
  cx: number,
  oy: number,
  mpp: number,
): number {
  const n1 = hash(px, y);
  const n2 = hash(px >> 2, y >> 2);
  let I: number;
  if (r < H) I = 0.03 + 0.05 * n1 + (r < H * 0.15 ? 0.08 * n2 : 0);
  else {
    const n3 = hash(px >> 4, (y >> 3) + 999);
    const fall = Math.min(1, 1.15 * Math.sqrt(H / r));
    I = (0.28 + 0.3 * n1 + 0.18 * n2 + 0.14 * n3) * fall;
    if (r - H < edgeW) I = Math.max(I, 0.85 + 0.1 * n1);
  }
  if (!obj || px < cx) return I;
  const dy = y - oy;
  if (obj.kind === "bottom") {
    const half = Math.max(1.5 / mpp, 4);
    if (Math.abs(dy) < half) {
      const f = Math.sqrt(1 - (dy / half) * (dy / half));
      const face = (Math.min(obj.h, 2) * 0.5 + 0.3) * (0.6 + 0.4 * f);
      const shEnd = obj.s1 + (obj.s2 - obj.s1) * f;
      if (r >= obj.s1 - face && r < obj.s1) I = Math.max(I, 0.8 + 0.2 * n1);
      else if (r >= obj.s1 && r < shEnd) I = 0.02 + 0.03 * n1;
    }
    return I;
  }
  const bh = Math.max(0.35 / mpp, 2);
  if (Math.abs(dy) < bh && Math.abs(r - obj.ro) < Math.max(0.3, mpp * 1.5)) I = 0.95;
  const k = obj.rs / obj.ro;
  const shh = bh * k;
  if (Math.abs(dy) < shh && r >= obj.rs && r < obj.rs + Math.max(0.5 * k * 0.6, mpp * 2)) {
    I = 0.02 + 0.03 * n1;
  }
  return I;
}

/**
 * The simulated screen (`drawSim`, lines 354 to 421): a side imaging picture of
 * a flat bottom at the depth of Settings, with the object of the chosen tool on
 * the starboard side, the range marks, the depth lines and the measure to the
 * object. Draws on the canvas `CANVAS`, at the size it has. Reads of `settings`
 * what the checks of Settings read and `dep`; of `eq` the flags `ss`, `2d`,
 * `ds` and `at`; of `ui` the tool `ssMode`; of `local` the fields `s1`, `s2`,
 * `ro` and `rs`; of `theme` the font `--font-data`; and `fmt`. While the depth
 * of Settings fails its check nothing is drawn, and the canvas keeps what it
 * had.
 */
export function paintSideScan(surface: Surface, input: SideScanPaintInput): void {
  const { settings: a, ui, local, fmt: f } = input;
  if (checkSettings(a, input.eq).dep) return;
  const H = a.dep;
  const ctx = surface.ctx;
  const W = surface.width;
  const Ht = surface.height;
  const cx = W / 2;
  const oy = Math.round(Ht / 2);
  const font = input.theme.colours[FONT_DATA] ?? "";
  ctx.fillStyle = SCREEN.background;
  ctx.fillRect(0, 0, W, Ht);
  const obj = simObject(ui.ssMode, H, local);
  const range = simRange(H, obj);
  const mpp = range / cx;
  const img = ctx.createImageData(W, Ht);
  const d = img.data;
  const edgeW = Math.max(mpp * 1.5, range * 0.01);
  for (let y = 0; y < Ht; y++) {
    for (let px = 0; px < W; px++) {
      const r = Math.abs(px + 0.5 - cx) * mpp;
      const c = mapLive(echo(px, y, r, H, edgeW, obj, cx, oy, mpp));
      const o = (y * W + px) * 4;
      d[o] = c[0];
      d[o + 1] = c[1];
      d[o + 2] = c[2];
      d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  ctx.strokeStyle = SCREEN.centreLine;
  ctx.setLineDash([4, 5]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx, 0);
  ctx.lineTo(cx, Ht);
  ctx.stroke();
  const step = markStep(range);
  ctx.font = `11px ${font}`;
  ctx.fillStyle = SCREEN.label;
  ctx.textAlign = "center";
  ctx.strokeStyle = SCREEN.rangeLine;
  ctx.setLineDash([2, 6]);
  for (let m = step; m < range; m += step) {
    for (const x of [cx - m / mpp, cx + m / mpp]) {
      ctx.beginPath();
      ctx.moveTo(x, 14);
      ctx.lineTo(x, Ht);
      ctx.stroke();
    }
    ctx.fillText(String(m), cx + m / mpp, 11);
    ctx.fillText(String(m), cx - m / mpp, 11);
  }
  ctx.setLineDash([]);
  ctx.fillStyle = SCREEN.label;
  ctx.textAlign = "left";
  ctx.fillText("Port", 4, Ht - 6);
  ctx.textAlign = "right";
  ctx.fillText(`Stbd ${range} m`, W - 4, Ht - 6);
  ctx.font = `12px ${font}`;
  for (const hx of [cx - H / mpp, cx + H / mpp]) {
    ctx.setLineDash([]);
    ctx.lineWidth = 4;
    ctx.strokeStyle = SCREEN.depthLineUnder;
    ctx.beginPath();
    ctx.moveTo(hx, 16);
    ctx.lineTo(hx, Ht - 18);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = SCREEN.depthLine;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(hx, 16);
    ctx.lineTo(hx, Ht - 18);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  const hl = `depth H ${f.fmt(H)} m`;
  const hw = ctx.measureText(hl).width;
  const hx2 = cx + H / mpp;
  ctx.fillStyle = SCREEN.depthLabelUnder;
  ctx.fillRect(hx2 - hw - 12, 22, hw + 8, 17);
  ctx.fillStyle = SCREEN.depthLabel;
  ctx.textAlign = "right";
  ctx.fillText(hl, hx2 - 8, 35);
  if (!obj) return;
  const rObj = obj.kind === "bottom" ? obj.s1 : obj.ro;
  const ex = cx + rObj / mpp;
  const by = oy - 46;
  ctx.strokeStyle = SCREEN.object;
  ctx.fillStyle = SCREEN.object;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx, by);
  ctx.lineTo(ex, by);
  ctx.moveTo(cx, by - 5);
  ctx.lineTo(cx, by + 5);
  ctx.moveTo(ex, by - 5);
  ctx.lineTo(ex, by + 5);
  ctx.moveTo(ex, by + 5);
  ctx.lineTo(ex, oy - 12);
  ctx.stroke();
  const lab = `screen ${f.fmt(rObj)} m`;
  const tw = ctx.measureText(lab).width;
  const lx = Math.min(Math.max((cx + ex) / 2, cx + tw / 2 + 4), W - tw / 2 - 4);
  ctx.fillStyle = SCREEN.objectLabelUnder;
  ctx.fillRect(lx - tw / 2 - 4, by - 20, tw + 8, 16);
  ctx.fillStyle = SCREEN.object;
  ctx.textAlign = "center";
  ctx.fillText(lab, lx, by - 8);
}

/** The line under both graphs that says what their distances are. */
function graphCaption(): string {
  const { left, right, bottom, width } = GRAPH;
  return `<text x="${(left + width - right) / 2}" y="${bottom + 32}" text-anchor="middle" font-size="11" fill="var(--muted)">Distance on screen (m)</text>`;
}

/**
 * The error graph (`drawErr`, lines 434 to 463): for each depth that is ticked,
 * by how many metres the distance on the screen is too far (solid) and the
 * distance less the depth too short (dashed), out to 30 m on the screen; and
 * for 10 m the two marks at 20 m. `errOn` is the saved choice of depths, by
 * depth. The numbers of the graph are written with a decimal point in every
 * locale, as the earlier page writes them.
 */
function errGraph(errOn: Readonly<Record<string, boolean>>): string {
  const { left: L, right: Rm, top: T, bottom: B, width: Wd } = GRAPH;
  const vis = ERR_DEPTHS.filter((h) => errOn[h]);
  const highest = vis.length ? Math.max(...vis) : 1;
  let ystep = 2;
  if (highest <= 2) ystep = 0.5;
  else if (highest <= 5) ystep = 1;
  const ymax = Math.ceil(highest / ystep) * ystep;
  const X = (v: number): number => L + (v / 30) * (Wd - L - Rm);
  const Y = (v: number): number => B - (v / ymax) * (B - T);
  let g = "";
  for (let yv = 0; yv <= ymax + 1e-9; yv += ystep) {
    g += `<line x1="${L}" x2="${Wd - Rm}" y1="${Y(yv)}" y2="${Y(yv)}" stroke="var(--line)" stroke-width="${yv === 0 ? 1.2 : 0.6}"/>`;
    g += `<text x="${L - 6}" y="${Y(yv) + 4}" text-anchor="end" font-family="var(--font-data)" font-size="11" fill="var(--muted)">${ystep < 1 ? yv.toFixed(1) : yv}</text>`;
  }
  for (let xv = 0; xv <= 30; xv += 5) {
    g += `<text x="${X(xv)}" y="${B + 16}" text-anchor="middle" font-family="var(--font-data)" font-size="11" fill="var(--muted)">${xv}</text>`;
  }
  g += graphCaption();
  g += `<text x="4" y="${T + 2}" font-size="11" fill="var(--muted)" dominant-baseline="hanging">m</text>`;
  for (const [i, H] of ERR_DEPTHS.entries()) {
    if (!errOn[H]) continue;
    let a = "";
    let b = "";
    for (let R = H; R <= 30.0001; R += 0.25) {
      const t = Math.sqrt(Math.max(R * R - H * H, 0));
      a += `${a ? "L" : "M"}${X(R).toFixed(1)} ${Y(R - t).toFixed(1)}`;
      b += `${b ? "L" : "M"}${X(R).toFixed(1)} ${Y(t - (R - H)).toFixed(1)}`;
    }
    const c = `var(--s${i + 1})`;
    g += `<path d="${a}" fill="none" stroke="${c}" stroke-width="2" stroke-linejoin="round"/>`;
    g += `<path d="${b}" fill="none" stroke="${c}" stroke-width="2" stroke-dasharray="6 4" stroke-linejoin="round"/>`;
  }
  if (errOn[10]) {
    const t20 = Math.sqrt(300);
    const e1 = 20 - t20;
    const e2 = t20 - 10;
    g += `<line x1="${X(20)}" x2="${X(20)}" y1="${T}" y2="${B}" stroke="var(--muted)" stroke-width="0.8" stroke-dasharray="2 3"/>`;
    for (const e of [e1, e2]) {
      g += `<circle cx="${X(20)}" cy="${Y(e)}" r="4.5" fill="var(--s5)" stroke="var(--surface)" stroke-width="2"/>`;
    }
    g += `<text x="${X(20) + 7}" y="${Y(e1) - 6}" font-family="var(--font-data)" font-size="11" fill="var(--fg)">2.7</text>`;
    g += `<text x="${X(20) + 7}" y="${Y(e2) - 6}" font-family="var(--font-data)" font-size="11" fill="var(--fg)">7.3</text>`;
  }
  return g;
}

/**
 * By what share of the true horizontal distance the distance `x` on the screen
 * is too far, at the depth `d` (line 464). Infinity at the depth itself, NaN
 * nearer than the depth.
 */
export function relSolid(x: number, d: number): number {
  const h = Math.sqrt(x * x - d * d);
  return (x - h) / h;
}

/**
 * By what share of the true horizontal distance the distance `x` on the screen
 * less the depth `d` is too short (line 465). NaN at the depth and nearer.
 */
export function relDash(x: number, d: number): number {
  const h = Math.sqrt(x * x - d * d);
  return (h - (x - d)) / h;
}

/**
 * The distance on the screen from which `relSolid` is under the share `p`, at
 * the depth `d` (line 466). Infinity for a share of 0.
 */
export function solidAt(p: number, d: number): number {
  return d / Math.sqrt(1 - 1 / ((1 + p) * (1 + p)));
}

/** The number of times `dashAt` halves the stretch it searches. */
const DASH_AT_STEPS = 200;

/**
 * The distance on the screen from which `relDash` is under the share `p`, at
 * the depth `d` (line 467), searched between just beyond the depth and a
 * million depths. A share that is never reached gives the far end, one that is
 * always passed, or no number, the near end.
 */
export function dashAt(p: number, d: number): number {
  let lo = d * 1.0000001;
  let hi = d * 1e6;
  for (let i = 0; i < DASH_AT_STEPS; i++) {
    const m = Math.sqrt(lo * hi);
    if (relDash(m, d) > p) lo = m;
    else hi = m;
  }
  return hi;
}

/**
 * The relative-error graph and its table (`drawRel`, lines 469 to 499), for
 * one depth: both errors as a share of the true distance, the distances from
 * which the solid one is under each of `REL_SHARES`, and those distances for
 * both in the table. `relDepth` is the saved depth as the saved state holds it;
 * one that is none of `ERR_DEPTHS` is taken for `REL_DEPTH_FALLBACK`.
 */
function relView(relDepth: unknown, f: Formatter): SectionView {
  const { left: L, right: Rm, top: T, bottom: B, width: Wd } = GRAPH;
  const ymax = 20;
  const saved = Number(relDepth);
  const d = ERR_DEPTHS.includes(saved) ? saved : REL_DEPTH_FALLBACK;
  const xmax = Math.max(30, Math.ceil((solidAt(0.01, d) * 1.15) / 10) * 10);
  const X = (v: number): number => L + (v / xmax) * (Wd - L - Rm);
  const Y = (v: number): number => B - (Math.min(v, ymax) / ymax) * (B - T);
  let g = "";
  for (const yv of [0, 5, 10, 15, 20]) {
    g += `<line x1="${L}" x2="${Wd - Rm}" y1="${Y(yv)}" y2="${Y(yv)}" stroke="var(--line)" stroke-width="${yv === 0 ? 1.2 : 0.6}"/>`;
    g += `<text x="${L - 6}" y="${Y(yv) + 4}" text-anchor="end" font-family="var(--font-data)" font-size="11" fill="var(--muted)">${yv}%</text>`;
  }
  let xs = 20;
  if (xmax <= 40) xs = 5;
  else if (xmax <= 100) xs = 10;
  for (let xv = 0; xv <= xmax; xv += xs) {
    g += `<text x="${X(xv)}" y="${B + 16}" text-anchor="middle" font-family="var(--font-data)" font-size="11" fill="var(--muted)">${xv}</text>`;
  }
  g += graphCaption();
  const col = `var(--s${ERR_DEPTHS.indexOf(d) + 1})`;
  for (const [i, p] of REL_SHARES.entries()) {
    const xc = solidAt(p, d);
    g += `<line x1="${X(xc)}" x2="${X(xc)}" y1="${T}" y2="${B}" stroke="var(--muted)" stroke-width="0.8" stroke-dasharray="2 3"/>`;
    g += `<line x1="${L}" x2="${Wd - Rm}" y1="${Y(p * 100)}" y2="${Y(p * 100)}" stroke="var(--muted)" stroke-width="0.6" stroke-dasharray="2 3"/>`;
    g += `<circle cx="${X(xc)}" cy="${Y(p * 100)}" r="4" fill="${col}" stroke="var(--surface)" stroke-width="2"/>`;
    g += `<text x="${X(xc) + 5}" y="${T + 12 + i * 14}" font-family="var(--font-data)" font-size="11" fill="var(--fg)">${Math.round(p * 100)}%</text>`;
  }
  let a = "";
  let b = "";
  for (let k = 1; k <= 300; k++) {
    const x = d + (xmax - d) * (k / 300) ** 1.6;
    const ya = relSolid(x, d) * 100;
    const yb = relDash(x, d) * 100;
    if (ya <= ymax) a += `${a ? "L" : "M"}${X(x).toFixed(1)} ${Y(ya).toFixed(1)}`;
    if (yb <= ymax) b += `${b ? "L" : "M"}${X(x).toFixed(1)} ${Y(yb).toFixed(1)}`;
  }
  g += `<path d="${b}" fill="none" stroke="${col}" stroke-width="2" stroke-dasharray="6 4"/>`;
  g += `<path d="${a}" fill="none" stroke="${col}" stroke-width="2"/>`;
  const table =
    `<div><dt>Depth ${f.fmt(d)} m</dt><dd>screen distance</dd></div>` +
    REL_SHARES.map(
      (p) =>
        `<div><dt>Under ${Math.round(p * 100)}% from</dt><dd>solid ${f.dist(solidAt(p, d))} · dashed ${f.dist(dashAt(p, d))}</dd></div>`,
    ).join("");
  return { "rel-svg": { html: g }, "rel-tab": { html: table } };
}

/** The corners of an outline as the `points` of a polygon, each to one decimal. */
const points = (outline: readonly Point[]): string =>
  outline.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");

/**
 * The beam of the chosen frequency (`ssBeam`, lines 518 to 574): the two fans
 * seen from behind, with the bottom they cover; the same from above; and the
 * list of what is drawn. Reads of `a` the depth `dep`, the range `ssr`, the
 * upper edge `sso`, the thickness `sst`, the list `side` and its widest fan
 * `swmax`; `ssf` is the saved choice of frequency, and `align` the field
 * `ssalign`, or undefined on a page without it. A choice that names no
 * frequency of the list is the first. Throws a TypeError when the list is
 * empty, where the earlier page fails in the same way.
 */
function beamView(f: Formatter, a: Settings, ssf: unknown, align: string | undefined): SectionView {
  const H = a.dep;
  const fi = Number(ssf) || 0;
  const fc = a.side[fi] ?? a.side[0];
  if (!fc) throw new TypeError("the transducer has no side frequency to draw");
  const R = ssRange(a, fc.r);
  const kf = fc.a / a.swmax;
  const { aOut, aIn } = ssAngles(kf, a.sso, a.swmax, align);
  const t = a.sst * kf;
  const xIn = H / Math.tan(aIn);
  const reach = R > H ? Math.sqrt(R * R - H * H) : Number.NaN;
  const xOutGeom = aOut > 0 ? H / Math.tan(aOut) : Number.POSITIVE_INFINITY;
  const xOut = Number.isNaN(reach) ? Number.NaN : Math.min(reach, xOutGeom);
  const hitsBottom = !Number.isNaN(xOut) && xOut > xIn;
  const Xmax = R * Math.cos(aOut);
  const L = 170;
  const s = 160 / Math.max(Xmax, 1);
  const top = 18;
  const zMax = Math.min(H, R);
  const hB = Math.ceil(top + zMax * s + 44);
  let g = "";
  g += `<line x1="4" x2="336" y1="${top}" y2="${top}" stroke="var(--water)" stroke-width="1.2"/>`;
  if (H <= R) {
    g += `<rect x="4" y="${top + H * s}" width="332" height="10" fill="var(--ground)" opacity="0.6"/>`;
  }
  for (const sd of SIDES) {
    const poly: Point[] = [[0, 0]];
    for (let k = 0; k <= 40; k++) {
      const an = aOut + ((aIn - aOut) * k) / 40;
      poly.push([sd * R * Math.cos(an), R * Math.sin(an)]);
    }
    const c = clipBelow(poly, H);
    g += `<polygon points="${c.map((pt) => `${(L + pt[0] * s).toFixed(1)},${(top + pt[1] * s).toFixed(1)}`).join(" ")}" fill="var(--s1)" fill-opacity="0.2" stroke="var(--s1)" stroke-width="1.2"/>`;
    if (hitsBottom) {
      g += `<line x1="${L + sd * xIn * s}" x2="${L + sd * xOut * s}" y1="${top + H * s}" y2="${top + H * s}" stroke="var(--accent)" stroke-width="5"/>`;
    }
  }
  if (H <= R) {
    g += `<line x1="4" x2="336" y1="${top + H * s}" y2="${top + H * s}" stroke="var(--muted)" stroke-width="1.2"/>`;
  }
  g += `<circle cx="${L}" cy="${top}" r="4" fill="var(--fg)"/>`;
  g +=
    '<text x="8" y="12" font-size="11" fill="var(--muted)">port</text><text x="332" y="12" text-anchor="end" font-size="11" fill="var(--muted)">starboard</text>';
  if (hitsBottom) {
    if (xIn >= NO_GAP_UNDER) {
      g += `<text x="${L}" y="${top + H * s + 24}" text-anchor="middle" font-family="var(--font-data)" font-size="11" fill="var(--fg)">gap ${f.fmt(2 * xIn)} m</text>`;
    }
    g += `<text x="${L + ((xIn + xOut) / 2) * s}" y="${top + H * s + 38}" text-anchor="middle" font-family="var(--font-data)" font-size="11" fill="var(--fg)">${xIn < NO_GAP_UNDER ? "0" : f.fmt(xIn)}–${f.fmt(xOut)} m</text>`;
  }

  const ex = Math.max(1, 26 / (R * Math.tan(rad(t / 2)) * s));
  const cyT = 70;
  let gt = "";
  gt +=
    '<rect x="4" y="36" width="332" height="68" rx="6" fill="var(--water)" fill-opacity="0.08"/>';
  for (const sd of SIDES) {
    const n = 40;
    const xWaterEnd = hitsBottom ? Math.min(xOut, Xmax) : Xmax;
    const halfW = (x: number): number => {
      const sl = Math.hypot(x, Math.min(H, x * Math.tan(aIn)));
      return sl * Math.tan(rad(t / 2)) * s * ex;
    };
    const upper: Point[] = [];
    const lower: Point[] = [];
    for (let k = 0; k <= n; k++) {
      const x = (xWaterEnd * k) / n;
      const hw = halfW(x);
      upper.push([L + sd * x * s, cyT - hw]);
      lower.unshift([L + sd * x * s, cyT + hw]);
    }
    gt += `<polygon points="${points(upper.concat(lower))}" fill="var(--s1)" fill-opacity="0.2" stroke="var(--s1)" stroke-width="1"/>`;
    if (hitsBottom) {
      const u2: Point[] = [];
      const l2: Point[] = [];
      for (let j = 0; j <= n; j++) {
        const xb = xIn + ((xOut - xIn) * j) / n;
        const hb = Math.hypot(xb, H) * Math.tan(rad(t / 2)) * s * ex;
        u2.push([L + sd * xb * s, cyT - hb]);
        l2.unshift([L + sd * xb * s, cyT + hb]);
      }
      gt += `<polygon points="${points(u2.concat(l2))}" fill="var(--accent)" fill-opacity="0.75"/>`;
    }
  }
  gt += `<line x1="${L}" x2="${L}" y1="8" y2="132" stroke="var(--muted)" stroke-width="0.8" stroke-dasharray="3 3"/>`;
  gt += `<text x="${L + 4}" y="14" font-size="11" fill="var(--muted)">↑ heading</text>`;
  gt += `<path d="M ${L} ${cyT - 12} L ${L + 5} ${cyT - 2} L ${L + 5} ${cyT + 10} L ${L - 5} ${cyT + 10} L ${L - 5} ${cyT - 2} Z" fill="var(--fg)"/>`;
  gt += `<text x="${L - 8}" y="${cyT - 30}" text-anchor="end" font-size="11" fill="var(--muted)">port fan</text><text x="${L + 8}" y="${cyT - 30}" font-size="11" fill="var(--muted)">starboard fan</text>`;
  const tick = markStep(R);
  for (let m = 0; m <= Xmax + 1e-9; m += tick) {
    for (const sd of SIDES) {
      if (m === 0 && sd === 1) continue;
      gt += `<text x="${L + sd * m * s}" y="150" text-anchor="middle" font-family="var(--font-data)" font-size="11" fill="var(--muted)">${m}</text>`;
    }
  }
  gt += `<text x="336" y="132" text-anchor="end" font-size="11" fill="var(--muted)">${ex > 1.05 ? `front-to-back ×${f.num(ex, 0)} to be visible` : "to scale"}</text>`;

  let used = " (no published maximum)";
  if (fc.r) {
    used =
      R < a.ssr
        ? ` (this frequency's maximum; your setting is ${f.fmt(a.ssr)} m)`
        : ` (maximum for this frequency ${f.fmt(fc.r)} m)`;
  }
  const rows: [string, string][] = [
    [
      "Frequency drawn",
      `${fc.f}, ${f.num(fc.a, 0)}° fan${kf < 0.999 ? `, drawn ${f.num(kf, 2)}× as wide and thick as the widest` : ""}`,
    ],
    ["Range used", `${f.fmt(R)} m per side${used}`],
    [
      "Blind gap under the boat",
      xIn < NO_GAP_UNDER ? "none, the fans reach straight down" : `${f.fmt(2 * xIn)} m wide`,
    ],
  ];
  if (hitsBottom) {
    let limit = "the upper edge of the fan meeting the bottom";
    if (xOut < xOutGeom - 1e-6) {
      limit = R < a.ssr ? "this frequency's maximum side range" : "the range setting";
    }
    rows.push(["Bottom covered", ssCover(f, xIn, xOut)]);
    rows.push(["Limited by", limit]);
    rows.push([
      "Strip length at the outer edge",
      `${f.fmt(2 * Math.hypot(xOut, H) * Math.tan(rad(t / 2)))} m front to back`,
    ]);
  } else rows.push(["Bottom covered", "none, the range doesn't reach the bottom"]);
  return {
    "ssb-back": { attrs: { viewBox: `0 0 340 ${hB}` }, html: g },
    "ssb-top": { html: gt },
    "ssb-res": { html: dl(rows) },
  };
}

/** The three elements of the beam, emptied while the range or the angles of Settings fail. */
const NO_BEAM: SectionView = {
  "ssb-back": { html: "" },
  "ssb-top": { html: "" },
  "ssb-res": { html: "" },
};

/**
 * What the SideScan section writes (`renderSS`, lines 576 to 584, and the
 * functions it calls). Reads of `settings` what the checks of Settings read,
 * of `eq` the flags `ss`, `2d`, `ds` and `at`, of `ui` the tool `ssMode`, the
 * frequency `ssf`, the depth `relDepth` and the depths `errOn`, of `names` the
 * name `side`, of `local` the fields `ssR`, `s1`, `s2`, `ro` and `rs` as
 * numbers and `ssalign`, and `fmt`.
 *
 * The two graphs, which tool is shown and the message of the section are
 * always written. While the depth of Settings fails nothing else is; while the
 * range or the angles of side imaging fail, the reading, the shadow tools and
 * what stands under the simulated screen are written as usual and the three
 * elements of the beam are emptied. An element that is not written keeps what
 * it had.
 */
export function sideScanView(input: SideScanInput): SectionView {
  const { settings: a, ui, names, local, fmt: f } = input;
  const E = checkSettings(a, input.eq);
  let bad = "";
  if (E.dep) bad = "depth";
  else if (E.ssr) bad = `${names.side} range`;
  else if (E.ass) bad = `${names.side} angles`;
  const view: Record<string, ElementPatch> = {
    "bottom-tool": { hidden: ui.ssMode !== MODE_BOTTOM },
    "susp-tool": { hidden: ui.ssMode !== MODE_SUSPENDED },
    "err-svg": { html: errGraph(ui.errOn) },
    ...relView(ui.relDepth, f),
    "ss-serr": shownIn(bad ? `Fix the ${bad} in Settings.` : ""),
  };
  if (E.dep) return view;
  const H = a.dep;
  const align = local[FIELD_ALIGN];
  return {
    ...view,
    ...readingView(f, H, local),
    ...shadowView(f, H, local),
    ...simView(f, H, ui.ssMode, local),
    ...(bad ? NO_BEAM : beamView(f, a, ui.ssf, typeof align === "string" ? align : undefined)),
  };
}
