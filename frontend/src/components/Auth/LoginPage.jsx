// frontend/src/components/Auth/LoginPage.jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthContext } from "../../context/AuthContext";
import { useHaptics } from "../../hooks/useHaptics";
import "./AuthPage.css";

export default function LoginPage({ onSwitchToRegister, onForgotPassword }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const { login } = useAuthContext();
  const navigate = useNavigate();
  const { trigger } = useHaptics();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const result = await login(email, password);

      if (!result.success) {
        setError(result.error || "Login failed");
        setIsLoading(false);
      } else {
        navigate("/");
      }
    } catch (err) {
      setError(err.message || "Login failed");
      setIsLoading(false);
    }
  };

  const getTimeOfDay = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "morning";
    if (hour < 18) return "afternoon";
    return "evening";
  };

  return (
    <div className="auth-container-split">
      <div className="auth-hero">
        <div className="auth-hero-bg">TG</div>
        <img src="/icon-512.png" alt="TransitGuide" width={80} height={80} fetchpriority="high" />
        <h1>
          Navigate
          <br />
          without limits.
        </h1>
        <p>
          Context-aware, pedestrian-first routing that adapts to how you move through
          the world.
        </p>
      </div>

      <div className="auth-form-panel">
        <div className="auth-form-header">
          <h2>Good {getTimeOfDay()},</h2>
          <p>Sign in to continue your journey</p>
        </div>

        {error && (
          <div className="auth-error-split" role="alert">
            <span className="error-message">{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group-split">
            <input
              id="email"
              type="email"
              placeholder=" "
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
              required
              autoComplete="email"
            />
            <label htmlFor="email">Email address</label>
          </div>

          <div className="form-group-split">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder=" "
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              required
              autoComplete="current-password"
            />
            <label htmlFor="password">Password</label>
            <button
              type="button"
              className="password-toggle-split"
              onClick={() => { trigger(10); setShowPassword(!showPassword); }}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>

          <div className="forgot-password-link">
            <button
              type="button"
              onClick={() => { trigger(10); onForgotPassword(); }}
              className="forgot-password-btn"
            >
              Forgot password?
            </button>
          </div>

          <button
            type="submit"
            className={`auth-button-split ${isLoading ? "loading" : ""}`}
            disabled={isLoading}
            onClick={() => trigger([15, 20, 15])}
          >
            {isLoading ? (
              <>
                <span className="button-spinner-split" />
                Signing in...
              </>
            ) : (
              "Sign in →"
            )}
          </button>
        </form>

        <button
          type="button"
          className="auth-secondary-split"
          onClick={() => { trigger(10); onSwitchToRegister(); }}
          disabled={isLoading}
        >
          Create an account
        </button>
      </div>
    </div>
  );
}