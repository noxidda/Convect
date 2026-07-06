import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser, useClerk } from '@clerk/clerk-react';
import axios from 'axios';
import { User, FileText, Image as ImageIcon, CheckCircle } from 'lucide-react';

const Onboarding = ({ onOnboarded }) => {
  const { user } = useUser();
  const { signOut } = useClerk();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('Hey there! I am using this chat app.');
  const [photoUrl, setPhotoUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Cropping States
  const [cropImageObj, setCropImageObj] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [showCropModal, setShowCropModal] = useState(false);
  const canvasRef = useRef(null);

  useEffect(() => {
    if (user) {
      setUsername(user.username || user.firstName || '');
      setPhotoUrl(user.imageUrl || '');
    }
  }, [user]);

  // Canvas drawing effect for cropping
  useEffect(() => {
    if (!showCropModal || !cropImageObj || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 300, 300);

    const imgWidth = cropImageObj.width;
    const imgHeight = cropImageObj.height;
    const ratio = imgWidth / imgHeight;

    let drawWidth, drawHeight;
    if (ratio > 1) {
      drawHeight = 300 * zoom;
      drawWidth = 300 * ratio * zoom;
    } else {
      drawWidth = 300 * zoom;
      drawHeight = (300 / ratio) * zoom;
    }

    const defaultX = (300 - drawWidth) / 2;
    const defaultY = (300 - drawHeight) / 2;

    ctx.drawImage(
      cropImageObj,
      defaultX + offset.x,
      defaultY + offset.y,
      drawWidth,
      drawHeight
    );
  }, [showCropModal, cropImageObj, zoom, offset]);

  const handleProfilePhotoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setError('Profile photo must be less than 2MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        setCropImageObj(img);
        setZoom(1);
        setOffset({ x: 0, y: 0 });
        setShowCropModal(true);
        setError('');
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleMouseDown = (e) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };

  const handleTouchStart = (e) => {
    if (e.touches.length !== 1) return;
    setIsDragging(true);
    setDragStart({
      x: e.touches[0].clientX - offset.x,
      y: e.touches[0].clientY - offset.y
    });
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e) => {
      setOffset({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    const handleTouchMove = (e) => {
      if (e.touches.length !== 1) return;
      setOffset({
        x: e.touches[0].clientX - dragStart.x,
        y: e.touches[0].clientY - dragStart.y
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, [isDragging, dragStart]);

  const applyCrop = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const croppedDataUrl = canvas.toDataURL('image/jpeg', 0.9);
    setPhotoUrl(croppedDataUrl);
    setShowCropModal(false);
    setCropImageObj(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim()) {
      setError('Username is required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await axios.put('/api/users/profile', {
        username: username.trim(),
        bio: bio.trim(),
        profilePhoto: photoUrl,
      });

      if (onOnboarded) {
        onOnboarded(res.data);
      }

      // Redirect to main chat dashboard
      navigate('/');
    } catch (err) {
      console.error('Onboarding update error:', err);
      setError(err.response?.data?.error || 'Failed to complete profile setup');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="onboarding-container">
      <div className="onboarding-card">
        <div className="onboarding-header">
          <CheckCircle size={32} className="header-icon" />
          <h1 className="onboarding-title">Set Up Your Profile</h1>
          <p className="onboarding-subtitle">Choose a unique username and customize your details to get started.</p>
        </div>

        {error && <div className="error-alert">{error}</div>}

        <form onSubmit={handleSubmit} className="onboarding-form">
          <div className="avatar-section">
            <div className="avatar-preview-container">
              {photoUrl ? (
                <img src={photoUrl} alt="Avatar Preview" className="avatar-preview" />
              ) : (
                <User size={48} className="avatar-placeholder" />
              )}
            </div>
            <label className="avatar-upload-btn">
              <ImageIcon size={16} />
              Choose Photo
              <input 
                type="file" 
                accept="image/*" 
                onChange={handleProfilePhotoChange} 
                style={{ display: 'none' }} 
              />
            </label>
          </div>

          <div className="form-group">
            <label htmlFor="username" className="form-label">
              <User size={16} /> Username
            </label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
              placeholder="e.g. johndoe"
              required
              minLength={3}
              maxLength={30}
            />
            <span className="form-tip">Only letters, numbers, and underscores are allowed. Min 3 chars.</span>
          </div>

          <div className="form-group">
            <label htmlFor="bio" className="form-label">
              <FileText size={16} /> Bio
            </label>
            <textarea
              id="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell others about yourself..."
              rows={3}
              maxLength={160}
            />
          </div>

          <div className="button-group">
            <button 
              type="button" 
              className="btn-logout"
              onClick={() => signOut()}
            >
              Log Out
            </button>
            <button 
              type="submit" 
              className="btn-primary" 
              disabled={loading}
            >
              {loading ? 'Saving...' : 'Finish Setup'}
            </button>
          </div>
        </form>
      </div>

      {showCropModal && (
        <div className="crop-modal-overlay">
          <div className="crop-modal">
            <h3 className="crop-modal-title">Crop Profile Picture</h3>
            <p className="crop-modal-desc">Drag to reposition. Use the slider to zoom.</p>
            
            <div className="crop-canvas-wrapper">
              <canvas
                ref={canvasRef}
                width={300}
                height={300}
                onMouseDown={handleMouseDown}
                onTouchStart={handleTouchStart}
              />
              <div className="crop-frame-overlay"></div>
            </div>

            <div className="crop-slider-container">
              <span className="slider-label">Zoom</span>
              <input
                type="range"
                min="1"
                max="3"
                step="0.02"
                value={zoom}
                onChange={(e) => setZoom(parseFloat(e.target.value))}
              />
            </div>

            <div className="crop-modal-actions">
              <button
                type="button"
                className="crop-btn-cancel"
                onClick={() => {
                  setShowCropModal(false);
                  setCropImageObj(null);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="crop-btn-apply"
                onClick={applyCrop}
              >
                Apply Crop
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .onboarding-container {
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          width: 100vw;
          background-color: var(--bg-app);
          padding: 1.5rem;
          overflow-y: auto;
          box-sizing: border-box;
        }

        .onboarding-card {
          background-color: var(--bg-card);
          border: 4px solid var(--border);
          border-radius: var(--border-radius);
          padding: 2.5rem;
          width: 100%;
          max-width: 480px;
          box-shadow: var(--shadow-md);
        }

        .onboarding-header {
          text-align: center;
          margin-bottom: 2rem;
        }

        .header-icon {
          color: var(--black);
          margin-bottom: 0.75rem;
        }

        .onboarding-title {
          font-size: 2rem;
          font-weight: 900;
          color: var(--text-primary);
          margin-bottom: 0.5rem;
          text-transform: uppercase;
        }

        .onboarding-subtitle {
          font-size: var(--text-sm);
          color: var(--text-muted);
          line-height: 1.4;
          font-weight: 600;
        }

        .error-alert {
          background-color: var(--black);
          color: var(--color);
          border: 3px solid var(--black);
          padding: 0.75rem 1rem;
          border-radius: var(--border-radius);
          margin-bottom: 1.5rem;
          font-size: var(--text-sm);
          font-weight: 900;
          box-shadow: 3px 3px 0px var(--black);
          text-transform: uppercase;
        }

        .onboarding-form {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .avatar-section {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 0.5rem;
        }

        .avatar-preview-container {
          width: 100px;
          height: 100px;
          border-radius: 50%;
          border: 3px solid var(--black);
          display: flex;
          justify-content: center;
          align-items: center;
          overflow: hidden;
          background-color: var(--white);
          box-shadow: 3px 3px 0px var(--black);
        }

        .avatar-preview {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .avatar-placeholder {
          color: var(--black);
        }

        .avatar-upload-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          background-color: var(--color);
          border: 3px solid var(--black);
          border-radius: var(--border-radius);
          padding: 0.5rem 1rem;
          font-size: var(--text-sm);
          font-weight: 900;
          cursor: pointer;
          transition: transform 0.1s ease, box-shadow 0.1s ease;
          box-shadow: 3px 3px 0px var(--black);
          text-transform: uppercase;
        }

        .avatar-upload-btn:hover {
          transform: translate(2px, 2px);
          box-shadow: 2px 2px 0px var(--black);
          background-color: var(--color);
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .form-label {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: var(--text-sm);
          font-weight: 900;
          color: var(--text-secondary);
          text-transform: uppercase;
        }

        .form-tip {
          font-size: var(--text-xs);
          color: var(--text-muted);
          font-weight: 600;
        }

        .button-group {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 1rem;
          gap: 1rem;
        }

        .btn-logout {
          background-color: var(--white);
          border: 3px solid var(--black);
          color: var(--black);
          padding: 0.75rem 1.5rem;
          border-radius: var(--border-radius);
          font-weight: 900;
          box-shadow: 3px 3px 0px var(--black);
          transition: transform 0.1s ease, box-shadow 0.1s ease;
          text-transform: uppercase;
        }

        .btn-logout:hover {
          transform: translate(2px, 2px);
          box-shadow: 2px 2px 0px var(--black);
          background-color: var(--color);
        }

        .onboarding-form textarea {
          resize: none;
        }

        /* Crop Modal CSS */
        .crop-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(0, 0, 0, 0.8);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 2000;
          padding: 1rem;
        }

        .crop-modal {
          background-color: var(--bg-card);
          border: 4px solid var(--border);
          border-radius: var(--border-radius);
          padding: 2rem;
          width: 100%;
          max-width: 380px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1.25rem;
          box-shadow: var(--shadow-md);
        }

        .crop-modal-title {
          font-size: var(--text-base);
          font-weight: 900;
          color: var(--text-primary);
          margin: 0;
          text-transform: uppercase;
        }

        .crop-modal-desc {
          font-size: var(--text-xs);
          color: var(--text-muted);
          text-align: center;
          margin: 0;
          font-weight: 600;
        }

        .crop-canvas-wrapper {
          position: relative;
          width: 300px;
          height: 300px;
          overflow: hidden;
          background-color: #000000;
          border: 3px solid var(--border);
          box-shadow: 4px 4px 0px var(--black);
        }

        .crop-canvas-wrapper canvas {
          display: block;
          cursor: move;
        }

        .crop-frame-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          border: 3px dashed var(--color);
          pointer-events: none;
          box-sizing: border-box;
          box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.5);
        }

        .crop-slider-container {
          display: flex;
          align-items: center;
          gap: 1rem;
          width: 100%;
          padding: 0 0.5rem;
        }

        .slider-label {
          font-size: var(--text-xs);
          font-weight: 900;
          color: var(--text-secondary);
          text-transform: uppercase;
        }

        .crop-slider-container input[type="range"] {
          flex: 1;
          accent-color: var(--black);
          cursor: pointer;
          outline: none;
          height: 8px;
          background: #EFEFEF;
          border: 2px solid #000000;
          border-radius: 4px;
        }

        .crop-modal-actions {
          display: flex;
          width: 100%;
          gap: 1rem;
        }

        .crop-btn-cancel, .crop-btn-apply {
          flex: 1;
          padding: 0.75rem 1rem;
          font-size: var(--text-sm);
          font-weight: 900;
          border-radius: var(--border-radius);
          cursor: pointer;
          text-align: center;
          transition: transform 0.1s ease, box-shadow 0.1s ease;
          text-transform: uppercase;
          box-shadow: 3px 3px 0px var(--black);
          border: 3px solid var(--black);
        }

        .crop-btn-cancel {
          background-color: var(--white);
          color: var(--black);
        }

        .crop-btn-cancel:hover {
          transform: translate(2px, 2px);
          box-shadow: 2px 2px 0px var(--black);
        }

        .crop-btn-apply {
          background-color: var(--color);
          color: var(--black);
        }

        .crop-btn-apply:hover {
          transform: translate(2px, 2px);
          box-shadow: 2px 2px 0px var(--black);
        }
      `}</style>
    </div>
  );
};

export default Onboarding;
