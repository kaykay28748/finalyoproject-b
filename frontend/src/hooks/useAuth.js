// frontend/src/hooks/useAuth.js
// Authentication hook - Supabase Auth version (no OAuth)

import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { API_URL } from '../config';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

 

const syncUserWithBackend = useCallback(async (supabaseUser, accessToken) => {
  // Always sync with backend — even in mock/dev mode — so the user exists in the DB
  try {
    const response = await fetch(`${API_URL}/auth/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: supabaseUser, accessToken })
    });
    
    if (!response.ok) {
      throw new Error(`Failed to sync user with backend: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('[useAuth] Sync error:', error);
    throw error;
  }
}, []);

  // Initialize auth - Restore session from Supabase on mount
  useEffect(() => {
    const initializeAuth = async () => {
      console.log('[useAuth] Initializing auth...');
      setIsLoading(true);
      
      try {
        // Get session from Supabase
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          console.error('[useAuth] Session error:', sessionError);
          setIsLoading(false);
          return;
        }

        if (session) {
          console.log('[useAuth] Session found, syncing user...');
          const supabaseUser = session.user;
          const accessToken = session.access_token;
          
          const backendUser = await syncUserWithBackend(supabaseUser, accessToken);
          
          if (backendUser) {
            const userData = {
              id: backendUser.id,
              email: backendUser.email,
              username: backendUser.username,
              is_admin: backendUser.is_admin || 0,
              created_at: backendUser.created_at,
            };
            
            sessionStorage.setItem('accessToken', accessToken);
            sessionStorage.setItem('user', JSON.stringify(userData));
            
            setUser(userData);
            setIsAuthenticated(true);
            console.log('[useAuth] User restored:', userData.email);
          } else {
            console.warn('[useAuth] Failed to sync user with backend');
          }
        } else {
          console.log('[useAuth] No session found');
        }
      } catch (err) {
        console.error('[useAuth] Initialization error:', err);
      } finally {
        setIsLoading(false);
        console.log('[useAuth] Initialization complete, isLoading:', false);
      }
    };

    initializeAuth();

    // Listen for auth changes (login/logout from Supabase)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('[useAuth] Auth state changed:', event);
        
        if (event === 'SIGNED_IN' && session) {
          const supabaseUser = session.user;
          const accessToken = session.access_token;
          
          const backendUser = await syncUserWithBackend(supabaseUser, accessToken);
          
          if (backendUser) {
            const userData = {
              id: backendUser.id,
              email: backendUser.email,
              username: backendUser.username,
              is_admin: backendUser.is_admin || 0,
              created_at: backendUser.created_at,
            };
            
            sessionStorage.setItem('accessToken', accessToken);
            sessionStorage.setItem('user', JSON.stringify(userData));
            
            setUser(userData);
            setIsAuthenticated(true);
          }
        } else if (event === 'SIGNED_OUT') {
          sessionStorage.removeItem('accessToken');
          sessionStorage.removeItem('user');
          setUser(null);
          setIsAuthenticated(false);
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [syncUserWithBackend]);

  // Register with Supabase - WITH pre-check for existing email
  const register = useCallback(async (email, username, password) => {
    try {
      // STEP 1: Check if email already exists in your users table (BEFORE calling Supabase)
      const { data: existingUser, error: fetchError } = await supabase
        .from('users')
        .select('email')
        .eq('email', email.toLowerCase())
        .maybeSingle();
      
      if (existingUser) {
        console.log('[useAuth] Email already exists in users table:', email);
        return {
          success: false,
          error: `An account with ${email} already exists. Please sign in instead.`,
          isDuplicate: true
        };
      }
      
      // STEP 2: If email doesn't exist, proceed with registration
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username: username,
            username_display: username
          }
        }
      });

      // Handle duplicate email error (fallback in case race condition)
      if (signUpError) {
        console.error('[useAuth] Signup error:', signUpError);
        
        // Check for duplicate email
        if (signUpError.message?.toLowerCase().includes('already registered') ||
            signUpError.message?.toLowerCase().includes('user already registered')) {
          return {
            success: false,
            error: `An account with ${email} already exists. Please sign in instead.`,
            isDuplicate: true
          };
        }
        
        // Handle rate limiting
        if (signUpError.message?.toLowerCase().includes('rate limit')) {
          return {
            success: false,
            error: 'Too many attempts. Please wait a few minutes before trying again.',
          };
        }
        
        return {
          success: false,
          error: signUpError.message
        };
      }

      if (data?.user) {
        const needsEmailConfirmation = !data.user?.email_confirmed_at;
        
        const accessToken = data.session?.access_token;
        if (accessToken && !needsEmailConfirmation) {
          const backendUser = await syncUserWithBackend(data.user, accessToken);
          
          if (backendUser) {
            const userData = {
              id: backendUser.id,
              email: backendUser.email,
              username: backendUser.username,
              is_admin: backendUser.is_admin || 0,
              created_at: backendUser.created_at,
            };
            
            sessionStorage.setItem('accessToken', accessToken);
            sessionStorage.setItem('user', JSON.stringify(userData));
            
            setUser(userData);
            setIsAuthenticated(true);
          }
        }
        
        console.log('[useAuth] Registration successful:', email);
        return { 
          success: true, 
          needsEmailConfirmation: needsEmailConfirmation 
        };
      }
      
      return { success: false, error: 'Registration failed' };
    } catch (err) {
      console.error('[useAuth] Register error:', err);
      return {
        success: false,
        error: 'Could not connect to server — check your connection',
      };
    }
  }, [syncUserWithBackend]);

  // Login with Supabase
  const login = useCallback(async (email, password) => {
    try {
      const { data, error: loginError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (loginError) {
        return {
          success: false,
          error: loginError.message
        };
      }

      if (data?.user && data?.session) {
        const supabaseUser = data.user;
        const accessToken = data.session.access_token;
        
        const backendUser = await syncUserWithBackend(supabaseUser, accessToken);
        
        if (backendUser) {
          const userData = {
            id: backendUser.id,
            email: backendUser.email,
            username: backendUser.username,
            is_admin: backendUser.is_admin || 0,
            created_at: backendUser.created_at,
          };
          
          sessionStorage.setItem('accessToken', accessToken);
          sessionStorage.setItem('user', JSON.stringify(userData));
          
          setUser(userData);
          setIsAuthenticated(true);
        }
        
        console.log('[useAuth] Login successful:', email);
        return { success: true };
      }
      
      return { success: false, error: 'Login failed' };
    } catch (err) {
      console.error('[useAuth] Login error:', err);
      return {
        success: false,
        error: 'Could not connect to server — check your connection',
      };
    }
  }, [syncUserWithBackend]);

  // Logout from Supabase
  const logout = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    
    if (error) {
      console.warn('[useAuth] Logout error:', error);
    }
    
    sessionStorage.removeItem('accessToken');
    sessionStorage.removeItem('user');
    
    setUser(null);
    setIsAuthenticated(false);
    console.log('[useAuth] Logout complete');
  }, []);

  const getAuthHeader = useCallback(() => {
    const token = sessionStorage.getItem('accessToken');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  }, []);

  const isAdmin = useCallback(() => {
    return user?.is_admin === 1 || user?.is_admin === true;
  }, [user]);

  return {
    user,
    isAuthenticated,
    isLoading,
    error,
    register,
    login,
    logout,
    getAuthHeader,
    isAdmin,
  };
}