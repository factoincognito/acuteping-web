/**
 * All beams compared (docs/SPEC.md 2.2): the earlier page's lines 973 to 1356,
 * less what `geometry.ts` holds. What the section writes is a `SectionView` by
 * element id, and the 3D view is drawn through an injected `Surface`. Nothing
 * here finds an element, reads a field or a style: the section's own fields,
 * the style and the state of the 3D view are given.
 */
import { rgba } from "./colour";
import { DASH_DOTTED, DASH_DOUBLE, deg, dl, rad } from "./format";
import { fanPoly, hull, sectorPoly, ssAngles, ssCover, ssRange } from "./geometry";
import { checkSettings } from "./settings";
import type {
  Beam,
  ElementPatch,
  Equipment,
  Formatter,
  Line3,
  Names,
  Point,
  Point3,
  Polygon,
  Scene3d,
  Scene3dState,
  SectionLocal,
  SectionView,
  Settings,
  Surface,
  Theme,
  Triangle3,
  UiState,
} from "./types";

/** The field that aims the narrower side fans (line 516). */
const FIELD_ALIGN = "ssalign";

/** The colours of the 2D and the down imaging beams, in the order of their frequencies (line 974). */
const COLS = {
  cone: ["var(--s3)", "var(--s2)", "var(--s6)"],
  down: ["var(--s4)", "var(--s5)", "var(--s6)"],
} as const;

/** The dash patterns of the side fans, in the order of their frequencies (line 976). */
const SIDE_DASHES = ["", "6 4", DASH_DOTTED] as const;

/** The colour of a beam that has none in `COLS`, by sonar. */
const FALLBACK = { cone: "var(--s3)", down: "var(--s6)" } as const;

/** The dash pattern of the live sonar's beams (lines 980 to 984). */
const LIVE_DASH = DASH_DOUBLE;

/** The index of the down imaging frequency whose line is dotted (line 979). */
const THIRD_FREQUENCY = 2;

/** What a list of results says when no beam is ticked (lines 1082, 1152 and 1220). */
const NO_BEAMS = "<div><dt>No beams selected</dt><dd>tap one above</dd></div>";

/** What a result says of a beam that never meets the bottom. */
const NO_REACH = "doesn't reach the bottom";

/** The names of the beams, as the page shows them for the chosen transducers. */
type BeamNames = Pick<Names, "side" | "down" | "live" | "flat" | "wide">;

/** What the list of beams reads of Settings. */
type BeamSettings = Pick<Settings, "side" | "cone" | "down" | "swmax" | "dst" | "atw" | "att">;

/** The ranges that a beam is drawn to, from Settings. */
type Ranges = Pick<Settings, "ssr" | "atr">;

/** What a range or its tag reads of a beam. */
type RangeOf = Pick<Beam, "kf" | "maxr" | "kind">;

/**
 * The beams the page compares, in the order it lists them (`beamList`, lines
 * 975 to 986): the side fans, the 2D cones and the down imaging fans of the
 * transducers, then the live sonar's five. A side fan is as wide as its
 * frequency's angle is of the widest, and the first has a dotted line: the
 * earlier lines test its dash pattern, an empty text, as no pattern and put in
 * the dotted one.
 */
export function beamList(a: BeamSettings, names: BeamNames): Beam[] {
  const list: Beam[] = [];
  for (const [i, c] of a.side.entries()) {
    list.push({
      id: `side${i}`,
      eq: "ss",
      name: `${names.side} ${c.f}`,
      maxr: c.r,
      kf: c.a / a.swmax,
      col: "var(--s1)",
      dash: SIDE_DASHES[i] || DASH_DOTTED,
    });
  }
  for (const [i, c] of a.cone.entries()) {
    list.push({
      id: `cone${i}`,
      eq: "2d",
      name: `2D ${c.n ? `${c.n} ` : ""}${c.f}`,
      maxr: c.r,
      kind: "cone",
      ang: c.a,
      col: COLS.cone[i] || FALLBACK.cone,
      dash: "",
    });
  }
  for (const [i, c] of a.down.entries()) {
    list.push({
      id: `down${i}`,
      eq: "ds",
      name: `${names.down} ${c.f}`,
      maxr: c.r,
      kind: "fan",
      ang: c.a,
      th: a.dst,
      col: COLS.down[i] || FALLBACK.down,
      dash: i === THIRD_FREQUENCY ? DASH_DOTTED : "6 4",
    });
  }
  list.push({
    id: "live",
    eq: "at",
    name: `${names.live} Down, fan across`,
    kind: "at",
    ang: a.atw,
    th: a.att,
    rot: false,
    col: "var(--s7)",
    dash: LIVE_DASH,
  });
  list.push({
    id: "livel",
    eq: "at",
    name: `${names.live} Down, fan along keel`,
    kind: "at",
    ang: a.atw,
    th: a.att,
    rot: true,
    col: "var(--s8)",
    dash: LIVE_DASH,
  });
  list.push({
    id: "livef",
    eq: "at",
    name: `${names.live} Forward`,
    kind: "at",
    mode: "F",
    ang: a.atw,
    th: a.att,
    col: "var(--s2)",
    dash: LIVE_DASH,
  });
  list.push({
    id: "lives",
    eq: "at",
    name: names.flat,
    kind: "at",
    mode: "S",
    ang: a.atw,
    th: a.att,
    col: "var(--s5)",
    dash: LIVE_DASH,
  });
  list.push({
    id: "livew",
    eq: "atw",
    name: `${names.wide} (two units)`,
    kind: "at",
    mode: "W",
    ang: a.atw,
    th: a.att,
    col: "var(--s6)",
    dash: LIVE_DASH,
  });
  return list;
}

/**
 * The beams that are ticked and belong to a sonar the boat has (`cmpList`,
 * line 1099). `behind` is the saved state of the ticks, by beam; a beam it does
 * not name is not ticked.
 */
export function cmpList(
  a: BeamSettings,
  names: BeamNames,
  eq: Equipment,
  behind: Readonly<Record<string, boolean>>,
): Beam[] {
  return beamList(a, names).filter((b) => eq[b.eq] && behind[b.id]);
}

/**
 * How far a beam is drawn, in metres (`bRange`, line 1089): a side fan to the
 * range of Settings or its frequency's own, the live sonar's to its range, any
 * other to its greatest depth, or to 10,000 m where it has none. A share `kf`
 * of 0 or NaN counts as no side fan.
 */
export function bRange(a: Ranges, b: RangeOf): number {
  if (b.kf) return ssRange(a, b.maxr);
  return b.kind === "at" ? a.atr : b.maxr || 1e4;
}

/** The start of a result about a beam: its range, or for a depth-limited beam its greatest depth (`rtag`, lines 1094 to 1098). */
export function rtag(f: Formatter, a: Ranges, b: RangeOf): string {
  if (b.kf) {
    const R = ssRange(a, b.maxr);
    return `range ${f.num(R, 0)} m${R < a.ssr ? " (frequency max)" : ""} · `;
  }
  if (b.kind === "at") return `range ${f.num(a.atr, 0)} m · `;
  return b.maxr ? `max depth ${f.num(b.maxr, 0)} m · ` : "";
}

/** The least and the greatest of a set of numbers. */
export type Extent = readonly [number, number];

/** The ring or band of bottom the flat and the wide mode light up. */
export interface AtRing {
  /** Where it starts, in metres out. */
  readonly h1: number;
  /** Where it ends, in metres out. */
  readonly h2: number;
  /** Half the angle it spans, in radians. */
  readonly span: number;
  /** The bearings it is drawn at, in radians. */
  readonly azs: readonly number[];
}

/** One direction of a live sonar beam's outline. */
export interface AtDirection {
  /** The unit vector: ahead, to starboard, down. */
  readonly v: Point3;
  /** Set on the centre of the slice. */
  readonly c: boolean;
  /** The bearing, for the flat and the wide mode. */
  readonly az?: number;
}

