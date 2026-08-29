import type {
  GroundTruthConfig,
  NormalizedRegion,
  StudyManifest,
} from './types';

const leftSubject: NormalizedRegion = {
  x: 0.06,
  y: 0.16,
  width: 0.47,
  height: 0.7,
};

const rightSubject: NormalizedRegion = {
  x: 0.47,
  y: 0.16,
  width: 0.47,
  height: 0.7,
};

function groundTruthFor(index: number): GroundTruthConfig {
  const subjectOnRight = index % 2 === 1;
  const textX = subjectOnRight ? 0.07 : 0.57;

  return {
    durationSeconds: 5,
    canvas: { width: 16, height: 9 },
    subjectRegion: { ...(subjectOnRight ? rightSubject : leftSubject) },
    events: [
      {
        id: 'headline',
        text: 'Primary message',
        timeStart: 0.3,
        timeEnd: 3.6,
        region: { x: textX, y: 0.2, width: 0.36, height: 0.2 },
      },
      {
        id: 'detail',
        text: 'Supporting text',
        timeStart: 1,
        timeEnd: 3,
        region: { x: textX, y: 0.47, width: 0.36, height: 0.15 },
      },
      {
        id: 'cta',
        text: 'Call to action',
        timeStart: 3.2,
        timeEnd: 5,
        region: { x: textX, y: 0.68, width: 0.32, height: 0.13 },
      },
    ],
  };
}

export const studyManifest: StudyManifest = {
  studyVersion: 'act-h3-v1',
  title: 'Video Comparison Study',
  trials: Array.from({ length: 30 }, (_, index) => {
    const number = index + 1;
    const item = String(number).padStart(3, '0');
    return {
      id: `trial_${item}`,
      itemId: `item_${item}`,
      first: { code: `v${item}a`, src: null },
      second: { code: `v${item}b`, src: null },
      groundTruth: groundTruthFor(number),
    };
  }),
};

function regionError(region: NormalizedRegion): boolean {
  return (
    region.x < 0 ||
    region.y < 0 ||
    region.width <= 0 ||
    region.height <= 0 ||
    region.x + region.width > 1 ||
    region.y + region.height > 1
  );
}

export function validateManifest(manifest: StudyManifest): string[] {
  const errors: string[] = [];

  if (manifest.trials.length !== 30) {
    errors.push('Expected exactly 30 formal trials');
  }

  if (new Set(manifest.trials.map(({ id }) => id)).size !== manifest.trials.length) {
    errors.push('Trial IDs must be unique');
  }

  for (const trial of manifest.trials) {
    const { groundTruth } = trial;
    if (regionError(groundTruth.subjectRegion)) {
      errors.push(`${trial.id}: subjectRegion must stay inside the normalized canvas`);
    }

    for (const event of groundTruth.events) {
      if (event.timeStart < 0 || event.timeStart >= event.timeEnd) {
        errors.push(`${trial.id}: event ${event.id} has invalid timing`);
      } else if (event.timeEnd > groundTruth.durationSeconds) {
        errors.push(`${trial.id}: event ${event.id} ends after the trial duration`);
      }
      if (regionError(event.region)) {
        errors.push(`${trial.id}: event ${event.id} must stay inside the normalized canvas`);
      }
    }
  }

  return errors;
}
