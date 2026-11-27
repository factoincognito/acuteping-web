/**
 * How the page writes numbers, distances and angles, and the small shared
 * helpers of the earlier page's lines 8 to 23, 274 and 468. Nothing here reads
 * the page or the visitor's locale: the locale is given.
 */
import type { Formatter, LineStyle } from "./types";

/** What stands in place of a value that is not a finite number. */
export const NO_VALUE = "—";

/** From this many metres a distance is written as a grouped whole number. */
export const WHOLE_METRES_FROM = 1000;

/**
 * A formatter for one locale. `undefined` is the locale of whoever runs the
 * code, which only the shell asks for.
 */
export function createFormatter(locale: string | undefined): Formatter {
  const byDigits = new Map<number, Intl.NumberFormat>();
  const num = (n: number, digits: number): string => {
    let format = byDigits.get(digits);
    if (!format) {
      format = new Intl.NumberFormat(locale, {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
        useGrouping: false,
      });
      byDigits.set(digits, format);
    }
    return format.format(n);
  };
  const fmt = (v: number): string =>
    Number.isFinite(v) ? num(v, Math.abs(v) < 1 ? 2 : 1) : NO_VALUE;
  const dist = (v: number): string =>
    v < WHOLE_METRES_FROM ? `${fmt(v)} m` : `${Math.round(v).toLocaleString(locale)} m`;
  return { num, fmt, dist };
}

/** Degrees to radians. */
export const rad = (a: number): number => (a * Math.PI) / 180;

/** Radians to degrees. */
export const deg = (r: number): number => (r * 180) / Math.PI;

/** The ranges, in metres, a SideScan picture is drawn to. */
export const RANGE_STEPS_SS: readonly number[] = [
  10, 15, 20, 25, 30, 40, 50, 60, 80, 100, 120, 150,
];

/** The ranges, in metres, the other pictures are drawn to. */
export const RANGE_STEPS: readonly number[] = [5, 10, 15, 20, 25, 30, 40, 50, 60, 80, 100, 150];

/** Beyond the last step a range is the next whole multiple of this. */
export const RANGE_STEP_BEYOND = 50;

function firstStep(steps: readonly number[], v: number): number {
  for (const step of steps) if (step >= v) return step;
  return Math.ceil(v / RANGE_STEP_BEYOND) * RANGE_STEP_BEYOND;
}

/** The smallest SideScan range step that holds `v`. */
export function niceRangeSS(v: number): number {
  return firstStep(RANGE_STEPS_SS, v);
}

/** The smallest range step that holds `v`. */
export function niceRange(v: number): number {
  return firstStep(RANGE_STEPS, v);
}

/** The dash pattern that is shown as a dotted line. */
export const DASH_DOTTED = "2 3";

/** The dash pattern that is shown as a double line. */
export const DASH_DOUBLE = "10 3 2 3";

/** The border style that stands for a beam's dash pattern; no pattern is a solid line. */
export function lineStyle(dash: string | null | undefined): LineStyle {
  if (!dash) return "solid";
  if (dash === DASH_DOTTED) return "dotted";
  return dash === DASH_DOUBLE ? "double" : "dashed";
}

/** The angles of a list of beams in whole degrees, as "20° / 60°". */
export function degList(f: Formatter, list: readonly { readonly a: number }[]): string {
  return list.map((c) => `${f.num(c.a, 0)}°`).join(" / ");
}

/** The markup of a result list: one row for each term and its value. */
export function dl(rows: readonly (readonly [string, string])[]): string {
  return rows.map((r) => `<div><dt>${r[0]}</dt><dd>${r[1]}</dd></div>`).join("");
}
