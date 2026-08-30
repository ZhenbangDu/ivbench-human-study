# ACT–MiniMax H3 Local Curator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a local-only curator that matches 200 ACT sample IDs to MiniMax H3 and IVBench ground truth, streams the source videos, and persistently records Include/Exclude/Needs Fix decisions and comments.

**Architecture:** A loopback-only Node HTTP server validates local paths, extracts benchmark briefs into an ignored cache, builds the 200-item manifest, streams allow-listed media with byte ranges, and atomically persists review state. A separate Vite/React entry point consumes that API; the existing production `index.html` remains the sole GitHub Pages build input.

**Tech Stack:** Node.js 24 built-ins, Vite 8 middleware mode, React 19, TypeScript 7, Vitest 4, Testing Library, HTML5 video.

**Spec:** `docs/superpowers/specs/2026-08-29-act-h3-curator-design.md`

## Global Constraints

- Bind the curator server to `127.0.0.1` only.
- Never copy, rename, modify, or expose arbitrary paths to source videos.
- Keep `.curation/` ignored and outside the public Vite build.
- Use the 200 ACT directories as the sample universe.
- Resolve normal H3 videos from the 490-file root and fitness H3 videos from the dedicated 10-file root.
- Treat `safety_32` and `travel_06` as ACT-missing, default `Needs Fix`, and non-includable.
- Use the benchmark's 832×480 (26:15) layout and timing ground truth; do not use design-only tight boxes.
- Preserve the existing public study behavior and test suite.
- Add no runtime dependency beyond packages already installed.

---

### Task 1: Local configuration and ignored state boundary

**Files:**
- Modify: `.gitignore`
- Modify: `package.json`
- Create locally (ignored): `.curation/config.json`
- Test: `scripts/curation-config.test.mjs`
- Create: `scripts/curation-config.mjs`

**Interfaces:**
- Produces: `loadCuratorConfig(configPath?: string): CuratorConfig`
- `CuratorConfig` fields: `actRoot`, `h3Root`, `h3FitnessRoot`, `benchmarkArchive`, `stateDir`, `port`

- [ ] **Step 1: Write the failing config tests**

```js
it('loads and resolves every configured path', () => {
  const config = loadCuratorConfig(fixturePath)
  expect(config.port).toBe(4317)
  expect(path.isAbsolute(config.actRoot)).toBe(true)
})

it('rejects a missing input root with its field name', () => {
  expect(() => loadCuratorConfig(brokenFixture)).toThrow(/h3FitnessRoot/)
})
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `node node_modules/vitest/vitest.mjs run scripts/curation-config.test.mjs`
Expected: FAIL because `scripts/curation-config.mjs` does not exist.

- [ ] **Step 3: Implement config loading and repository isolation**

Add `.curation/` to `.gitignore`, add `"curate": "node scripts/curation-server.mjs"` to `package.json`, and implement strict JSON parsing, path resolution, directory/file checks, a default `127.0.0.1:4317`, and actionable errors.

Create the ignored `.curation/config.json` using the four user-provided absolute source paths and `stateDir` equal to `.curation`.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `node node_modules/vitest/vitest.mjs run scripts/curation-config.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add .gitignore package.json scripts/curation-config.mjs scripts/curation-config.test.mjs
git commit -m "feat: add local curator configuration"
```

### Task 2: Sample matching and ground-truth conversion

**Files:**
- Create: `scripts/curation-data.mjs`
- Test: `scripts/curation-data.test.mjs`
- Modify: `src/study/types.ts`
- Modify: `src/components/GroundTruth.tsx`
- Modify: `src/components/GroundTruth.test.tsx`

**Interfaces:**
- Produces: `naturalSampleCompare(a, b): number`
- Produces: `convertBriefToGroundTruth(brief): GroundTruthConfig`
- Produces: `buildCuratorItems(config): Promise<CuratorItem[]>`
- Produces: `ensureBriefCache(config): Promise<string>`
- Changes `GroundTruthConfig.canvas` to `{ width: number; height: number }`

- [ ] **Step 1: Write failing data tests**

```js
it('sorts IDs by subtask and numeric suffix', () => {
  expect(['safety_10', 'safety_2'].sort(naturalSampleCompare))
    .toEqual(['safety_2', 'safety_10'])
})

