import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useSocket } from '../context/SocketContext';
import { Send, UserMinus, ShieldAlert, Ban, Image, Download, Eye, Loader2, Paperclip, FileText, CornerUpLeft, Pencil, Trash2, MoreVertical, X } from 'lucide-react';

const ChatWindow = ({ activeChat, currentUser, isFriend, onBack, onRemoveFriend, onBlockToggle, onRestrictToggle }) => {
  const { socket, connected, onlineUsers, typingUsers, emitTyping, joinChat, leaveChat } = useSocket();
  
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [showAvatarPreview, setShowAvatarPreview] = useState(false);
  
  // image states
  const [pendingImage, setPendingImage] = useState(null);
  const [showQualityModal, setShowQualityModal] = useState(false);
  const [loadedImages, setLoadedImages] = useState(new Set());

  // reply / edit / delete states
  const [replyingTo, setReplyingTo] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [activeMenuMessageId, setActiveMenuMessageId] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const fileInputRef = useRef(null);
  const fileAttachInputRef = useRef(null);

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getMessageDetails = (msg) => {
    let type = msg.messageType || 'text';
    let name = msg.fileName;
    let size = msg.fileSize;

    if (type === 'text' && msg.content && msg.content.startsWith('data:')) {
      const match = msg.content.match(/^data:([^;]+);base64,/);
      if (match) {
        const mimeType = match[1];
        if (mimeType.startsWith('image/')) {
          type = 'image';
        } else {
          type = 'file';
          name = name || `file-${msg._id ? msg._id.slice(-6) : Math.random().toString(36).substring(7)}.${mimeType.split('/')[1] || 'bin'}`;
          size = size || Math.round((msg.content.length - match[0].length) * 3 / 4);
        }
      }
    }
    return { type, name, size };
  };

  const handleFileAttachChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // If selected file is an image, always prompt for quality first
    if (file.type.startsWith('image/')) {
      setPendingImage(file);
      setShowQualityModal(true);
      if (fileAttachInputRef.current) fileAttachInputRef.current.value = '';
      return;
    }

    try {
      // Convert file to Base64 (100% quality)
      const base64Content = await convertImageFullQuality(file);
      
      const res = await axios.post(`/api/conversations/${chatId}/messages`, {
        content: base64Content,
        messageType: 'file',
        fileName: file.name,
        fileSize: file.size,
      });

      setMessages((prev) => {
        if (prev.some((m) => m._id === res.data._id)) return prev;
        return [...prev, res.data];
      });
    } catch (err) {
      console.error('Error sending file:', err);
    } finally {
      if (fileAttachInputRef.current) fileAttachInputRef.current.value = '';
    }
  };

  const compressImageHalfQuality = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new window.Image();
        img.src = event.target.result;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const width = img.width * 0.5;
          const height = img.height * 0.5;
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
          resolve(dataUrl);
        };
        img.onerror = (err) => reject(err);
      };
      reader.onerror = (err) => reject(err);
    });
  };

  const convertImageFullQuality = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = (err) => reject(err);
    });
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
      setPendingImage(file);
      setShowQualityModal(true);
    }
  };

  const handleSendImage = async (quality) => {
    if (!pendingImage) return;
    setShowQualityModal(false);
    
    let base64Content = '';
    try {
      if (quality === 'half') {
        base64Content = await compressImageHalfQuality(pendingImage);
      } else {
        base64Content = await convertImageFullQuality(pendingImage);
      }
      
      const res = await axios.post(`/api/conversations/${chatId}/messages`, {
        content: base64Content,
        messageType: 'image',
        imageQuality: quality,
      });
      
      setMessages((prev) => {
        if (prev.some((m) => m._id === res.data._id)) return prev;
        return [...prev, res.data];
      });
    } catch (err) {
      console.error('Error sending image:', err);
    } finally {
      setPendingImage(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleLoadImage = (messageId) => {
    setLoadedImages(prev => {
      const updated = new Set(prev);
      updated.add(messageId);
      return updated;
    });
  };

  const handleDownloadImage = (base64Content, fileName) => {
    const link = document.createElement('a');
    link.href = base64Content;
    link.download = fileName || 'download.jpg';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const chatId = activeChat._id;
  const contact = activeChat.contact;
  const contactId = contact._id;

  // retrieve online status
  const isOnline = onlineUsers.get(contactId) === 'online';

  // retrieve typing status
  const isTyping = typingUsers[chatId]?.[contactId] || false;

  // fetch messages when
  useEffect(() => {
    setLoading(true);
    setMessages([]);
    setInputValue('');
    
    // join socket room
    joinChat(chatId);

    const fetchMessages = async () => {
      try {
        const res = await axios.get(`/api/conversations/${chatId}/messages`);
        setMessages(res.data);
        if (socket) {
          socket.emit('mark_read', { chatId });
        }
      } catch (err) {
        console.error('Error fetching messages:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchMessages();

    return () => {
      // leave room
      leaveChat(chatId);
    };
  }, [chatId]);

  // re-join socket room
  useEffect(() => {
    if (socket && connected) {
      joinChat(chatId);
    }
  }, [chatId, socket, connected]);

  // handle incoming real-time
  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = (msg) => {
      if (msg.conversationId === chatId) {
        setMessages((prev) => {
          // prevent duplicates
          if (prev.some((m) => m._id === msg._id)) return prev;
          return [...prev, msg];
        });
        if (msg.sender._id !== currentUser._id) {
          socket.emit('mark_read', { chatId });
        }
      }
    };

    const handleMessageEdited = (msg) => {
      if (msg.conversationId === chatId) {
        setMessages((prev) =>
          prev.map((m) => (m._id === msg._id ? msg : m))
        );
      }
    };

    const handleMessagesRead = ({ conversationId, readerId }) => {
      if (conversationId === chatId && readerId !== currentUser._id) {
        setMessages((prev) =>
          prev.map((m) => {
            if (m.sender._id === currentUser._id && !m.isRead) {
              return { ...m, isRead: true };
            }
            return m;
          })
        );
      }
    };

    const handleLocalMsgDeleted = (e) => {
      const { conversationId, messageId } = e.detail;
      if (conversationId === chatId) {
        setMessages((prev) => prev.filter((m) => m._id !== messageId));
      }
    };

    socket.on('new_message', handleNewMessage);
    socket.on('message_edited', handleMessageEdited);
    socket.on('messages_read', handleMessagesRead);
    window.addEventListener('local_message_deleted', handleLocalMsgDeleted);

    return () => {
      socket.off('new_message', handleNewMessage);
      socket.off('message_edited', handleMessageEdited);
      socket.off('messages_read', handleMessagesRead);
      window.removeEventListener('local_message_deleted', handleLocalMsgDeleted);
    };
  }, [socket, chatId]);

  // scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // close message menu on document click
  useEffect(() => {
    const handleDocumentClick = () => {
      setActiveMenuMessageId(null);
    };
    document.addEventListener('click', handleDocumentClick);
    return () => {
      document.removeEventListener('click', handleDocumentClick);
    };
  }, []);

  // typing state emitter
  const handleInputChange = (e) => {
    setInputValue(e.target.value);

    // emit typing status
    emitTyping(chatId, true);

    // debounce typing status
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      emitTyping(chatId, false);
    }, 2000);
  };

  // send message
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    // clear typing timeout
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    emitTyping(chatId, false);

    const messageText = inputValue.trim();
    setInputValue('');

    try {
      if (editingMessage) {
        const res = await axios.put(`/api/conversations/${chatId}/messages/${editingMessage._id}`, {
          content: messageText,
        });
        setMessages((prev) =>
          prev.map((m) => (m._id === res.data._id ? res.data : m))
        );
        setEditingMessage(null);
      } else if (replyingTo) {
        const res = await axios.post(`/api/conversations/${chatId}/messages`, {
          content: messageText,
          parentMessage: replyingTo._id,
        });
        setMessages((prev) => {
          if (prev.some((m) => m._id === res.data._id)) return prev;
          return [...prev, res.data];
        });
        setReplyingTo(null);
      } else {
        const res = await axios.post(`/api/conversations/${chatId}/messages`, {
          content: messageText,
        });
        setMessages((prev) => {
          if (prev.some((m) => m._id === res.data._id)) return prev;
          return [...prev, res.data];
        });
      }
    } catch (err) {
      console.error('Error sending message:', err);
    }
  };

  const handleEditClick = (msg) => {
    setEditingMessage(msg);
    setInputValue(msg.content);
    setReplyingTo(null);
    setActiveMenuMessageId(null);
  };

  const handleReplyClick = (msg) => {
    setReplyingTo(msg);
    setEditingMessage(null);
    setInputValue('');
    setActiveMenuMessageId(null);
  };

  const handleDeleteClick = (msg) => {
    setShowDeleteConfirm(msg);
    setActiveMenuMessageId(null);
  };

  const confirmDelete = async (type) => {
    if (!showDeleteConfirm) return;
    try {
      const msgId = showDeleteConfirm._id;
      await axios.delete(`/api/conversations/${chatId}/messages/${msgId}?type=${type}`);
      if (type === 'me') {
        setMessages((prev) => prev.filter((m) => m._id !== msgId));
      }
      setShowDeleteConfirm(null);
    } catch (err) {
      console.error('Error deleting message:', err);
    }
  };

  const scrollToMessage = (msgId) => {
    const element = document.getElementById(`msg-${msgId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element.classList.add('highlighted-message');
      setTimeout(() => {
        element.classList.remove('highlighted-message');
      }, 2000);
    }
  };

  // format timestamp (just
  const formatTime = (isoString) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="chat-window-container">
      {/* header */}
      <div className="chat-header">
        <div className="chat-header-left">
          <button className="back-btn" onClick={onBack}>
            Back
          </button>
          
          <div 
            className="header-avatar-container" 
            onClick={() => setShowAvatarPreview(true)}
            style={{ cursor: 'pointer' }}
            title="Click to view profile picture"
          >
            {contact.profilePhoto ? (
              <img src={contact.profilePhoto} alt={contact.username} className="header-avatar" />
            ) : (
              <div className="header-avatar-placeholder">
                {contact.username.charAt(0).toUpperCase()}
              </div>
            )}
            {isOnline && !contact.isBlocked && !contact.hasBlockedMe && (
              <span className="online-badge"></span>
            )}
          </div>
 
          <div className="header-user-info">
            <h3 className="header-username">{contact.username}</h3>
            <span className="header-status">
              {contact.isBlocked ? (
                'blocked'
              ) : contact.hasBlockedMe ? (
                'offline'
              ) : isTyping ? (
                <span className="typing-indicator">typing...</span>
              ) : isOnline ? (
                'online'
              ) : (
                'offline'
              )}
            </span>
          </div>
        </div>

        <div className="chat-header-right" style={{ display: 'flex', gap: '0.5rem' }}>
          <button 
            className={`restrict-header-btn hover-item ${contact.isRestricted ? 'active' : ''}`} 
            onClick={() => onRestrictToggle(contactId, contact.isRestricted)}
            title={contact.isRestricted ? "Unrestrict User" : "Restrict User"}
          >
            <ShieldAlert size={18} />
          </button>
          <button 
            className={`block-header-btn hover-item ${contact.isBlocked ? 'active' : ''}`} 
            onClick={() => onBlockToggle(contactId, contact.isBlocked)}
            title={contact.isBlocked ? "Unblock User" : "Block User"}
          >
            <Ban size={18} />
          </button>
          <button 
            className="unfriend-header-btn hover-item" 
            onClick={() => onRemoveFriend(contactId)}
            title="Remove Friend"
          >
            <UserMinus size={18} />
          </button>
        </div>
      </div>

      {/* messages thread */}
      <div className="messages-thread">
        {loading ? (
          <div className="messages-loading">Loading history...</div>
        ) : messages.length === 0 ? (
          <div className="empty-messages-prompt">
            No messages yet. Send a message to start conversation.
          </div>
        ) : (
          messages.map((msg) => {
            const isSelf = msg.sender._id === currentUser._id;
            const isMsgDeleted = msg.content === 'This message was deleted';
            const { type, name, size } = getMessageDetails(msg);
            
            return (
              <div 
                key={msg._id} 
                id={`msg-${msg._id}`}
                className={`message-wrapper ${isSelf ? 'self' : 'other'}`}
              >
                <div className="message-container">
                  <div className={`message-bubble ${isSelf ? 'bubble-self' : 'bubble-other'} ${isMsgDeleted ? 'deleted-text' : ''}`}>
                    {/* Reply quote block */}
                    {msg.parentMessage && (
                      <div 
                        className="message-reply-quote" 
                        onClick={() => scrollToMessage(msg.parentMessage._id)}
                      >
                        <div className="quote-sender">
                          @{msg.parentMessage.sender?.username || 'User'}
                        </div>
                        <div className="quote-content">
                          {msg.parentMessage.content === 'This message was deleted' 
                            ? 'This message was deleted' 
                            : msg.parentMessage.messageType === 'text' 
                              ? msg.parentMessage.content 
                              : msg.parentMessage.messageType === 'image' 
                                ? '📷 Photo' 
                                : '📁 File: ' + (msg.parentMessage.fileName || 'document')}
                        </div>
                      </div>
                    )}

                    {/* Actions context menu trigger */}
                    {!isMsgDeleted && (
                      <div className="message-actions-trigger-wrapper">
                        <button 
                          type="button" 
                          className="message-menu-trigger-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveMenuMessageId(activeMenuMessageId === msg._id ? null : msg._id);
                          }}
                        >
                          <MoreVertical size={14} />
                        </button>
                        {activeMenuMessageId === msg._id && (
                          <div className="message-dropdown-menu">
                            <button 
                              type="button" 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleReplyClick(msg);
                              }}
                              className="dropdown-item"
                            >
                              <CornerUpLeft size={12} style={{ marginRight: '6px' }} />
                              Reply
                            </button>
                            {isSelf && (
                              <button 
                                type="button" 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEditClick(msg);
                                }}
                                className="dropdown-item"
                              >
                                <Pencil size={12} style={{ marginRight: '6px' }} />
                                Edit
                              </button>
                            )}
                            <button 
                              type="button" 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteClick(msg);
                              }}
                              className="dropdown-item delete"
                            >
                              <Trash2 size={12} style={{ marginRight: '6px' }} />
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="message-content">
                      {type === 'image' ? (
                        isSelf || loadedImages.has(msg._id) ? (
                          <div className="chat-image-outer-container">
                            <div className="chat-image-wrapper">
                              <img 
                                src={msg.content} 
                                alt="Shared" 
                                className="chat-shared-image" 
                              />
                              <button 
                                type="button"
                                className="chat-image-download-btn"
                                onClick={() => handleDownloadImage(msg.content, `image-${msg._id}.jpg`)}
                                title="Save image to device"
                              >
                                <Download size={14} />
                              </button>
                            </div>
                            <span className="chat-image-quality-text">
                              {msg.imageQuality === 'half' ? '1/2 Quality' : 'Full Quality'}
                            </span>
                          </div>
                        ) : (
                          <div className="chat-image-placeholder">
                            <div className="chat-image-placeholder-info">
                              <span className="chat-image-placeholder-title">Image Received</span>
                              <span className="chat-image-placeholder-quality">
                                Quality: {msg.imageQuality === 'half' ? '1/2 Quality (compressed)' : 'Full Quality'}
                              </span>
                            </div>
                            <button
                              type="button"
                              className="chat-image-load-btn"
                              onClick={() => handleLoadImage(msg._id)}
                            >
                              Load Image
                            </button>
                          </div>
                        )
                      ) : type === 'file' ? (
                        <div className="chat-file-message-card">
                          <div className="chat-file-message-info-row">
                            <FileText size={24} className="chat-file-icon" />
                            <div className="chat-file-message-meta">
                              <span className="chat-file-name" title={name}>
                                {name}
                              </span>
                              <span className="chat-file-size">
                                {formatFileSize(size)}
                              </span>
                            </div>
                          </div>
                          <button
                            type="button"
                            className="chat-file-download-btn"
                            onClick={() => handleDownloadImage(msg.content, name)}
                          >
                            <Download size={14} style={{ marginRight: '6px' }} />
                            Download
                          </button>
                        </div>
                      ) : (
                        msg.content
                      )}
                    </div>

                    <div className="message-meta">
                      <span className="msg-time">{formatTime(msg.createdAt)}</span>
                      {msg.isEdited && !isMsgDeleted && <span className="msg-edited-tag">edited</span>}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* input panel */}
      {contact.isBlocked ? (
        <div className="chat-input-blocked-notice">
          You have blocked this user. Unblock to send messages.
        </div>
      ) : contact.hasBlockedMe ? (
        <div className="chat-input-blocked-notice">
          You cannot send messages to this user.
        </div>
      ) : !isFriend ? (
        <div className="chat-input-blocked-notice">
          You can only message your friends.
        </div>
      ) : (
        <div className="chat-input-container">
          {/* Reply Preview Bar */}
          {replyingTo && (
            <div className="reply-preview-bar">
              <div className="reply-preview-border" />
              <div className="reply-preview-content">
                <span className="reply-preview-title">
                  Replying to @{replyingTo.sender?.username || 'User'}
                </span>
                <span className="reply-preview-text">
                  {replyingTo.messageType === 'text' 
                    ? replyingTo.content 
                    : replyingTo.messageType === 'image' 
                      ? '📷 Photo' 
                      : '📁 File: ' + (replyingTo.fileName || 'document')}
                </span>
              </div>
              <button 
                type="button" 
                className="reply-preview-close" 
                onClick={() => setReplyingTo(null)}
              >
                <X size={16} />
              </button>
            </div>
          )}

          {/* Edit Preview Bar */}
          {editingMessage && (
            <div className="reply-preview-bar edit-preview-bar">
              <div className="reply-preview-border edit-border" />
              <div className="reply-preview-content">
                <span className="reply-preview-title edit-title">
                  Editing message
                </span>
                <span className="reply-preview-text">
                  {editingMessage.content}
                </span>
              </div>
              <button 
                type="button" 
                className="reply-preview-close" 
                onClick={() => {
                  setEditingMessage(null);
                  setInputValue('');
                }}
              >
                <X size={16} />
              </button>
            </div>
          )}

          <form onSubmit={handleSendMessage} className="chat-input-area">
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              accept="image/*" 
              style={{ display: 'none' }} 
            />
            <button 
              type="button" 
              className="chat-attach-btn" 
              onClick={() => fileInputRef.current?.click()}
              title="Attach Image"
            >
              <Image size={18} />
            </button>
            <input 
              type="file" 
              ref={fileAttachInputRef} 
              onChange={handleFileAttachChange} 
              style={{ display: 'none' }} 
            />
            <button 
              type="button" 
              className="chat-attach-btn" 
              onClick={() => fileAttachInputRef.current?.click()}
              title="Attach File"
            >
              <Paperclip size={18} />
            </button>

            <input
              type="text"
              value={inputValue}
              onChange={handleInputChange}
              placeholder="Type a message..."
              maxLength={1000}
            />
            <button type="submit" className="chat-send-btn" disabled={!inputValue.trim()}>
              <Send size={18} />
            </button>
          </form>
        </div>
      )}

      {/* Image Quality Selection Modal */}
      {showQualityModal && (
        <div className="neobrutalist-confirm-overlay">
          <div className="neobrutalist-confirm-card">
            <h3 className="neobrutalist-confirm-title">Select Image Quality</h3>
            <p className="neobrutalist-confirm-message">
              Choose how you want to send this image. 1/2 Quality will compress the image to send it faster and save bandwidth.
            </p>
            <div className="neobrutalist-confirm-actions">
              <button 
                className="neobrutalist-confirm-btn cancel" 
                onClick={() => {
                  setShowQualityModal(false);
                  setPendingImage(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
              >
                Cancel
              </button>
              <button 
                className="neobrutalist-confirm-btn confirm normal" 
                onClick={() => handleSendImage('half')}
              >
                1/2 Quality
              </button>
              <button 
                className="neobrutalist-confirm-btn confirm" 
                onClick={() => handleSendImage('full')}
              >
                Full Quality
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        /* Confirmation Modal Overlay & Card (matching dashboard/settings modals) */
        .neobrutalist-confirm-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(255, 255, 255, 0.7);
          backdrop-filter: blur(4px);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 9999;
        }

        .neobrutalist-confirm-card {
          background-color: var(--white);
          border: 4px solid var(--border);
          border-radius: 12px;
          padding: 24px;
          max-width: 440px;
          width: 90%;
          box-shadow: 8px 8px 0px var(--border);
          display: flex;
          flex-direction: column;
          gap: 16px;
          animation: scaleUp 0.15s cubic-bezier(0.175, 0.885, 0.32, 1.15);
        }

        .neobrutalist-confirm-title {
          font-size: 1.25rem;
          font-weight: 900;
          color: var(--black);
          margin: 0;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .neobrutalist-confirm-message {
          font-size: 0.95rem;
          color: var(--text-muted);
          line-height: 1.5;
          margin: 0;
        }

        .neobrutalist-confirm-actions {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          margin-top: 8px;
        }

        .neobrutalist-confirm-btn {
          font-weight: bold;
          font-size: 0.9rem;
          padding: 10px 18px;
          border: 3px solid var(--border);
          border-radius: 6px;
          cursor: pointer;
          transition: transform 0.1s, box-shadow 0.1s;
        }

        .neobrutalist-confirm-btn.cancel {
          background-color: var(--white);
          color: var(--black);
          box-shadow: 3px 3px 0px var(--border);
        }

        .neobrutalist-confirm-btn.cancel:hover {
          transform: translate(2px, 2px);
          box-shadow: 1px 1px 0px var(--border);
        }

        .neobrutalist-confirm-btn.cancel:active {
          transform: translate(3px, 3px);
          box-shadow: none;
        }

        .neobrutalist-confirm-btn.confirm {
          background-color: #FF5A5F;
          color: #000000;
          box-shadow: 3px 3px 0px var(--border);
        }

        .neobrutalist-confirm-btn.confirm.normal {
          background-color: #A3E635;
        }

        .neobrutalist-confirm-btn.confirm:hover {
          transform: translate(2px, 2px);
          box-shadow: 1px 1px 0px var(--border);
        }

        .neobrutalist-confirm-btn.confirm:active {
          transform: translate(3px, 3px);
          box-shadow: none;
        }

        @keyframes scaleUp {
          from {
            transform: scale(0.9);
            opacity: 0;
          }
          to {
            transform: scale(1);
            opacity: 1;
          }
        }

        /* File Message Styles */
        .chat-file-message-card {
          border: 3px solid var(--border);
          border-radius: 8px;
          padding: 14px;
          background-color: var(--white);
          color: var(--black);
          display: flex;
          flex-direction: column;
          gap: 12px;
          min-width: 220px;
          max-width: 280px;
          margin-top: 4px;
        }

        .chat-file-message-info-row {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .chat-file-icon {
          color: #60A5FA; /* blue */
          flex-shrink: 0;
        }

        .chat-file-message-meta {
          display: flex;
          flex-direction: column;
          gap: 2px;
          overflow: hidden;
          width: 100%;
        }

        .chat-file-name {
          font-weight: bold;
          font-size: 0.9rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          width: 100%;
          display: block;
        }

        .chat-file-size {
          font-size: 0.75rem;
          color: var(--text-muted);
        }

        .chat-file-download-btn {
          background-color: #CAFFBF; /* green */
          color: #000000;
          border: 2.5px solid var(--border);
          border-radius: 6px;
          padding: 6px 12px;
          font-weight: bold;
          font-size: 0.85rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.1s;
        }

        .chat-file-download-btn:hover {
          transform: translate(2px, 2px);
        }

        .chat-file-download-btn:active {
          transform: translate(3px, 3px);
        }

        /* Image Message Styles */

        .chat-image-wrapper {
          position: relative;
          display: inline-block;
          margin-top: 4px;
          border: 3px solid var(--border);
          border-radius: 6px;
          overflow: hidden;
          background-color: var(--white);
          max-width: 100%;
        }

        .chat-shared-image {
          max-width: 100%;
          max-height: 260px;
          display: block;
          object-fit: contain;
        }

        .chat-image-download-btn {
          position: absolute;
          top: 8px;
          right: 8px;
          background-color: var(--white);
          color: var(--black);
          border: 2px solid var(--border);
          border-radius: 4px;
          padding: 6px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.1s;
        }

        .chat-image-download-btn:hover {
          transform: translate(2px, 2px);
        }

        .chat-image-download-btn:active {
          transform: translate(3px, 3px);
        }

        .chat-image-outer-container {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 6px;
          margin-top: 4px;
        }

        .chat-image-quality-text {
          font-size: 0.75rem;
          font-weight: 800;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        /* Image Placeholder for Receiver */
        .chat-image-placeholder {
          border: 3px solid var(--border);
          border-radius: 8px;
          padding: 16px;
          background-color: var(--white);
          color: var(--black);
          display: flex;
          flex-direction: column;
          gap: 12px;
          min-width: 220px;
          max-width: 280px;
        }

        .chat-image-placeholder-info {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .chat-image-placeholder-title {
          font-weight: 900;
          font-size: 1rem;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .chat-image-placeholder-quality {
          font-size: 0.8rem;
          color: var(--text-muted);
        }

        .chat-image-load-btn {
          background-color: #A3E635; /* neobrutalist green */
          color: #000000;
          border: 2.5px solid var(--border);
          border-radius: 6px;
          padding: 8px 12px;
          font-weight: bold;
          font-size: 0.85rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.1s;
        }

        .chat-image-load-btn:hover {
          transform: translate(2px, 2px);
        }

        .chat-image-load-btn:active {
          transform: translate(3px, 3px);
        }

        /* Input area attachments button */
        .chat-attach-btn {
          background-color: var(--white);
          color: var(--black);
          border: 3px solid var(--border);
          border-radius: var(--border-radius);
          padding: 0.5rem;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          box-shadow: 3px 3px 0px var(--border);
          transition: transform 0.1s ease, box-shadow 0.1s ease;
          margin-right: 0.5rem;
        }

        .chat-attach-btn:hover {
          transform: translate(2px, 2px);
          box-shadow: 1px 1px 0px var(--border);
        }

        .chat-attach-btn:active {
          transform: translate(3px, 3px);
          box-shadow: none;
        }

        .chat-window-container {
          flex: 1;
          display: flex;
          flex-direction: column;
          height: 100%;
          background-color: var(--white);
        }

        /* Header Styling */
        .chat-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          height: var(--header-height);
          padding: 0 1.25rem;
          background-color: var(--white);
          border-bottom: 4px solid var(--border);
          box-sizing: border-box;
        }

        .chat-header-left {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .back-btn {
          display: none; /* Shown in mobile layouts */
          color: var(--black);
          font-weight: 900;
          font-size: var(--text-sm);
          padding: 0.5rem 0.75rem;
          background-color: var(--white);
          border: 3px solid var(--border);
          border-radius: var(--border-radius);
          box-shadow: 2px 2px 0px var(--border);
          transition: transform 0.1s ease, box-shadow 0.1s ease;
          text-transform: uppercase;
        }

        .back-btn:hover {
          transform: translate(2px, 2px);
          box-shadow: 1px 1px 0px var(--border);
          background-color: var(--color);
        }

        @media (max-width: 1024px) {
          .back-btn {
            display: block;
          }
        }

        .header-avatar-container {
          position: relative;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background-color: var(--white);
          display: flex;
          justify-content: center;
          align-items: center;
          border: 3px solid var(--border);
          box-shadow: 2px 2px 0px var(--border);
        }

        .header-avatar {
          width: 100%;
          height: 100%;
          border-radius: 50%;
          object-fit: cover;
        }

        .header-avatar-placeholder {
          font-weight: 900;
          font-size: var(--text-lg);
          color: var(--black);
        }

        .online-badge {
          position: absolute;
          bottom: 0;
          right: 0;
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background-color: var(--color);
          border: 2px solid var(--black);
        }

        .header-user-info {
          display: flex;
          flex-direction: column;
        }

        .header-username {
          font-size: var(--text-sm);
          font-weight: 900;
          line-height: 1.2;
        }

        .header-status {
          font-size: 0.72rem;
          color: var(--text-muted);
          font-weight: 500;
          text-transform: lowercase;
        }

        .typing-indicator {
          color: inherit;
          font-weight: inherit;
        }

        /* Messages Thread Styling */
        .messages-thread {
          flex: 1;
          padding: 1.5rem;
          overflow-y: auto;
          background-color: var(--color);
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
          border-bottom: 4px solid var(--border);
        }

        .messages-loading, .empty-messages-prompt {
          text-align: center;
          color: var(--black);
          font-size: var(--text-sm);
          margin: auto;
          background: var(--white);
          border: 3px solid var(--border);
          padding: 1rem 1.5rem;
          box-shadow: 4px 4px 0px var(--border);
          font-weight: 900;
          text-transform: uppercase;
        }

        .message-wrapper {
          display: flex;
          width: 100%;
        }

        .message-wrapper.self {
          justify-content: flex-end;
        }

        .message-wrapper.other {
          justify-content: flex-start;
        }

        .message-container {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          max-width: 70%;
          position: relative;
        }

        .message-bubble {
          padding: 0.75rem 1rem;
          border-radius: var(--border-radius);
          position: relative;
          box-shadow: none;
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          border: 3px solid var(--border);
        }

        .bubble-self {
          background-color: var(--color);
          color: var(--black);
        }

        .bubble-other {
          background-color: var(--white);
          color: var(--black);
        }

        .message-content {
          font-size: var(--text-sm);
          line-height: 1.4;
          word-break: break-word;
          font-weight: 700;
        }

        .deleted-text .message-content {
          font-style: italic;
          color: var(--text-muted);
          text-decoration: line-through;
        }

        .message-meta {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 0.25rem;
          font-size: 0.65rem;
          color: var(--text-muted);
          font-weight: 900;
        }

        .bubble-self .message-meta {
          color: rgba(0, 0, 0, 0.7);
        }

        .bubble-other .message-meta {
          color: rgba(0, 0, 0, 0.7);
        }

        .msg-edited-tag {
          font-style: italic;
          text-transform: uppercase;
        }

        .msg-status-tick {
          font-size: 0.65rem;
          margin-left: 2px;
          font-weight: 900;
        }

        .msg-status-tick.sent {
          color: rgba(0, 0, 0, 0.4);
        }

        .msg-status-tick.read {
          color: #2563eb;
        }

        /* Input Area styling */
        .chat-input-area {
          display: flex;
          align-items: center;
          padding: 1rem 1.5rem;
          background-color: var(--white);
          gap: 0.75rem;
        }

        .chat-input-area input {
          flex: 1;
          border: 3px solid var(--border) !important;
          border-radius: var(--border-radius) !important;
          height: 48px;
          font-weight: 700;
          box-shadow: 3px 3px 0px var(--border) !important;
          background-color: var(--white) !important;
        }

        .chat-input-area input:focus {
          background-color: var(--white) !important;
          transform: translate(-1px, -1px);
          box-shadow: 4px 4px 0px var(--border) !important;
        }

        .chat-send-btn {
          background-color: var(--white);
          color: var(--black);
          width: 48px;
          height: 48px;
          border-radius: var(--border-radius);
          display: flex;
          align-items: center;
          justify-content: center;
          border: 3px solid var(--border);
          box-shadow: 3px 3px 0px var(--border);
          transition: transform 0.1s ease, box-shadow 0.1s ease;
        }

        .chat-send-btn:hover:not(:disabled) {
          transform: translate(2px, 2px);
          box-shadow: 1px 1px 0px var(--border);
        }

        .chat-send-btn:active:not(:disabled) {
          transform: translate(3px, 3px);
          box-shadow: none;
        }

        .chat-send-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          box-shadow: none;
        }

        .chat-input-blocked-notice {
          padding: 1.25rem;
          background-color: var(--black);
          color: var(--color);
          text-align: center;
          font-size: var(--text-sm);
          font-weight: 900;
          text-transform: uppercase;
          box-shadow: 4px 4px 0px var(--border);
        }

        /* Avatar Full Preview Modal */
        .avatar-preview-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(0, 0, 0, 0.8);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 9999;
          animation: fadeIn 0.2s ease-out;
        }

        .avatar-preview-modal {
          background-color: var(--bg-card);
          padding: 2rem;
          border: 4px solid var(--border);
          border-radius: var(--border-radius);
          display: flex;
          flex-direction: column;
          align-items: center;
          position: relative;
          max-width: 90vw;
          max-height: 90vh;
          box-shadow: var(--shadow-md);
          animation: scaleUp 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .avatar-preview-close {
          position: absolute;
          top: 10px;
          right: 15px;
          font-size: 28px;
          color: var(--black);
          cursor: pointer;
          background: none;
          border: none;
          transition: color 0.2s ease;
          line-height: 1;
          font-weight: 900;
        }

        .avatar-preview-image {
          width: 320px;
          height: 320px;
          object-fit: cover;
          border: 3px solid var(--border);
          border-radius: var(--border-radius);
          margin-top: 1rem;
          margin-bottom: 1rem;
          box-shadow: 4px 4px 0px var(--border);
        }

        .avatar-preview-placeholder {
          width: 320px;
          height: 320px;
          border-radius: var(--border-radius);
          border: 3px solid var(--border);
          background-color: var(--color);
          display: flex;
          justify-content: center;
          align-items: center;
          font-weight: 900;
          font-size: 80px;
          color: var(--black);
          margin-top: 1rem;
          margin-bottom: 1rem;
          box-shadow: 4px 4px 0px var(--border);
        }

        .avatar-preview-username {
          font-weight: 900;
          font-size: var(--text-lg);
          color: var(--text-primary);
          text-transform: uppercase;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes scaleUp {
          from { transform: scale(0.92); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }

        .unfriend-header-btn,
        .restrict-header-btn,
        .block-header-btn {
          color: var(--black);
          padding: 0.5rem;
          border-radius: var(--border-radius);
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--white);
          border: 3px solid var(--border);
          cursor: pointer;
          box-shadow: 2px 2px 0px var(--border);
          transition: transform 0.1s ease, box-shadow 0.1s ease;
        }

        .unfriend-header-btn:hover,
        .restrict-header-btn:hover,
        .block-header-btn:hover {
          transform: translate(2px, 2px);
          box-shadow: 1px 1px 0px var(--border);
          background-color: var(--color);
        }

        .unfriend-header-btn:active,
        .restrict-header-btn:active,
        .block-header-btn:active {
          transform: translate(3px, 3px);
          box-shadow: none;
        }

        .restrict-header-btn.active {
          background-color: #ffd8a8;
        }

        .block-header-btn.active {
          background-color: #ffc5c5;
        }

        /* Message Quote block */
        .message-reply-quote {
          background-color: rgba(0, 0, 0, 0.06);
          border-left: 4px solid var(--border);
          padding: 6px 10px;
          border-radius: 4px;
          margin-bottom: 8px;
          cursor: pointer;
          font-size: 0.8rem;
          text-align: left;
          transition: background-color 0.1s ease;
          max-width: 100%;
          overflow: hidden;
        }

        .message-reply-quote:hover {
          background-color: rgba(0, 0, 0, 0.1);
        }

        .quote-sender {
          font-weight: 900;
          margin-bottom: 2px;
          color: var(--black);
          font-size: 0.75rem;
          text-transform: uppercase;
        }

        .quote-content {
          color: var(--text-muted);
          font-style: italic;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 100%;
        }

        /* Message Dropdown Actions menu */
        .message-actions-trigger-wrapper {
          position: absolute;
          top: 4px;
          right: 4px;
          opacity: 0.3;
          transition: opacity 0.15s ease;
          z-index: 10;
        }

        .message-bubble:hover .message-actions-trigger-wrapper,
        .message-actions-trigger-wrapper:hover {
          opacity: 1;
        }

        .message-menu-trigger-btn {
          background: none;
          border: none;
          padding: 2px;
          cursor: pointer;
          color: var(--black);
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
        }

        .message-menu-trigger-btn:hover {
          background-color: rgba(0, 0, 0, 0.05);
        }

        .message-dropdown-menu {
          position: absolute;
          top: 24px;
          right: 0;
          background-color: var(--white);
          border: 3px solid var(--border);
          border-radius: 6px;
          box-shadow: 3px 3px 0px var(--border);
          z-index: 100;
          padding: 4px 0;
          display: flex;
          flex-direction: column;
          min-width: 120px;
          animation: scaleUp 0.1s ease-out;
        }

        .dropdown-item {
          background: none;
          border: none;
          padding: 8px 12px;
          cursor: pointer;
          display: flex;
          align-items: center;
          font-weight: 900;
          font-size: 0.75rem;
          text-transform: uppercase;
          color: var(--black);
          text-align: left;
          width: 100%;
          gap: 6px;
          transition: background-color 0.1s ease;
        }

        .dropdown-item:hover {
          background-color: var(--color);
        }

        .dropdown-item.delete {
          color: #FF5A5F;
        }

        /* Input Container with reply/edit bars */
        .chat-input-container {
          display: flex;
          flex-direction: column;
          width: 100%;
          background-color: var(--white);
          z-index: 5;
        }

        .reply-preview-bar {
          display: flex;
          align-items: center;
          padding: 8px 1.5rem;
          background-color: var(--gray-light);
          border-bottom: 3px solid var(--border);
          border-top: 3px solid var(--border);
          gap: 12px;
          position: relative;
          animation: slideDown 0.15s ease-out;
        }

        .reply-preview-border {
          width: 4px;
          height: 32px;
          background-color: var(--border);
          border-radius: 2px;
          flex-shrink: 0;
        }

        .reply-preview-content {
          display: flex;
          flex-direction: column;
          flex: 1;
          text-align: left;
          overflow: hidden;
        }

        .reply-preview-title {
          font-weight: 900;
          font-size: 0.75rem;
          color: var(--black);
          text-transform: uppercase;
          margin-bottom: 2px;
        }

        .reply-preview-text {
          font-size: 0.7rem;
          color: var(--text-muted);
          font-style: italic;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 90%;
        }

        .reply-preview-close {
          background: none;
          border: none;
          cursor: pointer;
          color: var(--black);
          padding: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
        }

        .reply-preview-close:hover {
          background-color: rgba(0, 0, 0, 0.05);
        }

        /* Scroll highlight animation */
        @keyframes highlightFlash {
          0% { background-color: var(--color); }
          30% { background-color: #FDFFB6; border-color: #FF5A5F; }
          100% { }
        }

        .highlighted-message {
          animation: highlightFlash 2s ease-in-out;
        }

        @keyframes slideDown {
          from { transform: translateY(-100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>

      {showAvatarPreview && (
        <div className="avatar-preview-overlay" onClick={() => setShowAvatarPreview(false)}>
          <div className="avatar-preview-modal" onClick={(e) => e.stopPropagation()}>
            <button className="avatar-preview-close" onClick={() => setShowAvatarPreview(false)}>
              &times;
            </button>
            {contact.profilePhoto ? (
              <img src={contact.profilePhoto} alt={contact.username} className="avatar-preview-image" />
            ) : (
              <div className="avatar-preview-placeholder">
                {contact.username.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="avatar-preview-username">@{contact.username}</div>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="neobrutalist-confirm-overlay" onClick={() => setShowDeleteConfirm(null)}>
          <div className="neobrutalist-confirm-card" onClick={(e) => e.stopPropagation()}>
            <h3 className="neobrutalist-confirm-title">Delete Message</h3>
            <p className="neobrutalist-confirm-message">
              Are you sure you want to delete this message?
            </p>
            <div className="neobrutalist-confirm-actions">
              <button 
                type="button" 
                className="neobrutalist-confirm-btn cancel" 
                onClick={() => setShowDeleteConfirm(null)}
              >
                Cancel
              </button>
              <button 
                type="button" 
                className="neobrutalist-confirm-btn confirm normal" 
                onClick={() => confirmDelete('me')}
              >
                Delete for Me
              </button>
              {showDeleteConfirm.sender._id === currentUser._id && (
                <button 
                  type="button" 
                  className="neobrutalist-confirm-btn confirm" 
                  onClick={() => confirmDelete('everyone')}
                >
                  Delete for Everyone
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatWindow;
