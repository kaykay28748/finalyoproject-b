// frontend/src/components/Profile/ChangePasswordModal.jsx
import { useState } from "react";
import { useAuthContext } from "../../context/AuthContext";
import { useHaptics } from "../../hooks/useHaptics";
import { supabase } from "../../lib/supabase";
import { API_URL } from "../../config";
import "./EditProfileModal.css"; // Reuse same styles

export default function ChangePasswordModal({ isOpen, onClose, onSuccess }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const { getAuthHeader } = useAuthContext();
  const { trigger } = useHaptics();

  const checkPasswordStrength = (pwd) => {
    let strength = 0;
    if (pwd.length >= 8) strength++;
    if (/[a-z]/.test(pwd)) strength++;
    if (/[A-Z]/.test(pwd)) strength++;
    if (/\d/.test(pwd)) strength++;
    return strength;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    // Validate new password
    const strength = checkPasswordStrength(newPassword);
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters");
      setIsLoading(false);
      return;
    }

    if (strength < 3) {
      setError("Password must include uppercase, lowercase, and numbers");
      setIsLoading(false);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match");
      setIsLoading(false);
      return;
    }

    try {
      // Step 1: Verify current password via backend
      const verifyResponse = await fetch(`${API_URL}/auth/change-password`, {
        method: 'POST',
        headers: {
          ...getAuthHeader(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      if (!verifyResponse.ok) {
        const data = await verifyResponse.json();
        throw new Error(data.error || 'Current password is incorrect');
      }

      // Step 2: Update password via Supabase
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (updateError) {
        throw new Error(updateError.message);
      }

      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      console.error("[ChangePasswordModal] Error:", err);
      setError(err.message || "Failed to update password");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={() => { trigger(10); onClose(); }}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-icon" style={{ background: 'rgba(37, 99, 235, 0.1)', color: '#2563eb' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <h2>Change Password</h2>
          <p>Update your account password. Choose a strong password you don't use elsewhere.</p>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '0 0' }}>
          <div className="modal-form-group">
            <label htmlFor="current-password">Current Password</label>
            <input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Enter current password"
              required
              autoComplete="current-password"
            />
          </div>

          <div className="modal-form-group">
            <label htmlFor="new-password">New Password</label>
            <input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password"
              required
              autoComplete="new-password"
            />
            <p className="modal-hint">Min 8 characters, with uppercase, lowercase and numbers</p>
          </div>

          <div className="modal-form-group">
            <label htmlFor="confirm-password">Confirm New Password</label>
            <input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              required
              autoComplete="new-password"
            />
          </div>

          {error && (
            <div className="modal-error">
              <span>⚠️</span> {error}
            </div>
          )}

          <div className="modal-actions">
            <button type="button" className="modal-btn-cancel" onClick={() => { trigger(10); onClose(); }}>
              Cancel
            </button>
            <button type="submit" className="modal-btn-save" disabled={isLoading} onClick={() => trigger([15, 20, 15])}>
              {isLoading ? "Updating..." : "Update Password"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}