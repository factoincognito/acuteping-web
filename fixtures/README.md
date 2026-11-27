# fixtures

Recordings that the unit tests in `src/` compare the calculator with. Nothing here is written by hand, and nothing here is edited: a file is replaced only by recording it again.

## `legacy/`

What the calculator's page did before it was rebuilt from `src/`, recorded in Chromium (`index.json` names the version): for each scenario, in light and in dark, the elements the page's script wrote and what it drew on each canvas. `legacy/index.json` lists the scenarios and every file with its size and digest.

A scenario is a state the page starts from (the values of its fields and its saved view state) and a locale. Its files are `legacy/<scenario>/<light or dark>/<section>.json`, one for each section of the page (`set`, `ls`, `ss`, `vs`, `at`, `cmp`, `db`, `data`, `math`) and `page` for what is outside the sections.

### A file

```
{
 "format": 1,
 "section": "ss",
 "scenario": { ... },
 "patches": { "<key>": <patch>, ... },
 "canvases": { "<canvas id>": <canvas>, ... }
}
```

**`scenario`** is what the recording started from and all a test needs to build its input:

- `name`, `about`, `locale`, `scheme` (`light` or `dark`), `viewport`;
- `seed`: the saved state the page was loaded with (`null`: nothing saved), and `steps`: for a scenario whose seed the page itself saved, the visitor's steps that led to it;
- `fields`: the value of every input and select of the page, and `true` or `false` for every tick box, by id, as the page had them when it was recorded;
- `ui`: the view state the page saved (which sections are open, the chosen frequencies and so on);
- `scene3d`: the 3D view's angles and zoom as the page starts with them. They are read from the script of the page the fixtures were first recorded from, also when another page is recorded, so they say nothing about that other page; what the 3D view drew is in the log of the canvas `b3d`;
- `theme`: the resolved value of every CSS custom property of the page's root.

**A patch** is how the script left one element, and holds only what the script wrote to it:

| Field | Holds | When |
|---|---|---|
| `text`, `html` | `textContent` and `innerHTML` | the content was written |
| `hidden` | `true` or `false` | `hidden` was written |
| `classes` | the class list | the classes were written |
| `attrs` | name to value, `null` for an attribute that was removed | those attributes were written (never `class` or `hidden`) |
| `value`, `checked` | the field's value; `checked` for a tick box | always, for an input, a select or a text area |
| `overlaps` | keys of other patches | the element's `html` holds those elements, which have a patch of their own |

The key of a patch is the element's `id`. An element without one has the key `<id of the nearest ancestor that has one, or body> > tag:nth-child(n) > ...` down to the element, counted in the page's markup as it is before any script runs. An element that the script itself made has no patch: it is in the `html` of the element it was put into.

**A canvas** is `{ "width", "height", "passes": [...] }`. The page draws a canvas more than once while it loads; a pass is what one task of the page drew: `{ "by": "load" | "frame" | "timer" | "event", "log": [...] }`, in order. An entry of a log is

- `[name, ...arguments]`: a call of a method of the 2D context;
- `["=" + property, value]`: an assignment to a property of the context;
- `["#height", value]` or `["#width", value]`: the script set the canvas's size.

A call of `measureText` ends with `{ "font", "width" }`: the font it was measured in and the width it returned, so that a test can answer the same without the machine's fonts. Pixels are never stored: an `ImageData` is `{ "$": "ImageData", "w", "h", "fnv1a" }`, the digest of its bytes. A number JSON cannot hold is `{ "$": "NaN" }`, `{ "$": "Infinity" }`, `{ "$": "-Infinity" }` or `{ "$": "-0" }`.

A pass equal to an earlier pass of the same canvas is `{ "by", "repeats": <index of that pass> }`.

The canvas `made` in `page.json` is not one canvas: the page makes a throwaway canvas for each colour it parses. It holds how many there were and each distinct log once: `{ "canvases": n, "distinct": [{ "times", "width", "height", "log" }] }`, where `["?" + property, value]` is a value the script read back.

### Values that are not repeated

The set would be many times larger if every file held every value in full, so:

- **`{ "same": "<scenario>/<scheme>" }`** in place of a patch or a canvas: the value is equal to the one the same key has in the same section of that scenario and scheme. Read it there; it can be a `same` again, at most twice in a row. A dark file refers to the light file of its own scenario, and any file to the base scenarios `all-open` and `defaults`.
- **A file that is not there** and is named in `"omitted"` of `index.json`: the whole section is equal to the file named there. A section with neither a file nor a line in `omitted` has no patch and no canvas.
- **A digest in place of a long value**, only in a scenario whose `whole` is `false` in `index.json`: a `text` or `html` longer than `digestOver.chars` characters is `{ "fnv1a", "length" }` (the digest of its UTF-8 bytes and its length), and a pass with more than `digestOver.entries` entries is `{ "by", "entries", "fnv1a", "measured" }`: the number of entries, the digest of `JSON.stringify(log)` as UTF-8, and what `measureText` returned in it as `[font, text, width]`, each once. The base scenarios hold everything in full.

Every digest is FNV-1a, 32 bit, as eight hex digits.
