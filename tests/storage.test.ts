import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyData, emptySchedule } from "../src/lib/types";
import type { AppData, HistoryEntry } from "../src/lib/types";
import {
  loadData,
  parseBackup,
  saveData,
  serializeBackup,
  STORAGE_DATABASE,
  STORAGE_KEY,
  STORAGE_STORE,
  validateBackup,
} from "../src/lib/storage";

const NOW = 1793000000000;
function fixture(): AppData {
  const result = emptyData();
  result.collections.push({
    id: "collection",
    title: "Shaxsiy so‘zlar",
    language: "de",
    level: "A1.2",
    createdAt: NOW,
  });
  result.words.push({
    id: "word",
    collectionId: "collection",
    word: "der Tisch",
    translation: "stol",
    partOfSpeech: "noun",
    acceptedAnswers: ["der Tisch"],
    sentence: "Ich sehe den Tisch.",
    sentenceTranslation: "Men stolni ko‘ryapman.",
    clozeText: "Ich sehe {{blank}}.",
    clozeAnswers: ["den Tisch"],
    schedules: {
      translation: {
        stage: 1,
        dueAt: NOW + 86400000,
        attempts: 1,
        lastReviewedAt: NOW,
      },
      cloze: emptySchedule(),
    },
  });
  const entry: HistoryEntry = {
    id: "entry",
    sessionId: "session",
    questionId: "question",
    wordId: "word",
    mode: "translation",
    answer: "der Tisch",
    correct: true,
    assisted: false,
    hard: false,
    firstAttempt: true,
    at: NOW,
    previousSchedule: emptySchedule(),
  };
  result.history = [entry];
  result.session = {
    id: "session",
    mode: "translation",
    collectionId: "collection",
    queue: [{ id: "question", wordId: "word", isRetry: false }],
    index: 0,
    results: [entry],
    startedAt: NOW,
    draft: "der Tisch",
    hintUsed: false,
    revealed: false,
    feedback: entry,
    completedAt: null,
  };
  result.preferences.reducedMotion = true;
  return result;
}
function deleteDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(STORAGE_DATABASE);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error("Database connections not closed"));
  });
}
beforeEach(async () => {
  await deleteDatabase();
});

