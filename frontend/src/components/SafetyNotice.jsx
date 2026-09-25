import { useState } from 'react';
import './SafetyNotice.css';

/**
 * Persistent, always-available safety notice.
 *
 * Deliberately not legal boilerplate. It states the three things that are true
 * regardless of network state or data freshness, and it stays in the app shell
 * so it is present offline (the service worker bypasses all /api traffic, so a
 * server-pushed notice would never reach an offline user).
 */
export default function SafetyNotice() {
  const [open, setOpen] = useState(false);

  return (
    <div className="safety-notice">
      <button
        type="button"
        className="safety-notice-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        Safety guidance
      </button>

      {open && (
        <div className="safety-notice-body">
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
      )}
    </div>
  );
}
