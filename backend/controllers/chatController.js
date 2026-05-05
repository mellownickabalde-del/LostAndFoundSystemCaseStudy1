const Message = require('../model/Message');
const User = require('../model/User');

// @desc  Get all conversations for current user
// @route GET /api/chat/conversations
const getConversations = async (req, res) => {
  try {
    const userId = req.user._id.toString();

    // Get latest message per conversation
    const convos = await Message.aggregate([
      { $match: { $or: [{ sender: req.user._id }, { receiver: req.user._id }] } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: '$conversationId', lastMessage: { $first: '$$ROOT' } } },
      { $replaceRoot: { newRoot: '$lastMessage' } },
      { $sort: { createdAt: -1 } },
    ]);

    // Get unread counts per conversation
    const unreadCounts = await Message.aggregate([
      { $match: { receiver: req.user._id, read: false } },
      { $group: { _id: '$conversationId', count: { $sum: 1 } } },
    ]);
    const unreadMap = {};
    unreadCounts.forEach(u => { unreadMap[u._id] = u.count; });

    // Populate other user info
    const populated = await Promise.all(
      convos.map(async (msg) => {
        const otherId = msg.sender.toString() === userId ? msg.receiver : msg.sender;
        const otherUser = await User.findById(otherId).select('name email');
        return {
          conversationId: msg.conversationId,
          otherUser,
          lastMessage: msg.text,
          lastMessageTime: msg.createdAt,
          itemRef: msg.itemRef,
          itemTitle: msg.itemTitle,
          unread: unreadMap[msg.conversationId] || 0,
        };
      })
    );

    res.json(populated);
  } catch (error) {
    console.error('getConversations error:', error);
    res.status(500).json({ message: 'Error fetching conversations' });
  }
};

// @desc  Get messages in a conversation
// @route GET /api/chat/:conversationId
const getMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = 30;
    const skip = (page - 1) * limit;

    const [messages, total] = await Promise.all([
      Message.find({ conversationId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Message.countDocuments({ conversationId }),
    ]);

    // Mark as read
    await Message.updateMany(
      { conversationId, receiver: req.user._id, read: false },
      { read: true }
    );

    res.json({ messages: messages.reverse(), total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching messages' });
  }
};

// @desc  Send a message (REST fallback)
// @route POST /api/chat/send
const sendMessage = async (req, res) => {
  try {
    const { receiverId, text, itemId, itemTitle } = req.body;
    if (!receiverId || !text) return res.status(400).json({ message: 'Receiver and text are required' });

    const receiver = await User.findById(receiverId);
    if (!receiver) return res.status(404).json({ message: 'Receiver not found' });

    const conversationId = Message.makeConvId(req.user._id, receiverId);

    const message = await Message.create({
      conversationId,
      sender: req.user._id,
      senderName: req.user.name,
      receiver: receiverId,
      itemRef: itemId || null,
      itemTitle: itemTitle || '',
      text,
    });

    res.status(201).json(message);
  } catch (error) {
    console.error('sendMessage error:', error);
    res.status(500).json({ message: 'Error sending message' });
  }
};

// @desc  Get unread message count
// @route GET /api/chat/unread
const getUnreadCount = async (req, res) => {
  try {
    const count = await Message.countDocuments({ receiver: req.user._id, read: false });
    res.json({ count });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching unread count' });
  }
};

module.exports = { getConversations, getMessages, sendMessage, getUnreadCount };