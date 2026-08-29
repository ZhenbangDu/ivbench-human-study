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
