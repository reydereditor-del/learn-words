import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { AppData, WordContent } from "../src/lib/types";

const today: WordContent = {
  word: "heute",
  translation: "bugun",
  partOfSpeech: "adverb",
  acceptedAnswers: ["heute"],
};
const table: WordContent = {
  word: "der Tisch",
  translation: "stol",
  partOfSpeech: "noun",
  acceptedAnswers: ["der Tisch"],
};
const go: WordContent = {
  word: "gehen",
  translation: "bormoq",
  partOfSpeech: "verb",
  acceptedAnswers: ["gehen"],
  sentence: "Er geht heute.",
  sentenceTranslation: "U bugun boradi.",
  clozeText: "Er {{blank}} heute.",
  clozeAnswers: ["geht"],
};
const payload = (words: unknown[]) =>
  JSON.stringify({
    schemaVersion: 1,
    language: "de",
    level: "A1.2",
    title: "Mening so‘zlarim",
    words,
  });

async function stored(page: Page): Promise<AppData> {
  return page.evaluate(
    () =>
      new Promise<AppData>((resolve, reject) => {
        const request = indexedDB.open("soz-orbitasi", 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction("app", "readonly");
          const read = transaction.objectStore("app").get("state");
          read.onsuccess = () => resolve(read.result);
          read.onerror = () => reject(read.error);
          transaction.oncomplete = () => db.close();
        };
      }),
  );
}
async function openImport(page: Page, source: string) {
  await page.getByRole("button", { name: "Import", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "So‘zlarni import qilish" });
  await dialog
    .getByRole("textbox", { name: "JSON matni", exact: true })
    .fill(source);
  await dialog.getByRole("button", { name: "Tekshirish", exact: true }).click();
  return dialog;
}
async function importWords(page: Page, words: WordContent[], fenced = false) {
  const dialog = await openImport(
    page,
    fenced ? `\`\`\`json\n${payload(words)}\n\`\`\`` : payload(words),
  );
  await dialog
    .getByRole("button", { name: "To‘plamni saqlash", exact: true })
    .click();
  await expect(dialog).toBeHidden();
}
async function start(
  page: Page,
  mode: "translation" | "cloze" = "translation",
) {
  await page
    .getByRole("navigation", { name: "Asosiy" })
    .getByRole("button", { name: "Mashq qilish", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Bugun nimani mashq qilamiz?",
  });
  if (mode === "cloze")
    await dialog.getByRole("button", { name: /^Gapdagi bo‘shliq/ }).click();
  await dialog
    .getByRole("button", { name: "Mashqni boshlash", exact: true })
    .click();
  await expect(page.getByLabel("Javobingiz", { exact: true })).toBeVisible();
}
async function answer(page: Page, value: string) {
  await page.getByLabel("Javobingiz", { exact: true }).fill(value);
  await page.getByRole("button", { name: "Tekshirish", exact: true }).click();
  await expect(page.locator("#answer-feedback")).toBeVisible();
}
async function next(page: Page) {
  await page
    .getByRole("button", { name: /^(Keyingi savol|Raundni yakunlash)$/ })
    .click();
}

const consoleErrors = new Map<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  consoleErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Hali so‘z qo‘shilmagan" }),
  ).toBeVisible();
});
test.afterEach(async ({ page }) => {
  expect(
    consoleErrors.get(page),
    "No browser runtime or console errors",
  ).toEqual([]);
  consoleErrors.delete(page);
});

