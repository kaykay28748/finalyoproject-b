import { useState, useEffect } from 'react';
import { useAuthContext } from '../../context/AuthContext';
import { useHaptics } from '../../hooks/useHaptics';
import { API_URL } from '../../config';

export default function EditProfileModal({ isOpen, onClose, currentUsername, onUpdate }) {
  const [username, setUsername] = useState(currentUsername || '');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const { getAuthHeader } = useAuthContext();
  const { trigger } = useHaptics();

  useEffect(() => {
    if (isOpen) {
      setUsername(currentUsername || '');
      setError('');
    }
  }, [isOpen, currentUsername]);

  if (!isOpen) return null;

  const handleSave = async () => {
    const trimmed = username.trim();
    if (trimmed.length < 2) {
      setError('Username must be at least 2 characters');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_URL}/auth/me`, {
        method: 'PATCH',
        headers: {
          ...getAuthHeader(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: trimmed }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update username');
      }

      const updated = await response.json();
      onUpdate(updated.username);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={() => { trigger(10); onClose(); }}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-icon" style={{ background: 'rgba(37, 99, 235, 0.1)', color: '#2563eb' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
          </div>
          <h2>Edit Username</h2>
          <p>This is how you will appear to other users on the campus network.</p>
        </div>
        <div className="modal-form-group">
          <input 
            className="ug-search-input"
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="Enter new username"
            autoFocus
          />
          {error && <p className="modal-hint" style={{ color: '#ef4444', marginTop: 8 }}>{error}</p>}
        </div>
        <div className="modal-actions">
          <button className="modal-btn modal-btn-secondary" onClick={() => { trigger(10); onClose(); }} disabled={isLoading}>Cancel</button>
          <button className="modal-btn modal-btn-primary" onClick={() => { trigger([15, 20, 15]); handleSave(); }} disabled={isLoading}>
            {isLoading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}