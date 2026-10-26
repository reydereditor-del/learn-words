import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

/** Reveal once on entry. Content remains available without observer support. */
export default function Reveal({
  children,
  reduced,
  delay = 0,
}: {
  children: ReactNode;
  reduced: boolean;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<"visible" | "pending" | "entered">(
    "visible",
  );
  useEffect(() => {
    const node = ref.current;
    if (reduced || !node || !("IntersectionObserver" in window)) {
      setPhase("visible");
      return;
    }
    if (node.getBoundingClientRect().top < window.innerHeight - 24) {
      setPhase("visible");
      return;
    }
    setPhase("pending");
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setPhase("entered");
          observer.disconnect();
        }
      },
      { threshold: 0.08, rootMargin: "0px 0px -24px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [reduced]);
  return (
    <div
      ref={ref}
      className={`collection-reveal reveal-${phase}`}
      style={{ transitionDelay: phase === "entered" ? `${delay}ms` : "0ms" }}
      onFocusCapture={() => setPhase("visible")}
    >
      {children}
    </div>
  );
}
