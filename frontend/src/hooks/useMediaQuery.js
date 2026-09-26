import { useEffect, useState } from "react";

/**
 * Subscribe to a CSS media query from React.
 *
 * Needed where a component must genuinely render in one of two places rather
 * than merely look different — rendering both and hiding one with CSS would
 * expose the hidden copy to screen readers and duplicate its disclosure state.
 *
 * SSR-safe: returns false until the query can actually be evaluated.
 */
export default function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;

    const mql = window.matchMedia(query);
    // The initial value is read by the useState initialiser above, so there is
    // no need to re-sync here — doing so would setState synchronously inside the
    // effect and trigger a cascading render. The listener handles all
    // subsequent changes, including when `query` changes.
    const onChange = (e) => setMatches(e.matches);

    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/** The app's desktop/side-panel breakpoint. Matches the `min-width: 1024px` block in Legend.css. */
export const DESKTOP_QUERY = "(min-width: 1024px)";
