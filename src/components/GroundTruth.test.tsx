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

  it('uses the supplied canvas aspect ratio', () => {
    render(
      <GroundTruth
        config={{ ...config, canvas: { width: 832, height: 480 } }}
        time={1.2}
      />,
    );

    expect(screen.getByTestId('ground-truth-canvas')).toHaveStyle({
      aspectRatio: '832 / 480',
    });
  });

  it('labels layouts without spatial constraints instead of inventing boxes', () => {
    render(
      <GroundTruth
        config={{
          ...config,
          subjectRegion: null,
          events: config.events.map((event) => ({ ...event, region: null })),
        }}
        time={1.2}
      />,
    );

    expect(screen.getByText('UNCONSTRAINED')).toBeInTheDocument();
    expect(screen.queryByText('SUBJECT')).not.toBeInTheDocument();
  });
});
