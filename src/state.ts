/**
 * The saved state of the page: its key, its defaults, loading, restoring a
 * field and saving (the earlier page's lines 25 to 40 and 223 to 232). The
 * storage is passed in, so nothing here touches `localStorage`; the shell
 * passes an object whose `getItem` and `setItem` call it, so that a storage
 * that cannot even be reached fails inside the calls, where it is caught.
 */
import type { FieldRestore, SavedField, SavedState, StateStorage, UiState } from "./types";

/** The storage key of the earlier page, kept so that what a visitor saved with it still loads. */
export const STORAGE_KEY = "sonar-geometry";

/**
 * The view state of a first visitor, in the order the earlier page sets it
 * (lines 34 to 40). `ui.sub` is not among them: it has a rule of its own, see
 * `loadState`.
 */
export const UI_DEFAULTS: Readonly<Omit<UiState, "sub">> = {
  open: { set: true },
  lsB: "rock",
  lsA: "low",
  ssMode: "bottom",
  ssf: "0",
  f2d: "0",
  fds: "0",
  db: "ss",
  relDepth: 5,
  errOn: { 1: true, 3: true, 5: true, 8: true, 10: true },
  behind: {
    side0: true,
    side1: false,
    side2: false,
    cone0: true,
    cone1: true,
    down0: true,
    down1: true,
    down2: true,
    live: true,
    livel: true,
  },
  fp: {
    cone0: true,
    cone1: true,
    down0: true,
    down1: true,
    down2: false,
    live: false,
    livel: false,
  },
};

/** What was read from the storage, before anything is known about its shape. */
type Loose = Record<string, unknown>;

/**
 * Line 30 to 33: a default that is a group fills in the entries the saved
 * group lacks, after replacing a saved value that is no group by an empty one;
 * any other default is used only when nothing at all is saved for the key.
 */
function applyDefault(ui: Loose, key: string, value: unknown): void {
  if (value && typeof value === "object") {
    if (!ui[key] || typeof ui[key] !== "object") ui[key] = {};
    const group = ui[key] as Loose;
    for (const [name, entry] of Object.entries(value)) {
      if (group[name] === undefined) group[name] = entry;
    }
  } else if (ui[key] === undefined) {
    ui[key] = value;
  }
}

/** Whether a value is an object of entries: not null, not an array, and not text, a number or a truth value. */
function isRecord(value: unknown): value is Loose {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The saved state, or the defaults where nothing usable is saved. A storage
 * that throws and a saved text that is not JSON both give the defaults.
 *
 * As the earlier page loads it (line 28), with the guard of the
 * specification's 2.4: a saved `v` or `ui` that is not an object of entries
 * (an array, text, a number, a truth value, null) is replaced by an empty
 * one, so the page starts from its defaults where the earlier page stops with
 * a TypeError or takes an array as it is. So `v` and `ui` of the result are
 * always objects of entries. What their entries hold is not checked: it is
 * kept as it was saved.
 */
export function loadState(storage: StateStorage): SavedState {
  let v: Loose = {};
  let ui: Loose = {};
  try {
    const loaded: unknown = JSON.parse(storage.getItem(STORAGE_KEY) || "null");
    if (loaded && typeof loaded === "object") {
      const saved = loaded as { v?: unknown; ui?: unknown };
      if (isRecord(saved.v)) v = saved.v;
      if (isRecord(saved.ui)) ui = saved.ui;
    }
  } catch {
    // No storage, or no JSON in it: start from the defaults.
  }
  for (const [key, value] of Object.entries(UI_DEFAULTS)) applyDefault(ui, key, value);
  // Lines 1548 and 1895: only a missing or falsy `sub` is replaced.
  if (!ui.sub) ui.sub = {};
  // Checked above: `v` and `ui` are objects of entries. Asserted here, not
  // checked: that the entries are of the declared types; they are taken as saved.
  return { v: v as SavedState["v"], ui: ui as Loose & UiState };
}

/**
 * What a saved value writes to its field when the page starts (lines 225 and
 * 226): a tick box is ticked for any truthy value; another field takes the
 * value as text unless it is empty or null; a field with nothing saved under
 * its id is left as it is (undefined).
 */
export function restoreField(
  v: Readonly<Record<string, unknown>>,
  id: string,
  checkbox: boolean,
): FieldRestore | undefined {
  if (!(id in v)) return undefined;
  const saved = v[id];
  if (checkbox) return { checked: !!saved };
  return saved != null && saved !== "" ? { value: String(saved) } : undefined;
}

/**
 * Takes the fields into the state and writes the state to the storage (line
 * 231). A storage that refuses the write is ignored, as on the earlier page.
 */
export function saveState(
  storage: StateStorage,
  state: SavedState,
  fields: Iterable<SavedField>,
): void {
  try {
    for (const field of fields) state.v[field.id] = field.value;
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // The page works without its storage.
  }
}
