/* Sonar Geometry Calculator. Copyright 2026 Adam Smolowicz.
   Licensed under the PolyForm Noncommercial License 1.0.0: https://polyformproject.org/licenses/noncommercial/1.0.0
   Required Notice: Copyright 2026 Adam Smolowicz */

/**
 * The shell of the page (docs/SPEC.md 2.1): the one module that touches the
 * document, the window, the storage and the canvases. It finds the elements,
 * reads the fields, resolves the style, writes what the modules return, gives
 * each painter its canvas, and owns the saved state, the events, the dialogs,
 * the stopwatch and the frames. The order of what it does when the page loads
 * and on every event is the earlier page's (its lines 1795 to 1981 and the
 * lines of each section that touch the page).
 */
import {
  activeTargetView,
  BEAM_CANVAS,
  BEAM_DELAY_MS,
  beamModes,
  beamView,
  CANVAS_DOWN,
  CANVAS_FLAT,
  CANVAS_FORWARD,
  CANVAS_WIDE,
  paintBeam,
  paintDown,
  paintFlat,
  paintForward,
  paintWide,
} from "./activetarget";
import {
  beamList,
  behindView as beamsBehindView,
  buildScene,
  CANVAS as CANVAS_3D,
  cmpList,
  compareView,
  footprintView,
  paintScene,
  sideView,
} from "./beams";
import { behindView } from "./behind";
import { chipDefaults, chipGroups, drawnLegend } from "./chips";
import { contextView, segmentsView } from "./context";
import { CANVAS_2D, CANVAS_DS, coverageView, paintScreen2d, paintScreenDs } from "./coverage";
import { dataRowAt, dataRows, dataView, dialogTop, disputeView } from "./datacards";
import { createFormatter } from "./format";
import { figureHelpView, hasHelp, settingHelpView } from "./help";
import { lightShadowView } from "./lightshadow";
import {
  checkSettings,
  equipment,
  equipmentView,
  hiddenFor,
  isModified,
  num,
  parseSettings,
  settingsView,
} from "./settings";
import { CANVAS as CANVAS_SIM, ERR_DEPTHS, paintSideScan, sideScanView } from "./sidescan";
import { loadState, restoreField, saveState } from "./state";
import {
  alignOf,
  anglesView,
  combined,
  frequencyChoice,
  liveAnglesView,
  livePreset,
  liveView,
  nameFor,
  namesOf,
  namesView,
  primaryView,
  secondaryView,
} from "./transducers";
import type {
  Beam,
  DataRow,
  Equipment,
  Formatter,
  Names,
  Preset,
  RawFields,
  SavedField,
  Scene3d,
  Scene3dState,
  SectionLocal,
  SectionView,
  Settings,
  StateStorage,
  Surface,
  Theme,
  UiState,
} from "./types";

/** What every view and painter of a section reads (the `ViewInput` of docs/SPEC.md 3.2). */
interface ViewInput {
  readonly settings: Settings;
  readonly eq: Equipment;
  readonly ui: UiState;
  readonly names: Names;
  readonly local: SectionLocal;
  readonly scene3d: Scene3dState;
  readonly theme: Theme;
  readonly fmt: Formatter;
}

/** The fields of the sections that hold a number, and those that hold a choice (docs/SPEC.md 2.1). */
const LOCAL_NUMBERS = [
  "frac",
  "fx",
  "fy",
  "fz",
  "lsfx",
  "lsfh",
  "ro",
  "rs",
  "s1",
  "s2",
  "scrT",
  "sr",
  "ssR",
  "tscr",
  "x",
  "y",
  "z",
  "zf",
] as const;
const LOCAL_CHOICES = ["ssalign", "img-p", "img-s", "live-p", "at-n"] as const;

/** The keys of the view state that a row of buttons chooses one value of. */
type ChoiceKey = "ssMode" | "ssf" | "f2d" | "fds" | "db" | "lsB" | "lsA";

/** The 3D view as the page starts with it, and its limits. */
const VIEW_3D: Scene3dState = { yaw: -0.6, pitch: 0.45, zoom: 1, zx: 1 };
const ZOOM_3D = { least: 0.3, most: 6, wheelIn: 1.1, wheelOut: 0.9, button: 1.25 } as const;
const TURN_PER_PIXEL = 0.01;
const PITCH_3D = { least: -0.2, most: Math.PI / 2 } as const;
const FIXED_VIEWS: Readonly<Record<string, readonly [number, number] | undefined>> = {
  iso: [-0.6, 0.45],
  behind: [0, 0],
  above: [0, Math.PI / 2],
  side: [Math.PI / 2, 0],
};