/** One direction of a live sonar beam as far as it reaches. */
export interface AtRay {
  readonly p: Point3;
  readonly c: boolean;
  readonly az?: number;
}

/**
 * The geometry of one live sonar mode (`atGeo`, lines 988 to 1029): x ahead, y
 * starboard, z down, the transducer at the origin.
 */
export interface AtGeometry {
  readonly dirs: readonly AtDirection[];
  /** Points on the part of the bottom the beam lights up. */
  readonly pts: readonly Point[];
  /** The outline of that part, or null where the beam does not reach the bottom. */
  readonly foot: readonly Polygon[] | null;
  /** The range. */
  readonly R: number;
  /** The forward mode: where on the bottom it starts and ends ahead. */
  readonly fx?: Extent;
  /** The flat and the wide mode: the ring or band of bottom. */
  readonly ring?: AtRing;
  readonly rays: readonly AtRay[];
  /** The least and greatest of the points ahead; null without points. */
  readonly xr: Extent | null;
  /** The least and greatest of the points to starboard; null without points. */
  readonly yr: Extent | null;
}

/** What the live sonar's geometry reads of its beam and of Settings. */
type AtBeam = Pick<Beam, "mode" | "th" | "ang">;
type AtSettings = Pick<Settings, "dep" | "atr" | "atfa" | "atsb">;

/** The number of steps the forward mode's angle is divided into. */
const FORWARD_STEPS = 40;

/** The number of steps the bearing of the flat and the wide mode is divided into, each side. */
const BEARING_STEPS = 72;

/**
 * How far, in radians, either side of the angle where the beam first meets the
 * bottom the forward mode puts a direction, so that its outline has a corner
 * there; also how near to a half turn a span still counts as one (line 1034).
 */
const EDGE_NUDGE = 1e-9;

/** A direction whose downward part is at most this is taken as not pointing down (line 1025). */
const MIN_DOWN = 1e-9;

/** The least and greatest of one coordinate of the points; null where there are none. */
function extent(pts: readonly Point[], i: 0 | 1): Extent | null {
  if (!pts.length) return null;
  let mn = Number.POSITIVE_INFINITY;
  let mx = Number.NEGATIVE_INFINITY;
  for (const q of pts) {
    mn = Math.min(mn, q[i]);
    mx = Math.max(mx, q[i]);
  }
  return [mn, mx];
}

/**
 * The directions, the bottom and the rays of one live sonar mode, for the
 * compare views. The forward mode `F` is a slice aimed ahead and down at
 * `atfa`; the flat mode `S` a slice at `atsb` below horizontal, fanned out to
 * both sides; the wide mode `W` that of two units, twice as wide. A beam with
 * another mode, or none, is drawn as a flat one.
 */
export function atGeo(b: AtBeam, a: AtSettings): AtGeometry {
  const H = a.dep;
  const R = a.atr;
  const ht = rad((b.th ?? Number.NaN) / 2);
  const hw = rad((b.ang ?? Number.NaN) / 2);
  const dirs: AtDirection[] = [];
  const pts: Point[] = [];
  let foot: Polygon[] | null = null;
  let fx: Extent | undefined;
  let ring: AtRing | undefined;
  const rmax = R > H ? Math.sqrt(R * R - H * H) : Number.NaN;
  if (b.mode === "F") {
    const fa = rad(a.atfa);
    const lo = Math.max(fa - hw, 0);
    const hi = fa + hw;
    const ans: number[] = [];
    for (let k = 0; k <= FORWARD_STEPS; k++) ans.push(lo + ((hi - lo) * k) / FORWARD_STEPS);
    if (R > H) {
      const c1 = Math.asin(H / R);
      for (const c of [c1, Math.PI - c1]) {
        if (c > lo && c < hi) ans.push(c - EDGE_NUDGE, c + EDGE_NUDGE);
      }
    }
    ans.sort((p, q) => p - q);
    for (const an of ans) {
      for (const p of [-ht, 0, ht]) {
        dirs.push({
          v: [Math.cos(p) * Math.cos(an), Math.sin(p), Math.cos(p) * Math.sin(an)],
          c: p === 0,
        });
      }
    }
    if (R >= H) {
      const a1 = Math.max(lo, Math.asin(H / R));
      const a2 = Math.min(hi, Math.PI - Math.asin(H / R));
      if (a2 > a1) {
        const up: Point[] = [];
        const dn: Point[] = [];
        for (let k = 0; k <= FORWARD_STEPS; k++) {
          const an = a1 + ((a2 - a1) * k) / FORWARD_STEPS;
          const x = H / Math.tan(an);
          const y = Math.min(
            (H * Math.tan(ht)) / Math.sin(an),
            Math.sqrt(Math.max(R * R - H * H - x * x, 0)),
          );
          up.push([x, y]);
          dn.unshift([x, -y]);
          for (let j = -4; j <= 4; j++) pts.push([x, (y * j) / 4]);
        }
        foot = [up.concat(dn)];
        fx = [H / Math.tan(a2), H / Math.tan(a1)];
      }
    }
  } else {
    const span = b.mode === "W" ? Math.min(2 * hw, Math.PI) : hw;
    const sb = rad(a.atsb);
    const elo = Math.max(sb - ht, 0);
    const ehi = sb + ht;
    const azs: number[] = [];
    for (let k = 0; k <= BEARING_STEPS; k++) azs.push(-span + (2 * span * k) / BEARING_STEPS);
    for (const z of [0, Math.PI / 2, -Math.PI / 2]) {
      if (Math.abs(z) < span) azs.push(z);
    }
    azs.sort((p, q) => p - q);
    const els = [elo, sb, ehi];
    if (R > H) {
      const ce = Math.asin(H / R);
      if (ce > elo && ce < ehi) els.push(ce);
    }
    for (const az of azs) {
      for (const e of els) {
        dirs.push({
          v: [Math.cos(e) * Math.cos(az), Math.cos(e) * Math.sin(az), Math.sin(e)],
          c: e === sb,
          az,
        });
      }
    }
    if (R >= H) {
      const h1 = H / Math.tan(ehi);
      const h2 = Math.min(elo > 0 ? H / Math.tan(elo) : Number.POSITIVE_INFINITY, rmax);
      if (h2 > h1) {
        const outer: Point[] = [];
        const inner: Point[] = [];
        for (const az of azs) {
          outer.push([h2 * Math.cos(az), h2 * Math.sin(az)]);
          inner.unshift([h1 * Math.cos(az), h1 * Math.sin(az)]);
          for (let j = 0; j <= 6; j++) {
            const r = h1 + ((h2 - h1) * j) / 6;
            pts.push([r * Math.cos(az), r * Math.sin(az)]);
          }
        }
        foot = [outer.concat(inner)];
        ring = { h1, h2, span, azs };
      }
    }
  }
  const rays: AtRay[] = dirs.map((d) => {
    const v = d.v;
    const L = v[2] > MIN_DOWN ? Math.min(R, H / v[2]) : R;
    return { p: [v[0] * L, v[1] * L, v[2] * L], c: d.c, az: d.az };
  });
  return { dirs, pts, foot, R, fx, ring, rays, xr: extent(pts, 0), yr: extent(pts, 1) };
}

/** Whether a ring spans the whole circle (line 1034). */
const isRing = (r: AtRing): boolean => r.span >= Math.PI - EDGE_NUDGE;

/**
 * What a live sonar mode lights up of the bottom, in words (`atFootTxt`, lines
 * 1030 to 1035): from and to where ahead for the forward mode, a ring or a band
 * of bearings for the others.
 */
