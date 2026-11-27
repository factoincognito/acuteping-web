/**
 * The context lines and the frequency buttons (docs/SPEC.md 2.2): the line
 * above the tools of each section that says which settings the section is
 * calculated with, and the buttons that choose the frequency of a section.
 * Nothing here finds an element: a function returns what it writes, as a
 * `SectionView` by element id. The clicks on the buttons stay with the shell.
 */
import { degList } from "./format";
import { KNOTS } from "./settings";
import type {
  Cone,
  Equipment,
  Formatter,
  Names,
  Preset,
  SectionView,
  Settings,
  UiState,
} from "./types";

/** The elements the views of this module write, by id. */
export const KEYS = [
  "ctx-ss",
  "ctx-vs",
  "ctx-at",
  "ctx-cmp",
  "ctx-db",
  "ctx-ls",
  "f2d",
  "fds",
  "ssf",
] as const;

/**
 * What the context lines read of a section's input (the `ViewInput` of
 * docs/SPEC.md 3.2, which has these four under the same names).
 */
interface ContextInput {
  readonly settings: Settings;
  readonly eq: Equipment;
  readonly names: Names;
  readonly fmt: Formatter;
}

/** How the units of speed are shown. */
const SHOWN_KNOTS = "kn";
const SHOWN_KMH = "km/h";

/** The button that ends every context line and takes the visitor to Settings. */
const TO_SETTINGS =
  '<button type="button" class="linkbtn" data-goto="1">Change in Settings</button>';

/** One value of a context line with what it is. */
function shown(label: string, value: string): string {
  return `<span>${label} <b>${value}</b></span>`;
}

/**
 * The context line of each section (`fillCtx`, lines 275 to 285). Reads of
 * `settings` the numbers `dep`, `sog`, `ssr`, `atr`, `zt`, `atw` and `att`, the
 * unit `sogu` and the three lists; of `eq` the flags `ss`, `2d`, `ds` and `at`;
 * of `names` the names `side`, `down` and `live`; and `fmt`. A distance or a
 * speed that is no number is a dash; an angle is written in whole degrees as
 * the formatter writes it, also when it is no number.
 */
export function contextView({ settings: a, eq, names, fmt }: ContextInput): SectionView {
  const dep = shown("Depth", `${fmt.fmt(a.dep)} m`);
  const sog = shown("SOG", `${fmt.fmt(a.sog)} ${a.sogu === KNOTS ? SHOWN_KNOTS : SHOWN_KMH}`);
  const sideRange = shown(`${names.side} range`, `${fmt.fmt(a.ssr)} m`);
  const liveRange = shown(`${names.live} range`, `${fmt.fmt(a.atr)} m`);
  return {
    "ctx-ss": {
      html:
        dep +
        shown("Range", `${fmt.fmt(a.ssr)} m`) +
        shown("Fans", degList(fmt, a.side)) +
        TO_SETTINGS,
    },
    "ctx-vs": {
      html:
        dep +
        (eq["2d"] ? shown("2D", degList(fmt, a.cone)) : "") +
        (eq.ds ? shown(names.down, degList(fmt, a.down)) : "") +
        sog +
        TO_SETTINGS,
    },
    "ctx-at": {
      html:
        dep +
        shown("Transducer", `${fmt.fmt(a.zt)} m down`) +
        shown("Range", `${fmt.fmt(a.atr)} m`) +
        shown("Slice", `${fmt.num(a.atw, 0)}° × ${fmt.num(a.att, 0)}°`) +
        TO_SETTINGS,
    },
    "ctx-cmp": { html: dep + (eq.ss ? sideRange : "") + (eq.at ? liveRange : "") + TO_SETTINGS },
    "ctx-db": { html: sog + TO_SETTINGS },
    "ctx-ls": { html: dep + TO_SETTINGS },
  };
}

/**
 * The buttons of one kind of frequency: one for each, numbered from 0, with
 * the chosen one pressed. A choice is pressed when its text is the number's:
 * `1` and `"1"` press the second button, `"01"` presses none.
 */
function segments(
  list: readonly Cone[],
  chosen: unknown,
  label: (c: Cone) => string,
): { html: string } {
  return {
    html: list
      .map(
        (c, i) =>
          `<button type="button" data-v="${i}" aria-pressed="${String(i) === String(chosen)}">${label(c)}</button>`,
      )
      .join(""),
  };
}

/**
 * The buttons that choose the frequency of 2D, of down imaging and of side
 * imaging (`buildSegs`, lines 286 to 295). `p` is the transducer the page
 * calculates with (`combined()` of `transducers.ts`); `ui` is the saved view
 * state, of which `f2d`, `fds` and `ssf` are read. A 2D frequency is labelled
 * with its name, where it has one, before the frequency.
 */
export function segmentsView(p: Preset, ui: Pick<UiState, "f2d" | "fds" | "ssf">): SectionView {
  return {
    f2d: segments(p.cone, ui.f2d, (c) => (c.n ? `${c.n} ${c.f}` : c.f)),
    fds: segments(p.down, ui.fds, (c) => c.f),
    ssf: segments(p.side, ui.ssf, (c) => c.f),
  };
}
