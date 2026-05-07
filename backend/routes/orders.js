const express = require('express');
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Product = require('../models/Product');
const { getBot, formatAdminOrderMessage } = require('../bot');

const router = express.Router();

const ORDER_STATUSES = [
  'pending',
  'confirmed',
  'preparing',
  'ready',
  'delivered',
  'cancelled',
];

/** Admin xabarida 📍 Manzil qatoridan keyin Yandex havolasi */
function appendYandexMapsLinkToAdminOrderMessage(message, address) {
  const encoded = encodeURIComponent(String(address || '').trim());
  const mapLine = `🗺 Xaritada ko'rish: https://yandex.uz/maps/?text=${encoded}`;
  const lines = message.split('\n');
  const out = [];
  for (const line of lines) {
    out.push(line);
    if (line.startsWith('📍 Manzil:')) {
      out.push(mapLine);
    }
  }
  return out.join('\n');
}

function validateOrderBody(body) {
  const errors = [];
  const {
    telegram_user_id,
    telegram_username,
    items,
    total_price,
    address,
    phone,
    payment_method,
  } = body;

  if (telegram_user_id === undefined || telegram_user_id === null) {
    errors.push('telegram_user_id is required');
  } else if (typeof telegram_user_id !== 'number' || !Number.isFinite(telegram_user_id)) {
    errors.push('telegram_user_id must be a number');
  }

  if (!Array.isArray(items) || items.length === 0) {
    errors.push('items must be a non-empty array');
  } else {
    items.forEach((item, i) => {
      if (!item || typeof item !== 'object') {
        errors.push(`items[${i}] must be an object`);
        return;
      }
      if (!item.product_id || !mongoose.isValidObjectId(String(item.product_id))) {
        errors.push(`items[${i}].product_id must be a valid ObjectId`);
      }
      if (!item.name || typeof item.name !== 'string') {
        errors.push(`items[${i}].name is required`);
      }
      if (typeof item.price !== 'number' || !Number.isFinite(item.price) || item.price < 0) {
        errors.push(`items[${i}].price must be a non-negative number`);
      }
      if (typeof item.qty !== 'number' || !Number.isInteger(item.qty) || item.qty < 1) {
        errors.push(`items[${i}].qty must be a positive integer`);
      }
    });
  }

  if (typeof total_price !== 'number' || !Number.isFinite(total_price) || total_price < 0) {
    errors.push('total_price must be a non-negative number');
  }

  if (!address || typeof address !== 'string' || !address.trim()) {
    errors.push('address is required');
  }

  if (!phone || typeof phone !== 'string' || !phone.trim()) {
    errors.push('phone is required');
  }

  if (!payment_method || typeof payment_method !== 'string' || !payment_method.trim()) {
    errors.push('payment_method is required');
  }

  if (telegram_username !== undefined && telegram_username !== null && typeof telegram_username !== 'string') {
    errors.push('telegram_username must be a string');
  }

  if (body.status !== undefined && body.status !== null && body.status !== '') {
    if (typeof body.status !== 'string' || !ORDER_STATUSES.includes(body.status)) {
      errors.push('status must be one of: ' + ORDER_STATUSES.join(', '));
    }
  }

  return errors;
}

router.post('/', async (req, res, next) => {
  try {
    const errors = validateOrderBody(req.body);
    if (errors.length > 0) {
      res.status(400).json({ error: 'Validation failed', details: errors });
      return;
    }

    const {
      telegram_user_id,
      telegram_username = '',
      items,
      total_price,
      address,
      phone,
      payment_method,
      status,
    } = req.body;

    const productIds = items.map((i) => i.product_id);
    const uniqueIds = [...new Set(productIds.map(String))];
    const found = await Product.find({ _id: { $in: uniqueIds } }).select('_id').lean();
    if (found.length !== uniqueIds.length) {
      res.status(400).json({ error: 'One or more product_id values are invalid' });
      return;
    }

    const orderPayload = {
      telegram_user_id,
      telegram_username: typeof telegram_username === 'string' ? telegram_username : '',
      items: items.map((i) => ({
        product_id: i.product_id,
        name: i.name.trim(),
        price: i.price,
        qty: i.qty,
      })),
      total_price,
      address: address.trim(),
      phone: phone.trim(),
      payment_method: payment_method.trim(),
    };

    if (typeof status === 'string' && status && ORDER_STATUSES.includes(status)) {
      orderPayload.status = status;
    }

    const order = await Order.create(orderPayload);

    const bot = getBot();
    const adminChatId = process.env.ADMIN_CHAT_ID;
    if (bot && adminChatId) {
      try {
        const text = appendYandexMapsLinkToAdminOrderMessage(
          formatAdminOrderMessage(order),
          order.address
        );
        await bot.sendMessage(adminChatId, text, {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ Qabul qilish', callback_data: `confirm_${order._id}` },
                { text: '❌ Bekor qilish', callback_data: `cancel_${order._id}` },
              ],
            ],
          },
        });
      } catch (notifyErr) {
        console.error('Telegram admin notify failed:', notifyErr.message || notifyErr);
      }
    }

    res.status(201).json(order);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
