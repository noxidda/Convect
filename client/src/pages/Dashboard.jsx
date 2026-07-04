import React, { useState, useEffect } from 'react';
import { useClerk } from '@clerk/clerk-react';
import axios from 'axios';
import { useSocket } from '../context/SocketContext';
import ChatWindow from '../components/ChatWindow';
import SettingsModal from '../components/SettingsModal';
import { 
  Search, Settings, LogOut, MessageSquare, 
  ShieldAlert, Ban, MessageCircle, UserX, User, ArrowLeft,
  Users, UserPlus, Check, X, UserMinus, Loader2
} from 'lucide-react';

const Dashboard = ({ dbUser }) => {
  const { signOut } = useClerk();
  const { socket, onlineUsers, setOnlineUsers } = useSocket();

  // State
  const [currentUser, setCurrentUser] = useState(dbUser || null);
  const [conversations, setConversations] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  
  // Tabs: 'all' | 'friends' | 'requests' | 'restricted' | 'blocked'
  const [activeTab, setActiveTab] = useState('all');
  
  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  // Friends & Requests State
  const [friends, setFriends] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [actionLoading, setActionLoading] = useState({});
  
  // Modals
  const [showSettings, setShowSettings] = useState(false);
  
  // UI Responsive (for mobile split pane)
  const [viewingChatMobile, setViewingChatMobile] = useState(false);

  // Fetch self user profile on load
  useEffect(() => {
    const fetchSelf = async () => {
      try {
        const res = await axios.get('/api/users/profile');
        setCurrentUser(res.data);
      } catch (err) {
        console.error('Error fetching self profile:', err);
      }
    };
    fetchSelf();
  }, []);

  // Fetch conversations
  const fetchConversations = async () => {
    try {
      const res = await axios.get('/api/conversations');
      setConversations(res.data);

      // Populate online status of active conversations
      const newOnline = new Map(onlineUsers);
      res.data.forEach((c) => {
        if (c.contact && c.contact._id) {
          // If not set yet, mark offline default, socket will update
          if (!newOnline.has(c.contact._id)) {
            newOnline.set(c.contact._id, 'offline');
          }
        }
      });
      setOnlineUsers(newOnline);

    } catch (err) {
      console.error('Error fetching conversations:', err);
    }
  };

  // Fetch friends list
  const fetchFriends = async () => {
    try {
      const res = await axios.get('/api/friends');
      setFriends(res.data);
    } catch (err) {
      console.error('Error fetching friends:', err);
    }
  };

  // Fetch pending requests list
  const fetchPendingRequests = async () => {
    try {
      const res = await axios.get('/api/friends/requests/pending');
      setPendingRequests(res.data);
    } catch (err) {
      console.error('Error fetching pending requests:', err);
    }
  };

  useEffect(() => {
    if (currentUser) {
      fetchConversations();
      fetchFriends();
      fetchPendingRequests();
    }
  }, [currentUser]);

  // Socket updates for conversation lastMessages and friend actions
  useEffect(() => {
    if (!socket) return;

    const handleConvUpdate = ({ conversationId, message }) => {
      // Refresh list to pull newest lastMessage and re-sort
      fetchConversations();
    };

    const handleFriendReqReceived = (newRequest) => {
      setPendingRequests(prev => {
        if (prev.some(r => r._id === newRequest._id)) return prev;
        return [newRequest, ...prev];
      });
    };

    const handleFriendReqAccepted = ({ requestId, user }) => {
      setPendingRequests(prev => prev.filter(r => r._id !== requestId));
      fetchFriends();
      fetchConversations();
      alert(`@${user.username} accepted your friend request!`);
    };

    const handleFriendRemoved = ({ friendId }) => {
      fetchFriends();
      fetchConversations();
      if (activeChat && activeChat.contact._id === friendId) {
        setActiveChat(null);
      }
    };

    socket.on('conversation_update', handleConvUpdate);
    socket.on('friend_request_received', handleFriendReqReceived);
    socket.on('friend_request_accepted', handleFriendReqAccepted);
    socket.on('friend_removed', handleFriendRemoved);

    return () => {
      socket.off('conversation_update', handleConvUpdate);
      socket.off('friend_request_received', handleFriendReqReceived);
      socket.off('friend_request_accepted', handleFriendReqAccepted);
      socket.off('friend_removed', handleFriendRemoved);
    };
  }, [socket, activeChat]);

  // Friend Request Action Handlers
  const handleSendFriendRequest = async (recipientId) => {
    setActionLoading(prev => ({ ...prev, [recipientId]: true }));
    try {
      const res = await axios.post('/api/friends/request', { recipientId });
      if (res.data.status === 'accepted') {
        alert(res.data.message);
        await fetchFriends();
        await fetchConversations();
        await fetchPendingRequests();
      } else {
        alert('Friend request sent successfully.');
      }
      
      if (searchQuery.trim().length >= 1) {
        const searchRes = await axios.get(`/api/users/search?q=${searchQuery}`);
        setSearchResults(searchRes.data);
      }
    } catch (err) {
      console.error('Error sending friend request:', err);
      alert(err.response?.data?.error || 'Failed to send friend request.');
    } finally {
      setActionLoading(prev => ({ ...prev, [recipientId]: false }));
    }
  };

  const handleAcceptFriendRequest = async (requestId, senderId) => {
    const idKey = requestId || senderId;
    setActionLoading(prev => ({ ...prev, [idKey]: true }));
    try {
      await axios.post('/api/friends/accept', { requestId });
      alert('Friend request accepted.');
      await fetchPendingRequests();
      await fetchFriends();
      await fetchConversations();

      if (searchQuery.trim().length >= 1) {
        const searchRes = await axios.get(`/api/users/search?q=${searchQuery}`);
        setSearchResults(searchRes.data);
      }
    } catch (err) {
      console.error('Error accepting friend request:', err);
      alert(err.response?.data?.error || 'Failed to accept request.');
    } finally {
      setActionLoading(prev => ({ ...prev, [idKey]: false }));
    }
  };

  const handleRejectFriendRequest = async (requestId, senderId) => {
    const idKey = requestId || senderId;
    setActionLoading(prev => ({ ...prev, [idKey]: true }));
    try {
      await axios.post('/api/friends/reject', { requestId });
      alert('Friend request rejected.');
      await fetchPendingRequests();

      if (searchQuery.trim().length >= 1) {
        const searchRes = await axios.get(`/api/users/search?q=${searchQuery}`);
        setSearchResults(searchRes.data);
      }
    } catch (err) {
      console.error('Error rejecting friend request:', err);
      alert(err.response?.data?.error || 'Failed to reject request.');
    } finally {
      setActionLoading(prev => ({ ...prev, [idKey]: false }));
    }
  };

  const handleRemoveFriend = async (friendId) => {
    if (!window.confirm('Are you sure you want to remove this friend? This will delete your friendship and any messages will no longer be accessible.')) return;
    setActionLoading(prev => ({ ...prev, [friendId]: true }));
    try {
      await axios.post('/api/friends/remove', { friendId });
      alert('Friend removed successfully.');
      await fetchFriends();
      await fetchConversations();
      if (activeChat && activeChat.contact._id === friendId) {
        setActiveChat(null);
      }

      if (searchQuery.trim().length >= 1) {
        const searchRes = await axios.get(`/api/users/search?q=${searchQuery}`);
        setSearchResults(searchRes.data);
      }
    } catch (err) {
      console.error('Error removing friend:', err);
      alert(err.response?.data?.error || 'Failed to remove friend.');
    } finally {
      setActionLoading(prev => ({ ...prev, [friendId]: false }));
    }
  };

  // Handle username search
  useEffect(() => {
    const delayDebounce = setTimeout(async () => {
      if (searchQuery.trim().length >= 1) {
        setIsSearching(true);
        try {
          const res = await axios.get(`/api/users/search?q=${searchQuery}`);
          setSearchResults(res.data);
        } catch (err) {
          console.error('Error searching usernames:', err);
        }
      } else {
        setSearchResults([]);
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounce);
  }, [searchQuery]);

  // Select or Create Chat
  const handleSelectContact = async (contactId) => {
    try {
      const res = await axios.post('/api/conversations', { recipientId: contactId });
      
      // Update conversations list
      await fetchConversations();

      // Find in conversation list and set active
      setActiveChat(res.data);
      setSearchQuery('');
      setSearchResults([]);
      setIsSearching(false);
      
      // Responsive switch
      setViewingChatMobile(true);
    } catch (err) {
      console.error('Error opening conversation:', err);
      alert(err.response?.data?.error || 'Failed to start chat. User might have blocked you.');
    }
  };

  // Select conversation directly from sidebar list
  const handleSelectConversation = (conv) => {
    setActiveChat(conv);
    setViewingChatMobile(true);
  };

  // Block/Unblock toggle
  const handleBlockToggle = async (targetUserId, currentlyBlocked) => {
    try {
      const url = currentlyBlocked ? '/api/users/unblock' : '/api/users/block';
      await axios.post(url, { targetUserId });

      // Refresh currentUser blocked lists
      const profileRes = await axios.get('/api/users/profile');
      setCurrentUser(profileRes.data);

      // Refresh conversations lists
      await fetchConversations();

      // Update active chat details if applicable
      if (activeChat && activeChat.contact._id === targetUserId) {
        setActiveChat((prev) => ({
          ...prev,
          contact: {
            ...prev.contact,
            isBlocked: !currentlyBlocked,
          },
        }));
      }
    } catch (err) {
      console.error('Error toggling block:', err);
    }
  };

  // Restrict/Unrestrict toggle
  const handleRestrictToggle = async (targetUserId, currentlyRestricted) => {
    try {
      const url = currentlyRestricted ? '/api/users/unrestrict' : '/api/users/restrict';
      await axios.post(url, { targetUserId });

      // Refresh profile
      const profileRes = await axios.get('/api/users/profile');
      setCurrentUser(profileRes.data);

      // Refresh conversations list
      await fetchConversations();

      // Update active chat details
      if (activeChat && activeChat.contact._id === targetUserId) {
        setActiveChat((prev) => ({
          ...prev,
          contact: {
            ...prev.contact,
            isRestricted: !currentlyRestricted,
          },
        }));
      }
    } catch (err) {
      console.error('Error toggling restrict:', err);
    }
  };

  // Handle chat deletion locally
  const handleChatDeleted = (deletedChatId) => {
    setConversations((prev) => prev.filter((c) => c._id !== deletedChatId));
    setActiveChat(null);
    setViewingChatMobile(false);
  };

  // Filter conversations based on selected tab
  const getFilteredConversations = () => {
    if (activeTab === 'restricted') {
      return conversations.filter((c) => c.contact.isRestricted);
    }
    // 'all' tab returns chats that are NOT restricted
    return conversations.filter((c) => !c.contact.isRestricted);
  };

  // Format timestamp for sidebar list
  const formatLastMsgTime = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    const today = new Date();
    
    if (date.toDateString() === today.toDateString()) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  if (!currentUser) return null;

  return (
    <div className="dashboard-container app-container">
      {/* Sidebar List (Left Panel) */}
      <div className={`sidebar-pane ${viewingChatMobile ? 'mobile-hidden' : ''}`}>
        
        {/* Sidebar Header */}
        <div className="sidebar-header">
          <div className="self-profile-info">
            {currentUser.profilePhoto ? (
              <img src={currentUser.profilePhoto} alt="My Profile" className="self-avatar" />
            ) : (
              <div className="self-avatar-placeholder">
                <User size={18} />
              </div>
            )}
            <div className="self-meta">
              <span className="self-username">@{currentUser.username}</span>
              <span className="self-bio">{currentUser.bio}</span>
            </div>
          </div>

          <div className="sidebar-actions">
            <button 
              className="action-btn hover-item" 
              onClick={() => setShowSettings(true)}
              title="Settings"
            >
              <Settings size={20} />
            </button>
            <button 
              className="action-btn hover-item logout-btn" 
              onClick={() => signOut()}
              title="Log Out"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>

        {/* Search Username Area */}
        <div className="sidebar-search-bar">
          <div className="search-input-container">
            <Search size={18} className="search-icon" />
            <input
              type="text"
              placeholder="Search username to start chat..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Tabs Bar */}
        {!isSearching && (
          <div className="sidebar-tabs">
            <button 
              className={`tab-item ${activeTab === 'all' ? 'active' : ''}`}
              onClick={() => setActiveTab('all')}
              title="Chats"
            >
              <MessageSquare size={16} /> Chats
            </button>
            <button 
              className={`tab-item ${activeTab === 'requests' ? 'active' : ''}`}
              onClick={() => setActiveTab('requests')}
              title="Requests"
            >
              <UserPlus size={16} /> Requests
              {pendingRequests.length > 0 && (
                <span className="badge">{pendingRequests.length}</span>
              )}
            </button>
            <button 
              className={`tab-item ${activeTab === 'restricted' ? 'active' : ''}`}
              onClick={() => setActiveTab('restricted')}
              title="Restricted"
            >
              <ShieldAlert size={16} /> Restricted
            </button>
            <button 
              className={`tab-item ${activeTab === 'blocked' ? 'active' : ''}`}
              onClick={() => setActiveTab('blocked')}
              title="Blocked Users"
            >
              <Ban size={16} /> Blocked
            </button>
          </div>
        )}

        {/* Sidebar Body */}
        <div className="sidebar-list-content">
          {isSearching ? (
            /* Search Results View */
            <div className="search-results-list">
              <h4 className="list-section-title">Search Results</h4>
              {searchResults.length === 0 ? (
                <div className="empty-results-notice">No users found matching query.</div>
              ) : (
                searchResults.map((user) => {
                  const isLoad = actionLoading[user._id] || actionLoading[user.requestId];
                  return (
                    <div 
                      key={user._id} 
                      className={`contact-list-item ${user.relationship === 'friend' ? 'hover-item' : ''}`}
                      onClick={() => {
                        if (user.relationship === 'friend') {
                          handleSelectContact(user._id);
                        }
                      }}
                    >
                      {user.profilePhoto ? (
                        <img src={user.profilePhoto} alt={user.username} className="contact-avatar" />
                      ) : (
                        <div className="contact-avatar-placeholder">
                          {user.username.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="contact-details">
                        <div className="contact-username">@{user.username}</div>
                        <div className="contact-bio">{user.bio}</div>
                      </div>
                      
                      {/* Relationship Action Buttons */}
                      <div className="contact-actions" onClick={(e) => e.stopPropagation()}>
                        {user.relationship === 'friend' && (
                          <button 
                            className="action-btn-friend chat-btn"
                            onClick={() => handleSelectContact(user._id)}
                          >
                            <MessageCircle size={16} /> Chat
                          </button>
                        )}
                        {user.relationship === 'none' && (
                          <button 
                            className="action-btn-friend add-btn"
                            disabled={isLoad}
                            onClick={() => handleSendFriendRequest(user._id)}
                          >
                            {isLoad ? <Loader2 size={16} className="spinner" /> : <UserPlus size={16} />} Add Friend
                          </button>
                        )}
                        {user.relationship === 'sent_pending' && (
                          <button 
                            className="action-btn-friend pending-btn"
                            disabled
                          >
                            Pending...
                          </button>
                        )}
                        {user.relationship === 'received_pending' && (
                          <div className="button-group">
                            <button 
                              className="action-btn-friend accept-btn"
                              disabled={isLoad}
                              onClick={() => handleAcceptFriendRequest(user.requestId, user._id)}
                            >
                              Accept
                            </button>
                            <button 
                              className="action-btn-friend reject-btn"
                              disabled={isLoad}
                              onClick={() => handleRejectFriendRequest(user.requestId, user._id)}
                            >
                              Reject
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ) : activeTab === 'blocked' ? (
            /* Blocked Users list tab */
            <div className="blocked-users-list">
              <h4 className="list-section-title">Blocked Users</h4>
              {conversations.filter(c => c.contact.isBlocked).length === 0 ? (
                <div className="empty-results-notice">You haven't blocked anyone yet.</div>
              ) : (
                conversations
                  .filter(c => c.contact.isBlocked)
                  .map((conv) => (
                    <div key={conv._id} className="blocked-list-item">
                      <div className="blocked-item-left">
                        {conv.contact.profilePhoto ? (
                          <img src={conv.contact.profilePhoto} alt={conv.contact.username} className="contact-avatar" />
                        ) : (
                          <div className="contact-avatar-placeholder">
                            {conv.contact.username.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <span className="blocked-item-username">@{conv.contact.username}</span>
                      </div>
                      <button 
                        className="btn-unblock hover-item"
                        onClick={() => handleBlockToggle(conv.contact._id, true)}
                      >
                        Unblock
                      </button>
                    </div>
                  ))
              )}
            </div>
          ) : activeTab === 'requests' ? (
            /* Pending Incoming Requests Tab */
            <div className="pending-requests-list">
              <h4 className="list-section-title">Pending Requests</h4>
              {pendingRequests.length === 0 ? (
                <div className="empty-results-notice">No pending friend requests.</div>
              ) : (
                pendingRequests.map((reqItem) => {
                  const isLoad = actionLoading[reqItem._id] || actionLoading[reqItem.sender._id];
                  return (
                    <div key={reqItem._id} className="request-list-item">
                      <div className="request-item-left">
                        {reqItem.sender.profilePhoto ? (
                          <img src={reqItem.sender.profilePhoto} alt={reqItem.sender.username} className="contact-avatar" />
                        ) : (
                          <div className="contact-avatar-placeholder">
                            {reqItem.sender.username.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="request-details">
                          <span className="request-username">@{reqItem.sender.username}</span>
                          <span className="request-bio">{reqItem.sender.bio}</span>
                        </div>
                      </div>
                      <div className="request-item-actions">
                        <button 
                          className="request-action-btn accept hover-item"
                          disabled={isLoad}
                          onClick={() => handleAcceptFriendRequest(reqItem._id, reqItem.sender._id)}
                        >
                          Accept
                        </button>
                        <button 
                          className="request-action-btn reject hover-item"
                          disabled={isLoad}
                          onClick={() => handleRejectFriendRequest(reqItem._id, reqItem.sender._id)}
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            /* Conversations List (All / Restricted) */
            <div className="conversations-list">
              {getFilteredConversations().length === 0 ? (
                <div className="empty-results-notice">
                  {activeTab === 'restricted' 
                    ? 'No restricted chats.' 
                    : 'No active conversations. Search above to start chatting!'}
                </div>
              ) : (
                getFilteredConversations().map((conv) => {
                  const isOnline = onlineUsers.get(conv.contact._id) === 'online';
                  const isSelected = activeChat && activeChat._id === conv._id;
                  
                  return (
                    <div 
                      key={conv._id}
                      className={`conv-list-item hover-item ${isSelected ? 'active' : ''}`}
                      onClick={() => handleSelectConversation(conv)}
                    >
                      <div className="conv-avatar-container">
                        {conv.contact.profilePhoto ? (
                          <img src={conv.contact.profilePhoto} alt={conv.contact.username} className="contact-avatar" />
                        ) : (
                          <div className="contact-avatar-placeholder">
                            {conv.contact.username.charAt(0).toUpperCase()}
                          </div>
                        )}
                        {isOnline && !conv.contact.isBlocked && !conv.contact.hasBlockedMe && (
                          <span className="online-dot-sidebar"></span>
                        )}
                      </div>

                      <div className="conv-content">
                        <div className="conv-meta-row">
                          <span className="conv-username">{conv.contact.username}</span>
                          <span className="conv-time">{formatLastMsgTime(conv.lastMessage?.createdAt || conv.updatedAt)}</span>
                        </div>
                        <div className="conv-message-row">
                          <span className="conv-last-msg">
                            {conv.contact.isBlocked ? (
                              <span style={{ fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                <UserX size={12} /> Blocked
                              </span>
                            ) : conv.lastMessage ? (
                              conv.lastMessage.content
                            ) : (
                              <span style={{ fontStyle: 'italic' }}>No messages yet</span>
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>

      {/* Chat Window Panel (Right Panel) */}
      <div className={`chat-pane ${!viewingChatMobile ? 'mobile-hidden' : ''}`}>
        {activeChat ? (
          <ChatWindow
            activeChat={activeChat}
            currentUser={currentUser}
            onBack={() => setViewingChatMobile(false)}
            onChatDeleted={handleChatDeleted}
            onBlockToggle={handleBlockToggle}
            onRestrictToggle={handleRestrictToggle}
            onRemoveFriend={handleRemoveFriend}
          />
        ) : (
          <div className="welcome-screen">
            <MessageCircle size={64} className="welcome-icon" />
            <h2 className="welcome-title">Welcome to Convect</h2>
            <p className="welcome-subtitle">
              Select a conversation from the sidebar or search usernames to start real-time messaging.
            </p>
          </div>
        )}
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <SettingsModal
          currentUser={currentUser}
          onClose={() => setShowSettings(false)}
          onProfileUpdated={(updated) => {
            setCurrentUser(updated);
          }}
        />
      )}

      <style>{`
        .dashboard-container {
          overflow: hidden;
          width: 100vw;
          height: 100vh;
        }

        /* Sidebar Styles */
        .sidebar-pane {
          width: 380px;
          height: 100%;
          border-right: 1px solid var(--border);
          background-color: var(--bg-sidebar);
          display: flex;
          flex-direction: column;
        }

        .sidebar-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem 1.25rem;
          border-bottom: 1px solid var(--border);
        }

        .self-profile-info {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          max-width: 70%;
        }

        .self-avatar, .self-avatar-placeholder {
          width: 42px;
          height: 42px;
          border-radius: 50%;
          border: 1px solid var(--border);
          background-color: var(--bg-active);
          display: flex;
          justify-content: center;
          align-items: center;
          color: var(--text-secondary);
        }

        .self-avatar {
          object-fit: cover;
        }

        .self-meta {
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .self-username {
          font-weight: 700;
          font-size: var(--text-sm);
          line-height: 1.2;
        }

        .self-bio {
          font-size: var(--text-xs);
          color: var(--text-muted);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .sidebar-actions {
          display: flex;
          gap: 0.25rem;
        }

        .action-btn {
          color: var(--text-primary);
          padding: 0.5rem;
          border-radius: var(--border-radius);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .action-btn:hover {
          background-color: var(--bg-active);
        }

        .logout-btn {
          color: var(--text-primary);
        }

        /* Search input styling */
        .sidebar-search-bar {
          padding: 0.75rem 1.25rem;
          border-bottom: 1px solid var(--border);
        }

        .search-input-container {
          position: relative;
          display: flex;
          align-items: center;
        }

        .search-icon {
          position: absolute;
          left: 12px;
          color: var(--text-muted);
        }

        .search-input-container input {
          padding-left: 2.25rem;
        }

        /* Tabs styling */
        .sidebar-tabs {
          display: flex;
          border-bottom: 1px solid var(--border);
          padding: 0.25rem;
          gap: 0.25rem;
        }

        .tab-item {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.4rem;
          font-size: var(--text-xs);
          font-weight: 600;
          padding: 0.6rem 0.25rem;
          border-radius: var(--border-radius);
          color: var(--text-secondary);
          transition: background-color 0.2s ease, color 0.2s ease;
        }

        .tab-item.active {
          background-color: var(--bg-active);
          color: var(--text-primary);
        }

        /* Sidebar body scroll list */
        .sidebar-list-content {
          flex: 1;
          overflow-y: auto;
        }

        .list-section-title {
          font-size: var(--text-xs);
          font-weight: 700;
          color: var(--text-muted);
          padding: 1rem 1.25rem 0.5rem 1.25rem;
          text-transform: uppercase;
        }

        .empty-results-notice {
          padding: 2rem 1.25rem;
          text-align: center;
          font-size: var(--text-sm);
          color: var(--text-muted);
        }

        /* Contact item searches styling */
        .contact-list-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.75rem 1.25rem;
          cursor: pointer;
          border-bottom: 1px solid var(--border);
        }

        .contact-avatar, .contact-avatar-placeholder {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          border: 1px solid var(--border);
          background-color: var(--bg-active);
          display: flex;
          justify-content: center;
          align-items: center;
          font-weight: 700;
          font-size: var(--text-base);
          color: var(--text-secondary);
        }

        .contact-avatar {
          object-fit: cover;
        }

        .contact-details {
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .contact-username {
          font-weight: 600;
          font-size: var(--text-sm);
        }

        .contact-bio {
          font-size: var(--text-xs);
          color: var(--text-muted);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        /* Block list styling */
        .blocked-list-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem 1.25rem;
          border-bottom: 1px solid var(--border);
        }

        .blocked-item-left {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .blocked-item-username {
          font-weight: 600;
          font-size: var(--text-sm);
        }

        .btn-unblock {
          background-color: var(--bg-active);
          border: 1px solid var(--border);
          padding: 0.4rem 0.8rem;
          border-radius: var(--border-radius);
          font-size: var(--text-xs);
          font-weight: 600;
        }

        /* Conversation item list styling */
        .conv-list-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.85rem 1.25rem;
          cursor: pointer;
          border-bottom: 1px solid var(--border);
        }

        .conv-list-item.active {
          background-color: var(--bg-active);
        }

        .conv-avatar-container {
          position: relative;
        }

        .online-dot-sidebar {
          position: absolute;
          bottom: 0;
          right: 0;
          width: 9px;
          height: 9px;
          border-radius: 50%;
          background-color: var(--accent);
          border: 1.5px solid var(--bg-sidebar);
        }

        .conv-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .conv-meta-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.25rem;
        }

        .conv-username {
          font-weight: 600;
          font-size: var(--text-sm);
        }

        .conv-time {
          font-size: 0.7rem;
          color: var(--text-muted);
        }

        .conv-message-row {
          display: flex;
          justify-content: space-between;
        }

        .conv-last-msg {
          font-size: var(--text-xs);
          color: var(--text-muted);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          width: 100%;
        }

        /* Chat Pane (Right Pane) styling */
        .chat-pane {
          flex: 1;
          height: 100%;
          background-color: var(--bg-app);
          display: flex;
          flex-direction: column;
        }

        /* Welcome screen styling */
        .welcome-screen {
          margin: auto;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          max-width: 440px;
          padding: 2rem;
          color: var(--text-secondary);
        }

        .welcome-icon {
          color: var(--accent);
          margin-bottom: 1rem;
        }

        .welcome-title {
          font-size: var(--text-xl);
          font-weight: 700;
          margin-bottom: 0.5rem;
          color: var(--text-primary);
        }

        .welcome-subtitle {
          font-size: var(--text-sm);
          color: var(--text-muted);
          line-height: 1.4;
        }

        /* Responsive Mobile Layouts */
        @media (max-width: 768px) {
          .sidebar-pane {
            width: 100%;
          }

          .chat-pane {
            width: 100%;
          }

          .mobile-hidden {
            display: none !important;
          }
        }

        /* Friends & Requests CSS */
        .contact-details {
          flex: 1;
        }

        .contact-actions {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-left: auto;
        }

        .action-btn-friend {
          background-color: var(--accent);
          color: var(--bg-sidebar);
          border: none;
          padding: 0.4rem 0.8rem;
          border-radius: var(--border-radius);
          font-size: var(--text-xs);
          font-weight: 600;
          cursor: pointer;
          transition: opacity 0.2s ease, background-color 0.2s ease;
          display: flex;
          align-items: center;
          gap: 0.25rem;
        }

        .action-btn-friend:hover:not(:disabled) {
          opacity: 0.9;
        }

        .action-btn-friend:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .action-btn-friend.chat-btn {
          background-color: var(--bg-active);
          color: var(--text-primary);
          border: 1px solid var(--border);
        }

        .action-btn-friend.pending-btn {
          background-color: var(--border);
          color: var(--text-muted);
          border: none;
          cursor: not-allowed;
        }

        .action-btn-friend.accept-btn {
          background-color: #10B981; /* Green */
          color: white;
          border: none;
          padding: 0.4rem 0.8rem;
          border-radius: var(--border-radius);
          font-size: var(--text-xs);
          font-weight: 600;
          cursor: pointer;
        }

        .action-btn-friend.reject-btn {
          background-color: #EF4444; /* Red */
          color: white;
          border: none;
          padding: 0.4rem 0.8rem;
          border-radius: var(--border-radius);
          font-size: var(--text-xs);
          font-weight: 600;
          cursor: pointer;
        }

        .button-group {
          display: flex;
          gap: 0.4rem;
        }

        .badge {
          background-color: var(--accent);
          color: var(--bg-sidebar);
          border-radius: 10px;
          padding: 0.1rem 0.4rem;
          font-size: 0.7rem;
          font-weight: 700;
          margin-left: 0.25rem;
        }

        /* Friends list tab styling */
        .friend-list-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem 1.25rem;
          border-bottom: 1px solid var(--border);
        }

        .friend-item-left {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          max-width: 70%;
        }

        .friend-details {
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .friend-username {
          font-weight: 600;
          font-size: var(--text-sm);
        }

        .friend-bio {
          font-size: var(--text-xs);
          color: var(--text-muted);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .friend-item-actions {
          display: flex;
          gap: 0.4rem;
        }

        .friend-action-btn {
          color: var(--text-secondary);
          padding: 0.4rem;
          border-radius: var(--border-radius);
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: none;
        }

        .friend-action-btn:hover {
          background-color: var(--bg-active);
          color: var(--text-primary);
        }

        /* Request list item styling */
        .request-list-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem 1.25rem;
          border-bottom: 1px solid var(--border);
        }

        .request-item-left {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          max-width: 70%;
        }

        .request-details {
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .request-username {
          font-weight: 600;
          font-size: var(--text-sm);
        }

        .request-bio {
          font-size: var(--text-xs);
          color: var(--text-muted);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .request-item-actions {
          display: flex;
          gap: 0.4rem;
        }

        .request-action-btn {
          border: none;
          padding: 0.4rem 0.8rem;
          border-radius: var(--border-radius);
          font-size: var(--text-xs);
          font-weight: 600;
          color: white;
          cursor: pointer;
          transition: opacity 0.2s ease;
        }

        .request-action-btn.accept {
          background-color: #10B981;
        }

        .request-action-btn.reject {
          background-color: #EF4444;
        }

        .request-action-btn:hover {
          opacity: 0.85;
        }

        .spinner {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default Dashboard;
