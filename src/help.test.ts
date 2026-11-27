/**
 * The help pictures against the earlier page (legacy/src/p2.js, lines 1569 to
 * 1768), in two ways. The expected values of the first part were printed by
 * those lines themselves, run unchanged in Node against a stand-in for the
 * page's elements and its `document`; the two click handlers of lines 1743 and
 * 1757 were driven with stand-in events, in en-US and in sv-SE. A picture is
 * long, so each row holds the digest and the length of what the handler wrote
 * (FNV-1a of the UTF-8 bytes, as `fixtures/README.md` does): its title, the
 * line under it, the picture, the explanation and the note, together; a few
 * are in full. The second part compares the "?" buttons of the earlier page's
 * preset cards, as they were recorded in a browser (`fixtures/legacy/`), with
 * the topics the module has.
 */
import { dataRows } from "./datacards";
import { createFormatter } from "./format";
import {
  figureHelpView,
  HELP_KEYS,
  hasHelp,
  helpExplanation,
  helpKey,
  helpPicture,
  helpTitle,
  KEYS,
  settingHelpView,
} from "./help";
import { parseSettings } from "./settings";
import { combined, livePreset, namesOf } from "./transducers";
import type { Names, RawFields, SavedValue, SectionView } from "./types";

/** FNV-1a, 32 bit, over bytes, as eight hex digits (fixtures/README.md). */
function fnv1aOf(bytes: Uint8Array): string {
  let h = 0x811c9dc5;
  for (const byte of bytes) h = Math.imul(h ^ byte, 0x01000193) >>> 0;
  return h.toString(16).padStart(8, "0");
}

/** A text as its digest and its length in characters, which is how the expected values hold a long one. */
const dig = (text: string): string => `${fnv1aOf(new TextEncoder().encode(text))}:${text.length}`;

// ---------------------------------------------------------------------------
// What a test gives the module
// ---------------------------------------------------------------------------

/** The fields of the page for chosen transducers, with some changed; `null` takes a field away (legacy lines 209 to 220). */
function fieldsOf(
  img: string,
  sec: string,
  live: string,
  over: Readonly<Record<string, SavedValue | null>>,
): RawFields {
  const p = combined(img, sec);
  const l = livePreset(live);
  const fields: Record<string, SavedValue> = {
    "img-p": img,
    "img-s": sec,
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
    dst: "3",
    sso: String(p.edge),
    sst: "2",
    ssalign: "inner",
    atw: String(l.w),
    att: String(l.t),
  };
  for (const [i, c] of p.cone.entries()) fields[`cone${i}`] = String(c.a);
  for (const [i, c] of p.down.entries()) fields[`down${i}`] = String(c.a);
  for (const [i, c] of p.side.entries()) fields[`side${i}`] = String(c.a);
  for (const [id, value] of Object.entries(over)) {
    if (value === null) delete fields[id];
    else fields[id] = value;
  }
  return fields;
}

/** What the module reads of a section's input, for a page with the given fields. */
function inputOf(fields: RawFields, locale: string) {
  const first = String(fields["img-p"]);
  const second = String(fields["img-s"]);
  const live = String(fields["live-p"]);
  const align = fields.ssalign;
  return {
    settings: parseSettings(fields, combined(first, second)),
    names: namesOf(first, live),
    local: typeof align === "string" ? { ssalign: align } : {},
    fmt: createFormatter(locale),
  };
}

type Set = readonly [
  name: string,
  img: string,
  sec: string,
  live: string,
  over: Readonly<Record<string, SavedValue | null>>,
  locale: string,
];

const BLANKS: Readonly<Record<string, SavedValue>> = {
  dep: " ",
  sog: " ",
  ssr: " ",
  atr: " ",
  zt: " ",
  dst: " ",
  sso: " ",
  sst: " ",
  atw: " ",
  att: " ",
  atsb: " ",
  atfa: " ",
  cone0: " ",
  cone1: " ",
  down0: " ",
  down1: " ",
  side0: " ",
  side1: " ",
};

/** The pages the pictures are drawn for: transducers, fields changed, locale. */
const SETS: readonly Set[] = [
  ["base", "lowrance", "", "at2", {}, "en-US"],
  ["base-sv", "lowrance", "", "at2", {}, "sv-SE"],
  ["hb3", "hb_xm9hw", "", "at2xl", {}, "en-US"],
  ["second", "hb_xm9hw", "hb_xm14hw", "ml2", {}, "en-US"],
  ["other", "other", "", "other", {}, "en-US"],
  ["lvs34", "lowrance_nose", "", "lvs34", {}, "en-US"],
  [
    "deep",
    "lowrance",
    "",
    "at2",
    {
      dep: "300",
      sog: "12",
      ssr: "150",
      atr: "100",
      zt: "2.5",
      dst: "10",
      sso: "20",
      sst: "10",
      atw: "90",
      att: "45",
      atsb: "60",
      atfa: "70",
      cone0: "90",
      down0: "100",
      side0: "60",
    },
    "en-US",
  ],
  [
    "shallow",
    "lowrance",
    "",
    "at2",
    {
      dep: "0.5",
      sog: "0.3",
      ssr: "5",
      atr: "3",
      zt: "0",
      dst: "0.5",
      sso: "0",
      sst: "0.5",
      atw: "20",
      att: "5",
      atsb: "0",
      atfa: "0",
      cone0: "10",
      down0: "10",
      side0: "10",
    },
    "en-US",
  ],
  [
    "zero",
    "lowrance",
    "",
    "at2",
    {
      dep: "0",
      sog: "0",
      ssr: "0",
      atr: "0",
      zt: "0",
      dst: "0",
      sso: "0",
      sst: "0",
      atw: "0",
      att: "0",
      atsb: "0",
      atfa: "0",
      cone0: "0",
      cone1: "0",
      down0: "0",
      down1: "0",
      side0: "0",
      side1: "0",
    },
    "en-US",
  ],
  [
    "negative",
    "lowrance",
    "",
    "at2",
    {
      dep: "-5",
      sog: "-1",
      ssr: "-40",
      atr: "-3",
      zt: "-0.5",
      dst: "-3",
      sso: "-5",
      sst: "-2",
      atw: "-135",
      att: "-18",
      atsb: "-20",
      atfa: "-45",
      cone0: "-50",
      cone1: "-20",
      down0: "-51",
      down1: "-30",
      side0: "-85",
      side1: "-36",
    },
    "en-US",
  ],
  ["blank", "lowrance", "", "at2", BLANKS, "en-US"],
  [
    "huge",
    "lowrance",
    "",
    "at2",
    {
      dep: "1e308",
      sog: "1e300",
      ssr: "1e9",
      atr: "1e6",
      zt: "1e5",
      dst: "1e3",
      sso: "1e3",
      sst: "1e3",
      atw: "1e3",
      att: "1e3",
      atsb: "1e3",
      atfa: "1e3",
      cone0: "1e3",
      cone1: "1e3",
      down0: "1e3",
      down1: "1e3",
      side0: "1e3",
      side1: "1e3",
    },
    "en-US",
  ],
  [
    "tiny",
    "lowrance",
    "",
    "at2",
    {
      dep: "1e-9",
      sog: "1e-9",
      ssr: "1e-9",
      atr: "1e-9",
      zt: "1e-9",
      dst: "1e-9",
      sso: "1e-9",
      sst: "1e-9",
      atw: "1e-9",
      att: "1e-9",
      atsb: "1e-9",
      atfa: "1e-9",
      cone0: "1e-9",
      down0: "1e-9",
      side0: "1e-9",
    },
    "en-US",
  ],
  [
    "edge",
    "lowrance",
    "",
    "at2",
    {
      cone0: "119.9",
      cone1: "120",
      down0: "149.9",
      down1: "150",
      side0: "91",
      side1: "90",
      sso: "90",
      sst: "29.9",
      atw: "180",
      att: "89.9",
      atfa: "90",
      atsb: "89.9",
      atr: "10.1",
      dep: "10",
      zt: "0.5",
    },
    "en-US",
  ],
  ["kmh", "lowrance", "", "at2", { sogu: "kmh", sog: "30" }, "en-US"],
  ["center", "lowrance", "", "at2", { ssalign: "center" }, "en-US"],
  ["no-align", "lowrance", "", "at2", { ssalign: null }, "en-US"],
  [
    "decimals-sv",
    "hb_xm920",
    "",
    "at2",
    {
      dep: "7,5",
      sog: "3,6",
      sst: "2,5",
      dst: "4,5",
      sso: "3,5",
      atw: "120,5",
      att: "17,5",
      atsb: "12,5",
      atfa: "33,3",
      cone0: "45,5",
      down0: "40,5",
      side0: "70,5",
    },
    "sv-SE",
  ],
  [
    "text",
    "lowrance",
    "",
    "at2",
    {
      dep: "abc",
      sog: "0x10",
      ssr: "1e3",
      atr: "",
      zt: "Infinity",
      dst: "3 ",
      sso: " 5",
      sst: "--2",
      atw: "135",
      att: "x",
    },
    "en-US",
  ],
];

