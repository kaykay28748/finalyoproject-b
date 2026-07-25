// hooks/useVoiceGuidance.js
// Text-to-speech for accessibility — turn queue, reroute support, toggle feedback

import { useState, useCallback, useRef, useEffect } from 'react';

export function useVoiceGuidance() {
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(() => {
    const saved = localStorage.getItem('voiceGuidanceEnabled');
    return saved === 'true';
  });

  const synthesisRef       = useRef(null);
  const queueRef           = useRef([]);
  const isSpeakingRef      = useRef(false);
  const currentUtteranceRef = useRef(null);
  // Keep a ref in sync with state so callbacks that close over it stay fresh
  const isVoiceEnabledRef  = useRef(isVoiceEnabled);

  useEffect(() => {
    isVoiceEnabledRef.current = isVoiceEnabled;
  }, [isVoiceEnabled]);

  // Initialise speech synthesis once with proper cleanup
  useEffect(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      synthesisRef.current = window.speechSynthesis;
    }
    
    return () => {
      // Cancel any pending speech when component unmounts
      if (synthesisRef.current) {
        synthesisRef.current.cancel();
      }
      // Reset queue and speaking state
      queueRef.current = [];
      isSpeakingRef.current = false;
      currentUtteranceRef.current = null;
    };
  }, []);

  // Persist preference
  useEffect(() => {
    localStorage.setItem('voiceGuidanceEnabled', isVoiceEnabled);
  }, [isVoiceEnabled]);

  // Reset voice state (useful for navigation/refresh edge cases)
  const resetVoice = useCallback(() => {
    if (synthesisRef.current) {
      synthesisRef.current.cancel();
    }
    queueRef.current = [];
    isSpeakingRef.current = false;
    currentUtteranceRef.current = null;
  }, []);

  // ── Queue processor ───────────────────────────────────────────────────────
  // Uses isVoiceEnabledRef so the onend callback never reads a stale closure.
  const processQueue = useCallback(() => {
    if (!isVoiceEnabledRef.current) return;
    if (isSpeakingRef.current) return;
    if (queueRef.current.length === 0) return;

    const nextText = queueRef.current.shift();
    if (!nextText) return;

    isSpeakingRef.current = true;

    const utterance = new SpeechSynthesisUtterance(nextText);
    utterance.rate   = 0.95;
    utterance.pitch  = 1;
    utterance.volume = 1;

    utterance.onend = () => {
      isSpeakingRef.current     = false;
      currentUtteranceRef.current = null;
      // 500ms breathing room between announcements prevents overlap
      setTimeout(() => processQueue(), 500);
    };

    utterance.onerror = () => {
      isSpeakingRef.current     = false;
      currentUtteranceRef.current = null;
      setTimeout(() => processQueue(), 500);
    };

    currentUtteranceRef.current = utterance;
    synthesisRef.current.speak(utterance);
  }, []); // intentionally no deps — reads refs directly

  // ── speak ─────────────────────────────────────────────────────────────────
  const speak = useCallback((text, options = {}) => {
    if (!isVoiceEnabledRef.current) return;
    if (!text) return;

    const { priority = 'normal' } = options;

    if (priority === 'immediate') {
      // Flush queue and interrupt current speech
      queueRef.current = [];
      synthesisRef.current?.cancel();
      isSpeakingRef.current = false;
      queueRef.current.push(text);
      processQueue();
    } else {
      queueRef.current.push(text);
      processQueue();
    }
  }, [processQueue]);

  // ── Toggle with audio feedback ────────────────────────────────────────────
  const toggleVoice = useCallback(() => {
    setIsVoiceEnabled(prev => {
      const next = !prev;
      isVoiceEnabledRef.current = next;

      if (next) {
        // Voice just turned ON — speak confirmation immediately
        queueRef.current = [];
        synthesisRef.current?.cancel();
        isSpeakingRef.current = false;

        const utterance = new SpeechSynthesisUtterance('Voice guidance on.');
        utterance.rate   = 0.95;
        utterance.pitch  = 1;
        utterance.volume = 1;
        utterance.onend = () => {
          isSpeakingRef.current     = false;
          currentUtteranceRef.current = null;
        };
        utterance.onerror = () => {
          isSpeakingRef.current     = false;
          currentUtteranceRef.current = null;
        };
        currentUtteranceRef.current = utterance;
        isSpeakingRef.current = true;
        synthesisRef.current?.speak(utterance);
      } else {
        // Voice turning OFF — cancel everything and go silent immediately.
        // No farewell speech. The user asked for silence, we give silence.
        queueRef.current = [];
        synthesisRef.current?.cancel();
        isSpeakingRef.current = false;
        currentUtteranceRef.current = null;
      }

      return next;
    });
  }, []);

  // ── speakTurn ─────────────────────────────────────────────────────────────
  const speakTurn = useCallback((instruction, distance, urgency = 'normal') => {
    if (!isVoiceEnabledRef.current) return;

    let message;
    if (distance <= 0 || distance < 30) {
      message = `Now, ${instruction.toLowerCase()}.`;
    } else if (distance <= 50) {
      message = `Now, ${instruction.toLowerCase()}.`;
    } else if (distance <= 100) {
      message = `In about 100 meters, ${instruction.toLowerCase()}.`;
    } else if (distance <= 200) {
      message = `In 200 meters, ${instruction.toLowerCase()}.`;
    } else if (distance < 1000) {
      message = `In about ${Math.round(distance / 10) * 10} meters, ${instruction.toLowerCase()}.`;
    } else {
      message = `In ${(distance / 1000).toFixed(1)} kilometers, ${instruction.toLowerCase()}.`;
    }

    const priority = distance <= 50 ? 'immediate' : 'normal';
    speak(message, { priority });
  }, [speak]);

  // ── speakArrival ──────────────────────────────────────────────────────────
  const speakArrival = useCallback(() => {
    if (!isVoiceEnabledRef.current) return;
    speak('You have arrived at your destination.', { priority: 'immediate' });
  }, [speak]);

  // ── speakRouteSummary ─────────────────────────────────────────────────────
  const speakRouteSummary = useCallback((distance, time, isReroute = false) => {
    if (!isVoiceEnabledRef.current) return;
    const prefix = isReroute ? 'Rerouting. ' : '';
    speak(`${prefix}Route calculated. ${distance}, about ${time}.`, { priority: 'normal' });
  }, [speak]);

  // ── speakDeviation ────────────────────────────────────────────────────────
  const speakDeviation = useCallback(() => {
    if (!isVoiceEnabledRef.current) return;
    speak('You have deviated from the route. Recalculating...', { priority: 'immediate' });
  }, [speak]);

  // ── speakRerouteComplete ──────────────────────────────────────────────────
  const speakRerouteComplete = useCallback((distance, time) => {
    if (!isVoiceEnabledRef.current) return;
    speak(`Route updated. ${distance}, about ${time}.`, { priority: 'normal' });
  }, [speak]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const formatDistanceForVoice = useCallback((meters) => {
    if (meters < 1000) return `${Math.round(meters)} meters`;
    return `${(meters / 1000).toFixed(1)} kilometers`;
  }, []);

  const formatTravelTimeForVoice = useCallback((meters, vehicleMode) => {
    const speedKmh = vehicleMode === 'car' ? 30 : vehicleMode === 'motorcycle' ? 25 : 5;
    const minutes  = Math.ceil(meters / (speedKmh * 1000 / 60));
    if (minutes < 1)  return 'less than 1 minute';
    if (minutes < 60) return `${minutes} minutes`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m === 0 ? `${h} hour` : `${h} hour ${m} minutes`;
  }, []);

  return {
    isVoiceEnabled,
    toggleVoice,
    speak,
    speakTurn,
    speakArrival,
    speakRouteSummary,
    speakDeviation,
    speakRerouteComplete,
    formatDistanceForVoice,
    formatTravelTimeForVoice,
    resetVoice,  // Expose reset function for navigation edge cases
  };
}