# Real-time MERN Chat Application with Clerk Authentication

A clean, modern, and high-performance real-time chat application inspired by WhatsApp. Built with MongoDB, Express, React, Node.js, Socket.io, and Clerk.

## Features

- **WhatsApp-style Dashboard**: Responsive split-pane layout with search, conversation listings, and dedicated tabs.
- **Real-time Messaging**: Instant message delivery and receipt via Socket.io.
- **Typing Indicators**: Displays "typing..." in real-time under a user's name in the active chat and conversation lists.
- **Block & Restrict**:
  - **Block**: Prevent users from searching, checking online statuses, or exchanging messages.
  - **Restrict**: Silence notification sounds and isolate messages into a "Restricted Chats" tab.
- **Edit & Delete Messages**: Edit message text dynamically or choose between "Delete for Me" / "Delete for Everyone" (for messages sent by you).
- **Profile Management**: Update your bio, choose unique usernames, and select/upload profile pictures.
- **Account Deletion**: Safely delete all your messages, conversation records, and corresponding Clerk user profiles inside a single action.
- **Theme Modes**: Instantly toggle between Light mode (Lemon yellow, Light green, Green backgrounds with Black text) and Dark mode (Wheat text, Dark green, Black backgrounds).
- **Strict Visual Design Guidelines**: Sharp borders (8px radius), Lucide icon representations (no emojis), and clean hover effects with no element translations.

## Prerequisites

- **Node.js** (v18.0.0 or higher recommended)
- **MongoDB** (Running local instance or MongoDB Atlas connection string)
- **Clerk Account** (For user authentication credentials)

## Getting Started

### 1. Backend Setup

1. Open a terminal and navigate to the `server/` directory:
   ```bash
   cd server
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Open the `.env` file and configure your credentials:
   ```env
   PORT=5000
   MONGODB_URI=mongodb://localhost:27017/chatapp
   CLERK_PUBLISHABLE_KEY=pk_test_...
   CLERK_SECRET_KEY=sk_test_...
   ```
4. Start the server in development mode:
   ```bash
   npm run dev
   ```

### 2. Frontend Setup

1. Open a new terminal and navigate to the `client/` directory:
   ```bash
   cd client
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Open the `.env` file and configure your Clerk Publishable Key:
   ```env
   VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
   ```
4. Start the Vite React development server:
   ```bash
   npm run dev
   ```
5. Open your browser and navigate to `http://localhost:3000`.

---

## Development Authentication Fallback

To make this application instantly testable and previewable **without inputting Clerk Keys initially**, the backend includes a development fallback mechanism.

- If `CLERK_SECRET_KEY` is not defined in the backend `.env`, the authentication middleware will decode the incoming Bearer JWT claims (without cryptographic signature validation) to identify the user, or read the user ID from the custom `x-clerk-user-id` header sent by the client.
- This allows you to inspect layouts, color themes, real-time message sockets, and profiles before completing your Clerk dashboard setup.
