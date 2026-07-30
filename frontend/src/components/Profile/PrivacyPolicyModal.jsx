import { useState, useEffect, useRef } from 'react';
import { useHaptics } from '../../hooks/useHaptics';
import './PrivacyPolicyModal.css';

const IconClose = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

const IconShield = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>
);

const IconDatabase = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx="12" cy="5" rx="9" ry="3"/>
    <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
    <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
  </svg>
);

const IconArchive = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="3" width="20" height="5" rx="1"/>
    <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/>
    <path d="M10 12h4"/>
  </svg>
);

const IconSettings = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
);

const IconShare2 = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="18" cy="5" r="3"/>
    <circle cx="6" cy="12" r="3"/>
    <circle cx="18" cy="19" r="3"/>
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
  </svg>
);

const IconScale = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2v20M4 6l8-4 8 4M4 18l8 4 8-4"/>
    <path d="M4 6v12M20 6v12"/>
  </svg>
);

const IconLock = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
);

const IconMail = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
    <polyline points="22,6 12,13 2,6"/>
  </svg>
);

const IconUser = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>
);

const IconMapPin = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
    <circle cx="12" cy="10" r="3"/>
  </svg>
);

const IconRoute = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
  </svg>
);

const IconSmartphone = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
    <line x1="12" y1="18" x2="12.01" y2="18"/>
  </svg>
);

const IconHardDrive = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="12" x2="2" y2="12"/>
    <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>
    <line x1="6" y1="16" x2="6.01" y2="16"/>
    <line x1="10" y1="16" x2="10.01" y2="16"/>
  </svg>
);

const IconBarChart = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 20V10M12 20V4M6 20v-6"/>
  </svg>
);

const IconXCircle = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="15" y1="9" x2="9" y2="15"/>
    <line x1="9" y1="9" x2="15" y2="15"/>
  </svg>
);

const IconFlame = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2C12 2 8 6 8 10c0 2.2 1.8 4 4 4s4-1.8 4-4c0-4-4-8-4-8z"/>
    <path d="M12 14c-2.2 0-4 1.8-4 4 0 2.2 1.8 4 4 4s4-1.8 4-4c0-2.2-1.8-4-4-4z"/>
  </svg>
);

const IconMap = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/>
    <line x1="8" y1="2" x2="8" y2="18"/>
    <line x1="16" y1="6" x2="16" y2="22"/>
  </svg>
);

const IconCloud = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9z"/>
  </svg>
);

const IconShieldSmall = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>
);

const IconAlertTriangle = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/>
    <line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
);

const IconEye = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
);

const IconEdit = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);

const IconTrash = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
  </svg>
);

const IconDownload = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
);

const IconSearch = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/>
    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
);

const IconBuilding = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="2" width="16" height="20" rx="2" ry="2"/>
    <path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01"/>
  </svg>
);

const IconInfo = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" y1="16" x2="12" y2="12"/>
    <line x1="12" y1="8" x2="12.01" y2="8"/>
  </svg>
);

const IconMinimize = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>
  </svg>
);

function SectionHeader({ icon, title }) {
  return (
    <div className="ppolicy-section-header">
      {icon}
      <h3 className="ppolicy-section-title">{title}</h3>
    </div>
  );
}

function Card({ icon, accentColor, iconBg, title, children }) {
  return (
    <div className="ppolicy-card">
      <div className="ppolicy-card-icon" style={{ background: iconBg || `${accentColor}18`, color: accentColor }}>
        {icon}
      </div>
      <div className="ppolicy-card-body">
        <strong>{title}</strong>
        <p>{children}</p>
      </div>
    </div>
  );
}

function HighlightCard({ icon, accentColor, title, children }) {
  return (
    <div className="ppolicy-highlight">
      <div className="ppolicy-highlight-icon" style={{ background: `${accentColor}18`, color: accentColor }}>
        {icon}
      </div>
      <div className="ppolicy-highlight-body">
        <strong>{title}</strong>
        <p>{children}</p>
      </div>
    </div>
  );
}