/** How long a copy button says what happened, and how often the stopwatch shows its time, in ms. */
const COPY_NOTE_MS = 2500;
const STOPWATCH_TICK_MS = 100;

/** A frame of the earlier page where the browser has no animation frames, in ms. */
const FRAME_FALLBACK_MS = 16;

// ---------------------------------------------------------------------------
// The page: finding, reading and writing
// ---------------------------------------------------------------------------

const $ = (id: string): HTMLElement | null => document.getElementById(id);

/** An element the page cannot work without. */
function must<T>(found: T | null | undefined, what: string): T {
  if (found === null || found === undefined) throw new TypeError(`the page has no ${what}`);
  return found;
}

function each(selector: string, fn: (el: HTMLElement) => void): void {
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(selector))) fn(el);
}

/** The element an event came from that matches, or is inside one that matches. */
function hit(ev: Event, selector: string): HTMLElement | null {
  return ev.target instanceof Element ? ev.target.closest<HTMLElement>(selector) : null;
}

type Field = HTMLInputElement | HTMLSelectElement;

const isField = (el: Element | null): el is Field =>
  el instanceof HTMLInputElement || el instanceof HTMLSelectElement;

/** The text of a field, or undefined for a field the page does not have. */
function textOf(id: string): string | undefined {
  const el = $(id);
  return isField(el) ? el.value : undefined;
}

/** The value of a field the page always has. */
const choiceOf = (id: string): string => textOf(id) ?? "";

