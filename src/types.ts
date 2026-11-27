/**
 * The shared types of the calculator (docs/SPEC.md 2.2). Types only: this file
 * has no code and no import, so every module may import it and no import cycle
 * can pass through it. A type that a module needs and that is not here is
 * added here, never imported from another module.
 */

/**
 * Formats numbers the way the page shows them, in one locale. `format.ts`
 * builds one from a locale; the shell passes the visitor's.
 */
export interface Formatter {
  /** `n` with exactly `digits` decimals and no grouping. */
  num(n: number, digits: number): string;
  /** A value as the page shows it: two decimals under 1, one from 1, a dash when it is not finite. */
  fmt(v: number): string;
  /** A distance in metres with its unit: as `fmt` under 1000 m, a grouped whole number from there. */
  dist(v: number): string;
}

/** The border style of a beam's line sample. */
export type LineStyle = "solid" | "dotted" | "double" | "dashed";

/** Red, green and blue, each 0 to 255. */
export type Rgb = readonly [number, number, number];

/** What the page saves of one `[data-save]` field: a tick box's state, or the field's text. */
export type SavedValue = string | boolean;

/**
 * The view state the page saves next to its fields. The keys are the ones the
 * saved JSON has, so a state saved by the earlier page still loads.
 */
export interface UiState {
  /** The sections that are open, by section. */
  open: Record<string, boolean>;
  /** The bottom chosen in Light and shadow. */
  lsB: string;
  /** The beam angle chosen in Light and shadow. */
  lsA: string;
  /** The SideScan tool: an object on the bottom, or a suspended one. */
  ssMode: string;
  /** The index of the chosen SideScan frequency, as text. */
  ssf: string;
  /** The index of the chosen 2D frequency, as text. */
  f2d: string;
  /** The index of the chosen DownScan frequency, as text. */
  fds: string;
  /** The screen chosen in Distance behind the boat. */
  db: string;
  /** The depth of the relative-error graph, in metres. */
  relDepth: number;
  /** The depths drawn in the error graph, by depth in metres. */
  errOn: Record<string, boolean>;
  /** The beams drawn in the view from behind, by beam. */
  behind: Record<string, boolean>;
  /** The beams drawn in the footprints view, by beam. */
  fp: Record<string, boolean>;
  /** The cards inside the sections that are open, by card. */
  sub: Record<string, boolean>;
}

/** The value kept under the storage key. */
export interface SavedState {
  /** The value of every `[data-save]` field, by the field's id. */
  v: Record<string, SavedValue>;
  ui: UiState;
}

/** The part of a `Storage` that loading and saving use. */
export interface StateStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** What restoring a saved value writes to its field. */
export type FieldRestore = { readonly checked: boolean } | { readonly value: string };

/** One `[data-save]` field as the shell reads it when it saves. */
export interface SavedField {
  readonly id: string;
  readonly value: SavedValue;
}

/** A level of the confidence scale: 5 is a checked manufacturer specification, 1 an example. */
export type Confidence = 1 | 2 | 3 | 4 | 5;

/** One entry of the source registry. */
export interface Source {
  /** The title the page shows. */
  readonly t: string;
  /** The address of the source. */
  readonly u: string;
}

/** One frequency of a transducer as its preset gives it, before it has a confidence level. */
export interface ConeData {
  /** The frequency as the page shows it. */
  readonly f: string;
  /** The name of the frequency, where it has one. */
  readonly n?: string;
  /** The beam angle in degrees. */
  readonly a: number;
  /** The greatest depth, or range to each side, in metres, where the specification gives one. */
  readonly r?: number;
  /** Where the angle comes from, as the page shows it. */
  readonly src: string;
}

/** One frequency of a transducer: its figures, how sure they are and where they come from. */
export interface Cone extends ConeData {
  /** The confidence level of the angle. */
  readonly c: Confidence;
  /** The key of the angle's source in the source registry, or empty. */
  readonly s: string;
  /** The confidence level of the depth or range. */
  readonly rc?: Confidence;
  /** The key of the source of the depth or range in the source registry, or empty. */
  readonly rs?: string;
  /** Set on a frequency that the second transducer adds. */
  readonly sec?: boolean;
}

/** What a brand calls its side and its down imaging. */
export interface ImagingNames {
  readonly side: string;
  readonly down: string;
}

/** What a brand calls its live sonar, its flat mode and its wide mode (empty: it has none). */
export interface LiveNames {
  readonly live: string;
  readonly flat: string;
  readonly wide: string;
}

/** The names the page shows for the chosen transducers: the `[data-n]` texts. */
export interface Names extends ImagingNames {
  readonly live: string;
  readonly flat: string;
  /** The wide mode's name, never empty. */
  readonly wide: string;
}

