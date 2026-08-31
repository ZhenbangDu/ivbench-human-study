import { describe, expect, it } from 'vitest'

import { buildFormalStudyPlan } from './formal-study-export.mjs'

function fixtures() {
  const items = Array.from({ length: 30 }, (_, index) => {
    const number = index + 1
    return {
      id: `source_${String(number).padStart(2, '0')}`,
      groundTruth: {
        durationSeconds: 5,
        canvas: { width: 832, height: 480 },
        subjectRegion: null,
        events: [{
          id: 'headline',
          text: `Message ${number}`,
          timeStart: 0.5,
          timeEnd: 4.5,
          region: null,
        }],
      },
      mediaPaths: {
        act: `/source/act_${number}.mp4`,
        h3: `/source/h3_${number}.mp4`,
        repairedAct: number === 1 ? '/source/repaired_act_1.mp4' : null,
      },
    }
  })
  const selection = {
    items: Object.fromEntries(items.map(({ id }) => [id, { status: 'include' }])),
  }
  return { items, selection }
}

describe('formal study export plan', () => {
  it('builds 30 anonymous trials with a private, balanced method map', () => {
    const { items, selection } = fixtures()
    const plan = buildFormalStudyPlan({
      items,
      selection,
      studyVersion: 'act-h3-v1',
      actFirstTrialNumbers: [1, 3, 4, 6, 8, 9, 11, 14, 15, 18, 20, 22, 25, 27, 30],
    })

    expect(plan.manifest.trials).toHaveLength(30)
    expect(plan.copies).toHaveLength(60)
    expect(plan.methodMap).toHaveLength(60)
    expect(plan.copies.filter(({ method, targetName }) => method === 'ACT' && /_a\.mp4$/.test(targetName))).toHaveLength(15)
    expect(plan.copies.filter(({ method, targetName }) => method === 'MiniMax H3' && /_a\.mp4$/.test(targetName))).toHaveLength(15)

    expect(plan.manifest.trials[0]).toEqual({
      id: 'trial_001',
      itemId: 'sample_001',
      first: { code: 'v001a', src: 'media/trial_001_a.mp4' },
      second: { code: 'v001b', src: 'media/trial_001_b.mp4' },
      groundTruth: items[0].groundTruth,
    })
    expect(plan.copies.slice(0, 2)).toEqual([
      {
        sourcePath: '/source/repaired_act_1.mp4',
        targetName: 'trial_001_a.mp4',
        trialId: 'trial_001',
        videoCode: 'v001a',
        method: 'ACT',
        sourceItemId: 'source_01',
      },
      {
        sourcePath: '/source/h3_1.mp4',
        targetName: 'trial_001_b.mp4',
        trialId: 'trial_001',
        videoCode: 'v001b',
        method: 'MiniMax H3',
        sourceItemId: 'source_01',
      },
    ])
    expect(plan.methodMap[0]).toEqual({
      studyVersion: 'act-h3-v1',
      trialId: 'trial_001',
      videoCode: 'v001a',
      method: 'ACT',
      sourcePath: 'ivbench://source_01/act',
    })
  })

  it('rejects a shortlist other than exactly 30 selected pairs', () => {
    const { items, selection } = fixtures()
    selection.items.source_30.status = 'exclude'

    expect(() => buildFormalStudyPlan({
      items,
      selection,
      studyVersion: 'act-h3-v1',
      actFirstTrialNumbers: [1, 3, 4, 6, 8, 9, 11, 14, 15, 18, 20, 22, 25, 27, 30],
    })).toThrow('Expected exactly 30 selected pairs, found 29')
  })

  it('rejects an unbalanced physical-position assignment', () => {
    const { items, selection } = fixtures()

    expect(() => buildFormalStudyPlan({
      items,
      selection,
      studyVersion: 'act-h3-v1',
      actFirstTrialNumbers: [1, 2],
    })).toThrow('Expected ACT to appear first in exactly 15 trials')
  })
})
