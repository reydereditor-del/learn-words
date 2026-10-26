import { emptySchedule, id, isLanguage, LANGUAGE_NAMES, LEVELS } from "./types";
import type { AppData, Language, Level, Word, WordContent } from "./types";

export interface ImportRow {
  key: string;
  content: WordContent;
  errors: string[];
  warnings: string[];
  duplicateId: string | null;
  duplicateRowKey: string | null;
  action: "skip" | "update";
  raw?: unknown;
}

export interface ImportDocument {
  language: Language;
  level: Level;
  title: string;
  rows: ImportRow[];
}

const CONTENT_KEYS = [
  "word",
  "translation",
  "partOfSpeech",
  "acceptedAnswers",
  "sentence",
  "sentenceTranslation",
  "clozeText",
  "clozeAnswers",
] as const;
const OPTIONAL_TEXT = [
  "partOfSpeech",
  "sentence",
  "sentenceTranslation",
  "clozeText",
] as const;
const FIELD_NAMES: Record<string, string> = {
  word: "So‘z",
  translation: "Tarjima",
  partOfSpeech: "So‘z turkumi",
  sentence: "Gap",
  sentenceTranslation: "Gap tarjimasi",
  clozeText: "Bo‘shliqli gap",
  acceptedAnswers: "Qabul qilinadigan javoblar",
  clozeAnswers: "Bo‘shliq javoblari",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizedIdentityPart(value: string): string {
  return value
    .normalize("NFC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase();
}

/** Identical spellings with distinct meanings, or in distinct languages, remain independent words. */
export function wordIdentity(
  language: Language,
  word: string,
  translation: string,
): string {
  return JSON.stringify([
    language,
    normalizedIdentityPart(word),
    normalizedIdentityPart(translation),
  ]);
}

/** Explicit markers avoid hiding substrings or accidentally revealing a cloze answer. */
export function isClozeEligible(word: WordContent): boolean {
  return (
    nonempty(word.sentence) &&
    nonempty(word.sentenceTranslation) &&
    nonempty(word.clozeText) &&
    (word.clozeText.match(/\{\{blank\}\}/g)?.length ?? 0) === 1 &&
    Array.isArray(word.clozeAnswers) &&
    word.clozeAnswers.length > 0 &&
    word.clozeAnswers.every(nonempty)
  );
}

function knownContent(value: unknown): WordContent {
  if (!isRecord(value)) return { word: "", translation: "" };
  const result: Record<string, unknown> = { word: "", translation: "" };
  for (const key of CONTENT_KEYS) {
    if (
      Object.hasOwn(value, key) &&
      (key === "word" || key === "translation" || value[key] !== undefined)
    ) {
      result[key] = value[key];
    }
  }
  // Keep supplied invalid types intact: validation explains them and the editor can replace them.
  return result as unknown as WordContent;
}

function rowMessages(
  row: ImportRow,
  language: Language,
): Pick<ImportRow, "errors" | "warnings"> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const content = row.content;
  for (const field of ["word", "translation"] as const) {
    if (!nonempty(content[field]))
      errors.push(`${FIELD_NAMES[field]} bo‘sh bo‘lmagan matn bo‘lishi kerak.`);
  }
  for (const field of OPTIONAL_TEXT) {
    if (content[field] !== undefined && typeof content[field] !== "string") {
      errors.push(`${FIELD_NAMES[field]} matn bo‘lishi kerak.`);
    }
  }
  for (const field of ["acceptedAnswers", "clozeAnswers"] as const) {
    const value = content[field];
    if (
      value !== undefined &&
      (!Array.isArray(value) || !value.every(nonempty))
    ) {
      errors.push(
        `${FIELD_NAMES[field]} bo‘sh bo‘lmagan matnlar massivi bo‘lishi kerak.`,
      );
    }
  }
  if (
    Array.isArray(content.acceptedAnswers) &&
    content.acceptedAnswers.length === 0
  ) {
    errors.push(
      "Qabul qilinadigan javoblar bo‘sh: kamida bitta javob yozing yoki maydonni olib tashlang.",
    );
  }
  if (isRecord(row.raw)) {
    const extra = Object.keys(row.raw).filter(
      (key) => !CONTENT_KEYS.includes(key as (typeof CONTENT_KEYS)[number]),
    );
    if (extra.length)
      warnings.push(
        `Qo‘shimcha maydonlar lug‘atga saqlanmaydi: ${extra.join(", ")}. Asl JSON’ni tekshiring.`,
      );
  }
  if (!isClozeEligible(content)) {
    const hasSentenceFields = [
      "sentence",
      "sentenceTranslation",
      "clozeText",
      "clozeAnswers",
    ].some((key) => Object.hasOwn(content, key));
    warnings.push(
      hasSentenceFields
        ? "Gap mashqiga tayyor emas: gap, o‘zbekcha tarjima, aynan bitta {{blank}} va kamida bitta bo‘shliq javobi kerak. Faqat tarjima mashqida qatnashadi."
        : "Gap maydonlari yo‘q. Faqat tarjima mashqida qatnashadi.",
    );
  }
  if (
    language === "de" &&
    content.partOfSpeech === "noun" &&
    nonempty(content.word) &&
    !/^(der|die|das)\s+\S/u.test(content.word.trim())
  ) {
    warnings.push(
      "Nemischa ot artiklsiz ko‘rinmoqda. Der, die yoki das artiklini tekshiring.",
    );
  }
  return { errors, warnings };
}

export function validateRows(
  rows: ImportRow[],
  language: Language,
  existing: AppData,
): ImportRow[] {
  const collectionLanguages = new Map(
    existing.collections.map((collection) => [
      collection.id,
      collection.language,
    ]),
  );
  const existingIdentities = new Map(
    existing.words
      .filter((word) => collectionLanguages.get(word.collectionId) === language)
      .map((word) => [
        wordIdentity(language, word.word, word.translation),
        word.id,
      ]),
  );
  const seen = new Map<string, string>();
  return rows.map((row) => {
    const messages = rowMessages(row, language);
    let duplicateId: string | null = null;
    let duplicateRowKey: string | null = null;
    if (nonempty(row.content.word) && nonempty(row.content.translation)) {
      const identity = wordIdentity(
        language,
        row.content.word,
        row.content.translation,
      );
      duplicateId = existingIdentities.get(identity) ?? null;
      duplicateRowKey = seen.get(identity) ?? null;
      if (!seen.has(identity)) seen.set(identity, row.key);
    }
    return { ...row, ...messages, duplicateId, duplicateRowKey };
  });
}

export function parseImport(
  text: string,
  expected: { language: Language; level: Level; title: string },
  existing: AppData,
): ImportDocument {
  let source = text.trim();
  if (!source) throw new Error("Avval JSON matnini joylang.");
  const fenced = source.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i);
  if (fenced) source = fenced[1].trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error(
      "JSON formati buzilgan. Qavslar, vergullar va qo‘shtirnoqlarni tekshiring. Faqat JSON yoki bitta JSON kod blokini joylang.",
    );
  }
  if (!isRecord(parsed))
    throw new Error("Import ildizi JSON obyekt bo‘lishi kerak.");
  if (parsed.schemaVersion !== 1)
    throw new Error("Qo‘llab-quvvatlanadigan schemaVersion: 1.");
  if (!isLanguage(parsed.language))
    throw new Error('language faqat "de", "en" yoki "ru" bo‘lishi kerak.');
  if (parsed.language !== expected.language)
    throw new Error(
      "JSON tili tanlangan tilga mos emas. Tilni yoki JSON’ni tuzating.",
    );
  if (!LEVELS.includes(parsed.level as Level))
    throw new Error("Daraja A1, A1.2, A2, B1 yoki B2 bo‘lishi kerak.");
  if (parsed.level !== expected.level)
    throw new Error(
      "JSON darajasi tanlangan darajaga mos emas. Darajani yoki JSON’ni tuzating.",
    );
  if (parsed.title !== undefined && !nonempty(parsed.title))
    throw new Error(
      "JSON’dagi to‘plam nomi bo‘sh bo‘lmagan matn bo‘lishi kerak.",
    );
  const title =
    expected.title.trim() ||
    (typeof parsed.title === "string" ? parsed.title.trim() : "");
  if (!title) throw new Error("To‘plam nomini yozing.");
  if (!Array.isArray(parsed.words) || parsed.words.length === 0)
    throw new Error("words kamida bitta so‘zdan iborat massiv bo‘lishi kerak.");
  const rows: ImportRow[] = parsed.words.map((raw) => ({
    key: id(),
    content: knownContent(raw),
    raw,
    errors: [],
    warnings: [],
    duplicateId: null,
    duplicateRowKey: null,
    action: "skip",
  }));
  return {
    language: parsed.language,
    level: parsed.level as Level,
    title,
    rows: validateRows(rows, parsed.language, existing),
  };
}

