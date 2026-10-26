import { emptyData, LEVELS } from "./types";
import type { AppData } from "./types";

export const STORAGE_DATABASE = "soz-orbitasi";
export const STORAGE_VERSION = 1;
export const STORAGE_STORE = "app";
export const STORAGE_KEY = "state";

function invalid(path: string, explanation: string): never {
  throw new Error(
    `Zaxira noto‘g‘ri: ${path} — ${explanation}. Mavjud ma’lumotlar o‘zgartirilmadi.`,
  );
}
function object(
  value: unknown,
  path: string,
  keys: string[],
): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    invalid(path, "obyekt bo‘lishi kerak");
  const result = value as Record<string, unknown>;
  for (const key of Object.keys(result)) {
    if (!keys.includes(key)) invalid(`${path}.${key}`, "noma’lum maydon");
  }
  return result;
}
function text(value: unknown, path: string, allowEmpty = false): string {
  if (typeof value !== "string" || (!allowEmpty && !value.trim()))
    invalid(path, "matn bo‘lishi kerak");
  return value;
}
function numeric(value: unknown, path: string, integer = false): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    (integer && !Number.isInteger(value))
  ) {
    invalid(
      path,
      integer
        ? "manfiy bo‘lmagan butun son bo‘lishi kerak"
        : "manfiy bo‘lmagan chekli son bo‘lishi kerak",
    );
  }
  return value;
}
function timestamp(value: unknown, path: string): number | null {
  return value === null ? null : numeric(value, path);
}
function bool(value: unknown, path: string): boolean {
  if (typeof value !== "boolean")
    invalid(path, "mantiqiy qiymat bo‘lishi kerak");
  return value;
}
function list(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) invalid(path, "ro‘yxat bo‘lishi kerak");
  return value;
}
function choice<T extends string>(
  value: unknown,
  path: string,
  options: readonly T[],
): T {
  if (typeof value !== "string" || !options.includes(value as T))
    invalid(path, `ruxsat etilgan qiymatlar: ${options.join(", ")}`);
  return value as T;
}
function unique(value: string, values: Set<string>, path: string): void {
  if (values.has(value)) invalid(path, "takroriy identifikator");
  values.add(value);
}
function reference(value: unknown, values: Set<string>, path: string): string {
  const key = text(value, path);
  if (!values.has(key)) invalid(path, "bog‘langan yozuv topilmadi");
  return key;
}
function schedule(value: unknown, path: string): void {
  const s = object(value, path, [
    "stage",
    "dueAt",
    "attempts",
    "lastReviewedAt",
  ]);
  const stage = numeric(s.stage, `${path}.stage`, true);
  if (stage > 5) invalid(`${path}.stage`, "0 dan 5 gacha bo‘lishi kerak");
  timestamp(s.dueAt, `${path}.dueAt`);
  numeric(s.attempts, `${path}.attempts`, true);
  timestamp(s.lastReviewedAt, `${path}.lastReviewedAt`);
}
function historyEntry(
  value: unknown,
  path: string,
  wordIds: Set<string>,
): Record<string, unknown> {
  const entry = object(value, path, [
    "id",
    "sessionId",
    "questionId",
    "wordId",
    "mode",
    "answer",
    "correct",
    "assisted",
    "hard",
    "firstAttempt",
    "at",
    "previousSchedule",
  ]);
  text(entry.id, `${path}.id`);
  text(entry.sessionId, `${path}.sessionId`);
  text(entry.questionId, `${path}.questionId`);
  reference(entry.wordId, wordIds, `${path}.wordId`);
  choice(entry.mode, `${path}.mode`, ["translation", "cloze"]);
  text(entry.answer, `${path}.answer`, true);
  bool(entry.correct, `${path}.correct`);
  bool(entry.assisted, `${path}.assisted`);
  bool(entry.hard, `${path}.hard`);
  if (entry.hard && !entry.correct)
    invalid(
      `${path}.hard`,
      "faqat to‘g‘ri javob qiynaldim deb belgilanishi mumkin",
    );
  bool(entry.firstAttempt, `${path}.firstAttempt`);
  numeric(entry.at, `${path}.at`);
  if ("previousSchedule" in entry)
    schedule(entry.previousSchedule, `${path}.previousSchedule`);
  return entry;
}
function sameEntry(
  first: Record<string, unknown>,
  second: Record<string, unknown>,
): boolean {
  return (
    Object.keys(first).every((key) => {
      if (key !== "previousSchedule") return first[key] === second[key];
      const a = first[key] as Record<string, unknown>;
      const b = second[key] as Record<string, unknown> | undefined;
      return (
        b !== undefined &&
        Object.keys(a).every((field) => a[field] === b[field])
      );
    }) && Object.keys(first).length === Object.keys(second).length
  );
}

