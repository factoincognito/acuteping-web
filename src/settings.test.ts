/**
 * Settings against the earlier page (legacy/src/p2.js, lines 11 and 235 to
 * 273), in two ways. The expected values of the first part were printed by
 * those lines themselves, run unchanged in Node against a stand-in for the
 * page's elements. The second part compares what the functions write with what
 * the earlier page wrote when it was recorded in a browser (`fixtures/legacy/`),
 * in every scenario of the set.
 */
import {
  checkSettings,
  equipment,
  equipmentView,
  hiddenFor,
  isModified,
  KEYS,
  KNOTS,
  num,
  parseSettings,
  settingsView,
} from "./settings";
import { combined, livePreset, THICKNESS, TRANSDUCERS } from "./transducers";
import type {
  Equipment,
  RawFields,
  SavedValue,
  SectionView,
  Settings,
  SettingsMessages,
} from "./types";

/** FNV-1a, 32 bit, over the UTF-8 bytes, as eight hex digits (the digest of fixtures/README.md). */
function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(text)) {
    h = Math.imul(h ^ byte, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** A number as the expected values hold it: JSON has no NaN, no infinity and no minus zero. */
const shown = (v: number): string => (Object.is(v, -0) ? "-0" : String(v));

/** Settings as JSON, with the numbers JSON cannot hold as `shown` writes them. */
const asJson = (a: Settings): string =>
  JSON.stringify(a, (_key, v: unknown) =>
    typeof v === "number" && (!Number.isFinite(v) || Object.is(v, -0)) ? shown(v) : v,
  );

const NUMBERS = [
  "dep",
  "sog",
  "ssr",
  "atr",
  "zt",
  "dst",
  "sso",
  "sst",
  "atw",
  "att",
  "atsb",
  "atfa",
] as const;

/** Settings on one line: the twelve numbers, the unit, the speed in m/s, the angles and the widest side fan. */
function line(a: Settings): string {
  const angles = (list: Settings["cone"]): string => list.map((c) => shown(c.a)).join(",");
  return `${NUMBERS.map((k) => shown(a[k])).join("|")} ${a.sogu} ms=${shown(a.ms)} cone=${angles(
    a.cone,
  )} down=${angles(a.down)} side=${angles(a.side)} swmax=${shown(a.swmax)}`;
}

/**
 * The fields of the page as it starts, for the given transducers, with some
 * changed: each angle field holds its preset's angle (legacy lines 209 to 220).
 */
function fieldsOf(over: RawFields = {}, first = "lowrance", second = "", live = "at2"): RawFields {
  const p = combined(first, second);
  const l = livePreset(live);
  const fields: Record<string, SavedValue> = {
    "img-p": first,
    "img-s": second,
    "live-p": live,
    "eq-ss": true,
    "eq-ds": true,
    "eq-2d": true,
    "eq-at": true,
    "at-n": "2",
    atsb: "20",
    atfa: "45",
    dep: "10",
    sog: "2",
    sogu: "kn",
    ssr: "40",
    atr: "30",
    zt: "0.5",
    dst: String(THICKNESS.dst),
    sso: String(p.edge),
    sst: String(THICKNESS.sst),
    atw: String(l.w),
    att: String(l.t),
  };
  for (const [i, c] of p.cone.entries()) fields[`cone${i}`] = String(c.a);
  for (const [i, c] of p.down.entries()) fields[`down${i}`] = String(c.a);
  for (const [i, c] of p.side.entries()) fields[`side${i}`] = String(c.a);
  return { ...fields, ...over };
}

/** The settings and the equipment of a page with the given fields. */
const settingsOf = (fields: RawFields): Settings =>
  parseSettings(fields, combined(String(fields["img-p"]), String(fields["img-s"])));
const equipmentOf = (fields: RawFields): Equipment =>
  equipment(fields, livePreset(String(fields["live-p"])));
const messagesOf = (fields: RawFields): SettingsMessages =>
  checkSettings(settingsOf(fields), equipmentOf(fields));

/** The flags of an equipment as six digits, in the order of its keys. */
const flags = (eq: Equipment): string =>
  Object.values(eq)
    .map((on) => (on === true ? "1" : on === false ? "0" : "?"))
    .join("");

const OFF = {
  ss: { "eq-ss": false },
  "2d": { "eq-2d": false },
  ds: { "eq-ds": false },
  at: { "eq-at": false },
} as const;

/** A no-break space, which a field's text is trimmed of like any other white space. */
const NBSP = String.fromCharCode(0xa0);

describe("num: a field's text as a number (line 11)", () => {
  // the text of the field, the number as `shown` writes it
  it.each([
    ["10", "10"],
    [" 10 ", "10"],
    ["\t7\n", "7"],
    ["0.5", "0.5"],
    [".5", "0.5"],
    ["5.", "5"],
    ["0,5", "0.5"],
    [",5", "0.5"],
    ["5,", "5"],
    ["0,", "0"],
    ["1,5e1", "15"],
    ["1,234,5", "NaN"],
    ["1.234,5", "NaN"],
    ["1,,2", "NaN"],
    ["1..2", "NaN"],
    ["1 000", "NaN"],
    ["1_000", "NaN"],
    ["1e3", "1000"],
    ["1E3", "1000"],
    ["1e-2", "0.01"],
    ["1e308", "1e+308"],
    ["1e309", "NaN"],
    ["0x10", "16"],
    ["0X1f", "31"],
    ["0b11", "3"],
    ["0o17", "15"],
    ["+5", "5"],
    ["-5", "-5"],
    ["--5", "NaN"],
    ["- 5", "NaN"],
    ["-0", "-0"],
    ["0", "0"],
    ["", "NaN"],
    [" ", "NaN"],
    ["   ", "NaN"],
    [",", "NaN"],
    [".", "NaN"],
    ["abc", "NaN"],
    ["5m", "NaN"],
    ["12abc", "NaN"],
    ["NaN", "NaN"],
    ["Infinity", "NaN"],
    ["-Infinity", "NaN"],
    ["true", "NaN"],
    ["on", "NaN"],
    ["null", "NaN"],
    ["١", "NaN"],
    ["５", "NaN"],
    [`${NBSP}5${NBSP}`, "5"],
  ])("%j is %s", (text, number) => {
    expect(shown(num(text))).toBe(number);
  });

  it("is no number for a field that is not there", () => {
    expect(num(undefined)).toBeNaN();
  });
});

describe("equipment: which sonars the boat has (lines 236 to 239)", () => {
  const TICKS = ["eq-ss", "eq-2d", "eq-ds", "eq-at"] as const;

  // the live sonar, the choice of one or two transducers, `dual` and `atw` when the live sonar is ticked
  it.each([
    ["at2", "2", "11"],
    ["at2", "1", "10"],
    ["at2", "", "10"],
    ["at2", " 2", "10"],
    ["at2", "02", "10"],
    ["at2", "2.0", "10"],
    ["at2xl", "2", "11"],
    ["at2xl", "1", "10"],
    ["at2xl", "", "10"],
    ["at2xl", " 2", "10"],
    ["lvs34", "2", "00"],
    ["lvs34", "1", "00"],
    ["lvs34", "", "00"],
    ["ml2", "2", "00"],
    ["ml2", "1", "00"],
    ["ml2", "", "00"],
    ["other", "2", "00"],
    ["other", "1", "00"],
    ["other", "", "00"],
    ["", "2", "11"],
    ["", "1", "10"],
    ["", "", "10"],
    ["nope", "2", "11"],
    ["nope", "1", "10"],
    ["nope", "", "10"],
  ])("live sonar %j with %j transducers: every combination of ticks", (live, n, tail) => {
    for (let bits = 0; bits < 16; bits += 1) {
      const ticks: Record<string, SavedValue> = {};
      for (const [i, id] of TICKS.entries()) ticks[id] = Boolean(bits & (8 >> i));
      const fields = fieldsOf({ ...ticks, "live-p": live, "at-n": n });
      // The four ticks pass through; `dual` and `atw` need the live sonar ticked.
      const expected = TICKS.map((id) => (ticks[id] ? "1" : "0")).join("");
      expect(flags(equipmentOf(fields))).toBe(expected + (ticks["eq-at"] ? tail : "00"));
    }
  });

  it("has the keys ss, 2d, ds, at, dual and atw, in that order", () => {
    expect(Object.keys(equipmentOf(fieldsOf()))).toEqual(["ss", "2d", "ds", "at", "dual", "atw"]);
  });

  it("reads a tick box that is not there as not ticked", () => {
    // Not from the earlier page, which always has the tick boxes and throws without
    // one: with no element to read, the port reads none as ticked.
    expect(equipment({}, livePreset("at2"))).toEqual({
      ss: false,
      "2d": false,
      ds: false,
      at: false,
      dual: false,
      atw: false,
    });
  });
});

describe("parseSettings: the fields as numbers (lines 240 to 248)", () => {
  it("reads the page as it starts", () => {
    expect(asJson(settingsOf(fieldsOf()))).toBe(
      '{"dep":10,"sog":2,"ssr":40,"atr":30,"zt":0.5,"dst":3,"sso":5,"sst":2,"atw":135,"att":18,"atsb":20,"atfa":45,"sogu":"kn","ms":1.028888888888889,"cone":[{"f":"83 kHz","n":"Medium CHIRP","r":305,"a":50,"def":50},{"f":"200 kHz","n":"High CHIRP","r":305,"a":20,"def":20}],"down":[{"f":"700 kHz CHIRP","r":46,"a":51,"def":51},{"f":"1200 kHz CHIRP","r":27,"a":30,"def":30}],"side":[{"f":"455 kHz CHIRP","r":91,"a":85,"def":85},{"f":"1075 kHz CHIRP","r":46,"a":36,"def":36}],"swmax":85}',
    );
  });

  it("has the twelve numbers, the unit, the speed, the three lists and the widest fan, in that order", () => {
    const a = settingsOf(fieldsOf());
    expect(Object.keys(a)).toEqual([...NUMBERS, "sogu", "ms", "cone", "down", "side", "swmax"]);
    // Only a 2D frequency carries its name.
    expect(a.cone.map((c) => Object.keys(c).join(","))).toEqual(["f,n,r,a,def", "f,n,r,a,def"]);
    expect(a.down.map((c) => Object.keys(c).join(","))).toEqual(["f,r,a,def", "f,r,a,def"]);
    expect(a.side.map((c) => Object.keys(c).join(","))).toEqual(["f,r,a,def", "f,r,a,def"]);
  });

  // first, second, digest and length of the settings as JSON, each angle field at its preset's angle
  it.each([
    ["lowrance", "", "35aea82b", 478],
    ["lowrance_nose", "", "1ba45c33", 452],
    ["hb_xm9hw", "", "63e93432", 538],
    ["hb_xm14hw", "", "36fbdcc9", 538],
    ["hb_xm14cmsi", "", "aa8e5dc6", 461],
    ["hb_xnt9hw150", "", "e685efdd", 457],
    ["hb_xm920", "", "7b0aaaa9", 504],
    ["other", "", "e137cbcb", 366],
    ["lowrance", "lowrance_nose", "2f04a9d7", 628],
    ["lowrance_nose", "lowrance", "0f5326f9", 628],
    ["hb_xm9hw", "hb_xm14hw", "63e93432", 538],
    ["hb_xm920", "hb_xm9hw", "964cf299", 743],
    ["hb_xnt9hw150", "hb_xm920", "11d79b74", 652],
    ["hb_xm920", "other", "14bb9667", 737],
    ["", "", "35aea82b", 478],
    ["nope", "nope", "35aea82b", 478],
  ])("%j with %j gives the earlier page's settings", (first, second, fnv, length) => {
    const json = asJson(settingsOf(fieldsOf({}, first, second)));
    expect([fnv1a(json), json.length]).toEqual([fnv, length]);
  });

  // what is tested, the fields changed, the settings as `line` writes them
  const cases: [string, RawFields, string][] = [
    [
      "the defaults",
      {},
      "10|2|40|30|0.5|3|5|2|135|18|20|45 kn ms=1.028888888888889 cone=50,20 down=51,30 side=85,36 swmax=85",
    ],
    [
      "speed in km/h",
      { sogu: "kmh", sog: "7.2" },
      "10|7.2|40|30|0.5|3|5|2|135|18|20|45 kmh ms=2 cone=50,20 down=51,30 side=85,36 swmax=85",
    ],
    [
      "a unit that is neither is km/h",
      { sogu: "mph", sog: "7.2" },
      "10|7.2|40|30|0.5|3|5|2|135|18|20|45 mph ms=2 cone=50,20 down=51,30 side=85,36 swmax=85",
    ],
    [
      "no unit is km/h",
      { sogu: "", sog: "7.2" },
      "10|7.2|40|30|0.5|3|5|2|135|18|20|45  ms=2 cone=50,20 down=51,30 side=85,36 swmax=85",
    ],
    [
      "one knot",
      { sog: "1" },
      "10|1|40|30|0.5|3|5|2|135|18|20|45 kn ms=0.5144444444444445 cone=50,20 down=51,30 side=85,36 swmax=85",
    ],
    [
      "knots, a speed that is no number",
      { sog: "abc" },
      "10|NaN|40|30|0.5|3|5|2|135|18|20|45 kn ms=NaN cone=50,20 down=51,30 side=85,36 swmax=85",
    ],
    [
      "km/h, a blank speed",
      { sogu: "kmh", sog: " " },
      "10|NaN|40|30|0.5|3|5|2|135|18|20|45 kmh ms=NaN cone=50,20 down=51,30 side=85,36 swmax=85",
    ],
    [
      "commas, exponents and hex",
      {
        dep: "12,5",
        sog: "0x2",
        ssr: "1e2",
        atr: " 30 ",
        zt: ",5",
        dst: "2,5",
        sso: "5,0",
        sst: "+2",
        atw: "1.35e2",
        att: "18.",
        atsb: "0x14",
        atfa: "45,0",
      },
      "12.5|2|100|30|0.5|2.5|5|2|135|18|20|45 kn ms=1.028888888888889 cone=50,20 down=51,30 side=85,36 swmax=85",
    ],
    [
      "every number blank",
      {
        dep: "",
        sog: "",
        ssr: "",
        atr: "",
        zt: "",
        dst: "",
        sso: "",
        sst: "",
        atw: "",
        att: "",
        atsb: "",
        atfa: "",
        cone0: "",
        cone1: "",
        down0: "",
        down1: "",
        side0: "",
        side1: "",
      },
      "NaN|NaN|NaN|NaN|NaN|NaN|NaN|NaN|NaN|NaN|NaN|NaN kn ms=NaN cone=NaN,NaN down=NaN,NaN side=NaN,NaN swmax=NaN",
    ],
    [
      "one side fan no number: no widest fan",
      { side1: "x" },
      "10|2|40|30|0.5|3|5|2|135|18|20|45 kn ms=1.028888888888889 cone=50,20 down=51,30 side=85,NaN swmax=NaN",
    ],
    [
      "the second side fan the widest",
      { side0: "30", side1: "70" },
      "10|2|40|30|0.5|3|5|2|135|18|20|45 kn ms=1.028888888888889 cone=50,20 down=51,30 side=30,70 swmax=70",
    ],
    [
      "negative and zero angles",
      { cone0: "-5", down1: "0", side0: "-0" },
      "10|2|40|30|0.5|3|5|2|135|18|20|45 kn ms=1.028888888888889 cone=-5,20 down=51,0 side=-0,36 swmax=36",
    ],
    [
      "only the first comma is a decimal point",
      { dep: "1,234,5", sog: "1.234,5", ssr: "1,5e1" },
      "NaN|NaN|15|30|0.5|3|5|2|135|18|20|45 kn ms=NaN cone=50,20 down=51,30 side=85,36 swmax=85",
    ],
  ];

  it.each(cases)("%s", (_about, over, expected) => {
    expect(line(settingsOf(fieldsOf(over)))).toBe(expected);
  });

  it("reads a field that is not there as no number", () => {
    const { cone1: _cone1, side0: _side0, dep: _dep, atfa: _atfa, ...fields } = fieldsOf();
    expect(line(settingsOf(fields))).toBe(
      "NaN|2|40|30|0.5|3|5|2|135|18|20|NaN kn ms=1.028888888888889 cone=50,NaN down=51,30 side=NaN,36 swmax=NaN",
    );
  });

  it("reads a page without the unit field as one with no unit, which is km/h", () => {
    // Not from the earlier page, which always has the field and throws without it.
    const { sogu: _sogu, ...fields } = fieldsOf({ sog: "7.2" });
    expect(line(settingsOf(fields))).toBe(
      "10|7.2|40|30|0.5|3|5|2|135|18|20|45  ms=2 cone=50,20 down=51,30 side=85,36 swmax=85",
    );
  });

  it("reads a tick box where a number is asked as no number", () => {
    expect(line(settingsOf(fieldsOf({ dep: true, cone0: false })))).toBe(
      "NaN|2|40|30|0.5|3|5|2|135|18|20|45 kn ms=1.028888888888889 cone=NaN,20 down=51,30 side=85,36 swmax=85",
    );
  });

  it("has minus infinity as the widest fan of a transducer without side frequencies", () => {
    // No preset is without them; this is what the earlier page's `Math.max.apply(null, [])` gives.
    const a = parseSettings(fieldsOf(), { ...TRANSDUCERS.lowrance, side: [] });
    expect(a.side).toEqual([]);
    expect(a.swmax).toBe(Number.NEGATIVE_INFINITY);
  });

  it("names the unit that is knots", () => {
    expect(KNOTS).toBe("kn");
  });
});

/** Every message of Settings, word for word, by the key of its check. */
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
const NO_SONAR = "Tick at least one sonar to see its sections.";
const CHECKS = Object.keys(MESSAGES);

/** The checks that have a message, as "dep sog". */
const failing = (messages: SettingsMessages): string =>
  Object.entries(messages)
    .filter(([, message]) => message !== "")
    .map(([key]) => key)
    .join(" ");

/** The messages of the given checks, and an empty text for every other. */
function messagesFor(keys: string): SettingsMessages {
  const set = keys === "" ? [] : keys.split(" ");
  const of = (key: keyof SettingsMessages): string => (set.includes(key) ? MESSAGES[key] : "");
  return {
    dep: of("dep"),
    sog: of("sog"),
    ssr: of("ssr"),
    atr: of("atr"),
    zt: of("zt"),
    a2d: of("a2d"),
    ads: of("ads"),
    ass: of("ass"),
    aat: of("aat"),
    mnt: of("mnt"),
  };
}

/** Every check fails, when its sonar is ticked. */
const ALL_BAD: RawFields = {
  dep: "0",
  sog: "0",
  ssr: "0",
  atr: "0",
  zt: "-1",
  cone0: "0",
  down0: "0",
  side0: "0",
  atw: "0",
  atsb: "90",
};

describe("checkSettings: the validation messages (lines 249 to 263)", () => {
  // The check a row is about, what it tests, the fields changed, the checks that then have a message.
  // Every range has both its edges, valid and invalid, and each check its sonar not ticked.
  const matrix: [string, string, RawFields, string][] = [
    ["", "the defaults", {}, ""],
    // dep: over 0
    ["dep", "0", { dep: "0" }, "dep"],
    ["dep", "just over 0", { dep: "0.01" }, ""],
    ["dep", "negative", { dep: "-3" }, "dep"],
    ["dep", "minus zero", { dep: "-0" }, "dep"],
    ["dep", "blank", { dep: "" }, "dep"],
    ["dep", "a space", { dep: " " }, "dep"],
    ["dep", "text", { dep: "abc" }, "dep"],
    ["dep", "a comma decimal", { dep: "0,5" }, ""],
    ["dep", "an exponent", { dep: "1e3" }, ""],
    ["dep", "the largest number", { dep: "1e308" }, ""],
    ["dep", "too large to be a number", { dep: "1e309" }, "dep"],
    // sog: over 0
    ["sog", "0", { sog: "0" }, "sog"],
    ["sog", "just over 0", { sog: "0.01" }, ""],
    ["sog", "negative", { sog: "-1" }, "sog"],
    ["sog", "blank", { sog: "" }, "sog"],
    ["sog", "hex", { sog: "0x2" }, ""],
    ["sog", "0 in km/h", { sog: "0", sogu: "kmh" }, "sog"],
    // ssr: over 0, with side imaging
    ["ssr", "0", { ssr: "0" }, "ssr"],
    ["ssr", "just over 0", { ssr: "0.01" }, ""],
    ["ssr", "negative", { ssr: "-1" }, "ssr"],
    ["ssr", "blank", { ssr: "" }, "ssr"],
    ["ssr", "0, side imaging not ticked", { ssr: "0", ...OFF.ss }, ""],
    // atr: over 0, with live sonar
    ["atr", "0", { atr: "0" }, "atr"],
    ["atr", "just over 0", { atr: "0.01" }, ""],
    ["atr", "negative", { atr: "-1" }, "atr"],
    ["atr", "blank", { atr: "" }, "atr"],
    ["atr", "0, live sonar not ticked", { atr: "0", ...OFF.at }, ""],
    // zt: 0 or more, with live sonar
    ["zt", "0", { zt: "0" }, ""],
    ["zt", "minus zero", { zt: "-0" }, ""],
    ["zt", "just under 0", { zt: "-0.01" }, "zt"],
    ["zt", "blank", { zt: "" }, "zt"],
    ["zt", "negative, live sonar not ticked", { zt: "-1", ...OFF.at }, ""],
    // a2d: every 2D angle over 0 and under 120, with 2D
    ["a2d", "first angle 0", { cone0: "0" }, "a2d"],
    ["a2d", "first angle just over 0", { cone0: "0.01" }, ""],
    ["a2d", "first angle just under 120", { cone0: "119.99" }, ""],
    ["a2d", "first angle 120", { cone0: "120" }, "a2d"],
    ["a2d", "second angle 120", { cone1: "120" }, "a2d"],
    ["a2d", "second angle 0", { cone1: "0" }, "a2d"],
    ["a2d", "second angle just under 120", { cone1: "119.99" }, ""],
    ["a2d", "an angle blank", { cone1: "" }, "a2d"],
    ["a2d", "an angle negative", { cone0: "-1" }, "a2d"],
    ["a2d", "0, 2D not ticked", { cone0: "0", ...OFF["2d"] }, ""],
    // ads: every down angle over 0 and under 150, the thickness over 0 and under 30, with down imaging
    ["ads", "first angle 0", { down0: "0" }, "ads"],
    ["ads", "first angle just over 0", { down0: "0.01" }, ""],
    ["ads", "first angle just under 150", { down0: "149.99" }, ""],
    ["ads", "first angle 150", { down0: "150" }, "ads"],
    ["ads", "second angle 150", { down1: "150" }, "ads"],
    ["ads", "second angle 0", { down1: "0" }, "ads"],
    ["ads", "an angle blank", { down1: "" }, "ads"],
    ["ads", "thickness 0", { dst: "0" }, "ads"],
    ["ads", "thickness just over 0", { dst: "0.01" }, ""],
    ["ads", "thickness just under 30", { dst: "29.99" }, ""],
    ["ads", "thickness 30", { dst: "30" }, "ads"],
    ["ads", "thickness blank", { dst: "" }, "ads"],
    [
      "ads",
      "angle and thickness 0, down imaging not ticked",
      { down0: "0", dst: "0", ...OFF.ds },
      "",
    ],
    // ass: every side angle over 0 and under 91, the edge 0 or more, the edge plus the widest
    // fan 90 at most, the thickness over 0 and under 30, with side imaging
    ["ass", "a fan 0", { side1: "0" }, "ass"],
    ["ass", "a fan just over 0", { side1: "0.01" }, ""],
    ["ass", "a fan negative", { side1: "-1" }, "ass"],
    ["ass", "a fan blank", { side1: "" }, "ass"],
    ["ass", "widest fan 90 with the edge at 0", { side0: "90", sso: "0" }, ""],
    ["ass", "widest fan just over 90 with the edge at 0", { side0: "90.01", sso: "0" }, "ass"],
    ["ass", "widest fan 90.99 with the edge at 0", { side0: "90.99", sso: "0" }, "ass"],
    ["ass", "widest fan 91 with the edge at 0", { side0: "91", sso: "0" }, "ass"],
    ["ass", "edge 0", { sso: "0" }, ""],
    ["ass", "edge minus zero", { sso: "-0" }, ""],
    ["ass", "edge just under 0", { sso: "-0.01" }, "ass"],
    ["ass", "edge negative with a narrow fan", { sso: "-1", side0: "40" }, "ass"],
    ["ass", "edge plus widest fan exactly 90", { sso: "5", side0: "85" }, ""],
    ["ass", "edge plus widest fan just over 90", { sso: "5.01", side0: "85" }, "ass"],
    [
      "ass",
      "the second fan the widest, past 90 with the edge",
      { side0: "30", side1: "86" },
      "ass",
    ],
    ["ass", "edge 4.9 and fan 85.1", { sso: "4.9", side0: "85.1" }, ""],
    ["ass", "edge 0.1 and fan 89.9", { sso: "0.1", side0: "89.9" }, ""],
    ["ass", "edge 30.3 and fan 59.7", { sso: "30.3", side0: "59.7" }, ""],
    ["ass", "edge blank", { sso: "" }, "ass"],
    ["ass", "thickness 0", { sst: "0" }, "ass"],
    ["ass", "thickness just over 0", { sst: "0.01" }, ""],
    ["ass", "thickness just under 30", { sst: "29.99" }, ""],
    ["ass", "thickness 30", { sst: "30" }, "ass"],
    ["ass", "a fan 0, side imaging not ticked", { side1: "0", ...OFF.ss }, ""],
    // aat: the width over 0 and 180 at most, the thickness over 0 and under 90, with live sonar
    ["aat", "width 0", { atw: "0" }, "aat"],
    ["aat", "width just over 0", { atw: "0.01" }, ""],
    ["aat", "width 180", { atw: "180" }, ""],
    ["aat", "width just over 180", { atw: "180.01" }, "aat"],
    ["aat", "width blank", { atw: "" }, "aat"],
    ["aat", "thickness 0", { att: "0" }, "aat"],
    ["aat", "thickness just over 0", { att: "0.01" }, ""],
    ["aat", "thickness just under 90", { att: "89.99" }, ""],
    ["aat", "thickness 90", { att: "90" }, "aat"],
    ["aat", "thickness blank", { att: "" }, "aat"],
    ["aat", "width 0, live sonar not ticked", { atw: "0", ...OFF.at }, ""],
    // mnt: the flat mount 0 or more and under 90, the forward mount 0 to 90, with live sonar
    ["mnt", "flat mount 0", { atsb: "0" }, ""],
    ["mnt", "flat mount just under 0", { atsb: "-0.01" }, "mnt"],
    ["mnt", "flat mount just under 90", { atsb: "89.99" }, ""],
    ["mnt", "flat mount 90", { atsb: "90" }, "mnt"],
    ["mnt", "flat mount blank", { atsb: "" }, "mnt"],
    ["mnt", "forward mount 0", { atfa: "0" }, ""],
    ["mnt", "forward mount just under 0", { atfa: "-0.01" }, "mnt"],
    ["mnt", "forward mount 90", { atfa: "90" }, ""],
    ["mnt", "forward mount just over 90", { atfa: "90.01" }, "mnt"],
    ["mnt", "forward mount blank", { atfa: "" }, "mnt"],
    ["mnt", "flat mount 90, live sonar not ticked", { atsb: "90", ...OFF.at }, ""],
    // several at once
    ["", "everything invalid", ALL_BAD, "dep sog ssr atr zt a2d ads ass aat mnt"],
    [
      "",
      "everything invalid, no sonar ticked",
      { ...ALL_BAD, ...OFF.ss, ...OFF["2d"], ...OFF.ds, ...OFF.at },
      "dep sog",
    ],
    [
      "",
      "everything invalid, only side imaging ticked",
      { ...ALL_BAD, ...OFF["2d"], ...OFF.ds, ...OFF.at },
      "dep sog ssr ass",
    ],
    [
      "",
      "everything invalid, only 2D ticked",
      { ...ALL_BAD, ...OFF.ss, ...OFF.ds, ...OFF.at },
      "dep sog a2d",
    ],
    [
      "",
      "everything invalid, only down imaging ticked",
      { ...ALL_BAD, ...OFF.ss, ...OFF["2d"], ...OFF.at },
      "dep sog ads",
    ],
    [
      "",
      "everything invalid, only live sonar ticked",
      { ...ALL_BAD, ...OFF.ss, ...OFF["2d"], ...OFF.ds },
      "dep sog atr zt aat mnt",
    ],
    [
      "",
      "range and angles invalid",
      { ssr: "0", atr: "0", cone0: "0", down0: "0" },
      "ssr atr a2d ads",
    ],
  ];

  it.each(matrix)("%s: %s", (_check, _about, over, keys) => {
    expect(messagesOf(fieldsOf(over))).toEqual(messagesFor(keys));
  });

  it("has a valid and an invalid row for every check, and a row with its sonar not ticked", () => {
    for (const check of CHECKS) {
      const rows = matrix.filter(([key]) => key === check);
      expect(rows.some(([, , , keys]) => keys === check)).toBe(true);
      expect(rows.some(([, , , keys]) => keys === "")).toBe(true);
      if (check !== "dep" && check !== "sog")
        expect(rows.some(([, about]) => about.endsWith("not ticked"))).toBe(true);
    }
  });

  // A transducer with three or four frequencies of a kind: the last one alone at an edge.
  it.each<[string, string, RawFields, string]>([
    ["hb_xm9hw", "", { down2: "150" }, "ads"],
    ["hb_xm9hw", "", { side2: "0" }, "ass"],
    ["hb_xm9hw", "", { down2: "149.99", side2: "86" }, ""],
    ["hb_xm920", "hb_xm9hw", { cone3: "120" }, "a2d"],
    ["hb_xm920", "hb_xm9hw", { cone3: "119.99" }, ""],
  ])("%s with %j checks every frequency: %j", (first, second, over, keys) => {
    expect(failing(messagesOf(fieldsOf(over, first, second, "ml2")))).toBe(keys);
  });

  // A live sonar that takes one transducer (its preset is not dual): ticked, it is
  // checked like any other. The check, what is tested, the fields changed, the live
  // sonar, the checks that then have a message.
  it.each<[string, string, RawFields, string, string]>([
    ["atr", "range 0", { atr: "0" }, "ml2", "atr"],
    ["zt", "transducer just under 0", { zt: "-0.01" }, "lvs34", "zt"],
    ["aat", "width 0", { atw: "0" }, "other", "aat"],
    ["mnt", "flat mount 90, one transducer chosen", { atsb: "90", "at-n": "1" }, "ml2", "mnt"],
    ["mnt", "forward mount just over 90", { atfa: "90.01" }, "lvs34", "mnt"],
    ["", "nothing invalid", {}, "ml2", ""],
  ])(
    "%s: %s (%j), with the live sonar %s ticked, which takes one transducer",
    (_check, _about, over, live, keys) => {
      const fields = fieldsOf(over, "lowrance", "", live);
      expect(flags(equipmentOf(fields))).toBe("111100");
      expect(messagesOf(fields)).toEqual(messagesFor(keys));
    },
  );

  it("writes every message word for word", () => {
    expect(messagesOf(fieldsOf(ALL_BAD))).toEqual(MESSAGES);
  });

  it("has a text for each of the ten checks, in the earlier page's order", () => {
    expect(Object.keys(messagesOf(fieldsOf()))).toEqual([
      "dep",
      "sog",
      "ssr",
      "atr",
      "zt",
      "a2d",
      "ads",
      "ass",
      "aat",
      "mnt",
    ]);
  });
});

describe("settingsView: where the messages go (line 264)", () => {
  it("shows each message in its element", () => {
    expect(settingsView(messagesOf(fieldsOf(ALL_BAD)))).toEqual({
      "dep-err": { text: MESSAGES.dep, hidden: false },
      "sog-err": { text: MESSAGES.sog, hidden: false },
      "ssr-err": { text: MESSAGES.ssr, hidden: false },
      "atr-err": { text: MESSAGES.atr, hidden: false },
      "zt-err": { text: MESSAGES.zt, hidden: false },
      "a2d-err": { text: MESSAGES.a2d, hidden: false },
      "ads-err": { text: MESSAGES.ads, hidden: false },
      "ass-err": { text: MESSAGES.ass, hidden: false },
      "aat-err": { text: MESSAGES.aat, hidden: false },
      "mnt-err": { text: MESSAGES.mnt, hidden: false },
    });
  });

  it("empties and hides the element of a check that passes", () => {
    const view = settingsView(messagesOf(fieldsOf()));
    expect(Object.keys(view)).toEqual(CHECKS.map((key) => `${key}-err`));
    for (const patch of Object.values(view)) expect(patch).toEqual({ text: "", hidden: true });
  });

  it("recovers: a message goes when its field is valid again", () => {
    const bad = settingsView(messagesOf(fieldsOf({ dep: "0", cone0: "120" })));
    expect(bad["dep-err"]).toEqual({ text: MESSAGES.dep, hidden: false });
    expect(bad["a2d-err"]).toEqual({ text: MESSAGES.a2d, hidden: false });
    const good = settingsView(messagesOf(fieldsOf({ dep: "0.01", cone0: "119.99" })));
    expect(good["dep-err"]).toEqual({ text: "", hidden: true });
    expect(good["a2d-err"]).toEqual({ text: "", hidden: true });
  });
});

describe("isModified: the mark on the source line of a changed angle (line 265)", () => {
  // the field's text, the text of the preset's angle (null: the field has none), marked
  it.each<[string, string | null, boolean]>([
    ["50", "50", false],
    ["50.0", "50", false],
    ["50,0", "50", false],
    [" 50 ", "50", false],
    ["5e1", "50", false],
    ["0x32", "50", false],
    ["51", "50", true],
    ["49.99", "50", true],
    ["", "50", true],
    [" ", "50", true],
    ["abc", "50", true],
    ["0", "0", false],
    ["-0", "0", false],
    ["0", null, false],
    ["", null, true],
    ["5", null, true],
    ["0", "", false],
    ["5", "", true],
    ["5", "abc", true],
    ["abc", "abc", true],
    ["5", " 5 ", false],
    ["5", "5,0", true],
    ["1000", "1e3", false],
  ])("field %j, preset %j: %j", (value, def, marked) => {
    expect(isModified(value, def)).toBe(marked);
  });

  it("marks the changed rows of the page, and no other", () => {
    const marks = (over: RawFields): string => {
      const fields = fieldsOf(over);
      const p = combined("lowrance", "");
      const l = livePreset("at2");
      // The rows of the angle cards and the preset's angle of each (legacy lines 209 to 220).
      const rows: [string, number][] = [
        ...p.cone.map((c, i): [string, number] => [`cone${i}`, c.a]),
        ...p.down.map((c, i): [string, number] => [`down${i}`, c.a]),
        ["dst", THICKNESS.dst],
        ...p.side.map((c, i): [string, number] => [`side${i}`, c.a]),
        ["sso", p.edge],
        ["sst", THICKNESS.sst],
        ["atw", l.w],
        ["att", l.t],
      ];
      return rows
        .filter(([id, def]) => isModified(String(fields[id]), String(def)))
        .map(([id]) => id)
        .join(" ");
    };
    expect(marks({})).toBe("");
    expect(marks({ cone0: "50.0", down1: "31", sso: "", atw: "135,0", att: "18.5" })).toBe(
      "down1 sso att",
    );
  });
});

/** An equipment from its six digits, in the order of its keys. */
function equipmentFrom(digits: string): Equipment {
  const on = (i: number): boolean => digits[i] === "1";
  return { ss: on(0), "2d": on(1), ds: on(2), at: on(3), dual: on(4), atw: on(5) };
}

// The equipment as six digits; whether an element is hidden, one digit for each
// value of `data-eq` in TOKENS; whether All beams compared is hidden. Every
// equipment the page can have.
const TOKENS = [
  "ss",
  "2d",
  "ds",
  "at",
  "dual",
  "atw",
  "ss ds",
  "2d ds",
  "ss 2d ds",
  "ss at",
  "at atw",
  "ds 2d ss at",
  "nope",
  "",
  "ss  nope",
  " ",
  "SS",
  "nope 2d",
];
const BY_EQUIPMENT: [string, string, boolean][] = [
  ["000000", "111111111111111111", true],
  ["000111", "111000111000111111", false],
  ["001000", "110111000110111111", false],
  ["001111", "110000000000111111", false],
  ["010000", "101111100110111110", false],
  ["010111", "101000100000111110", false],
  ["011000", "100111000110111110", false],
  ["011111", "100000000000111110", false],
  ["100000", "011111010010110111", false],
  ["100111", "011000010000110111", false],
  ["101000", "010111000010110111", false],
  ["101111", "010000000000110111", false],
  ["110000", "001111000010110110", false],
  ["110111", "001000000000110110", false],
  ["111000", "000111000010110110", false],
  ["111111", "000000000000110110", false],
  ["000110", "111001111000111111", false],
  ["001110", "110001000000111111", false],
  ["010110", "101001100000111110", false],
  ["011110", "100001000000111110", false],
  ["100110", "011001010000110111", false],
  ["101110", "010001000000110111", false],
  ["110110", "001001000000110110", false],
  ["111110", "000001000000110110", false],
  ["000100", "111011111000111111", false],
  ["001100", "110011000000111111", false],
  ["010100", "101011100000111110", false],
  ["011100", "100011000000111110", false],
  ["100100", "011011010000110111", false],
  ["101100", "010011000000110111", false],
  ["110100", "001011000000110110", false],
  ["111100", "000011000000110110", false],
];

describe("hiddenFor: what an element marked with sonars does (line 269)", () => {
  it.each(BY_EQUIPMENT)("equipment %s hides %s", (digits, hidden) => {
    const eq = equipmentFrom(digits);
    expect(TOKENS.map((tokens) => (hiddenFor(eq, tokens) ? "1" : "0")).join("")).toBe(hidden);
  });

  it("shows an element when one of its sonars is ticked, and hides it for a name that is no sonar", () => {
    const eq = equipmentFrom("100000");
    expect(hiddenFor(eq, "ss")).toBe(false);
    expect(hiddenFor(eq, "ds ss")).toBe(false);
    expect(hiddenFor(eq, "ds")).toBe(true);
    expect(hiddenFor(eq, "nope")).toBe(true);
    expect(hiddenFor(eq, "")).toBe(true);
  });
});

describe("equipmentView: with and without a sonar (lines 270 to 272)", () => {
  it.each(BY_EQUIPMENT)("equipment %s", (digits, _hidden, none) => {
    expect(equipmentView(equipmentFrom(digits))).toEqual({
      "sec-cmp": { hidden: none },
      "eq-err": { text: none ? NO_SONAR : "", hidden: !none },
    });
  });

  it("asks for a sonar when none is ticked, and recovers when one is", () => {
    expect(
      equipmentView(equipmentOf(fieldsOf({ ...OFF.ss, ...OFF["2d"], ...OFF.ds, ...OFF.at }))),
    ).toEqual({
      "sec-cmp": { hidden: true },
      "eq-err": { text: "Tick at least one sonar to see its sections.", hidden: false },
    });
    expect(equipmentView(equipmentOf(fieldsOf({ ...OFF.ss, ...OFF["2d"], ...OFF.at })))).toEqual({
      "sec-cmp": { hidden: false },
      "eq-err": { text: "", hidden: true },
    });
  });
});

// ---------------------------------------------------------------------------
// The recorded page (fixtures/README.md)
// ---------------------------------------------------------------------------

// The project's TypeScript does not load the Node types (tsconfig `types`), so
// the two things this test needs from Node are described here.
declare const __dirname: string;
interface FileSystem {
  existsSync(path: string): boolean;
  readFileSync(path: string, encoding: "utf8"): string;
}
const { existsSync, readFileSync } = jest.requireActual<FileSystem>("node:fs");

const RECORDED = `${__dirname}/../fixtures/legacy`;

/** A text the recording holds in full, or as its digest and length. */
type RecordedText = string | { fnv1a: string; length: number };

/** How the earlier page left one element, as far as this test reads it. */
interface RecordedPatch {
  text?: RecordedText;
  html?: RecordedText;
  hidden?: boolean;
}

/** What a recording started from, as far as this test reads it. */
interface RecordedScenario {
  name: string;
  fields: Record<string, string | boolean>;
}

interface RecordedFile {
  scenario: RecordedScenario;
  patches: Record<string, RecordedPatch | { same: string }>;
}

interface RecordedIndex {
  schemes: string[];
  scenarios: { name: string }[];
  omitted: Record<string, string>;
}

const files = new Map<string, unknown>();
function read<T>(path: string): T {
  if (!files.has(path)) files.set(path, JSON.parse(readFileSync(`${RECORDED}/${path}`, "utf8")));
  return files.get(path) as T;
}
const index = read<RecordedIndex>("index.json");

/** A section file of a scenario and scheme (`<scenario>/<scheme>`), or the file the index says it equals. */
function sectionFile(at: string, section: string): RecordedFile {
  let path = `${at}/${section}.json`;
  for (let equal = index.omitted[path]; equal !== undefined; equal = index.omitted[path])
    path = equal;
  return read<RecordedFile>(path);
}

/** The patch of one element, read where a `same` says it is. */
function recorded(at: string, section: string, key: string): RecordedPatch | undefined {
  let patch = sectionFile(at, section).patches[key];
  for (let hops = 0; patch !== undefined && "same" in patch; hops += 1) {
    if (hops > 2) throw new Error(`${at}, ${key}: more than two "same" in a row`);
    patch = sectionFile(patch.same, section).patches[key];
  }
  return patch;
}

/** What a recording started from, read from a file of its own: one a section equals holds another scenario. */
function scenarioOf(name: string): RecordedScenario {
  const own = ["page", "set"]
    .map((section) => `${name}/light/${section}.json`)
    .find((path) => existsSync(`${RECORDED}/${path}`));
  if (own === undefined) throw new Error(`${name}: no file of its own to read the scenario from`);
  return read<RecordedFile>(own).scenario;
}

/** The html of an element the recording holds in full. */
function recordedHtml(at: string, section: string, key: string): string {
  const html = recorded(at, section, key)?.html;
  if (typeof html !== "string") throw new Error(`${at}, ${key}: no html in full`);
  return html;
}

/** The elements of KEYS that are in the page's markup, and the section each is recorded in. */
const IN_MARKUP: [(typeof KEYS)[number], string][] = [
  ["dep-err", "set"],
  ["sog-err", "set"],
  ["ssr-err", "set"],
  ["atr-err", "set"],
  ["zt-err", "set"],
  ["mnt-err", "set"],
  ["eq-err", "set"],
  ["sec-cmp", "cmp"],
];

/**
 * The elements of KEYS that the script makes, inside the angle cards: the
 * recording has no patch for them, they are in the html of their card.
 */
const IN_CARD: [(typeof KEYS)[number], string][] = [
  ["a2d-err", "ang-img"],
  ["ads-err", "ang-img"],
  ["ass-err", "ang-img"],
  ["aat-err", "ang-live"],
];

const SCENARIOS = index.scenarios.map((scenario) => scenario.name);

/** What the functions write for a recorded scenario. */
function viewOf(scenario: RecordedScenario): SectionView {
  return {
    ...settingsView(messagesOf(scenario.fields)),
    ...equipmentView(equipmentOf(scenario.fields)),
  };
}

describe("against the recorded page", () => {
  it("reads every scenario, in light and dark", () => {
    expect(SCENARIOS).toHaveLength(168);
    expect(index.schemes).toEqual(["light", "dark"]);
    expect([...IN_MARKUP, ...IN_CARD].map(([key]) => key).sort()).toEqual([...KEYS].sort());
  });

  it("shows every message of Settings in a scenario, each compared below", () => {
    const seen = new Set<string>();
    for (const name of SCENARIOS) {
      for (const [key, patch] of Object.entries(viewOf(scenarioOf(name)))) {
        if (patch.text) seen.add(`${key}: ${patch.text}`);
      }
    }
    expect([...seen].sort()).toEqual(
      [
        ...Object.entries(MESSAGES).map(([key, message]) => `${key}-err: ${message}`),
        `eq-err: ${NO_SONAR}`,
      ].sort(),
    );
  });

  describe.each(
    SCENARIOS.flatMap((name) => index.schemes.map((scheme): [string, string] => [name, scheme])),
  )("%s, %s", (name, scheme) => {
    const at = `${name}/${scheme}`;
    const scenario = scenarioOf(name);
    const view = viewOf(scenario);
    const eq = equipmentOf(scenario.fields);

    it("writes the keys of KEYS", () => {
      expect(scenario.name).toBe(name);
      expect(Object.keys(view).sort()).toEqual([...KEYS].sort());
    });

    it.each(IN_MARKUP)("leaves %s as the earlier page left it", (key, section) => {
      const patch = view[key] ?? {};
      const was = recorded(at, section, key);
      expect(was).toBeDefined();
      expect(Object.keys(patch).length).toBeGreaterThan(0);
      if (patch.text !== undefined) {
        expect(patch.text).toBe(was?.text);
        // A message has no markup: the element's html is its text.
        expect(patch.text).toBe(was?.html);
      }
      if (patch.hidden !== undefined) expect(patch.hidden).toBe(was?.hidden);
      expect(Object.keys(patch).filter((facet) => !["text", "hidden"].includes(facet))).toEqual([]);
    });

    it.each(IN_CARD)("leaves %s, inside %s, as the earlier page left it", (key, card) => {
      const patch = view[key] ?? {};
      const written = new RegExp(`<p class="err" id="${key}"( hidden="")?>([^<]*)</p>`).exec(
        recordedHtml(at, "set", card),
      );
      expect(written).not.toBeNull();
      expect(Object.keys(patch).sort()).toEqual(["hidden", "text"]);
      expect(patch.hidden).toBe(written?.[1] !== undefined);
      expect(patch.text).toBe(written?.[2]);
    });

    it("marks the source lines of the changed angles, and no other", () => {
      const html = recordedHtml(at, "set", "ang-img") + recordedHtml(at, "set", "ang-live");
      const rows = [
        ...html.matchAll(
          /<input id="([^"]+)"[^>]* data-def="([^"]*)"><span>°<\/span><\/div><p class="src( mod)?" data-src="([^"]+)">/g,
        ),
      ];
      // Every source line of the two cards is one of the rows.
      expect(rows).toHaveLength(html.split(" data-src=").length - 1);
      expect(rows.length).toBeGreaterThanOrEqual(11);
      for (const [, id = "", def = "", mod, source] of rows) {
        expect(source).toBe(id);
        const value = scenario.fields[id];
        expect(typeof value).toBe("string");
        expect([id, isModified(String(value), def)]).toEqual([id, mod !== undefined]);
      }
    });

    it("hides the angles of the sonars that are not ticked", () => {
      const groups = [
        ...recordedHtml(at, "set", "ang-img").matchAll(
          /<div class="agrp" data-eq="([^"]*)"( hidden="")?>/g,
        ),
      ];
      expect(groups.map(([, tokens]) => tokens)).toEqual(["2d", "ds", "ss"]);
      for (const [, tokens = "", hidden] of groups) {
        expect([tokens, hiddenFor(eq, tokens)]).toEqual([tokens, hidden !== undefined]);
      }
    });
  });
});
