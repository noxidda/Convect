import { Server } from 'socket.io';
import User from './models/User.js';
import Message from './models/Message.js';

let io = null;
const userSockets = new Map(); // mongouserid (string) ->

function decodeClerkToken(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payloadJson = Buffer.from(parts[1], 'base64').toString('utf-8');
    const payload = JSON.parse(payloadJson);
    return payload; // contains 'sub' which
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

    // fallback: check if
    if (!clerkId) {
      clerkId = socket.handshake.query?.clerkId;
    }

    if (!clerkId) {
      console.log('Socket connection rejected: No authentication details found.');
      socket.disconnect();
      return;
    }

    try {
      // find the user
      const user = await User.findOne({ clerkId });
      if (!user) {
        console.log(`Socket connection rejected: User with clerkId ${clerkId} not found in DB.`);
        socket.disconnect();
        return;
      }

      const mongoUserId = user._id.toString();
      socket.userId = mongoUserId;
      socket.username = user.username || 'Anonymous';

      // store socket connection
      if (!userSockets.has(mongoUserId)) {
        userSockets.set(mongoUserId, new Set());
      }
      userSockets.get(mongoUserId).add(socket.id);

      console.log(`User connected: ${socket.username} (${mongoUserId}) - socket: ${socket.id}`);

      // emit status updates:
      io.emit('user_status', {
        userId: mongoUserId,
        status: 'online',
      });

      // join standard rooms
      socket.on('join_room', (chatId) => {
        socket.join(chatId);
        console.log(`Socket ${socket.id} joined chat: ${chatId}`);
      });

      socket.on('leave_room', (chatId) => {
        socket.leave(chatId);
        console.log(`Socket ${socket.id} left chat: ${chatId}`);
      });

      // mark messages as read
      socket.on('mark_read', async ({ chatId }) => {
        try {
          await Message.updateMany(
            { conversationId: chatId, sender: { $ne: socket.userId }, isRead: false },
            { $set: { isRead: true } }
          );
          io.to(chatId).emit('messages_read', {
            conversationId: chatId,
            readerId: socket.userId
          });
        } catch (err) {
          console.error('Error marking messages as read:', err);
        }
      });

      // typing indicators
      socket.on('typing', ({ chatId, isTyping }) => {
        // send typing indicator
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
            // broadcast user is
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

// send real-time event
export const sendToUser = (mongoUserId, event, data) => {
  if (!io) return;
  const sockets = userSockets.get(mongoUserId.toString());
  if (sockets) {
    for (const socketId of sockets) {
      io.to(socketId).emit(event, data);
    }
  }
};

// send real-time event
export const sendToRoom = (chatId, event, data) => {
  if (!io) return;
  io.to(chatId).emit(event, data);
};

// check if a
export const isUserOnline = (mongoUserId) => {
  return userSockets.has(mongoUserId.toString());
};
