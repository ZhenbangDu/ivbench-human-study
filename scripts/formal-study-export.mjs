import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { loadCuratorConfig } from './curation-config.mjs'
import { buildCuratorItems } from './curation-data.mjs'

const FORMAL_STATUSES = new Set(['include', 'needs_fix'])

function candidate(method, sourcePath) {
  return { method, sourcePath }
}

function csvCell(value) {
  const text = String(value ?? '')
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function methodMapCsv(rows) {
  const headers = ['study_version', 'trial_id', 'video_code', 'method', 'source_path']
  const body = rows.map((row) => [
    row.studyVersion,
    row.trialId,
    row.videoCode,
    row.method,
    row.sourcePath,
  ].map(csvCell).join(','))
  return `${[headers.join(','), ...body].join('\n')}\n`
}

export function buildFormalStudyPlan({
  items,
  selection,
  studyVersion,
  actFirstTrialNumbers,
  title = 'Video Comparison Study',
}) {
  const selected = items.filter(({ id }) => FORMAL_STATUSES.has(selection.items[id]?.status))
  if (selected.length !== 30) {
    throw new Error(`Expected exactly 30 selected pairs, found ${selected.length}`)
  }

  const actFirst = new Set(actFirstTrialNumbers)
  if (actFirst.size !== 15) {
    throw new Error('Expected ACT to appear first in exactly 15 trials')
  }
  for (const number of actFirst) {
    if (!Number.isInteger(number) || number < 1 || number > 30) {
      throw new Error(`Invalid ACT-first trial number: ${number}`)
    }
  }

  const copies = []
  const methodMap = []
  const trials = selected.map((item, index) => {
    const number = index + 1
    const padded = String(number).padStart(3, '0')
    const trialId = `trial_${padded}`
    const actPath = item.mediaPaths.repairedAct || item.mediaPaths.act
    if (!actPath || !item.mediaPaths.h3) {
      throw new Error(`${item.id}: both ACT and MiniMax H3 media are required`)
    }
    if (!item.groundTruth) {
      throw new Error(`${item.id}: Ground Truth is required`)
    }

    const ordered = actFirst.has(number)
      ? [candidate('ACT', actPath), candidate('MiniMax H3', item.mediaPaths.h3)]
      : [candidate('MiniMax H3', item.mediaPaths.h3), candidate('ACT', actPath)]

    const publicCandidates = ordered.map((entry, positionIndex) => {
      const suffix = positionIndex === 0 ? 'a' : 'b'
      const videoCode = `v${padded}${suffix}`
      const targetName = `trial_${padded}_${suffix}.mp4`
      const copy = {
        sourcePath: entry.sourcePath,
        targetName,
        trialId,
        videoCode,
        method: entry.method,
        sourceItemId: item.id,
      }
      copies.push(copy)
      methodMap.push({
        studyVersion,
        trialId,
        videoCode,
        method: entry.method,
        sourcePath: `ivbench://${item.id}/${entry.method === 'ACT' ? 'act' : 'h3'}`,
      })
      return { code: videoCode, src: `media/${targetName}` }
    })

    return {
      id: trialId,
      itemId: `sample_${padded}`,
      first: publicCandidates[0],
      second: publicCandidates[1],
      groundTruth: item.groundTruth,
    }
  })

  return {
    manifest: { studyVersion, title, trials },
    copies,
    methodMap,
  }
}

async function sha256(filePath) {
  const contents = await readFile(filePath)
  return createHash('sha256').update(contents).digest('hex')
}

export async function writeFormalStudyPlan(plan, {
  publicMediaDir,
  manifestPath,
  methodMapPath,
  receiptPath,
}) {
  await mkdir(publicMediaDir, { recursive: true })
  await mkdir(path.dirname(manifestPath), { recursive: true })
  await mkdir(path.dirname(methodMapPath), { recursive: true })

  const receiptCopies = []
  for (const entry of plan.copies) {
    const targetPath = path.join(publicMediaDir, entry.targetName)
    await copyFile(entry.sourcePath, targetPath)
    receiptCopies.push({ ...entry, targetPath, sha256: await sha256(targetPath) })
  }

  await writeFile(manifestPath, `${JSON.stringify(plan.manifest, null, 2)}\n`)
  await writeFile(methodMapPath, methodMapCsv(plan.methodMap))
  await writeFile(receiptPath, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    studyVersion: plan.manifest.studyVersion,
    trialCount: plan.manifest.trials.length,
    copies: receiptCopies,
  }, null, 2)}\n`)
}

async function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const curatorConfig = loadCuratorConfig()
  const items = await buildCuratorItems(curatorConfig)
  const selection = JSON.parse(await readFile(
    path.join(curatorConfig.stateDir, 'act-h3-selection.json'),
    'utf8',
  ))
  const exportConfig = JSON.parse(await readFile(
    path.join(curatorConfig.stateDir, 'study-export-config.json'),
    'utf8',
  ))
  const plan = buildFormalStudyPlan({ items, selection, ...exportConfig })

  await writeFormalStudyPlan(plan, {
    publicMediaDir: path.join(repoRoot, 'public', 'media'),
    manifestPath: path.join(repoRoot, 'src', 'study', 'manifest-data.json'),
    methodMapPath: path.join(curatorConfig.stateDir, 'method-map.csv'),
    receiptPath: path.join(curatorConfig.stateDir, 'study-export-receipt.json'),
  })
  console.log(`Exported ${plan.manifest.trials.length} trials and ${plan.copies.length} videos.`)
  console.log(`Private method map: ${path.join(curatorConfig.stateDir, 'method-map.csv')}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.stack ?? error.message ?? error)
    process.exitCode = 1
  })
}
