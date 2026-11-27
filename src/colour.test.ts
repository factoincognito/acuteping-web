/**
 * Every expected value below is what the earlier page's own lines return
 * (legacy/src/p2.js lines 15 to 18, 858 and 1225), run in Node. Line 858 reads
 * a colour back from a canvas; for it the lines were run on what the canvas
 * reads back: recorded in fixtures/legacy for the colours the page uses, and
 * written from the HTML rule (#rrggbb when opaque, "rgba(r, g, b, a)"
 * otherwise) for the other forms.
 */
import dark from "../fixtures/legacy/all-open/dark/page.json";
import light from "../fixtures/legacy/all-open/light/page.json";
import { FALLBACK_GREY, hash, lerpColor, map2d, mapLive, parseColour, rgba } from "./colour";
import type { Rgb } from "./types";

describe("hash: the noise of the simulated screens", () => {
  it.each([
    [0, 0, 0],
    [1, 0, 0.5081244610501743],
    [0, 1, 0.7682745544631674],
    [1, 1, 0.6638511737491589],
    [10, 20, 0.189787503376088],
    [-3, 7, 0.031008727622918952],
    [123456, 654321, 0.7357713137138102],
    [399, 139, 0.9731876694069215],
  ])("hash(%p, %p) is %p, to the last bit", (x, y, expected) => {
    expect(hash(x, y)).toBe(expected);
  });

  it("takes the whole part of a fraction and 0 for NaN, as Math.imul does", () => {
    expect(hash(1.7, 2.2)).toBe(0.8830856904115262);
    expect(hash(NaN, 5)).toBe(0.1833162089305269);
  });
});

describe("mapLive: the palette of the live sonar", () => {
  it.each<[number, Rgb]>([
    [0, [0, 0, 0]],
    [0.1, [40, 18, 2]],
    [0.25, [84, 47, 10]],
    [0.5, [146, 97, 30]],
    [0.75, [203, 148, 57]],
    [0.9, [234, 179, 76]],
    [1, [255, 200, 90]],
  ])("mapLive(%p) is %p", (intensity, expected) => {
    expect(mapLive(intensity)).toEqual(expected);
  });

  it("clamps the intensity to 0 and 1", () => {
    expect(mapLive(-1)).toEqual([0, 0, 0]);
    expect(mapLive(2)).toEqual([255, 200, 90]);
  });

  it("gives NaN in every channel for NaN", () => {
    expect(mapLive(NaN)).toEqual([NaN, NaN, NaN]);
  });
});

describe("map2d and lerpColor: the palette of the 2D sonar", () => {
  it("has the stops of the earlier page", () => {
    expect(map2d).toEqual([
      [6, 16, 28],
      [20, 60, 120],
      [60, 120, 200],
      [210, 70, 40],
      [255, 205, 60],
      [255, 250, 215],
    ]);
  });

  it.each<[number, Rgb]>([
    [0, [6, 16, 28]],
    [0.1, [13, 38, 74]],
    [0.2, [20, 60, 120]],
    [0.25, [30, 75, 140]],
    [0.5, [135, 95, 120]],
    [0.6, [210, 70, 40]],
    [0.99, [255, 248, 207]],
    [1, [255, 250, 215]],
  ])("lerpColor(map2d, %p) is %p", (intensity, expected) => {
    expect(lerpColor(map2d, intensity)).toEqual(expected);
  });

  it("clamps the intensity to 0 and 1", () => {
    expect(lerpColor(map2d, -1)).toEqual([6, 16, 28]);
    expect(lerpColor(map2d, 2)).toEqual([255, 250, 215]);
  });

  it("goes through any list of two or more stops", () => {
    const grey: Rgb[] = [
      [0, 0, 0],
      [255, 255, 255],
    ];
    expect(lerpColor(grey, 0.5)).toEqual([128, 128, 128]);
    expect(lerpColor(grey, 0.3)).toEqual([77, 77, 77]);
    expect(
      lerpColor(
        [
          [10, 20, 30],
          [20, 40, 60],
          [0, 0, 0],
        ],
        0.75,
      ),
    ).toEqual([10, 20, 30]);
  });

  it("throws a TypeError for NaN and for fewer than two stops, as the earlier page does", () => {
    expect(() => lerpColor(map2d, NaN)).toThrow(TypeError);
    expect(() => lerpColor([[10, 20, 30]], 0.5)).toThrow(TypeError);
    expect(() => lerpColor([], 0.5)).toThrow(TypeError);
  });
});

