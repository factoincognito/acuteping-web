/**
 * The source registry, the confidence scale and the rating of the presets
 * against the earlier page's (legacy/src/p2.js, lines 122 to 166). Every
 * expected value here was printed by those lines themselves, run unchanged in
 * Node; a long text is held as its digest and its length.
 */
import { IMG, LIVE } from "./presets";
import { CK, CONF, confTag, IMG_RATED, LIVE_RATED, SRC } from "./sources";
import type { Cone, LivePreset, RatedPreset, Source } from "./types";

/** FNV-1a, 32 bit, over the UTF-8 bytes, as eight hex digits (the digest of fixtures/README.md). */
function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(text)) {
    h = Math.imul(h ^ byte, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** A text as the expected values hold it: its digest and its length. */
const digest = (text: string): [string, number] => [fnv1a(text), text.length];

/** A value as the lines below hold it: nothing for one that is not there. */
const shown = (v: number | string | undefined): string => (v === undefined ? "" : String(v));

/** The rating of one frequency: confidence, source key, confidence of the depth, its source key. */
const rating = (c: Cone): string => [c.c, c.s, c.rc, c.rs].map(shown).join(":");

/** The rating of one imaging preset as one line. */
const ratingLine = (key: string, p: RatedPreset): string =>
  `${key} fc=${p.fc} fs=${p.fs} ec=${p.ec} cone ${p.cone.map(rating).join(" ")} down ${p.down
    .map(rating)
    .join(" ")} side ${p.side.map(rating).join(" ")}`;

describe("CK: when the sources were last checked", () => {
  it("is the earlier page's date", () => {
    expect(CK).toBe("30 Sep 2026");
  });
});

describe("SRC: the source registry", () => {
  const registry: Readonly<Record<string, Source>> = SRC;

  // key, digest and length of the title, digest and length of the address
  const expected: [string, string, number, string, number][] = [
    ["aihd", "aef33916", 78, "9e263613", 89],
    ["nose", "7be0ec5e", 81, "e526db69", 68],
    ["ht1", "7a6b9d09", 63, "b7df0b20", 105],
    ["ht58", "8fe9907f", 86, "f2c520d1", 95],
    ["bbm", "78ba9bd0", 47, "42b6ab74", 46],
    ["hbart", "38dfbd51", 86, "49b05c49", 144],
    ["bps", "476b6702", 51, "e156eb04", 145],
    ["idaho", "a5703de2", 40, "f1936008", 52],
    ["ffc", "6dc28202", 53, "8e2fff3c", 118],
    ["lowxl", "859e3371", 41, "95e47899", 58],
    ["bcast", "88f2d690", 85, "f45bac41", 70],
    ["garmin", "18d5efbc", 69, "1587302c", 134],
    ["ml2", "812bea8e", 51, "4e34e233", 101],
  ];

  it("has the earlier page's entries, in its order", () => {
    expect(Object.keys(SRC)).toEqual(expected.map(([key]) => key));
  });

  it.each(expected)(
    "%s has the earlier page's title and address",
    (key, t, tLength, u, uLength) => {
      const source = registry[key];
      expect(source).toBeDefined();
      if (source === undefined) return;
      expect(digest(source.t)).toEqual([t, tLength]);
      expect(digest(source.u)).toEqual([u, uLength]);
      expect(Object.keys(source)).toEqual(["t", "u"]);
    },
  );

  it("holds one entry in full, as a sample of the digests", () => {
    expect(SRC.lowxl).toEqual({
      t: "Lowrance ActiveTarget 2 XL specifications",
      u: "https://www.lowrance.com/activetarget-2-xl/specifications/",
    });
  });
});

describe("CONF: the confidence scale", () => {
  it("has the earlier page's five levels", () => {
    expect(Object.keys(CONF)).toEqual(["1", "2", "3", "4", "5"]);
    expect(Object.values(CONF).map(digest)).toEqual([
      ["1da9b867", 38],
      ["af04f7cc", 110],
      ["5f7d05b2", 68],
      ["435ee1c7", 98],
      ["10cdae97", 54],
    ]);
    expect(CONF[5]).toBe("Manufacturer specification, checked against the source");
  });
});

describe("IMG_RATED: the imaging presets with their confidence levels and sources", () => {
  const rated: Readonly<Record<string, RatedPreset>> = IMG_RATED;

  it("rates every figure as the earlier page does", () => {
    expect(Object.entries(rated).map(([key, p]) => ratingLine(key, p))).toEqual([
      "lowrance fc=5 fs=aihd ec=1 cone 2:ht1:5:aihd 2:ht1:5:aihd down 2:bbm:5:aihd 2:bbm:5:aihd side 1:ht58:5:aihd 1::5:aihd",
      "lowrance_nose fc=5 fs=nose ec=1 cone 2:ht1:5:nose 2:ht1:5:nose down 3:bbm:5:nose 3:bbm:5:nose side 1:ht58:5:nose 1::5:nose",
      "hb_xm9hw fc=5 fs=hbart ec=1 cone 5:hbart:: 5:hbart:: down 5:hbart:5:hbart 5:hbart:5:hbart 5:hbart:5:hbart side 5:hbart:5:hbart 5:hbart:5:hbart 5:hbart:5:hbart",
      "hb_xm14hw fc=5 fs=hbart ec=1 cone 5:hbart:: 5:hbart:: down 5:hbart:5:hbart 5:hbart:5:hbart 5:hbart:5:hbart side 5:hbart:5:hbart 5:hbart:5:hbart 5:hbart:5:hbart",
      "hb_xm14cmsi fc=5 fs=hbart ec=1 cone 5:hbart:: 5:hbart:: down 5:hbart:5:hbart 5:hbart:5:hbart side 5:hbart:5:hbart 5:hbart:5:hbart",
      "hb_xnt9hw150 fc=5 fs=hbart ec=1 cone 5:hbart:: 5:hbart:: down 5:hbart:5:hbart 5:hbart:5:hbart side 5:hbart:5:hbart 5:hbart:5:hbart",
      "hb_xm920 fc=5 fs=hbart ec=1 cone 5:hbart:: 5:hbart:: down 5:hbart:5:hbart 5:hbart:5:hbart 5:hbart:5:hbart side 5:hbart:5:hbart 5:hbart:5:hbart 5:hbart:5:hbart",
      "other fc=1 fs= ec=1 cone 1::: 1::: down 1::: 1::: side 1::: 1:::",
    ]);
  });

  it("gives a figure without a depth no confidence level for one: the keys are not there", () => {
    const keys = new Set(
      Object.values(rated)
        .flatMap((p) => [...p.cone, ...p.down, ...p.side])
        .map((c) => Object.keys(c).join(",")),
    );
    expect([...keys]).toEqual([
      "f,r,n,a,src,c,s,rc,rs",
      "f,r,a,src,c,s,rc,rs",
      "f,n,a,src,c,s",
      "f,a,src,c,s",
    ]);
  });

  it("keeps every preset, every frequency and every figure of presets.ts, in order", () => {
    const data: Readonly<Record<string, unknown>> = IMG;
    expect(Object.keys(rated)).toEqual(Object.keys(IMG));
    for (const [key, p] of Object.entries(rated)) {
      const { fc, fs, ec, ...rest } = p;
      expect([fc, fs, ec]).not.toContain(undefined);
      const strip = (list: readonly Cone[]) =>
        list.map(({ c, s, rc, rs, ...figures }) => {
          expect([c, s]).not.toContain(undefined);
          expect(rc === undefined).toBe(rs === undefined);
          return figures;
        });
      expect({ ...rest, cone: strip(p.cone), down: strip(p.down), side: strip(p.side) }).toEqual(
        data[key],
      );
    }
  });

  it("does not write to the data of presets.ts", () => {
    expect(Object.keys(IMG.lowrance)).toEqual([
      "label",
      "names",
      "note",
      "cone",
      "down",
      "side",
      "edge",
      "edgeSrc",
    ]);
    expect(Object.keys(IMG.lowrance.cone[0])).toEqual(["f", "r", "n", "a", "src"]);
    expect(Object.keys(LIVE.at2)).toEqual(["label", "names", "dual", "w", "t", "srcW", "srcT"]);
  });
});

describe("LIVE_RATED: the live sonars with their confidence levels and sources", () => {
  const rated: Readonly<Record<string, LivePreset>> = LIVE_RATED;

  it("rates the width and the thickness as the earlier page does", () => {
    expect(
      Object.entries(rated).map(([key, p]) => `${key} cw=${p.cw} sw=${p.sw} ct=${p.ct} st=${p.st}`),
    ).toEqual([
      "at2 cw=3 sw=bps ct=2 st=idaho",
      "at2xl cw=5 sw=lowxl ct=5 st=lowxl",
      "lvs34 cw=5 sw=garmin ct=5 st=garmin",
      "ml2 cw=5 sw=ml2 ct=5 st=ml2",
      "other cw=1 sw= ct=1 st=",
    ]);
  });

  it("keeps every preset and every figure of presets.ts, in order", () => {
    const data: Readonly<Record<string, unknown>> = LIVE;
    expect(Object.keys(rated)).toEqual(Object.keys(LIVE));
    for (const [key, p] of Object.entries(rated)) {
      const { cw, sw, ct, st, ...rest } = p;
      expect([cw, sw, ct, st]).not.toContain(undefined);
      expect(rest).toEqual(data[key]);
    }
  });
});

describe("the source keys of the ratings", () => {
  it("name an entry of SRC, or are empty", () => {
    const imaging: Readonly<Record<string, RatedPreset>> = IMG_RATED;
    const live: Readonly<Record<string, LivePreset>> = LIVE_RATED;
    const keys = [
      ...Object.values(imaging).flatMap((p) => [
        p.fs,
        ...[...p.cone, ...p.down, ...p.side].flatMap((c) => [c.s, c.rs ?? ""]),
      ]),
      ...Object.values(live).flatMap((p) => [p.sw, p.st]),
    ];
    const named = [...new Set(keys)].filter((key) => key !== "");
    expect(named).toEqual([
      "aihd",
      "ht1",
      "bbm",
      "ht58",
      "nose",
      "hbart",
      "bps",
      "idaho",
      "lowxl",
      "garmin",
      "ml2",
    ]);
    expect(Object.keys(SRC)).toEqual(expect.arrayContaining(named));
  });
});

describe("confTag: the confidence a source line ends with", () => {
  it.each([
    [1, " · confidence 1/5"],
    [2, " · confidence 2/5"],
    [3, " · confidence 3/5"],
    [4, " · confidence 4/5"],
    [5, " · confidence 5/5"],
  ])("writes level %d out of 5", (c, text) => {
    expect(confTag(c)).toBe(text);
  });

  it("writes nothing for no level and for 0", () => {
    expect(confTag(undefined)).toBe("");
    expect(confTag(0)).toBe("");
  });
});
