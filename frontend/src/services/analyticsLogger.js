// frontend/src/services/analyticsLogger.js
import { API_URL } from '../config';

async function fetchWithAuth(url, options = {}) {
  const token = sessionStorage.getItem('accessToken');
  
  // Skip if no token
  if (!token) return null;
  
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers
      }
    });
    
    // Silently ignore 401
    if (response.status === 401) return null;
    
    return response;
  } catch (err) {
    return null;
  }
}

export async function logRouteCalculated(startLocation, endLocation, profileUsed, distance) {
  fetchWithAuth(`${API_URL}/analytics/route`, {
    method: 'POST',
    body: JSON.stringify({
      start_location: startLocation,
      end_location: endLocation,
      profile_used: profileUsed,
      distance: distance
    })
  });
}

export async function logSearch(query, selectedResult) {
  // This used to branch on whether selectedResult had coordinates, posting
  // lat/lng-bearing payloads to POST /analytics/heatmap/search. That endpoint
  // does not exist on the backend, and there is no table or column for it
  // either. The request did not even surface as a 404: /analytics/heatmap is
  // mounted before /analytics, so the unmatched sub-path fell through to the
  // authed analytics router, whose verifyToken rejected it with 401 because
  // this call sent no Authorization header. The .catch(() => {}) then swallowed
  // that. Every destination search was being recorded nowhere, silently.
  //
  // The existing POST /analytics/log endpoint is the correct destination: it
  // takes activity_type plus a metadata JSON string and writes to user_activity,
  // which already exists in both the SQLite and Postgres schemas. No new table
  // or migration is needed to start capturing searches.
  const isLocationObject =
    selectedResult && typeof selectedResult === 'object' &&
    'lat' in selectedResult && 'lng' in selectedResult;

  const metadata = isLocationObject
    ? {
        query,
        destination_name: selectedResult.name ?? null,
        lat: selectedResult.lat,
        lng: selectedResult.lng,
      }
    : { query, selected_result: selectedResult };

  return fetchWithAuth(`${API_URL}/analytics/log`, {
    method: 'POST',
    body: JSON.stringify({
      activity_type: 'search',
      metadata: JSON.stringify(metadata),
    }),
  });
}

export async function logLogin() {
  const token = sessionStorage.getItem('accessToken');
  if (!token) return;
  
  fetchWithAuth(`${API_URL}/analytics/log`, {
    method: 'POST',
    body: JSON.stringify({
      activity_type: 'login',
      metadata: JSON.stringify({ timestamp: new Date().toISOString() })
    })
  });
}