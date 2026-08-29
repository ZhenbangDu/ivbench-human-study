import type { Trial } from './types';

export type ParticipantSession = {
  sessionId: string;
  participantCode: string;
  nickname: string;
  displayName: string;
  studyVersion: string;
  startedAt: string;
  status: 'in_progress' | 'completed';
  completionCode: string | null;
};

type UuidFactory = () => string;

export function createSession(
  nickname: string,
  studyVersion: string,
  now = new Date(),
  uuidFactory: UuidFactory = () => crypto.randomUUID(),
): ParticipantSession {
  const sessionId = uuidFactory();
  const suffix = sessionId.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase();
  const participantCode = `Participant-${suffix.padStart(6, '0')}`;
  const trimmedNickname = nickname.trim();

  return {
    sessionId,
    participantCode,
    nickname: trimmedNickname,
    displayName: trimmedNickname || participantCode,
    studyVersion,
    startedAt: now.toISOString(),
    status: 'in_progress',
    completionCode: null,
  };
}

export type PhysicalChoice = 'first' | 'same' | 'second';

export function normalizeChoice(choice: PhysicalChoice, trial: Trial): string {
  if (choice === 'same') return 'same';
  return choice === 'first' ? trial.first.code : trial.second.code;
}

export function denormalizeChoice(
  choice: string | null,
  trial: Trial,
): PhysicalChoice | null {
  if (choice === null) return null;
  if (choice === 'same') return 'same';
  if (choice === trial.first.code) return 'first';
  if (choice === trial.second.code) return 'second';
  return null;
}
