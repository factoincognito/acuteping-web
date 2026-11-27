/**
 * Data and sources (docs/SPEC.md 2.2): the earlier page's lines 1493 to 1567.
 * The list of figures of every transducer with its confidence and its source
 * (`dataRows`), the cards it is written as (`dataView`), the dialog a
 * "Dispute" button opens (`disputeView`) and where that dialog goes
 * (`dialogTop`). Nothing here finds an element, opens a dialog or keeps which
 * cards are open: the card that is open is the shell's, and the figure a
 * button names is found with `dataRowAt`.
 */
import { EX } from "./presets";
import { CK, CONF, IMG_RATED, LIVE_RATED, SRC } from "./sources";
import { THICKNESS } from "./transducers";
import type {
  ConeData,
  DataRow,
  ElementPatch,
  Formatter,
  SectionLocal,
  SectionView,
  Source,
} from "./types";

/** The element of the page that the earlier page writes the date of the checks to; it has no id. */
const CK_KEY =
  "sec-data > div:nth-child(2) > section:nth-child(1) > details:nth-child(1) > div:nth-child(2) > p:nth-child(1) > span:nth-child(1)";

/** The elements `dataView` writes: the scale of the levels, the list of cards and the date of the checks. */
export const KEYS = ["cf-scale", "data-list", CK_KEY] as const;

/** The elements `disputeView` writes: the dialog of a figure, and the note of one that cannot be disputed. */
export const DISPUTE_KEYS = [
  "dsp-who",
  "dsp-name",
  "dsp-val",
  "dsp-conf",
  "dsp-src",
  "dsp-mail",
  "dsp-copy",
  "nod-what",
] as const;

/** What the list reads: the choices of the three transducer fields, and the formatter. */
export interface DataInput {
  /** The values of `img-p`, `img-s` and `live-p`; one that is no text is no choice. */
  readonly local: SectionLocal;
  readonly fmt: Formatter;
}

/** The colour of each level of the scale (`PCOL`, line 1494). */
const PCOL: Readonly<Record<number, string | undefined>> = {
  1: "var(--s7)",
  2: "var(--s2)",
  3: "var(--s4)",
  4: "var(--s1)",
  5: "var(--s8)",
};

/** The scale as it can be read with a level it does not have. */
const SCALE: Readonly<Record<number, string | undefined>> = CONF;

/** The sources as they can be read with a key they do not have. */
const REGISTRY: Readonly<Record<string, Source | undefined>> = SRC;

/** The confidence pips of a level: filled up to it, with the scale's words as the title (`pips`, line 1495). */
export function pips(c: number | undefined): string {
  // A figure without a level (`rc` of a depth or range that has none) is read as the page reads it:
  // `PCOL[undefined]` finds nothing, `i <= undefined` is false, and the text says "undefined".
  const k = Number(c);
  let h = `<span class="pips" style="--pc:${PCOL[k]}" title="Confidence ${c} of 5: ${SCALE[k]}">`;
  for (let i = 1; i <= 5; i += 1) h += `<i${i <= (c ?? Number.NaN) ? ' class="on"' : ""}></i>`;
  return `${h}<b>${c}/5</b></span>`;
}

