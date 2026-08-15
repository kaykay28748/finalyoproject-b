// services/soundCue.js
// Subtle Web Audio chimes for speech-to-text start / stop / error feedback.
// Uses a lazily-initialized AudioContext (resumed on the triggering user gesture).

let ctx = null;

function getContext() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") {
      ctx.resume();
    }
    return ctx;
  } catch {
    return null;
  }
}

function tone({
  frequency,
  start = 0,
  duration = 0.12,
  type = "sine",
  volume = 0.07,
}) {
  const context = getContext();
  if (!context) return;
  try {
    const osc = context.createOscillator();
    const gain = context.createGain();
    const t0 = context.currentTime + start;
    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(volume, t0 + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain);
    gain.connect(context.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  } catch {
    // audio is best-effort — never break the feature because of a chime
  }
}

export function playMicStart() {
  tone({ frequency: 660, start: 0, duration: 0.1 });
  tone({ frequency: 880, start: 0.09, duration: 0.14 });
}

export function playMicStop() {
  tone({ frequency: 880, start: 0, duration: 0.1 });
  tone({ frequency: 660, start: 0.09, duration: 0.13 });
}

export function playMicError() {
  tone({ frequency: 330, start: 0, duration: 0.2, type: "triangle", volume: 0.06 });
}
