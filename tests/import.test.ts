import { describe, expect, it } from "vitest";
import {
  applyImport,
  buildPrompt,
  importSessionConflict,
  isClozeEligible,
  parseImport,
  validateRows,
  wordIdentity,
} from "../src/lib/import";
import { emptyData, emptySchedule } from "../src/lib/types";
import { validateBackup } from "../src/lib/storage";
import type { AppData, WordContent } from "../src/lib/types";

const selected = {
  language: "de" as const,
  level: "A1.2" as const,
  title: "Dars 1",
};
function source(words: unknown[], extra = {}) {
  return JSON.stringify({
    schemaVersion: 1,
    language: "de",
    level: "A1.2",
    title: "Dars 1",
    words,
    ...extra,
  });
}
const heute: WordContent = {
  word: "heute",
  translation: "bugun",
  acceptedAnswers: ["heute"],
  sentence: "Ich komme heute.",
  sentenceTranslation: "Men bugun kelaman.",
  clozeText: "Ich komme {{blank}}.",
  clozeAnswers: ["heute"],
};
function stored(): AppData {
  const data = emptyData();
  data.collections.push({
    id: "collection",
    title: "Oldingi",
    language: "de",
    level: "A1.2",
    createdAt: 1,
  });
  data.words.push({
    ...heute,
    id: "word",
    collectionId: "collection",
    schedules: {
      translation: { stage: 3, dueAt: 12345, attempts: 6, lastReviewedAt: 1 },
      cloze: emptySchedule(),
    },
  });
  data.history.push({
    id: "h",
    sessionId: "s",
    questionId: "q",
    wordId: "word",
    mode: "translation",
    answer: "heute",
    correct: true,
    assisted: false,
    hard: false,
    firstAttempt: true,
    at: 1,
  });
  return data;
}

describe("import parsing and row validation", () => {
  it("accepts plain JSON and fenced JSON without evaluating content", () => {
    for (const json of [
      source([heute]),
      `\`\`\`json\n${source([heute])}\n\`\`\``,
    ]) {
      const document = parseImport(json, selected, emptyData());
      expect(document.rows).toHaveLength(1);
      expect(document.rows[0].errors).toEqual([]);
      expect(document.rows[0].content).toEqual(heute);
    }
    expect(() =>
      parseImport("(()=> alert(1))()", selected, emptyData()),
    ).toThrow("JSON");
  });

  it("rejects malformed JSON, unsupported versions, mismatched metadata and missing words", () => {
    expect(() => parseImport("{", selected, emptyData())).toThrow("JSON");
    expect(() => parseImport("[]", selected, emptyData())).toThrow("obyekt");
    expect(() =>
      parseImport(source([heute], { schemaVersion: 2 }), selected, emptyData()),
    ).toThrow("schemaVersion");
    expect(() =>
      parseImport(source([heute], { language: "en" }), selected, emptyData()),
    ).toThrow("til");
    expect(() =>
      parseImport(source([heute], { level: "B2" }), selected, emptyData()),
    ).toThrow("daraja");
    expect(() => parseImport(source([]), selected, emptyData())).toThrow(
      "kamida bitta",
    );
  });

  it("preserves invalid row values until explicitly edited instead of dropping rows", () => {
    const document = parseImport(
      source([
        { word: 42, translation: "bugun", acceptedAnswers: "heute" },
        null,
      ]),
      selected,
      emptyData(),
    );
    expect(document.rows).toHaveLength(2);
    expect(document.rows[0].content.word).toBe(42);
    expect(document.rows[0].content.acceptedAnswers).toBe("heute");
    expect(document.rows.every((row) => row.errors.length > 0)).toBe(true);
    expect(() => applyImport(emptyData(), document)).toThrow("1-qator");
    const repaired = validateRows(
      document.rows.map((row) => ({
        ...row,
        content: { word: "heute", translation: "bugun" },
        raw: undefined,
      })),
      "de",
      emptyData(),
    );
    expect(repaired.every((row) => !row.errors.length)).toBe(true);
  });

  it("keeps words lacking sentence fields and identifies unsupported fields visibly", () => {
    const document = parseImport(
      source([{ word: "heute", translation: "bugun", extra: 3 }]),
      selected,
      emptyData(),
    );
    expect(document.rows[0].errors).toEqual([]);
    expect(document.rows[0].warnings.join(" ")).toContain(
      "Gap maydonlari yo‘q",
    );
    expect(document.rows[0].warnings.join(" ")).toContain("extra");
    expect(document.rows[0].raw).toEqual({
      word: "heute",
      translation: "bugun",
      extra: 3,
    });
    expect(isClozeEligible(document.rows[0].content)).toBe(false);
    expect(applyImport(emptyData(), document).words).toHaveLength(1);
  });

  it("rejects invalid optional types and empty accepted answers", () => {
    const document = parseImport(
      source([
        {
          word: "heute",
          translation: "bugun",
          sentence: 5,
          acceptedAnswers: [],
          clozeAnswers: [null],
        },
      ]),
      selected,
      emptyData(),
    );
    expect(document.rows[0].errors).toHaveLength(3);
  });
});