export function atFootTxt(
  f: Formatter,
  b: Pick<Beam, "kf" | "maxr" | "kind" | "mode">,
  a: Ranges,
  g: AtGeometry,
): string {
  const tag = rtag(f, a, b);
  const none = `${tag}${NO_REACH}`;
  if (!g.foot) return none;
  if (b.mode === "F") {
    if (!g.fx || !g.yr) return none;
    const [f0, f1] = g.fx;
    const wmax = g.yr[1] - g.yr[0];
    return `${tag}bottom from ${f0 < 0 ? `${f.fmt(-f0)} m behind` : `${f.fmt(f0)} m ahead`} to ${f.fmt(f1)} m ahead, up to ${f.fmt(wmax)} m wide`;
  }
  const r = g.ring;
  if (!r) return none;
  const deg2 = f.num((2 * r.span * 180) / Math.PI, 0);
  const all = isRing(r);
  return `${tag}${all ? "a ring of bottom all around, " : `a band of bottom across ${deg2}°, `}${f.fmt(r.h1)} to ${f.fmt(r.h2)} m out${all ? "" : " (horizontally)"}`;
}

/**
 * What the compared views read of a section's input (the `ViewInput` of
 * docs/SPEC.md 3.2, which has these six under the same names): of `settings`
 * the depth, the ranges, the angles and the mounts of every sonar; `eq`; of
 * `ui` the ticks `behind`; of `names` the brand's names; of `local` the field
 * `ssalign`; and `fmt`.
 */
export interface BeamsInput {
  readonly settings: Settings;
  readonly eq: Equipment;
  readonly ui: Pick<UiState, "behind">;
  readonly names: BeamNames;
  readonly local: SectionLocal;
  readonly fmt: Formatter;
}

/** The value of the field `ssalign`, or undefined where the page has none or it is no text. */
function alignOf(local: SectionLocal): string | undefined {
  const value = local[FIELD_ALIGN];
  return typeof value === "string" ? value : undefined;
}

/** One shape in the footprints picture and its result row. */
interface Shape {
  readonly b: Beam;
  /** The beam does not reach the bottom: nothing is drawn. */
  readonly none?: boolean;
  /** Parts of the outline, for a side fan or a live sonar mode. */
  readonly multi?: readonly Polygon[];
  /** The order a live sonar mode is drawn in, widest first. */
  readonly big?: number;
  /** The radius of a circle, in metres. */
  readonly r?: number;
  /** The outline of a fan. */
  readonly pts?: Polygon;
  readonly txt: string;
}

/** The message of the error the earlier page throws where a shape that is no circle has no outline (line 1143). */
const NO_OUTLINE = "Cannot read properties of undefined (reading 'map')";

/** How wide the footprints picture is drawn, in the units of its drawing. */
const FP = { half: 158, centre: 170 } as const;

/**
 * The beams' footprints on the bottom, seen from above (`drawFootprint`, lines
 * 1100 to 1153): `fp-svg`, the picture, and `fp-res`, a result row for each
 * beam. Of `settings` it reads the depth, the ranges, the angles and mounts;
 * of `ui` the beams that are ticked. A 2D cone whose greatest depth is the
 * depth itself has a circle of radius 0, which the earlier lines then draw as
 * an outline it does not have: they throw a TypeError, and so does this.
 */
export function footprintView(input: BeamsInput): SectionView {
  const { settings: a, eq, ui, names, fmt: f } = input;
  const align = alignOf(input.local);
  const d = a.dep;
  const shapes: Shape[] = [];
  let ext = 0.5;
  for (const b of cmpList(a, names, eq, ui.behind)) {
    if (b.kf) {
      const sa = ssAngles(b.kf, a.sso, a.swmax, align);
      const R = ssRange(a, b.maxr);
      const t = a.sst * b.kf;
      const xIn = d / Math.tan(sa.aIn);
      const reach = R > d ? Math.sqrt(R * R - d * d) : Number.NaN;
      const xO = Math.min(reach, sa.aOut > 0 ? d / Math.tan(sa.aOut) : Number.POSITIVE_INFINITY);
      if (Number.isNaN(xO) || !(xO > xIn)) {
        shapes.push({ b, none: true, txt: `${rtag(f, a, b)}${NO_REACH}` });
        continue;
      }
      const polys = [-1, 1].map((sd) => {
        const up: Point[] = [];
        const dn: Point[] = [];
        for (let k = 0; k <= 30; k++) {
          const x = xIn + ((xO - xIn) * k) / 30;
          const L = Math.hypot(x, d) * Math.tan(rad(t / 2));
          up.push([sd * x, L]);
          dn.unshift([sd * x, -L]);
        }
        return up.concat(dn);
      });
      const Lo = Math.hypot(xO, d) * Math.tan(rad(t / 2));
      shapes.push({
        b,
        multi: polys,
        txt: `${rtag(f, a, b)}${ssCover(f, xIn, xO)}; up to ${f.fmt(2 * Lo)} m long front to back`,
      });
      ext = Math.max(ext, xO, Lo);
    } else if (b.mode) {
      const gf = atGeo(b, a);
      if (!gf.foot) {
        shapes.push({ b, none: true, txt: atFootTxt(f, b, a, gf) });
        continue;
      }
      shapes.push({
        b,
        multi: gf.foot.map((pl) => pl.map((q): Point => [q[1], q[0]])),
        big: b.mode === "F" ? 1500 : 1800,
        txt: atFootTxt(f, b, a, gf),
      });
      for (const q of gf.foot[0] ?? []) ext = Math.max(ext, Math.abs(q[0]), Math.abs(q[1]));
    } else if (b.kind === "cone") {
      const Rc = bRange(a, b);
      if (Rc < d) {
        shapes.push({ b, none: true, txt: `${rtag(f, a, b)}${NO_REACH}` });
        continue;
      }
      const r = Math.min(d * Math.tan(rad((b.ang ?? Number.NaN) / 2)), Math.sqrt(Rc * Rc - d * d));
      shapes.push({ b, r, txt: `${rtag(f, a, b)}${f.fmt(2 * r)} m circle` });
      ext = Math.max(ext, r);
    } else {
      const Rf = bRange(a, b);
      if (Rf < d) {
        shapes.push({ b, none: true, txt: `${rtag(f, a, b)}${NO_REACH}` });
        continue;
      }
      const angF = Math.min(
        b.ang ?? Number.NaN,
        2 * deg(Math.atan(Math.sqrt(Rf * Rf - d * d) / d)),
      );
      const fp = fanPoly(d, angF, b.th ?? Number.NaN);
      const pts: Polygon = b.rot ? fp.pts.map((p): Point => [p[1], p[0]]) : fp.pts;
      const size = b.rot
        ? `${f.fmt(2 * fp.X)} m long (front to back) × ${f.fmt(2 * fp.Lc)}–${f.fmt(2 * fp.Le)} m wide`
        : `${f.fmt(2 * fp.X)} m wide × ${f.fmt(2 * fp.Lc)}–${f.fmt(2 * fp.Le)} m long`;
      shapes.push({ b, pts, txt: `${rtag(f, a, b)}${size}` });
      ext = Math.max(ext, fp.X, fp.Le);
    }
  }
  const S = FP.half / ext;
  const C = FP.centre;
  let g = "";
  g +=
    '<rect x="4" y="4" width="332" height="332" rx="8" fill="var(--water)" fill-opacity="0.07"/>';
  const step = ext <= 3 ? 1 : ext <= 8 ? 2 : ext <= 20 ? 5 : ext <= 40 ? 10 : 20;
  for (let m = step; m <= ext * 1.1; m += step) {
    // The earlier lines place the label at 0.707 of the radius along the diagonal, which is not Math.SQRT1_2.
    // biome-ignore lint/suspicious/noApproximativeNumericConstant: the page's own figure, kept bit for bit
    const along = m * S * 0.707;
    g += `<circle cx="${C}" cy="${C}" r="${m * S}" fill="none" stroke="var(--line)" stroke-width="0.6" stroke-dasharray="2 4"/><text x="${C + along + 3}" y="${C - along - 3}" font-family="var(--font-data)" font-size="10" fill="var(--muted)">${m} m</text>`;
  }
  const size = (sh: Shape): number => (sh.r ? sh.r : sh.big ? sh.big : sh.multi ? 2e3 : 1e3);
  for (const sh of shapes.slice().sort((x, y) => size(y) - size(x))) {
    if (sh.none) continue;
    const sty = ` fill="${sh.b.col}" fill-opacity="0.16" stroke="${sh.b.col}" stroke-width="2"${sh.b.dash ? ` stroke-dasharray="${sh.b.dash}"` : ""}`;
    const poly = (pts: Polygon | undefined): string => {
      if (!pts) throw new TypeError(NO_OUTLINE);
      return `<polygon points="${pts.map((p) => `${(C + p[0] * S).toFixed(1)},${(C - p[1] * S).toFixed(1)}`).join(" ")}"${sty}/>`;
    };
    if (sh.r) g += `<circle cx="${C}" cy="${C}" r="${(sh.r * S).toFixed(1)}"${sty}/>`;
    else if (sh.multi) for (const p of sh.multi) g += poly(p);
    else g += poly(sh.pts);
  }
  g += `<path d="M ${C} ${C - 9} L ${C + 4} ${C - 1} L ${C + 4} ${C + 8} L ${C - 4} ${C + 8} L ${C - 4} ${C - 1} Z" fill="var(--fg)"/>`;
  g += `<text x="12" y="18" font-size="11" fill="var(--muted)">↑ heading</text><text x="10" y="${C - 6}" font-size="11" fill="var(--muted)">port</text><text x="330" y="${C - 6}" text-anchor="end" font-size="11" fill="var(--muted)">starboard</text>`;
  const sb = [1, 2, 5, 10, 20, 50, 100].filter((v) => v * S <= 110).pop() || 1;
  g += `<line x1="12" x2="${12 + sb * S}" y1="322" y2="322" stroke="var(--fg)" stroke-width="2"/><line x1="12" x2="12" y1="317" y2="327" stroke="var(--fg)" stroke-width="2"/><line x1="${12 + sb * S}" x2="${12 + sb * S}" y1="317" y2="327" stroke="var(--fg)" stroke-width="2"/>`;
  g += `<text x="12" y="312" font-family="var(--font-data)" font-size="10" fill="var(--fg)">${sb} m</text>`;
  g += `<text x="330" y="330" text-anchor="end" font-family="var(--font-data)" font-size="10" fill="var(--muted)">${f.fmt(d)} m deep</text>`;
  return {
    "fp-svg": { html: g },
    "fp-res": { html: shapes.length ? dl(shapes.map((sh) => [sh.b.name, sh.txt])) : NO_BEAMS },
  };
}