/** A text for html (`esc`, line 1496); a value that is no text is written as its text. */
export function esc(t: unknown): string {
  return String(t)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The top of a dialog that is to sit next to the button that opened it, also
 * when the page is in a frame taller than the screen (`placeDlg`, lines 1506 to
 * 1510): the button's top, the dialog's height, the window's and the screen's.
 */
export function dialogTop(
  nearTop: number,
  height: number,
  windowHeight: number,
  screenHeight: number,
): string {
  const top =
    windowHeight > 1.5 * screenHeight ? nearTop - height / 2 : (windowHeight - height) / 2;
  return `${Math.max(16, Math.min(top, windowHeight - height - 16))}px`;
}

/** One transducer's card: the figures of one preset, and the key that marks it in use. */
interface Card {
  readonly id: string;
  readonly title: string;
  /** The key of the preset when it can be in use, else null. */
  readonly inUse: string | null;
  readonly rows: readonly DataRow[];
}

/** A figure's row (the data `drow` keeps, line 1500). */
function row(
  who: string,
  name: string,
  val: string,
  c: number | undefined,
  text: string,
  sourceKey: string | undefined,
  noDispute: boolean,
  helpKey?: string,
  helpValue?: number,
): DataRow {
  return {
    who,
    name,
    val,
    c,
    text,
    source: sourceKey === undefined ? undefined : REGISTRY[sourceKey],
    noDispute,
    helpKey,
    helpValue,
  };
}

/** How a frequency is named in a list: its name, where it has one, a space, then the frequency. */
const named = (c: Pick<ConeData, "n" | "f">): string => (c.n ? `${c.n} ` : "") + c.f;

/** The cards of every transducer and live sonar, with the figures of each (`buildData`, lines 1517 to 1544). */
function cards(fmt: Formatter): Card[] {
  const metres = (m: number): string => `${fmt.num(m, 0)} m`;
  const list: Card[] = [];
  for (const [k, P] of Object.entries(IMG_RATED)) {
    const who = P.label;
    const nd = k === "other";
    const rows: DataRow[] = [];
    const fr = [
      ...P.cone.map(named),
      ...P.down.map((c) => `${P.names.down} ${c.f}`),
      ...P.side.map((c) => `${P.names.side} ${c.f}`),
    ];
    rows.push(row(who, "Frequencies", `${fr.length} listed`, P.fc, fr.join(", "), P.fs, nd));
    for (const c of P.cone) {
      const nm = `2D ${named(c)}`;
      rows.push(row(who, `${nm}, cone width`, `${c.a}°`, c.c, c.src, c.s, nd, "cone", c.a));
      if (c.r) {
        rows.push(
          row(
            who,
            `${nm}, max depth`,
            metres(c.r),
            c.rc,
            "Maximum depth in the specification",
            c.rs,
            nd,
            "maxd",
            c.r,
          ),
        );
      }
    }
    for (const c of P.down) {
      const nm = `${P.names.down} ${c.f}`;
      rows.push(row(who, `${nm}, fan width`, `${c.a}°`, c.c, c.src, c.s, nd, "down", c.a));
      if (c.r) {
        rows.push(
          row(
            who,
            `${nm}, max depth`,
            metres(c.r),
            c.rc,
            "Maximum depth in the specification",
            c.rs,
            nd,
            "maxd",
            c.r,
          ),
        );
      }
    }
    for (const c of P.side) {
      const nm = `${P.names.side} ${c.f}`;
      rows.push(row(who, `${nm}, fan width`, `${c.a}°`, c.c, c.src, c.s, nd, "side", c.a));
      if (c.r) {
        rows.push(
          row(
            who,
            `${nm}, max range per side`,
            metres(c.r),
            c.rc,
            "Maximum side range in the specification",
            c.rs,
            nd,
            "ssr",
            c.r,
          ),
        );
      }
    }
    rows.push(
      row(who, `${P.names.side} upper fan edge`, `${P.edge}°`, 1, P.edgeSrc, "", nd, "sso", P.edge),
    );
    list.push({ id: `dt-${k}`, title: who, inUse: k, rows });
  }
  for (const [k, P] of Object.entries(LIVE_RATED)) {
    const who = P.label;
    const nd = k === "other";
    list.push({
      id: `dt-${k}-l`,
      title: who,
      inUse: k,
      rows: [
        row(who, "Fan width", `${P.w}°`, P.cw, P.srcW, P.sw, nd, "atw", P.w),
        row(who, "Slice thickness", `${P.t}°`, P.ct, P.srcT, P.st, nd, "att", P.t),
      ],
    });
  }
  const all = "All imaging transducers";
  list.push({
    id: "dt-gen",
    title: "Fan thickness (all imaging transducers)",
    inUse: null,
    rows: [
      row(
        all,
        "DownScan fan thickness, front to back",
        `${THICKNESS.dst}°`,
        1,
        EX,
        "",
        false,
        "dst",
        THICKNESS.dst,
      ),
      row(
        all,
        "SideScan fan thickness, front to back",
        `${THICKNESS.sst}°`,
        1,
        EX,
        "",
        false,
        "sst",
        THICKNESS.sst,
      ),
    ],
  });
  return list;
}

/** The figures of every transducer and live sonar, in the order of the list; a figure's place in it is its number (`DSP`). */
export function dataRows(input: DataInput): DataRow[] {
  return cards(input.fmt).flatMap((card) => card.rows);
}

/**
 * The figure a button names by its attribute, `d` and its number (the lookup
 * of lines 1558 and 1746): the attribute without its first character as a
 * number, so that `d` alone is the first figure and `d 7 ` the eighth. No
 * figure for a number that is not a whole number of the list.
 */
export function dataRowAt(rows: readonly DataRow[], attribute: string): DataRow | undefined {
  const n = Number(attribute.slice(1));
  return Number.isInteger(n) && n >= 0 ? rows[n] : undefined;
}

/** What a figure's source line says: its text, and the link when it names a source (`drow`, line 1498). */
function sourceLine(r: DataRow): string {
  const S = r.source;
  return (
    esc(r.text) +
    (S
      ? `<br>Source: <a href="${S.u}" target="_blank" rel="noopener">${esc(S.t)}</a> · checked ${CK}`
      : "")
  );
}

/** A figure's row of the list (`drow`, line 1501). */
function rowHtml(r: DataRow, id: string): string {
  const qm = r.helpKey
    ? `<button type="button" class="qm" data-hdat="${id}" aria-label="Show what this figure means">?</button>`
    : "";
  return `<div class="drow"><span class="dn">${esc(r.name)}${qm}</span><span class="dv">${esc(r.val)}</span><span class="ds">${sourceLine(r)}</span><span class="dm">${pips(r.c)}<button type="button" class="mini" data-dispute="${id}">Dispute</button></span></div>`;
}

/** The text of a field that has one; a value that is no text is no choice (`""`). */
const choice = (local: SectionLocal, id: string): string => {
  const v = local[id];
  return typeof v === "string" ? v : "";
};

/**
 * The cards, the scale of the confidence levels and the date of the checks
 * (`buildData`, lines 1511 to 1555). A card is marked "in use" when a
 * transducer field holds its key.
 */
export function dataView(input: DataInput): SectionView {
  const used = [
    choice(input.local, "img-p"),
    choice(input.local, "img-s"),
    choice(input.local, "live-p"),
  ];
  let n = 0;
  const html = cards(input.fmt)
    .map((card) => {
      const inuse = card.inUse !== null && used.includes(card.inUse);
      const rows = card.rows
        .map((r) => {
          const id = `d${n}`;
          n += 1;
          return rowHtml(r, id);
        })
        .join("");
      return `<section class="panel"><details class="sub" data-sub="${card.id}"><summary><span class="eyebrow">${esc(card.title)}${inuse ? '<span class="inuse">in use</span>' : ""}</span></summary><div class="subb"><div class="dtab">${rows}</div></div></details></section>`;
    })
    .join("");
  const scale = ([5, 4, 3, 2, 1] as const)
    .map(
      (c) =>
        `<div><dt>${pips(c)}</dt><dd style="font-family:var(--font-body);text-align:left;margin-left:12px">${CONF[c]}</dd></div>`,
    )
    .join("");
  return {
    "cf-scale": { html: scale },
    "data-list": { html },
    [CK_KEY]: { text: CK },
  };
}

/**
 * What the dialog of a figure holds (the click handler, lines 1556 to 1567).
 * A figure that cannot be disputed writes only the note that says so; the
 * dialog is opened and placed by the shell (`dialogTop`).
 */
export function disputeView(d: DataRow): SectionView {
  if (d.noDispute) return { "nod-what": { text: `${d.who}: ${d.name}, ${d.val}` } };
  const S = d.source;
  const src =
    esc(d.text) + (S ? `<br><a href="${S.u}" target="_blank" rel="noopener">${esc(S.t)}</a>` : "");
  const subject = `Dispute: ${d.who}, ${d.name}`;
  const body = `Transducer: ${d.who}\nFigure: ${d.name}\nValue in the calculator: ${d.val} (confidence ${d.c}/5)\nCurrent source: ${d.text}${S ? ` (${S.u})` : ""}\n\nWhat I think it should be:\n\nSource (link):\n`;
  const mail: ElementPatch = {
    attrs: {
      href: `mailto:sonar@sugo.se?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
    },
  };
  return {
    "dsp-who": { text: d.who },
    "dsp-name": { text: d.name },
    "dsp-val": { text: d.val },
    "dsp-conf": { html: `${pips(d.c)} ${esc(SCALE[Number(d.c)])}` },
    "dsp-src": { html: src },
    "dsp-mail": mail,
    "dsp-copy": { attrs: { "data-copy": `To: sonar@sugo.se\nSubject: ${subject}\n\n${body}` } },
  };
}
