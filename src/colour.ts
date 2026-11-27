/**
 * The colour helpers of the earlier page's lines 15 to 18, 858 and 1225: the
 * noise and the palettes of the simulated screens, and the reading of a colour
 * into its channels. Nothing here touches a canvas.
 */
import type { Rgb } from "./types";

/** A number from 0 to 1 that is always the same for the same two whole numbers. */
export function hash(x: number, y: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967295;
}

function clamp01(intensity: number): number {
  return Math.max(0, Math.min(1, intensity));
}

/** The colour of the live sonar's palette for an intensity from 0 to 1. */
export function mapLive(intensity: number): Rgb {
  const i = clamp01(intensity);
  return [Math.round(255 * i ** 0.8), Math.round(200 * i ** 1.05), Math.round(90 * i ** 1.6)];
}

/** The stops of the 2D sonar's palette, from no echo to the strongest. */
export const map2d: readonly Rgb[] = [
  [6, 16, 28],
  [20, 60, 120],
  [60, 120, 200],
  [210, 70, 40],
  [255, 205, 60],
  [255, 250, 215],
];

/**
 * The colour between the stops of a palette for an intensity from 0 to 1.
 * Throws a TypeError for an intensity that is NaN and for fewer than two
 * stops, where the earlier page fails in the same way.
 */
export function lerpColor(stops: readonly Rgb[], intensity: number): Rgb {
  const n = stops.length - 1;
  const f = clamp01(intensity) * n;
  const i = Math.min(Math.floor(f), n - 1);
  const t = f - i;
  const from = stops[i];
  const to = stops[i + 1];
  if (!from || !to) throw new TypeError(`no colour stop at ${i} of ${stops.length}`);
  return [
    Math.round(from[0] + (to[0] - from[0]) * t),
    Math.round(from[1] + (to[1] - from[1]) * t),
    Math.round(from[2] + (to[2] - from[2]) * t),
  ];
}

/** The colour that stands for text that is not hex, `rgb()` or `rgba()`. */
export const FALLBACK_GREY: Rgb = [128, 128, 128];

const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/;
const NUMBER = "[+-]?(?:\\d+(?:\\.\\d+)?|\\.\\d+)(?:e[+-]?\\d+)?";
/** `rgb(r, g, b)` and `rgba(r, g, b, a)`, written with commas. */
const RGB_COMMAS = new RegExp(
  `^rgba?\\(\\s*(${NUMBER})\\s*,\\s*(${NUMBER})\\s*,\\s*(${NUMBER})\\s*(?:,\\s*${NUMBER}%?\\s*)?\\)$`,
);
/** `rgb(r g b)` and `rgb(r g b / a)`, written with spaces. */
const RGB_SPACES = new RegExp(
  `^rgba?\\(\\s*(${NUMBER})\\s+(${NUMBER})\\s+(${NUMBER})\\s*(?:/\\s*${NUMBER}%?\\s*)?\\)$`,
);

function channel(text: string | undefined): number {
  return Math.round(Math.max(0, Math.min(255, Number(text))));
}

function hexPair(text: string, at: number, width: number): number {
  const digits = text.slice(at, at + width);
  return Number.parseInt(width === 1 ? digits + digits : digits, 16);
}

/**
 * The red, green and blue of a colour written as hex (`#rgb`, `#rgba`,
 * `#rrggbb`, `#rrggbbaa`), `rgb()` or `rgba()` with numbers; its opacity is
 * left out. Any other text gives `FALLBACK_GREY`.
 */
export function parseColour(colour: string): Rgb {
  const text = colour.trim().toLowerCase();
  if (HEX.test(text)) {
    const width = text.length < 6 ? 1 : 2;
    return [
      hexPair(text, 1, width),
      hexPair(text, 1 + width, width),
      hexPair(text, 1 + 2 * width, width),
    ];
  }
  const m = RGB_COMMAS.exec(text) ?? RGB_SPACES.exec(text);
  return m ? [channel(m[1]), channel(m[2]), channel(m[3])] : FALLBACK_GREY;
}

/** A colour with an opacity, as the `rgba()` text a canvas takes. */
export function rgba(colour: string, opacity: number): string {
  const v = parseColour(colour);
  return `rgba(${v[0]},${v[1]},${v[2]},${opacity})`;
}
