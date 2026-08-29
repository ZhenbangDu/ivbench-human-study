import { useState } from 'react';

type WelcomeProps = {
  onStart: (nickname: string) => void;
};

export function Welcome({ onStart }: WelcomeProps) {
  const [nickname, setNickname] = useState('');

  return (
    <main className="welcome-shell">
      <section className="welcome-card">
        <div className="eyebrow">HUMAN STUDY</div>
        <h1>Video Comparison Study</h1>
        <p className="welcome-lead">
          You will compare two short videos with a compact Ground Truth reference.
          The study contains 30 comparisons and saves your progress as you go.
        </p>
        <div className="instruction-grid">
          <div><strong>1</strong><span>Watch both videos</span></div>
          <div><strong>2</strong><span>Check layout and timing</span></div>
          <div><strong>3</strong><span>Answer three questions</span></div>
        </div>
        <label className="nickname-field">
          <span>Nickname <small>(optional)</small></span>
          <input
            autoComplete="nickname"
            maxLength={60}
            onChange={(event) => setNickname(event.target.value)}
            placeholder="Leave blank for an automatic participant code"
            value={nickname}
          />
        </label>
        <button className="primary-action" type="button" onClick={() => onStart(nickname)}>
          Start study
        </button>
        <p className="privacy-note">No email, account, or identifying information is required.</p>
      </section>
    </main>
  );
}
