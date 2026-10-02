import { useEffect, useState } from "react";

/**
 * Tracks whether the app shell is in dark mode.
 *
 * The theme lives as a `dark` class on the `.ug-root` wrapper (see App.jsx),
 * which several surfaces render *outside* of — anything passed through
 * createPortal lands on document.body, and the auth routes sit outside the
 * wrapper entirely. Those elements have no `.ug-root` ancestor, so every
 * `.ug-root.dark …` rule written for them can never match.
 *
 * This hook reads the class off the live DOM and keeps watching, so portaled UI
 * can opt into theme styles via its own modifier class instead of relying on an
 * ancestor selector that will not exist.
 *
 * @returns {boolean} true when `.ug-root.dark` is present.
 */
export function useDarkMode() {
  const [isDark, setIsDark] = useState(
    () => document.querySelector(".ug-root.dark") !== null
  );

  useEffect(() => {
    const sync = () => setIsDark(document.querySelector(".ug-root.dark") !== null);

    sync();

    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
      subtree: true,
    });

    return () => observer.disconnect();
  }, []);

  return isDark;
}

export default useDarkMode;