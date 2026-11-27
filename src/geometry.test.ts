/**
 * The shared geometry against the earlier page (legacy/src/p2.js, lines 501 to
 * 516, 1084 to 1088, 1090 to 1093 and 1154 to 1160). Every expected value here
 * was printed by those lines themselves, taken unchanged by their line numbers
 * and run in Node over the same inputs (with lines 8 to 10 and 13 for `fmt` and
 * `rad`, a locale put in place of the visitor's, and a stand-in for the field
 * `ssalign`). None comes from the functions under test. The matcher tells -0
 * from 0 and takes NaN as equal to NaN, so the values are compared exactly.
 */
import { createFormatter } from "./format";
import {
  ALIGN_CENTER,
  clipBelow,
  fanPoly,
  hull,
  sectorPoly,
  ssAngles,
  ssCover,
  ssRange,
} from "./geometry";
import type { Point, Polygon } from "./types";

/** A list of points as one list of numbers: x, y, x, y and so on. */
const flat = (pts: Polygon): number[] => pts.flat();

/** The points at some places of a list, as one list of numbers; a place past the end gives none. */
const pick = (pts: Polygon, places: readonly number[]): number[] =>
  places.flatMap((i) => pts[i] ?? []);

/** The places at which a long sector is compared: its ends and its middle. */
const SECTOR_AT = [0, 1, 2, 25, 48, 49];

/** The places at which a fan is compared: its ends, its middles and where one edge ends and the other starts. */
const FAN_AT = [0, 1, 20, 40, 41, 61, 80, 81];

const square: Polygon = [
  [0, 0],
  [4, 0],
  [4, 4],
  [0, 4],
];

describe("clipBelow", () => {
  const cases: readonly (readonly [string, Polygon, number, Polygon])[] = [
    [
      "cuts the part deeper than the line off, with a new corner on each edge it crosses",
      square,
      2,
      [
        [0, 0],
        [4, 0],
        [4, 2],
        [0, 2],
      ],
    ],
    ["keeps an outline that is wholly above the line", square, 10, square],
    ["leaves nothing of an outline that is wholly below the line", square, -1, []],
    ["counts a corner on the line as kept", square, 4, square],
    [
      "repeats the two corners on the line when the rest is below it",
      square,
      0,
      [
        [0, 0],
        [4, 0],
        [4, 0],
        [0, 0],
      ],
    ],
    [
      "repeats a corner on the line that follows a corner below it",
      [
        [0, 0],
        [6, 9],
        [-3, 3],
      ],
      3,
      [
        [0, 0],
        [2, 3],
        [-3, 3],
        [-3, 3],
      ],
    ],
    [
      "cuts an outline that starts below the line and crosses it twice",
      [
        [1, 5],
        [3, 1],
        [7, 2],
        [6, 8],
        [2, 9],
      ],
      4.5,
      [
        [1.25, 4.5],
        [3, 1],
        [7, 2],
        [6.583333333333333, 4.5],
      ],
    ],
    ["gives no corner for no corner", [], 5, []],
    ["keeps a single corner above the line", [[2, 3]], 5, [[2, 3]]],
    ["drops a single corner below the line", [[2, 3]], 1, []],
    [
      "gives the crossing of a single edge twice, once each way",
      [
        [0, 0],
        [10, 8],
      ],
      2,
      [
        [0, 0],
        [2.5, 2],
        [2.5, 2],
      ],
    ],
    [
      "takes a corner whose depth is not a number as below the line, and its crossings as not a number",
      [
        [0, 0],
        [1, Number.NaN],
        [2, 0],
      ],
      1,
      [
        [0, 0],
        [Number.NaN, 1],
        [Number.NaN, 1],
        [2, 0],
      ],
    ],
    ["leaves nothing when the line is not a number", square, Number.NaN, []],
    ["keeps everything above an endless depth", square, Number.POSITIVE_INFINITY, square],
    ["leaves nothing above an endless height", square, Number.NEGATIVE_INFINITY, []],
    [
      "crosses at the first corner on the way to an endlessly deep one, and nowhere on the way back",
      [
        [0, 0],
        [1, Number.POSITIVE_INFINITY],
        [2, 0],
      ],
      5,
      [
        [0, 0],
        [0, 5],
        [Number.NaN, 5],
        [2, 0],
      ],
    ],
  ];

  test.each(cases)("%s", (_name, poly, depth, expected) => {
    expect(clipBelow(poly, depth)).toEqual(expected);
  });

  // A triangle at which the crossing, worked out another way round (the share
  // from the other end, or the product before the division), ends on another digit.
  test("to the last digit, puts each crossing where the share of the edge from its first corner puts it", () => {
    const cut = clipBelow(
      [
        [0.8, 2.7],
        [4.5, 8.6],
        [4, 5.5],
      ],
      3.1,
    );
    expect(cut).toEqual([
      [0.8, 2.7],
      [1.0508474576271187, 3.1],
      [1.2571428571428567, 3.1],
    ]);
    expect(cut[1]?.[0]).toBe(1.0508474576271187);
    expect(cut[2]?.[0]).toBe(1.2571428571428567);
  });

  test("leaves the outline it is given as it was", () => {
    const poly: Point[] = [
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
    ];
    clipBelow(poly, 2);
    expect(poly).toEqual(square);
  });
});

