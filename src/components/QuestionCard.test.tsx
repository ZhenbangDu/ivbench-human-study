import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { QuestionCard } from './QuestionCard';

const labels = ['Left', 'About the same', 'Right'] as const;

describe('QuestionCard alignment', () => {
  it('bottom-anchors every option row when question copy has different heights', () => {
    const { container } = render(
      <section className="questions">
        <QuestionCard
          heading="A heading that wraps onto two lines at the desktop card width"
          hint="Short hint"
          labels={labels}
          value={null}
          onChange={() => undefined}
        />
        <QuestionCard
          heading="Short heading"
          hint="A longer hint that wraps onto two lines at the desktop card width"
          labels={labels}
          value={null}
          onChange={() => undefined}
        />
        <QuestionCard
          heading="Short heading"
          hint="Short hint"
          labels={labels}
          value={null}
          onChange={() => undefined}
        />
      </section>,
    );

    const cards = [...container.querySelectorAll<HTMLElement>('.question-card')];
    const rows = [...container.querySelectorAll<HTMLElement>('.choice-row')];

    expect(cards.map((card) => getComputedStyle(card).display)).toEqual([
      'flex',
      'flex',
      'flex',
    ]);
    expect(rows.map((row) => getComputedStyle(row).marginTop)).toEqual([
      'auto',
      'auto',
      'auto',
    ]);
  });
});
