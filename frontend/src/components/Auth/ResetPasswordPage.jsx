// frontend/src/components/Auth/ResetPasswordPage.jsx
// Reset Password Page — Enter new password (Supabase version)

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useHaptics } from "../../hooks/useHaptics";
import { supabase } from "../../lib/supabase";
import "./AuthPage.css";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordStrength, setPasswordStrength] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isValidSession, setIsValidSession] = useState(false);
  const [checking, setChecking] = useState(true);
  
  const navigate = useNavigate();
  const { trigger } = useHaptics();

  useEffect(() => {
    const checkSession = async () => {
      setChecking(true);
      
      // Get the session from Supabase
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError) {
        console.error('[ResetPassword] Session error:', sessionError);
        setIsValidSession(false);
        setChecking(false);
        return;
      }
      
      if (session) {
        // User has a valid session from the email link
        setIsValidSession(true);
        setChecking(false);
      } else {
        // No session - maybe the link is invalid or expired
        setIsValidSession(false);
        setChecking(false);
      }
    };
    
    // Also listen for auth changes (in case session is set after component mounts)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (session && !isValidSession)) {
        setIsValidSession(true);
        setChecking(false);
      }
    });
    
    checkSession();
    
    return () => {
      subscription.unsubscribe();
    };
  }, []);

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
    setSuccess(false);

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (passwordStrength < 3) {
      setError(
        "Password is too weak. Include uppercase, lowercase, and numbers.",
      );
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: password
      });

      if (error) {
        setError(error.message);
      } else {
        setSuccess(true);
        // Sign out after password reset to force new login
        await supabase.auth.signOut();
        setTimeout(() => {
          navigate('/login');
        }, 2000);
      }
    } catch (err) {
      setError("Network error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Show loading state
  if (checking) {
    return (
      <div className="auth-container-split">
        <div className="auth-hero">
          <div className="auth-hero-bg">TG</div>
          <img src="/icon-512.png" alt="TransitGuide" width={80} height={80} fetchpriority="high" />
          <h1>Loading...</h1>
        </div>
        <div className="auth-form-panel">
          <div className="auth-form-header">
            <h2>Please wait</h2>
            <p>Verifying your reset link...</p>
          </div>
          <div className="loading-spinner" style={{ textAlign: 'center', padding: '20px' }}>
            <div className="button-spinner-split" style={{ margin: '0 auto' }} />
          </div>
        </div>
      </div>
    );
  }

  // Show error if no valid session
  if (!isValidSession) {
    return (
      <div className="auth-container-split">
        <div className="auth-hero">
          <div className="auth-hero-bg">TG</div>
          <img src="/icon-512.png" alt="TransitGuide" width={80} height={80} fetchpriority="high" />
          <h1>Invalid or<br />expired link</h1>
          <p>Please request a new password reset link.</p>
        </div>
        <div className="auth-form-panel">
          <div className="auth-form-header">
            <h2>Link expired</h2>
            <p>Password reset links are only valid for a limited time.</p>
          </div>
          <button 
            type="button"
            className="auth-button-split"
            onClick={() => { trigger(10); navigate('/forgot-password'); }}
          >
            Request New Link
          </button>
          <button 
            type="button"
            className="auth-secondary-split"
            onClick={() => { trigger(10); navigate('/login'); }}
            style={{ marginTop: '12px' }}
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  const strengthLabels = ["Weak", "Fair", "Good", "Strong"];
  const strengthColors = ["#ef4444", "#f97316", "#eab308", "#22c55e"];

  return (
    <div className="auth-container-split">
      <div className="auth-hero">
        <div className="auth-hero-bg">UG</div>
        <img src="/icon-512.png" alt="UG Navigator" width={80} height={80} fetchpriority="high" />
        <h1>
          Create new
          <br />
          password
        </h1>
        <p>Choose a strong password for your account.</p>
      </div>

      <div className="auth-form-panel">
        <div className="auth-form-header">
          <h2>New password</h2>
          <p>
            Must be at least 8 characters with uppercase, lowercase, and numbers
          </p>
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
              <span className="success-message">
                Password reset successfully! Redirecting to login...
              </span>
            </div>
          )}

          <div className="form-group-split">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder=" "
              value={password}
              onChange={handlePasswordChange}
              disabled={isLoading}
              required
              autoComplete="new-password"
            />
            <label htmlFor="password">New password</label>
            <button
              type="button"
              className="password-toggle-split"
              onClick={() => { trigger(10); setShowPassword(!showPassword); }}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>

          {password && (
            <div className="password-strength-split">
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
              <span className="strength-label-split">
                Password strength:{" "}
                <strong>
                  {strengthLabels[passwordStrength - 1] || "Weak"}
                </strong>
              </span>
            </div>
          )}

          <div className="form-group-split">
            <input
              id="confirmPassword"
              type={showPassword ? "text" : "password"}
              placeholder=" "
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={isLoading}
              required
              autoComplete="new-password"
            />
            <label htmlFor="confirmPassword">Confirm password</label>
          </div>

          <button
            type="submit"
            className="auth-button-split"
            disabled={isLoading || passwordStrength < 3}
            onClick={() => trigger([15, 20, 15])}
          >
            {isLoading ? (
              <>
                <span className="button-spinner-split" />
                Resetting...
              </>
            ) : (
              "Reset password →"
            )}
          </button>
        </form>

        <button
          type="button"
          className="auth-secondary-split"
          onClick={() => { trigger(10); navigate('/login'); }}
          disabled={isLoading}
        >
          ← Back to login
        </button>
      </div>
    </div>
  );
}