/** A custom property of the page's style, as the style resolves it now. */
function css(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** The page's style: every custom property is read when it is asked for. */
const theme: Theme = {
  colours: new Proxy<Record<string, string>>(
    {},
    { get: (_target, name) => (typeof name === "string" ? css(name) : undefined) },
  ),
};

/** The visitor's locale. */
const fmt = createFormatter(undefined);

/** The element a view names: by its id, or by its place under the element with an id. */
function find(key: string): HTMLElement | null {
  const at = key.indexOf(" > ");
  if (at < 0) return $(key);
  const root = key.slice(0, at);
  const from = root === "body" || root === "html" ? root : `#${CSS.escape(root)}`;
  return document.querySelector<HTMLElement>(from + key.slice(at));
}

/** Writes a view to the page: of each element only what the view holds. */
function apply(view: SectionView): void {
  for (const [key, patch] of Object.entries(view)) {
    const el = find(key);
    if (!el) continue;
    if (patch.attrs)
      for (const [name, value] of Object.entries(patch.attrs)) el.setAttribute(name, value);
    if (patch.html !== undefined) el.innerHTML = patch.html;
    if (patch.text !== undefined) el.textContent = patch.text;
    if (patch.classes) el.className = patch.classes.join(" ");
    if (patch.value !== undefined && isField(el)) el.value = patch.value;
    if (patch.checked !== undefined && el instanceof HTMLInputElement) el.checked = patch.checked;
    if (patch.hidden !== undefined) el.hidden = patch.hidden;
  }
}

/** A canvas as a painter gets it. */
function surface(id: string): Surface {
  const canvas = $(id);
  if (!(canvas instanceof HTMLCanvasElement)) throw new TypeError(`the page has no canvas ${id}`);
  const ctx = must(canvas.getContext("2d"), `2D context for ${id}`);
  return {
    get width() {
      return canvas.width;
    },
    get height() {
      return canvas.height;
    },
    ctx,
    resize(height: number) {
      canvas.height = height;
      return ctx;
    },
  };
}

// ---------------------------------------------------------------------------
// The saved state
// ---------------------------------------------------------------------------

/** The browser's storage, reached only inside the calls, where a storage that is not there is caught. */
const storage: StateStorage = {
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
};

const state = loadState(storage);
const ui = state.ui;

/** Every field the page saves, as it stands. */
function savedFields(): SavedField[] {
  const fields: SavedField[] = [];
  each("[data-save]", (el) => {
    if (!isField(el)) return;
    fields.push({
      id: el.id,
      value: el.type === "checkbox" && "checked" in el ? el.checked : el.value,
    });
  });
  return fields;
}

function save(): void {
  saveState(storage, state, savedFields());
}

function restore(): void {
  each("[data-save]", (el) => {
    if (!isField(el)) return;
    const saved = restoreField(state.v, el.id, el.type === "checkbox");
    if (!saved) return;
    if ("checked" in saved) {
      if (el instanceof HTMLInputElement) el.checked = saved.checked;
    } else el.value = saved.value;
  });
}

// ---------------------------------------------------------------------------
// The transducers and the settings
// ---------------------------------------------------------------------------

/** The transducer the page calculates with. */
const preset = (): Preset => combined(choiceOf("img-p"), choiceOf("img-s"));

function fillSec(): void {
  apply(secondaryView(choiceOf("img-p"), choiceOf("img-s")));
}

function fillLive(): void {
  apply(liveView(choiceOf("img-p"), choiceOf("live-p")));
}

let names: Names = namesOf("", "");

function setNames(): void {
  names = namesOf(choiceOf("img-p"), choiceOf("live-p"));
  each("[data-n]", (el) => {
    const name = nameFor(names, el.getAttribute("data-n") ?? "");
    if (name && el.textContent !== name) el.textContent = name;
  });
  apply(namesView(names));
}

/** The "?" buttons exist only once the page has its help pictures: not yet while the angles are first written. */
let helpReady = false;

function addQM(): void {
  if (!helpReady) return;
  each("label[for]", (label) => {
    const id = label.getAttribute("for") ?? "";
    if (!hasHelp(id) || label.querySelector(".qm")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "qm";
    button.setAttribute("data-help", id);
    button.setAttribute("aria-label", "Show what this setting means");
    button.textContent = "?";
    label.appendChild(button);
  });
}

function buildSegs(): void {
  apply(segmentsView(preset(), ui));
}

function buildImg(): void {
  const p = preset();
  apply(anglesView(p, alignOf(textOf("ssalign") ?? null, state.v.ssalign)));
  addQM();
  Object.assign(ui, frequencyChoice(ui, p));
  buildSegs();
}

function buildLive(): void {
  apply(liveAnglesView(livePreset(choiceOf("live-p"))));
  addQM();
}

/** The fields of the page by id, as Settings reads them. */
function rawFields(): RawFields {
  return Object.fromEntries(savedFields().map((field) => [field.id, field.value]));
}

const settingsNow = (): Settings => parseSettings(rawFields(), preset());

const equipmentNow = (): Equipment => equipment(rawFields(), livePreset(choiceOf("live-p")));

/** The 3D view: its angle, zoom and stretch, and the scene the last drawing built. */
let view3d: Scene3dState = VIEW_3D;
let scene: Scene3d | null = null;

/** What the views and painters read, from the page as it stands. */
function viewInput(): ViewInput {
  const local: Record<string, number | string> = {};
  for (const id of LOCAL_NUMBERS) local[id] = num(textOf(id));
  for (const id of LOCAL_CHOICES) {
    const value = textOf(id);
    if (value !== undefined) local[id] = value;
  }
  return {
    settings: settingsNow(),
    eq: equipmentNow(),
    ui,
    names,
    local,
    scene3d: view3d,
    theme,
    fmt,
  };
}

function applyEq(eq: Equipment): void {
  each("[data-eq]", (el) => {
    el.hidden = hiddenFor(eq, el.getAttribute("data-eq") ?? "");
  });
  apply(equipmentView(eq));
}

// ---------------------------------------------------------------------------
// The sections
// ---------------------------------------------------------------------------

function renderSS(input: ViewInput): void {
  apply(sideScanView(input));
  paintSideScan(surface(CANVAS_SIM), input);
}

function renderVS(input: ViewInput): void {
  apply(coverageView(input));
  paintScreen2d(surface(CANVAS_2D), input);
  paintScreenDs(surface(CANVAS_DS), input);
}

/** The wait before the beams of the live sonar are drawn. */
let beamTimer: number | undefined;

function renderAT(input: ViewInput): void {
  const view = activeTargetView(input);
  apply(view);
  // A section that a setting stops leaves the wait of an earlier drawing alone:
  // its beams are still drawn, from the settings of that drawing.
  if (view["at-serr"]?.text) return;
  paintForward(surface(CANVAS_FORWARD), input);
  paintDown(surface(CANVAS_DOWN), input);
  paintFlat(surface(CANVAS_FLAT), input);
  paintWide(surface(CANVAS_WIDE), input);
  window.clearTimeout(beamTimer);
  beamTimer = window.setTimeout(() => {
    for (const mode of beamModes(input.eq)) {
      const canvas = surface(BEAM_CANVAS[mode]);
      const width = canvas.width;
      paintBeam(mode, canvas, { settings: input.settings, eq: input.eq, theme });
      apply(beamView(mode, width, { settings: input.settings, eq: input.eq, fmt }));
    }
  }, BEAM_DELAY_MS);
}

function render3D(): void {
  if (!scene) return;
  paintScene(surface(CANVAS_3D), scene, { scene3d: view3d, theme, fmt });
}

/** The beams of the page as it stands. */
const beamsNow = (): Beam[] => beamList(settingsNow(), names);

/** The count over each list of beams and the legend over each view. */
function writeLegend(input: ViewInput): void {
  const legend = drawnLegend(
    cmpList(input.settings, names, input.eq, ui.behind),
    beamList(input.settings, names),
    input.eq,
  );
  each("[data-cnt]", (el) => {
    el.textContent = legend.count;
  });
  each("[data-drawn]", (el) => {
    const choice = el.closest("details.sub")?.querySelector<HTMLElement>("[data-inlsel]");
    const open = choice ? !choice.hidden : null;
    el.innerHTML = `${legend.html}<button type="button" class="linkbtn" data-tosel aria-expanded="${open}">${open ? "Done" : "Change"}</button>`;
  });
}

function renderCmp(input: ViewInput): void {
  // The message alone, which no beam can keep from being worked out.
  const message = compareView({ ...input, ui: { behind: {} } })["cmp-serr"];
  if (message) apply({ "cmp-serr": message });
  if (message?.text) return;
  // One view at a time, as the earlier page writes them: a view that throws
  // leaves those before it written.
  writeLegend(input);
  apply(beamsBehindView(input));
  apply(footprintView(input));
  apply(sideView(input));
  scene = buildScene(input);
  render3D();
}

function renderDB(input: ViewInput): void {
  apply(behindView(input));
}

function renderLS(input: ViewInput): void {
  apply(lightShadowView(input));
}

// ---------------------------------------------------------------------------
// Drawing the page
// ---------------------------------------------------------------------------

let queued = false;

function schedule(): void {
  if (queued) return;
  queued = true;
  const frame =
    window.requestAnimationFrame ||
    ((callback: () => void): void => {
      window.setTimeout(callback, FRAME_FALLBACK_MS);
    });
  frame(() => {
    queued = false;
    renderAll();
  });
}

function isOpen(id: string): boolean {
  const details = $(id);
  return details instanceof HTMLDetailsElement && details.open && !details.hidden;
}

/** The card a click was in and where it stood, so that the page can be scrolled back to it. */
let anchor: { el: Element; top: number } | null = null;

function renderAll(): void {
  const input = viewInput();
  apply(settingsView(checkSettings(input.settings, input.eq)));
  each("[data-src]", (line) => {
    const field = $(line.getAttribute("data-src") ?? "");
    if (!field) return;
    line.classList.toggle(
      "mod",
      isModified(isField(field) ? field.value : "", field.getAttribute("data-def")),
    );
  });
  applyEq(input.eq);
  apply(contextView(input));
  if (isOpen("sec-ss")) renderSS(input);
  if (isOpen("sec-vs")) renderVS(input);
  if (isOpen("sec-at")) renderAT(input);
  if (isOpen("sec-cmp")) renderCmp(input);
  if (isOpen("sec-db")) renderDB(input);
  if (isOpen("sec-ls")) renderLS(input);
  if (anchor) {
    const dy = anchor.el.getBoundingClientRect().top - anchor.top;
    if (Math.abs(dy) > 0.5) window.scrollBy(0, dy);
    anchor = null;
  }
  save();
}

// ---------------------------------------------------------------------------
// The page as it loads
// ---------------------------------------------------------------------------

apply(primaryView());
fillSec();
fillLive();
restore();
fillSec();
fillLive();
restore();
buildImg();
buildLive();
restore();
setNames();

// The 3D view: the pointer turns it, the wheel and the buttons zoom it.
(() => {
  const canvas = $(CANVAS_3D);
  if (!canvas) return;
  let drag: readonly [number, number] | null = null;
  let frame = 0;
  const redraw = (): void => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      render3D();
    });
  };
  canvas.addEventListener("pointerdown", (ev) => {
    drag = [ev.clientX, ev.clientY];
    canvas.setPointerCapture(ev.pointerId);
    canvas.style.cursor = "grabbing";
  });
  canvas.addEventListener("pointermove", (ev) => {
    if (!drag) return;
    view3d = {
      ...view3d,
      yaw: view3d.yaw - (ev.clientX - drag[0]) * TURN_PER_PIXEL,
      pitch: Math.max(
        PITCH_3D.least,
        Math.min(PITCH_3D.most, view3d.pitch + (ev.clientY - drag[1]) * TURN_PER_PIXEL),
      ),
    };
    drag = [ev.clientX, ev.clientY];
    redraw();
  });
  const end = (): void => {
    drag = null;
    canvas.style.cursor = "grab";
  };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
  canvas.addEventListener(
    "wheel",
    (ev) => {
      ev.preventDefault();
      const factor = ev.deltaY < 0 ? ZOOM_3D.wheelIn : ZOOM_3D.wheelOut;
      view3d = {
        ...view3d,
        zoom: Math.max(ZOOM_3D.least, Math.min(ZOOM_3D.most, view3d.zoom * factor)),
      };
      redraw();
    },
    { passive: false },
  );
  each("[data-v3]", (button) => {
    button.addEventListener("click", () => {
      const v = button.getAttribute("data-v3") ?? "";
      if (v === "zx") {
        const zx = view3d.zx === 1 ? 2 : view3d.zx === 2 ? 4 : 1;
        view3d = { ...view3d, zx };
        button.textContent = `Stretch depth ×${zx === 4 ? 1 : zx * 2}`;
        button.setAttribute("aria-pressed", String(zx > 1));
      } else if (v === "in") {
        view3d = { ...view3d, zoom: Math.min(ZOOM_3D.most, view3d.zoom * ZOOM_3D.button) };
      } else if (v === "out") {
        view3d = { ...view3d, zoom: Math.max(ZOOM_3D.least, view3d.zoom / ZOOM_3D.button) };
      } else {
        const [yaw, pitch] = must(FIXED_VIEWS[v], `3D view ${v}`);
        view3d = { ...view3d, yaw, pitch };
      }
      redraw();
    });
  });
})();

