import manifestData from './manifest-data.json';
import type { NormalizedRegion, StudyManifest } from './types';

export const studyManifest = manifestData as StudyManifest;

function regionError(region: NormalizedRegion | null): boolean {
  if (region === null) return false;
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