test("empty state contains no demo words; chosen language and level are copied in the external AI prompt", async ({
  page,
  context,
}) => {
  await expect(page.locator(".hero-meta")).toContainText("0 ta so‘z");
  await expect(page.locator(".collection-card")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Birinchi to‘plamni qo‘shish" })
    .click();
  const dialog = page.getByRole("dialog", { name: "So‘zlarni import qilish" });
  await dialog
    .getByRole("combobox", { name: "Til", exact: true })
    .selectOption("en");
  await dialog
    .getByRole("combobox", { name: "Daraja", exact: true })
    .selectOption("B1");
  await dialog
    .getByLabel("To‘plam nomi", { exact: true })
    .fill("Ishdagi so‘zlar");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await dialog
    .getByRole("button", { name: "AI uchun promptni nusxalash", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Prompt nusxalandi", exact: true }),
  ).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain('"language": "en"');
  expect(copied).toContain('"level": "B1"');
  expect(copied).toContain("Ishdagi so‘zlar");
  expect(copied).toContain("{{blank}}");
  await dialog
    .getByRole("button", { name: "Bekor qilish", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Hali so‘z qo‘shilmagan" }),
  ).toBeVisible();
});

test("malformed JSON is rejected, fenced JSON reviewed, invalid rows edited, and no-sentence words saved", async ({
  page,
}) => {
  const dialog = await openImport(page, '{"words": [');
  await expect(dialog.getByRole("alert")).toContainText(
    "JSON formati buzilgan",
  );
  await expect(
    dialog.getByRole("textbox", { name: "JSON matni", exact: true }),
  ).toHaveValue('{"words": [');
  await dialog
    .getByRole("textbox", { name: "JSON matni", exact: true })
    .fill(
      `\`\`\`json\n${payload([today, { word: "morgen", translation: 12 }])}\n\`\`\``,
    );
  await dialog.getByRole("button", { name: "Tekshirish", exact: true }).click();
  await expect(dialog.getByLabel("2-qator tarjima")).toHaveValue("12");
  await expect(
    dialog.getByRole("button", { name: "To‘plamni saqlash", exact: true }),
  ).toBeDisabled();
  await expect(dialog.getByLabel("2-qator xatolari")).toContainText("Tarjima");
  await dialog.getByLabel("2-qator tarjima").fill("ertaga");
  await expect(
    dialog.getByRole("button", { name: "To‘plamni saqlash", exact: true }),
  ).toBeEnabled();
  await dialog
    .getByRole("button", { name: "To‘plamni saqlash", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  const data = await stored(page);
  expect(data.words).toHaveLength(2);
  expect(data.words[1].translation).toBe("ertaga");
  expect(data.words.every((word) => word.sentence === undefined)).toBe(true);
  await expect(page.locator(".collection-card")).toContainText("2 ta so‘z");
});

test("first independent correct answer is saved once despite rapid Enter and resumes after refresh", async ({
  page,
}) => {
  await importWords(page, [today, table]);
  await start(page);
  const input = page.getByLabel("Javobingiz", { exact: true });
  await input.fill("  heute   ");
  await page.keyboard.down("Enter");
  await page.keyboard.down("Enter");
  await page.keyboard.up("Enter");
  await expect(page.locator("#answer-feedback")).toContainText(
    "To‘g‘ri javob!",
  );
  await expect.poll(async () => (await stored(page)).history.length).toBe(1);
  await expect(page.locator(".practice-count strong")).toHaveText("1");
  const before = await stored(page);
  expect(before.words[0].schedules.translation.stage).toBe(1);
  expect(before.words[0].schedules.translation.attempts).toBe(1);
  await page.reload();
  await page
    .getByRole("button", { name: "Davom ettirish", exact: true })
    .click();
  await expect(page.locator("#answer-feedback")).toContainText(
    "To‘g‘ri javob!",
  );
  await expect(input).toHaveValue("  heute   ");
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "stol", exact: true }),
  ).toBeVisible();
  await expect(input).toBeFocused();
  expect((await stored(page)).history).toEqual(before.history);
});

test("unfinished input draft survives refresh and can continue without losing the question", async ({
  page,
}) => {
  await importWords(page, [today]);
  await start(page);
  await page.getByLabel("Javobingiz", { exact: true }).fill("heu");
  await expect
    .poll(async () => (await stored(page)).session?.draft)
    .toBe("heu");
  await page.reload();
  await page
    .getByRole("button", { name: "Davom ettirish", exact: true })
    .click();
  await expect(page.getByLabel("Javobingiz", { exact: true })).toHaveValue(
    "heu",
  );
  expect((await stored(page)).history).toHaveLength(0);
});

for (const scenario of [
  {
    label: "article",
    word: table,
    answer: "die Tisch",
    message: "Artikl noto‘g‘ri",
  },
  {
    label: "capitalization",
    word: table,
    answer: "der tisch",
    message: "Bosh yoki kichik harf xatosi",
  },
  {
    label: "umlaut",
    word: {
      word: "schön",
      translation: "chiroyli",
      acceptedAnswers: ["schön"],
    },
    answer: "schon",
    message: "Yozuvda farq bor",
  },
  {
    label: "spelling",
    word: today,
    answer: "heut",
    message: "Yozuvda farq bor",
  },
])
  test(`German ${scenario.label} difference is explained and never accepted as correct`, async ({
    page,
  }) => {
    await importWords(page, [scenario.word]);
    await start(page);
    await answer(page, scenario.answer);
    await expect(page.locator("#answer-feedback")).toContainText(
      scenario.message,
    );
    await expect(page.locator(".answer-comparison")).toContainText(
      scenario.word.word,
    );
    const data = await stored(page);
    expect(data.history[0].correct).toBe(false);
    expect(data.words[0].schedules.translation.stage).toBe(0);
    expect(data.session?.queue).toHaveLength(2);
  });

test("one-word error round has one finite retry and does not advance interval on the repeated success", async ({
  page,
}) => {
  await importWords(page, [today]);
  await start(page);
  await answer(page, "morgen");
  await next(page);
  await expect(page.locator(".practice-content")).toContainText(
    "YANA BIR URINISH",
  );
  await expect(page.getByLabel("Javobingiz", { exact: true })).toBeFocused();
  await answer(page, "heute");
  await next(page);
  await expect(
    page.getByRole("heading", { name: "Yana bir qadam oldinga." }),
  ).toBeVisible();
  const data = await stored(page);
  expect(data.history).toHaveLength(2);
  expect(data.words[0].schedules.translation.stage).toBe(0);
  expect(data.words[0].schedules.translation.attempts).toBe(2);
  expect(data.session?.queue).toHaveLength(2);
  expect(data.session?.completedAt).not.toBeNull();
  await expect(page.locator(".result-ring")).toHaveAttribute(
    "aria-label",
    /0 foiz/,
  );
  await expect(
    page.getByRole("button", {
      name: "Qiyin so‘zlar bilan davom etish",
      exact: true,
    }),
  ).toBeVisible();
});

test("hinted correct and difficult correct are scheduled for one day without advancing stage", async ({
  page,
}) => {
  await importWords(page, [today, table]);
  await start(page);
  await page
    .getByRole("button", { name: "Birinchi harf", exact: true })
    .click();
  await expect(page.locator("#letter-hint")).toContainText("h");
  await answer(page, "heute");
  await expect(page.locator("#answer-feedback")).toContainText(
    "To‘g‘ri, yordam bilan",
  );
  await next(page);
  await answer(page, "der Tisch");
  await page
    .getByRole("button", { name: "Bilaman, lekin qiynaldim", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Belgilandi — ertaga takrorlanadi",
      exact: true,
    }),
  ).toBeVisible();
  const data = await stored(page);
  expect(data.words.map((word) => word.schedules.translation.stage)).toEqual([
    0, 0,
  ]);
  expect(data.history.map((entry) => entry.assisted)).toEqual([true, false]);
  expect(data.history[1].hard).toBe(true);
  for (const word of data.words) {
    const schedule = word.schedules.translation;
    expect(schedule.dueAt! - schedule.lastReviewedAt!).toBe(86_400_000);
    expect(schedule.attempts).toBe(1);
  }
  await next(page);
  await expect(page.locator(".result-ring")).toHaveAttribute(
    "aria-label",
    /50 foiz/,
  );
  await expect(page.locator(".result-stats > div").nth(1)).toContainText("1");
});

test("show answer is assisted, resets its stage, and returns the question once", async ({
  page,
}) => {
  await importWords(page, [today]);
  await start(page);
  await page
    .getByRole("button", { name: "Javobni ko‘rsatish", exact: true })
    .click();
  await expect(page.locator("#answer-feedback")).toContainText("Javob ochildi");
  const data = await stored(page);
  expect(data.history[0]).toMatchObject({ correct: false, assisted: true });
  expect(data.words[0].schedules.translation.stage).toBe(0);
  expect(data.session?.queue).toHaveLength(2);
});

test("cloze accepts inflected answer, excludes missing-sentence words, and hides original until checked", async ({
  page,
}) => {
  await importWords(page, [today, go]);
  await start(page, "cloze");
  await expect(page.locator(".practice-count")).toContainText("1 / 1");
  await expect(page.getByRole("heading", { name: /Er.*heute/ })).toContainText(
    "···",
  );
  await expect(
    page.getByText("U bugun boradi.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Er geht heute.", { exact: true })).toHaveCount(
    0,
  );
  await answer(page, "geht");
  await expect(page.locator("#answer-feedback")).toContainText(
    "To‘g‘ri javob!",
  );
  await expect(page.locator(".original-sentence")).toContainText(
    "Er geht heute.",
  );
  const data = await stored(page);
  const word = data.words.find((word) => word.word === "gehen")!;
  expect(word.schedules.cloze.stage).toBe(1);
  expect(word.schedules.translation.attempts).toBe(0);
  expect(data.history[0].mode).toBe("cloze");
});

test("duplicate update retains word identity and learning history; skip preserves content; meanings stay separate", async ({
  page,
}) => {
  await importWords(page, [today]);
  await start(page);
  await answer(page, "heute");
  await page.getByRole("button", { name: "Saqlash va chiqish" }).click();
  const before = await stored(page);
  const updated = { ...today, acceptedAnswers: ["heute", "am heutigen Tag"] };
  let dialog = await openImport(
    page,
    payload([updated, { word: "heute", translation: "hozir" }]),
  );
  await expect(dialog.getByLabel("1-qator takroriy so‘z amali")).toHaveValue(
    "skip",
  );
  await dialog.getByLabel("1-qator takroriy so‘z amali").selectOption("update");
  await expect(
    dialog.getByRole("button", { name: "To‘plamni saqlash", exact: true }),
  ).toBeDisabled();
  await dialog
    .getByRole("checkbox", { name: /Tugallanmagan raundni bekor/ })
    .check();
  await dialog
    .getByRole("button", { name: "To‘plamni saqlash", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  const after = await stored(page);
  expect(after.history).toEqual(before.history);
  expect(after.words[0].id).toBe(before.words[0].id);
  expect(after.words[0].schedules).toEqual(before.words[0].schedules);
  expect(after.words[0].acceptedAnswers).toEqual(updated.acceptedAnswers);
  expect(after.words.filter((word) => word.word === "heute")).toHaveLength(2);
  dialog = await openImport(
    page,
    payload([
      { ...today, acceptedAnswers: ["heute", "changed"] },
      { word: "morgen", translation: "ertaga" },
    ]),
  );
  await expect(dialog.getByLabel("1-qator takroriy so‘z amali")).toHaveValue(
    "skip",
  );
  await dialog
    .getByRole("button", { name: "To‘plamni saqlash", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  const skipped = await stored(page);
  expect(skipped.words).toHaveLength(3);
  expect(skipped.words[0].acceptedAnswers).toEqual(updated.acceptedAnswers);
  expect(skipped.history).toEqual(before.history);
});

test("collection word editing retains history and deletion requires explicit confirmation", async ({
  page,
}) => {
  await importWords(page, [today, table]);
  await start(page);
  await answer(page, "heute");
  await page.getByRole("button", { name: "Saqlash va chiqish" }).click();
  const before = await stored(page);
  await page.locator(".collection-card").click();
  const dialog = page.getByRole("dialog", { name: "Mening so‘zlarim" });
  await dialog
    .getByRole("button", { name: "heute so‘zini tahrirlash", exact: true })
    .click();
  await dialog
    .getByLabel("O‘zbekcha tarjima *", { exact: true })
    .fill("bugungi kunda");
  await expect(
    dialog.getByRole("button", { name: "O‘zgarishlarni saqlash", exact: true }),
  ).toBeDisabled();
  await dialog
    .getByRole("checkbox", { name: /Tugallanmagan raundni bekor/ })
    .check();
  await dialog
    .getByRole("button", { name: "O‘zgarishlarni saqlash", exact: true })
    .click();
  await expect(
    dialog.getByRole("cell", { name: "bugungi kunda", exact: true }),
  ).toBeVisible();
  let data = await stored(page);
  expect(data.history).toEqual(before.history);
  expect(data.words[0].schedules).toEqual(before.words[0].schedules);
  await dialog
    .getByRole("button", { name: "der Tisch so‘zini o‘chirish", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Saqlab qolish", exact: true })
    .click();
  expect((await stored(page)).words).toHaveLength(2);
  await dialog
    .getByRole("button", { name: "der Tisch so‘zini o‘chirish", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Ha, o‘chirish", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", {
      name: "der Tisch so‘zini o‘chirish",
      exact: true,
    }),
  ).toBeHidden();
  data = await stored(page);
  expect(data.words).toHaveLength(1);
  expect(data.history).toEqual(before.history);
});

test("backup exports active feedback and history; invalid and cancelled restores preserve data; confirmed restore matches", async ({
  page,
}) => {
  await importWords(page, [today]);
  await start(page);
  await answer(page, "heute");
  await page.getByRole("button", { name: "Saqlash va chiqish" }).click();
  const original = await stored(page);
  await page
    .getByRole("button", { name: "Yordamchi menyu", exact: true })
    .click();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", {
      name: "So‘zlar va tarixni eksport qilish",
      exact: true,
    })
    .click();
  const download = await downloadPromise;
  const contents = await readFile((await download.path())!, "utf8");
  const backup = JSON.parse(contents);
  expect(backup.backupVersion).toBe(1);
  expect(backup.data).toEqual(original);
  expect(backup.data.session.feedback.correct).toBe(true);
  const upload = page.locator('input[type="file"]');
  await upload.setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"backupVersion":1,"data":{}}'),
  });
  await expect(page.getByRole("alert")).toContainText("Zaxira noto‘g‘ri");
  expect(await stored(page)).toEqual(original);
  await upload.setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(contents),
  });
  let restoreDialog = page.getByRole("dialog", { name: "Zaxiradan tiklash" });
  await expect(restoreDialog).toBeVisible();
  await restoreDialog
    .getByRole("button", { name: "Bekor qilish", exact: true })
    .click();
  expect(await stored(page)).toEqual(original);
  await page
    .getByRole("button", { name: "Yordamchi menyu", exact: true })
    .click();
  await page.getByLabel("Animatsiyani kamaytirish", { exact: true }).click();
  await expect
    .poll(async () => (await stored(page)).preferences.reducedMotion)
    .toBe(true);
  await page.keyboard.press("Escape");
  await upload.setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(contents),
  });
  restoreDialog = page.getByRole("dialog", { name: "Zaxiradan tiklash" });
  await restoreDialog
    .getByRole("button", { name: "Almashtirib tiklash", exact: true })
    .click();
  await expect(restoreDialog).toBeHidden();
  await expect.poll(async () => stored(page)).toEqual(original);
  await page.reload();
  await page
    .getByRole("button", { name: "Davom ettirish", exact: true })
    .click();
  await expect(page.locator("#answer-feedback")).toContainText(
    "To‘g‘ri javob!",
  );
});

