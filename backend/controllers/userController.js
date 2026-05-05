const User = require('../model/User');
const ActivityLog = require('../model/ActivityLog');

const log = async (userId, userName, action, details) => {
  try { await ActivityLog.create({ user: userId, userName, action, details }); } catch (e) {}
};

const getAllUsers = async (req, res) => {
  try {
    const users = await User.find({}).select('-password').sort({ createdAt: -1 });
    res.json(users);
  } catch (error) { res.status(500).json({ message: 'Server error fetching users' }); }
};

const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (error) { res.status(500).json({ message: 'Server error fetching user' }); }
};

const createUser = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: 'Name, email, and password are required' });
    const userExists = await User.findOne({ email });
    if (userExists) return res.status(400).json({ message: 'A user with that email already exists' });
    const user = await User.create({ name, email, password, role: role || 'user' });
    await log(req.user._id, req.user.name, 'USER_CREATED', `Created user: "${name}" (${email})`);
    res.status(201).json({ _id: user._id, name: user.name, email: user.email, role: user.role, isActive: user.isActive, createdAt: user.createdAt });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ message: 'Server error creating user' });
  }
};

const updateUser = async (req, res) => {
  try {
    const { name, email, role, isActive, password } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (req.user._id.toString() === user._id.toString() && isActive === false) {
      return res.status(400).json({ message: 'You cannot deactivate your own account' });
    }
    user.name = name || user.name;
    user.email = email || user.email;
    user.role = role || user.role;
    if (typeof isActive === 'boolean') user.isActive = isActive;
    if (password) user.password = password;
    const updatedUser = await user.save();
    await log(req.user._id, req.user.name, 'USER_UPDATED', `Updated user: "${updatedUser.name}"`);
    res.json({ _id: updatedUser._id, name: updatedUser.name, email: updatedUser.email, role: updatedUser.role, isActive: updatedUser.isActive });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ message: 'Server error updating user' });
  }
};

const deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (req.user._id.toString() === user._id.toString()) return res.status(400).json({ message: 'You cannot delete your own account' });
    const name = user.name;
    await user.deleteOne();
    await log(req.user._id, req.user.name, 'USER_DELETED', `Deleted user: "${name}"`);
    res.json({ message: `User "${name}" deleted successfully` });
  } catch (error) {
    res.status(500).json({ message: 'Server error deleting user' });
  }
};

// @desc  Update own profile (any logged-in user)
const updateProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    const { name, email, password } = req.body;
    if (email && email !== user.email) {
      const exists = await User.findOne({ email });
      if (exists) return res.status(400).json({ message: 'Email already in use' });
    }
    user.name = name || user.name;
    user.email = email || user.email;
    if (password) user.password = password;
    const updated = await user.save();
    await log(req.user._id, req.user.name, 'PROFILE_UPDATED', `Updated own profile`);
    res.json({ _id: updated._id, name: updated.name, email: updated.email, role: updated.role });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ message: 'Server error updating profile' });
  }
};

module.exports = { getAllUsers, getUserById, createUser, updateUser, deleteUser, updateProfile };