/** Updating a word changes a live question, so it requires explicitly ending the affected round. */
export function importSessionConflict(
  data: AppData,
  document: ImportDocument,
): boolean {
  const session = data.session;
  if (!session || session.completedAt !== null) return false;
  const referenced = new Set([
    ...session.queue.map((question) => question.wordId),
    ...session.results.map((result) => result.wordId),
    ...(session.feedback ? [session.feedback.wordId] : []),
  ]);
  const collectionLanguages = new Map(
    data.collections.map((collection) => [collection.id, collection.language]),
  );
  const identities = new Map(
    data.words
      .filter(
        (word) =>
          collectionLanguages.get(word.collectionId) === document.language,
      )
      .map((word) => [
        wordIdentity(document.language, word.word, word.translation),
        word.id,
      ]),
  );
  return document.rows.some((row) => {
    if (
      row.action !== "update" ||
      !nonempty(row.content.word) ||
      !nonempty(row.content.translation)
    )
      return false;
    const existingId = identities.get(
      wordIdentity(
        document.language,
        row.content.word,
        row.content.translation,
      ),
    );
    return existingId !== undefined && referenced.has(existingId);
  });
}

/** Applies a reviewed import without resetting any existing word's learning history. */
export function applyImport(
  data: AppData,
  document: ImportDocument,
  cancelActiveSession = false,
): AppData {
  const title = document.title.trim();
  if (!title) throw new Error("To‘plam nomini yozing.");
  if (!LEVELS.includes(document.level) || !isLanguage(document.language))
    throw new Error("Til yoki daraja noto‘g‘ri.");
  const rows = validateRows(document.rows, document.language, data);
  if (!rows.length) throw new Error("Import qilish uchun so‘zlar yo‘q.");
  const invalid = rows.findIndex(
    (row) =>
      row.errors.length > 0 &&
      !((row.duplicateId || row.duplicateRowKey) && row.action === "skip"),
  );
  if (invalid !== -1)
    throw new Error(
      `${invalid + 1}-qatordagi xatolarni tuzating: ${rows[invalid].errors.join(" ")}`,
    );
  const sessionConflict = importSessionConflict(data, document);
  if (sessionConflict && !cancelActiveSession) {
    throw new Error(
      "Yangilanadigan so‘z tugallanmagan raundda qatnashmoqda. Davom etish uchun shu raund navbatini bekor qilishni aniq tasdiqlang. Yozilgan javoblar tarixi saqlanadi.",
    );
  }
  const collectionLanguages = new Map(
    data.collections.map((collection) => [collection.id, collection.language]),
  );
  const identities = new Map(
    data.words
      .filter(
        (word) =>
          collectionLanguages.get(word.collectionId) === document.language,
      )
      .map((word) => [
        wordIdentity(document.language, word.word, word.translation),
        word.id,
      ]),
  );
  const collection = {
    id: id(),
    title,
    language: document.language,
    level: document.level,
    createdAt: Date.now(),
  };
  let words = [...data.words];
  let added = false;
  for (const row of rows) {
    // The user explicitly skipped this duplicate. Keep invalid optional content out of storage.
    if ((row.duplicateId || row.duplicateRowKey) && row.action === "skip")
      continue;
    const content = knownContent(row.content);
    const identity = wordIdentity(
      document.language,
      content.word,
      content.translation,
    );
    const duplicateId = identities.get(identity);
    if (duplicateId) {
      if (row.action === "update") {
        words = words.map((word) =>
          word.id === duplicateId
            ? {
                ...content,
                id: word.id,
                collectionId: word.collectionId,
                schedules: word.schedules,
              }
            : word,
        );
      }
      continue;
    }
    const word: Word = {
      ...content,
      id: id(),
      collectionId: collection.id,
      schedules: { translation: emptySchedule(), cloze: emptySchedule() },
    };
    words.push(word);
    identities.set(identity, word.id);
    added = true;
  }
  return {
    ...data,
    collections: added ? [...data.collections, collection] : data.collections,
    words,
    session: sessionConflict && cancelActiveSession ? null : data.session,
  };
}

