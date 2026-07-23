// frontend/src/components/Admin/AdminDashboard.jsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuthContext } from '../../context/AuthContext';
import { API_URL } from '../../config';
import { getReports, updateReportStatus, getReportClusters, resolveCluster, getReportMessages, sendReportMessage } from '../../services/reportService';
import { isTokenValid } from '../Profile/auth';
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

function formatCoordinate(lat, lng) {
  // Postgres numeric columns come back as strings from the pg driver
  const numLat = parseFloat(lat);
  const numLng = parseFloat(lng);
  if (isNaN(numLat) || isNaN(numLng)) return 'Invalid coordinates';
  return `${numLat.toFixed(6)}, ${numLng.toFixed(6)}`;
}

function getActivityDisplay(item) {
  const meta = item.parsedMetadata || {};
  switch (item.activity_type) {
    case 'route_calculated':
      return `🗺️ Route: ${meta.start_location || '?'} → ${meta.end_location || '?'} (${meta.profile_used || 'standard'})`;
    case 'search':
      return `🔍 Searched: "${meta.query || '?'}" → ${meta.selected_result || '?'}`;
    case 'login':
      return `🔐 Logged in from ${meta.browser || 'device'}`;
    case 'register':
      return `📝 New user registered: ${meta.email || ''}`;
    default:
      return item.activity_type;
  }
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const { logout, user } = useAuthContext();

  const [stats,            setStats]            = useState(null);
  const [users,            setUsers]            = useState([]);
  const [activity,         setActivity]         = useState([]);
  const [reports,          setReports]          = useState([]);
  const [feedback,         setFeedback]         = useState([]);
  const [pendingCount,     setPendingCount]      = useState(0); // sidebar badge — always fresh
  const [isLoading,        setIsLoading]        = useState(true);
  const [error,            setError]            = useState('');
  const [lastUpdated,      setLastUpdated]      = useState(null);
  const [activeTab,        setActiveTab]        = useState('overview');
  const [mobileMenuOpen,   setMobileMenuOpen]   = useState(false);
  const [processingReport, setProcessingReport] = useState(null);
  const [adminNotes,       setAdminNotes]       = useState({});
  const [successMessage,   setSuccessMessage]   = useState('');
  const [clusters,         setClusters]         = useState([]);
  const [expandedCluster,  setExpandedCluster]  = useState(null);
  const [clusterNotes,     setClusterNotes]     = useState({});
  const [clusterProcessing, setClusterProcessing] = useState(null);
  const [reportMessages,   setReportMessages]   = useState({});
  const [newMessage,       setNewMessage]       = useState({});
  const [sendingMessage,   setSendingMessage]   = useState(null);
  const [messageThreadReport, setMessageThreadReport] = useState(null);

  // Use a ref for the interval so it never re-registers on tab change
  const intervalRef = useRef(null);

  // ── Fetch pending count for sidebar badge (always, regardless of tab) ──────
  const fetchPendingCount = useCallback(async () => {
    try {
      const token = getToken();
      if (!token) return;
      const res  = await fetch(`${API_URL}/api/reports/stats/summary`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setPendingCount(Number(data.stats?.pending) || 0);
    } catch {
      // silent — badge is non-critical
    }
  }, []);

  // ── Fetch reports list (used by Reports tab + after approve/reject) ─────────
  const fetchReports = useCallback(async () => {
    try {
      const data = await getReports('pending', 100);
      setReports(data.reports || []);
      setPendingCount(data.reports?.length ?? 0);
    } catch (err) {
      console.error('[Admin] Fetch reports error:', err);
    }
  }, []);

  // ── Fetch report clusters (grouped by proximity + issue type) ────────────────
  const fetchClusters = useCallback(async () => {
    try {
      const data = await getReportClusters();
      setClusters(data.clusters || []);
    } catch (err) {
      console.error('[Admin] Fetch clusters error:', err);
    }
  }, []);

  // ── Fetch main dashboard data ────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    try {
      const token = getToken();
      if (!token) {
        window.location.href = '/';
        return;
      }
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      };

      // Added feedbackRes to the parallel fetch
      const [statsRes, usersRes, activityRes, feedbackRes] = await Promise.all([
        fetch(`${API_URL}/admin/stats`,    { headers }),
        fetch(`${API_URL}/admin/users`,    { headers }),
        fetch(`${API_URL}/admin/activity`, { headers }),
        fetch(`${API_URL}/api/reports/feedback`, { headers }),
      ]);

      // Any 401/403 means token expired or invalid — redirect to login
      if ([statsRes, usersRes, activityRes, feedbackRes].some(r => r.status === 401 || r.status === 403)) {
        console.warn('[Admin] Auth session invalid, redirecting to login');
        sessionStorage.removeItem('accessToken');
        sessionStorage.removeItem('refreshToken');
        sessionStorage.removeItem('user');
        window.location.href = '/';
        return;
      }

      // Parse each response, falling back to defaults on error
      const statsData    = statsRes.ok    ? await statsRes.json()    : {};
      const usersData    = usersRes.ok    ? await usersRes.json()    : { users: [] };
      const activityData = activityRes.ok ? await activityRes.json() : { activity: [] };
      const feedbackData = feedbackRes.ok ? await feedbackRes.json() : { feedback: [] };

      if (!statsRes.ok) {
        console.error('[Admin] Stats fetch failed:', statsRes.status);
      }

      const parsedActivity = (activityData.activity || []).map(item => {
        let parsedMeta = {};
        try {
          if (item.metadata) {
            parsedMeta = typeof item.metadata === 'string'
              ? JSON.parse(item.metadata)
              : item.metadata;
          }
        } catch { /* ignore malformed metadata */ }
        return { ...item, parsedMetadata: parsedMeta };
      });

      setStats(statsData);
      setUsers(usersData.users || []);
      setActivity(parsedActivity);
      setFeedback(feedbackData.feedback || []);
      setLastUpdated(new Date());
      setError('');

      // Always refresh pending count so sidebar badge is accurate
      await fetchPendingCount();
    } catch (err) {
      console.error('[Admin] Fetch error:', err);
      setError('Failed to load dashboard data');
    } finally {
      setIsLoading(false);
    }
  }, [fetchPendingCount]);

  // ── Initial load + stable 30-second poll (never re-registers) ───────────────
  useEffect(() => {
    fetchData();
    intervalRef.current = setInterval(fetchData, 30_000);
    return () => clearInterval(intervalRef.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // fetchData is stable (no deps change) so the empty array is safe here

  // ── Load reports + clusters when switching to Reports tab ────────────────────
  useEffect(() => {
    if (activeTab === 'reports') {
      fetchReports();
      fetchClusters();
    }
  }, [activeTab, fetchReports, fetchClusters]);

  // ── Approve / Reject ─────────────────────────────────────────────────────────
  const handleUpdateReport = useCallback(async (reportId, status) => {
    setProcessingReport(reportId);
    setError('');
    setSuccessMessage('');
    try {
      await updateReportStatus(reportId, status, adminNotes[reportId] || '');
      setAdminNotes(prev => ({ ...prev, [reportId]: '' }));
      setSuccessMessage(`Report #${reportId} ${status} successfully`);
      await fetchReports();
      fetchData();
    } catch (err) {
      setError(err.message || `Failed to ${status} report`);
    } finally {
      setProcessingReport(null);
      // Auto-clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(''), 3000);
    }
  }, [adminNotes, fetchReports, fetchData]);

  const handleApproveReport = (id) => handleUpdateReport(id, 'approved');
  const handleRejectReport  = (id) => handleUpdateReport(id, 'rejected');

  // ── Cluster bulk resolve ─────────────────────────────────────────────────────
  const handleClusterResolve = useCallback(async (cluster, status) => {
    const reportIds = cluster.reports.map(r => r.id);
    setClusterProcessing(cluster.id);
    setError('');
    setSuccessMessage('');
    try {
      await resolveCluster(reportIds, status, clusterNotes[cluster.id] || '');
      setClusterNotes(prev => ({ ...prev, [cluster.id]: '' }));
      setSuccessMessage(`${cluster.reports.length} report(s) ${status} successfully`);
      await fetchReports();
      await fetchClusters();
      fetchData();
    } catch (err) {
      setError(err.message || `Failed to ${status} cluster`);
    } finally {
      setClusterProcessing(null);
      setTimeout(() => setSuccessMessage(''), 3000);
    }
  }, [clusterNotes, fetchReports, fetchClusters, fetchData]);

  // ── Messaging: load messages for a report ────────────────────────────────────
  const loadMessages = useCallback(async (reportId) => {
    try {
      const data = await getReportMessages(reportId);
      setReportMessages(prev => ({ ...prev, [reportId]: data.messages || [] }));
    } catch (err) {
      console.error('[Admin] Load messages error:', err);
    }
  }, []);

  const handleSendMessage = useCallback(async (reportId) => {
    const text = (newMessage[reportId] || '').trim();
    if (!text) return;

    setSendingMessage(reportId);
    try {
      await sendReportMessage(reportId, text);
      setNewMessage(prev => ({ ...prev, [reportId]: '' }));
      await loadMessages(reportId);
    } catch (err) {
      setError(err.message || 'Failed to send message');
    } finally {
      setSendingMessage(null);
    }
  }, [newMessage, loadMessages]);

  const switchTab = (tab) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
    setError(''); // clear errors on tab switch
  };

  // ── Loading state ─────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="admin-loading">
        <div className="admin-loading-spinner" />
        <p>Loading dashboard...</p>
      </div>
    );
  }

  const tabTitle = {
    overview: 'Dashboard',
    reports:  'Accessibility Reports',
    feedback: 'Path Ratings',
    users:    'User Management',
    activity: 'Activity Log',
  }[activeTab] ?? 'Dashboard';

  return (
    <div className="admin-dashboard">
      {/* Mobile menu toggle */}
      <button
        className="admin-mobile-menu-btn"
        onClick={() => setMobileMenuOpen(o => !o)}
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
            { key: 'overview',  label: 'Overview', Icon: Icons.Dashboard },
            { key: 'reports',   label: 'Reports',  Icon: Icons.Flag,     badge: pendingCount },
            { key: 'feedback',  label: 'Ratings',  Icon: Icons.Star },
            { key: 'users',     label: 'Users',    Icon: Icons.Users },
            { key: 'activity',  label: 'Activity', Icon: Icons.Activity },
          ].map(({ key, label, Icon, badge }) => (
            <button
              key={key}
              className={`admin-nav-item ${activeTab === key ? 'active' : ''}`}
              onClick={() => switchTab(key)}
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
          <button onClick={logout} className="admin-logout-btn">
            <Icons.Logout />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <main className="admin-main">
        <div className="admin-main-header">
          <div>
            <h1>{tabTitle}</h1>
            <p>Welcome back, {user?.username || 'Admin'}</p>
          </div>
          <div className="admin-header-actions">
            <span className="admin-last-updated">
              Updated: {lastUpdated?.toLocaleTimeString() || '--:--:--'}
            </span>
            <button onClick={fetchData} className="admin-refresh-btn">
              <Icons.Refresh />
              Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="admin-error">
            <Icons.AlertIcon />
            <span>{error}</span>
            <button
              className="admin-error-dismiss"
              onClick={() => setError('')}
              aria-label="Dismiss error"
            >
              <Icons.X />
            </button>
          </div>
        )}

        {successMessage && (
          <div className="admin-success">
            <Icons.Check />
            <span>{successMessage}</span>
            <button
              className="admin-success-dismiss"
              onClick={() => setSuccessMessage('')}
              aria-label="Dismiss"
            >
              <Icons.X />
            </button>
          </div>
        )}

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
                <div className="stat-card-trend positive">
                  +{stats?.users?.newThisWeek || 0} this week
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-card-icon green"><Icons.TrendingUp /></div>
                <div className="stat-card-content">
                  <span className="stat-card-value">{stats?.users?.activeToday || 0}</span>
                  <span className="stat-card-label">Active Today</span>
                </div>
                <div className="stat-card-trend">
                  {stats?.users?.activeWeek || 0} active this week
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-card-icon purple"><Icons.RouteIcon /></div>
                <div className="stat-card-content">
                  <span className="stat-card-value">{stats?.routes?.today || 0}</span>
                  <span className="stat-card-label">Routes Today</span>
                </div>
                <div className="stat-card-trend">
                  {formatNumber(stats?.routes?.total)} total routes
                </div>
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
                    stats.profilePreferences.map((p) => (
                      <div key={p.profile_used} className="profile-bar">
                        <div className="profile-bar-header">
                          <span className="profile-name">{p.profile_used}</span>
                          <span className="profile-percent">
                            {stats.routes?.total
                              ? ((p.count / stats.routes.total) * 100).toFixed(0)
                              : 0}%
                          </span>
                        </div>
                        <div className="progress-bar">
                          <div
                            className="progress-fill"
                            style={{
                              width: stats.routes?.total
                                ? `${(p.count / stats.routes.total) * 100}%`
                                : '0%'
                            }}
                          />
                        </div>
                        <div className="profile-count">{p.count} routes</div>
                      </div>
                    ))
                  ) : (
                    <div className="no-data">No route data yet.</div>
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
                    <div className="no-data">No destination data yet</div>
                  )}
                </div>
              </div>
            </div>

            <div className="admin-card full-width">
              <h3>Security Overview (Last 24h)</h3>
              <div className="security-stats-grid">
                <div className="security-stat">
                  <span className="security-label">Failed Logins</span>
                  <span className={`security-value ${stats?.security?.failedLogins24h > 10 ? 'warning' : ''}`}>
                    {stats?.security?.failedLogins24h || 0}
                  </span>
                </div>
                <div className="security-stat">
                  <span className="security-label">Password Resets</span>
                  <span className="security-value">{stats?.security?.passwordResets24h || 0}</span>
                </div>
                <div className="security-stat">
                  <span className="security-label">Rate Limit Hits</span>
                  <span className="security-value">{stats?.security?.rateLimitHits24h || 0}</span>
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
                  <div className="no-data">No activity yet.</div>
                )}
              </div>
            </div>
          </>
        )}

        {/* ── Feedback / Ratings Tab ────────────────────────────────────────── */}
        {activeTab === 'feedback' && (
          <div className="admin-card full-width">
            <div className="admin-table-header">
              <h3>Path Feedback & Ratings</h3>
              <p>User feedback on specific route profiles</p>
            </div>
            <div className="feedback-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px', padding: '20px 0' }}>
              {feedback.length > 0 ? feedback.map((item) => (
                <div key={item.id} className="feedback-card" style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '16px', padding: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <span style={{ fontWeight: '700', textTransform: 'capitalize', color: 'var(--profile-color)' }}>{item.profile_key}</span>
                    <div style={{ color: '#f59e0b' }}>
                      {'★'.repeat(item.rating)}{'☆'.repeat(5 - item.rating)}
                    </div>
                  </div>
                  <p style={{ fontSize: '14px', color: 'var(--text)', marginBottom: '12px' }}>
                    {item.comment || "No comment provided."}
                  </p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--sub)' }}>
                    <span>User ID: {item.user_id?.substring(0, 8) || 'Guest'}</span>
                    <span>{new Date(item.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              )) : (
                <div className="no-data">No feedback yet.</div>
              )}
            </div>
          </div>
        )}

        {/* ── Reports (Cluster View) ──────────────────────────────────────── */}
        {activeTab === 'reports' && (
          <div className="admin-card full-width">
            <div className="admin-table-header">
              <h3>Accessibility Reports — Cluster View</h3>
              <span className="admin-table-stats">
                {clusters.length} cluster(s) · {reports.length} pending report(s)
              </span>
            </div>

            {clusters.length === 0 ? (
              <div className="no-data" style={{ textAlign: 'center', padding: '48px 20px' }}>
                <div style={{ fontSize: '48px', marginBottom: '12px' }}>✅</div>
                <p>No reports to review. All clear!</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px 0' }}>
                {clusters.map((cluster) => {
                  const severity = SEVERITY_CONFIG[cluster.max_severity] || SEVERITY_CONFIG[2];
                  const isExpanded = expandedCluster === cluster.id;
                  const isProcessing = clusterProcessing === cluster.id;
                  const hasPending = cluster.reports.some(r => r.status === 'pending');
                  const hasApproved = cluster.reports.some(r => r.status === 'approved');

                  return (
                    <div key={cluster.id} style={{
                      background: 'var(--panel, #fff)',
                      border: `2px solid ${hasPending ? severity.border : 'var(--border, #e2e8f0)'}`,
                      borderRadius: '16px',
                      overflow: 'hidden',
                    }}>
                      {/* Cluster Header */}
                      <div style={{
                        padding: '16px 20px',
                        borderBottom: isExpanded ? '1px solid var(--border, #e2e8f0)' : 'none',
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                              <span style={{ fontSize: '20px' }}>
                                {cluster.max_severity === 3 ? '🔴' : cluster.max_severity === 2 ? '🟡' : '🟢'}
                              </span>
                              <span style={{ fontWeight: '700', fontSize: '16px', color: 'var(--text)' }}>
                                {ISSUE_TYPE_LABELS[cluster.issue_type] || cluster.issue_type}
                              </span>
                              {cluster.location_name && (
                                <span style={{ fontSize: '13px', color: 'var(--sub, #64748b)' }}>
                                  — {cluster.location_name}
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--sub, #64748b)' }}>
                              📍 {cluster.lat.toFixed(5)}, {cluster.lng.toFixed(5)}
                            </div>
                          </div>

                          <span style={{
                            fontSize: '12px',
                            fontWeight: '700',
                            padding: '4px 12px',
                            borderRadius: '20px',
                            background: severity.bg,
                            color: severity.color,
                          }}>
                            Severity {cluster.avg_severity}
                          </span>
                        </div>

                        {/* Stats Row */}
                        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '13px', color: 'var(--text)' }}>
                          <span><strong>{cluster.report_count}</strong> report{cluster.report_count > 1 ? 's' : ''}</span>
                          {cluster.open_count > 0 && <span style={{ color: '#f59e0b' }}>{cluster.open_count} pending</span>}
                          {cluster.approved_count > 0 && <span style={{ color: '#22c55e' }}>{cluster.approved_count} approved</span>}
                          {cluster.resolved_count > 0 && <span style={{ color: '#6366f1' }}>{cluster.resolved_count} resolved</span>}
                          {cluster.rejected_count > 0 && <span style={{ color: '#ef4444' }}>{cluster.rejected_count} rejected</span>}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--sub, #94a3b8)', marginTop: '4px' }}>
                          First: {new Date(cluster.first_reported).toLocaleDateString()} · Latest: {new Date(cluster.latest_reported).toLocaleString()}
                        </div>

                        {/* Action Buttons */}
                        <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                          <button
                            onClick={() => {
                              setExpandedCluster(isExpanded ? null : cluster.id);
                              if (!isExpanded) {
                                cluster.reports.forEach(r => loadMessages(r.id));
                              }
                            }}
                            style={{
                              fontSize: '13px', fontWeight: '600', padding: '6px 14px',
                              borderRadius: '8px', border: '1px solid var(--border)',
                              background: 'transparent', color: 'var(--text)', cursor: 'pointer',
                            }}
                          >
                            {isExpanded ? 'Collapse' : `View ${cluster.report_count} report${cluster.report_count > 1 ? 's' : ''}`}
                          </button>

                          {hasPending && (
                            <>
                              <button
                                onClick={() => handleClusterResolve(cluster, 'rejected')}
                                disabled={isProcessing}
                                style={{
                                  fontSize: '13px', fontWeight: '600', padding: '6px 14px',
                                  borderRadius: '8px', border: '1px solid #ef4444',
                                  background: isProcessing ? '#ef444420' : 'transparent',
                                  color: '#ef4444', cursor: isProcessing ? 'wait' : 'pointer',
                                }}
                              >
                                {isProcessing ? '...' : 'Reject All'}
                              </button>
                              <button
                                onClick={() => handleClusterResolve(cluster, 'approved')}
                                disabled={isProcessing}
                                style={{
                                  fontSize: '13px', fontWeight: '600', padding: '6px 14px',
                                  borderRadius: '8px', border: '1px solid #22c55e',
                                  background: isProcessing ? '#22c55e20' : 'transparent',
                                  color: '#22c55e', cursor: isProcessing ? 'wait' : 'pointer',
                                }}
                              >
                                {isProcessing ? '...' : 'Approve All'}
                              </button>
                            </>
                          )}

                          {hasApproved && !hasPending && (
                            <button
                              onClick={() => handleClusterResolve(cluster, 'resolved')}
                              disabled={isProcessing}
                              style={{
                                fontSize: '13px', fontWeight: '600', padding: '6px 14px',
                                borderRadius: '8px', border: '1px solid #6366f1',
                                background: isProcessing ? '#6366f120' : 'transparent',
                                color: '#6366f1', cursor: isProcessing ? 'wait' : 'pointer',
                              }}
                            >
                              {isProcessing ? '...' : 'Resolve All'}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Expanded: Individual Reports */}
                      {isExpanded && (
                        <div style={{ padding: '16px 20px' }}>
                          {/* Admin Notes */}
                          <textarea
                            placeholder="Admin notes for this cluster (visible to reporters)..."
                            value={clusterNotes[cluster.id] || ''}
                            onChange={(e) => setClusterNotes(prev => ({ ...prev, [cluster.id]: e.target.value }))}
                            rows={2}
                            disabled={isProcessing}
                            style={{
                              width: '100%', boxSizing: 'border-box', padding: '10px',
                              borderRadius: '8px', border: '1px solid var(--border)',
                              background: 'var(--bg, #f8fafc)', color: 'var(--text)',
                              fontSize: '13px', resize: 'vertical', marginBottom: '12px',
                            }}
                          />

                          {cluster.reports.map((report) => {
                            const rSeverity = SEVERITY_CONFIG[report.severity] || SEVERITY_CONFIG[2];
                            const isReportProcessing = processingReport === report.id;
                            const msgs = reportMessages[report.id] || [];

                            return (
                              <div key={report.id} style={{
                                border: '1px solid var(--border, #e2e8f0)',
                                borderRadius: '12px', padding: '14px', marginBottom: '12px',
                                background: 'var(--bg, #f8fafc)',
                              }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontWeight: '700', fontSize: '14px' }}>#{report.id}</span>
                                    <span style={{
                                      fontSize: '11px', fontWeight: '600', padding: '2px 8px',
                                      borderRadius: '12px', background: rSeverity.bg, color: rSeverity.color,
                                    }}>
                                      {rSeverity.label}
                                    </span>
                                    <span style={{
                                      fontSize: '11px', fontWeight: '600', padding: '2px 8px',
                                      borderRadius: '12px',
                                      background: report.status === 'pending' ? '#f59e0b18' : report.status === 'approved' ? '#22c55e18' : '#6366f118',
                                      color: report.status === 'pending' ? '#f59e0b' : report.status === 'approved' ? '#22c55e' : '#6366f1',
                                    }}>
                                      {report.status}
                                    </span>
                                  </div>
                                  <span style={{ fontSize: '11px', color: 'var(--sub, #94a3b8)' }}>
                                    {new Date(report.created_at).toLocaleString()}
                                  </span>
                                </div>

                                {report.location_name && (
                                  <div style={{ fontSize: '13px', color: 'var(--sub, #64748b)', marginBottom: '4px' }}>
                                    📍 {report.location_name}
                                  </div>
                                )}
                                {report.custom_description && (
                                  <div style={{ fontSize: '13px', color: 'var(--text)', marginBottom: '8px', fontStyle: 'italic' }}>
                                    "{report.custom_description}"
                                  </div>
                                )}
                                {report.admin_notes && (
                                  <div style={{ fontSize: '12px', color: '#6366f1', marginBottom: '8px', padding: '6px 10px', background: '#6366f110', borderRadius: '6px' }}>
                                    Admin note: {report.admin_notes}
                                  </div>
                                )}

                                {/* Individual report actions */}
                                {report.status === 'pending' && (
                                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                                    <button
                                      onClick={() => handleRejectReport(report.id)}
                                      disabled={isReportProcessing}
                                      style={{
                                        fontSize: '12px', fontWeight: '600', padding: '4px 12px',
                                        borderRadius: '6px', border: '1px solid #ef4444',
                                        background: 'transparent', color: '#ef4444', cursor: 'pointer',
                                      }}
                                    >
                                      {isReportProcessing ? '...' : 'Reject'}
                                    </button>
                                    <button
                                      onClick={() => handleApproveReport(report.id)}
                                      disabled={isReportProcessing}
                                      style={{
                                        fontSize: '12px', fontWeight: '600', padding: '4px 12px',
                                        borderRadius: '6px', border: '1px solid #22c55e',
                                        background: 'transparent', color: '#22c55e', cursor: 'pointer',
                                      }}
                                    >
                                      {isReportProcessing ? '...' : 'Approve'}
                                    </button>
                                  </div>
                                )}

                                {/* Message Thread */}
                                <div style={{ marginTop: '12px', borderTop: '1px solid var(--border, #e2e8f0)', paddingTop: '12px' }}>
                                  <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--sub, #64748b)', marginBottom: '8px' }}>
                                    Messages ({msgs.length})
                                  </div>
                                  {msgs.length > 0 && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px' }}>
                                      {msgs.map(msg => (
                                        <div key={msg.id} style={{
                                          padding: '8px 12px', borderRadius: '8px',
                                          background: msg.sender_is_admin ? '#2563eb10' : '#f1f5f9',
                                          borderLeft: msg.sender_is_admin ? '3px solid #2563eb' : '3px solid transparent',
                                          fontSize: '13px',
                                        }}>
                                          <div style={{ fontSize: '11px', fontWeight: '600', color: msg.sender_is_admin ? '#2563eb' : 'var(--text)', marginBottom: '2px' }}>
                                            {msg.sender_is_admin ? 'Admin' : msg.sender_name || 'User'} · {new Date(msg.created_at).toLocaleString()}
                                          </div>
                                          <div style={{ color: 'var(--text)' }}>{msg.message}</div>
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  {/* Send Message Input */}
                                  <div style={{ display: 'flex', gap: '8px' }}>
                                    <input
                                      type="text"
                                      placeholder="Send a message to the reporter..."
                                      value={newMessage[report.id] || ''}
                                      onChange={(e) => setNewMessage(prev => ({ ...prev, [report.id]: e.target.value }))}
                                      onKeyDown={(e) => { if (e.key === 'Enter') handleSendMessage(report.id); }}
                                      disabled={sendingMessage === report.id}
                                      style={{
                                        flex: 1, padding: '8px 12px', borderRadius: '8px',
                                        border: '1px solid var(--border)', fontSize: '13px',
                                        background: 'var(--bg, #fff)', color: 'var(--text)',
                                      }}
                                    />
                                    <button
                                      onClick={() => handleSendMessage(report.id)}
                                      disabled={sendingMessage === report.id || !(newMessage[report.id] || '').trim()}
                                      style={{
                                        fontSize: '13px', fontWeight: '600', padding: '8px 16px',
                                        borderRadius: '8px', border: 'none',
                                        background: '#2563eb', color: '#fff', cursor: 'pointer',
                                        opacity: sendingMessage === report.id || !(newMessage[report.id] || '').trim() ? 0.5 : 1,
                                      }}
                                    >
                                      {sendingMessage === report.id ? '...' : 'Send'}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Users ──────────────────────────────────────────────────────────── */}
        {activeTab === 'users' && (
          <div className="admin-card full-width">
            <div className="admin-table-header">
              <h3>All Users</h3>
              <span className="admin-table-stats">{users.length} total users</span>
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
                  {users.map((u) => (
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
                  {activity.map((a) => (
                    <tr key={a.id}>
                      <td data-label="User">{a.username || a.email}</td>
                      <td data-label="Activity">{getActivityDisplay(a)}</td>
                      <td data-label="Time">{new Date(a.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                  {activity.length === 0 && (
                    <tr>
                      <td colSpan="3" className="no-data">No activity recorded</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}