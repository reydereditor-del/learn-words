import type {
  AppData,
  HistoryEntry,
  Language,
  PracticeSession,
  Schedule,
  StudyMode,
  Word,
  WordContent,
} from "./types";
import { id } from "./types";
import { isClozeEligible } from "./import";

export const INTERVAL_DAYS = [1, 3, 7, 14, 30] as const;
export const DAY_MS = 86_400_000;

export function normalizeAnswer(answer: string): string {
  return answer.normalize("NFC").trim().replace(/\s+/gu, " ");
}

export interface AnswerResult {
  correct: boolean;
  kind: "correct" | "article" | "capitalization" | "spelling" | "different";
  message: string;
  expected: string;
  received: string;
}

function distance(a: string, b: string): number {
  const left = Array.from(a),
    right = Array.from(b);
  let row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 0; i < left.length; i++) {
    const next = [i + 1];
    for (let j = 0; j < right.length; j++) {
      next.push(
        Math.min(
          next[j] + 1,
          row[j + 1] + 1,
          row[j] + (left[i] === right[j] ? 0 : 1),
        ),
      );
    }
    row = next;
  }
  return row[right.length];
}

function nounParts(answer: string): { article: string; noun: string } {
  const match = answer.match(
    /^(der|die|das|den|dem|des|ein|eine|einen|einem|einer|eines|kein|keine|keinen|keinem|keiner|keines)\s+(.+)$/iu,
  );
  return match
    ? { article: match[1], noun: match[2] }
    : { article: "", noun: answer };
}

export function checkAnswer(
  answer: string,
  word: WordContent,
  mode: StudyMode,
  language: Language,
): AnswerResult {
  const received = normalizeAnswer(answer);
  const saved =
    mode === "cloze"
      ? (word.clozeAnswers ?? [])
      : word.acceptedAnswers?.length
        ? word.acceptedAnswers
        : [word.word];
  const accepted = saved.map(normalizeAnswer).filter(Boolean);
  const expected = accepted[0] ?? "";
  const exact = accepted.find((candidate) => candidate === received);
  if (exact !== undefined)
    return {
      correct: true,
      kind: "correct",
      message: "To‘g‘ri javob!",
      expected: exact,
      received,
    };
  if (!received)
    return {
      correct: false,
      kind: "different",
      message: "Javob yozilmadi. To‘g‘ri javobni ko‘rib, qayta mashq qiling.",
      expected,
      received,
    };

  const isGermanNoun =
    language === "de" &&
    (word.partOfSpeech?.toLowerCase() === "noun" ||
      /^d(er|ie|as)\s/iu.test(word.word));
  if (isGermanNoun) {
    for (const candidate of accepted) {
      const actualParts = nounParts(received),
        expectedParts = nounParts(candidate);
      if (
        actualParts.noun.toLocaleLowerCase("de") ===
        expectedParts.noun.toLocaleLowerCase("de")
      ) {
        if (
          actualParts.article.toLocaleLowerCase("de") !==
          expectedParts.article.toLocaleLowerCase("de")
        ) {
          const capitalNote =
            actualParts.noun !== expectedParts.noun
              ? " Otning bosh harfiga ham e’tibor bering."
              : "";
          return {
            correct: false,
            kind: "article",
            message: `Artikl ${actualParts.article ? "noto‘g‘ri" : "yozilmagan"}. Saqlangan javob: “${candidate}”.${capitalNote}`,
            expected: candidate,
            received,
          };
        }
        if (received !== candidate)
          return {
            correct: false,
            kind: "capitalization",
            message: `Bosh yoki kichik harf xatosi. Nemischa ot bosh harf bilan yoziladi: “${candidate}”.`,
            expected: candidate,
            received,
          };
      }
    }
  }

  let nearest = expected;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of accepted) {
    const amount = distance(received, candidate);
    if (amount < nearestDistance) {
      nearestDistance = amount;
      nearest = candidate;
    }
  }
  const spelling =
    nearestDistance <=
    Math.max(1, Math.floor(Array.from(nearest).length * 0.25));
  return {
    correct: false,
    kind: spelling ? "spelling" : "different",
    received,
    expected: nearest,
    message: spelling
      ? `Yozuvda farq bor. “${received}” o‘rniga “${nearest}”. Harflar, umlaut va ß alohida hisoblanadi.`
      : `Bu savol uchun saqlangan javobga mos kelmadi. To‘g‘ri javob: “${nearest}”.`,
  };
}

