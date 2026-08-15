import { useState, useRef, useCallback, useEffect } from "react";

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
      } catch (_) {}
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
      } catch (_) {}
      recognitionRef.current = null;
    }
    if (mountedRef.current) {
      setIsListening(false);
      setInterimTranscript("");
    }
  }, []);

  const startListening = useCallback(() => {
    if (!supported) {
      setError({ code: "unsupported", message: ERROR_MESSAGES.unsupported });
      return;
    }

    cleanup();

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    const session = sessionRef.current;

    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.lang = lang;

    let finalTranscript = "";

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
        } catch (_) {}
      }
    };

    recognition.onerror = (event) => {
      if (!isCurrentSession()) return;
      const code = event && event.error ? event.error : "unknown";
      if (code === "aborted") return;
      const message = ERROR_MESSAGES[code] || ERROR_MESSAGES["no-speech"];
      if (mountedRef.current) {
        if (code !== "no-speech") setIsListening(false);
        setError({ code, message });
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
      if (mountedRef.current) setIsListening(true);

      silenceRef.current = setTimeout(() => {
        silenceRef.current = null;
        if (isCurrentSession() && finalTranscript === "") {
          try {
            recognition.abort();
          } catch (_) {}
          if (mountedRef.current) {
            setError({ code: "no-speech", message: ERROR_MESSAGES["no-speech"] });
            setIsListening(false);
          }
        }
      }, SILENCE_TIMEOUT_MS);
    } catch (e) {
      if (mountedRef.current) {
        setError({ code: "start-failed", message: ERROR_MESSAGES["no-speech"] });
        setIsListening(false);
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
