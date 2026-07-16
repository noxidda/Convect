import express from 'express';
import http from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { initSocket } from './socket.js';
import userRoutes from './routes/users.js';
import conversationRoutes from './routes/conversations.js';
import friendRoutes from './routes/friends.js';

// load environment variables
dotenv.config();

const app = express();
const server = http.createServer(app);

// express middleware
app.use(cors({
  origin: '*', // in production, replace
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-clerk-user-id']
}));

// Clerk webhooks endpoint (handles user deletions from Clerk dashboard)
// registered before express.json() to retrieve the raw request body required for standard Webhook signature verification
app.post('/api/users/webhooks', express.raw({ type: 'application/json' }), async (req, res) => {
  const payloadString = req.body.toString();
  const headers = req.headers;
  
  let evt;
  if (process.env.CLERK_WEBHOOK_SECRET) {
    try {
      const { Webhook } = await import('standardwebhooks');
      const wh = new Webhook(process.env.CLERK_WEBHOOK_SECRET);
      evt = wh.verify(payloadString, headers);
    } catch (err) {
      console.error('Webhook verification failed:', err.message);
      return res.status(400).json({ error: 'Webhook verification failed' });
    }
  } else {
    console.warn('CLERK_WEBHOOK_SECRET is not set. Processing webhook without verification.');
    try {
      evt = JSON.parse(payloadString);
    } catch (err) {
      return res.status(400).json({ error: 'Invalid JSON payload' });
    }
  }

  // Process the event
  const eventType = evt.type;
  if (eventType === 'user.deleted') {
    const clerkId = evt.data.id;
    console.log(`Received user.deleted webhook from Clerk for clerkId: ${clerkId}`);
    try {
      const { deleteUserAllData } = await import('./routes/users.js');
      await deleteUserAllData(clerkId);
      return res.json({ success: true, message: `Successfully deleted user ${clerkId}` });
    } catch (err) {
      console.error(`Failed to delete user data for clerkId ${clerkId}:`, err);
      return res.status(500).json({ error: 'Failed to delete user data' });
    }
  }

  res.json({ received: true });
});

app.use(express.json({ limit: '10mb' })); // support base64 profile
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// health check api
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', time: new Date() });
});

// mount routes
app.use('/api/users', userRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/friends', friendRoutes);

// global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

// initialize websockets
initSocket(server);

// database connection
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/chatapp';

mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log('MongoDB connected successfully.');
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });
