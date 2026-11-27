/**
 * The choice of transducers (docs/SPEC.md 2.2): which imaging transducer, which
 * second one and which live sonar the page calculates with, the names it shows
 * for them, and the rows of the two preset cards in Settings. Nothing here
 * finds an element: a function takes the values of the fields it reads and
 * returns what it writes, as a `SectionView` by element id. The "?" buttons of
 * the rows and the frequency buttons stay with the shell, which adds them after
 * it has applied a view.
 */
import { EX, IBR, type IMG, LBR } from "./presets";
import { confTag, IMG_RATED, LIVE_RATED } from "./sources";
import type {
  Cone,
  ConeData,
  Confidence,
  ImagingPreset,
  LivePreset,
  Names,
  Preset,
  RatedPreset,
  SavedValue,
  SectionView,
  UiState,
} from "./types";

/** The elements the views of this module write, by id. */
export const KEYS = [
  "img-p",
  "img-s",
  "img-s-f",
  "live-p",
  "at-n2",
  "ang-img",
  "ang-live",
] as const;

/** The fan thickness the page starts with, front to back, in degrees: down imaging and side imaging. */
export const THICKNESS = { dst: 3, sst: 2 } as const;

/** The confidence level of a figure that is an example: the thicknesses and the fan's upper edge. */
const EXAMPLE: Confidence = 1;

/** The brand of a transducer that is none of the presets: it combines with nothing and with every live sonar. */
const OTHER = "other";

/** How the narrower side fans are aimed unless the visitor chose otherwise, and the other choice. */
const INNER = "inner";
const CENTER = "center";

/** A rated preset with its brand and short name. */
function branded(p: RatedPreset, [brand, short]: readonly [string, string]): ImagingPreset {
  return { ...p, brand, short };
}

/** The imaging transducers as the page offers them, by key, in order. */
export const TRANSDUCERS: Readonly<Record<keyof typeof IMG, ImagingPreset>> = {
  lowrance: branded(IMG_RATED.lowrance, IBR.lowrance),
  lowrance_nose: branded(IMG_RATED.lowrance_nose, IBR.lowrance_nose),
  hb_xm9hw: branded(IMG_RATED.hb_xm9hw, IBR.hb_xm9hw),
  hb_xm14hw: branded(IMG_RATED.hb_xm14hw, IBR.hb_xm14hw),
  hb_xm14cmsi: branded(IMG_RATED.hb_xm14cmsi, IBR.hb_xm14cmsi),
  hb_xnt9hw150: branded(IMG_RATED.hb_xnt9hw150, IBR.hb_xnt9hw150),
  hb_xm920: branded(IMG_RATED.hb_xm920, IBR.hb_xm920),
  other: branded(IMG_RATED.other, IBR.other),
};

/** What a field holds when nothing is chosen in it. */
const FALLBACK_IMAGING = TRANSDUCERS.lowrance;
const FALLBACK_LIVE = LIVE_RATED.at2;

/**
 * The entry of a registry by a key that a field gives. A plain property read,
 * as the earlier page does it; the fields only ever give a key of the registry
 * or an empty text.
 */
function entry<T>(registry: Readonly<Record<string, T>>, key: string): T | undefined {
  return registry[key];
}

/** One option of a list. */
function option(value: string, label: string): string {
  return `<option value="${value}">${label}</option>`;
}

/**
 * The list of imaging transducers (the earlier page's `fillSel`, line 167, as
 * line 171 calls it). Reads no field.
 */
export function primaryView(): SectionView {
  const html = Object.entries(TRANSDUCERS)
    .map(([key, p]) => option(key, p.label))
    .join("");
  return { "img-p": { html } };
}

/** The chosen imaging transducer (`PI`, line 172). `key` is the value of `img-p`. */
export function primary(key: string): ImagingPreset {
  return entry(TRANSDUCERS, key) ?? FALLBACK_IMAGING;
}

/**
 * The second imaging transducer, or null without one (`PS`, line 173).
 * `primaryKey` is the value of `img-p`, `key` that of `img-s`.
 */
export function secondary(primaryKey: string, key: string): ImagingPreset | null {
  const s = entry(TRANSDUCERS, key);
  return key !== "" && s !== undefined && key !== primaryKey ? s : null;
}

/**
 * The list of second transducers, the choice it leaves and whether its field is
 * shown (`fillSec`, lines 174 to 180): the other presets of the first one's
 * brand. `primaryKey` is the value of `img-p`, `current` that of `img-s`.
 */
