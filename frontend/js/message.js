const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: String,
      required: true,
      index: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    senderName: { type: String, required: true },
    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    itemRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Item',
      default: null,
    },
    itemTitle: { type: String, default: '' },
    text: { type: String, required: true, trim: true },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Conversation ID is always sorted user IDs joined — ensures uniqueness regardless of who initiates
messageSchema.statics.makeConvId = (uid1, uid2) => {
  return [uid1.toString(), uid2.toString()].sort().join('_');
};

module.exports = mongoose.model('Message', messageSchema);