/**
 * Every expected value below is what the earlier page's own lines return
 * (legacy/src/p2.js lines 8 to 10, 13, 19, 21 to 23, 274 and 468), run in Node
 * with the locale named in the test.
 */
import {
  createFormatter,
  deg,
  degList,
  dl,
  lineStyle,
  niceRange,
  niceRangeSS,
  RANGE_STEPS,
  RANGE_STEPS_SS,
  rad,
} from "./format";

const NBSP = " ";
const MINUS = "−";
const DASH = "—";
const INFINITY = "∞";

describe("createFormatter, en-US", () => {
  const f = createFormatter("en-US");

  it.each([
    [0, "0.00"],
    [0.004, "0.00"],
    [0.005, "0.01"],
    [0.5, "0.50"],
    [0.994, "0.99"],
    [0.995, "1.00"],
    [0.999, "1.00"],
    [1, "1.0"],
    [1.04, "1.0"],
    [1.05, "1.1"],
    [1.25, "1.3"],
    [1.35, "1.4"],
    [9.95, "10.0"],
    [10, "10.0"],
    [12.34, "12.3"],
    [999.95, "1000.0"],
    [1234.5, "1234.5"],
    [1234567.89, "1234567.9"],
    [-0.004, "-0.00"],
    [-0.5, "-0.50"],
    [-1.25, "-1.3"],
    [-12.34, "-12.3"],
  ])("fmt(%p) is %p: two decimals under 1, one from 1, no grouping", (v, expected) => {
    expect(f.fmt(v)).toBe(expected);
  });

  it.each([NaN, Infinity, -Infinity])("fmt(%p) is a dash", (v) => {
    expect(f.fmt(v)).toBe(DASH);
  });

  it.each([
    [0, 0, "0"],
    [0.5, 0, "1"],
    [1.5, 0, "2"],
    [2.5, 0, "3"],
    [-0.5, 0, "-1"],
    [19.5, 0, "20"],
    [60.5, 0, "61"],
    [1234567.891, 0, "1234568"],
    [0, 1, "0.0"],
    [0.05, 1, "0.1"],
    [0.25, 1, "0.3"],
    [12.34, 1, "12.3"],
    [1234.56, 1, "1234.6"],
    [-3.25, 1, "-3.3"],
    [0, 2, "0.00"],
    [0.005, 2, "0.01"],
    [0.125, 2, "0.13"],
    [12.345, 2, "12.35"],
    [1234.5, 2, "1234.50"],
    [1.23456, 3, "1.235"],
    [NaN, 1, "NaN"],
    [Infinity, 0, INFINITY],
  ])("num(%p, %p) is %p: exactly that many decimals, no grouping", (n, digits, expected) => {
    expect(f.num(n, digits)).toBe(expected);
  });

  it.each([
    [0, "0.00 m"],
    [0.5, "0.50 m"],
    [12.34, "12.3 m"],
    [999.94, "999.9 m"],
    [999.95, "1000.0 m"],
    [999.99, "1000.0 m"],
    [1000, "1,000 m"],
    [1000.4, "1,000 m"],
    [1234.5, "1,235 m"],
    [12345.6, "12,346 m"],
    [1e6, "1,000,000 m"],
    [-5, "-5.0 m"],
    [-2000, "-2000.0 m"],
    [NaN, "NaN m"],
    [Infinity, `${INFINITY} m`],
  ])("dist(%p) is %p: as fmt under 1000 m, a grouped whole number from there", (v, expected) => {
    expect(f.dist(v)).toBe(expected);
  });

  it.each([
    [[], ""],
    [[{ a: 20 }], "20°"],
    [[{ a: 20 }, { a: 60 }], "20° / 60°"],
    [[{ a: 19.5 }, { a: 60.5 }, { a: 119.4 }], "20° / 61° / 119°"],
    [[{ a: 86, f: "455 kHz" }, { a: 55 }], "86° / 55°"],
  ])("degList(%j) is %p", (list, expected) => {
    expect(degList(f, list)).toBe(expected);
  });
});

describe("createFormatter, sv-SE (comma decimals)", () => {
  const f = createFormatter("sv-SE");

  it.each([
    [0, "0,00"],
    [0.005, "0,01"],
    [0.5, "0,50"],
    [0.995, "1,00"],
    [1, "1,0"],
    [1.25, "1,3"],
    [12.34, "12,3"],
    [999.95, "1000,0"],
    [1234567.89, "1234567,9"],
    [-0.004, `${MINUS}0,00`],
    [-0.5, `${MINUS}0,50`],
    [-12.34, `${MINUS}12,3`],
    [NaN, DASH],
  ])("fmt(%p) is %p", (v, expected) => {
    expect(f.fmt(v)).toBe(expected);
  });

  it.each([
    [2.5, 0, "3"],
    [-0.5, 0, `${MINUS}1`],
    [1234567.891, 0, "1234568"],
    [12.34, 1, "12,3"],
    [-3.25, 1, `${MINUS}3,3`],
    [12.345, 2, "12,35"],
    [1234.5, 2, "1234,50"],
    [NaN, 1, "NaN"],
    [Infinity, 0, INFINITY],
  ])("num(%p, %p) is %p", (n, digits, expected) => {
    expect(f.num(n, digits)).toBe(expected);
  });

  it.each([
    [0.5, "0,50 m"],
    [12.34, "12,3 m"],
    [999.95, "1000,0 m"],
    [1000, `1${NBSP}000 m`],
    [1234.5, `1${NBSP}235 m`],
    [12345.6, `12${NBSP}346 m`],
    [1e6, `1${NBSP}000${NBSP}000 m`],
    [-5, `${MINUS}5,0 m`],
    [-2000, `${MINUS}2000,0 m`],
    [NaN, "NaN m"],
    [Infinity, `${INFINITY} m`],
  ])("dist(%p) is %p: the locale's grouping from 1000 m", (v, expected) => {
    expect(f.dist(v)).toBe(expected);
  });

  it("degList has no decimals to localise", () => {
    expect(degList(f, [{ a: 19.5 }, { a: 60.5 }, { a: 119.4 }])).toBe("20° / 61° / 119°");
  });
});

