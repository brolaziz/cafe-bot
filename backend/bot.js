// Local dev: polling. For production webhook, switch options per node-telegram-bot-api docs.
const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const Order = require('./models/Order');
const Category = require('./models/Category');
const Product = require('./models/Product');
const { deleteOldOrders, ORDER_RETENTION_DAYS } = require('./orderCleanup');

let botInstance = null;

/** @type {Map<number, object>} */
const adminState = new Map();

const ADMIN_KEYBOARD = {
  keyboard: [
    [{ text: '📋 Mahsulotlar' }, { text: "➕ Mahsulot qo'shish" }],
    [{ text: '📁 Kategoriyalar' }, { text: "➕ Kategoriya qo'shish" }],
    [{ text: '🗑 Tozalash' }],
  ],
  resize_keyboard: true,
};

function getAdminId() {
  const raw = process.env.ADMIN_CHAT_ID;
  if (raw == null || String(raw).trim() === '') return null;
  const n = Number(String(raw).trim());
  return Number.isFinite(n) ? n : null;
}

function isAdmin(fromId) {
  const aid = getAdminId();
  if (aid == null) return false;
  return Number(fromId) === aid;
}

function clearAdminState(userId) {
  adminState.delete(userId);
}

function getState(userId) {
  return adminState.get(userId) || { type: 'idle' };
}

function setState(userId, state) {
  if (state.type === 'idle') adminState.delete(userId);
  else adminState.set(userId, state);
}

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

function cbPrice(pid) {
  return `adm_p_${pid}`;
}
function cbDelAsk(pid) {
  return `adm_d_${pid}`;
}
function cbDelConfirm(pid) {
  return `adm_dc_${pid}`;
}
function cbDelCancel(pid) {
  return `adm_dx_${pid}`;
}
function cbPickCat(cid) {
  return `adm_c_${cid}`;
}

function getWebAppUrlFromEnv() {
  const keys = ['WEB_APP_URL', 'TELEGRAM_WEB_APP_URL', 'MINI_APP_URL', 'PUBLIC_WEB_APP_URL'];
  for (const key of keys) {
    const v = process.env[key];
    if (v && String(v).trim()) return String(v).trim();
  }
  return '';
}

async function handleStart(msg) {
  if (!botInstance || !msg.chat?.id) return;
  const chatId = msg.chat.id;
  const name = (msg.from?.first_name && String(msg.from.first_name).trim()) || 'Mehmon';
  const webAppUrl = getWebAppUrlFromEnv();

  const hello = `Assalomu alaykum, ${name}!`;

  if (webAppUrl) {
    await botInstance.sendMessage(chatId, hello, {
      reply_markup: {
        inline_keyboard: [[{ text: '📱 Menyuni ochish', web_app: { url: webAppUrl } }]],
      },
    });
    return;
  }

  await botInstance.sendMessage(
    chatId,
    `${hello}\n\nBuyurtma berish uchun Telegram menyusidagi «Web App» / «Mini App» tugmasidan foydalaning yoki backend .env da WEB_APP_URL ni HTTPS manzil bilan to'ldiring.`
  );
}

async function sendAdminMenu(chatId) {
  if (!botInstance) return;
  await botInstance.sendMessage(chatId, '🔐 Admin panel', { reply_markup: ADMIN_KEYBOARD });
}

async function listProductsAdmin(chatId) {
  const products = await Product.find().sort({ createdAt: 1 }).lean();
  if (!products.length) {
    await botInstance.sendMessage(chatId, "Mahsulotlar yo'q.", { reply_markup: ADMIN_KEYBOARD });
    return;
  }

  const maxProducts = 35;
  const slice = products.slice(0, maxProducts);
  const lines = slice.map((p, i) => {
    const mark = p.is_available !== false ? '✅' : '❌';
    return `${i + 1}. ${p.name_uz} - ${p.price} so'm ${mark}`;
  });
  let text = lines.join('\n');
  if (products.length > maxProducts) {
    text += `\n\n... yana ${products.length - maxProducts} ta (tugmalar faqat yuqoridagilar uchun)`;
  }
  if (text.length > 3800) {
    text = `${text.slice(0, 3770)}…`;
  }

  const keyboard = slice.map((p) => [
    { text: '✏️ Narx', callback_data: cbPrice(String(p._id)) },
    { text: "🚫 O'chirish", callback_data: cbDelAsk(String(p._id)) },
  ]);

  await botInstance.sendMessage(chatId, text, { reply_markup: { inline_keyboard: keyboard } });
}

async function listCategoriesAdmin(chatId) {
  const cats = await Category.find().sort({ createdAt: 1 }).lean();
  if (!cats.length) {
    await botInstance.sendMessage(chatId, "Kategoriyalar yo'q.", { reply_markup: ADMIN_KEYBOARD });
    return;
  }
  const lines = cats.map((c, i) => `${i + 1}. ${c.name_uz} / ${c.name_ru}`);
  await botInstance.sendMessage(chatId, `📁 Kategoriyalar:\n\n${lines.join('\n')}`, {
    reply_markup: ADMIN_KEYBOARD,
  });
}