describe("IndexedDB persistence", () => {
  it("starts empty without a demo dictionary", async () => {
    expect(await loadData()).toEqual(emptyData());
  });
  it("roundtrips all words, schedules, history and active question feedback", async () => {
    const data = fixture();
    await saveData(data);
    expect(await loadData()).toEqual(data);
    const unfinished = structuredClone(data);
    unfinished.session!.feedback = null;
    unfinished.session!.results = [];
    unfinished.history = [];
    unfinished.session!.draft = "der T";
    unfinished.session!.hintUsed = true;
    await saveData(unfinished);
    expect(await loadData()).toEqual(unfinished);
  });
  it("rejects invalid writes without replacing existing data", async () => {
    const data = fixture();
    await saveData(data);
    const bad = structuredClone(data);
    bad.words[0].schedules.translation.stage = 999;
    await expect(saveData(bad)).rejects.toThrow("stage");
    expect(await loadData()).toEqual(data);
  });
  it("rejects an aborted transaction instead of reporting a false success", async () => {
    const data = fixture();
    await saveData(data);
    const replacement = structuredClone(data);
    replacement.collections[0].title = "Bu saqlanmasligi kerak";
    const originalPut = IDBObjectStore.prototype.put;
    const intercepted = vi
      .spyOn(IDBObjectStore.prototype, "put")
      .mockImplementation(function (
        this: IDBObjectStore,
        value: unknown,
        key?: IDBValidKey,
      ) {
        const request = originalPut.call(this, value, key);
        this.transaction.abort();
        return request;
      });
    try {
      await expect(saveData(replacement)).rejects.toThrow("saqlanmadi");
    } finally {
      intercepted.mockRestore();
    }
    expect(await loadData()).toEqual(data);
  });
  it("only reports success after the write transaction completes", async () => {
    const data = fixture();
    await saveData(data);
    // A separate immediately following transaction must observe the durable write.
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(STORAGE_DATABASE, 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const value = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(STORAGE_STORE, "readonly");
      const request = tx.objectStore(STORAGE_STORE).get(STORAGE_KEY);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    expect(value).toEqual(data);
  });
});

describe("backup validation and restore", () => {
  it("exports a versioned portable backup and restores an identical graph", () => {
    const data = fixture();
    const source = serializeBackup(data);
    const wrapper = JSON.parse(source);
    expect(wrapper.backupVersion).toBe(1);
    expect(Number.isFinite(Date.parse(wrapper.exportedAt))).toBe(true);
    expect(parseBackup(source)).toEqual(data);
  });
  it("validates before writing and preserves the database for malformed JSON", async () => {
    const data = fixture();
    await saveData(data);
    expect(() => parseBackup("{broken")).toThrow("JSON");
    expect(await loadData()).toEqual(data);
  });
  it.each([
    [
      "schema version",
      (data: any) => {
        data.schemaVersion = 2;
      },
    ],
    [
      "language",
      (data: any) => {
        data.collections[0].language = "fr";
      },
    ],
    [
      "level",
      (data: any) => {
        data.collections[0].level = "C2";
      },
    ],
    [
      "missing mandatory field",
      (data: any) => {
        delete data.words[0].word;
      },
    ],
    [
      "blank translation",
      (data: any) => {
        data.words[0].translation = " ";
      },
    ],
    [
      "duplicate collection IDs",
      (data: any) => {
        data.collections.push(data.collections[0]);
      },
    ],
    [
      "dangling word reference",
      (data: any) => {
        data.words[0].collectionId = "missing";
      },
    ],
    [
      "dangling history reference",
      (data: any) => {
        data.history[0].wordId = "missing";
      },
    ],
    [
      "negative interval",
      (data: any) => {
        data.words[0].schedules.translation.dueAt = -1;
      },
    ],
    [
      "NaN interval",
      (data: any) => {
        data.words[0].schedules.translation.dueAt = NaN;
      },
    ],
    [
      "infinite count",
      (data: any) => {
        data.words[0].schedules.translation.attempts = Infinity;
      },
    ],
    [
      "fractional stage",
      (data: any) => {
        data.words[0].schedules.translation.stage = 1.5;
      },
    ],
    [
      "string boolean",
      (data: any) => {
        data.preferences.reducedMotion = "false";
      },
    ],
    [
      "wrong answer list type",
      (data: any) => {
        data.words[0].acceptedAnswers = ["der Tisch", 3];
      },
    ],
    [
      "unknown field",
      (data: any) => {
        data.words[0].unexpected = true;
      },
    ],
    [
      "missing session result history",
      (data: any) => {
        data.history = [];
      },
    ],
    [
      "modified session result",
      (data: any) => {
        data.session.results[0] = {
          ...data.session.results[0],
          answer: "different",
        };
      },
    ],
    [
      "invalid question index",
      (data: any) => {
        data.session.index = 5;
      },
    ],
    [
      "invalid question reference",
      (data: any) => {
        data.session.queue[0].wordId = "missing";
      },
    ],
    [
      "duplicate question IDs",
      (data: any) => {
        data.session.queue.push(data.session.queue[0]);
      },
    ],
    [
      "invalid session mode",
      (data: any) => {
        data.session.mode = "speaking";
      },
    ],
  ])("rejects %s without partial data coercion", (_name, mutate) => {
    const data = structuredClone(fixture());
    mutate(data);
    expect(() => validateBackup(data)).toThrow("Zaxira noto‘g‘ri");
  });
  it("rejects version mismatches and non-backup JSON", () => {
    const source = JSON.parse(serializeBackup(fixture()));
    source.backupVersion = 4;
    expect(() => parseBackup(JSON.stringify(source))).toThrow("versiya");
    expect(() => parseBackup(JSON.stringify(fixture()))).toThrow();
  });
  it("returns an independent copy to keep validated state stable", () => {
    const data = fixture();
    const checked = validateBackup(data);
    checked.words[0].word = "anderes";
    expect(data.words[0].word).toBe("der Tisch");
  });
});

describe("restored session state invariants", () => {
  function twoAnsweredQuestions(): AppData {
    const data = fixture();
    const second: HistoryEntry = {
      ...data.history[0],
      id: "entry-2",
      questionId: "question-2",
      firstAttempt: false,
      at: NOW + 1,
    };
    data.history.push(second);
    data.session!.queue.push({
      id: "question-2",
      wordId: "word",
      isRetry: true,
    });
    data.session!.index = 1;
    data.session!.results.push(second);
    data.session!.feedback = second;
    return data;
  }
  function completedFixture(): AppData {
    const data = fixture();
    data.session!.index = 1;
    data.session!.feedback = null;
    data.session!.completedAt = NOW + 1;
    return data;
  }
  const malformedSessions: [string, () => AppData][] = [
    [
      "empty session queue",
      () => {
        const data = fixture();
        data.session!.queue = [];
        data.session!.results = [];
        data.session!.feedback = null;
        data.history = [];
        return data;
      },
    ],
    [
      "answered current question without feedback",
      () => {
        const data = fixture();
        data.session!.feedback = null;
        return data;
      },
    ],
    [
      "index ahead of answered prefix",
      () => {
        const data = twoAnsweredQuestions();
        data.session!.results = [];
        data.session!.feedback = null;
        data.history = [];
        return data;
      },
    ],
    [
      "results outside queue order",
      () => {
        const data = twoAnsweredQuestions();
        data.session!.results.reverse();
        return data;
      },
    ],
    [
      "unreported answer retained only in history",
      () => {
        const data = fixture();
        data.session!.results = [];
        data.session!.feedback = null;
        return data;
      },
    ],
    [
      "complete queue without completed timestamp",
      () => {
        const data = completedFixture();
        data.session!.completedAt = null;
        return data;
      },
    ],
    [
      "premature completion",
      () => {
        const data = fixture();
        data.session!.completedAt = NOW + 1;
        return data;
      },
    ],
    [
      "feedback remaining in completed session",
      () => {
        const data = completedFixture();
        data.session!.feedback = data.history[0];
        return data;
      },
    ],
    [
      "completion before session start",
      () => {
        const data = completedFixture();
        data.session!.completedAt = NOW - 1;
        return data;
      },
    ],
    [
      "feedback assistance flag disagreement",
      () => {
        const data = fixture();
        data.session!.hintUsed = true;
        return data;
      },
    ],
    [
      "revealed question without saved feedback",
      () => {
        const data = fixture();
        data.session!.results = [];
        data.session!.feedback = null;
        data.session!.revealed = true;
        data.session!.hintUsed = true;
        data.history = [];
        return data;
      },
    ],
    [
      "revealed answer marked correct",
      () => {
        const data = fixture();
        data.session!.revealed = true;
        data.session!.hintUsed = true;
        data.history[0].assisted = true;
        return data;
      },
    ],
    [
      "retry marked as first independent attempt",
      () => {
        const data = twoAnsweredQuestions();
        data.history[1].firstAttempt = true;
        return data;
      },
    ],
    [
      "hard flag on incorrect history",
      () => {
        const data = fixture();
        data.history[0].correct = false;
        data.history[0].hard = true;
        return data;
      },
    ],
  ];

  it.each(malformedSessions)(
    "rejects %s before a restore can replace existing data",
    async (_name, makeMalformed) => {
      const existing = fixture();
      await saveData(existing);
      const bad = makeMalformed();
      const source = JSON.stringify({
        backupVersion: 1,
        exportedAt: new Date(NOW).toISOString(),
        data: bad,
      });
      expect(() => parseBackup(source)).toThrow("Zaxira noto‘g‘ri");
      await expect(saveData(bad)).rejects.toThrow("Zaxira noto‘g‘ri");
      expect(await loadData()).toEqual(existing);
    },
  );

  it("accepts resumable unanswered and answered states plus completed sessions in exact queue order", () => {
    const unanswered = fixture();
    unanswered.session!.results = [];
    unanswered.session!.feedback = null;
    unanswered.session!.draft = "der T";
    unanswered.session!.hintUsed = true;
    unanswered.history = [];
    for (const data of [
      unanswered,
      fixture(),
      twoAnsweredQuestions(),
      completedFixture(),
    ]) {
      expect(validateBackup(data)).toEqual(data);
      expect(parseBackup(serializeBackup(data))).toEqual(data);
    }
  });
});
