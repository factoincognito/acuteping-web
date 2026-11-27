/**
 * Every expected value below is what the earlier page's own lines leave
 * (legacy/src/p2.js lines 26 to 40, 223 to 232 and the `ui.sub` statement of
 * lines 1548 and 1895), run in Node with a storage that holds the value named
 * in the test. Two recordings in fixtures/legacy are read as well: the state
 * the earlier page itself saved, and the state a first visitor gets.
 */
import defaults from "../fixtures/legacy/defaults/light/page.json";
import savedByPage from "../fixtures/legacy/saved-by-page/light/page.json";
import { loadState, restoreField, STORAGE_KEY, saveState, UI_DEFAULTS } from "./state";
import type { SavedField, StateStorage } from "./types";

interface TestStorage extends StateStorage {
  readonly asked: string[];
  readonly writes: [string, string][];
}

/** A storage that holds one value under the page's key and records what is asked of it. */
function storageWith(value: string | null): TestStorage {
  const asked: string[] = [];
  const writes: [string, string][] = [];
  return {
    asked,
    writes,
    getItem(key) {
      asked.push(key);
      return key === "sonar-geometry" ? value : null;
    },
    setItem(key, written) {
      writes.push([key, written]);
    },
  };
}

const ERR_ON = '"errOn":{"1":true,"3":true,"5":true,"8":true,"10":true}';
const BEHIND =
  '"behind":{"side0":true,"side1":false,"side2":false,"cone0":true,"cone1":true,"down0":true,"down1":true,"down2":true,"live":true,"livel":true}';
const FP =
  '"fp":{"cone0":true,"cone1":true,"down0":true,"down1":true,"down2":false,"live":false,"livel":false}';
/** The defaults after `open`, in the order the earlier page sets them. */
const AFTER_OPEN = `"lsB":"rock","lsA":"low","ssMode":"bottom","ssf":"0","f2d":"0","fds":"0","db":"ss","relDepth":5,${ERR_ON},${BEHIND},${FP}`;
const DEFAULT_STATE = `{"v":{},"ui":{"open":{"set":true},${AFTER_OPEN},"sub":{}}}`;

describe("the storage key and the defaults", () => {
  it("keeps the key of the earlier page, so that its saved settings still load", () => {
    expect(STORAGE_KEY).toBe("sonar-geometry");
  });

  it("has the defaults of the earlier page", () => {
    expect(UI_DEFAULTS).toEqual({
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
    });
  });
});

describe("loadState: nothing usable is saved", () => {
  it("gives the defaults, with an empty `ui.sub`, when nothing is saved", () => {
    const storage = storageWith(null);
    expect(JSON.stringify(loadState(storage))).toBe(DEFAULT_STATE);
    expect(storage.asked).toEqual(["sonar-geometry"]);
    expect(storage.writes).toEqual([]);
  });

  it("gives the defaults when the storage is not available (getItem throws)", () => {
    const storage: StateStorage = {
      getItem() {
        throw new Error("storage is not available");
      },
      setItem() {},
    };
    expect(JSON.stringify(loadState(storage))).toBe(DEFAULT_STATE);
  });

  it("gives the defaults when the saved text is not JSON", () => {
    expect(JSON.stringify(loadState(storageWith("{oops")))).toBe(DEFAULT_STATE);
  });

  it.each([
    ["an empty string", ""],
    ["null", "null"],
    ["a number", "5"],
    ["a string", '"abc"'],
    ["true", "true"],
    ["an array", "[]"],
    ["an empty object", "{}"],
    ["0 for v and null for ui", '{"v":0,"ui":null}'],
    ["an empty string for v and false for ui", '{"v":"","ui":false}'],
  ])("gives the defaults when the saved JSON is %s", (_name, saved) => {
    expect(JSON.stringify(loadState(storageWith(saved)))).toBe(DEFAULT_STATE);
  });

  it("gives each call a state of its own and leaves the defaults as they are", () => {
    const first = loadState(storageWith(null));
    first.ui.open.set = false;
    first.ui.behind.side0 = false;
    first.ui.sub.x = true;
    first.v.dep = "1";
    expect(JSON.stringify(loadState(storageWith(null)))).toBe(DEFAULT_STATE);
    expect(UI_DEFAULTS.open).toEqual({ set: true });
    expect(UI_DEFAULTS.behind.side0).toBe(true);
  });
});

