export type NormalizedRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type GroundTruthEvent = {
  id: string;
  text: string;
  timeStart: number;
  timeEnd: number;
  region: NormalizedRegion | null;
};

export type GroundTruthConfig = {
  durationSeconds: number;
  canvas: { width: number; height: number };
  subjectRegion: NormalizedRegion | null;
  events: GroundTruthEvent[];
};

export type CandidateVideo = {
  code: string;
  src: string | null;
};

export type Trial = {
  id: string;
  itemId: string;
  first: CandidateVideo;
  second: CandidateVideo;
  groundTruth: GroundTruthConfig;
};

export type StudyManifest = {
  studyVersion: string;
  title: string;
  trials: Trial[];
};
