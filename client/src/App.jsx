import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ClerkProvider, useAuth, useUser } from '@clerk/clerk-react';
import { SocketProvider } from './context/SocketContext';
import Onboarding from './pages/Onboarding';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Signup from './pages/Signup';
import axios from 'axios';

// get clerk publishable
const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

// configure backend url
axios.defaults.baseURL = import.meta.env.VITE_BACKEND_URL || '';

// axios default headers
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
        // always attach clerk
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
        // sync user details
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

  // not signed in
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

  // signed in, but
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

  // signed in and
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

const MobileBlockedScreen = () => {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
      width: '100vw',
      backgroundColor: '#ffd8a8',
      color: '#000000',
      padding: '2rem',
      textAlign: 'center',
      boxSizing: 'border-box'
    }}>
      <div style={{
        maxWidth: '450px',
        backgroundColor: '#FFFFFF',
        border: '4px solid #000000',
        borderRadius: '12px',
        padding: '2.5rem 2rem',
        boxShadow: '10px 10px 0px #000000',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1.5rem',
      }}>
        <div style={{
          position: 'relative',
          width: '80px',
          height: '80px',
          backgroundColor: '#ffc5c5',
          border: '3px solid #000000',
          borderRadius: '50%',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          boxShadow: '4px 4px 0px #000000',
          animation: 'bounce 2s infinite ease-in-out'
        }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#000000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
          <div style={{
            position: 'absolute',
            top: '-5px',
            right: '-5px',
            backgroundColor: '#ff3e3e',
            color: '#ffffff',
            border: '2.5px solid #000000',
            borderRadius: '50%',
            width: '30px',
            height: '30px',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            fontWeight: '900',
            fontSize: '1rem',
            boxShadow: '2px 2px 0px #000000'
          }}>
            🚫
          </div>
        </div>

        <h1 style={{
          fontSize: '1.8rem',
          fontWeight: 900,
          textTransform: 'uppercase',
          margin: 0,
          letterSpacing: '-0.02em',
          lineHeight: 1.1
        }}>
          PC Only Access
        </h1>

        <p style={{
          color: '#222222',
          fontSize: '0.95rem',
          lineHeight: 1.5,
          fontWeight: 600,
          margin: 0
        }}>
          Convect is designed specifically for <span style={{ textDecoration: 'underline', fontWeight: 900 }}>desktop or laptop screens</span>. 
          Please access this app from a PC to join the conversation!
        </p>

        <div style={{
          width: '100%',
          backgroundColor: '#F5F5F5',
          border: '3px solid #000000',
          padding: '1rem',
          borderRadius: '8px',
          fontSize: '0.8rem',
          fontFamily: 'monospace',
          fontWeight: 900,
          textTransform: 'uppercase',
          boxShadow: '3px 3px 0px #000000'
        }}>
          📱 Current device: Mobile/Phone detected
        </div>
      </div>
      <style>{`
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
      `}</style>
    </div>
  );
};

const useDeviceCheck = () => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkDevice = () => {
      const userAgentMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const smallScreen = window.innerWidth < 768;
      setIsMobile(userAgentMobile || smallScreen);
    };

    checkDevice();
    window.addEventListener('resize', checkDevice);
    return () => window.removeEventListener('resize', checkDevice);
  }, []);

  return isMobile;
};