test("updating cloze fields requires consent to cancel active queue while retaining previous answers", async ({
  page,
}) => {
  await importWords(page, [go]);
  await start(page, "cloze");
  await answer(page, "geht");
  await page.getByRole("button", { name: "Saqlash va chiqish" }).click();
  const before = await stored(page);
  const dialog = await openImport(
    page,
    payload([
      {
        word: go.word,
        translation: go.translation,
        acceptedAnswers: ["gehen"],
      },
    ]),
  );
  await dialog.getByLabel("1-qator takroriy so‘z amali").selectOption("update");
  const save = dialog.getByRole("button", {
    name: "To‘plamni saqlash",
    exact: true,
  });
  await expect(save).toBeDisabled();
  await expect(
    dialog.getByText("Tugallanmagan raunddagi so‘zlar yangilanadi.", {
      exact: true,
    }),
  ).toBeVisible();
  expect((await stored(page)).session).toEqual(before.session);
  await dialog
    .getByRole("checkbox", { name: /Tugallanmagan raundni bekor/ })
    .check();
  await save.click();
  await expect(dialog).toBeHidden();
  const after = await stored(page);
  expect(after.session).toBeNull();
  expect(after.history).toEqual(before.history);
  expect(after.words[0].schedules).toEqual(before.words[0].schedules);
  expect(after.words[0].clozeText).toBeUndefined();
  await page
    .getByRole("navigation", { name: "Asosiy" })
    .getByRole("button", { name: "Mashq qilish", exact: true })
    .click();
  const practice = page.getByRole("dialog", {
    name: "Bugun nimani mashq qilamiz?",
  });
  await practice.getByRole("button", { name: /^Gapdagi bo‘shliq/ }).click();
  await practice
    .getByRole("button", { name: "Mashqni boshlash", exact: true })
    .click();
  await expect(practice.getByRole("alert")).toContainText(
    "Hozir mashq uchun tayyor gapli so‘z yo‘q",
  );
});