it('converts the IVBench canvas and timed overlays', () => {
  const gt = convertBriefToGroundTruth(advertisement01)
  expect(gt.canvas).toEqual({ width: 832, height: 480 })
  expect(gt.events[0]).toMatchObject({ text: 'Soft Glow, Tiny Footprint', timeStart: 0.3, timeEnd: 3.6 })
})

it('builds 200 items with 198 complete pairs from the configured dataset', async () => {
  const items = await buildCuratorItems(realConfig)
  expect(items).toHaveLength(200)
  expect(items.filter(item => item.availability.complete)).toHaveLength(198)
  expect(items.filter(item => !item.availability.act)).toEqual([
    expect.objectContaining({ id: 'safety_32' }),
    expect.objectContaining({ id: 'travel_06' }),
  ])
  expect(items.filter(item => !item.availability.h3)).toHaveLength(0)
})
```

- [ ] **Step 2: Run and verify RED**

Run: `node node_modules/vitest/vitest.mjs run scripts/curation-data.test.mjs src/components/GroundTruth.test.tsx`
Expected: FAIL because the data functions and variable canvas rendering do not exist.

- [ ] **Step 3: Implement the minimal matcher and converter**

Use `tar -xzf <archive> -C <cache> IVBench-500/briefs` once per archive fingerprint. Validate duplicate IDs, missing briefs, normalized regions, duration, and overlay windows. Resolve `fitness_*` from `h3FitnessRoot`; resolve all other H3 IDs from `h3Root`.

For no-layout briefs, set `subjectRegion` to `null` and event regions to `null`. Update `GroundTruth` to render a 26:15 canvas from the supplied dimensions and display `UNCONSTRAINED` when a region is null.

- [ ] **Step 4: Run and verify GREEN**

Run: `node node_modules/vitest/vitest.mjs run scripts/curation-data.test.mjs src/components/GroundTruth.test.tsx`
Expected: PASS, including the real 200/198/2/0 census.

- [ ] **Step 5: Commit**

```bash
git add scripts/curation-data.mjs scripts/curation-data.test.mjs src/study/types.ts src/components/GroundTruth.tsx src/components/GroundTruth.test.tsx
git commit -m "feat: build curator sample manifest"
```

### Task 3: Selection persistence and export

**Files:**
- Create: `scripts/curation-store.mjs`
- Test: `scripts/curation-store.test.mjs`

**Interfaces:**
- Produces: `createDefaultSelection(items, fingerprint): SelectionDocument`
- Produces: `loadSelection(filePath, items, fingerprint): SelectionDocument`
- Produces: `saveSelection(filePath, document): Promise<void>`
- Produces: `updateSelection(document, id, patch, items): SelectionDocument`
- Produces: `selectionToCsv(document, items): string`

- [ ] **Step 1: Write failing store tests**

```js
it('defaults the two missing ACT samples to needs_fix', () => {
  const document = createDefaultSelection(items, 'fp')
  expect(document.items.safety_32.status).toBe('needs_fix')
  expect(document.items.travel_06.status).toBe('needs_fix')
})