/** The ids of the fields a "?" button can name, and some it cannot (nothing: no topic; maxd: a topic without a field). */
const IDS = [
  "dep",
  "sog",
  "ssr",
  "atr",
  "zt",
  "atsb",
  "atfa",
  "at-n",
  "dst",
  "sso",
  "sst",
  "ssalign",
  "atw",
  "att",
  "cone0",
  "cone1",
  "cone2",
  "down0",
  "down1",
  "down2",
  "down3",
  "side0",
  "side1",
  "side2",
  "side5",
  "nothing",
  "maxd",
] as const;

/** The text of the label a button sits in, with the white space the earlier page trims. */
const labelOf = (id: string): string => `  Label of ${id} \n `;

/** What the earlier page's dialog holds after a click, in one shape for both handlers; null when nothing was written. */
function canon(view: SectionView | undefined): unknown {
  if (view === undefined) return null;
  return {
    h: view["help-h"]?.text,
    sub: view["help-sub"]?.text,
    subHidden: view["help-sub"]?.hidden,
    fig: view["help-fig"]?.html,
    x: view["help-x"]?.html,
    note: view["help-note"]?.text,
  };
}

// ---------------------------------------------------------------------------
// The expected values, printed by the earlier lines
// ---------------------------------------------------------------------------

/** The digest and the length of what the handler of a "?" button in Settings writes, by set, for each of `IDS`. */
const SETTING: Readonly<Record<string, readonly string[]>> = {
  base: [
    "3e315efa:1685",
    "ad948a5c:1957",
    "ea4a4e45:2707",
    "cc03e973:1666",
    "3d1c4378:1386",
    "0496c421:2202",
    "c89445cb:2261",
    "9b04fcf9:2169",
    "ff3a8776:2023",
    "0b0586d4:1977",
    "2cba6289:1493",
    "0eaebacc:2742",
    "8eb2789d:1526",
    "2ffbc9d3:1586",
    "3a86091f:2520",
    "42aad7fb:2524",
    "fe0c4e7e:2524",
    "502b8376:2160",
    "396a8440:2160",
    "014ba6c5:2160",
    "352dedac:2160",
    "32ad98e4:1596",
    "5b83645b:1598",
    "00709a61:1598",
    "03c62676:1598",
    "77074ba4:4",
    "daa88fa0:2012",
  ],
  "base-sv": [
    "abd55ad0:1685",
    "a7a85b6c:1957",
    "f8cb4f5b:2707",
    "dfe606cd:1666",
    "f131d632:1386",
    "0496c421:2202",
    "c89445cb:2261",
    "9b04fcf9:2169",
    "4bd082f0:2023",
    "f801daa6:1977",
    "f54709eb:1493",
    "0eaebacc:2742",
    "8eb2789d:1526",
    "2ffbc9d3:1586",
    "42a291a5:2520",
    "4a417961:2524",
    "9952855c:2524",
    "502b8376:2160",
    "396a8440:2160",
    "014ba6c5:2160",
    "352dedac:2160",
    "32ad98e4:1596",
    "5b83645b:1598",
    "00709a61:1598",
    "03c62676:1598",
    "77074ba4:4",
    "3efe57b2:2012",
  ],
  hb3: [
    "3e315efa:1685",
    "ad948a5c:1957",
    "a082790e:2709",
    "cc03e973:1666",
    "3d1c4378:1386",
    "3493eda6:2212",
    "9476956a:2259",
    "b7a28689:2189",
    "77a5e75f:2027",
    "ad18a14e:1981",
    "1ac9ee68:1497",
    "21d70a8d:2741",
    "bba32dc9:1540",
    "03ec74a5:1587",
    "05b94604:2524",
    "902540b4:2524",
    "fe0c4e7e:2524",
    "7bd0c9c5:2164",
    "48c5bec4:2168",
    "dda4cca3:2164",
    "344f19de:2168",
    "343948d7:1600",
    "8f915a76:1600",
    "9dcc58b5:1600",
    "01a5651b:1602",
    "77074ba4:4",
    "daa88fa0:2012",
  ],
  second: [
    "3e315efa:1685",
    "ad948a5c:1957",
    "a082790e:2709",
    "cc03e973:1666",
    "3d1c4378:1386",
    "5338005d:2215",
    "0ca73433:2262",
    "c04444f0:2172",
    "77a5e75f:2027",
    "ad18a14e:1981",
    "1ac9ee68:1497",
    "21d70a8d:2741",
    "7328f767:1531",
    "03ec74a5:1587",
    "05b94604:2524",
    "902540b4:2524",
    "fe0c4e7e:2524",
    "7bd0c9c5:2164",
    "48c5bec4:2168",
    "dda4cca3:2164",
    "344f19de:2168",
    "343948d7:1600",
    "8f915a76:1600",
    "9dcc58b5:1600",
    "01a5651b:1602",
    "77074ba4:4",
    "daa88fa0:2012",
  ],
  other: [
    "3e315efa:1685",
    "ad948a5c:1957",
    "1cdf8f10:2711",
    "cc03e973:1666",
    "3d1c4378:1386",
    "d7b60a50:2215",
    "c89445cb:2261",
    "335b5c29:2177",
    "70b9e3bf:2027",
    "c224c5ef:1981",
    "d9cf9048:1497",
    "0eaebacc:2742",
    "0fae1f09:1534",
    "03ec74a5:1587",
    "3a86091f:2520",
    "42aad7fb:2524",
    "fe0c4e7e:2524",
    "922046c5:2164",
    "df0d1e84:2168",
    "ce126167:2168",
    "05b527de:2168",
    "0212bea9:1600",
    "73f65401:1609",
    "0b833664:1602",
    "188806fb:1602",
    "77074ba4:4",
    "daa88fa0:2012",
  ],
  lvs34: [
    "3e315efa:1685",
    "ad948a5c:1957",
    "ea4a4e45:2707",
    "cc03e973:1666",
    "3d1c4378:1386",
    "4b27e9b0:2221",
    "c89445cb:2261",
    "614ebab9:2181",
    "ff3a8776:2023",
    "0b0586d4:1977",
    "2cba6289:1493",
    "0eaebacc:2742",
    "e104d431:1538",
    "03ec74a5:1587",
    "3a86091f:2520",
    "42aad7fb:2524",
    "fe0c4e7e:2524",
    "1925ffbf:2156",
    "da0e1b9a:2160",
    "014ba6c5:2160",
    "352dedac:2160",
    "32ad98e4:1596",
    "93ac38f7:1605",
    "00709a61:1598",
    "03c62676:1598",
    "77074ba4:4",
    "daa88fa0:2012",
  ],
  deep: [
    "a5c476d8:1686",
    "f9efc659:1958",
    "e595b4e5:2713",
    "556bb64c:1674",
    "31113c51:1392",
    "f49d3ec9:2208",
    "22f2c88d:2266",
    "fe7c3241:2148",
    "30e1bb1a:2024",
    "0f87de07:1999",
    "5dcba3a5:1517",
    "7fb4732e:2753",
    "33044e82:1521",
    "737ef434:1592",
    "704e6f1d:2497",
    "1b6e7d51:2526",
    "71ce1f58:2526",
    "4135db89:2152",
    "396a8440:2160",
    "014ba6c5:2160",
    "352dedac:2160",
    "3cda8163:1623",
    "f69a2c87:1629",
    "1b14cfe3:1613",
    "5d995ac2:1613",
    "77074ba4:4",
    "daa88fa0:2012",
  ],
  shallow: [
    "5a3f67be:1685",
    "4526b5f3:1990",
    "ce9ae6ba:2670",
    "0d750fe9:1684",
    "3d1c4378:1386",
    "cced6c4a:2174",
    "1b774b57:2239",
    "a6362e8b:2130",
    "2d3f058a:2023",
    "07956442:1986",
    "1f7c2a71:1493",
    "80091626:2719",
    "d261425b:1517",
    "7ecc36e8:1569",
    "2d08104e:2525",
    "6ade3212:2525",
    "e68b2b8d:2525",
    "d4a54b36:2160",
    "396a8440:2160",
    "014ba6c5:2160",
    "352dedac:2160",
    "4f7a88f6:1618",
    "5a9b4553:1601",
    "2236541a:1605",
    "cc8103fb:1605",
    "77074ba4:4",
    "daa88fa0:2012",
  ],
  zero: [
    "3e315efa:1685",
    "c68f2f09:1958",
    "c309c3a8:2706",
    "cc03e973:1666",
    "3d1c4378:1386",
    "39bcf702:2170",
    "b8532764:2260",
    "9b04fcf9:2169",
    "ff3a8776:2023",
    "7730a6b9:1991",
    "2cba6289:1493",
    "8f7fd4ba:2741",
    "2b2f14d7:1516",
    "7d00a2c0:1566",
    "71d06184:2524",
    "42aad7fb:2524",
    "fe0c4e7e:2524",
    "dce86dd3:2160",
    "da0e1b9a:2160",
    "014ba6c5:2160",
    "352dedac:2160",
    "93edc90f:1613",
    "852b8ce4:1613",
    "39359635:1613",
    "0e98c138:1613",
    "77074ba4:4",
    "daa88fa0:2012",
  ],
  negative: [
    "3e315efa:1685",
    "efa86c07:1958",
    "c309c3a8:2706",
    "cc03e973:1666",
    "3d1c4378:1386",
    "14919e07:2207",
    "ff84d38e:2243",
    "9b04fcf9:2169",
    "ff3a8776:2023",
    "bc89b8f6:1992",
    "2cba6289:1493",
    "8f7fd4ba:2741",
    "89c42f3e:1527",
    "99290cac:1586",
    "71d06184:2524",
    "42aad7fb:2524",
    "fe0c4e7e:2524",
    "dce86dd3:2160",
    "da0e1b9a:2160",
    "014ba6c5:2160",
    "352dedac:2160",
    "93edc90f:1613",
    "852b8ce4:1613",
    "39359635:1613",
    "0e98c138:1613",
    "77074ba4:4",
    "daa88fa0:2012",
  ],
  blank: [
    "3e315efa:1685",
    "2c373e37:1955",
    "c309c3a8:2706",
    "cc03e973:1666",
    "3d1c4378:1386",
    "0496c421:2202",
    "c89445cb:2261",
    "9b04fcf9:2169",
    "ff3a8776:2023",
    "21838d9e:1991",
    "2cba6289:1493",
    "8f7fd4ba:2741",
    "8eb2789d:1526",
    "2ffbc9d3:1586",
    "71d06184:2524",
    "42aad7fb:2524",
    "fe0c4e7e:2524",
    "dce86dd3:2160",
    "da0e1b9a:2160",
    "014ba6c5:2160",
    "352dedac:2160",
    "93edc90f:1613",
    "852b8ce4:1613",
    "39359635:1613",
    "0e98c138:1613",
    "77074ba4:4",
    "daa88fa0:2012",
  ],
  huge: [
    "e4c9bc06:1992",
    "79f9d85a:2556",
    "a83fae42:2727",
    "85084e28:1701",
    "b334bef9:1397",
    "a6adb022:2221",
    "7a7b3888:2267",
    "7520c942:2197",
    "9399cc42:2017",
    "27e7ffac:2016",
    "b2571990:1553",
    "af45c9d5:2730",
    "01af025a:1549",
    "a656bac6:1620",
    "75b26533:2506",
    "1543896c:2506",
    "ef071d78:2522",
    "d24ff066:2178",
    "5e057cf3:2178",
    "014ba6c5:2160",
    "352dedac:2160",
    "df2dd189:1607",
    "465d1f9e:1607",
    "616bfacf:1606",
    "febc9bb4:1606",
    "77074ba4:4",
    "daa88fa0:2012",
  ],
  tiny: [
    "375ef8c9:1685",
    "9faeddcd:1993",
    "70f02a3d:2711",
    "9f58a645:1648",
    "f983bd2d:1406",
    "776ab90f:2175",
    "3ac9d01e:2239",
    "30e3d57f:2128",
    "7c608f82:2023",
    "d161a0a1:1986",
    "429de042:1493",
    "6afd7623:2701",
    "2b2f14d7:1516",
    "7d00a2c0:1566",
    "22ef50d6:2524",
    "f3ba3d63:2525",
    "dcbd67dc:2525",
    "4857a978:2159",
    "396a8440:2160",
    "014ba6c5:2160",
    "352dedac:2160",
    "a119d53f:1613",
    "f40d45bc:1594",
    "5f10f2c6:1605",
    "0021b4c3:1605",
    "77074ba4:4",
    "daa88fa0:2012",
  ],
  edge: [
    "3e315efa:1685",
    "ad948a5c:1957",
    "67c8a4fd:2707",
    "6f8268f4:1666",
    "3d1c4378:1386",
    "b12fc104:2206",
    "a3226375:2267",
    "830043d3:2183",
    "ff3a8776:2023",
    "d9f4cbdf:2005",
    "ad766092:1539",
    "3160a303:2721",
    "fe760a91:1534",
    "53dc53c4:1601",
    "ecfd0e63:2518",
    "6380c74b:2514",
    "fe0c4e7e:2524",
    "0254620f:2162",
    "434a521a:2162",
    "014ba6c5:2160",
    "352dedac:2160",
    "72e4fe3f:1596",
    "a2cb4c8a:1596",
    "a48a9325:1599",
    "de410598:1599",
    "77074ba4:4",
    "daa88fa0:2012",
  ],
  kmh: [
    "3e315efa:1685",
    "1bf7fdcb:1960",
    "ea4a4e45:2707",
    "cc03e973:1666",
    "3d1c4378:1386",
    "0496c421:2202",
    "c89445cb:2261",
    "9b04fcf9:2169",
    "ff3a8776:2023",
    "0b0586d4:1977",
    "2cba6289:1493",
    "0eaebacc:2742",
    "8eb2789d:1526",
    "2ffbc9d3:1586",
    "3a86091f:2520",
    "42aad7fb:2524",
    "fe0c4e7e:2524",
    "502b8376:2160",
    "396a8440:2160",
    "014ba6c5:2160",
    "352dedac:2160",
    "32ad98e4:1596",
    "5b83645b:1598",
    "00709a61:1598",
    "03c62676:1598",
    "77074ba4:4",
    "daa88fa0:2012",
  ],
  center: [
    "3e315efa:1685",
    "ad948a5c:1957",
    "ea4a4e45:2707",
    "cc03e973:1666",
    "3d1c4378:1386",
    "0496c421:2202",
    "c89445cb:2261",
    "9b04fcf9:2169",
    "ff3a8776:2023",
    "0b0586d4:1977",
    "2cba6289:1493",
    "0eaebacc:2742",
    "8eb2789d:1526",
    "2ffbc9d3:1586",
    "3a86091f:2520",
    "42aad7fb:2524",
    "fe0c4e7e:2524",
    "502b8376:2160",
    "396a8440:2160",
    "014ba6c5:2160",
    "352dedac:2160",
    "32ad98e4:1596",
    "e610b739:1631",
    "a03c9dc7:1613",
    "a4f56262:1613",
    "77074ba4:4",
    "daa88fa0:2012",
  ],
  "no-align": [
    "3e315efa:1685",
    "ad948a5c:1957",
    "ea4a4e45:2707",
    "cc03e973:1666",
    "3d1c4378:1386",
    "0496c421:2202",
    "c89445cb:2261",
    "9b04fcf9:2169",
    "ff3a8776:2023",
    "0b0586d4:1977",
    "2cba6289:1493",
    "0eaebacc:2742",
    "8eb2789d:1526",
    "2ffbc9d3:1586",
    "3a86091f:2520",
    "42aad7fb:2524",
    "fe0c4e7e:2524",
    "502b8376:2160",
    "396a8440:2160",
    "014ba6c5:2160",
    "352dedac:2160",
    "32ad98e4:1596",
    "5b83645b:1598",
    "00709a61:1598",
    "03c62676:1598",
    "77074ba4:4",
    "daa88fa0:2012",
  ],
  "decimals-sv": [
    "42bcaa7f:1684",
    "e8ac350b:1957",
    "4f6c019f:2718",
    "dfe606cd:1666",
    "f131d632:1386",
    "b33c7321:2191",
    "8c6cfbeb:2264",
    "85c31fb3:2164",
    "857f6603:2027",
    "e1b28c0f:1994",
    "6b1cca0d:1498",
    "de31b1a6:2741",
    "2d804d42:1523",
    "5bfadb7d:1586",
    "4b8db20c:2524",
    "10cde6f7:2524",
    "e77756fe:2524",
    "3ce808e7:2168",
    "48c5bec4:2168",
    "dda4cca3:2164",
    "344f19de:2168",
    "66bc5573:1621",
    "637bb155:1623",
    "047ff254:1614",
    "4e8f3f2f:1617",
    "77074ba4:4",
    "3efe57b2:2012",
  ],
  text: [
    "3e315efa:1685",
    "0c913b10:1958",
    "4202140b:2709",
    "cc03e973:1666",
    "3d1c4378:1386",
    "0496c421:2202",
    "c89445cb:2261",
    "9b04fcf9:2169",
    "ff3a8776:2023",
    "0b0586d4:1977",
    "2cba6289:1493",
    "0eaebacc:2742",
    "8eb2789d:1526",
    "2ffbc9d3:1586",
    "3a86091f:2520",
    "42aad7fb:2524",
    "fe0c4e7e:2524",
    "502b8376:2160",
    "396a8440:2160",
    "014ba6c5:2160",
    "352dedac:2160",
    "32ad98e4:1596",
    "5b83645b:1598",
    "00709a61:1598",
    "03c62676:1598",
    "77074ba4:4",
    "daa88fa0:2012",
  ],
};