// Data and sources.
let figures: DataRow[] = [];

/** Keeps a dialog next to the button that opened it, also when the page sits in a frame taller than the screen. */
function placeDlg(dialog: HTMLElement, near: Element): void {
  dialog.style.top = dialogTop(
    near.getBoundingClientRect().top,
    dialog.offsetHeight,
    window.innerHeight,
    screen.height,
  );
}

/** Opens a dialog next to the button that asked for it. */
function showDialog(dialog: HTMLElement | null, near: Element): void {
  if (dialog instanceof HTMLDialogElement && typeof dialog.showModal === "function") {
    dialog.showModal();
    placeDlg(dialog, near);
  }
}

function buildData(): void {
  if (!$("data-list")) return;
  const input = viewInput();
  figures = dataRows(input);
  apply(dataView(input));
  each("#data-list details.sub", (card) => {
    if (!(card instanceof HTMLDetailsElement)) return;
    const key = card.getAttribute("data-sub") ?? "";
    if (!ui.sub) ui.sub = {};
    if (ui.sub[key] === true) card.open = true;
    card.addEventListener("toggle", () => {
      ui.sub[key] = card.open;
      save();
    });
  });
}

document.addEventListener("click", (ev) => {
  const button = hit(ev, "[data-dispute]");
  if (!button) return;
  const figure = dataRowAt(figures, button.getAttribute("data-dispute") ?? "");
  if (!figure) return;
  apply(disputeView(figure));
  showDialog($(figure.noDispute ? "nod-dlg" : "dsp-dlg"), button);
});