export function buildPrompt(
  language: Language,
  level: Level,
  title: string,
): string {
  const spellingRule =
    language === "de"
      ? "Nemischa otlarni der, die yoki das artikli bilan va odatiy bosh harfda yoz."
      : language === "ru"
        ? "Ruscha so‘z va gaplarni kirill yozuvida yoz. ё va е ni o‘zboshimchalik bilan almashtirma; nemischa artikllarni qo‘shma."
        : "Inglizcha so‘z va gaplarni tabiiy inglizcha imloda yoz; nemischa artikllarni qo‘shma.";
  return `Men bergan so‘zlar ro‘yxati yoki PDF’dagi so‘zlarni ${LANGUAGE_NAMES[language].toLowerCase()} tilida, ${level} darajasida o‘rganish uchun JSON’ga aylantir. To‘plam nomi: ${JSON.stringify(title.trim() || "Mening so‘zlarim")}.

Qoidalar:
- Faqat men bergan so‘zlarni qayta ishla; boshqa so‘zlarni lug‘atga qo‘shma.
- ${spellingRule}
- Tarjimalarni aniq o‘zbekcha yoz. Bir xil yozilgan turli ma’nolarni alohida obyektlarda ber.
- Gaplar tanlangan ${level} darajasiga mos, tabiiy va qisqa bo‘lsin.
- clozeText ichida aynan bitta {{blank}} bo‘lsin. Bu aniq bo‘shliq belgisi; boshqa qismlarni yashirma.
- clozeAnswers ichida aynan shu gap bo‘shlig‘iga grammatik jihatdan mos shaklni ber. U word dagi lug‘at shaklidan farq qilishi mumkin.
- acceptedAnswers ichiga faqat tarjima savoli uchun haqiqiy mos javoblarni kirit. So‘zning to‘g‘ri imlosini saqla. Ilova katta-kichik harfni farqlamaydi; faqat harf kattaligi farq qiladigan takroriy variantlarni qo‘shma. Artikl, umlaut, ß va ё kabi boshqa harf farqlari saqlanadi.
- Noaniq yoki o‘qilmagan so‘zlarni to‘qima. Ishonchli gap tuza olmasang gapga oid barcha ixtiyoriy maydonlarni qoldir.
- Faqat JSON qaytar. Izoh, Markdown yoki kod bloki qo‘shma.
- word va translation majburiy, qolgan so‘z maydonlari ixtiyoriy. acceptedAnswers berilmasa word javob hisoblanadi.

Quyidagi sxemadan foydalan (burchakli qavsdagi yozuvlarni haqiqiy ma’lumot bilan almashtir):
{
  "schemaVersion": 1,
  "language": "${language}",
  "level": "${level}",
  "title": ${JSON.stringify(title.trim() || "Mening so‘zlarim")},
  "words": [
    {
      "word": "<so‘z>",
      "translation": "<o‘zbekcha tarjima>",
      "partOfSpeech": "<noun, verb, adjective yoki adverb>",
      "acceptedAnswers": ["<qabul qilinadigan aniq javob>"],
      "sentence": "<to‘liq gap>",
      "sentenceTranslation": "<gapning o‘zbekcha tarjimasi>",
      "clozeText": "<gapning javob o‘rnida {{blank}} belgisi bor shakli>",
      "clozeAnswers": ["<bo‘shliqqa mos shakl>"]
    }
  ]
}

Mening ro‘yxatim yoki PDF’im quyida yoki biriktirilgan faylda:`;
}