/**
 * The digest and the length of what the handler of a "?" button in the cards
 * writes for every figure of the cards, together (120 figures, those without a
 * button as nothing), by set.
 */
const FIGURES: Readonly<Record<string, string>> = {
  base: "bc3ed4c7:248891",
  "base-sv": "fd3765ff:248891",
  hb3: "2d09547a:249184",
  second: "dd95f744:249194",
  other: "ead450bb:249267",
  lvs34: "5485f8a3:248951",
  deep: "131f57b0:248807",
  shallow: "a1c35e43:248577",
  zero: "4a5f8cd4:249007",
  negative: "4a5f8cd4:249007",
  blank: "4a5f8cd4:249007",
  huge: "a400edfb:248643",
  tiny: "df75e21b:248373",
  edge: "7983d8ea:248887",
  kmh: "bc3ed4c7:248891",
  center: "4c7a0df7:249061",
  "no-align": "bc3ed4c7:248891",
  "decimals-sv": "bd472c6c:249480",
  text: "bc3ed4c7:248891",
};

/** The topics, in the order the earlier page lists them (line 1601). */
const TOPICS = [
  "dep",
  "sog",
  "ssr",
  "atr",
  "zt",
  "atsb",
  "atfa",
  "at-n",
  "maxd",
  "cone",
  "down",
  "dst",
  "side",
  "sso",
  "sst",
  "ssalign",
  "atw",
  "att",
] as const;

