const Order = require('./models/Order');

/** Buyurtmalarni ushbu kundan eskiroq bo'lsa o'chirish (Order: Mongoose `createdAt`) */
const ORDER_RETENTION_DAYS = 7;
/** Test: barcha buyurtmalarni o'chirish uchun vaqtincha `0` qiling, keyin yana `7`. */

async function deleteOldOrders() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - ORDER_RETENTION_DAYS);
  const result = await Order.deleteMany({ createdAt: { $lt: cutoff } });
  return result.deletedCount;
}

module.exports = { deleteOldOrders, ORDER_RETENTION_DAYS };
