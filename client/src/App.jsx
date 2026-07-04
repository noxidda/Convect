import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ClerkProvider, useAuth, useUser } from '@clerk/clerk-react';
import { SocketProvider } from './context/SocketContext';
import Onboarding from './pages/Onboarding';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Signup from './pages/Signup';
import axios from 'axios';

// Get Clerk Publishable Key from environment
const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

// Axios default headers interceptor to inject Clerk Token
const AxiosAuthInterceptor = ({ children }) => {
  const { getToken } = useAuth();
  const { user } = useUser();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const interceptor = axios.interceptors.request.use(
      async (config) => {
        try {
          const token = await getToken();
          if (token) {
            config.headers.Authorization = `Bearer ${token}`;
          }
        } catch (err) {
          console.error('Error attaching token to request:', err);
        }
        // Always attach Clerk UserId in header as dev fallback
        if (user) {
          config.headers['x-clerk-user-id'] = user.id;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    setReady(true);

    return () => {
      axios.interceptors.request.eject(interceptor);
    };
  }, [getToken, user]);

  if (!ready) return null;

  return children;
};

const AppContent = () => {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const [dbUser, setDbUser] = useState(null);
  const [syncing, setSyncing] = useState(true);
  const [syncError, setSyncError] = useState(null);
  const [retryTrigger, setRetryTrigger] = useState(0);

  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn) {
      setSyncing(false);
      setDbUser(null);
      return;
    }

    const syncUser = async () => {
      setSyncing(true);
      setSyncError(null);
      try {
        const token = await getToken();
        // Sync user details with MongoDB
        const res = await axios.post('/api/users/sync', {
          username: user.username || user.firstName || '',
          bio: 'Hey there! I am using this chat app.',
          profilePhoto: user.imageUrl || '',
        }, {
          headers: {
            Authorization: `Bearer ${token}`,
            'x-clerk-user-id': user.id
          }
        });
        setDbUser(res.data);
      } catch (err) {
        console.error('Error syncing user with DB:', err);
        setSyncError('Failed to sync profile with database. Please try again.');
      } finally {
        setSyncing(false);
      }
    };

    syncUser();
  }, [isSignedIn, isLoaded, user, getToken, retryTrigger]);

  if (!isLoaded || (isSignedIn && syncing)) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        backgroundColor: 'var(--bg-app)',
        color: 'var(--text-primary)',
        gap: '10px'
      }}>
        <div style={{
          width: '40px',
          height: '40px',
          border: '4px solid var(--border)',
          borderTop: '4px solid var(--accent)',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }}></div>
        <p style={{ fontWeight: 500 }}>Connecting to Convect...</p>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  if (isSignedIn && syncError) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        backgroundColor: 'var(--bg-app)',
        color: 'var(--text-primary)',
        gap: '15px',
        padding: '2rem',
        textAlign: 'center'
      }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Connection Error</h2>
        <p style={{ color: 'var(--text-secondary)', maxWidth: '400px', lineHeight: 1.5 }}>
          {syncError}
        </p>
        <button
          onClick={() => {
            setSyncError(null);
            setSyncing(true);
            setRetryTrigger(prev => prev + 1);
          }}
          style={{
            backgroundColor: 'var(--accent)',
            color: 'var(--bg-sidebar)',
            border: 'none',
            padding: '0.75rem 1.5rem',
            borderRadius: 'var(--border-radius)',
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          Retry Connection
        </button>
      </div>
    );
  }

  // Not Signed In
  if (!isSignedIn) {
    return (
      <div className="auth-container">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </div>
    );
  }

  // Signed In, but not completed onboarding (missing username)
  if (dbUser && !dbUser.username) {
    return (
      <AxiosAuthInterceptor>
        <Routes>
          <Route path="/onboarding" element={<Onboarding onOnboarded={(updated) => setDbUser(updated)} />} />
          <Route path="*" element={<Navigate to="/onboarding" replace />} />
        </Routes>
      </AxiosAuthInterceptor>
    );
  }

  // Signed In and onboarded
  return (
    <AxiosAuthInterceptor>
      <SocketProvider>
        <Routes>
          <Route path="/" element={<Dashboard dbUser={dbUser} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </SocketProvider>
    </AxiosAuthInterceptor>
  );
};

