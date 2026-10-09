"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Vero quando l'elemento entra nello schermo, una sola volta. Chi chiede di ridurre il movimento
 * vede subito il contenuto, senza attese.
 */
export function useInView<T extends HTMLElement>(soglia = 0.25) {
  const ref = useRef<T>(null);
  const [visto, setVisto] = useState(false);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setVisto(true);
      return;
    }
    const el = ref.current;
    if (!el || !("IntersectionObserver" in window)) {
      setVisto(true);
      return;
    }
    const osservatore = new IntersectionObserver(
      (voci) => {
        if (voci.some((v) => v.isIntersecting)) {
          setVisto(true);
          osservatore.disconnect();
        }
      },
      { threshold: soglia },
    );
    osservatore.observe(el);
    return () => osservatore.disconnect();
  }, [soglia]);

  return { ref, visto };
}
