// frontend/src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthProvider } from './context/AuthContext';
import AppRouter from './AppRouter';
import './index.css';

// PWA fullscreen fix: set actual viewport height as a CSS variable.
// In standalone PWA mode, 100dvh/100vh can be incorrect due to system
// navigation bars. window.innerHeight reflects the true available height.
function setAppHeight() {
  const vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty('--vh', `${vh}px`);
}
setAppHeight();
window.addEventListener('resize', setAppHeight);
// Also handle orientation changes which fire resize after a delay
window.addEventListener('orientationchange', () => setTimeout(setAppHeight, 100));

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  </React.StrictMode>
);