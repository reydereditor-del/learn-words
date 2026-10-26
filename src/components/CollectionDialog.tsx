import { useId, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronLeft,
  LoaderCircle,
  Pencil,
  Play,
  Save,
  Trash2,
  X,
} from "lucide-react";
import Modal from "./Modal";
import { isClozeEligible, validateRows } from "../lib/import";
import type { ImportRow } from "../lib/import";
import { LANGUAGE_NAMES } from "../lib/types";
import type { AppData, Word, WordContent } from "../lib/types";

interface Props {
  data: AppData;
  collectionId: string;
  onClose: () => void;
  onSave: (next: AppData) => Promise<boolean>;
  onPractice: (collectionId: string) => void;
}
interface Editor {
  word: string;
  translation: string;
  partOfSpeech: string;
  acceptedAnswers: string;
  sentence: string;
  sentenceTranslation: string;
  clozeText: string;
  clozeAnswers: string;
}
function editorFor(word: Word): Editor {
  return {
    word: word.word,
    translation: word.translation,
    partOfSpeech: word.partOfSpeech ?? "",
    acceptedAnswers: word.acceptedAnswers?.join("\n") ?? "",
    sentence: word.sentence ?? "",
    sentenceTranslation: word.sentenceTranslation ?? "",
    clozeText: word.clozeText ?? "",
    clozeAnswers: word.clozeAnswers?.join("\n") ?? "",
  };
}
function contentFor(editor: Editor): WordContent {
  const content: WordContent = {
    word: editor.word,
    translation: editor.translation,
  };
  for (const key of [
    "partOfSpeech",
    "sentence",
    "sentenceTranslation",
    "clozeText",
  ] as const) {
    if (editor[key] !== "") content[key] = editor[key];
  }
  for (const key of ["acceptedAnswers", "clozeAnswers"] as const) {
    if (editor[key] !== "") content[key] = editor[key].split("\n");
  }
  return content;
}
function reviewDate(word: Word): string {
  const next = word.schedules.translation.dueAt;
  if (next === null) return "Hali mashq qilinmagan";
  if (next <= Date.now()) return "Takrorlash vaqti keldi";
  return `Keyingi: ${new Date(next).toLocaleDateString("uz-UZ", { day: "numeric", month: "short" })}`;
}