describe("explicit cloze eligibility", () => {
  it("requires a single marker, translated original sentence and nonempty cloze answers", () => {
    expect(isClozeEligible(heute)).toBe(true);
    expect(isClozeEligible({ ...heute, sentence: undefined })).toBe(false);
    expect(isClozeEligible({ ...heute, sentenceTranslation: "" })).toBe(false);
    expect(
      isClozeEligible({ ...heute, clozeText: "{{blank}} und {{blank}}" }),
    ).toBe(false);
    expect(isClozeEligible({ ...heute, clozeText: "Ich komme heute." })).toBe(
      false,
    );
    expect(isClozeEligible({ ...heute, clozeAnswers: [] })).toBe(false);
    expect(isClozeEligible({ ...heute, clozeAnswers: [" "] })).toBe(false);
  });

  it("allows cloze answers that differ from the dictionary word", () => {
    expect(
      isClozeEligible({
        word: "gehen",
        translation: "bormoq",
        sentence: "Er geht.",
        sentenceTranslation: "U boradi.",
        clozeText: "Er {{blank}}.",
        clozeAnswers: ["geht"],
      }),
    ).toBe(true);
  });
});

describe("duplicate handling", () => {
  it("matches language, normalized spelling and meaning without stripping umlauts or ß", () => {
    expect(wordIdentity("de", " der  Tisch ", " STOL ")).toBe(
      wordIdentity("de", "der Tisch", "stol"),
    );
    expect(wordIdentity("de", "schön", "chiroyli")).not.toBe(
      wordIdentity("de", "schon", "chiroyli"),
    );
    expect(wordIdentity("de", "Straße", "ko‘cha")).not.toBe(
      wordIdentity("de", "Strasse", "ko‘cha"),
    );
    expect(wordIdentity("de", "gift", "sovg‘a")).not.toBe(
      wordIdentity("en", "gift", "sovg‘a"),
    );
    expect(wordIdentity("en", "bank", "bank")).not.toBe(
      wordIdentity("en", "bank", "qirg‘oq"),
    );
  });

  it("skips existing duplicate by default and does not create an empty collection", () => {
    const before = stored();
    const document = parseImport(source([heute]), selected, before);
    expect(document.rows[0].duplicateId).toBe("word");
    const next = applyImport(before, document);
    expect(next.words).toEqual(before.words);
    expect(next.collections).toEqual(before.collections);
    expect(next.history).toBe(before.history);
  });

  it("updates duplicate content while retaining schedule, collection, word identity and history", () => {
    const before = stored();
    const document = parseImport(
      source([{ ...heute, sentence: "Heute bleibe ich." }]),
      selected,
      before,
    );
    document.rows[0].action = "update";
    const next = applyImport(before, document);
    expect(next.words[0].sentence).toBe("Heute bleibe ich.");
    expect(next.words[0].id).toBe("word");
    expect(next.words[0].collectionId).toBe("collection");
    expect(next.words[0].schedules).toBe(before.words[0].schedules);
    expect(next.history).toBe(before.history);
    expect(before.words[0].sentence).toBe(heute.sentence);
  });

  it("finds duplicates within a batch and supports explicit update while retaining different meanings", () => {
    const document = parseImport(
      source([
        heute,
        { ...heute, sentence: "Heute lerne ich." },
        { ...heute, translation: "shu kuni" },
      ]),
      selected,
      emptyData(),
    );
    expect(document.rows[1].duplicateRowKey).toBe(document.rows[0].key);
    document.rows[1].action = "update";
    const next = applyImport(emptyData(), document);
    expect(next.words).toHaveLength(2);
    expect(next.words[0].sentence).toBe("Heute lerne ich.");
    expect(next.collections).toHaveLength(1);
    expect(next.words[0].schedules.translation.stage).toBe(0);
  });

  it("handles a large collection without losing rows", () => {
    const document = parseImport(
      source(
        Array.from({ length: 2500 }, (_, index) => ({
          word: `Wort ${index}`,
          translation: `so‘z ${index}`,
        })),
      ),
      selected,
      emptyData(),
    );
    expect(applyImport(emptyData(), document).words).toHaveLength(2500);
  });
});

