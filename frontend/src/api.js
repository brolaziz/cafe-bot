import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export const fetchP2pCardPublic = async () => {
  const res = await axios.get(`${BASE_URL}/api/settings/p2p`);
  return res.data;
};

export const fetchCategories = async () => {
  const res = await axios.get(`${BASE_URL}/api/categories`);
  return res.data;
};

export const fetchProducts = async (categoryId) => {
  const res = await axios.get(`${BASE_URL}/api/products/${categoryId}`);
  return res.data;
};

export const createOrder = async (orderData) => {
  const res = await axios.post(`${BASE_URL}/api/orders`, orderData);
  return res.data;
};

/**
 * P2P pending: mijoz to'lov sahifasidan chiqdi — adminga bir marta (sendBeacon / keepalive).
 * @param {{ preferBeacon?: boolean }} [opts]
 */
export function signalP2pCheckoutDismiss(telegramUserId, orderId, opts = {}) {
  const url = `${BASE_URL}/api/orders/${orderId}/p2p-dismiss-signal?telegram_user_id=${encodeURIComponent(telegramUserId)}`;
  if (opts.preferBeacon && typeof navigator.sendBeacon === 'function') {
    try {
      const ok = navigator.sendBeacon(url, new Blob([''], { type: 'text/plain' }));
      if (ok) return Promise.resolve();
    } catch {
      /* fetch fallback */
    }
  }
  return fetch(url, { method: 'POST', keepalive: true, body: '' }).catch(() => {});
}

/** P2P chek rasmini yuklash (multipart, maydon: receipt) */
export const uploadOrderReceipt = async (telegramUserId, orderId, file) => {
  const form = new FormData();
  form.append('receipt', file);
  const res = await axios.post(`${BASE_URL}/api/orders/${orderId}/receipt`, form, {
    params: { telegram_user_id: telegramUserId },
  });
  return res.data;
};

export const fetchMyOrders = async (telegramUserId) => {
  const res = await axios.get(`${BASE_URL}/api/orders/mine`, {
    params: { telegram_user_id: telegramUserId },
  });
  return res.data;
};

export const deleteMyOrder = async (telegramUserId, orderId) => {
  const res = await axios.delete(`${BASE_URL}/api/orders/${orderId}`, {
    params: { telegram_user_id: telegramUserId },
  });
  return res.data;
};

export const deleteAllMyOrders = async (telegramUserId) => {
  const res = await axios.delete(`${BASE_URL}/api/orders/mine`, {
    params: { telegram_user_id: telegramUserId },
  });
  return res.data;
};
