import { useId } from 'react';
import type { PhysicalChoice } from '../study/session';

type QuestionCardProps = {
  heading: string;
  hint: string;
  labels: readonly [string, string, string];
  value: PhysicalChoice | null;
  onChange: (choice: PhysicalChoice) => void;
};

const choices: PhysicalChoice[] = ['first', 'same', 'second'];

export function QuestionCard({
  heading,
  hint,
  labels,
  value,
  onChange,
}: QuestionCardProps) {
  const headingId = useId();

  return (
    <section
      aria-labelledby={headingId}
      className="question-card"
      role="group"
      style={{ display: 'flex', flexDirection: 'column' }}
    >
      <h2 id={headingId}>{heading}</h2>
      <p>{hint}</p>
      <div className="choice-row" style={{ marginTop: 'auto' }}>
        {choices.map((choice, index) => (
          <button
            className={`choice-button choice-${choice}`}
            type="button"
            key={choice}
            aria-pressed={value === choice}
            onClick={() => onChange(choice)}
          >
            {labels[index]}
          </button>
        ))}
      </div>
    </section>
  );
}
