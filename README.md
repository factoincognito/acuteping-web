# acuteping-web

The source of the acuteping web page: a sonar geometry calculator, about the
cone a sonar transducer sends into the water and what that cone does and does
not see.

**Status: early.** The page is a working sonar geometry calculator for side
imaging, down imaging, 2D and live sonar. Its reference figures for
transducers are still being reviewed.

## Licence

The source is under the PolyForm Noncommercial License 1.0.0 (`LICENSE`). Any
noncommercial purpose is a permitted purpose; for other uses, write to the
contact address below.

Required Notice: Copyright Adam Smolowicz

Third-party material in the source is listed in `THIRD-PARTY-NOTICES.md`.

## Build and run

You need Node.js and npm. The project's own checks run on Node.js 24.

```
npm ci
npm run dev        # the page on a local development server
npm run build      # builds the page into dist/
npm test           # unit tests
npm run lint       # style and static checks
npm run typecheck  # TypeScript
```

`npm run test:e2e` builds the page and runs the browser test; it needs a
browser for Playwright first: `npx playwright install chromium`.

## About this repository

This repository is generated from a private one. A change is made there and
published here as a whole new version; the history here is a list of versions
of the page, not the history of the work. For that reason the repository takes
no pull requests from outside.

Claude, an AI model made by Anthropic, contributed to this repository.

## Contact

sonar@sugo.se