// The help pictures.
helpReady = true;

document.addEventListener(
  "click",
  (ev) => {
    const button = hit(ev, "[data-hdat]");
    if (!button) return;
    ev.preventDefault();
    ev.stopPropagation();
    const figure = dataRowAt(figures, button.getAttribute("data-hdat") ?? "");
    const view = figure && figureHelpView(viewInput(), figure);
    if (!view) return;
    apply(view);
    showDialog($("help-dlg"), button);
  },
  true,
);

document.addEventListener(
  "click",
  (ev) => {
    const button = hit(ev, "[data-help]");
    if (!button) return;
    ev.preventDefault();
    ev.stopPropagation();
    const label = must(button.parentNode, "label around the help button").cloneNode(true);
    if (label instanceof Element) label.querySelector(".qm")?.remove();
    const view = settingHelpView(
      viewInput(),
      button.getAttribute("data-help") ?? "",
      label.textContent ?? "",
    );
    if (!view) return;
    apply(view);
    showDialog($("help-dlg"), button);
  },
  true,
);

// The wiring.
document.addEventListener(
  "click",
  (ev) => {
    const target = hit(ev, ".tog, [data-setall], [data-tosel]");
    const card = target && (target.closest("[data-inlsel]") || target.closest("details.sub"));
    if (card) anchor = { el: card, top: card.getBoundingClientRect().top };
  },
  true,
);

