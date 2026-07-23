// frontend/src/lib/supabase.js
import { createClient } from '@supabase/supabase-js';

// ============================================
// MOCK SUPABASE CLIENT FOR DEVELOPMENT
// ============================================

const MOCK_USER_ID = '00000000-0000-0000-0000-000000000000';

class MockSupabaseClient {
  constructor() {
    this._session = null;
    this._user = null;
    
    const savedSession = localStorage.getItem('mock_supabase_session');
    if (savedSession) {
      try {
        this._session = JSON.parse(savedSession);
        // Migrate stale sessions from old mock token format
        if (this._session?.access_token !== 'mock-token') {
          console.log('[Mock Supabase] Clearing stale session with old token format');
          this._session = null;
          this._user = null;
          localStorage.removeItem('mock_supabase_session');
        } else {
          this._user = this._session?.user || null;
        }
      } catch (e) {
        // ignore
      }
    }
  }

  auth = {
    getSession: async () => {
      console.log('[Mock Supabase] getSession');
      return { data: { session: this._session }, error: null };
    },

    getUser: async () => {
      console.log('[Mock Supabase] getUser');
      return { data: { user: this._user }, error: null };
    },

    signInWithPassword: async ({ email, password }) => {
      console.log('[Mock Supabase] signInWithPassword:', email);
      
      this._user = {
        id: MOCK_USER_ID,
        email: email,
        user_metadata: { username: email.split('@')[0], full_name: email.split('@')[0] }
      };
      this._session = {
        access_token: 'mock-token',
        refresh_token: 'mock-refresh-token',
        user: this._user
      };
      
      localStorage.setItem('mock_supabase_session', JSON.stringify(this._session));
      
      return { data: { user: this._user, session: this._session }, error: null };
    },

    signUp: async ({ email, password, options }) => {
      console.log('[Mock Supabase] signUp:', email);
      
      this._user = {
        id: MOCK_USER_ID,
        email: email,
        user_metadata: options?.data || { username: email.split('@')[0] }
      };
      this._session = {
        access_token: 'mock-token',
        refresh_token: 'mock-refresh-token',
        user: this._user
      };
      
      localStorage.setItem('mock_supabase_session', JSON.stringify(this._session));
      
      return { data: { user: this._user, session: this._session }, error: null };
    },

    signOut: async () => {
      console.log('[Mock Supabase] signOut');
      this._user = null;
      this._session = null;
      localStorage.removeItem('mock_supabase_session');
      return { error: null };
    },

    updateUser: async ({ password }) => {
      console.log('[Mock Supabase] updateUser (password)');
      return { data: { user: this._user }, error: null };
    },

    resetPasswordForEmail: async (email) => {
      console.log('[Mock Supabase] resetPasswordForEmail:', email);
      return { data: {}, error: null };
    },

    resend: async ({ type, email }) => {
      console.log('[Mock Supabase] resend:', type, email);
      return { data: {}, error: null };
    },

    onAuthStateChange: (callback) => {
      console.log('[Mock Supabase] onAuthStateChange registered');
      setTimeout(() => {
        if (this._user) {
          callback('SIGNED_IN', this._session);
        } else {
          callback('SIGNED_OUT', null);
        }
      }, 0);
      
      return {
        data: {
          subscription: {
            unsubscribe: () => console.log('[Mock Supabase] unsubscribe')
          }
        }
      };
    },

    admin: {
      deleteUser: async (userId) => {
        console.log('[Mock Supabase] admin.deleteUser:', userId);
        return { error: null };
      }
    }
  };

  from(table) {
    console.log('[Mock Supabase] query on table:', table);
    
    return {
      select: (columns) => ({
        eq: (column, value) => ({
          single: async () => ({ data: null, error: null }),
          maybeSingle: async () => ({ data: null, error: null }),
          order: () => ({
            limit: () => ({
              then: (callback) => callback({ data: [], error: null })
            })
          })
        }),
        order: (column, options) => ({
          limit: (limit) => ({
            then: (callback) => callback({ data: [], error: null })
          })
        }),
        then: (callback) => callback({ data: [], error: null })
      }),
      insert: (data) => ({
        select: () => ({
          single: async () => ({ data: { id: `mock-${Date.now()}`, ...data }, error: null })
        })
      }),
      update: (data) => ({
        eq: (column, value) => ({
          then: (callback) => callback({ data: null, error: null })
        })
      }),
      delete: () => ({
        eq: (column, value) => ({
          then: (callback) => callback({ data: null, error: null })
        })
      })
    };
  }
}

// ============================================
// PRODUCTION-READY CLIENT INITIALIZATION
// ============================================

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const isDev = import.meta.env.DEV;
const isProd = import.meta.env.PROD;

// Determine which client to use
let supabaseClient;

// PRODUCTION: Must have real Supabase keys
if (isProd) {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      '🚨 PRODUCTION ERROR: Missing Supabase environment variables.\n' +
      'Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your production environment.'
    );
  }
  console.log('[Supabase] Production mode: using REAL Supabase client');
  supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
}
// DEVELOPMENT: Use mock if no keys provided, otherwise use real Supabase
else if (isDev) {
  if (supabaseUrl && supabaseAnonKey) {
    console.log('[Supabase] Development mode: using REAL Supabase client (keys found)');
    supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
  } else {
    console.log('[Supabase] Development mode: using MOCK Supabase client (no keys found)');
    supabaseClient = new MockSupabaseClient();
  }
}
// Fallback (should never happen)
else {
  console.warn('[Supabase] Unknown environment, using mock client');
  supabaseClient = new MockSupabaseClient();
}

// Add this debug line
console.log('[Supabase] Client mode:', supabaseClient instanceof MockSupabaseClient ? 'MOCK' : 'REAL');
window._supabaseDebug = supabaseClient instanceof MockSupabaseClient ? 'MOCK' : 'REAL';

export const supabase = supabaseClient;
export const isUsingMockSupabase = () => supabaseClient instanceof MockSupabaseClient;