/** What the rays of a beam read of Settings. */
type RaySettings = Pick<Settings, "dep" | "sso" | "swmax" | "sst" | "ssr" | "atr">;

/** One ray of a beam seen from the side: where it ends, and whether that is on the bottom. */
export interface BeamRay {
  /** The end of the ray: ahead, to starboard, down. */
  readonly p: Point3;
  /** The ray meets the bottom before it runs out of range. */
  readonly bottom: boolean;
}

/** The number of steps a side fan's angle, and a fan's width, are divided into (line 1162). */
const RAY_STEPS = 16;

/** The number of rays round a cone (line 1168). */
const CONE_RAYS = 36;

/** How far past the angle where a fan's edge meets the bottom the outer pair of extra angles lies (line 1173). */
const EDGE_OUTSIDE = 1e-6;

/**
 * The rays that outline a beam that is no live sonar mode (`beamRays`, lines
 * 1161 to 1177): a side fan as its two edges across its thickness, a cone
 * round its rim and its axis, any other fan as its corners and the angles
 * where its edge meets the bottom. A ray is cut at the bottom or at the
 * range. `align` is the value of the field `ssalign`.
 */
export function beamRays(b: Beam, a: RaySettings, align: string | undefined): BeamRay[] {
  const H = a.dep;
  const dirs: Point3[] = [];
  let R: number;
  if (b.kf) {
    const sa = ssAngles(b.kf, a.sso, a.swmax, align);
    const T = rad((a.sst * b.kf) / 2);
    R = ssRange(a, b.maxr);
    for (const sd of [-1, 1]) {
      for (let k = 0; k <= RAY_STEPS; k++) {
        const e = sa.aOut + ((sa.aIn - sa.aOut) * k) / RAY_STEPS;
        for (const p of [-T, T]) {
          dirs.push([Math.sin(p), sd * Math.cos(p) * Math.cos(e), Math.cos(p) * Math.sin(e)]);
        }
      }
    }
  } else if (b.kind === "cone") {
    const h = rad((b.ang ?? Number.NaN) / 2);
    R = bRange(a, b);
    for (let k = 0; k < CONE_RAYS; k++) {
      const ph = (2 * Math.PI * k) / CONE_RAYS;
      dirs.push([Math.sin(h) * Math.cos(ph), Math.sin(h) * Math.sin(ph), Math.cos(h)]);
    }
    dirs.push([0, 0, 1]);
  } else {
    const A = rad((b.ang ?? Number.NaN) / 2);
    const Tt = rad((b.th ?? Number.NaN) / 2);
    R = bRange(a, b);
    const als: number[] = [];
    for (let k = 0; k <= RAY_STEPS; k++) als.push(-A + (2 * A * k) / RAY_STEPS);
    if (R > H) {
      const ac = Math.acos(H / R);
      if (ac < A) {
        als.push(ac - EDGE_NUDGE, -ac + EDGE_NUDGE, ac + EDGE_OUTSIDE, -ac - EDGE_OUTSIDE);
      }
    }
    for (const al of als) {
      for (const p of [-Tt, Tt]) {
        const v: Point3 = [Math.sin(p), Math.cos(p) * Math.sin(al), Math.cos(p) * Math.cos(al)];
        dirs.push(b.rot ? [v[1], v[0], v[2]] : v);
      }
    }
  }
  return dirs.map((dv) => {
    const L = dv[2] > MIN_DOWN ? Math.min(R, H / dv[2]) : R;
    return { p: [dv[0] * L, dv[1] * L, dv[2] * L], bottom: dv[2] > MIN_DOWN && H / dv[2] <= R };
  });
}

/** One beam in the view from behind: its outlines, and the stretches of bottom it lands on. */
interface BehindItem {
  readonly b: Beam;
  readonly polys: readonly (readonly Point[])[];
  /** The stretches of bottom, each from its least to its greatest distance to starboard. */
  readonly foot: readonly Extent[];
}

/**
 * The width a beam has when the view from behind is ordered, widest first
 * (line 1039): a live sonar mode by its mode, a side fan by its share of the
 * widest, and any other beam by the angle it has across the boat.
 */
function behindWidth(b: Beam): number {
  if (b.mode) return 800 + (b.mode === "W" ? 2 : b.mode === "S" ? 1 : 0);
  if (b.kf) return 900 + b.kf;
  return (b.rot ? b.th : b.ang) ?? Number.NaN;
}

/**
 * The beams seen from behind (`drawBehind`, lines 1036 to 1083): `ssb-all`,
 * the outline of each beam in the vertical plane across the boat, and
 * `allb-res`, a result row for each beam. The widest beam is drawn first, and
 * a beam that is no side fan or live mode has its angle in its name.
 */