async function startAddProduct(chatId, userId) {
  const cats = await Category.find().sort({ createdAt: 1 }).lean();
  if (!cats.length) {
    await botInstance.sendMessage(
      chatId,
      "Avval kategoriya qo'shing.",
      { reply_markup: ADMIN_KEYBOARD }
    );
    return;
  }
  setState(userId, { type: 'add_product', step: 'pick_category', categoryId: null, name_uz: '', name_ru: '', price: null, image_url: '' });
  const rows = cats.map((c) => [{ text: c.name_uz, callback_data: cbPickCat(String(c._id)) }]);
  await botInstance.sendMessage(chatId, 'Kategoriyani tanlang:', { reply_markup: { inline_keyboard: rows } });
}

async function startAddCategory(chatId, userId) {
  setState(userId, { type: 'add_category', step: 'name_uz', name_uz: '', name_ru: '' });
  await botInstance.sendMessage(chatId, "Kategoriya nomini kiriting (o'zbekcha):", {
    reply_markup: ADMIN_KEYBOARD,
  });
}

/**
 * @returns {Promise<boolean>} true if handled
 */
async function handleAdminCallback(query) {
  const data = query.data;
  const chatId = query.message?.chat?.id;
  const userId = query.from?.id;
  if (!data || chatId == null || userId == null || !isAdmin(userId)) return false;

  if (!data.startsWith('adm_')) return false;

  const answer = async (text, alert = false) => {
    try {
      await botInstance.answerCallbackQuery(query.id, { text: text || '', show_alert: alert });
    } catch (_) {
      /* ignore */
    }
  };

  const mPrice = data.match(/^adm_p_(.+)$/);
  const mDelAsk = data.match(/^adm_d_(.+)$/);
  const mDelConf = data.match(/^adm_dc_(.+)$/);
  const mDelCan = data.match(/^adm_dx_(.+)$/);
  const mCat = data.match(/^adm_c_(.+)$/);

  if (mPrice) {
    const pid = mPrice[1];
    if (!mongoose.isValidObjectId(pid)) {
      await answer("Noto'g'ri ID", true);
      return true;
    }
    setState(userId, { type: 'await_price', productId: pid });
    await answer();
    await botInstance.sendMessage(chatId, "Yangi narxni kiriting (faqat raqam):", {
      reply_markup: ADMIN_KEYBOARD,
    });
    return true;
  }

  if (mDelAsk) {
    const pid = mDelAsk[1];
    if (!mongoose.isValidObjectId(pid)) {
      await answer("Noto'g'ri ID", true);
      return true;
    }
    await answer();
    await botInstance.sendMessage(chatId, "Mahsulotni o'chirishni tasdiqlaysizmi?", {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Ha', callback_data: cbDelConfirm(pid) },
            { text: "❌ Yo'q", callback_data: cbDelCancel(pid) },
          ],
        ],
      },
    });
    return true;
  }

  if (mDelConf) {
    const pid = mDelConf[1];
    if (!mongoose.isValidObjectId(pid)) {
      await answer("Noto'g'ri ID", true);
      return true;
    }
    await Product.findByIdAndDelete(pid);
    await answer("O'chirildi");
    await botInstance.sendMessage(chatId, "✅ Mahsulot o'chirildi.", { reply_markup: ADMIN_KEYBOARD });
    return true;
  }

  if (mDelCan) {
    await answer("Bekor qilindi");
    await botInstance.sendMessage(chatId, "O'chirish bekor qilindi.", { reply_markup: ADMIN_KEYBOARD });
    return true;
  }

  if (mCat) {
    const cid = mCat[1];
    if (!mongoose.isValidObjectId(cid)) {
      await answer("Noto'g'ri kategoriya", true);
      return true;
    }
    const st = getState(userId);
    if (st.type !== 'add_product' || st.step !== 'pick_category') {
      await answer();
      return true;
    }
    setState(userId, {
      type: 'add_product',
      step: 'name_uz',
      categoryId: cid,
      name_uz: '',
      name_ru: '',
      price: null,
      image_url: '',
    });
    await answer();
    await botInstance.sendMessage(chatId, "Mahsulot nomini kiriting (o'zbekcha):", {
      reply_markup: ADMIN_KEYBOARD,
    });
    return true;
  }

  await answer();
  return true;
}

