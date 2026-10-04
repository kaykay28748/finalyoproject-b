import { useEffect, useState } from "react";
import { loadPreferences } from "../services/preferencesStore";
import "./AppLoadingScreen.css";

export default function AppLoadingScreen({ message = "Getting your map ready", darkMode }) {
  const [isDark, setIsDark] = useState(() => (
    typeof darkMode === "boolean"
      ? darkMode
      : window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false
  ));

  useEffect(() => {
    if (typeof darkMode === "boolean") {
      setIsDark(darkMode);
      return undefined;
    }

    let cancelled = false;
    loadPreferences()
      .then((preferences) => {
        if (!cancelled && typeof preferences?.darkMode === "boolean") {
          setIsDark(preferences.darkMode);
        }
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [darkMode]);

  return (
    <main className={`app-loading-screen${isDark ? " app-loading-screen--dark" : ""}`} role="status" aria-live="polite">
      <div className="app-loading-content">
        <div className="app-loading-mark" aria-hidden="true">
          <img src="/icon-192.png" alt="" width="48" height="48" />
          <span className="app-loading-ring" />
        </div>
        <p className="app-loading-brand">TransitGuide</p>
        <p className="app-loading-message">{message}<span className="app-loading-ellipsis" aria-hidden="true">…</span></p>
      </div>
    </main>
  );
}