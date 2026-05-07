const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema(
  {
    name_uz: { type: String, required: true, trim: true },
    name_ru: { type: String, required: true, trim: true },
    image_url: { type: String, default: '', trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Category', categorySchema);
