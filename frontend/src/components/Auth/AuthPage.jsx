// frontend/src/components/Auth/AuthPage.jsx
import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import LoginPage from './LoginPage';
import RegisterPage from './RegisterPage';
import ForgotPasswordPage from './ForgotPasswordPage';
import ResetPasswordPage from './ResetPasswordPage';
import './AuthPage.css';

export default function AuthPage() {
  const [mode, setMode] = useState('login'); // login, register, forgot, reset
  const [darkMode, setDarkMode] = useState(false);
  const location = useLocation();

  // Detect system theme on mount
  useEffect(() => {
    // Check if user has a saved preference
    const saved = localStorage.getItem('authTheme');
    let isDark;
    if (saved !== null) {
      isDark = saved === 'dark';
    } else {
      // Detect system preference
      isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    setDarkMode(isDark);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', isDark ? '#0d0d0d' : '#d0d7e2');

    // Listen for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e) => {
      // Only update if user hasn't manually set a preference
      if (localStorage.getItem('authTheme') === null) {
        setDarkMode(e.matches);
        const m = document.querySelector('meta[name="theme-color"]');
        if (m) m.setAttribute('content', e.matches ? '#0d0d0d' : '#d0d7e2');
      }
    };
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // Check for reset mode from Supabase hash in URL
  useEffect(() => {
    const hash = location.hash;
    if (hash && hash.includes('access_token')) {
      setMode('reset');
    } else {
      const params = new URLSearchParams(window.location.search);
      const token = params.get('token');
      if (token) {
        setMode('reset');
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
  }, [location]);

  // Wrap everything with the theme class
  const themeClass = darkMode ? 'dark' : '';

  if (mode === 'login') {
    return (
      <div className={themeClass}>
        <LoginPage 
          onSwitchToRegister={() => setMode('register')}
          onForgotPassword={() => setMode('forgot')}
        />
      </div>
    );
  }
  
  if (mode === 'register') {
    return (
      <div className={themeClass}>
        <RegisterPage 
          onSwitchToLogin={() => setMode('login')}
        />
      </div>
    );
  }
  
  if (mode === 'forgot') {
    return (
      <div className={themeClass}>
        <ForgotPasswordPage 
          onBackToLogin={() => setMode('login')}
        />
      </div>
    );
  }
  
  if (mode === 'reset') {
    return (
      <div className={themeClass}>
        <ResetPasswordPage 
          onComplete={() => setMode('login')}
        />
      </div>
    );
  }
  
  return null;
}