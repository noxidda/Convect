import React, { useState, useEffect, useRef } from 'react';
import { useClerk } from '@clerk/clerk-react';
import axios from 'axios';
import { X, User, FileText, Sun, Moon, Trash2, Camera, Check } from 'lucide-react';

const THEME_COLORS = [
  { name: 'Red', hex: '#FFC5C5' },
  { name: 'Pink', hex: '#FFC6FF' },
  { name: 'Blue', hex: '#CAEAFF' },
  { name: 'Yellow', hex: '#FDFFB6' },
  { name: 'Green', hex: '#CAFFBF' },
  { name: 'Purple', hex: '#D6C9FF' },
  { name: 'Indigo', hex: '#C1D3FF' }
];

const SettingsModal = ({ currentUser, onClose, onProfileUpdated }) => {
  const { signOut } = useClerk();
  const [bio, setBio] = useState(currentUser.bio || '');
  const [photoUrl, setPhotoUrl] = useState(currentUser.profilePhoto || '');
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [activeColor, setActiveColor] = useState(() => {
    return localStorage.getItem('convect-theme-color') || '#D6C9FF';
  });

  // Cropping States
  const [cropImageObj, setCropImageObj] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [showCropModal, setShowCropModal] = useState(false);
  const canvasRef = useRef(null);



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

  const handlePhotoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setError('Photo must be less than 2MB');
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

  const handleSave = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess(false);

    try {
      const res = await axios.put('/api/users/profile', {
        bio,
        profilePhoto: photoUrl,
      });

      onProfileUpdated(res.data);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    const doubleCheck = window.confirm(
      'Are you absolutely sure you want to delete your account? This action is permanent and cannot be undone. All chats, messages, and configurations will be deleted.'
    );
    if (!doubleCheck) return;

    setDeleting(true);
    setError('');

    try {
      await axios.delete('/api/users/account');
      // Sign out from Clerk
      signOut(() => {
        window.location.href = '/login';
      });
    } catch (err) {
      console.error('Error deleting account:', err);
      setError('Failed to delete account. Please try again.');
      setDeleting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Settings</h2>
          <button className="close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {error && <div className="modal-error">{error}</div>}
        {success && <div className="modal-success"><Check size={16} /> Profile saved successfully</div>}

        <div className="modal-body">
          <form onSubmit={handleSave} className="settings-form">
            {/* Profile Image Section */}
            <div className="settings-photo-section">
              <div className="settings-photo-container">
                {photoUrl ? (
                  <img src={photoUrl} alt="Profile" className="settings-photo" />
                ) : (
                  <User size={36} className="settings-photo-placeholder" />
                )}
                <label className="photo-edit-badge">
                  <Camera size={14} />
                  <input 
                    type="file" 
                    accept="image/*" 
                    onChange={handlePhotoUpload} 
                    style={{ display: 'none' }} 
                  />
                </label>
              </div>
              <div className="settings-username-display">
                @{currentUser.username || 'Anonymous'}
              </div>
            </div>

            {/* Bio Field */}
            <div className="settings-group">
              <label className="settings-label">
                <FileText size={16} /> Bio
              </label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Write your bio..."
                maxLength={160}
                rows={3}
              />
            </div>

            {/* Theme Color Section */}
            <div className="settings-group">
              <label className="settings-label" style={{ textTransform: 'uppercase', fontWeight: 900 }}>
                Theme Color
              </label>
              <div className="theme-color-picker-grid">
                {THEME_COLORS.map((color) => (
                  <button
                    key={color.name}
                    type="button"
                    className={`theme-color-option-btn ${activeColor === color.hex ? 'active' : ''}`}
                    style={{ backgroundColor: color.hex }}
                    onClick={() => {
                      setActiveColor(color.hex);
                      localStorage.setItem('convect-theme-color', color.hex);
                      document.documentElement.style.setProperty('--color', color.hex);
                    }}
                    title={color.name}
                  />
                ))}
              </div>
            </div>



            <div className="settings-action-buttons">
              <button 
                type="submit" 
                className="btn-primary settings-submit"
                disabled={loading}
              >
                {loading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>

          <hr className="modal-divider" />

          {/* Delete Account Section */}
          <div className="delete-account-section">
            <button
              type="button"
              className="btn-danger delete-btn"
              onClick={handleDeleteAccount}
              disabled={deleting}
            >
              <Trash2 size={16} /> {deleting ? 'Deleting Account...' : 'Delete Account'}
            </button>
            <p className="delete-desc">
              Once you delete your account, there is no going back. All messages and chat history will be deleted.
            </p>
          </div>
        </div>
      </div>

      {showCropModal && (
        <div className="crop-modal-overlay" onClick={(e) => e.stopPropagation()}>
          <div className="crop-modal" onClick={(e) => e.stopPropagation()}>
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
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(0, 0, 0, 0.8);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 1000;
          padding: 1rem;
        }

        .settings-modal {
          background-color: var(--bg-card);
          border: 4px solid var(--border);
          border-radius: var(--border-radius);
          width: 100%;
          max-width: 460px;
          max-height: 90vh;
          display: flex;
          flex-direction: column;
          box-shadow: var(--shadow-md);
          overflow: hidden;
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1.25rem 1.5rem;
          border-bottom: 3px solid var(--border);
        }

        .modal-title {
          font-size: var(--text-lg);
          font-weight: 900;
          color: var(--text-primary);
          text-transform: uppercase;
        }

        .close-btn {
          color: var(--black);
          display: flex;
          align-items: center;
          background-color: var(--white);
          border: 3px solid var(--black);
          padding: 0.25rem;
          border-radius: var(--border-radius);
          box-shadow: 2px 2px 0px var(--black);
          cursor: pointer;
          transition: transform 0.1s ease, box-shadow 0.1s ease;
        }

        .close-btn:hover {
          transform: translate(2px, 2px);
          box-shadow: 1px 1px 0px var(--black);
          background-color: var(--color);
        }

        .modal-body {
          padding: 1.5rem;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .modal-error {
          background-color: var(--black);
          color: var(--color);
          border: 3px solid var(--black);
          padding: 0.75rem 1rem;
          margin: 1rem 1.5rem 0 1.5rem;
          border-radius: var(--border-radius);
          font-size: var(--text-sm);
          font-weight: 900;
          box-shadow: 3px 3px 0px var(--black);
          text-transform: uppercase;
        }

        .modal-success {
          background-color: var(--color);
          color: var(--black);
          border: 3px solid var(--black);
          padding: 0.75rem 1rem;
          margin: 1rem 1.5rem 0 1.5rem;
          border-radius: var(--border-radius);
          font-size: var(--text-sm);
          font-weight: 900;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          box-shadow: 3px 3px 0px var(--black);
          text-transform: uppercase;
        }

        .settings-form {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }

        .settings-photo-section {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 0.5rem;
        }

        .settings-photo-container {
          position: relative;
          width: 80px;
          height: 80px;
          border-radius: 50%;
          border: 3px solid var(--border);
          background-color: var(--white);
          display: flex;
          justify-content: center;
          align-items: center;
          box-shadow: 3px 3px 0px var(--black);
        }

        .settings-photo {
          width: 100%;
          height: 100%;
          border-radius: 50%;
          object-fit: cover;
        }

        .settings-photo-placeholder {
          color: var(--black);
        }

        .photo-edit-badge {
          position: absolute;
          bottom: 0;
          right: 0;
          background-color: var(--color);
          color: #000000;
          width: 26px;
          height: 26px;
          border-radius: 50%;
          display: flex;
          justify-content: center;
          align-items: center;
          cursor: pointer;
          border: 3px solid var(--black);
          box-shadow: 1px 1px 0px var(--black);
          transition: transform 0.1s ease, box-shadow 0.1s ease;
        }

        .photo-edit-badge:hover {
          transform: translate(1px, 1px);
          box-shadow: 2px 2px 0px var(--black);
          background-color: var(--white);
        }

        .settings-username-display {
          font-weight: 900;
          color: var(--black);
          text-transform: uppercase;
        }

        .settings-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .settings-label {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: var(--text-sm);
          font-weight: 900;
          color: var(--text-secondary);
          text-transform: uppercase;
        }

        .settings-form textarea {
          resize: none;
        }

        .settings-action-buttons {
          margin-top: 0.5rem;
        }

        .settings-submit {
          width: 100%;
        }

        .modal-divider {
          border: 0;
          border-top: 3px solid var(--border);
          margin: 0.5rem 0;
        }

        .delete-account-section {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .delete-desc {
          font-size: var(--text-xs);
          color: var(--text-muted);
          line-height: 1.4;
          font-weight: 600;
        }

        .delete-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          margin-top: 0.25rem;
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
          border-radius: var(--border-radius);
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
          box-shadow: 1px 1px 0px var(--black);
          background-color: var(--color);
        }

        .crop-btn-apply {
          background-color: var(--color);
          color: var(--black);
        }

        .crop-btn-apply:hover {
          transform: translate(2px, 2px);
          box-shadow: 1px 1px 0px var(--black);
          background-color: var(--white);
        }

        /* Theme color picker styling */
        .theme-color-picker-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 0.75rem;
          margin-top: 0.25rem;
        }

        .theme-color-option-btn {
          width: 38px;
          height: 38px;
          border-radius: 50%;
          border: 3px solid #000000;
          cursor: pointer;
          position: relative;
          box-shadow: 2px 2px 0px #000000;
          transition: transform 0.1s ease, box-shadow 0.1s ease;
        }

        .theme-color-option-btn:hover {
          transform: translate(-1px, -1px);
          box-shadow: 3px 3px 0px #000000;
        }

        .theme-color-option-btn.active {
          transform: translate(1px, 1px);
          box-shadow: none;
          outline: 3px solid var(--black);
          outline-offset: 2px;
        }
      `}</style>
    </div>
  );
};

export default SettingsModal;