export function secondaryView(primaryKey: string, current: string): SectionView {
  const brand = primary(primaryKey).brand;
  const offered =
    brand === OTHER
      ? []
      : Object.entries(TRANSDUCERS).filter(([key, p]) => key !== primaryKey && p.brand === brand);
  const html = option("", "None") + offered.map(([key, p]) => option(key, p.label)).join("");
  return {
    "img-s": { html, value: offered.some(([key]) => key === current) ? current : "" },
    "img-s-f": { hidden: offered.length === 0 },
  };
}

/**
 * The list of live sonars and the choice it leaves (`fillLive`, lines 181 to
 * 186): those of the first transducer's brand and those of no brand.
 * `primaryKey` is the value of `img-p`, `current` that of `live-p`.
 */
export function liveView(primaryKey: string, current: string): SectionView {
  const brand = primary(primaryKey).brand;
  const offered = Object.entries(LIVE_RATED).filter(([key]) => {
    const liveBrand = entry(LBR, key);
    return brand === OTHER || liveBrand === brand || liveBrand === OTHER;
  });
  const html = offered.map(([key, p]) => option(key, p.label)).join("");
  // The list is never empty: the live sonar of no brand is always offered.
  const first = offered[0]?.[0] ?? "";
  return { "live-p": { html, value: offered.some(([key]) => key === current) ? current : first } };
}

/** What makes two frequencies the same one: the name and the frequency, CHIRP or not. */
function sameAs(c: ConeData): string {
  return `${c.n || ""}|${c.f.replace(/ CHIRP$/, "")}`;
}

/**
 * The transducer the page calculates with (`PC`, lines 188 to 193): the first
 * one, or the first with the frequencies only the second has, each marked with
 * the second's short name. `primaryKey` is the value of `img-p`, `secondaryKey`
 * that of `img-s`.
 */
export function combined(primaryKey: string, secondaryKey: string): Preset {
  const p = primary(primaryKey);
  const s = secondary(primaryKey, secondaryKey);
  if (s === null) return p;
  const merge = (a: readonly Cone[], b: readonly Cone[]): Cone[] => {
    const have = a.map(sameAs);
    return a.concat(
      b
        .filter((c) => have.indexOf(sameAs(c)) < 0)
        .map((c) => ({
          f: `${c.f} (${s.short})`,
          n: c.n,
          a: c.a,
          r: c.r,
          src: c.src,
          c: c.c,
          s: c.s,
          rc: c.rc,
          rs: c.rs,
          sec: true,
        })),
    );
  };
  return {
    label: `${p.label} + ${s.label}`,
    names: p.names,
    note: `${p.note} Second transducer, ${s.label}: ${s.note} Only the frequencies the second transducer adds are listed for it.`,
    cone: merge(p.cone, s.cone),
    down: merge(p.down, s.down),
    side: merge(p.side, s.side),
    edge: p.edge,
    edgeSrc: p.edgeSrc,
  };
}

/** The chosen live sonar (`PL`, line 194). `key` is the value of `live-p`. */
export function livePreset(key: string): LivePreset {
  return entry(LIVE_RATED, key) ?? FALLBACK_LIVE;
}

/**
 * The names the page shows for the chosen transducers (`setNames`, lines 197 to
 * 198). `primaryKey` is the value of `img-p`, `liveKey` that of `live-p`.
 */
export function namesOf(primaryKey: string, liveKey: string): Names {
  const i = primary(primaryKey).names;
  const l = livePreset(liveKey).names;
  return {
    side: i.side,
    down: i.down,
    live: l.live,
    flat: l.flat,
    wide: l.wide || `${l.flat} Wide`,
  };
}

/**
 * The name for an element that is marked with a name key (`setNames`, line
 * 199), or undefined for a key that is no name. The shell writes it to the
 * element when it is not empty and the element does not show it already.
 */
export function nameFor(names: Names, key: string): string | undefined {
  return entry({ ...names }, key);
}

/** The label of the choice of two live transducers (`setNames`, line 200). */
export function namesView(names: Names): SectionView {
  return { "at-n2": { text: `Two, for ${names.wide}` } };
}

/** One row of a preset card: a labelled angle field with its default and its source (`arow`, lines 202 to 205). */
function arow(id: string, label: string, val: number, src: string): string {
  return `<div class="arow"><label for="${id}">${label}</label><div class="ain"><input id="${id}" type="text" inputmode="decimal" autocomplete="off" value="${val}" data-save data-def="${val}"><span>°</span></div><p class="src" data-src="${id}">${src}</p></div>`;
}

