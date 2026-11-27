/**
 * The context lines and the frequency buttons against the earlier page
 * (legacy/src/p2.js, lines 275 to 296), in two ways. The expected values of the
 * first part were printed by those lines themselves, run unchanged in Node
 * against a stand-in for the page's elements, once in en-US and once in sv-SE.
 * The second part compares what the functions write with what the earlier page
 * wrote when it was recorded in a browser (`fixtures/legacy/`), in every
 * scenario of the set.
 */
import { contextView, KEYS, segmentsView } from "./context";
import { createFormatter } from "./format";
import { equipment, parseSettings } from "./settings";
import { combined, livePreset, namesOf, THICKNESS } from "./transducers";
import type { RawFields, SavedValue, SectionView, UiState } from "./types";

/** The html a view writes to an element, or a text that equals nothing when it writes none. */
const htmlOf = (view: SectionView, key: string): string => view[key]?.html ?? `no html for ${key}`;

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

/** The context lines of a page with the given fields, in a locale. */
function contextOf(fields: RawFields, locale: string): SectionView {
  const first = String(fields["img-p"]);
  const live = String(fields["live-p"]);
  return contextView({
    settings: parseSettings(fields, combined(first, String(fields["img-s"]))),
    eq: equipment(fields, livePreset(live)),
    names: namesOf(first, live),
    fmt: createFormatter(locale),
  });
}

const LINES = ["ctx-ss", "ctx-vs", "ctx-at", "ctx-cmp", "ctx-db", "ctx-ls"] as const;

/** The button every context line ends with. */
const GO = '<button type="button" class="linkbtn" data-goto="1">Change in Settings</button>';

/**
 * A context line as "label=value|label=value": its html is one span for each
 * value, each `<span>label <b>value</b></span>`, then the button, and nothing else.
 */
function short(html: string): string {
  if (!html.endsWith(GO)) return `no button at the end: ${html}`;
  const body = html.slice(0, -GO.length);
  const spans = [...body.matchAll(/<span>([^<]*) <b>([^<]*)<\/b><\/span>/g)];
  if (spans.map(([span]) => span).join("") !== body) return `not only spans: ${html}`;
  return spans.map(([, label, value]) => `${label}=${value}`).join("|");
}

/** The six lines of a view, each as `short` writes it. */
const shortLines = (view: SectionView): string[] => LINES.map((key) => short(htmlOf(view, key)));

const OFF = {
  ss: { "eq-ss": false },
  "2d": { "eq-2d": false },
  ds: { "eq-ds": false },
  at: { "eq-at": false },
} as const;

/** The lines that no setting below changes. */
const DEPTH = "Depth=10.0 m";
const SS = "Depth=10.0 m|Range=40.0 m|Fans=85° / 36°";
const VS = "Depth=10.0 m|2D=50° / 20°|DownScan=51° / 30°|SOG=2.0 kn";
const AT = "Depth=10.0 m|Transducer=0.50 m down|Range=30.0 m|Slice=135° × 18°";
const CMP = "Depth=10.0 m|SideScan range=40.0 m|ActiveTarget 2 range=30.0 m";
const DB = "SOG=2.0 kn";