describe("sectorPoly", () => {
  test("is the apex and 49 points of the arc when the bottom is deeper than the arc", () => {
    expect(flat(sectorPoly(-0.5, 0.5, 10, 20))).toEqual([
      0, 0, -4.79425538604203, 8.775825618903728, -4.6103985285140245, 8.873794307300328,
      -4.424540702332587, 8.967911661775123, -4.23676257203938, 9.058136834259363,
      -4.047145635611248, 9.144430665938302, -3.855772189089106, 9.22675570424659,
      -3.6627252908604757, 9.305076219123142, -3.4680887256111266, 9.379358218518417,
      -3.2719469679615227, 9.449569463147377, -3.0743851458038085, 9.515679480481722,
      -2.875489003355281, 9.577659577975345, -2.6753448639443627, 9.635482855517232,
      -2.474039592545229, 9.689124217106448, -2.271660558077369, 9.738560381744092,
      -2.0682955954864104, 9.783769893537537, -1.8640329676226988, 9.824733131012554,
      -1.6589613269341505, 9.861432315629251, -1.4531696769900195, 9.893851519498194,
      -1.246747333852277, 9.92197667229329, -1.0397838873113556, 9.945795567358486,
      -0.8323691620031024, 9.965297867005594, -0.624593178423802, 9.980475107000991,
      -0.4165461138601911, 9.991320700239182, -0.20831826325142797, 9.997829939601688, 0, 10,
      0.20831826325142852, 9.997829939601688, 0.4165461138601905, 9.991320700239182,
      0.624593178423802, 9.980475107000991, 0.8323691620031028, 9.965297867005594,
      1.039783887311355, 9.945795567358486, 1.246747333852277, 9.92197667229329, 1.4531696769900202,
      9.893851519498194, 1.6589613269341499, 9.861432315629251, 1.8640329676226988,
      9.824733131012554, 2.068295595486411, 9.783769893537537, 2.2716605580773686,
      9.738560381744092, 2.474039592545229, 9.689124217106448, 2.6753448639443627,
      9.635482855517232, 2.875489003355281, 9.577659577975345, 3.0743851458038085,
      9.515679480481722, 3.2719469679615227, 9.449569463147377, 3.4680887256111266,
      9.379358218518417, 3.6627252908604757, 9.305076219123142, 3.8557721890891066,
      9.22675570424659, 4.047145635611247, 9.144430665938303, 4.23676257203938, 9.058136834259363,
      4.424540702332588, 8.967911661775123, 4.6103985285140245, 8.87379430730033, 4.79425538604203,
      8.775825618903728,
    ]);
  });

  const cut: readonly (readonly [string, readonly [number, number, number, number], number[]])[] = [
    [
      "is a triangle when the whole arc is below the bottom",
      [-0.5, 0.5, 10, 5],
      [0, 0, -2.731512449218952, 5, 2.731512449218952, 5],
    ],
    [
      "keeps the two ends of a wide arc that stay above the bottom",
      [-1.4, 1.4, 10, 5],
      [
        0, 0, -9.854497299884601, 1.6996714290024104, -9.738644441369429, 2.271300166112866,
        -9.589662535794119, 2.8352023648386555, -9.40805839173872, 3.389459735361174,
        -9.19444979253755, 3.93218679776358, -8.949563394695833, 4.461537296080847,
        -8.67423225594017, 4.97571047891727, -8.659341460662962, 5, 8.659341460662962, 5,
        8.674232255940169, 4.9757104789172715, 8.949563394695835, 4.461537296080845,
        9.19444979253755, 3.93218679776358, 9.40805839173872, 3.389459735361176, 9.589662535794119,
        2.8352023648386555, 9.738644441369429, 2.2713001661128636, 9.854497299884601,
        1.6996714290024144,
      ],
    ],
    [
      "cuts a fan to one side where it starts below the bottom",
      [0.9, 1.5, 40, 10],
      [
        0, 0, 12.601582175503394, 10, 38.72903502458828, 10, 38.79775453170748, 9.73315176586553,
        38.916384725356004, 9.247432071017222, 39.028934313066365, 8.760267483721659,
        39.13538570919446, 8.271734122454491, 39.235722280926225, 7.781908319559488,
        39.329928350876465, 7.290866609321803, 39.417989199538404, 6.798685716009642,
        39.499891067583604, 6.305442541886234, 39.57562115801181, 5.811214155194053,
        39.64516763815047, 5.316077778113009, 39.70851964150354, 4.8201107746946645,
        39.765667269449395, 4.323390638774264, 39.816601592787435, 3.8259949818624617,
        39.86131465313327, 3.328001521018718, 39.89979946416218, 2.8294880667081164,
      ],
    ],
    [
      "cuts the same fan to the other side where it ends below the bottom",
      [-1.5, -0.9, 40, 10],
      [
        0, 0, -39.89979946416218, 2.8294880667081164, -39.86131465313327, 3.328001521018718,
        -39.816601592787435, 3.8259949818624617, -39.765667269449395, 4.323390638774264,
        -39.70851964150354, 4.8201107746946645, -39.64516763815047, 5.316077778113009,
        -39.57562115801181, 5.811214155194053, -39.499891067583604, 6.305442541886234,
        -39.417989199538404, 6.798685716009642, -39.329928350876465, 7.290866609321803,
        -39.235722280926225, 7.781908319559488, -39.13538570919446, 8.271734122454491,
        -39.028934313066365, 8.760267483721659, -38.916384725356004, 9.247432071017222,
        -38.79775453170748, 9.73315176586553, -38.72903502458828, 10, -12.601582175503392, 10,
      ],
    ],
    [
      "runs the other way round when the angles are given the other way round",
      [0.5, -0.5, 10, 9],
      [
        0, 0, 4.79425538604203, 8.775825618903728, 4.6103985285140245, 8.873794307300328,
        4.424540702332587, 8.967911661775123, 4.357757918878934, 9, -4.357757918878935, 9,
        -4.424540702332588, 8.967911661775123, -4.6103985285140245, 8.87379430730033,
        -4.79425538604203, 8.775825618903728,
      ],
    ],
    [
      "is the apex three times when the bottom is at the surface",
      [-0.5, 0.5, 10, 0],
      [0, 0, 0, 0, 0, 0],
    ],
    ["is nothing when the bottom is above the surface", [-0.5, 0.5, 10, -1], []],
    ["is nothing when the depth is not a number", [-0.5, 0.5, 10, Number.NaN], []],
    [
      "is the apex and two crossings that are not a number when the range is not a number",
      [-0.5, 0.5, Number.NaN, 5],
      [0, 0, Number.NaN, 5, Number.NaN, 5],
    ],
    [
      "is the apex and two crossings that are not a number when an angle is not a number",
      [Number.NaN, 0.5, 10, 20],
      [0, 0, Number.NaN, 20, Number.NaN, 20],
    ],
  ];

  test.each(cut)("%s", (_name, [psi1, psi2, range, depth], expected) => {
    expect(flat(sectorPoly(psi1, psi2, range, depth))).toEqual(expected);
  });

  const long: readonly (readonly [string, readonly [number, number, number, number], number[]])[] =
    [
      [
        "repeats one point of the arc 49 times when the two angles are equal",
        [0.3, 0.3, 10, 20],
        [
          0, 0, 2.9552020666133956, 9.55336489125606, 2.9552020666133956, 9.55336489125606,
          2.9552020666133956, 9.55336489125606, 2.9552020666133956, 9.55336489125606,
          2.9552020666133956, 9.55336489125606,
        ],
      ],
      [
        "puts every point at the apex when the range is zero, with -0 across on the negative side",
        [-0.5, 0.5, 0, 20],
        [0, 0, -0, 0, -0, 0, 0, 0, 0, 0, 0, 0],
      ],
      [
        "mirrors the arc through the apex when the range is negative",
        [-0.5, 0.5, -10, 5],
        [
          0, 0, 4.79425538604203, -8.775825618903728, 4.6103985285140245, -8.873794307300328, -0,
          -10, -4.6103985285140245, -8.87379430730033, -4.79425538604203, -8.775825618903728,
        ],
      ],
    ];

  test.each(long)("%s", (_name, [psi1, psi2, range, depth], expected) => {
    const poly = sectorPoly(psi1, psi2, range, depth);
    expect(poly).toHaveLength(50);
    expect(pick(poly, SECTOR_AT)).toEqual(expected);
  });
});

