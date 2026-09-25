// Weather service - Open-Meteo API (free, no API key required)
// Cached for 10 minutes to respect rate limits
// Uses backend proxy to avoid CORS issues

import { API_URL } from '../config';

const CACHE_KEY          = 'ug_weather_cache';
const FORECAST_CACHE_KEY = 'ug_forecast_cache';
const CACHE_DURATION_MS  = 10 * 60 * 1000; // 10 minutes

// Legon campus coordinates
const LEGON_LAT = 5.6502;
const LEGON_LNG = -0.1869;

// Weather code mapping to human-readable conditions
export const WEATHER_CODES = {
  0:  { label: 'Clear sky',                     icon: '☀️',  effect: 'sun',        description: 'Sunny and clear' },
  1:  { label: 'Mainly clear',                  icon: '🌤️', effect: 'sun-cloud',  description: 'Partly sunny' },
  2:  { label: 'Partly cloudy',                 icon: '⛅',  effect: 'clouds',     description: 'Partly cloudy' },
  3:  { label: 'Overcast',                      icon: '☁️',  effect: 'clouds',     description: 'Cloudy' },
  45: { label: 'Fog',                           icon: '🌫️', effect: 'fog',        description: 'Foggy, limited visibility' },
  48: { label: 'Depositing rime fog',           icon: '🌫️', effect: 'fog',        description: 'Foggy' },
  51: { label: 'Light drizzle',                 icon: '🌧️', effect: 'rain-light', description: 'Light drizzle' },
  53: { label: 'Moderate drizzle',              icon: '🌧️', effect: 'rain',       description: 'Drizzling' },
  55: { label: 'Dense drizzle',                 icon: '🌧️', effect: 'rain-heavy', description: 'Heavy drizzle' },
  56: { label: 'Freezing drizzle',              icon: '❄️',  effect: 'rain',       description: 'Freezing drizzle' },
  57: { label: 'Dense freezing drizzle',        icon: '❄️',  effect: 'rain',       description: 'Freezing drizzle' },
  61: { label: 'Slight rain',                   icon: '🌧️', effect: 'rain-light', description: 'Light rain' },
  63: { label: 'Moderate rain',                 icon: '🌧️', effect: 'rain',       description: 'Moderate rain' },
  65: { label: 'Heavy rain',                    icon: '🌧️', effect: 'rain-heavy', description: 'Heavy rain' },
  66: { label: 'Light freezing rain',           icon: '❄️',  effect: 'rain',       description: 'Freezing rain' },
  67: { label: 'Heavy freezing rain',           icon: '❄️',  effect: 'rain',       description: 'Heavy freezing rain' },
  71: { label: 'Slight snow',                   icon: '❄️',  effect: 'snow',       description: 'Light snow' },
  73: { label: 'Moderate snow',                 icon: '❄️',  effect: 'snow',       description: 'Snowing' },
  75: { label: 'Heavy snow',                    icon: '❄️',  effect: 'snow-heavy', description: 'Heavy snow' },
  77: { label: 'Snow grains',                   icon: '❄️',  effect: 'snow',       description: 'Snow grains' },
  80: { label: 'Slight rain showers',           icon: '🌦️', effect: 'rain',       description: 'Rain showers' },
  81: { label: 'Moderate rain showers',         icon: '🌧️', effect: 'rain',       description: 'Rain showers' },
  82: { label: 'Violent rain showers',          icon: '🌧️', effect: 'rain-heavy', description: 'Violent rain' },
  85: { label: 'Slight snow showers',           icon: '🌨️', effect: 'snow',       description: 'Snow showers' },
  86: { label: 'Heavy snow showers',            icon: '🌨️', effect: 'snow-heavy', description: 'Heavy snow showers' },
  95: { label: 'Thunderstorm',                  icon: '⛈️',  effect: 'storm',      description: 'Thunderstorm' },
  96: { label: 'Thunderstorm with hail',        icon: '⛈️',  effect: 'storm',      description: 'Thunderstorm with hail' },
  99: { label: 'Thunderstorm with heavy hail',  icon: '⛈️',  effect: 'storm',      description: 'Severe thunderstorm' },
};

// Day abbreviations
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ─── Cache helpers ────────────────────────────────────────────────────────────

function readCache(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { data, timestamp } = JSON.parse(raw);
    if (Date.now() - timestamp < CACHE_DURATION_MS) return data;
    return null;
  } catch {
    return null;
  }
}

function writeCache(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() }));
  } catch (e) {
    console.warn('[Weather] Cache write failed:', e);
  }
}

// ─── Current weather ─────────────────────────────────────────────────────────