describe("what the module names", () => {
  it("writes the five elements of the dialog", () => {
    expect([...KEYS]).toEqual(["help-h", "help-sub", "help-fig", "help-x", "help-note"]);
  });

  it("has the 18 topics of the earlier page, in its order", () => {
    expect([...HELP_KEYS]).toEqual([...TOPICS]);
  });
});

describe("the topic of a field (helpKey and the test of addQM, lines 1734 to 1738)", () => {
  // [id, its topic, whether it has one]
  it.each([
    ["dep", "dep", true],
    ["sog", "sog", true],
    ["ssr", "ssr", true],
    ["atr", "atr", true],
    ["zt", "zt", true],
    ["atsb", "atsb", true],
    ["atfa", "atfa", true],
    ["at-n", "at-n", true],
    ["maxd", "maxd", true],
    ["cone", "cone", true],
    ["cone0", "cone", true],
    ["cone12", "cone", true],
    ["down", "down", true],
    ["down1", "down", true],
    ["dst", "dst", true],
    ["side0", "side", true],
    ["side", "side", true],
    ["sso", "sso", true],
    ["sst", "sst", true],
    ["ssalign", "ssalign", true],
    ["atw", "atw", true],
    ["att", "att", true],
    ["", "", false],
    ["x", "x", false],
    ["cone1x", "cone1x", false],
    ["1cone", "1cone", false],
    ["eq-ss", "eq-ss", false],
    ["img-p", "img-p", false],
    ["live-p", "live-p", false],
    ["ang-reset", "ang-reset", false],
    ["ssalign2", "ssalign2", false],
    ["side10", "side", true],
    ["Cone0", "Cone0", false],
    [" cone0", " cone0", false],
    ["cone0 ", "cone0 ", false],
    ["down2a", "down2a", false],
    ["sidex", "sidex", false],
    ["sd0", "sd0", false],
  ])("the field %j has the topic %j; a button for it: %s", (id, key, has) => {
    expect(helpKey(id)).toBe(key);
    expect(hasHelp(id)).toBe(has);
  });
});

