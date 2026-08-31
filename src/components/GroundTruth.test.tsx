import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { GroundTruthConfig } from '../study/types';
import '../styles.css';
import { activeGroundTruthEvents, GroundTruth } from './GroundTruth';

describe('activeGroundTruthEvents', () => {
  const textRegion = { x: 0.07, y: 0.2, width: 0.38, height: 0.42 };
  const config: GroundTruthConfig = {
    durationSeconds: 5,
    canvas: { width: 832, height: 480 },
    subjectRegion: { x: 0.47, y: 0.16, width: 0.47, height: 0.7 },
    events: [
      {
        id: 'headline',
        text: 'Primary message',
        timeStart: 0.3,
        timeEnd: 3.6,
        region: textRegion,
      },
      {
        id: 'detail',
        text: 'Supporting text',
        timeStart: 1,
        timeEnd: 3,
        region: textRegion,
      },
      {
        id: 'cta',
        text: 'Call to action',
        timeStart: 3.2,
        timeEnd: 5,
        region: { x: 0.07, y: 0.68, width: 0.32, height: 0.13 },
      },
    ],
  };

  it('includes an event at its start and excludes it at its end', () => {
    expect(activeGroundTruthEvents(config, 0.3).map(({ id }) => id)).toEqual(['headline']);
    expect(activeGroundTruthEvents(config, 3.6).map(({ id }) => id)).toEqual(['cta']);
  });

  it('advances through text phases without falling back to an earlier message', () => {
    expect(activeGroundTruthEvents(config, 0.5).map(({ id }) => id)).toEqual(['headline']);
    expect(activeGroundTruthEvents(config, 1.2).map(({ id }) => id)).toEqual(['detail']);
    expect(activeGroundTruthEvents(config, 3.1).map(({ id }) => id)).toEqual([]);
    expect(activeGroundTruthEvents(config, 3.3).map(({ id }) => id)).toEqual(['cta']);
  });

  it('finds the latest text phase regardless of source array order', () => {
    const unordered = {
      ...config,
      events: [config.events[2], config.events[1], config.events[0]],
    };

    expect(activeGroundTruthEvents(unordered, 1.2).map(({ id }) => id)).toEqual(['detail']);
  });

  it('does not replay an entrance animation when timed text changes', () => {
    render(<GroundTruth config={config} time={1.2} />);

    expect(getComputedStyle(screen.getByTestId('ground-truth-text-region')).animation)
      .not.toContain('gt-in');
  });

  it('keeps a layout region mounted while its timed message changes', () => {
    const sequential = {
      ...config,
      events: [
        { ...config.events[0], id: 'first', timeStart: 0, timeEnd: 1 },
        { ...config.events[0], id: 'second', timeStart: 1, timeEnd: 2 },
      ],
    };
    const { rerender } = render(<GroundTruth config={sequential} time={0.5} />);
    const originalRegion = screen.getByTestId('ground-truth-text-region');

    rerender(<GroundTruth config={sequential} time={1.5} />);

    expect(screen.getByTestId('ground-truth-text-region')).toBe(originalRegion);
  });

  it('uses readable type sizes for the reference labels', () => {
    render(<GroundTruth config={config} time={1.2} />);

    expect(parseFloat(getComputedStyle(screen.getByText('Supporting text')).fontSize))
      .toBeGreaterThanOrEqual(11);
    expect(parseFloat(getComputedStyle(screen.getByText('SUBJECT')).fontSize))
      .toBeGreaterThanOrEqual(12);
  });

  it('allows reference text to wrap inside its region', () => {
    render(<GroundTruth config={config} time={1.2} />);

    expect(getComputedStyle(screen.getByText('Supporting text')).whiteSpace).toBe('normal');
  });

  it('stacks simultaneous text events that share one layout region', () => {
    const simultaneous = {
      ...config,
      events: [
        config.events[0],
        { ...config.events[1], timeStart: config.events[0].timeStart },
      ],
    };
    render(<GroundTruth config={simultaneous} time={1.2} />);

    const regions = screen.getAllByTestId('ground-truth-text-region');
    expect(regions).toHaveLength(1);
    expect(regions[0]).toHaveTextContent('Primary message');
    expect(regions[0]).toHaveTextContent('Supporting text');
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
