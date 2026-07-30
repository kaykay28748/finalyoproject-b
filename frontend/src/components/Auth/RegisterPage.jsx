// frontend/src/components/Auth/RegisterPage.jsx
import { useState } from "react";
import { useAuthContext } from "../../context/AuthContext";
import { useHaptics } from "../../hooks/useHaptics";
import { supabase } from "../../lib/supabase";
import "./AuthPage.css";

export default function RegisterPage({ onSwitchToLogin }) {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordStrength, setPasswordStrength] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [error, setError] = useState("");
  const [resendMessage, setResendMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [needsEmailConfirmation, setNeedsEmailConfirmation] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState("");

  const { register } = useAuthContext();
  const { trigger } = useHaptics();

  const checkPasswordStrength = (pwd) => {
    let strength = 0;
    if (pwd.length >= 8) strength++;
    if (/[a-z]/.test(pwd)) strength++;
    if (/[A-Z]/.test(pwd)) strength++;
    if (/\d/.test(pwd)) strength++;
    setPasswordStrength(strength);
  };

  const handlePasswordChange = (e) => {
    const pwd = e.target.value;
    setPassword(pwd);
    checkPasswordStrength(pwd);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (passwordStrength < 3) {
      setError(
        "Password is too weak. Include uppercase, lowercase, and numbers."
      );
      return;
    }

    setIsLoading(true);

    try {
      const result = await register(email, username, password);

      if (!result.success) {
        setError(result.error || "Registration failed");
        setIsLoading(false);
      } else {
        if (result.needsEmailConfirmation) {
          setRegisteredEmail(email);
          setNeedsEmailConfirmation(true);
        }
        setSuccess(true);
        setIsLoading(false);
      }
    } catch (err) {
      setError(err.message || "Registration failed");
      setIsLoading(false);
    }
  };

  const handleResendEmail = async () => {
    setIsResending(true);
    setResendMessage("");
    
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: registeredEmail
      });
      
      if (error) {
        setResendMessage(error.message);
      } else {
        setResendMessage("Confirmation email resent! Check your inbox.");
      }
    } catch (err) {
      setResendMessage("Failed to resend. Please try again.");
    } finally {
      setIsResending(false);
    }
  };

  const strengthLabels = ["Weak", "Fair", "Good", "Strong"];
  const strengthColors = ["#ef4444", "#f97316", "#eab308", "#22c55e"];

  const passwordsMatch = password === confirmPassword;
  const isPasswordValid = passwordStrength >= 3 && passwordsMatch;

  // If email confirmation is needed, show different message with resend button
  if (needsEmailConfirmation) {
    return (
      <div className="auth-container-split">
        <div className="auth-hero">
          <div className="auth-hero-bg">TG</div>
          <img src="/icon-512.png" alt="TransitGuide" width={80} height={80} fetchpriority="high" />
          <h1>
            Verify your
            <br />
            email.
          </h1>
          <p>You're almost there!</p>
        </div>

        <div className="auth-form-panel">
          <div className="auth-form-header">
            <h2>Check your inbox</h2>
            <p>We sent a confirmation link to {registeredEmail}</p>
          </div>
          
          <div className="auth-success-split" style={{ marginBottom: '16px' }}>
            <span className="success-icon">📧</span>
            <div className="success-text">
              <strong>Verify your email address</strong>
              <span>Click the link in the email to activate your account.</span>
            </div>
          </div>

          {resendMessage && (
            <div className={`auth-info-split ${resendMessage.includes("Check") ? 'success' : 'error'}`}>
              <span>{resendMessage.includes("Check") ? "✓" : "⚠️"}</span>
              <span>{resendMessage}</span>
            </div>
          )}

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '16px' }}>
            <button
              type="button"
              className="auth-secondary-split"
              onClick={() => { trigger(10); onSwitchToLogin(); }}
              style={{ flex: 1 }}
            >
              Back to Sign in
            </button>
            <button
              type="button"
              className="auth-resend-btn"
              onClick={() => { trigger(10); handleResendEmail(); }}
              disabled={isResending}
              style={{ flex: 1 }}
            >
              {isResending ? 'Sending...' : 'Resend email'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-container-split">
      {/* Left side — Hero */}
      <div className="auth-hero">
        <div className="auth-hero-bg">TG</div>
        <img src="/icon-512.png" alt="TransitGuide" width={80} height={80} fetchpriority="high" />
        <h1>
          Join the
          <br />
          community.
        </h1>
        <p>
          Create an account and start navigating Legon campus with confidence.
        </p>
      </div>

      {/* Right side — Form */}
      <div className="auth-form-panel">
        <div className="auth-form-header">
          <h2>Get started</h2>
          <p>Join TransitGuide today</p>
        </div>

        {/* SUCCESS STATE */}
        {success && (
          <div className="auth-success-split" role="status">
            <span className="success-icon">✓</span>
            <div className="success-text">
              <strong>Account created!</strong>
              <span>Please check your email to confirm your account.</span>
            </div>
          </div>
        )}

        {/* ERROR MESSAGE */}
        {error && !success && (
          <div className="auth-error-split" role="alert">
            <span className="error-message">{error}</span>
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          style={{
            opacity: success ? 0.5 : 1,
            pointerEvents: success ? "none" : "auto",
          }}
        >
          <div className="form-group-split">
            <input
              id="reg-email"
              type="email"
              placeholder=" "
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading || success}
              required
              autoComplete="email"
            />
            <label htmlFor="reg-email">Email address</label>
          </div>

          <div className="form-group-split">
            <input
              id="reg-username"
              type="text"
              placeholder=" "
              value={username}
              onChange={(e) => setUsername(e.target.value.slice(0, 50))}
              disabled={isLoading || success}
              required
            />
            <label htmlFor="reg-username">Username</label>
          </div>

          {/* Password Field with Show/Hide */}
          <div className="form-group-split">
            <input
              id="reg-password"
              type={showPassword ? "text" : "password"}
              placeholder=" "
              value={password}
              onChange={handlePasswordChange}
              disabled={isLoading || success}
              required
              autoComplete="new-password"
            />
            <label htmlFor="reg-password">Password</label>
            <button
              type="button"
              className="password-toggle-split"
              onClick={() => { trigger(10); setShowPassword(!showPassword); }}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>

          {/* Confirm Password Field with Show/Hide (uses same showPassword toggle) */}
          <div className="form-group-split">
            <input
              id="reg-confirm-password"
              type={showPassword ? "text" : "password"}
              placeholder=" "
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={isLoading || success}
              required
              autoComplete="new-password"
            />
            <label htmlFor="reg-confirm-password">Confirm password</label>
            {/* Note: Same toggle button toggles both fields */}
          </div>

          {/* Combined validation section */}
          <div className="password-validation-split">
            {password && (
              <div className="strength-bar-split">
                <div
                  className="strength-fill-split"
                  style={{
                    width: `${(passwordStrength / 4) * 100}%`,
                    backgroundColor:
                      strengthColors[passwordStrength - 1] || "#ef4444",
                  }}
                />
              </div>
            )}
            
            <div className="validation-messages">
              {password && confirmPassword && !passwordsMatch && (
                <span className="validation-error">✗ Passwords do not match</span>
              )}
              {password && passwordsMatch && passwordStrength >= 3 && (
                <span className="validation-success">✓ Password looks good</span>
              )}
              {password && passwordsMatch && passwordStrength < 3 && (
                <span className="validation-warning">
                  Password too weak - use 8+ chars, uppercase, lowercase & numbers
                </span>
              )}
            </div>
          </div>

          <button
            type="submit"
            className={`auth-button-split ${isLoading ? "loading" : ""}`}
            disabled={isLoading || success || !isPasswordValid}
            onClick={() => trigger([15, 20, 15])}
          >
            {isLoading ? (
              <>
                <span className="button-spinner-split" />
                Creating account...
              </>
            ) : (
              "Create account →"
            )}
          </button>
        </form>

        <button
          type="button"
          className="auth-secondary-split"
          onClick={() => { trigger(10); onSwitchToLogin(); }}
          disabled={isLoading || success}
        >
          Already have an account? Sign in
        </button>
      </div>
    </div>
  );
}