/** An imaging transducer as its preset gives it: its frequencies by sonar and the fan's upper edge. */
export interface PresetData<C extends ConeData = ConeData> {
  readonly label: string;
  readonly names: ImagingNames;
  /** Where the figures come from, as the page shows it above the angles. */
  readonly note: string;
  /** The 2D frequencies. */
  readonly cone: readonly C[];
  /** The down imaging frequencies. */
  readonly down: readonly C[];
  /** The side imaging frequencies. */
  readonly side: readonly C[];
  /** The upper edge of the widest side fan, in degrees below horizontal. */
  readonly edge: number;
  /** Where the edge comes from. */
  readonly edgeSrc: string;
}

/**
 * The transducer the page calculates with: one imaging preset, or the first
 * with the frequencies a second one adds.
 */
export type Preset = PresetData<Cone>;

/** An imaging preset with its confidence levels and source keys. */
export interface RatedPreset extends Preset {
  /** The confidence level of the list of frequencies. */
  readonly fc: Confidence;
  /** The key of the source of the frequencies in the source registry, or empty. */
  readonly fs: string;
  /** The confidence level of the fan's upper edge. */
  readonly ec: Confidence;
}

/** An imaging preset as the page offers it: rated, with its brand and its short name. */
export interface ImagingPreset extends RatedPreset {
  /** The brand, which decides what can be combined with it. */
  readonly brand: string;
  /** The name that marks the frequencies it adds as a second transducer. */
  readonly short: string;
}

/** A live sonar as its preset gives it. */
export interface LiveData {
  readonly label: string;
  readonly names: LiveNames;
  /** Whether two transducers can be combined for the wide mode. */
  readonly dual: boolean;
  /** The fan width in degrees. */
  readonly w: number;
  /** The slice thickness in degrees. */
  readonly t: number;
  /** Where the width comes from. */
  readonly srcW: string;
  /** Where the thickness comes from. */
  readonly srcT: string;
}

/** A live sonar preset with its confidence levels and source keys. */
export interface LivePreset extends LiveData {
  /** The confidence level of the width. */
  readonly cw: Confidence;
  /** The key of the width's source in the source registry, or empty. */
  readonly sw: string;
  /** The confidence level of the thickness. */
  readonly ct: Confidence;
  /** The key of the thickness's source in the source registry, or empty. */
  readonly st: string;
}

/**
 * The values of the page's fields as the shell reads them, by the field's id:
 * a tick box's state, or the field's text. A field that is not on the page has
 * no entry.
 */
export type RawFields = Readonly<Record<string, SavedValue>>;

/** Which sonars the boat has: the four tick boxes of Settings and what the live sonar adds. */
export interface Equipment {
  /** Side imaging. */
  readonly ss: boolean;
  /** 2D sonar. */
  readonly "2d": boolean;
  /** Down imaging. */
  readonly ds: boolean;
  /** Live sonar. */
  readonly at: boolean;
  /** Live sonar that can take two transducers. */
  readonly dual: boolean;
  /** Live sonar with two transducers: the wide mode. */
  readonly atw: boolean;
}

/**
 * One frequency of the transducer as Settings has it: the angle from its field
 * next to the preset's. The preset's own entry is `Cone`.
 */
export interface ConeSetting {
  /** The frequency as the page shows it. */
  readonly f: string;
  /** The name of the frequency, where it has one; only a 2D frequency carries it. */
  readonly n?: string;
  /** The greatest depth, or range to each side, in metres, where the specification gives one. */
  readonly r?: number;
  /** The beam angle in degrees as its field has it; NaN when the field holds no number. */
  readonly a: number;
  /** The preset's beam angle in degrees. */
  readonly def: number;
}

/**
 * What the fields of Settings hold, as numbers. A number is NaN when its field
 * holds none; nothing here is checked against a range.
 */
export interface Settings {
  /** Depth under the transducer, in metres. */
  readonly dep: number;
  /** Speed over ground, in the unit `sogu`. */
  readonly sog: number;
  /** Side imaging range to each side, in metres. */
  readonly ssr: number;
  /** Live sonar range, in metres. */
  readonly atr: number;
  /** Depth of the live sonar transducer below the surface, in metres. */
  readonly zt: number;
  /** Thickness of the down imaging fan, front to back, in degrees. */
  readonly dst: number;
  /** Upper edge of the widest side fan, in degrees below horizontal. */
  readonly sso: number;
  /** Thickness of the widest side fan, front to back, in degrees. */
  readonly sst: number;
  /** Width of the live sonar fan, in degrees. */
  readonly atw: number;
  /** Thickness of the live sonar slice, in degrees. */
  readonly att: number;
  /** Center of the flat mode's beam, in degrees below horizontal. */
  readonly atsb: number;
  /** Center of the forward fan, in degrees below horizontal. */
  readonly atfa: number;
  /** The unit of the speed, as its field has it: `kn`, or anything else for km/h. */
  readonly sogu: string;
  /** The speed in metres a second. */
  readonly ms: number;
  /** The 2D frequencies. */
  readonly cone: readonly ConeSetting[];
  /** The down imaging frequencies. */
  readonly down: readonly ConeSetting[];
  /** The side imaging frequencies. */
  readonly side: readonly ConeSetting[];
  /** The widest side fan, in degrees. */
  readonly swmax: number;
}

