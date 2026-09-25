// hooks/useWeather.js
// Weather data and routing integration.
// NO VOICE DEPENDENCY — voice is handled by WeatherBanner (the consumer).

import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchWeather, getWeatherMultipliers, WEATHER_CODES } from '../services/weatherService';

export function useWeather() {
  const [weather,      setWeather]      = useState(null);
  const [isLoading,    setIsLoading]    = useState(true);
  const [error,        setError]        = useState(null);
  const [lastUpdated,  setLastUpdated]  = useState(null);

  const previousWeatherRef  = useRef(null);
  const hasSpokenInitialRef = useRef(false);

  // Format weather message for voice (caller speaks it)
  const formatWeatherMessage = useCallback((weatherData, hasImpact) => {
    const temp      = Math.round(weatherData.temperature);
    const condition = weatherData.condition || 'Unknown';
    const impact    = hasImpact ? ' Routing adjusted for conditions.' : ' Normal routing.';
    return `Current weather: ${condition}, ${temp} degrees.${impact}`;
  }, []);

  // Format weather update message
  const formatWeatherUpdateMessage = useCallback((oldWeather, newWeather, hasImpact) => {
    const oldCondition = oldWeather?.condition || 'Unknown';
    const newCondition = newWeather?.condition  || 'Unknown';
    const temp         = Math.round(newWeather.temperature);
    if (oldCondition !== newCondition) {
      return `Weather update: ${newCondition} detected, ${temp} degrees. Routing adjusted for conditions.`;
    }
    return `Weather updated: ${newCondition}, ${temp} degrees.`;
  }, []);

  const getWeatherDisplay = useCallback(() => {
    if (!weather) {
      return { icon: '🌡️', label: 'Loading...', description: 'Fetching weather data' };
    }
    const weatherInfo = WEATHER_CODES[weather.weatherCode] || WEATHER_CODES[0];
    return {
      icon:        weather.icon || weatherInfo.icon,
      label:       weather.condition,
      description: weatherInfo.description,
      temperature: weather.temperature,
      feelsLike:   weather.temperature,
      humidity:    weather.humidity,
      windSpeed:   weather.windSpeed,
      isDay:       weather.isDay,
    };
  }, [weather]);

  // Null-guarded: weather can be null during initial load or after an error.
  // Night is excluded on purpose — it is a profile concern, not a weather one,
  // and getWeatherMultipliers no longer derives a message from it.
  const hasWeatherImpact = useCallback(() => {
    if (!weather || weather.isFallback) return false;
    const code    = weather.weatherCode;
    const isRain  = [51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code);
    const isStorm = [95, 96, 99].includes(code);
    const isSnow  = [71, 73, 75, 77, 85, 86].includes(code);
    const isHeat  = (weather.temperature ?? 0) >= 30;
    const isFog   = [45, 48].includes(code);
    return isRain || isStorm || isSnow || isHeat || isFog;
  }, [weather]);

  const refreshWeather = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchWeather();
      setWeather(data);
      setError(null);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('[useWeather] Error:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Returns change metadata without speaking — consumer decides when to announce
  const getWeatherChange = useCallback((oldWeather, newWeather) => {
    if (!oldWeather || !newWeather) return null;
    if (oldWeather.condition !== newWeather.condition) {
      return {
        type:         'condition_change',
        oldCondition: oldWeather.condition,
        newCondition: newWeather.condition,
        temperature:  Math.round(newWeather.temperature),
        hasImpact:    hasWeatherImpact(),
      };
    }
    return null;
  }, [hasWeatherImpact]);

  // Initial fetch + 10-minute refresh interval
  useEffect(() => {
    refreshWeather();
    const interval = setInterval(refreshWeather, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [refreshWeather]);

  return {
    weather,
    isLoading,
    error,
    lastUpdated,
    refreshWeather,
    getMultipliers:             () => getWeatherMultipliers(weather),
    getWeatherDisplay,
    hasWeatherImpact,
    formatWeatherMessage,
    formatWeatherUpdateMessage,
    getWeatherChange,
  };
}