/** A row of buttons that chooses one value of the view state. */
function seg(id: string, key: ChoiceKey): void {
  const wrap = must($(id), `row of buttons ${id}`);
  const sync = (): void => {
    for (const button of Array.from(wrap.children)) {
      button.setAttribute(
        "aria-pressed",
        String(button.getAttribute("data-v") === String(ui[key])),
      );
    }
  };
  wrap.addEventListener("click", (ev) => {
    const button = hit(ev, "button[data-v]");
    if (!button) return;
    ui[key] = button.getAttribute("data-v") ?? "";
    sync();
    schedule();
  });
  sync();
}
seg("ssmode", "ssMode");
seg("ssf", "ssf");
seg("f2d", "f2d");
seg("fds", "fds");
seg("dbt", "db");
seg("lsb", "lsB");
seg("lsa", "lsA");

/** The chips of the beams, in one of the places that hold them. */
function fillChips(wrap: Element, beams: readonly Beam[]): void {
  wrap.innerHTML = "";
  for (const group of chipGroups(names, beams, ui.behind)) {
    const box = document.createElement("div");
    box.className = "bgrp";
    box.setAttribute("data-eq", group.eq);
    box.innerHTML = `<p class="bgrp-h">${group.heading}</p>`;
    const row = document.createElement("div");
    row.className = "chips";
    box.appendChild(row);
    for (const item of group.items) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tog";
      if (item.eq !== null) button.setAttribute("data-eq", item.eq);
      button.style.setProperty("--c", item.colour);
      button.innerHTML = item.html;
      button.setAttribute("aria-pressed", item.pressed ? "true" : "false");
      button.setAttribute("data-bid", item.id);
      button.addEventListener("click", () => {
        ui.behind[item.id] = !ui.behind[item.id];
        each(`.tog[data-bid="${item.id}"]`, (other) => {
          other.setAttribute("aria-pressed", ui.behind[item.id] ? "true" : "false");
        });
        schedule();
      });
      row.appendChild(button);
    }
    wrap.appendChild(box);
  }
}

function buildChips(): void {
  const beams = beamsNow();
  const defaults = chipDefaults(beams, ui.behind, ui.fp);
  ui.behind = defaults.behind;
  ui.fp = defaults.fp;
  each("[data-chipwrap]", (wrap) => {
    if (wrap.offsetParent !== null || wrap.id === "allb-chips") fillChips(wrap, beams);
  });
}

document.addEventListener(
  "click",
  (ev) => {
    const target = hit(ev, "[data-secall], [data-all]");
    if (!target) return;
    ev.preventDefault();
    ev.stopPropagation();
    const set = (details: Element, open: boolean): void => {
      if (details instanceof HTMLDetailsElement) details.open = open;
    };
    if (target.hasAttribute("data-all")) {
      const on = target.getAttribute("data-all") === "1";
      each("details.sub", (card) => {
        if (!(on && card.hasAttribute("data-guard"))) set(card, on);
      });
      each("details.sec", (section) => set(section, on));
    } else {
      const section = must(target.closest("details.sec"), "section around the button");
      const on = target.getAttribute("data-secall") === "1";
      if (on) set(section, true);
      for (const card of Array.from(section.querySelectorAll("details.sub"))) {
        if (!(on && card.hasAttribute("data-guard"))) set(card, on);
      }
    }
  },
  true,
);

