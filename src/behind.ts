/**
 * Distance behind the boat (docs/SPEC.md 2.2): the earlier page's lines 1770
 * to 1794. What the section writes is a `SectionView` by element id
 * (`behindView`). It has no canvas. Nothing here finds an element or reads a
 * field: the section's own fields are given.
 */
import { NO_VALUE } from "./format";
import { checkSettings } from "./settings";
import type {
  ElementPatch,
  Equipment,
  Formatter,
  Names,
  SectionLocal,
  SectionView,
  Settings,
  UiState,
} from "./types";

/** The elements `behindView` writes, by id (the two buttons by their place in `#dbt`). */
export const KEYS = [
  "dbt > button:nth-child(1)",
  "dbt > button:nth-child(2)",
  "frac-l",
  "frac-hint",
  "sw-hint",
  "db-err",
  "db-out",
  "db-t",
  "db-v",
] as const;

/** The values of `ui.db` the two buttons stand for: the side screen, and the 2D or down screen. */
const SCREEN_SIDE = "ss";
const SCREEN_FLAT = "vs";

/** The section's own number fields: the crossing time in seconds, and the position in per cent. */
const FIELD_TIME = "tscr";
const FIELD_POSITION = "frac";

/**
 * What the view reads of a section's input (the `ViewInput` of docs/SPEC.md
 * 3.2, which has these six under the same names).
 */
interface BehindInput {
  readonly settings: Settings;
  readonly eq: Equipment;
  readonly ui: Pick<UiState, "db">;
  readonly names: Pick<Names, "side" | "down">;
  readonly local: SectionLocal;
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

/** A button as the page sets it: pressed when it stands for the screen shown. */
function button(value: string, screen: string): ElementPatch {
  return { attrs: { "aria-pressed": String(value === screen) } };
}

/** What the three results show while there is no distance to show. */
const NO_RESULT: SectionView = {
  "db-out": { text: NO_VALUE },
  "db-t": { text: NO_VALUE },
  "db-v": { text: NO_VALUE },
};

/**
 * What the section writes (`renderDB`, lines 1771 to 1793). The screen the
 * visitor chose falls back to the other one when its sonar is not ticked: side
 * imaging without a side imaging sonar shows the 2D or down screen, and that
 * without either shows side imaging. Any other value of `ui.db` presses no
 * button and shows the texts of the 2D or down screen.
 */
export function behindView(input: BehindInput): SectionView {
  const { settings: a, eq, ui, names, local, fmt: f } = input;
  let screen = ui.db;
  if (screen === SCREEN_SIDE && !eq.ss) screen = SCREEN_FLAT;
  if (screen === SCREEN_FLAT && !(eq["2d"] || eq.ds)) screen = SCREEN_SIDE;
  const side = screen === SCREEN_SIDE;
  const view: Record<string, ElementPatch> = {
    "dbt > button:nth-child(1)": button(SCREEN_SIDE, screen),
    "dbt > button:nth-child(2)": button(SCREEN_FLAT, screen),
    "frac-l": {
      text: side ? "Echo's distance from the top edge" : "Echo's distance from the right edge",
    },
    "frac-hint": {
      text: side
        ? `On the ${names.side} screen the newest ping is at the top. Halfway down is 50%, the bottom edge is 100%. Combine the result with the true horizontal distance from the ${names.side} section to get where the echo lies.`
        : `On 2D and ${names.down} the newest ping is at the right edge. Halfway across is 50%, the left edge is 100%.`,
    },
    "sw-hint": {
      text: side
        ? "Tap Start when a mark enters at the top edge, and Stop when it leaves the bottom edge. The time is filled in above. Measure again after changing range, depth or ping speed."
        : "Tap Start when a mark enters at the right edge, and Stop when it leaves the left edge. The time is filled in above. Measure again after changing range, depth or ping speed.",
    },
  };
  const T = localNumber(local, FIELD_TIME);
  const p = localNumber(local, FIELD_POSITION);
  let message = "";
  if (checkSettings(a, eq).sog) message = "Enter a speed in Settings.";
  else if (!(T > 0)) message = "Enter the crossing time in seconds.";
  else if (!(p >= 0 && p <= 100)) message = "Enter a position from 0 to 100%.";
  view["db-err"] = shownIn(message);
  if (message) return { ...view, ...NO_RESULT };
  const t = (T * p) / 100;
  return {
    ...view,
    "db-out": { text: `${f.fmt(a.ms * t)} m back` },
    "db-t": { text: `${f.fmt(t)} s ago` },
    "db-v": { text: `${f.num(a.ms, 2)} m/s` },
  };
}
