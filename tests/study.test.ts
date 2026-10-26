import { describe, expect, it } from "vitest";
import {
  advanceSession,
  checkAnswer,
  createSession,
  DAY_MS,
  INTERVAL_DAYS,
  markHard,
  nextSchedule,
  normalizeAnswer,
  recordAnswer,
  selectWords,
} from "../src/lib/study";
import { emptyData, emptySchedule } from "../src/lib/types";
import type { AppData, Schedule, Word, WordContent } from "../src/lib/types";
import {
  parseBackup,
  serializeBackup,
  validateBackup,
} from "../src/lib/storage";

const NOW = 1_800_000_000_000;
const noun: WordContent = {
  word: "der Tisch",
  translation: "stol",
  partOfSpeech: "noun",
  acceptedAnswers: ["der Tisch"],
};
const cloze: WordContent = {
  word: "gehen",
  translation: "bormoq",
  sentence: "Er geht heute.",
  sentenceTranslation: "U bugun boradi.",
  clozeText: "Er {{blank}} heute.",
  clozeAnswers: ["geht"],
};
function makeWord(wordId: string, content: WordContent = noun): Word {
  return {
    ...content,
    id: wordId,
    collectionId: "collection",
    schedules: { translation: emptySchedule(), cloze: emptySchedule() },
  };
}
function app(count = 1): AppData {
  const data = emptyData();
  data.collections = [
    {
      id: "collection",
      title: "So‘zlar",
      language: "de",
      level: "A1",
      createdAt: NOW,
    },
  ];
  data.words = Array.from({ length: count }, (_, index) =>
    makeWord(`w${index}`),
  );
  return data;
}
function session(count = 1): AppData {
  const data = app(count);
  data.session = createSession(data, "translation", null, NOW);
  return data;
}
const unassisted = { hintUsed: false, revealed: false };

describe("answer checking", () => {
  it("normalizes Unicode composition and whitespace without folding diacritics or ß", () => {
    expect(normalizeAnswer("  scho\u0308n  groß  ")).toBe("schön groß");
    expect(
      checkAnswer("  der   Tisch ", noun, "translation", "de").correct,
    ).toBe(true);
    expect(
      checkAnswer(
        "scho\u0308n",
        { word: "schön", translation: "chiroyli" },
        "translation",
        "de",
      ).correct,
    ).toBe(true);
    expect(
      checkAnswer(
        "schon",
        { word: "schön", translation: "chiroyli" },
        "translation",
        "de",
      ).correct,
    ).toBe(false);
    expect(
      checkAnswer(
        "gross",
        { word: "groß", translation: "katta" },
        "translation",
        "de",
      ).correct,
    ).toBe(false);
  });

  it("accepts only saved alternatives and never fuzzy matches", () => {
    const word = {
      word: "colour",
      translation: "rang",
      acceptedAnswers: ["colour", "color"],
    };
    expect(checkAnswer("color", word, "translation", "en").correct).toBe(true);
    expect(checkAnswer("colur", word, "translation", "en")).toMatchObject({
      correct: false,
      kind: "spelling",
    });
    expect(checkAnswer("blue", word, "translation", "en")).toMatchObject({
      correct: false,
      kind: "different",
    });
    expect(
      checkAnswer(
        "colour",
        { ...word, acceptedAnswers: ["color"] },
        "translation",
        "en",
      ).correct,
    ).toBe(false);
  });

  it("rejects missing or wrong German articles while accepting capitalization differences", () => {
    expect(checkAnswer("Tisch", noun, "translation", "de")).toMatchObject({
      correct: false,
      kind: "article",
      expected: "der Tisch",
    });
    expect(checkAnswer("die Tisch", noun, "translation", "de")).toMatchObject({
      correct: false,
      kind: "article",
    });
    expect(checkAnswer("der tisch", noun, "translation", "de")).toMatchObject({
      correct: true,
      kind: "correct",
    });
    expect(checkAnswer("Der Tisch", noun, "translation", "de")).toMatchObject({
      correct: true,
      kind: "correct",
    });
    expect(checkAnswer("der Tish", noun, "translation", "de")).toMatchObject({
      correct: false,
      kind: "spelling",
    });
  });

  it("accepts a cloze inflection instead of its dictionary form", () => {
    expect(checkAnswer("geht", cloze, "cloze", "de").correct).toBe(true);
    expect(checkAnswer("gehen", cloze, "cloze", "de").correct).toBe(false);
    expect(checkAnswer("gehen", cloze, "translation", "de").correct).toBe(true);
  });

  it("rejects empty answers and cloze content with no saved answers", () => {
    expect(checkAnswer(" ", noun, "translation", "de").correct).toBe(false);
    expect(checkAnswer("der Tisch", noun, "cloze", "de").correct).toBe(false);
  });
});

