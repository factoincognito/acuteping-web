/**
 * No import cycle in `src/` (docs/SPEC.md 2.2): this test reads every `import`
 * and `export … from` statement of `src/*.ts`, a type-only one included, and
 * fails when the files they name form a cycle.
 */

// The project's TypeScript does not load the Node types (tsconfig `types`), so
// the two things this test needs from Node are described here.
declare const __dirname: string;
interface FileSystem {
  readdirSync(path: string): string[];
  readFileSync(path: string, encoding: "utf8"): string;
}
const { readdirSync, readFileSync } = jest.requireActual<FileSystem>("node:fs");

/** Which files each file imports, by file name. */
type Graph = ReadonlyMap<string, readonly string[]>;

// A statement that starts a line with `import` or `export` and names its source
// after `from`, on that line or, when the formatter has wrapped it, a later one.
const FROM = /^[ \t]*(?:import|export)\b[^;'"`]*?\bfrom\s*(["'])([^"'\n]+)\1/gm;
// An import for its effect only: `import "./x";`.
const BARE = /^[ \t]*import\s*(["'])([^"'\n]+)\1/gm;
const TS_FILE = /\.ts$/;

/** The module names a source imports or re-exports from, in the order they stand. */
function specifiers(source: string): string[] {
  const found: [number, string][] = [];
  for (const pattern of [FROM, BARE]) {
    for (const match of source.matchAll(pattern)) {
      const name = match[2];
      if (name !== undefined) found.push([match.index, name]);
    }
  }
  return found.sort((a, b) => a[0] - b[0]).map(([, name]) => name);
}

/**
 * The file of the set that a specifier names, or undefined: a package, a file
 * that is not TypeScript (a style sheet, a fixture) and a file outside the set
 * are no edge of the graph.
 */
function target(specifier: string, files: ReadonlySet<string>): string | undefined {
  if (!specifier.startsWith("./")) return undefined;
  const name = specifier.slice(2);
  if (files.has(`${name}.ts`)) return `${name}.ts`;
  return TS_FILE.test(name) && files.has(name) ? name : undefined;
}

/** The import graph of a set of sources, by file name. */
function graphOf(sources: Readonly<Record<string, string>>): Graph {
  const files = new Set(Object.keys(sources));
  const graph = new Map<string, string[]>();
  for (const [file, source] of Object.entries(sources)) {
    const targets = new Set<string>();
    for (const specifier of specifiers(source)) {
      const to = target(specifier, files);
      if (to !== undefined) targets.add(to);
    }
    graph.set(file, [...targets]);
  }
  return graph;
}

/** One cycle of the graph as the files on it, the first repeated at the end, or null. */
function findCycle(graph: Graph): string[] | null {
  const done = new Set<string>();
  const path: string[] = [];
  const visit = (file: string): string[] | null => {
    const at = path.indexOf(file);
    if (at !== -1) return [...path.slice(at), file];
    if (done.has(file)) return null;
    path.push(file);
    for (const next of graph.get(file) ?? []) {
      const cycle = visit(next);
      if (cycle) return cycle;
    }
    path.pop();
    done.add(file);
    return null;
  };
  for (const file of graph.keys()) {
    const cycle = visit(file);
    if (cycle) return cycle;
  }
  return null;
}

/** A sample source: its lines, joined. Written as strings so that this file's own scan skips them. */
const lines = (...text: string[]): string => text.join("\n");

describe("specifiers: the modules a source names", () => {
  it("reads an import, a type-only import, an export from and an import for its effect", () => {
    const source = lines(
      'import { a } from "./a";',
      "import type { B } from './b';",
      'import c, { type C } from "./c";',
      'import * as d from "./d";',
      'export { e } from "./e";',
      'export type { F } from "./f";',
      'export * from "./g";',
      'import "./style.css";',
      'import { readFileSync } from "node:fs";',
    );
    expect(specifiers(source)).toEqual([
      "./a",
      "./b",
      "./c",
      "./d",
      "./e",
      "./f",
      "./g",
      "./style.css",
      "node:fs",
    ]);
  });

  it("reads an import the formatter has wrapped over several lines", () => {
    const source = lines(
      "import {",
      "  createFormatter,",
      "  type Wrapped,",
      "  niceRange,",
      '} from "./format";',
      "export {",
      "  one,",
      "  two,",
      '} from "./numbers";',
    );
    expect(specifiers(source)).toEqual(["./format", "./numbers"]);
  });

  it("does not take text inside code for an import", () => {
    const source = lines(
      "export const from = 1;",
      "export const text = \"import { a } from './a'\";",
      "export function f(): string {",
      '  return "./b";',
      "}",
      '// import { c } from "./c";',
      'const d = { from: "./d" };',
    );
    expect(specifiers(source)).toEqual([]);
  });
});

describe("graphOf: which files of the set a file imports", () => {
  it("names a file with or without its extension and skips what is no file of the set", () => {
    const graph = graphOf({
      "a.ts": lines(
        'import { b } from "./b";',
        'import { c } from "./c.ts";',
        'import "./style.css";',
        'import page from "../fixtures/page.json";',
        'import { readFileSync } from "node:fs";',
        'import { gone } from "./gone";',
        'import { b as again } from "./b";',
      ),
      "b.ts": "export const b = 1;",
      "b.test.ts": lines('import { b } from "./b";', 'import { helper } from "./c.test";'),
      "c.ts": "export const c = 1;",
      "c.test.ts": "export const helper = 1;",
    });
    expect([...graph]).toEqual([
      ["a.ts", ["b.ts", "c.ts"]],
      ["b.ts", []],
      ["b.test.ts", ["b.ts", "c.test.ts"]],
      ["c.ts", []],
      ["c.test.ts", []],
    ]);
  });
});

describe("findCycle on sample sources", () => {
  it("finds a cycle of two files", () => {
    const graph = graphOf({
      "a.ts": 'import { b } from "./b";',
      "b.ts": 'import { a } from "./a";',
    });
    expect(findCycle(graph)).toEqual(["a.ts", "b.ts", "a.ts"]);
  });

  it("finds a cycle that only type-only imports make", () => {
    const graph = graphOf({
      "a.ts": lines('import type { B } from "./b";', "export interface A { b: B }"),
      "b.ts": lines('import type { A } from "./a";', "export interface B { a: A }"),
      "types.ts": "export type T = number;",
    });
    expect(findCycle(graph)).toEqual(["a.ts", "b.ts", "a.ts"]);
  });

  it("finds a cycle that goes through an export from", () => {
    const graph = graphOf({
      "a.ts": 'import { c } from "./b";',
      "b.ts": 'export { c } from "./c";',
      "c.ts": lines('import { a } from "./a";', "export const c = a;"),
    });
    expect(findCycle(graph)).toEqual(["a.ts", "b.ts", "c.ts", "a.ts"]);
  });

  it("finds a cycle that the first file only leads to", () => {
    const graph = graphOf({
      "main.ts": 'import { a } from "./a";',
      "a.ts": 'import { b } from "./b";',
      "b.ts": lines("import {", "  c,", '} from "./c";'),
      "c.ts": 'import type { A } from "./a";',
    });
    expect(findCycle(graph)).toEqual(["a.ts", "b.ts", "c.ts", "a.ts"]);
  });

  it("finds a file that imports itself", () => {
    expect(findCycle(graphOf({ "a.ts": 'import { a } from "./a";' }))).toEqual(["a.ts", "a.ts"]);
  });

  it("finds a cycle behind a file's second import, when its first leads nowhere", () => {
    const graph = graphOf({
      "a.ts": lines('import type { T } from "./types";', 'import { b } from "./b";'),
      "b.ts": 'import { a } from "./a";',
      "types.ts": "export type T = number;",
    });
    expect(graph.get("a.ts")).toEqual(["types.ts", "b.ts"]);
    expect(findCycle(graph)).toEqual(["a.ts", "b.ts", "a.ts"]);
  });

  it("finds a cycle between two later files that the first file does not lead to", () => {
    const graph = graphOf({
      "alone.ts": "export const alone = 1;",
      "x.ts": 'import { y } from "./y";',
      "y.ts": 'import { x } from "./x";',
    });
    expect([...graph.keys()]).toEqual(["alone.ts", "x.ts", "y.ts"]);
    expect(graph.get("alone.ts")).toEqual([]);
    expect(findCycle(graph)).toEqual(["x.ts", "y.ts", "x.ts"]);
  });

  it("finds none in a diamond: a file reached a second time, by another way, is no cycle", () => {
    const graph = graphOf({
      "main.ts": lines('import { a } from "./a";', 'import { b } from "./b";'),
      "a.ts": 'import { c } from "./c";',
      "b.ts": 'import { c } from "./c";',
      "c.ts": "export const c = 1;",
    });
    expect(graph.get("main.ts")).toEqual(["a.ts", "b.ts"]);
    expect(findCycle(graph)).toBeNull();
  });

  it("finds none in a set without a cycle, a file that two others import included", () => {
    const graph = graphOf({
      "main.ts": lines('import { a } from "./a";', 'import { b } from "./b";'),
      "a.ts": lines('import { b } from "./b";', 'import type { T } from "./types";'),
      "b.ts": 'import type { T } from "./types";',
      "types.ts": "export type T = number;",
    });
    expect(findCycle(graph)).toBeNull();
  });
});

describe("the real src/", () => {
  const sources: Record<string, string> = {};
  for (const file of readdirSync(__dirname)) {
    if (TS_FILE.test(file)) sources[file] = readFileSync(`${__dirname}/${file}`, "utf8");
  }
  const graph = graphOf(sources);

  it("is read: the scan sees the files and the imports that are there", () => {
    expect(Object.keys(sources)).toEqual(
      expect.arrayContaining(["types.ts", "format.ts", "colour.ts", "state.ts", "imports.test.ts"]),
    );
    expect(graph.get("format.ts")).toEqual(["types.ts"]);
    expect(graph.get("colour.ts")).toEqual(["types.ts"]);
    expect(graph.get("state.ts")).toEqual(["types.ts"]);
    expect(graph.get("format.test.ts")).toEqual(["format.ts"]);
    expect(specifiers(sources["colour.test.ts"] ?? "")).toEqual([
      "../fixtures/legacy/all-open/dark/page.json",
      "../fixtures/legacy/all-open/light/page.json",
      "./colour",
      "./types",
    ]);
    expect(graph.get("colour.test.ts")).toEqual(["colour.ts", "types.ts"]);
  });

  it("does not read the sample sources of this file as imports", () => {
    const own = sources["imports.test.ts"];
    expect(own).toBeDefined();
    expect(specifiers(own ?? "")).toEqual([]);
  });

  it("keeps types.ts free of imports", () => {
    const types = sources["types.ts"];
    expect(types).toBeDefined();
    expect(specifiers(types ?? "")).toEqual([]);
  });

  it("has no import cycle", () => {
    expect(findCycle(graph)).toBeNull();
  });
});