export function behindView(input: BeamsInput): SectionView {
  const { settings: a, eq, ui, names, fmt: f } = input;
  const align = alignOf(input.local);
  const H = a.dep;
  const items: BehindItem[] = [];
  const rows: [string, string][] = [];
  const list = cmpList(a, names, eq, ui.behind);
  list.sort((x, y) => behindWidth(y) - behindWidth(x));
  for (const b of list) {
    const polys: Point[][] = [];
    const foot: Extent[] = [];
    if (b.kf) {
      const R = ssRange(a, b.maxr);
      const sa = ssAngles(b.kf, a.sso, a.swmax, align);
      const p1 = Math.PI / 2 - sa.aIn;
      const p2 = Math.PI / 2 - sa.aOut;
      polys.push(sectorPoly(-p2, -p1, R, H), sectorPoly(p1, p2, R, H));
      const xIn = H / Math.tan(sa.aIn);
      const reach = R > H ? Math.sqrt(R * R - H * H) : Number.NaN;
      const xO = Math.min(reach, sa.aOut > 0 ? H / Math.tan(sa.aOut) : Number.POSITIVE_INFINITY);
      if (!Number.isNaN(xO) && xO > xIn) {
        foot.push([-xO, -xIn], [xIn, xO]);
        rows.push([b.name, `${rtag(f, a, b)}${ssCover(f, xIn, xO)}`]);
      } else rows.push([b.name, `${rtag(f, a, b)}${NO_REACH}`]);
    } else if (b.mode) {
      const gb = atGeo(b, a);
      polys.push(hull([[0, 0] as Point].concat(gb.rays.map((r): Point => [r.p[1], r.p[2]]))));
      const yr = gb.foot ? gb.yr : null;
      if (yr) {
        foot.push(yr);
        rows.push([
          b.name,
          `${rtag(f, a, b)}${f.fmt(yr[1] - yr[0])} m wide on the bottom, side to side`,
        ]);
      } else rows.push([b.name, `${rtag(f, a, b)}${NO_REACH}`]);
    } else {
      const ang = (b.rot ? b.th : b.ang) ?? Number.NaN;
      const Rb = bRange(a, b);
      const hf = rad(ang / 2);
      polys.push(sectorPoly(-hf, hf, Rb, H));
      if (Rb >= H) {
        const xw = Math.min(H * Math.tan(hf), Math.sqrt(Rb * Rb - H * H));
        foot.push([-xw, xw]);
        rows.push([
          `${b.name} (${f.num(ang, 0)}°)`,
          `${rtag(f, a, b)}${f.fmt(2 * xw)} m wide on the bottom`,
        ]);
      } else rows.push([b.name, `${rtag(f, a, b)}${NO_REACH}`]);
    }
    items.push({ b, polys, foot });
  }
  let Xmax = 1;
  let zMax = 0;
  for (const it of items) {
    for (const poly of it.polys) {
      for (const pt of poly) {
        Xmax = Math.max(Xmax, Math.abs(pt[0]));
        zMax = Math.max(zMax, pt[1]);
      }
    }
    for (const fp of it.foot) Xmax = Math.max(Xmax, Math.abs(fp[0]), Math.abs(fp[1]));
  }
  if (!items.length) zMax = H;
  const { top, centre: L } = SIDE;
  const s = Math.min(SIDE.wide / (Xmax * 1.02), SIDE.tall / Math.max(zMax, SIDE_MIN_DEPTH));
  const hB = Math.ceil(top + zMax * s + SIDE.foot);
  const reached = zMax >= H - BOTTOM_TOLERANCE;
  let g = "";
  g += `<line x1="4" x2="336" y1="${top}" y2="${top}" stroke="var(--water)" stroke-width="1.2"/>`;
  if (reached) {
    g += `<rect x="4" y="${top + H * s}" width="332" height="8" fill="var(--ground)" opacity="0.6"/>`;
  }
  for (const it of items) {
    for (const c of it.polys) {
      const outline = c
        .map((pt) => `${(L + pt[0] * s).toFixed(1)},${(top + pt[1] * s).toFixed(1)}`)
        .join(" ");
      g += `<polygon points="${outline}" fill="${it.b.col}" fill-opacity="0.12" stroke="${it.b.col}" stroke-width="1.5"${it.b.dash ? ` stroke-dasharray="${it.b.dash}"` : ""}/>`;
    }
    for (const fp of it.foot) {
      g += `<line x1="${L + fp[0] * s}" x2="${L + fp[1] * s}" y1="${top + H * s + 2}" y2="${top + H * s + 2}" stroke="${it.b.col}" stroke-width="3"/>`;
    }
  }
  if (reached) {
    g += `<line x1="4" x2="336" y1="${top + H * s}" y2="${top + H * s}" stroke="var(--muted)" stroke-width="1.2"/>`;
  }
  g += `<circle cx="${L}" cy="${top}" r="4" fill="var(--fg)"/>`;
  g +=
    '<text x="8" y="12" font-size="11" fill="var(--muted)">port</text><text x="332" y="12" text-anchor="end" font-size="11" fill="var(--muted)">starboard</text>';
  g += `<text x="332" y="${hB - 4}" text-anchor="end" font-family="var(--font-data)" font-size="11" fill="var(--muted)">${f.fmt(H)} m deep</text>`;
  return {
    "ssb-all": { attrs: { viewBox: `0 0 340 ${hB}` }, html: g },
    "allb-res": { html: rows.length ? dl(rows) : NO_BEAMS },
  };
}

/** One beam in the side view: its outline, and where on the bottom it lands. */
interface SideItem {
  readonly b: Beam;
  readonly poly: readonly Point[];
  /** The distances ahead of the points that lie on the bottom. */
  readonly bx: readonly number[];
}

/** How the side view's picture is laid out, in the units of its drawing (line 1208). */
const SIDE = { top: 18, centre: 170, wide: 160, tall: 220, foot: 24 } as const;

/** The least height of the part of the picture that is drawn below the surface, in metres (line 1208). */
const SIDE_MIN_DEPTH = 0.1;

/** How near the greatest depth of the outlines must be to the bottom for the bottom to be drawn (line 1208). */
const BOTTOM_TOLERANCE = 1e-6;

/** The distance of a point of the bottom ahead of the transducer, to within which it is said to be level with it (line 1186). */
const LEVEL_WITH = 0.05;

/**
 * The width a beam has when the side view is ordered, widest first (line
 * 1180): a live sonar mode by its mode, a side fan by its share of the widest,
 * and any other beam by its angle.
 */
function sideWidth(b: Beam): number {
  if (b.mode) return 800 + (b.mode === "W" ? 2 : b.mode === "S" ? 1 : 0);
  if (b.kf) return 900 + b.kf;
  return (b.rot || b.kind === "cone" ? b.ang : b.th) ?? Number.NaN;
}

/**
 * How far ahead the part of the bottom a beam that is no live mode reaches lies
 * at most (lines 1192 to 1202), or NaN where it does not reach the bottom.
 */
function sideLength(b: Beam, a: RaySettings, align: string | undefined): number {
  const H = a.dep;
  if (b.kf) {
    const sa = ssAngles(b.kf, a.sso, a.swmax, align);
    const range = ssRange(a, b.maxr);
    const rch = range > H ? Math.sqrt(range ** 2 - H * H) : Number.NaN;
    const xO = Math.min(rch, sa.aOut > 0 ? H / Math.tan(sa.aOut) : Number.POSITIVE_INFINITY);
    const xI = H / Math.tan(sa.aIn);
    return !Number.isNaN(xO) && xO > xI
      ? 2 * Math.hypot(xO, H) * Math.tan(rad((a.sst * b.kf) / 2))
      : Number.NaN;
  }
  const Rr = bRange(a, b);
  if (Rr < H) return Number.NaN;
  const reachX = Math.sqrt(Rr * Rr - H * H);
  const ang = b.ang ?? Number.NaN;
  if (b.kind === "cone") return 2 * Math.min(H * Math.tan(rad(ang / 2)), reachX);
  const Xe = Math.min(H * Math.tan(rad(ang / 2)), reachX);
  return b.rot ? 2 * Xe : 2 * Math.hypot(H, Xe) * Math.tan(rad((b.th ?? Number.NaN) / 2));
}

/**
 * The beams seen from the side (`drawSide`, lines 1178 to 1221): `side-svg`,
 * the outline of each beam in the vertical plane along the boat, and
 * `side-res`, a result row for each beam. The widest beam is drawn first. Its
 * `viewBox` is as high as the deepest outline, which the picture's element
 * takes as an attribute.
 */