describe("ssRange", () => {
  const cases: readonly (readonly [string, number, number | undefined, number])[] = [
    ["is the frequency's greatest range when that is the shorter", 40, 30, 30],
    ["is the range of Settings when that is the shorter", 40, 50, 40],
    ["is the range of Settings when the two are equal", 40, 40, 40],
    ["is the range of Settings when the frequency has no greatest range", 40, undefined, 40],
    ["takes a greatest range of zero as none", 40, 0, 40],
    ["takes a greatest range that is not a number as none", 40, Number.NaN, 40],
    ["is a negative greatest range, which is the shorter", 40, -5, -5],
    [
      "is the range of Settings when the greatest range is endless",
      40,
      Number.POSITIVE_INFINITY,
      40,
    ],
    ["is not a number when the range of Settings is not one", Number.NaN, 30, Number.NaN],
    [
      "is not a number when the range of Settings is not one and there is no greatest range",
      Number.NaN,
      undefined,
      Number.NaN,
    ],
    [
      "is the greatest range when the range of Settings is endless",
      Number.POSITIVE_INFINITY,
      30,
      30,
    ],
    ["is a range of Settings of zero", 0, 30, 0],
    ["is a negative range of Settings", -2, 30, -2],
  ];

  test.each(cases)("%s", (_name, ssr, maxr, expected) => {
    expect(ssRange({ ssr }, maxr)).toBe(expected);
  });
});

