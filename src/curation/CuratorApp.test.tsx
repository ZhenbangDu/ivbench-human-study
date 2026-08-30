import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { CuratorApi, CuratorItem, CuratorPayload, SelectionStatus } from './types';
import { CuratorApp } from './CuratorApp';

function makeItem(
  id: string,
  status: SelectionStatus = 'unreviewed',
  complete = true,
): CuratorItem {
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
    availability: { act: complete, h3: true, complete },
    failure: complete ? null : { state: 'FAILED_REPAIR_BUDGET', reason: 'Bedrock refusal' },
    media: { act: complete ? `/media/act/${id}` : null, h3: `/media/h3/${id}` },
    selection: { status, comment: '', updatedAt: '2026-08-29T00:00:00.000Z' },
  };
}

function summaryFor(items: CuratorItem[]) {
  const summary = {
    unreviewed: 0,
    include: 0,
    exclude: 0,
    needs_fix: 0,
    total: items.length,
    target: 30,
  };
  for (const item of items) summary[item.selection.status] += 1;
  return summary;
}

function fakeApiFor(rawItems: ReturnType<typeof makeItem>[]) {
  const items = rawItems.map((item, order) => ({ ...item, order }));
  let payload: CuratorPayload = {
    items,
    summary: summaryFor(items),
    datasetFingerprint: 'fixture',
  };
  const api: CuratorApi = {
    fetchItems: vi.fn(async () => structuredClone(payload)),
    saveSelection: vi.fn(async (id, patch) => {
      payload = {
        ...payload,
        items: payload.items.map((item) => item.id === id
          ? { ...item, selection: { ...item.selection, ...patch, updatedAt: new Date().toISOString() } }
          : item),
      };
      payload.summary = summaryFor(payload.items);
      return {
        id,
        selection: payload.items.find((item) => item.id === id)!.selection,
        summary: payload.summary,
      };
    }),
  };
  return api;
}

describe('CuratorApp', () => {
  it('shows ACT, ground truth, H3, counts, and the three decisions', async () => {
    const api = fakeApiFor([makeItem('advertisement_01')]);
    render(<CuratorApp api={api} />);

    expect(await screen.findByRole('heading', { name: 'advertisement_01' })).toBeVisible();
    expect(screen.getByText('ACT')).toBeVisible();
    expect(screen.getByText('MiniMax H3')).toBeVisible();
    expect(screen.getByText('Ground Truth')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Include' })).toBeEnabled();
    expect(screen.getByText(/Included: 0 \/ 30/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Exclude' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Needs Fix' })).toBeEnabled();
  });

  it('autosaves comments and preserves them while navigating', async () => {
    const user = userEvent.setup();
    const api = fakeApiFor([makeItem('advertisement_01'), makeItem('science_01')]);
    render(<CuratorApp api={api} />);

    const comment = await screen.findByLabelText('Comment');
    await user.type(comment, 'text overlaps product');
    await waitFor(() => {
      expect(api.saveSelection).toHaveBeenCalledWith('advertisement_01', {
        comment: 'text overlaps product',
      });
    }, { timeout: 1_500 });

    await user.click(screen.getByRole('button', { name: 'Next sample' }));
    expect(await screen.findByRole('heading', { name: 'science_01' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Previous sample' }));
    expect(await screen.findByRole('heading', { name: 'advertisement_01' })).toBeVisible();
    expect(screen.getByLabelText('Comment')).toHaveValue('text overlaps product');
  });

  it('updates the included count as soon as a pair is selected', async () => {
    const user = userEvent.setup();
    const api = fakeApiFor([makeItem('advertisement_01')]);
    render(<CuratorApp api={api} />);

    await user.click(await screen.findByRole('button', { name: 'Include' }));
    expect(await screen.findByText(/Included: 1 \/ 30/)).toBeVisible();
  });

  it('automatically advances after a decision is saved', async () => {
    const user = userEvent.setup();
    const api = fakeApiFor([makeItem('advertisement_01'), makeItem('science_01')]);
    render(<CuratorApp api={api} />);

    await user.click(await screen.findByRole('button', { name: 'Include' }));

    expect(await screen.findByRole('heading', { name: 'science_01' })).toBeVisible();
    expect(screen.getByText(/Included: 1 \/ 30/)).toBeVisible();
  });

  it('automatically loops both videos after entering the next sample', async () => {
    const user = userEvent.setup();
    const api = fakeApiFor([makeItem('advertisement_01'), makeItem('science_01')]);
    const { container } = render(<CuratorApp api={api} />);

    await user.click(await screen.findByRole('button', { name: 'Next sample' }));
    expect(await screen.findByRole('heading', { name: 'science_01' })).toBeVisible();

    const videos = [...container.querySelectorAll('video')];
    expect(videos).toHaveLength(2);
    for (const video of videos) {
      expect(video).toHaveAttribute('autoplay');
      expect(video).toHaveAttribute('loop');
      expect(video).toHaveProperty('muted', true);
    }
    expect(screen.getByRole('button', { name: 'Pause' })).toBeVisible();
  });

  it('disables Include and explains a missing ACT final', async () => {
    const api = fakeApiFor([makeItem('safety_32', 'needs_fix', false)]);
    render(<CuratorApp api={api} />);

    expect(await screen.findByRole('button', { name: 'Include' })).toBeDisabled();
    expect(screen.getByText(/Bedrock refusal/i)).toBeVisible();
    expect(screen.getByText('ACT video unavailable')).toBeVisible();
  });
});
