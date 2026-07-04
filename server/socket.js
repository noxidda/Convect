import { Server } from 'socket.io';
import User from './models/User.js';

let io = null;
const userSockets = new Map(); // mongoUserId (string) -> Set of socketIds (to support multiple tabs)

function decodeClerkToken(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payloadJson = Buffer.from(parts[1], 'base64').toString('utf-8');
    const payload = JSON.parse(payloadJson);
    return payload; // contains 'sub' which is Clerk's userId
  } catch (err) {
    console.error('Error decoding Clerk JWT:', err);
    return null;
  }
}

export const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', async (socket) => {
    let clerkId = null;
    let token = socket.handshake.auth?.token || socket.handshake.query?.token;

    if (token) {
      const decoded = decodeClerkToken(token);
      clerkId = decoded?.sub;
    }

    // Fallback: check if clerkId was passed directly in query (useful for dev/testing)
    if (!clerkId) {
      clerkId = socket.handshake.query?.clerkId;
    }

    if (!clerkId) {
      console.log('Socket connection rejected: No authentication details found.');
      socket.disconnect();
      return;
    }

    try {
      // Find the user in MongoDB
      const user = await User.findOne({ clerkId });
      if (!user) {
        console.log(`Socket connection rejected: User with clerkId ${clerkId} not found in DB.`);
        socket.disconnect();
        return;
      }

      const mongoUserId = user._id.toString();
      socket.userId = mongoUserId;
      socket.username = user.username || 'Anonymous';

      // Store socket connection
      if (!userSockets.has(mongoUserId)) {
        userSockets.set(mongoUserId, new Set());
      }
      userSockets.get(mongoUserId).add(socket.id);

      console.log(`User connected: ${socket.username} (${mongoUserId}) - socket: ${socket.id}`);

      // Emit status updates: User is online
      io.emit('user_status', {
        userId: mongoUserId,
        status: 'online',
      });

      // Join standard rooms
      socket.on('join_room', (chatId) => {
        socket.join(chatId);
        console.log(`Socket ${socket.id} joined chat: ${chatId}`);
      });

      socket.on('leave_room', (chatId) => {
        socket.leave(chatId);
        console.log(`Socket ${socket.id} left chat: ${chatId}`);
      });

      // Typing indicators
      socket.on('typing', ({ chatId, isTyping }) => {
        // Send typing indicator to others in the room
        socket.to(chatId).emit('typing_status', {
          chatId,
          userId: mongoUserId,
          isTyping,
        });
      });

      socket.on('disconnect', () => {
        const sockets = userSockets.get(mongoUserId);
        if (sockets) {
          sockets.delete(socket.id);
          if (sockets.size === 0) {
            userSockets.delete(mongoUserId);
            // Broadcast user is offline
            io.emit('user_status', {
              userId: mongoUserId,
              status: 'offline',
            });
            console.log(`User offline: ${socket.username} (${mongoUserId})`);
          }
        }
      });

    } catch (error) {
      console.error('Socket authentication error:', error);
      socket.disconnect();
    }
  });

  return io;
};

// Send real-time event to specific user (across all open sockets/tabs)
export const sendToUser = (mongoUserId, event, data) => {
  if (!io) return;
  const sockets = userSockets.get(mongoUserId.toString());
  if (sockets) {
    for (const socketId of sockets) {
      io.to(socketId).emit(event, data);
    }
  }
};

// Send real-time event to everyone in a chat room
export const sendToRoom = (chatId, event, data) => {
  if (!io) return;
  io.to(chatId).emit(event, data);
};

// Check if a user is online
export const isUserOnline = (mongoUserId) => {
  return userSockets.has(mongoUserId.toString());
};
