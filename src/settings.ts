/**
 * Settings (docs/SPEC.md 2.2): the text of a field as a number, the fields of
 * Settings as a typed `Settings`, which sonars the boat has, and the messages
 * of Settings and of the equipment. Nothing here finds an element: a function
 * takes the values of the fields it reads (`RawFields`, by field id) and
 * returns what it writes, as a `SectionView` by element id. Two things the
 * earlier page writes to elements it finds by attribute stay with the shell,
 * which asks this module what to write: the mark on the source line of a
 * changed angle (`isModified`) and the hiding of an element that is marked
 * with sonars (`hiddenFor`).
 */
import type {
  ConeSetting,
  ElementPatch,
  Equipment,
  LiveData,
  Preset,
  RawFields,
  SectionView,
  Settings,
  SettingsMessages,
} from "./types";

/**
 * The elements the views of this module write, by id. The four `a…-err`
 * elements are made by the script, inside the angle cards that
 * `transducers.ts` writes.
 */
export const KEYS = [
  "dep-err",
  "sog-err",
  "ssr-err",
  "atr-err",
  "zt-err",
  "a2d-err",
  "ads-err",
  "ass-err",
  "aat-err",
  "mnt-err",
  "sec-cmp",
  "eq-err",
] as const;

/** The value of the field `sogu` for a speed in knots; any other value is km/h. */
export const KNOTS = "kn";

/** Metres in a nautical mile and seconds in an hour, which turn knots into metres a second. */
const METRES_PER_NAUTICAL_MILE = 1852;
const SECONDS_PER_HOUR = 3600;

/** The km/h that are one metre a second. */
const KMH_PER_METRE_A_SECOND = 3.6;

/** The value of the field `at-n` for two live sonar transducers. */
const TWO_TRANSDUCERS = "2";

/** The limits of the checks of the angles, in degrees. Every angle also has the lower limit 0. */
const LIMITS = {
  /** A 2D cone angle stays under this. */
  cone: 120,
  /** A down imaging fan stays under this. */
  down: 150,
  /** A fan thickness, of down or side imaging, stays under this. */
  thickness: 30,
  /** A side imaging fan stays under this. */
  side: 91,
  /** Straight down: the upper edge plus the widest side fan reaches this at most. */
  straightDown: 90,
  /** The live sonar fan is this wide at most. */
  liveWidth: 180,
  /** The live sonar slice stays under this. */
  liveThickness: 90,
  /** A mount angle of the live sonar: the flat one stays under this, the forward one reaches it at most. */
  mount: 90,
} as const;

/** The message of each check of Settings, word for word as the earlier page has it. */
const MESSAGES: SettingsMessages = {
  dep: "Enter a depth greater than 0 m.",
  sog: "Enter a speed greater than 0.",
  ssr: "Enter a range greater than 0 m.",
  atr: "Enter a range greater than 0 m.",
  zt: "Enter 0 m or more.",
  a2d: "Cone angles must be between 0° and 120°.",
  ads: "Fan angles must be between 0° and 150°, the thickness between 0° and 30°.",
  ass: "The upper edge plus the widest fan must stay within 90° (straight down), and the thickness between 0° and 30°.",
  aat: "Fan width 0–180°, slice thickness 0–90°.",
  mnt: "Both mount angles must be from 0° to 90° below horizontal.",
};

/** The message of the equipment when no sonar is ticked. */
const NO_SONAR = "Tick at least one sonar to see its sections.";

/**
 * The text of a field as a number (`num`, line 11; docs/SPEC.md 3.1, "Input
 * parsing"): the text is trimmed, an empty text gives NaN, the first comma
 * becomes a dot, anything `Number()` accepts is accepted (`1e3`, `0x10`), and a
 * result that is not finite gives NaN. `undefined` is a field that is not on
 * the page, which gives NaN.
 */
export function num(value: string | undefined): number {
  if (value === undefined) return Number.NaN;
  const text = value.trim().replace(",", ".");
  if (text === "") return Number.NaN;
  const v = Number(text);
  return Number.isFinite(v) ? v : Number.NaN;
}

/**
 * The text of a field, or undefined for a field that is not there. A tick box
 * has no text: where the earlier page reads a number from one it gets the
 * text "on", which is no number either.
 */
function textOf(raw: RawFields, id: string): string | undefined {
  const value = raw[id];
  return typeof value === "string" ? value : undefined;
}

/**
 * Which sonars the boat has (`EQ`, lines 236 to 239). Reads the tick boxes
 * `eq-ss`, `eq-2d`, `eq-ds` and `eq-at` and the field `at-n`; `live` is the
 * chosen live sonar (`livePreset()` of `transducers.ts`). The earlier page
 * always has these fields; one that `raw` does not have is read as not ticked,
 * and as one transducer.
 */
export function equipment(raw: RawFields, live: Pick<LiveData, "dual">): Equipment {
  const ticked = (id: string): boolean => raw[id] === true;
  const at = ticked("eq-at");
  const dual = at && live.dual;
  return {
    ss: ticked("eq-ss"),
    "2d": ticked("eq-2d"),
    ds: ticked("eq-ds"),
    at,
    dual,
    atw: dual && raw["at-n"] === TWO_TRANSDUCERS,
  };
}

/**
 * The fields of Settings as numbers (`A`, lines 240 to 248). Reads the twelve
 * number fields `dep`, `sog`, `ssr`, `atr`, `zt`, `dst`, `sso`, `sst`, `atw`,
 * `att`, `atsb` and `atfa`, the unit `sogu`, and one field `cone<i>`,
 * `down<i>` or `side<i>` for each frequency of `preset`, which is the
 * transducer the page calculates with (`combined()` of `transducers.ts`).
 * Nothing is checked here: a field without a number gives NaN. The earlier
 * page always has the unit field; without it in `raw` the unit is empty, which
 * is km/h.
 */
