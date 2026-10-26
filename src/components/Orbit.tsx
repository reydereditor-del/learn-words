import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUpRight, Plus, Sparkle } from "lucide-react";
import type { AppData } from "../lib/types";
import { wordIsDue } from "../lib/stats";
interface Props {
  data: AppData;
  reduced: boolean;
  onImport: () => void;
  onPractice: () => void;
}
const positions = [
  { x: -156, y: -46, z: 95, r: -13 },
  { x: 95, y: -128, z: -20, r: 12 },
  { x: 194, y: 26, z: 45, r: 17 },
  { x: 1, y: 132, z: 110, r: -5 },
  { x: -229, y: 105, z: -70, r: -19 },
  { x: -56, y: -174, z: -110, r: 8 },
];
export default function Orbit({ data, reduced, onImport, onPractice }: Props) {
  const ref = useRef<HTMLElement>(null);
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    if (reduced) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = ref.current?.getBoundingClientRect();
        if (rect)
          setProgress(
            Math.max(
              0,
              Math.min(
                1,
                -rect.top /
                  Math.max(
                    1,
                    rect.height -
                      (ref.current
                        ?.querySelector(".orbit-sticky")
                        ?.getBoundingClientRect().height ?? window.innerHeight),
                  ),
              ),
            ),
          );
      });
    };
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    update();
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [reduced]);
  const cards = data.words.slice(0, 6);
  const amount = cards.length || 6;
  const p = reduced ? 0 : progress;
  const due = data.words.filter((w) => wordIsDue(w, Date.now())).length;
  return (
    <section
      ref={ref}
      className={`orbit-section ${reduced ? "orbit-static" : ""}`}
      aria-label="Shaxsiy so‘z makoningiz"
    >
      <div className="orbit-sticky">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="status-dot" /> SHAXSIY SO‘Z MAKONINGIZ
          </p>
          <h1>
            Har bir so‘z —<br />
            yangi bir <span>olam.</span>
          </h1>
          <p className="hero-description">
            Nemischa va inglizcha so‘zlaringizni bir joyga yig‘ing. Yozing,
            eslang va o‘z orbitangizni kengaytiring.
          </p>
          <div className="hero-actions">
            <button
              className="button primary"
              onClick={data.words.length ? onPractice : onImport}
            >
              {data.words.length ? <Sparkle size={19} /> : <Plus size={19} />}{" "}
              {data.words.length
                ? "Mashqni boshlash"
                : "Birinchi to‘plamni qo‘shish"}
              <ArrowUpRight size={16} aria-hidden="true" />
            </button>
            {!data.words.length ? (
              <button className="text-button" onClick={onPractice}>
                Mashqni boshlash <span aria-hidden="true">→</span>
              </button>
            ) : (
              <button className="text-button" onClick={onImport}>
                So‘z import qilish <Plus size={16} />
              </button>
            )}
          </div>
          {reduced && <p className="motion-note" role="status">Qurilma yoki yordamchi menyuda animatsiyani kamaytirish yoqilgan. Shu sabab orbita statik ko‘rsatilmoqda.</p>}
          <div className="hero-meta">
            <span>
              <i className="tiny-square" /> {data.words.length} ta so‘z
            </span>
            <span>{data.collections.length} ta to‘plam</span>
            <span>{due} ta bugungi takrorlash</span>
          </div>
        </div>
        <div
          className="orbit-visual"
          aria-label={
            cards.length
              ? "So‘zlaringizdan tuzilgan uch o‘lchamli orbita"
              : "So‘zlaringiz uchun bo‘sh uch o‘lchamli orbita"
          }
        >
          <div className="orbit-coordinates">
            <span>SO‘ZLAR / {String(data.words.length).padStart(2, "0")}</span>
            <span>01 — ∞</span>
          </div>
          <div className="orbit-perspective">
            <div className="orbital-ring ring-one" style={{ opacity: 1 - p }} />
            <div className="orbital-ring ring-two" style={{ opacity: 1 - p }} />
            <div className="orbit-axis" style={{ opacity: 1 - p }} />
            <div
              className="orbit-core"
              style={{
                opacity: 1 - p,
                transform: `translate(-50%, -50%) scale(${1 - p * 0.8})`,
              }}
            >
              <span />
              <span />
            </div>
            <div
              className="orbit-cards"
              style={{ transform: `rotateY(${p * 40}deg)` }}
            >
              {Array.from({ length: amount }, (_, i) => {
                const pos = positions[i];
                const word = cards[i];
                return (
                  <div
                    className={`orbit-card ${word ? "has-word" : ""} orbit-card-${i}`}
                    key={word?.id ?? i}
                    style={{
                      transform: `translate3d(${pos.x * (1 - p) + ((i % 3) - 1) * 151 * p}px, ${pos.y * (1 - p) + (Math.floor(i / 3) - 0.5) * 110 * p}px, ${pos.z * (1 - p)}px) rotateY(${(-18 + i * 8) * (1 - p) - 40 * p}deg) rotateZ(${pos.r * (1 - p)}deg)`,
                      opacity: i >= 4 && p > 0.5 ? 1 - (p - 0.5) * 0.25 : 1,
                    }}
                  >
                    <div className="mini-card-top">
                      <span className="mini-orbit" />
                      <span>
                        {word
                          ? data.collections
                              .find((c) => c.id === word.collectionId)
                              ?.language.toUpperCase()
                          : "•••"}
                      </span>
                    </div>
                    {word ? (
                      <>
                        <strong>{word.word}</strong>
                        <span className="mini-translation">
                          {word.translation}
                        </span>
                      </>
                    ) : (
                      <>
                        <div className="skeleton skeleton-long" />
                        <div className="skeleton skeleton-short" />
                        <span className="empty-card-plus">+</span>
                      </>
                    )}
                    <span className="mini-card-number">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="orbit-caption">
            <span className="small-cross">+</span>
            <span>
              {cards.length
                ? "SIZNING SO‘ZLARINGIZ. SIZNING ORBITANGIZ."
                : "YANGI SO‘ZLAR UCHUN JOY BOR."}
            </span>
            <span className="small-cross">+</span>
          </div>
        </div>
        <a className="scroll-cue" href="#toplamlar">
          <span>TO‘PLAMLARGA O‘TISH</span>
          <ArrowDown size={14} />
        </a>
      </div>
    </section>
  );
}
