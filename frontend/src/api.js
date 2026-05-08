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
