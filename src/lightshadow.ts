/**
 * Light and shadow (docs/SPEC.md 2.2): the earlier page's lines 1357 to 1492.
 * The shape of the bottom and the casting of the rays are plain functions
 * (`lsBottom`, `lsCast`, `lsRays`, `lsClasses`); what the section writes is a
 * `SectionView` by element id (`lightShadowView`). The pictures are markup, so
 * the section has no canvas and no painter. Nothing here finds an element,
 * reads a field or a style: the section's own fields and the style are given.
 * The order of every floating-point operation is the earlier page's.
 */
import { dl, rad } from "./format";
import { checkSettings } from "./settings";
import type {
  ElementPatch,
  Equipment,
  Formatter,
  Point,
  SectionLocal,
  SectionView,
  Settings,
  Theme,
  UiState,
} from "./types";

/** The elements `lightShadowView` writes, by id. */
export const KEYS = ["ls-err", "ls-svg", "ls-leg", "ls-scr", "ls-res"] as const;

/** The custom property of the page's style that is the colour of the lit beam. */
const LIGHT = "--s4";

/** The section's own number fields: the fish's distance out and its height above the bottom. */
const FIELD_DISTANCE = "lsfx";
const FIELD_HEIGHT = "lsfh";

/** The value of `ui.lsA` that chooses the steep beam; any other value is the low one. */
const BEAM_STEEP = "steep";

/** The two beams' edges, in degrees below horizontal: the low one, and the steep one. */
const BEAM_LOW_DEG: readonly [number, number] = [6, 60];
const BEAM_STEEP_DEG: readonly [number, number] = [55, 90];

/** The picture: its width, its padding, the depth's stretch, and the space above the water. */
const WIDTH = 340;
const PAD = 8;
const DEPTH_STRETCH = 2.5;
const TOP = 16;

/** How many segments the bottom has (it has one point more), and how many rays the beam casts (one more). */
const BOTTOM_SEGMENTS = 700;
const RAY_STEPS = 1400;

/** How many points the arc of the sector has beyond the first. */
const ARC_STEPS = 60;

/** How many bins the screen strip has. */
const BINS = 320;

/** A point of a bottom's outline by the part of the item the earlier page reads. */
const X = 0;
const Z = 1;

/** The fish as an ellipse: its centre (across, down) and its two half-axes, in metres. */
export interface Fish {
  readonly x: number;
  readonly z: number;
  readonly a: number;
  readonly b: number;
}

/**
 * What a ray met. A miss gives `t` as the range and `k` as `none`; a ray cast
 * with an unlimited range that met nothing gives only `t` (infinite).
 */
export interface Hit {
  /** The distance along the ray. */
  readonly t: number;
  /** What it met: the bottom, the fish, or nothing within the range. */
  readonly k?: "bot" | "fish" | "none";
  /** The segment of the bottom it met. */
  readonly i?: number;
  /** How square-on it met it, 0 to 1. */
  readonly c?: number;
}

/** One ray of the beam: its direction, what it meets with the fish, and what it meets without. */
export interface Ray {
  readonly dx: number;
  readonly dz: number;
  readonly h: Hit;
  readonly g: Hit;
}

/** How a point of the bottom is seen from the transducer: outside the beam, lit, in the fish's shadow, or in the bottom's own. */
export interface PointClass {
  readonly s: "out" | "lit" | "fish" | "terr";
  /** How square-on the ray without the fish meets it. */
  readonly c?: number;
}

/**
 * What the view reads of a section's input (the `ViewInput` of docs/SPEC.md
 * 3.2, which has these six under the same names; the section uses no names).
 */
interface LightShadowInput {
  readonly settings: Settings;
  readonly eq: Equipment;
  readonly ui: Pick<UiState, "lsB" | "lsA">;
  readonly local: SectionLocal;
  readonly theme: Theme;
  readonly fmt: Formatter;
}

/**
 * A number field of the section's own; a field that is not given, or given as a text, is no number,
 * and neither is an infinite one (the earlier page's `num`, line 11, gives NaN for it).
 */
function localNumber(local: SectionLocal, id: string): number {
  const value = local[id];
  return typeof value === "number" && Number.isFinite(value) ? value : Number.NaN;
}

