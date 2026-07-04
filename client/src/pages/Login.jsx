import React, { useState } from 'react';
import { useSignIn } from '@clerk/clerk-react';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, Lock, AlertCircle, Loader2, MessageSquare, KeyRound } from 'lucide-react';
import signinImg from '../assets/signin.jpg';

const Login = () => {
  const { isLoaded, signIn, setActive } = useSignIn();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingMfa, setPendingMfa] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const navigate = useNavigate();

  const handleSignIn = async (e) => {
    e.preventDefault();
    if (!isLoaded || loading) return;
    setLoading(true);
    setError('');

    try {
      const result = await signIn.create({
        identifier: email,
        password,
      });

      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
        navigate('/');
      } else if (result.status === 'needs_second_factor') {
        setPendingMfa(true);
        // Automatically prepare phone code if it is a supported second factor
        const smsFactor = result.supportedSecondFactors.find(
          (f) => f.strategy === 'phone_code'
        );
        if (smsFactor) {
          try {
            await signIn.prepareSecondFactor(smsFactor);
          } catch (prepErr) {
            console.error('Error preparing SMS factor:', prepErr);
          }
        }
      } else {
        console.warn('Sign in requires further steps:', result.status);
        setError('Verification is required. Please sign in via the standard portal.');
      }
    } catch (err) {
      console.error('Clerk login error:', err);
      setError(err.errors?.[0]?.longMessage || 'Invalid email or password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleMfaSubmit = async (e) => {
    e.preventDefault();
    if (!isLoaded || loading) return;
    setLoading(true);
    setError('');

    try {
      const factor = signIn.supportedSecondFactors.find(
        (f) => f.strategy === 'totp' || f.strategy === 'phone_code'
      );

      if (!factor) {
        throw new Error('No supported second factor found for this account.');
      }

      const result = await signIn.attemptSecondFactor({
        strategy: factor.strategy,
        code: mfaCode,
      });

      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
        navigate('/');
      } else {
        setError(`Sign in incomplete. Status: ${result.status}`);
      }
    } catch (err) {
      console.error('Clerk MFA error:', err);
      setError(err.errors?.[0]?.longMessage || 'Invalid verification code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page-container">
      <div className="login-left-side">
        <img src={signinImg} alt="Sign In" className="login-bg-image" />
      </div>
      <div className="login-right-side">
        {!pendingMfa ? (
          <div className="login-card">
            {/* Brand Header */}
            <div className="brand-header">
              <h1 className="brand-name">Convect</h1>
            </div>

            {/* Error Alert */}
            {error && (
              <div className="error-alert">
                <AlertCircle size={18} className="error-icon" />
                <span>{error}</span>
              </div>
            )}

            {/* Sign In Form */}
            <form onSubmit={handleSignIn} className="login-form">
              <div className="form-group">
                <label htmlFor="email">Email Address</label>
                <div className="input-icon-wrapper">
                  <Mail size={18} className="input-icon" />
                  <input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="password">Password</label>
                <div className="input-icon-wrapper">
                  <Lock size={18} className="input-icon" />
                  <input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>
              </div>

              <button type="submit" className="submit-btn" disabled={loading || !isLoaded}>
                {loading ? (
                  <>
                    <Loader2 size={18} className="spinner" />
                    Signing In...
                  </>
                ) : (
                  'Sign In'
                )}
              </button>
            </form>

            {/* Footer Link */}
            <div className="card-footer">
              Don't have an account?{' '}
              <Link to="/signup" className="signup-link">
                Sign up
              </Link>
            </div>
          </div>
        ) : (
          <div className="login-card">
            {/* Brand Header */}
            <div className="brand-header">
              <h1 className="brand-name">Two-Step Verification</h1>
              <p className="brand-tagline">
                Enter the code from your authenticator app or mobile device.
              </p>
            </div>

            {/* Error Alert */}
            {error && (
              <div className="error-alert">
                <AlertCircle size={18} className="error-icon" />
                <span>{error}</span>
              </div>
            )}

            {/* MFA Form */}
            <form onSubmit={handleMfaSubmit} className="login-form">
              <div className="form-group">
                <label htmlFor="mfaCode">Verification Code</label>
                <div className="input-icon-wrapper">
                  <KeyRound size={18} className="input-icon" />
                  <input
                    id="mfaCode"
                    type="text"
                    placeholder="123456"
                    maxLength={6}
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value)}
                    required
                    disabled={loading}
                    style={{ letterSpacing: '0.2em', textAlign: 'center', fontWeight: 'bold' }}
                  />
                </div>
              </div>

              <button type="submit" className="submit-btn" disabled={loading || !isLoaded}>
                {loading ? (
                  <>
                    <Loader2 size={18} className="spinner" />
                    Verifying...
                  </>
                ) : (
                  'Verify & Login'
                )}
              </button>

              <button 
                type="button" 
                className="back-btn" 
                onClick={() => {
                  setPendingMfa(false);
                  setError('');
                }} 
                disabled={loading}
              >
                Go Back
              </button>
            </form>
          </div>
        )}
      </div>

      <style>{`
        .login-page-container {
          display: flex;
          flex-direction: row;
          width: 100vw;
          height: 100vh;
          background-color: var(--bg-app);
          overflow: hidden;
        }

        .login-left-side {
          width: 50%;
          height: 100%;
          position: relative;
          overflow: hidden;
        }

        .login-bg-image {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .login-right-side {
          width: 50%;
          height: 100%;
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 2rem;
          overflow-y: auto;
          background-color: black;
        }

        @media (max-width: 768px) {
          .login-left-side {
            display: none;
          }
          .login-right-side {
            width: 100%;
          }
        }

        .login-card {
          width: 100%;
          max-width: 420px;
          background-color: var(--bg-card);
          border: 2px solid var(--lighter-gray);
          border-radius: 25px;
          padding: 2.5rem;
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          animation: fadeIn 0.3s ease-out;
        }

        .brand-header {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: 0.5rem;
        }

        .brand-icon-wrapper {
          display: flex;
          justify-content: center;
          align-items: center;
          background-color: var(--bg-active);
          border: none;
          border-radius: 50%;
          width: 60px;
          height: 60px;
          color: var(--accent);
          margin-bottom: 0.25rem;
        }

        .brand-name {
          font-size: var(--text-xl);
          font-weight: 700;
          color: var(--text-primary);
          letter-spacing: -0.02em;
        }

        .brand-tagline {
          font-size: var(--text-sm);
          color: var(--text-muted);
          line-height: 1.4;
        }

        .error-alert {
          background-color: #7F1D1D;
          border: 1px solid transparent;
          border-radius: var(--border-radius);
          padding: 0.75rem 1rem;
          color: #FEE2E2;
          font-size: var(--text-sm);
          display: flex;
          align-items: flex-start;
          gap: 0.5rem;
          line-height: 1.4;
        }

        .error-icon {
          flex-shrink: 0;
          margin-top: 2px;
        }

        .login-form {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .form-group label {
          font-size: var(--text-xs);
          font-weight: 600;
          color: var(--darker-white);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .input-icon-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }

        .input-icon {
          position: absolute;
          left: 14px;
          color: var(--darker-white);
          pointer-events: none;
        }

        .input-icon-wrapper input {
          padding-left: 42px !important;
          background-color: var(--bg-card) !important;
          border: 2px solid var(--border) !important;
          border-radius: var(--border-radius) !important;
          color: var(--text-primary) !important;
          font-size: var(--text-sm);
          height: 46px;
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }

        .input-icon-wrapper input:focus {
          border-color: var(--accent) !important;
          box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.25) !important;
        }

        .submit-btn {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 0.5rem;
          background-color: var(--accent);
          color: var(--bg-sidebar);
          font-weight: 600;
          border-radius: var(--border-radius);
          height: 46px;
          font-size: var(--text-sm);
          cursor: pointer;
          transition: background-color 0.2s ease, opacity 0.2s ease;
          border: none;
          box-shadow: none;
        }

        .submit-btn:hover:not(:disabled) {
          background-color: var(--accent-hover);
        }

        .submit-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .back-btn {
          display: flex;
          justify-content: center;
          align-items: center;
          background-color: transparent;
          color: var(--text-secondary);
          border: none;
          font-weight: 600;
          border-radius: var(--border-radius);
          height: 46px;
          font-size: var(--text-sm);
          cursor: pointer;
          transition: background-color 0.2s ease;
        }

        .back-btn:hover:not(:disabled) {
          background-color: var(--bg-active);
          color: var(--text-primary);
        }

        .back-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .spinner {
          animation: spin 1s linear infinite;
        }

        .card-footer {
          text-align: center;
          font-size: var(--text-sm);
          color: var(--darker-white);
        }

        .signup-link {
          color: var(--accent);
          font-weight: 600;
          text-decoration: none;
          transition: color 0.2s ease;
        }

        .signup-link:hover {
          color: var(--accent-hover);
          text-decoration: underline;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default Login;
