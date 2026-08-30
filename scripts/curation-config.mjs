import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const DEFAULT_CONFIG_PATH = path.resolve('.curation/config.json')

function readJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'))
  } catch (error) {
    throw new Error(`Unable to read curator config at ${filePath}: ${error.message}`)
  }
}

function resolveConfiguredPath(value, field, baseDirectory, expectedType) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Curator config field ${field} must be a non-empty path`)
  }

  const resolved = path.resolve(baseDirectory, value)
  let stats
  try {
    stats = statSync(resolved)
  } catch {
    throw new Error(`Curator config field ${field} does not exist: ${resolved}`)
  }

  const isExpectedType = expectedType === 'directory' ? stats.isDirectory() : stats.isFile()
  if (!isExpectedType) {
    throw new Error(`Curator config field ${field} must point to a ${expectedType}: ${resolved}`)
  }
  return resolved
}

export function loadCuratorConfig(configPath = DEFAULT_CONFIG_PATH) {
  const resolvedConfigPath = path.resolve(configPath)
  const baseDirectory = path.dirname(resolvedConfigPath)
  const raw = readJson(resolvedConfigPath)
  const port = raw.port ?? 4317

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('Curator config field port must be an integer between 1 and 65535')
  }
  if (raw.host !== undefined && raw.host !== '127.0.0.1') {
    throw new Error('Curator config field host must be 127.0.0.1')
  }
  if (typeof raw.stateDir !== 'string' || raw.stateDir.trim() === '') {
    throw new Error('Curator config field stateDir must be a non-empty path')
  }

  return {
    host: '127.0.0.1',
    port,
    actRoot: resolveConfiguredPath(raw.actRoot, 'actRoot', baseDirectory, 'directory'),
    h3Root: resolveConfiguredPath(raw.h3Root, 'h3Root', baseDirectory, 'directory'),
    h3FitnessRoot: resolveConfiguredPath(raw.h3FitnessRoot, 'h3FitnessRoot', baseDirectory, 'directory'),
    repairRoot: raw.repairRoot === undefined
      ? null
      : resolveConfiguredPath(raw.repairRoot, 'repairRoot', baseDirectory, 'directory'),
    benchmarkArchive: resolveConfiguredPath(raw.benchmarkArchive, 'benchmarkArchive', baseDirectory, 'file'),
    stateDir: path.resolve(baseDirectory, raw.stateDir),
    configPath: resolvedConfigPath,
  }
}
