import { describe, it, expect } from "vitest";
import { emptyData, LANGUAGES, LANGUAGE_NAMES } from "../src/lib/types";
import type { Language, WordContent } from "../src/lib/types";
import { applyImport, buildPrompt, parseImport } from "../src/lib/import";
import {
  checkAnswer,
  createSession,
  recordAnswer,
  advanceSession,
} from "../src/lib/study";
import { parseBackup, serializeBackup } from "../src/lib/storage";

const fixtures: Record<Language, WordContent> = {
  de: {
    word: "die Informatik",
    translation: "informatika",
    partOfSpeech: "noun",
    acceptedAnswers: ["die Informatik"],
    sentence: "Informatik ist interessant.",
    sentenceTranslation: "Informatika qiziqarli.",
    clozeText: "{{blank}} ist interessant.",
    clozeAnswers: ["Informatik"],
  },
  en: {
    word: "go",
    translation: "bormoq",
    acceptedAnswers: ["go"],
    sentence: "He went home.",
    sentenceTranslation: "U uyga bordi.",
    clozeText: "He {{blank}} home.",
    clozeAnswers: ["went"],
  },
  ru: {
    word: "идти",
    translation: "bormoq",
    acceptedAnswers: ["идти"],
    sentence: "Он идёт домой.",
    sentenceTranslation: "U uyga boryapti.",
    clozeText: "Он {{blank}} домой.",
    clozeAnswers: ["идёт"],
  },
};
describe.each(LANGUAGES)("%s language workflow", (language) => {
  it("imports, practices both modes ignoring case, and restores complete history", () => {
    const word = fixtures[language];
    const selected = {
      language,
      level: "A1.2" as const,
      title: LANGUAGE_NAMES[language],
    };
    let data = applyImport(
      emptyData(),
      parseImport(
        JSON.stringify({ schemaVersion: 1, ...selected, words: [word] }),
        selected,
        emptyData(),
      ),
    );
    data.session = createSession(data, "translation");
    data = recordAnswer(
      data,
      "  " + word.word.toLocaleUpperCase(language) + "  ",
      { hintUsed: false, revealed: false },
    );
    expect(data.history[0].correct).toBe(true);
    expect(data.words[0].schedules.translation.stage).toBe(1);
    data = advanceSession(data);
    data.session = createSession(data, "cloze");
    data = recordAnswer(
      data,
      word.clozeAnswers![0].toLocaleUpperCase(language),
      { hintUsed: false, revealed: false },
    );
    expect(data.session!.feedback!.correct).toBe(true);
    expect(data.words[0].schedules.cloze.stage).toBe(1);
    expect(parseBackup(serializeBackup(data))).toEqual(data);
  });
  it("generates a prompt specific to the selected language", () => {
    const prompt = buildPrompt(language, "B1", "Sayohat");
    expect(prompt).toContain(`"language": "${language}"`);
    expect(prompt).toContain("B1");
    expect(prompt).toContain(LANGUAGE_NAMES[language].toLowerCase());
    if (language === "ru") {
      expect(prompt).toContain("kirill");
      expect(prompt).toContain("ё va е");
    }
  });
});
describe("case-insensitive strict spelling", () => {
  it.each(["die informatik", "DIE INFORMATIK", "Die InFoRmAtIk"])(
    "accepts %s without altering the stored word",
    (answer) => {
      const word = fixtures.de;
      expect(checkAnswer(answer, word, "translation", "de")).toMatchObject({
        correct: true,
        expected: "die Informatik",
      });
      expect(word.word).toBe("die Informatik");
    },
  );
  it("keeps articles, umlauts, ß and Russian ё distinct", () => {
    expect(
      checkAnswer("DER INFORMATIK", fixtures.de, "translation", "de"),
    ).toMatchObject({ correct: false, kind: "article" });
    expect(
      checkAnswer("INFORMATIK", fixtures.de, "translation", "de").correct,
    ).toBe(false);
    expect(
      checkAnswer(
        "SCHON",
        { word: "schön", translation: "chiroyli" },
        "translation",
        "de",
      ).correct,
    ).toBe(false);
    expect(
      checkAnswer(
        "GROSS",
        { word: "groß", translation: "katta" },
        "translation",
        "de",
      ).correct,
    ).toBe(false);
    expect(
      checkAnswer(
        "GROẞ",
        { word: "groß", translation: "katta" },
        "translation",
        "de",
      ).correct,
    ).toBe(true);
    expect(checkAnswer("ИДЕТ", fixtures.ru, "cloze", "ru").correct).toBe(false);
    expect(checkAnswer("ИДЁТ", fixtures.ru, "cloze", "ru").correct).toBe(true);
  });
});