document.addEventListener("click", (ev) => {
  const target = hit(ev, "[data-tosel]");
  if (!target) return;
  const card = must(target.closest("details.sub"), "card around the button");
  const choice = must(card.querySelector<HTMLElement>("[data-inlsel]"), "choice of beams");
  const picture = card.querySelector("svg.fig, #b3d");
  if (picture && picture.nextElementSibling !== choice) {
    must(picture.parentNode, "parent of the picture").insertBefore(choice, picture.nextSibling);
  }
  choice.hidden = !choice.hidden;
  target.textContent = choice.hidden ? "Change" : "Done";
  target.setAttribute("aria-expanded", String(!choice.hidden));
  if (!choice.hidden) {
    fillChips(must(choice.querySelector("[data-chipwrap]"), "place for the chips"), beamsNow());
  }
  applyEq(equipmentNow());
});

each("details.sub", (card) => {
  if (!(card instanceof HTMLDetailsElement)) return;
  const key = card.getAttribute("data-sub") ?? "";
  if (!ui.sub) ui.sub = {};
  if (ui.sub[key] === false || card.hasAttribute("data-guard")) card.open = false;
  card.addEventListener("toggle", () => {
    ui.sub[key] = card.open;
    if (card.open) schedule();
    else save();
  });
});

document.addEventListener("click", (ev) => {
  const button = hit(ev, "[data-copy]");
  if (!button) return;
  ev.preventDefault();
  const text = button.getAttribute("data-copy") ?? "";
  const label = button.getAttribute("data-lab") || (button.textContent ?? "");
  button.setAttribute("data-lab", label);
  const done = (ok: boolean): void => {
    if (ok) button.textContent = "Copied";
    else {
      button.textContent = label === "Copy address" ? "Select and copy the address" : "Copy failed";
    }
    setTimeout(() => {
      button.textContent = label;
    }, COPY_NOTE_MS);
  };
  const fallback = (): void => {
    try {
      const field = document.createElement("textarea");
      field.value = text;
      field.setAttribute("readonly", "");
      field.style.position = "fixed";
      field.style.opacity = "0";
      must(button.parentNode, "parent of the copy button").appendChild(field);
      field.select();
      const ok = document.execCommand("copy");
      field.remove();
      done(ok);
    } catch {
      done(false);
    }
  };
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(() => done(true), fallback);
  } else fallback();
});

buildChips();
buildData();
addQM();

// The beam angles ask before they open.
(() => {
  const dialog = $("ang-dlg");
  each("details.sub[data-guard]", (card) => {
    if (!(card instanceof HTMLDetailsElement)) return;
    const summary = must(card.querySelector<HTMLElement>("summary"), "heading of the card");
    summary.addEventListener("click", (ev) => {
      if (card.open) return;
      ev.preventDefault();
      if (dialog instanceof HTMLDialogElement && typeof dialog.showModal === "function") {
        dialog.returnValue = "";
        dialog.onclose = () => {
          if (dialog.returnValue === "ok") card.open = true;
          summary.focus();
        };
        dialog.showModal();
        placeDlg(dialog, summary);
        dialog.querySelector<HTMLElement>(".dlg-ok")?.blur();
      } else card.open = true;
    });
  });
})();

function setAllBeams(on: boolean): void {
  const eq = equipmentNow();
  for (const beam of beamsNow()) if (eq[beam.eq]) ui.behind[beam.id] = on;
  buildChips();
  schedule();
}

document.addEventListener("click", (ev) => {
  const target = hit(ev, "[data-setall]");
  if (target) setAllBeams(target.getAttribute("data-setall") === "1");
});