/** How a 2D frequency is labelled: its name, where it has one, then the frequency (`coneLabel`, line 206). */
export function coneLabel(c: Pick<ConeData, "n" | "f">): string {
  return (c.n ? `${c.n}, ` : "") + c.f;
}

/**
 * How the narrower side fans are aimed when the angles are written (`buildImg`,
 * line 208): the value of the field `ssalign` when the field is there (`null`:
 * it is not), else its saved value, else the inner edge.
 */
export function alignOf(field: string | null, saved: SavedValue | undefined): SavedValue {
  return field !== null ? field : saved || INNER;
}

/**
 * The angles of the imaging transducer: its note and a row for each frequency,
 * thickness and edge (`buildImg`, lines 209 to 213). `p` is `combined()`,
 * `align` is `alignOf()`.
 */
export function anglesView(p: Preset, align: SavedValue): SectionView {
  const center = align === CENTER;
  let h = `<p class="hint" style="color:var(--fg)">${p.note}</p>`;
  h += `<div class="agrp" data-eq="2d"><h3>2D sonar, full cone width</h3>${p.cone
    .map((c, i) => arow(`cone${i}`, coneLabel(c), c.a, c.src + confTag(c.c)))
    .join("")}<p class="err" id="a2d-err" hidden></p></div>`;
  h += `<div class="agrp" data-eq="ds"><h3>${p.names.down}</h3>${p.down
    .map((c, i) => arow(`down${i}`, `${c.f}, fan side to side`, c.a, c.src + confTag(c.c)))
    .join("")}${arow(
    "dst",
    "Fan thickness, front to back",
    THICKNESS.dst,
    EX + confTag(EXAMPLE),
  )}<p class="err" id="ads-err" hidden></p></div>`;
  h += `<div class="agrp" data-eq="ss"><h3>${p.names.side}, each side</h3>${p.side
    .map((c, i) => arow(`side${i}`, `${c.f}, fan width`, c.a, c.src + confTag(c.c)))
    .join("")}${arow(
    "sso",
    "Upper edge of the widest fan, below horizontal",
    p.edge,
    p.edgeSrc + confTag(EXAMPLE),
  )}${arow(
    "sst",
    "Thickness of the widest fan, front to back",
    THICKNESS.sst,
    EX + confTag(EXAMPLE),
  )}<div class="field" style="padding-top:0.4rem"><label for="ssalign">Narrower fans are aimed</label><select id="ssalign" class="sel" data-save><option value="${INNER}"${
    center ? "" : " selected"
  }>Down to the same inner edge as the widest (no extra gap)</option><option value="${CENTER}"${
    center ? " selected" : ""
  }>Around the same center line (opens a gap under the boat)</option></select><p class="hint">Not published. Objects straight under the boat showing on both sides at every frequency means the inner-edge choice matches your unit. Thickness scales with width either way.</p></div><p class="err" id="ass-err" hidden></p></div>`;
  return { "ang-img": { html: h } };
}

/** The chosen frequency of each kind, as the saved view state holds them. */
type Frequencies = Pick<UiState, "f2d" | "fds" | "ssf">;

/**
 * The chosen frequencies once the angles are written (`buildImg`, line 214): a
 * choice the transducer has no frequency for goes back to the first. `ui` is
 * the saved view state, `p` is `combined()`. Returns the three choices; the
 * shell puts them into the saved view state.
 */
export function frequencyChoice(ui: Frequencies, p: Preset): Frequencies {
  const kept = (chosen: string, count: number): string => (Number(chosen) < count ? chosen : "0");
  return {
    f2d: kept(ui.f2d, p.cone.length),
    fds: kept(ui.fds, p.down.length),
    ssf: kept(ui.ssf, p.side.length),
  };
}

/**
 * The angles of the live sonar: a row for its width and one for its thickness
 * (`buildLive`, lines 217 to 221). `p` is `livePreset()`.
 */
export function liveAnglesView(p: LivePreset): SectionView {
  const h = `<div class="agrp"><h3>${p.names.live}</h3>${arow(
    "atw",
    "Fan width",
    p.w,
    p.srcW + confTag(p.cw),
  )}${arow("att", "Slice thickness", p.t, p.srcT + confTag(p.ct))}<p class="err" id="aat-err" hidden></p></div>`;
  return { "ang-live": { html: h } };
}