describe("createFormatter, the locale it is given", () => {
  it("two formatters of different locales do not share anything", () => {
    const en = createFormatter("en-US");
    const sv = createFormatter("sv-SE");
    expect([en.fmt(1.5), sv.fmt(1.5), en.fmt(1.5)]).toEqual(["1.5", "1,5", "1.5"]);
    expect([en.dist(1500), sv.dist(1500)]).toEqual(["1,500 m", `1${NBSP}500 m`]);
  });

  it("undefined gives the default locale's formatting, as the page asks for", () => {
    const f = createFormatter(undefined);
    const own = new Intl.NumberFormat(undefined, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
      useGrouping: false,
    });
    expect(f.fmt(1234.56)).toBe(own.format(1234.56));
    expect(f.dist(1234.56)).toBe(`${(1235).toLocaleString()} m`);
  });
});

describe("rad and deg", () => {
  it.each([
    [0, 0],
    [1, 0.017453292519943295],
    [30, 0.5235987755982988],
    [45, 0.7853981633974483],
    [90, 1.5707963267948966],
    [180, Math.PI],
    [360, 6.283185307179586],
    [-30, -0.5235987755982988],
    [20.5, 0.3577924966588375],
    // Multiplying by pi/180 instead would end these two one bit higher.
    [86, 1.5009831567151233],
    [3, 0.05235987755982988],
  ])("rad(%p) is %p, to the last bit", (a, expected) => {
    expect(rad(a)).toBe(expected);
  });

  it.each([
    [0, 0],
    [1, 57.29577951308232],
    [Math.PI, 180],
    [1.5707963267948966, 90],
    [0.35, 20.05352282957881],
    [-0.5, -28.64788975654116],
    // Multiplying by 180/pi instead would end these three one bit off.
    [0.1, 5.729577951308232],
    [0.2, 11.459155902616464],
    [1.1, 63.02535746439057],
  ])("deg(%p) is %p, to the last bit", (r, expected) => {
    expect(deg(r)).toBe(expected);
  });
});

describe("niceRangeSS: the side range the picture is drawn to", () => {
  it("has the steps of the earlier page", () => {
    expect(RANGE_STEPS_SS).toEqual([10, 15, 20, 25, 30, 40, 50, 60, 80, 100, 120, 150]);
  });

  it.each([
    [0, 10],
    [1, 10],
    [10, 10],
    [10.1, 15],
    [15, 15],
    [26, 30],
    [45, 50],
    [100.5, 120],
    [120.5, 150],
    [150, 150],
    [150.1, 200],
    [200, 200],
    [201, 250],
    [1000, 1000],
    [-5, 10],
    [Infinity, Infinity],
  ])("niceRangeSS(%p) is %p: the first step that holds it, then whole fifties", (v, expected) => {
    expect(niceRangeSS(v)).toBe(expected);
  });

  it("gives NaN for NaN", () => {
    expect(niceRangeSS(NaN)).toBeNaN();
  });
});

describe("niceRange: the range the other pictures are drawn to", () => {
  it("has the steps of the earlier page", () => {
    expect(RANGE_STEPS).toEqual([5, 10, 15, 20, 25, 30, 40, 50, 60, 80, 100, 150]);
  });

  it.each([
    [0, 5],
    [4, 5],
    [5, 5],
    [5.1, 10],
    [12, 15],
    [31, 40],
    [61, 80],
    [100, 100],
    [100.1, 150],
    [150, 150],
    [150.1, 200],
    [260, 300],
    [-5, 5],
    [Infinity, Infinity],
  ])("niceRange(%p) is %p: the first step that holds it, then whole fifties", (v, expected) => {
    expect(niceRange(v)).toBe(expected);
  });

  it("gives NaN for NaN", () => {
    expect(niceRange(NaN)).toBeNaN();
  });
});

describe("lineStyle: the border style for a dash pattern", () => {
  it.each([
    [undefined, "solid"],
    [null, "solid"],
    ["", "solid"],
    ["2 3", "dotted"],
    ["10 3 2 3", "double"],
    ["6 4", "dashed"],
    ["4 4", "dashed"],
  ])("lineStyle(%p) is %p", (dash, expected) => {
    expect(lineStyle(dash)).toBe(expected);
  });
});

describe("dl: the rows of a result list", () => {
  it("is empty for no rows", () => {
    expect(dl([])).toBe("");
  });

  it("writes one div with a term and a value for each row, markup in a value kept", () => {
    expect(dl([["A", "1"]])).toBe("<div><dt>A</dt><dd>1</dd></div>");
    expect(
      dl([
        ["Depth", "10.0 m"],
        ["Range", "<b>30.0</b> m"],
      ]),
    ).toBe(
      "<div><dt>Depth</dt><dd>10.0 m</dd></div><div><dt>Range</dt><dd><b>30.0</b> m</dd></div>",
    );
  });
});