describe("contextView: the settings a section shows above its tools (lines 275 to 285)", () => {
  it("writes six lines, each ending with the button to Settings", () => {
    expect(contextOf(fieldsOf(), "en-US")).toEqual({
      "ctx-ss": {
        html: '<span>Depth <b>10.0 m</b></span><span>Range <b>40.0 m</b></span><span>Fans <b>85° / 36°</b></span><button type="button" class="linkbtn" data-goto="1">Change in Settings</button>',
      },
      "ctx-vs": {
        html: '<span>Depth <b>10.0 m</b></span><span>2D <b>50° / 20°</b></span><span>DownScan <b>51° / 30°</b></span><span>SOG <b>2.0 kn</b></span><button type="button" class="linkbtn" data-goto="1">Change in Settings</button>',
      },
      "ctx-at": {
        html: '<span>Depth <b>10.0 m</b></span><span>Transducer <b>0.50 m down</b></span><span>Range <b>30.0 m</b></span><span>Slice <b>135° × 18°</b></span><button type="button" class="linkbtn" data-goto="1">Change in Settings</button>',
      },
      "ctx-cmp": {
        html: '<span>Depth <b>10.0 m</b></span><span>SideScan range <b>40.0 m</b></span><span>ActiveTarget 2 range <b>30.0 m</b></span><button type="button" class="linkbtn" data-goto="1">Change in Settings</button>',
      },
      "ctx-db": {
        html: '<span>SOG <b>2.0 kn</b></span><button type="button" class="linkbtn" data-goto="1">Change in Settings</button>',
      },
      "ctx-ls": {
        html: '<span>Depth <b>10.0 m</b></span><button type="button" class="linkbtn" data-goto="1">Change in Settings</button>',
      },
    });
  });

  // what is tested, the fields changed, the six lines as `short` writes them
  const cases: [string, RawFields, string[]][] = [
    ["the defaults", {}, [SS, VS, AT, CMP, DB, DEPTH]],
    [
      "the speed in km/h",
      { sogu: "kmh", sog: "7.2" },
      [
        SS,
        "Depth=10.0 m|2D=50° / 20°|DownScan=51° / 30°|SOG=7.2 km/h",
        AT,
        CMP,
        "SOG=7.2 km/h",
        DEPTH,
      ],
    ],
    [
      "a unit that is neither knots nor km/h is shown as km/h",
      { sogu: "mph" },
      [
        SS,
        "Depth=10.0 m|2D=50° / 20°|DownScan=51° / 30°|SOG=2.0 km/h",
        AT,
        CMP,
        "SOG=2.0 km/h",
        DEPTH,
      ],
    ],
    [
      "values under 1 have two decimals",
      { dep: "0.5", sog: "0.25", ssr: "0.999", atr: "0.05", zt: "0" },
      [
        "Depth=0.50 m|Range=1.00 m|Fans=85° / 36°",
        "Depth=0.50 m|2D=50° / 20°|DownScan=51° / 30°|SOG=0.25 kn",
        "Depth=0.50 m|Transducer=0.00 m down|Range=0.05 m|Slice=135° × 18°",
        "Depth=0.50 m|SideScan range=1.00 m|ActiveTarget 2 range=0.05 m",
        "SOG=0.25 kn",
        "Depth=0.50 m",
      ],
    ],
    [
      "values that round",
      { dep: "0.995", sog: "0.999", ssr: "1.05", atr: "99.95", zt: "0.994" },
      [
        "Depth=1.00 m|Range=1.1 m|Fans=85° / 36°",
        "Depth=1.00 m|2D=50° / 20°|DownScan=51° / 30°|SOG=1.00 kn",
        "Depth=1.00 m|Transducer=0.99 m down|Range=100.0 m|Slice=135° × 18°",
        "Depth=1.00 m|SideScan range=1.1 m|ActiveTarget 2 range=100.0 m",
        "SOG=1.00 kn",
        "Depth=1.00 m",
      ],
    ],
    [
      "large values are not grouped",
      { dep: "1234.56", sog: "1e3", ssr: "100000", atr: "1e21", zt: "1000" },
      [
        "Depth=1234.6 m|Range=100000.0 m|Fans=85° / 36°",
        "Depth=1234.6 m|2D=50° / 20°|DownScan=51° / 30°|SOG=1000.0 kn",
        "Depth=1234.6 m|Transducer=1000.0 m down|Range=1000000000000000000000.0 m|Slice=135° × 18°",
        "Depth=1234.6 m|SideScan range=100000.0 m|ActiveTarget 2 range=1000000000000000000000.0 m",
        "SOG=1000.0 kn",
        "Depth=1234.6 m",
      ],
    ],
    [
      "negative values and minus zero are shown as they are",
      { dep: "-3", sog: "-0.5", ssr: "-40", atr: "-0", zt: "-0" },
      [
        "Depth=-3.0 m|Range=-40.0 m|Fans=85° / 36°",
        "Depth=-3.0 m|2D=50° / 20°|DownScan=51° / 30°|SOG=-0.50 kn",
        "Depth=-3.0 m|Transducer=-0.00 m down|Range=-0.00 m|Slice=135° × 18°",
        "Depth=-3.0 m|SideScan range=-40.0 m|ActiveTarget 2 range=-0.00 m",
        "SOG=-0.50 kn",
        "Depth=-3.0 m",
      ],
    ],
    [
      "a distance or speed that is no number is a dash",
      { dep: "", sog: "abc", ssr: " ", atr: "1e309", zt: "x" },
      [
        "Depth=— m|Range=— m|Fans=85° / 36°",
        "Depth=— m|2D=50° / 20°|DownScan=51° / 30°|SOG=— kn",
        "Depth=— m|Transducer=— m down|Range=— m|Slice=135° × 18°",
        "Depth=— m|SideScan range=— m|ActiveTarget 2 range=— m",
        "SOG=— kn",
        "Depth=— m",
      ],
    ],
    [
      "angles are whole degrees",
      {
        cone0: "50.5",
        cone1: "20.4",
        down0: "51.5",
        down1: "0.4",
        side0: "84.5",
        side1: "36.49",
        atw: "134.5",
        att: "18.5",
      },
      [
        SS,
        "Depth=10.0 m|2D=51° / 20°|DownScan=52° / 0°|SOG=2.0 kn",
        "Depth=10.0 m|Transducer=0.50 m down|Range=30.0 m|Slice=135° × 19°",
        CMP,
        DB,
        DEPTH,
      ],
    ],
    [
      "an angle that is no number is written as NaN",
      { cone0: "", down1: "x", side0: " ", atw: "", att: "abc" },
      [
        "Depth=10.0 m|Range=40.0 m|Fans=NaN° / 36°",
        "Depth=10.0 m|2D=NaN° / 20°|DownScan=51° / NaN°|SOG=2.0 kn",
        "Depth=10.0 m|Transducer=0.50 m down|Range=30.0 m|Slice=NaN° × NaN°",
        CMP,
        DB,
        DEPTH,
      ],
    ],
    [
      "negative angles and minus zero are shown as they are",
      { cone0: "-5", down0: "-0", side1: "-0.4", atw: "-135", att: "-0.6" },
      [
        "Depth=10.0 m|Range=40.0 m|Fans=85° / -0°",
        "Depth=10.0 m|2D=-5° / 20°|DownScan=-0° / 30°|SOG=2.0 kn",
        "Depth=10.0 m|Transducer=0.50 m down|Range=30.0 m|Slice=-135° × -1°",
        CMP,
        DB,
        DEPTH,
      ],
    ],
    [
      "2D not ticked",
      OFF["2d"],
      [SS, "Depth=10.0 m|DownScan=51° / 30°|SOG=2.0 kn", AT, CMP, DB, DEPTH],
    ],
    [
      "down imaging not ticked",
      OFF.ds,
      [SS, "Depth=10.0 m|2D=50° / 20°|SOG=2.0 kn", AT, CMP, DB, DEPTH],
    ],
    [
      "2D and down imaging not ticked",
      { ...OFF["2d"], ...OFF.ds },
      [SS, "Depth=10.0 m|SOG=2.0 kn", AT, CMP, DB, DEPTH],
    ],
    [
      "side imaging not ticked: its line stays, its range leaves All beams compared",
      OFF.ss,
      [SS, VS, AT, "Depth=10.0 m|ActiveTarget 2 range=30.0 m", DB, DEPTH],
    ],
    [
      "live sonar not ticked: its line stays, its range leaves All beams compared",
      OFF.at,
      [SS, VS, AT, "Depth=10.0 m|SideScan range=40.0 m", DB, DEPTH],
    ],
    [
      "no sonar ticked",
      { ...OFF.ss, ...OFF["2d"], ...OFF.ds, ...OFF.at },
      [SS, "Depth=10.0 m|SOG=2.0 kn", AT, DEPTH, DB, DEPTH],
    ],
  ];

  it.each(cases)("%s", (_about, over, lines) => {
    expect(shortLines(contextOf(fieldsOf(over), "en-US"))).toEqual(lines);
  });

  // first, second, live sonar, the six lines: the names and the angles are the transducers'
  it.each<[string, string, string, string[]]>([
    [
      "hb_xm9hw",
      "",
      "ml2",
      [
        "Depth=10.0 m|Range=40.0 m|Fans=86° / 86° / 86°",
        "Depth=10.0 m|2D=42° / 25°|Down Imaging=75° / 45° / 75°|SOG=2.0 kn",
        "Depth=10.0 m|Transducer=0.50 m down|Range=30.0 m|Slice=120° × 20°",
        "Depth=10.0 m|Side Imaging range=40.0 m|MEGA Live 2 range=30.0 m",
        DB,
        DEPTH,
      ],
    ],
    [
      "hb_xm920",
      "hb_xm9hw",
      "ml2",
      [
        "Depth=10.0 m|Range=40.0 m|Fans=86° / 55° / 86° / 86°",
        "Depth=10.0 m|2D=60° / 20° / 42° / 25°|Down Imaging=75° / 45° / 75° / 75°|SOG=2.0 kn",
        "Depth=10.0 m|Transducer=0.50 m down|Range=30.0 m|Slice=120° × 20°",
        "Depth=10.0 m|Side Imaging range=40.0 m|MEGA Live 2 range=30.0 m",
        DB,
        DEPTH,
      ],
    ],
    [
      "other",
      "",
      "lvs34",
      [
        "Depth=10.0 m|Range=40.0 m|Fans=85° / 55°",
        "Depth=10.0 m|2D=50° / 20°|Down imaging=75° / 45°|SOG=2.0 kn",
        "Depth=10.0 m|Transducer=0.50 m down|Range=30.0 m|Slice=135° × 20°",
        "Depth=10.0 m|Side imaging range=40.0 m|LiveScope Plus range=30.0 m",
        DB,
        DEPTH,
      ],
    ],
    [
      "other",
      "",
      "other",
      [
        "Depth=10.0 m|Range=40.0 m|Fans=85° / 55°",
        "Depth=10.0 m|2D=50° / 20°|Down imaging=75° / 45°|SOG=2.0 kn",
        "Depth=10.0 m|Transducer=0.50 m down|Range=30.0 m|Slice=135° × 20°",
        "Depth=10.0 m|Side imaging range=40.0 m|Live sonar range=30.0 m",
        DB,
        DEPTH,
      ],
    ],
    [
      "lowrance",
      "lowrance_nose",
      "at2xl",
      [
        "Depth=10.0 m|Range=40.0 m|Fans=85° / 36° / 48°",
        "Depth=10.0 m|2D=50° / 20°|DownScan=51° / 30° / 75° / 45°|SOG=2.0 kn",
        "Depth=10.0 m|Transducer=0.50 m down|Range=30.0 m|Slice=180° × 20°",
        "Depth=10.0 m|SideScan range=40.0 m|ActiveTarget 2 XL range=30.0 m",
        DB,
        DEPTH,
      ],
    ],
    ["nope", "", "nope", [SS, VS, AT, CMP, DB, DEPTH]],
  ])("%j with %j and the live sonar %j", (first, second, live, lines) => {
    expect(shortLines(contextOf(fieldsOf({}, first, second, live), "en-US"))).toEqual(lines);
  });

  /** The minus sign of sv-SE, which is not the hyphen of en-US. */
  const MINUS = String.fromCharCode(0x2212);

  // The same lines as the earlier page writes them for a visitor whose locale is sv-SE.
  it.each<[string, RawFields, string[]]>([
    [
      "the defaults",
      {},
      [
        "Depth=10,0 m|Range=40,0 m|Fans=85° / 36°",
        "Depth=10,0 m|2D=50° / 20°|DownScan=51° / 30°|SOG=2,0 kn",
        "Depth=10,0 m|Transducer=0,50 m down|Range=30,0 m|Slice=135° × 18°",
        "Depth=10,0 m|SideScan range=40,0 m|ActiveTarget 2 range=30,0 m",
        "SOG=2,0 kn",
        "Depth=10,0 m",
      ],
    ],
    [
      "comma decimals",
      { dep: "12,5", sog: "3,5", ssr: "45,5", atr: "0,05", zt: "0,75" },
      [
        "Depth=12,5 m|Range=45,5 m|Fans=85° / 36°",
        "Depth=12,5 m|2D=50° / 20°|DownScan=51° / 30°|SOG=3,5 kn",
        "Depth=12,5 m|Transducer=0,75 m down|Range=0,05 m|Slice=135° × 18°",
        "Depth=12,5 m|SideScan range=45,5 m|ActiveTarget 2 range=0,05 m",
        "SOG=3,5 kn",
        "Depth=12,5 m",
      ],
    ],
    [
      "large values, not grouped",
      { dep: "1234.56", ssr: "100000" },
      [
        "Depth=1234,6 m|Range=100000,0 m|Fans=85° / 36°",
        "Depth=1234,6 m|2D=50° / 20°|DownScan=51° / 30°|SOG=2,0 kn",
        "Depth=1234,6 m|Transducer=0,50 m down|Range=30,0 m|Slice=135° × 18°",
        "Depth=1234,6 m|SideScan range=100000,0 m|ActiveTarget 2 range=30,0 m",
        "SOG=2,0 kn",
        "Depth=1234,6 m",
      ],
    ],
    [
      "negative values, with the minus sign of the locale",
      { dep: "-3", zt: "-0.5" },
      [
        `Depth=${MINUS}3,0 m|Range=40,0 m|Fans=85° / 36°`,
        `Depth=${MINUS}3,0 m|2D=50° / 20°|DownScan=51° / 30°|SOG=2,0 kn`,
        `Depth=${MINUS}3,0 m|Transducer=${MINUS}0,50 m down|Range=30,0 m|Slice=135° × 18°`,
        `Depth=${MINUS}3,0 m|SideScan range=40,0 m|ActiveTarget 2 range=30,0 m`,
        "SOG=2,0 kn",
        `Depth=${MINUS}3,0 m`,
      ],
    ],
    [
      "angles with comma decimals, in whole degrees",
      { cone0: "50,5", side0: "84,5", atw: "134,5", att: "18,5" },
      [
        "Depth=10,0 m|Range=40,0 m|Fans=85° / 36°",
        "Depth=10,0 m|2D=51° / 20°|DownScan=51° / 30°|SOG=2,0 kn",
        "Depth=10,0 m|Transducer=0,50 m down|Range=30,0 m|Slice=135° × 19°",
        "Depth=10,0 m|SideScan range=40,0 m|ActiveTarget 2 range=30,0 m",
        "SOG=2,0 kn",
        "Depth=10,0 m",
      ],
    ],
  ])("in sv-SE: %s", (_about, over, lines) => {
    expect(shortLines(contextOf(fieldsOf(over), "sv-SE"))).toEqual(lines);
  });

  it("writes the keys of the six lines, and html alone", () => {
    const view = contextOf(fieldsOf(), "en-US");
    expect(Object.keys(view)).toEqual([...LINES]);
    for (const patch of Object.values(view)) expect(Object.keys(patch)).toEqual(["html"]);
  });
});

