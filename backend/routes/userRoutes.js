const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

// Any logged-in user can update their own profile
router.put('/profile', protect, userController.updateProfile);

// Admin-only routes
router.use(protect, adminOnly);
router.route('/').get(userController.getAllUsers).post(userController.createUser);
router.route('/:id').get(userController.getUserById).put(userController.updateUser).delete(userController.deleteUser);

module.exports = router;