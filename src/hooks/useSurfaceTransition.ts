import { useEffect, useRef } from "react";
import { flushSync } from "react-dom";

/** Progressive shared-surface transition; unsupported/reduced-motion browsers update immediately. */
export function useSurfaceTransition(reduced: boolean) {
  const active = useRef<ViewTransition | null>(null);
  const generation = useRef(0);
  useEffect(() => () => active.current?.skipTransition(), []);
  useEffect(() => {
    if (reduced) active.current?.skipTransition();
  }, [reduced]);
  return (
    source: HTMLElement | null,
    update: () => void,
    targetSelector: string,
  ) => {
    active.current?.skipTransition();
    if (reduced || !document.startViewTransition || !source) {
      update();
      return;
    }
    const token = String(++generation.current);
    let target: HTMLElement | null = null;
    let applied = false;
    const mark = (node: HTMLElement) => {
      node.dataset.surfaceTransition = token;
      node.style.viewTransitionName = "study-surface";
    };
    const clear = (node: HTMLElement | null) => {
      if (node?.dataset.surfaceTransition === token) {
        node.style.removeProperty("view-transition-name");
        delete node.dataset.surfaceTransition;
      }
    };
    mark(source);
    try {
      const transition = document.startViewTransition(() => {
        clear(source);
        flushSync(() => {
          update();
          applied = true;
        });
        target = document.querySelector<HTMLElement>(targetSelector);
        if (target) mark(target);
      });
      active.current = transition;
      void transition.ready.catch(() => {});
      void transition.finished
        .catch(() => {})
        .finally(() => {
          clear(source);
          clear(target);
          if (active.current === transition) active.current = null;
        });
    } catch {
      clear(source);
      clear(target);
      if (!applied) update();
    }
  };
}