/**
 * What Settings says about each of its checks: the message, or an empty text
 * when the check passes or its sonar is not ticked. A key with `-err` added is
 * the id of the element that shows the message.
 */
export interface SettingsMessages {
  /** The depth. */
  readonly dep: string;
  /** The speed. */
  readonly sog: string;
  /** The side imaging range. */
  readonly ssr: string;
  /** The live sonar range. */
  readonly atr: string;
  /** The depth of the live sonar transducer. */
  readonly zt: string;
  /** The 2D angles. */
  readonly a2d: string;
  /** The down imaging angles. */
  readonly ads: string;
  /** The side imaging angles. */
  readonly ass: string;
  /** The live sonar angles. */
  readonly aat: string;
  /** The mount angles of the live sonar. */
  readonly mnt: string;
}

/** How a function leaves one element of the page, as plain data: only what it writes. */
export interface ElementPatch {
  text?: string;
  html?: string;
  hidden?: boolean;
  classes?: readonly string[];
  attrs?: Readonly<Record<string, string>>;
  value?: string;
  checked?: boolean;
}

/** What a view writes, by the id of the element. */
export type SectionView = Readonly<Record<string, ElementPatch>>;

/** One figure of Data and sources, as the list and its dispute dialog both read it. */
export interface DataRow {
  /** The transducer the figure belongs to, as the page names it. */
  readonly who: string;
  /** What the figure is. */
  readonly name: string;
  /** The figure as the page shows it, with its unit. */
  readonly val: string;
  /** The confidence level of the figure (not always a level of the scale, and none for a depth or range without one). */
  readonly c: number | undefined;
  /** Where the figure comes from, as text. */
  readonly text: string;
  /** The source the figure names in the registry, if it names one. */
  readonly source: Source | undefined;
  /** Set on a figure of the preset named Other, which cannot be disputed. */
  readonly noDispute: boolean;
  /** The kind of figure the "?" button explains, if the figure has one. */
  readonly helpKey: string | undefined;
  /** The number the "?" button explains. */
  readonly helpValue: number | undefined;
}

/** One chip of the beam lists: a beam that can be switched on and off. */
export interface ChipItem {
  /** The beam's id (`data-bid`). */
  readonly id: string;
  /** The sonar the chip is marked with (`data-eq`), when that is not its group's. */
  readonly eq: string | null;
  /** The beam's colour (the `--c` of the chip). */
  readonly colour: string;
  /** Whether the beam is shown (`aria-pressed`). */
  readonly pressed: boolean;
  /** What the chip holds: the tick, the line sample and the name. */
  readonly html: string;
}

/** A group of chips: the beams of one kind of sonar. */
export interface ChipGroup {
  /** The sonar of the group (`data-eq`). */
  readonly eq: string;
  /** The group's heading. */
  readonly heading: string;
  readonly items: readonly ChipItem[];
}

/** What the legend of the beams shown says. */
export interface BeamLegend {
  /** How many of the beams of the sonars that are on are shown. */
  readonly count: string;
  /** The line sample and name of each beam shown, or the note that none is. */
  readonly html: string;
}

/** A point of an outline, in metres: across, then down or along. */
export type Point = readonly [number, number];

/** The corners of an outline in the order they are joined; the last joins the first. */
export type Polygon = readonly Point[];

/** The two edges of one side fan, in radians below horizontal. */
export interface SideAngles {
  /** The upper edge, which reaches furthest out. */
  readonly aOut: number;
  /** The lower edge, nearest to straight down. */
  readonly aIn: number;
}

/** Where a fan meets a flat bottom: its outline, seen from above, and its size. */
export interface FanFootprint {
  /** The outline: the edge on one side of the fan from end to end, then the other edge the way back. */
  readonly pts: Polygon;
  /** Half the width across, in metres. */
  readonly X: number;
  /** Half the length front to back at the centre, in metres. */
  readonly Lc: number;
  /** Half the length front to back at each end, in metres. */
  readonly Le: number;
}

