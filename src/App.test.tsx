import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App, choiceLabels } from './App';
import type { StorageLike } from './persistence/store';

class MemoryStorage implements StorageLike {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const appProps = {
  storage: new MemoryStorage(),
  endpoint: '',
  uuidFactory: () => '123e4567-e89b-12d3-a456-426614174000',
};

async function startStudy() {
  const user = userEvent.setup();
  render(<App {...appProps} storage={new MemoryStorage()} />);
  await user.click(screen.getByRole('button', { name: /start study/i }));
  return user;
}

describe('App', () => {
  it('starts with an optional nickname and enters the first of 30 trials', async () => {
    await startStudy();

    expect(screen.getByText('1 / 30')).toBeInTheDocument();
    expect(screen.getByText('Ground Truth')).toBeInTheDocument();
    expect(screen.getByLabelText('Left candidate video').querySelector('video')).toHaveAttribute(
      'src',
      'media/trial_001_a.mp4',
    );
    expect(screen.getByLabelText('Right candidate video').querySelector('video')).toHaveAttribute(
      'src',
      'media/trial_001_b.mp4',
    );
    expect(screen.getByText('Participant-174000')).toBeInTheDocument();
  });

  it('requires all three choices before advancing and saves each choice', async () => {
    const user = await startStudy();
    const next = screen.getByRole('button', { name: /next/i });
    expect(next).toBeDisabled();

    for (const button of screen.getAllByRole('button', { name: 'Left' })) {
      await user.click(button);
    }

    expect(next).toBeEnabled();
    await user.click(next);
    expect(screen.getByText('2 / 30')).toBeInTheDocument();
  });

  it('shows the approved question copy', async () => {
    await startStudy();
    expect(screen.getByText('Which video makes the information easier to read and understand?')).toBeInTheDocument();
    expect(screen.getByText('Which video puts the text in a better place?')).toBeInTheDocument();
    expect(screen.getByText('Which video looks better overall?')).toBeInTheDocument();
  });

  it('clears local study progress and returns to the welcome screen after confirmation', async () => {
    const storage = new MemoryStorage();
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<App {...appProps} storage={storage} />);

    await user.click(screen.getByRole('button', { name: /start study/i }));
    expect(storage.getItem('ivbench-human-study:act-h3-v1')).not.toBeNull();

    await user.click(screen.getByRole('button', { name: /start over/i }));

    expect(screen.getByRole('button', { name: /start study/i })).toBeInTheDocument();
    expect(storage.getItem('ivbench-human-study:act-h3-v1')).toBeNull();
  });

  it('keeps the current study when start over is cancelled', async () => {
    const storage = new MemoryStorage();
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<App {...appProps} storage={storage} />);

    await user.click(screen.getByRole('button', { name: /start study/i }));
    await user.click(screen.getByRole('button', { name: /start over/i }));

    expect(screen.getByText('1 / 30')).toBeInTheDocument();
    expect(storage.getItem('ivbench-human-study:act-h3-v1')).not.toBeNull();
  });
});

describe('choiceLabels', () => {
  it('uses Top and Bottom only in portrait mode', () => {
    expect(choiceLabels('portrait')).toEqual(['Top', 'About the same', 'Bottom']);
    expect(choiceLabels('desktop')).toEqual(['Left', 'About the same', 'Right']);
    expect(choiceLabels('landscape')).toEqual(['Left', 'About the same', 'Right']);
  });
});
