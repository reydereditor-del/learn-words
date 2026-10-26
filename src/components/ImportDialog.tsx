import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  ChevronDown,
  Clipboard,
  FileJson,
  Info,
  LoaderCircle,
  Plus,
  Sparkles,
} from "lucide-react";
import Modal from "./Modal";
import type { AppData, Language, Level, WordContent } from "../lib/types";
import { LANGUAGES, LANGUAGE_NAMES, LEVELS } from "../lib/types";
import {
  applyImport,
  buildPrompt,
  importSessionConflict,
  isClozeEligible,
  parseImport,
  validateRows,
} from "../lib/import";
import type { ImportDocument, ImportRow } from "../lib/import";

interface Props {
  data: AppData;
  onClose: () => void;
  onSave: (next: AppData) => Promise<boolean>;
}

function showValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
function showList(value: unknown): string {
  if (Array.isArray(value) && value.every((item) => typeof item === "string"))
    return value.join("\n");
  return showValue(value);
}
const optionalTextFields: {
  key: keyof WordContent;
  label: string;
  placeholder?: string;
}[] = [
  {
    key: "partOfSpeech",
    label: "So‘z turkumi",
    placeholder: "noun, verb, adjective…",
  },
  {
    key: "sentence",
    label: "Asl gap",
    placeholder: "O‘rganilayotgan tildagi to‘liq gap",
  },
  { key: "sentenceTranslation", label: "Gapning o‘zbekcha tarjimasi" },
  {
    key: "clozeText",
    label: "Bo‘shliqli gap",
    placeholder: "Bo‘shliq o‘rnida aynan bitta {{blank}}",
  },
];

