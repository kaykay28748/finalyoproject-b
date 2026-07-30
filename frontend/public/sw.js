// public/sw.js
// TransitGuide Service Worker - Offline support with proper API handling

const CACHE_NAME = 'transitguide-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching static assets');
      return cache.addAll(urlsToCache);
    })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Helper to check if request is an API call
function isApiRequest(url) {
  // Check for backend port
  if (url.port === '3001') return true;
  
  // Check for API paths
  const apiPaths = ['/auth', '/admin', '/analytics', '/api', '/health'];
  for (const path of apiPaths) {
    if (url.pathname.startsWith(path)) return true;
  }
  
  return false;
}

// FETCH EVENT - CRITICAL: API calls must NEVER go through service worker cache
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  
  // ============================================
  // API REQUESTS - COMPLETE BYPASS
  // No caching, no interception, just pure fetch
  // ============================================
  if (isApiRequest(url)) {
    // For API calls, just pass through without any SW interference
    event.respondWith(fetch(request));
    return;
  }
  
  // ============================================
  // STATIC ASSETS - Cache with network fallback
  // ============================================
  // Only handle GET requests for static assets
  if (request.method !== 'GET') {
    event.respondWith(fetch(request));
    return;
  }
  
  // Only handle same-origin requests
  if (url.origin !== self.location.origin) {
    event.respondWith(fetch(request));
    return;
  }
  
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      // Return cached response if available
      if (cachedResponse) {
        return cachedResponse;
      }
      
      // Otherwise fetch from network
      return fetch(request).then((networkResponse) => {
        // Only cache successful responses
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        // Fallback for offline
        if (request.headers.get('accept')?.includes('text/html')) {
          return new Response('You are offline. Please check your connection.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain' }
          });
        }
        return new Response('Network error', { status: 408 });
      });
    })
  );
});