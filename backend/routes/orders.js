const { Readable } = require('stream');
const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const Order = require('../models/Order');
const Product = require('../models/Product');
const {
  getBot,
  formatAdminOrderMessage,
  appendYandexMapsLinkToAdminOrderMessage,
  formatP2pNewPendingPaymentAdminMessage,
} = require('../bot');

const router = express.Router();

const receiptUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype || !file.mimetype.startsWith('image/')) {
      cb(new Error('Faqat rasm fayli qabul qilinadi'));
      return;
    }
    cb(null, true);
  },
});

function parseTelegramUserId(raw) {
  const telegram_user_id = typeof raw === 'string' ? Number(raw.trim()) : Number(raw);
  if (!Number.isFinite(telegram_user_id)) {
    return null;
  }
  return telegram_user_id;
}

router.get('/mine', async (req, res, next) => {
  try {
    const telegram_user_id = parseTelegramUserId(req.query.telegram_user_id);
    if (telegram_user_id === null) {
      res.status(400).json({ error: 'telegram_user_id kerak' });
      return;
    }

    const orders = await Order.find({ telegram_user_id })
      .sort({ created_at: -1 })
      .limit(100)
      .lean();
    res.json(orders);
  } catch (err) {
    next(err);
  }
});

/** Barcha buyurtmalarni o'chirish (faqat o'sha foydalanuvchining) */
router.delete('/mine', async (req, res, next) => {
  try {
    const telegram_user_id = parseTelegramUserId(req.query.telegram_user_id);
    if (telegram_user_id === null) {
      res.status(400).json({ error: 'telegram_user_id kerak' });
      return;
    }

    const result = await Order.deleteMany({ telegram_user_id });
    res.json({ ok: true, deletedCount: result.deletedCount ?? 0 });
  } catch (err) {
    next(err);
  }
});

/** Bitta buyurtmani o'chirish */
router.delete('/:orderId', async (req, res, next) => {
  try {
    const telegram_user_id = parseTelegramUserId(req.query.telegram_user_id);
    if (telegram_user_id === null) {
      res.status(400).json({ error: 'telegram_user_id kerak' });
      return;
    }

    const { orderId } = req.params;
    if (!mongoose.isValidObjectId(String(orderId))) {
      res.status(400).json({ error: "Noto'g'ri buyurtma identifikatori" });
      return;
    }

    const deleted = await Order.findOneAndDelete({
      _id: orderId,
      telegram_user_id,
    }).lean();

    if (!deleted) {
      res.status(404).json({ error: 'Buyurtma topilmadi yoki sizga tegishli emas' });
      return;
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/**
 * Mini-appdan P2P chek rasmini qabul qiladi, admin chatga yuboradi (inline tugmalar bilan).
 * POST multipart: maydon nomi "receipt". Query: telegram_user_id
 */
router.post(
  '/:orderId/receipt',
  (req, res, next) => {
    receiptUpload.single('receipt')(req, res, (err) => {
      if (err) {
        const msg =
          err instanceof multer.MulterError ? err.message : String(err.message || 'Yuklash xatosi');
        res.status(400).json({ error: msg });
        return;
      }
      next();
    });
  },
  async (req, res, next) => {
    try {
      if (!req.file || !req.file.buffer) {
        res.status(400).json({ error: "receipt maydoni kerak (multipart image)" });
        return;
      }

      const telegram_user_id = parseTelegramUserId(req.query.telegram_user_id);
      if (telegram_user_id === null) {
        res.status(400).json({ error: 'telegram_user_id kerak' });
        return;
      }

      const { orderId } = req.params;
      if (!mongoose.isValidObjectId(String(orderId))) {
        res.status(400).json({ error: "Noto'g'ri buyurtma identifikatori" });
        return;
      }

      const order = await Order.findOne({
        _id: orderId,
        telegram_user_id,
      }).exec();

      if (!order) {
        res.status(404).json({ error: 'Buyurtma topilmadi yoki sizga tegishli emas' });
        return;
      }

      if (String(order.payment_method || '').trim().toLowerCase() !== 'p2p') {
        res.status(400).json({ error: 'Faqat P2P buyurtma uchun' });
        return;
      }

      if (order.status !== 'pending_payment') {
        res.status(400).json({ error: 'Bu buyurtma uchun chek yuborish mumkin emas' });
        return;
      }

      const bot = getBot();
      const adminChatId = process.env.ADMIN_CHAT_ID;
      if (!bot || !adminChatId) {
        res.status(503).json({ error: "Telegram admin sozlanmagan (ADMIN_CHAT_ID)" });
        return;
      }

      const username = order.telegram_username && String(order.telegram_username).trim();
      const atPart = username ? `@${username}` : "foydalanuvchi";
      const caption = [
        "💳 P2P TO'LOV CHEKI",
        `👤 Mijoz: ${atPart} (telegram_user_id: ${order.telegram_user_id})`,
        `📋 Buyurtma: #${order._id}`,
        `💰 Summa: ${order.total_price} so'm`,
      ].join('\n');

      const ext = (req.file.originalname && /\.[a-z0-9]+$/i.exec(req.file.originalname)?.[0]) || '.jpg';
      const filename = `receipt${ext}`.slice(0, 64);
      const stream = Readable.from(req.file.buffer);

      await bot.sendPhoto(adminChatId, stream, {
        filename,
        contentType: req.file.mimetype || 'image/jpeg',
        caption,
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Tasdiqlash', callback_data: `receipt_confirm_${order._id}` },
              { text: '❌ Rad etish', callback_data: `receipt_reject_${order._id}` },
            ],
          ],
        },
      });

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

const ORDER_STATUSES = [
  'pending',
  'pending_payment',
  'paid',
  'confirmed',
  'preparing',
  'ready',
  'delivered',
  'cancelled',
];

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

    const isP2p = String(payment_method || '')
      .trim()
      .toLowerCase() === 'p2p';

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

    if (isP2p) {
      orderPayload.status = 'pending_payment';
    } else if (typeof status === 'string' && status && ORDER_STATUSES.includes(status)) {
      orderPayload.status = status;
    }

    const order = await Order.create(orderPayload);

    const bot = getBot();
    const adminChatId = process.env.ADMIN_CHAT_ID;
    if (bot && adminChatId) {
      try {
        const isP2pOrder = String(order.payment_method || '')
          .trim()
          .toLowerCase() === 'p2p';
        if (isP2pOrder) {
          const p2pIntro = formatP2pNewPendingPaymentAdminMessage(order);
          await bot.sendMessage(adminChatId, p2pIntro);
        } else {
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
        }
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