describe("the title and the explanation of a topic (the fields t and x of HELP)", () => {
  // The names of the first imaging transducer and the live sonar, for five choices of transducers.
  const NAMES: readonly (readonly [string, string, string, string[]])[] = [
    [
      "lowrance",
      "",
      "at2",
      [
        "Depth under the transducer",
        "Speed over ground",
        "SideScan range per side",
        "Live sonar range",
        "Live sonar transducer below the surface",
        "Scout beam center, below horizontal",
        "Forward fan center, below horizontal",
        "One or two live sonar transducers",
        "Maximum depth",
        "2D cone width",
        "DownScan fan width, side to side",
        "DownScan fan thickness, front to back",
        "SideScan fan width",
        "Upper edge of the widest SideScan fan",
        "SideScan fan thickness, front to back",
        "How the narrower fans are aimed",
        "Live sonar fan width",
        "Live sonar slice thickness",
      ],
    ],
    [
      "hb_xm9hw",
      "",
      "ml2",
      [
        "Depth under the transducer",
        "Speed over ground",
        "Side Imaging range per side",
        "Live sonar range",
        "Live sonar transducer below the surface",
        "Landscape beam center, below horizontal",
        "Forward fan center, below horizontal",
        "One or two live sonar transducers",
        "Maximum depth",
        "2D cone width",
        "Down Imaging fan width, side to side",
        "Down Imaging fan thickness, front to back",
        "Side Imaging fan width",
        "Upper edge of the widest Side Imaging fan",
        "Side Imaging fan thickness, front to back",
        "How the narrower fans are aimed",
        "Live sonar fan width",
        "Live sonar slice thickness",
      ],
    ],
    [
      "lowrance_nose",
      "",
      "lvs34",
      [
        "Depth under the transducer",
        "Speed over ground",
        "SideScan range per side",
        "Live sonar range",
        "Live sonar transducer below the surface",
        "Perspective beam center, below horizontal",
        "Forward fan center, below horizontal",
        "One or two live sonar transducers",
        "Maximum depth",
        "2D cone width",
        "DownScan fan width, side to side",
        "DownScan fan thickness, front to back",
        "SideScan fan width",
        "Upper edge of the widest SideScan fan",
        "SideScan fan thickness, front to back",
        "How the narrower fans are aimed",
        "Live sonar fan width",
        "Live sonar slice thickness",
      ],
    ],
    [
      "other",
      "",
      "other",
      [
        "Depth under the transducer",
        "Speed over ground",
        "Side imaging range per side",
        "Live sonar range",
        "Live sonar transducer below the surface",
        "Flat mode beam center, below horizontal",
        "Forward fan center, below horizontal",
        "One or two live sonar transducers",
        "Maximum depth",
        "2D cone width",
        "Down imaging fan width, side to side",
        "Down imaging fan thickness, front to back",
        "Side imaging fan width",
        "Upper edge of the widest Side imaging fan",
        "Side imaging fan thickness, front to back",
        "How the narrower fans are aimed",
        "Live sonar fan width",
        "Live sonar slice thickness",
      ],
    ],
    [
      "lowrance",
      "",
      "at2xl",
      [
        "Depth under the transducer",
        "Speed over ground",
        "SideScan range per side",
        "Live sonar range",
        "Live sonar transducer below the surface",
        "Scout XL beam center, below horizontal",
        "Forward fan center, below horizontal",
        "One or two live sonar transducers",
        "Maximum depth",
        "2D cone width",
        "DownScan fan width, side to side",
        "DownScan fan thickness, front to back",
        "SideScan fan width",
        "Upper edge of the widest SideScan fan",
        "SideScan fan thickness, front to back",
        "How the narrower fans are aimed",
        "Live sonar fan width",
        "Live sonar slice thickness",
      ],
    ],
  ];

  const namesOfSet = (img: string, live: string): Names => namesOf(img, live);

  it.each(NAMES)(
    "%s, %s, %s: the 18 titles take the names of the transducers",
    (img, _sec, live, titles) => {
      const names = namesOfSet(img, live);
      expect(TOPICS.map((key) => helpTitle(key, names))).toEqual(titles);
    },
  );

  it("has no title and no explanation for a key that is no topic", () => {
    const names = namesOfSet("lowrance", "at2");
    expect(helpTitle("nothing", names)).toBeUndefined();
    expect(helpExplanation("nothing", names)).toBeUndefined();
    expect(helpTitle("", names)).toBeUndefined();
  });

  it("explains the topics that name no transducer in the same words for every choice of transducers", () => {
    const PLAIN = [
      "From the transducer face straight down to the bottom. If your display adds an offset to show depth from the surface or the keel, take it off first.",
      "Your speed over the bottom, as the GPS shows it (not through the water). Used for how fast marks move across 2D and DownScan screens and for distance behind the boat.",
      "How far out the screen reaches on each side, measured along the beam from the transducer (the straight-line, slant distance), not horizontally. With the bottom in the way, the horizontal reach on the bottom is shorter.",
      "The range you have set on the live sonar screen: how far from the transducer it draws, along the beam.",
      "How far below the surface the live sonar transducer sits. Only used in the live sonar section, where fish depths are given below the surface.",
      "How far below horizontal the middle of the Forward fan points. The fan spreads out to both sides of this line; the part that would point above the surface is left out.",
      "The depth down to which the manufacturer says this frequency still finds the bottom, in good conditions. Real reach depends on the bottom, the water and your settings. The calculator stops the beam there.",
      "The full width of the cone, edge to edge (not half of it), as seen from behind the boat. The cone is round, so it is the same seen from the side.",
      "How thick the fan is along the keel. It decides how long a strip of bottom each ping covers front to back, and how sharp things look along the track.",
      "The width of one side's fan, from its upper edge down to its inner edge. There is one such fan on each side of the boat.",
      "How far below horizontal the top edge of the widest fan points. Together with the fan width it decides whether the fan reaches straight down under the boat (upper edge + width = 90°).",
      "How thick the widest fan is along the keel, seen from above. The strip of bottom it covers each ping gets wider the farther out it is. Narrower fans are scaled in proportion.",
      "Not published. Aimed down to the inner edge, a narrow high-frequency fan still covers the bottom straight under the boat. Aimed around the center, it leaves a gap under the boat. If objects straight under the boat show on both sides at every frequency, the inner-edge choice matches your unit.",
      "How thick the fan is, seen edge-on. Targets anywhere inside this slice are drawn on the screen, so the slice gets thicker the farther out it reaches.",
    ];
    const KEYS_PLAIN = [
      "dep",
      "sog",
      "ssr",
      "atr",
      "zt",
      "atfa",
      "maxd",
      "cone",
      "dst",
      "side",
      "sso",
      "sst",
      "ssalign",
      "att",
    ];
    for (const [img, , live] of NAMES) {
      const names = namesOfSet(img, live);
      expect(KEYS_PLAIN.map((key) => helpExplanation(key, names))).toEqual(PLAIN);
    }
  });

  it.each([
    ["lowrance", "at2", "Scout", "DownScan"],
    ["hb_xm9hw", "ml2", "Landscape", "Down Imaging"],
    ["lowrance_nose", "lvs34", "Perspective", "DownScan"],
    ["other", "other", "Flat mode", "Down imaging"],
    ["lowrance", "at2xl", "Scout XL", "DownScan"],
  ])(
    "%s with %s: the explanations that name a transducer carry its names (%s, %s)",
    (img, live, flat, down) => {
      const names = namesOfSet(img, live);
      expect(helpExplanation("atsb", names)).toBe(
        `How far below horizontal the center of the <span data-n="flat">${flat}</span> slice points, set by how the transducer is tilted on its mount. Measure to the center of the beam, not its lower or upper edge.`,
      );
      expect(helpExplanation("at-n", names)).toBe(
        `Two units splayed apart, each with its own fan, double how far around the boat <span data-n="flat">${flat}</span> sees.`,
      );
      expect(helpExplanation("down", names)).toBe(
        `The full width of the thin <span data-n="down">${down}</span> fan across the boat, edge to edge. From the side it is only a few degrees thick (next setting).`,
      );
      expect(helpExplanation("atw", names)).toBe(
        `The full width of the live sonar fan, edge to edge. In Forward and Down it is the picture you see on the screen; in <span data-n="flat">${flat}</span> it is how far around you see.`,
      );
    },
  );

  it("leaves the text of a name's span as it is when the name is empty, and escapes what a name holds", () => {
    const names: Names = { side: "S", down: "", live: "L", flat: "A&B <c>", wide: "W" };
    expect(helpExplanation("down", names)).toContain('<span data-n="down">DownScan</span>');
    expect(helpExplanation("atsb", names)).toContain(
      '<span data-n="flat">A&amp;B &lt;c&gt;</span>',
    );
  });

  it("writes a no-break space of a name as the entity, as a text node is written into html", () => {
    // Added after the module was written (commit 356fa91), for a survivor of the mutation round.
    // Not recorded: the earlier page puts the name in with `textContent`, and html writes a text node so.
    const names: Names = { side: "S", down: "D D", live: "L", flat: "F", wide: "W" };
    expect(helpExplanation("down", names)).toContain('<span data-n="down">D&nbsp;D</span>');
  });
});

