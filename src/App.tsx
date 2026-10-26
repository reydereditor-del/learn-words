import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  Clock3,
  Download,
  Ellipsis,
  FileUp,
  Globe2,
  Layers3,
  LoaderCircle,
  Plus,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import type { AppData, StudyMode } from "./lib/types";
import { LANGUAGE_NAMES } from "./lib/types";
import {
  loadData,
  parseBackup,
  saveData,
  serializeBackup,
} from "./lib/storage";
import { createSession, selectWords } from "./lib/study";
import { isClozeEligible } from "./lib/import";
import { wordIsDue, wordIsNew } from "./lib/stats";
import { shouldReduceMotion } from "./lib/motion";
import Orbit from "./components/Orbit";
import Modal from "./components/Modal";
import ImportDialog from "./components/ImportDialog";
import Practice from "./components/Practice";
import CollectionDialog from "./components/CollectionDialog";
function Logo({ small = false }: { small?: boolean }) {
  return (
    <span className={`brand ${small ? "brand-small" : ""}`}>
      <svg viewBox="0 0 44 44" aria-hidden="true">
        <ellipse cx="22" cy="22" rx="19" ry="8" transform="rotate(-35 22 22)" />
        <ellipse cx="22" cy="22" rx="19" ry="8" transform="rotate(35 22 22)" />
        <circle cx="22" cy="22" r="3" />
      </svg>
      <span>
        so‘z<span className="brand-light">orbitasi</span>
        <span className="brand-period">.</span>
      </span>
    </span>
  );
}
export default function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [view, setView] = useState<"home" | "practice">("home");
  const [dialog, setDialog] = useState<"import" | "practice" | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<"all" | "de" | "en">("all");
  const [restore, setRestore] = useState<AppData | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [notice, setNotice] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const saveQueue = useRef(Promise.resolve());
  const [osReduced, setOsReduced] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    const fn = () => setOsReduced(m.matches);
    m.addEventListener("change", fn);
    return () => m.removeEventListener("change", fn);
  }, []);
  const initialize = useCallback(() => {
    setLoadError("");
    loadData()
      .then(setData)
      .catch((e) =>
        setLoadError(
          e instanceof Error ? e.message : "Mahalliy saqlashni ochib bo‘lmadi.",
        ),
      );
  }, []);
  useEffect(initialize, [initialize]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (view === "practice") setNotice("");
  }, [view]);
  useEffect(() => {
    function outside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        setMenu(false);
    }
    function esc(e: KeyboardEvent) {
      if (e.key === "Escape") setMenu(false);
    }
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", esc);
    };
  }, []);
  const commit = useCallback(async (next: AppData): Promise<boolean> => {
    let ok = false;
    const task = saveQueue.current.then(async () => {
      try {
        await saveData(next);
        setData(next);
        setError("");
        ok = true;
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : "Saqlash amalga oshmadi. Brauzer xotirasini tekshiring.",
        );
      }
    });
    saveQueue.current = task.catch(() => {});
    await task;
    return ok;
  }, []);
  function goHome() {
    setView("home");
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function requestPractice(collectionId?: string) {
    if (collectionId) setSelected(null);
    setPracticeCollection(collectionId ?? "all");
    setDialog("practice");
    setReplaceSession(false);
    setStartError("");
  }
  const [practiceCollection, setPracticeCollection] = useState("all");
  const [mode, setMode] = useState<StudyMode>("translation");
  const [replaceSession, setReplaceSession] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState("");
  async function startPractice(
    onlyIds?: string[],
    selectedMode = mode,
    collection = practiceCollection,
  ) {
    if (!data || starting) return;
    setStarting(true);
    setStartError("");
    const nextSession = createSession(
      data,
      selectedMode,
      collection === "all" ? null : collection,
      Date.now(),
      onlyIds,
    );
    if (!nextSession) {
      setStartError(
        selectedMode === "cloze"
          ? "Hozir mashq uchun tayyor gapli so‘z yo‘q. Gap maydonlarini to‘ldiring yoki muddati kelganda qayting."
          : "Hozir yangi yoki muddati kelgan so‘z yo‘q. So‘z import qiling yoki keyingi takrorlashni kuting.",
      );
      setStarting(false);
      return;
    }
    if (await commit({ ...data, session: nextSession })) {
      setDialog(null);
      setView("practice");
      window.scrollTo({ top: 0, behavior: "instant" });
    }
    setStarting(false);
  }
  async function exportBackup() {
    if (!data) return;
    try {
      const blob = new Blob([serializeBackup(data)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `soz-orbitasi-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      setNotice("Zaxira fayli yuklab olish uchun tayyorlandi.");
      setMenu(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eksport amalga oshmadi.");
    }
  }
  async function readRestore(file: File | undefined) {
    if (!file) return;
    try {
      if (file.size > 25 * 1024 * 1024)
        throw new Error("Zaxira fayli 25 MB dan katta.");
      setRestore(parseBackup(await file.text()));
      setMenu(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Zaxira fayli noto‘g‘ri.");
    }
    if (fileRef.current) fileRef.current.value = "";
  }
  const reduced = data
    ? shouldReduceMotion(data.preferences, osReduced)
    : osReduced;
  const fullMotion = data?.preferences.motionOverride === "full";
  useEffect(() => {
    document.documentElement.dataset.motion = fullMotion ? "full" : "system";
    return () => {
      delete document.documentElement.dataset.motion;
    };
  }, [fullMotion]);
  if (!data)
    return (
      <main className="loading-screen">
        <Logo />
        {loadError ? (
          <>
            <h1>Ma’lumotlarni ochib bo‘lmadi</h1>
            <p role="alert">{loadError}</p>
            <button className="button primary" onClick={initialize}>
              <RotateCcw size={17} /> Qayta urinish
            </button>
          </>
        ) : (
          <>
            <LoaderCircle className="spin" />
            <p>So‘z makoningiz ochilmoqda…</p>
          </>
        )}
      </main>
    );
  const now = Date.now();
  const due = data.words.filter((w) => wordIsDue(w, now)).length;
  const fresh = data.words.filter(wordIsNew).length;
  const activeSession = data.session && !data.session.completedAt;
  const filtered = data.collections.filter(
    (c) => filter === "all" || c.language === filter,
  );
  return (
    <div className={`app ${reduced ? "reduced-motion" : ""}`}>
      <header className="site-header">
        <a
          className="brand-link"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            goHome();
          }}
          aria-label="So‘z Orbitasi — bosh ekran"
        >
          <Logo />
        </a>
        <nav aria-label="Asosiy">
          <button
            className={`nav-link ${view === "home" ? "nav-active" : ""}`}
            onClick={() => {
              goHome();
              setTimeout(
                () =>
                  document.getElementById("toplamlar")?.scrollIntoView({
                    behavior: reduced ? "instant" : "smooth",
                  }),
                50,
              );
            }}
          >
            To‘plamlar <span>{data.collections.length}</span>
          </button>
          <button
            className={`nav-link ${view === "practice" ? "nav-active" : ""}`}
            onClick={() => requestPractice()}
          >
            Mashq qilish
          </button>
        </nav>
        <div className="header-actions">
          <span className="local-status">
            <span className="status-dot" /> Shu brauzerda saqlanadi
          </span>
          <div ref={menuRef} className="helper-menu">
            <button
              className="icon-button"
              aria-label="Yordamchi menyu"
              aria-expanded={menu}
              aria-controls="helper-menu"
              onClick={() => setMenu(!menu)}
            >
              <Ellipsis size={23} />
            </button>
            {menu && (
              <div id="helper-menu" className="menu-popover">
                <p className="eyebrow">SIZNING MA’LUMOTLARINGIZ</p>
                <button onClick={exportBackup}>
                  <Download size={17} /> So‘zlar va tarixni eksport qilish
                </button>
                <button onClick={() => fileRef.current?.click()}>
                  <FileUp size={17} /> Zaxiradan tiklash
                </button>
                <label className="motion-toggle">
                  <span>Animatsiyani kamaytirish</span>
                  <input
                    type="checkbox"
                    checked={reduced}
                    onChange={(e) => {
                      void commit({
                        ...data,
                        preferences: {
                          ...data.preferences,
                          reducedMotion: e.target.checked,
                          motionOverride: e.target.checked ? "reduced" : "full",
                        },
                      });
                    }}
                  />
                </label>
                {osReduced && (
                  <p className="field-help">
                    Qurilmangiz harakatni kamaytirishni so‘ragan. Saytdagi
                    tanlovingiz bundan ustun ishlaydi.
                  </p>
                )}
                {(data.preferences.motionOverride ||
                  data.preferences.reducedMotion) && (
                  <button
                    onClick={() =>
                      void commit({
                        ...data,
                        preferences: { reducedMotion: false },
                      })
                    }
                  >
                    Qurilma sozlamasiga qaytish
                  </button>
                )}
                <p className="menu-footnote">
                  Ma’lumot qurilmalar orasida avtomatik sinxronlashmaydi.
                </p>
              </div>
            )}
          </div>
          <button
            className="button header-import secondary"
            onClick={() => setDialog("import")}
          >
            <Plus size={17} /> Import
          </button>
        </div>
      </header>
      {error && (
        <div className="global-message error-panel" role="alert">
          <span>{error}</span>
          <button
            className="icon-button"
            onClick={() => setError("")}
            aria-label="Xabarni yopish"
          >
            <X size={16} />
          </button>
        </div>
      )}
      {notice && (
        <div className="global-message success-panel" role="status">
          <span>{notice}</span>
          <button
            className="icon-button"
            onClick={() => setNotice("")}
            aria-label="Xabarni yopish"
          >
            <X size={16} />
          </button>
        </div>
      )}
      {view === "practice" ? (
        <Practice
          data={data}
          onChange={commit}
          onExit={goHome}
          onContinueHard={(ids, m, c) => {
            setPracticeCollection(c ?? "all");
            void startPractice(ids, m, c ?? "all");
          }}
        />
      ) : (
        <main>
          <Orbit
            data={data}
            reduced={reduced}
            onEnableMotion={() =>
              void commit({
                ...data,
                preferences: { reducedMotion: false, motionOverride: "full" },
              })
            }
            onImport={() => setDialog("import")}
            onPractice={() => requestPractice()}
          />
          <section className="library section-shell" id="toplamlar">
            <div className="section-heading">
              <div>
                <p className="eyebrow">SIZ YIG‘GAN KICHIK OLAMLAR</p>
                <h2>
                  So‘z to‘plamlari
                  <span className="count-label">
                    {data.collections.length.toString().padStart(2, "0")}
                  </span>
                </h2>
              </div>
              <button
                className="button secondary"
                onClick={() => setDialog("import")}
              >
                <Plus size={17} /> Yangi to‘plam
              </button>
            </div>
            {activeSession && (
              <div className="resume-banner">
                <div className="resume-icon">
                  <RotateCcw size={20} />
                </div>
                <div>
                  <strong>Boshlagan joyingizdan davom eting</strong>
                  <p>
                    {data.session!.mode === "translation"
                      ? "Tarjimadan yozish"
                      : "Gapdagi bo‘shliq"}{" "}
                    · {data.session!.index} / {data.session!.queue.length} savol
                    yakunlangan
                  </p>
                </div>
                <button
                  className="button primary"
                  onClick={() => {
                    setView("practice");
                    window.scrollTo({ top: 0, behavior: "instant" });
                  }}
                >
                  Davom ettirish <ArrowRight size={17} />
                </button>
              </div>
            )}
            <div className="library-toolbar">
              <div className="filter-tabs" aria-label="To‘plam tilini tanlash">
                {(["all", "de", "en"] as const).map((f) => (
                  <button
                    key={f}
                    className={filter === f ? "selected" : ""}
                    aria-pressed={filter === f}
                    onClick={() => setFilter(f)}
                  >
                    {f === "all" ? "Barchasi" : LANGUAGE_NAMES[f]}
                    <span>
                      {
                        data.collections.filter(
                          (c) => f === "all" || c.language === f,
                        ).length
                      }
                    </span>
                  </button>
                ))}
              </div>
              <span className="library-word-count">
                <BookOpen size={15} />
                {data.words.length} ta so‘z
              </span>
            </div>
            {!data.collections.length ? (
              <div className="empty-library">
                <div className="empty-stack" aria-hidden="true">
                  <span />
                  <span />
                  <span>
                    <Plus size={25} />
                  </span>
                </div>
                <div>
                  <h3>Hali so‘z qo‘shilmagan</h3>
                  <p>
                    Birinchi to‘plamingiz shu yerdan boshlanadi.
                    <br />
                    Tayyorlagan so‘zlaringizni JSON orqali import qiling.
                  </p>
                </div>
                <button
                  className="text-button green"
                  onClick={() => setDialog("import")}
                >
                  So‘zlarni import qilish <ArrowRight size={17} />
                </button>
                <span className="empty-grid-number" aria-hidden="true">
                  01
                </span>
              </div>
            ) : filtered.length ? (
              <div className="collection-grid">
                {filtered.map((c, i) => {
                  const words = data.words.filter(
                    (w) => w.collectionId === c.id,
                  );
                  const d = words.filter((w) => wordIsDue(w, now)).length;
                  const n = words.filter(wordIsNew).length;
                  return (
                    <button
                      key={c.id}
                      className="collection-card"
                      onClick={() => setSelected(c.id)}
                    >
                      <div className="collection-card-top">
                        <span className={`language-chip ${c.language}`}>
                          <span>{c.language === "de" ? "DE" : "EN"}</span>
                          {LANGUAGE_NAMES[c.language]}
                          <span className="chip-divider" />
                          {c.level}
                        </span>
                        <span className="card-index">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                      </div>
                      <div className="deck-illustration" aria-hidden="true">
                        <i />
                        <i />
                        <i>
                          <Layers3 size={24} />
                        </i>
                      </div>
                      <h3>{c.title}</h3>
                      <p>
                        {words.length} ta so‘z <span>·</span>{" "}
                        {words.filter(isClozeEligible).length} ta gap
                      </p>
                      <div className="collection-card-footer">
                        <span>
                          {d
                            ? `${d} ta takrorlash`
                            : n
                              ? `${n} ta yangi so‘z`
                              : "Hozircha takrorlash yo‘q"}
                        </span>
                        <ArrowRight size={18} />
                      </div>
                    </button>
                  );
                })}
                <button
                  className="add-collection-card"
                  onClick={() => setDialog("import")}
                >
                  <span>
                    <Plus size={26} />
                  </span>
                  <strong>Yangi orbita yarating</strong>
                  <p>O‘z so‘zlaringizdan yangi to‘plam</p>
                </button>
              </div>
            ) : (
              <div className="filtered-empty">
                <Globe2 size={25} />
                <p>Bu tilda hali to‘plam yo‘q.</p>
                <button
                  className="text-button green"
                  onClick={() => setDialog("import")}
                >
                  To‘plam import qilish <Plus size={16} />
                </button>
              </div>
            )}
            <div className="daily-strip">
              <div className="daily-strip-title">
                <Clock3 size={23} />
                <div>
                  <strong>Oz-ozdan. Har kuni.</strong>
                  <p>Bugungi kichik qadam — ertangi mustahkam bilim.</p>
                </div>
              </div>
              <div className="daily-number">
                <strong>{due}</strong>
                <span>takrorlash kutilmoqda</span>
              </div>
              <div className="daily-number">
                <strong>{fresh}</strong>
                <span>yangi so‘z tayyor</span>
              </div>
              <button className="text-button" onClick={() => requestPractice()}>
                Mashq qilish <ArrowRight size={18} />
              </button>
            </div>
          </section>
          <footer className="site-footer section-shell">
            <Logo small />
            <p>
              <ShieldCheck size={15} /> So‘zlaringiz faqat shu brauzerda. Zaxira
              olishni unutmang.
            </p>
            <button className="text-button" onClick={exportBackup}>
              <ArrowDownToLine size={16} /> Zaxira olish
            </button>
            <p className="footer-note">
              Brauzer ma’lumotlari tozalansa, lug‘at ham o‘chadi. Avtomatik
              sinxronlash yo‘q.
            </p>
          </footer>
        </main>
      )}
      <input
        type="file"
        accept=".json,application/json"
        ref={fileRef}
        hidden
        onChange={(e) => void readRestore(e.target.files?.[0])}
      />
      {dialog === "import" && (
        <ImportDialog
          data={data}
          onClose={() => setDialog(null)}
          onSave={async (next) => {
            const ok = await commit(next);
            if (ok) {
              setNotice("To‘plam saqlandi. So‘zlaringiz mashq uchun tayyor.");
              if (view === "practice" && !next.session) goHome();
            }
            return ok;
          }}
        />
      )}
      {selected && (
        <CollectionDialog
          data={data}
          collectionId={selected}
          onClose={() => setSelected(null)}
          onSave={commit}
          onPractice={(id) => requestPractice(id)}
        />
      )}
      {dialog === "practice" && (
        <Modal
          title="Bugun nimani mashq qilamiz?"
          subtitle="Avval muddati kelgan so‘zlar, keyin yangilari. Bir raundda 10 tagacha savol."
          onClose={() => {
            if (!starting) setDialog(null);
          }}
        >
          {activeSession && !replaceSession ? (
            <div className="existing-session">
              <span className="feature-icon">
                <RotateCcw size={27} />
              </span>
              <h3>Tugallanmagan raund bor</h3>
              <p className="muted">
                Natijalaringiz saqlangan. Shu raundni davom ettirishingiz yoki
                yangisini boshlashingiz mumkin.
              </p>
              <button
                className="button primary full"
                onClick={() => {
                  setDialog(null);
                  setView("practice");
                  window.scrollTo({ top: 0, behavior: "instant" });
                }}
              >
                Davom ettirish <ArrowRight size={18} />
              </button>
              <button
                className="text-button"
                onClick={() => setReplaceSession(true)}
              >
                Yangi raund tanlash
              </button>
            </div>
          ) : (
            <>
              <div className="field">
                <label htmlFor="practice-collection">To‘plam</label>
                <div className="select-wrap">
                  <select
                    id="practice-collection"
                    value={practiceCollection}
                    onChange={(e) => {
                      setPracticeCollection(e.target.value);
                      setStartError("");
                    }}
                  >
                    <option value="all">Barcha to‘plamlar</option>
                    {data.collections.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title} · {LANGUAGE_NAMES[c.language]}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={16} />
                </div>
              </div>
              <div className="mode-options">
                {(
                  [
                    {
                      id: "translation",
                      title: "Tarjimadan yozish",
                      description:
                        "O‘zbekcha ma’noni ko‘ring, so‘zni o‘zingiz yozing.",
                      icon: BookOpen,
                    },
                    {
                      id: "cloze",
                      title: "Gapdagi bo‘shliq",
                      description:
                        "So‘zni gap ichida, kerakli grammatik shaklda yozing.",
                      icon: Sparkles,
                    },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    className={`mode-option ${mode === item.id ? "selected" : ""}`}
                    aria-pressed={mode === item.id}
                    onClick={() => {
                      setMode(item.id);
                      setStartError("");
                    }}
                  >
                    <item.icon size={23} />
                    <div>
                      <strong>{item.title}</strong>
                      <p>{item.description}</p>
                    </div>
                    <span className="radio-dot">
                      {mode === item.id && <Check size={12} />}
                    </span>
                  </button>
                ))}
              </div>
              <p className="field-help">
                {Math.min(
                  10,
                  selectWords(
                    data.words,
                    mode,
                    now,
                    practiceCollection === "all" ? null : practiceCollection,
                  ).length,
                )}{" "}
                ta savol tayyor.
                {mode === "cloze"
                  ? " Faqat to‘liq gap maydonlari bor so‘zlar qatnashadi."
                  : ""}
              </p>
              {replaceSession && (
                <p className="notice-panel">
                  Yangi raund boshlansa, oldingi raundning navbati
                  almashtiriladi. Yozilgan javoblar tarixi saqlanadi.
                </p>
              )}
              {startError && (
                <p className="error-panel" role="alert">
                  {startError}
                </p>
              )}
              <div className="dialog-actions">
                <button
                  className="button ghost"
                  onClick={() => setDialog(null)}
                  disabled={starting}
                >
                  Bekor qilish
                </button>
                <button
                  className="button primary"
                  onClick={() => void startPractice()}
                  disabled={starting}
                >
                  {starting ? (
                    <LoaderCircle size={18} className="spin" />
                  ) : (
                    <ArrowRight size={18} />
                  )}{" "}
                  Mashqni boshlash
                </button>
              </div>
            </>
          )}
        </Modal>
      )}
      {restore && (
        <Modal
          title="Zaxiradan tiklash"
          subtitle="Fayl tekshirildi. Almashtirishdan oldin tarkibni ko‘rib chiqing."
          onClose={() => {
            if (!restoring) setRestore(null);
          }}
        >
          <div className="backup-summary">
            <div>
              <strong>{restore.collections.length}</strong>
              <span>to‘plam</span>
            </div>
            <div>
              <strong>{restore.words.length}</strong>
              <span>so‘z</span>
            </div>
            <div>
              <strong>{restore.history.length}</strong>
              <span>javob tarixi</span>
            </div>
          </div>
          <p className="error-panel">
            Diqqat: shu brauzerdagi {data.words.length} ta so‘z va mavjud tarix
            zaxiradagi ma’lumotlar bilan to‘liq almashtiriladi. Bu amalni ortga
            qaytarish uchun avval joriy ma’lumotlarni eksport qiling.
          </p>
          <button className="text-button" onClick={exportBackup}>
            <Download size={16} /> Avval joriy zaxirani olish
          </button>
          <div className="dialog-actions">
            <button
              disabled={restoring}
              className="button ghost"
              onClick={() => setRestore(null)}
            >
              Bekor qilish
            </button>
            <button
              disabled={restoring}
              className="button primary"
              onClick={async () => {
                setRestoring(true);
                if (await commit(restore)) {
                  setRestore(null);
                  setSelected(null);
                  setDialog(null);
                  goHome();
                  setNotice("Zaxira tiklandi. So‘zlar va tarix saqlandi.");
                }
                setRestoring(false);
              }}
            >
              {restoring ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <RotateCcw size={17} />
              )}{" "}
              Almashtirib tiklash
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
