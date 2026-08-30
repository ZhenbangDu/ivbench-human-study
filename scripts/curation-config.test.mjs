import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { loadCuratorConfig } from './curation-config.mjs'

const temporaryDirectories = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

function createFixture(overrides = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'ivbench-curator-config-'))
  temporaryDirectories.push(root)

  for (const directory of ['act', 'h3', 'h3-fitness']) {
    mkdirSync(path.join(root, directory))
  }
  writeFileSync(path.join(root, 'benchmark.tgz'), 'fixture')

  const configPath = path.join(root, 'config.json')
  writeFileSync(configPath, JSON.stringify({
    actRoot: './act',
    h3Root: './h3',
    h3FitnessRoot: './h3-fitness',
    benchmarkArchive: './benchmark.tgz',
    stateDir: './state',
    port: 4317,
    ...overrides,
  }))

  return { configPath, root }
}

describe('loadCuratorConfig', () => {
  it('loads and resolves every configured path', () => {
    const { configPath, root } = createFixture()

    const config = loadCuratorConfig(configPath)

    expect(config.port).toBe(4317)
    expect(config.host).toBe('127.0.0.1')
    expect(config.actRoot).toBe(path.join(root, 'act'))
    expect(config.h3Root).toBe(path.join(root, 'h3'))
    expect(config.h3FitnessRoot).toBe(path.join(root, 'h3-fitness'))
    expect(config.benchmarkArchive).toBe(path.join(root, 'benchmark.tgz'))
    expect(config.stateDir).toBe(path.join(root, 'state'))
  })

  it('rejects a missing input root with its field name', () => {
    const { configPath } = createFixture({ h3FitnessRoot: './missing' })

    expect(() => loadCuratorConfig(configPath)).toThrow(/h3FitnessRoot/)
  })

  it('rejects ports outside the valid range', () => {
    const { configPath } = createFixture({ port: 70_000 })

    expect(() => loadCuratorConfig(configPath)).toThrow(/port/)
  })
})
