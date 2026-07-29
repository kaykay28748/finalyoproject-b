// src/server.js
import 'dotenv/config';
console.log('[DEBUG] EMAIL_USER:', process.env.EMAIL_USER);
console.log('[DEBUG] EMAIL_PASS:', process.env.EMAIL_PASS ? '***LOADED***' : 'MISSING');

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { query, runDevMigrations } from './config/db.js';
import { sanitizeParams } from './middleware/validation.js';
import { handleError } from './utils/errorHandler.js';
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import analyticsRoutes, { heatmapRouter } from './routes/analytics.js';
import reportsRoutes from './routes/reports.js';

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3001;

// ─── LocationIQ Rate Limit Queue (3 requests per second) ────────────────────
let lastLocationIQRequest = 0;
const locationIQQueue = [];
let processingLocationIQ = false;

async function processLocationIQQueue() {
  if (processingLocationIQ || locationIQQueue.length === 0) return;

  processingLocationIQ = true;

  const now = Date.now();
  const timeSinceLast = now - lastLocationIQRequest;
  if (timeSinceLast < 334) {
    const waitTime = 334 - timeSinceLast;
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }

  const { url, res } = locationIQQueue.shift();

  try {
    lastLocationIQRequest = Date.now();
    const response = await fetch(url);
    const data = await response.json();

    if (data.error) {
      res.status(400).json({ error: data.error });
    } else {
      res.json(data);
    }
  } catch (err) {
    console.error('[LocationIQ] Error:', err.message);
    res.status(500).json({ error: 'Geocoding failed' });
  } finally {
    processingLocationIQ = false;
    processLocationIQQueue();
  }
}

// ─── Security Middleware ─────────────────────────────────────────────────────
app.use(helmet());

app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://ugnavigator.onrender.com',
    process.env.CORS_ORIGIN,
  ].filter(Boolean),
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: 'Too many requests, please try again later'
    });
  }
});

// ============================================
// OVERPASS API PROXY (bypasses CORS, cached)
// Placed BEFORE body parsers so we can read raw body
// ============================================

const overpassCache = new Map();
const OVERPASS_CACHE_TTL = 24 * 60 * 60 * 1000;

function getCachedOverpass(key) {
  const cached = overpassCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.timestamp > OVERPASS_CACHE_TTL) {
    overpassCache.delete(key);
    return null;
  }
  return cached.data;
}

function setCachedOverpass(key, data) {
  overpassCache.set(key, { data, timestamp: Date.now() });
}

async function fetchOverpassWithRetry(endpoint, body, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        body,
        headers: {
          'Content-Type': 'text/plain',
          'User-Agent': 'UG-Navigator/1.0 (https://ugnavigator.onrender.com)',
        },
        signal: AbortSignal.timeout(60000),
      });

      if (response.ok) return response;

      console.warn(`[Overpass Proxy] ${endpoint} attempt ${attempt + 1}: HTTP ${response.status}`);
      if (response.status === 429) {
        const wait = Math.min(2000 * Math.pow(2, attempt), 16000);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      const text = await response.text().catch(() => '');
      console.warn(`[Overpass Proxy] body: ${text.slice(0, 200)}`);
      return null;
    } catch (err) {
      console.warn(`[Overpass Proxy] ${endpoint} attempt ${attempt + 1}: ${err.name}: ${err.message}`);
      if (attempt < retries - 1) {
        await new Promise(r => setTimeout(r, 3000 * Math.pow(2, attempt)));
      }
    }
  }
  return null;
}

app.post('/api/overpass', async (req, res) => {
  let body = '';
  req.on('data', chunk => body += chunk);
  await new Promise(resolve => req.on('end', resolve));
  body = body.trim();

  if (!body) return res.status(400).json({ error: 'Missing Overpass QL query' });

  const cacheKey = body.slice(0, 200);
  const cached = getCachedOverpass(cacheKey);
  if (cached) {
    res.set('Content-Type', 'application/json');
    res.set('X-Cache', 'hit');
    return res.send(cached);
  }

  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ];

  for (const endpoint of endpoints) {
    const response = await fetchOverpassWithRetry(endpoint, body);
    if (!response) continue;

    const text = await response.text();
    setCachedOverpass(cacheKey, text);
    res.set('Content-Type', 'application/json');
    res.set('X-Cache', 'miss');
    return res.send(text);
  }

  const stale = overpassCache.get(cacheKey);
  if (stale) {
    console.log('[Overpass Proxy] Serving stale cache');
    res.set('Content-Type', 'application/json');
    res.set('X-Cache', 'stale');
    return res.send(stale.data);
  }

  res.status(502).json({ error: 'Overpass API unavailable — try again later' });
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(sanitizeParams);

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ─── Health Check ────────────────────────────────────────────────────────────
app.get('/health', async (req, res) => {
  try {
    await query('SELECT 1');
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ status: 'unhealthy', error: 'Database connection failed' });
  }
});

// ============================================
// LOCATIONIQ PROXY
// ============================================

