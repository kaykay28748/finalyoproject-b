// components/Legend/WeatherBanner.jsx
// Weather display with voice announcements and dismissible 5-day forecast popup.
// Voice fires ONLY when the condition string actually changes — not on re-renders
// or Legend drags — by comparing against a ref instead of putting speak() in deps.

import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useWeather } from '../../hooks/useWeather';
import { useVoiceGuidance } from '../../hooks/useVoiceGuidance';
import { useHaptics } from '../../hooks/useHaptics';
import { fetchForecast } from '../../services/weatherService';
import './WeatherBanner.css';

// ─── Icons ────────────────────────────────────────────────────────────────────

const RefreshIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 4v6h-6" />
    <path d="M1 20v-6h6" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" />
    <path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14" />
  </svg>
);

const CalendarIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8"  y1="2" x2="8"  y2="6" />
    <line x1="3"  y1="10" x2="21" y2="10" />
  </svg>
);

const CloseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6"  x2="6"  y2="18" />
    <line x1="6"  y1="6"  x2="18" y2="18" />
  </svg>
);

// ─── Forecast popup ───────────────────────────────────────────────────────────

function ForecastPopup({ onClose }) {
  const [days,      setDays]      = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const popupRef = useRef(null);

  // Senior Fix: Detect theme directly since the portal renders outside .ug-root
  const isDark = document.querySelector('.ug-root.dark') !== null;

  // Fetch on mount
  useEffect(() => {
    let cancelled = false;
    fetchForecast()
      .then(data => { if (!cancelled) { setDays(data); setLoading(false); } })
      .catch(()  => { if (!cancelled) { setFetchError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  // ESC key to close
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Outside-click to close — overlay handles this via its own onClick,
  // but we stop propagation on the card itself so only overlay clicks fire.
  const stopProp = useCallback((e) => e.stopPropagation(), []);

  // Pick precip colour band
  const precipClass = (prob) => {
    if (prob >= 70) return 'precip-high';
    if (prob >= 40) return 'precip-mid';
    return 'precip-low';
  };

  return createPortal(
    // Semi-transparent overlay — click closes; Legend stays behind it and is
    // accessible the moment the popup dismisses.
    <div className={`forecast-overlay${isDark ? ' forecast-dark' : ''}`} onClick={onClose} role="dialog"
      aria-modal="true" aria-label="5-day weather forecast">

      <div className="forecast-popup" ref={popupRef} onClick={stopProp}>

        {/* Header */}
        <div className="forecast-popup-header">
          <div className="forecast-popup-title">
            <CalendarIcon />
            <span>5-Day Forecast</span>
            <span className="forecast-location">University of Ghana, Legon</span>
          </div>
          <button className="forecast-close-btn" onClick={onClose}
            aria-label="Close forecast">
            <CloseIcon />
          </button>
        </div>

        {/* Body */}
        {loading && (
          <div className="forecast-state">
            <div className="forecast-spinner" />
            <p>Fetching forecast…</p>
          </div>
        )}

        {fetchError && (
          <div className="forecast-state forecast-state--error">
            <span className="forecast-state-icon">⚠️</span>
            <p>Could not load forecast. Check your connection.</p>
          </div>
        )}

        {days && !loading && (
          <>
            <div className="forecast-days">
              {days.map((day, i) => (
                <div key={day.date || i}
                  className={`forecast-day-card${i === 0 ? ' forecast-day-card--today' : ''}`}>
                  <span className="fdc-name">{day.dayName}</span>
                  <span className="fdc-icon">{day.icon}</span>
                  <span className="fdc-high">{day.tempHigh !== '--' ? `${day.tempHigh}°` : '--'}</span>
                  <span className="fdc-low">{day.tempLow  !== '--' ? `${day.tempLow}°`  : '--'}</span>
                  <span className={`fdc-precip ${precipClass(day.precipProb)}`}>
                    💧 {day.precipProb}%
                  </span>
                </div>
              ))}
            </div>

            {/* Routing note — only show if any day has significant rain */}
            {days.some(d => d.precipProb >= 40) && (
              <div className="forecast-routing-note">
                🗺️ Routes may be adjusted on rainy days — paved paths preferred.
              </div>
            )}
          </>
        )}

      </div>
    </div>,
    document.body
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function WeatherBanner() {
  const {
    weather,
    getWeatherDisplay,
    hasWeatherImpact,
    refreshWeather,
    isLoading,
  } = useWeather();

  const { speak, isVoiceEnabled } = useVoiceGuidance();
  const { trigger } = useHaptics();

  const [forecastOpen, setForecastOpen] = useState(false);

  const lastSpokenConditionRef = useRef(null);
  const hasSpokenInitialRef    = useRef(false);
  const speakRef               = useRef(speak);
  useEffect(() => { speakRef.current = speak; }, [speak]);

  // Voice — only when weather.condition actually changes
  useEffect(() => {
    if (!weather || !isVoiceEnabled || weather.isFallback) return;
    const condition = weather.condition || 'Unknown';
    const temp      = Math.round(weather.temperature);
    if (lastSpokenConditionRef.current === condition) return;
    lastSpokenConditionRef.current = condition;
    if (!hasSpokenInitialRef.current) {
      hasSpokenInitialRef.current = true;
      setTimeout(() => {
        speakRef.current(`Current weather: ${condition}, ${temp} degrees.`, { priority: 'normal' });
      }, 800);
    } else {
      speakRef.current(`Weather update: ${condition}, ${temp} degrees.`, { priority: 'normal' });
    }
  }, [weather, isVoiceEnabled]);

  const handleRefresh = async () => {
    lastSpokenConditionRef.current = null;
    await refreshWeather();
  };

  const toggleForecast = useCallback(() => setForecastOpen(o => !o), []);
  const closeForecast  = useCallback(() => setForecastOpen(false), []);

  const display   = getWeatherDisplay();
  const hasImpact = hasWeatherImpact();

  if (!weather) {
    return (
      <div className="weather-banner weather-banner--loading">
        <span className="weather-icon">🌡️</span>
        <span className="weather-text">Loading weather...</span>
      </div>
    );
  }

  return (
    <>
      <div className={`weather-banner${hasImpact ? ' weather-banner--impact' : ''}`}>
        <div className="weather-banner-main">
          <div className="weather-info">
            <span className="weather-icon">{display.icon}</span>
            <div className="weather-details">
              <span className="weather-temp">{display.temperature}°C</span>
              <span className="weather-condition">{display.label}</span>
            </div>
          </div>

          <div className="weather-actions">
            {/* Forecast toggle */}
            <button
              className={`weather-forecast-btn${forecastOpen ? ' weather-forecast-btn--active' : ''}`}
              onClick={() => { trigger(10); toggleForecast(); }}
              title={forecastOpen ? 'Close forecast' : 'View 5-day forecast'}
              aria-label={forecastOpen ? 'Close forecast' : 'View 5-day forecast'}
              aria-expanded={forecastOpen}
            >
              <CalendarIcon />
            </button>

            {/* Refresh */}
            <button
              className="weather-refresh"
              onClick={() => { trigger(10); handleRefresh(); }}
              disabled={isLoading}
              title="Refresh weather"
              aria-label="Refresh weather"
            >
              <RefreshIcon />
            </button>
          </div>
        </div>

        <div className="weather-impact-badge">
          {hasImpact ? (
            <span className="impact-active">🌧️ Routing adjusted for conditions</span>
          ) : (
            <span className="impact-normal">✅ Clear conditions — normal routing</span>
          )}
        </div>
      </div>

      {forecastOpen && <ForecastPopup onClose={closeForecast} />}
    </>
  );
}