describe("loadState: a saved state", () => {
  it("keeps what is saved, in its order, and adds only the defaults that are missing", () => {
    const saved =
      '{"v":{"dep":"12"},"ui":{"open":{"ls":true},"errOn":{"3":false},"relDepth":10,"behind":"x","lsB":null,"fp":{"cone0":false,"extra":true},"ssf":"2","sub":{"sim-h":false}}}';
    expect(JSON.stringify(loadState(storageWith(saved)))).toBe(
      `{"v":{"dep":"12"},"ui":{"open":{"ls":true,"set":true},"errOn":{"1":true,"3":false,"5":true,"8":true,"10":true},"relDepth":10,${BEHIND},"lsB":null,"fp":{"cone0":false,"extra":true,"cone1":true,"down0":true,"down1":true,"down2":false,"live":false,"livel":false},"ssf":"2","sub":{"sim-h":false},"lsA":"low","ssMode":"bottom","f2d":"0","fds":"0","db":"ss"}}`,
    );
  });

  it("keeps Settings closed when it was saved closed", () => {
    const state = loadState(storageWith('{"v":{},"ui":{"open":{"set":false}}}'));
    expect(JSON.stringify(state)).toBe(
      `{"v":{},"ui":{"open":{"set":false},${AFTER_OPEN},"sub":{}}}`,
    );
  });

  it("replaces a saved `ui.sub` only when it is falsy, unlike the other defaults", () => {
    expect(JSON.stringify(loadState(storageWith('{"v":{},"ui":{"sub":null}}')))).toBe(
      `{"v":{},"ui":{"sub":{},"open":{"set":true},${AFTER_OPEN}}}`,
    );
    expect(JSON.stringify(loadState(storageWith('{"v":{},"ui":{"sub":"x"}}')))).toBe(
      `{"v":{},"ui":{"sub":"x","open":{"set":true},${AFTER_OPEN}}}`,
    );
  });

  it("still takes an array saved for a group inside `ui` as the earlier page does", () => {
    expect(JSON.stringify(loadState(storageWith('{"v":{},"ui":{"open":[1]}}')))).toBe(
      `{"v":{},"ui":{"open":[1],${AFTER_OPEN},"sub":{}}}`,
    );
  });

  it("keeps the entries of `v` as they are saved, whatever they are", () => {
    const saved = '{"v":{"dep":5,"sog":null,"eq-at":"false","x":[1],"y":{"z":true}},"ui":{}}';
    expect(JSON.stringify(loadState(storageWith(saved)))).toBe(
      `{"v":{"dep":5,"sog":null,"eq-at":"false","x":[1],"y":{"z":true}},"ui":{"open":{"set":true},${AFTER_OPEN},"sub":{}}}`,
    );
  });

  it("loads a state the earlier page saved exactly as it was saved", () => {
    const { seed, ui } = savedByPage.scenario;
    const state = loadState(storageWith(JSON.stringify(seed)));
    expect(JSON.stringify(state)).toBe(JSON.stringify(seed));
    // What the recording says the earlier page had as `ui` after it loaded this state.
    expect(state.ui).toEqual(ui);
  });

  it("starts a first visitor with what the recording of the earlier page shows", () => {
    expect(defaults.scenario.seed).toBeNull();
    const { sub: _sub, ...fromDefaults } = loadState(storageWith(null)).ui;
    // The recording also holds the keys the chips and the cards add later.
    expect(defaults.scenario.ui).toMatchObject(fromDefaults);
  });
});

