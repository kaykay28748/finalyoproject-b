import { useState } from "react";
import { submitRouteFeedback } from "../../services/analyticsLogger";
import "./RouteFeedbackPrompt.css";

export default function RouteFeedbackPrompt({ profile, onDismiss }) {
  const [rating, setRating] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!rating || isSubmitting) return;

    setIsSubmitting(true);
    setError("");
    try {
      await submitRouteFeedback(profile, rating);
      setSubmitted(true);
    } catch (submitError) {
      setError(submitError.message || "Could not submit your rating. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <section className="route-feedback-prompt" aria-live="polite">
        <p className="route-feedback-thanks">Thanks for rating this route.</p>
        <button type="button" className="route-feedback-dismiss" onClick={onDismiss}>Done</button>
      </section>
    );
  }

  return (
    <section className="route-feedback-prompt" aria-labelledby="route-feedback-title">
      <div className="route-feedback-copy">
        <h3 id="route-feedback-title">How was this route?</h3>
        <p>Your rating helps improve directions for everyone.</p>
      </div>
      <form onSubmit={handleSubmit}>
        <div className="route-feedback-stars" role="group" aria-label="Rate this route from 1 to 5 stars">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              className="route-feedback-star"
              aria-label={`${value} out of 5 stars`}
              aria-pressed={rating === value}
              onClick={() => setRating(value)}
            >
              ★
            </button>
          ))}
        </div>
        {error && <p className="route-feedback-error" role="alert">{error}</p>}
        <div className="route-feedback-actions">
          <button type="button" className="route-feedback-dismiss" onClick={onDismiss}>Not now</button>
          <button type="submit" className="route-feedback-submit" disabled={!rating || isSubmitting}>
            {isSubmitting ? "Sending…" : "Send rating"}
          </button>
        </div>
      </form>
    </section>
  );
}