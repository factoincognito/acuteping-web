/**
 * The beam chips and the legend (docs/SPEC.md 2.2): the pure parts of the
 * earlier page's lines 1837 to 1872. The line sample and the tick as strings
 * (`lineSw`, `TICK`), the view states a beam starts with (`chipDefaults`), the
 * groups of chips and what each shows (`chipGroups`) and the legend of the
 * beams that are drawn (`drawnLegend`). The elements, the wraps that are filled
 * (`[data-chipwrap]`), the clicks and the "Change" button of the legend stay in
 * the shell. The list of beams is given: `beams.ts` makes it.
 */
import { lineStyle } from "./format";
import type { BeamLegend, ChipGroup, ChipItem, Equipment, Names } from "./types";

/**
 * What the chips and the legend read of a beam. A `Beam` of `beams.ts` is
 * assignable to it (the test passes `beamList` and `cmpList` as they are), so
 * this module imports nothing of `beams.ts` and the two form no cycle.
 */
export interface ChipBeam {
  readonly id: string;
  /** The sonar the beam belongs to: `ss`, `2d`, `ds`, `at` or `atw`. */
  readonly eq: string;
  readonly name: string;
  readonly col: string;
  readonly dash?: string | null;
  /** A SideScan beam's angle as a fraction of the widest fan. */
  readonly kf?: number;
  /** The shape of the beam: `cone`, `fan` or `at`. */
  readonly kind?: string;
}

/** The sample of a beam's line: a short border in its colour and its line style (`lineSw`, line 1837). */
export function lineSw(b: Pick<ChipBeam, "col" | "dash">): string {
  return `<span class="sw" style="border-top:2.5px ${lineStyle(b.dash)} ${b.col}"></span>`;
}

/** The tick of a chip that is on (`TICK`, line 1838). */
export const TICK =
  '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6.5 L5 9 L10 3" fill="none" stroke="var(--surface)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/**
 * The view states the beams have before the user has chosen: a state that is
 * set is kept, whatever it is, and one that is not (`undefined`) gets its
 * default (the `forEach` of `buildChips`, line 1841). A beam is shown in the
 * view from behind unless its id starts `side1` or `side2`; it is shown in the
 * footprints when it has no fraction of the widest fan, is no live beam and
 * is not `down2`. The states given are not changed.
 */
export function chipDefaults(
  beams: readonly ChipBeam[],
  behind: Readonly<Record<string, boolean>>,
  fp: Readonly<Record<string, boolean>>,
): { behind: Record<string, boolean>; fp: Record<string, boolean> } {
  const outBehind: Record<string, boolean> = { ...behind };
  const outFp: Record<string, boolean> = { ...fp };
  for (const b of beams) {
    if (outBehind[b.id] === undefined) outBehind[b.id] = !/^side[12]/.test(b.id);
    if (outFp[b.id] === undefined) outFp[b.id] = !b.kf && b.kind !== "at" && b.id !== "down2";
  }
  return { behind: outBehind, fp: outFp };
}

/** The groups of chips, in order: the sonar they belong to (`fillChips`, line 1845). */
const GROUPS = ["ss", "2d", "ds", "at"] as const;

/**
 * The groups of chips for a list of beams (`fillChips`, lines 1844 to 1866):
 * one for each kind of sonar that has a beam, headed by its name, with a chip
 * for each beam, pressed when the beam is shown. A beam's name loses the
 * group's name and the space after it where it starts with them, except in the
 * group of the live sonar. The wide mode's chip is marked with its own sonar.
 */
export function chipGroups(
  names: Pick<Names, "side" | "down" | "live">,
  beams: readonly ChipBeam[],
  behind: Readonly<Record<string, boolean>>,
): ChipGroup[] {
  const headings = { ss: names.side, "2d": "2D", ds: names.down, at: names.live };
  const groups: ChipGroup[] = [];
  for (const eq of GROUPS) {
    const heading = headings[eq];
    const items: ChipItem[] = beams
      .filter((b) => b.eq === eq || (eq === "at" && b.eq === "atw"))
      .map((b) => {
        const name =
          b.name.startsWith(`${heading} `) && eq !== "at"
            ? b.name.slice(heading.length + 1)
            : b.name;
        return {
          id: b.id,
          eq: b.eq !== eq ? b.eq : null,
          colour: b.col,
          pressed: Boolean(behind[b.id]),
          html: `<span class="bx">${TICK}</span>${lineSw(b)}<span>${name}</span>`,
        };
      });
    if (items.length) groups.push({ eq, heading, items });
  }
  return groups;
}

/**
 * What the legend of the beams drawn says (`drawnLegend`, lines 1867 to 1870):
 * how many of the beams of the sonars that are on are shown, and a sample and
 * name for each beam shown, or that none is. The names are written as they are.
 */
export function drawnLegend(
  shown: readonly ChipBeam[],
  beams: readonly ChipBeam[],
  eq: Equipment,
): BeamLegend {
  // Read as the page reads it, `eq[b.eq]` on a plain object: a beam whose key is a name every
  // object has (`constructor`, `toString` ...) finds that property, which counts as on.
  const flags = eq as unknown as Readonly<Record<string, unknown>>;
  const all = beams.filter((b) => flags[b.eq]);
  return {
    count: `${shown.length} of ${all.length} shown`,
    html: shown.length
      ? shown.map((b) => `<span>${lineSw(b)}${b.name}</span>`).join("")
      : '<span class="none">No beams selected</span>',
  };
}
