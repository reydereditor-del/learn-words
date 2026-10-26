import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  CornerDownLeft,
  Eye,
  Flag,
  Lightbulb,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import type { AppData, StudyMode } from "../lib/types";
import { LANGUAGE_NAMES } from "../lib/types";
import {
  advanceSession,
  checkAnswer,
  markHard,
  recordAnswer,
} from "../lib/study";

interface Props {
  data: AppData;
  onChange: (next: AppData) => Promise<boolean>;
  onExit: () => void;
  onContinueHard: (
    wordIds: string[],
    mode: StudyMode,
    collectionId: string | null,
  ) => void;
}

export default function Practice({
  data,
  onChange,
  onExit,
  onContinueHard,
}: Props) {
  const session = data.session;
  const dataRef = useRef(data);
  dataRef.current = data;
  const [draft, setDraft] = useState(session?.draft ?? "");
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState("");
  const busyRef = useRef(false);
  const enterHeld = useRef(false);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const questionId = session?.queue[session.index]?.id;
  const word = data.words.find(
    (item) => item.id === session?.queue[session.index]?.wordId,
  );
  const collection = data.collections.find(
    (item) => item.id === word?.collectionId,
  );
  const language = collection?.language ?? "de";
  const mode = session?.mode ?? "translation";
  const feedback = session?.feedback;

  function clearDraftTimer() {
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = null;
  }

  useEffect(() => {
    clearDraftTimer();
    setDraft(dataRef.current.session?.draft ?? "");
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      cancelAnimationFrame(frame);
      clearDraftTimer();
    };
  }, [questionId]);

  useEffect(() => {
    const release = (event: KeyboardEvent) => {
      if (event.key === "Enter") enterHeld.current = false;
    };
    const reset = () => {
      enterHeld.current = false;
    };
    window.addEventListener("keyup", release);
    window.addEventListener("blur", reset);
    return () => {
      window.removeEventListener("keyup", release);
      window.removeEventListener("blur", reset);
    };
  }, []);

  async function persist(next: AppData) {
    setSaveError("");
    try {
      const saved = await onChange(next);
      if (saved) dataRef.current = next;
      else setSaveError("Javob saqlanmadi. Iltimos, qayta urinib ko‘ring.");
      return saved;
    } catch {
      setSaveError(
        "Ma’lumotni saqlab bo‘lmadi. Iltimos, qayta urinib ko‘ring.",
      );
      return false;
    }
  }

  function updateDraft(value: string) {
    setDraft(value);
    clearDraftTimer();
    const originalQuestion = questionId;
    draftTimer.current = setTimeout(() => {
      const current = dataRef.current;
      if (
        !current.session ||
        current.session.feedback ||
        current.session.queue[current.session.index]?.id !== originalQuestion ||
        busyRef.current
      )
        return;
      void persist({
        ...current,
        session: { ...current.session, draft: value },
      });
    }, 250);
  }

  async function run(action: (current: AppData) => AppData) {
    if (busyRef.current) return;
    clearDraftTimer();
    busyRef.current = true;
    setBusy(true);
    try {
      await persist(action(dataRef.current));
    } finally {
      busyRef.current = false;
      setBusy(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  async function submit() {
    const current = dataRef.current;
    if (!current.session) return;
    if (current.session.feedback) {
      await run((state) => advanceSession(state));
    } else if (draft.trim()) {
      await run((state) =>
        recordAnswer(state, draft, {
          hintUsed: state.session?.hintUsed ?? false,
          revealed: false,
        }),
      );
    }
  }

  async function hint() {
    await run((current) =>
      current.session
        ? { ...current, session: { ...current.session, draft, hintUsed: true } }
        : current,
    );
    inputRef.current?.focus();
  }

  async function reveal() {
    await run((current) =>
      recordAnswer(current, draft, {
        hintUsed: current.session?.hintUsed ?? false,
        revealed: true,
      }),
    );
  }

  async function exit() {
    if (busyRef.current) return;
    clearDraftTimer();
    const current = dataRef.current;
    if (
      current.session &&
      !current.session.feedback &&
      !current.session.completedAt
    ) {
      busyRef.current = true;
      setBusy(true);
      const saved = await persist({
        ...current,
        session: { ...current.session, draft },
      });
      busyRef.current = false;
      setBusy(false);
      if (!saved) return;
    }
    onExit();
  }

  function insertCharacter(character: string) {
    const input = inputRef.current;
    const start = input?.selectionStart ?? draft.length;
    const end = input?.selectionEnd ?? start;
    updateDraft(draft.slice(0, start) + character + draft.slice(end));
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(
        start + character.length,
        start + character.length,
      );
    });
  }

  if (!session)
    return (
      <main className="practice-shell">
        <button className="button secondary" onClick={onExit}>
          <ArrowLeft size={17} /> Bosh ekranga
        </button>
      </main>
    );

  if (session.completedAt) {
    const firstResults = session.results.filter(
      (item, index, all) =>
        all.findIndex((result) => result.wordId === item.wordId) === index,
    );
    const independent = firstResults.filter(
      (item) => item.correct && !item.assisted,
    ).length;
    const assisted = firstResults.filter((item) => item.assisted).length;
    const wrong = firstResults.filter(
      (item) => !item.correct && !item.assisted,
    ).length;
    const difficultIds = [
      ...new Set(
        session.results
          .filter((item) => !item.correct || item.assisted || item.hard)
          .map((item) => item.wordId),
      ),
    ].filter((id) => data.words.some((item) => item.id === id));
    const percentage = firstResults.length
      ? Math.round((independent / firstResults.length) * 100)
      : 0;
    return (
      <main className="practice-shell result-shell">
        <button className="text-button practice-back" onClick={onExit}>
          <ArrowLeft size={17} /> Bosh ekranga
        </button>
        <section className="result-content" aria-labelledby="result-title">
          <span className="eyebrow">
            <Flag size={15} /> RAUND NATIJASI
          </span>
          <div
            className="result-ring"
            aria-label={`Birinchi urinishdagi mustaqil to‘g‘ri javoblar: ${percentage} foiz`}
          >
            <svg viewBox="0 0 160 160" aria-hidden="true">
              <circle className="result-ring-track" cx="80" cy="80" r="70" />
              <circle
                className="result-ring-fill"
                cx="80"
                cy="80"
                r="70"
                strokeDasharray="439.82"
                strokeDashoffset={439.82 * (1 - percentage / 100)}
              />
            </svg>
            <div>
              <strong>
                {independent}
                <span>/{firstResults.length}</span>
              </strong>
              <small>mustaqil javob</small>
            </div>
          </div>
          <h1 id="result-title">Yana bir qadam oldinga.</h1>
          <p className="muted">
            Har bir urinish so‘zni mustahkamlaydi. Keyingi takrorlashlar
            javoblaringizga mos rejalashtirildi.
          </p>
          <div className="result-stats">
            <div>
              <CheckCircle2 size={20} />
              <strong>{independent}</strong>
              <span>
                Birinchi urinishda,
                <br />
                yordamsiz to‘g‘ri
              </span>
            </div>
            <div>
              <Lightbulb size={20} />
              <strong>{assisted}</strong>
              <span>
                Yordam bilan
                <br />
                ishlangan
              </span>
            </div>
            <div>
              <X size={20} />
              <strong>{wrong}</strong>
              <span>
                Birinchi urinishda
                <br />
                xato javob
              </span>
            </div>
          </div>
          {session.results.length > firstResults.length && (
            <p className="result-retry-note muted">
              Raund ichida yana {session.results.length - firstResults.length}{" "}
              ta qayta urinish bajarildi.
            </p>
          )}
          {difficultIds.length > 0 && (
            <div className="difficult-summary">
              <h2>
                Yana e’tibor beramiz{" "}
                <span className="tag">{difficultIds.length} ta so‘z</span>
              </h2>
              <div className="difficult-words">
                {difficultIds.map((id) => {
                  const item = data.words.find((value) => value.id === id)!;
                  return (
                    <span key={id}>
                      {item.word}
                      <small>{item.translation}</small>
                    </span>
                  );
                })}
              </div>
            </div>
          )}
          <div className="result-actions">
            {difficultIds.length > 0 && (
              <button
                className="button primary"
                onClick={() =>
                  onContinueHard(
                    difficultIds,
                    session.mode,
                    session.collectionId,
                  )
                }
              >
                <RotateCcw size={17} /> Qiyin so‘zlar bilan davom etish
              </button>
            )}
            <button
              className={`button ${difficultIds.length ? "secondary" : "primary"}`}
              onClick={onExit}
            >
              Bosh ekranga <ArrowRight size={17} />
            </button>
          </div>
          <p className="local-note">
            Bu bitta raund natijasi. So‘zlar oraliqli takrorlash orqali
            mustahkamlanadi.
          </p>
        </section>
      </main>
    );
  }

  if (!word)
    return (
      <main className="practice-shell">
        <p role="alert">Bu savoldagi so‘z topilmadi.</p>
        <button className="button secondary" onClick={onExit}>
          Bosh ekranga
        </button>
      </main>
    );
  const checked = feedback
    ? checkAnswer(feedback.answer, word, mode, language)
    : null;
  const previousRuleVerdict =
    !!feedback && !feedback.correct && !!checked?.correct && !session.revealed;
  const expected =
    mode === "cloze"
      ? (word.clozeAnswers?.[0] ?? word.word)
      : (word.acceptedAnswers?.[0] ?? word.word);
  const blankParts =
    mode === "cloze" ? (word.clozeText ?? "{{blank}}").split("{{blank}}") : [];
  const progress = Math.min(100, (session.index / session.queue.length) * 100);
  const nextIsLast = session.index + 1 >= session.queue.length;
  return (
    <main className="practice-shell">
      <header className="practice-topbar">
        <button
          className="text-button practice-back"
          onClick={() => void exit()}
          disabled={busy}
        >
          <ArrowLeft size={17} /> <span>Saqlash va chiqish</span>
        </button>
        <span className="practice-count">
          <strong>{session.index + 1}</strong> / {session.queue.length}
          <span>savol</span>
        </span>
        <span className="tag">
          {mode === "translation" ? "Tarjimadan yozish" : "Gapdagi bo‘shliq"}
        </span>
      </header>
      <div
        className="practice-progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress)}
        aria-label="Raund jarayoni"
      >
        <span style={{ width: `${progress}%` }} />
      </div>
      <section className="practice-content" aria-labelledby="practice-title">
        <div className="practice-context">
          <span className={`language-dot ${language}`} aria-hidden="true" />
          {LANGUAGE_NAMES[language]}
          <span>·</span>
          {collection?.level}
          <span>·</span>
          <span>{collection?.title}</span>
        </div>
        <div className="question-content" key={questionId}>
          <span className="eyebrow">
            {session.queue[session.index].isRetry ? (
              <>
                <RotateCcw size={14} /> YANA BIR URINISH
              </>
            ) : mode === "translation" ? (
              "BU SO‘Z QANDAY AYTILADI?"
            ) : (
              "GAPDAGI BO‘SHLIQNI TO‘LDIRING"
            )}
          </span>
          <h1
            id="practice-title"
            className={mode === "cloze" ? "cloze-question" : ""}
          >
            {mode === "translation" ? (
              word.translation
            ) : (
              <>
                {blankParts[0]}
                <span className="cloze-blank" aria-label="bo‘sh joy">
                  {feedback ? (checked?.expected ?? expected) : "···"}
                </span>
                {blankParts[1]}
              </>
            )}
          </h1>
          <p className="question-instruction">
            {mode === "cloze"
              ? word.sentenceTranslation
              : `${LANGUAGE_NAMES[language]} javobni yozing${language === "de" && word.partOfSpeech === "noun" ? ". Artiklga e’tibor bering." : "."}`}
          </p>
          <form
            className="answer-form"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <label className="sr-only" htmlFor="practice-answer">
              Javobingiz
            </label>
            <div
              className={`answer-input-wrap ${feedback ? (feedback.correct ? "is-correct" : "is-incorrect") : ""}`}
            >
              <input
                ref={inputRef}
                id="practice-answer"
                value={draft}
                onChange={(event) => updateDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" || event.nativeEvent.isComposing)
                    return;
                  if (event.repeat || enterHeld.current || busyRef.current) {
                    event.preventDefault();
                    return;
                  }
                  enterHeld.current = true;
                }}
                placeholder="Javobingizni shu yerga yozing…"
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                readOnly={!!feedback || busy}
                aria-disabled={busy}
                aria-describedby={
                  feedback
                    ? "answer-feedback"
                    : session.hintUsed
                      ? "letter-hint"
                      : undefined
                }
              />
              {feedback && (
                <span className="answer-status" aria-hidden="true">
                  {feedback.correct ? <Check size={21} /> : <X size={21} />}
                </span>
              )}
            </div>
            {(language === "de" || language === "ru") && !feedback && (
              <div
                className="character-row"
                aria-label={`${LANGUAGE_NAMES[language]} harflar`}
              >
                {(language === "de"
                  ? ["ä", "ö", "ü", "ß", "Ä", "Ö", "Ü", "ẞ"]
                  : ["ё", "Ё"]
                ).map((character) => (
                  <button
                    key={character}
                    className="character-key"
                    type="button"
                    onClick={() => insertCharacter(character)}
                    disabled={busy}
                    aria-label={`${character} harfini kiritish`}
                  >
                    {character}
                  </button>
                ))}
                <span>Maxsus harflar</span>
              </div>
            )}
            {!feedback && (
              <div className="hint-actions">
                <button
                  type="button"
                  className="text-button"
                  onClick={() => void hint()}
                  disabled={busy || session.hintUsed}
                >
                  <Lightbulb size={16} /> Birinchi harf
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => void reveal()}
                  disabled={busy}
                >
                  <Eye size={16} /> Javobni ko‘rsatish
                </button>
              </div>
            )}
            {!feedback && session.hintUsed && (
              <p className="letter-hint" id="letter-hint" role="status">
                Birinchi harf: <strong>{Array.from(expected.trim())[0]}</strong>
                <span>Yordam ishlatildi; bu javob mustaqil hisoblanmaydi.</span>
              </p>
            )}
            {feedback && (
              <div
                id="answer-feedback"
                className={`answer-feedback ${feedback.correct ? "correct" : "incorrect"}`}
                role="status"
              >
                <div className="feedback-heading">
                  {feedback.correct ? (
                    <CheckCircle2 size={21} />
                  ) : (
                    <X size={21} />
                  )}
                  <strong>
                    {previousRuleVerdict
                      ? "Oldingi qoidalar bo‘yicha tekshirilgan"
                      : feedback.correct
                        ? feedback.assisted
                          ? "To‘g‘ri, yordam bilan."
                          : "To‘g‘ri javob!"
                        : session.revealed
                          ? "Javob ochildi"
                          : "Bu safar xato. Yana mashq qilamiz."}
                  </strong>
                </div>
                {!feedback.correct && (
                  <>
                    <p>
                      {session.revealed
                        ? "Javobni ko‘rish ham o‘rganishning bir qismi. So‘z yana takrorlashga qaytadi."
                        : previousRuleVerdict
                          ? "Bu javob oldingi qoidalar bilan xato deb saqlangan. Endi katta-kichik harf farqi xato hisoblanmaydi. Oldingi tarix saqlangan."
                          : checked?.message}
                    </p>
                    <div className="answer-comparison">
                      <div>
                        <small>To‘g‘ri javob</small>
                        <strong>{checked?.expected ?? expected}</strong>
                      </div>
                      {feedback.answer && (
                        <div>
                          <small>Siz yozdingiz</small>
                          <span className="entered-answer">
                            {Array.from(feedback.answer).map(
                              (character, index) => (
                                <span
                                  key={index}
                                  className={
                                    Array.from(checked?.expected ?? expected)[
                                      index
                                    ]?.toLocaleLowerCase(language) !==
                                    character.toLocaleLowerCase(language)
                                      ? "different-character"
                                      : undefined
                                  }
                                >
                                  {character === " " ? "\u00a0" : character}
                                </span>
                              ),
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                  </>
                )}
                {mode === "cloze" && word.sentence && (
                  <p className="original-sentence">
                    <small>To‘liq gap</small>
                    {word.sentence}
                  </p>
                )}
                {feedback.correct && (
                  <p>
                    {feedback.assisted
                      ? "Yordam ishlatilgani sabab interval bosqichi oshmaydi."
                      : feedback.firstAttempt
                        ? "Javob saqlandi. Oraliqli takrorlash jadvali yangilandi."
                        : "Qayta urinish saqlandi. Interval yana oshirilmaydi."}
                  </p>
                )}
                {feedback.correct && (
                  <button
                    type="button"
                    className={`hard-answer-button ${feedback.hard ? "selected" : ""}`}
                    aria-pressed={feedback.hard}
                    onClick={() => void run((current) => markHard(current))}
                    disabled={busy || feedback.hard}
                  >
                    {feedback.hard ? <Check size={16} /> : <Flag size={16} />}
                    {feedback.hard
                      ? "Belgilandi — ertaga takrorlanadi"
                      : "Bilaman, lekin qiynaldim"}
                  </button>
                )}
              </div>
            )}
            {saveError && (
              <p className="error-panel" role="alert">
                {saveError}
              </p>
            )}
            <div className="practice-submit">
              <button
                type="submit"
                onClick={(event) => {
                  // Ignore the second click of a double click, while accepting
                  // the first intentional next-question click without a timer.
                  if (event.detail > 1) event.preventDefault();
                }}
                className="button primary"
                disabled={busy || (!feedback && !draft.trim())}
              >
                {busy
                  ? "Saqlanmoqda…"
                  : feedback
                    ? nextIsLast
                      ? "Raundni yakunlash"
                      : "Keyingi savol"
                    : "Tekshirish"}
                {!busy &&
                  (feedback ? (
                    <ArrowRight size={18} />
                  ) : (
                    <CornerDownLeft size={17} />
                  ))}
              </button>
              <span>
                <kbd>Enter</kbd> {feedback ? "davom etish" : "tekshirish"}
              </span>
            </div>
          </form>
        </div>
        <p className="practice-footnote">
          <Sparkles size={14} />
          {mode === "translation"
            ? "Shoshilmang. Eslab yozish — o‘rganishning o‘zi."
            : "Gapga grammatik jihatdan mos shaklni yozing."}
        </p>
      </section>
    </main>
  );
}