it("builds a language/level-specific prompt with all important external-AI rules", () => {
  const prompt = buildPrompt("en", "B2", "Sayohat");
  expect(prompt).toContain("inglizcha");
  expect(prompt).toContain("B2");
  expect(prompt).toContain("Sayohat");
  expect(prompt).toContain('"language": "en"');
  expect(prompt).toContain("{{blank}}");
  expect(prompt).toContain("to‘qima");
  expect(prompt).toContain("Faqat JSON");
  expect(prompt).toContain("grammatik");
});

describe("import and storage integration", () => {
  it("produces valid persisted data when sentence fields are absent", () => {
    const document = parseImport(
      source([{ word: "heute", translation: "bugun" }]),
      selected,
      emptyData(),
    );
    const data = applyImport(emptyData(), document);
    expect(validateBackup(data)).toEqual(data);
    expect(Object.hasOwn(data.words[0], "sentence")).toBe(false);
  });

  it("omits explicitly cleared optional fields without changing invalid pasted values", () => {
    const document = parseImport(source([heute]), selected, emptyData());
    document.rows[0].content = {
      ...document.rows[0].content,
      acceptedAnswers: undefined,
      sentence: undefined,
      sentenceTranslation: undefined,
      clozeText: undefined,
      clozeAnswers: undefined,
    };
    const data = applyImport(emptyData(), document);
    expect(validateBackup(data)).toEqual(data);
    expect(data.words[0].word).toBe("heute");
    expect(Object.hasOwn(data.words[0], "acceptedAnswers")).toBe(false);
    expect(Object.hasOwn(data.words[0], "sentence")).toBe(false);
    const invalid = parseImport(
      source([{ word: "heute", translation: "bugun", sentence: null }]),
      selected,
      emptyData(),
    );
    expect(invalid.rows[0].content.sentence).toBe(null);
    expect(() => applyImport(emptyData(), invalid)).toThrow("1-qator");
  });

  it("explicitly skips invalid duplicate optional fields but rejects them when updating", () => {
    const before = stored();
    const document = parseImport(
      source([{ ...heute, sentence: null }]),
      selected,
      before,
    );
    expect(document.rows[0].errors).not.toHaveLength(0);
    expect(document.rows[0].duplicateId).toBe("word");
    const skipped = applyImport(before, document);
    expect(skipped.words).toEqual(before.words);
    expect(validateBackup(skipped)).toEqual(skipped);
    document.rows[0].action = "update";
    expect(() => applyImport(before, document)).toThrow("1-qator");
  });

  it("keeps the first new row when a later malformed duplicate is explicitly skipped", () => {
    const document = parseImport(
      source([heute, { ...heute, acceptedAnswers: 42 }]),
      selected,
      emptyData(),
    );
    const data = applyImport(emptyData(), document);
    expect(data.words).toHaveLength(1);
    expect(data.words[0].acceptedAnswers).toEqual(["heute"]);
    expect(validateBackup(data)).toEqual(data);
  });

  it("applies same-batch updates to an existing word exactly once while preserving history and schedules", () => {
    const before = stored();
    const document = parseImport(
      source([
        { ...heute, sentence: "First." },
        { ...heute, sentence: "Second." },
        { ...heute, sentence: "Skipped." },
      ]),
      selected,
      before,
    );
    document.rows[0].action = "update";
    document.rows[1].action = "update";
    const data = applyImport(before, document);
    expect(data.words).toHaveLength(1);
    expect(data.words[0].sentence).toBe("Second.");
    expect(data.words[0].schedules).toEqual(before.words[0].schedules);
    expect(data.history).toEqual(before.history);
    expect(data.collections).toEqual(before.collections);
    expect(validateBackup(data)).toEqual(data);
  });
});

