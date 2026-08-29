import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { studyManifest } from '../study/manifest';
import '../styles.css';
import { activeGroundTruthEvents, GroundTruth } from './GroundTruth';

describe('activeGroundTruthEvents', () => {
  const config = studyManifest.trials[0].groundTruth;

  it('includes an event at its start and excludes it at its end', () => {
    expect(activeGroundTruthEvents(config, 0.3).map(({ id }) => id)).toEqual(['headline']);
    expect(activeGroundTruthEvents(config, 3.6).map(({ id }) => id)).toEqual(['cta']);
  });

  it('shows overlapping timed text together', () => {
    expect(activeGroundTruthEvents(config, 1.2).map(({ id }) => id)).toEqual([
      'headline',
      'detail',
    ]);
  });

  it('keeps active reference text on one line inside its region', () => {
    render(<GroundTruth config={config} time={1.2} />);
    expect(screen.getByText('Supporting text')).toHaveStyle({
      whiteSpace: 'nowrap',
      fontSize: '7px',
    });
  });
});
