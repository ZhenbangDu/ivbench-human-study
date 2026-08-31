import { describe, expect, it } from 'vitest';
import { studyManifest, validateManifest } from './manifest';

describe('study manifest', () => {
  it('contains 30 fixed, unique formal trials', () => {
    expect(studyManifest.trials).toHaveLength(30);
    expect(new Set(studyManifest.trials.map((trial) => trial.id)).size).toBe(30);
    expect(validateManifest(studyManifest)).toEqual([]);
  });

  it('contains anonymous candidate codes with neutral formal-study media paths', () => {
    for (const [index, trial] of studyManifest.trials.entries()) {
      const item = String(index + 1).padStart(3, '0');
      expect(trial.first.code).toBe(`v${item}a`);
      expect(trial.second.code).toBe(`v${item}b`);
      expect(trial.first.src).toBe(`media/trial_${item}_a.mp4`);
      expect(trial.second.src).toBe(`media/trial_${item}_b.mp4`);
    }
  });

  it('uses the selected samples real layout and timing references', () => {
    expect(studyManifest.trials[0].groundTruth).toEqual({
      durationSeconds: 5,
      canvas: { width: 832, height: 480 },
      subjectRegion: { x: 0.333, y: 0, width: 0.667, height: 1 },
      events: [
        {
          id: 'headline',
          text: 'Soft Glow, Tiny Footprint',
          timeStart: 0.3,
          timeEnd: 3.6,
          region: { x: 0, y: 0, width: 0.333, height: 1 },
        },
        {
          id: 'callout_1',
          text: 'Matte Finish',
          timeStart: 1,
          timeEnd: 3,
          region: { x: 0, y: 0, width: 0.333, height: 1 },
        },
        {
          id: 'cta',
          text: 'Illuminate Your Space',
          timeStart: 3.2,
          timeEnd: 5,
          region: { x: 0, y: 0, width: 0.333, height: 1 },
        },
      ],
    });
  });

  it('rejects malformed event timing and regions', () => {
    const broken = structuredClone(studyManifest);
    broken.trials[0].groundTruth.events[0].timeEnd = 9;
    const subjectRegion = broken.trials[1].groundTruth.subjectRegion;
    if (!subjectRegion) throw new Error('Expected the fixture to have a subject region');
    subjectRegion.x = -0.1;

    expect(validateManifest(broken)).toEqual([
      'trial_001: event headline ends after the trial duration',
      'trial_002: subjectRegion must stay inside the normalized canvas',
    ]);
  });
});