describe("ssAngles", () => {
  type Case = readonly [
    string,
    readonly [number, number, number],
    string | undefined,
    { aOut: number; aIn: number },
  ];
  const cases: readonly Case[] = [
    [
      "is the whole fan for the widest frequency, on a page without the field",
      [1, 5, 80],
      undefined,
      { aOut: 0.08726646259971647, aIn: 1.4835298641951802 },
    ],
    [
      "keeps the inner edge of a narrower fan on a page without the field",
      [0.5, 5, 80],
      undefined,
      { aOut: 0.7853981633974483, aIn: 1.4835298641951802 },
    ],
    [
      "keeps the inner edge of a narrower fan when the field says inner",
      [0.5, 5, 80],
      "inner",
      { aOut: 0.7853981633974483, aIn: 1.4835298641951802 },
    ],
    [
      "puts a narrower fan around the center line when the field says center",
      [0.5, 5, 80],
      "center",
      { aOut: 0.4363323129985824, aIn: 1.1344640137963142 },
    ],
    [
      "keeps the inner edge when the field is empty",
      [0.5, 5, 80],
      "",
      { aOut: 0.7853981633974483, aIn: 1.4835298641951802 },
    ],
    [
      "keeps the inner edge when the field says Center with a capital",
      [0.5, 5, 80],
      "Center",
      { aOut: 0.7853981633974483, aIn: 1.4835298641951802 },
    ],
    [
      "keeps the inner edge when the field says centre",
      [0.5, 5, 80],
      "centre",
      { aOut: 0.7853981633974483, aIn: 1.4835298641951802 },
    ],
    [
      "is the whole fan for the widest frequency around the center line too",
      [1, 5, 80],
      "center",
      { aOut: 0.08726646259971647, aIn: 1.4835298641951802 },
    ],
    [
      "keeps the inner edge of a fan of five sixteenths",
      [0.3125, 20, 64],
      "inner",
      { aOut: 1.117010721276371, aIn: 1.4660765716752369 },
    ],
    [
      "puts a fan of five sixteenths around the center line",
      [0.3125, 20, 64],
      "center",
      { aOut: 0.7330382858376184, aIn: 1.0821041362364843 },
    ],
    [
      "lets the upper edge go above horizontal at the inner edge",
      [0.5, -30, 40],
      "inner",
      { aOut: -0.17453292519943295, aIn: 0.17453292519943295 },
    ],
    [
      "stops the upper edge at horizontal around the center line",
      [0.5, -30, 40],
      "center",
      { aOut: 0, aIn: 0.3490658503988659 },
    ],
    [
      "lets a fan wider than the widest go above horizontal at the inner edge",
      [2, 5, 20],
      "inner",
      { aOut: -0.2617993877991494, aIn: 0.4363323129985824 },
    ],
    [
      "stops a fan wider than the widest at horizontal around the center line",
      [2, 5, 20],
      "center",
      { aOut: 0, aIn: 0.6981317007977318 },
    ],
    [
      "is one line at the inner edge for a fan of no width",
      [0, 5, 80],
      "inner",
      { aOut: 1.4835298641951802, aIn: 1.4835298641951802 },
    ],
    [
      "is one line at the center for a fan of no width",
      [0, 5, 80],
      "center",
      { aOut: 0.7853981633974483, aIn: 0.7853981633974483 },
    ],
    [
      "is one line at the upper edge when the widest fan has no width",
      [0.5, 5, 0],
      "center",
      { aOut: 0.08726646259971647, aIn: 0.08726646259971647 },
    ],
    [
      "is not a number at the inner edge when the share is not one",
      [Number.NaN, 5, 80],
      "inner",
      { aOut: Number.NaN, aIn: Number.NaN },
    ],
    [
      "is not a number around the center line when the share is not one",
      [Number.NaN, 5, 80],
      "center",
      { aOut: Number.NaN, aIn: Number.NaN },
    ],
    [
      "is not a number when the upper edge is not one",
      [0.5, Number.NaN, 80],
      "center",
      { aOut: Number.NaN, aIn: Number.NaN },
    ],
    [
      "is not a number when the widest fan is not one",
      [0.5, 5, Number.NaN],
      "inner",
      { aOut: Number.NaN, aIn: Number.NaN },
    ],
  ];

  test.each(cases)("%s", (_name, [kf, o, w], align, expected) => {
    expect(ssAngles(kf, o, w, align)).toEqual(expected);
  });

  // Angles at which the sums are not exact, so that the same sums taken in
  // another order end on another digit: the earlier page's order is the one kept.
  const inOrder: readonly Case[] = [
    [
      "adds the width to the upper edge before it takes the fan's own width off, at the inner edge",
      [36 / 85, 5, 7.7],
      undefined,
      { aOut: 0.1647385481029471, aIn: 0.22165681500327983 },
    ],
    [
      "adds half the width to the upper edge before it takes half the fan's own off, around the center line",
      [36 / 85, 5, 7.7],
      "center",
      { aOut: 0.12600250535133178, aIn: 0.1829207722516645 },
    ],
    [
      "adds the width first for a fan of 1.5 of 2.7 degrees at the inner edge",
      [1.5 / 2.7, 30, 2.7],
      undefined,
      { aOut: 0.5445427266222309, aIn: 0.5707226654021458 },
    ],
    [
      "adds half the width first for a fan of 1.1 of 1.2 degrees around the center line",
      [1.1 / 1.2, 15.5, 1.2],
      "center",
      { aOut: 0.27139869868511823, aIn: 0.2905973204570559 },
    ],
    [
      "adds half the width first for a fan of 1.1 of 2.7 degrees around the center line",
      [1.1 / 2.7, 11.5, 2.7],
      "center",
      { aOut: 0.21467549799530253, aIn: 0.23387411976724012 },
    ],
  ];

  test.each(inOrder)("to the last digit, %s", (_name, [kf, o, w], align, expected) => {
    const angles = ssAngles(kf, o, w, align);
    expect(angles.aOut).toBe(expected.aOut);
    expect(angles.aIn).toBe(expected.aIn);
  });

  test("names the value of the field that aims the fans around the center line", () => {
    expect(ALIGN_CENTER).toBe("center");
  });
});