it('preserves comments when status changes and rejects include for incomplete pairs', () => {
  const commented = updateSelection(document, 'advertisement_01', { comment: 'text overlaps product' }, items)
  expect(updateSelection(commented, 'advertisement_01', { status: 'needs_fix' }, items).items.advertisement_01.comment)
    .toBe('text overlaps product')
  expect(() => updateSelection(document, 'safety_32', { status: 'include' }, items)).toThrow(/missing ACT/i)
})
```

- [ ] **Step 2: Run and verify RED**

Run: `node node_modules/vitest/vitest.mjs run scripts/curation-store.test.mjs`
Expected: FAIL because the store module does not exist.

- [ ] **Step 3: Implement validated atomic persistence**

Allow only `unreviewed`, `include`, `exclude`, and `needs_fix`; limit comments to 10,000 Unicode characters; reject unknown IDs and fields. Save formatted JSON to a sibling temporary file, `fsync`, rename atomically, and preserve the previous valid file when a write fails. CSV columns are `id,subtask,status,comment,act_available,h3_available,updated_at` with RFC 4180 escaping.

- [ ] **Step 4: Run and verify GREEN**

Run: `node node_modules/vitest/vitest.mjs run scripts/curation-store.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/curation-store.mjs scripts/curation-store.test.mjs
git commit -m "feat: persist curator decisions"
```

### Task 4: Loopback API and range-streamed media

**Files:**
- Create: `scripts/curation-http.mjs`
- Test: `scripts/curation-http.test.mjs`
- Create: `scripts/curation-server.mjs`

**Interfaces:**
- Produces: `createCuratorRequestHandler(context): (req, res) => Promise<void>`
- `context` contains `items`, `selection`, `selectionPath`, and `reloadSelection`
- `scripts/curation-server.mjs` composes the handler with Vite middleware and prints the local URL

- [ ] **Step 1: Write failing API and range tests**

```js
it('returns items without filesystem paths', async () => {
  const response = await request('/api/items')
  expect(response.status).toBe(200)
  expect(JSON.stringify(await response.json())).not.toContain('/Users/')
})