describe("the picture of a topic, from the fields of Settings (the handler of the buttons of Settings, lines 1757 to 1768)", () => {
  describe.each(SETS)("%s", (name, img, sec, live, over, locale) => {
    const input = inputOf(fieldsOf(img, sec, live, over), locale);
    const expected = SETTING[name] ?? [];

    it.each(IDS.map((id, i) => [id, expected[i]] as const))(
      "writes for %s what the earlier page wrote",
      (id, digest) => {
        const view = settingHelpView(input, id, labelOf(id));
        expect(dig(JSON.stringify(canon(view)))).toBe(digest);
      },
    );
  });

  it("has a row for every set and every id", () => {
    expect(Object.keys(SETTING).sort()).toEqual(SETS.map((s) => s[0]).sort());
    for (const set of SETS) expect(SETTING[set[0]]).toHaveLength(IDS.length);
  });

  const base = inputOf(fieldsOf("lowrance", "", "at2", {}), "en-US");

  it("writes the picture of the depth as the earlier page did", () => {
    expect(helpPicture("dep", "dep", base)).toBe(
      '<svg class="fig" viewBox="0 0 340 196" role="img"><line x1="4.0" y1="22.0" x2="336.0" y2="22.0" stroke="var(--water)" stroke-width="1.4"/><text x="334.0" y="18.0" text-anchor="end" font-size="11" fill="var(--muted)">surface</text><path d="M 116 14 L 174 14 L 186 8 L 180 25 L 116 25 Z" fill="var(--fg)" fill-opacity="0.8"/><circle cx="150" cy="30" r="3.5" fill="var(--fg)"/><rect x="4" y="170" width="332" height="8" fill="var(--ground)"/><line x1="4.0" y1="170.0" x2="336.0" y2="170.0" stroke="var(--muted)" stroke-width="1.2"/><text x="334.0" y="190.0" text-anchor="end" font-size="11" fill="var(--muted)">bottom</text><line x1="210.0" y1="30.0" x2="210.0" y2="170.0" stroke="var(--accent)" stroke-width="1.6"/><polygon points="210,30 207.6634899461481,35.52636596401731 212.3365100538519,35.52636596401731" fill="var(--accent)"/><polygon points="210,170 212.3365100538519,164.47363403598268 207.6634899461481,164.47363403598268" fill="var(--accent)"/><text x="236.0" y="104.0" text-anchor="middle" font-size="12" font-weight="600" fill="var(--accent)">10.0 m</text><line x1="150.0" y1="30.0" x2="210.0" y2="30.0" stroke="var(--muted)" stroke-width="0.8" stroke-dasharray="2 3"/><text x="158.0" y="46.0" text-anchor="start" font-size="11" fill="var(--muted)">transducer face</text></svg>',
    );
  });

  it("writes the picture of the speed as the earlier page did, in knots", () => {
    expect(helpPicture("sog", "sog", base)).toBe(
      '<svg class="fig" viewBox="0 0 340 124" role="img"><text x="8.0" y="16.0" text-anchor="start" font-size="11" fill="var(--muted)">seen from above, one mark per second</text><circle cx="20.0" cy="60" r="3" fill="var(--accent)"/><text x="20.0" y="82.0" text-anchor="middle" font-size="10" font-family="var(--font-data)" fill="var(--muted)">0 s</text><circle cx="80.0" cy="60" r="3" fill="var(--accent)"/><text x="80.0" y="82.0" text-anchor="middle" font-size="10" font-family="var(--font-data)" fill="var(--muted)">1 s</text><circle cx="140.0" cy="60" r="3" fill="var(--accent)"/><text x="140.0" y="82.0" text-anchor="middle" font-size="10" font-family="var(--font-data)" fill="var(--muted)">2 s</text><circle cx="200.0" cy="60" r="3" fill="var(--accent)"/><text x="200.0" y="82.0" text-anchor="middle" font-size="10" font-family="var(--font-data)" fill="var(--muted)">3 s</text><circle cx="260.0" cy="60" r="3" fill="var(--accent)"/><text x="260.0" y="82.0" text-anchor="middle" font-size="10" font-family="var(--font-data)" fill="var(--muted)">4 s</text><circle cx="320.0" cy="60" r="0" fill="var(--accent)"/><text x="320.0" y="82.0" text-anchor="middle" font-size="10" font-family="var(--font-data)" fill="var(--muted)">5 s</text><line x1="20.0" y1="60.0" x2="320.0" y2="60.0" stroke="var(--accent)" stroke-width="1" stroke-dasharray="3 3"/><path d="M 318 50 L 336 60 L 318 70 Z" fill="var(--fg)"/><text x="170.0" y="110.0" text-anchor="middle" font-size="12" fill="var(--fg)">2.0 kn = 1.03 m every second</text></svg>',
    );
  });

  it("has no picture for a key that is no topic", () => {
    expect(helpPicture("nothing", "nothing", base)).toBeUndefined();
  });

  it("has no dialog for a field that has no topic", () => {
    expect(settingHelpView(base, "nothing", "Label")).toBeUndefined();
    expect(settingHelpView(base, "eq-ss", "Label")).toBeUndefined();
  });

  it("writes the five elements of the dialog, and nothing else", () => {
    const view = settingHelpView(base, "cone0", "Label");
    expect(Object.keys(view ?? {}).sort()).toEqual([...KEYS].sort());
    expect(view?.["help-note"]).toEqual({ text: "Drawn with your current settings." });
    expect(Object.keys(view?.["help-fig"] ?? {})).toEqual(["html"]);
    expect(Object.keys(view?.["help-x"] ?? {})).toEqual(["html"]);
  });

  describe("the line under the title (lines 1762 and 1763)", () => {
    // [id, the text of the label, the line, whether it is hidden]
    it.each([
      ["cone0", "  2D, Medium  \n", "Setting: 2D, Medium", false],
      ["cone0", "", "", true],
      ["cone0", "   ", "", true],
      ["dep", "Depth", "", true],
      ["dep", "", "", true],
      ["side1", "A & B <c>", "Setting: A & B <c>", false],
      ["down2", "x", "Setting: x", false],
    ])("for %s with the label %j: %j, hidden: %s", (id, label, line, hidden) => {
      const view = settingHelpView(base, id, label);
      expect(view?.["help-sub"]).toEqual({ text: line, hidden });
    });
  });

  it("names the transducers in the explanation of the dialog", () => {
    const hb = inputOf(fieldsOf("hb_xm9hw", "", "ml2", {}), "en-US");
    expect(settingHelpView(hb, "at-n", "L")?.["help-x"]).toEqual({
      html: 'Two units splayed apart, each with its own fan, double how far around the boat <span data-n="flat">Landscape</span> sees.',
    });
    expect(settingHelpView(hb, "down0", "L")?.["help-h"]).toEqual({
      text: "Down Imaging fan width, side to side",
    });
  });
});

describe("the picture of a figure of the cards (the handler of the buttons of the cards, lines 1743 to 1756)", () => {
  describe.each(SETS)("%s", (name, img, sec, live, over, locale) => {
    const fields = fieldsOf(img, sec, live, over);
    const input = inputOf(fields, locale);
    const rows = dataRows({
      local: { "img-p": img, "img-s": sec, "live-p": live },
      fmt: createFormatter(locale),
    });

    it("writes for each of the 120 figures what the earlier page wrote", () => {
      expect(rows).toHaveLength(120);
      const all = rows.map((row) => canon(figureHelpView(input, row)));
      expect(dig(JSON.stringify(all))).toBe(FIGURES[name]);
    });
  });

  const base = inputOf(fieldsOf("lowrance", "", "at2", {}), "en-US");
  const rows = dataRows({
    local: { "img-p": "lowrance", "img-s": "", "live-p": "at2" },
    fmt: createFormatter("en-US"),
  });
  const NOTE =
    "Drawn with this preset figure; everything else in the picture uses your current settings.";

  it("has no dialog for the figure without a button, the list of frequencies", () => {
    expect(figureHelpView(base, rows[0] as (typeof rows)[number])).toBeUndefined();
  });

  // [the figure, the title, the line under it, the digest of the picture, of the explanation]
  it.each([
    [
      1,
      "2D cone width",
      "Lowrance Active Imaging HD 3-in-1 (Medium/High): 2D Medium CHIRP 83 kHz, cone width, 50°",
      "1adc9b62:2105",
      "03345779:145",
    ],
    [
      2,
      "Maximum depth",
      "Lowrance Active Imaging HD 3-in-1 (Medium/High): 2D Medium CHIRP 83 kHz, max depth, 305 m",
      "d6f3708f:1593",
      "301f617f:204",
    ],
    [
      9,
      "SideScan fan width",
      "Lowrance Active Imaging HD 3-in-1 (Medium/High): SideScan 455 kHz CHIRP, fan width, 85°",
      "ae249f3d:1277",
      "0d9503a9:120",
    ],
    [
      10,
      "SideScan range per side",
      "Lowrance Active Imaging HD 3-in-1 (Medium/High): SideScan 455 kHz CHIRP, max range per side, 91 m",
      "40b930e1:2272",
      "4983b59b:218",
    ],
    [
      11,
      "SideScan fan width",
      "Lowrance Active Imaging HD 3-in-1 (Medium/High): SideScan 1075 kHz CHIRP, fan width, 36°",
      "04d7de77:1279",
      "0d9503a9:120",
    ],
    [
      13,
      "Upper edge of the widest SideScan fan",
      "Lowrance Active Imaging HD 3-in-1 (Medium/High): SideScan upper fan edge, 5°",
      "2cb39bbc:1564",
      "903381c0:183",
    ],
    [
      105,
      "SideScan fan width",
      "Other (Garmin or anything else: enter your own): Side imaging Low, fan width, 85°",
      "ae249f3d:1277",
      "0d9503a9:120",
    ],
    [
      112,
      "Live sonar fan width",
      "Garmin LiveScope Plus (LVS34): Fan width, 135°",
      "54dffa3b:1183",
      "b6af5cc8:178",
    ],
    [
      113,
      "Live sonar slice thickness",
      "Garmin LiveScope Plus (LVS34): Slice thickness, 20°",
      "070dcb18:1255",
      "51ae3c96:149",
    ],
    [
      116,
      "Live sonar fan width",
      "Other (enter your own): Fan width, 135°",
      "54dffa3b:1183",
      "b6af5cc8:178",
    ],
    [
      118,
      "DownScan fan thickness, front to back",
      "All imaging transducers: DownScan fan thickness, front to back, 3°",
      "43f7d39f:1638",
      "2053315a:149",
    ],
    [
      119,
      "SideScan fan thickness, front to back",
      "All imaging transducers: SideScan fan thickness, front to back, 2°",
      "df5cac26:1139",
      "42de03a7:174",
    ],
  ])(
    "figure %d: its topic's title, the figure named under it, and the figure drawn",
    (i, title, line, figure, explanation) => {
      const view = figureHelpView(base, rows[i] as (typeof rows)[number]);
      expect(view?.["help-h"]).toEqual({ text: title });
      expect(view?.["help-sub"]).toEqual({ text: line, hidden: false });
      expect(view?.["help-note"]).toEqual({ text: NOTE });
      expect(dig(view?.["help-fig"]?.html ?? "")).toBe(figure);
      expect(dig(view?.["help-x"]?.html ?? "")).toBe(explanation);
    },
  );

  it("draws the depth of the figure, not the depth of the fields, for the maximum depth", () => {
    const view = figureHelpView(base, rows[2] as (typeof rows)[number]);
    expect(view?.["help-fig"]?.html).toContain(">305.0 m</text>");
    expect(view?.["help-fig"]?.html).toContain('viewBox="0 0 340 218"');
  });

  it("draws the cone width of the figure with the depth of the fields: 50 degrees, 9.3 m wide at 10 m", () => {
    const view = figureHelpView(base, rows[1] as (typeof rows)[number]);
    const html = view?.["help-fig"]?.html ?? "";
    expect([...html.matchAll(/>([^<]*)<\/text>/g)].map((m) => m[1])).toEqual([
      "surface",
      "bottom",
      "50°",
      "9.3 m",
    ]);
    expect(html.startsWith('<svg class="fig" viewBox="0 0 340 216" role="img">')).toBe(true);
  });
});
// ---------------------------------------------------------------------------
// Rows added after the module was written (review round 1)
// ---------------------------------------------------------------------------