/** A message in its element, which is hidden when there is none (`showErr`, line 12). */
function shownIn(message: string): ElementPatch {
  return { text: message, hidden: message === "" };
}

/**
 * An item of a list the earlier page reads by an index it keeps inside it. The
 * earlier page fails with a type error where there is none; so does this.
 */
function at<T>(list: readonly T[], i: number): T {
  const item = list[i];
  if (item === undefined) throw new TypeError(`No item ${i} in a list of ${list.length}`);
  return item;
}

/**
 * The bottom `kind` for a depth `H` and a `width`, as 701 points (across,
 * down): flat, rising (`up`), falling (`down`), a step (`drop`), a wave or a
 * rock; any other kind is flat (`lsBottom`, lines 1358 to 1370).
 */
export function lsBottom(kind: string, H: number, width: number): Point[] {
  const pts: Point[] = [];
  const n = BOTTOM_SEGMENTS;
  const sm = (u: number): number => {
    const v = Math.max(0, Math.min(1, u));
    return v * v * (3 - 2 * v);
  };
  for (let i = 0; i <= n; i++) {
    const x = (width * i) / n;
    let z = H;
    if (kind === "up") z = H - 0.45 * H * sm((x - 1.2 * H) / (3 * H));
    else if (kind === "down") z = H + 0.6 * H * sm((x - 1.2 * H) / (3 * H));
    else if (kind === "drop") z = H + 0.7 * H * sm((x - 2.2 * H) / (0.12 * H));
    else if (kind === "wave") {
      z = H + 0.14 * H * Math.sin((2 * Math.PI * x) / (1.3 * H)) * sm((x - 0.4 * H) / (0.8 * H));
    } else if (kind === "rock") {
      const r = 0.2 * H;
      const xc = 2.2 * H;
      const dx = x - xc;
      if (Math.abs(dx) < r) z = H - Math.sqrt(r * r - dx * dx) * 0.9;
    }
    pts.push([x, z]);
  }
  return pts;
}

/**
 * Casts a ray from the transducer in the direction (`dx`, `dz`) against the
 * bottom `B` and the fish, out to the range `R`: the nearest thing it meets, or
 * a miss at the range (`lsCast`, lines 1371 to 1385).
 */
export function lsCast(
  dx: number,
  dz: number,
  B: readonly Point[],
  fish: Fish | null,
  R: number,
): Hit {
  let best: Hit = { t: Number.POSITIVE_INFINITY };
  for (let i = 0; i < B.length - 1; i++) {
    const q0 = at(B, i);
    const q1 = at(B, i + 1);
    const ex = q1[X] - q0[X];
    const ez = q1[Z] - q0[Z];
    const den = dx * ez - dz * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = (q0[X] * ez - q0[Z] * ex) / den;
    const u = (q0[X] * dz - q0[Z] * dx) / den;
    if (t > 1e-6 && u >= 0 && u <= 1 && t < best.t) {
      const L = Math.hypot(ex, ez);
      const nx = ez / L;
      const nz = -ex / L;
      best = { t, k: "bot", i, c: Math.max(0, -(dx * nx + dz * nz)) };
    }
  }
  if (fish) {
    const ox = -fish.x;
    const oz = -fish.z;
    const A = (dx * dx) / (fish.a * fish.a) + (dz * dz) / (fish.b * fish.b);
    const Bq = 2 * ((ox * dx) / (fish.a * fish.a) + (oz * dz) / (fish.b * fish.b));
    const C = (ox * ox) / (fish.a * fish.a) + (oz * oz) / (fish.b * fish.b) - 1;
    const D = Bq * Bq - 4 * A * C;
    if (D >= 0) {
      const tf = (-Bq - Math.sqrt(D)) / (2 * A);
      if (tf > 0 && tf < best.t) best = { t: tf, k: "fish", c: 1 };
    }
  }
  if (best.t > R) return { t: R, k: "none", c: 0 };
  return best;
}

/**
 * The 1401 rays of the beam from the angle `a1` to the angle `a2` (radians
 * below horizontal), each cast with the fish and without it (lines 1397 to 1402).
 */