export interface ScheduleOutcome {
  correct: boolean;
  assisted: boolean;
  hard: boolean;
  firstAttempt: boolean;
}

/** Stage 0 means no successful independent review yet; stages 1–5 use 1/3/7/14/30 days. */
export function nextSchedule(
  schedule: Schedule,
  outcome: ScheduleOutcome,
  now: number,
): Schedule {
  const base = {
    ...schedule,
    attempts: schedule.attempts + 1,
    lastReviewedAt: now,
  };
  if (!outcome.correct) return { ...base, stage: 0, dueAt: now + DAY_MS };
  if (outcome.hard || outcome.assisted) return { ...base, dueAt: now + DAY_MS };
  if (!outcome.firstAttempt)
    return { ...base, dueAt: schedule.dueAt ?? now + DAY_MS };
  return {
    ...base,
    stage: Math.min(INTERVAL_DAYS.length, schedule.stage + 1),
    dueAt:
      now +
      INTERVAL_DAYS[Math.min(INTERVAL_DAYS.length - 1, schedule.stage)] *
        DAY_MS,
  };
}

function eligible(word: Word, mode: StudyMode): boolean {
  return mode === "translation" || isClozeEligible(word);
}

export function selectWords(
  words: Word[],
  mode: StudyMode,
  now: number,
  collectionId?: string | null,
  limit = 10,
): Word[] {
  return words
    .filter(
      (word) =>
        (!collectionId || word.collectionId === collectionId) &&
        eligible(word, mode),
    )
    .filter(
      (word) =>
        word.schedules[mode].dueAt === null ||
        word.schedules[mode].dueAt! <= now,
    )
    .map((word, index) => ({ word, index }))
    .sort((a, b) => {
      const left = a.word.schedules[mode].dueAt,
        right = b.word.schedules[mode].dueAt;
      if (left === null && right !== null) return 1;
      if (right === null && left !== null) return -1;
      return (left ?? 0) - (right ?? 0) || a.index - b.index;
    })
    .slice(0, Math.max(0, Math.floor(limit)))
    .map(({ word }) => word);
}

export function createSession(
  data: AppData,
  mode: StudyMode,
  collectionId: string | null = null,
  now = Date.now(),
  onlyWordIds?: string[],
): PracticeSession | null {
  const chosen = onlyWordIds
    ? data.words
        .filter(
          (word) =>
            onlyWordIds.includes(word.id) &&
            (!collectionId || word.collectionId === collectionId) &&
            eligible(word, mode),
        )
        .slice(0, 10)
    : selectWords(data.words, mode, now, collectionId);
  if (!chosen.length) return null;
  return {
    id: id(),
    mode,
    collectionId,
    queue: chosen.map((word) => ({
      id: id(),
      wordId: word.id,
      isRetry: Boolean(onlyWordIds),
    })),
    index: 0,
    results: [],
    startedAt: now,
    draft: "",
    hintUsed: false,
    revealed: false,
    feedback: null,
    completedAt: null,
  };
}

type ScheduledEntry = HistoryEntry & { previousSchedule?: Schedule };