describe("review scheduling", () => {
  it("uses the five independent-review intervals and caps the stage at five", () => {
    let schedule = emptySchedule();
    for (const [index, days] of INTERVAL_DAYS.entries()) {
      schedule = nextSchedule(
        schedule,
        { correct: true, assisted: false, hard: false, firstAttempt: true },
        NOW,
      );
      expect(schedule).toMatchObject({
        stage: index + 1,
        dueAt: NOW + days * DAY_MS,
        attempts: index + 1,
      });
    }
    expect(
      nextSchedule(
        schedule,
        { correct: true, assisted: false, hard: false, firstAttempt: true },
        NOW,
      ),
    ).toMatchObject({ stage: 5, dueAt: NOW + 30 * DAY_MS });
  });

  it("resets errors, but hard and assisted correct answers keep the previous stage and repeat tomorrow", () => {
    const previous: Schedule = {
      stage: 3,
      attempts: 6,
      dueAt: NOW - 1,
      lastReviewedAt: NOW - DAY_MS,
    };
    expect(
      nextSchedule(
        previous,
        { correct: false, assisted: false, hard: false, firstAttempt: true },
        NOW,
      ),
    ).toMatchObject({ stage: 0, attempts: 7, dueAt: NOW + DAY_MS });
    expect(
      nextSchedule(
        previous,
        { correct: true, assisted: true, hard: false, firstAttempt: true },
        NOW,
      ),
    ).toMatchObject({ stage: 3, dueAt: NOW + DAY_MS });
    expect(
      nextSchedule(
        previous,
        { correct: true, assisted: false, hard: true, firstAttempt: true },
        NOW,
      ),
    ).toMatchObject({ stage: 3, dueAt: NOW + DAY_MS });
  });

  it("never advances a retry and retains the first attempt’s due date", () => {
    const previous: Schedule = {
      stage: 0,
      attempts: 1,
      dueAt: NOW + DAY_MS,
      lastReviewedAt: NOW,
    };
    expect(
      nextSchedule(
        previous,
        { correct: true, assisted: false, hard: false, firstAttempt: false },
        NOW + 100,
      ),
    ).toMatchObject({ stage: 0, dueAt: NOW + DAY_MS, attempts: 2 });
  });
});

describe("selection and session creation", () => {
  it("places overdue items before new words and excludes future dates", () => {
    const data = app(4);
    data.words[1].schedules.translation = {
      stage: 1,
      attempts: 1,
      dueAt: NOW - 200,
      lastReviewedAt: NOW - DAY_MS,
    };
    data.words[2].schedules.translation = {
      stage: 1,
      attempts: 1,
      dueAt: NOW - 100,
      lastReviewedAt: NOW - DAY_MS,
    };
    data.words[3].schedules.translation = {
      stage: 1,
      attempts: 1,
      dueAt: NOW + DAY_MS,
      lastReviewedAt: NOW,
    };
    expect(
      selectWords(data.words, "translation", NOW).map((word) => word.id),
    ).toEqual(["w1", "w2", "w0"]);
  });

  it("limits large rounds to ten and supports a single word", () => {
    expect(
      createSession(app(30), "translation", null, NOW)?.queue,
    ).toHaveLength(10);
    expect(createSession(app(1), "translation", null, NOW)?.queue).toHaveLength(
      1,
    );
    expect(createSession(app(0), "translation", null, NOW)).toBeNull();
  });

  it("filters by collection and requires complete cloze data", () => {
    const data = app(2);
    data.words[1] = makeWord("w1", cloze);
    expect(
      selectWords(data.words, "cloze", NOW).map((word) => word.id),
    ).toEqual(["w1"]);
    expect(selectWords(data.words, "translation", NOW, "different")).toEqual(
      [],
    );
    expect(createSession(app(1), "cloze", null, NOW)).toBeNull();
  });

  it("allows a targeted difficult-word follow-up without advancing its stage again", () => {
    const data = app(1);
    data.words[0].schedules.translation.dueAt = NOW + DAY_MS;
    data.session = createSession(data, "translation", null, NOW, ["w0"]);
    expect(data.session?.queue[0].isRetry).toBe(true);
    const answered = recordAnswer(data, "der Tisch", unassisted, NOW);
    expect(answered.session?.feedback?.firstAttempt).toBe(false);
    expect(answered.words[0].schedules.translation.stage).toBe(0);
  });
});