/** A point in space, in metres: ahead, to starboard, down; the transducer is at the origin. */
export type Point3 = readonly [number, number, number];

/** The sonars a beam of the compared views belongs to: the keys of `Equipment` that hold a beam. */
export type BeamEquipment = "ss" | "2d" | "ds" | "at" | "atw";

/** The modes of the live sonar that have a beam of their own in the compared views: forward, flat and wide. */
export type LiveMode = "F" | "S" | "W";

/** The shape of a beam that is not a side fan: a cone, a fan that points straight down, or a live sonar slice. */
export type BeamKind = "cone" | "fan" | "at";

/** One beam of the compared views, as `beamList` of `beams.ts` makes it. */
export interface Beam {
  /** The key of the beam in the saved view state, such as `side0` or `livef`. */
  readonly id: string;
  /** The sonar the beam belongs to. */
  readonly eq: BeamEquipment;
  /** The name the page shows. */
  readonly name: string;
  /** The greatest depth, or range to each side, in metres, where the specification gives one. */
  readonly maxr?: number;
  /** A side fan: its width as a share of the widest fan's. */
  readonly kf?: number;
  readonly kind?: BeamKind;
  /** The width in degrees. */
  readonly ang?: number;
  /** The thickness in degrees. */
  readonly th?: number;
  /** A fan turned to lie along the keel. */
  readonly rot?: boolean;
  /** The mode of a live sonar beam that is not a plain fan. */
  readonly mode?: LiveMode;
  /** The colour as a style value, such as `var(--s3)`. */
  readonly col: string;
  /** The dash pattern of its line, or empty. */
  readonly dash: string;
}

/** The state of the 3D view that the visitor changes: the angles, the zoom and the stretch of the depth. */
export interface Scene3dState {
  /** Turn about the vertical, in radians. */
  readonly yaw: number;
  /** Tilt, in radians. */
  readonly pitch: number;
  /** Zoom, 1 at the start. */
  readonly zoom: number;
  /** Stretch of the depth: 1, 2 or 4. */
  readonly zx: number;
}

/** A triangle of the 3D scene: a sheet of a beam or a part of its footprint, and its fill. */
export interface Triangle3 {
  readonly p: readonly [Point3, Point3, Point3];
  /** The fill, as an `rgba()` text. */
  readonly f: string;
  /** Set on a part of a footprint on the bottom. */
  readonly foot?: true;
}

/** A line of the 3D scene: the outline of a sheet or of a footprint. */
export interface Line3 {
  readonly p: readonly Point3[];
  /** The colour. */
  readonly c: string;
  /** The line width. */
  readonly w: number;
  /** The dash pattern, or empty. */
  readonly d: string;
}

/** The beams as the 3D view draws them: built once for a state of the page, drawn at any angle. */
export interface Scene3d {
  readonly tris: readonly Triangle3[];
  readonly lines: readonly Line3[];
  /** The depth. */
  readonly H: number;
  /** Half the side of the square that is drawn, in metres. */
  readonly ext: number;
}

/**
 * What a section reads from the fields of its own, by the field's id: a number
 * field as the number `num()` of `settings.ts` gives for its text (NaN when it
 * holds none), a select as its value. A field that is not on the page has no
 * entry.
 */
export type SectionLocal = Readonly<Record<string, number | string>>;

/** The page's style as the shell resolves it from the computed styles. */
export interface Theme {
  /**
   * The value of each custom property of the page's root, trimmed, by the
   * property's name with its dashes, such as `--font-data`. Not only colours:
   * the fonts are custom properties too.
   */
  readonly colours: Readonly<Record<string, string>>;
}

/**
 * A mode of the live sonar whose beam the page draws: forward, down, flat, and
 * wide, which is the flat mode of two transducers.
 */
export type BeamMode = "F" | "D" | "S" | "W";

/** The members of a canvas's 2D context that the painters use. */
export type Ctx2D = Pick<
  CanvasRenderingContext2D,
  | "arc"
  | "beginPath"
  | "clearRect"
  | "closePath"
  | "createImageData"
  | "fill"
  | "fillRect"
  | "fillStyle"
  | "fillText"
  | "font"
  | "lineTo"
  | "lineWidth"
  | "measureText"
  | "moveTo"
  | "putImageData"
  | "setLineDash"
  | "stroke"
  | "strokeStyle"
  | "textAlign"
>;

/** A canvas as a painter gets it: its size in pixels and its 2D context. */
export interface Surface {
  readonly width: number;
  readonly height: number;
  /**
   * Sets the height, in pixels, and gives the context; resizing resets the
   * context, as setting the height of a canvas does.
   */
  resize(height: number): Ctx2D;
  readonly ctx: Ctx2D;
}
