# Cafe-bot: Telegram botdan foydalanish qo‘llanmasi

Bu hujjat **Telegram bot** va u orqali mavjud bo‘lgan **barcha funksiyalar**ni tavsiflaydi. Buyurtma berishning asosiy qismi **Mini App** (veb-ilova) orqali amalga oshadi; bot esa xabarlar, admin boshqaruvi va (ixtiyoriy) chekni to‘g‘ridan-to‘g‘ri Telegram orqali qabul qilish uchun ishlatiladi.

---

## 1. Oldindan sozlash (qisqa)

Backend `.env` da quyidagilar muhim:

| O‘zgaruvchi | Vazifasi |
|-------------|----------|
| `BOT_TOKEN` | Telegram @BotFather dan olingan bot tokeni |
| `ADMIN_CHAT_ID` | Adminning Telegram **raqamli** chat ID si (shaxsiy chat yoki guruh). Admin tugmalari va buyurtma xabarlari shu yerga keladi |
| `MONGODB_URI` | Ma’lumotlar bazasi |
| `WEB_APP_URL` | Mini App HTTPS manzili (yoki `TELEGRAM_WEB_APP_URL` / `MINI_APP_URL` / `PUBLIC_WEB_APP_URL` — birinchi to‘ldirilgan ishlatiladi) |

`ADMIN_CHAT_ID` bo‘lmasa, admin panel va ko‘plab admin xabarlari ishlamaydi.

---

## 2. Mijozlar uchun

### 2.1. `/start`

- Bot bilan suhbatni boshlash.
- Agar `WEB_APP_URL` (yoki yuqoridagi muqobil kalitlardan biri) sozlangan bo‘lsa, **«Menyuni ochish»** tugmasi (Web App) ko‘rinadi — mini-ilovada menyu, savat, checkout va profil orqali buyurtma beriladi.
- URL sozlanmagan bo‘lsa, foydalanuvchiga Mini App ni qanday ochish haqida matnli ko‘rsatma yuboriladi.

### 2.2. Mini App orqali buyurtma (asosiy oqim)

Mini App ichida (frontend): mahsulotlar, savat, manzil/telefon, **P2P to‘lov** checkout, buyurtma yaratilgandan keyin **Profil → Buyurtmalar** orqali chek yuklash va holatni kuzatish. Bu qism bot kodidan mustaqil, lekin buyurtmalar va cheklar admin chatiga bot orqali boradi.

### 2.3. P2P chekni to‘g‘ridan-to‘g‘ri botga yuborish (ixtiyoriy yo‘l)

Agar mijoz **oxirgi 30 daqiqa** ichida yaratilgan, **P2P** va **`pending_payment`** / **`pending`** holatidagi buyurtmaga ega bo‘lsa, botga **shaxsiy chatda rasm** (chek) yuborishi mumkin:

- Rasm qabul qilinadi, admin chatiga chek bilan yuboriladi, buyurtma holati yangilanadi.
- Muvaffaqiyatli bo‘lsa, mijozga: chek adminga yuborilgani haqida xabar.
- `ADMIN_CHAT_ID` sozlanmagan bo‘lsa, chek yuborilmaydi va mijozga ogohlantirish beriladi.

> Eslatma: asosiy yo‘l — Mini App dan «Chek yuklash»; bot orqali rasm — qo‘shimcha imkoniyat.

---

## 3. Admin kim?

- `ADMIN_CHAT_ID` dagi foydalanuvchi (yoki guruh) **admin** hisoblanadi.
- Faqat admin: `/admin`, katalog boshqaruvi, P2P karta tahriri, tozalash, buyurtma/chek inline tugmalari va boshqalar.

---

## 4. Admin: asosiy buyruqlar va menyu

### 4.1. `/admin`

- Admin **asosiy reply-klaviatura**ni ochadi:
  - **Katalog** — kategoriya/mahsulot boshqaruvi
  - **P2P karta** — mini-app checkoutda ko‘rinadigan karta raqami va egasi
  - **Tozalash** — eski buyurtmalarni bazadan o‘chirish (pastda)

### 4.2. `🗑 Tozalash` yoki `/cleanup`

- MongoDB dagi **buyurtmalar** bo‘yicha tozalash taklifi chiqadi (standart: **oxirgi 7 kun** saqlanadi, undan eskilar o‘chiriladi — aniq muddat `orderCleanup.js` dagi `ORDER_RETENTION_DAYS` bilan belgilanadi).
- Inline tugmalar: **Ha, o‘chirish** / **Yo‘q** (bekor).

### 4.3. `⬅️ Asosiy menyu`

- Admin holatini (wizard) tozalaydi va asosiy klaviaturaga qaytaradi.

---

## 5. Admin: Katalog (`📦 Katalog`)

### 5.1. Kategoriyalar ro‘yxati

- Har bir kategoriya — **inline tugma** (bosilganda shu kategoriya mahsulotlari ochiladi).
- **Asosiy menyu** — reply klaviaturaga qaytish.
- **Kategoriya qo‘shish** — yangi kategoriya nomini matn bilan yuborish (o‘zbekcha).

### 5.2. Kategoriya ichida

- Mahsulotlar ro‘yxati (nom bo‘yicha tugmalar; juda ko‘p bo‘lsa, dastlabki 40 ta ko‘rsatiladi).
- **Mahsulot qo‘shish** — ketma-ket: nom → narx (raqam) → rasm URL yoki `skip`.
- **Kategoriyalar** — orqaga kategoriyalar ro‘yxatiga.

