import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import appIcon from '../assets/appicon.png';

const Landing = () => {
  const { isSignedIn } = useAuth();
  
  const handleDownload = () => {
    alert('Convect for Windows download starting...');
  };

  return (
    <div className="landing-page-container">
      {/* Navbar */}
      <nav className="landing-navbar">
        <div className="nav-left">
          <Link to="/" className="nav-brand-link">
            <span className="nav-brand-name">convect</span>
          </Link>
        </div>
        <div className="nav-right">
          <button onClick={handleDownload} className="btn-download-nav">
            <svg className="windows-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M0 3.449L9.75 2.1v9.45H0V3.449zM0 12.45h9.75v9.45L0 20.551v-8.1zM11.25 1.875L24 0v11.55H11.25V1.875zM11.25 12.45H24v11.55l-12.75-1.875v-9.675z"/>
            </svg>
            <span>Download</span>
          </button>
          {isSignedIn ? (
            <Link to="/dashboard" className="btn-login-nav">
              Dashboard
            </Link>
          ) : (
            <Link to="/login" className="btn-login-nav">
              Login
            </Link>
          )}
        </div>
      </nav>

      {/* Main Content */}
      <main className="landing-main">
        {/* Hero Section */}
        <section className="hero-section">
          <div className="hero-content">
            <h1 className="hero-title">STARK. FAST.<br />MINIMAL CHAT.</h1>
            <p className="hero-tagline">
              Convect is a lightweight, real-time communication platform designed for fast conversations and keyboard-first navigation.
            </p>
            <div className="hero-actions">
              <button onClick={handleDownload} className="btn-download-hero">
                <svg className="windows-icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M0 3.449L9.75 2.1v9.45H0V3.449zM0 12.45h9.75v9.45L0 20.551v-8.1zM11.25 1.875L24 0v11.55H11.25V1.875zM11.25 12.45H24v11.55l-12.75-1.875v-9.675z"/>
                </svg>
                <span>Download for Windows</span>
              </button>
              {isSignedIn ? (
                <Link to="/dashboard" className="btn-signup-hero">
                  Go to Dashboard
                </Link>
              ) : (
                <Link to="/signup" className="btn-signup-hero">
                  Create Account
                </Link>
              )}
            </div>
          </div>
          <div className="hero-image-wrapper">
            <div className="logo-centerpiece-frame">
              <img src={appIcon} alt="Convect Logo" className="hero-logo-centerpiece" />
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="features-section">
          <div className="feature-card">
            <h3 className="feature-title">Ultra-Fast Syncing</h3>
            <p className="feature-desc">
              Built on WebSockets for instantaneous message delivery and notification handling. Experience communication with zero artificial delays.
            </p>
          </div>
          <div className="feature-card">
            <h3 className="feature-title">Windows Native</h3>
            <p className="feature-desc">
              Optimized for Windows. Enjoy low resource consumption, custom taskbar capabilities, and native performance.
            </p>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="landing-footer">
        <p className="footer-text">&copy; {new Date().getFullYear()} Convect. made by Aditya Pandit.</p>
      </footer>

      {/* Style Block */}
      <style>{`
        .landing-page-container {
          width: 100vw;
          height: 100vh;
          background-color: #FFFFFF;
          display: flex;
          flex-direction: column;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          color: #000000;
          overflow: hidden;
        }

        /* Navbar Styling */
        .landing-navbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0 2.5rem;
          background-color: #FFFFFF;
          border-bottom: 4px solid #000000;
          height: 70px;
          flex-shrink: 0;
        }

        .nav-left {
          display: flex;
          align-items: center;
        }

        .nav-brand-link {
          text-decoration: none;
          color: inherit;
          display: flex;
          align-items: center;
        }

        .nav-brand-name {
          font-size: 1.5rem;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: -0.03em;
        }

        .nav-right {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        /* Nav Buttons */
        .btn-download-nav {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          background-color: #FFFFFF;
          color: #000000;
          border: 3px solid #000000;
          border-radius: 8px;
          padding: 0.4rem 0.85rem;
          font-weight: 900;
          font-size: 0.875rem;
          text-transform: uppercase;
          cursor: pointer;
          transition: transform 0.1s ease, box-shadow 0.1s ease;
          box-shadow: 3px 3px 0px #000000;
        }

        .btn-download-nav:hover {
          transform: translate(1px, 1px);
          box-shadow: 2px 2px 0px #000000;
        }

        .btn-download-nav:active {
          transform: translate(3px, 3px);
          box-shadow: none;
        }

        .btn-login-nav {
          background-color: #D6C9FF; /* Match Convect purple theme */
          color: #000000;
          border: 3px solid #000000;
          border-radius: 8px;
          padding: 0.4rem 1.15rem;
          font-weight: 900;
          font-size: 0.875rem;
          text-transform: uppercase;
          text-decoration: none;
          cursor: pointer;
          transition: transform 0.1s ease, box-shadow 0.1s ease;
          box-shadow: 3px 3px 0px #000000;
        }

        .btn-login-nav:hover {
          transform: translate(1px, 1px);
          box-shadow: 2px 2px 0px #000000;
        }

        .btn-login-nav:active {
          transform: translate(3px, 3px);
          box-shadow: none;
        }

        /* Main Content */
        .landing-main {
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding: 1.5rem 2.5rem;
          max-width: 1200px;
          margin: 0 auto;
          width: 100%;
          gap: 1.5rem;
          overflow: hidden;
        }

        /* Hero Section */
        .hero-section {
          display: flex;
          flex-direction: row;
          align-items: center;
          gap: 4rem;
        }

        .hero-content {
          flex: 1.2;
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }

        .hero-title {
          font-size: 3.25rem;
          font-weight: 900;
          line-height: 1.05;
          letter-spacing: -0.03em;
        }

        .hero-tagline {
          font-size: 1.05rem;
          color: #222222;
          line-height: 1.45;
          font-weight: 600;
        }

        .hero-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 1rem;
          margin-top: 0.5rem;
        }

        .btn-download-hero {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          background-color: #FFFFFF;
          color: #000000;
          border: 4px solid #000000;
          border-radius: 10px;
          padding: 0.75rem 1.5rem;
          font-weight: 900;
          font-size: 0.95rem;
          text-transform: uppercase;
          cursor: pointer;
          transition: transform 0.1s ease, box-shadow 0.1s ease;
          box-shadow: 4px 4px 0px #000000;
        }

        .btn-download-hero:hover {
          transform: translate(2px, 2px);
          box-shadow: 2px 2px 0px #000000;
        }

        .btn-download-hero:active {
          transform: translate(4px, 4px);
          box-shadow: none;
        }

        .btn-signup-hero {
          background-color: #D6C9FF;
          color: #000000;
          border: 4px solid #000000;
          border-radius: 10px;
          padding: 0.75rem 1.5rem;
          font-weight: 900;
          font-size: 0.95rem;
          text-transform: uppercase;
          text-decoration: none;
          text-align: center;
          cursor: pointer;
          transition: transform 0.1s ease, box-shadow 0.1s ease;
          box-shadow: 4px 4px 0px #000000;
        }

        .btn-signup-hero:hover {
          transform: translate(2px, 2px);
          box-shadow: 2px 2px 0px #000000;
        }

        .btn-signup-hero:active {
          transform: translate(4px, 4px);
          box-shadow: none;
        }

        .hero-image-wrapper {
          flex: 1;
          display: flex;
          justify-content: center;
          align-items: center;
        }

        .logo-centerpiece-frame {
          display: flex;
          justify-content: center;
          align-items: center;
          max-width: 320px;
          width: 100%;
          aspect-ratio: 1;
        }

        .hero-logo-centerpiece {
          width: 100%;
          height: 100%;
          object-fit: contain;
          display: block;
        }

        /* Features Section */
        .features-section {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 1.5rem;
          margin-top: 0.5rem;
        }

        .feature-card {
          background-color: #FFFFFF;
          border: 3px solid #000000;
          border-radius: 10px;
          padding: 1.25rem 1.5rem;
          box-shadow: 4px 4px 0px #000000;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .feature-title {
          font-size: 1.1rem;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: -0.02em;
        }

        .feature-desc {
          font-size: 0.875rem;
          color: #222222;
          line-height: 1.45;
          font-weight: 600;
        }

        /* Footer */
        .landing-footer {
          border-top: 4px solid #000000;
          padding: 1rem 2.5rem;
          text-align: center;
          background-color: #FFFFFF;
          flex-shrink: 0;
        }

        .footer-text {
          font-size: 0.875rem;
          font-weight: 900;
          text-transform: uppercase;
        }

        .windows-icon {
          flex-shrink: 0;
        }

        /* Responsive Layout styling */
        @media (max-width: 992px) {
          .landing-page-container {
            height: auto;
            overflow-y: auto;
          }
          .landing-main {
            overflow: visible;
            padding: 2rem 1.5rem;
            gap: 2.5rem;
          }
          .hero-section {
            flex-direction: column;
            gap: 2.5rem;
          }
          .hero-content {
            text-align: center;
            align-items: center;
          }
          .hero-actions {
            justify-content: center;
          }
          .features-section {
            grid-template-columns: 1fr;
            gap: 1.5rem;
          }
          .hero-title {
            font-size: 2.75rem;
          }
          .logo-centerpiece-frame {
            max-width: 260px;
          }
        }

        @media (max-width: 576px) {
          .landing-navbar {
            padding: 0 1.5rem;
            height: 60px;
          }
          .hero-title {
            font-size: 2.25rem;
          }
          .btn-download-nav span {
            display: none;
          }
          .btn-download-nav {
            padding: 0.4rem;
          }
        }
      `}</style>
    </div>
  );
};

export default Landing;
