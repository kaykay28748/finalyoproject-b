// frontend/src/components/Admin/AdminDashboard.jsx
import { useState, useEffect, useCallback, useRef } from 'react';
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
  Star: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
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

  const [stats,            setStats]            = useState(null);
  const [users,            setUsers]            = useState([]);
  const [activity,         setActivity]         = useState([]);
  const [reports,          setReports]          = useState([]);
  const [feedback,         setFeedback]         = useState([]);
  const [pendingCount,     setPendingCount]      = useState(0);
  const [isLoading,        setIsLoading]        = useState(true);
  const [error,            setError]            = useState('');
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
    if (type === 'success') setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // ── Fetch reports list ────────────────────────────────────────────────────────
  const fetchReports = useCallback(async () => {
    try {
      const data = await getReports('pending', 100);
      setReports(data.reports || []);
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

  // ── Fetch admin inbox ─────────────────────────────────────────────────────────
  // ── Fetch main dashboard data ─────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const token = getToken();
      if (!token) { window.location.href = '/'; return; }

      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

      const [statsRes, usersRes, activityRes, feedbackRes] = await Promise.all([
        fetch(`${API_URL}/admin/stats`,    { headers }),
        fetch(`${API_URL}/admin/users`,    { headers }),
        fetch(`${API_URL}/admin/activity`, { headers }),
        fetch(`${API_URL}/api/reports/feedback`, { headers }),
      ]);

      if ([statsRes, usersRes, activityRes, feedbackRes].some(r => r.status === 401 || r.status === 403)) {
        sessionStorage.removeItem('accessToken');
        sessionStorage.removeItem('refreshToken');
        sessionStorage.removeItem('user');
        window.location.href = '/';
        return;
      }

      const statsData    = statsRes.ok    ? await statsRes.json()    : {};
      const usersData    = usersRes.ok    ? await usersRes.json()    : { users: [] };
      const activityData = activityRes.ok ? await activityRes.json() : { activity: [] };
      const feedbackData = feedbackRes.ok ? await feedbackRes.json() : { feedback: [] };

      const parsedActivity = (activityData.activity || []).map(item => {
        let parsedMeta = {};
        try {
          if (item.metadata) {
            parsedMeta = typeof item.metadata === 'string' ? JSON.parse(item.metadata) : item.metadata;
          }
        } catch { /* ignore */ }
        return { ...item, parsedMetadata: parsedMeta };
      });

      setStats(statsData);
      setUsers(usersData.users || []);
      setActivity(parsedActivity);
      setFeedback(feedbackData.feedback || []);
      setLastUpdated(new Date());
      setError('');
    } catch (err) {
      console.error('[Admin] Fetch error:', err);
      setError('Failed to load dashboard data');
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
  useEffect(() => {
    fetchData();
    intervalRef.current = setInterval(fetchData, 30_000);
    return () => clearInterval(intervalRef.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load reports + clusters on Reports tab ─────────────────────────────────────
  useEffect(() => {
    if (activeTab === 'reports') {
      fetchReports();
      fetchClusters();
    }
  }, [activeTab, fetchReports, fetchClusters]);

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
    } catch (err) {
      const msg = err.message || `Failed to ${status} report`;
      setError(msg);
      addToast('error', msg);
    } finally {
      setProcessingReport(null);
    }
  }, [adminNotes, fetchReports, addToast]);

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
    } catch (err) {
      const msg = err.message || `Failed to ${status} cluster`;
      setError(msg);
      addToast('error', msg);
    } finally {
      setClusterProcessing(null);
    }
  }, [clusterNotes, fetchClusters, addToast]);

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
    feedback: 'Path Ratings',
    users:    'User Management',
    activity: 'Activity Log',
  }[activeTab] ?? 'Dashboard';

  return (
    <div className="admin-dashboard">
      <button
        className="admin-mobile-menu-btn"
        onClick={() => { trigger(10); setMobileMenuOpen(o => !o); }}
        aria-label="Toggle menu"
      >
        {mobileMenuOpen ? <Icons.Close /> : <Icons.Menu />}
      </button>

      {/* ── Sidebar ──────────────────────────────────────────────────────────── */}
      <aside className={`admin-sidebar ${mobileMenuOpen ? 'open' : ''}`}>
        <div className="admin-sidebar-header">
          <div className="admin-logo">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z" fill="#2563eb"/>
            </svg>
            <span>UG Navigator</span>
          </div>
          <p className="admin-sidebar-subtitle">Admin Portal</p>
        </div>

        <nav className="admin-nav">
          {[
            { key: 'overview', label: 'Overview', Icon: Icons.Dashboard },
            { key: 'reports',  label: 'Reports',  Icon: Icons.Flag,     badge: pendingCount },
            { key: 'feedback', label: 'Ratings',  Icon: Icons.Star },
            { key: 'users',    label: 'Users',    Icon: Icons.Users },
            { key: 'activity', label: 'Activity', Icon: Icons.Activity },
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
                  <button className="settings-dropdown-item" onClick={() => { trigger(10); setShowSettings(false); addToast('success', 'Profile settings coming soon'); }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    Profile
                  </button>
                  <button className="settings-dropdown-item" onClick={() => { trigger(10); setShowSettings(false); addToast('success', 'Preferences coming soon'); }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                    Preferences
                  </button>
                </div>
              )}
            </div>
            <button onClick={() => { trigger(10); if (!isRefreshing) fetchData(); }} className="admin-topbar-btn" disabled={isRefreshing}>
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
                  <span className="stat-card-value">{formatNumber(stats?.users?.total)}</span>
                  <span className="stat-card-label">Total Users</span>
                </div>
                <div className="stat-card-trend positive">+{stats?.users?.newThisWeek || 0} this week</div>
              </div>
              <div className="stat-card">
                <div className="stat-card-icon green"><Icons.TrendingUp /></div>
                <div className="stat-card-content">
                  <span className="stat-card-value">{stats?.users?.activeToday || 0}</span>
                  <span className="stat-card-label">Active Today</span>
                </div>
                <div className="stat-card-trend">{stats?.users?.activeWeek || 0} active this week</div>
              </div>
              <div className="stat-card">
                <div className="stat-card-icon purple"><Icons.RouteIcon /></div>
                <div className="stat-card-content">
                  <span className="stat-card-value">{stats?.routes?.today || 0}</span>
                  <span className="stat-card-label">Routes Today</span>
                </div>
                <div className="stat-card-trend">{formatNumber(stats?.routes?.total)} total routes</div>
              </div>
              <div className="stat-card">
                <div className="stat-card-icon orange"><Icons.Activity /></div>
                <div className="stat-card-content">
                  <span className="stat-card-value">{pendingCount}</span>
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
                            <button
                              className={`star-default-btn${idx === 0 ? ' is-default' : ''}`}
                              onClick={() => { trigger(10); }}
                              title="Set as default profile"
                            >
                              <svg viewBox="0 0 24 24" fill={idx === 0 ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                              </svg>
                            </button>
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
                    <div className="admin-empty"><p>No route data yet.</p></div>
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
                    <div className="admin-empty"><p>No destination data yet</p></div>
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
                {activity.length === 0 && <div className="admin-empty"><p>No activity yet.</p></div>}
              </div>
            </div>
          </>
        )}

        {/* ── Feedback / Ratings ─────────────────────────────────────────────── */}
        {activeTab === 'feedback' && (
          <div className="admin-card full-width">
            <div className="admin-table-header">
              <h3>Path Feedback & Ratings</h3>
              <span className="admin-table-stats">{feedback.length} total ratings</span>
            </div>
            <div className="feedback-grid">
              {feedback.length > 0 ? feedback.map((item) => (
                <div key={item.id} className="feedback-card">
                  <div className="feedback-card-top">
                    <span className="feedback-profile">{item.profile_key}</span>
                    <div className="feedback-stars">
                      {'★'.repeat(item.rating)}{'☆'.repeat(5 - item.rating)}
                    </div>
                  </div>
                  <p className="feedback-comment">{item.comment || "No comment provided."}</p>
                  <div className="feedback-meta">
                    <span>User: {item.user_id?.substring(0, 8) || 'Guest'}</span>
                    <span>{new Date(item.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              )) : (
                <div className="admin-empty"><p>No feedback yet.</p></div>
              )}
            </div>
          </div>
        )}

        {/* ── Reports + Messages (merged) ────────────────────────────────────── */}
        {activeTab === 'reports' && (
          <>
            {/* ── Pending Clusters ──────────────────────────────────────────── */}
            <div className="admin-card full-width">
              <div className="admin-table-header">
                <h3>Pending Reports</h3>
                <span className="admin-table-stats">
                  {clusters.length} cluster{clusters.length !== 1 ? 's' : ''} · {reports.length} pending
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

              {clusters.length === 0 ? (
                <div className="admin-empty">
                  <div className="admin-empty-icon">&#10003;</div>
                  <p>No reports to review. All clear!</p>
                </div>
              ) : (
                <div className="clusters-list">
                  {(searchReports
                    ? clusters.filter(c =>
                        (ISSUE_TYPE_LABELS[c.issue_type] || c.issue_type || '').toLowerCase().includes(searchReports.toLowerCase()) ||
                        (c.location_name || '').toLowerCase().includes(searchReports.toLowerCase())
                      )
                    : clusters
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
              <span className="admin-table-stats">{users.length} total users</span>
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
        </div>
      </main>

      <LogoutConfirmationModal
        isOpen={showLogoutModal}
        onClose={() => { trigger(10); setShowLogoutModal(false); }}
        onConfirm={() => { logout(); }}
      />

      {/* ── Toast Container ──────────────────────────────────────────────────── */}
      {toasts.length > 0 && (
        <div className="toast-container">
          {toasts.map((t) => (
            <div key={t.id} className={`toast toast-${t.type}`}>
              {t.type === 'success' ? <Icons.Check /> : <Icons.AlertIcon />}
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
