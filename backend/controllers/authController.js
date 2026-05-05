const jwt = require('jsonwebtoken');
const User = require('../model/User');
const ActivityLog = require('../model/ActivityLog');

const generateToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Please provide email and password' });
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ message: 'Invalid email or password' });
    if (!user.isActive) return res.status(403).json({ message: 'Your account has been deactivated. Contact an admin.' });
    const isMatch = await user.matchPassword(password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid email or password' });
    try { await ActivityLog.create({ user: user._id, userName: user.name, action: 'LOGIN', details: `Logged in` }); } catch(e) {}
    res.json({ _id: user._id, name: user.name, email: user.email, role: user.role, token: generateToken(user._id) });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
};

const getMe = async (req, res) => {
  res.json({ _id: req.user._id, name: req.user.name, email: req.user.email, role: req.user.role });
};

const seedAdmin = async (req, res) => {
  try {
    const adminExists = await User.findOne({ role: 'admin' });
    if (adminExists) return res.status(400).json({ message: 'Admin already exists' });
    const admin = await User.create({
      name: 'System Admin',
      email: process.env.ADMIN_EMAIL || 'admin@lostandfound.com',
      password: process.env.ADMIN_PASSWORD || 'admin123456',
      role: 'admin',
    });
    res.status(201).json({ message: `Admin created: ${admin.email}` });
  } catch (error) {
    res.status(500).json({ message: 'Server error seeding admin' });
  }
};

module.exports = { login, getMe, seedAdmin };