export function lsRays(
  a1: number,
  a2: number,
  B: readonly Point[],
  fish: Fish | null,
  R: number,
): Ray[] {
  const N = RAY_STEPS;
  const rays: Ray[] = [];
  for (let k = 0; k <= N; k++) {
    const an = a1 + ((a2 - a1) * k) / N;
    const dx = Math.cos(an);
    const dz = Math.sin(an);
    const h = lsCast(dx, dz, B, fish, R);
    const g = fish ? lsCast(dx, dz, B, null, R) : h;
    rays.push({ dx, dz, h, g });
  }
  return rays;
}

/**
 * How each point of the bottom is seen: outside the beam or the range, lit,
 * in the fish's shadow, or hidden by the bottom itself (lines 1403 to 1410).
 */
export function lsClasses(
  B: readonly Point[],
  a1: number,
  a2: number,
  R: number,
  H: number,
  fish: Fish | null,
): PointClass[] {
  return B.map((q): PointClass => {
    const d = Math.hypot(q[X], q[Z]);
    const an = Math.atan2(q[Z], q[X]);
    if (an < a1 - 1e-9 || an > a2 + 1e-9 || d > R) return { s: "out" };
    const dx = q[X] / d;
    const dz = q[Z] / d;
    const eps = 0.004 * H + 1e-6;
    const hf = lsCast(dx, dz, B, fish, R + 1);
    const hg = fish ? lsCast(dx, dz, B, null, R + 1) : hf;
    const terr = hg.t >= d - eps;
    const full = hf.t >= d - eps;
    return { s: full ? "lit" : terr ? "fish" : "terr", c: hg.c };
  });
}

/** The stretches of the bottom, as (from, to) in metres across, where the class is `want`, over 2 per cent of the depth. */
function runs(B: readonly Point[], cls: readonly PointClass[], want: string, H: number): Point[] {
  const out: Point[] = [];
  let st: number | null = null;
  for (let i = 0; i < B.length; i++) {
    const on = at(cls, i).s === want;
    if (on && st === null) st = at(B, i)[X];
    if (!on && st !== null) {
      out.push([st, at(B, i - 1)[X]]);
      st = null;
    }
  }
  if (st !== null) out.push([st, at(B, B.length - 1)[X]]);
  return out.filter((r) => r[1] - r[0] > 0.02 * H);
}

/** The legend under the picture, with the colour of the lit beam. */
function legend(light: string): string {
  return `<span><i style="border-top:8px solid ${light};opacity:0.6"></i>lit by the beam</span><span><i style="border-top:8px solid var(--fg);opacity:0.3"></i>in the beam, but in shadow</span><span><i style="border-top:3px solid var(--fg)"></i>bottom in shadow</span><span><i style="border-top:3px solid ${light}"></i>bottom lit (brighter = more square-on)</span>`;
}

/**
 * What the section writes (`renderLS`, lines 1386 to 1491). A depth that fails
 * its check writes only the message. A fish distance or height that fails
 * writes its message and the pictures without the fish.
 */
