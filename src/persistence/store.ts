import type { ParticipantSession } from '../study/session';

export type DeviceLayout = 'desktop' | 'portrait' | 'landscape';
export type StoredChoice = string | 'same' | null;

export type TrialResponse = {
  requestId: string;
  sessionId: string;
  studyVersion: string;
  trialId: string;
  itemId: string;
  trialIndex: number;
  firstPositionVideoCode: string;
  secondPositionVideoCode: string;
  informationChoice: StoredChoice;
  placementChoice: StoredChoice;
  overallChoice: StoredChoice;
  replayCount: number;
  elapsedMs: number;
  deviceLayout: DeviceLayout;
  edited: boolean;
  updatedAt: string;
};

export type OutboxItem = {
  requestId: string;
  type: 'session' | 'response';
  payload: ParticipantSession | TrialResponse;
};

type StudyState = {
  studyVersion: string;
  session: ParticipantSession | null;
  currentTrialIndex: number;
  responses: Record<string, TrialResponse>;
  outbox: OutboxItem[];
};

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function initialState(studyVersion: string): StudyState {
  return {
    studyVersion,
    session: null,
    currentTrialIndex: 0,
    responses: {},
    outbox: [],
  };
}

function upsertOutbox(items: OutboxItem[], item: OutboxItem): OutboxItem[] {
  const remaining = items.filter(({ requestId }) => requestId !== item.requestId);
  return [...remaining, item];
}

export class StudyStore {
  private readonly key: string;
  private state: StudyState;

  constructor(
    private readonly storage: StorageLike,
    studyVersion: string,
  ) {
    this.key = `ivbench-human-study:${studyVersion}`;
    this.state = this.load(studyVersion);
  }

  snapshot(): StudyState {
    return structuredClone(this.state);
  }

  startSession(session: ParticipantSession) {
    this.state.session = session;
    this.state.outbox = upsertOutbox(this.state.outbox, {
      requestId: `session:${session.sessionId}`,
      type: 'session',
      payload: session,
    });
    this.persist();
  }

  saveResponse(response: TrialResponse) {
    this.state.responses[response.trialId] = response;
    this.state.outbox = upsertOutbox(this.state.outbox, {
      requestId: response.requestId,
      type: 'response',
      payload: response,
    });
    this.persist();
  }

  setCurrentTrialIndex(index: number) {
    this.state.currentTrialIndex = index;
    this.persist();
  }

  finishSession(completionCode: string) {
    if (!this.state.session) return;
    this.state.session = {
      ...this.state.session,
      status: 'completed',
      completionCode,
    };
    this.state.outbox = upsertOutbox(this.state.outbox, {
      requestId: `session:${this.state.session.sessionId}`,
      type: 'session',
      payload: this.state.session,
    });
    this.persist();
  }

  markSynced(requestId: string) {
    this.state.outbox = this.state.outbox.filter((item) => item.requestId !== requestId);
    this.persist();
  }

  private load(studyVersion: string): StudyState {
    const saved = this.storage.getItem(this.key);
    if (!saved) return initialState(studyVersion);

    try {
      const parsed = JSON.parse(saved) as StudyState;
      if (parsed.studyVersion !== studyVersion) return initialState(studyVersion);
      return parsed;
    } catch {
      return initialState(studyVersion);
    }
  }

  private persist() {
    this.storage.setItem(this.key, JSON.stringify(this.state));
  }
}
