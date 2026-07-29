// frontend/src/components/Profile/DeleteAccountModal.jsx
import { useState } from "react";
import { useAuthContext } from "../../context/AuthContext";
import { useHaptics } from "../../hooks/useHaptics";
import { API_URL } from "../../config";
import "./EditProfileModal.css"; // Reuse same styles

export default function DeleteAccountModal({ isOpen, onClose, onConfirm }) {
  const [confirmText, setConfirmText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const { getAuthHeader, logout } = useAuthContext();
  const { trigger } = useHaptics();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    if (confirmText !== "DELETE") {
      setError('Please type "DELETE" to confirm');
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API_URL}/auth/me`, {
        method: "DELETE",
        headers: {
          ...getAuthHeader(),
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to delete account");
      }

      await logout();
      
      if (onConfirm) onConfirm();
      onClose();
    } catch (err) {
      console.error("[DeleteAccountModal] Error:", err);
      setError(err.message || "Failed to delete account");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={() => { trigger(10); onClose(); }}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-icon" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6" />
            </svg>
          </div>
          <h2 style={{ color: '#ef4444' }}>Delete Account</h2>
          <p>This action is permanent and cannot be undone. All your data will be erased.</p>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '0 0' }}>
          <div className="modal-form-group">
            <label htmlFor="confirm-delete" style={{ marginBottom: 8, display: 'block' }}>
              Type <strong style={{ color: "#ef4444" }}>DELETE</strong> to confirm
            </label>
            <input
              id="confirm-delete"
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
              autoComplete="off"
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
            <button 
              type="submit" 
              className="modal-btn-save" 
              style={{ background: "#ef4444" }}
              disabled={isLoading || confirmText !== "DELETE"}
              onClick={() => trigger([30, 50, 30])}
            >
              {isLoading ? "Deleting..." : "Permanently Delete"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}