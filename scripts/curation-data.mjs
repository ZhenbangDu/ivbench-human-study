import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const SAMPLE_ID_PATTERN = /^(.*)_(\d+)$/

export function naturalSampleCompare(left, right) {
  const leftMatch = SAMPLE_ID_PATTERN.exec(left)
  const rightMatch = SAMPLE_ID_PATTERN.exec(right)
  if (!leftMatch || !rightMatch) return left.localeCompare(right)

  const subtaskComparison = leftMatch[1].localeCompare(rightMatch[1])
  if (subtaskComparison !== 0) return subtaskComparison
  return Number(leftMatch[2]) - Number(rightMatch[2]) || left.localeCompare(right)
}

function normalizeRegion(value, field) {
  if (value == null) return null
  if (!Array.isArray(value) || value.length !== 4 || value.some((number) => !Number.isFinite(number))) {
    throw new Error(`${field} must be null or an array of four finite numbers`)
  }
  const [x, y, width, height] = value
  if (x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 1.000_001 || y + height > 1.000_001) {
    throw new Error(`${field} must stay inside the normalized canvas`)
  }
  return { x, y, width, height }
}

export function convertBriefToGroundTruth(brief) {
  const width = brief?._output?.width
  const height = brief?._output?.height
  const durationSeconds = brief?._output?.duration_sec ?? brief?.duration_sec
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    throw new Error('Brief _output must contain a positive width and height')
  }
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error('Brief must contain a positive duration')
  }

  const subjectRegion = normalizeRegion(brief?._layout_spec?.subject_region, 'subject_region')
  const textRegion = normalizeRegion(brief?._layout_spec?.text_region, 'text_region')
  const events = (brief.overlay_text ?? []).map((overlay, index) => {
    const timeStart = overlay.time_start
    const timeEnd = overlay.time_end
    if (!Number.isFinite(timeStart) || !Number.isFinite(timeEnd) || timeStart < 0 || timeStart >= timeEnd || timeEnd > durationSeconds) {
      throw new Error(`overlay_text[${index}] has invalid timing`)
    }
    if (typeof overlay.text !== 'string' || overlay.text.length === 0) {
      throw new Error(`overlay_text[${index}] must contain text`)
    }
    return {
      id: String(overlay.id ?? `text_${index + 1}`),
      text: overlay.text,
      timeStart,
      timeEnd,
      region: textRegion,
    }
  })

  return {
    durationSeconds,
    canvas: { width, height },
    subjectRegion,
    events,
  }
}

function archiveFingerprint(archivePath) {
  const stats = statSync(archivePath)
  return `${stats.size}:${Math.trunc(stats.mtimeMs)}`
}

function readJson(filePath, label) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'))
  } catch (error) {
    throw new Error(`Unable to read ${label} at ${filePath}: ${error.message}`)
  }
}

export async function ensureBriefCache(config) {
  const cacheRoot = path.join(config.stateDir, 'cache')
  const benchmarkRoot = path.join(cacheRoot, 'IVBench-500')
  const briefsDirectory = path.join(benchmarkRoot, 'briefs')
  const markerPath = path.join(cacheRoot, 'briefs-fingerprint.txt')
  const fingerprint = archiveFingerprint(config.benchmarkArchive)
  const markerMatches = existsSync(markerPath) && readFileSync(markerPath, 'utf8') === fingerprint

  if (markerMatches && existsSync(briefsDirectory)) return briefsDirectory

  mkdirSync(cacheRoot, { recursive: true })
  rmSync(benchmarkRoot, { force: true, recursive: true })
  const extraction = spawnSync('tar', [
    '-xzf',
    config.benchmarkArchive,
    '-C',
    cacheRoot,
    'IVBench-500/briefs',
  ], { encoding: 'utf8' })
  if (extraction.status !== 0) {
    throw new Error(`Unable to extract IVBench briefs: ${extraction.stderr || extraction.error?.message || 'tar failed'}`)
  }
  writeFileSync(markerPath, fingerprint)
  return briefsDirectory
}

function failureForSample(sampleDirectory) {
  const manifestPath = path.join(sampleDirectory, 'manifest.json')
  if (!existsSync(manifestPath)) return null
  const manifest = readJson(manifestPath, 'ACT manifest')
  const state = manifest?.state?.state
  const reason = manifest?.state?.failure_reason
  return state || reason ? { state: state ?? 'FAILED', reason: reason ?? 'ACT video is unavailable' } : null
}

export async function buildCuratorItems(config) {
  const briefsDirectory = await ensureBriefCache(config)
  const sampleIds = readdirSync(config.actRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && SAMPLE_ID_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort(naturalSampleCompare)

  if (new Set(sampleIds).size !== sampleIds.length) {
    throw new Error('ACT sample IDs must be unique')
  }

  return sampleIds.map((id, order) => {
    const idMatch = SAMPLE_ID_PATTERN.exec(id)
    const sampleDirectory = path.join(config.actRoot, id)
    const actPath = path.join(sampleDirectory, '06_composite', 'final.mp4')
    const repairedActPath = config.repairRoot
      ? path.join(config.repairRoot, 'run', 'rendered', id, 'final.mp4')
      : null
    const h3Base = id.startsWith('fitness_') ? config.h3FitnessRoot : config.h3Root
    const h3Path = path.join(h3Base, `${id}.mp4`)
    const briefPath = path.join(briefsDirectory, `${id}.json`)
    if (!existsSync(briefPath)) throw new Error(`Missing IVBench brief for ${id}`)

    const brief = readJson(briefPath, `IVBench brief ${id}`)
    const actAvailable = existsSync(actPath)
    const repairedActAvailable = repairedActPath !== null && existsSync(repairedActPath)
    const h3Available = existsSync(h3Path)
    return {
      id,
      order,
      subtask: idMatch[1],
      number: Number(idMatch[2]),
      topic: brief.topic ?? '',
      videoGoal: brief.video_goal ?? '',
      groundTruth: convertBriefToGroundTruth(brief),
      availability: {
        act: actAvailable,
        repairedAct: repairedActAvailable,
        h3: h3Available,
        complete: actAvailable && h3Available,
      },
      failure: actAvailable ? null : failureForSample(sampleDirectory),
      mediaPaths: {
        act: actAvailable ? actPath : null,
        repairedAct: repairedActAvailable ? repairedActPath : null,
        h3: h3Available ? h3Path : null,
      },
    }
  })
}

export function curatorDatasetFingerprint(items) {
  const stable = items.map((item) => [item.id, item.availability.act, item.availability.h3])
  return createHash('sha256').update(JSON.stringify(stable)).digest('hex').slice(0, 16)
}
