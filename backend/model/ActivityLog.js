const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userName: { type: String, required: true },
  action: {
    type: String,
    enum: ['LOGIN','ITEM_CREATED','ITEM_UPDATED','ITEM_DELETED','ITEM_CLAIMED',
           'ITEM_RESOLVED','USER_CREATED','USER_UPDATED','USER_DELETED','PROFILE_UPDATED'],
    required: true,
  },
  details: { type: String, default: '' },
  itemRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', default: null },
}, { timestamps: true });

module.exports = mongoose.model('ActivityLog', activityLogSchema);