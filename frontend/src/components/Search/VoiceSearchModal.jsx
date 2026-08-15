import { useState, useEffect, useRef, useCallback } from "react";
import useSpeechRecognition from "../../hooks/useSpeechRecognition";
import { IconMic } from "../ui/icon";
import "./VoiceSearchModal.css";

const UNSUPPORTED_MSG =
  "Voice search isn't available here. It needs a secure HTTPS connection and a browser like Chrome, Edge, or Safari.";

function IconClose() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function IconInfo() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

export default function VoiceSearchModal({
  open,
  onClose,
  onUseText,
  accentColor = "#2563eb",
}) {
  const {
    supported,
    isListening,
    transcript,
    interimTranscript,
    error,
    startListening,
    stopListening,
    clearError,
  } = useSpeechRecognition();

  const [draft, setDraft] = useState("");
  const [touched, setTouched] = useState(false);
  const inputRef = useRef(null);

  const isUnsupported = !supported;
  const effectiveError =
    error || (isUnsupported ? { code: "unsupported", message: UNSUPPORTED_MSG } : null);

  // Sync the final transcript into the editable draft as soon as it lands.
  useEffect(() => {
    if (transcript) {
      setDraft(transcript);
      setTouched(false);
    }
  }, [transcript]);

  // Reset state and auto-start each time the modal opens. Opening always
  // happens from a mic tap, so the user-activation gesture is still warm for
  // SpeechRecognition.start(). If the browser still refuses, the idle
  // "tap to speak" state is the fallback.
  useEffect(() => {
    if (!open) return;
    setDraft("");
    setTouched(false);
    clearError();
    if (supported) startListening();
  }, [open, supported, startListening, clearError]);

  const close = useCallback(() => {
    stopListening();
    clearError();
    onClose();
  }, [stopListening, clearError, onClose]);

  // Focus the review input whenever the final-transcript view appears.
  useEffect(() => {
    if (open && transcript && !isListening) {
      inputRef.current?.focus();
    }
  }, [open, transcript, isListening]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!open) return null;

  const handleStop = () => stopListening();

  const handleRetry = () => {
    clearError();
    startListening();
  };

  const handleUse = () => {
    const text = draft.trim();
    if (!text) return;
    stopListening();
    clearError();
    onClose();
    onUseText(text);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleUse();
  };

  const showIdle =
    !isUnsupported && !isListening && !effectiveError && !transcript && !draft;

  return (
    <div className="voice-modal-overlay" onClick={close}>
      <div
        className="voice-modal"
        style={{ "--voice-accent": accentColor }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Voice search"
      >
        <div className="voice-modal-header">
          <span className="voice-modal-title">Voice search</span>
          <button
            className="voice-modal-close"
            onClick={close}
            aria-label="Close voice search"
          >
            <IconClose />
          </button>
        </div>

        <div className="voice-modal-body">
          {effectiveError ? (
            /* ── Error state ── */
            <div className="voice-error" role="alert">
              <div className="voice-error-icon" aria-hidden="true">
                <IconInfo />
              </div>
              <p className="voice-error-msg">{effectiveError.message}</p>
              <div className="voice-error-actions">
                {effectiveError.code !== "unsupported" && (
                  <button className="voice-btn voice-btn-primary" onClick={handleRetry}>
                    Try again
                  </button>
                )}
                <button className="voice-btn voice-btn-ghost" onClick={close}>
                  Close
                </button>
              </div>
            </div>
          ) : isListening ? (
            /* ── Listening state: animated mic + live transcript ── */
            <div className="voice-listen">
              <div className="voice-mic-visual voice-mic-visual--live" aria-hidden="true">
                <IconMic strokeWidth={1.6} />
              </div>
              <p className="voice-listen-title">Listening…</p>
              <p className="voice-listen-hint">Say your destination</p>
              <div className="voice-live-transcript" aria-live="polite">
                {draft && <span className="voice-final">{draft}</span>}
                {interimTranscript && (
                  <span className="voice-interim">{interimTranscript}</span>
                )}
              </div>
              <div className="voice-eq" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>
              <button className="voice-btn voice-btn-stop" onClick={handleStop}>
                Tap to stop
              </button>
            </div>
          ) : showIdle ? (
            /* ── Idle fallback: auto-start didn't engage (activation/permission) ── */
            <div className="voice-listen">
              <button
                className="voice-mic-visual voice-mic-visual--idle"
                onClick={handleRetry}
                aria-label="Tap to speak"
              >
                <IconMic strokeWidth={1.6} />
              </button>
              <p className="voice-listen-title">Tap the mic to speak</p>
              <p className="voice-listen-hint">Say a place, building, or road on campus</p>
            </div>
          ) : (
            /* ── Final transcript: review, correct, then use ── */
            <div className="voice-done">
              <div className="voice-input-wrap">
                <input
                  ref={inputRef}
                  className="voice-input"
                  type="text"
                  value={draft}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    setTouched(true);
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="Destination…"
                  autoFocus
                  enterKeyHint="done"
                  aria-label="Destination from voice"
                />
                <button
                  className="voice-input-mic"
                  onClick={handleRetry}
                  title="Record again"
                  aria-label="Record again"
                >
                  <IconMic strokeWidth={1.8} />
                </button>
              </div>
              <p className="voice-done-hint">
                {touched
                  ? "Edit above, then use this destination"
                  : "Make corrections below, then use this destination"}
              </p>
              <div className="voice-done-actions">
                <button className="voice-btn voice-btn-ghost" onClick={close}>
                  Cancel
                </button>
                <button
                  className="voice-btn voice-btn-primary"
                  onClick={handleUse}
                  disabled={!draft.trim()}
                >
                  Use destination
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
