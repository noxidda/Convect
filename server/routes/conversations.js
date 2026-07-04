import express from 'express';
import User from '../models/User.js';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import { requireAuth } from '../middleware/auth.js';
import { sendToUser, sendToRoom } from '../socket.js';

const router = express.Router();

// Helper to check if a block exists between two users
async function isBlocked(userAId, userBId) {
  const userA = await User.findById(userAId);
  const userB = await User.findById(userBId);
  if (!userA || !userB) return false;
  return userA.blockedUsers.includes(userBId) || userB.blockedUsers.includes(userAId);
}

// 1. Get all conversations for logged-in user
router.get('/', requireAuth, async (req, res) => {
  try {
    const currentUser = await User.findOne({ clerkId: req.auth.userId });
    if (!currentUser) return res.status(404).json({ error: 'User not found' });

    const currentUserId = currentUser._id;

    // Find conversations where user is a participant and has not deleted the conversation
    const conversations = await Conversation.find({
      participants: currentUserId,
      deletedBy: { $ne: currentUserId }
    })
    .populate('participants', '_id username bio profilePhoto blockedUsers restrictedUsers')
    .populate({
      path: 'lastMessage',
      populate: {
        path: 'sender',
        select: '_id username'
      }
    })
    .sort({ updatedAt: -1 });

    // Format conversations, filtering out last messages that were deleted for this user
    const formattedConversations = await Promise.all(
      conversations.map(async (conv) => {
        // Find other participant
        const otherParticipant = conv.participants.find(
          (p) => p._id.toString() !== currentUserId.toString()
        );

        // If other participant doesn't exist (e.g. account deleted), provide fallback
        const contactInfo = otherParticipant
          ? {
              _id: otherParticipant._id,
              username: otherParticipant.username || 'Deleted User',
              bio: otherParticipant.bio,
              profilePhoto: otherParticipant.profilePhoto,
              isBlocked: currentUser.blockedUsers.includes(otherParticipant._id),
              isRestricted: currentUser.restrictedUsers.includes(otherParticipant._id),
              hasBlockedMe: otherParticipant.blockedUsers?.includes(currentUserId) || false,
            }
          : {
              _id: 'deleted',
              username: 'Deleted User',
              bio: '',
              profilePhoto: '',
              isBlocked: false,
              isRestricted: false,
              hasBlockedMe: false,
            };

        // Filter last message if deleted for current user
        let lastMsg = conv.lastMessage;
        if (lastMsg && lastMsg.deletedFor.includes(currentUserId)) {
          // Find the actual last message that is not deleted for this user
          const replacementMsg = await Message.findOne({
            conversationId: conv._id,
            deletedFor: { $ne: currentUserId }
          })
          .sort({ createdAt: -1 })
          .populate('sender', '_id username');

          lastMsg = replacementMsg;
        }

        return {
          _id: conv._id,
          updatedAt: conv.updatedAt,
          contact: contactInfo,
          lastMessage: lastMsg ? {
            _id: lastMsg._id,
            content: lastMsg.content,
            sender: lastMsg.sender,
            isEdited: lastMsg.isEdited,
            createdAt: lastMsg.createdAt,
          } : null,
        };
      })
    );

    res.json(formattedConversations);
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// 2. Create or open a conversation with another user
router.post('/', requireAuth, async (req, res) => {
  const { recipientId } = req.body;

  try {
    const currentUser = await User.findOne({ clerkId: req.auth.userId });
    if (!currentUser) return res.status(404).json({ error: 'Current user not found' });
    const currentUserId = currentUser._id;

    if (currentUserId.toString() === recipientId) {
      return res.status(400).json({ error: 'You cannot start a chat with yourself' });
    }

    const recipient = await User.findById(recipientId);
    if (!recipient) {
      return res.status(404).json({ error: 'Recipient user not found' });
    }

    // Check if blocked
    const blockExists = await isBlocked(currentUserId, recipientId);
    if (blockExists) {
      return res.status(403).json({ error: 'Cannot start conversation. Block relationship exists.' });
    }

    // Check if friends
    const isFriend = currentUser.friends.includes(recipientId);
    if (!isFriend) {
      return res.status(403).json({ error: 'You must be friends to start a conversation.' });
    }

    // Find existing conversation between the two participants
    let conversation = await Conversation.findOne({
      participants: { $all: [currentUserId, recipientId] }
    });

    if (conversation) {
      // If conversation was soft-deleted by current user, restore it
      if (conversation.deletedBy.includes(currentUserId)) {
        conversation.deletedBy = conversation.deletedBy.filter(
          (id) => id.toString() !== currentUserId.toString()
        );
        await conversation.save();
      }
    } else {
      // Create new conversation
      conversation = new Conversation({
        participants: [currentUserId, recipientId],
      });
      await conversation.save();
    }

    // Format response
    const populatedConv = await Conversation.findById(conversation._id)
      .populate('participants', '_id username bio profilePhoto blockedUsers restrictedUsers')
      .populate('lastMessage');

    const otherParticipant = populatedConv.participants.find(
      (p) => p._id.toString() !== currentUserId.toString()
    );

    const formatted = {
      _id: populatedConv._id,
      updatedAt: populatedConv.updatedAt,
      contact: {
        _id: otherParticipant._id,
        username: otherParticipant.username || 'Deleted User',
        bio: otherParticipant.bio,
        profilePhoto: otherParticipant.profilePhoto,
        isBlocked: currentUser.blockedUsers.includes(otherParticipant._id),
        isRestricted: currentUser.restrictedUsers.includes(otherParticipant._id),
        hasBlockedMe: otherParticipant.blockedUsers?.includes(currentUserId) || false,
      },
      lastMessage: populatedConv.lastMessage,
    };

    res.status(200).json(formatted);
  } catch (error) {
    console.error('Error starting conversation:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// 3. Delete conversation (Soft Delete for current user)
router.delete('/:id', requireAuth, async (req, res) => {
  const conversationId = req.params.id;

  try {
    const currentUser = await User.findOne({ clerkId: req.auth.userId });
    if (!currentUser) return res.status(404).json({ error: 'User not found' });
    const currentUserId = currentUser._id;

    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: currentUserId
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found or not authorized' });
    }

    // Add current user to deletedBy if not already there
    if (!conversation.deletedBy.includes(currentUserId)) {
      conversation.deletedBy.push(currentUserId);
      await conversation.save();
    }

    // Soft delete all existing messages in this conversation for this user
    await Message.updateMany(
      { conversationId, deletedFor: { $ne: currentUserId } },
      { $push: { deletedFor: currentUserId } }
    );

    res.json({ message: 'Conversation deleted successfully' });
  } catch (error) {
    console.error('Error deleting conversation:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// 4. Get messages in a conversation
router.get('/:id/messages', requireAuth, async (req, res) => {
  const conversationId = req.params.id;

  try {
    const currentUser = await User.findOne({ clerkId: req.auth.userId });
    if (!currentUser) return res.status(404).json({ error: 'User not found' });
    const currentUserId = currentUser._id;

    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: currentUserId
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Retrieve messages that are not soft-deleted for this user
    const messages = await Message.find({
      conversationId,
      deletedFor: { $ne: currentUserId }
    })
    .populate('sender', '_id username profilePhoto')
    .sort({ createdAt: 1 });

    res.json(messages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// 5. Send message
router.post('/:id/messages', requireAuth, async (req, res) => {
  const conversationId = req.params.id;
  const { content } = req.body;

  try {
    const currentUser = await User.findOne({ clerkId: req.auth.userId });
    if (!currentUser) return res.status(404).json({ error: 'User not found' });
    const currentUserId = currentUser._id;

    if (!content || content.trim() === '') {
      return res.status(400).json({ error: 'Message content is required' });
    }

    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: currentUserId
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Find other participant
    const otherParticipantId = conversation.participants.find(
      (p) => p.toString() !== currentUserId.toString()
    );

    // Check if blocked relationship exists
    if (otherParticipantId) {
      const blocked = await isBlocked(currentUserId, otherParticipantId);
      if (blocked) {
        return res.status(403).json({ error: 'Cannot send message. Block relationship exists.' });
      }
    }

    // Create and save message
    const message = new Message({
      conversationId,
      sender: currentUserId,
      content: content.trim(),
    });
    await message.save();

    // Update conversation details
    conversation.lastMessage = message._id;
    // If the conversation was soft-deleted by the recipient, restore it for them
    if (otherParticipantId && conversation.deletedBy.includes(otherParticipantId)) {
      conversation.deletedBy = conversation.deletedBy.filter(
        (id) => id.toString() !== otherParticipantId.toString()
      );
    }
    await conversation.save();

    // Populate message sender info for response and socket delivery
    const populatedMsg = await Message.findById(message._id)
      .populate('sender', '_id username profilePhoto');

    // Deliver real-time via Socket.io
    // Emit message to the conversation room
    sendToRoom(conversationId, 'new_message', populatedMsg);

    // Also send individual socket notification to recipient to update their conversation list if not in room
    if (otherParticipantId) {
      // Check if restricted: if restricted, we can flag the event as muted
      const recipient = await User.findById(otherParticipantId);
      const isRestricted = recipient?.restrictedUsers.includes(currentUserId) || false;

      sendToUser(otherParticipantId, 'conversation_update', {
        conversationId,
        message: populatedMsg,
        isMuted: isRestricted,
      });
    }

    res.status(201).json(populatedMsg);
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// 6. Edit Message
router.put('/:id/messages/:messageId', requireAuth, async (req, res) => {
  const { id: conversationId, messageId } = req.params;
  const { content } = req.body;

  try {
    const currentUser = await User.findOne({ clerkId: req.auth.userId });
    if (!currentUser) return res.status(404).json({ error: 'User not found' });
    const currentUserId = currentUser._id;

    if (!content || content.trim() === '') {
      return res.status(400).json({ error: 'Message content is required' });
    }

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    if (message.conversationId.toString() !== conversationId) {
      return res.status(400).json({ error: 'Invalid conversation match' });
    }

    if (message.sender.toString() !== currentUserId.toString()) {
      return res.status(403).json({ error: 'Unauthorized to edit this message' });
    }

    message.content = content.trim();
    message.isEdited = true;
    await message.save();

    const populatedMsg = await Message.findById(message._id)
      .populate('sender', '_id username profilePhoto');

    // Emit event via Socket.io
    sendToRoom(conversationId, 'message_edited', populatedMsg);

    // Update conversation updates
    const conversation = await Conversation.findById(conversationId);
    if (conversation && conversation.lastMessage.toString() === messageId) {
      // Notify about conversation update
      const otherParticipantId = conversation.participants.find(
        (p) => p.toString() !== currentUserId.toString()
      );
      if (otherParticipantId) {
        sendToUser(otherParticipantId, 'conversation_update', {
          conversationId,
          message: populatedMsg,
          isMuted: true // edits are usually quiet
        });
      }
    }

    res.json(populatedMsg);
  } catch (error) {
    console.error('Error editing message:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// 7. Delete Message
router.delete('/:id/messages/:messageId', requireAuth, async (req, res) => {
  const { id: conversationId, messageId } = req.params;
  const { type } = req.query; // 'me' or 'everyone'

  try {
    const currentUser = await User.findOne({ clerkId: req.auth.userId });
    if (!currentUser) return res.status(404).json({ error: 'User not found' });
    const currentUserId = currentUser._id;

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    if (message.conversationId.toString() !== conversationId) {
      return res.status(400).json({ error: 'Invalid conversation match' });
    }

    if (type === 'everyone') {
      // Must be sender to delete for everyone
      if (message.sender.toString() !== currentUserId.toString()) {
        return res.status(403).json({ error: 'Only the sender can delete a message for everyone' });
      }

      // Update message content to indicate deletion
      message.content = 'This message was deleted';
      message.isEdited = true; // Mark as edited/deleted state
      // Actually we can set a flag or just replace content. Let's replace content and mark as edited/deleted
      await message.save();

      const populatedMsg = await Message.findById(message._id)
        .populate('sender', '_id username profilePhoto');

      // Emit event
      sendToRoom(conversationId, 'message_edited', populatedMsg);

      // Notify conversation update
      const conversation = await Conversation.findById(conversationId);
      if (conversation && conversation.lastMessage?.toString() === messageId) {
        const otherParticipantId = conversation.participants.find(
          (p) => p.toString() !== currentUserId.toString()
        );
        if (otherParticipantId) {
          sendToUser(otherParticipantId, 'conversation_update', {
            conversationId,
            message: populatedMsg,
            isMuted: true
          });
        }
      }

      return res.json(populatedMsg);
    } else {
      // Default: delete for me
      if (!message.deletedFor.includes(currentUserId)) {
        message.deletedFor.push(currentUserId);
        await message.save();
      }

      // Emit local event so user's client UI updates immediately
      sendToUser(currentUserId, 'message_deleted_for_me', { conversationId, messageId });

      return res.json({ message: 'Message deleted for you successfully' });
    }
  } catch (error) {
    console.error('Error deleting message:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