export function lightShadowView(input: LightShadowInput): SectionView {
  const { settings: a, ui, local, theme, fmt: f } = input;
  if (checkSettings(a, input.eq).dep) {
    return { "ls-err": shownIn("Fix the depth in Settings.") };
  }
  const H = a.dep;
  const Xw = 5 * H;
  const R = 5 * H;
  const kind = ui.lsB;
  const steep = ui.lsA === BEAM_STEEP;
  const [d1, d2] = steep ? BEAM_STEEP_DEG : BEAM_LOW_DEG;
  const a1 = rad(d1);
  const a2 = rad(d2);
  const B = lsBottom(kind, H, Xw);
  const zb = (x: number): number => {
    const i = Math.max(0, Math.min(B.length - 2, Math.floor((x / Xw) * (B.length - 1))));
    const q0 = at(B, i);
    const q1 = at(B, i + 1);
    const u = (x - q0[X]) / (q1[X] - q0[X]);
    return q0[Z] + (q1[Z] - q0[Z]) * Math.max(0, Math.min(1, u));
  };
  const fx = localNumber(local, FIELD_DISTANCE);
  const fh = localNumber(local, FIELD_HEIGHT);
  let e = !(fx >= 0 && fx <= Xw)
    ? `Enter a fish distance from 0 to ${f.fmt(Xw)} m (5 × the depth).`
    : !(fh >= 0)
      ? "Enter a height of 0 m or more."
      : "";
  const fl = Math.max(0.8, 0.12 * H);
  const fishZ = Number.isFinite(fx) ? zb(fx) - fh - fl * 0.22 : Number.NaN;
  if (!e && !(fishZ > fl * 0.2)) e = "That puts the fish above the surface; lower the height.";
  const fish: Fish | null = e ? null : { x: fx, z: fishZ, a: fl / 2, b: fl * 0.22 };
  const rays = lsRays(a1, a2, B, fish, R);
  const cls = lsClasses(B, a1, a2, R, H, fish);

  // The picture.
  const W = WIDTH;
  const pad = PAD;
  const sc = (W - 2 * pad) / Xw;
  const sz = sc * DEPTH_STRETCH;
  const zMax = Math.max(...B.map((q) => q[Z]));
  const top = TOP;
  const Hs = Math.ceil(top + zMax * sz + 22);
  const P = (x: number, z: number): string =>
    `${(pad + x * sc).toFixed(1)},${(top + z * sz).toFixed(1)}`;
  const light = theme.colours[LIGHT] ?? "";
  let g = "";
  const water = `M ${P(0, 0)} L ${P(Xw, 0)} ${B.slice()
    .reverse()
    .map((q) => `L ${P(q[X], q[Z])}`)
    .join(" ")} Z`;
  g += `<defs><clipPath id="ls-clip"><path d="${water}"/></clipPath></defs>`;
  g += `<path d="${water}" fill="var(--water)" fill-opacity="0.06"/>`;
  const ground = `M ${P(0, zMax + 12 / sz)} ${B.map((q) => `L ${P(q[X], q[Z])}`).join(" ")} L ${P(Xw, zMax + 12 / sz)} Z`;
  g += `<path d="${ground}" fill="var(--ground)"/>`;
  // The sector (everything the beam would reach) in the shadow colour, then the lit polygon on top.
  const arc: string[] = [];
  for (let k = 0; k <= ARC_STEPS; k++) {
    const an2 = a1 + ((a2 - a1) * k) / ARC_STEPS;
    arc.push(P(R * Math.cos(an2), R * Math.sin(an2)));
  }
  g += `<g clip-path="url(#ls-clip)"><polygon points="${P(0, 0)} ${arc.join(" ")}" fill="var(--fg)" fill-opacity="0.22"/>`;
  g += `<polygon points="${P(0, 0)} ${rays.map((r) => P(r.dx * r.h.t, r.dz * r.h.t)).join(" ")}" fill="${light}" fill-opacity="0.38"/></g>`;
  for (const an3 of [a1, a2]) {
    const t3 = lsCast(Math.cos(an3), Math.sin(an3), B, null, R).t;
    g += `<line x1="${pad}" y1="${top}" x2="${(pad + Math.cos(an3) * t3 * sc).toFixed(1)}" y2="${(top + Math.sin(an3) * t3 * sz).toFixed(1)}" stroke="${light}" stroke-width="1.2" stroke-dasharray="5 3"/>`;
  }
  // The bottom line, by class.
  for (let i = 0; i < B.length - 1; i++) {
    const c = at(cls, i);
    const q0 = at(B, i);
    const q1 = at(B, i + 1);
    const col = c.s === "lit" ? light : c.s === "out" ? "var(--muted)" : "var(--fg)";
    const w = c.s === "out" ? 1 : 3.2;
    const op = c.s === "lit" ? 0.35 + 0.65 * (c.c ?? Number.NaN) : c.s === "out" ? 0.6 : 0.85;
    g += `<line x1="${(pad + q0[X] * sc).toFixed(1)}" y1="${(top + q0[Z] * sz).toFixed(1)}" x2="${(pad + q1[X] * sc).toFixed(1)}" y2="${(top + q1[Z] * sz).toFixed(1)}" stroke="${col}" stroke-opacity="${op.toFixed(2)}" stroke-width="${w}" stroke-linecap="butt"/>`;
  }
  // The edges of the fish's shadow.
  const fr = rays.filter((r) => r.h.k === "fish");
  const res: [string, string][] = [];
  if (fr.length) {
    for (const r of [at(fr, 0), at(fr, fr.length - 1)]) {
      g += `<line x1="${(pad + r.dx * r.h.t * sc).toFixed(1)}" y1="${(top + r.dz * r.h.t * sz).toFixed(1)}" x2="${(pad + r.dx * r.g.t * sc).toFixed(1)}" y2="${(top + r.dz * r.g.t * sz).toFixed(1)}" stroke="var(--fg)" stroke-width="0.8" stroke-dasharray="2 3"/>`;
    }
  }
  if (fish) {
    g += `<ellipse cx="${(pad + fish.x * sc).toFixed(1)}" cy="${(top + fish.z * sz).toFixed(1)}" rx="${Math.max(fish.a * sc, 2.5).toFixed(1)}" ry="${Math.max(fish.b * sz, 1.5).toFixed(1)}" fill="var(--s5)" stroke="var(--fg)" stroke-width="0.8"/>`;
  }
  g += `<line x1="0" x2="${W}" y1="${top}" y2="${top}" stroke="var(--water)" stroke-width="1.2"/>`;
  g += `<circle cx="${pad}" cy="${top}" r="4" fill="var(--fg)"/>`;
  g += `<text x="${pad + 8}" y="11" font-size="11" fill="var(--muted)">transducer (the flashlight)</text>`;
  g += `<text x="${W - 4}" y="${Hs - 5}" text-anchor="end" font-family="var(--font-data)" font-size="10" fill="var(--muted)">${f.fmt(H)} m deep · ${f.fmt(Xw)} m across · depth ×${f.num(DEPTH_STRETCH, 1)}</text>`;

  // The screen strip: the echo's strength by slant distance.
  const nb = BINS;
  const bins: number[] = new Array<number>(nb).fill(0);
  const kinds: string[] = new Array<string>(nb).fill("");
  const bw = R / nb;
  const put = (t: number, v: number, kk: string): void => {
    const b = Math.floor(t / bw);
    if (b >= 0 && b < nb && v > at(bins, b)) {
      bins[b] = v;
      kinds[b] = kk;
    }
  };
  for (let k = 0; k < rays.length; k++) {
    const ray = at(rays, k);
    const h = ray.h;
    if (h.k === "none") continue;
    const v = h.k === "fish" ? 1 : 0.15 + 0.85 * (h.c ?? Number.NaN);
    put(h.t, v, h.k ?? "");
    const n2 = rays[k + 1];
    if (!n2 || n2.h.k !== h.k || h.k !== "bot") continue;
    const p1 = [ray.dx * h.t, ray.dz * h.t] as const;
    const p2 = [n2.dx * n2.h.t, n2.dz * n2.h.t] as const;
    if (Math.hypot(p1[0] - p2[0], p1[1] - p2[1]) < 0.05 * H) {
      const v2 = 0.15 + 0.85 * (n2.h.c ?? Number.NaN);
      const ta = Math.min(h.t, n2.h.t);
      const tb = Math.max(h.t, n2.h.t);
      for (let t = ta; t <= tb; t += bw / 2) {
        put(t, v + ((v2 - v) * (t - ta)) / Math.max(tb - ta, 1e-9), "bot");
      }
    }
  }
  const sw = (W - 2 * pad) / nb;
  let sg = `<rect x="${pad}" y="4" width="${W - 2 * pad}" height="30" fill="#0b1118"/>`;
  for (let b = 0; b < nb; b++) {
    const q = at(bins, b);
    if (!(q > 0)) continue;
    let rr = Math.round(40 + 215 * Math.min(1, q * 1.1));
    let gg = Math.round(28 + 170 * q * q);
    // biome-ignore lint/style/useExponentiationOperator: the earlier page's own call, kept as it is
    let bb = Math.round(18 + 120 * Math.pow(q, 3));
    if (at(kinds, b) === "fish") {
      rr = 255;
      gg = 245;
      bb = 225;
    }
    sg += `<rect x="${(pad + b * sw).toFixed(2)}" y="4" width="${(sw + 0.4).toFixed(2)}" height="30" fill="rgb(${rr},${gg},${bb})"/>`;
  }
  // The annotations under the strip.
  let tBot = Number.POSITIVE_INFINITY;
  for (const r of rays) if (r.h.k === "bot") tBot = Math.min(tBot, r.h.t);
  const X2 = (t: number): number => pad + (t / R) * (W - 2 * pad);
  const tick = (t: number, lab: string, row: number): void => {
    const x = X2(t);
    sg += `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="34" y2="${39 + row * 13}" stroke="var(--muted)" stroke-width="0.8"/><text x="${Math.min(Math.max(x, 20), W - 20).toFixed(1)}" y="${48 + row * 13}" text-anchor="middle" font-size="10" fill="var(--muted)">${lab}</text>`;
  };
  if (Number.isFinite(tBot)) tick(tBot, "first bottom echo", 0);
  let tf = Number.NaN;
  let sa = Number.NaN;
  let sb2 = Number.NaN;
  if (fr.length) {
    tf = Math.min(...fr.map((r) => r.h.t));
    const gs = fr.filter((r) => r.g.k === "bot");
    if (gs.length) {
      sa = Math.min(...gs.map((r) => r.g.t));
      sb2 = Math.max(...gs.map((r) => r.g.t));
    }
    tick(tf, "fish", 1);
    if (Number.isFinite(sa)) {
      sg += `<rect x="${X2(sa).toFixed(1)}" y="2" width="${Math.max(X2(sb2) - X2(sa), 1).toFixed(1)}" height="34" fill="none" stroke="var(--s5)" stroke-width="1.2" stroke-dasharray="3 2"/>`;
      tick((sa + sb2) / 2, "fish shadow", 2);
    }
  }
  sg += `<text x="${W - pad}" y="90" text-anchor="end" font-family="var(--font-data)" font-size="10" fill="var(--muted)">0 → ${f.fmt(R)} m from the transducer</text>`;

  // The results.
  if (fish) {
    if (!fr.length) {
      const litX = B.filter((_q, i) => at(cls, i).s === "lit").map((q) => q[X]);
      const lit0 = litX.length ? Math.max(...litX) : Number.NaN;
      res.push([
        "Fish",
        `outside the beam, or hidden behind the bottom: no echo, no shadow${
          Number.isFinite(lit0) && fx > lit0
            ? `. This beam reaches the bottom only out to ${f.fmt(lit0)} m; move the fish closer`
            : ""
        }`,
      ]);
    } else {
      res.push([
        "Fish echo on the screen",
        `${f.fmt(tf)} m from the transducer (really ${f.fmt(fx)} m out, ${f.fmt(fh)} m above the bottom)`,
      ]);
      const fs = runs(B, cls, "fish", H);
      if (fs.length) {
        res.push([
          "Its shadow on the bottom",
          `${fs.map((r) => `${f.fmt(r[0])} to ${f.fmt(r[1])} m out`).join(", ")} (${f.fmt(
            fs.reduce((s2, r) => s2 + r[1] - r[0], 0),
          )} m long)`,
        ]);
      }
      if (Number.isFinite(sa)) {
        res.push([
          "Shadow on the screen",
          `${f.fmt(sa)} to ${f.fmt(sb2)} m; the gap after the fish echo is ${f.fmt(sa - tf)} m`,
        ]);
      } else {
        res.push([
          "Its shadow",
          "lands beyond the beam's reach, so the screen shows the fish but no shadow",
        ]);
      }
    }
  }
  const ts = runs(B, cls, "terr", H);
  if (ts.length) {
    res.push([
      "Bottom hidden by the bottom itself",
      `${ts.map((r) => `${f.fmt(r[0])} to ${f.fmt(r[1])} m out`).join(", ")} (black on the screen)`,
    ]);
  } else {
    res.push([
      "Bottom hidden by the bottom itself",
      "none: every part of the bottom inside the beam faces the light",
    ]);
  }
  const li = runs(B, cls, "lit", H);
  if (li.length) {
    res.push([
      "Bottom lit",
      `from ${f.fmt(at(li, 0)[0])} to ${f.fmt(at(li, li.length - 1)[1])} m out`,
    ]);
  }
  return {
    "ls-err": shownIn(e),
    "ls-svg": { html: g, attrs: { viewBox: `0 0 ${W} ${Hs}` } },
    "ls-leg": { html: legend(light) },
    "ls-scr": { html: sg },
    "ls-res": { html: dl(res) },
  };
}
