# Third-party notices

acuteping uses the third-party components below. Each keeps its own licence. Policy: `rules/policies/third-party-ip.md`.

Versions of the npm packages are those pinned in `package.json` and `package-lock.json`. The rows from Barlow down belong to `legacy/` and are not pinned; they were recorded when the calculator moved in, from the holding repository's notices file (licences not re-checked since). Licences are the `license` field of each package as installed. Transitive dependencies are not listed.

| Component | Version / commit | Source | Licence | Used for | Mode |
|---|---|---|---|---|---|
| @biomejs/biome | 2.5.15 | https://github.com/biomejs/biome | MIT OR Apache-2.0 | Lint and format check in CI (`biome ci`); dev only, not shipped | depend |
| @playwright/test | 1.63.0 | https://github.com/microsoft/playwright | Apache-2.0 | End-to-end tests in `e2e/`; dev and test only, not shipped | depend |
| @types/jest | 30.0.0 | https://github.com/DefinitelyTyped/DefinitelyTyped | MIT | Type definitions for the unit tests; dev only, not shipped | depend |
| jest | 30.5.2 | https://github.com/jestjs/jest | MIT | Unit tests with coverage; dev and test only, not shipped | depend |
| ts-jest | 29.4.14 | https://github.com/kulshekhar/ts-jest | MIT | Runs the TypeScript unit tests in jest; dev and test only, not shipped | depend |
| typescript | 6.0.3 | https://github.com/microsoft/TypeScript | Apache-2.0 | Type check (`tsc --noEmit`); dev only, not shipped | depend |
| vite | 8.3.1 | https://github.com/vitejs/vite | MIT | Build of the page (`vite build`); build tooling. Not checked whether any of its code ends up in `dist/` | depend |
| vite-plugin-singlefile | 2.3.3 | https://github.com/richardtallent/vite-plugin-singlefile | MIT | Build of the single self-contained HTML file; build tooling | depend |
| Barlow (font) | not pinned in this repository; Google Fonts served v13 on 2026-11-04 | https://github.com/google/fonts/tree/main/ofl/barlow (font project: https://github.com/jpt/barlow) | OFL-1.1 (SIL Open Font License 1.1) | Body text font of the calculator page, loaded at run time from fonts.googleapis.com by `legacy/src/p1.html` and `legacy/release/sonar-geometry.html`; not in `legacy/release/sonar-geometry-offline.html` | depend |
| Barlow Semi Condensed (font) | not pinned in this repository; Google Fonts served v16 on 2026-11-04 | https://github.com/google/fonts/tree/main/ofl/barlowsemicondensed (font project: https://github.com/jpt/barlow) | OFL-1.1 (SIL Open Font License 1.1) | Display and heading font of the calculator page, loaded at run time as above; not in the offline page | depend |
| JetBrains Mono (font) | not pinned in this repository; Google Fonts served v24 on 2026-11-04 | https://github.com/google/fonts/tree/main/ofl/jetbrainsmono (font project: https://github.com/JetBrains/JetBrainsMono) | OFL-1.1 (SIL Open Font License 1.1) | Figures and data font of the calculator page, loaded at run time as above; not in the offline page | depend |
| jsdom | not pinned in this repository | https://github.com/jsdom/jsdom | MIT; its LICENSE.txt also carries the W3C Software and Document License (2023) and Unicode notices for material it includes | Build check (`legacy/build/run.js`, called by `legacy/build/build.sh`), `legacy/build/check-humminbird.js` and snapshots (`legacy/tests/snap.js`, `snap2.js`), required from `/tmp/node_modules`; tooling and test only, not shipped | depend |
| Playwright for Python | not pinned in this repository | https://github.com/microsoft/playwright-python (bundles the Playwright driver from https://github.com/microsoft/playwright) | Apache-2.0; microsoft/playwright NOTICE: Copyright (c) Microsoft Corporation, contains code derived from Puppeteer (Apache-2.0) | Browser checks in `legacy/tests/` (`t1.py` to `t9.py`, `ov.py`, `fpshot*.py`); test only, not shipped | depend |
| Chromium (the browser build that Playwright downloads and launches) | not pinned in this repository | https://chromium.googlesource.com/chromium/src | BSD-3-Clause (chromium/src LICENSE); the browser binary also contains third-party components under their own licences, not listed here | Headless browser for the Playwright checks; test only, not shipped | depend |

Not covered yet: the GitHub Actions the workflows in `.github/workflows/` use (`actions/checkout`, `actions/setup-node`, `actions/upload-artifact`, `cloudflare/wrangler-action`); their licences have not been checked.

Mode is one of: depend, copy, clean room (with a link to its record in `docs/provenance/`).