export default function ImportDialog({ data, onClose, onSave }: Props) {
  const [language, setLanguage] = useState<Language>("de");
  const [level, setLevel] = useState<Level>("A1.2");
  const [title, setTitle] = useState("Mening so‘zlarim");
  const [text, setText] = useState("");
  const [document, setDocument] = useState<ImportDocument | null>(null);
  const [error, setError] = useState("");
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">(
    "idle",
  );
  const [saving, setSaving] = useState(false);
  const [cancelActiveSession, setCancelActiveSession] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const prompt = useMemo(
    () => buildPrompt(language, level, title.trim() || "Mening so‘zlarim"),
    [language, level, title],
  );
  const rows = document?.rows ?? [];
  const hasSessionConflict = document
    ? importSessionConflict(data, document)
    : false;
  const duplicateCount = rows.filter(
    (row) => row.duplicateId || row.duplicateRowKey,
  ).length;
  const eligibleCount = rows.filter((row) =>
    isClozeEligible(row.content),
  ).length;
  const errorCount = rows.filter((row) => row.errors.length > 0).length;
  const blockingErrorCount = rows.filter(
    (row) =>
      row.errors.length > 0 &&
      !((row.duplicateId || row.duplicateRowKey) && row.action === "skip"),
  ).length;
  const importingCount = rows.filter(
    (row) =>
      !(row.duplicateId || row.duplicateRowKey) || row.action === "update",
  ).length;

  function changeSettings(change: () => void) {
    change();
    setCopyStatus("idle");
    setError("");
  }

  async function copyPrompt() {
    if (!title.trim()) {
      setError("To‘plam nomini kiriting.");
      return;
    }
    setError("");
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(prompt);
      } else {
        const helper = window.document.createElement("textarea");
        helper.value = prompt;
        helper.setAttribute("readonly", "");
        helper.style.position = "fixed";
        helper.style.opacity = "0";
        window.document.body.appendChild(helper);
        helper.select();
        const copied = window.document.execCommand("copy");
        helper.remove();
        if (!copied) throw new Error("Clipboard unavailable");
      }
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  }

  function review() {
    setError("");
    setCancelActiveSession(false);
    if (!title.trim()) {
      setError("To‘plam nomini kiriting.");
      return;
    }
    try {
      const parsed = parseImport(
        text,
        { language, level, title: title.trim() },
        data,
      );
      setDocument(parsed);
      setExpanded(
        new Set(
          parsed.rows.filter((row) => row.errors.length).map((row) => row.key),
        ),
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "JSON’ni o‘qib bo‘lmadi. Matnni tekshiring.",
      );
    }
  }

  function editRow(
    key: string,
    field: keyof WordContent,
    value: string,
    isList = false,
  ) {
    setCancelActiveSession(false);
    setDocument((current) => {
      if (!current) return current;
      const updated = current.rows.map((row) => {
        if (row.key !== key) return row;
        const content = { ...row.content };
        if (value === "" && field !== "word" && field !== "translation") {
          delete content[field];
        } else if (
          isList &&
          (field === "acceptedAnswers" || field === "clozeAnswers")
        ) {
          content[field] = value.split("\n");
        } else if (field !== "acceptedAnswers" && field !== "clozeAnswers") {
          content[field] = value;
        }
        return { ...row, content };
      });
      return {
        ...current,
        rows: validateRows(updated, current.language, data),
      };
    });
  }

  function setAction(key: string, action: ImportRow["action"]) {
    setCancelActiveSession(false);
    setDocument((current) =>
      current
        ? {
            ...current,
            rows: validateRows(
              current.rows.map((row) =>
                row.key === key ? { ...row, action } : row,
              ),
              current.language,
              data,
            ),
          }
        : current,
    );
  }

  async function save() {
    if (!document || saving) return;
    setSaving(true);
    setError("");
    try {
      const next = applyImport(
        data,
        document,
        hasSessionConflict && cancelActiveSession,
      );
      if (await onSave(next)) onClose();
      else
        setError(
          "So‘zlar saqlanmadi. Saqlash xatosini bartaraf qilib, qayta urinib ko‘ring.",
        );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "So‘zlarni saqlab bo‘lmadi.",
      );
    } finally {
      setSaving(false);
    }
  }

  const toggleExpanded = (key: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <Modal
      title="So‘zlarni import qilish"
      subtitle="O‘z so‘zlaringiz. O‘z sur’atingiz."
      onClose={() => {
        if (!saving) onClose();
      }}
      wide
    >
      <div className="import-dialog">
        <div className="import-progress" aria-label="Import bosqichlari">
          <span className={!document ? "active" : "complete"}>
            <span>01</span> Tayyorlash
          </span>
          <span className={document ? "active" : ""}>
            <span>02</span> Tekshirish va saqlash
          </span>
        </div>
        {!document ? (
          <>
            <section className="import-step">
              <div className="step-heading">
                <span className="step-number">1</span>
                <div>
                  <h3>To‘plamingizni tayyorlang</h3>
                  <p className="muted">
                    Til va darajani tanlang, so‘ng promptni tashqi AI’ga
                    so‘zlaringiz yoki PDF bilan birga bering.
                  </p>
                </div>
              </div>
              <div className="form-grid import-meta">
                <label className="field">
                  Til
                  <select
                    value={language}
                    onChange={(event) =>
                      changeSettings(() =>
                        setLanguage(event.target.value as Language),
                      )
                    }
                  >
                    {LANGUAGES.map((code) => (
                      <option key={code} value={code}>
                        {LANGUAGE_NAMES[code]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Daraja
                  <select
                    value={level}
                    onChange={(event) =>
                      changeSettings(() =>
                        setLevel(event.target.value as Level),
                      )
                    }
                  >
                    {LEVELS.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </label>
                <label className="field collection-title-field">
                  To‘plam nomi
                  <input
                    value={title}
                    onChange={(event) =>
                      changeSettings(() => setTitle(event.target.value))
                    }
                    maxLength={160}
                    placeholder="To‘plamingizga nom bering"
                  />
                </label>
              </div>
              <div className="prompt-actions">
                <button
                  type="button"
                  className="button secondary"
                  onClick={copyPrompt}
                >
                  {copyStatus === "copied" ? (
                    <CheckCheck size={17} />
                  ) : (
                    <Clipboard size={17} />
                  )}
                  {copyStatus === "copied"
                    ? "Prompt nusxalandi"
                    : "AI uchun promptni nusxalash"}
                </button>
                <span className="muted small">
                  <Sparkles size={14} aria-hidden="true" /> Tashqi AI uchun.
                  Saytda AI ishlamaydi.
                </span>
              </div>
              <p className="sr-only" role="status">
                {copyStatus === "copied" ? "AI uchun prompt nusxalandi." : ""}
              </p>
              {copyStatus === "failed" && (
                <p className="error-panel" role="alert">
                  Avtomatik nusxalab bo‘lmadi. Quyidagi “Prompt matnini ko‘rish”
                  bo‘limini ochib, matnni qo‘lda nusxalang.
                </p>
              )}
              <details className="prompt-preview">
                <summary>Prompt matnini ko‘rish</summary>
                <textarea
                  aria-label="AI uchun prompt matni"
                  value={prompt}
                  readOnly
                  rows={12}
                  onFocus={(event) => event.currentTarget.select()}
                />
              </details>
            </section>
            <section className="import-step">
              <div className="step-heading">
                <span className="step-number">2</span>
                <div>
                  <h3>AI javobini shu yerga joylang</h3>
                  <p className="muted">
                    Oddiy JSON yoki Markdown kod blokiga o‘ralgan JSON qabul
                    qilinadi. Saqlashdan oldin har bir qatorni tekshirasiz.
                  </p>
                </div>
              </div>
              <label className="field">
                <span className="json-label">
                  <FileJson size={15} aria-hidden="true" /> JSON matni
                </span>
                <textarea
                  className="json-input"
                  spellCheck={false}
                  value={text}
                  onChange={(event) => {
                    setText(event.target.value);
                    setError("");
                  }}
                  placeholder={
                    '{\n  "schemaVersion": 1,\n  "language": "' +
                    language +
                    '",\n  "level": "' +
                    level +
                    '",\n  "title": "' +
                    title.replaceAll('"', "") +
                    '",\n  "words": []\n}'
                  }
                  rows={9}
                />
              </label>
            </section>
            {error && (
              <div className="error-panel" role="alert">
                {error}
              </div>
            )}
            <div className="dialog-actions">
              <button className="button ghost" type="button" onClick={onClose}>
                Bekor qilish
              </button>
              <button
                className="button primary"
                type="button"
                onClick={review}
                disabled={!text.trim()}
              >
                Tekshirish <ArrowRight size={17} />
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="review-heading">
              <div>
                <h3>{document.title}</h3>
                <p className="muted">
                  {LANGUAGE_NAMES[document.language]} · {document.level}
                </p>
              </div>
              <button
                type="button"
                className="button ghost small-button"
                onClick={() => {
                  setDocument(null);
                  setError("");
                }}
              >
                <ArrowLeft size={16} /> JSON’ga qaytish
              </button>
            </div>
            <div className="import-summary" aria-label="Import tekshiruvi">
              <span>
                <strong>{rows.length}</strong> so‘z topildi
              </span>
              <span>
                <strong>{eligibleCount}</strong> gap mashqiga yaroqli
              </span>
              <span className={duplicateCount ? "warning-text" : ""}>
                <strong>{duplicateCount}</strong> takroriy
              </span>
              <span className={errorCount ? "error-text" : "success-text"}>
                <strong>{errorCount}</strong> xatoli qator
              </span>
            </div>
            <p className="muted small import-review-note">
              <Info size={15} aria-hidden="true" /> So‘z va tarjimani shu yerda
              tahrirlang. Gaplar va qabul qilinadigan javoblar uchun
              “Tafsilotlar”ni oching.
            </p>
            <div className="review-table-wrap">
              <table className="review-table">
                <thead>
                  <tr>
                    <th scope="col">№</th>
                    <th scope="col">So‘z</th>
                    <th scope="col">O‘zbekcha tarjima</th>
                    <th scope="col">Holat</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => {
                    const duplicate = !!(
                      row.duplicateId || row.duplicateRowKey
                    );
                    const open = expanded.has(row.key);
                    return (
                      <ReviewRow
                        key={row.key}
                        row={row}
                        index={index}
                        open={open}
                        duplicate={duplicate}
                        onToggle={() => toggleExpanded(row.key)}
                        onEdit={(field, value, list) =>
                          editRow(row.key, field, value, list)
                        }
                        onAction={(action) => setAction(row.key, action)}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
            {duplicateCount > 0 && (
              <p className="notice-panel small">
                Takroriy so‘z til, yozilish va o‘zbekcha ma’nosi bo‘yicha
                aniqlanadi. “Yangilash” mavjud so‘zning o‘rganish tarixini
                saqlaydi. “O‘tkazib yuborish” tanlangan takroriy qator, undagi
                xatolar bilan birga, saqlanmaydi. Bir fayldagi takrorlarda
                oxirgi tanlangan yangilanish qo‘llanadi.
              </p>
            )}
            {hasSessionConflict && (
              <div className="notice-panel session-conflict" role="note">
                <strong>Tugallanmagan raunddagi so‘zlar yangilanadi.</strong>
                <p>
                  Avvalgi javoblar va o‘rganish tarixi saqlanadi. Javoblar
                  o‘zgarmasligi uchun tugallanmagan raund navbati bekor
                  qilinadi; keyin yangi raund boshlashingiz mumkin.
                </p>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={cancelActiveSession}
                    onChange={(event) =>
                      setCancelActiveSession(event.target.checked)
                    }
                  />{" "}
                  Tugallanmagan raundni bekor qilib, so‘zlarni yangilashga
                  roziman.
                </label>
              </div>
            )}
            {error && (
              <div className="error-panel" role="alert">
                {error}
              </div>
            )}
            <div className="dialog-actions">
              <span className="muted small">
                {blockingErrorCount
                  ? "Saqlanadigan xatoli qatorlarni tuzating."
                  : `${importingCount} ta qator qo‘llanadi.`}
              </span>
              <button
                className="button primary"
                type="button"
                onClick={save}
                disabled={
                  saving ||
                  blockingErrorCount > 0 ||
                  rows.length === 0 ||
                  importingCount === 0 ||
                  (hasSessionConflict && !cancelActiveSession)
                }
              >
                {saving ? (
                  <LoaderCircle size={17} className="spin" />
                ) : (
                  <Plus size={17} />
                )}
                {saving ? "Saqlanmoqda…" : "To‘plamni saqlash"}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

function ReviewRow({
  row,
  index,
  open,
  duplicate,
  onToggle,
  onEdit,
  onAction,
}: {
  row: ImportRow;
  index: number;
  open: boolean;
  duplicate: boolean;
  onToggle: () => void;
  onEdit: (field: keyof WordContent, value: string, isList?: boolean) => void;
  onAction: (action: ImportRow["action"]) => void;
}) {
  const extraWarnings = row.warnings.filter((message) =>
    message.startsWith("Qo‘shimcha maydonlar"),
  );
  const detailWarnings = row.warnings.filter(
    (message) => !message.startsWith("Qo‘shimcha maydonlar"),
  );
  return (
    <>
      <tr className={row.errors.length ? "invalid-row" : ""}>
        <td className="row-number">{String(index + 1).padStart(2, "0")}</td>
        <td>
          <input
            aria-label={`${index + 1}-qator so‘z`}
            value={showValue(row.content.word)}
            onChange={(event) => onEdit("word", event.target.value)}
          />
        </td>
        <td>
          <input
            aria-label={`${index + 1}-qator tarjima`}
            value={showValue(row.content.translation)}
            onChange={(event) => onEdit("translation", event.target.value)}
          />
        </td>
        <td>
          <div className="row-status">
            {duplicate ? (
              <span className="tag warning-tag">Takroriy</span>
            ) : row.errors.length ? (
              <span className="tag error-tag">Xato</span>
            ) : (
              <span className="valid-mark">
                <Check size={14} /> Yangi
              </span>
            )}
            <button
              className="text-button row-expand"
              type="button"
              aria-expanded={open}
              onClick={onToggle}
            >
              Tafsilotlar{" "}
              <ChevronDown size={14} className={open ? "chevron-open" : ""} />
            </button>
          </div>
        </td>
      </tr>
      {(open ||
        row.errors.length > 0 ||
        duplicate ||
        extraWarnings.length > 0) && (
        <tr className="review-details-row">
          <td colSpan={4}>
            {row.errors.length > 0 && (
              <ul
                className="row-errors"
                aria-label={`${index + 1}-qator xatolari`}
              >
                {row.errors.map((message, item) => (
                  <li key={item}>{message}</li>
                ))}
              </ul>
            )}
            {extraWarnings.length > 0 && (
              <div role="note">
                <ul className="row-warnings">
                  {extraWarnings.map((message, item) => (
                    <li key={item}>{message}</li>
                  ))}
                </ul>
              </div>
            )}
            {duplicate && (
              <label className="duplicate-choice">
                Takroriy so‘z uchun amal
                <select
                  aria-label={`${index + 1}-qator takroriy so‘z amali`}
                  value={row.action}
                  onChange={(event) =>
                    onAction(event.target.value as ImportRow["action"])
                  }
                >
                  <option value="skip">O‘tkazib yuborish</option>
                  <option value="update">Yangilash · tarixni saqlash</option>
                </select>
              </label>
            )}
            {open && (
              <div className="review-details">
                <div className="form-grid">
                  {optionalTextFields.map(({ key, label, placeholder }) => (
                    <label
                      className={`field ${key !== "partOfSpeech" ? "wide-field" : ""}`}
                      key={key}
                    >
                      {label}
                      <input
                        aria-label={`${index + 1}-qator ${label}`}
                        value={showValue(row.content[key])}
                        placeholder={placeholder}
                        onChange={(event) => onEdit(key, event.target.value)}
                      />
                    </label>
                  ))}
                </div>
                <div className="form-grid">
                  <label className="field">
                    Qabul qilinadigan javoblar
                    <textarea
                      aria-label={`${index + 1}-qator qabul qilinadigan javoblar`}
                      rows={3}
                      value={showList(row.content.acceptedAnswers)}
                      placeholder="Har bir javobni alohida qatorga yozing"
                      onChange={(event) =>
                        onEdit("acceptedAnswers", event.target.value, true)
                      }
                    />
                    <span className="field-help">
                      Bo‘sh bo‘lsa, “So‘z” maydoni bilan tekshiriladi.
                    </span>
                  </label>
                  <label className="field">
                    Bo‘shliqqa mos javoblar
                    <textarea
                      aria-label={`${index + 1}-qator bo‘shliqqa mos javoblar`}
                      rows={3}
                      value={showList(row.content.clozeAnswers)}
                      placeholder="Har bir grammatik mos shakl alohida qatorda"
                      onChange={(event) =>
                        onEdit("clozeAnswers", event.target.value, true)
                      }
                    />
                    <span className="field-help">
                      Bu shakl lug‘atdagi so‘zdan farq qilishi mumkin.
                    </span>
                  </label>
                </div>
                <p
                  className={`small ${isClozeEligible(row.content) ? "success-text" : "muted"}`}
                >
                  {isClozeEligible(row.content)
                    ? "✓ Gap mashqi uchun ma’lumotlar yetarli."
                    : "Gap mashqi uchun asl gap, tarjima, bitta {{blank}} va mos javoblar kerak. Bu so‘z tarjima mashqida qatnashadi."}
                </p>
                {detailWarnings.length > 0 && (
                  <ul className="row-warnings">
                    {detailWarnings.map((message, item) => (
                      <li key={item}>{message}</li>
                    ))}
                  </ul>
                )}
                {row.raw !== undefined && (
                  <details className="raw-data">
                    <summary>Asl qator ma’lumoti</summary>
                    <pre>{JSON.stringify(row.raw, null, 2)}</pre>
                  </details>
                )}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
