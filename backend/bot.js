// Local dev: polling. For production webhook, switch options per node-telegram-bot-api docs.
const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const Order = require('./models/Order');
const Category = require('./models/Category');
const Product = require('./models/Product');
const AppSetting = require('./models/AppSetting');
const { deleteOldOrders, ORDER_RETENTION_DAYS } = require('./orderCleanup');

let botInstance = null;

/** @type {Map<number, object>} */
const adminState = new Map();

/** Asosiy admin (katalog, P2P karta, tozalash) */
const ADMIN_KEYBOARD_MAIN = {
  keyboard: [
    [{ text: '📦 Katalog' }],
    [{ text: '💳 P2P karta' }],
    [{ text: '🗑 Tozalash' }],
  ],
  resize_keyboard: true,
};

const KB_P2P_EDIT_CANCEL = {
  keyboard: [[{ text: '⬅️ Bekor' }]],
  resize_keyboard: true,
};

/** Katalog: kategoriyalar ro'yxati */
const ADMIN_KB_CATALOG_ROOT = {
  keyboard: [[{ text: '⬅️ Asosiy menyu' }], [{ text: "➕ Kategoriya qo'shish" }]],
  resize_keyboard: true,
};

const REMOVE_REPLY_KEYBOARD = { remove_keyboard: true };

/** Reply menyuni yechish — xabar chatda qolmaydi (darhol o'chiriladi). */
async function hideReplyKeyboardEphemeral(chatId) {
  try {
    const sent = await botInstance.sendMessage(chatId, '\u2060', { reply_markup: REMOVE_REPLY_KEYBOARD });
    try {
      await botInstance.deleteMessage(chatId, sent.message_id);
    } catch (_) {
      /* ignore */
    }
  } catch (_) {
    /* ignore */
  }
}

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

async function getOrCreateAppSettings() {
  let d = await AppSetting.findOne();
  if (!d) {
    d = await AppSetting.create({ p2p_card_number: '', p2p_card_owner: '' });
  }
  return d;
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

/** Yangi P2P buyurtma (chek kutilmoqda) — admin xabari */
function formatP2pNewPendingPaymentAdminMessage(order) {
  const username = order.telegram_username && String(order.telegram_username).trim();
  const userLine = username ? `@${username}` : '—';
  const lines = [
    `💳 YANGI P2P BUYURTMA #${order._id}`,
    `👤 ${userLine}`,
    `📞 ${order.phone}`,
    `📍 Manzil: ${order.address}`,
    '',
    '🛒 Buyurtma:',
  ];
  for (const item of order.items) {
    const lineTotal = item.price * item.qty;
    lines.push(`- ${item.name} x${item.qty} = ${lineTotal} so'm`);
  }
  lines.push('', `💰 ${order.total_price} so'm`, '', '⏳ Chek kutilmoqda...');
  return appendYandexMapsLinkToAdminOrderMessage(lines.join('\n'), order.address);
}

/** Mijoz P2P kutilayotgan buyurtmani mini-appdan o'chirganda */
function formatP2pPendingDeletedByClientAdminMessage(order) {
  const username = order.telegram_username && String(order.telegram_username).trim();
  const userLine = username ? `@${username}` : '—';
  const lines = [
    "⚠️ P2P: mijoz to'lov kutilayotgan buyurtmani o'chirdi (chek yuborilmagan).",
    `📋 #${order._id}`,
    `👤 ${userLine} · 📞 ${order.phone}`,
    `💰 ${order.total_price} so'm`,
  ];
  return lines.join('\n');
}

/** Mijoz to'lov/chek ko'rsatmalari ekranidan chiqib ketdi (buyurtma hali DB da) */
function formatP2pCheckoutDismissedAdminMessage(order) {
  const username = order.telegram_username && String(order.telegram_username).trim();
  const userLine = username ? `@${username}` : '—';
  const lines = [
    "⚠️ P2P: mijoz to'lov qadamlaridan chiqdi (chek hali yuborilmagan; buyurtma kutilmoqda).",
    `📋 #${order._id}`,
    `👤 ${userLine} · 📞 ${order.phone}`,
    `💰 ${order.total_price} so'm`,
  ];
  return lines.join('\n');
}

const P2P_RECEIPT_WINDOW_MS = 30 * 60 * 1000;

async function findRecentPendingP2pOrder(telegramUserId) {
  const since = new Date(Date.now() - P2P_RECEIPT_WINDOW_MS);
  return Order.findOne({
    telegram_user_id: telegramUserId,
    status: { $in: ['pending', 'pending_payment'] },
    payment_method: { $regex: /^p2p$/i },
    createdAt: { $gte: since },
  })
    .sort({ createdAt: -1 })
    .exec();
}

/**
 * Mijoz P2P buyurtmasi uchun chek-rasm yuboradi.
 * @returns {Promise<boolean>} true agar rasm qayta ishlangan bo'lsa
 */
async function handleCustomerP2pPhoto(msg) {
  if (!botInstance || !msg.chat || msg.chat.type !== 'private') return false;
  if (!msg.photo || !msg.photo.length) return false;
  const from = msg.from;
  if (!from) return false;

  const order = await findRecentPendingP2pOrder(from.id);
  if (!order) return false;

  const adminChatId = getAdminId();
  if (!adminChatId) {
    await botInstance.sendMessage(
      msg.chat.id,
      "⚠️ Admin sozlanmagan. Chekni yuborish hozircha ishlamaydi — ADMIN_CHAT_ID ni .env da qo'ying."
    );
    return true;
  }

  const fileId = msg.photo[msg.photo.length - 1].file_id;
  const username = order.telegram_username && String(order.telegram_username).trim();
  const userLine = username ? `@${username}` : `(id: ${order.telegram_user_id})`;
  const orderShort = String(order._id).slice(-6);
  
  // Build full order details caption
  const orderLines = [
    "💳 P2P TO'LOV CHEKI",
    `📋 Buyurtma: #${orderShort}`,
    `👤 Mijoz: ${userLine}`,
    `📞 Tel: ${order.phone}`,
    `📍 Manzil: ${order.address}`,
    '',
    '🛒 Buyurtma:',
  ];
  for (const item of order.items) {
    const lineTotal = item.price * item.qty;
    orderLines.push(`- ${item.name} x${item.qty} = ${lineTotal} so'm`);
  }
  orderLines.push('');
  orderLines.push(`💰 Jami: ${order.total_price} so'm`);
  orderLines.push(`💳 To'lov: ${order.payment_method}`);
  orderLines.push('');
  orderLines.push('✅ Chek yuklandi — tasdiqlang yoki rad eting.');
  
  const caption = orderLines.join('\n');

  const prevStatus = order.status;
  order.status = 'receipt_sent';
  await order.save();
  try {
    await botInstance.sendPhoto(adminChatId, fileId, {
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
  } catch (err) {
    order.status = prevStatus;
    await order.save();
    console.error('handleCustomerP2pPhoto sendPhoto:', err);
    await botInstance.sendMessage(
      msg.chat.id,
      "⚠️ Chekni adminga yuborishda xatolik. Internetni tekshirib, qayta urinib ko'ring."
    );
    return true;
  }

  await botInstance.sendMessage(msg.chat.id, "✅ Chekingiz adminga yuborildi. Tasdiqlanishini kuting!");
  return true;
}

/**
 * Mini-app / bot cheki: receipt_confirm_ORDERID / receipt_reject_ORDERID (pending_payment yoki receipt_sent).
 * @returns {Promise<boolean>}
 */
async function handleReceiptFlowCallback(query) {
  const data = query.data;
  const ok = data && /^receipt_confirm_(.+)$/.exec(data);
  const rej = data && /^receipt_reject_(.+)$/.exec(data);
  if (!ok && !rej) return false;

  const uid = query.from?.id;
  if (uid == null || !isAdmin(uid)) {
    try {
      await botInstance.answerCallbackQuery(query.id, { text: 'Faqat admin', show_alert: false });
    } catch (_) {
      /* ignore */
    }
    return true;
  }

  const orderId = ok ? ok[1] : rej[1];
  const msg = query.message;
  const chatId = msg?.chat?.id;
  const messageId = msg?.message_id;
  if (!mongoose.isValidObjectId(orderId) || chatId == null || messageId == null) {
    try {
      await botInstance.answerCallbackQuery(query.id, { text: "Noto'g'ri ma'lumot", show_alert: false });
    } catch (_) {
      /* ignore */
    }
    return true;
  }

  try {
    const order = await Order.findById(orderId);
    if (!order) {
      await botInstance.answerCallbackQuery(query.id, { text: 'Buyurtma topilmadi', show_alert: false });
      return true;
    }

    if (String(order.payment_method || '').trim().toLowerCase() !== 'p2p') {
      await botInstance.answerCallbackQuery(query.id, { text: 'P2P buyurtma emas', show_alert: false });
      return true;
    }

    if (order.status !== 'pending_payment' && order.status !== 'receipt_sent') {
      await botInstance.answerCallbackQuery(query.id, { text: 'Buyurtma allaqachon qayta ishlangan', show_alert: false });
      return true;
    }

    const prevCaption = msg.caption || '';
    const emptyKeyboard = { inline_keyboard: [] };

    if (ok) {
      /** Mini-appda «Tayyorlanmoqda» ko'rinishi uchun (tayyor tugmasi gacha) */
      order.status = 'preparing';
      await order.save();

      const suffix = "\n\n✅ To'lov tasdiqlandi";
      const newCaption = (prevCaption || "💳 P2P") + suffix;
      if (msg.photo && msg.photo.length) {
        await botInstance.editMessageCaption(newCaption, {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: emptyKeyboard,
        });
      } else {
        await botInstance.editMessageText(newCaption, {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: emptyKeyboard,
        });
      }

      await botInstance.answerCallbackQuery(query.id);

      await botInstance.sendMessage(
        order.telegram_user_id,
        "✅ To'lov tasdiqlandi. Buyurtma tayyorlanmoqda — tayyor bo'lsag qisqa xabar beramiz."
      );

      const adminNotify = appendYandexMapsLinkToAdminOrderMessage(
        formatAdminOrderMessage(order),
        order.address
      );
      await botInstance.sendMessage(chatId, `${adminNotify}\n\n✅ P2P to'lov qabul qilindi.`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ Buyurtma tayyor (mijozga xabar)', callback_data: `order_ready_${order._id}` }],
          ],
        },
      });
      return true;
    }

    order.status = 'cancelled';
    await order.save();

    const rejSuffix = "\n\n❌ To'lov rad etildi";
    const rejCaption = (prevCaption || "💳 P2P") + rejSuffix;
    if (msg.photo && msg.photo.length) {
      await botInstance.editMessageCaption(rejCaption, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: emptyKeyboard,
      });
    } else {
      await botInstance.editMessageText(rejCaption, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: emptyKeyboard,
      });
    }

    await botInstance.answerCallbackQuery(query.id);

    await botInstance.sendMessage(
      order.telegram_user_id,
      "❌ To'lov tasdiqlanmadi. Qayta urinib ko'ring"
    );
    return true;
  } catch (err) {
    console.error('handleReceiptFlowCallback:', err);
    try {
      await botInstance.answerCallbackQuery(query.id, { text: 'Xatolik', show_alert: false });
    } catch (_) {
      /* ignore */
    }
    return true;
  }
}

