/**
 * The help pictures behind the "?" buttons (docs/SPEC.md 2.2): the earlier
 * page's lines 1569 to 1768. The drawing primitives, the eighteen topics with
 * their title, picture and explanation (`HELP`), the topic of a field
 * (`helpKey`) and what the dialog holds after a click on a button of Settings
 * (`settingHelpView`) or of a figure of the cards (`figureHelpView`). Nothing
 * here finds an element, puts a button in a label or opens a dialog: the
 * buttons (`addQM`, line 1735), the label's text and the dialog are the shell's.
 */
import { rad } from "./format";
import type { DataRow, Formatter, Names, SectionView, Settings } from "./types";

/** The elements the dialog's views write. */
export const KEYS = ["help-h", "help-sub", "help-fig", "help-x", "help-note"] as const;

/** The names of the transducers that titles, pictures and explanations carry. */
export type HelpNames = Pick<Names, "side" | "down" | "flat">;

/** What the views read: the numbers of Settings, the names, the choice of `ssalign` and the formatter. */
export interface HelpInput {
  readonly settings: Settings;
  readonly names: HelpNames;
  /** The value of the field `ssalign`, when the page has it. */
  readonly local: { readonly ssalign?: string | undefined };
  readonly fmt: Formatter;
}

/** A figure of a preset that a picture is drawn with in place of the field's value (`HOV`, line 1599). */
export interface HelpOverride {
  readonly key: string;
  readonly value: number | undefined;
}

/** What a picture reads, in the shapes the earlier lines have them. */
interface Ctx {
  readonly a: Settings;
  readonly names: HelpNames;
  readonly fmt: Formatter;
  /** Whether the narrower side fans are aimed to the inner edge (line 1691). */
  readonly inner: boolean;
  /** `HOV` (line 1599): the figure the picture is drawn with, by topic, as a plain object; none for a field of Settings. */
  readonly hov: Record<string, number | undefined> | null;
}

// ---------------------------------------------------------------------------
// The drawing primitives (lines 1570 to 1598)
// ---------------------------------------------------------------------------

/** The width of every picture. */
const HW = 340;

type Pt = readonly [number, number];

const hsvg = (h: number, g: string): string =>
  `<svg class="fig" viewBox="0 0 ${HW} ${h}" role="img">${g}</svg>`;

function hl(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  col?: string | null,
  w?: number,
  dash?: string,
): string {
  return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${col || "var(--fg)"}" stroke-width="${w || 1.2}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;
}

function ht(
  x: number,
  y: number,
  t: string,
  anc?: string,
  col?: string,
  sz?: number,
  mono?: boolean,
): string {
  return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anc || "start"}" font-size="${sz || 11}"${mono ? ' font-family="var(--font-data)"' : ""} fill="${col || "var(--muted)"}">${t}</text>`;
}

const hpt = (cx: number, cy: number, ang: number, r: number): Pt => [
  cx + r * Math.cos(rad(ang)),
  cy + r * Math.sin(rad(ang)),
];

