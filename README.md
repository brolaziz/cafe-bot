# ☕ Cafe-Bot

A modern Telegram-based cafe ordering system with a sleek Mini App web interface for customers and a powerful admin bot for menu management, order processing, and P2P payments.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-green.svg)
![React](https://img.shields.io/badge/React-19-blue.svg)
![MongoDB](https://img.shields.io/badge/MongoDB-latest-green.svg)

---

## ✨ Features

### For Customers
- 🛒 **Browse Menu** - Beautiful product catalog with categories and search
- 📍 **Address Selection** - Yandex Maps integration for precise delivery location
- 💳 **P2P Payment** - Simple pay-by-receipt workflow
- 📦 **Order Tracking** - Real-time order status updates
- 📱 **Telegram Mini App** - Seamless in-bot web experience

### For Admins
- 📦 **Catalog Management** - Add/edit categories and products
- 🏷️ **Category Icons** - Emoji-based visual identification
- 📸 **Product Images** - URL-based image management
- 💰 **Price Control** - Real-time price updates
- ✅ **Order Management** - Confirm, reject, mark as ready
- 🧾 **Receipt Verification** - Approve/reject P2P payment receipts
- 🗑️ **Auto Cleanup** - Automatic old order deletion (7 days)
- 💳 **P2P Card Settings** - Configure payment card details

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| **Backend** | Node.js, Express 5 |
| **Bot** | node-telegram-bot-api |
| **Database** | MongoDB, Mongoose 9 |
| **Frontend** | React 19, Vite 8 |
| **Styling** | Tailwind CSS 3 |
| **Maps** | Yandex Maps API |
| **Scheduling** | node-cron |

---

## 📁 Project Structure

```
cafe-bot/
├── backend/
│   ├── bot.js              # Telegram bot logic (admin panel, notifications)
│   ├── server.js           # Express API server
│   ├── db.js               # MongoDB connection
│   ├── orderCleanup.js     # Auto-delete old orders
│   ├── seed.js             # Database seeder
│   ├── models/
│   │   ├── Category.js     # Menu categories
│   │   ├── Product.js      # Menu products
│   │   ├── Order.js        # Customer orders
│   │   └── AppSetting.js   # App settings (P2P card)
│   ├── routes/
│   │   ├── menu.js         # Categories & products API
│   │   ├── orders.js       # Order CRUD, receipt upload
│   │   └── settings.js     # P2P settings API
│   └── .env.example        # Environment variables template
├── frontend/
│   ├── src/
│   │   ├── App.jsx         # Main app component
│   │   ├── api.js          # API client functions
│   │   ├── components/     # Reusable UI components
│   │   ├── pages/          # Page components
│   │   └── index.css       # Tailwind + custom styles
│   └── .env.example        # Frontend environment template
├── docs/
│   ├── bot-foydalanish-qollanmasi.md    # Admin bot guide (Uzbek)
│   └── foydalanuvchi-qisqa-qollanma.md  # User guide (Uzbek)
└── README.md               # This file
```

---

## 🚀 Installation & Setup

### Prerequisites
- Node.js >= 18.0.0
- MongoDB (local or Atlas)
- Telegram Bot Token (from [@BotFather](https://t.me/BotFather))

### 1. Clone Repository
```bash
git clone <repository-url>
cd cafe-bot
```

### 2. Backend Setup
```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your credentials
```

### 3. Frontend Setup
```bash
cd frontend
npm install
cp .env.example .env
# Edit .env with your API URL
```

### 4. Seed Database (Optional)
```bash
cd backend
npm run seed
```

### 5. Run Development Servers
```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend
npm run dev
```

### 6. Production Build
```bash
# Frontend
cd frontend
npm run build

# Backend
cd backend
npm start
```

---

## ⚙️ Environment Variables

### Backend (.env)
```env
# MongoDB
MONGODB_URI=mongodb://127.0.0.1:27017/cafe_bot

# Telegram Bot
BOT_TOKEN=your_bot_token_here
ADMIN_CHAT_ID=123456789

# Web App
WEB_APP_URL=https://your-domain.com
```

| Variable | Description | Required |
|----------|-------------|----------|
| `MONGODB_URI` | MongoDB connection string | ✅ |
| `BOT_TOKEN` | Telegram bot token from @BotFather | ✅ |
| `ADMIN_CHAT_ID` | Admin's Telegram chat ID (numeric) | ✅ |
| `WEB_APP_URL` | Mini App HTTPS URL | ✅ |

### Frontend (.env)
```env
VITE_API_URL=http://localhost:3000
VITE_YANDEX_MAPS_KEY=your_yandex_maps_api_key
VITE_CARD_NUMBER=8600000000000000
VITE_CARD_OWNER=Ism Familiya
VITE_BOT_USERNAME=yourbotusername
```

| Variable | Description | Required |
|----------|-------------|----------|
| `VITE_API_URL` | Backend API URL | ✅ |
| `VITE_YANDEX_MAPS_KEY` | Yandex Maps API key | ✅ |
| `VITE_CARD_NUMBER` | Default P2P card number | ❌ |
| `VITE_CARD_OWNER` | Default card owner name | ❌ |
| `VITE_BOT_USERNAME` | Telegram bot username | ❌ |

---

## 📖 Usage Guide

### Customer Flow
1. Open bot, click `/start`
2. Launch Mini App via "📱 Menyuni ochish" button
3. Browse menu, add items to cart
4. Proceed to checkout
5. Enter phone, select delivery address (Yandex Maps)
6. Pay via P2P transfer (card details shown)
7. Upload receipt photo
8. Track order status in Profile → Orders

### Admin Commands

| Command | Description |
|---------|-------------|
| `/start` | Open Mini App or get instructions |
| `/admin` | Open admin control panel |
| `/cleanup` | Delete orders older than 7 days |

### Admin Panel Features

**📦 Katalog** - Menu Management
- Add/edit/delete categories with emoji icons
- Add/edit/delete products
- Set prices, availability, images
- Format: `🍕 Pizza` (emoji + name)

**💳 P2P karta** - Payment Settings
- Set card number and owner name
- Displayed in customer checkout

**🗑️ Tozalash** - Cleanup
- Auto-delete orders older than 7 days
- Manual cleanup on demand

### Order Status Flow
```
pending_payment → receipt_sent → preparing → ready → delivered
                                       ↓
                                  cancelled
```

---

## 📸 Screenshots

> *Add your screenshots here*

### Customer Mini App
- `![Menu](./docs/screenshots/menu.png)` - Product catalog
- `![Cart](./docs/screenshots/cart.png)` - Shopping cart
- `![Checkout](./docs/screenshots/checkout.png)` - Checkout flow

### Admin Bot
- `![Admin Panel](./docs/screenshots/admin-panel.png)` - Admin menu
- `![Catalog](./docs/screenshots/catalog.png)` - Category management
- `![Order Notification](./docs/screenshots/order-notify.png)` - Order alerts

---

## 🔧 API Endpoints

### Menu
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/categories` | List all categories |
| GET | `/api/products/:categoryId` | Products by category |

### Orders
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/orders/mine` | Get user's orders |
| POST | `/api/orders` | Create new order |
| POST | `/api/orders/:id/receipt` | Upload receipt |
| DELETE | `/api/orders/:id` | Delete order |

### Settings
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/settings/p2p` | Get P2P card settings |

---

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🤝 Support

For questions or issues:
- Check the [documentation](docs/)
- Review `backend/bot.js` for bot logic
- Open an issue in the repository

---

**Built with ❤️ for modern cafe ordering**