/** Validate the entire graph before any restore can touch IndexedDB. Never coerce values. */
export function validateBackup(input: unknown): AppData {
  const root = object(input, "data", [
    "schemaVersion",
    "collections",
    "words",
    "history",
    "session",
    "preferences",
  ]);
  if (root.schemaVersion !== 1)
    invalid("data.schemaVersion", "qo‘llab-quvvatlanmaydigan versiya");
  const collectionIds = new Set<string>();
  list(root.collections, "data.collections").forEach((value, index) => {
    const path = `data.collections[${index}]`;
    const collection = object(value, path, [
      "id",
      "title",
      "language",
      "level",
      "createdAt",
    ]);
    unique(text(collection.id, `${path}.id`), collectionIds, `${path}.id`);
    text(collection.title, `${path}.title`);
    choice(collection.language, `${path}.language`, ["de", "en"]);
    choice(collection.level, `${path}.level`, LEVELS);
    numeric(collection.createdAt, `${path}.createdAt`);
  });
  const wordIds = new Set<string>();
  list(root.words, "data.words").forEach((value, index) => {
    const path = `data.words[${index}]`;
    const word = object(value, path, [
      "id",
      "collectionId",
      "word",
      "translation",
      "partOfSpeech",
      "acceptedAnswers",
      "sentence",
      "sentenceTranslation",
      "clozeText",
      "clozeAnswers",
      "schedules",
    ]);
    unique(text(word.id, `${path}.id`), wordIds, `${path}.id`);
    reference(word.collectionId, collectionIds, `${path}.collectionId`);
    text(word.word, `${path}.word`);
    text(word.translation, `${path}.translation`);
    for (const key of [
      "partOfSpeech",
      "sentence",
      "sentenceTranslation",
      "clozeText",
    ]) {
      if (key in word) text(word[key], `${path}.${key}`, true);
    }
    for (const key of ["acceptedAnswers", "clozeAnswers"]) {
      if (key in word)
        list(word[key], `${path}.${key}`).forEach((answer, i) =>
          text(answer, `${path}.${key}[${i}]`),
        );
    }
    const schedules = object(word.schedules, `${path}.schedules`, [
      "translation",
      "cloze",
    ]);
    schedule(schedules.translation, `${path}.schedules.translation`);
    schedule(schedules.cloze, `${path}.schedules.cloze`);
  });
  const historyIds = new Set<string>();
  const history = new Map<string, Record<string, unknown>>();
  const answeredQuestions = new Set<string>();
  list(root.history, "data.history").forEach((value, index) => {
    const path = `data.history[${index}]`;
    const entry = historyEntry(value, path, wordIds);
    const key = text(entry.id, `${path}.id`);
    unique(key, historyIds, `${path}.id`);
    unique(
      `${entry.sessionId}\u0000${entry.questionId}`,
      answeredQuestions,
      `${path}.questionId`,
    );
    history.set(key, entry);
  });
  const preferences = object(root.preferences, "data.preferences", [
    "reducedMotion",
  ]);
  bool(preferences.reducedMotion, "data.preferences.reducedMotion");
  if (root.session !== null) {
    const path = "data.session";
    const session = object(root.session, path, [
      "id",
      "mode",
      "collectionId",
      "queue",
      "index",
      "results",
      "startedAt",
      "draft",
      "hintUsed",
      "revealed",
      "feedback",
      "completedAt",
    ]);
    const sessionId = text(session.id, `${path}.id`);
    const mode = choice(session.mode, `${path}.mode`, ["translation", "cloze"]);
    if (session.collectionId !== null)
      reference(session.collectionId, collectionIds, `${path}.collectionId`);
    const questionIds = new Set<string>();
    const queue = list(session.queue, `${path}.queue`);
    if (queue.length === 0)
      invalid(`${path}.queue`, "sessiyada kamida bitta savol bo‘lishi kerak");
    const questions = new Map<string, Record<string, unknown>>();
    queue.forEach((value, index) => {
      const qPath = `${path}.queue[${index}]`;
      const question = object(value, qPath, ["id", "wordId", "isRetry"]);
      const key = text(question.id, `${qPath}.id`);
      unique(key, questionIds, `${qPath}.id`);
      reference(question.wordId, wordIds, `${qPath}.wordId`);
      bool(question.isRetry, `${qPath}.isRetry`);
      questions.set(key, question);
    });
    const currentIndex = numeric(session.index, `${path}.index`, true);
    if (currentIndex > queue.length)
      invalid(`${path}.index`, "navbat uzunligidan katta");
    const startedAt = numeric(session.startedAt, `${path}.startedAt`);
    const completedAt = timestamp(session.completedAt, `${path}.completedAt`);
    const completed = currentIndex === queue.length;
    if (completed !== (completedAt !== null)) {
      invalid(
        `${path}.completedAt`,
        "sessiya faqat barcha savollardan keyin tugallangan bo‘lishi kerak",
      );
    }
    if (completedAt !== null && completedAt < startedAt) {
      invalid(
        `${path}.completedAt`,
        "tugash vaqti boshlanish vaqtidan oldin bo‘lishi mumkin emas",
      );
    }
    text(session.draft, `${path}.draft`, true);
    const hintUsed = bool(session.hintUsed, `${path}.hintUsed`);
    const revealed = bool(session.revealed, `${path}.revealed`);
    const hasFeedback = session.feedback !== null;
    if (completed && hasFeedback)
      invalid(
        `${path}.feedback`,
        "tugallangan sessiyada ochiq javob bo‘lishi mumkin emas",
      );
    if (!hasFeedback && revealed)
      invalid(
        `${path}.revealed`,
        "ochilgan javob natijasi saqlangan bo‘lishi kerak",
      );
    if (completed && hintUsed)
      invalid(
        `${path}.hintUsed`,
        "tugallangan sessiyada faol yordam holati bo‘lishi mumkin emas",
      );

    const results = list(session.results, `${path}.results`);
    if (results.length !== currentIndex + (hasFeedback ? 1 : 0)) {
      invalid(
        `${path}.results`,
        "natijalar soni savol holati va ochiq javob bilan mos kelmaydi",
      );
    }
    const resultIds = new Set<string>();
    const answeredWordIds = new Set<string>();
    results.forEach((value, index) => {
      const resultPath = `${path}.results[${index}]`;
      const entry = historyEntry(value, resultPath, wordIds);
      const entryId = text(entry.id, `${resultPath}.id`);
      unique(entryId, resultIds, `${resultPath}.id`);
      const saved = history.get(entryId);
      if (!saved || !sameEntry(entry, saved))
        invalid(resultPath, "mashq tarixi bilan mos kelmaydi");
      if (entry.sessionId !== sessionId || entry.mode !== mode)
        invalid(resultPath, "sessiya yoki mashq turi bilan mos kelmaydi");
      const question = questions.get(entry.questionId as string);
      if (!question || question.wordId !== entry.wordId)
        invalid(resultPath, "sessiya savoli bilan mos kelmaydi");
      if (entry.questionId !== (queue[index] as Record<string, unknown>).id) {
        invalid(
          resultPath,
          "natijalar javob berilgan savollar tartibida bo‘lishi kerak",
        );
      }
      const expectedFirstAttempt =
        !question.isRetry && !answeredWordIds.has(entry.wordId as string);
      if (entry.firstAttempt !== expectedFirstAttempt)
        invalid(
          `${resultPath}.firstAttempt`,
          "qayta urinish holati bilan mos kelmaydi",
        );
      answeredWordIds.add(entry.wordId as string);
    });
    // An omitted result with a retained history entry would make recording that question fail forever.
    for (const [entryId, entry] of history) {
      if (entry.sessionId === sessionId && !resultIds.has(entryId)) {
        invalid(
          `${path}.results`,
          "ushbu sessiyaning tarixdagi javobi natijalarda yo‘q",
        );
      }
    }
    if (hasFeedback) {
      const feedback = historyEntry(
        session.feedback,
        `${path}.feedback`,
        wordIds,
      );
      const saved = history.get(feedback.id as string);
      const currentResult = results[currentIndex] as Record<string, unknown>;
      if (
        !resultIds.has(feedback.id as string) ||
        !saved ||
        !sameEntry(feedback, saved) ||
        !sameEntry(feedback, currentResult)
      ) {
        invalid(`${path}.feedback`, "joriy savol natijasi bilan mos kelmaydi");
      }
      if (
        feedback.questionId !==
        (queue[currentIndex] as Record<string, unknown>).id
      ) {
        invalid(`${path}.feedback`, "joriy savol bilan mos kelmaydi");
      }
      if (feedback.assisted !== hintUsed)
        invalid(
          `${path}.hintUsed`,
          "javobning yordam holati bilan mos kelmaydi",
        );
      if (revealed && (!feedback.assisted || feedback.correct)) {
        invalid(
          `${path}.revealed`,
          "ochilgan javob yordam ishlatilgan xato sifatida saqlanishi kerak",
        );
      }
    }
  }
  return structuredClone(input) as AppData;
}