const points = (list: readonly Pt[]): string =>
  list.map((q) => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(" ");

/** A wedge from (cx, cy) between the screen angles a1 and a2 (degrees, 0 is right, down is positive). */
function hwedge(
  cx: number,
  cy: number,
  a1: number,
  a2: number,
  r: number,
  col: string,
  op?: number,
): string {
  const p: Pt[] = [[cx, cy]];
  for (let k = 0; k <= 30; k += 1) p.push(hpt(cx, cy, a1 + ((a2 - a1) * k) / 30, r));
  return `<polygon points="${points(p)}" fill="${col}" fill-opacity="${op || 0.18}" stroke="${col}" stroke-width="1.3"/>`;
}

function harc(
  cx: number,
  cy: number,
  a1: number,
  a2: number,
  r: number,
  col: string | null,
  lab: string,
  lr?: number,
): string {
  const p: Pt[] = [];
  for (let k = 0; k <= 24; k += 1) p.push(hpt(cx, cy, a1 + ((a2 - a1) * k) / 24, r));
  const m = hpt(cx, cy, (a1 + a2) / 2, lr || r + 14);
  const colour = col || "var(--accent)";
  return `<polyline points="${points(p)}" fill="none" stroke="${colour}" stroke-width="2"/>${lab ? `<text x="${m[0].toFixed(1)}" y="${(m[1] + 4).toFixed(1)}" text-anchor="middle" font-size="12" font-weight="600" fill="${colour}">${lab}</text>` : ""}`;
}

function hdim(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  lab: string,
  col: string | null,
  off?: Pt,
): string {
  const colour = col || "var(--accent)";
  const a = Math.atan2(y2 - y1, x2 - x1);
  const h = 6;
  let g = hl(x1, y1, x2, y2, colour, 1.6);
  const ends: readonly (readonly [number, number, number])[] = [
    [x1, y1, a],
    [x2, y2, a + Math.PI],
  ];
  for (const e of ends) {
    g += `<polygon points="${e[0]},${e[1]} ${e[0] + h * Math.cos(e[2] + 0.4)},${e[1] + h * Math.sin(e[2] + 0.4)} ${e[0] + h * Math.cos(e[2] - 0.4)},${e[1] + h * Math.sin(e[2] - 0.4)}" fill="${colour}"/>`;
  }
  const mx = (x1 + x2) / 2 + (off ? off[0] : 0);
  const my = (y1 + y2) / 2 + (off ? off[1] : 0);
  return `${g}<text x="${mx.toFixed(1)}" y="${my.toFixed(1)}" text-anchor="middle" font-size="12" font-weight="600" fill="${colour}">${lab}</text>`;
}

const hboatBehind = (cx: number, y: number): string =>
  `<path d="M ${cx - 26} ${y - 8} L ${cx + 26} ${y - 8} L ${cx + 18} ${y + 4} L ${cx - 18} ${y + 4} Z" fill="var(--fg)" fill-opacity="0.8"/>`;

function hboatSide(x: number, y: number, direction?: number): string {
  const dir = direction || 1;
  return `<path d="M ${x - 34 * dir} ${y - 8} L ${x + 24 * dir} ${y - 8} L ${x + 36 * dir} ${y - 14} L ${x + 30 * dir} ${y + 3} L ${x - 34 * dir} ${y + 3} Z" fill="var(--fg)" fill-opacity="0.8"/>`;
}

const hsurf = (y: number, nolab?: boolean): string =>
  hl(4, y, HW - 4, y, "var(--water)", 1.4) + (nolab ? "" : ht(HW - 6, y - 4, "surface", "end"));

const hbottom = (y: number): string =>
  `<rect x="4" y="${y}" width="${HW - 8}" height="8" fill="var(--ground)"/>${hl(4, y, HW - 4, y, "var(--muted)", 1.2)}${ht(HW - 6, y + 20, "bottom", "end")}`;

const hclip = (y: number, inner: string): string =>
  `<defs><clipPath id="hlp-clip"><rect x="0" y="0" width="${HW}" height="${y}"/></clipPath></defs><g clip-path="url(#hlp-clip)">${inner}</g>`;

const hdot = (x: number, y: number): string =>
  `<circle cx="${x}" cy="${y}" r="3.5" fill="var(--fg)"/>`;

/** A value that is a finite number over zero, else the default (`vOr`, line 1598). */
const vOr = (v: number | undefined, d: number): number =>
  v !== undefined && Number.isFinite(v) && v > 0 ? v : d;

/** A number that is finite, else the default (the `isFinite(x) ? x : d` of the pictures). */
const finite = (v: number | undefined, d: number): number =>
  v !== undefined && Number.isFinite(v) ? v : d;

/** The small triangle that stands for a transducer seen from the front (lines 1659 and 1722). */
const unit = (cx: number, cy: number): string =>
  `<path d="M ${cx} ${cy - 12} L ${cx + 6} ${cy + 8} L ${cx - 6} ${cy + 8} Z" fill="var(--fg)"/>`;

// ---------------------------------------------------------------------------
// The topics (line 1601)
// ---------------------------------------------------------------------------

/**
 * The topic of a field (`helpKey`, line 1734): `cone`, `down` or `side` and a
 * number is that kind, any other id is its own topic.
 */
export function helpKey(id: string): string {
  if (/^cone\d+$/.test(id)) return "cone";
  if (/^down\d+$/.test(id)) return "down";
  if (/^side\d+$/.test(id)) return "side";
  return id;
}

/** The number a picture reads from a field (`num(id)`, line 11); NaN for a field the page does not have. */
function fieldNumber(a: Settings, id: string): number {
  switch (id) {
    case "atsb":
      return a.atsb;
    case "atfa":
      return a.atfa;
    case "atw":
      return a.atw;
    case "att":
      return a.att;
    case "sso":
      return a.sso;
    default:
  }
  const m = /^(cone|down|side)(\d+)$/.exec(id);
  if (!m) return Number.NaN;
  const list = m[1] === "cone" ? a.cone : m[1] === "down" ? a.down : a.side;
  return list[Number(m[2])]?.a ?? Number.NaN;
}

/** The figure a picture draws for a field: the preset's own while one is given for the topic (`helpVal`, line 1600). */
const helpVal = (c: Ctx, id: string): number | undefined =>
  c.hov && helpKey(id) in c.hov ? c.hov[helpKey(id)] : fieldNumber(c.a, id);

interface Topic {
  readonly title: string | ((n: HelpNames) => string);
  readonly draw: (c: Ctx, id: string) => string;
  readonly explain: string;
}

const nf0 = (c: Ctx, v: number): string => c.fmt.num(v, 0);
const nf1 = (c: Ctx, v: number): string => c.fmt.num(v, 1);

const HELP: Readonly<Record<string, Topic>> = {
  dep: {
    title: "Depth under the transducer",
    draw: (c) => {
      const H = vOr(c.a.dep, 10);
      let g = hsurf(22) + hboatSide(150, 22) + hdot(150, 30) + hbottom(170);
      g +=
        hdim(210, 30, 210, 170, `${c.fmt.fmt(H)} m`, null, [26, 4]) +
        hl(150, 30, 210, 30, "var(--muted)", 0.8, "2 3");
      g += ht(158, 46, "transducer face");
      return hsvg(196, g);
    },
    explain:
      "From the transducer face straight down to the bottom. If your display adds an offset to show depth from the surface or the keel, take it off first.",
  },
  sog: {
    title: "Speed over ground",
    draw: (c) => {
      const ms = vOr(c.a.ms, 1);
      let g = "";
      const x0 = 20;
      const sc = 300 / Math.max(ms * 5, 1);
      g += ht(8, 16, "seen from above, one mark per second", "start");
      for (let i = 0; i <= 5; i += 1) {
        const x = x0 + i * ms * sc;
        g += `<circle cx="${x.toFixed(1)}" cy="60" r="${i === 5 ? 0 : 3}" fill="var(--accent)"/>${ht(x, 82, `${i} s`, "middle", "var(--muted)", 10, true)}`;
      }
      g += `${hl(x0, 60, x0 + 5 * ms * sc, 60, "var(--accent)", 1, "3 3")}<path d="M ${x0 + 5 * ms * sc - 2} 50 L ${x0 + 5 * ms * sc + 16} 60 L ${x0 + 5 * ms * sc - 2} 70 Z" fill="var(--fg)"/>`;
      g += ht(
        170,
        110,
        `${c.fmt.fmt(c.a.sog)} ${c.a.sogu === "kn" ? "kn" : "km/h"} = ${c.fmt.num(ms, 2)} m every second`,
        "middle",
        "var(--fg)",
        12,
      );
      return hsvg(124, g);
    },
    explain:
      "Your speed over the bottom, as the GPS shows it (not through the water). Used for how fast marks move across 2D and DownScan screens and for distance behind the boat.",
  },
  ssr: {
    title: (n) => `${n.side} range per side`,
    draw: (c) => {
      const R = vOr(c.a.ssr, 40);
      const H = vOr(c.a.dep, 10);
      const cx = 170;
      const top = 30;
      const sc = 150 / R;
      const zb = Math.min(H, R * 0.9);
      const bot = top + zb * sc;
      let g = "";
      const o = vOr(c.a.sso, 5);
      const w = vOr(c.a.swmax, 80);
      let wg = "";
      for (const sd of [-1, 1]) {
        const a1 = sd > 0 ? o : 180 - o;
        const a2 = sd > 0 ? o + w : 180 - o - w;
        wg += hwedge(cx, top, Math.min(a1, a2), Math.max(a1, a2), R * sc, "var(--s1)", 0.12);
      }
      g += hclip(bot, wg) + hsurf(top, true) + hboatBehind(cx, top) + hbottom(bot);
      const e = hpt(cx, top, o + 3, R * sc);
      g +=
        hdim(cx, top + 2, e[0], e[1], `${c.fmt.fmt(R)} m`, null, [30, 18]) +
        ht(
          cx + 4,
          bot + 22,
          "range = straight-line distance from the transducer",
          "start",
          "var(--fg)",
          10,
        );
      g += ht(8, 14, "from behind the boat", "start");
      return hsvg(bot + 30, g);
    },
    explain:
      "How far out the screen reaches on each side, measured along the beam from the transducer (the straight-line, slant distance), not horizontally. With the bottom in the way, the horizontal reach on the bottom is shorter.",
  },
  atr: {
    title: "Live sonar range",
    draw: (c) => {
      const R = vOr(c.a.atr, 30);
      const cx = 40;
      const top = 26;
      const sc = 260 / R;
      const fa = vOr(c.a.atfa, 45);
      const hw = vOr(c.a.atw, 135) / 2;
      let g = hsurf(top) + hboatSide(cx, top);
      g += hwedge(
        cx,
        top + 6,
        Math.max(fa - hw, 0),
        Math.min(fa + hw, 90),
        R * sc * 0.9,
        "var(--s2)",
        0.12,
      );
      const e = hpt(cx, top + 6, Math.max(fa - hw, 0) + 6, R * sc * 0.9);
      g += hdim(cx, top + 6, e[0], e[1], `${c.fmt.fmt(R)} m`, null, [0, -10]);
      g += ht(8, 16, "from the side, Forward view", "start");
      return hsvg(top + R * sc * 0.9 + 20, g);
    },
    explain:
      "The range you have set on the live sonar screen: how far from the transducer it draws, along the beam.",
  },
  zt: {
    title: "Live sonar transducer below the surface",
    draw: (c) => {
      const z = vOr(c.a.zt, 0.5);
      let g = hsurf(40) + hboatSide(140, 40);
      const y = 40 + Math.min(z, 3) * 30;
      g +=
        hl(200, 40, 200, y, "var(--fg)", 3) +
        hdot(200, y) +
        hdim(240, 40, 240, y, `${c.fmt.fmt(z)} m`, null, [26, 4]) +
        ht(208, y + 16, "transducer on the pole");
      return hsvg(Math.max(y + 40, 110), g);
    },
    explain:
      "How far below the surface the live sonar transducer sits. Only used in the live sonar section, where fish depths are given below the surface.",
  },
  atsb: {
    title: (n) => `${n.flat} beam center, below horizontal`,
    draw: (c) => {
      const t = vOr(c.a.att, 18);
      const cx = 40;
      const y = 40;
      const L = 270;
      let g = hsurf(20) + hl(cx - 20, y, cx, y, "var(--fg)", 3) + hdot(cx, y);
      const sb = finite(helpVal(c, "atsb"), 20);
      g +=
        hwedge(cx, y, sb - t / 2, sb + t / 2, L, "var(--s5)", 0.16) +
        hl(cx, y, cx + L, y, "var(--muted)", 1, "4 3") +
        ht(cx + L - 2, y - 5, "horizontal", "end");
      const e = hpt(cx, y, sb, L);
      g +=
        hl(cx, y, e[0], e[1], "var(--s5)", 1.6, "6 3") +
        harc(cx, y, 0, sb, 90, null, `${nf0(c, sb)}°`, 112);
      g += ht(8, 14, `from the side, ${c.names.flat} aimed ahead`, "start");
      return hsvg(y + L * Math.sin(rad(Math.min(sb + t / 2, 80))) + 16, g);
    },
    explain:
      'How far below horizontal the center of the <span data-n="flat">Scout</span> slice points, set by how the transducer is tilted on its mount. Measure to the center of the beam, not its lower or upper edge.',
  },
  atfa: {
    title: "Forward fan center, below horizontal",
    draw: (c) => {
      const hw = vOr(c.a.atw, 135) / 2;
      const cx = 100;
      const y = 36;
      const L = 180;
      let g = hsurf(20) + hl(cx - 20, y, cx, y, "var(--fg)", 3) + hdot(cx, y);
      const fa = finite(helpVal(c, "atfa"), 45);
      g +=
        hwedge(cx, y, Math.max(fa - hw, 0), fa + hw, L, "var(--s2)", 0.12) +
        hl(cx, y, HW - 6, y, "var(--muted)", 1, "4 3") +
        ht(HW - 8, y - 5, "horizontal", "end");
      const e = hpt(cx, y, fa, L);
      g +=
        hl(cx, y, e[0], e[1], "var(--s2)", 1.8, "6 3") +
        ht(e[0] + 4, e[1] + 12, "fan center", "start", "var(--s2)") +
        harc(cx, y, 0, fa, 70, null, `${nf0(c, fa)}°`, 92);
      g += ht(8, 12, "from the side, Forward view aimed ahead", "start");
      return hsvg(y + L + 12, g);
    },
    explain:
      "How far below horizontal the middle of the Forward fan points. The fan spreads out to both sides of this line; the part that would point above the surface is left out.",
  },
  "at-n": {
    title: "One or two live sonar transducers",
    draw: (c) => {
      const w = vOr(c.a.atw, 135);
      let g = "";
      const cy = 110;
      const r = 70;
      const units: readonly (readonly [number, number, string])[] = [
        [85, 1, "one unit"],
        [255, 2, "two units, splayed"],
      ];
      for (const u of units) {
        const cx = u[0];
        if (u[1] === 1) {
          g += hwedge(cx, cy, -90 - w / 2, -90 + w / 2, r, "var(--s5)", 0.18);
        } else {
          const tot = Math.min(2 * w, 360);
          g +=
            hwedge(cx, cy, -90 - tot / 2, -90, r, "var(--s5)", 0.18) +
            hwedge(cx, cy, -90, -90 + tot / 2, r, "var(--s6)", 0.18);
        }
        g +=
          unit(cx, cy) +
          ht(
            cx,
            cy + 34,
            `${u[2]}: ${nf0(c, u[1] === 1 ? w : Math.min(2 * w, 360))}°`,
            "middle",
            "var(--fg)",
            12,
          );
      }
      g += ht(8, 14, `from above, ${c.names.flat} view, boat heading up`, "start");
      return hsvg(160, g);
    },
    explain:
      'Two units splayed apart, each with its own fan, double how far around the boat <span data-n="flat">Scout</span> sees.',
  },
  maxd: {
    title: "Maximum depth",
    draw: (c) => {
      const M = vOr(c.hov?.maxd, 50);
      const cx = 170;
      const top = 24;
      const sc = 150 / M;
      const v = 40;
      let g = hsurf(top) + hboatBehind(cx, top);
      g += hwedge(cx, top + 4, 90 - v / 2, 90 + v / 2, M * sc, "var(--s4)", 0.16);
      g +=
        hl(20, top + 4 + M * sc, HW - 20, top + 4 + M * sc, "var(--accent)", 1.4, "6 4") +
        ht(HW - 22, top + M * sc, "deepest it finds the bottom", "end", "var(--accent)");
      g +=
        hdim(76, top + 4, 76, top + 4 + M * sc, `${c.fmt.fmt(M)} m`, null, [-38, 4]) +
        ht(cx, top + M * sc + 30, "deeper than this: no reliable bottom", "middle", "var(--muted)");
      return hsvg(top + M * sc + 44, g);
    },
    explain:
      "The depth down to which the manufacturer says this frequency still finds the bottom, in good conditions. Real reach depends on the bottom, the water and your settings. The calculator stops the beam there.",
  },
  cone: {
    title: "2D cone width",
    draw: (c, id) => {
      const v = vOr(helpVal(c, id), 20);
      const H = vOr(c.a.dep, 10);
      const cx = 170;
      const top = 24;
      const sc = 130 / H;
      let g = hsurf(top) + hboatBehind(cx, top);
      g +=
        hclip(
          top + 4 + H * sc,
          hwedge(
            cx,
            top + 4,
            90 - v / 2,
            90 + v / 2,
            (H * sc) / Math.cos(rad(v / 2)),
            "var(--s3)",
            0.18,
          ),
        ) + hbottom(top + 4 + H * sc);
      g += harc(cx, top + 4, 90 - v / 2, 90 + v / 2, 60, null, `${nf0(c, v)}°`, 76);
      const hwid = H * Math.tan(rad(v / 2)) * sc;
      g += hdim(
        cx - hwid,
        top + 4 + H * sc + 18,
        cx + hwid,
        top + 4 + H * sc + 18,
        `${c.fmt.fmt(2 * H * Math.tan(rad(v / 2)))} m`,
        null,
        [0, 16],
      );
      return hsvg(top + H * sc + 62, g);
    },
    explain:
      "The full width of the cone, edge to edge (not half of it), as seen from behind the boat. The cone is round, so it is the same seen from the side.",
  },
  down: {
    title: (n) => `${n.down} fan width, side to side`,
    draw: (c, id) => {
      const v = vOr(helpVal(c, id), 45);
      const H = vOr(c.a.dep, 10);
      const cx = 170;
      const top = 24;
      const sc = 120 / H;
      let g = hsurf(top) + hboatBehind(cx, top);
      const L = (H * sc) / Math.cos(rad(Math.min(v / 2, 70)));
      g +=
        hclip(top + 4 + H * sc, hwedge(cx, top + 4, 90 - v / 2, 90 + v / 2, L, "var(--s4)", 0.18)) +
        hbottom(top + 4 + H * sc);
      g +=
        harc(cx, top + 4, 90 - v / 2, 90 + v / 2, 50, null, `${nf0(c, v)}°`, 66) +
        ht(8, 14, "from behind the boat", "start");
      return hsvg(top + H * sc + 36, g);
    },
    explain:
      'The full width of the thin <span data-n="down">DownScan</span> fan across the boat, edge to edge. From the side it is only a few degrees thick (next setting).',
  },
  dst: {
    title: (n) => `${n.down} fan thickness, front to back`,
    draw: (c) => {
      const v = vOr(c.a.dst, 3);
      const ex = 5;
      const H = vOr(c.a.dep, 10);
      const cx = 170;
      const top = 24;
      const sc = 130 / H;
      let g = hsurf(top) + hboatSide(cx, top);
      g +=
        hwedge(cx, top + 4, 90 - (v * ex) / 2, 90 + (v * ex) / 2, H * sc, "var(--s4)", 0.2) +
        hbottom(top + 4 + H * sc) +
        harc(cx, top + 4, 90 - (v * ex) / 2, 90 + (v * ex) / 2, 70, null, `${nf1(c, v)}°`, 88);
      g += ht(8, 14, `from the side, angle drawn ×${ex} so it shows`, "start");
      return hsvg(top + H * sc + 36, g);
    },
    explain:
      "How thick the fan is along the keel. It decides how long a strip of bottom each ping covers front to back, and how sharp things look along the track.",
  },
  side: {
    title: (n) => `${n.side} fan width`,
    draw: (c, id) => {
      const v = vOr(helpVal(c, id), 80);
      const o = vOr(c.a.sso, 5);
      const cx = 60;
      const y = 30;
      const L = 190;
      let g = hsurf(y - 4, true) + hboatBehind(cx, y - 4);
      const w = vOr(c.a.swmax, v);
      const o2 = c.inner ? o + w - v : o + w / 2 - v / 2;
      g +=
        hwedge(cx, y, o2, o2 + v, L, "var(--s1)", 0.16) +
        harc(cx, y, o2, o2 + v, 110, null, `${nf0(c, v)}°`, 132) +
        ht(8, 14, "from behind the boat, starboard side", "start");
      return hsvg(y + L * Math.sin(rad(Math.min(o2 + v, 90))) + 12, g);
    },
    explain:
      "The width of one side's fan, from its upper edge down to its inner edge. There is one such fan on each side of the boat.",
  },
  sso: {
    title: (n) => `Upper edge of the widest ${n.side} fan`,
    draw: (c) => {
      const w = vOr(c.a.swmax, 80);
      const cx = 40;
      const y = 34;
      const L = 270;
      let g = hsurf(y - 4, true) + hboatBehind(cx, y - 4);
      const o = finite(helpVal(c, "sso"), 5);
      g +=
        hwedge(cx, y, o, o + w, L * 0.8, "var(--s1)", 0.12) +
        hl(cx, y, cx + L, y, "var(--muted)", 1, "4 3") +
        ht(cx + L - 2, y - 5, "horizontal", "end");
      const e = hpt(cx, y, o, L * 0.8);
      g +=
        hl(cx, y, e[0], e[1], "var(--accent)", 2) +
        harc(cx, y, 0, Math.max(o, 0.5), 150, null, `${nf1(c, o)}°`, 170);
      g += ht(8, 14, "from behind the boat, starboard side", "start");
      return hsvg(y + L * 0.8 * Math.sin(rad(Math.min(o + w, 90))) * 0.7 + 30, g);
    },
    explain:
      "How far below horizontal the top edge of the widest fan points. Together with the fan width it decides whether the fan reaches straight down under the boat (upper edge + width = 90°).",
  },
  sst: {
    title: (n) => `${n.side} fan thickness, front to back`,
    draw: (c) => {
      const v = vOr(c.a.sst, 2);
      const ex = 5;
      const cx = 30;
      const cy = 70;
      const L = 290;
      let g = `<path d="M ${cx - 10} ${cy - 8} L ${cx + 14} ${cy} L ${cx - 10} ${cy + 8} Z" fill="var(--fg)"/>`;
      g +=
        hwedge(cx, cy, (-v * ex) / 2, (v * ex) / 2, L, "var(--s1)", 0.2) +
        harc(cx, cy, (-v * ex) / 2, (v * ex) / 2, 150, null, `${nf1(c, v)}°`, 170) +
        ht(8, 14, `from above, one side's fan; angle drawn ×${ex}`, "start");
      return hsvg(120, g);
    },
    explain:
      "How thick the widest fan is along the keel, seen from above. The strip of bottom it covers each ping gets wider the farther out it is. Narrower fans are scaled in proportion.",
  },
  ssalign: {
    title: "How the narrower fans are aimed",
    draw: (c) => {
      const o = vOr(c.a.sso, 5);
      const w = vOr(c.a.swmax, 80);
      const n = w * 0.45;
      let g = "";
      const y = 34;
      const L = 120;
      const aims: readonly (readonly [number, string, string])[] = [
        [20, "inner", "to the inner edge"],
        [185, "center", "around the center line"],
      ];
      for (const u of aims) {
        const cx = u[0];
        const o2 = u[1] === "inner" ? o + w - n : o + w / 2 - n / 2;
        g +=
          hwedge(cx, y, o, o + w, L, "var(--s1)", 0.08) +
          hwedge(cx, y, o2, o2 + n, L, "var(--s2)", 0.25) +
          ht(cx, y + L + 18, u[2], "start", "var(--fg)", 11);
      }
      g += ht(
        8,
        14,
        "from behind, starboard side: widest fan (light) and a narrower one",
        "start",
        "var(--muted)",
        10,
      );
      return hsvg(y + L + 30, g);
    },
    explain:
      "Not published. Aimed down to the inner edge, a narrow high-frequency fan still covers the bottom straight under the boat. Aimed around the center, it leaves a gap under the boat. If objects straight under the boat show on both sides at every frequency, the inner-edge choice matches your unit.",
  },
  atw: {
    title: "Live sonar fan width",
    draw: (c) => {
      const cx = 170;
      const cy = 150;
      const r = 120;
      let g = "";
      const w = finite(helpVal(c, "atw"), 135);
      g +=
        hwedge(cx, cy, -90 - w / 2, -90 + w / 2, r, "var(--s5)", 0.16) +
        harc(cx, cy, -90 - w / 2, -90 + w / 2, 60, null, `${nf0(c, w)}°`, 80);
      g +=
        unit(cx, cy) +
        ht(
          8,
          14,
          `the fan face-on (in Forward it stands on edge, in ${c.names.flat} it lies flat)`,
          "start",
          "var(--muted)",
          10,
        );
      return hsvg(170, g);
    },
    explain:
      'The full width of the live sonar fan, edge to edge. In Forward and Down it is the picture you see on the screen; in <span data-n="flat">Scout</span> it is how far around you see.',
  },
  att: {
    title: "Live sonar slice thickness",
    draw: (c) => {
      const cx = 40;
      const cy = 90;
      const L = 280;
      let g = "";
      const t = finite(helpVal(c, "att"), 18);
      g +=
        hwedge(cx, cy, -t / 2, t / 2, L, "var(--s5)", 0.18) +
        hdot(cx, cy) +
        harc(cx, cy, -t / 2, t / 2, 140, null, `${nf0(c, t)}°`, 162);
      g += ht(8, 14, "the fan seen edge-on: its thickness", "start");
      const e = hpt(cx, cy, t / 2, L);
      g += ht(e[0] - 4, e[1] + 16, "thicker with distance", "end");
      return hsvg(160, g);
    },
    explain:
      "How thick the fan is, seen edge-on. Targets anywhere inside this slice are drawn on the screen, so the slice gets thicker the farther out it reaches.",
  },
};

/** The topics, in the order the earlier page lists them. */
export const HELP_KEYS: readonly string[] = Object.keys(HELP);

/**
 * The topic of a key, read from a plain object as the earlier page does
 * (`HELP[k]`, lines 1738, 1746 and 1760): a key that is a name every object
 * has (`constructor`, `toString`, `__proto__` ...) finds that property, which
 * is no topic but counts as one, as on the page (see `drawn`, and the "Legacy
 * defects" of the PR).
 */
const topicOf = (key: string): Topic | undefined => HELP[key];

/**
 * The picture of a topic as the handlers write it: `H.d(a, id)` in a `try`
 * whose `catch` writes nothing (lines 1751 and 1764). A real topic never
 * throws; an inherited property that counts as a topic has no `d`.
 */
function drawn(topic: Topic, c: Ctx, id: string): string {
  try {
    return topic.draw(c, id);
  } catch {
    return "";
  }
}

/** Whether a field has a "?" button: its topic is one of the eighteen (the test of `addQM`, line 1738). */
export const hasHelp = (id: string): boolean => topicOf(helpKey(id)) !== undefined;

/** The title of a topic, with the names of the transducers; none for a key that is no topic. */
export function helpTitle(key: string, names: HelpNames): string | undefined {
  const t = topicOf(key)?.title;
  return typeof t === "function" ? t(names) : t;
}

/** A name as a text node writes it into html. */
const textNode = (v: string): string =>
  v.replace(/&/g, "&amp;").replace(/ /g, "&nbsp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * The explanation of a topic: its text with the names of the transducers put
 * into the spans that carry them (lines 1754 and 1766); a name that is empty
 * leaves the text the span has.
 */
export function helpExplanation(key: string, names: HelpNames): string | undefined {
  const x = topicOf(key)?.explain;
  if (x === undefined) return undefined;
  const byName: Readonly<Record<string, string | undefined>> = names;
  return x.replace(/<span data-n="([^"]*)">([^<]*)<\/span>/g, (span: string, n: string) => {
    const v = byName[n];
    return v ? `<span data-n="${n}">${textNode(v)}</span>` : span;
  });
}