const ORDER_READY_FROM_STATUSES = ['paid', 'confirmed', 'preparing'];

/**
 * Admin buyurtmani tayyor deb mijozga xabar yuboradi.
 * callback_data: order_ready_ORDERID
 * @returns {Promise<boolean>}
 */
async function handleOrderReadyCallback(query) {
  const data = query.data;
  const m = data && /^order_ready_(.+)$/.exec(data);
  if (!m) return false;

  const uid = query.from?.id;
  if (uid == null || !isAdmin(uid)) {
    try {
      await botInstance.answerCallbackQuery(query.id, { text: 'Faqat admin', show_alert: false });
    } catch (_) {
      /* ignore */
    }
    return true;
  }

  const orderId = m[1];
  const msg = query.message;
  const chatId = msg?.chat?.id;
  const messageId = msg?.message_id;
  const prevText = msg?.text != null ? String(msg.text) : '';

  if (!mongoose.isValidObjectId(orderId) || chatId == null || messageId == null) {
    try {
      await botInstance.answerCallbackQuery(query.id, { text: "Noto'g'ri ma'lumot", show_alert: false });
    } catch (_) {
      /* ignore */
    }
    return true;
  }

  try {
    const order = await Order.findById(orderId);
    if (!order) {
      await botInstance.answerCallbackQuery(query.id, { text: 'Buyurtma topilmadi', show_alert: false });
      return true;
    }

    if (order.status === 'ready' || order.status === 'delivered') {
      await botInstance.answerCallbackQuery(query.id, { text: 'Allaqachon tayyor deb yuborilgan', show_alert: false });
      return true;
    }

    if (!ORDER_READY_FROM_STATUSES.includes(order.status)) {
      await botInstance.answerCallbackQuery(query.id, {
        text: `Bu holatda mumkin emas (${order.status})`,
        show_alert: false,
      });
      return true;
    }

    order.status = 'ready';
    await order.save();

    let customerNotified = true;
    try {
      await botInstance.sendMessage(order.telegram_user_id, "✅ Buyurtmangiz tayyor! Rahmat ☕");
    } catch (sendErr) {
      customerNotified = false;
      console.warn('order_ready customer notify:', sendErr?.message || sendErr);
    }

    const suffix = customerNotified
      ? '\n\n✅ Mijozga «buyurtma tayyor» xabari yuborildi.'
      : "\n\n⚠️ Holat «tayyor» saqlandi, lekin mijozga xabar yuborilmadi.";
    const newText = (prevText || '') + suffix;

    await botInstance.editMessageText(newText, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: [] },
    });

    await botInstance.answerCallbackQuery(query.id);
  } catch (err) {
    console.error('handleOrderReadyCallback:', err);
    try {
      await botInstance.answerCallbackQuery(query.id, { text: 'Xatolik', show_alert: false });
    } catch (_) {
      /* ignore */
    }
  }
  return true;
}

/**
 * P2P chek inline tugmalari (faqat admin) — p2pok_/p2px_ (legacy + pending).
 * @returns {Promise<boolean>}
 */
