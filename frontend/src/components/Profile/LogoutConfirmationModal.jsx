import { useHaptics } from '../../hooks/useHaptics';

export default function LogoutConfirmationModal({ isOpen, onClose, onConfirm }) {
  const { trigger } = useHaptics();

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={() => { trigger(10); onClose(); }}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-icon" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </div>
          <h2>Sign Out</h2>
          <p>Are you sure you want to end your current session? You'll need to sign back in to access your saved routes.</p>
        </div>
        <div className="modal-actions">
          <button className="modal-btn modal-btn-secondary" onClick={() => { trigger(10); onClose(); }}>Stay Signed In</button>
          <button 
            className="modal-btn modal-btn-danger" 
            onClick={() => { trigger([30, 50, 30]); onConfirm(); onClose(); }}
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}