it('supports byte ranges for a known ACT video', async () => {
  const response = await request('/media/act/advertisement_01', { headers: { Range: 'bytes=0-99' } })
  expect(response.status).toBe(206)
  expect(response.headers.get('content-range')).toMatch(/^bytes 0-99\//)
  expect((await response.arrayBuffer()).byteLength).toBe(100)
})

it('rejects path traversal and unknown samples', async () => {
  expect((await request('/media/act/../../etc/passwd')).status).toBe(404)
})
```

- [ ] **Step 2: Run and verify RED**

Run: `node node_modules/vitest/vitest.mjs run scripts/curation-http.test.mjs`
Expected: FAIL because the HTTP handler does not exist.

- [ ] **Step 3: Implement API routing and streaming**

Return JSON with `Cache-Control: no-store`, parse request bodies with a 32 KiB limit, validate IDs against the prebuilt item map, and use only server-resolved media paths. Implement `200` full responses, `206` ranges, `416` invalid ranges, `HEAD`, `Accept-Ranges`, `Content-Length`, and `video/mp4`.

Mount Vite middleware only after API/media routing, bind `127.0.0.1`, and serve `/curation.html` as the startup URL.

- [ ] **Step 4: Run and verify GREEN**

Run: `node node_modules/vitest/vitest.mjs run scripts/curation-http.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/curation-http.mjs scripts/curation-http.test.mjs scripts/curation-server.mjs
git commit -m "feat: serve local curator API and media"
```

### Task 5: Curator React interface

**Files:**
- Create: `curation.html`
- Create: `src/curation/types.ts`
- Create: `src/curation/api.ts`
- Create: `src/curation/useSynchronizedPlayback.ts`
- Create: `src/curation/CuratorVideo.tsx`
- Create: `src/curation/CuratorApp.tsx`
- Create: `src/curation/main.tsx`
- Create: `src/curation/curation.css`
- Test: `src/curation/CuratorApp.test.tsx`

**Interfaces:**
- Produces: `fetchCuratorItems(): Promise<CuratorPayload>`
- Produces: `saveCuratorSelection(id, patch): Promise<SelectionRecord>`
- Produces: `useSynchronizedPlayback(durationSeconds, itemId)`
- Produces: `CuratorApp`

- [ ] **Step 1: Write failing UI tests**

```tsx
it('shows ACT, ground truth, H3, counts, and the three decisions', async () => {
  render(<CuratorApp api={fakeApi} />)
  expect(await screen.findByText('advertisement_01')).toBeVisible()
  expect(screen.getByText('ACT')).toBeVisible()
  expect(screen.getByText('MiniMax H3')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Include' })).toBeEnabled()
  expect(screen.getByText(/Included: 0 \/ 30/)).toBeVisible()
})

it('autosaves comments and preserves them while navigating', async () => {
  await user.type(await screen.findByLabelText('Comment'), 'text overlaps product')
  await vi.advanceTimersByTimeAsync(400)
  expect(fakeApi.saveSelection).toHaveBeenCalledWith('advertisement_01', { comment: 'text overlaps product' })
})

it('disables Include and explains a missing ACT final', async () => {
  render(<CuratorApp api={missingActApi} />)
  expect(await screen.findByRole('button', { name: 'Include' })).toBeDisabled()
  expect(screen.getByText(/Bedrock refusal/i)).toBeVisible()
})
```

- [ ] **Step 2: Run and verify RED**

Run: `node node_modules/vitest/vitest.mjs run src/curation/CuratorApp.test.tsx`
Expected: FAIL because the curator frontend does not exist.

- [ ] **Step 3: Implement the interface**

Build the sticky summary/search/filter header, large ACT–GT–H3 comparison, synchronized controls, decision buttons, comment autosave with `Saving…`/`Saved`, previous/next navigation, searchable item rail, status/subtask/missing/comment filters, and JSON/CSV download links. Keep the comparison dominant at desktop widths and stack safely on smaller windows.

- [ ] **Step 4: Run and verify GREEN**

Run: `node node_modules/vitest/vitest.mjs run src/curation/CuratorApp.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add curation.html src/curation
git commit -m "feat: add ACT-H3 curator interface"
```

### Task 6: Full integration and public-build isolation

**Files:**
- Modify: `README.md`
- Test: all test files

**Interfaces:**
- Produces: documented `pnpm curate` workflow
- Preserves: `pnpm build` output containing only the public study entry

- [ ] **Step 1: Add integration expectations**

Extend tests to assert that `dist/curation.html` does not exist after the normal production build and that the real local API reports exactly 200 items, 198 complete pairs, two missing ACT videos, and zero missing H3 videos.

- [ ] **Step 2: Run the new expectations and verify RED where applicable**

Run: `node node_modules/vitest/vitest.mjs run`
Expected: any missing documentation/build-isolation assertion fails before the final wiring.

- [ ] **Step 3: Finish documentation and startup behavior**

Document the one-command startup, local URL, JSON state path, status meanings, filters, exports, source-path configuration, and the two known missing ACT samples. Ensure the server prints the census and opens no network listener beyond loopback.

- [ ] **Step 4: Run the complete automated verification**

Run:

```bash
node node_modules/vitest/vitest.mjs run
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vite/bin/vite.js build
test ! -e dist/curation.html
git diff --check
```

Expected: all tests pass, TypeScript exits 0, production build exits 0, `dist/curation.html` is absent, and the diff check exits 0.

- [ ] **Step 5: Run manual local acceptance**

Start: `node scripts/curation-server.mjs`

Verify in the browser:

- Header reports 200 items, 198 complete pairs, and `Included: 0 / 30` initially.
- ACT and H3 play in sync with the 26:15 ground-truth animation.
- Seeking, replay, filters, search, comments, decisions, and exports work.
- Restarting the server retains saved decisions and comments.
- `safety_32` and `travel_06` cannot be included and show their failure reasons.

- [ ] **Step 6: Commit**

```bash
git add README.md src scripts package.json .gitignore curation.html
git commit -m "docs: document local curation workflow"
```