async function handleP2pReceiptCallback(query) {
  const data = query.data;
  const p2pOk = data && /^p2pok_(.+)$/.exec(data);
  const p2pReject = data && /^p2px_(.+)$/.exec(data);
  if (!p2pOk && !p2pReject) return false;

  const uid = query.from?.id;
  if (uid == null || !isAdmin(uid)) {
    try {
      await botInstance.answerCallbackQuery(query.id, { text: 'Faqat admin', show_alert: false });
    } catch (_) {
      /* ignore */
    }
    return true;
  }

  const orderId = p2pOk ? p2pOk[1] : p2pReject[1];
  const msg = query.message;
  const chatId = msg?.chat?.id;
  const messageId = msg?.message_id;
  if (!mongoose.isValidObjectId(orderId) || chatId == null || messageId == null) {
    try {
      await botInstance.answerCallbackQuery(query.id, { text: "Noto'g'ri ma'lumot", show_alert: false });
    } catch (_) {
      /* ignore */
    }
    return true;
  }

  try {
    const order = await Order.findById(orderId);
    if (!order) {
      await botInstance.answerCallbackQuery(query.id, { text: 'Buyurtma topilmadi', show_alert: false });
      return true;
    }

    if (String(order.payment_method || '').trim().toLowerCase() !== 'p2p') {
      await botInstance.answerCallbackQuery(query.id, { text: 'P2P buyurtma emas', show_alert: false });
      return true;
    }

    if (
      order.status !== 'pending' &&
      order.status !== 'pending_payment' &&
      order.status !== 'receipt_sent'
    ) {
      await botInstance.answerCallbackQuery(query.id, { text: 'Buyurtma allaqachon qayta ishlangan', show_alert: false });
      return true;
    }

    const prevCaption = msg.caption || '';
    const emptyKeyboard = { inline_keyboard: [] };

    if (p2pOk) {
      order.status = 'preparing';
      await order.save();

      const suffix = "\n\n✅ To'lov tasdiqlandi";
      const newCaption = (prevCaption || "💳 P2P") + suffix;
      if (msg.photo && msg.photo.length) {
        await botInstance.editMessageCaption(newCaption, {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: emptyKeyboard,
        });
      } else {
        await botInstance.editMessageText(newCaption, {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: emptyKeyboard,
        });
      }

      await botInstance.answerCallbackQuery(query.id);

      await botInstance.sendMessage(
        order.telegram_user_id,
        "✅ To'lov tasdiqlandi. Buyurtma tayyorlanmoqda — tayyor bo'lsag qisqa xabar beramiz."
      );

      const adminNotify = appendYandexMapsLinkToAdminOrderMessage(
        formatAdminOrderMessage(order),
        order.address
      );
      await botInstance.sendMessage(chatId, `${adminNotify}\n\n✅ P2P to'lov qabul qilindi.`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ Buyurtma tayyor (mijozga xabar)', callback_data: `order_ready_${order._id}` }],
          ],
        },
      });
      return true;
    }

    order.status = 'cancelled';
    await order.save();

    const rejSuffix = "\n\n❌ To'lov rad etildi";
    const rejCaption = (prevCaption || "💳 P2P") + rejSuffix;
    if (msg.photo && msg.photo.length) {
      await botInstance.editMessageCaption(rejCaption, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: emptyKeyboard,
      });
    } else {
      await botInstance.editMessageText(rejCaption, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: emptyKeyboard,
      });
    }

    await botInstance.answerCallbackQuery(query.id);

    await botInstance.sendMessage(
      order.telegram_user_id,
      "❌ To'lov tasdiqlanmadi. Qayta urinib ko'ring"
    );
    return true;
  } catch (err) {
    console.error('handleP2pReceiptCallback:', err);
    try {
      await botInstance.answerCallbackQuery(query.id, { text: 'Xatolik', show_alert: false });
    } catch (_) {
      /* ignore */
    }
    return true;
  }
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
/** Katalogda kategoriyani ochish (mahsulotlar ro'yxati) */
function cbGotoCategory(cid) {
  return `adm_g_${cid}`;
}
/** Katalog ildiziga (kategoriyalar ro'yxati) */
const CB_ADMIN_BACK_ROOT = 'adm_back_root';
const CB_ADMIN_MAIN_MENU = 'adm_main_menu';
const CB_ADMIN_NEW_CATEGORY = 'adm_new_category';
/** Shu kategoriyada mahsulot qo'shish */
function cbAddProductInCategory(cid) {
  return `adm_ap_${cid}`;
}
/** Kategoriya tahrirlash */
function cbEditCategory(cid) {
  return `adm_ec_${cid}`;
}
function cbEditCategoryNameUz(cid) {
  return `adm_ecnu_${cid}`;
}
function cbEditCategoryNameRu(cid) {
  return `adm_ecnr_${cid}`;
}
function cbDeleteCategory(cid) {
  return `adm_dlc_${cid}`;
}
function cbDeleteCategoryConfirm(cid) {
  return `adm_dlcc_${cid}`;
}
function cbDeleteCategoryCancel(cid) {
  return `adm_dlxc_${cid}`;
}
/** Mahsulot boshqaruv menyusi */
function cbSelectProduct(pid) {
  return `adm_s_${pid}`;
}
function cbEditNameUz(pid) {
  return `adm_eu_${pid}`;
}
function cbToggleSale(pid) {
  return `adm_tv_${pid}`;
}
function cbEditImage(pid) {
  return `adm_im_${pid}`;
}

