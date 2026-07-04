import express from 'express';
import User from '../models/User.js';
import FriendRequest from '../models/FriendRequest.js';
import { requireAuth } from '../middleware/auth.js';
import { sendToUser } from '../socket.js';

const router = express.Router();

// Helper to check if a block exists between two users
async function isBlocked(userAId, userBId) {
  const userA = await User.findById(userAId);
  const userB = await User.findById(userBId);
  if (!userA || !userB) return false;
  return userA.blockedUsers.includes(userBId) || userB.blockedUsers.includes(userAId);
}

// 1. Send friend request
router.post('/request', requireAuth, async (req, res) => {
  const { recipientId } = req.body;

  try {
    const currentUser = await User.findOne({ clerkId: req.auth.userId });
    if (!currentUser) return res.status(404).json({ error: 'Sender not found' });
    const currentUserId = currentUser._id;

    if (currentUserId.toString() === recipientId) {
      return res.status(400).json({ error: 'You cannot send a friend request to yourself' });
    }

    const recipient = await User.findById(recipientId);
    if (!recipient) return res.status(404).json({ error: 'Recipient not found' });

    // Check if blocked relationship exists
    const blockExists = await isBlocked(currentUserId, recipientId);
    if (blockExists) {
      return res.status(403).json({ error: 'Cannot send friend request. Block relationship exists.' });
    }

    // Check if already friends
    if (currentUser.friends.includes(recipientId)) {
      return res.status(400).json({ error: 'You are already friends with this user' });
    }

    // Check if there is an existing pending request from us to them
    const existingSentRequest = await FriendRequest.findOne({
      sender: currentUserId,
      recipient: recipientId,
      status: 'pending',
    });
    if (existingSentRequest) {
      return res.status(400).json({ error: 'Friend request already sent' });
    }

    // Check if there is a pending request from them to us
    const existingRecvRequest = await FriendRequest.findOne({
      sender: recipientId,
      recipient: currentUserId,
      status: 'pending',
    });
    if (existingRecvRequest) {
      // Auto-accept request if they already sent us one
      existingRecvRequest.status = 'accepted';
      await existingRecvRequest.save();

      if (!currentUser.friends.includes(recipientId)) {
        currentUser.friends.push(recipientId);
        await currentUser.save();
      }
      if (!recipient.friends.includes(currentUserId)) {
        recipient.friends.push(currentUserId);
        await recipient.save();
      }

      // Notify recipient
      sendToUser(recipientId, 'friend_request_accepted', {
        requestId: existingRecvRequest._id,
        user: {
          _id: currentUser._id,
          username: currentUser.username,
          profilePhoto: currentUser.profilePhoto,
          bio: currentUser.bio,
        },
      });

      return res.status(200).json({ 
        message: 'They already sent you a request! Friend request accepted automatically.',
        status: 'accepted',
        friend: recipient
      });
    }

    // Create new pending friend request
    const request = new FriendRequest({
      sender: currentUserId,
      recipient: recipientId,
      status: 'pending',
    });
    await request.save();

    // Populate sender info for real-time notification
    const populatedRequest = await FriendRequest.findById(request._id)
      .populate('sender', '_id username profilePhoto bio');

    // Notify recipient in real-time
    sendToUser(recipientId, 'friend_request_received', populatedRequest);

    res.status(201).json({ message: 'Friend request sent successfully', status: 'pending', request: populatedRequest });
  } catch (error) {
    console.error('Error sending friend request:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// 2. Get pending incoming requests
router.get('/requests/pending', requireAuth, async (req, res) => {
  try {
    const currentUser = await User.findOne({ clerkId: req.auth.userId });
    if (!currentUser) return res.status(404).json({ error: 'User not found' });

    const requests = await FriendRequest.find({
      recipient: currentUser._id,
      status: 'pending',
    })
    .populate('sender', '_id username profilePhoto bio')
    .sort({ createdAt: -1 });

    res.json(requests);
  } catch (error) {
    console.error('Error fetching pending requests:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// 3. Accept friend request
router.post('/accept', requireAuth, async (req, res) => {
  const { requestId } = req.body;

  try {
    const currentUser = await User.findOne({ clerkId: req.auth.userId });
    if (!currentUser) return res.status(404).json({ error: 'User not found' });
    const currentUserId = currentUser._id;

    const request = await FriendRequest.findById(requestId);
    if (!request) return res.status(404).json({ error: 'Friend request not found' });

    if (request.recipient.toString() !== currentUserId.toString()) {
      return res.status(403).json({ error: 'You are not authorized to accept this request' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'Request is already processed' });
    }

    request.status = 'accepted';
    await request.save();

    const sender = await User.findById(request.sender);
    if (!sender) return res.status(404).json({ error: 'Sender user not found' });

    // Add each other to friends array
    if (!currentUser.friends.includes(request.sender)) {
      currentUser.friends.push(request.sender);
      await currentUser.save();
    }
    if (!sender.friends.includes(currentUserId)) {
      sender.friends.push(currentUserId);
      await sender.save();
    }

    // Send real-time notification to request sender that their request was accepted
    sendToUser(request.sender, 'friend_request_accepted', {
      requestId: request._id,
      user: {
        _id: currentUser._id,
        username: currentUser.username,
        profilePhoto: currentUser.profilePhoto,
        bio: currentUser.bio,
      },
    });

    res.json({ message: 'Friend request accepted', friend: sender });
  } catch (error) {
    console.error('Error accepting friend request:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// 4. Reject friend request
router.post('/reject', requireAuth, async (req, res) => {
  const { requestId } = req.body;

  try {
    const currentUser = await User.findOne({ clerkId: req.auth.userId });
    if (!currentUser) return res.status(404).json({ error: 'User not found' });
    const currentUserId = currentUser._id;

    const request = await FriendRequest.findById(requestId);
    if (!request) return res.status(404).json({ error: 'Friend request not found' });

    if (request.recipient.toString() !== currentUserId.toString()) {
      return res.status(403).json({ error: 'You are not authorized to reject this request' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'Request is already processed' });
    }

    // Delete it to keep DB clean and allow future requests
    await FriendRequest.findByIdAndDelete(requestId);

    res.json({ message: 'Friend request rejected and deleted' });
  } catch (error) {
    console.error('Error rejecting friend request:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// 5. Get current friends
router.get('/', requireAuth, async (req, res) => {
  try {
    const currentUser = await User.findOne({ clerkId: req.auth.userId }).populate('friends', '_id username profilePhoto bio blockedUsers restrictedUsers');
    if (!currentUser) return res.status(404).json({ error: 'User not found' });

    res.json(currentUser.friends);
  } catch (error) {
    console.error('Error fetching friends:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// 6. Remove friend (unfriend)
router.post('/remove', requireAuth, async (req, res) => {
  const { friendId } = req.body;

  try {
    const currentUser = await User.findOne({ clerkId: req.auth.userId });
    if (!currentUser) return res.status(404).json({ error: 'User not found' });
    const currentUserId = currentUser._id;

    const friend = await User.findById(friendId);
    if (!friend) return res.status(404).json({ error: 'Friend not found' });

    currentUser.friends = currentUser.friends.filter(id => id.toString() !== friendId.toString());
    await currentUser.save();

    friend.friends = friend.friends.filter(id => id.toString() !== currentUserId.toString());
    await friend.save();

    // Delete any accepted/pending requests between them
    await FriendRequest.deleteMany({
      $or: [
        { sender: currentUserId, recipient: friendId },
        { sender: friendId, recipient: currentUserId }
      ]
    });

    // Notify other user
    sendToUser(friendId, 'friend_removed', { friendId: currentUserId });

    res.json({ message: 'Friend removed successfully' });
  } catch (error) {
    console.error('Error removing friend:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
