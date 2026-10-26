import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";
interface Props {
  title: string;
  subtitle?: string;
  onClose: () => void;
  wide?: boolean;
  children: ReactNode;
}
export default function Modal({
  title,
  subtitle,
  onClose,
  wide,
  children,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const label = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const el = ref.current;
    const focusable = () =>
      Array.from(
        el?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]',
        ) ?? [],
      ).filter((e) => e.getClientRects().length);
    const timer = window.setTimeout(() => (focusable()[0] ?? el)?.focus(), 50);
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeRef.current();
      }
      if (e.key === "Tab") {
        const list = focusable();
        const first = list[0],
          last = list.at(-1);
        if (!list.length) {
          e.preventDefault();
          el?.focus();
          return;
        }
        if (
          e.shiftKey &&
          (document.activeElement === first || document.activeElement === el)
        ) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener("keydown", key);
    return () => {
      clearTimeout(timer);
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className={`modal ${wide ? "modal-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={label}
        tabIndex={-1}
      >
        <header className="modal-header">
          <div>
            <p className="eyebrow">SO‘Z ORBITASI</p>
            <h2 id={label}>{title}</h2>
            {subtitle && <p className="muted">{subtitle}</p>}
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Oynani yopish"
          >
            <X size={21} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
