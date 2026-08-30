import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  createDefaultSelection,
  loadSelection,
  saveSelection,
  selectionToCsv,
  updateSelection,
} from './curation-store.mjs'

const items = [
  {
    id: 'advertisement_01',
    subtask: 'advertisement',
    availability: { act: true, h3: true, complete: true },
  },
  {
    id: 'safety_32',
    subtask: 'safety',
    availability: { act: false, h3: true, complete: false },
    failure: { state: 'FAILED_REPAIR_BUDGET', reason: 'Bedrock refusal' },
  },
  {
    id: 'travel_06',
    subtask: 'travel',
    availability: { act: false, h3: true, complete: false },
    failure: { state: 'FAILED_NO_SAFE_REGION', reason: 'score below floor' },
  },
]

const temporaryDirectories = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

function temporaryFile() {
  const directory = mkdtempSync(path.join(tmpdir(), 'ivbench-curator-store-'))
  temporaryDirectories.push(directory)
  return path.join(directory, 'selection.json')
}

describe('curation selection store', () => {
  it('defaults incomplete pairs to needs_fix and complete pairs to unreviewed', () => {
    const document = createDefaultSelection(items, 'dataset-fingerprint')

    expect(document.items.advertisement_01.status).toBe('unreviewed')
    expect(document.items.safety_32.status).toBe('needs_fix')
    expect(document.items.travel_06.status).toBe('needs_fix')
  })

  it('preserves comments when status changes and rejects include for incomplete pairs', () => {
    const document = createDefaultSelection(items, 'fp')
    const commented = updateSelection(
      document,
      'advertisement_01',
      { comment: 'text overlaps product' },
      items,
    )
    const changed = updateSelection(commented, 'advertisement_01', { status: 'needs_fix' }, items)

    expect(changed.items.advertisement_01.comment).toBe('text overlaps product')
    expect(() => updateSelection(document, 'safety_32', { status: 'include' }, items)).toThrow(/missing ACT/i)
  })

  it('atomically saves and loads valid state while merging new sample IDs', async () => {
    const filePath = temporaryFile()
    const changed = updateSelection(
      createDefaultSelection(items, 'fp'),
      'advertisement_01',
      { status: 'include', comment: 'strong pair' },
      items,
    )

    await saveSelection(filePath, changed)
    const loaded = loadSelection(filePath, [...items, {
      id: 'science_01',
      subtask: 'science',
      availability: { act: true, h3: true, complete: true },
    }], 'fp-2')

    expect(loaded.items.advertisement_01).toMatchObject({ status: 'include', comment: 'strong pair' })
    expect(loaded.items.science_01.status).toBe('unreviewed')
    expect(JSON.parse(readFileSync(filePath, 'utf8')).schemaVersion).toBe(1)
  })

  it('rejects invalid files instead of silently discarding decisions', () => {
    const filePath = temporaryFile()
    writeFileSync(filePath, '{not-json')

    expect(() => loadSelection(filePath, items, 'fp')).toThrow(/selection file/i)
  })

  it('exports RFC 4180 CSV with comments intact', () => {
    const document = updateSelection(
      createDefaultSelection(items, 'fp'),
      'advertisement_01',
      { status: 'include', comment: 'good, but "bright"' },
      items,
    )

    const csv = selectionToCsv(document, items)

    expect(csv).toContain('id,subtask,status,comment,act_available,h3_available,updated_at')
    expect(csv).toContain('"good, but ""bright"""')
  })
})
