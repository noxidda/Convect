import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import { useAuth, useUser } from '@clerk/clerk-react';

const SocketContext = createContext(null);

export const useSocket = () => {
  return useContext(SocketContext);
};

export const SocketProvider = ({ children }) => {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState(new Map()); // userId -> 'online' | 'offline'
  const [typingUsers, setTypingUsers] = useState({}); // chatId -> { userId: boolean }
  const socketRef = useRef(null);

  useEffect(() => {
    if (!isLoaded) return;

    const establishConnection = async () => {
      if (isSignedIn && user) {
        // Disconnect old socket if any
        if (socketRef.current) {
          socketRef.current.disconnect();
        }

        let token = null;
        try {
          // Retrieve Clerk session token
          token = await getToken();
        } catch (err) {
          console.error('Error fetching Clerk token:', err);
        }

        // Establish connection to backend
        // We pass the token in auth and clerkId in query as fallback
        const newSocket = io(window.location.origin, {
          auth: { token },
          query: { clerkId: user.id },
          transports: ['websocket', 'polling']
        });

        socketRef.current = newSocket;
        setSocket(newSocket);

        newSocket.on('connect', () => {
          setConnected(true);
          console.log('Socket.io connected');
        });

        newSocket.on('disconnect', () => {
          setConnected(false);
          console.log('Socket.io disconnected');
        });

        // Listen for user online status updates
        newSocket.on('user_status', ({ userId, status }) => {
          setOnlineUsers((prev) => {
            const next = new Map(prev);
            next.set(userId, status);
            return next;
          });
        });

        // Listen for typing status updates
        newSocket.on('typing_status', ({ chatId, userId, isTyping }) => {
          setTypingUsers((prev) => {
            const chatTyping = prev[chatId] || {};
            return {
              ...prev,
              [chatId]: {
                ...chatTyping,
                [userId]: isTyping
              }
            };
          });
        });

        // Listen for local delete message event
        newSocket.on('message_deleted_for_me', ({ conversationId, messageId }) => {
          // Custom dispatch to window to communicate to component if needed,
          // or components can listen directly. We can trigger custom event.
          const event = new CustomEvent('local_message_deleted', { detail: { conversationId, messageId } });
          window.dispatchEvent(event);
        });

      } else {
        // Logged out, clean up
        if (socketRef.current) {
          socketRef.current.disconnect();
          socketRef.current = null;
          setSocket(null);
          setConnected(false);
        }
      }
    };

    establishConnection();

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [isSignedIn, user, isLoaded]);

  // Utility to emit typing status
  const emitTyping = (chatId, isTyping) => {
    if (socketRef.current && connected) {
      socketRef.current.emit('typing', { chatId, isTyping });
    }
  };

  // Utility to join chat room
  const joinChat = (chatId) => {
    if (socketRef.current && connected) {
      socketRef.current.emit('join_room', chatId);
    }
  };

  // Utility to leave chat room
  const leaveChat = (chatId) => {
    if (socketRef.current && connected) {
      socketRef.current.emit('leave_room', chatId);
    }
  };

  const value = {
    socket,
    connected,
    onlineUsers,
    typingUsers,
    emitTyping,
    joinChat,
    leaveChat,
    setOnlineUsers,
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
};
