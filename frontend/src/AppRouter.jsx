// frontend/src/AppRouter.jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthContext } from './context/AuthContext';
import AuthPage from './components/Auth/AuthPage';
import AuthCallback from './pages/AuthCallback';
import AdminDashboard from './components/Admin/AdminDashboard';
import ResetPasswordPage from './components/Auth/ResetPasswordPage';
import ProfilePage from './components/Profile/ProfilePage';
import AppLoadingScreen from './components/AppLoadingScreen';
import App from './App';

// Protected route wrapper
function ProtectedRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuthContext();
  
  if (isLoading) {
    return <AppLoadingScreen message="Restoring your session" />;
  }
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  return children;
}

// Admin route wrapper
function AdminRoute({ children }) {
  const { isAuthenticated, isLoading, isAdmin } = useAuthContext();
  
  if (isLoading) {
    return <AppLoadingScreen darkMode message="Restoring your admin session" />;
  }
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  if (!isAdmin()) {
    return <Navigate to="/" replace />;
  }
  
  return children;
}

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<AuthPage />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        
        {/* Protected routes */}
        <Route 
          path="/admin" 
          element={
            <AdminRoute>
              <AdminDashboard />
            </AdminRoute>
          } 
        />
        <Route 
          path="/profile" 
          element={
            <ProtectedRoute>
              <ProfilePage />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/" 
          element={
            <ProtectedRoute>
              <App />
            </ProtectedRoute>
          } 
        />
      </Routes>
    </BrowserRouter>
  );
}