export default function PrivacyPolicyModal({ isOpen, onClose }) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const firstFocusRef = useRef(null);
  const overlayRef = useRef(null);
  const { trigger } = useHaptics();

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
      const modal = overlayRef.current?.querySelector('.ppolicy-modal');
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

  if (!mounted) return null;

  return (
    <div
      ref={overlayRef}
      className={`ppolicy-overlay ${visible ? 'ppolicy-overlay--visible' : ''}`}
      onClick={() => { trigger(10); onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Privacy policy"
    >
      <div
        className={`ppolicy-modal ${visible ? 'ppolicy-modal--visible' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ppolicy-header">
          <h2>Privacy &amp; Cookies</h2>
          <button className="ppolicy-close" onClick={() => { trigger(10); onClose(); }} ref={firstFocusRef} aria-label="Close privacy policy">
            <IconClose />
          </button>
        </div>

        <div className="ppolicy-body">
          {/* ── Overview ── */}
          <div className="ppolicy-section">
            <SectionHeader icon={<IconShield />} title="Privacy Policy Overview" />
            <p className="ppolicy-section-desc">
              Last updated: June 2026 — How we handle your data
            </p>
            <p style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.7, margin: '0 0 12px 0' }}>
              TransitGuide is committed to protecting your privacy. This policy explains how we collect, use, and
              safeguard your information when you use our navigation service.
            </p>
            <HighlightCard icon={<IconShieldSmall />} accentColor="#2563eb" title="Our Promise">
              We collect only the minimum data needed to provide navigation services. We never sell your personal
              information. Your location data is processed locally and never stored permanently.
            </HighlightCard>
            <p style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.7, margin: '12px 0 0 0' }}>
              By using TransitGuide, you agree to the collection and use of information in accordance with this policy.
            </p>
          </div>

          {/* ── Data Collected ── */}
          <div className="ppolicy-section">
            <SectionHeader icon={<IconDatabase />} title="Information We Collect" />
            <p className="ppolicy-section-desc">We collect only what is necessary for navigation and analytics.</p>
            <Card icon={<IconUser />} accentColor="#8b5cf6" title="Account Information">
              Email address and username — required for authentication and personalization. Stored securely in our database.
            </Card>
            <Card icon={<IconMapPin />} accentColor="#8b5cf6" title="Location Data">
              Your current location is used only to show your position on the map and calculate routes. Not stored after your session ends.
            </Card>
            <Card icon={<IconRoute />} accentColor="#8b5cf6" title="Route History">
              Anonymized route segments are sampled and aggregated for heatmap visualization. Individual routes are never identifiable.
            </Card>
            <Card icon={<IconSmartphone />} accentColor="#8b5cf6" title="Device Information">
              Basic device info (screen size, browser type) is collected to optimize your experience. No device identifiers are stored.
            </Card>
          </div>

          {/* ── Cookies ── */}
          <div className="ppolicy-section">
            <SectionHeader icon={<IconArchive />} title="Cookie Policy" />
            <p className="ppolicy-section-desc">We use cookies minimally and transparently.</p>
            <Card icon={<IconArchive />} accentColor="#f59e0b" title="Session Cookies">
              Essential cookies keep you logged in during your visit. These are temporary and expire when you close your browser.
            </Card>
            <Card icon={<IconHardDrive />} accentColor="#f59e0b" title="Local Storage">
              Browser local storage saves your preferences such as dark mode, active route profile, and map settings. This data never leaves your device.
            </Card>
            <Card icon={<IconBarChart />} accentColor="#f59e0b" title="Analytics">
              We do not use third-party analytics cookies. Anonymous usage data is collected via our own backend endpoints.
            </Card>
            <Card icon={<IconXCircle />} accentColor="#f59e0b" title="No Third-Party Tracking">
              We do not use tracking cookies, advertising cookies, or any third-party tracking mechanisms.
            </Card>
            <HighlightCard icon={<IconInfo />} accentColor="#f59e0b" title="Managing Cookies">
              You can clear your local storage and cookies at any time through your browser settings. Note that this will reset your preferences and require re-authentication.
            </HighlightCard>
          </div>

          {/* ── Usage ── */}
          <div className="ppolicy-section">
            <SectionHeader icon={<IconSettings />} title="How We Use Your Data" />
            <p className="ppolicy-section-desc">Your data serves specific, limited purposes.</p>
            <Card icon={<IconMapPin />} accentColor="#10b981" title="Navigation">
              Location and route data are used in real-time to calculate paths and provide turn-by-turn directions. No location history is retained.
            </Card>
            <Card icon={<IconFlame />} accentColor="#10b981" title="Heatmap Generation">
              Anonymized, bucketed coordinates are aggregated to show popular walking routes. Individual contributions cannot be identified.
            </Card>
            <Card icon={<IconSettings />} accentColor="#10b981" title="Service Improvement">
              Aggregated analytics help us understand usage patterns, identify popular destinations, and improve routing algorithms.
            </Card>
            <Card icon={<IconMail />} accentColor="#10b981" title="Communication">
              Your email is used only for account-related notifications (password resets). We do not send marketing emails.
            </Card>
          </div>

          {/* ── Sharing ── */}
          <div className="ppolicy-section">
            <SectionHeader icon={<IconShare2 />} title="Data Sharing &amp; Third Parties" />
            <p className="ppolicy-section-desc">We share only what is necessary to provide the service.</p>
            <Card icon={<IconMap />} accentColor="#f97316" title="Map Services">
              Map tiles are served by MapTiler. Coordinates are sent only to load the visible map area. No personal data is shared.
            </Card>
            <Card icon={<IconCloud />} accentColor="#f97316" title="Weather Data">
              Coordinates are sent to Open-Meteo (with 7Timer fallback) to fetch weather data. These requests are anonymous.
            </Card>
            <Card icon={<IconLock />} accentColor="#f97316" title="Authentication">
              Handled by Supabase. Only your email and hashed credentials are processed. We never store passwords in plain text.
            </Card>
            <Card icon={<IconAlertTriangle />} accentColor="#f97316" title="No Third-Party Sharing">
              We do not sell, rent, or share your personal data with advertisers, marketers, or any third parties for their own purposes.
            </Card>
          </div>

          {/* ── Rights ── */}
          <div className="ppolicy-section">
            <SectionHeader icon={<IconScale />} title="Your Rights (GDPR &amp; Privacy)" />
            <p className="ppolicy-section-desc">You have control over your data.</p>
            <Card icon={<IconEye />} accentColor="#6366f1" title="Right to Access">
              You can view your profile data at any time from the Profile page including your username, email, and account creation date.
            </Card>
            <Card icon={<IconEdit />} accentColor="#6366f1" title="Right to Rectify">
              You can update your username and other profile information directly through Profile settings.
            </Card>
            <Card icon={<IconTrash />} accentColor="#6366f1" title="Right to Delete">
              You can delete your account and all associated data at any time from the Danger Zone. This action is permanent.
            </Card>
            <Card icon={<IconDownload />} accentColor="#6366f1" title="Right to Data Portability">
              Contact us to request a copy of your personal data in a machine-readable format. We will respond within 30 days.
            </Card>
            <HighlightCard icon={<IconShieldSmall />} accentColor="#6366f1" title="GDPR Compliance">
              TransitGuide is fully compliant with the General Data Protection Regulation (GDPR). If you are a resident of
              the EEA, you have all rights afforded under GDPR.
            </HighlightCard>
          </div>

          {/* ── Security ── */}
          <div className="ppolicy-section">
            <SectionHeader icon={<IconLock />} title="Data Security" />
            <p className="ppolicy-section-desc">We implement industry-standard security measures.</p>
            <Card icon={<IconLock />} accentColor="#ef4444" title="Encryption">
              All data transmitted between your device and our servers is encrypted using TLS/SSL. Passwords are hashed using bcrypt.
            </Card>
            <Card icon={<IconShieldSmall />} accentColor="#ef4444" title="Authentication">
              We use Supabase Auth with JWT tokens. Tokens expire after 15 minutes and refresh tokens rotate securely.
            </Card>
            <Card icon={<IconMinimize />} accentColor="#ef4444" title="Data Minimization">
              We collect only data necessary for navigation. Location data is ephemeral. Route analytics are aggregated and anonymized.
            </Card>
            <Card icon={<IconSearch />} accentColor="#ef4444" title="Audit Logging">
              Account-affecting actions (login, password change, account deletion) are logged for security auditing. Logs are retained for 90 days.
            </Card>
          </div>

          {/* ── Contact ── */}
          <div className="ppolicy-section">
            <SectionHeader icon={<IconMail />} title="Contact Us" />
            <p className="ppolicy-section-desc">Have questions about your privacy? We're here to help.</p>
            <Card icon={<IconMail />} accentColor="#14b8a6" title="Email">
              pkay28748@gmail.com
              <br />
              <span style={{ fontSize: 11, color: '#9ca3af' }}>Response time: within 48 hours</span>
            </Card>
            <Card icon={<IconBuilding />} accentColor="#14b8a6" title="Data Controller">
              TransitGuide<br />Accra, Ghana
            </Card>
            <HighlightCard icon={<IconShieldSmall />} accentColor="#14b8a6" title="Data Protection Officer">
              If you have concerns about how your data is handled, please contact our Data Protection Officer at the email
              above. We take all privacy concerns seriously and will respond promptly.
            </HighlightCard>
          </div>
        </div>

        <div className="ppolicy-footer">
          <span className="ppolicy-footer-text">TransitGuide v1.0 — Privacy Policy &amp; Cookie Notice</span>
        </div>
      </div>
    </div>
  );
}