export function parseSettings(raw: RawFields, preset: Preset): Settings {
  const n = (id: string): number => num(textOf(raw, id));
  const sog = n("sog");
  const sogu = textOf(raw, "sogu") ?? "";
  const side = preset.side.map(
    (c, i): ConeSetting => ({ f: c.f, r: c.r, a: n(`side${i}`), def: c.a }),
  );
  return {
    dep: n("dep"),
    sog,
    ssr: n("ssr"),
    atr: n("atr"),
    zt: n("zt"),
    dst: n("dst"),
    sso: n("sso"),
    sst: n("sst"),
    atw: n("atw"),
    att: n("att"),
    atsb: n("atsb"),
    atfa: n("atfa"),
    sogu,
    ms:
      sogu === KNOTS
        ? (sog * METRES_PER_NAUTICAL_MILE) / SECONDS_PER_HOUR
        : sog / KMH_PER_METRE_A_SECOND,
    cone: preset.cone.map(
      (c, i): ConeSetting => ({ f: c.f, n: c.n, r: c.r, a: n(`cone${i}`), def: c.a }),
    ),
    down: preset.down.map((c, i): ConeSetting => ({ f: c.f, r: c.r, a: n(`down${i}`), def: c.a })),
    side,
    swmax: Math.max(...side.map((c) => c.a)),
  };
}

/** Whether `v` is over `lo` and under `hi`; false for NaN. */
const within = (v: number, lo: number, hi: number): boolean => v > lo && v < hi;

/** Whether every angle of a list is over `lo` and under `hi`. */
const allWithin = (list: readonly ConeSetting[], lo: number, hi: number): boolean =>
  list.every((c) => within(c.a, lo, hi));

/**
 * The message of each check of Settings (`checkSettings`, lines 249 to 263):
 * empty where the check passes. The depth and the speed are always checked,
 * the others only when their sonar is ticked. Reads of `a` the numbers of the
 * twelve number fields, the three lists and `swmax`, and of `eq` the flags
 * `ss`, `2d`, `ds` and `at`.
 */
export function checkSettings(a: Settings, eq: Equipment): SettingsMessages {
  const said = (passes: boolean, key: keyof SettingsMessages): string =>
    passes ? "" : MESSAGES[key];
  return {
    dep: said(a.dep > 0, "dep"),
    sog: said(a.sog > 0, "sog"),
    ssr: said(!eq.ss || a.ssr > 0, "ssr"),
    atr: said(!eq.at || a.atr > 0, "atr"),
    zt: said(!eq.at || a.zt >= 0, "zt"),
    a2d: said(!eq["2d"] || allWithin(a.cone, 0, LIMITS.cone), "a2d"),
    ads: said(
      !eq.ds || (allWithin(a.down, 0, LIMITS.down) && within(a.dst, 0, LIMITS.thickness)),
      "ads",
    ),
    ass: said(
      !eq.ss ||
        (allWithin(a.side, 0, LIMITS.side) &&
          a.sso >= 0 &&
          a.sso + a.swmax <= LIMITS.straightDown &&
          within(a.sst, 0, LIMITS.thickness)),
      "ass",
    ),
    aat: said(
      !eq.at || (a.atw > 0 && a.atw <= LIMITS.liveWidth && within(a.att, 0, LIMITS.liveThickness)),
      "aat",
    ),
    mnt: said(
      !eq.at || (a.atsb >= 0 && a.atsb < LIMITS.mount && a.atfa >= 0 && a.atfa <= LIMITS.mount),
      "mnt",
    ),
  };
}

/** A message in its element, which is hidden when there is none (`showErr`, line 12). */
function shownIn(message: string): ElementPatch {
  return { text: message, hidden: message === "" };
}

/**
 * Where the messages of Settings go (`checkSettings`, line 264): each to the
 * element named after its check, `<check>-err`. `messages` is
 * `checkSettings()`.
 */
export function settingsView(messages: SettingsMessages): SectionView {
  const view: Record<string, ElementPatch> = {};
  for (const [check, message] of Object.entries(messages)) view[`${check}-err`] = shownIn(message);
  return view;
}

/**
 * Whether the source line of an angle is marked as changed (`checkSettings`,
 * line 265): the field's number is not the preset's. `value` is the text of
 * the angle's field, `def` its `data-def` attribute (`null`: it has none). The
 * shell sets the class `mod` on each `[data-src]` element whose field is on
 * the page. A field without a number is marked.
 */
export function isModified(value: string, def: string | null): boolean {
  return num(value) !== Number(def);
}

/**
 * Whether an element that is marked with sonars is hidden (`applyEq`, line
 * 269): it is shown when one of them is ticked. `tokens` is its `data-eq`
 * attribute, the keys of `Equipment` separated by spaces. The shell writes it
 * to each `[data-eq]` element.
 */
export function hiddenFor(eq: Equipment, tokens: string): boolean {
  const flags: Readonly<Record<string, boolean>> = { ...eq };
  return !tokens.split(" ").some((token) => flags[token]);
}

/**
 * With and without a sonar (`applyEq`, lines 270 to 272): All beams compared
 * is hidden, and the equipment says so, when no sonar is ticked. Reads
 * `eq.ss`, `eq["2d"]`, `eq.ds` and `eq.at`.
 */
export function equipmentView(eq: Equipment): SectionView {
  const hasSonar = eq.ss || eq["2d"] || eq.ds || eq.at;
  return {
    "sec-cmp": { hidden: !hasSonar },
    "eq-err": shownIn(hasSonar ? "" : NO_SONAR),
  };
}