// UG main gate — used to bias search results toward campus area
const UG_LAT = 5.6502;
const UG_LON = -0.1869;
// Soft bounding box ~12 km around UG (lon_min,lat_min,lon_max,lat_max)
const UG_VIEWBOX = `-0.2969,5.5402,0.0231,5.7602`;

app.get('/api/locationiq/search', (req, res) => {
  const searchQuery = req.query.q;
  if (!searchQuery) {
    return res.status(400).json({ error: 'Missing query parameter' });
  }

  const url =
    `https://us1.locationiq.com/v1/search.php` +
    `?q=${encodeURIComponent(searchQuery)}` +
    `&format=json` +
    `&limit=10` +
    `&countrycodes=gh` +
    `&addressdetails=1` +
    `&viewbox=${UG_VIEWBOX}` +
    `&bounded=0` +
    `&key=${process.env.LOCATIONIQ_API_KEY}`;

  locationIQQueue.push({ url, res });
  processLocationIQQueue();
});

app.get('/api/locationiq/reverse', async (req, res) => {
  const { lat, lon } = req.query;
  if (!lat || !lon) {
    return res.status(400).json({ error: 'Missing lat or lon' });
  }

  try {
    const url = `https://us1.locationiq.com/v1/reverse.php?lat=${lat}&lon=${lon}&format=json&key=${process.env.LOCATIONIQ_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('[LocationIQ Reverse] Error:', err.message);
    res.status(500).json({ error: 'Reverse geocoding failed' });
  }
});

// ============================================
// WEATHER PROXY (with caching, retry logic & 7Timer fallback)
// ============================================

// In-memory cache for weather data
const weatherCache = new Map();
const WEATHER_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

function getCachedWeather(key) {
  const cached = weatherCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.timestamp > WEATHER_CACHE_TTL) {
    weatherCache.delete(key);
    return null;
  }
  console.log(`[Weather Cache] HIT for ${key}`);
  return cached.data;
}

function setCachedWeather(key, data) {
  weatherCache.set(key, { data, timestamp: Date.now() });
  console.log(`[Weather Cache] SET for ${key}`);
}

async function fetchWithRetry(url, maxRetries = 2) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(10000),
        headers: { 'User-Agent': 'UG-Navigator/1.0 (https://ugnavigator.onrender.com)' }
      });
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'No error body');
        throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 100)}`);
      }
      
      return await response.json();
    } catch (error) {
      lastError = error;
      console.log(`[Weather] Attempt ${attempt + 1}/${maxRetries + 1} failed: ${error.message}`);
      if (attempt < maxRetries) {
        const backoffMs = Math.pow(2, attempt) * 500;
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }
    }
  }
  throw lastError;
}

// FALLBACK: 7Timer API (no API key required)
async function fetchFrom7Timer(lat, lon) {
  const url = `http://www.7timer.info/bin/api.pl?lon=${lon}&lat=${lat}&product=civil&output=json`;
  console.log(`[Weather Fallback] Fetching from 7Timer for (${lat}, ${lon})`);
  
  const response = await fetch(url);
  const data = await response.json();
  
  // Map 7Timer weather codes to Open-Meteo compatible format
  const weatherCodeMap = {
    'clear': 0,
    'pcloudy': 2,
    'cloudy': 3,
    'rain': 61,
    'tsrain': 95,
    'snow': 71,
    'fog': 45,
    'mcloudy': 3,
    'ishower': 61,
    'lightrain': 61,
    'lightsnow': 71,
    'humid': 45
  };
  
  const weatherType = data.dataseries?.[0]?.weather || 'clear';
  const weatherCode = weatherCodeMap[weatherType] || 0;
  
  // Convert 7Timer response to match Open-Meteo structure
  return {
    current_weather: {
      temperature: data.dataseries?.[0]?.temp2m || 24,
      weathercode: weatherCode,
      windspeed: data.dataseries?.[0]?.wind10m?.max || 5,
      is_day: 1
    },
    isFallback: true,
    source: '7Timer'
  };
}

app.get('/api/weather', async (req, res) => {
  const { lat, lon } = req.query;
  if (!lat || !lon) {
    return res.status(400).json({ error: 'Missing lat or lon parameters' });
  }

  const cacheKey = `weather_${lat}_${lon}`;
  
  // Try cache first
  const cached = getCachedWeather(cacheKey);
  if (cached) {
    return res.json(cached);
  }

  const url = [
    'https://api.open-meteo.com/v1/forecast',
    `?latitude=${lat}&longitude=${lon}`,
    '&current_weather=true',
    '&hourly=precipitation_probability',
    '&timezone=auto'
  ].join('');

  try {
    console.log(`[Weather Proxy] Fetching current weather for (${lat}, ${lon})`);
    const data = await fetchWithRetry(url);
    
    setCachedWeather(cacheKey, data);
    return res.json(data);
  } catch (error) {
    console.error('[Weather Proxy] Open-Meteo failed:', error.message);
    
    // Try fallback: 7Timer
    try {
      console.log('[Weather Proxy] Attempting 7Timer fallback...');
      const fallbackData = await fetchFrom7Timer(lat, lon);
      setCachedWeather(cacheKey, fallbackData);
      return res.json(fallbackData);
    } catch (fallbackError) {
      console.error('[Weather Proxy] Fallback also failed:', fallbackError.message);
      
      // Try stale cache as last resort
      const staleCache = weatherCache.get(cacheKey);
      if (staleCache) {
        console.log('[Weather Proxy] Using stale cache as final fallback');
        return res.json(staleCache.data);
      }
      
      res.status(502).json({ 
        error: 'Weather service temporarily unavailable', 
        isFallback: true,
        temperature: 24,
        condition: 'Weather data unavailable'
      });
    }
  }
});