// The guard of the specification's 2.4. The earlier page has no result to
// compare with here: it stops with a TypeError for most of these, and takes an
// array as it is. The expected values are the defaults, as 2.4 says.
describe("loadState: a corrupted saved state starts from the defaults", () => {
  /** Everything JSON can hold in place of an object of fields. */
  const NOT_AN_OBJECT: [string, string][] = [
    ["an array", '["a"]'],
    ["an empty array", "[]"],
    ["null", "null"],
    ["a number", "5"],
    ["0", "0"],
    ["a string", '"abc"'],
    ["an empty string", '""'],
    ["true", "true"],
    ["false", "false"],
  ];
  const SAVED_V = '{"dep":"12","eq-at":false}';
  const SAVED_UI = '{"open":{"set":false,"ss":true},"db":"vs"}';
  /** What `SAVED_UI` loads as: what is saved, then the defaults it lacks. */
  const LOADED_UI = `{"open":{"set":false,"ss":true},"db":"vs","lsB":"rock","lsA":"low","ssMode":"bottom","ssf":"0","f2d":"0","fds":"0","relDepth":5,${ERR_ON},${BEHIND},${FP},"sub":{}}`;
  const DEFAULT_UI = `{"open":{"set":true},${AFTER_OPEN},"sub":{}}`;

  it("loads the valid state these tests damage as it is saved", () => {
    const state = loadState(storageWith(`{"v":${SAVED_V},"ui":${SAVED_UI}}`));
    expect(JSON.stringify(state)).toBe(`{"v":${SAVED_V},"ui":${LOADED_UI}}`);
  });

  it.each(NOT_AN_OBJECT)(
    "replaces %s as `v` by no saved fields and keeps the saved `ui`",
    (_name, bad) => {
      const state = loadState(storageWith(`{"v":${bad},"ui":${SAVED_UI}}`));
      expect(JSON.stringify(state)).toBe(`{"v":{},"ui":${LOADED_UI}}`);
      expect(Array.isArray(state.v)).toBe(false);
    },
  );

  it.each(NOT_AN_OBJECT)(
    "replaces %s as `ui` by the defaults and keeps the saved `v`",
    (_name, bad) => {
      const state = loadState(storageWith(`{"v":${SAVED_V},"ui":${bad}}`));
      expect(JSON.stringify(state)).toBe(`{"v":${SAVED_V},"ui":${DEFAULT_UI}}`);
      expect(Array.isArray(state.ui)).toBe(false);
    },
  );

  it.each(NOT_AN_OBJECT)("gives the defaults for %s as both `v` and `ui`", (_name, bad) => {
    expect(JSON.stringify(loadState(storageWith(`{"v":${bad},"ui":${bad}}`)))).toBe(DEFAULT_STATE);
  });

  it.each([
    ["a string as `v` and an array as `ui`", '{"v":"abc","ui":[1,2]}'],
    ["an array as `v` and a number as `ui`", '{"v":["a"],"ui":5}'],
    ["true as `v` and a string as `ui`", '{"v":true,"ui":"abc"}'],
  ])("gives the defaults for %s", (_name, saved) => {
    expect(JSON.stringify(loadState(storageWith(saved)))).toBe(DEFAULT_STATE);
  });

  it.each(NOT_AN_OBJECT)(
    "leaves every field as it is after %s as `v`: restoring does not throw",
    (_name, bad) => {
      const state = loadState(storageWith(`{"v":${bad},"ui":{}}`));
      expect(restoreField(state.v, "dep", false)).toBeUndefined();
      expect(restoreField(state.v, "0", false)).toBeUndefined();
      expect(restoreField(state.v, "eq-at", true)).toBeUndefined();
    },
  );

  it("saves a state of the right shape again after a corrupted one", () => {
    const storage = storageWith('{"v":["a"],"ui":"abc"}');
    const state = loadState(storage);
    saveState(storage, state, [{ id: "dep", value: "7,5" }]);
    expect(storage.writes).toEqual([["sonar-geometry", `{"v":{"dep":"7,5"},"ui":${DEFAULT_UI}}`]]);
  });

  it("gives each corrupted load a state of its own", () => {
    const first = loadState(storageWith('{"v":5,"ui":"abc"}'));
    first.v.dep = "1";
    first.ui.open.set = false;
    expect(JSON.stringify(loadState(storageWith('{"v":5,"ui":"abc"}')))).toBe(DEFAULT_STATE);
  });
});

