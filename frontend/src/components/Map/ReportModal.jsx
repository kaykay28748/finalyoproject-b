// frontend/src/components/Map/ReportModal.jsx
// Accessibility report dialog — smooth animations, dark-mode polished

import { useState, useEffect, useRef } from 'react';
import { useHaptics } from '../../hooks/useHaptics';
import { submitReport } from '../../services/reportService';
import './ReportModal.css';

const ISSUE_ICONS = {
  blocked_ramp: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  ),
  missing_curb: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <path d="M12 3v6H3"/>
    </svg>
  ),
  broken_surface: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12l3-3 3 6 3-9 3 6 3-3 3 3"/>
      <line x1="12" y1="3" x2="12" y2="21"/>
    </svg>
  ),
  poor_lighting: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18h6M10 22h4M15.09 15c.18-.36.54-.72.85-1.07 1.07-1.18 1.48-2.75 1.06-4.24-.52-1.85-2.16-3.19-4.07-3.19-1.91 0-3.55 1.34-4.07 3.19-.42 1.49-.01 3.06 1.06 4.24.31.35.67.71.85 1.07"/>
    </svg>
  ),
  construction: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L7 20M12 2l5 18M12 2v18"/>
      <line x1="5" y1="20" x2="19" y2="20"/>
    </svg>
  ),
  other: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <path d="M14 2v6h6"/>
      <line x1="8" y1="13" x2="16" y2="13"/>
      <line x1="8" y1="17" x2="12" y2="17"/>
    </svg>
  ),
};

const ISSUE_TYPES = [
  { value: 'blocked_ramp',    label: 'Blocked ramp',            icon: 'blocked_ramp' },
  { value: 'missing_curb',    label: 'Missing curb cut',        icon: 'missing_curb' },
  { value: 'broken_surface',  label: 'Broken / uneven surface', icon: 'broken_surface' },
  { value: 'poor_lighting',   label: 'Poor lighting',           icon: 'poor_lighting' },
  { value: 'construction',    label: 'Construction / closed',   icon: 'construction' },
  { value: 'other',           label: 'Other issue',             icon: 'other' },
];

const SEVERITY_OPTIONS = [
  { value: 1, label: 'Mild',     description: 'Annoying but passable',   color: '#22c55e' },
  { value: 2, label: 'Moderate', description: 'Difficult to navigate',   color: '#f59e0b' },
  { value: 3, label: 'Severe',   description: 'Impassable / dangerous',  color: '#ef4444' },
];

