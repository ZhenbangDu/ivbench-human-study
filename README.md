# Video Comparison Human Study

A responsive, method-blind interface for a fixed 30-trial pairwise video study. Candidate videos are intentionally not included yet; the current deployment is ready for layout review and Ground Truth configuration.

## What is ready

- Optional nickname with automatic participant code
- 30 fixed-order trials
- Desktop `Left / Same / Right` and mobile portrait `Top / Same / Bottom`
- Two dominant candidate panels and a smaller 16:9 Ground Truth animation
- Three evaluation questions per trial
- Local save before every network attempt, partial-session resume, and retry outbox
- Google Apps Script receiver for a private Google Sheet
- GitHub Pages deployment workflow

## Local development

Node.js 24 and pnpm 11 are recommended.

```bash
pnpm install
pnpm dev
```

Verification:

```bash
pnpm test
pnpm build
```

## Local ACT–MiniMax H3 curation

The repository also contains a separate, local-only curator for choosing the 30 pairs that will enter the public study. It does not change the GitHub Pages interface and it never copies source videos into the repository.

On this machine, the four source locations are already configured in the ignored `.curation/config.json`. Start the curator with:

```bash
pnpm curate
```

Then open [http://127.0.0.1:4317/curation.html](http://127.0.0.1:4317/curation.html). The server listens on loopback only.

The curator:

- matches the 200 ACT directories with MiniMax H3, using the dedicated H3 fitness directory for `fitness_*`;
- extracts only IVBench brief JSON into the ignored local cache and generates the 832×480 layout/timing reference;
- streams ACT and H3 directly from their current local locations with seekable byte ranges;
- records `Include`, `Exclude`, `Needs Fix`, and comments after every edit;
- shows `Included: X / 30` as a target while still allowing a larger shortlist;
- provides status, subtask, missing-media, comment, and text filters plus JSON/CSV exports.

Selections are stored atomically in `.curation/act-h3-selection.json`. They survive browser and server restarts, and they are intentionally excluded from Git. The two known incomplete ACT items, `safety_32` and `travel_06`, begin as `Needs Fix` and cannot be included until an ACT final video exists.

If the source locations move, edit these fields in `.curation/config.json`: `actRoot`, `h3Root`, `h3FitnessRoot`, and `benchmarkArchive`.

## Add neutral videos later

1. Put candidate files under `public/media/` using neutral names such as `trial_001_a.mp4` and `trial_001_b.mp4`.
2. In `src/study/manifest.ts`, set the matching `first.src` and `second.src` values to relative public paths.
3. Keep the real method-to-code mapping only in the private Sheet's `MethodMap` tab.
4. Confirm the private mapping uses each physical position 15 times per method.

The page uses `object-fit: contain`, so study videos keep their original aspect ratio.

## Connect online saving

Follow [`apps-script/README.md`](apps-script/README.md). Until `VITE_APPS_SCRIPT_URL` is configured, the interface explicitly reports **Saved on this device** and keeps all partial answers in local storage.

## Deployment

Push `main` to GitHub, enable GitHub Pages with **GitHub Actions** as the source, and run **Test and deploy GitHub Pages**. The Vite build uses relative asset paths and therefore works under the repository Pages path.

## Privacy boundary

The public repository contains anonymous candidate codes only. Do not add credentials, spreadsheet identifiers, participant exports, source research paths, or the private method mapping.
