import { existsSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { loadCuratorConfig } from './curation-config.mjs'
import {
  buildCuratorItems,
  convertBriefToGroundTruth,
  naturalSampleCompare,
} from './curation-data.mjs'

const privateDatasetTest = existsSync(path.resolve('.curation/config.json')) ? it : it.skip

describe('curation data', () => {
  it('sorts IDs by subtask and numeric suffix', () => {
    expect(['safety_10', 'advertisement_05', 'safety_2'].sort(naturalSampleCompare)).toEqual([
      'advertisement_05',
      'safety_2',
      'safety_10',
    ])
  })

  it('converts the IVBench canvas, layout, and timed overlays', () => {
    const groundTruth = convertBriefToGroundTruth({
      duration_sec: 5,
      _output: { width: 832, height: 480 },
      _layout_spec: {
        subject_region: [0.333, 0, 0.667, 1],
        text_region: [0, 0, 0.333, 1],
      },
      overlay_text: [{
        id: 'headline',
        text: 'Soft Glow, Tiny Footprint',
        time_start: 0.3,
        time_end: 3.6,
      }],
    })

    expect(groundTruth.canvas).toEqual({ width: 832, height: 480 })
    expect(groundTruth.subjectRegion).toEqual({ x: 0.333, y: 0, width: 0.667, height: 1 })
    expect(groundTruth.events[0]).toMatchObject({
      text: 'Soft Glow, Tiny Footprint',
      timeStart: 0.3,
      timeEnd: 3.6,
      region: { x: 0, y: 0, width: 0.333, height: 1 },
    })
  })

  it('keeps no-layout briefs unconstrained', () => {
    const groundTruth = convertBriefToGroundTruth({
      duration_sec: 5,
      _output: { width: 832, height: 480 },
      _layout_spec: { subject_region: null, text_region: null },
      overlay_text: [{ id: 'headline', text: 'Hello', time_start: 0, time_end: 5 }],
    })

    expect(groundTruth.subjectRegion).toBeNull()
    expect(groundTruth.events[0].region).toBeNull()
  })

  privateDatasetTest('builds 200 items with 198 complete pairs from the configured dataset', async () => {
    const items = await buildCuratorItems(loadCuratorConfig())

    expect(items).toHaveLength(200)
    expect(items.filter((item) => item.availability.complete)).toHaveLength(198)
    expect(items.filter((item) => !item.availability.act).map(({ id }) => id)).toEqual([
      'safety_32',
      'travel_06',
    ])
    expect(items.filter((item) => !item.availability.h3)).toHaveLength(0)
    expect(items.filter((item) => item.availability.repairedAct)).toHaveLength(32)
    expect(items.find(({ id }) => id === 'advertisement_07').mediaPaths.repairedAct)
      .toContain('human_study_comment_repair_v5_quality_20260831/run/rendered/advertisement_07/final.mp4')
    expect(items.find(({ id }) => id === 'fun_facts_28').mediaPaths.repairedAct)
      .toContain('human_study_comment_repair_v5_quality_20260831/run/rendered/fun_facts_28/final.mp4')
    expect(items.find(({ id }) => id === 'language_17').mediaPaths.repairedAct)
      .toContain('human_study_comment_repair_v5_quality_20260831/run/rendered/language_17/final.mp4')
    expect(items.find(({ id }) => id === 'nature_intro_16').mediaPaths.repairedAct)
      .toContain('human_study_comment_repair_v5_quality_20260831/run/rendered/nature_intro_16/final.mp4')
    expect(items.find(({ id }) => id === 'advertisement_01').mediaPaths.repairedAct).toBeNull()
    expect(items.find(({ id }) => id === 'fitness_03').mediaPaths.h3).toContain('h3__fit10_t2vfb')
    expect(items.find(({ id }) => id === 'advertisement_01').groundTruth.canvas).toEqual({
      width: 832,
      height: 480,
    })
  }, 30_000)
})
