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
  return (
    <fieldset className="question-card">
      <legend>{heading}</legend>
      <p>{hint}</p>
      <div className="choice-row">
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
    </fieldset>
  );
}