/** The feedback guard makes answer recording atomic and idempotent for a question. */
export function recordAnswer(
  data: AppData,
  answer: string,
  options: { hintUsed: boolean; revealed: boolean; hard?: boolean },
  now = Date.now(),
): AppData {
  const session = data.session;
  if (!session || session.completedAt !== null || session.feedback) return data;
  const question = session.queue[session.index];
  if (
    !question ||
    session.results.some((result) => result.questionId === question.id)
  )
    return data;
  const word = data.words.find((item) => item.id === question.wordId);
  const collection = data.collections.find(
    (item) => item.id === word?.collectionId,
  );
  if (!word || !collection) return data;
  const result = checkAnswer(answer, word, session.mode, collection.language);
  const revealed = options.revealed || session.revealed;
  const assisted = options.hintUsed || session.hintUsed || revealed;
  const firstAttempt =
    !question.isRetry &&
    !session.results.some((item) => item.wordId === word.id);
  const entry: ScheduledEntry = {
    id: id(),
    sessionId: session.id,
    questionId: question.id,
    wordId: word.id,
    mode: session.mode,
    answer,
    correct: result.correct && !revealed,
    assisted,
    hard: Boolean(options.hard && result.correct && !revealed),
    firstAttempt,
    at: now,
    previousSchedule: { ...word.schedules[session.mode] },
  };
  const schedule = nextSchedule(word.schedules[session.mode], entry, now);
  const queue = [...session.queue];
  if (
    (!entry.correct || revealed) &&
    !queue.some((item) => item.wordId === word.id && item.isRetry)
  ) {
    const remaining = queue.length - session.index - 1;
    // Three intervening questions when possible; use all remaining questions in short rounds.
    const after = Math.min(3, remaining);
    queue.splice(session.index + after + 1, 0, {
      id: id(),
      wordId: word.id,
      isRetry: true,
    });
  }
  return {
    ...data,
    words: data.words.map((item) =>
      item.id === word.id
        ? {
            ...item,
            schedules: { ...item.schedules, [session.mode]: schedule },
          }
        : item,
    ),
    history: [...data.history, entry],
    session: {
      ...session,
      queue,
      draft: answer,
      hintUsed: assisted,
      revealed,
      results: [...session.results, entry],
      feedback: entry,
    },
  };
}

/** Change the just-recorded answer without counting a second attempt. */
export function markHard(data: AppData): AppData {
  const session = data.session;
  const feedback = session?.feedback as ScheduledEntry | null | undefined;
  if (!session || !feedback || !feedback.correct || feedback.hard) return data;
  const word = data.words.find((item) => item.id === feedback.wordId);
  if (!word) return data;
  const updated: ScheduledEntry = { ...feedback, hard: true };
  // Every newly recorded answer includes previousSchedule, including after refresh.
  const previous = feedback.previousSchedule ?? {
    ...word.schedules[session.mode],
    stage: Math.max(
      0,
      word.schedules[session.mode].stage -
        (feedback.firstAttempt && !feedback.assisted ? 1 : 0),
    ),
    attempts: Math.max(0, word.schedules[session.mode].attempts - 1),
  };
  const schedule = nextSchedule(previous, updated, feedback.at);
  return {
    ...data,
    words: data.words.map((item) =>
      item.id === word.id
        ? {
            ...item,
            schedules: { ...item.schedules, [session.mode]: schedule },
          }
        : item,
    ),
    history: data.history.map((entry) =>
      entry.id === feedback.id ? updated : entry,
    ),
    session: {
      ...session,
      feedback: updated,
      results: session.results.map((entry) =>
        entry.id === feedback.id ? updated : entry,
      ),
    },
  };
}

export function advanceSession(data: AppData, now = Date.now()): AppData {
  const session = data.session;
  if (!session || !session.feedback || session.completedAt !== null)
    return data;
  const index = session.index + 1;
  return {
    ...data,
    session: {
      ...session,
      index,
      feedback: null,
      draft: "",
      hintUsed: false,
      revealed: false,
      completedAt: index >= session.queue.length ? now : null,
    },
  };
}
