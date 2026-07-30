import { useState, useRef, useCallback } from "react";

export default function useSpeechRecognition() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const recognitionRef = useRef(null);

  const startListening = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("[useSpeechRecognition] not supported");
      return;
    }

    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch (_) {}
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      setTranscript(event.results[0][0].transcript);
      setIsListening(false);
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
    setTranscript("");
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch (_) {}
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, []);

  return { isListening, transcript, startListening, stopListening };
}
