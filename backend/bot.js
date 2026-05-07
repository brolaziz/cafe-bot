// Local dev: polling. For production webhook, switch options per node-telegram-bot-api docs.
const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const Order = require('./models/Order');

let botInstance = null;

function getBot() {
  return botInstance;
}

function formatAdminOrderMessage(order) {
  const username = order.telegram_username && String(order.telegram_username).trim();
  const clientLine = username ? `@${username}` : '—';

  const lines = [
    `🆕 YANGI BUYURTMA #${order._id}`,
    `👤 Mijoz: ${clientLine}`,
    `📞 Tel: ${order.phone}`,
    `📍 Manzil: ${order.address}`,
    '',
    '🛒 Buyurtma:',
  ];

  for (const item of order.items) {
    const lineTotal = item.price * item.qty;
    lines.push(`- ${item.name} x${item.qty} = ${lineTotal} so'm`);
  }

  lines.push('', `💰 Jami: ${order.total_price} so'm`, `💳 To'lov: ${order.payment_method}`);

  return lines.join('\n');
}

function initBot() {
  if (botInstance) {
    return botInstance;
  }

  const token = process.env.BOT_TOKEN;
  if (!token) {
    console.warn('BOT_TOKEN is not set; Telegram bot will not start.');
    return null;
  }

  botInstance = new TelegramBot(token, {
    polling: true,
  });

  botInstance.on('callback_query', async (query) => {
    const data = query.data;
    const chatId = query.message?.chat?.id;
    const messageId = query.message?.message_id;
    const prevText = query.message?.text;

    if (!data || chatId == null || messageId == null) {
      try {
        await botInstance.answerCallbackQuery(query.id);
      } catch (_) {
        /* ignore */
      }
      return;
    }

    const confirmMatch = data.match(/^confirm_(.+)$/);
    const cancelMatch = data.match(/^cancel_(.+)$/);

    if (!confirmMatch && !cancelMatch) {
      try {
        await botInstance.answerCallbackQuery(query.id);
      } catch (_) {
        /* ignore */
      }
      return;
    }

    const orderId = confirmMatch ? confirmMatch[1] : cancelMatch[1];
    if (!mongoose.isValidObjectId(orderId)) {
      try {
        await botInstance.answerCallbackQuery(query.id, { text: "Noto'g'ri buyurtma", show_alert: false });
      } catch (_) {
        /* ignore */
      }
      return;
    }

    try {
      const order = await Order.findById(orderId);
      if (!order) {
        await botInstance.answerCallbackQuery(query.id, { text: 'Buyurtma topilmadi', show_alert: false });
        return;
      }

      if (order.status !== 'pending') {
        await botInstance.answerCallbackQuery(query.id, { text: 'Buyurtma allaqachon qayta ishlangan', show_alert: false });
        return;
      }

      if (confirmMatch) {
        order.status = 'confirmed';
      } else {
        order.status = 'cancelled';
      }
      await order.save();

      const suffix = confirmMatch ? '\n\n✅ Qabul qilindi' : '\n\n❌ Bekor qilindi';
      const newText = (prevText || '') + suffix;

      await botInstance.editMessageText(newText, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: { inline_keyboard: [] },
      });

      await botInstance.answerCallbackQuery(query.id);
    } catch (err) {
      console.error('callback_query handler:', err);
      try {
        await botInstance.answerCallbackQuery(query.id, { text: 'Xatolik yuz berdi', show_alert: false });
      } catch (_) {
        /* ignore */
      }
    }
  });

  botInstance.on('polling_error', (err) => {
    console.error('Telegram polling error:', err.message || err);
  });

  console.log('Telegram bot polling started.');
  return botInstance;
}

module.exports = { initBot, getBot, formatAdminOrderMessage };
Object.defineProperty(module.exports, 'bot', {
  enumerable: true,
  get() {
    return botInstance;
  },
});
