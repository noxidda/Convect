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
  const [onlineUsers, setOnlineUsers] = useState(new Map()); // userid -> 'online'
  const [typingUsers, setTypingUsers] = useState({}); // chatid -> {
  const socketRef = useRef(null);

  useEffect(() => {
    if (!isLoaded) return;

    const establishConnection = async () => {
      if (isSignedIn && user) {
        // disconnect old socket
        if (socketRef.current) {
          socketRef.current.disconnect();
        }

        let token = null;
        try {
          // retrieve clerk session
          token = await getToken();
        } catch (err) {
          console.error('Error fetching Clerk token:', err);
        }

        // establish connection to
        // we pass the
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

        // listen for user
        newSocket.on('user_status', ({ userId, status }) => {
          setOnlineUsers((prev) => {
            const next = new Map(prev);
            next.set(userId, status);
            return next;
          });
        });

        // listen for typing
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

        // listen for local
        newSocket.on('message_deleted_for_me', ({ conversationId, messageId }) => {
          // custom dispatch to
          // or components can
          const event = new CustomEvent('local_message_deleted', { detail: { conversationId, messageId } });
          window.dispatchEvent(event);
        });

      } else {
        // logged out, clean
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

  // utility to emit
  const emitTyping = (chatId, isTyping) => {
    if (socketRef.current && connected) {
      socketRef.current.emit('typing', { chatId, isTyping });
    }
  };

  // utility to join
  const joinChat = (chatId) => {
    if (socketRef.current && connected) {
      socketRef.current.emit('join_room', chatId);
    }
  };

  // utility to leave
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
