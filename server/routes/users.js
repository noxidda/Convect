import express from 'express';
import User from '../models/User.js';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import FriendRequest from '../models/FriendRequest.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// 1. sync user
router.post('/sync', requireAuth, async (req, res) => {
  const clerkId = req.auth.userId;
  const { username, bio, profilePhoto } = req.body;

  try {
    let user = await User.findOne({ clerkId })
      .populate('blockedUsers', '_id username profilePhoto bio')
      .populate('restrictedUsers', '_id username profilePhoto bio');
    if (!user) {
      // check if username
      let finalUsername = username;
      if (username) {
        const existingUser = await User.findOne({ username: { $regex: new RegExp(`^${username}$`, 'i') } });
        if (existingUser) {
          // if username is
          finalUsername = `${username}_${Math.floor(1000 + Math.random() * 9000)}`;
        }
      }

      const newUser = new User({
        clerkId,
        username: finalUsername || null, // allow null initially,
        bio: bio || 'Hey there! I am using this chat app.',
        profilePhoto: profilePhoto || '',
      });
      await newUser.save();

      user = await User.findById(newUser._id)
        .populate('blockedUsers', '_id username profilePhoto bio')
        .populate('restrictedUsers', '_id username profilePhoto bio');
      console.log(`Created new MongoDB profile for clerkId: ${clerkId}`);
    }

    res.status(200).json(user);
  } catch (error) {
    console.error('Error syncing user:', error);
    res.status(500).json({ error: 'Server error during user sync' });
  }
});

// 2. get user
router.get('/profile', requireAuth, async (req, res) => {
  try {
    const user = await User.findOne({ clerkId: req.auth.userId })
      .populate('blockedUsers', '_id username profilePhoto bio')
      .populate('restrictedUsers', '_id username profilePhoto bio');
    if (!user) {
      return res.status(404).json({ error: 'User profile not found' });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// 3. update user
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
      if (cleanUsername !== user.username) {
        if (cleanUsername.length < 3 || cleanUsername.length > 30) {
          return res.status(400).json({ error: 'Username must be between 3 and 30 characters' });
        }

        // check if username is already taken
        const existingUser = await User.findOne({
          username: { $regex: new RegExp(`^${cleanUsername}$`, 'i') },
          _id: { $ne: user._id }
        });
        if (existingUser) {
          return res.status(400).json({ error: 'Username is already taken' });
        }

        // limit username changes to twice a month (rolling 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const recentChanges = (user.usernameChanges || []).filter(d => new Date(d) >= thirtyDaysAgo);
        if (recentChanges.length >= 2) {
          return res.status(400).json({ error: 'You can only change your username twice a month.' });
        }

        user.username = cleanUsername;
        user.usernameChanges = [...recentChanges, new Date()];
      }
    }

    if (bio !== undefined) {
      user.bio = bio;
    }

    if (profilePhoto !== undefined) {
      user.profilePhoto = profilePhoto;
    }

    await user.save();

    const populatedUser = await User.findById(user._id)
      .populate('blockedUsers', '_id username profilePhoto bio')
      .populate('restrictedUsers', '_id username profilePhoto bio');
    res.json(populatedUser);
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// 4. search usernames
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

    // find users whose
    const users = await User.find({
      username: { $regex: q.trim(), $options: 'i' },
      _id: { 
        $ne: currentUser._id,
        $nin: currentUser.blockedUsers 
      },
      blockedUsers: { $ne: currentUser._id } // also exclude users
    })
    .select('_id username bio profilePhoto')
    .limit(10);

    // map relationships
    const usersWithRelationships = await Promise.all(
      users.map(async (u) => {
        let relationship = 'none';
        let requestId = null;

        if (currentUser.friends.includes(u._id)) {
          relationship = 'friend';
        } else {
          // check for pending
          const pendingSent = await FriendRequest.findOne({
            sender: currentUser._id,
            recipient: u._id,
            status: 'pending',
          });

          if (pendingSent) {
            relationship = 'sent_pending';
            requestId = pendingSent._id;
          } else {
            // check for pending
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

// 5. block user
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

// 6. unblock user
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

// 7. restrict user
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

// 8. unrestrict user
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

// Helper function to delete all data related to a user
export const deleteUserAllData = async (clerkId) => {
  const user = await User.findOne({ clerkId });
  if (!user) {
    console.log(`deleteUserAllData: User with Clerk ID ${clerkId} not found in database.`);
    return;
  }

  const mongoUserId = user._id;

  // 1. Remove references to this user from blockedUsers, restrictedUsers, and friends arrays of other users
  await User.updateMany(
    {},
    {
      $pull: {
        blockedUsers: mongoUserId,
        restrictedUsers: mongoUserId,
        friends: mongoUserId
      }
    }
  );

  // 2. Find all conversations where this user is a participant
  const conversations = await Conversation.find({ participants: mongoUserId });
  const conversationIds = conversations.map(c => c._id);

  // 3. Delete all messages inside those conversations
  if (conversationIds.length > 0) {
    await Message.deleteMany({ conversationId: { $in: conversationIds } });
  }

  // 4. Delete the conversations themselves
  await Conversation.deleteMany({ _id: { $in: conversationIds } });

  // 5. Delete all friend requests sent by or sent to this user
  await FriendRequest.deleteMany({
    $or: [{ sender: mongoUserId }, { recipient: mongoUserId }]
  });

  // 6. Finally, delete the User document
  await User.deleteOne({ _id: mongoUserId });
  console.log(`deleteUserAllData: Successfully cleaned up all data for user ${clerkId} (Mongo ID: ${mongoUserId})`);
};

// 9. delete account
router.delete('/account', requireAuth, async (req, res) => {
  const clerkId = req.auth.userId;

  try {
    // 1. Delete all user data in MongoDB
    await deleteUserAllData(clerkId);

    // 2. Call Clerk API to delete user account on Clerk
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
