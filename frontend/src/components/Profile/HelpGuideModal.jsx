import { useState, useEffect, useRef } from 'react';
import { useHaptics } from '../../hooks/useHaptics';
import './HelpGuideModal.css';

const IconClose = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

const IconCompass = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <path d="M16.24 7.76l-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z"/>
  </svg>
);

const IconRoute = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
  </svg>
);

const IconSliders = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <line x1="4" y1="21" x2="4" y2="14"/>
    <line x1="4" y1="10" x2="4" y2="3"/>
    <line x1="12" y1="21" x2="12" y2="12"/>
    <line x1="12" y1="8" x2="12" y2="3"/>
    <line x1="20" y1="21" x2="20" y2="16"/>
    <line x1="20" y1="12" x2="20" y2="3"/>
    <line x1="1" y1="14" x2="7" y2="14"/>
    <line x1="9" y1="8" x2="15" y2="8"/>
    <line x1="17" y1="16" x2="23" y2="16"/>
  </svg>
);

const IconCube = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
  </svg>
);

const IconAccessibility = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <circle cx="12" cy="6" r="1.5"/>
    <path d="M12 10v4l-2 5M12 14l2 5M8 12h8"/>
  </svg>
);

const IconFlame = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2C12 2 8 6 8 10c0 2.2 1.8 4 4 4s4-1.8 4-4c0-4-4-8-4-8z"/>
    <path d="M12 14c-2.2 0-4 1.8-4 4 0 2.2 1.8 4 4 4s4-1.8 4-4c0-2.2-1.8-4-4-4z"/>
  </svg>
);

const IconUser = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
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

const IconGlobe = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
  </svg>
);

const IconSun = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5"/>
    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42 1.42"/>
  </svg>
);

const IconBarChart = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 20V10M12 20V4M6 20v-6"/>
  </svg>
);

const IconFlag = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 15V3h12l-2 6 2 6H4z"/>
    <path d="M4 21v-6"/>
  </svg>
);

const IconArrowRight = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12"/>
    <polyline points="12 5 19 12 12 19"/>
  </svg>
);

const IconScale = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2v20M4 6l8-4 8 4M4 18l8 4 8-4"/>
    <path d="M4 6v12M20 6v12"/>
  </svg>
);

const IconMoon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"/>
  </svg>
);

const IconZap = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
  </svg>
);

const IconAccessibilitySmall = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="6" r="2"/>
    <path d="M12 10v5l-3 6M12 15l3 6M8 13h8"/>
  </svg>
);

const IconSatellite = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <path d="M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z"/>
    <path d="M2 12h20"/>
  </svg>
);

const IconCloudRain = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9z"/>
    <path d="M9 20v2M13 20v3M17 20v2"/>
  </svg>
);

const IconMap = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/>
    <line x1="8" y1="2" x2="8" y2="18"/>
    <line x1="16" y1="6" x2="16" y2="22"/>
  </svg>
);

const IconCalendar = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
    <line x1="16" y1="2" x2="16" y2="6"/>
    <line x1="8" y1="2" x2="8" y2="6"/>
    <line x1="3" y1="10" x2="21" y2="10"/>
  </svg>
);

const IconVolume = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14"/>
  </svg>
);

const IconAlertTriangle = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/>
    <line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
);

const IconInfo = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" y1="16" x2="12" y2="12"/>
    <line x1="12" y1="8" x2="12.01" y2="8"/>
  </svg>
);

const IconClock = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <polyline points="12 6 12 12 16 14"/>
  </svg>
);

const IconDatabase = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx="12" cy="5" rx="9" ry="3"/>
    <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
    <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
  </svg>
);

const IconEdit = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);

const IconMoonSmall = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"/>
  </svg>
);

const IconLock = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
);

const IconSmartphone = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
    <line x1="12" y1="18" x2="12.01" y2="18"/>
  </svg>
);

function SectionHeader({ icon, title }) {
  return (
    <div className="helpguide-section-header">
      {icon}
      <h3 className="helpguide-section-title">{title}</h3>
    </div>
  );
}

function Card({ icon, accentColor, title, children }) {
  return (
    <div className="helpguide-card">
      <div className="helpguide-card-icon" style={{ background: `${accentColor}18`, color: accentColor }}>
        {icon}
      </div>
      <div className="helpguide-card-body">
        <strong>{title}</strong>
        <p>{children}</p>
      </div>
    </div>
  );
}

