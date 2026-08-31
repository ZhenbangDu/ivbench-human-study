import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MediaPanel } from './MediaPanel';

describe('MediaPanel', () => {
  it('marks candidate videos for muted autoplay and continuous looping', () => {
    render(
      <MediaPanel
        candidate={{ code: 'v001a', src: 'media/trial_001_a.mp4' }}
        label="Left"
        playing
        time={0}
      />,
    );

    const video = screen.getByLabelText('Left candidate video').querySelector('video');
    expect(video).toHaveAttribute('autoplay');
    expect(video).toHaveAttribute('loop');
    expect(video).toHaveProperty('muted', true);
  });
});