async function handleAdminMessage(msg) {
  const from = msg.from;
  if (!from) return false;
  const userId = from.id;
  const chatId = msg.chat.id;
  if (!isAdmin(userId)) return false;

  const text = msg.text != null ? String(msg.text).trim() : '';
  const st = getState(userId);

  if (text === '/cleanup' || text === '🗑 Tozalash') {
    const deletedCount = await deleteOldOrders();
    await botInstance.sendMessage(
      chatId,
      `🗑 ${ORDER_RETENTION_DAYS} kundan eski buyurtmalar o'chirildi: ${deletedCount} ta`,
      { reply_markup: ADMIN_KEYBOARD }
    );
    return true;
  }

  if (st.type === 'await_price') {
    const n = Number(text.replace(/\s/g, '').replace(/,/g, ''));
    if (!Number.isFinite(n) || n < 0) {
      await botInstance.sendMessage(chatId, 'Faqat musbat raqam kiriting.');
      return true;
    }
    await Product.findByIdAndUpdate(st.productId, { price: n });
    clearAdminState(userId);
    await botInstance.sendMessage(chatId, `✅ Narx yangilandi: ${n} so'm`, { reply_markup: ADMIN_KEYBOARD });
    return true;
  }

  if (st.type === 'add_product') {
    if (st.step === 'name_uz') {
      if (!text) {
        await botInstance.sendMessage(chatId, "Nom bo'sh bo'lmasin.");
        return true;
      }
      setState(userId, { ...st, step: 'name_ru', name_uz: text });
      await botInstance.sendMessage(chatId, 'Mahsulot nomini kiriting (ruscha):', {
        reply_markup: ADMIN_KEYBOARD,
      });
      return true;
    }
    if (st.step === 'name_ru') {
      if (!text) {
        await botInstance.sendMessage(chatId, "Nom bo'sh bo'lmasin.");
        return true;
      }
      setState(userId, { ...st, step: 'price', name_ru: text });
      await botInstance.sendMessage(chatId, "Narxini kiriting (so'm, faqat raqam):", {
        reply_markup: ADMIN_KEYBOARD,
      });
      return true;
    }
    if (st.step === 'price') {
      const n = Number(text.replace(/\s/g, '').replace(/,/g, ''));
      if (!Number.isFinite(n) || n < 0) {
        await botInstance.sendMessage(chatId, 'Faqat musbat raqam kiriting.');
        return true;
      }
      setState(userId, { ...st, step: 'image', price: n });
      await botInstance.sendMessage(
        chatId,
        "Rasm URL ni kiriting (yoki 'skip' yozing):",
        { reply_markup: ADMIN_KEYBOARD }
      );
      return true;
    }
    if (st.step === 'image') {
      const url = /^skip$/i.test(text) ? '' : text;
      if (url && !/^https?:\/\//i.test(url)) {
        await botInstance.sendMessage(chatId, "URL 'http...' yoki 'https...' bilan boshlansin yoki 'skip' yozing.");
        return true;
      }
      await Product.create({
        category_id: st.categoryId,
        name_uz: st.name_uz,
        name_ru: st.name_ru,
        price: st.price,
        image_url: url,
        is_available: true,
      });
      clearAdminState(userId);
      await botInstance.sendMessage(chatId, "✅ Mahsulot qo'shildi!", { reply_markup: ADMIN_KEYBOARD });
      return true;
    }
    return true;
  }

  if (st.type === 'add_category') {
    if (st.step === 'name_uz') {
      if (!text) {
        await botInstance.sendMessage(chatId, "Nom bo'sh bo'lmasin.");
        return true;
      }
      setState(userId, { type: 'add_category', step: 'name_ru', name_uz: text, name_ru: '' });
      await botInstance.sendMessage(chatId, 'Kategoriya nomini kiriting (ruscha):', {
        reply_markup: ADMIN_KEYBOARD,
      });
      return true;
    }
    if (st.step === 'name_ru') {
      if (!text) {
        await botInstance.sendMessage(chatId, "Nom bo'sh bo'lmasin.");
        return true;
      }
      await Category.create({ name_uz: st.name_uz, name_ru: text, image_url: '' });
      clearAdminState(userId);
      await botInstance.sendMessage(chatId, "✅ Kategoriya qo'shildi!", { reply_markup: ADMIN_KEYBOARD });
      return true;
    }
    return true;
  }

  if (text === '/admin') {
    await sendAdminMenu(chatId);
    return true;
  }

  if (text === '📋 Mahsulotlar') {
    await listProductsAdmin(chatId);
    return true;
  }

  if (text === "➕ Mahsulot qo'shish") {
    await startAddProduct(chatId, userId);
    return true;
  }

  if (text === '📁 Kategoriyalar') {
    await listCategoriesAdmin(chatId);
    return true;
  }

  if (text === "➕ Kategoriya qo'shish") {
    await startAddCategory(chatId, userId);
    return true;
  }

  if (st.type !== 'idle') {
    await botInstance.sendMessage(chatId, 'Avval jarayonni tugating yoki /admin menyuni oching.', {
      reply_markup: ADMIN_KEYBOARD,
    });
    return true;
  }

  return false;
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
    const uid = query.from?.id;
    if (uid != null && isAdmin(uid)) {
      const handled = await handleAdminCallback(query);
      if (handled) return;
    }

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

  botInstance.on('message', async (msg) => {
    if (!msg.chat || msg.chat.type !== 'private') return;
    try {
      const text = msg.text != null ? String(msg.text).trim() : '';
      if (text === '/start' || text.startsWith('/start ')) {
        await handleStart(msg);
        return;
      }
      await handleAdminMessage(msg);
    } catch (err) {
      console.error('admin message handler:', err);
    }
  });

  botInstance.on('polling_error', (err) => {
    console.error('Telegram polling error:', err.message || err);
  });

  if (!getAdminId()) {
    console.warn('ADMIN_CHAT_ID is not set; /admin and admin tugmalari ishlamaydi.');
  }

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