describe("fanPoly", () => {
  test("is 41 points along one edge and 41 back along the other, with the sizes", () => {
    const fan = fanPoly(10, 60, 20);
    expect({ X: fan.X, Lc: fan.Lc, Le: fan.Le }).toEqual({
      X: 5.773502691896257,
      Lc: 1.7632698070846498,
      Le: 2.036048595548524,
    });
    expect(flat(fan.pts)).toEqual([
      -5.773502691896257, 2.036048595548524, -5.484827557301444, 2.0110811694276256,
      -5.196152422706632, 1.9871041552902928, -4.907477288111819, 1.9641538242387753,
      -4.618802153517006, 1.9422665712836529, -4.330127018922193, 1.921478724819612,
      -4.04145188432738, 1.901826336261316, -3.752776749732567, 1.8833449508823845,
      -3.4641016151377544, 1.866069361541928, -3.1754264805429417, 1.8500333476754196,
      -2.8867513459481287, 1.8352694026466612, -2.598076211353316, 1.8218084532752725,
      -2.309401076758503, 1.8096795760337634, -2.0207259421636903, 1.798909715009772,
      -1.7320508075688767, 1.7895234072103186, -1.4433756729740645, 1.7815425211049585,
      -1.1547005383792515, 1.7749860144267866, -0.8660254037844384, 1.7698697171460565,
      -0.5773502691896262, 1.7662061451837738, -0.2886751345948122, 1.764004349839729, 0,
      1.7632698070846498, 0.2886751345948131, 1.764004349839729, 0.5773502691896253,
      1.7662061451837738, 0.8660254037844384, 1.7698697171460565, 1.1547005383792515,
      1.7749860144267866, 1.4433756729740637, 1.7815425211049585, 1.7320508075688767,
      1.7895234072103186, 2.0207259421636907, 1.798909715009772, 2.309401076758504,
      1.8096795760337636, 2.598076211353317, 1.8218084532752725, 2.886751345948128,
      1.8352694026466612, 3.1754264805429413, 1.8500333476754196, 3.4641016151377544,
      1.866069361541928, 3.7527767497325675, 1.8833449508823845, 4.041451884327381,
      1.901826336261316, 4.330127018922192, 1.921478724819612, 4.618802153517005,
      1.9422665712836524, 4.907477288111818, 1.9641538242387753, 5.196152422706633,
      1.9871041552902928, 5.484827557301444, 2.0110811694276256, 5.773502691896257,
      2.036048595548524, 5.773502691896257, -2.036048595548524, 5.484827557301444,
      -2.0110811694276256, 5.196152422706633, -1.9871041552902928, 4.907477288111818,
      -1.9641538242387753, 4.618802153517005, -1.9422665712836524, 4.330127018922192,
      -1.921478724819612, 4.041451884327381, -1.901826336261316, 3.7527767497325675,
      -1.8833449508823845, 3.4641016151377544, -1.866069361541928, 3.1754264805429413,
      -1.8500333476754196, 2.886751345948128, -1.8352694026466612, 2.598076211353317,
      -1.8218084532752725, 2.309401076758504, -1.8096795760337636, 2.0207259421636907,
      -1.798909715009772, 1.7320508075688767, -1.7895234072103186, 1.4433756729740637,
      -1.7815425211049585, 1.1547005383792515, -1.7749860144267866, 0.8660254037844384,
      -1.7698697171460565, 0.5773502691896253, -1.7662061451837738, 0.2886751345948131,
      -1.764004349839729, 0, -1.7632698070846498, -0.2886751345948122, -1.764004349839729,
      -0.5773502691896262, -1.7662061451837738, -0.8660254037844384, -1.7698697171460565,
      -1.1547005383792515, -1.7749860144267866, -1.4433756729740645, -1.7815425211049585,
      -1.7320508075688767, -1.7895234072103186, -2.0207259421636903, -1.798909715009772,
      -2.309401076758503, -1.8096795760337634, -2.598076211353316, -1.8218084532752725,
      -2.8867513459481287, -1.8352694026466612, -3.1754264805429417, -1.8500333476754196,
      -3.4641016151377544, -1.866069361541928, -3.752776749732567, -1.8833449508823845,
      -4.04145188432738, -1.901826336261316, -4.330127018922193, -1.921478724819612,
      -4.618802153517006, -1.9422665712836529, -4.907477288111819, -1.9641538242387753,
      -5.196152422706632, -1.9871041552902928, -5.484827557301444, -2.0110811694276256,
      -5.773502691896257, -2.036048595548524,
    ]);
  });

  type Sizes = { X: number; Lc: number; Le: number };
  type Case = readonly [string, readonly [number, number, number], Sizes, number[]];
  const NAN = Number.NaN;
  const cases: readonly Case[] = [
    [
      "is long and thin for a wide fan of a thin slice",
      [3.5, 135, 0.8],
      { X: 8.449747468305832, Lc: 0.024435006506737675, Le: 0.06385174909643346 },
      [
        -8.449747468305832, 0.06385174909643346, -8.02726009489054, 0.061137125966994534, 0,
        0.024435006506737675, 8.449747468305832, 0.06385174909643346, 8.449747468305832,
        -0.06385174909643346, 0, -0.024435006506737675, -8.02726009489054, -0.061137125966994534,
        -8.449747468305832, -0.06385174909643346,
      ],
    ],
    [
      "is one point, with -0 along on the way back, at no depth",
      [0, 60, 20],
      { X: 0, Lc: 0, Le: 0 },
      [0, 0, 0, 0, 0, 0, 0, 0, 0, -0, 0, -0, 0, -0, 0, -0],
    ],
    [
      "is one line front to back for a fan of no width",
      [10, 0, 20],
      { X: 0, Lc: 1.7632698070846498, Le: 1.7632698070846498 },
      [
        0, 1.7632698070846498, 0, 1.7632698070846498, 0, 1.7632698070846498, 0, 1.7632698070846498,
        0, -1.7632698070846498, 0, -1.7632698070846498, 0, -1.7632698070846498, 0,
        -1.7632698070846498,
      ],
    ],
    [
      "is one line across, with -0 along on the way back, for a slice of no thickness",
      [10, 60, 0],
      { X: 5.773502691896257, Lc: 0, Le: 0 },
      [
        -5.773502691896257, 0, -5.484827557301444, 0, 0, 0, 5.773502691896257, 0, 5.773502691896257,
        -0, 0, -0, -5.484827557301444, -0, -5.773502691896257, -0,
      ],
    ],
    [
      "runs the other way across for a negative depth, with a negative length at the center only",
      [-10, 60, 20],
      { X: -5.773502691896257, Lc: -1.7632698070846498, Le: 2.036048595548524 },
      [
        5.773502691896257, 2.036048595548524, 5.484827557301444, 2.0110811694276256, 0,
        1.7632698070846498, -5.773502691896257, 2.036048595548524, -5.773502691896257,
        -2.036048595548524, 0, -1.7632698070846498, 5.484827557301444, -2.0110811694276256,
        5.773502691896257, -2.036048595548524,
      ],
    ],
    [
      "runs the other way across for a negative width",
      [10, -60, 20],
      { X: -5.773502691896257, Lc: 1.7632698070846498, Le: 2.036048595548524 },
      [
        5.773502691896257, 2.036048595548524, 5.484827557301444, 2.0110811694276256, 0,
        1.7632698070846498, -5.773502691896257, 2.036048595548524, -5.773502691896257,
        -2.036048595548524, 0, -1.7632698070846498, 5.484827557301444, -2.0110811694276256,
        5.773502691896257, -2.036048595548524,
      ],
    ],
    [
      "is very wide, not endless, for a fan of 180 degrees",
      [10, 180, 20],
      { X: 1.633123935319537e17, Lc: 1.7632698070846498, Le: 2.879638126376204e16 },
      [
        -1.633123935319537e17, 2.879638126376204e16, -1.55146773855356e17, 2.7356562200573936e16, 0,
        1.7632698070846498, 1.633123935319537e17, 2.879638126376204e16, 1.633123935319537e17,
        -2.879638126376204e16, 0, -1.7632698070846498, -1.55146773855356e17, -2.7356562200573936e16,
        -1.633123935319537e17, -2.879638126376204e16,
      ],
    ],
    [
      "is not a number anywhere when the depth is not one",
      [NAN, 60, 20],
      { X: NAN, Lc: NAN, Le: NAN },
      [NAN, NAN, NAN, NAN, NAN, NAN, NAN, NAN, NAN, NAN, NAN, NAN, NAN, NAN, NAN, NAN],
    ],
    [
      "keeps the length at the center when the width is not a number",
      [10, NAN, 20],
      { X: NAN, Lc: 1.7632698070846498, Le: NAN },
      [NAN, NAN, NAN, NAN, NAN, NAN, NAN, NAN, NAN, NAN, NAN, NAN, NAN, NAN, NAN, NAN],
    ],
    [
      "keeps the places across when the thickness is not a number",
      [10, 60, NAN],
      { X: 5.773502691896257, Lc: NAN, Le: NAN },
      [
        -5.773502691896257,
        NAN,
        -5.484827557301444,
        NAN,
        0,
        NAN,
        5.773502691896257,
        NAN,
        5.773502691896257,
        NAN,
        0,
        NAN,
        -5.484827557301444,
        NAN,
        -5.773502691896257,
        NAN,
      ],
    ],
  ];

  test.each(cases)("%s", (_name, [d, ang, th], sizes, expected) => {
    const fan = fanPoly(d, ang, th);
    expect({ X: fan.X, Lc: fan.Lc, Le: fan.Le }).toEqual(sizes);
    expect(fan.pts).toHaveLength(82);
    expect(pick(fan.pts, FAN_AT)).toEqual(expected);
  });

  // A fan for which the root of the sum of the squares ends on another digit
  // than `Math.hypot`, which the earlier page uses.
  test("to the last digit, is as long at each end as the hypotenuse makes it", () => {
    const fan = fanPoly(3, 20, 10);
    expect(fan.X).toBe(0.5289809421253949);
    expect(fan.Lc).toBe(0.26246599057777203);
    expect(fan.Le).toBe(0.2665149515476229);
    expect(pick(fan.pts, [0, 40])).toEqual([
      -0.5289809421253949, 0.2665149515476229, 0.5289809421253949, 0.2665149515476229,
    ]);
  });
});

