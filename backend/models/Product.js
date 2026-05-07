const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    category_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
    },
    name_uz: { type: String, required: true, trim: true },
    name_ru: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    image_url: { type: String, default: '', trim: true },
    is_available: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Product', productSchema);
