import express from 'express';
import User from '../models/User.js';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import FriendRequest from '../models/FriendRequest.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// 1. Sync User (Create profile if it doesn't exist)
router.post('/sync', requireAuth, async (req, res) => {
  const clerkId = req.auth.userId;
  const { username, bio, profilePhoto } = req.body;

  try {
    let user = await User.findOne({ clerkId });
    if (!user) {
      // Check if username is already taken (if provided)
      let finalUsername = username;
      if (username) {
        const existingUser = await User.findOne({ username: { $regex: new RegExp(`^${username}$`, 'i') } });
        if (existingUser) {
          // If username is taken, generate a random suffix
          finalUsername = `${username}_${Math.floor(1000 + Math.random() * 9000)}`;
        }
      }

      user = new User({
        clerkId,
        username: finalUsername || null, // Allow null initially, will set in onboarding
        bio: bio || 'Hey there! I am using this chat app.',
        profilePhoto: profilePhoto || '',
      });
      await user.save();
      console.log(`Created new MongoDB profile for clerkId: ${clerkId}`);
    }

    res.status(200).json(user);
  } catch (error) {
    console.error('Error syncing user:', error);
    res.status(500).json({ error: 'Server error during user sync' });
  }
});

// 2. Get User Profile (Self)
router.get('/profile', requireAuth, async (req, res) => {
  try {
    const user = await User.findOne({ clerkId: req.auth.userId });
    if (!user) {
      return res.status(404).json({ error: 'User profile not found' });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// 3. Update User Profile (Self)
router.put('/profile', requireAuth, async (req, res) => {
  const { username, bio, profilePhoto } = req.body;
  const clerkId = req.auth.userId;

  try {
    const user = await User.findOne({ clerkId });
    if (!user) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    if (username) {
      const cleanUsername = username.trim();
      if (cleanUsername.length < 3 || cleanUsername.length > 30) {
        return res.status(400).json({ error: 'Username must be between 3 and 30 characters' });
      }

      // Check if username is taken by someone else
      const existingUser = await User.findOne({
        username: { $regex: new RegExp(`^${cleanUsername}$`, 'i') },
        _id: { $ne: user._id }
      });
      if (existingUser) {
        return res.status(400).json({ error: 'Username is already taken' });
      }
      user.username = cleanUsername;
    }

    if (bio !== undefined) {
      user.bio = bio;
    }

    if (profilePhoto !== undefined) {
      user.profilePhoto = profilePhoto;
    }

    await user.save();
    res.json(user);
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// 4. Search Usernames
router.get('/search', requireAuth, async (req, res) => {
  const { q } = req.query;
  try {
    const currentUser = await User.findOne({ clerkId: req.auth.userId });
    if (!currentUser) {
      return res.status(404).json({ error: 'Current user not found' });
    }

    if (!q || q.trim() === '') {
      return res.json([]);
    }

    // Find users whose username matches query, excluding self and blocked/blocking users
    const users = await User.find({
      username: { $regex: q.trim(), $options: 'i' },
      _id: { 
        $ne: currentUser._id,
        $nin: currentUser.blockedUsers 
      },
      blockedUsers: { $ne: currentUser._id } // Also exclude users who blocked current user
    })
    .select('_id username bio profilePhoto')
    .limit(10);

    // Map relationships
    const usersWithRelationships = await Promise.all(
      users.map(async (u) => {
        let relationship = 'none';
        let requestId = null;

        if (currentUser.friends.includes(u._id)) {
          relationship = 'friend';
        } else {
          // Check for pending request sent by me
          const pendingSent = await FriendRequest.findOne({
            sender: currentUser._id,
            recipient: u._id,
            status: 'pending',
          });

          if (pendingSent) {
            relationship = 'sent_pending';
            requestId = pendingSent._id;
          } else {
            // Check for pending request received by me
            const pendingRecv = await FriendRequest.findOne({
              sender: u._id,
              recipient: currentUser._id,
              status: 'pending',
            });

            if (pendingRecv) {
              relationship = 'received_pending';
              requestId = pendingRecv._id;
            }
          }
        }

        return {
          ...u.toObject(),
          relationship,
          requestId,
        };
      })
    );

    res.json(usersWithRelationships);
  } catch (error) {
    console.error('Error searching users:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// 5. Block User
router.post('/block', requireAuth, async (req, res) => {
  const { targetUserId } = req.body;
  try {
    const currentUser = await User.findOne({ clerkId: req.auth.userId });
    if (!currentUser) return res.status(404).json({ error: 'User not found' });

    if (currentUser._id.toString() === targetUserId) {
      return res.status(400).json({ error: 'You cannot block yourself' });
    }

    if (!currentUser.blockedUsers.includes(targetUserId)) {
      currentUser.blockedUsers.push(targetUserId);
      await currentUser.save();
    }

    res.json({ message: 'User blocked successfully', blockedUsers: currentUser.blockedUsers });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// 6. Unblock User
router.post('/unblock', requireAuth, async (req, res) => {
  const { targetUserId } = req.body;
  try {
    const currentUser = await User.findOne({ clerkId: req.auth.userId });
    if (!currentUser) return res.status(404).json({ error: 'User not found' });

    currentUser.blockedUsers = currentUser.blockedUsers.filter(
      (id) => id.toString() !== targetUserId
    );
    await currentUser.save();

    res.json({ message: 'User unblocked successfully', blockedUsers: currentUser.blockedUsers });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// 7. Restrict User
router.post('/restrict', requireAuth, async (req, res) => {
  const { targetUserId } = req.body;
  try {
    const currentUser = await User.findOne({ clerkId: req.auth.userId });
    if (!currentUser) return res.status(404).json({ error: 'User not found' });

    if (currentUser._id.toString() === targetUserId) {
      return res.status(400).json({ error: 'You cannot restrict yourself' });
    }

    if (!currentUser.restrictedUsers.includes(targetUserId)) {
      currentUser.restrictedUsers.push(targetUserId);
      await currentUser.save();
    }

    res.json({ message: 'User restricted successfully', restrictedUsers: currentUser.restrictedUsers });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// 8. Unrestrict User
router.post('/unrestrict', requireAuth, async (req, res) => {
  const { targetUserId } = req.body;
  try {
    const currentUser = await User.findOne({ clerkId: req.auth.userId });
    if (!currentUser) return res.status(404).json({ error: 'User not found' });

    currentUser.restrictedUsers = currentUser.restrictedUsers.filter(
      (id) => id.toString() !== targetUserId
    );
    await currentUser.save();

    res.json({ message: 'User unrestricted successfully', restrictedUsers: currentUser.restrictedUsers });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// 9. Delete Account
router.delete('/account', requireAuth, async (req, res) => {
  const clerkId = req.auth.userId;

  try {
    const user = await User.findOne({ clerkId });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const mongoUserId = user._id;

    // Delete user from other users' blocked and restricted lists
    await User.updateMany(
      {},
      {
        $pull: {
          blockedUsers: mongoUserId,
          restrictedUsers: mongoUserId
        }
      }
    );

    // Delete messages sent by user (or soft delete, but full delete is cleaner for account deletion)
    await Message.deleteMany({ sender: mongoUserId });

    // Find and delete conversations user participated in
    // To be clean, we delete the conversations entirely if they are direct chats
    await Conversation.deleteMany({ participants: mongoUserId });

    // Delete User model
    await User.deleteOne({ _id: mongoUserId });

    // Call Clerk API to delete user if secret key is present
    if (process.env.CLERK_SECRET_KEY) {
      try {
        const { clerkClient } = await import('@clerk/express');
        await clerkClient.users.deleteUser(clerkId);
        console.log(`Deleted user ${clerkId} from Clerk`);
      } catch (clerkErr) {
        console.error('Error deleting user from Clerk (Admin API):', clerkErr);
      }
    }

    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Error deleting account:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
