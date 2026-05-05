const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
    },
    type: {
      type: String,
      enum: ['lost', 'found'],
      required: [true, 'Item type (lost/found) is required'],
    },
    status: {
      type: String,
      enum: ['open', 'claimed', 'resolved'],
      default: 'open',
    },
    category: {
      type: String,
      enum: ['Electronics', 'Clothing', 'Accessories', 'Documents', 'Keys', 'Wallet/Bag', 'Pet', 'Other'],
      default: 'Other',
    },
    location: {
      type: String,
      required: [true, 'Location is required'],
      trim: true,
    },
    dateReported: {
      type: Date,
      default: Date.now,
    },
    dateLostOrFound: {
      type: Date,
    },
    imageUrl: {
      type: String,
      default: '',
    },
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    claimedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('item', itemSchema);