/** Telegram inline tugma matni ≤64 belgi */
function truncateButtonText(label, maxLen = 64) {
  const s = String(label ?? '').trim() || '—';
  if (s.length <= maxLen) return s;
  return `${s.slice(0, maxLen - 1)}…`;
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

/** Kategoriyalar + inline tanlash */
async function sendCatalogRoot(chatId, userId) {
  const cats = await Category.find().sort({ createdAt: 1 }).lean();
  setState(userId, { type: 'catalog_root' });
  if (!cats.length) {
    await botInstance.sendMessage(
      chatId,
      "📦 Katalog bo'sh. Kategoriya qo'shing.",
      { reply_markup: ADMIN_KB_CATALOG_ROOT }
    );
    return;
  }
  const rows = cats.map((c) => [
    { text: c.name_uz, callback_data: cbGotoCategory(String(c._id)) },
    { text: '✏️', callback_data: cbEditCategory(String(c._id)) },
  ]);
  rows.push([{ text: '⬅️ Asosiy menyu', callback_data: CB_ADMIN_MAIN_MENU }]);
  rows.push([{ text: "➕ Kategoriya qo'shish", callback_data: CB_ADMIN_NEW_CATEGORY }]);
  await hideReplyKeyboardEphemeral(chatId);
  await botInstance.sendMessage(chatId, '📦 Katalog — kategoriyani tanlang:', {
    reply_markup: { inline_keyboard: rows },
  });
}

/** Bitta kategoriya ichidagi mahsulotlar (nom bo'yicha tugmalar) */
async function sendCatalogCategoryView(chatId, userId, categoryId) {
  if (!mongoose.isValidObjectId(categoryId)) {
    await botInstance.sendMessage(chatId, "Noto'g'ri kategoriya.", { reply_markup: ADMIN_KB_CATALOG_ROOT });
    return;
  }
  const cat = await Category.findById(categoryId).lean();
  if (!cat) {
    await botInstance.sendMessage(chatId, 'Kategoriya topilmadi.', { reply_markup: ADMIN_KB_CATALOG_ROOT });
    return;
  }

  const products = await Product.find({ category_id: categoryId }).sort({ createdAt: 1 }).lean();
  setState(userId, { type: 'catalog_view', categoryId: String(categoryId) });

  const footerRows = [
    [{ text: '⬅️ Kategoriyalar', callback_data: CB_ADMIN_BACK_ROOT }],
    [{ text: "➕ Mahsulot qo'shish", callback_data: cbAddProductInCategory(String(categoryId)) }],
  ];

  if (!products.length) {
    await botInstance.sendMessage(chatId, `📁 ${cat.name_uz}\n\nBu kategoriyada mahsulot yo'q.`, {
      reply_markup: { inline_keyboard: footerRows },
    });
    return;
  }

  const maxProducts = 40;
  const slice = products.slice(0, maxProducts);
  let text = `📁 ${cat.name_uz}\n\n${slice.length} ta mahsulot. Boshqarish uchun nomini bosing:`;
  if (products.length > maxProducts) {
    text += `\n\n(yana ${products.length - maxProducts} ta — keyinroq qo'shiladi)`;
  }

  const keyboard = slice.map((p) => [
    { text: truncateButtonText(p.name_uz), callback_data: cbSelectProduct(String(p._id)) },
  ]);
  keyboard.push(...footerRows);

  await botInstance.sendMessage(chatId, text, { reply_markup: { inline_keyboard: keyboard } });
}

/** Kategoriya tahrirlash menyusi */
async function sendCategoryEditMenu(chatId, userId, categoryId) {
  if (!mongoose.isValidObjectId(categoryId)) {
    await botInstance.sendMessage(chatId, "Noto'g'ri kategoriya.", { reply_markup: ADMIN_KB_CATALOG_ROOT });
    return;
  }
  const cat = await Category.findById(categoryId).lean();
  if (!cat) {
    await botInstance.sendMessage(chatId, 'Kategoriya topilmadi.', { reply_markup: ADMIN_KB_CATALOG_ROOT });
    return;
  }

  setState(userId, { type: 'edit_category', categoryId: String(categoryId) });

  const iconLine = cat.image_url ? `\n🎨 Icon: ${cat.image_url}` : "\n🎨 Icon: yo'q";
  const caption = `📁 ${cat.name_uz}\n🇷🇺 ${cat.name_ru || '—'}${iconLine}\n\n✏️ Nom tahrirlashda: "🎨 Nom" formatida yuboring (masalan: "🍕 Pizza")`;

  const reply_markup = {
    inline_keyboard: [
      [{ text: "✏️ Nom (O'zb)", callback_data: cbEditCategoryNameUz(categoryId) }],
      [{ text: '✏️ Nom (Rus)', callback_data: cbEditCategoryNameRu(categoryId) }],
      [{ text: "🚫 O'chirish", callback_data: cbDeleteCategory(categoryId) }],
      [{ text: '⬅️ Kategoriyalar', callback_data: CB_ADMIN_BACK_ROOT }],
    ],
  };

  await botInstance.sendMessage(chatId, caption, { reply_markup });
}

async function startEditCategoryNameUz(chatId, userId, categoryId) {
  if (!mongoose.isValidObjectId(categoryId)) {
    await botInstance.sendMessage(chatId, "Noto'g'ri kategoriya.", { reply_markup: ADMIN_KB_CATALOG_ROOT });
    return;
  }
  const cat = await Category.findById(categoryId).lean();
  if (!cat) {
    await botInstance.sendMessage(chatId, 'Kategoriya topilmadi.', { reply_markup: ADMIN_KB_CATALOG_ROOT });
    return;
  }
  setState(userId, {
    type: 'edit_category_name_uz',
    categoryId: String(categoryId),
  });
  const icon = cat.image_url || '📁';
  await botInstance.sendMessage(
    chatId,
    `✏️ Kategoriya nomini kiriting:\nHozirgi: ${icon} ${cat.name_uz}\n\nFormat: 🍕 Pizza`
  );
}

async function startEditCategoryNameRu(chatId, userId, categoryId) {
  if (!mongoose.isValidObjectId(categoryId)) {
    await botInstance.sendMessage(chatId, "Noto'g'ri kategoriya.", { reply_markup: ADMIN_KB_CATALOG_ROOT });
    return;
  }
  const cat = await Category.findById(categoryId).lean();
  if (!cat) {
    await botInstance.sendMessage(chatId, 'Kategoriya topilmadi.', { reply_markup: ADMIN_KB_CATALOG_ROOT });
    return;
  }
  setState(userId, {
    type: 'edit_category_name_ru',
    categoryId: String(categoryId),
  });
  const icon = cat.image_url || '📁';
  await botInstance.sendMessage(
    chatId,
    `✏️ Название категории:\nТекущее: ${icon} ${cat.name_ru || '—'}\n\nФормат: 🍕 Пицца`
  );
}

async function startDeleteCategory(chatId, userId, categoryId) {
  if (!mongoose.isValidObjectId(categoryId)) {
    await botInstance.sendMessage(chatId, "Noto'g'ri kategoriya.", { reply_markup: ADMIN_KB_CATALOG_ROOT });
    return;
  }
  const cat = await Category.findById(categoryId).lean();
  if (!cat) {
    await botInstance.sendMessage(chatId, 'Kategoriya topilmadi.', { reply_markup: ADMIN_KB_CATALOG_ROOT });
    return;
  }

  const productCount = await Product.countDocuments({ category_id: categoryId });
  let warning = '';
  if (productCount > 0) {
    warning = `\n\n⚠️ DIQQAT: Bu kategoriyada ${productCount} ta mahsulot bor. Kategoriya o'chirilganda barcha mahsulotlar ham o'chiriladi!`;
  }

  setState(userId, { type: 'delete_category_pending', categoryId: String(categoryId) });
  await botInstance.sendMessage(
    chatId,
    `📁 "${cat.name_uz}" kategoriyasini o'chirishni tasdiqlaysizmi?${warning}`,
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Ha, o'chirish", callback_data: cbDeleteCategoryConfirm(categoryId) },
            { text: "❌ Yo'q", callback_data: cbDeleteCategoryCancel(categoryId) },
          ],
        ],
      },
    }
  );
}