export function sideView(input: BeamsInput): SectionView {
  const { settings: a, eq, ui, names, fmt: f } = input;
  const align = alignOf(input.local);
  const H = a.dep;
  const items: SideItem[] = [];
  const rows: [string, string][] = [];
  const list = cmpList(a, names, eq, ui.behind);
  list.sort((x, y) => sideWidth(y) - sideWidth(x));
  for (const b of list) {
    if (b.mode) {
      const gs = atGeo(b, a);
      const xr = gs.foot ? gs.xr : null;
      items.push({
        b,
        poly: hull([[0, 0] as Point].concat(gs.rays.map((r): Point => [r.p[0], r.p[2]]))),
        bx: xr ?? [],
      });
      const reach = xr
        ? `${f.fmt(xr[1] - xr[0])} m front to back on the bottom, from ${Math.abs(xr[0]) < LEVEL_WITH ? "level with the transducer" : xr[0] < 0 ? `${f.fmt(-xr[0])} m behind` : `${f.fmt(xr[0])} m ahead`} to ${f.fmt(xr[1])} m ahead`
        : NO_REACH;
      rows.push([b.name, `${rtag(f, a, b)}${reach}`]);
      continue;
    }
    const rays = beamRays(b, a, align);
    const bx = rays.filter((r) => r.bottom).map((r) => r.p[0]);
    items.push({
      b,
      poly: hull([[0, 0] as Point].concat(rays.map((r): Point => [r.p[0], r.p[2]]))),
      bx,
    });
    const len = sideLength(b, a, align);
    rows.push([
      b.name,
      `${rtag(f, a, b)}${Number.isFinite(len) ? `up to ${f.fmt(len)} m front to back on the bottom` : NO_REACH}`,
    ]);
  }
  let Xmax = 1;
  let zMax = 0;
  for (const it of items) {
    for (const p of it.poly) {
      Xmax = Math.max(Xmax, Math.abs(p[0]));
      zMax = Math.max(zMax, p[1]);
    }
  }
  if (!items.length) zMax = H;
  const { top, centre: L } = SIDE;
  const s = Math.min(SIDE.wide / (Xmax * 1.02), SIDE.tall / Math.max(zMax, SIDE_MIN_DEPTH));
  const hB = Math.ceil(top + zMax * s + SIDE.foot);
  const reached = zMax >= H - BOTTOM_TOLERANCE;
  let g = "";
  g += `<line x1="4" x2="336" y1="${top}" y2="${top}" stroke="var(--water)" stroke-width="1.2"/>`;
  if (reached) {
    g += `<rect x="4" y="${top + H * s}" width="332" height="8" fill="var(--ground)" opacity="0.6"/>`;
  }
  for (const it of items) {
    const outline = it.poly
      .map((p) => `${(L + p[0] * s).toFixed(1)},${(top + p[1] * s).toFixed(1)}`)
      .join(" ");
    g += `<polygon points="${outline}" fill="${it.b.col}" fill-opacity="0.12" stroke="${it.b.col}" stroke-width="1.5"${it.b.dash ? ` stroke-dasharray="${it.b.dash}"` : ""}/>`;
    if (it.bx.length) {
      g += `<line x1="${L + Math.min(...it.bx) * s}" x2="${L + Math.max(...it.bx) * s}" y1="${top + H * s + 2}" y2="${top + H * s + 2}" stroke="${it.b.col}" stroke-width="3"/>`;
    }
  }
  if (reached) {
    g += `<line x1="4" x2="336" y1="${top + H * s}" y2="${top + H * s}" stroke="var(--muted)" stroke-width="1.2"/>`;
  }
  g += `<circle cx="${L}" cy="${top}" r="4" fill="var(--fg)"/>`;
  g +=
    '<text x="8" y="12" font-size="11" fill="var(--muted)">← stern</text><text x="332" y="12" text-anchor="end" font-size="11" fill="var(--muted)">bow →</text>';
  g += `<text x="332" y="${hB - 4}" text-anchor="end" font-family="var(--font-data)" font-size="11" fill="var(--muted)">${f.fmt(H)} m deep</text>`;
  return {
    "side-svg": { attrs: { viewBox: `0 0 340 ${hB}` }, html: g },
    "side-res": { html: rows.length ? dl(rows) : NO_BEAMS },
  };
}

/** What the 3D scene reads of the page: the beams' input, and the style that colours them. */
export interface SceneInput extends BeamsInput {
  readonly theme: Theme;
}

/** What the 3D view is drawn from: the state of the view, the style and the formatter. */
export interface ScenePaintInput {
  readonly scene3d: Scene3dState;
  readonly theme: Theme;
  readonly fmt: Formatter;
}

/** The transducer, where every sheet of a beam starts. */
const ORIGIN: Point3 = [0, 0, 0];

/** The share of the depth that the scene reaches to the side at least, and the least reach, in metres (line 1227). */
const SCENE_REACH = { ofDepth: 0.6, least: 3, margin: 1.1 } as const;

/** The steps a side fan's sheet, a fan's sheet and a side fan's footprint are divided into (lines 1242 and 1264). */
const SHEET_STEPS = 24;
const FOOT_STEPS = 16;

/** The number of points round a cone's rim and a cone's footprint (lines 1270 and 1272). */
const RIM_POINTS = 36;

/** The opacity of a sheet and of a footprint, and the widths of their outlines (lines 1231 to 1236). */
const SHEET = { opacity: 0.16, width: 1.4 } as const;
const FOOTPRINT = { opacity: 0.55, width: 2 } as const;

/** What a colour of the beams is when it names a custom property: the value the page's style gives it (`colOf`, line 1224). */
function colOf(col: string, theme: Theme): string {
  const m = /--[\w-]+/.exec(col);
  return m ? (theme.colours[m[0]] ?? "") : col;
}

/** The triangles that fill a polygon from its first corner. */
export function fanTriangles(pts: readonly Point3[]): [Point3, Point3, Point3][] {
  const out: [Point3, Point3, Point3][] = [];
  const first = pts[0];
  if (first === undefined) return out;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    const q = pts[i + 1];
    if (p !== undefined && q !== undefined) out.push([first, p, q]);
  }
  return out;
}

/**
 * The triangles that fill a footprint on the bottom, exactly: a polygon that bends inward, such
 * as the hourglass of a live sonar's fan, is cut into ears, so that no triangle lies outside its
 * outline; a polygon that does not bend inward is filled from its first corner, as `fanTriangles`
 * does. The corners are read in the plane of the bottom (x and y).
 */
function fillTriangles(pts: readonly Point3[]): [Point3, Point3, Point3][] {
  const n = pts.length;
  if (n < 3) return [];
  const at = (i: number): Point3 => pts[i] as Point3;
  const cross = (a: Point3, b: Point3, c: Point3): number =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  let twice = 0;
  for (let i = 0; i < n; i++) {
    const a = at(i);
    const b = at((i + 1) % n);
    twice += a[0] * b[1] - b[0] * a[1];
  }
  // Corners in counter-clockwise order, so that a corner that bends outward has a positive cross.
  const order = Array.from({ length: n }, (_, i) => (twice >= 0 ? i : n - 1 - i));
  let bends = false;
  for (let i = 0; i < n; i++) {
    const c = cross(
      at(order[i] as number),
      at(order[(i + 1) % n] as number),
      at(order[(i + 2) % n] as number),
    );
    if (c < 0) bends = true;
  }
  if (!bends) return fanTriangles(pts);
  const out: [Point3, Point3, Point3][] = [];
  const rest = [...order];
  const insideTri = (p: Point3, a: Point3, b: Point3, c: Point3): boolean =>
    cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0;
  while (rest.length > 3) {
    let cut = -1;
    for (let k = 0; k < rest.length && cut < 0; k++) {
      const a = at(rest[(k + rest.length - 1) % rest.length] as number);
      const b = at(rest[k] as number);
      const c = at(rest[(k + 1) % rest.length] as number);
      if (cross(a, b, c) <= 0) continue;
      const free = rest.every((j) => {
        const q = at(j);
        return q === a || q === b || q === c || !insideTri(q, a, b, c);
      });
      if (free) cut = k;
    }
    if (cut < 0) {
      // Corners in a straight line, or an outline that crosses itself: drop a flat corner, or fill what is left from its first corner.
      const flat = rest.findIndex(
        (_, k) =>
          cross(
            at(rest[(k + rest.length - 1) % rest.length] as number),
            at(rest[k] as number),
            at(rest[(k + 1) % rest.length] as number),
          ) === 0,
      );
      if (flat < 0) {
        out.push(...fanTriangles(rest.map(at)));
        return out;
      }
      rest.splice(flat, 1);
      continue;
    }
    out.push([
      at(rest[(cut + rest.length - 1) % rest.length] as number),
      at(rest[cut] as number),
      at(rest[(cut + 1) % rest.length] as number),
    ]);
    rest.splice(cut, 1);
  }
  if (rest.length === 3)
    out.push([at(rest[0] as number), at(rest[1] as number), at(rest[2] as number)]);
  return out;
}

