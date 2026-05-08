const Order = require('./models/Order');

/**
 * Oxirgi N kun buyurtmalar saqlanadi; undan eski yozuvlar MongoDB dan o'chiriladi (createdAt).
 * Boshqa kolleksiyalar (katalog, sozlamalar) bu jarayonga tegilmaydi.
 */
const ORDER_RETENTION_DAYS = 7;
/** Test: barcha buyurtmalarni o'chirish uchun vaqtincha `0` qiling, keyin yana `7`. */

/**
 * @returns {{ deletedCount: number, retentionDays: number, cutoff: string }}
 */
async function deleteOldOrders() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - ORDER_RETENTION_DAYS);
  const result = await Order.deleteMany({ createdAt: { $lt: cutoff } });
  return {
    deletedCount: result.deletedCount,
    retentionDays: ORDER_RETENTION_DAYS,
    cutoff: cutoff.toISOString(),
  };
}

module.exports = { deleteOldOrders, ORDER_RETENTION_DAYS };