test("large user collection is retained while orbit and round sizes stay bounded", async ({
  page,
}) => {
  const words = Array.from({ length: 120 }, (_, index) => ({
    word: `Wort ${index + 1}`,
    translation: `so‘z ${index + 1}`,
  }));
  await importWords(page, words);
  await expect(page.locator(".collection-card")).toContainText("120 ta so‘z");
  expect((await stored(page)).words).toHaveLength(120);
  await expect(page.locator(".orbit-card")).toHaveCount(6);
  await start(page);
  expect((await stored(page)).session?.queue).toHaveLength(10);
  await expect(page.locator(".practice-count")).toContainText("1 / 10");
});

test("a separate Enter immediately after feedback advances without an arbitrary delay", async ({ page }) => {
  await importWords(page, [today, table]);
  await start(page);
  await page.getByLabel("Javobingiz", { exact: true }).fill("heute");
  await page.keyboard.press("Enter");
  await expect(page.locator("#answer-feedback")).toContainText("To‘g‘ri javob!");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "stol", exact: true })).toBeVisible();
  expect((await stored(page)).history).toHaveLength(1);
});

test("a next-button click immediately after saved feedback advances on its first click", async ({ page }) => {
  await importWords(page, [today, table]);
  await start(page);
  await page.getByLabel("Javobingiz", { exact: true }).fill("heute");
  await page.getByRole("button", { name: "Tekshirish", exact: true }).click();
  await expect(page.locator("#answer-feedback")).toBeVisible();
  await page.getByRole("button", { name: "Keyingi savol", exact: true }).click();
  await expect(page.getByRole("heading", { name: "stol", exact: true })).toBeVisible();
});