export async function fetchWeather() {
  const cached = readCache(CACHE_KEY);
  if (cached) {
    console.log('[Weather] Using cached current data');
    return cached;
  }

  const url = `${API_URL}/api/weather?lat=${LEGON_LAT}&lon=${LEGON_LNG}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      console.warn(`[Weather] HTTP ${res.status}: ${errorData.error || 'Unknown error'}`);
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();

    if (!data.current_weather) throw new Error('No weather data in response');

    const weatherData = {
      temperature:       Math.round(data.current_weather.temperature),
      weatherCode:       data.current_weather.weathercode,
      windSpeed:         data.current_weather.windspeed,
      isDay:             data.current_weather.is_day === 1,
      precipitationProb: data.hourly?.precipitation_probability?.[0] || 0,
      timestamp:         new Date().toISOString(),
    };

    const info = WEATHER_CODES[weatherData.weatherCode] || WEATHER_CODES[0];
    weatherData.condition   = info.label;
    weatherData.icon        = info.icon;
    weatherData.effect      = info.effect;
    weatherData.description = info.description;

    writeCache(CACHE_KEY, weatherData);
    console.log('[Weather] Fetched current:', weatherData);
    return weatherData;

  } catch (error) {
    console.error('[Weather] Fetch failed:', error.message);
    
    // Return safe fallback - routing will continue with default multipliers
    return {
      temperature: 24, weatherCode: 0, windSpeed: 5, isDay: true,
      precipitationProb: 0, condition: 'Weather data unavailable',
      description: 'Using default routing', icon: '🌡️', effect: 'none',
      isFallback: true,
    };
  }
}

// ─── 5-day forecast ───────────────────────────────────────────────────────────

export async function fetchForecast() {
  const cached = readCache(FORECAST_CACHE_KEY);
  if (cached) {
    console.log('[Weather] Using cached forecast data');
    return cached;
  }

  const url = `${API_URL}/api/weather/forecast?lat=${LEGON_LAT}&lon=${LEGON_LNG}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      console.warn(`[Weather] HTTP ${res.status}: ${errorData.error || 'Unknown error'}`);
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();

    const { daily } = data;
    if (!daily) throw new Error('No daily forecast in response');

    const days = daily.time.map((dateStr, i) => {
      const date      = new Date(dateStr);
      const code      = daily.weathercode[i];
      const info      = WEATHER_CODES[code] || WEATHER_CODES[0];
      const dayName   = i === 0 ? 'Today' : DAY_NAMES[date.getDay()];

      return {
        date:        dateStr,
        dayName,
        weatherCode: code,
        icon:        info.icon,
        label:       info.label,
        tempHigh:    Math.round(daily.temperature_2m_max[i]),
        tempLow:     Math.round(daily.temperature_2m_min[i]),
        precipProb:  daily.precipitation_probability_max[i] ?? 0,
      };
    });

    writeCache(FORECAST_CACHE_KEY, days);
    console.log('[Weather] Fetched forecast:', days);
    return days;

  } catch (error) {
    console.error('[Weather] Forecast fetch failed:', error.message);
    // Fallback: 5 days of placeholder data so the UI never hard-crashes
    return Array.from({ length: 5 }, (_, i) => ({
      date:        '',
      dayName:     i === 0 ? 'Today' : DAY_NAMES[(new Date().getDay() + i) % 7],
      weatherCode: 0,
      icon:        '🌡️',
      label:       'Unavailable',
      tempHigh:    '--',
      tempLow:     '--',
      precipProb:  0,
      isFallback:  true,
    }));
  }
}

// ─── Routing multipliers ──────────────────────────────────────────────────────

export function getWeatherMultipliers(weather) {
  if (!weather || weather.isFallback) {
    return {
      unpavedMultiplier: 1.0, lightingMultiplier: 1.0,
      exposedMultiplier: 1.0, shadeBonus: 1.0,
      speedReduction: 1.0,    message: null,
    };
  }

  const code        = weather.weatherCode;
  const isHeavyRain = [65, 67, 82].includes(code);
  const isLightRain = [51, 53, 55, 61, 63, 80, 81].includes(code);
  const isHeat      = weather.temperature >= 30;
  const isStorm     = [95, 96, 99].includes(code);
  const isSnow      = [71, 73, 75, 77, 85, 86].includes(code);
  const isFog       = [45, 48].includes(code);

  let unpavedMultiplier = 1.0;
  let lightingMultiplier = 1.0;
  let exposedMultiplier = 1.0;
  let shadeBonus = 1.0;
  let speedReduction = 1.0;
  let message = null;

  if (isHeavyRain) {
    unpavedMultiplier = 3.0; exposedMultiplier = 1.5; speedReduction = 1.3;
    message = '⚠️ Heavy rain — avoiding unpaved paths, expect slower travel';
  } else if (isLightRain) {
    unpavedMultiplier = 1.5; speedReduction = 1.1;
    message = '🌧️ Light rain — paved paths preferred';
  }

  if (isStorm) {
    unpavedMultiplier = 5.0; exposedMultiplier = 2.0; speedReduction = 1.4;
    message = '⛈️ Storm detected — seeking sheltered routes';
  }

  if (isSnow) {
    unpavedMultiplier = 2.5; speedReduction = 1.3;
    message = '❄️ Snow — caution on all paths';
  }

  if (isFog) {
    lightingMultiplier = 1.5; speedReduction = 1.1;
    message = '🌫️ Foggy — reduced visibility, caution advised';
  }

  if (isHeat) {
    shadeBonus = 0.7; exposedMultiplier = 1.3; speedReduction = 1.15;
    message = '🔥 Heat advisory — preferring shaded routes';
  }

  // Night is deliberately NOT handled here. calculateEdgeCost already applies
  // night lighting through the active profile's lighting weight, so adding a
  // weather night multiplier would double-count it (up to 10x on Night Safety).
  // Lighting here means weather degrading visibility, e.g. fog.

  return { unpavedMultiplier, lightingMultiplier, exposedMultiplier, shadeBonus, speedReduction, message };
}