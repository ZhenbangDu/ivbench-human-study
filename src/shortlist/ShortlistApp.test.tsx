import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ShortlistApp } from './ShortlistApp';
import type { ShortlistApi, ShortlistItem } from './types';

function makeItem(
  id: string,
  status: 'include' | 'needs_fix',
  actSource: 'repaired' | 'original',
  comment = '',
): ShortlistItem {
  const subtask = id.replace(/_\d+$/, '');
  return {
    id,
    order: 0,
    subtask,
    number: 1,
    topic: `Topic for ${id}`,
    videoGoal: `Goal for ${id}`,
    groundTruth: {
      durationSeconds: 5,
      canvas: { width: 832, height: 480 },
      subjectRegion: { x: 0.333, y: 0, width: 0.667, height: 1 },
      events: [{
        id: 'headline',
        text: 'Readable headline',
        timeStart: 0,
        timeEnd: 5,
        region: { x: 0, y: 0, width: 0.333, height: 1 },
      }],
    },
    availability: { act: true, repairedAct: actSource === 'repaired', h3: true, complete: true },
    failure: null,
    media: { act: `/media/shortlist-act/${id}`, h3: `/media/h3/${id}` },
    selection: { status, comment, updatedAt: '2026-08-30T00:00:00.000Z' },
    actSource,
  };
}

function fakeApiFor(rawItems: ShortlistItem[]): ShortlistApi {
  const items = rawItems.map((item, order) => ({ ...item, order }));
  return {
    fetchShortlist: vi.fn(async () => ({
      items,
      total: items.length,
      repairedCount: items.filter((item) => item.actSource === 'repaired').length,
      datasetFingerprint: 'fixture',
    })),
  };
}

describe('ShortlistApp', () => {
  it('shows the read-only ACT, ground truth, H3 comparison and curator note', async () => {
    const api = fakeApiFor([
      makeItem('advertisement_07', 'needs_fix', 'repaired', 'remove the black background'),
    ]);

    render(<ShortlistApp api={api} />);

    expect(await screen.findByRole('heading', { name: 'advertisement_07' })).toBeVisible();
    expect(screen.getByText('Current shortlist')).toBeVisible();
    expect(screen.getByText('1 selected')).toBeVisible();
    expect(screen.getByText('ACT · Repaired')).toBeVisible();
    expect(screen.getByText('MiniMax H3')).toBeVisible();
    expect(screen.getByText('Ground Truth')).toBeVisible();
    expect(screen.getByText('Goal for advertisement_07')).toBeVisible();
    expect(screen.getByText('remove the black background')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Include' })).not.toBeInTheDocument();
  });

  it('filters the shortlist by status and subtask', async () => {
    const user = userEvent.setup();
    const api = fakeApiFor([
      makeItem('advertisement_07', 'needs_fix', 'repaired'),
      makeItem('science_29', 'include', 'repaired'),
      makeItem('science_50', 'include', 'repaired'),
    ]);

    render(<ShortlistApp api={api} />);
    await screen.findByRole('heading', { name: 'advertisement_07' });

    await user.selectOptions(screen.getByLabelText('Status'), 'include');
    expect(screen.queryByRole('button', { name: /advertisement_07/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /science_29/ })).toBeVisible();

    await user.selectOptions(screen.getByLabelText('Subtask'), 'science');
    expect(screen.getByText('2 shown')).toBeVisible();
  });

  it('navigates to the next pair with both videos looping', async () => {
    const user = userEvent.setup();
    const api = fakeApiFor([
      makeItem('advertisement_07', 'needs_fix', 'repaired'),
      makeItem('science_29', 'include', 'original'),
    ]);
    const { container } = render(<ShortlistApp api={api} />);

    await user.click(await screen.findByRole('button', { name: 'Next sample' }));
    expect(await screen.findByRole('heading', { name: 'science_29' })).toBeVisible();
    expect(screen.getByText('ACT · Original')).toBeVisible();

    const videos = [...container.querySelectorAll('video')];
    expect(videos).toHaveLength(2);
    for (const video of videos) {
      expect(video).toHaveAttribute('autoplay');
      expect(video).toHaveAttribute('loop');
      expect(video).toHaveProperty('muted', true);
    }
  });
});
