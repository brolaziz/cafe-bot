const { webcrypto } = require('crypto');
if (!globalThis.crypto) globalThis.crypto = webcrypto;

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const { connectDb } = require('./db');
const { initBot } = require('./bot');
const { deleteOldOrders } = require('./orderCleanup');
const menuRoutes = require('./routes/menu');
const orderRoutes = require('./routes/orders');

const PORT = process.env.PORT || 3000;
const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.use('/api', menuRoutes);
app.use('/api/orders', orderRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err, req, res, _next) => {
  console.error(err);

  if (err.name === 'ValidationError') {
    const details = Object.values(err.errors || {}).map((e) => e.message);
    res.status(400).json({ error: 'Validation failed', details });
    return;
  }

  if (err.name === 'CastError') {
    res.status(400).json({ error: 'Invalid id or data format' });
    return;
  }

  const status = err.statusCode || err.status || 500;
  const message = err.message || 'Internal server error';
  res.status(status).json({ error: message });
});

async function start() {
  try {
    await connectDb();
    initBot();

    cron.schedule('0 0 * * *', async () => {
      try {
        const deletedCount = await deleteOldOrders();
        console.log(`Auto-cleanup: ${deletedCount} old orders deleted`);
      } catch (err) {
        console.error('Auto-cleanup failed:', err);
      }
    });

    app.listen(PORT, () => {
      console.log(`Server listening on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
