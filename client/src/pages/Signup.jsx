import React, { useState } from 'react';
import { useSignUp } from '@clerk/clerk-react';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, Lock, AlertCircle, Loader2, KeyRound, MessageSquare } from 'lucide-react';
import signinImg from '../assets/signin.jpg';

const Signup = () => {
  const { isLoaded, signUp, setActive } = useSignUp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pendingVerification, setPendingVerification] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // handle initial account
  const handleSignUpSubmit = async (e) => {
    e.preventDefault();
    if (!isLoaded || loading) return;
    setLoading(true);
    setError('');

    try {
      const result = await signUp.create({
        emailAddress: email,
        password,
      });

      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
        navigate('/');
      } else {
        // send the verification
        await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
        setPendingVerification(true);
      }
    } catch (err) {
      console.error('Clerk signup create error:', err);
      setError(err.errors?.[0]?.longMessage || 'Failed to initialize sign up. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // handle otp verification
  const handleVerifySubmit = async (e) => {
    e.preventDefault();
    if (!isLoaded || loading) return;
    setLoading(true);
    setError('');

    try {
      const completeSignUp = await signUp.attemptEmailAddressVerification({
        code,
      });

      if (completeSignUp.status === 'complete') {
        await setActive({ session: completeSignUp.createdSessionId });
        navigate('/');
      } else {
        console.warn('Sign up status incomplete:', completeSignUp.status);
        setError('Sign up is incomplete. Please contact support or try again.');
      }
    } catch (err) {
      console.error('Clerk verification error:', err);
      setError(err.errors?.[0]?.longMessage || 'Invalid or expired code. Please check your email.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="signup-page-container">
      <div className="signup-left-side">
        <img src={signinImg} alt="Sign Up" className="signup-bg-image" />
      </div>
      <div className="signup-right-side">
        <div className="signup-card">
          {/* brand header */}
          <div className="brand-header">
            <h1 className="brand-name">Create Account</h1>
            <p className="brand-tagline">
              {pendingVerification 
                ? 'Verify your email to active your account.' 
                : ''}
            </p>
          </div>

          {/* error alert */}
          {error && (
            <div className="error-alert">
              <AlertCircle size={18} className="error-icon" />
              <span>{error}</span>
            </div>
          )}

          {/* account details step */}
          {!pendingVerification ? (
            <form onSubmit={handleSignUpSubmit} className="signup-form">
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
                    type="password"
                    placeholder="Min. 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={loading}
                  />
                  <Lock size={18} className="input-icon" />
                </div>
              </div>

              <div id="clerk-captcha"></div>

              <button type="submit" className="submit-btn" disabled={loading || !isLoaded}>
                {loading ? (
                  <>
                    <Loader2 size={18} className="spinner" />
                    Creating Account...
                  </>
                ) : (
                  'Sign Up'
                )}
              </button>
            </form>
          ) : (
            /* otp code verification */
            <form onSubmit={handleVerifySubmit} className="signup-form">
              <div className="form-group">
                <label htmlFor="code">Verification Code</label>
                <p className="verification-instruction">
                  We sent a 6-digit verification code to <strong>{email}</strong>.
                </p>
                <div className="input-icon-wrapper">
                  <input
                    id="code"
                    type="text"
                    placeholder="123456"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
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
                    Verifying Code...
                  </>
                ) : (
                  'Verify & Login'
                )}
              </button>
              
              <button 
                type="button" 
                className="back-btn" 
                onClick={() => setPendingVerification(false)} 
                disabled={loading}
              >
                Go Back
              </button>
            </form>
          )}

          {/* footer link */}
          <div className="card-footer">
            Already have an account?{' '}
            <Link to="/login" className="login-link">
              Sign in
            </Link>
          </div>
        </div>
      </div>

      <style>{`
        .signup-page-container {
          display: flex;
          flex-direction: row;
          width: 100vw;
          height: 100vh;
          background-color: var(--bg-app);
          overflow: hidden;
        }

        .signup-left-side {
          width: 50%;
          height: 100%;
          position: relative;
          overflow: hidden;
        }

        .signup-bg-image {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .signup-right-side {
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
          .signup-left-side {
            display: none;
          }
          .signup-right-side {
            width: 100%;
          }
        }

        .signup-card {
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

        .signup-form {
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

        .verification-instruction {
          font-size: var(--text-xs);
          color: var(--text-secondary);
          line-height: 1.4;
          margin-bottom: 0.25rem;
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
          z-index: 2;
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

        .login-link {
          color: var(--accent);
          font-weight: 600;
          text-decoration: none;
          transition: color 0.2s ease;
        }

        .login-link:hover {
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

export default Signup;
