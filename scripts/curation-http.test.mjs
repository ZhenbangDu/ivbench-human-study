import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createServer } from 'node:http'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { createCuratorRequestHandler } from './curation-http.mjs'
import { createDefaultSelection } from './curation-store.mjs'

let root
let server
let baseUrl
let context

const itemFixture = (actPath, h3Path) => ({
  id: 'advertisement_01',
  order: 0,
  subtask: 'advertisement',
  number: 1,
  topic: 'A lamp',
  videoGoal: 'Show the lamp',
  groundTruth: {
    durationSeconds: 5,
    canvas: { width: 832, height: 480 },
    subjectRegion: { x: 0.333, y: 0, width: 0.667, height: 1 },
    events: [],
  },
  availability: { act: true, h3: true, complete: true },
  failure: null,
  mediaPaths: { act: actPath, h3: h3Path },
})

beforeEach(async () => {
  root = mkdtempSync(path.join(tmpdir(), 'ivbench-curator-http-'))
  const actPath = path.join(root, 'act.mp4')
  const h3Path = path.join(root, 'h3.mp4')
  writeFileSync(actPath, Buffer.from(Array.from({ length: 256 }, (_, index) => index)))
  writeFileSync(h3Path, Buffer.from('h3-video'))
  const items = [itemFixture(actPath, h3Path)]
  context = {
    items,
    selection: createDefaultSelection(items, 'fp'),
    selectionPath: path.join(root, 'selection.json'),
  }
  server = createServer(createCuratorRequestHandler(context))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  baseUrl = `http://127.0.0.1:${address.port}`
})

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve))
  rmSync(root, { force: true, recursive: true })
})

function request(url, options) {
  return fetch(`${baseUrl}${url}`, options)
}

describe('curator HTTP handler', () => {
  it('returns items and decisions without filesystem paths', async () => {
    const response = await request('/api/items')
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(body.summary).toMatchObject({ unreviewed: 1, include: 0, target: 30 })
    expect(body.items[0]).toMatchObject({
      id: 'advertisement_01',
      media: {
        act: '/media/act/advertisement_01',
        h3: '/media/h3/advertisement_01',
      },
      selection: { status: 'unreviewed', comment: '' },
    })
    expect(JSON.stringify(body)).not.toContain(root)
  })

  it('updates and persists a selection', async () => {
    const response = await request('/api/items/advertisement_01/selection', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'include', comment: 'keep this pair' }),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.selection).toMatchObject({ status: 'include', comment: 'keep this pair' })
    expect(body.summary.include).toBe(1)
  })

  it('supports byte ranges and HEAD for a known ACT video', async () => {
    const rangeResponse = await request('/media/act/advertisement_01', {
      headers: { Range: 'bytes=0-99' },
    })
    expect(rangeResponse.status).toBe(206)
    expect(rangeResponse.headers.get('content-range')).toBe('bytes 0-99/256')
    expect((await rangeResponse.arrayBuffer()).byteLength).toBe(100)

    const headResponse = await request('/media/act/advertisement_01', { method: 'HEAD' })
    expect(headResponse.status).toBe(200)
    expect(headResponse.headers.get('content-length')).toBe('256')
  })

  it('rejects invalid ranges, traversal, and unknown samples', async () => {
    expect((await request('/media/act/advertisement_01', {
      headers: { Range: 'bytes=500-600' },
    })).status).toBe(416)
    expect((await request('/media/act/../../etc/passwd')).status).toBe(404)
    expect((await request('/media/h3/unknown_01')).status).toBe(404)
  })

  it('exports the current selection as JSON and CSV', async () => {
    const jsonResponse = await request('/api/export.json')
    const csvResponse = await request('/api/export.csv')

    expect(jsonResponse.headers.get('content-disposition')).toContain('act-h3-selection.json')
    expect((await jsonResponse.json()).items.advertisement_01.status).toBe('unreviewed')
    expect(csvResponse.headers.get('content-type')).toContain('text/csv')
    expect(await csvResponse.text()).toContain('advertisement_01,advertisement,unreviewed')
  })
})
