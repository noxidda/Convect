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

export default Signup;
