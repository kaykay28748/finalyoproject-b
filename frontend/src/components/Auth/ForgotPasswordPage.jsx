// frontend/src/components/Auth/ForgotPasswordPage.jsx
import { useState } from "react";
import { useHaptics } from "../../hooks/useHaptics";
import { API_URL } from "../../config";
import "./AuthPage.css";

export default function ForgotPasswordPage({ onBackToLogin }) {
  const { trigger } = useHaptics();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [isEmailLocked, setIsEmailLocked] = useState(false);
  const [showEditButton, setShowEditButton] = useState(false);

  const handleSendReset = async (isResend = false) => {
    const endpoint = isResend ? `${API_URL}/auth/resend` : `${API_URL}/auth/forgot-password`;
    
    if (isResend) {
      setIsResending(true);
    } else {
      setIsLoading(true);
    }
    
    setError("");
    
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(true);
        setIsEmailLocked(true);
        setShowEditButton(true);
      } else {
        setError(data.error || "Something went wrong. Please try again.");
      }
    } catch (err) {
      console.error("[ForgotPassword] Error:", err);
      setError("Network error. Please try again.");
    } finally {
      if (isResend) {
        setIsResending(false);
      } else {
        setIsLoading(false);
      }
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    handleSendReset(false);
  };

  const handleResend = () => {
    handleSendReset(true);
  };

  const handleEditEmail = () => {
    setIsEmailLocked(false);
    setSuccess(false);
    setShowEditButton(false);
    setError("");
  };

  return (
    <div className="auth-container-split">
      <div className="auth-hero">
        <div className="auth-hero-bg">UG</div>
        <img src="/icon-512.png" alt="UG Navigator" width={80} height={80} fetchpriority="high" />
        <h1>
          Forgot
          <br />
          Password?
        </h1>
        <p>Don't worry — we'll send you a link to reset it.</p>
      </div>

      <div className="auth-form-panel">
        <div className="auth-form-header">
          <h2>Reset your password</h2>
          <p>Enter your email address and we'll send you a reset link</p>
        </div>

        <form onSubmit={handleSubmit}>
          {error && (
            <div className="auth-error-split" role="alert">
              <span className="error-message">{error}</span>
            </div>
          )}

          {success && (
            <div className="auth-success-split" role="alert">
              <span className="success-icon">✓</span>
              <div className="success-content">
                <span className="success-message">
                  Password reset email sent!
                </span>
                <span className="success-detail">
                  Check your inbox (and spam folder) for the reset link.
                </span>
              </div>
            </div>
          )}

          <div className="form-group-split">
            <input
              id="email"
              type="email"
              placeholder=" "
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading || isResending || isEmailLocked}
              required
              autoComplete="email"
            />
            <label htmlFor="email">Email address</label>
          </div>

          {!isEmailLocked ? (
            <button
              type="submit"
              className="auth-button-split"
              disabled={isLoading || isResending || success}
              onClick={() => trigger([15, 20, 15])}
            >
              {isLoading ? (
                <>
                  <span className="button-spinner-split" />
                  Sending...
                </>
              ) : (
                "Send reset link →"
              )}
            </button>
          ) : (
            <div className="forgot-password-actions">
              {showEditButton && (
                <button
                  type="button"
                  className="auth-secondary-split"
                  onClick={() => { trigger(10); handleEditEmail(); }}
                  style={{ marginBottom: '12px' }}
                >
                  Edit Email
                </button>
              )}
              <button
                type="button"
                className="auth-button-split"
                onClick={() => { trigger(10); handleResend(); }}
                disabled={isResending}
              >
                {isResending ? (
                  <>
                    <span className="button-spinner-split" />
                    Resending...
                  </>
                ) : (
                  "Resend Email →"
                )}
              </button>
            </div>
          )}
        </form>

        <button
          type="button"
          className="auth-secondary-split"
          onClick={() => { trigger(10); onBackToLogin(); }}
          disabled={isLoading || isResending}
        >
          ← Back to login
        </button>
      </div>
    </div>
  );
}