describe("persistable answer workflow", () => {
  it("writes one history entry and schedule update per question despite repeated checks", () => {
    const initial = session();
    const answered = recordAnswer(initial, "der Tisch", unassisted, NOW);
    const twice = recordAnswer(answered, "der Tisch", unassisted, NOW + 1);
    expect(twice).toBe(answered);
    expect(answered.history).toHaveLength(1);
    expect(answered.session?.results).toHaveLength(1);
    expect(answered.session?.feedback).toBe(answered.history[0]);
    expect(answered.words[0].schedules.translation).toMatchObject({
      attempts: 1,
      stage: 1,
    });
    expect(initial.words[0].schedules.translation.stage).toBe(0);
  });

  it("requires feedback before advancing and completes a one-word correct round", () => {
    const initial = session();
    expect(advanceSession(initial)).toBe(initial);
    const answered = recordAnswer(initial, "der Tisch", unassisted, NOW);
    const complete = advanceSession(answered, NOW + 1000);
    expect(complete.session).toMatchObject({
      index: 1,
      completedAt: NOW + 1000,
      feedback: null,
      draft: "",
    });
    expect(recordAnswer(complete, "der Tisch", unassisted)).toBe(complete);
    expect(advanceSession(complete)).toBe(complete);
  });

  it("returns a mistaken question after three others and only once", () => {
    let data = session(6);
    data = recordAnswer(data, "wrong", unassisted, NOW);
    expect(data.session?.queue.map((question) => question.wordId)).toEqual([
      "w0",
      "w1",
      "w2",
      "w3",
      "w0",
      "w4",
      "w5",
    ]);
    expect(data.session?.queue[4].isRetry).toBe(true);
    for (let i = 0; i < 4; i++) {
      data = advanceSession(data, NOW + i + 1);
      if (i < 3)
        data = recordAnswer(data, "der Tisch", unassisted, NOW + i + 10);
    }
    data = recordAnswer(data, "wrong again", unassisted, NOW + 100);
    expect(
      data.session?.queue.filter((question) => question.wordId === "w0"),
    ).toHaveLength(2);
    expect(data.words[0].schedules.translation.stage).toBe(0);
    expect(
      data.history
        .filter((entry) => entry.wordId === "w0")
        .map((entry) => entry.firstAttempt),
    ).toEqual([true, false]);
  });

  it("adapts retries to one-word rounds and always terminates", () => {
    let data = recordAnswer(session(), "wrong", unassisted, NOW);
    expect(data.session?.queue).toHaveLength(2);
    data = advanceSession(data, NOW + 1);
    data = recordAnswer(data, "wrong", unassisted, NOW + 2);
    expect(data.session?.queue).toHaveLength(2);
    data = advanceSession(data, NOW + 3);
    expect(data.session?.completedAt).toBe(NOW + 3);
    expect(data.history).toHaveLength(2);
  });

  it("keeps a failed word at reset stage even after a correct retry", () => {
    let data = recordAnswer(session(), "wrong", unassisted, NOW);
    data = advanceSession(data, NOW + 1);
    data = recordAnswer(data, "der Tisch", unassisted, NOW + 2);
    expect(data.words[0].schedules.translation).toMatchObject({
      stage: 0,
      dueAt: NOW + DAY_MS,
      attempts: 2,
    });
    expect(data.session?.feedback).toMatchObject({
      correct: true,
      firstAttempt: false,
    });
  });

  it("does not advance after a first-letter hint, including persisted hints", () => {
    const data = session();
    data.session!.hintUsed = true;
    const answered = recordAnswer(data, "der Tisch", unassisted, NOW);
    expect(answered.session?.feedback).toMatchObject({
      correct: true,
      assisted: true,
    });
    expect(answered.words[0].schedules.translation).toMatchObject({
      stage: 0,
      dueAt: NOW + DAY_MS,
    });
  });

  it("treats revealing the answer as an assisted failure and queues a retry", () => {
    const data = session();
    data.words[0].schedules.translation.stage = 4;
    const answered = recordAnswer(
      data,
      "der Tisch",
      { hintUsed: false, revealed: true },
      NOW,
    );
    expect(answered.session?.feedback).toMatchObject({
      correct: false,
      assisted: true,
    });
    expect(answered.words[0].schedules.translation).toMatchObject({
      stage: 0,
      dueAt: NOW + DAY_MS,
    });
    expect(answered.session?.queue).toHaveLength(2);
  });

  it("marks a correct answer hard without adding history or counting attempts twice", () => {
    const data = session();
    data.words[0].schedules.translation = {
      stage: 2,
      attempts: 4,
      dueAt: NOW - 1,
      lastReviewedAt: NOW - DAY_MS,
    };
    const answered = recordAnswer(data, "der Tisch", unassisted, NOW);
    expect(answered.words[0].schedules.translation.stage).toBe(3);
    const hard = markHard(answered);
    expect(hard.words[0].schedules.translation).toMatchObject({
      stage: 2,
      attempts: 5,
      dueAt: NOW + DAY_MS,
    });
    expect(hard.history).toHaveLength(1);
    expect(hard.history[0].hard).toBe(true);
    expect(hard.session?.results[0].hard).toBe(true);
    expect(markHard(hard)).toBe(hard);
  });

  it("retains the saturated stage when marking hard after serialization/refresh", () => {
    const data = session();
    data.words[0].schedules.translation = {
      stage: 5,
      attempts: 8,
      dueAt: NOW - 1,
      lastReviewedAt: NOW - DAY_MS,
    };
    const refreshed: AppData = JSON.parse(
      JSON.stringify(recordAnswer(data, "der Tisch", unassisted, NOW)),
    );
    const hard = markHard(refreshed);
    expect(hard.words[0].schedules.translation).toMatchObject({
      stage: 5,
      attempts: 9,
      dueAt: NOW + DAY_MS,
    });
  });

  it("keeps cloze and translation schedules independent", () => {
    const data = app(1);
    data.words[0] = makeWord("w0", cloze);
    data.session = createSession(data, "cloze", null, NOW);
    const answered = recordAnswer(data, "geht", unassisted, NOW);
    expect(answered.words[0].schedules.cloze).toMatchObject({
      stage: 1,
      attempts: 1,
    });
    expect(answered.words[0].schedules.translation).toEqual(emptySchedule());
    expect(answered.history[0].mode).toBe("cloze");
  });

  it("safely leaves invalid or externally removed word references untouched", () => {
    const data = session();
    data.words = [];
    expect(recordAnswer(data, "der Tisch", unassisted, NOW)).toBe(data);
    expect(
      recordAnswer(emptyData(), "der Tisch", unassisted, NOW).history,
    ).toEqual([]);
  });
});

