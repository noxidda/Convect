import React, { useState } from 'react';
import { useSignIn } from '@clerk/clerk-react';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, Lock, AlertCircle, Loader2, MessageSquare, KeyRound, Eye, EyeOff } from 'lucide-react';
import signinImg from '../assets/signin.jpg';

const Login = () => {
  const { isLoaded, signIn, setActive } = useSignIn();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
        // automatically prepare phone
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
        <img src={signinImg} alt="Convect" className="login-bg-image" />
      </div>
      <div className="login-right-side">
        {!pendingMfa ? (
          <div className="login-card">
            {/* brand header */}
            <div className="brand-header">
              <h1 className="brand-name">Login</h1>
            </div>

            {/* error alert */}
            {error && (
              <div className="error-alert">
                <AlertCircle size={18} className="error-icon" />
                <span>{error}</span>
              </div>
            )}

            {/* sign in form */}
            <form onSubmit={handleSignIn} className="login-form">
              <div className="form-group">
                <label htmlFor="email">Email Address</label>
                <div className="input-icon-wrapper">
                  <input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={loading}
                  />
                  <Mail size={18} className="input-icon" />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="password">Password</label>
                <div className="input-icon-wrapper">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={loading}
                    style={{ paddingRight: '46px !important' }}
                  />
                  <Lock size={18} className="input-icon" />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="password-toggle-btn"
                    style={{
                      position: 'absolute',
                      right: '14px',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      color: '#000000',
                      padding: 0,
                      zIndex: 3
                    }}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
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

            {/* footer link */}
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
                  <KeyRound size={18} className="input-icon" />
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
        .login-page-container, .signup-page-container {
          display: flex;
          flex-direction: row;
          width: 100vw;
          height: 100vh;
          background-color: #FFFFFF;
          overflow: hidden;
        }

        .login-left-side, .signup-left-side {
          width: 50%;
          height: 100%;
          position: relative;
          overflow: hidden;
          border-right: 6px solid #FFFFFF;
        }

        .login-bg-image, .signup-bg-image {
          width: 100%;
          height: 100%;
          object-fit: cover;
          filter: grayscale(100%);
        }

        .login-right-side, .signup-right-side {
          width: 50%;
          height: 100%;
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 2rem;
          overflow-y: auto;
          background-color: #FFFFFF;
        }

        @media (max-width: 768px) {
          .login-left-side, .signup-left-side {
            display: none;
          }
          .login-right-side, .signup-right-side {
            width: 100%;
          }
        }

        .login-card, .signup-card {
          width: 100%;
          max-width: 420px;
          background-color: #FFFFFF;
          border: 4px solid #000000;
          border-radius: 10px;
          padding: 2.5rem;
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          margin: auto;
          box-shadow: 8px 8px 0px #000000;
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
          background-color: #000000;
          border-radius: 50%;
          width: 60px;
          height: 60px;
          color: #FFFFFF;
          margin-bottom: 0.25rem;
          border: 3px solid #000000;
        }

        .brand-name {
          font-size: 2.25rem;
          font-weight: 900;
          color: #000000;
          letter-spacing: -0.03em;
          text-transform: uppercase;
        }

        .brand-tagline {
          font-size: var(--text-sm);
          color: #222222;
          line-height: 1.4;
          font-weight: 600;
        }

        .error-alert {
          background-color: #000000;
          border: 3px solid #000000;
          border-radius: 10px;
          padding: 0.75rem 1rem;
          color: #FFFFFF;
          font-size: var(--text-sm);
          display: flex;
          align-items: flex-start;
          gap: 0.5rem;
          line-height: 1.4;
          box-shadow: 3px 3px 0px #000000;
        }

        .error-icon {
          flex-shrink: 0;
          margin-top: 2px;
        }

        .login-form, .signup-form {
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
          font-weight: 900;
          color: #000000;
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
          color: #000000;
          pointer-events: none;
          z-index: 2;
          transition: transform 0.1s ease;
        }

        .input-icon-wrapper input {
          padding-left: 42px !important;
          background-color: #FFFFFF !important;
          border: 3px solid #000000 !important;
          border-radius: 10px !important;
          color: #000000 !important;
          font-size: var(--text-sm);
          height: 48px;
          box-shadow: 3px 3px 0px #000000 !important;
          transition: transform 0.1s ease, box-shadow 0.1s ease;
        }

        .input-icon-wrapper input:focus {
          background-color: #FFFFFF !important;
          border-color: #000000 !important;
          transform: translate(-2px, -2px);
          box-shadow: 5px 5px 0px #000000 !important;
        }

        .input-icon-wrapper input:focus ~ .input-icon {
          transform: translate(-2px, -2px);
        }

        .submit-btn {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 0.5rem;
          background-color: #FFFFFF;
          color: #000000;
          font-weight: 900;
          border: 3px solid #000000;
          border-radius: 10px;
          height: 48px;
          font-size: var(--text-sm);
          cursor: pointer;
          transition: transform 0.1s ease, box-shadow 0.1s ease;
          box-shadow: 4px 4px 0px #000000;
          text-transform: uppercase;
        }

        .submit-btn:hover:not(:disabled) {
          transform: translate(2px, 2px);
          box-shadow: 2px 2px 0px #000000;
        }

        .submit-btn:active:not(:disabled) {
          transform: translate(4px, 4px);
          box-shadow: none;
        }

        .submit-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
          box-shadow: none;
        }

        .back-btn {
          display: flex;
          justify-content: center;
          align-items: center;
          background-color: #FFFFFF;
          color: #000000;
          border: 3px solid #000000;
          font-weight: 900;
          border-radius: 10px;
          height: 48px;
          font-size: var(--text-sm);
          cursor: pointer;
          transition: transform 0.1s ease, box-shadow 0.1s ease;
          box-shadow: 3px 3px 0px #000000;
          text-transform: uppercase;
        }

        .back-btn:hover:not(:disabled) {
          transform: translate(2px, 2px);
          box-shadow: 2px 2px 0px #000000;
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
          color: #000000;
          font-weight: 600;
        }

        .signup-link, .login-link {
          color: #000000;
          font-weight: 900;
          text-decoration: underline;
        }

        .signup-link:hover, .login-link:hover {
          color: #555555;
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
        
        .verification-instruction {
          font-size: var(--text-xs);
          color: #000000;
          line-height: 1.4;
          margin-bottom: 0.25rem;
          font-weight: 600;
        }

        /* Selection/Highlighting - Strictly Black and White */
        ::selection {
          background-color: #000000 !important;
          color: #FFFFFF !important;
        }
        ::-moz-selection {
          background-color: #000000 !important;
          color: #FFFFFF !important;
        }

        .login-card ::selection, .signup-card ::selection {
          background-color: #FFFFFF !important;
          color: #000000 !important;
        }
        .login-card ::-moz-selection, .signup-card ::-moz-selection {
          background-color: #FFFFFF !important;
          color: #000000 !important;
        }
      `}</style>
    </div>
  );
};

export default Login;