const SEGMENTS = ["f2d", "fds", "ssf"] as const;

/**
 * The frequency buttons of an element as "label|label*", with a star on a
 * pressed one: its html is one button for each frequency, numbered from 0, each
 * `<button type="button" data-v="i" aria-pressed="true or false">label</button>`,
 * and nothing else.
 */
function buttons(html: string): string {
  const found = [
    ...html.matchAll(
      /<button type="button" data-v="(\d+)" aria-pressed="(true|false)">([^<]*)<\/button>/g,
    ),
  ];
  if (found.map(([button]) => button).join("") !== html) return `not only buttons: ${html}`;
  if (found.some(([, v], i) => v !== String(i))) return `not numbered from 0: ${html}`;
  return found.map(([, , pressed, label]) => label + (pressed === "true" ? "*" : "")).join("|");
}

/** A saved view state as it comes out of storage, which may hold anything. */
const saved = (json: string): UiState => JSON.parse(json);

/** The buttons of the three elements, each as `buttons` writes it. */
const segmentsOf = (first: string, second: string, ui: string): string[] => {
  const view = segmentsView(combined(first, second), saved(ui));
  return SEGMENTS.map((key) => buttons(htmlOf(view, key)));
};

describe("segmentsView: the buttons that choose a frequency (lines 286 to 295)", () => {
  it("writes a button for each frequency and presses the chosen one", () => {
    expect(
      segmentsView(combined("lowrance", ""), saved('{"f2d":"0","fds":"1","ssf":"2"}')),
    ).toEqual({
      f2d: {
        html: '<button type="button" data-v="0" aria-pressed="true">Medium CHIRP 83 kHz</button><button type="button" data-v="1" aria-pressed="false">High CHIRP 200 kHz</button>',
      },
      fds: {
        html: '<button type="button" data-v="0" aria-pressed="false">700 kHz CHIRP</button><button type="button" data-v="1" aria-pressed="true">1200 kHz CHIRP</button>',
      },
      ssf: {
        html: '<button type="button" data-v="0" aria-pressed="false">455 kHz CHIRP</button><button type="button" data-v="1" aria-pressed="false">1075 kHz CHIRP</button>',
      },
    });
  });

  // first, second, the buttons of 2D, down imaging and side imaging with the choice 0, 1 and 2
  it.each<[string, string, string[]]>([
    [
      "lowrance",
      "",
      [
        "Medium CHIRP 83 kHz*|High CHIRP 200 kHz",
        "700 kHz CHIRP|1200 kHz CHIRP*",
        "455 kHz CHIRP|1075 kHz CHIRP",
      ],
    ],
    [
      "lowrance_nose",
      "",
      ["Medium CHIRP 83 kHz*|High CHIRP 200 kHz", "455 kHz|800 kHz*", "455 kHz|800 kHz"],
    ],
    [
      "hb_xm9hw",
      "",
      [
        "CHIRP Wide 140–200 kHz*|CHIRP Narrow 180–240 kHz",
        "455 kHz|800 kHz*|MEGA Imaging+",
        "455 kHz|800 kHz|MEGA Imaging+*",
      ],
    ],
    [
      "hb_xm14hw",
      "",
      [
        "CHIRP Wide 140–200 kHz*|CHIRP Narrow 180–240 kHz",
        "455 kHz|800 kHz*|MEGA Imaging+",
        "455 kHz|800 kHz|MEGA Imaging+*",
      ],
    ],
    [
      "hb_xm14cmsi",
      "",
      [
        "CHIRP Wide 140–200 kHz*|CHIRP Narrow 180–240 kHz",
        "455 kHz|MEGA Imaging+*",
        "455 kHz|MEGA Imaging+",
      ],
    ],
    [
      "hb_xnt9hw150",
      "",
      [
        "CHIRP Wide 140–200 kHz*|CHIRP Narrow 180–240 kHz",
        "455 kHz|MEGA Imaging*",
        "455 kHz|MEGA Imaging",
      ],
    ],
    [
      "hb_xm920",
      "",
      ["83 kHz*|200 kHz", "455 kHz|800 kHz*|MEGA Imaging", "455 kHz|800 kHz|MEGA Imaging*"],
    ],
    ["other", "", ["Low*|High", "Low|High*", "Low|High"]],
    [
      "lowrance",
      "lowrance_nose",
      [
        "Medium CHIRP 83 kHz*|High CHIRP 200 kHz",
        "700 kHz CHIRP|1200 kHz CHIRP*|455 kHz (nosecone)|800 kHz (nosecone)",
        "455 kHz CHIRP|1075 kHz CHIRP|800 kHz (nosecone)*",
      ],
    ],
    [
      "hb_xm920",
      "hb_xm9hw",
      [
        "83 kHz*|200 kHz|CHIRP Wide 140–200 kHz (XM 9 HW)|CHIRP Narrow 180–240 kHz (XM 9 HW)",
        "455 kHz|800 kHz*|MEGA Imaging|MEGA Imaging+ (XM 9 HW)",
        "455 kHz|800 kHz|MEGA Imaging*|MEGA Imaging+ (XM 9 HW)",
      ],
    ],
    [
      "hb_xm920",
      "other",
      [
        "83 kHz*|200 kHz|Low (other)|High (other)",
        "455 kHz|800 kHz*|MEGA Imaging|Low (other)|High (other)",
        "455 kHz|800 kHz|MEGA Imaging*|Low (other)|High (other)",
      ],
    ],
    [
      "nope",
      "nope",
      [
        "Medium CHIRP 83 kHz*|High CHIRP 200 kHz",
        "700 kHz CHIRP|1200 kHz CHIRP*",
        "455 kHz CHIRP|1075 kHz CHIRP",
      ],
    ],
  ])("%j with %j", (first, second, expected) => {
    expect(segmentsOf(first, second, '{"f2d":"0","fds":"1","ssf":"2"}')).toEqual(expected);
  });

  /** Which buttons are pressed, one digit for each. */
  const pressed = (ui: string): string[] =>
    segmentsOf("hb_xm920", "hb_xm9hw", ui).map((line) =>
      line
        .split("|")
        .map((label) => (label.endsWith("*") ? "1" : "0"))
        .join(""),
    );

  // The saved choice; which of the four buttons of each kind is pressed (the Humminbird
  // XM 9 20 with the XM 9 HW has four frequencies of each kind).
  it.each<[string, string[]]>([
    ['{"f2d":"0","fds":"0","ssf":"0"}', ["1000", "1000", "1000"]],
    ['{"f2d":"1","fds":"2","ssf":"3"}', ["0100", "0010", "0001"]],
    // A number is pressed as its text is.
    ['{"f2d":1,"fds":2,"ssf":0}', ["0100", "0010", "1000"]],
    // No button for a choice the transducer has no frequency for, and none for another spelling of a number.
    ['{"f2d":"4","fds":"9","ssf":"-1"}', ["0000", "0000", "0000"]],
    ['{"f2d":"01","fds":"1.0","ssf":" 1"}', ["0000", "0000", "0000"]],
    ['{"f2d":"","fds":null,"ssf":true}', ["0000", "0000", "0000"]],
    ["{}", ["0000", "0000", "0000"]],
    ['{"f2d":1.5,"fds":"1e0","ssf":[2]}', ["0000", "0000", "0010"]],
  ])("saved %s presses %j", (ui, expected) => {
    expect(pressed(ui)).toEqual(expected);
  });

  it("writes the three elements, and html alone, and leaves the saved state as it is", () => {
    const ui = saved('{"f2d":"1","fds":"1","ssf":"1","db":"ss"}');
    const view = segmentsView(combined("lowrance", ""), ui);
    expect(Object.keys(view)).toEqual([...SEGMENTS]);
    for (const patch of Object.values(view)) expect(Object.keys(patch)).toEqual(["html"]);
    expect(JSON.stringify(ui)).toBe('{"f2d":"1","fds":"1","ssf":"1","db":"ss"}');
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
}

/** What a recording started from, as far as this test reads it. */
interface RecordedScenario {
  name: string;
  locale: string;
  fields: Record<string, string | boolean>;
  ui: UiState;
}

interface RecordedFile {
  scenario: RecordedScenario;
  patches: Record<string, RecordedPatch | { same: string }>;
}

interface RecordedIndex {
  schemes: string[];
  scenarios: { name: string; locale: string }[];
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

/** The section of the page each element of KEYS is recorded in. */
const SECTION_OF: [(typeof KEYS)[number], string][] = [
  ["ctx-ss", "ss"],
  ["ctx-vs", "vs"],
  ["ctx-at", "at"],
  ["ctx-cmp", "cmp"],
  ["ctx-db", "db"],
  ["ctx-ls", "ls"],
  ["f2d", "vs"],
  ["fds", "vs"],
  ["ssf", "ss"],
];

const SCENARIOS = index.scenarios.map((scenario) => scenario.name);

describe("against the recorded page", () => {
  it("reads every scenario, in light and dark, two of them in sv-SE", () => {
    expect(SCENARIOS).toHaveLength(168);
    expect(index.schemes).toEqual(["light", "dark"]);
    expect(SECTION_OF.map(([key]) => key).sort()).toEqual([...KEYS].sort());
    expect(
      index.scenarios.filter((scenario) => scenario.locale !== "en-US").map((s) => s.locale),
    ).toEqual(["sv-SE", "sv-SE"]);
  });

  it("has scenarios that choose another frequency than the first, of each kind", () => {
    const chosen = (key: (typeof SEGMENTS)[number]): string[] =>
      [...new Set(SCENARIOS.map((name) => String(scenarioOf(name).ui[key])))].sort();
    for (const key of SEGMENTS) expect(chosen(key).length).toBeGreaterThan(1);
  });

  describe.each(
    SCENARIOS.flatMap((name) => index.schemes.map((scheme): [string, string] => [name, scheme])),
  )("%s, %s", (name, scheme) => {
    const at = `${name}/${scheme}`;
    const scenario = scenarioOf(name);
    const { fields } = scenario;
    const view: SectionView = {
      ...contextOf(fields, scenario.locale),
      ...segmentsView(combined(String(fields["img-p"]), String(fields["img-s"])), scenario.ui),
    };

    it("writes the keys of KEYS", () => {
      expect(scenario.name).toBe(name);
      expect(Object.keys(view).sort()).toEqual([...KEYS].sort());
    });

    it.each(SECTION_OF)("leaves %s as the earlier page left it", (key, section) => {
      const patch = view[key] ?? {};
      const was = recorded(at, section, key);
      expect(was).toBeDefined();
      expect(Object.keys(patch)).toEqual(["html"]);
      expect(typeof was?.html).toBe("string");
      expect(patch.html).toBe(was?.html);
    });
  });
});
