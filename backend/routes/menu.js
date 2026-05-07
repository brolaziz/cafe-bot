const express = require('express');
const mongoose = require('mongoose');
const Category = require('../models/Category');
const Product = require('../models/Product');

const router = express.Router();

router.get('/categories', async (req, res, next) => {
  try {
    const categories = await Category.find().sort({ createdAt: 1 }).lean();
    res.json(categories);
  } catch (err) {
    next(err);
  }
});

router.get('/products/:categoryId', async (req, res, next) => {
  try {
    const { categoryId } = req.params;
    if (!mongoose.isValidObjectId(categoryId)) {
      res.status(400).json({ error: 'Invalid category id' });
      return;
    }

    const category = await Category.findById(categoryId).lean();
    if (!category) {
      res.status(404).json({ error: 'Category not found' });
      return;
    }

    const products = await Product.find({ category_id: categoryId })
      .sort({ createdAt: 1 })
      .lean();
    res.json(products);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