/** A polygon's outline, back to its first corner. */
function closed(pts: readonly Point3[]): Point3[] {
  const first = pts[0];
  return first === undefined ? [...pts] : [...pts, first];
}

/**
 * The beams as the 3D view draws them (`build3D`, lines 1226 to 1286): for each
 * beam that is ticked and belongs to a sonar the boat has, the triangles and
 * the outline of its sheets (the side fans' two sheets, a cone, a fan, the
 * live sonar's slice) and of its footprint on the bottom, in metres. `ext` is
 * how far to each side the scene reaches, rounded up. Reads the style for the
 * colour of each beam. `fill` cuts a footprint into the triangles that fill it: the exact fill by
 * default, `fanTriangles` for the earlier page's fill, which the tests that compare with the
 * recording of that page ask for.
 */
export function buildScene(
  input: SceneInput,
  fill: (pts: readonly Point3[]) => [Point3, Point3, Point3][] = fillTriangles,
): Scene3d {
  const { settings: a, eq, ui, names, theme } = input;
  const align = alignOf(input.local);
  const H = a.dep;
  const tris: Triangle3[] = [];
  const lines: Line3[] = [];
  let ext = Math.max(H * SCENE_REACH.ofDepth, SCENE_REACH.least);
  const reach = (pts: readonly Point3[]): void => {
    for (const q of pts) ext = Math.max(ext, Math.abs(q[0]), Math.abs(q[1]));
  };
  const add = (
    col: string,
    dash: string,
    sheets: readonly (readonly Point3[])[],
    foots: readonly (readonly Point3[])[],
  ): void => {
    const c = colOf(col, theme);
    for (const sh of sheets) {
      for (const p of fanTriangles(sh)) tris.push({ p, f: rgba(c, SHEET.opacity) });
      lines.push({ p: closed(sh), c, w: SHEET.width, d: dash });
    }
    for (const ft of foots) {
      for (const p of fill(ft)) {
        tris.push({ p, f: rgba(c, FOOTPRINT.opacity), foot: true });
      }
      lines.push({ p: closed(ft), c, w: FOOTPRINT.width, d: "" });
      reach(ft);
    }
    for (const sh of sheets) reach(sh);
  };
  for (const b of cmpList(a, names, eq, ui.behind)) {
    const R = bRange(a, b);
    const sheets: Point3[][] = [];
    const foots: Point3[][] = [];
    if (b.mode) {
      const g3 = atGeo(b, a);
      const cen: Point3[] = [ORIGIN, ...g3.rays.filter((r) => r.c).map((r) => r.p)];
      add(b.col, b.dash, [cen], []);
      if (g3.foot) {
        const c3 = colOf(b.col, theme);
        const fl: Point3[] = (g3.foot[0] ?? []).map((q): Point3 => [q[0], q[1], H]);
        const rg = g3.ring;
        if (rg) {
          for (let k = 0; k < rg.azs.length - 1; k++) {
            const z0 = rg.azs[k] ?? Number.NaN;
            const z1 = rg.azs[k + 1] ?? Number.NaN;
            const q: Point3[] = [
              [rg.h1 * Math.cos(z0), rg.h1 * Math.sin(z0), H],
              [rg.h2 * Math.cos(z0), rg.h2 * Math.sin(z0), H],
              [rg.h2 * Math.cos(z1), rg.h2 * Math.sin(z1), H],
              [rg.h1 * Math.cos(z1), rg.h1 * Math.sin(z1), H],
            ];
            const [q0, q1, q2, q3] = q;
            if (q0 && q1 && q2 && q3) {
              const f = rgba(c3, FOOTPRINT.opacity);
              tris.push({ p: [q0, q1, q2], f, foot: true }, { p: [q0, q2, q3], f, foot: true });
            }
          }
        } else {
          for (const p of fill(fl)) {
            tris.push({ p, f: rgba(c3, FOOTPRINT.opacity), foot: true });
          }
        }
        lines.push({ p: closed(fl), c: c3, w: FOOTPRINT.width, d: "" });
        reach(fl);
      }
      continue;
    }
    if (b.kf) {
      const sa = ssAngles(b.kf, a.sso, a.swmax, align);
      const t = a.sst * b.kf;
      for (const sd of [-1, 1]) {
        const sh: Point3[] = [ORIGIN];
        for (let k = 0; k <= SHEET_STEPS; k++) {
          const e = sa.aOut + ((sa.aIn - sa.aOut) * k) / SHEET_STEPS;
          const L = Math.sin(e) > MIN_DOWN ? Math.min(R, H / Math.sin(e)) : R;
          sh.push([0, sd * Math.cos(e) * L, Math.sin(e) * L]);
        }
        sheets.push(sh);
        const xIn = H / Math.tan(sa.aIn);
        const reachX = R > H ? Math.sqrt(R * R - H * H) : Number.NaN;
        const xO = Math.min(reachX, sa.aOut > 0 ? H / Math.tan(sa.aOut) : Number.POSITIVE_INFINITY);
        if (!Number.isNaN(xO) && xO > xIn) {
          const up: Point3[] = [];
          const dn: Point3[] = [];
          for (let k = 0; k <= FOOT_STEPS; k++) {
            const x = xIn + ((xO - xIn) * k) / FOOT_STEPS;
            const Lf = Math.hypot(x, H) * Math.tan(rad(t / 2));
            up.push([Lf, sd * x, H]);
            dn.unshift([-Lf, sd * x, H]);
          }
          foots.push(up.concat(dn));
        }
      }
    } else if (b.kind === "cone") {
      const hh = rad((b.ang ?? Number.NaN) / 2);
      const rim = (k: number): Point3 => {
        const ph = (2 * Math.PI * k) / RIM_POINTS;
        const dv: Point3 = [Math.sin(hh) * Math.cos(ph), Math.sin(hh) * Math.sin(ph), Math.cos(hh)];
        const L2 = Math.min(R, H / dv[2]);
        return [dv[0] * L2, dv[1] * L2, dv[2] * L2];
      };
      for (let k = 0; k < RIM_POINTS; k++) sheets.push([ORIGIN, rim(k), rim((k + 1) % RIM_POINTS)]);
      if (R >= H) {
        const rr = Math.min(H * Math.tan(hh), Math.sqrt(R * R - H * H));
        const circ: Point3[] = [];
        for (let k = 0; k < RIM_POINTS; k++) {
          circ.push([
            rr * Math.cos((2 * Math.PI * k) / RIM_POINTS),
            rr * Math.sin((2 * Math.PI * k) / RIM_POINTS),
            H,
          ]);
        }
        foots.push(circ);
      }
    } else {
      const ang = b.ang ?? Number.NaN;
      const A = rad(ang / 2);
      const sh2: Point3[] = [ORIGIN];
      for (let k = 0; k <= SHEET_STEPS; k++) {
        const al = -A + (2 * A * k) / SHEET_STEPS;
        const L3 = Math.min(R, H / Math.cos(al));
        const p3: Point3 = [0, Math.sin(al) * L3, Math.cos(al) * L3];
        sh2.push(b.rot ? [p3[1], 0, p3[2]] : p3);
      }
      sheets.push(sh2);
      if (R >= H) {
        const angF = Math.min(ang, 2 * deg(Math.atan(Math.sqrt(R * R - H * H) / H)));
        const f = fanPoly(H, angF, b.th ?? Number.NaN);
        foots.push(f.pts.map((q): Point3 => (b.rot ? [q[0], q[1], H] : [q[1], q[0], H])));
      }
    }
    add(b.col, b.dash, sheets, foots);
  }
  ext = Math.ceil(ext * SCENE_REACH.margin);
  return { tris, lines, H, ext };
}