const App = () => {
  const isMobile = useDeviceCheck();

  // global theme initialization
  useEffect(() => {
    // remove the data-theme
    document.documentElement.removeAttribute('data-theme');
    
    // load and set
    const savedColor = localStorage.getItem('convect-theme-color');
    if (savedColor) {
      document.documentElement.style.setProperty('--color', savedColor);
    }
  }, []);

  if (isMobile) {
    return <MobileBlockedScreen />;
  }

  // if clerk publishable
  if (!clerkPubKey) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '2rem',
        height: '100vh',
        backgroundColor: '#D6C9FF',
        color: '#000000',
        textAlign: 'center'
      }}>
        <div style={{
          maxWidth: '500px',
          backgroundColor: '#FFFFFF',
          border: '4px solid #000000',
          borderRadius: '4px',
          padding: '2.5rem',
          boxShadow: '8px 8px 0px #000000'
        }}>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 900, marginBottom: '1rem', textTransform: 'uppercase' }}>Clerk Configuration Required</h2>
          <p style={{ color: '#000000', marginBottom: '1.5rem', lineHeight: 1.4, fontWeight: 600 }}>
            To run this application, you must configure your Clerk Publishable Key in the client side environment variables.
          </p>
          <div style={{
            textAlign: 'left',
            backgroundColor: '#F5F5F5',
            border: '3px solid #000000',
            padding: '1rem',
            borderRadius: '4px',
            fontSize: '0.875rem',
            fontFamily: 'monospace',
            marginBottom: '1.5rem'
          }}>
            Create a file named <strong>.env</strong> in the <strong>client</strong> directory and add:
            <br />
            <code style={{ display: 'block', marginTop: '0.5rem', color: '#000000', fontWeight: 900 }}>
              VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
            </code>
          </div>
          <p style={{ fontSize: '0.875rem', color: '#222222', fontWeight: 600 }}>
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
          background-color: #FFFFFF !important;
          border: 4px solid #000000 !important;
          border-radius: 4px !important;
          box-shadow: 8px 8px 0px #000000 !important;
          width: 100% !important;
          max-width: 400px !important;
          padding: 2.5rem !important;
        }

        .cl-headerTitle {
          color: #000000 !important;
          font-family: var(--font-sans) !important;
          font-weight: 900 !important;
          font-size: 1.5rem !important;
          text-transform: uppercase !important;
          letter-spacing: -0.02em !important;
        }

        .cl-headerSubtitle {
          color: #222222 !important;
          font-family: var(--font-sans) !important;
          font-size: var(--text-sm) !important;
          font-weight: 600 !important;
        }

        .cl-formLabel {
          color: #000000 !important;
          font-weight: 900 !important;
          font-size: var(--text-xs) !important;
          text-transform: uppercase !important;
          letter-spacing: 0.05em !important;
        }

        .cl-formFieldInput {
          background-color: #FFFFFF !important;
          border: 3px solid #000000 !important;
          border-radius: 4px !important;
          color: #000000 !important;
          padding: 0.75rem 1rem !important;
          font-size: var(--text-sm) !important;
          outline: none !important;
          box-shadow: 3px 3px 0px #000000 !important;
        }

        .cl-formFieldInput:focus {
          background-color: #D6C9FF !important;
          border-color: #000000 !important;
          box-shadow: 5px 5px 0px #000000 !important;
        }

        .cl-formButtonPrimary {
          background-color: #D6C9FF !important;
          color: #000000 !important;
          font-weight: 900 !important;
          border-radius: 4px !important;
          padding: 0.75rem 1.5rem !important;
          transition: transform 0.1s ease, box-shadow 0.1s ease !important;
          border: 3px solid #000000 !important;
          box-shadow: 4px 4px 0px #000000 !important;
          text-transform: uppercase !important;
        }

        .cl-formButtonPrimary:hover {
          background-color: #D6C9FF !important;
          transform: translate(-2px, -2px) !important;
          box-shadow: 6px 6px 0px #000000 !important;
        }

        .cl-formButtonPrimary:active {
          transform: translate(1px, 1px) !important;
          box-shadow: 1px 1px 0px #000000 !important;
        }

        .cl-footerActionText {
          color: #222222 !important;
          font-size: var(--text-sm) !important;
          font-weight: 600 !important;
        }

        .cl-footerActionLink {
          color: #000000 !important;
          font-weight: 900 !important;
          font-size: var(--text-sm) !important;
          text-decoration: underline !important;
          transition: color 0.2s ease !important;
        }

        .cl-footerActionLink:hover {
          color: #000000 !important;
          text-decoration: underline !important;
        }

        .cl-socialButtonsBlockButton {
          border: 3px solid #000000 !important;
          background-color: #FFFFFF !important;
          color: #000000 !important;
          border-radius: 4px !important;
          box-shadow: 3px 3px 0px #000000 !important;
          transition: transform 0.1s ease, box-shadow 0.1s ease !important;
        }

        .cl-socialButtonsBlockButton:hover {
          transform: translate(-2px, -2px) !important;
          box-shadow: 5px 5px 0px #000000 !important;
          background-color: #D6C9FF !important;
        }

        .cl-socialButtonsBlockButtonText {
          color: #000000 !important;
          font-weight: 900 !important;
          text-transform: uppercase !important;
        }

        .cl-dividerText {
          color: #000000 !important;
          font-size: var(--text-xs) !important;
          text-transform: uppercase !important;
          font-weight: 900 !important;
        }

        .cl-dividerLine {
          background-color: #000000 !important;
          height: 3px !important;
        }

        .cl-identityPreviewText {
          color: #000000 !important;
          font-weight: 600 !important;
        }

        .cl-identityPreviewEditButtonIcon {
          color: #000000 !important;
        }
      `}</style>
    </ClerkProvider>
  );
};

export default App;