describe("restoreField: what a saved value writes to its field", () => {
  it.each([
    ["a saved text", { dep: "12.5" }, "dep", { value: "12.5" }],
    ["a saved choice", { sogu: "kmh" }, "sogu", { value: "kmh" }],
    ["a saved 0", { dep: 0 }, "dep", { value: "0" }],
    ["a saved false", { dep: false }, "dep", { value: "false" }],
    ["a saved true", { dep: true }, "dep", { value: "true" }],
  ])("writes the value for %s", (_name, v, id, expected) => {
    expect(restoreField(v, id, false)).toEqual(expected);
  });

  it.each([
    ["an empty text", { dep: "" }],
    ["null", { dep: null }],
    ["nothing saved for the field", {}],
  ])("leaves a text field or a select as it is for %s", (_name, v) => {
    expect(restoreField(v, "dep", false)).toBeUndefined();
  });

  it.each([
    ["false", { "eq-at": false }, false],
    ["true", { "eq-at": true }, true],
    ["an empty text", { "eq-at": "" }, false],
    ["the text false", { "eq-at": "false" }, true],
    ["null", { "eq-at": null }, false],
  ])("ticks or unticks a tick box for a saved %s", (_name, v, checked) => {
    expect(restoreField(v, "eq-at", true)).toEqual({ checked });
  });

  it("leaves a tick box as it is when nothing is saved for it", () => {
    expect(restoreField({}, "eq-at", true)).toBeUndefined();
  });

  it("looks the id up with `in`, so a name every object has counts as saved (line 225)", () => {
    expect(restoreField({}, "toString", true)).toEqual({ checked: true });
  });

  it("gives every field of the state the earlier page saved the value the recording shows", () => {
    const { seed, fields } = savedByPage.scenario;
    const recorded: Record<string, string | boolean> = fields;
    const ids = Object.keys(seed.v);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      const now = recorded[id];
      const expected = typeof now === "boolean" ? { checked: now } : { value: now };
      expect([id, restoreField(seed.v, id, typeof now === "boolean")]).toEqual([id, expected]);
    }
  });
});

describe("saveState: what goes into the storage", () => {
  const fields: SavedField[] = [
    { id: "dep", value: "7,5" },
    { id: "eq-at", value: false },
    { id: "sogu", value: "kmh" },
  ];

  it("writes the fields over the saved values, keeps the others, and saves under the key", () => {
    const storage = storageWith(
      '{"v":{"old":"kept","dep":"10"},"ui":{"open":{"set":true,"ss":true}}}',
    );
    const state = loadState(storage);
    saveState(storage, state, fields);
    expect(storage.writes).toEqual([
      [
        "sonar-geometry",
        `{"v":{"old":"kept","dep":"7,5","eq-at":false,"sogu":"kmh"},"ui":{"open":{"set":true,"ss":true},${AFTER_OPEN},"sub":{}}}`,
      ],
    ]);
    expect(state.v).toEqual({ old: "kept", dep: "7,5", "eq-at": false, sogu: "kmh" });
  });

  it("saves the defaults for a first visitor with no field", () => {
    const storage = storageWith(null);
    saveState(storage, loadState(storage), []);
    expect(storage.writes).toEqual([["sonar-geometry", DEFAULT_STATE]]);
  });

  it("does not throw when the storage refuses the write, and still has the fields in the state", () => {
    const storage: StateStorage = {
      getItem: () => null,
      setItem() {
        throw new Error("quota");
      },
    };
    const state = loadState(storage);
    expect(() => saveState(storage, state, fields)).not.toThrow();
    expect(state.v).toEqual({ dep: "7,5", "eq-at": false, sogu: "kmh" });
  });

  it("loads again what it saved", () => {
    const first = storageWith('{"v":{"dep":"10"},"ui":{"open":{"ss":true},"db":"vs"}}');
    const state = loadState(first);
    state.ui.sub["sim-h"] = false;
    saveState(first, state, fields);
    const written = first.writes[0]?.[1] ?? null;
    expect(written).not.toBeNull();
    expect(JSON.stringify(loadState(storageWith(written)))).toBe(written);
  });
});
