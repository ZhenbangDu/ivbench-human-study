import { randomUUID } from 'node:crypto'
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
  fsyncSync,
} from 'node:fs'
import path from 'node:path'

export const SELECTION_STATUSES = ['unreviewed', 'include', 'exclude', 'needs_fix']
const STATUS_SET = new Set(SELECTION_STATUSES)
const ALLOWED_PATCH_FIELDS = new Set(['status', 'comment'])

function now() {
  return new Date().toISOString()
}

function initialRecord(item, timestamp) {
  return {
    status: item.availability.complete ? 'unreviewed' : 'needs_fix',
    comment: '',
    updatedAt: timestamp,
  }
}

export function createDefaultSelection(items, fingerprint) {
  const timestamp = now()
  return {
    schemaVersion: 1,
    datasetFingerprint: fingerprint,
    updatedAt: timestamp,
    items: Object.fromEntries(items.map((item) => [item.id, initialRecord(item, timestamp)])),
  }
}

function validateRecord(record, id) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new Error(`Invalid selection record for ${id}`)
  }
  if (!STATUS_SET.has(record.status)) {
    throw new Error(`Invalid selection status for ${id}`)
  }
  if (typeof record.comment !== 'string' || Array.from(record.comment).length > 10_000) {
    throw new Error(`Invalid selection comment for ${id}`)
  }
  if (typeof record.updatedAt !== 'string') {
    throw new Error(`Invalid selection timestamp for ${id}`)
  }
}

export function loadSelection(filePath, items, fingerprint) {
  if (!existsSync(filePath)) return createDefaultSelection(items, fingerprint)

  let stored
  try {
    stored = JSON.parse(readFileSync(filePath, 'utf8'))
  } catch (error) {
    throw new Error(`Unable to read selection file ${filePath}: ${error.message}`)
  }
  if (stored?.schemaVersion !== 1 || !stored.items || typeof stored.items !== 'object') {
    throw new Error(`Invalid selection file schema at ${filePath}`)
  }

  const merged = createDefaultSelection(items, fingerprint)
  for (const item of items) {
    const record = stored.items[item.id]
    if (!record) continue
    validateRecord(record, item.id)
    if (record.status === 'include' && !item.availability.complete) {
      throw new Error(`Invalid selection file: ${item.id} is included but its pair is incomplete`)
    }
    merged.items[item.id] = { ...record }
  }
  merged.updatedAt = typeof stored.updatedAt === 'string' ? stored.updatedAt : merged.updatedAt
  return merged
}

export async function saveSelection(filePath, document) {
  const directory = path.dirname(filePath)
  mkdirSync(directory, { recursive: true })
  const temporaryPath = path.join(directory, `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`)
  let descriptor
  try {
    descriptor = openSync(temporaryPath, 'wx', 0o600)
    writeFileSync(descriptor, `${JSON.stringify(document, null, 2)}\n`, 'utf8')
    fsyncSync(descriptor)
    closeSync(descriptor)
    descriptor = undefined
    renameSync(temporaryPath, filePath)
  } catch (error) {
    if (descriptor !== undefined) closeSync(descriptor)
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath)
    throw error
  }
}

export function updateSelection(document, id, patch, items) {
  const item = items.find((candidate) => candidate.id === id)
  if (!item) throw new Error(`Unknown curator sample: ${id}`)
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new Error('Selection update must be an object')
  }
  const unknownFields = Object.keys(patch).filter((field) => !ALLOWED_PATCH_FIELDS.has(field))
  if (unknownFields.length > 0) {
    throw new Error(`Unknown selection fields: ${unknownFields.join(', ')}`)
  }

  const current = document.items[id]
  const status = patch.status ?? current.status
  const comment = patch.comment ?? current.comment
  if (!STATUS_SET.has(status)) throw new Error(`Invalid selection status: ${status}`)
  if (typeof comment !== 'string') throw new Error('Selection comment must be a string')
  if (Array.from(comment).length > 10_000) throw new Error('Selection comment exceeds 10000 characters')
  if (status === 'include' && !item.availability.complete) {
    const missing = [!item.availability.act && 'ACT', !item.availability.h3 && 'H3'].filter(Boolean).join(' and ')
    throw new Error(`Cannot include ${id}: missing ${missing} video`)
  }

  const timestamp = now()
  return {
    ...document,
    updatedAt: timestamp,
    items: {
      ...document.items,
      [id]: { status, comment, updatedAt: timestamp },
    },
  }
}

function csvCell(value) {
  const text = String(value ?? '')
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function selectionToCsv(document, items) {
  const rows = [
    ['id', 'subtask', 'status', 'comment', 'act_available', 'h3_available', 'updated_at'],
    ...items.map((item) => {
      const record = document.items[item.id]
      return [
        item.id,
        item.subtask,
        record.status,
        record.comment,
        item.availability.act,
        item.availability.h3,
        record.updatedAt,
      ]
    }),
  ]
  return `${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`
}

export function selectionSummary(document) {
  const counts = Object.fromEntries(SELECTION_STATUSES.map((status) => [status, 0]))
  for (const record of Object.values(document.items)) counts[record.status] += 1
  return { ...counts, total: Object.keys(document.items).length, target: 30 }
}
