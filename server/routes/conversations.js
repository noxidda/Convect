import express from 'express';
import User from '../models/User.js';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import { requireAuth } from '../middleware/auth.js';
import { sendToUser, sendToRoom } from '../socket.js';

const router = express.Router();

// helper to check
async function isBlocked(userAId, userBId) {
  const userA = await User.findById(userAId);
  const userB = await User.findById(userBId);
  if (!userA || !userB) return false;
  return userA.blockedUsers.includes(userBId) || userB.blockedUsers.includes(userAId);
}

// 1. get all
router.get('/', requireAuth, async (req, res) => {
  try {
    const currentUser = await User.findOne({ clerkId: req.auth.userId });
    if (!currentUser) return res.status(404).json({ error: 'User not found' });

    const currentUserId = currentUser._id;

    // find conversations where
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

    // format conversations, filtering
    const formattedConversations = await Promise.all(
      conversations.map(async (conv) => {
        // find other participant
        const otherParticipant = conv.participants.find(
          (p) => p._id.toString() !== currentUserId.toString()
        );

        // if other participant
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

        // filter last message
        let lastMsg = conv.lastMessage;
        if (lastMsg && lastMsg.deletedFor.includes(currentUserId)) {
          // find the actual
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

// 2. create or
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

    // check if blocked
    const blockExists = await isBlocked(currentUserId, recipientId);
    if (blockExists) {
      return res.status(403).json({ error: 'Cannot start conversation. Block relationship exists.' });
    }

    // check if friends
    const isFriend = currentUser.friends.includes(recipientId);
    if (!isFriend) {
      return res.status(403).json({ error: 'You must be friends to start a conversation.' });
    }

    // find existing conversation
    let conversation = await Conversation.findOne({
      participants: { $all: [currentUserId, recipientId] }
    });

    if (conversation) {
      // if conversation was
      if (conversation.deletedBy.includes(currentUserId)) {
        conversation.deletedBy = conversation.deletedBy.filter(
          (id) => id.toString() !== currentUserId.toString()
        );
        await conversation.save();
      }
    } else {
      // create new conversation
      conversation = new Conversation({
        participants: [currentUserId, recipientId],
      });
      await conversation.save();
    }

    // format response
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

// 3. delete conversation
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

    // add current user
    if (!conversation.deletedBy.includes(currentUserId)) {
      conversation.deletedBy.push(currentUserId);
      await conversation.save();
    }

    // soft delete all
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

// 4. get messages
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

    // Mark incoming messages as read
    await Message.updateMany(
      { conversationId, sender: { $ne: currentUserId }, isRead: false },
      { $set: { isRead: true } }
    );

    // Notify participants in room that messages have been read
    sendToRoom(conversationId, 'messages_read', { conversationId, readerId: currentUserId });

    // retrieve messages that
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

// 5. send message
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

    // find other participant
    const otherParticipantId = conversation.participants.find(
      (p) => p.toString() !== currentUserId.toString()
    );

    // check if blocked
    if (otherParticipantId) {
      const blocked = await isBlocked(currentUserId, otherParticipantId);
      if (blocked) {
        return res.status(403).json({ error: 'Cannot send message. Block relationship exists.' });
      }
    }

    // create and save
    const message = new Message({
      conversationId,
      sender: currentUserId,
      content: content.trim(),
    });
    await message.save();

    // update conversation details
    conversation.lastMessage = message._id;
    // if the conversation
    if (otherParticipantId && conversation.deletedBy.includes(otherParticipantId)) {
      conversation.deletedBy = conversation.deletedBy.filter(
        (id) => id.toString() !== otherParticipantId.toString()
      );
    }
    await conversation.save();

    // populate message sender
    const populatedMsg = await Message.findById(message._id)
      .populate('sender', '_id username profilePhoto');

    // deliver real-time via
    // emit message to
    sendToRoom(conversationId, 'new_message', populatedMsg);

    // also send individual
    if (otherParticipantId) {
      // check if restricted:
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

// 6. edit message
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

    // emit event via
    sendToRoom(conversationId, 'message_edited', populatedMsg);

    // update conversation updates
    const conversation = await Conversation.findById(conversationId);
    if (conversation && conversation.lastMessage.toString() === messageId) {
      // notify about conversation
      const otherParticipantId = conversation.participants.find(
        (p) => p.toString() !== currentUserId.toString()
      );
      if (otherParticipantId) {
        sendToUser(otherParticipantId, 'conversation_update', {
          conversationId,
          message: populatedMsg,
          isMuted: true // edits are usually
        });
      }
    }

    res.json(populatedMsg);
  } catch (error) {
    console.error('Error editing message:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// 7. delete message
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
      // must be sender
      if (message.sender.toString() !== currentUserId.toString()) {
        return res.status(403).json({ error: 'Only the sender can delete a message for everyone' });
      }

      // update message content
      message.content = 'This message was deleted';
      message.isEdited = true; // mark as edited/deleted
      // actually we can
      await message.save();

      const populatedMsg = await Message.findById(message._id)
        .populate('sender', '_id username profilePhoto');

      // emit event
      sendToRoom(conversationId, 'message_edited', populatedMsg);

      // notify conversation update
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
      // default: delete for
      if (!message.deletedFor.includes(currentUserId)) {
        message.deletedFor.push(currentUserId);
        await message.save();
      }

      // emit local event
      sendToUser(currentUserId, 'message_deleted_for_me', { conversationId, messageId });

      return res.json({ message: 'Message deleted for you successfully' });
    }
  } catch (error) {
    console.error('Error deleting message:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
