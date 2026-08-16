import { useState, useRef, useCallback, useEffect } from "react";
import { playMicStart, playMicStop, playMicError } from "../services/soundCue";

const ERROR_MESSAGES = {
  unsupported:
    "Voice input isn't supported in this browser. Try Chrome, Edge, or Safari.",
  "not-allowed":
    "Microphone access was denied. Allow it in your browser settings, then try again.",
  "no-speech": "No speech was detected. Please try again.",
  "audio-capture": "No microphone was found. Connect one and try again.",
  network: "Network trouble stopped voice input. Check your connection and try again.",
  "service-not-allowed": "Voice service is unavailable in this browser.",
  aborted: "",
};

const DEFAULT_LANG = "en-US";
const SILENCE_TIMEOUT_MS = 12000;

export const isStandalonePwa = () => {
  if (typeof window === "undefined") return false;
  return (
    window.navigator.standalone === true ||
    !!window.matchMedia?.("(display-mode: standalone)").matches
  );
};

// Pre-grant microphone access before starting recognition. Installed PWAs
// often don't show SpeechRecognition's own permission prompt, so we request it
// explicitly via getUserMedia and surface a clear error if it's denied.
const warmMicPermission = async () => {
  if (!navigator.mediaDevices?.getUserMedia) return { ok: true };
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    return { ok: true };
  } catch (err) {
    const name = err && err.name;
    if (name === "NotAllowedError" || name === "PermissionDeniedError") {
      return { ok: false, code: "not-allowed" };
    }
    if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      return { ok: false, code: "audio-capture" };
    }
    return { ok: true };
  }
};

export default function useSpeechRecognition({ lang = DEFAULT_LANG } = {}) {
  const supported =
    typeof window !== "undefined" &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [error, setError] = useState(null);

  const recognitionRef = useRef(null);
  const silenceRef = useRef(null);
  const sessionRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const cleanup = useCallback(() => {
    sessionRef.current += 1;
    if (silenceRef.current) {
      clearTimeout(silenceRef.current);
      silenceRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch { /* ignore */ }
      recognitionRef.current = null;
    }
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const stopListening = useCallback(() => {
    sessionRef.current += 1;
    if (silenceRef.current) {
      clearTimeout(silenceRef.current);
      silenceRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch { /* ignore */ }
      recognitionRef.current = null;
    }
    playMicStop();
    if (mountedRef.current) {
      setIsListening(false);
      setInterimTranscript("");
    }
  }, []);

  const startListening = useCallback(async () => {
    if (!supported) {
      setError({ code: "unsupported", message: ERROR_MESSAGES.unsupported });
      playMicError();
      return;
    }

    cleanup();
    // Capture the session id AFTER cleanup so a stop/close during the async
    // warm-up is detected and we don't start listening in the background.
    const session = sessionRef.current;

    // Installed PWAs need an explicit mic permission grant and a fresh user
    // gesture; without this, recognition can fail silently.
    if (isStandalonePwa()) {
      const permission = await warmMicPermission();
      if (!mountedRef.current || session !== sessionRef.current) return;
      if (!permission.ok) {
        setError({
          code: permission.code,
          message: ERROR_MESSAGES[permission.code] || ERROR_MESSAGES["no-speech"],
        });
        playMicError();
        return;
      }
    }

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.lang = lang;

    let finalTranscript = "";
    let failed = false;

    const isCurrentSession = () => session === sessionRef.current;

    recognition.onresult = (event) => {
      if (!isCurrentSession()) return;

      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const item = event.results[i];
        const text = item[0].transcript;
        if (item.isFinal) finalTranscript += text;
        else interim += text;
      }

      if (mountedRef.current) setInterimTranscript(interim);

      if (finalTranscript) {
        if (mountedRef.current) {
          setTranscript(finalTranscript);
          setInterimTranscript("");
          setIsListening(false);
        }
        try {
          recognition.stop();
        } catch { /* ignore */ }
      }
    };

    recognition.onerror = (event) => {
      if (!isCurrentSession()) return;
      const code = event && event.error ? event.error : "unknown";
      if (code === "aborted") return;
      failed = true;
      const message = ERROR_MESSAGES[code] || ERROR_MESSAGES["no-speech"];
      if (mountedRef.current) {
        if (code !== "no-speech") setIsListening(false);
        setError({ code, message });
        playMicError();
      }
    };

    recognition.onend = () => {
      if (!isCurrentSession()) return;
      if (silenceRef.current) {
        clearTimeout(silenceRef.current);
        silenceRef.current = null;
      }
      if (mountedRef.current) {
        setIsListening(false);
        setInterimTranscript("");
        if (!failed) playMicStop();
      }
    };

    recognitionRef.current = recognition;

    if (mountedRef.current) {
      setError(null);
      setTranscript("");
      setInterimTranscript("");
    }

    try {
      recognition.start();
      if (mountedRef.current) {
        setIsListening(true);
        playMicStart();
      }

      silenceRef.current = setTimeout(() => {
        silenceRef.current = null;
        if (isCurrentSession() && finalTranscript === "") {
          failed = true;
          try {
            recognition.abort();
          } catch { /* ignore */ }
          if (mountedRef.current) {
            setError({ code: "no-speech", message: ERROR_MESSAGES["no-speech"] });
            setIsListening(false);
            playMicError();
          }
        }
      }, SILENCE_TIMEOUT_MS);
    } catch {
      if (mountedRef.current) {
        setError({ code: "start-failed", message: ERROR_MESSAGES["no-speech"] });
        setIsListening(false);
        playMicError();
      }
    }
  }, [supported, lang, cleanup]);

  return {
    supported,
    isListening,
    transcript,
    interimTranscript,
    error,
    startListening,
    stopListening,
    clearError,
  };
}