describe("study and storage contract", () => {
  function roundTrip(data: AppData): AppData {
    const checked = validateBackup(data);
    expect(checked).toEqual(data);
    const restored = parseBackup(serializeBackup(checked));
    expect(restored).toEqual(data);
    return restored;
  }

  it("preserves all invariants through a one-word failure, retry, completion and difficult continuation", () => {
    let data = roundTrip(session());
    data = roundTrip(recordAnswer(data, "wrong", unassisted, NOW));
    expect(data.session?.queue).toHaveLength(2);
    expect(data.session?.feedback).toMatchObject({
      correct: false,
      firstAttempt: true,
    });
    data = roundTrip(advanceSession(data, NOW + 1));
    data = roundTrip(recordAnswer(data, "der Tisch", unassisted, NOW + 2));
    expect(data.session?.feedback).toMatchObject({
      correct: true,
      firstAttempt: false,
    });
    data = roundTrip(advanceSession(data, NOW + 3));
    expect(data.session?.index).toBe(data.session?.queue.length);
    expect(data.session?.completedAt).toBe(NOW + 3);
    expect(data.words[0].schedules.translation.stage).toBe(0);
    const priorSessionId = data.session!.id;
    data.session = createSession(data, "translation", null, NOW + 4, ["w0"]);
    data = roundTrip(data);
    expect(data.session?.id).not.toBe(priorSessionId);
    expect(data.session?.queue[0].isRetry).toBe(true);
    data = roundTrip(recordAnswer(data, "der Tisch", unassisted, NOW + 5));
    data = roundTrip(markHard(data));
    expect(data.session?.feedback).toMatchObject({
      correct: true,
      hard: true,
      firstAttempt: false,
    });
    expect(data.words[0].schedules.translation).toMatchObject({
      stage: 0,
      attempts: 3,
      dueAt: NOW + 5 + DAY_MS,
    });
    data = roundTrip(advanceSession(data, NOW + 6));
    expect(data.history).toHaveLength(3);
    expect(data.session?.completedAt).toBe(NOW + 6);
  });

  it("validates every persisted transition of a large mixed round, including delayed retries and hard feedback", () => {
    let data = roundTrip(session(30));
    let step = 0;
    while (data.session?.completedAt === null) {
      const question = data.session.queue[data.session.index];
      const initialIndex = Number(question.wordId.slice(1));
      const correct = question.isRetry || initialIndex > 1;
      const reveal = !question.isRetry && initialIndex === 1;
      const hint = !question.isRetry && initialIndex === 2;
      data = roundTrip(
        recordAnswer(
          data,
          correct ? "der Tisch" : "wrong",
          { hintUsed: hint, revealed: reveal },
          NOW + step++,
        ),
      );
      expect(data.session?.queue.length).toBeLessThanOrEqual(12);
      expect(new Set(data.session?.queue.map((item) => item.id)).size).toBe(
        data.session?.queue.length,
      );
      if (!question.isRetry && initialIndex === 3)
        data = roundTrip(markHard(data));
      const recorded = data;
      expect(recordAnswer(data, "der Tisch", unassisted, NOW + step)).toBe(
        recorded,
      );
      data = roundTrip(advanceSession(data, NOW + step++));
      expect(step).toBeLessThan(30);
    }
    expect(data.session?.queue).toHaveLength(12);
    expect(data.history).toHaveLength(12);
    expect(data.session?.results).toHaveLength(12);
    expect(data.words[0].schedules.translation.stage).toBe(0);
    expect(data.words[1].schedules.translation.stage).toBe(0);
    expect(data.words[2].schedules.translation.stage).toBe(0);
    expect(data.words[3].schedules.translation.stage).toBe(0);
    expect(data.words[4].schedules.translation.stage).toBe(1);
    expect(data.words[10].schedules.translation.attempts).toBe(0);
    expect(
      data.words.every((word) => word.schedules.cloze.attempts === 0),
    ).toBe(true);
  });

  it("retains separate cloze scheduling and feedback graph identity through export and restore", () => {
    let data = app(1);
    data.words[0] = makeWord("w0", cloze);
    data.session = createSession(data, "cloze", "collection", NOW);
    data = roundTrip(data);
    data = roundTrip(recordAnswer(data, "geht", unassisted, NOW));
    expect(data.session?.feedback?.previousSchedule).toEqual(emptySchedule());
    data = roundTrip(markHard(data));
    expect(data.history[0]).toEqual(data.session?.feedback);
    expect(data.history[0]).toEqual(data.session?.results[0]);
    data = roundTrip(advanceSession(data, NOW + 1));
    expect(data.words[0].schedules.translation).toEqual(emptySchedule());
    expect(data.words[0].schedules.cloze).toMatchObject({
      stage: 0,
      attempts: 1,
      dueAt: NOW + DAY_MS,
    });
  });
});
