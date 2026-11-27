/**
 * The geometry that SideScan and All beams compared both need: the earlier
 * page's lines 501 to 516 (`clipBelow`, `sectorPoly`, `ssRange`, `ssAngles`),
 * 1084 to 1088 (`fanPoly`), 1090 to 1093 (`ssCover`) and 1154 to 1160 (`hull`).
 * Nothing here reads the page: what the earlier functions read from it (the
 * field `ssalign`, the number format) is given.
 */
import { rad } from "./format";
import type { FanFootprint, Formatter, Point, Polygon, Settings, SideAngles } from "./types";

/** The value of the field `ssalign` that aims the narrower fans around the center line. */
export const ALIGN_CENTER = "center";

/** The number of steps an arc is drawn in. */
const SECTOR_STEPS = 48;

/** The number of steps each long edge of a fan's footprint is drawn in. */
const FAN_STEPS = 40;

/** Under this distance, in metres, a side fan is said to start under the boat. */
const NO_GAP_UNDER = 0.005;

/**
 * The part of an outline that is not deeper than `depth`: its corners at or
 * above that line, with a new corner on the line wherever an edge crosses it.
 * A corner whose depth is not a number counts as deeper.
 */
export function clipBelow(poly: Polygon, depth: number): Point[] {
  const out: Point[] = [];
  const first = poly[0];
  if (first === undefined) return out;
  let a = first;
  // Each edge runs from a corner to the next; the last runs back to the first.
  for (const b of [...poly.slice(1), first]) {
    const ain = a[1] <= depth;
    const bin = b[1] <= depth;
    if (ain) out.push(a);
    if (ain !== bin) {
      const t = (depth - a[1]) / (b[1] - a[1]);
      out.push([a[0] + t * (b[0] - a[0]), depth]);
    }
    a = b;
  }
  return out;
}

/**
 * A beam seen from behind or from the side: the sector from the transducer,
 * between the angles `psi1` and `psi2` in radians from straight down, out to
 * `range`, cut off at the bottom at `depth`.
 */
export function sectorPoly(psi1: number, psi2: number, range: number, depth: number): Point[] {
  const poly: Point[] = [[0, 0]];
  for (let k = 0; k <= SECTOR_STEPS; k++) {
    const ps = psi1 + ((psi2 - psi1) * k) / SECTOR_STEPS;
    poly.push([range * Math.sin(ps), range * Math.cos(ps)]);
  }
  return clipBelow(poly, depth);
}

/**
 * The range a side fan is drawn to, in metres: the range of Settings, or the
 * frequency's greatest range `maxr` where that is shorter. A greatest range of
 * zero, or one that is not a number, counts as none.
 */
export function ssRange(a: Pick<Settings, "ssr">, maxr: number | undefined): number {
  return maxr ? Math.min(a.ssr, maxr) : a.ssr;
}

/**
 * The edges of the side fan of one frequency. `kf` is the fan's width as a
 * share of the widest fan's, `o` the upper edge of the widest fan in degrees
 * below horizontal and `w` its width in degrees. `align` is the value of the
 * field `ssalign`, or undefined on a page without it: a narrower fan keeps the
 * inner edge of the widest, unless the field says `ALIGN_CENTER`.
 */
export function ssAngles(kf: number, o: number, w: number, align: string | undefined): SideAngles {
  const w2 = w * kf;
  const o2 = align !== ALIGN_CENTER ? o + w - w2 : Math.max(0, o + w / 2 - w2 / 2);
  return { aOut: rad(o2), aIn: rad(o2 + w2) };
}

/**
 * Where a fan that points straight down meets a flat bottom at the depth `d`:
 * `ang` is its width and `th` its thickness, both in degrees.
 */
export function fanPoly(d: number, ang: number, th: number): FanFootprint {
  const X = d * Math.tan(rad(ang / 2));
  const up: Point[] = [];
  const dn: Point[] = [];
  for (let k = 0; k <= FAN_STEPS; k++) {
    const x = -X + (2 * X * k) / FAN_STEPS;
    const L = Math.hypot(d, x) * Math.tan(rad(th / 2));
    up.push([x, L]);
    dn.unshift([x, -L]);
  }
  return {
    pts: up.concat(dn),
    X,
    Lc: d * Math.tan(rad(th / 2)),
    Le: Math.hypot(d, X) * Math.tan(rad(th / 2)),
  };
}

/**
 * What a side fan covers of the bottom, in words: from `xIn` to `xOut` metres
 * out to each side.
 */
export function ssCover(f: Formatter, xIn: number, xOut: number): string {
  if (xIn < NO_GAP_UNDER) {
    return `${f.fmt(2 * xOut)} m wide strip of bottom: from under the boat out to ${f.fmt(xOut)} m each side`;
  }
  return `2 × ${f.fmt(xOut - xIn)} m of bottom: from ${f.fmt(xIn)} to ${f.fmt(xOut)} m out each side, with a ${f.fmt(2 * xIn)} m gap under the boat`;
}

/**
 * The cross product of the steps from `o` to `p` and from `o` to `q`: zero when
 * the three are in a line, and its sign says which way they turn.
 */
const cross = (o: Point, p: Point, q: Point): number =>
  (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);

/**
 * Whether the last two points of a chain and `p` are in a line or turn the
 * wrong way, so that the last point of the chain is no corner.
 */
function turnsBack(chain: readonly Point[], p: Point): boolean {
  const o = chain.at(-2);
  const q = chain.at(-1);
  return o !== undefined && q !== undefined && cross(o, q, p) <= 0;
}

/** One side of an outline: of the points, taken in order, those at which it keeps turning one way. */
function chainOf(pts: readonly Point[]): Point[] {
  const chain: Point[] = [];
  for (const p of pts) {
    while (turnsBack(chain, p)) chain.pop();
    chain.push(p);
  }
  return chain;
}

/**
 * The outline around a set of points: its corners from the one with the
 * smallest first coordinate, along the side of the smaller second coordinates
 * to the one with the greatest first coordinate, and back along the other side.
 * Points inside it and on its sides are left out. A single point gives no
 * outline, and two give both.
 */
export function hull(pts: Polygon): Point[] {
  const sorted = pts.slice().sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const lo = chainOf(sorted);
  const up = chainOf(sorted.slice().reverse());
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