/** The canvas of the 3D view's fonts and sizes, and the limits of its labels (lines 1318 to 1324). */
const LABEL = { size: 22, noteSize: 20, nearX: 90, nearY: 26, note: [12, 14] } as const;

/** The radius of the dot at the transducer, in pixels (line 1318). */
const DOT_RADIUS = 5;

/**
 * Draws the 3D scene at the angle, zoom and stretch of `scene3d` (`render3D`,
 * lines 1287 to 1325): the bottom and its grid, the outline of the surface,
 * the triangles from far to near, the outlines, the boat, and the labels, on a
 * canvas of the size it has. With no scene built yet it draws nothing.
 */
export function paintScene(surface: Surface, scene: Scene3d | null, input: ScenePaintInput): void {
  if (!scene) return;
  const ctx = surface.ctx;
  const W = surface.width;
  const Hc = surface.height;
  const { H, ext } = scene;
  const { yaw, pitch, zoom, zx } = input.scene3d;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const radius = Math.hypot(ext * 1.2, (H * zx) / 2) || 1;
  const sc = (zoom * Math.min(W, Hc) * 0.5) / radius;
  const P = (q: Point3): Point3 => {
    const x = q[0];
    const y = q[1];
    const z = (q[2] - H / 2) * zx;
    const x1 = x * cy - y * sy;
    const y1 = x * sy + y * cy;
    return [W / 2 + y1 * sc, Hc / 2 + (z * cp - x1 * sp) * sc, x1 * cp + z * sp];
  };
  const colour = (name: string): string => input.theme.colours[name] ?? "";
  const fg = colour("--fg");
  const mu = colour("--muted");
  const ln = colour("--line");
  const gr = colour("--ground");
  const wa = colour("--water");
  ctx.clearRect(0, 0, W, Hc);
  const poly = (
    pts: readonly Point3[],
    fill: string | null,
    stroke?: string | null,
    lw?: number,
    dash?: string,
  ): void => {
    ctx.beginPath();
    pts.forEach((q, i) => {
      const v = P(q);
      if (i) ctx.lineTo(v[0], v[1]);
      else ctx.moveTo(v[0], v[1]);
    });
    if (fill) {
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.setLineDash(dash ? dash.split(" ").map(Number) : []);
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lw || 1;
      ctx.stroke();
      ctx.setLineDash([]);
    }
  };
  // bottom plane and grid
  poly(
    [
      [-ext, -ext, H],
      [ext, -ext, H],
      [ext, ext, H],
      [-ext, ext, H],
    ],
    rgba(gr, 0.55),
    mu,
    1,
  );
  const step = ext <= 8 ? 2 : ext <= 20 ? 5 : ext <= 50 ? 10 : 25;
  for (let m = -Math.floor(ext / step) * step; m <= ext; m += step) {
    poly(
      [
        [m, -ext, H],
        [m, ext, H],
      ],
      null,
      ln,
      0.8,
    );
    poly(
      [
        [-ext, m, H],
        [ext, m, H],
      ],
      null,
      ln,
      0.8,
    );
  }
  // surface outline
  poly(
    [
      [-ext, -ext, 0],
      [ext, -ext, 0],
      [ext, ext, 0],
      [-ext, ext, 0],
      [-ext, -ext, 0],
    ],
    null,
    wa,
    1,
    "4 4",
  );
  // triangles, far to near
  const far = scene.tris.map((t) => ({
    t,
    d: (P(t.p[0])[2] + P(t.p[1])[2] + P(t.p[2])[2]) / 3,
  }));
  far.sort((u, v) => v.d - u.d);
  for (const o of far) poly(o.t.p, o.t.f);
  for (const l of scene.lines) poly(l.p, null, l.c, l.w, l.d);
  // boat arrow at surface pointing to the bow (+x)
  const bl = Math.max(ext * 0.12, 1.5);
  poly(
    [
      [bl, 0, 0],
      [-bl * 0.6, bl * 0.45, 0],
      [-bl * 0.35, 0, 0],
      [-bl * 0.6, -bl * 0.45, 0],
    ],
    fg,
    fg,
    1,
  );
  const dot = P([0, 0, 0]);
  ctx.fillStyle = fg;
  ctx.beginPath();
  ctx.arc(dot[0], dot[1], DOT_RADIUS, 0, 7);
  ctx.fill();
  // labels
  ctx.font = `${LABEL.size}px ${colour("--font-body")}`;
  ctx.fillStyle = mu;
  ctx.textAlign = "center";
  const placed: Point3[] = [];
  const lab = (q: Point3, text: string): void => {
    const v = P(q);
    if (
      placed.some((u) => Math.abs(u[0] - v[0]) < LABEL.nearX && Math.abs(u[1] - v[1]) < LABEL.nearY)
    ) {
      return;
    }
    placed.push(v);
    ctx.fillText(text, v[0], v[1]);
  };
  lab([ext * 1.08, 0, 0], "bow");
  lab([0, -ext * 1.1, 0], "port");
  lab([0, ext * 1.1, 0], "starboard");
  lab([ext, ext, H], `${input.fmt.fmt(H)} m deep`);
  ctx.textAlign = "left";
  ctx.font = `${LABEL.noteSize}px ${colour("--font-data")}`;
  ctx.fillText(
    `grid ${step} m${zx > 1 ? ` · depth stretched ×${zx}` : ""}`,
    LABEL.note[0],
    Hc - LABEL.note[1],
  );
}

/** The elements `compareView` writes, by id. */
export const KEYS = [
  "cmp-serr",
  "ssb-all",
  "allb-res",
  "fp-svg",
  "fp-res",
  "side-svg",
  "side-res",
] as const;

/** The canvas `paintScene` draws on, by id. */
export const CANVAS = "b3d";

/** A message in its element, which is hidden when there is none (`showErr`, line 12). */
function shownIn(message: string): ElementPatch {
  return { text: message, hidden: message === "" };
}

/**
 * What stops the section, in words for "Fix the … in Settings." (line 1350), or
 * nothing: the depth first, then the side fans, the 2D angles, the down imaging
 * angles and the live sonar, each only for a sonar the boat has. The speed and
 * the depth of the target are no reason to stop.
 */
function problemOf(a: Settings, eq: Equipment, names: BeamNames): string {
  const E = checkSettings(a, eq);
  if (E.dep) return "depth";
  if (eq.ss && (E.ass || E.ssr)) return `${names.side} settings`;
  if (eq["2d"] && E.a2d) return "2D angles";
  if (eq.ds && E.ads) return `${names.down} angles`;
  if (eq.at && (E.aat || E.atr || E.mnt)) return `${names.live} settings`;
  return "";
}

/**
 * What All beams compared writes (`renderCmp`, lines 1349 to 1354, less what
 * the legend and the 3D view are): the message `cmp-serr`, always, and while
 * nothing stops the section the view from behind, the footprints and the side
 * view. While something stops it nothing else is written, and the elements
 * keep what they had. Throws where `footprintView` throws, which the earlier
 * lines do too, after they have written the view from behind: the earlier page
 * leaves that view written, and this view writes nothing then.
 */
export function compareView(input: BeamsInput): SectionView {
  const bad = problemOf(input.settings, input.eq, input.names);
  if (bad) return { "cmp-serr": shownIn(`Fix the ${bad} in Settings.`) };
  return {
    "cmp-serr": shownIn(""),
    ...behindView(input),
    ...footprintView(input),
    ...sideView(input),
  };
}
