const express = require('express');
const router = express.Router();
const { getConversations, getMessages, sendMessage, getUnreadCount } = require('../controllers/chatController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);
router.get('/conversations', getConversations);
router.get('/unread', getUnreadCount);
router.post('/send', sendMessage);
router.get('/:conversationId', getMessages);

module.exports = router;