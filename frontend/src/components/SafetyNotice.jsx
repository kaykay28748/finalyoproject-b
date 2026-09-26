import { useId, useState } from 'react';
import './SafetyNotice.css';

/**
 * Persistent, always-available safety notice.
 *
 * Deliberately not legal boilerplate. It states the three things that are true
 * regardless of network state or data freshness, and it stays in the app shell
 * so it is present offline (the service worker bypasses all /api traffic, so a
 * server-pushed notice would never reach an offline user).
 *
 * PLACEMENT — this used to be a `position: fixed` overlay pinned to the bottom
 * of the viewport. On phones the profile bar (Standard/Bicycle/Jogging/Night)
 * is also pinned to the bottom of the viewport, so the notice sat directly on
 * top of it at a higher z-index and swallowed every tap on those buttons. It now
 * lives in normal flow inside the legend sheet, between the scrolling body and
 * the profile bar, which makes overlap structurally impossible.
 *
 * It is rendered inside the sheet rather than portaled to the body so it
 * inherits the .ug-root theme tokens and needs no light/dark special-casing.
 */
export default function SafetyNotice() {
  const [open, setOpen] = useState(false);
  const bodyId = useId();

  return (
    <div className="safety-notice">
      <button
        type="button"
        className="safety-notice-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={bodyId}
      >
        <svg
          className="safety-notice-icon"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>

        <span className="safety-notice-label">Safety guidance</span>

        <span className="safety-notice-hint">
          {open ? "Hide" : "Estimates, not verified conditions"}
        </span>

        <svg
          className={`safety-notice-chevron${open ? " is-open" : ""}`}
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      <div id={bodyId} className="safety-notice-body" hidden={!open}>
        <p>
          Routes are computed estimates, not verified instructions. Lighting, surfaces,
          gate access and obstacles come from OpenStreetMap and community reports, which
          may be incomplete or out of date.
        </p>
        <ul>
          <li>Check the actual conditions before you set off, especially in poor light or weather.</li>
          <li>Use your own judgement — a computed route cannot account for breakdowns, closures or your own mobility.</li>
          <li>Report hazards you find so routes improve for others.</li>
          <li>In an emergency, contact campus security or local emergency services.</li>
        </ul>
      </div>
    </div>
  );
}