export default function CollectionDialog({
  data,
  collectionId,
  onClose,
  onSave,
  onPractice,
}: Props) {
  const collection = data.collections.find((item) => item.id === collectionId);
  const words = data.words.filter((word) => word.collectionId === collectionId);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [cancelAcknowledged, setCancelAcknowledged] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const formId = useId();
  const editingWord = words.find((word) => word.id === editingId);
  const deletingWord = words.find((word) => word.id === deleteId);
  if (!collection)
    return (
      <Modal title="To‘plam topilmadi" onClose={onClose}>
        <p>Bu to‘plam endi mavjud emas.</p>
      </Modal>
    );

  const content = editor ? contentFor(editor) : null;
  const checked: ImportRow | undefined = content
    ? validateRows(
        [
          {
            key: editingId ?? "edit",
            content,
            errors: [],
            warnings: [],
            duplicateId: null,
            duplicateRowKey: null,
            action: "update",
          },
        ],
        collection.language,
        { ...data, words: data.words.filter((word) => word.id !== editingId) },
      )[0]
    : undefined;
  const errors = [...(checked?.errors ?? [])];
  if (checked?.duplicateId)
    errors.push(
      "Shu til, so‘z va ma’nodagi yozuv allaqachon mavjud. Uni alohida takror sifatida saqlab bo‘lmaydi.",
    );
  const eligible = words.filter(isClozeEligible).length;
  const sessionConflict = !!(
    editingId &&
    data.session &&
    data.session.completedAt === null &&
    data.session.queue.some((q) => q.wordId === editingId)
  );

  function edit(word: Word) {
    setEditingId(word.id);
    setCancelAcknowledged(false);
    setEditor(editorFor(word));
    setDeleteId(null);
    setError("");
  }
  function stopEditing() {
    setEditingId(null);
    setEditor(null);
    setError("");
  }
  async function saveEdit() {
    if (
      lock.current ||
      !content ||
      !editingWord ||
      errors.length ||
      (sessionConflict && !cancelAcknowledged)
    )
      return;
    lock.current = true;
    setSaving(true);
    setError("");
    const replacement: Word = {
      ...content,
      id: editingWord.id,
      collectionId: editingWord.collectionId,
      schedules: editingWord.schedules,
    };
    const next: AppData = {
      ...data,
      words: data.words.map((word) =>
        word.id === editingWord.id ? replacement : word,
      ),
      session: sessionConflict ? null : data.session,
    };
    try {
      if (await onSave(next)) stopEditing();
      else
        setError(
          "O‘zgarishlar saqlanmadi. Xotira xatosini tekshirib, yana urinib ko‘ring.",
        );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "O‘zgarishlarni saqlab bo‘lmadi.",
      );
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }
  async function removeWord() {
    if (lock.current || !deletingWord) return;
    lock.current = true;
    setSaving(true);
    setError("");
    const wordId = deletingWord.id;
    const sessionReferencesWord =
      data.session?.queue.some((question) => question.wordId === wordId) ||
      data.session?.results.some((result) => result.wordId === wordId);
    const next: AppData = {
      ...data,
      words: data.words.filter((word) => word.id !== wordId),
      history: data.history.filter((entry) => entry.wordId !== wordId),
      session: sessionReferencesWord ? null : data.session,
    };
    try {
      if (await onSave(next)) setDeleteId(null);
      else
        setError(
          "So‘z o‘chirilmadi. Xotira xatosini tekshirib, yana urinib ko‘ring.",
        );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "So‘zni o‘chirib bo‘lmadi.",
      );
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }
  const close = () => {
    if (!lock.current) onClose();
  };

  return (
    <Modal
      title={collection.title}
      subtitle={`${LANGUAGE_NAMES[collection.language]} · ${collection.level}`}
      onClose={close}
      wide
    >
      {editingWord && editor ? (
        <form
          className="word-editor"
          onSubmit={(event) => {
            event.preventDefault();
            void saveEdit();
          }}
        >
          <button
            type="button"
            className="text-button"
            onClick={stopEditing}
            disabled={saving}
          >
            <ChevronLeft size={16} /> So‘zlarga qaytish
          </button>
          <div className="section-heading">
            <h3>So‘zni tahrirlash</h3>
            <span className="muted">O‘rganish tarixi saqlanadi</span>
          </div>
          <div className="form-grid">
            {(
              [
                ["word", "So‘z", "So‘zning to‘g‘ri yozilishi"],
                ["translation", "O‘zbekcha tarjima", "Aniq ma’nosi"],
                ["partOfSpeech", "So‘z turkumi", "noun, verb, adjective…"],
              ] as const
            ).map(([key, label, placeholder]) => (
              <label key={key} className="field" htmlFor={`${formId}-${key}`}>
                <span>
                  {label}
                  {key !== "partOfSpeech" && " *"}
                </span>
                <input
                  id={`${formId}-${key}`}
                  value={editor[key]}
                  onChange={(event) =>
                    setEditor({ ...editor, [key]: event.target.value })
                  }
                  placeholder={placeholder}
                  autoFocus={key === "word"}
                  disabled={saving}
                />
              </label>
            ))}
            <label className="field" htmlFor={`${formId}-accepted`}>
              <span>Qabul qilinadigan javoblar</span>
              <textarea
                id={`${formId}-accepted`}
                value={editor.acceptedAnswers}
                onChange={(event) =>
                  setEditor({ ...editor, acceptedAnswers: event.target.value })
                }
                placeholder="Har bir javobni alohida qatorda yozing"
                rows={3}
                disabled={saving}
              />
              <small>Bo‘sh bo‘lsa so‘zning o‘zi javob hisoblanadi.</small>
            </label>
          </div>
          <div className="section-heading">
            <h3>Gap mashqi</h3>
            <span className="muted">Ixtiyoriy maydonlar</span>
          </div>
          <div className="form-grid">
            {(
              [
                ["sentence", "Asl gap", "To‘liq original gap"],
                [
                  "sentenceTranslation",
                  "Gapning o‘zbekcha tarjimasi",
                  "Gapning o‘zbekcha ma’nosi",
                ],
                ["clozeText", "Bo‘shliqli gap", "Aynan bitta {{blank}} bilan"],
                [
                  "clozeAnswers",
                  "Bo‘shliq javoblari",
                  "Har bir javob alohida qatorda",
                ],
              ] as const
            ).map(([key, label, placeholder]) => (
              <label key={key} className="field" htmlFor={`${formId}-${key}`}>
                <span>{label}</span>
                <textarea
                  id={`${formId}-${key}`}
                  value={editor[key]}
                  onChange={(event) =>
                    setEditor({ ...editor, [key]: event.target.value })
                  }
                  placeholder={placeholder}
                  rows={2}
                  disabled={saving}
                />
              </label>
            ))}
          </div>
          <div aria-live="polite">
            {errors.length > 0 && (
              <div className="error-message" role="alert">
                {errors.map((message) => (
                  <p key={message}>{message}</p>
                ))}
              </div>
            )}
            {checked?.warnings.map((message) => (
              <p key={message} className="field-note">
                {message}
              </p>
            ))}
            {content && isClozeEligible(content) && (
              <p className="success-note">
                <Check size={15} /> Gap mashqiga tayyor.
              </p>
            )}
          </div>
          {sessionConflict && (
            <div className="notice-panel session-conflict">
              <p>
                Bu so‘z tugallanmagan raundda qatnashmoqda. Javoblar o‘zgarganda
                chalkashlik bo‘lmasligi uchun raund navbati bekor qilinadi.
                Yozilgan javoblar tarixi saqlanadi.
              </p>
              <label>
                <input
                  type="checkbox"
                  checked={cancelAcknowledged}
                  onChange={(e) => setCancelAcknowledged(e.target.checked)}
                  disabled={saving}
                />{" "}
                Tugallanmagan raundni bekor qilib, so‘zni yangilashga roziman.
              </label>
            </div>
          )}
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          <footer className="modal-actions">
            <button
              type="button"
              className="button secondary"
              onClick={stopEditing}
              disabled={saving}
            >
              <X size={16} /> Bekor qilish
            </button>
            <button
              type="submit"
              className="button primary"
              disabled={
                saving ||
                errors.length > 0 ||
                (sessionConflict && !cancelAcknowledged)
              }
            >
              {saving ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <Save size={17} />
              )}{" "}
              {saving ? "Saqlanmoqda…" : "O‘zgarishlarni saqlash"}
            </button>
          </footer>
        </form>
      ) : (
        <>
          <div className="collection-summary">
            <div>
              <span className="collection-total">{words.length}</span>
              <span className="muted"> ta so‘z</span>
              <span className="summary-divider">/</span>
              <span>{eligible} ta gap mashqiga tayyor</span>
            </div>
            <button
              className="button primary"
              disabled={!words.length || saving}
              onClick={() => onPractice(collectionId)}
            >
              <Play size={16} /> Mashq qilish <ArrowRight size={16} />
            </button>
          </div>
          {deletingWord && (
            <section
              className="delete-confirm"
              role="alertdialog"
              aria-labelledby={`${formId}-delete-title`}
            >
              <h3 id={`${formId}-delete-title`}>
                “{deletingWord.word}” o‘chirilsinmi?
              </h3>
              <p>
                So‘z va uning mashq tarixi o‘chadi. Bu so‘z qatnashgan
                tugallanmagan raund ham bekor qilinadi. Bu amalni qaytarib
                bo‘lmaydi.
              </p>
              <div className="inline-actions">
                <button
                  className="button secondary"
                  disabled={saving}
                  onClick={() => {
                    setDeleteId(null);
                    setError("");
                  }}
                >
                  Saqlab qolish
                </button>
                <button
                  className="button danger"
                  disabled={saving}
                  onClick={() => void removeWord()}
                >
                  {saving ? (
                    <LoaderCircle className="spin" size={16} />
                  ) : (
                    <Trash2 size={16} />
                  )}{" "}
                  Ha, o‘chirish
                </button>
              </div>
            </section>
          )}
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          {words.length ? (
            <div className="table-wrap">
              <table className="word-table">
                <thead>
                  <tr>
                    <th>So‘z</th>
                    <th>Tarjima</th>
                    <th>Takrorlash</th>
                    <th>
                      <span className="sr-only">Amallar</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {words.map((word) => (
                    <tr key={word.id}>
                      <td>
                        <strong>{word.word}</strong>
                        <span className="word-meta">
                          {word.partOfSpeech || "So‘z turkumi kiritilmagan"}
                          {isClozeEligible(word) && (
                            <span
                              className="cloze-badge"
                              title="Gap mashqiga tayyor"
                            >
                              <BookOpen size={12} /> Gap
                            </span>
                          )}
                        </span>
                      </td>
                      <td>{word.translation}</td>
                      <td>
                        <span className="review-date">{reviewDate(word)}</span>
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            className="icon-button"
                            disabled={saving}
                            onClick={() => edit(word)}
                            aria-label={`${word.word} so‘zini tahrirlash`}
                            title="Tahrirlash"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            className="icon-button danger-text"
                            disabled={saving}
                            onClick={() => {
                              setDeleteId(word.id);
                              setError("");
                            }}
                            aria-label={`${word.word} so‘zini o‘chirish`}
                            title="O‘chirish"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-collection">
              <BookOpen size={30} />
              <h3>Bu to‘plamda so‘z qolmadi</h3>
              <p className="muted">
                Yangi so‘zlar qo‘shish uchun bosh ekrandagi import amalidan
                foydalaning.
              </p>
              <button className="button secondary" onClick={close}>
                Bosh ekranga qaytish <ArrowRight size={16} />
              </button>
            </div>
          )}
          <p className="field-note">
            Tahrirlashda so‘zning takrorlash jadvali va tarixi saqlanadi. Gap
            uchun yetarli ma’lumot bo‘lmasa, so‘z faqat tarjima mashqida
            qatnashadi.
          </p>
        </>
      )}
    </Modal>
  );
}