/**
 * The rows of this describe were added after the module was written, when the
 * review of the PR found that the module read a key that is no topic, and a
 * name, differently from the earlier page. Their expected values were printed
 * by the earlier page's lines, run unchanged in Node against the stand-in
 * (`HELP[k]` on a plain object finds the properties every object has; a name
 * is written into the text of a picture as it is).
 */
describe("a key that every object has (HELP[k] on a plain object, lines 1738, 1746 and 1760)", () => {
  const base = inputOf(fieldsOf("lowrance", "", "at2", {}), "en-US");
  const NOTE_SETTING = "Drawn with your current settings.";
  const NOTE_FIGURE =
    "Drawn with this preset figure; everything else in the picture uses your current settings.";
  const INHERITED = ["constructor", "toString", "__proto__", "hasOwnProperty", "valueOf"] as const;
  const [row1] = dataRows({
    local: { "img-p": "lowrance", "img-s": "", "live-p": "at2" },
    fmt: createFormatter("en-US"),
  }).slice(1);

  it.each(INHERITED)("counts %s as a topic, as the earlier page does", (id) => {
    expect(helpKey(id)).toBe(id);
    expect(hasHelp(id)).toBe(true);
  });

  it("does not add them to the list of the topics", () => {
    expect(HELP_KEYS).toHaveLength(18);
    for (const id of INHERITED) expect(HELP_KEYS).not.toContain(id);
  });

  it.each(INHERITED)("writes for the button of %s an empty title and picture", (id) => {
    // The earlier page: the title is `undefined` (`textContent` writes nothing), `H.d` is no
    // function so the `try` catches and writes nothing, `H.x` is `undefined` (`innerHTML` writes
    // the word), the line under the title is empty and hidden.
    expect(settingHelpView(base, id, "  Label ")).toEqual({
      "help-h": { text: "" },
      "help-sub": { text: "", hidden: true },
      "help-fig": { html: "" },
      "help-x": { html: "undefined" },
      "help-note": { text: NOTE_SETTING },
    });
  });

  it.each(["constructor", "__proto__"])(
    "writes for a figure whose topic is %s the same, with the line of the figure",
    (hk) => {
      if (row1 === undefined) throw new Error("no row");
      const row = {
        ...row1,
        who: "W&<",
        name: "Nm",
        val: "5°",
        helpKey: hk,
        helpValue: 5,
      };
      expect(figureHelpView(base, row)).toEqual({
        "help-h": { text: "" },
        "help-sub": { text: "W&<: Nm, 5°", hidden: false },
        "help-fig": { html: "" },
        "help-x": { html: "undefined" },
        "help-note": { text: NOTE_FIGURE },
      });
    },
  );

  it("has no title and no explanation for them, and writes no picture", () => {
    for (const id of INHERITED) {
      expect(helpTitle(id, base.names)).toBeUndefined();
      expect(helpExplanation(id, base.names)).toBeUndefined();
      expect(helpPicture(id, id, base)).toBe("");
    }
  });

  it("still has no topic for a key the object does not have", () => {
    expect(hasHelp("nothing")).toBe(false);
    expect(hasHelp("constructor1")).toBe(false);
    expect(helpPicture("nothing", "nothing", base)).toBeUndefined();
  });
});

describe("a transducer's name in the text of a picture (lines 1642, 1661 and 1722)", () => {
  const base = inputOf(fieldsOf("lowrance", "", "at2", {}), "en-US");
  const odd = { ...base, names: { ...base.names, flat: 'F<b>&"' } };

  // The earlier page writes the name into the `text` of the picture as it is, with no escape.
  it.each([
    ["atsb", 'from the side, F<b>&" aimed ahead</text>'],
    ["at-n", 'from above, F<b>&" view, boat heading up</text>'],
    ["atw", 'the fan face-on (in Forward it stands on edge, in F<b>&" it lies flat)</text>'],
  ])("writes it unescaped into the picture of %s", (id, text) => {
    expect(helpPicture(id, id, odd)).toContain(`fill="var(--muted)">${text}`);
  });

  it("escapes it in the explanation", () => {
    expect(helpExplanation("atsb", odd.names)).toContain(
      '<span data-n="flat">F&lt;b&gt;&amp;"</span>',
    );
  });
});

describe("a number typed into a field, in the pictures (the order of the arithmetic)", () => {
  // The rows of this describe were added after the module was written, for the mutation round of
  // review round 1: a picture prints some numbers in full (the height of the `viewBox` of the
  // pictures drawn to a scale, the arrow of the speed), so a change of the order of a product or a
  // quotient (`a / b` as `a * (1 / b)`, `a * b * c` as `a * (b * c)`) changes the page for some
  // numbers a person types, and for none of the numbers the other rows use. Each row types one
  // number into one field of a page (the set, and the field with the text typed), and holds the
  // digest and the length of the picture the earlier page's lines drew for it (printed by them).
  // [the set, the field, the text typed, the unit of the speed, the field whose picture, the digest]
  const ROWS: readonly (readonly [string, string, string, string, string, string])[] = [
    ["base", "sog", "0.21", "kn", "sog", "b880d898:1525"],
    ["base", "dep", "0.9", "kn", "cone0", "5e09779c:2106"],
    ["base", "dep", "0.9", "kn", "dst", "43f7d39f:1638"],
    ["base", "sog", "0.09", "kn", "sog", "31e1343d:1516"],
    ["base", "atr", "3.53", "kn", "atr", "5f8e7915:1368"],
    ["base", "sog", "0.7", "kn", "sog", "89ed23bd:1518"],
    ["base", "atr", "39.5", "kn", "atr", "519f5394:1369"],
    ["base", "zt", "0.63", "kn", "zt", "a87ace9a:1021"],
    ["deep", "cone0", "180", "kn", "cone0", "83991860:3112"],
    ["base", "ssr", "0.1", "kn", "ssr", "1fd9dcf7:2279"],
    ["base", "dep", "107.3", "kn", "down0", "656808bf:1733"],
    ["base", "sso", "2.5", "kn", "ssr", "866be584:2231"],
    ["base", "sog", "0.27", "kn", "sog", "b972734d:1527"],
    ["base", "sog", "1.4", "kn", "sog", "ac490259:1517"],
    ["base", "sog", "2.7", "kn", "sog", "f3c601c1:1517"],
    ["base", "sog", "2.8", "kn", "sog", "f9061e40:1517"],
    ["base", "sog", "2.9", "kn", "sog", "681fd728:1517"],
    ["base", "sog", "5.4", "kn", "sog", "00919821:1517"],
    ["base", "sog", "1.1", "kmh", "sog", "dae7c879:1519"],
    ["base", "sog", "2.2", "kmh", "sog", "33063ebc:1519"],
    ["base", "sog", "4.4", "kmh", "sog", "23441970:1519"],
    ["base", "sog", "5.9", "kmh", "sog", "03b85d1e:1519"],
    ["base", "ssr", "10.5", "kn", "ssr", "b0efabaa:2279"],
    ["base", "ssr", "1.1", "kn", "ssr", "a98dbc5f:2233"],
    ["base", "ssr", "1.2", "kn", "ssr", "7b8792c0:2233"],
    ["base", "ssr", "1.6", "kn", "ssr", "f7a0b3e9:2278"],
    ["base", "ssr", "1.7", "kn", "ssr", "e2010785:2233"],
    ["base", "ssr", "1.8", "kn", "ssr", "ff919bbe:2233"],
    ["base", "atr", "55", "kn", "atr", "ef1b038f:1369"],
    ["base", "atr", "110", "kn", "atr", "3e75c5c5:1370"],
    ["base", "atr", "123", "kn", "atr", "291c6cb3:1370"],
    ["base", "atr", "27.5", "kn", "atr", "6fb47b19:1369"],
    ["base", "atr", "1.8", "kn", "atr", "57b05082:1368"],
    ["base", "atr", "3.6", "kn", "atr", "322dd89e:1368"],
    ["base", "atr", "6.3", "kn", "atr", "16eee59a:1368"],
    ["base", "atr", "56.1", "kn", "atr", "63d78691:1369"],
    ["base", "atr", "106.3", "kn", "atr", "1400fa27:1370"],
    ["base", "atr", "112.2", "kn", "atr", "9ab6eaf5:1370"],
    ["base", "dep", "55", "kn", "dst", "43f7d39f:1638"],
    ["base", "dep", "110", "kn", "dst", "43f7d39f:1638"],
    ["base", "dep", "123", "kn", "dst", "43f7d39f:1638"],
    ["base", "dep", "220", "kn", "dst", "43f7d39f:1638"],
    ["base", "dep", "246", "kn", "dst", "43f7d39f:1638"],
    ["base", "dep", "249", "kn", "dst", "43f7d39f:1638"],
    ["base", "dep", "253", "kn", "dst", "43f7d39f:1638"],
  ];

  it.each(ROWS)(
    "%s page, %s typed as %s (%s): the picture of %s is the earlier page's",
    (set, field, text, unit, id, digest) => {
      const found = SETS.find((s) => s[0] === set);
      if (found === undefined) throw new Error(`no set ${set}`);
      const [, img, sec, live, over, locale] = found;
      const input = inputOf(
        fieldsOf(img, sec, live, { ...over, sogu: unit, [field]: text }),
        locale,
      );
      const picture = helpPicture(helpKey(id), id, input);
      expect(dig(picture ?? "")).toBe(digest);
    },
  );
});

