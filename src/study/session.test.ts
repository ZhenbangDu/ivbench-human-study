import { describe, expect, it } from 'vitest';
import { studyManifest } from './manifest';
import { createSession, normalizeChoice } from './session';

describe('participant session', () => {
  it('uses a readable participant code when nickname is blank', () => {
    const session = createSession(
      '   ',
      studyManifest.studyVersion,
      new Date('2026-08-28T12:00:00Z'),
      () => '123e4567-e89b-12d3-a456-426614174000',
    );

    expect(session.displayName).toBe('Participant-174000');
    expect(session.participantCode).toBe('Participant-174000');
    expect(session.nickname).toBe('');
    expect(session.sessionId).toBe('123e4567-e89b-12d3-a456-426614174000');
    expect(session.status).toBe('in_progress');
  });

  it('trims and displays a supplied nickname', () => {
    const session = createSession(
      '  Ada  ',
      studyManifest.studyVersion,
      new Date('2026-08-28T12:00:00Z'),
      () => '123e4567-e89b-12d3-a456-426614174000',
    );

    expect(session.nickname).toBe('Ada');
    expect(session.displayName).toBe('Ada');
  });

  it('normalizes physical choices to anonymous video codes', () => {
    const trial = studyManifest.trials[0];
    expect(normalizeChoice('first', trial)).toBe('v001a');
    expect(normalizeChoice('same', trial)).toBe('same');
    expect(normalizeChoice('second', trial)).toBe('v001b');
  });
});
