import React, { useState, useEffect, useRef } from 'react';
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

  // state
  const [currentUser, setCurrentUser] = useState(dbUser || null);
  const [conversations, setConversations] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  
  // tabs: 'all' |
  const [activeTab, setActiveTab] = useState('all');
  
  // search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  // friends & requests
  const [friends, setFriends] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [actionLoading, setActionLoading] = useState({});
  
  // modals
  const [showSettings, setShowSettings] = useState(false);
  const [selectedPreviewUser, setSelectedPreviewUser] = useState(null);
  
  // ui responsive (for
  const [viewingChatMobile, setViewingChatMobile] = useState(false);

  // dropdown for requests
  const [showRequestsDropdown, setShowRequestsDropdown] = useState(false);
  const requestsDropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (requestsDropdownRef.current && !requestsDropdownRef.current.contains(event.target)) {
        setShowRequestsDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // fetch self user
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

  // fetch conversations
  const fetchConversations = async () => {
    try {
      const res = await axios.get('/api/conversations');
      setConversations(res.data);

      // populate online status
      const newOnline = new Map(onlineUsers);
      res.data.forEach((c) => {
        if (c.contact && c.contact._id) {
          // if not set
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

  // fetch friends list
  const fetchFriends = async () => {
    try {
      const res = await axios.get('/api/friends');
      setFriends(res.data);
    } catch (err) {
      console.error('Error fetching friends:', err);
    }
  };

  // fetch pending requests
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

  // socket updates for
  useEffect(() => {
    if (!socket) return;

    const handleConvUpdate = ({ conversationId, message }) => {
      // refresh list to
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

  // friend request action
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

  // handle username search
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

  // select or create
  const handleSelectContact = async (contactId) => {
    try {
      const res = await axios.post('/api/conversations', { recipientId: contactId });
      
      // update conversations list
      await fetchConversations();

      // find in conversation
      setActiveChat(res.data);
      setSearchQuery('');
      setSearchResults([]);
      setIsSearching(false);
      
      // responsive switch
      setViewingChatMobile(true);
    } catch (err) {
      console.error('Error opening conversation:', err);
      alert(err.response?.data?.error || 'Failed to start chat. User might have blocked you.');
    }
  };

  // select conversation directly
  const handleSelectConversation = (conv) => {
    setActiveChat(conv);
    setViewingChatMobile(true);
  };

  // block/unblock toggle
  const handleBlockToggle = async (targetUserId, currentlyBlocked) => {
    try {
      const url = currentlyBlocked ? '/api/users/unblock' : '/api/users/block';
      await axios.post(url, { targetUserId });

      // refresh currentuser blocked
      const profileRes = await axios.get('/api/users/profile');
      setCurrentUser(profileRes.data);

      // refresh conversations lists
      await fetchConversations();

      // update active chat
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

  // restrict/unrestrict toggle
  const handleRestrictToggle = async (targetUserId, currentlyRestricted) => {
    try {
      const url = currentlyRestricted ? '/api/users/unrestrict' : '/api/users/restrict';
      await axios.post(url, { targetUserId });

      // refresh profile
      const profileRes = await axios.get('/api/users/profile');
      setCurrentUser(profileRes.data);

      // refresh conversations list
      await fetchConversations();

      // update active chat
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

  // handle chat deletion
  const handleChatDeleted = (deletedChatId) => {
    setConversations((prev) => prev.filter((c) => c._id !== deletedChatId));
    setActiveChat(null);
    setViewingChatMobile(false);
  };

  // filter conversations based
  const getFilteredConversations = () => {
    // only return conversations
    const friendConversations = conversations.filter((c) =>
      friends.some((f) => f._id === c.contact._id)
    );

    if (activeTab === 'restricted') {
      return friendConversations.filter((c) => c.contact.isRestricted);
    }
    // 'all' tab returns
    return friendConversations.filter((c) => !c.contact.isRestricted);
  };

  // format timestamp for
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
    <div className="dashboard-container">
      {/* top header banner */}
      <div className="dashboard-top-header">
        <div className="header-logo-section">
          <h1 className="app-logo-text">CONVECT</h1>
          
        </div>
        <div className="header-self-profile">
          <div className="header-controls">
            <div className="requests-dropdown-wrapper" ref={requestsDropdownRef}>
              <button 
                className={`control-btn requests-trigger ${showRequestsDropdown ? 'active' : ''}`} 
                onClick={() => setShowRequestsDropdown(prev => !prev)}
                title="Friend Requests"
              >
                <UserPlus size={18} />
                {pendingRequests.length > 0 && (
                  <span className="requests-badge">{pendingRequests.length}</span>
                )}
              </button>
              
              {showRequestsDropdown && (
                <div className="requests-dropdown-menu">
                  <div className="requests-dropdown-header">Friend Requests</div>
                  <div className="requests-dropdown-body">
                    {pendingRequests.length === 0 ? (
                      <div className="empty-requests-notice">No pending requests</div>
                    ) : (
                      pendingRequests.map((reqItem) => {
                        const isLoad = actionLoading[reqItem._id] || actionLoading[reqItem.sender._id];
                        return (
                          <div key={reqItem._id} className="request-dropdown-item">
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
                                title="Accept"
                              >
                                {isLoad ? <Loader2 size={16} className="spinner" /> : <Check size={16} />}
                              </button>
                              <button 
                                className="request-action-btn reject hover-item"
                                disabled={isLoad}
                                onClick={() => handleRejectFriendRequest(reqItem._id, reqItem.sender._id)}
                                title="Reject"
                              >
                                {isLoad ? <Loader2 size={16} className="spinner" /> : <X size={16} />}
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
            <button 
              className="control-btn settings-trigger" 
              onClick={() => setShowSettings(true)}
              title="Settings"
            >
              <Settings size={18} />
            </button>
            <button 
              className="control-btn logout-trigger" 
              onClick={() => signOut()}
              title="Log Out"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* main grid container */}
      <div className="dashboard-grid-container">
        
        {/* column 1: controls */}
        <div className={`controls-column controls-pane ${viewingChatMobile ? 'mobile-hidden' : ''}`}>
          <div className="controls-nav-stack">
            <button 
              className={`control-nav-item ${activeTab === 'all' && !isSearching ? 'active' : ''}`}
              onClick={() => {
                setSearchQuery('');
                setSearchResults([]);
                setIsSearching(false);
                setActiveTab('all');
              }}
            >
              <MessageSquare size={18} />
              <span>Chats</span>
            </button>

            <button 
              className={`control-nav-item ${activeTab === 'restricted' && !isSearching ? 'active' : ''}`}
              onClick={() => {
                setSearchQuery('');
                setSearchResults([]);
                setIsSearching(false);
                setActiveTab('restricted');
              }}
            >
              <ShieldAlert size={18} />
              <span>Restricted</span>
            </button>
            <button 
              className={`control-nav-item ${activeTab === 'blocked' && !isSearching ? 'active' : ''}`}
              onClick={() => {
                setSearchQuery('');
                setSearchResults([]);
                setIsSearching(false);
                setActiveTab('blocked');
              }}
            >
              <Ban size={18} />
              <span>Blocked</span>
            </button>
          </div>
          
        </div>

        {/* column 2: directory */}
        <div className={`directory-column directory-pane ${viewingChatMobile ? 'mobile-hidden' : ''}`}>
          {/* mobile tabs navigation */}
          <div className="directory-mobile-tabs">
            <button 
              className={`mobile-tab-btn ${activeTab === 'all' && !isSearching ? 'active' : ''}`}
              onClick={() => {
                setSearchQuery('');
                setSearchResults([]);
                setIsSearching(false);
                setActiveTab('all');
              }}
            >
              <MessageSquare size={16} />
              <span>Chats</span>
            </button>
            <button 
              className={`mobile-tab-btn ${activeTab === 'restricted' && !isSearching ? 'active' : ''}`}
              onClick={() => {
                setSearchQuery('');
                setSearchResults([]);
                setIsSearching(false);
                setActiveTab('restricted');
              }}
            >
              <ShieldAlert size={16} />
              <span>Restricted</span>
            </button>
            <button 
              className={`mobile-tab-btn ${activeTab === 'blocked' && !isSearching ? 'active' : ''}`}
              onClick={() => {
                setSearchQuery('');
                setSearchResults([]);
                setIsSearching(false);
                setActiveTab('blocked');
              }}
            >
              <Ban size={16} />
              <span>Blocked</span>
            </button>
          </div>

          {/* search bar */}
          <div className="directory-search-wrapper">
            <div className="search-box-brutalist">
              <input
                type="text"
                placeholder="Search username to start chat..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <Search size={18} className="search-icon-brutalist" />
            </div>
          </div>

          {/* directory body */}
          <div className="directory-list-wrapper">
            {isSearching ? (
              /* search results view */
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
                        className="contact-list-item hover-item"
                        onClick={() => {
                          setSelectedPreviewUser(user);
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
                        
                        {/* relationship action buttons */}
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
              /* blocked users list */
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
                            <span className="conv-username">@{conv.contact.username}</span>
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
                                ""
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

        {/* COLUMN 3: COMMUNICATION NODE */}
        <div className={`chat-column chat-pane ${!viewingChatMobile ? 'mobile-hidden' : ''}`}>
          {activeChat ? (
            <ChatWindow
              activeChat={activeChat}
              currentUser={currentUser}
              isFriend={friends.some(f => f._id === activeChat.contact._id)}
              onBack={() => setViewingChatMobile(false)}
              onChatDeleted={handleChatDeleted}
              onBlockToggle={handleBlockToggle}
              onRestrictToggle={handleRestrictToggle}
              onRemoveFriend={handleRemoveFriend}
            />
          ) : (
            <div className="welcome-screen">
              <p className="welcome-subtitle">
                Select a conversation from the directory or search users to start real-time messaging.
              </p>
            </div>
          )}
        </div>

      </div>

      {/* Settings Modal */}
      {showSettings && (
        <SettingsModal
          currentUser={currentUser}
          onClose={() => setShowSettings(false)}
          onProfileUpdated={(updated) => {
            setCurrentUser(updated);
          }}
          onBlockToggle={handleBlockToggle}
          onRestrictToggle={handleRestrictToggle}
        />
      )}

      {/* Profile Preview Modal */}
      {selectedPreviewUser && (
        <div className="preview-modal-overlay" onClick={() => setSelectedPreviewUser(null)}>
          <div className="preview-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="preview-modal-header">
              <span className="preview-modal-title">User Profile</span>
              <button className="preview-close-btn" onClick={() => setSelectedPreviewUser(null)}>
                <X size={18} />
              </button>
            </div>
            
            <div className="preview-modal-body">
              <div className="preview-avatar-container">
                {selectedPreviewUser.profilePhoto ? (
                  <img src={selectedPreviewUser.profilePhoto} alt={selectedPreviewUser.username} className="preview-avatar" />
                ) : (
                  <div className="preview-avatar-placeholder">
                    {selectedPreviewUser.username.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              
              <div className="preview-info">
                <h3 className="preview-username">@{selectedPreviewUser.username}</h3>
                <p className="preview-bio">{selectedPreviewUser.bio || "Hey there! I am using Convect."}</p>
              </div>

              <div className="preview-actions">
                {selectedPreviewUser.relationship === 'friend' && (
                  <button 
                    className="preview-action-btn chat-btn"
                    onClick={() => {
                      handleSelectContact(selectedPreviewUser._id);
                      setSelectedPreviewUser(null);
                    }}
                  >
                    <MessageCircle size={16} /> Chat
                  </button>
                )}
                {selectedPreviewUser.relationship === 'none' && (
                  <button 
                    className="preview-action-btn add-btn"
                    disabled={actionLoading[selectedPreviewUser._id]}
                    onClick={async () => {
                      await handleSendFriendRequest(selectedPreviewUser._id);
                      setSelectedPreviewUser(prev => ({ ...prev, relationship: 'sent_pending' }));
                    }}
                  >
                    {actionLoading[selectedPreviewUser._id] ? <Loader2 size={16} className="spinner" /> : <UserPlus size={16} />} Add Friend
                  </button>
                )}
                {selectedPreviewUser.relationship === 'sent_pending' && (
                  <button className="preview-action-btn pending-btn" disabled>
                    Pending...
                  </button>
                )}
                {selectedPreviewUser.relationship === 'received_pending' && (
                  <div className="preview-button-group">
                    <button 
                      className="preview-action-btn accept-btn"
                      disabled={actionLoading[selectedPreviewUser._id] || actionLoading[selectedPreviewUser.requestId]}
                      onClick={async () => {
                        await handleAcceptFriendRequest(selectedPreviewUser.requestId, selectedPreviewUser._id);
                        setSelectedPreviewUser(prev => ({ ...prev, relationship: 'friend' }));
                      }}
                    >
                      Accept Request
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        /* Preview Modal Overlay & Card with Blur */
        .preview-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(0, 0, 0, 0.4);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 2000;
          padding: 1rem;
          animation: fadeIn 0.2s ease-out;
        }

        .preview-modal-card {
          background-color: var(--white);
          border: 4px solid var(--black);
          border-radius: var(--border-radius);
          width: 100%;
          max-width: 400px;
          display: flex;
          flex-direction: column;
          box-shadow: var(--shadow-lg);
          overflow: hidden;
          animation: scaleUp 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .preview-modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1.25rem 1.5rem;
          border-bottom: 3px solid var(--black);
          background-color: var(--white);
        }

        .preview-modal-title {
          font-size: 1.1rem;
          font-weight: 900;
          color: var(--black);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .preview-close-btn {
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

        .preview-close-btn:hover {
          transform: translate(2px, 2px);
          box-shadow: 1px 1px 0px var(--black);
          background-color: var(--color);
        }

        .preview-modal-body {
          padding: 2rem 1.5rem;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1.5rem;
          text-align: center;
        }

        .preview-avatar-container {
          width: 120px;
          height: 120px;
          border-radius: 50%;
          border: 4px solid var(--black);
          overflow: hidden;
          background-color: var(--color);
          display: flex;
          justify-content: center;
          align-items: center;
          box-shadow: var(--shadow-sm);
        }

        .preview-avatar {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .preview-avatar-placeholder {
          font-size: 3rem;
          font-weight: 900;
          color: var(--black);
        }

        .preview-info {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          width: 100%;
        }

        .preview-username {
          font-size: 1.5rem;
          font-weight: 900;
          color: var(--black);
        }

        .preview-bio {
          font-size: 0.95rem;
          color: var(--gray-dark);
          line-height: 1.5;
          background: var(--gray-light);
          padding: 1rem;
          border: 3px solid var(--black);
          border-radius: var(--border-radius);
          text-align: left;
          word-break: break-word;
          min-height: 60px;
        }

        .preview-actions {
          width: 100%;
          display: flex;
          justify-content: center;
          margin-top: 0.5rem;
        }

        .preview-action-btn {
          width: 100%;
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 0.5rem;
          font-weight: 900;
          height: 48px;
          border: 3px solid var(--black);
          border-radius: var(--border-radius);
          text-transform: uppercase;
          font-size: 0.9rem;
          cursor: pointer;
          box-shadow: var(--shadow-sm);
          transition: transform 0.1s ease, box-shadow 0.1s ease;
        }

        .preview-action-btn:hover:not(:disabled) {
          transform: translate(2px, 2px);
          box-shadow: 1px 1px 0px var(--black);
        }

        .preview-action-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          box-shadow: none;
          transform: none;
        }

        .preview-action-btn.chat-btn {
          background-color: var(--color);
          color: var(--black);
        }

        .preview-action-btn.add-btn {
          background-color: var(--white);
          color: var(--black);
        }

        .preview-action-btn.pending-btn {
          background-color: var(--gray-light);
          color: var(--gray-dark);
          box-shadow: none;
          pointer-events: none;
        }

        .preview-button-group {
          width: 100%;
          display: flex;
          gap: 0.5rem;
        }

        .preview-button-group .preview-action-btn.accept-btn {
          background-color: var(--color);
          color: var(--black);
        }

        .dashboard-container {
          overflow: hidden;
          width: 100vw;
          height: 100vh;
          display: flex;
          flex-direction: column;
          background-color: var(--color);
        }

        /* Top Header Styling */
        .dashboard-top-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          background-color: var(--black);
          color: var(--white);
          height: var(--header-height);
          padding: 0 1.5rem;
          border-bottom: 4px solid var(--black);
          box-sizing: border-box;
          z-index: 10;
        }

        .header-logo-section {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .app-logo-text {
          font-size: 2rem;
          font-weight: 900;
          letter-spacing: -0.04em;
          color: var(--color) !important;
          text-transform: uppercase;
        }

        .logo-status-tag {
          font-size: 0.75rem;
          font-family: monospace;
          font-weight: 700;
          color: var(--white);
          border: 2px solid var(--white);
          padding: 1px 6px;
          border-radius: var(--border-radius);
        }

        .header-self-profile {
          display: flex;
          align-items: center;
          gap: 1.5rem;
        }

        .self-profile-card {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          background: var(--white);
          color: var(--black);
          border: 3px solid var(--black);
          padding: 0.4rem 0.8rem;
          border-radius: var(--border-radius);
          box-shadow: 3px 3px 0px var(--color);
        }

        .self-avatar-img {
          width: 30px;
          height: 30px;
          border-radius: 50%;
          border: 2px solid var(--black);
          object-fit: cover;
        }

        .self-avatar-placeholder-box {
          width: 30px;
          height: 30px;
          border-radius: 50%;
          border: 2px solid var(--black);
          display: flex;
          justify-content: center;
          align-items: center;
          background: var(--color);
          color: var(--black);
        }

        .self-username-label {
          font-weight: 900;
          font-size: 0.875rem;
        }

        @media (max-width: 600px) {
          .self-username-label {
            display: none;
          }
          .self-profile-card {
            padding: 0.4rem;
          }
          .header-self-profile {
            gap: 0.5rem;
          }
          .dashboard-top-header {
            padding: 0 0.75rem;
          }
        }

        .header-controls {
          display: flex;
          gap: 0.5rem;
        }

        .control-btn {
          background-color: var(--white);
          color: var(--black);
          border: 3px solid var(--black);
          padding: 0.5rem;
          border-radius: var(--border-radius);
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 3px 3px 0px var(--color);
          transition: transform 0.1s ease, box-shadow 0.1s ease;
        }

        .control-btn:hover {
          transform: translate(2px, 2px);
          box-shadow: 2px 2px 0px var(--black);
        }

        .control-btn:active {
          transform: translate(4px, 4px);
          box-shadow: none;
        }

        /* 3-Column Layout Container */
        .dashboard-grid-container {
          display: flex;
          flex-direction: row;
          height: calc(100vh - var(--header-height));
          width: 100vw;
          background-color: var(--color);
          padding: 1.5rem;
          gap: 1.5rem;
          box-sizing: border-box;
          overflow: hidden;
        }

        /* COLUMN 1: CONTROLS DESK */
        .controls-column {
          width: 240px;
          display: flex;
          flex-direction: column;
          gap: 1rem;
          flex-shrink: 0;
        }

        .controls-panel-title {
          font-size: 0.875rem;
          font-weight: 900;
          color: var(--black);
          letter-spacing: 0.05em;
          text-transform: uppercase;
          padding-left: 0.25rem;
        }

        .controls-nav-stack {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          background-color: var(--white);
          border: 4px solid var(--black);
          padding: 1rem;
          box-shadow: 6px 6px 0px var(--black);
          border-radius: var(--border-radius);
        }

        .control-nav-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          background: var(--white);
          border: 3px solid var(--black);
          color: var(--black);
          padding: 0.75rem 1rem;
          border-radius: var(--border-radius);
          font-weight: 900;
          font-size: 0.875rem;
          text-transform: uppercase;
          text-align: left;
          transition: transform 0.1s ease, box-shadow 0.1s ease, background-color 0.1s ease;
          box-shadow: 3px 3px 0px var(--black);
          width: 100%;
          cursor: pointer;
        }

        .control-nav-item:hover {
          transform: translate(2px, 2px);
          box-shadow: 2px 2px 0px var(--black);
        }

        .control-nav-item:active {
          transform: translate(4px, 4px);
          box-shadow: none;
        }

        .control-nav-item.active {
          background-color: var(--black) !important;
          color: var(--white) !important;
          transform: none;
          box-shadow: none;
        }

        .badge-pill {
          background-color: var(--color);
          color: var(--black);
          border: 2px solid var(--black);
          font-size: 0.7rem;
          font-weight: 900;
          border-radius: 10px;
          padding: 1px 6px;
          margin-left: auto;
        }

        .control-nav-item.active .badge-pill {
          background-color: var(--white);
          color: var(--black);
          border: 2px solid var(--black);
        }

        .controls-status-box {
          background-color: var(--black);
          border: 4px solid var(--black);
          border-radius: var(--border-radius);
          padding: 1rem;
          box-shadow: 6px 6px 0px var(--white);
          color: var(--white);
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          margin-top: auto;
        }

        .status-indicator-row {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .status-blink-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background-color: var(--color);
          animation: blink 1.5s infinite;
        }

        @keyframes blink {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }

        .status-label-text {
          font-size: 0.75rem;
          font-weight: 900;
          font-family: monospace;
        }

        .status-subtext {
          font-size: 0.65rem;
          color: #EFEFEF;
          font-family: monospace;
          font-weight: 600;
        }

        /* COLUMN 2: DIRECTORY / LISTS */
        .directory-column {
          width: 360px;
          display: flex;
          flex-direction: column;
          background-color: var(--white);
          border: 4px solid var(--black);
          border-radius: var(--border-radius);
          box-shadow: 6px 6px 0px var(--black);
          flex-shrink: 0;
          overflow: hidden;
        }

        .directory-mobile-tabs {
          display: none;
          flex-direction: row;
          background-color: var(--white);
          border-bottom: 3px solid var(--black);
          width: 100%;
          box-sizing: border-box;
        }

        .mobile-tab-btn {
          flex: 1;
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 0.5rem;
          padding: 0.85rem 0.5rem;
          background-color: var(--white);
          border: none;
          border-right: 3px solid var(--black);
          color: var(--black);
          font-weight: 900;
          font-size: 0.875rem;
          text-transform: uppercase;
          cursor: pointer;
          transition: background-color 0.1s ease, color 0.1s ease;
        }

        .mobile-tab-btn:last-child {
          border-right: none;
        }

        .mobile-tab-btn:hover {
          background-color: var(--color);
        }

        .mobile-tab-btn.active {
          background-color: var(--black);
          color: var(--white);
        }

        .directory-search-wrapper {
          padding: 1rem;
          border-bottom: 3px solid var(--black);
          background: var(--white);
        }

        .search-box-brutalist {
          position: relative;
          display: flex;
          align-items: center;
        }

        .search-icon-brutalist {
          position: absolute;
          left: 12px;
          color: var(--black);
          pointer-events: none;
          z-index: 2;
          transition: transform 0.1s ease;
        }

        .search-box-brutalist input {
          padding-left: 2.5rem !important;
          border: 3px solid var(--black) !important;
          border-radius: var(--border-radius) !important;
          height: 44px;
          font-weight: 700;
          box-shadow: 2px 2px 0px var(--black) !important;
          transition: transform 0.1s ease, box-shadow 0.1s ease;
        }

        .search-box-brutalist input:focus {
          background-color: var(--color);
          transform: translate(-1px, -1px);
          box-shadow: 3px 3px 0px var(--black) !important;
        }

        .search-box-brutalist input:focus ~ .search-icon-brutalist {
          transform: translate(-1px, -1px);
        }

        .directory-list-wrapper {
          flex: 1;
          overflow-y: auto;
          background-color: var(--white);
        }

        .list-section-title {
          font-size: 0.75rem;
          font-weight: 900;
          color: var(--black);
          padding: 0.75rem 1.25rem 0.5rem 1.25rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          border-bottom: 3px solid var(--black);
          margin-bottom: 0.25rem;
        }

        .empty-results-notice {
          padding: 2rem 1.25rem;
          text-align: center;
          font-size: 0.875rem;
          color: var(--text-muted);
          font-weight: 600;
        }

        /* Lists & items */
        .contact-list-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.85rem 1.25rem;
          cursor: pointer;
          border-bottom: 3px solid var(--black);
          transition: background-color 0.1s ease;
        }

        .contact-list-item:hover {
          background-color: var(--color);
        }

        .contact-avatar, .contact-avatar-placeholder {
          width: 42px;
          height: 42px;
          border-radius: 50%;
          border: 3px solid var(--black);
          background-color: var(--white);
          display: flex;
          justify-content: center;
          align-items: center;
          font-weight: 900;
          font-size: 1rem;
          color: var(--black);
          box-shadow: 2px 2px 0px var(--black);
          flex-shrink: 0;
        }

        .contact-avatar {
          object-fit: cover;
        }

        .contact-details {
          display: flex;
          flex-direction: column;
          overflow: hidden;
          flex: 1;
        }

        .contact-username {
          font-weight: 900;
          font-size: var(--text-sm);
        }

        .contact-bio {
          font-size: var(--text-xs);
          color: var(--text-muted);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          font-weight: 600;
        }

        .contact-actions {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        /* Tab items style updates */
        .action-btn-friend {
          background-color: var(--color);
          color: var(--black);
          border: 3px solid var(--black);
          padding: 0.4rem 0.8rem;
          border-radius: var(--border-radius);
          font-size: var(--text-xs);
          font-weight: 900;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 0.25rem;
          box-shadow: 2px 2px 0px var(--black);
          transition: transform 0.1s ease, box-shadow 0.1s ease;
          text-transform: uppercase;
        }

        .action-btn-friend:hover {
          transform: translate(2px, 2px);
          box-shadow: 1px 1px 0px var(--black);
        }

        .action-btn-friend:active {
          transform: translate(3px, 3px);
          box-shadow: none;
        }

        .action-btn-friend:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
          box-shadow: none;
        }

        .action-btn-friend.chat-btn {
          background-color: var(--white);
        }

        .action-btn-friend.chat-btn:hover {
          background-color: var(--color);
        }

        .action-btn-friend.pending-btn {
          background-color: var(--black);
          color: var(--white);
          cursor: not-allowed;
          box-shadow: none;
        }

        .action-btn-friend.accept-btn {
          background-color: var(--color);
        }

        .action-btn-friend.reject-btn {
          background-color: var(--black);
          color: var(--white);
        }

        .blocked-list-item, .request-list-item, .friend-list-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.85rem 1.25rem;
          border-bottom: 3px solid var(--black);
        }

        .blocked-item-left, .request-item-left, .friend-item-left {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          max-width: 65%;
        }

        .blocked-item-username, .request-username, .friend-username {
          font-weight: 900;
          font-size: var(--text-sm);
        }

        .request-details, .friend-details {
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .request-bio, .friend-bio {
          font-size: var(--text-xs);
          color: var(--text-muted);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          font-weight: 600;
        }

        .btn-unblock {
          background-color: var(--white);
          border: 2px solid var(--black);
          padding: 0.4rem 0.8rem;
          border-radius: var(--border-radius);
          font-size: var(--text-xs);
          font-weight: 900;
          box-shadow: 2px 2px 0px var(--black);
          transition: transform 0.1s ease, box-shadow 0.1s ease;
          text-transform: uppercase;
          cursor: pointer;
        }

        .btn-unblock:hover {
          transform: translate(2px, 2px);
          box-shadow: 1px 1px 0px var(--black);
        }

        .request-item-actions {
          display: flex;
          gap: 0.4rem;
          flex-shrink: 0;
        }

        .request-action-btn {
          border: 3px solid var(--black);
          width: 32px;
          height: 32px;
          display: flex;
          justify-content: center;
          align-items: center;
          border-radius: var(--border-radius);
          cursor: pointer;
          transition: transform 0.1s ease, box-shadow 0.1s ease;
          box-shadow: 2px 2px 0px var(--black);
        }

        .request-action-btn.accept {
          background-color: var(--color);
          color: var(--black);
        }

        .request-action-btn.reject {
          background-color: var(--black);
          color: var(--white);
        }

        .request-action-btn:hover {
          transform: translate(2px, 2px);
          box-shadow: 1px 1px 0px var(--black);
        }

        /* Active Chats List */
        .conv-list-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.85rem 1.25rem;
          cursor: pointer;
          border-bottom: 3px solid var(--black);
          transition: background-color 0.1s ease;
        }

        .conv-list-item:hover {
          background-color: var(--color);
        }

        .conv-list-item.active {
          background-color: var(--color) !important;
        }

        .conv-avatar-container {
          position: relative;
        }

        .online-dot-sidebar {
          position: absolute;
          bottom: 0;
          right: 0;
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background-color: var(--color);
          border: 2.5px solid var(--black);
          box-shadow: 0 0 0 1.5px var(--white);
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
          font-weight: 900;
          font-size: var(--text-sm);
          color: var(--black);
        }

        .conv-time {
          font-size: 0.75rem;
          color: var(--black);
          font-weight: 900;
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
          font-weight: 600;
        }

        /* COLUMN 3: COMMUNICATION NODE */
        .chat-column {
          flex: 1;
          display: flex;
          flex-direction: column;
          background-color: var(--white);
          border: 4px solid var(--black);
          border-radius: var(--border-radius);
          box-shadow: 6px 6px 0px var(--black);
          overflow: hidden;
        }

        /* Welcome screen */
        .welcome-screen {
          margin: auto;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          max-width: 440px;
          padding: 2rem;
          color: var(--black);
        }

        .welcome-icon {
          color: var(--black);
          margin-bottom: 1.5rem;
          animation: float 3s ease-in-out infinite;
        }

        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }

        .welcome-title {
          font-size: 1.75rem;
          font-weight: 900;
          margin-bottom: 0.75rem;
          color: var(--black);
          text-transform: uppercase;
        }

        .welcome-subtitle {
          font-size: var(--text-sm);
          color: var(--text-muted);
          line-height: 1.5;
          font-weight: 600;
        }

         /* Responsive Mobile Layouts */
        @media (max-width: 1024px) {
          .controls-pane {
            display: none !important;
          }

          .directory-mobile-tabs {
            display: flex !important;
          }

          .dashboard-grid-container {
            padding: 1rem;
            gap: 0;
          }

          .directory-pane {
            width: 100% !important;
            box-shadow: none !important;
          }

          .chat-pane {
            width: 100% !important;
            box-shadow: none !important;
          }

          .mobile-hidden {
            display: none !important;
          }
        }

        .requests-dropdown-wrapper {
          position: relative;
        }

        .requests-dropdown-menu {
          position: absolute;
          top: calc(100% + 15px);
          right: 0;
          width: 380px;
          max-width: calc(100vw - 2rem);
          background-color: var(--white);
          border: 4px solid var(--black);
          border-radius: var(--border-radius);
          box-shadow: var(--shadow-md);
          z-index: 1000;
          animation: slideDown 0.15s ease-out;
          display: flex;
          flex-direction: column;
          max-height: 400px;
          overflow: hidden;
          color: var(--black) !important;
        }

        .request-item-left {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          color: var(--black);
          min-width: 0;
        }

        .request-details {
          display: flex;
          flex-direction: column;
          text-align: left;
          min-width: 0;
        }

        .request-username {
          font-weight: 900;
          color: var(--black);
          font-size: var(--text-sm);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .request-bio {
          font-size: var(--text-xs);
          color: var(--gray-dark);
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .empty-requests-notice {
          padding: 2.5rem 1.5rem;
          color: var(--black);
          font-weight: 900;
          text-align: center;
          text-transform: uppercase;
          font-size: var(--text-sm);
        }

        @keyframes slideDown {
          from { transform: translateY(-5px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }

        .requests-dropdown-header {
          background-color: var(--black);
          color: var(--white);
          font-size: 0.75rem;
          font-weight: 900;
          padding: 0.75rem 1.25rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          border-bottom: 3px solid var(--black);
          text-align: left;
        }

        .requests-dropdown-body {
          overflow-y: auto;
          max-height: 330px;
        }

        .request-dropdown-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.85rem 1.25rem;
          border-bottom: 3px solid var(--black);
          gap: 0.75rem;
        }

        .request-dropdown-item:last-child {
          border-bottom: none;
        }

        .requests-badge {
          position: absolute;
          top: -5px;
          right: -5px;
          background-color: var(--color);
          color: var(--black);
          border: 2px solid var(--black);
          font-size: 0.65rem;
          font-weight: 900;
          border-radius: 50%;
          width: 18px;
          height: 18px;
          display: flex;
          justify-content: center;
          align-items: center;
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