describe("ssCover", () => {
  const en = createFormatter("en-US");
  const sv = createFormatter("sv-SE");

  const cases: readonly (readonly [string, number, number, string])[] = [
    [
      "is one strip when the fan starts under the boat",
      0,
      17.3,
      "34.6 m wide strip of bottom: from under the boat out to 17.3 m each side",
    ],
    [
      "is one strip when the gap is under half a centimeter",
      0.004,
      10,
      "20.0 m wide strip of bottom: from under the boat out to 10.0 m each side",
    ],
    [
      "is one strip just under half a centimeter",
      0.0049999,
      10,
      "20.0 m wide strip of bottom: from under the boat out to 10.0 m each side",
    ],
    [
      "is two strips with a gap from half a centimeter",
      0.005,
      10,
      "2 × 10.0 m of bottom: from 0.01 to 10.0 m out each side, with a 0.01 m gap under the boat",
    ],
    [
      "is two strips with a gap just over half a centimeter",
      0.006,
      10,
      "2 × 10.0 m of bottom: from 0.01 to 10.0 m out each side, with a 0.01 m gap under the boat",
    ],
    [
      "is two strips with a gap between them",
      2.5,
      30.25,
      "2 × 27.8 m of bottom: from 2.5 to 30.3 m out each side, with a 5.0 m gap under the boat",
    ],
    [
      "writes distances under a meter with two decimals",
      0.5,
      0.75,
      "2 × 0.25 m of bottom: from 0.50 to 0.75 m out each side, with a 1.0 m gap under the boat",
    ],
    [
      "writes a gap under a meter with two decimals",
      0.2,
      0.45,
      "2 × 0.25 m of bottom: from 0.20 to 0.45 m out each side, with a 0.40 m gap under the boat",
    ],
    [
      "is one strip when the inner edge is on the other side of the boat",
      -1,
      10,
      "20.0 m wide strip of bottom: from under the boat out to 10.0 m each side",
    ],
    [
      "writes a negative width when the outer edge is nearer than the inner",
      5,
      3,
      "2 × -2.0 m of bottom: from 5.0 to 3.0 m out each side, with a 10.0 m gap under the boat",
    ],
    [
      "writes a long strip without grouping",
      0,
      1234.5,
      "2469.0 m wide strip of bottom: from under the boat out to 1234.5 m each side",
    ],
    [
      "writes long distances without grouping",
      1200,
      2500.04,
      "2 × 1300.0 m of bottom: from 1200.0 to 2500.0 m out each side, with a 2400.0 m gap under the boat",
    ],
    [
      "is two strips with dashes when the inner edge is not a number",
      Number.NaN,
      10,
      "2 × — m of bottom: from — to 10.0 m out each side, with a — m gap under the boat",
    ],
    [
      "writes dashes for an outer edge that is not a number",
      3,
      Number.NaN,
      "2 × — m of bottom: from 3.0 to — m out each side, with a 6.0 m gap under the boat",
    ],
    [
      "is one strip with dashes when the outer edge is not a number",
      0,
      Number.NaN,
      "— m wide strip of bottom: from under the boat out to — m each side",
    ],
    [
      "is one strip with dashes when the outer edge is endless",
      0,
      Number.POSITIVE_INFINITY,
      "— m wide strip of bottom: from under the boat out to — m each side",
    ],
    [
      "is two strips with dashes when the outer edge is endless",
      2,
      Number.POSITIVE_INFINITY,
      "2 × — m of bottom: from 2.0 to — m out each side, with a 4.0 m gap under the boat",
    ],
    [
      "is one strip when the inner edge is endlessly far on the other side",
      Number.NEGATIVE_INFINITY,
      10,
      "20.0 m wide strip of bottom: from under the boat out to 10.0 m each side",
    ],
  ];

  test.each(cases)("%s", (_name, xIn, xOut, expected) => {
    expect(ssCover(en, xIn, xOut)).toBe(expected);
  });

  const swedish: readonly (readonly [string, number, number, string])[] = [
    [
      "writes one strip with decimal commas",
      0,
      17.3,
      "34,6 m wide strip of bottom: from under the boat out to 17,3 m each side",
    ],
    [
      "writes two strips with decimal commas",
      2.5,
      30.25,
      "2 × 27,8 m of bottom: from 2,5 to 30,3 m out each side, with a 5,0 m gap under the boat",
    ],
    [
      "writes a negative width with the locale's minus sign",
      5,
      3,
      "2 × −2,0 m of bottom: from 5,0 to 3,0 m out each side, with a 10,0 m gap under the boat",
    ],
    [
      "writes the same dash for what is not a number",
      3,
      Number.NaN,
      "2 × — m of bottom: from 3,0 to — m out each side, with a 6,0 m gap under the boat",
    ],
  ];

  test.each(swedish)("in sv-SE %s", (_name, xIn, xOut, expected) => {
    expect(ssCover(sv, xIn, xOut)).toBe(expected);
  });
});

