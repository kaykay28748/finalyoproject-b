import { useEffect, useLayoutEffect, useRef, useState } from "react";
import "./MapCoachmarkTour.css";

const STEPS = [
  {
    target: "categories",
    placement: "below",
    title: "Explore places by category",
    description: "Choose a category to show matching places on the map. Use More to see every category.",
  },
  {
    target: "map-controls",
    placement: "right",
    title: "Your map controls",
    description: "Recenter the map and change its view here. Tap More to reveal extra tools, including the heatmap and report action.",
  },
];

const clamp = (value, min, max) => Math.max(min, Math.min(value, max));

export default function MapCoachmarkTour({ onClose }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [anchorRect, setAnchorRect] = useState(null);
  const [cardPosition, setCardPosition] = useState(null);
  const cardRef = useRef(null);
  const nextButtonRef = useRef(null);
  const step = STEPS[stepIndex];
  const isLastStep = stepIndex === STEPS.length - 1;

  useLayoutEffect(() => {
    let targetElement = null;
    let targetResizeObserver = null;
    const selector = `[data-map-tour-target="${step.target}"]`;

    const updateAnchor = () => {
      const nextTarget = document.querySelector(selector);
      if (!nextTarget || nextTarget.getClientRects().length === 0) return false;

      if (targetElement !== nextTarget) {
        targetResizeObserver?.disconnect();
        targetElement = nextTarget;
        targetResizeObserver = new ResizeObserver(updateAnchor);
        targetResizeObserver.observe(targetElement);
      }

      const rect = targetElement.getBoundingClientRect();
      setAnchorRect({
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      });
      return true;
    };

    const mutationObserver = new MutationObserver(() => {
      if (updateAnchor()) mutationObserver.disconnect();
    });
    mutationObserver.observe(document.body, { childList: true, subtree: true });
    if (updateAnchor()) mutationObserver.disconnect();
    window.addEventListener("resize", updateAnchor);
    window.addEventListener("scroll", updateAnchor, true);

    return () => {
      mutationObserver.disconnect();
      targetResizeObserver?.disconnect();
      window.removeEventListener("resize", updateAnchor);
      window.removeEventListener("scroll", updateAnchor, true);
    };
  }, [step.target]);

  useLayoutEffect(() => {
    if (!anchorRect || !cardRef.current) return;

    const card = cardRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const padding = 16;
    let left;
    let top;

    if (step.placement === "below") {
      left = clamp(anchorRect.left, padding, viewportWidth - card.width - padding);
      top = anchorRect.bottom + 14;
      if (top + card.height > viewportHeight - padding) {
        top = anchorRect.top - card.height - 14;
      }
    } else {
      left = anchorRect.right + 14;
      if (left + card.width > viewportWidth - padding) {
        left = anchorRect.left - card.width - 14;
      }
      top = clamp(
        anchorRect.top + anchorRect.height / 2 - card.height / 2,
        padding,
        viewportHeight - card.height - padding,
      );
    }

    setCardPosition({
      left: clamp(left, padding, viewportWidth - card.width - padding),
      top: clamp(top, padding, viewportHeight - card.height - padding),
    });
  }, [anchorRect, step.placement]);

  useEffect(() => {
    nextButtonRef.current?.focus();
  }, [stepIndex, cardPosition]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = cardRef.current?.querySelectorAll("button:not([disabled])");
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
    if (isLastStep) onClose();
    else setStepIndex((current) => current + 1);
  };

  if (!anchorRect) return null;

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const shades = [
    { top: 0, left: 0, width: viewportWidth, height: anchorRect.top },
    { top: anchorRect.bottom, left: 0, width: viewportWidth, height: viewportHeight - anchorRect.bottom },
    { top: anchorRect.top, left: 0, width: anchorRect.left, height: anchorRect.height },
    { top: anchorRect.top, left: anchorRect.right, width: viewportWidth - anchorRect.right, height: anchorRect.height },
  ];

  return (
    <div className="map-coachmark-layer">
      {shades.map((shade, index) => (
        <div
          key={index}
          className="map-coachmark-shade"
          aria-hidden="true"
          style={shade}
        />
      ))}
      <div
        className="map-coachmark-spotlight"
        aria-hidden="true"
        style={{
          top: anchorRect.top,
          left: anchorRect.left,
          width: anchorRect.width,
          height: anchorRect.height,
        }}
      />
      <section
        ref={cardRef}
        className={`map-coachmark-card map-coachmark-card--${step.placement} ${step.target === "map-controls" ? "map-coachmark-card--controls" : ""}`}
        style={cardPosition ? { ...cardPosition, visibility: "visible" } : undefined}
        role="dialog"
        aria-modal="true"
        aria-labelledby="map-coachmark-title"
        aria-describedby="map-coachmark-description"
      >
        <header className="map-coachmark-header">
          <span>Map basics</span>
          <span>0{stepIndex + 1} / 0{STEPS.length}</span>
        </header>
        <h2 id="map-coachmark-title">{step.title}</h2>
        <p id="map-coachmark-description">{step.description}</p>
        <footer className="map-coachmark-actions">
          <button type="button" className="map-coachmark-skip" onClick={onClose}>Skip tour</button>
          <button ref={nextButtonRef} type="button" className="map-coachmark-next" onClick={handleContinue}>
            {isLastStep ? "Done" : "Next"}
          </button>
        </footer>
      </section>
    </div>
  );
}