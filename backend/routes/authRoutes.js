const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');
const User = require('../model/User');

router.post('/login', authController.login);
router.get('/me', protect, authController.getMe);
router.post('/seed-admin', authController.seedAdmin);

// TEMP: direct create admin for debugging
router.post('/create-admin-now', async (req, res) => {
  try {
    await User.deleteMany({});
    const user = await User.create({
      name: 'Admin',
      email: 'admin@admin.com',
      password: 'admin123456',
      role: 'admin',
    });
    res.json({ message: 'Admin created', email: user.email });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;