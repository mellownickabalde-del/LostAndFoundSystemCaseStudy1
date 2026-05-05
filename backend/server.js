const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const itemRoutes = require('./routes/itemRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const logRoutes = require('./routes/logRoutes');
const chatRoutes = require('./routes/chatRoutes');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// Connect to MongoDB
connectDB();

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files
app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/uploads', express.static(path.join(__dirname, '../frontend/uploads')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/logs', logRoutes);
app.use('/api/chat', chatRoutes);

// Socket.IO Real-time Chat
const jwt = require('jsonwebtoken');
const Message = require('./model/Message');

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('No token'));
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.id;
    next();
  } catch (e) {
    next(new Error('Invalid token'));
  }
});

const onlineUsers = new Map();

io.on('connection', (socket) => {
  const userId = socket.userId;
  onlineUsers.set(userId, socket.id);
  io.emit('online_users', Array.from(onlineUsers.keys()));
  console.log(`User connected: ${userId}`);

  socket.join(userId);

  socket.on('send_message', async (data) => {
    try {
      const { receiverId, text, itemId, itemTitle, senderName } = data;
      const conversationId = Message.makeConvId(userId, receiverId);
      const message = await Message.create({
        conversationId,
        sender: userId,
        senderName,
        receiver: receiverId,
        itemRef: itemId || null,
        itemTitle: itemTitle || '',
        text,
      });
      const msgObj = {
        _id: message._id,
        conversationId,
        sender: userId,
        senderName,
        receiver: receiverId,
        itemRef: itemId || null,
        itemTitle: itemTitle || '',
        text,
        createdAt: message.createdAt,
        read: false,
      };
      io.to(receiverId).emit('receive_message', msgObj);
      socket.emit('message_sent', msgObj);
    } catch (err) {
      socket.emit('error', { message: 'Failed to send message' });
    }
  });

  socket.on('typing', ({ receiverId, isTyping }) => {
    io.to(receiverId).emit('user_typing', { senderId: userId, isTyping });
  });

  socket.on('disconnect', () => {
    onlineUsers.delete(userId);
    io.emit('online_users', Array.from(onlineUsers.keys()));
    console.log(`User disconnected: ${userId}`);
  });
});

// Catch-all
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});