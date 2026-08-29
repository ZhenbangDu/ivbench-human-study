import { describe, expect, it } from 'vitest';
import source from './Code.gs?raw';

type BackendFunctions = {
  safeCell: (value: unknown) => unknown;
  validatePayload: (value: unknown) => { ok: boolean; error?: string };
};

const backend = Function(
  `${source}\nreturn { safeCell: safeCell, validatePayload: validatePayload };`,
)() as BackendFunctions;

describe('Apps Script payload boundary', () => {
  it('rejects an unknown trial id without reaching Sheets', () => {
    expect(backend.validatePayload({
      requestId: 'response:session-1:trial_999',
      type: 'response',
      payload: {
        sessionId: 'session-1',
        studyVersion: 'act-h3-v1',
        trialId: 'trial_999',
      },
    })).toEqual({ ok: false, error: 'invalid_trial_id' });
  });

  it('accepts a partial response containing an allowed anonymous choice', () => {
    expect(backend.validatePayload({
      requestId: 'response:session-1:trial_001',
      type: 'response',
      payload: {
        sessionId: 'session-1',
        studyVersion: 'act-h3-v1',
        trialId: 'trial_001',
        informationChoice: 'v001a',
        placementChoice: null,
        overallChoice: 'same',
      },
    })).toEqual({ ok: true });
  });

  it('rejects a method label as an answer', () => {
    expect(backend.validatePayload({
      requestId: 'response:session-1:trial_001',
      type: 'response',
      payload: {
        sessionId: 'session-1',
        studyVersion: 'act-h3-v1',
        trialId: 'trial_001',
        informationChoice: 'forbidden-method-label',
        placementChoice: null,
        overallChoice: null,
      },
    })).toEqual({ ok: false, error: 'invalid_choice' });
  });

  it('escapes formula-like cells and leaves ordinary values unchanged', () => {
    expect(backend.safeCell('=IMPORTXML("x")')).toBe("'=IMPORTXML(\"x\")");
    expect(backend.safeCell('+123')).toBe("'+123");
    expect(backend.safeCell('Ada')).toBe('Ada');
    expect(backend.safeCell(12)).toBe(12);
  });
});
