const Order = require('./models/Order');

/** Buyurtmalarni ushbu kundan eskiroq bo'lsa o'chirish */
const ORDER_RETENTION_DAYS = 7;

async function deleteOldOrders() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - ORDER_RETENTION_DAYS);
  const result = await Order.deleteMany({ created_at: { $lt: cutoff } });
  return result.deletedCount;
}

module.exports = { deleteOldOrders, ORDER_RETENTION_DAYS };
