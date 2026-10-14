// frontend/src/components/Admin/AdminDashboard.jsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '../../context/AuthContext';
import { API_URL } from '../../config';
import { getReports, updateReportStatus, getReportClusters, resolveCluster, sendReportMessage } from '../../services/reportService';
import { isTokenValid } from '../Profile/auth';
import { useHaptics } from '../../hooks/useHaptics';
import LogoutConfirmationModal from '../Profile/LogoutConfirmationModal';
import './AdminDashboard.css';

// ── Icons ─────────────────────────────────────────────────────────────────────
const Icons = {
  Dashboard: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  ),
  Users: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  Activity: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  ),
  System: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <rect x="9" y="9" width="6" height="6" rx="1" />
      <line x1="9" y1="1" x2="9" y2="4" />
      <line x1="15" y1="1" x2="15" y2="4" />
      <line x1="9" y1="20" x2="9" y2="23" />
      <line x1="15" y1="20" x2="15" y2="23" />
      <line x1="20" y1="9" x2="23" y2="9" />
      <line x1="20" y1="14" x2="23" y2="14" />
      <line x1="1" y1="9" x2="4" y2="9" />
      <line x1="1" y1="14" x2="4" y2="14" />
    </svg>
  ),
  Logout: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  ),
  Refresh: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 4v6h-6" />
      <path d="M1 20v-6h6" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" />
      <path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14" />
    </svg>
  ),
  TrendingUp: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  ),
  UsersIcon: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  RouteIcon: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  AlertIcon: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  ),
  Menu: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  ),
  Close: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  Flag: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  ),
  Check: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  X: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  SevMild: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  ),
  SevModerate: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  SevSevere: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  ),
};

const SEVERITY_CONFIG = {
  1: { label: 'Mild',     color: '#22c55e', bg: '#ecfdf5' },
  2: { label: 'Moderate', color: '#f59e0b', bg: '#fffbeb' },
  3: { label: 'Severe',   color: '#ef4444', bg: '#fef2f2' },
};

