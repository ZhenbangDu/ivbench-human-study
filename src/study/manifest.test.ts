import { describe, expect, it } from 'vitest';
import { studyManifest, validateManifest } from './manifest';

describe('study manifest', () => {
  it('contains 30 fixed, unique formal trials', () => {
    expect(studyManifest.trials).toHaveLength(30);
    expect(new Set(studyManifest.trials.map((trial) => trial.id)).size).toBe(30);
    expect(validateManifest(studyManifest)).toEqual([]);
  });

  it('contains anonymous candidate codes and keeps media empty', () => {
    for (const [index, trial] of studyManifest.trials.entries()) {
      const item = String(index + 1).padStart(3, '0');
      expect(trial.first.code).toBe(`v${item}a`);
      expect(trial.second.code).toBe(`v${item}b`);
      expect(trial.first.src).toBeNull();
      expect(trial.second.src).toBeNull();
    }
  });

  it('rejects malformed event timing and regions', () => {
    const broken = structuredClone(studyManifest);
    broken.trials[0].groundTruth.events[0].timeEnd = 9;
    broken.trials[1].groundTruth.subjectRegion.x = -0.1;

    expect(validateManifest(broken)).toEqual([
      'trial_001: event headline ends after the trial duration',
      'trial_002: subjectRegion must stay inside the normalized canvas',
    ]);
  });
});
