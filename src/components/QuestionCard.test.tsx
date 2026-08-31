import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '../styles.css';
import { QuestionCard } from './QuestionCard';

const labels = ['Left', 'About the same', 'Right'] as const;

function getRuleProperty(selector: string, property: string, media?: string) {
  const topLevelRules = [...document.styleSheets].flatMap((sheet) => [...sheet.cssRules]);
  const rules = media
    ? [...((topLevelRules.find(
        (candidate) => (candidate as CSSMediaRule).conditionText === media,
      ) as CSSMediaRule | undefined)?.cssRules ?? [])]
    : topLevelRules;
  const rule = rules.find(
    (candidate) => (candidate as CSSStyleRule).selectorText === selector,
  ) as CSSStyleRule | undefined;

  return rule?.style.getPropertyValue(property);
}

describe('QuestionCard alignment', () => {
  it('keeps the question and hint comfortably readable without enlarging the controls', () => {
    render(
      <QuestionCard
        heading="Short heading"
        hint="Short hint"
        labels={labels}
        value={null}
        onChange={() => undefined}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Short heading' })).toBeVisible();
    expect(screen.getByText('Short hint')).toBeVisible();
    expect(getRuleProperty('.question-card h2', 'font-size')).toBe(
      'clamp(17px, 1.12vw, 20px)',
    );
    expect(getRuleProperty('.question-card p', 'font-size')).toBe(
      'clamp(14px, 0.92vw, 16px)',
    );
    expect(getRuleProperty('.choice-button', 'font-size')).toBe('14px');
    expect(
      getRuleProperty(
        '.question-card h2',
        'font-size',
        '(max-width: 700px) and (orientation: portrait)',
      ),
    ).toBe('17px');
    expect(
      getRuleProperty(
        '.question-card p',
        'font-size',
        '(max-width: 700px) and (orientation: portrait)',
      ),
    ).toBe('14px');
    expect(
      getRuleProperty(
        '.question-card h2',
        'font-size',
        '(max-height: 560px) and (orientation: landscape)',
      ),
    ).toBe('14px');
    expect(
      getRuleProperty(
        '.question-card p',
        'font-size',
        '(max-height: 560px) and (orientation: landscape)',
      ),
    ).toBe('11px');
  });

  it('uses a standard flex group instead of fieldset legend layout', () => {
    render(
      <QuestionCard
        heading="Short heading"
        hint="Short hint"
        labels={labels}
        value={null}
        onChange={() => undefined}
      />,
    );

    expect(screen.getByRole('group', { name: 'Short heading' }).tagName).toBe('SECTION');
  });

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

  it('gives the selected option a clearly visible outline', () => {
    render(
      <QuestionCard
        heading="Choose a video"
        hint="Pick one option"
        labels={labels}
        value="first"
        onChange={() => undefined}
      />,
    );

    const selected = screen.getByRole('button', { name: 'Left' });
    const unselected = screen.getByRole('button', { name: 'Right' });
    expect(getComputedStyle(selected).outlineStyle).toBe('solid');
    expect(parseFloat(getComputedStyle(selected).outlineWidth)).toBeGreaterThanOrEqual(3);
    expect(getComputedStyle(unselected).outlineStyle).not.toBe('solid');
  });
});