### 5.3. Bitta mahsulot menyusi (inline)

Tanlangan mahsulot uchun:

| Tugma | Amal |
|--------|------|
| **Nom (O‘zb)** | Yangi nom matnini kutadi |
| **Sotuvdan olish / Sotuvga qo‘shish** | `is_available` almashtiriladi |
| **Narx** | Yangi narx (faqat raqam) |
| **Rasm (URL)** | `https://...` yoki `skip` |
| **O‘chirish** | Tasdiq/bekor inline bosqichlari |
| **Mahsulotlar** | Shu kategoriya ro‘yxatiga qaytish |

Mahsulot o‘chirilganda, agar kategoriyada mahsulot **qolmagan** bo‘lsa, **kategoriya ham avtomatik o‘chiriladi** (xabar bilan).

---

## 6. Admin: P2P karta (`💳 P2P karta`)

- Joriy karta raqami va egasi ko‘rsatiladi.
- **1-qadam:** yangi karta raqamini matn yuborish (bo‘sh joy bilan ham bo‘lishi mumkin).
- **2-qadam:** karta egasining F.I.O.
- **Bekor** — `⬅️ Bekor` yoki `/bekor` bilan jarayonni to‘xtatish.

Ma’lumotlar **MongoDB** `AppSetting` da saqlanadi va mini-app checkoutda ko‘rinadi.

---

## 7. Admin chatidagi buyurtmalar va tugmalar

### 7.1. Oddiy (P2P emas) yangi buyurtma

- Matnli xabar: mijoz, telefon, manzil, mahsulotlar, jami, to‘lov usuli.
- Manzil uchun **Yandex xarita** havolasi qo‘shilishi mumkin.
- Inline tugmalar:
  - **Qabul qilish** (`confirm_<orderId>`) — holat `confirmed`, mijozga qabul qilindi xabari.
  - **Bekor qilish** (`cancel_<orderId>`) — holat `cancelled`.
- Qabul qilingach, xabarda **«Buyurtma tayyor (mijozga xabar)»** tugmasi paydo bo‘ladi (`order_ready_<orderId>`).

### 7.2. P2P: yangi buyurtma (to‘lov kutilmoqda)

- Alohida formatdagi xabar: P2P, chek kutilmoqda, jami va hokazo.

### 7.3. P2P: chek rasmi (mini-app yoki botdan)

- Admin chatida rasm + sarlavha/caption va tugmalar:
  - **Tasdiqlash** (`receipt_confirm_<orderId>`) — to‘lov tasdiqlandi, buyurtma `preparing`, mijozga xabar, qo‘shimcha admin xabari va **«Buyurtma tayyor»** tugmasi.
  - **Rad etish** (`receipt_reject_<orderId>`) — buyurtma `cancelled`, mijozga rad etilgani haqida xabar.

### 7.4. Eski P2P tugmalar (legacy)

- Ba’zi xabarlarda **p2pok_** / **p2px_** callbacklari bo‘lishi mumkin — ular ham chekni tasdiqlash/rad etish oqimiga o‘xshash ishlaydi (admin uchun).

### 7.5. «Buyurtma tayyor» (`order_ready_<orderId>`)

- Faqat ruxsat etilgan holatlardan: `paid`, `confirmed`, `preparing`.
- Bosilganda buyurtma **`ready`**, mijozga: **«Buyurtmangiz tayyor! Rahmat»** (agar botni bloklamagan bo‘lsa).

---

## 8. Mini-app va server bilan bog‘liq admin ogohlantirishlar (P2P)

Quyidagilar **asosan API** orqali ishlaydi, natija admin chatiga bot xabari sifatida keladi:

- **Kutilayotgan P2P buyurtmani** mijoz mini-appdan **o‘chirsa** — admin ogohlantiriladi.
- Mijoz to‘lov ko‘rsatmalari ekranidan **chiqib ketsa** (orqaga, menyuga, mini-app yopilishi) — bir martalik **«chiqdi»** ogohlantirishi (takrorlanmasligi uchun buyurtmada belgi qo‘yiladi).

---

## 9. Texnik eslatmalar

- Bot **faqat shaxsiy chat** (`private`) xabarlarini `/start`, admin va mijoz P2P rasm oqimi uchun ishlaydi.
- **Callback** tugmalar: admin tekshiruvi talab qilinadiganlar faqat `ADMIN_CHAT_ID` dagi foydalanuvchi uchun ishlaydi; boshqa foydalanuvchilar «Faqat admin» kabi javob oladi.
- **Polling** rejimi: server ishga tushganda bot token orqali yangilanishlarni so‘raydi (productionda webhook ham mumkin, loyihada polling ishlatilgan).

---

## 10. Qisqa xulosa

| Kim | Nima qiladi |
|-----|-------------|
| **Mijoz** | `/start` → Mini App dan buyurtma; ixtiyoriy ravishda botga chek rasmi |
| **Admin** | `/admin` → Katalog, P2P karta, tozalash; chatdagi buyurtma/chek tugmalari; tayyor deb xabar |

Savollar yoki yangi funksiya uchun `backend/bot.js` manba kodini tekshiring — ushbu qo‘llanma shu fayl va bog‘liq marshrutlar (`routes/orders.js`, `orderCleanup.js`) asosida yozilgan.