/** Tanlangan mahsulot: tahrirlash / narx / rasm / o'chirish */
async function sendProductAdminMenu(chatId, userId, productId) {
  if (!mongoose.isValidObjectId(productId)) {
    await botInstance.sendMessage(chatId, "Noto'g'ri mahsulot.", { reply_markup: REMOVE_REPLY_KEYBOARD });
    await sendCatalogRoot(chatId, userId);
    return;
  }
  const p = await Product.findById(productId).lean();
  if (!p) {
    await botInstance.sendMessage(chatId, 'Mahsulot topilmadi.', { reply_markup: REMOVE_REPLY_KEYBOARD });
    await sendCatalogRoot(chatId, userId);
    return;
  }
  const cat = await Category.findById(p.category_id).lean();
  const pid = String(p._id);
  const cid = String(p.category_id);
  setState(userId, { type: 'catalog_view', categoryId: cid });

  const onSale = p.is_available !== false;
  const mark = onSale ? '✅ Sotuvda' : '❌ Sotuvda emas';
  const imgLine = p.image_url ? `\n🖼 ${p.image_url}` : "\n🖼 Rasm yo'q";
  const caption = `🛒 ${p.name_uz}\n💰 ${p.price} so'm\n${mark}${imgLine}`;
  const catLine = cat ? cat.name_uz : '—';

  const saleBtn = onSale
    ? { text: '⏸ Sotuvdan olish', callback_data: cbToggleSale(pid) }
    : { text: "✅ Sotuvga qo'shish", callback_data: cbToggleSale(pid) };

  const reply_markup = {
    inline_keyboard: [
      [{ text: "✏️ Nom (O'zb)", callback_data: cbEditNameUz(pid) }],
      [saleBtn],
      [{ text: '💰 Narx', callback_data: cbPrice(pid) }],
      [{ text: '🖼 Rasm (URL)', callback_data: cbEditImage(pid) }],
      [{ text: "🚫 O'chirish", callback_data: cbDelAsk(pid) }],
      [{ text: '⬅️ Mahsulotlar', callback_data: cbGotoCategory(cid) }],
    ],
  };

  const header = `📂 ${catLine}\n\n`;

  if (p.image_url && /^https?:\/\//i.test(String(p.image_url).trim())) {
    try {
      await botInstance.sendPhoto(chatId, String(p.image_url).trim(), {
        caption: `${header}${caption}`,
        reply_markup,
      });
    } catch (_) {
      await botInstance.sendMessage(chatId, `${header}${caption}`, { reply_markup });
    }
  } else {
    await botInstance.sendMessage(chatId, `${header}${caption}`, { reply_markup });
  }
}

async function startAddProductForCategory(chatId, userId, categoryId) {
  if (!mongoose.isValidObjectId(categoryId)) {
    await botInstance.sendMessage(chatId, "Noto'g'ri kategoriya.", { reply_markup: REMOVE_REPLY_KEYBOARD });
    await sendCatalogRoot(chatId, userId);
    return;
  }
  const cat = await Category.findById(categoryId).lean();
  if (!cat) {
    await botInstance.sendMessage(chatId, 'Kategoriya topilmadi.', { reply_markup: REMOVE_REPLY_KEYBOARD });
    await sendCatalogRoot(chatId, userId);
    return;
  }
  setState(userId, {
    type: 'add_product',
    step: 'name_uz',
    categoryId: String(categoryId),
    name_uz: '',
    price: null,
    image_url: '',
  });
  await botInstance.sendMessage(
    chatId,
    `➕ Yangi mahsulot (${cat.name_uz})\n\nMahsulot nomini kiriting (o'zbekcha):`,
    { reply_markup: REMOVE_REPLY_KEYBOARD }
  );
}

/** Kategoriya qo'shish — faqat katalog ildizidan */
async function startAddCategory(chatId, userId) {
  setState(userId, { type: 'add_category', step: 'name_uz', name_uz: '' });
  await botInstance.sendMessage(chatId, "Kategoriya nomini kiriting (o'zbekcha):", {
    reply_markup: ADMIN_KB_CATALOG_ROOT,
  });
}

async function abortWizardToCatalog(chatId, userId, reason) {
  clearAdminState(userId);
  await botInstance.sendMessage(chatId, `❌ ${reason}`);
  await sendCatalogRoot(chatId, userId);
}

/**
 * @returns {Promise<boolean>} true if handled
 */
