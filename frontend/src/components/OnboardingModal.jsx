import { useEffect, useRef, useState } from "react";
import "./OnboardingModal.css";

const STEPS = [
  {
    title: "Find your destination",
    description: "Search for a campus landmark or choose a place from the map. Use your current location as the start, or set one yourself.",
  },
  {
    title: "Choose how you travel",
    description: "Compare routes, then choose Standard, Accessible, Fastest, or Night Safety to suit your trip.",
  },
  {
    title: "Follow the route with context",
    description: "Use turn-by-turn directions and optional voice guidance. Route details can also show weather and reported hazards.",
  },
];

export default function OnboardingModal({ onClose, onFinish = onClose }) {
  const [stepIndex, setStepIndex] = useState(0);
  const dialogRef = useRef(null);
  const nextButtonRef = useRef(null);
  const step = STEPS[stepIndex];
  const isLastStep = stepIndex === STEPS.length - 1;

  useEffect(() => {
    nextButtonRef.current?.focus();
  }, [stepIndex]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = dialogRef.current?.querySelectorAll("button:not([disabled])");
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleContinue = () => {
    if (isLastStep) onFinish();
    else setStepIndex((current) => current + 1);
  };

  return (
    <div className="onboarding-overlay" onClick={onClose}>
      <section
        ref={dialogRef}
        className="onboarding-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        aria-describedby="onboarding-description"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="onboarding-header">
          <span className="onboarding-eyebrow">Getting started</span>
          <button type="button" className="onboarding-skip" onClick={onClose}>Skip</button>
        </header>

        <div className="onboarding-progress" aria-label={`Step ${stepIndex + 1} of ${STEPS.length}`}>
          {STEPS.map((item, index) => (
            <span key={item.title} className={index <= stepIndex ? "is-current" : ""} />
          ))}
        </div>

        <div className="onboarding-step" aria-live="polite">
          <span className="onboarding-step-number">0{stepIndex + 1}</span>
          <h1 id="onboarding-title">{step.title}</h1>
          <p id="onboarding-description">{step.description}</p>
        </div>

        {isLastStep && (
          <p className="onboarding-guide-hint">You can reopen the full guide later from Profile → Support &amp; Feedback.</p>
        )}

        <footer className="onboarding-actions">
          {stepIndex > 0 && (
            <button type="button" className="onboarding-back" onClick={() => setStepIndex((current) => current - 1)}>
              Back
            </button>
          )}
          <button ref={nextButtonRef} type="button" className="onboarding-primary" onClick={handleContinue}>
            {isLastStep ? "Start exploring" : "Next"}
          </button>
        </footer>
      </section>
    </div>
  );
}