import { useState, useEffect, useRef, useCallback } from 'react';
import { useHaptics } from '../../hooks/useHaptics';
import { getMyReports, updateReportStatus, getReportMessages } from '../../services/reportService';
import './MyReportsModal.css';

const IconClose = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

const IconSevMild = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="16" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12.01" y2="8" />
  </svg>
);

const IconSevModerate = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const IconSevSevere = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

const SEVERITY_LABELS = { 1: 'Mild', 2: 'Moderate', 3: 'Severe' };
const STATUS_LABELS = {
  pending: 'Under Review',
  approved: 'Approved',
  rejected: 'Rejected',
  resolved: 'Resolved',
};

export default function MyReportsModal({ isOpen, onClose }) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const firstFocusRef = useRef(null);
  const overlayRef = useRef(null);
  const { trigger } = useHaptics();

  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [resolvingId, setResolvingId] = useState(null);
  const [expandedReport, setExpandedReport] = useState(null);
  const [expandedMessages, setExpandedMessages] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
    } else {
      setVisible(false);
      const t = setTimeout(() => setMounted(false), 350);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  useEffect(() => {
    if (visible && firstFocusRef.current) {
      firstFocusRef.current.focus();
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab') return;
      const modal = overlayRef.current?.querySelector('.myreports-modal');
      if (!modal) return;
      const focusable = modal.querySelectorAll('button:not([disabled]), [tabindex]:not([tabindex="-1"])');
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey ? document.activeElement === first : document.activeElement === last) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [visible, onClose]);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getMyReports(20);
      setReports(data.reports || []);
    } catch (err) {
      console.error('[MyReportsModal] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) fetchReports();
  }, [isOpen, fetchReports]);

  const handleResolve = useCallback(async (reportId) => {
    setResolvingId(reportId);
    try {
      await updateReportStatus(reportId, 'resolved');
      setReports(prev => prev.map(r => r.id === reportId ? { ...r, status: 'resolved' } : r));
    } catch (err) {
      console.error('[MyReportsModal] Resolve error:', err);
    } finally {
      setResolvingId(null);
    }
  }, []);

  const loadMessages = useCallback(async (reportId) => {
    if (expandedMessages === reportId) {
      setExpandedMessages(null);
      return;
    }
    setMessagesLoading(true);
    try {
      const data = await getReportMessages(reportId);
      setMessages(data.messages || []);
      setExpandedMessages(reportId);
    } catch (err) {
      console.error('[MyReportsModal] Messages error:', err);
    } finally {
      setMessagesLoading(false);
    }
  }, [expandedMessages]);

  if (!mounted) return null;

  return (
    <div
      ref={overlayRef}
      className={`myreports-overlay ${visible ? 'myreports-overlay--visible' : ''}`}
      onClick={() => { trigger(10); onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="My Reports"
    >
      <div
        className={`myreports-modal ${visible ? 'myreports-modal--visible' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="myreports-header">
          <h2>My Reports</h2>
          <button className="myreports-close" onClick={() => { trigger(10); onClose(); }} ref={firstFocusRef} aria-label="Close reports">
            <IconClose />
          </button>
        </div>

        <div className="myreports-body">
          {loading && reports.length === 0 ? (
            <div className="myreports-empty">Loading reports...</div>
          ) : reports.length === 0 ? (
            <div className="myreports-empty">You haven't submitted any reports yet.</div>
          ) : (
            reports.map((report) => {
              const isExpanded = expandedReport === report.id;
              const isMessagesOpen = expandedMessages === report.id;

              return (
                <div className="myreports-card" key={report.id}>
                  <button
                    className="myreports-card-header"
                    onClick={() => { trigger(8); setExpandedReport(isExpanded ? null : report.id); }}
                  >
                    <div className={`myreports-severity sev-${report.severity}`}>
                      {report.severity === 3 ? <IconSevSevere /> : report.severity === 2 ? <IconSevModerate /> : <IconSevMild />}
                    </div>
                    <div className="myreports-card-info">
                      <strong>{report.location_name || `Report #${report.id}`}</strong>
                      <span>
                        {SEVERITY_LABELS[report.severity] || 'Unknown'} · {report.issue_type?.replace(/_/g, ' ')} · {new Date(report.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <span className={`myreports-status ${report.status}`}>
                      {STATUS_LABELS[report.status] || report.status}
                    </span>
                    <span className="myreports-chevron">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points={isExpanded ? "18 15 12 9 6 15" : "9 18 15 12 9 6"} />
                      </svg>
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="myreports-card-detail">
                      <div className="myreports-detail-row">
                        <span className="myreports-detail-label">Type:</span>
                        <span className="myreports-detail-value">{report.issue_type?.replace(/_/g, ' ')}</span>
                      </div>
                      <div className="myreports-detail-row">
                        <span className="myreports-detail-label">Reported:</span>
                        <span className="myreports-detail-value">{new Date(report.created_at).toLocaleString()}</span>
                      </div>
                      {report.custom_description && (
                        <div className="myreports-detail-row">
                          <span className="myreports-detail-label">Note:</span>
                          <span className="myreports-detail-value">"{report.custom_description}"</span>
                        </div>
                      )}

                      {report.status === 'approved' && (
                        <div className="myreports-actions">
                          <button
                            className="myreports-btn-resolve"
                            onClick={() => { trigger([15, 20, 15]); handleResolve(report.id); }}
                            disabled={resolvingId === report.id}
                          >
                            {resolvingId === report.id ? 'Resolving...' : 'Mark as Resolved'}
                          </button>
                        </div>
                      )}

                      <div className="myreports-messages-section">
                        <button
                          className="myreports-messages-toggle"
                          onClick={() => { trigger(10); loadMessages(report.id); }}
                        >
                          {isMessagesOpen ? 'Hide Messages' : 'Messages from Admin'}
                        </button>

                        {isMessagesOpen && (
                          <div className="myreports-thread">
                            {messagesLoading ? (
                              <p className="myreports-msg-empty">Loading messages...</p>
                            ) : messages.length > 0 ? (
                              messages.map(msg => (
                                <div key={msg.id} className={`myreports-msg ${msg.sender_is_admin ? 'admin' : 'user'}`}>
                                  <div className="myreports-msg-meta">
                                    {msg.sender_is_admin ? 'Admin' : 'You'} · {new Date(msg.created_at).toLocaleString()}
                                  </div>
                                  <div className="myreports-msg-text">{msg.message}</div>
                                </div>
                              ))
                            ) : (
                              <p className="myreports-msg-empty">No messages yet.</p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