const ISSUE_TYPE_LABELS = {
  blocked_ramp:    'Blocked Ramp',
  missing_curb:    'Missing Curb Cut',
  broken_surface:  'Broken / Uneven Surface',
  poor_lighting:   'Poor Lighting',
  construction:    'Construction / Road Closed',
  other:           'Other Issue',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function getToken() {
  const token = sessionStorage.getItem('accessToken');
  return isTokenValid(token) ? token : null;
}

function formatNumber(num) {
  if (!num || num === 0) return '0';
  if (num > 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num > 1_000)     return `${(num / 1_000).toFixed(1)}K`;
  return String(num);
}

// Latency is reported in milliseconds; anything at or above a second reads
// better as seconds so the operator is not counting zeros.
function formatMs(value) {
  if (value === null || value === undefined) return '—';
  if (value >= 1000) return `${(value / 1000).toFixed(2)}s`;
  if (value >= 10)   return `${Math.round(value)}ms`;
  return `${value.toFixed(1)}ms`;
}

function formatRate(fraction) {
  if (fraction === null || fraction === undefined) return '—';
  return `${(fraction * 100).toFixed(1)}%`;
}

function getActivityDisplay(item) {
  const meta = item.parsedMetadata || {};
  switch (item.activity_type) {
    case 'route_calculated':
      return `Route: ${meta.start_location || '?'} → ${meta.end_location || '?'} (${meta.profile_used || 'standard'})`;
    case 'search':
      return `Searched: "${meta.query || '?'}" → ${meta.selected_result || '?'}`;
    case 'login':
      return `Logged in from ${meta.browser || 'device'}`;
    case 'register':
      return `New user registered: ${meta.email || ''}`;
    default:
      return item.activity_type;
  }
}

// ── Metric grid (System tab) ──────────────────────────────────────────────────
// A small label/value grid reused for every metric section so the System tab
// stays consistent without a charting dependency.
function MetricGrid({ items }) {
  return (
    <div className="sys-metrics">
      {items.map(({ label, value, hint }) => (
        <div key={label} className="sys-metric">
          <span className="sys-metric-value">{value}</span>
          <span className="sys-metric-label">{label}</span>
          {hint !== undefined && hint !== null && <span className="sys-metric-hint">{hint}</span>}
        </div>
      ))}
    </div>
  );
}

// ── Skeleton Loader ───────────────────────────────────────────────────────────
function SkeletonLoader() {
  return (
    <div className="admin-dashboard" style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div className="skeleton" style={{ width: 48, height: 48, borderRadius: '50%' }} />
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const { logout, user } = useAuthContext();
  const { trigger } = useHaptics();
  const navigate = useNavigate();

  const [stats,            setStats]            = useState(null);
  const [users,            setUsers]            = useState([]);
  const [activity,         setActivity]         = useState([]);
  const [reports,          setReports]          = useState([]);
  const [systemStats,      setSystemStats]      = useState(null);
  const [pendingCount,     setPendingCount]      = useState(null);
  const [isLoading,        setIsLoading]        = useState(true);
  const [error,            setError]            = useState('');
  const [failedSections,   setFailedSections]   = useState([]);
  const [lastUpdated,      setLastUpdated]      = useState(null);
  const [activeTab,        setActiveTab]        = useState('overview');
  const [mobileMenuOpen,   setMobileMenuOpen]   = useState(false);
  const [processingReport, setProcessingReport] = useState(null);
  const [adminNotes,       setAdminNotes]       = useState({});
  const [clusters,         setClusters]         = useState([]);
  const [expandedCluster,  setExpandedCluster]  = useState(null);
  const [clusterNotes,     setClusterNotes]     = useState({});
  const [clusterProcessing, setClusterProcessing] = useState(null);
  const [searchReports,   setSearchReports]   = useState('');
  const [searchUsers,     setSearchUsers]     = useState('');
  const [searchActivity,  setSearchActivity]  = useState('');
  const [toasts,              setToasts]              = useState([]);
  const [isRefreshing,        setIsRefreshing]        = useState(false);
  const [showLogoutModal,     setShowLogoutModal]     = useState(false);
  const [showSettings,        setShowSettings]        = useState(false);

  const intervalRef = useRef(null);

  // ── Toast helpers ────────────────────────────────────────────────────────────
  const addToast = useCallback((type, text) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, type, text }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // ── Fetch reports list ────────────────────────────────────────────────────────
  const fetchReports = useCallback(async () => {
    try {
      const data = await getReports('pending', 100);
      setReports(data.reports || []);
      setPendingCount((data.reports || []).length);
    } catch (err) {
      console.error('[Admin] Fetch reports error:', err);
    }
  }, []);

  // ── Fetch report clusters ─────────────────────────────────────────────────────
  const fetchClusters = useCallback(async () => {
    try {
      const data = await getReportClusters();
      setClusters(data.clusters || []);
    } catch (err) {
      console.error('[Admin] Fetch clusters error:', err);
    }
  }, []);

  // ── Fetch system performance metrics ──────────────────────────────────────────
  // Separate from fetchData because it is only useful on the System tab and
  // changes continuously; no point polling it while the operator is elsewhere.
  const fetchSystemMetrics = useCallback(async () => {
    try {
      const token = getToken();
      if (!token) return;

      const res = await fetch(`${API_URL}/admin/system`, {
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });

      // 401/403 here is handled by the main fetchData redirect; silently skip.
      if (!res.ok) return;

      const data = await res.json();
      if (data && typeof data === 'object') setSystemStats(data);
    } catch (err) {
      console.error('[Admin] Fetch system metrics error:', err);
    }
  }, []);

  // ── Fetch admin inbox ─────────────────────────────────────────────────────────
  // ── Fetch main dashboard data ─────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const token = getToken();
      if (!token) { window.location.href = '/'; return; }

      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

      const [statsRes, usersRes, activityRes] = await Promise.all([
        fetch(`${API_URL}/admin/stats`,    { headers }),
        fetch(`${API_URL}/admin/users`,    { headers }),
        fetch(`${API_URL}/admin/activity`, { headers }),
      ]);

      if ([statsRes, usersRes, activityRes].some(r => r.status === 401 || r.status === 403)) {
        sessionStorage.removeItem('accessToken');
        sessionStorage.removeItem('refreshToken');
        sessionStorage.removeItem('user');
        window.location.href = '/';
        return;
      }

      const failedSections = [];
      const readPayload = async (response, section, isValid) => {
        if (!response.ok) {
          failedSections.push(section);
          return undefined;
        }

        try {
          const payload = await response.json();
          if (!isValid(payload)) {
            failedSections.push(section);
            return undefined;
          }
          return payload;
        } catch {
          failedSections.push(section);
          return undefined;
        }
      };

      const [statsData, usersData, activityData] = await Promise.all([
        readPayload(statsRes, 'statistics', payload => payload && typeof payload === 'object' && !Array.isArray(payload)),
        readPayload(usersRes, 'users', payload => Array.isArray(payload?.users)),
        readPayload(activityRes, 'activity', payload => Array.isArray(payload?.activity)),
      ]);

      const parsedActivity = (activityData?.activity || []).map(item => {
        let parsedMeta = {};
        try {
          if (item.metadata) {
            parsedMeta = typeof item.metadata === 'string' ? JSON.parse(item.metadata) : item.metadata;
          }
        } catch { /* ignore */ }
        return { ...item, parsedMetadata: parsedMeta };
      });

      if (statsData !== undefined) setStats(statsData);
      if (usersData !== undefined) setUsers(usersData.users);
      if (activityData !== undefined) setActivity(parsedActivity);
      setFailedSections(failedSections);

      if (failedSections.length > 0) {
        setError(`Could not refresh ${failedSections.join(', ')}. Showing last successful data where available.`);
      } else {
        setLastUpdated(new Date());
        setError('');
      }
    } catch (err) {
      console.error('[Admin] Fetch error:', err);
      setFailedSections(['statistics', 'users', 'activity']);
      setError('Could not refresh dashboard data. Showing last successful data where available.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // ── Close settings dropdown on outside click ──────────────────────────────────
  useEffect(() => {
    if (!showSettings) return;
    const handler = (e) => { if (!e.target.closest('.admin-settings-wrap')) setShowSettings(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showSettings]);

  // ── Initial load + 30s poll ───────────────────────────────────────────────────
  // Refreshes stats every 30s; on the Reports tab it also refreshes the pending
  // list + clusters so new submissions appear without manual reloads.
  const refreshActiveTab = useCallback(async () => {
    await fetchData();
    if (activeTab === 'reports') {
      await Promise.all([fetchReports(), fetchClusters()]);
    }
    if (activeTab === 'system') {
      await fetchSystemMetrics();
    }
  }, [activeTab, fetchData, fetchReports, fetchClusters, fetchSystemMetrics]);

  useEffect(() => {
    fetchData();
    fetchReports();
  }, [fetchData, fetchReports]);

  useEffect(() => {
    intervalRef.current = setInterval(refreshActiveTab, 30_000);
    return () => clearInterval(intervalRef.current);
  }, [refreshActiveTab]);

  // ── Load reports + clusters on Reports tab ─────────────────────────────────────
  useEffect(() => {
    if (activeTab === 'reports') {
      fetchReports();
      fetchClusters();
    }
  }, [activeTab, fetchReports, fetchClusters]);

  // ── Load system metrics when the System tab opens ───────────────────────────────
  useEffect(() => {
    if (activeTab === 'system') fetchSystemMetrics();
  }, [activeTab, fetchSystemMetrics]);

  // ── Approve / Reject ──────────────────────────────────────────────────────────
  const handleUpdateReport = useCallback(async (reportId, status) => {
    setProcessingReport(reportId);
    setError('');
    try {
      await updateReportStatus(reportId, status, adminNotes[reportId] || '');
      setAdminNotes(prev => ({ ...prev, [reportId]: '' }));
      // Optimistic: update report status in clusters so buttons vanish immediately
      setClusters(prev => prev.map(c => ({
        ...c,
        reports: c.reports.map(r => r.id === reportId ? { ...r, status } : r),
      })));
      addToast('success', `Report #${reportId} ${status}`);
      await fetchReports();
      await fetchClusters();
    } catch (err) {
      const msg = err.message || `Failed to ${status} report`;
      setError(msg);
      addToast('error', msg);
    } finally {
      setProcessingReport(null);
    }
  }, [adminNotes, fetchReports, fetchClusters, addToast]);

  const handleApproveReport = (id) => handleUpdateReport(id, 'approved');
  const handleRejectReport  = (id) => handleUpdateReport(id, 'rejected');

  // ── Cluster bulk resolve ──────────────────────────────────────────────────────
  const handleClusterResolve = useCallback(async (cluster, status) => {
    const reportIds = cluster.reports.map(r => r.id);
    setClusterProcessing(cluster.id);
    setError('');
    try {
      await resolveCluster(reportIds, status, clusterNotes[cluster.id] || '');
      setClusterNotes(prev => ({ ...prev, [cluster.id]: '' }));
      addToast('success', `${cluster.reports.length} report(s) ${status}`);
      await fetchClusters();
      await fetchReports();
    } catch (err) {
      const msg = err.message || `Failed to ${status} cluster`;
      setError(msg);
      addToast('error', msg);
    } finally {
      setClusterProcessing(null);
    }
  }, [clusterNotes, fetchClusters, fetchReports, addToast]);

  const switchTab = (tab) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
    setError('');
  };

  // ── Loading state ─────────────────────────────────────────────────────────────
  if (isLoading) return <SkeletonLoader />;

  const tabTitle = {
    overview: 'Dashboard',
    reports:  'Reports & Messages',
    users:    'User Management',
    activity: 'Activity Log',
    system:   'System Performance',
  }[activeTab] ?? 'Dashboard';

  // Only clusters that still need admin action (pending, or approved awaiting resolution)
  const actionableClusters = clusters.filter(c => c.open_count > 0 || c.approved_count > 0);

  return (
    <div className="admin-dashboard">
      <button
        className="admin-mobile-menu-btn"
        onClick={() => { trigger(10); setMobileMenuOpen(o => !o); }}
        aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
        aria-expanded={mobileMenuOpen}
        aria-controls="admin-sidebar"
      >
        {mobileMenuOpen ? <Icons.Close /> : <Icons.Menu />}
      </button>
      {mobileMenuOpen && (
        <button
          type="button"
          className="admin-sidebar-backdrop"
          onClick={() => { trigger(10); setMobileMenuOpen(false); }}
          aria-label="Close navigation menu"
        />
      )}

      {/* ── Sidebar ──────────────────────────────────────────────────────────── */}
      <aside id="admin-sidebar" className={`admin-sidebar ${mobileMenuOpen ? 'open' : ''}`} aria-label="Admin navigation">
        <div className="admin-sidebar-header">
          <div className="admin-logo">
            <img src="/icon-192.png" alt="" width="32" height="32" className="admin-logo-mark" />
            <span>TransitGuide</span>
          </div>
          <p className="admin-sidebar-subtitle">Admin</p>
        </div>

        <nav className="admin-nav">
          {[
            { key: 'overview', label: 'Overview', Icon: Icons.Dashboard },
            { key: 'reports',  label: 'Reports',  Icon: Icons.Flag,     badge: pendingCount },
            { key: 'users',    label: 'Users',    Icon: Icons.Users },
            { key: 'activity', label: 'Activity', Icon: Icons.Activity },
            { key: 'system',   label: 'System',   Icon: Icons.System },
          ].map(({ key, label, Icon, badge }) => (
            <button
              key={key}
              className={`admin-nav-item ${activeTab === key ? 'active' : ''}`}
              onClick={() => { trigger(10); switchTab(key); }}
            >
              <Icon />
              <span>{label}</span>
              {badge > 0 && <span className="report-badge">{badge}</span>}
            </button>
          ))}
        </nav>

        <div className="admin-sidebar-footer">
          <div className="admin-user-info">
            <div className="admin-user-avatar">
              {user?.username?.charAt(0)?.toUpperCase() || 'A'}
            </div>
            <div className="admin-user-details">
              <span className="admin-user-name">{user?.username || 'Admin'}</span>
              <span className="admin-user-role">Administrator</span>
            </div>
          </div>
          <button onClick={() => { trigger(10); setShowLogoutModal(true); }} className="admin-logout-btn">
            <Icons.Logout />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <main className="admin-main">
        <div className="admin-topbar">
          <div className="admin-topbar-left">
            <span className="admin-topbar-title">{tabTitle}</span>
            <span className="admin-topbar-welcome">Welcome back, {user?.username || 'Admin'}</span>
          </div>
          <div className="admin-topbar-right">
            <span className="admin-updated">Updated: {lastUpdated?.toLocaleTimeString() || '--:--:--'}</span>
            <div className="admin-settings-wrap">
              <button onClick={() => { trigger(10); setShowSettings(s => !s); }} className="admin-topbar-btn settings">SETTINGS</button>
              {showSettings && (
                <div className="settings-dropdown">
                  <button className="settings-dropdown-item" onClick={() => { trigger(10); setShowSettings(false); navigate('/profile'); }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    Profile
                  </button>
                </div>
              )}
            </div>
            <button onClick={() => { trigger(10); if (!isRefreshing) refreshActiveTab(); }} className="admin-topbar-btn" disabled={isRefreshing}>
              <span className={isRefreshing ? 'spin-icon' : ''}><Icons.Refresh /></span>
              {isRefreshing ? 'Loading…' : 'Refresh'}
            </button>
          </div>
        </div>

        {error && (
          <div className="admin-error">
            <Icons.AlertIcon />
            <span>{error}</span>
            <button className="admin-error-dismiss" onClick={() => { trigger(10); setError(''); }} aria-label="Dismiss error">
              <Icons.X />
            </button>
          </div>
        )}

        <div className="admin-content">

        {/* ── Overview ───────────────────────────────────────────────────────── */}
        {activeTab === 'overview' && (
          <>
            <div className="admin-stats-grid">
              <div className="stat-card">
                <div className="stat-card-icon blue"><Icons.UsersIcon /></div>
                <div className="stat-card-content">
                  <span className="stat-card-value">{stats === null ? '—' : formatNumber(stats?.users?.total)}</span>
                  <span className="stat-card-label">Total Users</span>
                </div>
                <div className="stat-card-trend positive">{stats === null ? '—' : `+${stats?.users?.newThisWeek || 0} this week`}</div>
              </div>
              <div className="stat-card">
                <div className="stat-card-icon green"><Icons.TrendingUp /></div>
                <div className="stat-card-content">
                  <span className="stat-card-value">{stats === null ? '—' : stats?.users?.activeToday || 0}</span>
                  <span className="stat-card-label">Active Today</span>
                </div>
                <div className="stat-card-trend">{stats === null ? '—' : `${stats?.users?.activeWeek || 0} active this week`}</div>
              </div>
              <div className="stat-card">
                <div className="stat-card-icon purple"><Icons.RouteIcon /></div>
                <div className="stat-card-content">
                  <span className="stat-card-value">{stats === null ? '—' : stats?.routes?.today || 0}</span>
                  <span className="stat-card-label">Routes Today</span>
                </div>
                <div className="stat-card-trend">{stats === null ? '—' : `${formatNumber(stats?.routes?.total)} total routes`}</div>
              </div>
              <div className="stat-card">
                <div className="stat-card-icon orange"><Icons.Activity /></div>
                <div className="stat-card-content">
                  <span className="stat-card-value">{pendingCount ?? '—'}</span>
                  <span className="stat-card-label">Pending Reports</span>
                </div>
              </div>
            </div>

            <div className="admin-two-col">
              <div className="admin-card">
                <h3>Route Preferences</h3>
                <div className="profile-stats">
                  {stats?.profilePreferences?.length > 0 ? (
                    stats.profilePreferences.map((p, idx) => (
                      <div key={p.profile_used} className="profile-bar">
                        <div className="profile-bar-header">
                          <span className="profile-name">
                            {p.profile_used}
                          </span>
                          <span className="profile-percent">
                            {stats.routes?.total ? ((p.count / stats.routes.total) * 100).toFixed(0) : 0}%
                          </span>
                        </div>
                        <div className="progress-bar">
                          <div
                            className="progress-fill"
                            style={{ width: stats.routes?.total ? `${(p.count / stats.routes.total) * 100}%` : '0%' }}
                          />
                        </div>
                        <div className="profile-count">{p.count} routes</div>
                      </div>
                    ))
                  ) : (
                    <div className="admin-empty"><p>{stats === null ? 'Statistics unavailable.' : 'No route data yet.'}</p></div>
                  )}
                </div>
              </div>

              <div className="admin-card">
                <h3>Top Destinations</h3>
                <div className="destinations-list">
                  {stats?.topDestinations?.length > 0 ? (
                    stats.topDestinations.slice(0, 5).map((d, i) => (
                      <div key={d.end_location} className="destination-item">
                        <span className="destination-rank">{i + 1}</span>
                        <span className="destination-name">{d.end_location || 'Unknown'}</span>
                        <span className="destination-count">{d.count} trips</span>
                      </div>
                    ))
                  ) : (
                    <div className="admin-empty"><p>{stats === null ? 'Statistics unavailable.' : 'No destination data yet.'}</p></div>
                  )}
                </div>
              </div>
            </div>

            <div className="admin-card full-width">
              <h3>Recent Activity</h3>
              <div className="activity-timeline">
                {activity.slice(0, 10).map((a) => (
                  <div key={a.id} className="activity-item">
                    <div className="activity-dot" />
                    <div className="activity-content">
                      <div className="activity-header">
                        <span className="activity-user">{a.username || a.email}</span>
                        <span className="activity-time">{new Date(a.created_at).toLocaleString()}</span>
                      </div>
                      <p className="activity-type">{getActivityDisplay(a)}</p>
                    </div>
                  </div>
                ))}
                {activity.length === 0 && (
                  <div className="admin-empty">
                    <p>{failedSections.includes('activity') ? 'Activity data unavailable.' : 'No activity yet.'}</p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* ── Reports ────────────────────────────────────────────────────────── */}
        {activeTab === 'reports' && (
          <>
            {/* ── Pending Clusters ──────────────────────────────────────────── */}
            <div className="admin-card full-width">
              <div className="admin-table-header">
                <h3>Pending Reports</h3>
                <span className="admin-table-stats">
                  {actionableClusters.length} cluster{actionableClusters.length !== 1 ? 's' : ''} · {pendingCount} pending
                </span>
              </div>

              <div className="admin-search-wrap">
                <svg className="admin-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input
                  type="text"
                  className="admin-search-input"
                  placeholder="Search reports by issue type or location..."
                  value={searchReports}
                  onChange={(e) => setSearchReports(e.target.value)}
                />
                {searchReports && (
                  <button className="admin-search-clear" onClick={() => setSearchReports('')}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                )}
              </div>

              {actionableClusters.length === 0 ? (
                <div className="admin-empty">
                  <div className="admin-empty-icon">&#10003;</div>
                  <p>No reports to review. All clear!</p>
                </div>
              ) : (
                <div className="clusters-list">
                  {(searchReports
                    ? actionableClusters.filter(c =>
                        (ISSUE_TYPE_LABELS[c.issue_type] || c.issue_type || '').toLowerCase().includes(searchReports.toLowerCase()) ||
                        (c.location_name || '').toLowerCase().includes(searchReports.toLowerCase())
                      )
                    : actionableClusters
                  ).map((cluster) => {
                    const sev = SEVERITY_CONFIG[cluster.max_severity] || SEVERITY_CONFIG[2];
                    const isExpanded = expandedCluster === cluster.id;
                    const isProcessing = clusterProcessing === cluster.id;
                    const hasPending = cluster.reports.some(r => r.status === 'pending');
                    const hasApproved = cluster.reports.some(r => r.status === 'approved');

                    return (
                      <div key={cluster.id} className={`cluster-card severity-${cluster.max_severity}${isExpanded ? ' is-expanded' : ''}`}>
                        <div className="cluster-header">
                          <div className="cluster-header-top">
                            <div className="cluster-title-group">
                              <div className="cluster-title-row">
                                <span className={`cluster-severity-icon sev-icon-${cluster.max_severity}`}>
                                  {cluster.max_severity === 3 ? <Icons.SevSevere /> : cluster.max_severity === 2 ? <Icons.SevModerate /> : <Icons.SevMild />}
                                </span>
                                <span className="cluster-issue-name">
                                  {ISSUE_TYPE_LABELS[cluster.issue_type] || cluster.issue_type}
                                </span>
                                {cluster.location_name && (
                                  <span className="cluster-location">&mdash; {cluster.location_name}</span>
                                )}
                              </div>
                              <div className="cluster-coords">
                                {cluster.lat.toFixed(5)}, {cluster.lng.toFixed(5)}
                              </div>
                            </div>
                            <span className={`cluster-severity-badge severity-badge-${cluster.max_severity}`}>
                              Severity {cluster.avg_severity}
                            </span>
                          </div>

                          <div className="cluster-stats-row">
                            <span><strong>{cluster.report_count}</strong> report{cluster.report_count > 1 ? 's' : ''}</span>
                            {cluster.open_count > 0 && <span className="pending">{cluster.open_count} pending</span>}
                            {cluster.approved_count > 0 && <span className="approved">{cluster.approved_count} approved</span>}
                            {cluster.resolved_count > 0 && <span className="resolved">{cluster.resolved_count} resolved</span>}
                            {cluster.rejected_count > 0 && <span className="rejected">{cluster.rejected_count} rejected</span>}
                          </div>
                          <div className="cluster-dates">
                            First: {new Date(cluster.first_reported).toLocaleDateString()} · Latest: {new Date(cluster.latest_reported).toLocaleString()}
                          </div>

                          <div className="cluster-actions">
                            <button
                              className="btn btn-outline"
                              onClick={() => {
                                trigger(10);
                                setExpandedCluster(isExpanded ? null : cluster.id);
                              }}
                            >
                              {isExpanded ? 'Collapse' : `View ${cluster.report_count} report${cluster.report_count > 1 ? 's' : ''}`}
                            </button>
                            {hasPending && (
                              <>
                                <button
                                  className="btn btn-reject"
                                  onClick={() => { trigger([30,50,30]); handleClusterResolve(cluster, 'rejected'); }}
                                  disabled={isProcessing}
                                >
                                  {isProcessing ? '...' : 'Reject All'}
                                </button>
                                <button
                                  className="btn btn-approve"
                                  onClick={() => { trigger([15,20,15]); handleClusterResolve(cluster, 'approved'); }}
                                  disabled={isProcessing}
                                >
                                  {isProcessing ? '...' : 'Approve All'}
                                </button>
                              </>
                            )}
                            {hasApproved && !hasPending && (
                              <button
                                className="btn btn-resolve"
                                onClick={() => { trigger([15,20,15]); handleClusterResolve(cluster, 'resolved'); }}
                                disabled={isProcessing}
                              >
                                {isProcessing ? '...' : 'Resolve All'}
                              </button>
                            )}
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="cluster-expanded">
                            <textarea
                              className="cluster-notes-textarea"
                              placeholder="Message for reporters in this cluster..."
                              value={clusterNotes[cluster.id] || ''}
                              onChange={(e) => setClusterNotes(prev => ({ ...prev, [cluster.id]: e.target.value }))}
                              rows={2}
                              disabled={isProcessing}
                            />
                            <div className="cluster-actions" style={{ marginTop: 0, marginBottom: 0 }}>
                              <button
                                className="btn btn-primary"
                                onClick={async () => { trigger(10); const c = clusters.find(x => x.id === cluster.id); if (!c) return; const t = (clusterNotes[cluster.id] || '').trim(); if (!t) return; setClusterProcessing(cluster.id); try { for (const r of c.reports) { await sendReportMessage(r.id, t); } setClusterNotes(prev => ({ ...prev, [cluster.id]: '' })); addToast('success', `Message sent to ${c.reports.length} report(s)`); } catch (err) { addToast('error', err.message || 'Failed to send message'); } finally { setClusterProcessing(null); } }}
                                disabled={isProcessing || !(clusterNotes[cluster.id] || '').trim()}
                              >
                                Send Message
                              </button>
                            </div>

                            <div className="cluster-reports">
                              {cluster.reports.map((report) => {
                                const rSev = SEVERITY_CONFIG[report.severity] || SEVERITY_CONFIG[2];
                                const isReportProcessing = processingReport === report.id;

                                return (
                                  <div key={report.id} className="cluster-report-card">
                                    <div className="cluster-report-header">
                                      <div className="cluster-report-badges">
                                        <span className="badge badge-id">#{report.id}</span>
                                        <span className={`badge badge-severity-${report.severity}`}>{rSev.label}</span>
                                        <span className={`badge badge-${report.status}`}>{report.status}</span>
                                      </div>
                                      <span className="cluster-report-date">
                                        {new Date(report.created_at).toLocaleString()}
                                      </span>
                                    </div>

                                    {report.location_name && (
                                      <div className="cluster-report-location">{report.location_name}</div>
                                    )}
                                    {report.custom_description && (
                                      <div className="cluster-report-desc">"{report.custom_description}"</div>
                                    )}
                                    {report.admin_notes && (
                                      <div className="cluster-report-admin-note">Admin note: {report.admin_notes}</div>
                                    )}

                                    {report.status === 'pending' && (
                                      <div className="report-actions-section">
                                        <textarea
                                          className="report-notes-textarea"
                                          placeholder="Message for reporter (optional)..."
                                          value={adminNotes[report.id] || ''}
                                          onChange={(e) => setAdminNotes(prev => ({ ...prev, [report.id]: e.target.value }))}
                                          rows={2}
                                          disabled={isReportProcessing}
                                        />
                                        <div className="report-action-row">
                                          <button
                                            className="btn btn-reject"
                                            onClick={() => { trigger([30,50,30]); handleRejectReport(report.id); }}
                                            disabled={isReportProcessing}
                                          >
                                            {isReportProcessing ? '...' : 'Reject'}
                                          </button>
                                          <button
                                            className="btn btn-approve"
                                            onClick={() => { trigger([15,20,15]); handleApproveReport(report.id); }}
                                            disabled={isReportProcessing}
                                          >
                                            {isReportProcessing ? '...' : 'Approve'}
                                          </button>
                                      </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </>
        )}

        {/* ── Users ──────────────────────────────────────────────────────────── */}
        {activeTab === 'users' && (
          <div className="admin-card full-width">
            <div className="admin-table-header">
              <h3>All Users</h3>
              <span className="admin-table-stats">
                {failedSections.includes('users') && users.length === 0 ? 'User data unavailable' : `${users.length} total users`}
              </span>
            </div>
            <div className="admin-search-wrap">
              <svg className="admin-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input
                type="text"
                className="admin-search-input"
                placeholder="Search users by name or email..."
                value={searchUsers}
                onChange={(e) => setSearchUsers(e.target.value)}
              />
              {searchUsers && (
                <button className="admin-search-clear" onClick={() => setSearchUsers('')}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              )}
            </div>
            <div className="admin-table-wrapper">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Email</th>
                    <th>Joined</th>
                    <th>Routes</th>
                    <th>Last Active</th>
                  </tr>
                </thead>
                <tbody>
                  {(searchUsers
                    ? users.filter(u =>
                        (u.username || '').toLowerCase().includes(searchUsers.toLowerCase()) ||
                        (u.email || '').toLowerCase().includes(searchUsers.toLowerCase())
                      )
                    : users
                  ).map((u) => (
                    <tr key={u.id}>
                      <td>
                        <div className="user-cell">
                          <div className="user-avatar-small">
                            {u.username?.charAt(0)?.toUpperCase() || 'U'}
                          </div>
                          <span className="user-name">{u.username}</span>
                          {u.is_admin === 1 && <span className="admin-badge">Admin</span>}
                        </div>
                      </td>
                      <td className="user-email">{u.email}</td>
                      <td>{new Date(u.created_at).toLocaleDateString()}</td>
                      <td className="user-routes">{u.route_count || 0}</td>
                      <td>{u.last_active ? new Date(u.last_active).toLocaleDateString() : 'Never'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Activity ───────────────────────────────────────────────────────── */}
        {activeTab === 'activity' && (
          <div className="admin-card full-width">
            <div className="admin-table-header">
              <h3>Full Activity Log</h3>
              <span className="admin-table-stats">{activity.length} events</span>
            </div>
            <div className="admin-search-wrap">
              <svg className="admin-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input
                type="text"
                className="admin-search-input"
                placeholder="Search activity by user or event type..."
                value={searchActivity}
                onChange={(e) => setSearchActivity(e.target.value)}
              />
              {searchActivity && (
                <button className="admin-search-clear" onClick={() => setSearchActivity('')}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              )}
            </div>
            <div className="admin-table-wrapper">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Activity</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {(searchActivity
                    ? activity.filter(a =>
                        (a.username || a.email || '').toLowerCase().includes(searchActivity.toLowerCase()) ||
                        getActivityDisplay(a).toLowerCase().includes(searchActivity.toLowerCase())
                      )
                    : activity
                  ).map((a) => (
                    <tr key={a.id}>
                      <td>{a.username || a.email}</td>
                      <td>{getActivityDisplay(a)}</td>
                      <td>{new Date(a.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                  {activity.length === 0 && (
                    <tr><td colSpan="3" className="admin-empty"><p>No activity recorded</p></td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── System ─────────────────────────────────────────────────────────── */}
        {activeTab === 'system' && (
          <>
            <div className="admin-stats-grid">
              <div className="stat-card">
                <div className="stat-card-icon blue"><Icons.Activity /></div>
                <div className="stat-card-content">
                  <span className="stat-card-value">{systemStats ? formatNumber(systemStats.http.total) : '—'}</span>
                  <span className="stat-card-label">Requests</span>
                </div>
                <div className="stat-card-trend">{systemStats ? `${systemStats.http.requestsPerMinute.toFixed(1)}/min` : '—'}</div>
              </div>
              <div className="stat-card">
                <div className="stat-card-icon green"><Icons.TrendingUp /></div>
                <div className="stat-card-content">
                  <span className="stat-card-value">{systemStats ? formatMs(systemStats.http.latency.avg) : '—'}</span>
                  <span className="stat-card-label">Avg Request</span>
                </div>
                <div className="stat-card-trend">{systemStats ? `p95 ${formatMs(systemStats.http.latency.p95)}` : '—'}</div>
              </div>
              <div className="stat-card">
                <div className="stat-card-icon purple"><Icons.System /></div>
                <div className="stat-card-content">
                  <span className="stat-card-value">{systemStats ? formatMs(systemStats.db.latency.avg) : '—'}</span>
                  <span className="stat-card-label">Avg DB Query</span>
                </div>
                <div className="stat-card-trend">{systemStats ? `${formatNumber(systemStats.db.queries)} queries` : '—'}</div>
              </div>
              <div className="stat-card">
                <div className="stat-card-icon orange"><Icons.RouteIcon /></div>
                <div className="stat-card-content">
                  <span className="stat-card-value">{systemStats ? formatRate(systemStats.serverRouting.cacheHitRate) : '—'}</span>
                  <span className="stat-card-label">Route Cache Hit</span>
                </div>
                <div className="stat-card-trend">{systemStats ? `${formatNumber(systemStats.serverRouting.requests)} off-campus` : '—'}</div>
              </div>
            </div>

            <div className="admin-two-col">
              <div className="admin-card">
                <h3>Requests &amp; Latency</h3>
                <MetricGrid items={[
                  { label: 'Requests', value: systemStats ? formatNumber(systemStats.http.total) : '—' },
                  { label: 'Req / min', value: systemStats ? systemStats.http.requestsPerMinute.toFixed(1) : '—' },
                  { label: 'Avg', value: systemStats ? formatMs(systemStats.http.latency.avg) : '—' },
                  { label: 'p50', value: systemStats ? formatMs(systemStats.http.latency.p50) : '—' },
                  { label: 'p95', value: systemStats ? formatMs(systemStats.http.latency.p95) : '—' },
                  { label: 'p99', value: systemStats ? formatMs(systemStats.http.latency.p99) : '—' },
                  { label: 'Error rate', value: systemStats ? formatRate(systemStats.http.errorRate) : '—' },
                  { label: '4xx / 5xx', value: systemStats ? `${formatNumber(systemStats.http.byStatus['4xx'])} / ${formatNumber(systemStats.http.byStatus['5xx'])}` : '—' },
                ]} />
              </div>

              <div className="admin-card">
                <h3>Database</h3>
                <MetricGrid items={[
                  { label: 'Queries', value: systemStats ? formatNumber(systemStats.db.queries) : '—' },
                  { label: 'Errors', value: systemStats ? formatNumber(systemStats.db.errors) : '—' },
                  { label: 'Avg', value: systemStats ? formatMs(systemStats.db.latency.avg) : '—' },
                  { label: 'p95', value: systemStats ? formatMs(systemStats.db.latency.p95) : '—' },
                  { label: 'p99', value: systemStats ? formatMs(systemStats.db.latency.p99) : '—' },
                  { label: 'Slowest', value: systemStats ? formatMs(systemStats.db.latency.max) : '—' },
                  { label: 'SELECT', value: systemStats ? formatNumber(systemStats.db.byVerb.SELECT) : '—' },
                  { label: 'Write', value: systemStats ? formatNumber(systemStats.db.byVerb.INSERT + systemStats.db.byVerb.UPDATE + systemStats.db.byVerb.DELETE) : '—' },
                ]} />
              </div>
            </div>

            <div className="admin-card full-width">
              <div className="admin-table-header">
                <h3>Server Routing (Off-Campus)</h3>
                <span className="admin-table-stats">computed on the backend over the regional graph</span>
              </div>
              <MetricGrid items={[
                { label: 'Routes', value: systemStats ? formatNumber(systemStats.serverRouting.requests) : '—' },
                { label: 'Cache hit', value: systemStats ? formatRate(systemStats.serverRouting.cacheHitRate) : '—', hint: systemStats ? `${formatNumber(systemStats.serverRouting.cacheHits)} hits` : undefined },
                { label: 'Failures', value: systemStats ? formatNumber(systemStats.serverRouting.failures) : '—' },
                { label: 'A* avg', value: systemStats ? formatMs(systemStats.serverRouting.astarMs.avg) : '—', hint: systemStats ? `p95 ${formatMs(systemStats.serverRouting.astarMs.p95)}` : undefined },
                { label: 'Graph load avg', value: systemStats ? formatMs(systemStats.serverRouting.graphLoadMs.avg) : '—', hint: systemStats ? `p95 ${formatMs(systemStats.serverRouting.graphLoadMs.p95)}` : undefined },
                { label: 'Total avg', value: systemStats ? formatMs(systemStats.serverRouting.totalMs.avg) : '—' },
                { label: 'Avg edges', value: systemStats ? formatNumber(Math.round(systemStats.serverRouting.avgEdgeCount)) : '—' },
                { label: 'Avg nodes', value: systemStats ? formatNumber(Math.round(systemStats.serverRouting.avgNodeCount)) : '—' },
                { label: 'Corridor / bbox', value: systemStats ? `${formatNumber(systemStats.serverRouting.corridorLoads)} / ${formatNumber(systemStats.serverRouting.bboxFallbacks)}` : '—' },
              ]} />
            </div>

            <div className="admin-card full-width">
              <div className="admin-table-header">
                <h3>Client Routing (Campus)</h3>
                <span className="admin-table-stats">reported by browsers — A* runs locally on the device</span>
              </div>
              <MetricGrid items={[
                { label: 'Reports', value: systemStats ? formatNumber(systemStats.clientRouting.reports) : '—' },
                { label: 'Campus routes', value: systemStats ? formatNumber(systemStats.clientRouting.campus.requests) : '—' },
                { label: 'A* avg', value: systemStats ? formatMs(systemStats.clientRouting.campus.astarMs.avg) : '—', hint: systemStats ? `p95 ${formatMs(systemStats.clientRouting.campus.astarMs.p95)}` : undefined },
                { label: 'Nodes explored avg', value: systemStats ? formatNumber(Math.round(systemStats.clientRouting.campus.nodesExplored.avg)) : '—', hint: systemStats ? `max ${formatNumber(systemStats.clientRouting.campus.nodesExplored.max)}` : undefined },
                { label: 'Avg graph edges', value: systemStats ? formatNumber(Math.round(systemStats.clientRouting.campus.avgEdgeCount)) : '—' },
                { label: 'Off-campus RT avg', value: systemStats ? formatMs(systemStats.clientRouting.offcampus.roundTripMs.avg) : '—', hint: systemStats ? `p95 ${formatMs(systemStats.clientRouting.offcampus.roundTripMs.p95)}` : undefined },
                { label: 'Off-campus fails', value: systemStats ? formatNumber(systemStats.clientRouting.offcampus.failures) : '—' },
              ]} />
            </div>

            <div className="admin-card full-width">
              <div className="admin-table-header">
                <h3>Endpoints</h3>
                <span className="admin-table-stats">
                  {systemStats?.http?.endpoints?.length ? `top ${systemStats.http.endpoints.length} by traffic` : 'no traffic yet'}
                </span>
              </div>
              <div className="admin-table-wrapper">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Endpoint</th>
                      <th>Requests</th>
                      <th>Avg</th>
                      <th>p95</th>
                      <th>Last status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(systemStats?.http?.endpoints ?? []).map((ep) => (
                      <tr key={ep.route}>
                        <td className="user-email">{ep.route}</td>
                        <td>{formatNumber(ep.count)}</td>
                        <td>{formatMs(ep.avgMs)}</td>
                        <td>{formatMs(ep.p95Ms)}</td>
                        <td>{ep.lastStatus || '—'}</td>
                      </tr>
                    ))}
                    {(!systemStats || !systemStats.http.endpoints.length) && (
                      <tr><td colSpan="5" className="admin-empty"><p>No requests recorded yet</p></td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {systemStats && (
              <p className="sys-footnote">
                Since {new Date(systemStats.startedAt).toLocaleString()} ·
                uptime {Math.floor(systemStats.uptimeMs / 60000)}m ·
                in-process, resets on deploy
              </p>
            )}
          </>
        )}
        </div>
      </main>

      <LogoutConfirmationModal
        isOpen={showLogoutModal}
        onClose={() => { trigger(10); setShowLogoutModal(false); }}
        onConfirm={() => { logout(); }}
        message="Are you sure you want to sign out of the admin dashboard? You'll need to log back in to manage reports and users."
      />

      {/* ── Toast Container ──────────────────────────────────────────────────── */}
      {toasts.length > 0 && (
        <div className="toast-container">
          {toasts.map((t) => (
            <div key={t.id} className={`toast ${t.type === 'error' ? 'toast-error' : ''}`}>
              {t.type === 'error' && <Icons.AlertIcon />}
              <span>{t.text}</span>
              <button className="toast-dismiss" onClick={() => { trigger(10); dismissToast(t.id); }} aria-label="Dismiss">
                <Icons.X />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