function context(input: HelpInput, over: HelpOverride | undefined, a: Settings): Ctx {
  const align = input.local.ssalign;
  let hov: Record<string, number | undefined> | null = null;
  if (over) {
    hov = {};
    hov[over.key] = over.value;
  }
  return { a, names: input.names, fmt: input.fmt, inner: align !== "center", hov };
}

/**
 * The picture of a topic for the field `id`, drawn with the numbers of
 * Settings and, where given, with a preset's figure in place of the field's.
 */
export function helpPicture(
  key: string,
  id: string,
  input: HelpInput,
  over?: HelpOverride,
): string | undefined {
  const topic = topicOf(key);
  return topic ? drawn(topic, context(input, over, input.settings), id) : undefined;
}

/**
 * What the dialog writes for the title and the explanation: a title that is
 * `undefined` is written by `textContent` as nothing, and an explanation that
 * is `undefined` by `innerHTML` as the text `undefined` (lines 1749, 1753,
 * 1765). Only an inherited property that counts as a topic has neither.
 */
const titleText = (key: string, names: HelpNames): string => helpTitle(key, names) ?? "";
const explanationHtml = (key: string, names: HelpNames): string =>
  String(helpExplanation(key, names));

/**
 * What the dialog holds after a click on the "?" button of a field of Settings
 * (the handler of lines 1757 to 1768): `label` is the text of the label the
 * button sits in, without the button. None for a field that has no topic.
 */
