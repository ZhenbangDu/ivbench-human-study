import { createReadStream, statSync } from 'node:fs'

import {
  saveSelection,
  selectionSummary,
  selectionToCsv,
  updateSelection,
} from './curation-store.mjs'

const MAX_BODY_BYTES = 32 * 1024

function send(res, status, body = '', headers = {}) {
  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body)
  res.writeHead(status, {
    'cache-control': 'no-store',
    'content-length': buffer.byteLength,
    ...headers,
  })
  res.end(buffer)
}

function sendJson(res, status, value, headers = {}) {
  send(res, status, `${JSON.stringify(value)}\n`, {
    'content-type': 'application/json; charset=utf-8',
    ...headers,
  })
}

function publicItem(item, selection) {
  const { mediaPaths: _mediaPaths, ...safeItem } = item
  return {
    ...safeItem,
    media: {
      act: item.availability.act ? `/media/act/${encodeURIComponent(item.id)}` : null,
      h3: item.availability.h3 ? `/media/h3/${encodeURIComponent(item.id)}` : null,
    },
    selection: selection.items[item.id],
  }
}

function publicShortlistItem(item, selection) {
  const safeItem = publicItem(item, selection)
  const repaired = Boolean(item.mediaPaths.repairedAct)
  return {
    ...safeItem,
    actSource: repaired ? 'repaired' : 'original',
    availability: {
      ...safeItem.availability,
      act: Boolean(item.mediaPaths.repairedAct || item.mediaPaths.act),
      complete: Boolean((item.mediaPaths.repairedAct || item.mediaPaths.act) && item.mediaPaths.h3),
    },
    media: {
      act: item.mediaPaths.repairedAct || item.mediaPaths.act
        ? `/media/shortlist-act/${encodeURIComponent(item.id)}`
        : null,
      h3: safeItem.media.h3,
    },
  }
}

async function readJsonBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error('Request body exceeds 32 KiB'), { statusCode: 413 })
    chunks.push(chunk)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw Object.assign(new Error('Request body must be valid JSON'), { statusCode: 400 })
  }
}

function parseRange(value, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value ?? '')
  if (!match || (!match[1] && !match[2])) return null

  let start
  let end
  if (!match[1]) {
    const suffixLength = Number(match[2])
    if (!Number.isInteger(suffixLength) || suffixLength <= 0) return null
    start = Math.max(0, size - suffixLength)
    end = size - 1
  } else {
    start = Number(match[1])
    end = match[2] ? Number(match[2]) : size - 1
  }
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start >= size || end < start) return null
  return { start, end: Math.min(end, size - 1) }
}

function streamMedia(req, res, filePath) {
  const size = statSync(filePath).size
  const rangeHeader = req.headers.range
  const commonHeaders = {
    'accept-ranges': 'bytes',
    'cache-control': 'private, max-age=0, must-revalidate',
    'content-type': 'video/mp4',
  }

  if (rangeHeader) {
    const range = parseRange(rangeHeader, size)
    if (!range) {
      send(res, 416, '', { ...commonHeaders, 'content-range': `bytes */${size}` })
      return
    }
    const length = range.end - range.start + 1
    res.writeHead(206, {
      ...commonHeaders,
      'content-length': length,
      'content-range': `bytes ${range.start}-${range.end}/${size}`,
    })
    if (req.method === 'HEAD') return res.end()
    createReadStream(filePath, range).pipe(res)
    return
  }

  res.writeHead(200, { ...commonHeaders, 'content-length': size })
  if (req.method === 'HEAD') return res.end()
  createReadStream(filePath).pipe(res)
}

export function createCuratorRequestHandler(context) {
  const itemMap = new Map(context.items.map((item) => [item.id, item]))

  async function route(req, res) {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')

    if (req.method === 'GET' && url.pathname === '/api/items') {
      sendJson(res, 200, {
        items: context.items.map((item) => publicItem(item, context.selection)),
        summary: selectionSummary(context.selection),
        datasetFingerprint: context.selection.datasetFingerprint,
      })
      return
    }

    if (req.method === 'GET' && url.pathname === '/api/shortlist') {
      const shortlisted = context.items.filter((item) => {
        const status = context.selection.items[item.id].status
        return status === 'include' || status === 'needs_fix'
      })
      sendJson(res, 200, {
        items: shortlisted.map((item) => publicShortlistItem(item, context.selection)),
        total: shortlisted.length,
        repairedCount: shortlisted.filter((item) => item.mediaPaths.repairedAct).length,
        datasetFingerprint: context.selection.datasetFingerprint,
      })
      return
    }

    if (req.method === 'GET' && url.pathname === '/api/export.json') {
      sendJson(res, 200, context.selection, {
        'content-disposition': 'attachment; filename="act-h3-selection.json"',
      })
      return
    }

    if (req.method === 'GET' && url.pathname === '/api/export.csv') {
      send(res, 200, selectionToCsv(context.selection, context.items), {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="act-h3-selection.csv"',
      })
      return
    }

    const selectionMatch = /^\/api\/items\/([^/]+)\/selection$/.exec(url.pathname)
    if (req.method === 'PUT' && selectionMatch) {
      const id = decodeURIComponent(selectionMatch[1])
      const patch = await readJsonBody(req)
      const nextSelection = updateSelection(context.selection, id, patch, context.items)
      await saveSelection(context.selectionPath, nextSelection)
      context.selection = nextSelection
      sendJson(res, 200, {
        id,
        selection: nextSelection.items[id],
        summary: selectionSummary(nextSelection),
      })
      return
    }

    const mediaMatch = /^\/media\/(act|h3|shortlist-act)\/([^/]+)$/.exec(url.pathname)
    if ((req.method === 'GET' || req.method === 'HEAD') && mediaMatch) {
      const [, source, encodedId] = mediaMatch
      const id = decodeURIComponent(encodedId)
      const item = itemMap.get(id)
      const filePath = source === 'shortlist-act'
        ? item?.mediaPaths?.repairedAct || item?.mediaPaths?.act
        : item?.mediaPaths?.[source]
      if (!filePath) return sendJson(res, 404, { error: 'Media not found' })
      streamMedia(req, res, filePath)
      return
    }

    sendJson(res, 404, { error: 'Not found' })
  }

  return (req, res) => {
    route(req, res).catch((error) => {
      if (res.headersSent) {
        res.destroy(error)
        return
      }
      const status = error.statusCode ?? (error.message?.startsWith('Unknown curator sample') ? 404 : 400)
      sendJson(res, status, { error: error.message ?? 'Unexpected curator error' })
    })
  }
}
