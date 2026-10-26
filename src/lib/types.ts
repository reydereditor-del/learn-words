export type Language = "de" | "en";
export type Level = "A1" | "A1.2" | "A2" | "B1" | "B2";
export type StudyMode = "translation" | "cloze";
export interface Schedule {
  stage: number;
  dueAt: number | null;
  attempts: number;
  lastReviewedAt: number | null;
}
export interface WordContent {
  word: string;
  translation: string;
  partOfSpeech?: string;
  acceptedAnswers?: string[];
  sentence?: string;
  sentenceTranslation?: string;
  clozeText?: string;
  clozeAnswers?: string[];
}
export interface Word extends WordContent {
  id: string;
  collectionId: string;
  schedules: Record<StudyMode, Schedule>;
}
export interface Collection {
  id: string;
  title: string;
  language: Language;
  level: Level;
  createdAt: number;
}
export interface HistoryEntry {
  id: string;
  sessionId: string;
  questionId: string;
  wordId: string;
  mode: StudyMode;
  answer: string;
  correct: boolean;
  assisted: boolean;
  hard: boolean;
  firstAttempt: boolean;
  at: number;
  previousSchedule?: Schedule;
}
export interface SessionQuestion {
  id: string;
  wordId: string;
  isRetry: boolean;
}
export interface PracticeSession {
  id: string;
  mode: StudyMode;
  collectionId: string | null;
  queue: SessionQuestion[];
  index: number;
  results: HistoryEntry[];
  startedAt: number;
  draft: string;
  hintUsed: boolean;
  revealed: boolean;
  feedback: HistoryEntry | null;
  completedAt: number | null;
}
export interface AppData {
  schemaVersion: 1;
  collections: Collection[];
  words: Word[];
  history: HistoryEntry[];
  session: PracticeSession | null;
  preferences: { reducedMotion: boolean; motionOverride?: "full" | "reduced" };
}
export const LEVELS: Level[] = ["A1", "A1.2", "A2", "B1", "B2"];
export const LANGUAGE_NAMES: Record<Language, string> = {
  de: "Nemischa",
  en: "Inglizcha",
};
export function emptySchedule(): Schedule {
  return { stage: 0, dueAt: null, attempts: 0, lastReviewedAt: null };
}
export function emptyData(): AppData {
  return {
    schemaVersion: 1,
    collections: [],
    words: [],
    history: [],
    session: null,
    preferences: { reducedMotion: false },
  };
}
export function id(): string {
  return crypto.randomUUID();
}