export function settingHelpView(
  input: HelpInput,
  id: string,
  label: string,
): SectionView | undefined {
  const key = helpKey(id);
  const topic = topicOf(key);
  if (!topic) return undefined;
  const lt = label.trim();
  const sub = key !== id && lt ? `Setting: ${lt}` : "";
  return {
    "help-h": { text: titleText(key, input.names) },
    "help-sub": { text: sub, hidden: !sub },
    "help-fig": { html: drawn(topic, context(input, undefined, input.settings), id) },
    "help-x": { html: explanationHtml(key, input.names) },
    "help-note": { text: "Drawn with your current settings." },
  };
}

/** The settings a figure's picture is drawn with: the figure takes the place of its own field's number. */
function withFigure(a: Settings, key: string, value: number | undefined): Settings {
  // The earlier page sets the field to the figure even when the figure is `undefined`; no
  // picture tells that from NaN (`vOr` and `finite` take both for no number).
  const v = value ?? Number.NaN;
  switch (key) {
    case "ssr":
      return { ...a, ssr: v };
    case "dst":
      return { ...a, dst: v };
    case "sst":
      return { ...a, sst: v };
    case "sso":
      return { ...a, sso: v };
    case "atw":
      return { ...a, atw: v };
    case "att":
      return { ...a, att: v };
    default:
      return a;
  }
}

/**
 * What the dialog holds after a click on the "?" button of a figure of the
 * cards (the handler of lines 1743 to 1756): the picture drawn with that
 * figure and everything else from the current settings. None for a figure
 * without a topic.
 */
export function figureHelpView(input: HelpInput, row: DataRow): SectionView | undefined {
  const key = row.helpKey;
  const topic = key === undefined ? undefined : topicOf(key);
  if (key === undefined || !topic) return undefined;
  const value = row.helpValue;
  const a = withFigure(input.settings, key, value);
  return {
    "help-h": { text: titleText(key, input.names) },
    "help-sub": { text: `${row.who}: ${row.name}, ${row.val}`, hidden: false },
    "help-fig": { html: drawn(topic, context(input, { key, value }, a), key) },
    "help-x": { html: explanationHtml(key, input.names) },
    "help-note": {
      text: "Drawn with this preset figure; everything else in the picture uses your current settings.",
    },
  };
}