describe("parseColour: the channels of a colour", () => {
  it.each<[string, Rgb]>([
    ["#2a78d6", [42, 120, 214]],
    ["#ffffff", [255, 255, 255]],
    ["#000000", [0, 0, 0]],
    ["#0e1514", [14, 21, 20]],
    ["rgba(10, 20, 30, 0.5)", [10, 20, 30]],
    ["rgba(255, 220, 160, 0.35)", [255, 220, 160]],
    ["rgba(10, 20, 30, 0)", [10, 20, 30]],
  ])("reads %p, a form a canvas reads back, as %p", (colour, expected) => {
    expect(parseColour(colour)).toEqual(expected);
  });

  it.each<[string, Rgb]>([
    ["#ABC", [170, 187, 204]],
    ["#abc", [170, 187, 204]],
    ["#abcd", [170, 187, 204]],
    ["#abcf", [170, 187, 204]],
    ["#0A141E", [10, 20, 30]],
    ["  #0a141e  ", [10, 20, 30]],
    ["#11223380", [17, 34, 51]],
    ["#112233ff", [17, 34, 51]],
    ["#112233FF", [17, 34, 51]],
  ])("reads the hex form %p as %p", (colour, expected) => {
    expect(parseColour(colour)).toEqual(expected);
  });

  it.each<[string, Rgb]>([
    ["rgb(10, 20, 30)", [10, 20, 30]],
    ["rgb(10,20,30)", [10, 20, 30]],
    ["RGB(10, 20, 30)", [10, 20, 30]],
    ["rgb( 10 , 20 , 30 )", [10, 20, 30]],
    ["rgb(10 20 30)", [10, 20, 30]],
    ["rgb(0, 0, 0)", [0, 0, 0]],
    ["rgb(255, 255, 255)", [255, 255, 255]],
    ["rgba(10, 20, 30, 1)", [10, 20, 30]],
    ["rgba(10,20,30,0.5)", [10, 20, 30]],
    ["rgba(10, 20, 30, .5)", [10, 20, 30]],
    ["rgb(10 20 30 / 0.5)", [10, 20, 30]],
    ["rgb(10 20 30 / 50%)", [10, 20, 30]],
    ["rgba(255,220,160,0.35)", [255, 220, 160]],
  ])("reads the rgb form %p as %p", (colour, expected) => {
    expect(parseColour(colour)).toEqual(expected);
  });

  it("clamps a channel to 0 and 255 and rounds a fraction", () => {
    expect(parseColour("rgb(300, -20, 30)")).toEqual([255, 0, 30]);
    expect(parseColour("rgb(12.4, 12.6, 0)")).toEqual([12, 13, 0]);
  });

  // The earlier page has this grey only for a canvas that reads back no digits.
  // It gives a colour name its colour and black for text that is no colour,
  // both through the canvas; the specification (2.2) gives grey for both.
  it.each([
    "",
    "red",
    "transparent",
    "hsl(120, 50%, 50%)",
    "rgb(50%, 0%, 0%)",
    "#12",
    "#12345",
    "#1234567",
    "#gggggg",
    "rgb(1, 2)",
    "rgb(1, 2 3)",
    "rgb(1, 2, 3",
    "var(--s1)",
    "none",
  ])("falls back to grey for %p, which is not hex, rgb() or rgba()", (colour) => {
    expect(FALLBACK_GREY).toEqual([128, 128, 128]);
    expect(parseColour(colour)).toEqual([128, 128, 128]);
  });

  // The colours the earlier page parsed in the recordings, with what its line
  // 858 returned for what the canvas read back.
  const recorded: Record<string, Rgb> = {
    "#2a78d6": [42, 120, 214],
    "#1baf7a": [27, 175, 122],
    "#eb6834": [235, 104, 52],
    "#c98500": [201, 133, 0],
    "#d55181": [213, 81, 129],
    "#e34948": [227, 73, 72],
    "#008300": [0, 131, 0],
    "#4a3aa7": [74, 58, 167],
    "#d9d2c3": [217, 210, 195],
    "#9a5a00": [154, 90, 0],
    "#ffffff": [255, 255, 255],
    "#3987e5": [57, 135, 229],
    "#199e70": [25, 158, 112],
    "#d95926": [217, 89, 38],
    "#e66767": [230, 103, 103],
    "#2e9e2e": [46, 158, 46],
    "#9085e9": [144, 133, 233],
    "#3a352b": [58, 53, 43],
    "#e6a640": [230, 166, 64],
    "#162120": [22, 33, 32],
  };

  it("reads every colour the recordings of the earlier page hold as that page did", () => {
    const seen = new Set<string>();
    for (const page of [light, dark]) {
      for (const canvas of page.canvases.made.distinct) {
        const set = canvas.log.find((entry) => entry[0] === "=fillStyle")?.[1];
        const readBack = canvas.log.find((entry) => entry[0] === "?fillStyle")?.[1];
        if (set === undefined || readBack === undefined) {
          throw new Error("a recorded canvas has no colour set or read back");
        }
        // The canvas left each of them as it was written.
        expect(readBack).toBe(set);
        expect(parseColour(set)).toEqual(recorded[set]);
        seen.add(set);
      }
    }
    expect([...seen].sort()).toEqual(Object.keys(recorded).sort());
  });
});

describe("rgba: a colour with an opacity", () => {
  it.each([
    ["#2a78d6", 0.16, "rgba(42,120,214,0.16)"],
    ["#2a78d6", 0.55, "rgba(42,120,214,0.55)"],
    ["#d9d2c3", 0.55, "rgba(217,210,195,0.55)"],
    ["#ffffff", 1, "rgba(255,255,255,1)"],
    ["#000000", 0, "rgba(0,0,0,0)"],
    ["rgba(10,20,30,0.5)", 0.25, "rgba(10,20,30,0.25)"],
  ])("rgba(%p, %p) is %p", (colour, opacity, expected) => {
    expect(rgba(colour, opacity)).toBe(expected);
  });

  it("uses the fallback grey for text that is not a colour", () => {
    expect(rgba("", 0.5)).toBe("rgba(128,128,128,0.5)");
  });
});