app.get('/api/weather/forecast', async (req, res) => {
  const { lat, lon } = req.query;
  if (!lat || !lon) {
    return res.status(400).json({ error: 'Missing lat or lon parameters' });
  }

  const cacheKey = `forecast_${lat}_${lon}`;
  
  // Try cache first
  const cached = getCachedWeather(cacheKey);
  if (cached) {
    return res.json(cached);
  }

  const url = [
    'https://api.open-meteo.com/v1/forecast',
    `?latitude=${lat}&longitude=${lon}`,
    '&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    '&timezone=auto',
    '&forecast_days=5'
  ].join('');

  try {
    console.log(`[Weather Forecast Proxy] Fetching forecast for (${lat}, ${lon})`);
    const data = await fetchWithRetry(url);
    
    setCachedWeather(cacheKey, data);
    res.json(data);
  } catch (error) {
    console.error('[Weather Forecast Proxy] Failed:', error.message);
    
    // Try stale cache as fallback
    const staleCache = weatherCache.get(cacheKey);
    if (staleCache) {
      console.log('[Weather Forecast Proxy] Using stale cache as fallback');
      return res.json(staleCache.data);
    }
    
    // Return minimal forecast fallback
    const today = new Date();
    const fallbackForecast = Array.from({ length: 5 }, (_, i) => ({
      date: new Date(today.setDate(today.getDate() + i)).toISOString().split('T')[0],
      weathercode: 0,
      temperature_2m_max: 26,
      temperature_2m_min: 22,
      precipitation_probability_max: 10
    }));
    
    res.status(502).json({ 
      daily: {
        time: fallbackForecast.map(d => d.date),
        weathercode: fallbackForecast.map(d => d.weathercode),
        temperature_2m_max: fallbackForecast.map(d => d.temperature_2m_max),
        temperature_2m_min: fallbackForecast.map(d => d.temperature_2m_min),
        precipitation_probability_max: fallbackForecast.map(d => d.precipitation_probability_max)
      },
      isFallback: true
    });
  }
});

// ============================================
// REPORTS ROUTES
// ============================================
app.use('/api/reports', reportsRoutes);

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use('/admin', adminRoutes);
app.use('/auth', authRoutes);
app.use('/analytics/heatmap', heatmapRouter);
app.use('/analytics', analyticsRoutes);

// ─── 404 Handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// ─── Error Handler ────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  handleError(err, req, res);
});

// ─── Server Startup ───────────────────────────────────────────────────────────
async function startServer() {
  await runDevMigrations();

  return app.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║    UG Campus Navigation API                               ║
║    🔐 Supabase Auth - JWT Verification Only               ║
║    Server running on 0.0.0.0:${PORT} (all interfaces)        ║
║                                                            ║
║    Endpoints:                                              ║
║    • GET    /auth/me         - Get profile                 ║
║    • PATCH  /auth/preferences - Update preferences        ║
║    • DELETE /auth/me         - Delete account              ║
║    • POST   /auth/sync       - Sync user from Supabase    ║
║    • GET    /health          - Health check                ║
║    • GET    /admin/*         - Admin dashboard            ║
    ║    • GET    /api/locationiq/* - LocationIQ proxy          ║
    ║    • POST   /api/overpass    - Overpass API proxy (CORS bypass) ║
    ║    • GET    /api/weather     - Weather proxy (with 7Timer fallback) ║
║    • GET    /api/weather/forecast - Weather forecast      ║
║    • POST   /api/reports     - Submit accessibility report ║
║    • GET    /api/reports     - List reports (admin)        ║
║    • PATCH  /api/reports/:id - Approve/reject report       ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
  `);
  });
}

const server = await startServer();

// ─── Keep-alive ping (prevents Render free tier cold starts) ─────────────────
if (process.env.NODE_ENV === 'production') {
  const PING_URL = process.env.RENDER_EXTERNAL_URL || 'https://api-ug-navigator.onrender.com';
  setInterval(async () => {
    try {
      await fetch(`${PING_URL}/health`);
      console.log('[Keep-alive] Pinged /health');
    } catch (err) {
      console.error('[Keep-alive] Ping failed:', err.message);
    }
  }, 10 * 60 * 1000);
}

// ─── Graceful Shutdown ────────────────────────────────────────────────────────
process.on('SIGTERM', () => {
  console.log('[Server] SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('[Server] HTTP server closed');
    process.exit(0);
  });
});

export default app;