describe("two numbers typed into two fields, in the pictures (the order of the arithmetic, dense grids)", () => {
  // The rows of this describe were added after the module was written, for review round 2
  // (findings 1 and 2, and the mutants of the sums and products of three terms): the sum
  // `o + w - v` of the `side` picture (both alignments), the sum of the `atsb` picture, and
  // others of the same kind, change the printed `viewBox` height or an arrow for some pairs of
  // typed numbers and for none of the numbers of the rows above (a pair is needed: the width of
  // the widest fan, the thickness, the depth). Each row types one or two numbers into the fields
  // of the default page (Lowrance, ActiveTarget 2, en-US), sets the speed unit and the alignment
  // of the SideScan fans, and holds the digest and the length of the picture the earlier page's
  // lines drew (printed by them). The rows from "side0: 1.3" to "atsb: 2.2" are the examples of
  // the review, the last row was found by a grid of 300,000 pairs; the rows before them are a
  // greedy set cover of the mutants that dense random grids (80,000 pairs of one- and
  // two-decimal numbers per picture) reached.
  // [the fields typed, the speed unit, the alignment, the field whose picture, the digest]
  const ROWS: readonly (readonly [
    Readonly<Record<string, string>>,
    string,
    string,
    string,
    string,
  ])[] = [
    [{ sog: "57.2" }, "kn", "inner", "sog", "b23f347f:1519"],
    [{ side0: "81.4", side1: "6.66" }, "kn", "center", "sso", "00b4f970:1578"],
    [{ atr: "154.78", atw: "171.9" }, "kmh", "center", "atr", "a9c88a55:1370"],
    [{ cone0: "15.6", dep: "93.3" }, "kn", "inner", "cone0", "f7ee7044:2110"],
    [{ sog: "0.27" }, "kn", "inner", "sog", "b972734d:1527"],
    [{ side0: "19.3", side1: "60.9" }, "kn", "inner", "side0", "2d9b1681:1320"],
    [{ side0: "27.8", side1: "31.69" }, "kmh", "center", "side0", "8bce61a2:1278"],
    [{ atr: "41.3", atfa: "-54" }, "kmh", "center", "atr", "0102a597:1369"],
    [{ att: "3.37", atsb: "1.5" }, "kmh", "inner", "atsb", "aa6a90e5:1715"],
    [{ att: "15.26", atsb: "-6.7" }, "kn", "center", "atsb", "0041927d:1720"],
    [{ atr: "232.7", atw: "92.2" }, "kn", "inner", "atr", "d6f4b6d9:1370"],
    [{ side0: "59.6", sso: "27.08" }, "kmh", "inner", "sso", "caec3747:1581"],
    [{ atr: "259.81", atfa: "-86.5" }, "kmh", "center", "atr", "4d6c5a73:1385"],
    [{ atw: "97.75" }, "kn", "center", "at-n", "9d105f7e:1834"],
    [{ side0: "1.3", side1: "1.1" }, "kn", "inner", "side1", "bd685c18:1260"],
    [{ side0: "1.3", side1: "1.1" }, "kn", "inner", "side0", "8bbd7f28:1260"],
    [{ side0: "1.3", side1: "1.1" }, "kn", "center", "side1", "2d58b5a1:1261"],
    [{ side0: "54.4" }, "kn", "center", "side0", "0082a983:1293"],
    [{ atsb: "1.3", att: "1.0" }, "kn", "inner", "atsb", "b68f698b:1715"],
    [{ atsb: "2.2", att: "1.0" }, "kn", "inner", "atsb", "ac26423d:1715"],
    [{ side0: "0.6", side1: "1.05" }, "kn", "center", "sso", "4f1616e7:1556"],
  ];

  it.each(ROWS)(
    "%j (%s, %s): the picture of %s is the earlier page's",
    (typed, unit, align, id, digest) => {
      const input = inputOf(
        fieldsOf("lowrance", "", "at2", { ...typed, sogu: unit, ssalign: align }),
        "en-US",
      );
      expect(dig(helpPicture(helpKey(id), id, input) ?? "")).toBe(digest);
    },
  );
});

// ---------------------------------------------------------------------------
// Against the recorded page
// ---------------------------------------------------------------------------

declare const __dirname: string;
interface FileSystem {
  existsSync(path: string): boolean;
  readFileSync(path: string, encoding: "utf8"): string;
}
const { existsSync, readFileSync } = jest.requireActual<FileSystem>("node:fs");

const RECORDED = `${__dirname}/../fixtures/legacy`;

/** The section of the page the preset cards of Settings are recorded in. */
const SECTION_FILE = "set";

interface RecordedPatch {
  html?: string | { fnv1a: string; length: number };
}

interface Same {
  same: string;
}

interface RecordedFile {
  patches: Record<string, RecordedPatch | Same>;
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

/** The section file of a scenario and scheme (`<scenario>/<scheme>`), or the file the index says it equals. */
function sectionFile(at: string): RecordedFile | undefined {
  let path = `${at}/${SECTION_FILE}.json`;
  for (let equal = index.omitted[path]; equal !== undefined; equal = index.omitted[path])
    path = equal;
  return existsSync(`${RECORDED}/${path}`) ? read<RecordedFile>(path) : undefined;
}

/** The html of every element of a section that the earlier page wrote, read where a `same` says it is. */
function htmls(at: string): string[] {
  const out: string[] = [];
  const file = sectionFile(at);
  if (file === undefined) return out;
  for (const key of Object.keys(file.patches)) {
    let value: RecordedPatch | Same | undefined = file.patches[key];
    for (let hops = 0; value !== undefined && "same" in value; hops += 1) {
      if (hops > 2) throw new Error(`${at}, ${key}: more than two "same" in a row`);
      value = sectionFile(value.same)?.patches[key];
    }
    if (value !== undefined && "html" in value && typeof value.html === "string") {
      out.push(value.html);
    }
  }
  return out;
}

const PAIRS = index.scenarios.flatMap((scenario) =>
  index.schemes.map((scheme): [string, string] => [scenario.name, scheme]),
);

describe("against the recorded page: the '?' buttons of Settings", () => {
  const BUTTON = /<button type="button" class="qm" data-help="([^"]+)"/g;
  const LABEL = /<label for="([^"]+)">(.*?)<\/label>/g;

  it("has a topic for every button the earlier page put in a label, in every scenario", () => {
    const seen = new Set<string>();
    for (const [name, scheme] of PAIRS) {
      for (const html of htmls(`${name}/${scheme}`)) {
        for (const match of html.matchAll(BUTTON)) seen.add(String(match[1]));
      }
    }
    expect(seen.size).toBe(26);
    for (const id of seen) expect(hasHelp(id)).toBe(true);
  });

  it("has a button in each label of the two preset cards exactly when the module has a topic for its field", () => {
    let labels = 0;
    for (const [name, scheme] of PAIRS) {
      const file = sectionFile(`${name}/${scheme}`);
      if (file === undefined) continue;
      for (const html of htmls(`${name}/${scheme}`)) {
        for (const match of html.matchAll(LABEL)) {
          labels += 1;
          const id = String(match[1]);
          expect(String(match[2]).includes(`data-help="${id}"`)).toBe(hasHelp(id));
        }
      }
    }
    expect(labels).toBe(4100);
  });
});