function ProfileCard({ icon, accentColor, bgColor, title, children }) {
  return (
    <div className="helpguide-profile-card">
      <div className="helpguide-profile-card-icon" style={{ background: bgColor, color: accentColor }}>
        {icon}
      </div>
      <div className="helpguide-profile-card-body">
        <strong>{title}</strong>
        <p>{children}</p>
      </div>
    </div>
  );
}

function Step({ num, title, children }) {
  return (
    <div className="helpguide-step">
      <div className="helpguide-step-num">{num}</div>
      <div className="helpguide-step-body">
        <strong>{title}</strong>
        <p>{children}</p>
      </div>
    </div>
  );
}

export default function HelpGuideModal({ isOpen, onClose }) {
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
      const modal = overlayRef.current?.querySelector('.helpguide-modal');
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
      className={`helpguide-overlay ${visible ? 'helpguide-overlay--visible' : ''}`}
      onClick={() => { trigger(10); onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="User guide"
    >
      <div
        className={`helpguide-modal ${visible ? 'helpguide-modal--visible' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="helpguide-header">
          <h2>TransitGuide Guide</h2>
          <button className="helpguide-close" onClick={() => { trigger(10); onClose(); }} ref={firstFocusRef} aria-label="Close guide">
            <IconClose />
          </button>
        </div>

        <div className="helpguide-body">
          {/* ── Overview ── */}
          <div className="helpguide-section">
            <SectionHeader icon={<IconCompass />} title="Overview" />
            <p className="helpguide-section-desc">
              Your intelligent, context-aware pedestrian navigation companion.
            </p>
            <Card icon={<IconMapPin />} accentColor="#2563eb" title="Smart Routing">
              Search any campus landmark and get turn-by-turn directions optimized for your chosen profile.
            </Card>
            <Card icon={<IconGlobe />} accentColor="#2563eb" title="2D &amp; 3D Views">
              Switch between standard 2D map and immersive 3D satellite view with terrain elevation.
            </Card>
            <Card icon={<IconSun />} accentColor="#2563eb" title="Live Weather">
              Real-time weather overlay with rain particle effects in 3D mode and 5-day forecasts.
            </Card>
            <Card icon={<IconBarChart />} accentColor="#2563eb" title="Crowd Analytics">
              Heatmap shows popular routes and congestion patterns around campus throughout the day.
            </Card>
          </div>

          {/* ── Getting Around ── */}
          <div className="helpguide-section">
            <SectionHeader icon={<IconRoute />} title="Getting Around" />
            <p className="helpguide-section-desc">
              Plan your journey from anywhere to anywhere on the Legon campus.
            </p>
            <div className="helpguide-steps">
              <Step num={1} title="Set Your Start">
                Tap "Where to?" or use your current location as the starting point. You can also search for any landmark.
              </Step>
              <Step num={2} title="Choose Destination">
                Search for your destination by name (e.g., "Balme Library", "Business School").
              </Step>
              <Step num={3} title="Select Profile">
                Choose between Standard, Night Safety, Fastest, or Accessible to tailor the route to your needs.
              </Step>
              <Step num={4} title="Navigate">
                Follow the turn-by-turn directions. Enable voice guidance for hands-free navigation.
              </Step>
            </div>
          </div>

          {/* ── Route Profiles ── */}
          <div className="helpguide-section">
            <SectionHeader icon={<IconSliders />} title="Route Profiles" />
            <p className="helpguide-section-desc">
              Each profile optimizes your route differently. Switch between them anytime.
            </p>
            <div className="helpguide-profiles">
              <ProfileCard
                icon={<IconScale />} accentColor="#2563eb" bgColor="rgba(37,99,235,0.1)"
                title="Standard"
              >
                Balanced route — the best mix of distance, safety, and walking conditions.
              </ProfileCard>
              <ProfileCard
                icon={<IconMoon />} accentColor="#f59e0b" bgColor="rgba(245,158,11,0.1)"
                title="Night Safety"
              >
                Prioritizes well-lit main roads and high-traffic paths for safer navigation after dark.
              </ProfileCard>
              <ProfileCard
                icon={<IconZap />} accentColor="#22c55e" bgColor="rgba(34,197,94,0.1)"
                title="Fastest"
              >
                The shortest possible route — gets you there as quickly as possible.
              </ProfileCard>
              <ProfileCard
                icon={<IconAccessibilitySmall />} accentColor="#8b5cf6" bgColor="rgba(139,92,246,0.1)"
                title="Accessible"
              >
                Avoids steep inclines, stairs, and rough terrain. Ideal for wheelchair users and those with mobility concerns.
              </ProfileCard>
            </div>
          </div>

          {/* ── 3D & Weather ── */}
          <div className="helpguide-section">
            <SectionHeader icon={<IconCube />} title="3D Mode &amp; Weather" />
            <p className="helpguide-section-desc">
              Toggle 3D mode for an immersive satellite view with real-time weather effects.
            </p>
            <Card icon={<IconSatellite />} accentColor="#6366f1" title="Satellite View">
              High-resolution satellite imagery with 3D terrain from MapTiler. Tilt and rotate to explore campus from any angle.
            </Card>
            <Card icon={<IconCloudRain />} accentColor="#6366f1" title="Rainfall Visualization">
              Live rain particle effects render on the 3D map when weather data detects precipitation.
            </Card>
            <Card icon={<IconMap />} accentColor="#6366f1" title="Congestion Heatmap">
              In 3D mode, a color-coded overlay shows popular routes and congestion areas based on aggregated data.
            </Card>
            <Card icon={<IconCalendar />} accentColor="#6366f1" title="5-Day Forecast">
              Tap the weather banner to see the extended forecast with highs, lows, and precipitation probability.
            </Card>
          </div>

          {/* ── Accessibility ── */}
          <div className="helpguide-section">
            <SectionHeader icon={<IconAccessibility />} title="Accessibility" />
            <p className="helpguide-section-desc">
              TransitGuide is built with inclusive design at its core.
            </p>
            <Card icon={<IconAccessibilitySmall />} accentColor="#14b8a6" title="Accessible Routing">
              The Accessible profile avoids steep slopes, stairs, and uneven terrain — optimized for wheelchair users.
            </Card>
            <Card icon={<IconVolume />} accentColor="#14b8a6" title="Voice Guidance">
              Enable voice guidance for spoken turn-by-turn directions. Perfect for hands-free navigation.
            </Card>
            <Card icon={<IconAlertTriangle />} accentColor="#14b8a6" title="Report Obstacles">
              Found a blocked ramp, broken sidewalk, or poor lighting? Use the Report feature to alert the campus community.
            </Card>
            <div className="helpguide-card" style={{ background: 'rgba(20,184,166,0.04)' }}>
              <div className="helpguide-card-icon" style={{ background: 'rgba(20,184,166,0.1)', color: '#14b8a6' }}>
                <IconInfo />
              </div>
              <div className="helpguide-card-body">
                <strong>Note</strong>
                <p>Reports are reviewed by administrators and help improve routes for everyone.</p>
              </div>
            </div>
          </div>

          {/* ── Heatmap ── */}
          <div className="helpguide-section">
            <SectionHeader icon={<IconFlame />} title="Heatmap &amp; Analytics" />
            <p className="helpguide-section-desc">
              Visualize where people are walking on campus with aggregated, anonymous data.
            </p>
            <Card icon={<IconMap />} accentColor="#f97316" title="Popular Routes">
              Areas with more foot traffic appear warmer (red) while quieter areas appear cooler (blue).
            </Card>
            <Card icon={<IconClock />} accentColor="#f97316" title="Time Filters">
              Filter heatmap data by time of day: Morning, Midday, Afternoon, Evening, or Night.
            </Card>
            <Card icon={<IconDatabase />} accentColor="#f97316" title="Data Points">
              The legend shows how many data points are being displayed. Heatmap data is sampled and anonymized for privacy.
            </Card>
          </div>

          {/* ── Account ── */}
          <div className="helpguide-section">
            <SectionHeader icon={<IconUser />} title="Account &amp; Settings" />
            <p className="helpguide-section-desc">
              Manage your profile, preferences, and account settings.
            </p>
            <Card icon={<IconEdit />} accentColor="#6b7280" title="Edit Profile">
              Change your display name and username. Your profile is synced across devices.
            </Card>
            <Card icon={<IconMoonSmall />} accentColor="#6b7280" title="Dark Mode">
              Toggle dark mode for comfortable nighttime use. Preference is saved locally.
            </Card>
            <Card icon={<IconLock />} accentColor="#6b7280" title="Security">
              Change your password anytime. Account deletion is permanent — all data will be erased.
            </Card>
            <Card icon={<IconSmartphone />} accentColor="#6b7280" title="Cross-Platform">
              TransitGuide works in any browser. Your preferences sync via your account across sessions.
            </Card>
          </div>
        </div>

        <div className="helpguide-footer">
          <span className="helpguide-footer-text">TransitGuide v1.0</span>
        </div>
      </div>
    </div>
  );
}