const App = () => {
  // Global theme initialization
  useEffect(() => {
    // Remove the data-theme attribute so the root styling applies globally
    document.documentElement.removeAttribute('data-theme');
  }, []);

  // If Clerk Publishable Key is missing, render setup notice
  if (!clerkPubKey) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '2rem',
        height: '100vh',
        backgroundColor: '#FEF9C3',
        color: '#000000',
        textAlign: 'center'
      }}>
        <div style={{
          maxWidth: '500px',
          backgroundColor: '#FFFFFF',
          border: '2px solid #A3E635',
          borderRadius: '8px',
          padding: '2.5rem',
          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'
        }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1rem' }}>Clerk Configuration Required</h2>
          <p style={{ color: '#374151', marginBottom: '1.5rem', lineHeight: 1.5 }}>
            To run this application, you must configure your Clerk Publishable Key in the client side environment variables.
          </p>
          <div style={{
            textAlign: 'left',
            backgroundColor: '#F3F4F6',
            padding: '1rem',
            borderRadius: '8px',
            fontSize: '0.875rem',
            fontFamily: 'monospace',
            marginBottom: '1.5rem'
          }}>
            Create a file named <strong>.env</strong> in the <strong>client</strong> directory and add:
            <br />
            <code style={{ display: 'block', marginTop: '0.5rem', color: '#111827', fontWeight: 600 }}>
              VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
            </code>
          </div>
          <p style={{ fontSize: '0.875rem', color: '#6B7280' }}>
            Refresh this page after adding the environment variables.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ClerkProvider publishableKey={clerkPubKey}>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
      <style>{`
        .auth-container, .auth-wrapper {
          height: 100vh;
          width: 100vw;
          background-color: var(--bg-app);
          overflow: hidden;
        }
        
        /* Custom Clerk Styling matching the app design system */
        .cl-rootBox {
          font-family: var(--font-sans) !important;
        }
        
        .cl-card {
          background-color: var(--bg-card) !important;
          border: 1px solid var(--border) !important;
          border-radius: var(--border-radius) !important;
          box-shadow: var(--shadow-md) !important;
          width: 100% !important;
          max-width: 400px !important;
          padding: 2.5rem !important;
        }

        .cl-headerTitle {
          color: var(--text-primary) !important;
          font-family: var(--font-sans) !important;
          font-weight: 700 !important;
          font-size: var(--text-xl) !important;
        }

        .cl-headerSubtitle {
          color: var(--text-muted) !important;
          font-family: var(--font-sans) !important;
          font-size: var(--text-sm) !important;
        }

        .cl-formLabel {
          color: var(--text-secondary) !important;
          font-weight: 600 !important;
          font-size: var(--text-xs) !important;
          text-transform: uppercase !important;
          letter-spacing: 0.05em !important;
        }

        .cl-formFieldInput {
          background-color: var(--bg-card) !important;
          border: 1px solid var(--border) !important;
          border-radius: var(--border-radius) !important;
          color: var(--text-primary) !important;
          padding: 0.75rem 1rem !important;
          font-size: var(--text-sm) !important;
          outline: none !important;
        }

        .cl-formFieldInput:focus {
          border-color: var(--accent) !important;
          box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.25) !important;
        }

        .cl-formButtonPrimary {
          background-color: var(--accent) !important;
          color: var(--bg-sidebar) !important;
          font-weight: 600 !important;
          border-radius: var(--border-radius) !important;
          padding: 0.75rem 1.5rem !important;
          transition: background-color 0.2s ease, opacity 0.2s ease !important;
          border: none !important;
          box-shadow: none !important;
          text-transform: none !important;
        }

        .cl-formButtonPrimary:hover {
          background-color: var(--accent-hover) !important;
        }

        .cl-footerActionText {
          color: var(--text-muted) !important;
          font-size: var(--text-sm) !important;
        }

        .cl-footerActionLink {
          color: var(--accent) !important;
          font-weight: 600 !important;
          font-size: var(--text-sm) !important;
          text-decoration: none !important;
          transition: color 0.2s ease !important;
        }

        .cl-footerActionLink:hover {
          color: var(--accent-hover) !important;
          text-decoration: underline !important;
        }

        .cl-socialButtonsBlockButton {
          border: 1px solid var(--border) !important;
          background-color: var(--bg-card) !important;
          color: var(--text-primary) !important;
          border-radius: var(--border-radius) !important;
          transition: background-color 0.2s ease !important;
        }

        .cl-socialButtonsBlockButton:hover {
          background-color: var(--bg-active) !important;
        }

        .cl-socialButtonsBlockButtonText {
          color: var(--text-primary) !important;
          font-weight: 500 !important;
        }

        .cl-dividerText {
          color: var(--text-muted) !important;
          font-size: var(--text-xs) !important;
          text-transform: uppercase !important;
        }

        .cl-dividerLine {
          background-color: var(--border) !important;
        }

        .cl-identityPreviewText {
          color: var(--text-primary) !important;
        }

        .cl-identityPreviewEditButtonIcon {
          color: var(--accent) !important;
        }
      `}</style>
    </ClerkProvider>
  );
};

export default App;
