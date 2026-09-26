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
 * PLACEMENT — two variants, because the available space differs by layout:
 *
 *   variant="map"    Desktop. Floats over the map at the bottom-left. The
 *                    profile bar on desktop lives inside the 440px side panel
 *                    on the right, so a bottom-left overlay never collides with
 *                    it and the map has room to spare.
 *
 *   variant="inline" Mobile / PWA. Renders in normal flow inside the legend
 *                    sheet, between the scrolling body and the profile bar.
 *                    This variant exists because on phones the profile bar is
 *                    pinned to the bottom of the viewport and spans the full
 *                    width — a viewport-pinned overlay sat directly on top of it
 *                    at a higher z-index and swallowed every tap on the
 *                    Standard / Accessible / Night Safety / Fastest buttons.
 *                    Being in flow makes that overlap structurally impossible.
 *
 * Exactly one variant is mounted at a time (see useMediaQuery in the callers) so
 * assistive tech never encounters the notice twice.
 */
export default function SafetyNotice({ variant = "inline" }) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  const isMap = variant === "map";

  return (
    <div className={`safety-notice safety-notice--${variant}`}>
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

        {!isMap && (
          <span className="safety-notice-hint">
            {open ? "Hide" : "Estimates, not verified conditions"}
          </span>
        )}

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
        <p className="safety-notice-lead">
          Your route isn&apos;t just the shortest path. It weighs live weather, road
          lighting, surface conditions and community hazard reports, then picks the
          route that best fits the profile you chose.
        </p>

        <ul className="safety-notice-list">
          <li>
            <strong>Weather-aware</strong> — rain, fog and poor light change which
            route wins.
          </li>
          <li>
            <strong>Lighting &amp; surface aware</strong> — dark, unpaved and steep
            edges cost more, so safer ones are preferred.
          </li>
          <li>
            <strong>Hazard-aware</strong> — active community reports are routed
            around automatically.
          </li>
          <li>
            <strong>Purpose-built profiles</strong> — Accessible, Night Safety and
            Fastest each optimise for something different.
          </li>
        </ul>

        <p className="safety-notice-note">
          Map data can lag what&apos;s actually on the ground. Spotted a hazard?
          Report it and the next route will go around it.
        </p>

        <p className="safety-notice-foot">
          In an emergency, contact campus security or local emergency services.
        </p>
      </div>
    </div>
  );
}
