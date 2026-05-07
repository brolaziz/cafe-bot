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

/** Asosiy admin (faqat katalog + tozalash) */
const ADMIN_KEYBOARD_MAIN = {
  keyboard: [[{ text: '📦 Katalog' }], [{ text: '🗑 Tozalash' }]],
  resize_keyboard: true,
};

/** Katalog: kategoriyalar ro'yxati */
const ADMIN_KB_CATALOG_ROOT = {
  keyboard: [[{ text: '⬅️ Asosiy menyu' }], [{ text: "➕ Kategoriya qo'shish" }]],
  resize_keyboard: true,
};

const REMOVE_REPLY_KEYBOARD = { remove_keyboard: true };

async function hideReplyKeyboard(chatId) {
  try {
    await botInstance.sendMessage(chatId, '\u2060', { reply_markup: REMOVE_REPLY_KEYBOARD });
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
/** Katalogda kategoriyani ochish (mahsulotlar ro'yxati) */
function cbGotoCategory(cid) {
  return `adm_g_${cid}`;
}
/** Katalog ildiziga (kategoriyalar ro'yxati) */
const CB_ADMIN_BACK_ROOT = 'adm_back_root';
/** Shu kategoriyada mahsulot qo'shish */
function cbAddProductInCategory(cid) {
  return `adm_ap_${cid}`;
}
/** Mahsulot boshqaruv menyusi */
function cbSelectProduct(pid) {
  return `adm_s_${pid}`;
}
function cbEditNameUz(pid) {
  return `adm_eu_${pid}`;
}
function cbEditNameRu(pid) {
  return `adm_er_${pid}`;
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
  const rows = cats.map((c) => [{ text: c.name_uz, callback_data: cbGotoCategory(String(c._id)) }]);
  await botInstance.sendMessage(chatId, '📦 Katalog — kategoriyani tanlang:', {
    reply_markup: { inline_keyboard: rows },
  });
  await botInstance.sendMessage(chatId, 'Pastdagi tugmalar:', { reply_markup: ADMIN_KB_CATALOG_ROOT });
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
    await hideReplyKeyboard(chatId);
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

  await hideReplyKeyboard(chatId);
  await botInstance.sendMessage(chatId, text, { reply_markup: { inline_keyboard: keyboard } });
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

  await hideReplyKeyboard(chatId);

  const mark = p.is_available !== false ? '✅ Sotuvda' : '❌ Sotuvda emas';
  const imgLine = p.image_url ? `\n🖼 ${p.image_url}` : "\n🖼 Rasm yo'q";
  const caption = `🛒 ${p.name_uz}\n${p.name_ru}\n💰 ${p.price} so'm\n${mark}${imgLine}`;
  const catLine = cat ? cat.name_uz : '—';

  const reply_markup = {
    inline_keyboard: [
      [
        { text: "✏️ Nom (O'zb)", callback_data: cbEditNameUz(pid) },
        { text: '✏️ Nom (Rus)', callback_data: cbEditNameRu(pid) },
      ],
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
    name_ru: '',
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
  setState(userId, { type: 'add_category', step: 'name_uz', name_uz: '', name_ru: '' });
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
  if (!data || chatId == null || userId == null || !isAdmin(userId)) return false;

  if (!data.startsWith('adm_')) return false;

  const answer = async (text, alert = false) => {
    try {
      await botInstance.answerCallbackQuery(query.id, { text: text || '', show_alert: alert });
    } catch (_) {
      /* ignore */
    }
  };

  const mGoto = data.match(/^adm_g_(.+)$/);
  const mPrice = data.match(/^adm_p_(.+)$/);
  const mDelAsk = data.match(/^adm_d_(.+)$/);
  const mDelConf = data.match(/^adm_dc_(.+)$/);
  const mDelCan = data.match(/^adm_dx_(.+)$/);

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

  const mEr = data.match(/^adm_er_(.+)$/);
  if (mEr) {
    const pid = mEr[1];
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
      type: 'edit_product_name_ru',
      productId: pid,
      categoryId: String(prod.category_id),
    });
    await answer();
    await botInstance.sendMessage(chatId, 'Yangi nom (Ruscha):', { reply_markup: REMOVE_REPLY_KEYBOARD });
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
    await botInstance.sendMessage(chatId, "✅ Mahsulot o'chirildi.");
    clearAdminState(userId);
    if (catId) await sendCatalogCategoryView(chatId, userId, catId);
    else await sendCatalogRoot(chatId, userId);
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
    const deletedCount = await deleteOldOrders();
    await botInstance.sendMessage(
      chatId,
      `🗑 ${ORDER_RETENTION_DAYS} kundan eski buyurtmalar o'chirildi: ${deletedCount} ta`,
      { reply_markup: ADMIN_KEYBOARD_MAIN }
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
    await Product.findByIdAndUpdate(pid, { name_uz: text });
    clearAdminState(userId);
    await botInstance.sendMessage(chatId, "✅ Nom (O'zbekcha) yangilandi.", { reply_markup: REMOVE_REPLY_KEYBOARD });
    await sendProductAdminMenu(chatId, userId, pid);
    return true;
  }

  if (st.type === 'edit_product_name_ru') {
    if (!text) {
      await botInstance.sendMessage(chatId, "Nom bo'sh bo'lmasin. Qayta kiriting.", {
        reply_markup: REMOVE_REPLY_KEYBOARD,
      });
      return true;
    }
    const pid = st.productId;
    await Product.findByIdAndUpdate(pid, { name_ru: text });
    clearAdminState(userId);
    await botInstance.sendMessage(chatId, '✅ Nom (Ruscha) yangilandi.', { reply_markup: REMOVE_REPLY_KEYBOARD });
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
      setState(userId, { ...st, step: 'name_ru', name_uz: text });
      await botInstance.sendMessage(chatId, 'Mahsulot nomini kiriting (ruscha):', {
        reply_markup: REMOVE_REPLY_KEYBOARD,
      });
      return true;
    }
    if (st.step === 'name_ru') {
      if (!text) {
        await botInstance.sendMessage(chatId, "Nom bo'sh bo'lmasin. Qayta kiriting.", {
          reply_markup: REMOVE_REPLY_KEYBOARD,
        });
        return true;
      }
      setState(userId, { ...st, step: 'price', name_ru: text });
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
        name_ru: st.name_ru,
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
      setState(userId, { type: 'add_category', step: 'name_ru', name_uz: text, name_ru: '' });
      await botInstance.sendMessage(chatId, 'Kategoriya nomini kiriting (ruscha):', {
        reply_markup: ADMIN_KB_CATALOG_ROOT,
      });
      return true;
    }
    if (st.step === 'name_ru') {
      if (!text) {
        await botInstance.sendMessage(chatId, "Nom bo'sh bo'lmasin. Qayta kiriting.", {
          reply_markup: ADMIN_KB_CATALOG_ROOT,
        });
        return true;
      }
      await Category.create({ name_uz: st.name_uz, name_ru: text, image_url: '' });
      clearAdminState(userId);
      await botInstance.sendMessage(chatId, "✅ Kategoriya qo'shildi!", { reply_markup: ADMIN_KB_CATALOG_ROOT });
      await sendCatalogRoot(chatId, userId);
      return true;
    }
    return true;
  }

  if (st.type !== 'idle') {
    const kbCategoryFlow =
      st.type === 'catalog_view' ||
      st.type === 'add_product' ||
      st.type === 'await_price' ||
      st.type === 'edit_product_name_uz' ||
      st.type === 'edit_product_name_ru' ||
      st.type === 'await_product_image';
    await botInstance.sendMessage(chatId, "Tushunarsiz buyruq. Inline tugmalar yoki 📦 Katalog orqali davom eting.", {
      reply_markup: kbCategoryFlow
        ? REMOVE_REPLY_KEYBOARD
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