describe("hull", () => {
  const cases: readonly (readonly [string, Polygon, Polygon])[] = [
    ["is nothing for no point", [], []],
    ["is nothing for one point", [[3, 4]], []],
    [
      "is two points, the left one first",
      [
        [3, 4],
        [1, 2],
      ],
      [
        [1, 2],
        [3, 4],
      ],
    ],
    [
      "is a point twice when it is given twice",
      [
        [3, 4],
        [3, 4],
      ],
      [
        [3, 4],
        [3, 4],
      ],
    ],
    [
      "is a point twice when it is given four times",
      [
        [3, 4],
        [3, 4],
        [3, 4],
        [3, 4],
      ],
      [
        [3, 4],
        [3, 4],
      ],
    ],
    [
      "is the two ends of points in a line",
      [
        [2, 2],
        [0, 0],
        [1, 1],
      ],
      [
        [0, 0],
        [2, 2],
      ],
    ],
    [
      "is the two ends of points straight above each other",
      [
        [5, 1],
        [5, 9],
        [5, 4],
      ],
      [
        [5, 1],
        [5, 9],
      ],
    ],
    [
      "is a triangle, from its leftmost corner by way of the lower side",
      [
        [0, 0],
        [4, 0],
        [2, 3],
      ],
      [
        [0, 0],
        [4, 0],
        [2, 3],
      ],
    ],
    [
      "is the same triangle whatever the order of its corners",
      [
        [2, 3],
        [4, 0],
        [0, 0],
      ],
      [
        [0, 0],
        [4, 0],
        [2, 3],
      ],
    ],
    [
      "drops the points inside a square and those on its sides",
      [
        [0, 0],
        [4, 0],
        [4, 4],
        [0, 4],
        [2, 2],
        [1, 3],
        [2, 0],
        [4, 2],
      ],
      square,
    ],
    [
      "gives a corner once when it is given twice",
      [
        [0, 0],
        [4, 0],
        [4, 4],
        [0, 4],
        [0, 0],
        [4, 4],
      ],
      square,
    ],
    [
      "is the outline of a beam's apex and the ends of its rays",
      [
        [0, 0],
        [-3.5, 6.2],
        [-1.25, 7.5],
        [1.25, 7.5],
        [3.5, 6.2],
        [0.4, 3],
        [-2, 6.9],
      ],
      [
        [-3.5, 6.2],
        [0, 0],
        [3.5, 6.2],
        [1.25, 7.5],
        [-1.25, 7.5],
      ],
    ],
    [
      "is the outline of twelve points on both sides of both axes",
      [
        [-1, -1],
        [-4, 2],
        [3, -2],
        [0.5, 0.5],
        [2, 5],
        [-2, -3],
        [1, -4],
        [-3, 4],
        [4, 1],
        [0, 0],
        [-0.5, 2.5],
        [2.5, -1.5],
      ],
      [
        [-4, 2],
        [-2, -3],
        [1, -4],
        [3, -2],
        [4, 1],
        [2, 5],
        [-3, 4],
      ],
    ],
    [
      "never drops a point whose height is not a number, and gives it and its neighbour twice",
      [
        [0, 0],
        [1, Number.NaN],
        [2, 0],
        [1, 2],
      ],
      [
        [0, 0],
        [1, Number.NaN],
        [1, 2],
        [2, 0],
        [1, 2],
        [1, Number.NaN],
      ],
    ],
    [
      "takes an endlessly far point as the rightmost corner",
      [
        [0, 0],
        [Number.POSITIVE_INFINITY, 1],
        [2, 0],
        [1, 2],
      ],
      [
        [0, 0],
        [2, 0],
        [Number.POSITIVE_INFINITY, 1],
        [1, 2],
      ],
    ],
  ];

  test.each(cases)("%s", (_name, pts, expected) => {
    expect(hull(pts)).toEqual(expected);
  });

  // Three points that are in a line as decimals and not as the numbers the
  // machine holds: whether the middle one is a corner hangs on the last digit
  // of the turn, worked out from the first point as the earlier page does.
  const nearlyInLine: readonly (readonly [string, Polygon, Polygon])[] = [
    [
      "keeps the middle point on the way back only, where the turn at it rounds to more than none",
      [
        [0.3, 0.4],
        [0.7, 0.8],
        [2.3, 2.4],
      ],
      [
        [0.3, 0.4],
        [2.3, 2.4],
        [0.7, 0.8],
      ],
    ],
    [
      "keeps the middle point on the way out only, where the turn at it rounds to more than none",
      [
        [0.1, 0.3],
        [2.2, 2.1],
        [3.6, 3.3],
      ],
      [
        [0.1, 0.3],
        [2.2, 2.1],
        [3.6, 3.3],
      ],
    ],
    [
      "gives the middle point twice when the turn at it rounds to more than none both ways",
      [
        [0.4, 0.3],
        [1, 0.7],
        [4, 2.7],
      ],
      [
        [0.4, 0.3],
        [1, 0.7],
        [4, 2.7],
        [1, 0.7],
      ],
    ],
    [
      "keeps the middle point of three evenly spaced ones on the way out",
      [
        [0.9, 0],
        [3.6, 2.1],
        [6.3, 4.2],
      ],
      [
        [0.9, 0],
        [3.6, 2.1],
        [6.3, 4.2],
      ],
    ],
  ];

  test.each(nearlyInLine)("to the last digit, %s", (_name, pts, expected) => {
    expect(hull(pts)).toEqual(expected);
  });

  test("leaves the points it is given in their order", () => {
    const pts: Point[] = [
      [2, 3],
      [4, 0],
      [0, 0],
    ];
    hull(pts);
    expect(pts).toEqual([
      [2, 3],
      [4, 0],
      [0, 0],
    ]);
  });
});