export function serializeBackup(data: AppData): string {
  const checked = validateBackup(data);
  return JSON.stringify(
    { backupVersion: 1, exportedAt: new Date().toISOString(), data: checked },
    null,
    2,
  );
}

export function parseBackup(source: string): AppData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error(
      "Zaxira fayli to‘g‘ri JSON emas. Mavjud ma’lumotlar o‘zgartirilmadi.",
    );
  }
  const backup = object(parsed, "zaxira", [
    "backupVersion",
    "exportedAt",
    "data",
  ]);
  if (backup.backupVersion !== 1)
    invalid("backupVersion", "qo‘llab-quvvatlanmaydigan versiya");
  const exportedAt = text(backup.exportedAt, "exportedAt");
  if (!Number.isFinite(Date.parse(exportedAt)))
    invalid("exportedAt", "sana noto‘g‘ri");
  return validateBackup(backup.data);
}

function storageError(
  operation: "open" | "read" | "write",
  cause?: DOMException | null,
): Error {
  const messages = {
    open: "Brauzer xotirasini ochib bo‘lmadi. Maxfiy rejim yoki brauzer ruxsatlarini tekshiring.",
    read: "Saqlangan ma’lumotlarni o‘qib bo‘lmadi. Sahifani qayta yuklang yoki zaxirangizdan tiklang.",
    write:
      "Ma’lumot saqlanmadi. Brauzer xotirasi to‘lib qolgan yoki yozishga ruxsat yo‘q. Zaxira nusxasini eksport qiling.",
  };
  return new Error(
    `${messages[operation]}${cause?.name ? ` (${cause.name})` : ""}`,
  );
}
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(storageError("open"));
      return;
    }
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(STORAGE_DATABASE, STORAGE_VERSION);
    } catch {
      reject(storageError("open"));
      return;
    }
    let rejected = false;
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORAGE_STORE))
        request.result.createObjectStore(STORAGE_STORE);
    };
    request.onsuccess = () => {
      if (rejected) {
        request.result.close();
        return;
      }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => {
      rejected = true;
      reject(storageError("open", request.error));
    };
    request.onblocked = () => {
      rejected = true;
      reject(
        new Error(
          "Brauzer xotirasini yangilash boshqa ochiq oynada bloklangan. So‘z Orbitasi ochilgan boshqa oynalarni yoping.",
        ),
      );
    };
  });
}