export default function ReportModal({ isOpen, onClose, onSubmit, defaultLocation }) {
  const { trigger } = useHaptics();
  const [selectedIssue, setSelectedIssue]     = useState('blocked_ramp');
  const [customDescription, setCustomDescription] = useState('');
  const [severity, setSeverity]               = useState(2);
  const [location, setLocation]               = useState(defaultLocation);
  const [locationName, setLocationName]       = useState('');
  const [isSubmitting, setIsSubmitting]       = useState(false);
  const [error, setError]                     = useState('');
  const [success, setSuccess]                 = useState(false);

  // Controls whether the DOM node is mounted (for exit animation)
  const [mounted, setMounted]   = useState(false);
  // Controls the CSS visible class (drives the actual transition)
  const [visible, setVisible]   = useState(false);

  const firstFocusRef = useRef(null);
  const overlayRef    = useRef(null);

  // --- Open / close lifecycle ---
  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      // One rAF delay lets the browser paint the initial hidden state before
      // we flip visible=true, guaranteeing the enter transition fires.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
    } else {
      setVisible(false);
      // Wait for the CSS transition to finish before unmounting
      const t = setTimeout(() => setMounted(false), 350);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  // Auto-focus the first interactive element when modal opens
  useEffect(() => {
    if (visible && firstFocusRef.current) {
      firstFocusRef.current.focus();
    }
  }, [visible]);

  // Trap focus inside modal
  useEffect(() => {
    if (!visible) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') { handleClose(); return; }
      if (e.key !== 'Tab') return;

      const modal = overlayRef.current?.querySelector('.report-modal');
      if (!modal) return;
      const focusable = modal.querySelectorAll(
        'button:not([disabled]), textarea, [tabindex]:not([tabindex="-1"])'
      );
      const first = focusable[0];
      const last  = focusable[focusable.length - 1];

      if (e.shiftKey ? document.activeElement === first : document.activeElement === last) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [visible]);

  // Sync location prop changes
  useEffect(() => {
    if (defaultLocation) {
      setLocation(defaultLocation);
      if (defaultLocation.lat && defaultLocation.lng) {
        fetchLocationName(defaultLocation.lat, defaultLocation.lng);
      }
    }
  }, [defaultLocation]);

  const fetchLocationName = async (lat, lng) => {
    try {
      const res  = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`
      );
      const data = await res.json();
      if (data.display_name) {
        setLocationName(data.display_name.split(',').slice(0, 2).join(', '));
      }
    } catch (err) {
      console.warn('[ReportModal] Reverse geocode failed:', err);
    }
  };

  const resetForm = () => {
    setSelectedIssue('blocked_ramp');
    setCustomDescription('');
    setSeverity(2);
    setError('');
    setSuccess(false);
    setIsSubmitting(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    if (!location?.lat || !location?.lng) {
      setError('Location is required. Please try again.');
      setIsSubmitting(false);
      return;
    }

    if (selectedIssue === 'other' && !customDescription.trim()) {
      setError('Please describe the issue.');
      setIsSubmitting(false);
      return;
    }

    try {
      await submitReport({
        lat:                location.lat,
        lng:                location.lng,
        location_name:      locationName,
        issue_type:         selectedIssue,
        custom_description: selectedIssue === 'other' ? customDescription : undefined,
        severity,
      });
      setSuccess(true);
    } catch (err) {
      console.error('[ReportModal] Submit error:', err);
      setError(err.message || 'Failed to submit report. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!mounted) return null;

  return (
    <div
      ref={overlayRef}
      className={`report-modal-overlay ${visible ? 'report-modal-overlay--visible' : ''}`}
      onClick={() => { trigger(10); handleClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Report accessibility issue"
    >
      <div
        className={`report-modal ${visible ? 'report-modal--visible' : ''} ${success ? 'report-modal--success' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="report-modal-header">
          <h2>Report accessibility issue</h2>
          {!success && (
            <button
              className="report-modal-close"
              onClick={() => { trigger(10); handleClose(); }}
              aria-label="Close dialog"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
          )}
        </div>

        {/* ── Success state ── */}
        {success ? (
          <div className="report-success-popup" role="status">
            <div className="success-icon-wrap">
              <svg className="success-check" viewBox="0 0 52 52" fill="none">
                <circle className="success-check__circle" cx="26" cy="26" r="24" stroke="#22c55e" strokeWidth="3"/>
                <path  className="success-check__path"   d="M14 27l9 9 15-18" stroke="#22c55e" strokeWidth="3"
                       strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h3>Report submitted</h3>
            <p>Thanks for helping improve campus accessibility.</p>
            <p className="success-note">Admins will review this before it affects routes.</p>
            <button className="success-close-btn" onClick={() => { trigger(10); handleClose(); }} autoFocus>
              Done
            </button>
          </div>
        ) : (
          /* ── Form ── */
          <form onSubmit={handleSubmit} noValidate>
            {/* Location strip */}
            <div className="report-location-preview">
              <span className="report-location-pin" aria-hidden="true">
                <svg width="18" height="22" viewBox="0 0 18 22" fill="none">
                  <path d="M9 0C4.03 0 0 4.03 0 9c0 6.75 9 13 9 13s9-6.25 9-13c0-4.97-4.03-9-9-9z"
                        fill="#2563eb"/>
                  <circle cx="9" cy="9" r="3" fill="white"/>
                </svg>
              </span>
              <div className="report-location-info">
                <span className="report-location-label">Pinned location</span>
                <span className="report-location-coords">
                  {location
                    ? `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`
                    : 'Tap map to set location'}
                </span>
                {locationName && (
                  <span className="report-location-name">{locationName}</span>
                )}
              </div>
            </div>

            {/* Issue type */}
            <div className="report-form-group report-form-group--stagger-1">
              <label className="report-label">What's the problem?</label>
              <div className="report-issue-grid" role="group" aria-label="Issue type">
                {ISSUE_TYPES.map((issue, i) => (
                  <button
                    key={issue.value}
                    type="button"
                    className={`report-issue-btn ${selectedIssue === issue.value ? 'active' : ''}`}
                    onClick={() => { trigger(8); setSelectedIssue(issue.value); }}
                    aria-pressed={selectedIssue === issue.value}
                    ref={i === 0 ? firstFocusRef : undefined}
                  >
                    <span className="report-issue-icon" aria-hidden="true">{ISSUE_ICONS[issue.icon]()}</span>
                    <span className="report-issue-label">{issue.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Custom description (only for "other") */}
            {selectedIssue === 'other' && (
              <div className="report-form-group report-form-group--expand">
                <label className="report-label" htmlFor="report-description">
                  Describe the issue
                </label>
                <textarea
                  id="report-description"
                  className="report-textarea"
                  rows={3}
                  placeholder="Where exactly? What makes it hazardous?"
                  value={customDescription}
                  onChange={(e) => setCustomDescription(e.target.value)}
                />
              </div>
            )}

            {/* Severity */}
            <div className="report-form-group report-form-group--stagger-2">
              <label className="report-label">How severe?</label>
              <div className="report-severity-grid" role="group" aria-label="Severity">
                {SEVERITY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`report-severity-btn ${severity === opt.value ? 'active' : ''}`}
                    onClick={() => { trigger(8); setSeverity(opt.value); }}
                    aria-pressed={severity === opt.value}
                  >
                    <span
                      className="report-severity-dot"
                      style={{ background: opt.color }}
                      aria-hidden="true"
                    />
                    <span className="report-severity-info">
                      <span className="report-severity-label">{opt.label}</span>
                      <span className="report-severity-desc">{opt.description}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="report-error" role="alert">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <circle cx="7" cy="7" r="6.5" stroke="currentColor"/>
                  <path d="M7 4v3.5M7 9.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="report-actions">
              <button
                type="button"
                className="report-btn report-btn-secondary"
                onClick={() => { trigger(10); handleClose(); }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={`report-btn report-btn-primary ${isSubmitting ? 'report-btn--loading' : ''}`}
                disabled={isSubmitting}
                onClick={() => trigger([20, 30, 20])}
              >
                {isSubmitting ? (
                  <>
                    <span className="btn-spinner" aria-hidden="true" />
                    Submitting…
                  </>
                ) : (
                  'Submit report'
                )}
              </button>
            </div>
          </form>
        )}

        <p className="report-note" aria-live="polite">
          Reports are manually verified by admins before affecting route calculations.
        </p>
      </div>
    </div>
  );
}