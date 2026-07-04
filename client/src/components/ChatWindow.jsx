import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useSocket } from '../context/SocketContext';
import { Send, UserMinus } from 'lucide-react';

const ChatWindow = ({ activeChat, currentUser, onBack, onRemoveFriend }) => {
  const { socket, connected, onlineUsers, typingUsers, emitTyping, joinChat, leaveChat } = useSocket();
  
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [showAvatarPreview, setShowAvatarPreview] = useState(false);
  
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  const chatId = activeChat._id;
  const contact = activeChat.contact;
  const contactId = contact._id;

  // Retrieve online status
  const isOnline = onlineUsers.get(contactId) === 'online';

  // Retrieve typing status for contact in this chat
  const isTyping = typingUsers[chatId]?.[contactId] || false;

  // Fetch messages when chat changes
  useEffect(() => {
    setLoading(true);
    setMessages([]);
    setInputValue('');
    
    // Join socket room
    joinChat(chatId);

    const fetchMessages = async () => {
      try {
        const res = await axios.get(`/api/conversations/${chatId}/messages`);
        setMessages(res.data);
      } catch (err) {
        console.error('Error fetching messages:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchMessages();

    return () => {
      // Leave room
      leaveChat(chatId);
    };
  }, [chatId]);

  // Re-join socket room when socket connection state resets
  useEffect(() => {
    if (socket && connected) {
      joinChat(chatId);
    }
  }, [chatId, socket, connected]);

  // Handle incoming real-time socket events
  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = (msg) => {
      if (msg.conversationId === chatId) {
        setMessages((prev) => {
          // Prevent duplicates
          if (prev.some((m) => m._id === msg._id)) return prev;
          return [...prev, msg];
        });
      }
    };

    const handleMessageEdited = (msg) => {
      if (msg.conversationId === chatId) {
        setMessages((prev) =>
          prev.map((m) => (m._id === msg._id ? msg : m))
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
    window.addEventListener('local_message_deleted', handleLocalMsgDeleted);

    return () => {
      socket.off('new_message', handleNewMessage);
      socket.off('message_edited', handleMessageEdited);
      window.removeEventListener('local_message_deleted', handleLocalMsgDeleted);
    };
  }, [socket, chatId]);

  // Scroll to bottom whenever messages or typing state changes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Typing state emitter
  const handleInputChange = (e) => {
    setInputValue(e.target.value);

    // Emit typing status
    emitTyping(chatId, true);

    // Debounce typing status clear
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      emitTyping(chatId, false);
    }, 2000);
  };

  // Send Message
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    // Clear typing timeout immediately
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    emitTyping(chatId, false);

    const messageText = inputValue.trim();
    setInputValue('');

    try {
      const res = await axios.post(`/api/conversations/${chatId}/messages`, {
        content: messageText,
      });
      // Optimistic local state update to display sent message immediately
      setMessages((prev) => {
        if (prev.some((m) => m._id === res.data._id)) return prev;
        return [...prev, res.data];
      });
    } catch (err) {
      console.error('Error sending message:', err);
    }
  };

  // Format timestamp (just time or full date if needed)
  const formatTime = (isoString) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="chat-window-container">
      {/* Header */}
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
                'Blocked'
              ) : contact.hasBlockedMe ? (
                'Offline'
              ) : isTyping ? (
                <span className="typing-indicator">typing...</span>
              ) : isOnline ? (
                'Online'
              ) : (
                'Offline'
              )}
            </span>
          </div>
        </div>

        <div className="chat-header-right">
          <button 
            className="unfriend-header-btn hover-item" 
            onClick={() => onRemoveFriend(contactId)}
            title="Remove Friend"
          >
            <UserMinus size={18} />
          </button>
        </div>
      </div>

      {/* Messages Thread */}
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
            
            return (
              <div 
                key={msg._id} 
                className={`message-wrapper ${isSelf ? 'self' : 'other'}`}
              >
                <div className="message-container">
                  <div className={`message-bubble ${isSelf ? 'bubble-self' : 'bubble-other'} ${isMsgDeleted ? 'deleted-text' : ''}`}>
                    <div className="message-content">{msg.content}</div>
                    
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

      {/* Input panel */}
      {contact.isBlocked ? (
        <div className="chat-input-blocked-notice">
          You have blocked this user. Unblock to send messages.
        </div>
      ) : contact.hasBlockedMe ? (
        <div className="chat-input-blocked-notice">
          You cannot send messages to this user.
        </div>
      ) : (
        <form onSubmit={handleSendMessage} className="chat-input-area">
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
      )}

      <style>{`
        .chat-window-container {
          flex: 1;
          display: flex;
          flex-direction: column;
          height: 100%;
          background-color: var(--bg-app);
        }

        /* Header Styling */
        .chat-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem 1.25rem;
          background-color: var(--bg-sidebar);
          border-bottom: 1px solid var(--border);
        }

        .chat-header-left {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .back-btn {
          display: none; /* Shown in mobile layouts */
          color: var(--text-primary);
          font-weight: 600;
          font-size: var(--text-sm);
          padding: 0.5rem 0.75rem;
          background-color: var(--bg-active);
          border: 1px solid var(--border);
          border-radius: var(--border-radius);
        }

        @media (max-width: 768px) {
          .back-btn {
            display: block;
          }
        }

        .header-avatar-container {
          position: relative;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background-color: var(--bg-active);
          display: flex;
          justify-content: center;
          align-items: center;
          border: 1px solid var(--border);
        }

        .header-avatar {
          width: 100%;
          height: 100%;
          border-radius: 50%;
          object-fit: cover;
        }

        .header-avatar-placeholder {
          font-weight: 700;
          font-size: var(--text-lg);
          color: var(--text-secondary);
        }

        .online-badge {
          position: absolute;
          bottom: 0;
          right: 0;
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background-color: var(--accent);
          border: 2px solid var(--bg-sidebar);
        }

        .header-user-info {
          display: flex;
          flex-direction: column;
        }

        .header-username {
          font-size: var(--text-sm);
          font-weight: 600;
          line-height: 1.2;
        }

        .header-status {
          font-size: var(--text-xs);
          color: var(--text-muted);
        }

        .typing-indicator {
          color: var(--accent);
          font-weight: 500;
        }

        /* Messages Thread Styling */
        .messages-thread {
          flex: 1;
          padding: 1.5rem;
          overflow-y: auto;
          background-color: var(--bg-app);
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .messages-loading, .empty-messages-prompt {
          text-align: center;
          color: var(--text-muted);
          font-size: var(--text-sm);
          margin: auto;
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
          padding: 0.6rem 0.9rem;
          border-radius: var(--border-radius);
          position: relative;
          box-shadow: var(--shadow-sm);
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .bubble-self {
          background-color: var(--bg-bubble-self);
          color: var(--bg-sidebar);
          border-bottom-right-radius: 2px;
          border: 1px solid var(--border);
        }

        .bubble-other {
          background-color: var(--bg-bubble-other);
          color: var(--text-primary);
          border-bottom-left-radius: 2px;
          border: 1px solid var(--border);
        }

        .message-content {
          font-size: var(--text-sm);
          line-height: 1.4;
          word-break: break-word;
        }

        .deleted-text .message-content {
          font-style: italic;
          color: var(--text-muted);
        }

        .message-meta {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 0.25rem;
          font-size: 0.65rem;
          color: var(--text-muted);
        }

        .bubble-self .message-meta {
          color: rgba(0, 0, 0, 0.55);
        }

        .bubble-other .message-meta {
          color: rgba(255, 255, 255, 0.65);
        }

        .msg-edited-tag {
          font-style: italic;
        }

        /* Input Area styling */
        .chat-input-area {
          display: flex;
          align-items: center;
          padding: 0.75rem 1.25rem;
          background-color: var(--bg-sidebar);
          border-top: 1px solid var(--border);
          gap: 0.75rem;
        }

        .chat-input-area input {
          flex: 1;
        }

        .chat-send-btn {
          background-color: var(--accent);
          color: var(--bg-sidebar);
          width: 42px;
          height: 42px;
          border-radius: var(--border-radius);
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background-color 0.2s ease;
        }

        .chat-send-btn:hover {
          background-color: var(--accent-hover);
        }

        .chat-send-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .chat-input-blocked-notice {
          padding: 1.25rem;
          background-color: var(--bg-sidebar);
          border-top: 1px solid var(--border);
          text-align: center;
          font-size: var(--text-sm);
          font-weight: 500;
          color: var(--text-muted);
        }

        /* Avatar Full Preview Modal */
        .avatar-preview-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(0, 32, 41, 0.75);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 9999;
          animation: fadeIn 0.2s ease-out;
        }

        .avatar-preview-modal {
          background-color: var(--bg-card);
          padding: 1.5rem;
          border-radius: var(--border-radius);
          display: flex;
          flex-direction: column;
          align-items: center;
          position: relative;
          max-width: 90vw;
          max-height: 90vh;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
          animation: scaleUp 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .avatar-preview-close {
          position: absolute;
          top: 10px;
          right: 15px;
          font-size: 28px;
          color: var(--text-secondary);
          cursor: pointer;
          background: none;
          border: none;
          transition: color 0.2s ease;
          line-height: 1;
        }

        .avatar-preview-close:hover {
          color: var(--text-primary);
        }

        .avatar-preview-image {
          width: 320px;
          height: 320px;
          object-fit: cover;
          border-radius: 8px;
          margin-top: 1rem;
          margin-bottom: 1rem;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }

        .avatar-preview-placeholder {
          width: 320px;
          height: 320px;
          border-radius: 8px;
          background-color: var(--bg-active);
          display: flex;
          justify-content: center;
          align-items: center;
          font-weight: 700;
          font-size: 80px;
          color: var(--text-secondary);
          margin-top: 1rem;
          margin-bottom: 1rem;
        }

        .avatar-preview-username {
          font-weight: 700;
          font-size: var(--text-lg);
          color: var(--text-primary);
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes scaleUp {
          from { transform: scale(0.92); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }

        .unfriend-header-btn {
          color: var(--text-secondary);
          padding: 0.5rem;
          border-radius: var(--border-radius);
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: none;
          cursor: pointer;
          transition: background-color 0.2s ease, color 0.2s ease;
        }

        .unfriend-header-btn:hover {
          background-color: var(--bg-active);
          color: var(--text-primary);
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
    </div>
  );
};

export default ChatWindow;