export async function loadData(): Promise<AppData> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    let result: unknown;
    let transaction: IDBTransaction;
    try {
      transaction = db.transaction(STORAGE_STORE, "readonly");
      const request = transaction.objectStore(STORAGE_STORE).get(STORAGE_KEY);
      request.onsuccess = () => {
        result = request.result;
      };
    } catch {
      db.close();
      reject(storageError("read"));
      return;
    }
    transaction.oncomplete = () => {
      db.close();
      try {
        resolve(result === undefined ? emptyData() : validateBackup(result));
      } catch (error) {
        reject(error);
      }
    };
    transaction.onabort = () => {
      db.close();
      reject(storageError("read", transaction.error));
    };
    transaction.onerror = () => {
      /* onabort reports a single terminal failure. */
    };
  });
}

export async function saveData(data: AppData): Promise<void> {
  const checked = validateBackup(data);
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    let transaction: IDBTransaction;
    try {
      transaction = db.transaction(STORAGE_STORE, "readwrite");
      transaction.objectStore(STORAGE_STORE).put(checked, STORAGE_KEY);
    } catch {
      db.close();
      reject(storageError("write"));
      return;
    }
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onabort = () => {
      db.close();
      reject(storageError("write", transaction.error));
    };
    transaction.onerror = () => {
      /* Wait for abort: a request's success is not transaction completion. */
    };
  });
}