// The depths of the error graph: each is shown or hidden.
(() => {
  const wrap = must($("err-chips"), "chips of the error graph");
  wrap.innerHTML = "";
  ERR_DEPTHS.forEach((depth, i) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip";
    button.innerHTML = `<span class="sq" style="background:var(--s${i + 1})"></span>${depth} m`;
    const sync = (): void => {
      button.setAttribute("aria-pressed", ui.errOn[depth] ? "true" : "false");
    };
    sync();
    button.addEventListener("click", () => {
      ui.errOn[depth] = !ui.errOn[depth];
      sync();
      schedule();
    });
    wrap.appendChild(button);
  });
})();

// The depth of the relative-error graph: one is chosen.
(() => {
  const wrap = must($("rel-chips"), "chips of the relative-error graph");
  const sync = (): void => {
    Array.from(wrap.children).forEach((chip, i) => {
      chip.setAttribute("aria-pressed", String(ERR_DEPTHS[i] === Number(ui.relDepth)));
    });
  };
  ERR_DEPTHS.forEach((depth, i) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip";
    button.innerHTML = `<span class="sq" style="background:var(--s${i + 1})"></span>${depth} m`;
    button.addEventListener("click", () => {
      ui.relDepth = depth;
      sync();
      schedule();
    });
    wrap.appendChild(button);
  });
  sync();
})();

each(".stepper button", (button) => {
  button.addEventListener("click", () => {
    const id = button.getAttribute("data-for") ?? "";
    let current = num(textOf(id));
    if (!Number.isFinite(current)) current = 0;
    const step = Number.parseFloat(button.getAttribute("data-step") ?? "");
    const field = must($(id), `field ${id}`);
    if (isField(field)) {
      field.value = fmt
        .num(Math.max(0, Math.round((current + step) * 10) / 10), 1)
        .replace(/[.,]0$/, "");
    }
    schedule();
  });
});

document.addEventListener("input", (ev) => {
  if (ev.target instanceof Element && ev.target.matches("input, select")) schedule();
});
document.addEventListener("change", (ev) => {
  if (ev.target instanceof Element && ev.target.matches("select, input[type=checkbox]")) schedule();
});
document.addEventListener("click", (ev) => {
  if (!hit(ev, "[data-goto]")) return;
  const settings = must($("sec-set"), "Settings");
  if (settings instanceof HTMLDetailsElement) settings.open = true;
  settings.scrollIntoView({ behavior: "smooth", block: "start" });
});
must($("ang-reset"), "reset button").addEventListener("click", () => {
  each("#ang-img [data-def], #ang-live [data-def]", (el) => {
    if (isField(el)) el.value = el.getAttribute("data-def") ?? "";
  });
  schedule();
});
must($("img-p"), "choice of transducer").addEventListener("change", () => {
  fillSec();
  fillLive();
  buildImg();
  buildLive();
  setNames();
  buildChips();
  buildData();
  schedule();
});
must($("img-s"), "choice of second transducer").addEventListener("change", () => {
  buildImg();
  buildChips();
  buildData();
  schedule();
});
must($("live-p"), "choice of live sonar").addEventListener("change", () => {
  buildLive();
  setNames();
  buildChips();
  buildData();
  schedule();
});

// The stopwatch.
(() => {
  let started: number | null = null;
  let ticking: number | undefined;
  const button = must($("sw-btn"), "stopwatch button");
  const shown = must($("sw-out"), "stopwatch time");
  button.addEventListener("click", () => {
    if (started === null) {
      const from = Date.now();
      started = from;
      button.textContent = "Stop";
      button.setAttribute("aria-pressed", "true");
      ticking = window.setInterval(() => {
        shown.textContent = `${fmt.num((Date.now() - from) / 1000, 1)} s`;
      }, STOPWATCH_TICK_MS);
    } else {
      window.clearInterval(ticking);
      const seconds = (Date.now() - started) / 1000;
      started = null;
      button.textContent = "Start stopwatch";
      button.setAttribute("aria-pressed", "false");
      shown.textContent = `measured ${fmt.num(seconds, 1)} s`;
      const field = $("tscr");
      if (isField(field)) field.value = fmt.num(seconds, 1);
      schedule();
    }
  });
})();

each("details.sec", (section) => {
  if (!(section instanceof HTMLDetailsElement)) return;
  const key = section.getAttribute("data-sec") ?? "";
  section.open = !!ui.open[key];
  section.addEventListener("toggle", () => {
    ui.open[key] = section.open;
    if (section.open) schedule();
    else save();
  });
});

renderAll();