describe("imports affecting unfinished sessions", () => {
  function active(): AppData {
    const data = stored();
    data.session = {
      id: "active-session",
      mode: "cloze",
      collectionId: "collection",
      queue: [{ id: "active-question", wordId: "word", isRetry: false }],
      index: 0,
      results: [],
      startedAt: 2,
      draft: "",
      hintUsed: false,
      revealed: false,
      feedback: null,
      completedAt: null,
    };
    return data;
  }

  it("rejects duplicate updates that would change a live question without explicit acknowledgement", () => {
    const data = active();
    const document = parseImport(
      source([{ word: "heute", translation: "bugun" }]),
      selected,
      data,
    );
    document.rows[0].action = "update";
    expect(importSessionConflict(data, document)).toBe(true);
    expect(() => applyImport(data, document)).toThrow("aniq tasdiqlang");
    expect(data.session?.mode).toBe("cloze");
    expect(data.words[0].clozeText).toBe(heute.clozeText);
  });

  it("clears only the affected unfinished session after acknowledgement and keeps history and schedules", () => {
    const data = active();
    const document = parseImport(
      source([{ word: "heute", translation: "bugun" }]),
      selected,
      data,
    );
    document.rows[0].action = "update";
    const next = applyImport(data, document, true);
    expect(next.session).toBe(null);
    expect(next.history).toEqual(data.history);
    expect(next.words[0].schedules).toEqual(data.words[0].schedules);
    expect(next.words[0].clozeText).toBeUndefined();
    expect(validateBackup(next)).toEqual(next);
    expect(data.session).not.toBe(null);
  });

  it("does not conflict with explicitly skipped duplicates or newly added words", () => {
    const data = active();
    const document = parseImport(
      source([heute, { word: "morgen", translation: "ertaga" }]),
      selected,
      data,
    );
    expect(importSessionConflict(data, document)).toBe(false);
    expect(applyImport(data, document, true).session).toBe(data.session);
  });

  it("detects an existing duplicate updated later in the same batch even if the earlier row is skipped", () => {
    const data = active();
    const document = parseImport(
      source([heute, { ...heute, sentence: "Heute bleibe ich." }]),
      selected,
      data,
    );
    document.rows[1].action = "update";
    expect(document.rows[1].duplicateRowKey).toBe(document.rows[0].key);
    expect(importSessionConflict(data, document)).toBe(true);
    expect(() => applyImport(data, document)).toThrow("tugallanmagan");
    const next = applyImport(data, document, true);
    expect(next.words[0].sentence).toBe("Heute bleibe ich.");
    expect(next.session).toBe(null);
    expect(next.history).toEqual(data.history);
  });

  it("keeps completed and unrelated sessions even if cancellation was acknowledged", () => {
    const completed = active();
    completed.session = { ...completed.session!, index: 1, completedAt: 3 };
    const document = parseImport(source([heute]), selected, completed);
    document.rows[0].action = "update";
    expect(importSessionConflict(completed, document)).toBe(false);
    expect(applyImport(completed, document, true).session).toBe(
      completed.session,
    );
    const unrelated = active();
    unrelated.words.push({
      ...unrelated.words[0],
      id: "other-word",
      word: "morgen",
      translation: "ertaga",
    });
    unrelated.session!.queue[0].wordId = "other-word";
    expect(importSessionConflict(unrelated, document)).toBe(false);
    expect(applyImport(unrelated, document, true).session).toBe(
      unrelated.session,
    );
  });
});
