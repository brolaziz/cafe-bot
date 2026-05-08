const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema(
  {
    product_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    name: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    qty: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    telegram_user_id: { type: Number, required: true },
    telegram_username: { type: String, default: '', trim: true },
    items: {
      type: [orderItemSchema],
      required: true,
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: 'Order must include at least one item',
      },
    },
    total_price: { type: Number, required: true, min: 0 },
    address: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    payment_method: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: [
        'pending',
        'pending_payment',
        'paid',
        'confirmed',
        'preparing',
        'ready',
        'delivered',
        'cancelled',
      ],
      default: 'pending',
    },
    created_at: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

module.exports = mongoose.model('Order', orderSchema);
