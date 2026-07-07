import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useSocket } from '../context/SocketContext';
import { Send, UserMinus, ShieldAlert, Ban } from 'lucide-react';

const ChatWindow = ({ activeChat, currentUser, isFriend, onBack, onRemoveFriend, onBlockToggle, onRestrictToggle }) => {
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
      const res = await axios.post(`/api/conversations/${chatId}/messages`, {
        content: messageText,
      });
      // optimistic local state
      setMessages((prev) => {
        if (prev.some((m) => m._id === res.data._id)) return prev;
        return [...prev, res.data];
      });
    } catch (err) {
      console.error('Error sending message:', err);
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
                      {isSelf && !isMsgDeleted && (
                        <span className={`msg-status-tick ${msg.isRead ? 'read' : 'sent'}`}>
                          {msg.isRead ? ' ✓✓' : ' ✓'}
                        </span>
                      )}
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
          border-bottom: 4px solid var(--black);
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
          border: 3px solid var(--black);
          border-radius: var(--border-radius);
          box-shadow: 2px 2px 0px var(--black);
          transition: transform 0.1s ease, box-shadow 0.1s ease;
          text-transform: uppercase;
        }

        .back-btn:hover {
          transform: translate(2px, 2px);
          box-shadow: 1px 1px 0px var(--black);
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
          border: 3px solid var(--black);
          box-shadow: 2px 2px 0px var(--black);
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
          font-size: var(--text-xs);
          color: var(--text-muted);
          font-weight: 500;
          text-transform: uppercase;
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
          border-bottom: 4px solid var(--black);
        }

        .messages-loading, .empty-messages-prompt {
          text-align: center;
          color: var(--black);
          font-size: var(--text-sm);
          margin: auto;
          background: var(--white);
          border: 3px solid var(--black);
          padding: 1rem 1.5rem;
          box-shadow: 4px 4px 0px var(--black);
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
          box-shadow: 3px 3px 0px var(--black);
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          border: 3px solid var(--black);
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
          border: 3px solid var(--black) !important;
          border-radius: var(--border-radius) !important;
          height: 48px;
          font-weight: 700;
          box-shadow: 3px 3px 0px var(--black) !important;
          background-color: var(--white) !important;
        }

        .chat-input-area input:focus {
          background-color: var(--white) !important;
          transform: translate(-1px, -1px);
          box-shadow: 4px 4px 0px var(--black) !important;
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
          border: 3px solid var(--black);
          box-shadow: 3px 3px 0px var(--black);
          transition: transform 0.1s ease, box-shadow 0.1s ease;
        }

        .chat-send-btn:hover:not(:disabled) {
          transform: translate(2px, 2px);
          box-shadow: 1px 1px 0px var(--black);
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
          box-shadow: 4px 4px 0px var(--black);
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
          border: 4px solid var(--black);
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
          border: 3px solid var(--black);
          border-radius: var(--border-radius);
          margin-top: 1rem;
          margin-bottom: 1rem;
          box-shadow: 4px 4px 0px var(--black);
        }

        .avatar-preview-placeholder {
          width: 320px;
          height: 320px;
          border-radius: var(--border-radius);
          border: 3px solid var(--black);
          background-color: var(--color);
          display: flex;
          justify-content: center;
          align-items: center;
          font-weight: 900;
          font-size: 80px;
          color: var(--black);
          margin-top: 1rem;
          margin-bottom: 1rem;
          box-shadow: 4px 4px 0px var(--black);
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
          border: 3px solid var(--black);
          cursor: pointer;
          box-shadow: 2px 2px 0px var(--black);
          transition: transform 0.1s ease, box-shadow 0.1s ease;
        }

        .unfriend-header-btn:hover,
        .restrict-header-btn:hover,
        .block-header-btn:hover {
          transform: translate(2px, 2px);
          box-shadow: 1px 1px 0px var(--black);
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
