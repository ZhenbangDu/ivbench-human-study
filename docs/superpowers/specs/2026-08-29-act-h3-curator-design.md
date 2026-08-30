# ACT–MiniMax H3 Local Curator Design

## Goal

Build a local-only review tool for the 200 ACT sample IDs. It presents the ACT video, the benchmark ground-truth layout/timing animation, and the matching MiniMax H3 video. A curator assigns `Include`, `Exclude`, or `Needs Fix`, adds a comment, and can later export the shortlist for the 30-trial public human study.

The existing public GitHub Pages study remains unchanged.

## Verified input set

- ACT sample universe: the 200 directories under the configured `abl_v3_repairfix/act_full` root.
- ACT final videos: 198 `06_composite/final.mp4` files.
- Missing ACT finals:
  - `safety_32`: generation stopped after a Bedrock refusal.
  - `travel_06`: no candidate cleared the safe-region floor.
- MiniMax H3 regular videos: 490 files under the configured H3 `gen` root.
- MiniMax H3 fitness videos: all 10 files under the configured `h3__fit10_t2vfb` root.
- Ground truth: the matching `briefs/<sample_id>.json` records in IVBench-500 v1.11.0.

The curator therefore lists 200 items, 198 with both videos, and two ACT-missing items that default to `Needs Fix` and cannot be included until an ACT final exists.

## Architecture

The repository gains a local-only curator frontend and a small Node server built from Node and Vite APIs already present in the project.

- `curation.html` is a separate development entry point. It is not an input to the production GitHub Pages build.
- `src/curation/` contains the React curator application and its domain logic.
- `scripts/curation-server.mjs` binds only to `127.0.0.1`, exposes the curator API and media streams, and mounts Vite in middleware mode.
- `.curation/config.json` contains machine-specific absolute input paths.
- `.curation/act-h3-selection.json` contains saved decisions and comments.
- `.curation/cache/briefs/` contains benchmark briefs extracted from the archive for fast startup.
- `.curation/` is gitignored so absolute paths and internal comments are never published.

No source video is copied, renamed, or modified.

## Data preparation and matching

On startup the server:

1. Validates the local config and required roots.
2. Enumerates the 200 ACT sample directories and sorts them naturally by subtask and numeric suffix.
3. Extracts the benchmark `briefs/` directory into the local cache if the archive timestamp or size changed.
4. Resolves each ACT and H3 video through fixed, allow-listed path templates. Fitness IDs resolve from the dedicated fitness H3 root; other IDs resolve from the regular H3 root.
5. Converts each benchmark brief into a ground-truth view model using `_output`, `_layout_spec`, and `overlay_text`.
6. Merges any saved selection state by sample ID.

Missing files are data states, not startup failures. Invalid config, an unreadable archive, duplicate IDs, or malformed benchmark records stop startup with an actionable error.

## Local API and persistence

The local server exposes:

- `GET /api/items`: metadata, ground truth, availability, counts, and current selection state.
- `PUT /api/items/:id/selection`: validates and saves one item's status and comment.
- `GET /api/export.json`: downloads the current selection document.
- `GET /api/export.csv`: downloads a flat review table.
- `GET /media/:source/:id`: streams only the resolved ACT or H3 file for a known sample ID and supports HTTP range requests.

Valid stored statuses are `unreviewed`, `include`, `exclude`, and `needs_fix`. The UI presents the three explicit decision buttons; `unreviewed` is the initial absence of a decision.

Writes use a temporary file followed by an atomic rename. The selection document stores a schema version, dataset fingerprint, timestamps, and per-item records. Comments are plain text and are preserved when a status changes.

## Curator interface

The page uses one-item-at-a-time review to keep both videos large:

- Sticky header: current index, reviewed count, `Included: X / 30`, status counts, previous/next controls, search, and filters.
- Main comparison: ACT on the left, synchronized ground truth in the center, MiniMax H3 on the right.
- Playback: shared play/pause and replay controls; video seeking keeps both videos and ground truth synchronized.
- Decision panel: `Include`, `Exclude`, and `Needs Fix` buttons plus a large comment field and visible saving state.
- Navigation: next/previous buttons and a compact searchable item list. Filters cover subtask, decision status, missing media, and comment presence.
- Export buttons: JSON and CSV.

The tool shows method labels because it is an internal curation tool, not a blinded participant interface. There is no hard 30-item cap; selecting more than 30 shows a warning while preserving the larger candidate pool.

For `safety_32` and `travel_06`, the ACT panel displays the verified failure reason, `Include` is disabled, and the default state is `Needs Fix`.

## Ground-truth behavior

The center animation uses the benchmark's actual 832×480 (26:15) canvas contract. It draws the subject region when present and shows each required text event inside its preferred text region only during its benchmark time window. No design-only tight box is treated as ground truth.

No-layout samples still show caption timing and text. When the benchmark has no region constraint, the animation labels the region as unconstrained instead of inventing placement geometry.

## Public-build isolation and safety

- The GitHub Pages workflow continues to build only the existing `index.html` application.
- Local config, cache, comments, and generated exports remain under ignored `.curation/` paths.
- The server listens on loopback only.
- Media URLs contain source and sample ID, never arbitrary filesystem paths.
- API writes reject unknown IDs, unsupported statuses, oversized comments, and unexpected fields.

## Testing and acceptance criteria

Automated tests cover:

- Natural ID ordering and exact matching across the two H3 roots.
- A 200-item manifest with 198 complete pairs and exactly two ACT-missing items for the current config.
- Ground-truth conversion, including regioned and no-layout samples.
- Selection validation, defaults, merge behavior, and atomic persistence.
- Media lookup allow-listing and HTTP range handling.
- UI decision changes, comment autosave, counts, filtering, missing-item restrictions, and navigation.
- The existing public study test suite and production build.

Manual browser verification covers synchronized playback, seeking, long comments, filters, JSON/CSV downloads, wide desktop layout, and recovery after restarting the local server.

The task is complete when one command starts the curator, all 200 items load, selection changes survive restart, the two known missing items are handled correctly, and the public GitHub Pages build remains unchanged.