async function handleAdminCallback(query) {
  const data = query.data;
  const chatId = query.message?.chat?.id;
  const userId = query.from?.id;
  const messageId = query.message?.message_id;
  if (!data || chatId == null || userId == null || !isAdmin(userId)) return false;

  const answer = async (text, alert = false) => {
    try {
      await botInstance.answerCallbackQuery(query.id, { text: text || '', show_alert: alert });
    } catch (_) {
      /* ignore */
    }
  };

  if (data === 'cleanup_confirm') {
    try {
      const { deletedCount, retentionDays } = await deleteOldOrders();
      await answer();
      const resultText =
        `✅ MongoDB tozalandi.\n` +
        `Oxirgi ${retentionDays} kun saqlanadi; jami ${deletedCount} ta eski buyurtma olib tashlandi.`;
      if (messageId != null) {
        try {
          await botInstance.editMessageText(resultText, {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: { inline_keyboard: [] },
          });
        } catch (_) {
          await botInstance.sendMessage(chatId, resultText, { reply_markup: ADMIN_KEYBOARD_MAIN });
        }
      } else {
        await botInstance.sendMessage(chatId, resultText, { reply_markup: ADMIN_KEYBOARD_MAIN });
      }
    } catch (err) {
      console.error('cleanup_confirm:', err);
      await answer('Xatolik', true);
    }
    return true;
  }

  if (data === 'cleanup_cancel') {
    try {
      await answer();
      const cancelText = "❌ Tozalash bekor qilindi.";
      if (messageId != null) {
        try {
          await botInstance.editMessageText(cancelText, {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: { inline_keyboard: [] },
          });
        } catch (_) {
          await botInstance.sendMessage(chatId, cancelText, { reply_markup: ADMIN_KEYBOARD_MAIN });
        }
      } else {
        await botInstance.sendMessage(chatId, cancelText, { reply_markup: ADMIN_KEYBOARD_MAIN });
      }
    } catch (err) {
      console.error('cleanup_cancel:', err);
    }
    return true;
  }

  if (!data.startsWith('adm_')) return false;

  const mGoto = data.match(/^adm_g_(.+)$/);
  const mPrice = data.match(/^adm_p_(.+)$/);
  const mDelAsk = data.match(/^adm_d_(.+)$/);
  const mDelConf = data.match(/^adm_dc_(.+)$/);
  const mDelCan = data.match(/^adm_dx_(.+)$/);

  if (data === CB_ADMIN_MAIN_MENU) {
    await answer();
    clearAdminState(userId);
    await botInstance.sendMessage(chatId, 'Asosiy menyu.', { reply_markup: ADMIN_KEYBOARD_MAIN });
    return true;
  }

  if (data === CB_ADMIN_NEW_CATEGORY) {
    await answer();
    await startAddCategory(chatId, userId);
    return true;
  }

  if (data === CB_ADMIN_BACK_ROOT) {
    await answer();
    await sendCatalogRoot(chatId, userId);
    return true;
  }

  const mAddProd = data.match(/^adm_ap_(.+)$/);
  if (mAddProd) {
    const cid = mAddProd[1];
    if (!mongoose.isValidObjectId(cid)) {
      await answer("Noto'g'ri kategoriya", true);
      return true;
    }
    await answer();
    await startAddProductForCategory(chatId, userId, cid);
    return true;
  }

  if (mGoto) {
    const cid = mGoto[1];
    if (!mongoose.isValidObjectId(cid)) {
      await answer("Noto'g'ri kategoriya", true);
      return true;
    }
    await answer();
    await sendCatalogCategoryView(chatId, userId, cid);
    return true;
  }

  const mEditCat = data.match(/^adm_ec_(.+)$/);
  if (mEditCat) {
    const cid = mEditCat[1];
    if (!mongoose.isValidObjectId(cid)) {
      await answer("Noto'g'ri kategoriya", true);
      return true;
    }
    await answer();
    await sendCategoryEditMenu(chatId, userId, cid);
    return true;
  }

  const mEditCatNameUz = data.match(/^adm_ecnu_(.+)$/);
  if (mEditCatNameUz) {
    const cid = mEditCatNameUz[1];
    if (!mongoose.isValidObjectId(cid)) {
      await answer("Noto'g'ri kategoriya", true);
      return true;
    }
    await answer();
    await startEditCategoryNameUz(chatId, userId, cid);
    return true;
  }

  const mEditCatNameRu = data.match(/^adm_ecnr_(.+)$/);
  if (mEditCatNameRu) {
    const cid = mEditCatNameRu[1];
    if (!mongoose.isValidObjectId(cid)) {
      await answer("Noto'g'ri kategoriya", true);
      return true;
    }
    await answer();
    await startEditCategoryNameRu(chatId, userId, cid);
    return true;
  }

  const mDelCat = data.match(/^adm_dlc_(.+)$/);
  if (mDelCat) {
    const cid = mDelCat[1];
    if (!mongoose.isValidObjectId(cid)) {
      await answer("Noto'g'ri kategoriya", true);
      return true;
    }
    await answer();
    await startDeleteCategory(chatId, userId, cid);
    return true;
  }

  const mDelCatConfirm = data.match(/^adm_dlcc_(.+)$/);
  if (mDelCatConfirm) {
    const cid = mDelCatConfirm[1];
    if (!mongoose.isValidObjectId(cid)) {
      await answer("Noto'g'ri kategoriya", true);
      return true;
    }
    await answer();
    const cat = await Category.findById(cid);
    if (cat) {
      await Category.findByIdAndDelete(cid);
      await Product.deleteMany({ category_id: cid });
      await botInstance.sendMessage(chatId, `✅ Kategoriya va undagi barcha mahsulotlar o'chirildi.`);
    } else {
      await botInstance.sendMessage(chatId, 'Kategoriya topilmadi.');
    }
    clearAdminState(userId);
    await sendCatalogRoot(chatId, userId);
    return true;
  }

  const mDelCatCancel = data.match(/^adm_dlxc_(.+)$/);
  if (mDelCatCancel) {
    const cid = mDelCatCancel[1];
    await answer("Bekor qilindi");
    clearAdminState(userId);
    if (mongoose.isValidObjectId(cid)) {
      await sendCategoryEditMenu(chatId, userId, cid);
    } else {
      await sendCatalogRoot(chatId, userId);
    }
    return true;
  }

  const mSel = data.match(/^adm_s_(.+)$/);
  if (mSel) {
    const pid = mSel[1];
    if (!mongoose.isValidObjectId(pid)) {
      await answer("Noto'g'ri ID", true);
      return true;
    }
    await answer();
    await sendProductAdminMenu(chatId, userId, pid);
    return true;
  }

  const mEu = data.match(/^adm_eu_(.+)$/);
  if (mEu) {
    const pid = mEu[1];
    if (!mongoose.isValidObjectId(pid)) {
      await answer("Noto'g'ri ID", true);
      return true;
    }
    const prod = await Product.findById(pid).select('category_id').lean();
    if (!prod) {
      await answer('Mahsulot topilmadi', true);
      return true;
    }
    setState(userId, {
      type: 'edit_product_name_uz',
      productId: pid,
      categoryId: String(prod.category_id),
    });
    await answer();
    await botInstance.sendMessage(chatId, "Yangi nom (O'zbekcha):", { reply_markup: REMOVE_REPLY_KEYBOARD });
    return true;
  }

  const mTv = data.match(/^adm_tv_(.+)$/);
  if (mTv) {
    const pid = mTv[1];
    if (!mongoose.isValidObjectId(pid)) {
      await answer("Noto'g'ri ID", true);
      return true;
    }
    const prod = await Product.findById(pid).select('is_available').lean();
    if (!prod) {
      await answer('Mahsulot topilmadi', true);
      return true;
    }
    const wasOn = prod.is_available !== false;
    await Product.findByIdAndUpdate(pid, { is_available: !wasOn });
    await answer(wasOn ? "Sotuvdan olindi" : "Sotuvga qo'shildi");
    await sendProductAdminMenu(chatId, userId, pid);
    return true;
  }

  const mIm = data.match(/^adm_im_(.+)$/);
  if (mIm) {
    const pid = mIm[1];
    if (!mongoose.isValidObjectId(pid)) {
      await answer("Noto'g'ri ID", true);
      return true;
    }
    const prod = await Product.findById(pid).select('category_id').lean();
    if (!prod) {
      await answer('Mahsulot topilmadi', true);
      return true;
    }
    setState(userId, {
      type: 'await_product_image',
      productId: pid,
      categoryId: String(prod.category_id),
    });
    await answer();
    await botInstance.sendMessage(chatId, "Rasm URL (https://... yoki 'skip'):", {
      reply_markup: REMOVE_REPLY_KEYBOARD,
    });
    return true;
  }

  if (mPrice) {
    const pid = mPrice[1];
    if (!mongoose.isValidObjectId(pid)) {
      await answer("Noto'g'ri ID", true);
      return true;
    }
    const prod = await Product.findById(pid).select('category_id').lean();
    const categoryIdReturn = prod?.category_id ? String(prod.category_id) : null;
    setState(userId, { type: 'await_price', productId: pid, categoryIdReturn });
    await answer();
    await botInstance.sendMessage(chatId, "Yangi narxni kiriting (faqat raqam):", {
      reply_markup: REMOVE_REPLY_KEYBOARD,
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
    const prod = await Product.findById(pid).select('category_id').lean();
    const catId = prod?.category_id ? String(prod.category_id) : null;
    await Product.findByIdAndDelete(pid);
    await answer("O'chirildi");
    let notice = "✅ Mahsulot o'chirildi.";
    let categoryRemoved = false;
    if (catId && mongoose.isValidObjectId(catId)) {
      const remaining = await Product.countDocuments({ category_id: catId });
      if (remaining === 0) {
        await Category.findByIdAndDelete(catId);
        categoryRemoved = true;
        notice += "\n\n📁 Bu kategoriyada mahsulot qolmagan — kategoriya ham o'chirildi.";
      }
    }
    await botInstance.sendMessage(chatId, notice);
    clearAdminState(userId);
    if (!catId || categoryRemoved) await sendCatalogRoot(chatId, userId);
    else await sendCatalogCategoryView(chatId, userId, catId);
    return true;
  }

  if (mDelCan) {
    const pid = mDelCan[1];
    await answer("Bekor qilindi");
    clearAdminState(userId);
    await botInstance.sendMessage(chatId, "O'chirish bekor qilindi.");
    if (mongoose.isValidObjectId(pid)) await sendProductAdminMenu(chatId, userId, pid);
    else await sendCatalogRoot(chatId, userId);
    return true;
  }

  if (/^adm_c_/.test(data)) {
    await answer("Eski tugma. Katalog → kategoriyadan ➕ Mahsulot qo'shish.", true);
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
    await botInstance.sendMessage(
      chatId,
      `🗑 MongoDB dagi ${ORDER_RETENTION_DAYS} kundan oldingi barcha eski buyurtmalar o'chiriladi (so'nggi ${ORDER_RETENTION_DAYS} kun saqlanadi). Tasdiqlaysizmi?`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ Ha, o'chirish", callback_data: 'cleanup_confirm' },
              { text: "❌ Yo'q", callback_data: 'cleanup_cancel' },
            ],
          ],
        },
      }
    );
    return true;
  }

  if (text === '/admin') {
    clearAdminState(userId);
    await botInstance.sendMessage(chatId, '🔐 Admin panel', { reply_markup: ADMIN_KEYBOARD_MAIN });
    return true;
  }

  if (text === '📦 Katalog') {
    await sendCatalogRoot(chatId, userId);
    return true;
  }

  if (text === '💳 P2P karta') {
    clearAdminState(userId);
    const cur = await getOrCreateAppSettings();
    setState(userId, { type: 'edit_p2p_card', step: 'number' });
    await botInstance.sendMessage(
      chatId,
      `💳 P2P karta (mini-app checkoutda ko'rinadi)\n\nJoriy raqam: ${cur.p2p_card_number || '—'}\nJoriy egasi: ${cur.p2p_card_owner || '—'}\n\nYangi karta raqamini yuboring (bo'sh joy bilan ham bo'lishi mumkin):`,
      { reply_markup: KB_P2P_EDIT_CANCEL }
    );
    return true;
  }

  if (text === '⬅️ Asosiy menyu') {
    clearAdminState(userId);
    await botInstance.sendMessage(chatId, 'Asosiy menyu.', { reply_markup: ADMIN_KEYBOARD_MAIN });
    return true;
  }

  if (text === '⬅️ Kategoriyalar') {
    await sendCatalogRoot(chatId, userId);
    return true;
  }

  if (text === "➕ Kategoriya qo'shish") {
    await startAddCategory(chatId, userId);
    return true;
  }

  if (text === "➕ Mahsulot qo'shish") {
    if (st.type === 'catalog_view' && st.categoryId) {
      await startAddProductForCategory(chatId, userId, st.categoryId);
    } else {
      await botInstance.sendMessage(
        chatId,
        "Avval kategoriya ichiga kiring: 📦 Katalog → kategoriyani tanlang.",
        { reply_markup: st.type === 'catalog_root' ? ADMIN_KB_CATALOG_ROOT : ADMIN_KEYBOARD_MAIN }
      );
    }
    return true;
  }

  if (st.type === 'edit_p2p_card') {
    if (text === '⬅️ Bekor' || /^\/bekor$/i.test(text)) {
      clearAdminState(userId);
      await botInstance.sendMessage(chatId, 'Bekor qilindi.', { reply_markup: ADMIN_KEYBOARD_MAIN });
      return true;
    }
    if (st.step === 'number') {
      if (!text) {
        await botInstance.sendMessage(chatId, 'Karta raqamini kiriting yoki «⬅️ Bekor».', {
          reply_markup: KB_P2P_EDIT_CANCEL,
        });
        return true;
      }
      await AppSetting.findOneAndUpdate({}, { $set: { p2p_card_number: text.trim() } }, { upsert: true });
      setState(userId, { type: 'edit_p2p_card', step: 'owner' });
      await botInstance.sendMessage(
        chatId,
        "✅ Raqam saqlandi.\nKarta egasining ism-familiyasini (F.I.O) yuboring:",
        { reply_markup: KB_P2P_EDIT_CANCEL }
      );
      return true;
    }
    if (st.step === 'owner') {
      if (!text) {
        await botInstance.sendMessage(chatId, "Ism-familiyani kiriting yoki «⬅️ Bekor».", {
          reply_markup: KB_P2P_EDIT_CANCEL,
        });
        return true;
      }
      await AppSetting.findOneAndUpdate({}, { $set: { p2p_card_owner: text.trim() } }, { upsert: true });
      clearAdminState(userId);
      const fin = await getOrCreateAppSettings();
      await botInstance.sendMessage(
        chatId,
        `✅ P2P karta yangilandi.\n\n📇 Raqam: ${fin.p2p_card_number || '—'}\n👤 Egasi: ${fin.p2p_card_owner || '—'}`,
        { reply_markup: ADMIN_KEYBOARD_MAIN }
      );
      return true;
    }
    return true;
  }

  if (st.type === 'await_price') {
    const n = Number(text.replace(/\s/g, '').replace(/,/g, ''));
    if (!Number.isFinite(n) || n < 0) {
      clearAdminState(userId);
      await botInstance.sendMessage(chatId, "❌ Noto'g'ri narx.", { reply_markup: REMOVE_REPLY_KEYBOARD });
      if (st.productId) await sendProductAdminMenu(chatId, userId, st.productId);
      else if (st.categoryIdReturn) await sendCatalogCategoryView(chatId, userId, st.categoryIdReturn);
      else await sendCatalogRoot(chatId, userId);
      return true;
    }
    await Product.findByIdAndUpdate(st.productId, { price: n });
    clearAdminState(userId);
    await botInstance.sendMessage(chatId, `✅ Narx yangilandi: ${n} so'm`, { reply_markup: REMOVE_REPLY_KEYBOARD });
    if (st.productId) await sendProductAdminMenu(chatId, userId, st.productId);
    else if (st.categoryIdReturn) await sendCatalogCategoryView(chatId, userId, st.categoryIdReturn);
    else await sendCatalogRoot(chatId, userId);
    return true;
  }

  if (st.type === 'edit_product_name_uz') {
    if (!text) {
      await botInstance.sendMessage(chatId, "Nom bo'sh bo'lmasin. Qayta kiriting.", {
        reply_markup: REMOVE_REPLY_KEYBOARD,
      });
      return true;
    }
    const pid = st.productId;
    await Product.findByIdAndUpdate(pid, { name_uz: text, name_ru: text });
    clearAdminState(userId);
    await botInstance.sendMessage(chatId, "✅ Nom (O'zbekcha) yangilandi.", { reply_markup: REMOVE_REPLY_KEYBOARD });
    await sendProductAdminMenu(chatId, userId, pid);
    return true;
  }

  if (st.type === 'await_product_image') {
    const url = /^skip$/i.test(text) ? '' : text;
    if (url && !/^https?:\/\//i.test(url)) {
      await botInstance.sendMessage(
        chatId,
        "URL http/https bilan boshlanishi kerak yoki 'skip' yozing.",
        { reply_markup: REMOVE_REPLY_KEYBOARD }
      );
      return true;
    }
    const pid = st.productId;
    await Product.findByIdAndUpdate(pid, { image_url: url });
    clearAdminState(userId);
    await botInstance.sendMessage(chatId, "✅ Rasm yangilandi.", { reply_markup: REMOVE_REPLY_KEYBOARD });
    await sendProductAdminMenu(chatId, userId, pid);
    return true;
  }

  if (st.type === 'add_product') {
    if (st.step === 'name_uz') {
      if (!text) {
        await botInstance.sendMessage(chatId, "Nom bo'sh bo'lmasin. Qayta kiriting.", {
          reply_markup: REMOVE_REPLY_KEYBOARD,
        });
        return true;
      }
      setState(userId, { ...st, step: 'price', name_uz: text });
      await botInstance.sendMessage(chatId, "Narxini kiriting (so'm, faqat raqam):", {
        reply_markup: REMOVE_REPLY_KEYBOARD,
      });
      return true;
    }
    if (st.step === 'price') {
      const n = Number(text.replace(/\s/g, '').replace(/,/g, ''));
      if (!Number.isFinite(n) || n < 0) {
        await abortWizardToCatalog(chatId, userId, "Narx noto'g'ri (musbat raqam kiriting).");
        return true;
      }
      setState(userId, { ...st, step: 'image', price: n });
      await botInstance.sendMessage(
        chatId,
        "Rasm URL ni kiriting (yoki 'skip' yozing):",
        { reply_markup: REMOVE_REPLY_KEYBOARD }
      );
      return true;
    }
    if (st.step === 'image') {
      const url = /^skip$/i.test(text) ? '' : text;
      if (url && !/^https?:\/\//i.test(url)) {
        await abortWizardToCatalog(
          chatId,
          userId,
          "URL http/https bilan boshlanishi kerak yoki 'skip' yozing."
        );
        return true;
      }
      await Product.create({
        category_id: st.categoryId,
        name_uz: st.name_uz,
        name_ru: st.name_uz,
        price: st.price,
        image_url: url,
        is_available: true,
      });
      const cid = st.categoryId;
      clearAdminState(userId);
      await botInstance.sendMessage(chatId, "✅ Mahsulot qo'shildi!");
      await sendCatalogCategoryView(chatId, userId, cid);
      return true;
    }
    return true;
  }

  if (st.type === 'add_category') {
    if (st.step === 'name_uz') {
      if (!text) {
        await botInstance.sendMessage(chatId, "Nom bo'sh bo'lmasin. Qayta kiriting.", {
          reply_markup: ADMIN_KB_CATALOG_ROOT,
        });
        return true;
      }
      await Category.create({ name_uz: text, name_ru: text, image_url: '' });
      clearAdminState(userId);
      await botInstance.sendMessage(chatId, "✅ Kategoriya qo'shildi!", { reply_markup: ADMIN_KB_CATALOG_ROOT });
      await sendCatalogRoot(chatId, userId);
      return true;
    }
    return true;
  }

  if (st.type === 'edit_category_name_uz') {
    if (!text) {
      await botInstance.sendMessage(chatId, "Nom bo'sh bo'lmasin. Qayta kiriting.", {
        reply_markup: REMOVE_REPLY_KEYBOARD,
      });
      return true;
    }
    const cid = st.categoryId;
    // Parse emoji + name format: "🍕 Pizza" → icon=🍕, name=Pizza
    const trimmed = text.trim();
    const firstChar = trimmed.charAt(0);
    let icon = '';
    let name = trimmed;
    
    // Check if first character is an emoji (Unicode range for common emojis)
    const emojiRegex = /^[\p{Emoji}]/u;
    if (emojiRegex.test(trimmed)) {
      // Find the space after emoji
      const spaceIndex = trimmed.indexOf(' ');
      if (spaceIndex > 0) {
        icon = trimmed.substring(0, spaceIndex);
        name = trimmed.substring(spaceIndex + 1).trim();
      } else {
        // Only emoji, no name
        icon = trimmed;
        name = '';
      }
    }
    
    if (!name) {
      await botInstance.sendMessage(chatId, "Nom bo'sh bo'lmasin. Qayta kiriting.", {
        reply_markup: REMOVE_REPLY_KEYBOARD,
      });
      return true;
    }
    
    await Category.findByIdAndUpdate(cid, { name_uz: name, image_url: icon });
    clearAdminState(userId);
    await botInstance.sendMessage(chatId, "✅ Kategoriya nomi (O'zbekcha) yangilandi.", { reply_markup: REMOVE_REPLY_KEYBOARD });
    await sendCategoryEditMenu(chatId, userId, cid);
    return true;
  }

  if (st.type === 'edit_category_name_ru') {
    if (!text) {
      await botInstance.sendMessage(chatId, "Nom bo'sh bo'lmasin. Qayta kiriting.", {
        reply_markup: REMOVE_REPLY_KEYBOARD,
      });
      return true;
    }
    const cid = st.categoryId;
    // Parse emoji + name format: "🍕 Пицца" → icon=🍕, name=Пицца
    const trimmed = text.trim();
    const emojiRegex = /^[\p{Emoji}]/u;
    let icon = '';
    let name = trimmed;
    
    if (emojiRegex.test(trimmed)) {
      const spaceIndex = trimmed.indexOf(' ');
      if (spaceIndex > 0) {
        icon = trimmed.substring(0, spaceIndex);
        name = trimmed.substring(spaceIndex + 1).trim();
      } else {
        icon = trimmed;
        name = '';
      }
    }
    
    if (!name) {
      await botInstance.sendMessage(chatId, "Nom bo'sh bo'lmasin. Qayta kiriting.", {
        reply_markup: REMOVE_REPLY_KEYBOARD,
      });
      return true;
    }
    
    await Category.findByIdAndUpdate(cid, { name_ru: name, image_url: icon });
    clearAdminState(userId);
    await botInstance.sendMessage(chatId, "✅ Категория имени (Русский) обновлено.", { reply_markup: REMOVE_REPLY_KEYBOARD });
    await sendCategoryEditMenu(chatId, userId, cid);
    return true;
  }

  if (st.type !== 'idle') {
    const kbCategoryFlow =
      st.type === 'catalog_view' ||
      st.type === 'add_product' ||
      st.type === 'await_price' ||
      st.type === 'edit_product_name_uz' ||
      st.type === 'await_product_image' ||
      st.type === 'edit_category' ||
      st.type === 'edit_category_name_uz' ||
      st.type === 'edit_category_name_ru' ||
      st.type === 'delete_category_pending';
    const kbP2pEdit = st.type === 'edit_p2p_card';
    await botInstance.sendMessage(chatId, "Tushunarsiz buyruq. Inline tugmalar yoki 📦 Katalog orqali davom eting.", {
      reply_markup: kbCategoryFlow
        ? REMOVE_REPLY_KEYBOARD
        : kbP2pEdit
          ? KB_P2P_EDIT_CANCEL
          : st.type === 'catalog_root' || st.type === 'add_category'
            ? ADMIN_KB_CATALOG_ROOT
            : ADMIN_KEYBOARD_MAIN,
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

    const receiptFlowHandled = await handleReceiptFlowCallback(query);
    if (receiptFlowHandled) return;

    const p2pHandled = await handleP2pReceiptCallback(query);
    if (p2pHandled) return;

    const orderReadyHandled = await handleOrderReadyCallback(query);
    if (orderReadyHandled) return;

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

      if (confirmMatch) {
        try {
          await botInstance.sendMessage(
            order.telegram_user_id,
            "✅ Buyurtma qabul qilindi. Tayyor bo'lsag qisqa xabar beramiz."
          );
        } catch (_) {
          /* mijoz botni bloklagan bo'lishi mumkin */
        }
      }

      await botInstance.editMessageText(newText, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: confirmMatch
          ? {
              inline_keyboard: [
                [{ text: '✅ Buyurtma tayyor (mijozga xabar)', callback_data: `order_ready_${orderId}` }],
              ],
            }
          : { inline_keyboard: [] },
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
      if (await handleAdminMessage(msg)) return;
      if (await handleCustomerP2pPhoto(msg)) return;
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

module.exports = {
  initBot,
  getBot,
  formatAdminOrderMessage,
  appendYandexMapsLinkToAdminOrderMessage,
  formatP2pNewPendingPaymentAdminMessage,
  formatP2pPendingDeletedByClientAdminMessage,
  formatP2pCheckoutDismissedAdminMessage,
};
Object.defineProperty(module.exports, 'bot', {
  enumerable: true,
  get() {
    return botInstance;
  },
});
