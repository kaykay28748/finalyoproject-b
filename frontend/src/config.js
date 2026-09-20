// frontend/src/config.js
// API configuration - works for both development and production

const getApiUrl = () => {
  // Production (deployed on Render)
  if (import.meta.env.PROD) {
    // Use environment variable if set, otherwise fallback to Render URL
    const productionUrl = import.meta.env.VITE_API_URL || 'https://api-transit-guide.onrender.com';
    console.log('[Config] Production mode, API URL:', productionUrl);
    return productionUrl;
  }
  
  // Development (localhost)
  // Standardize on localhost:3001 for consistency across environments
  const devUrl = import.meta.env.VITE_DEV_API_URL || "http://localhost:3001";

  if (typeof window !== 'undefined') {
    console.log(`%c[API Config] Running in DEV mode. Target: ${devUrl}`, "color: #2563eb; font-weight: bold;");
  }

  return devUrl;
};

export const API_URL = getApiUrl();

// Optional: Add a health check helper
export const checkApiHealth = async () => {
  try {
    const response = await fetch(`${API_URL}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch (error) {
    console.warn('[Config] API health check failed:', error.message);
    return false;
  }
};