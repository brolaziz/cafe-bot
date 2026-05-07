import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export const fetchCategories = async () => {
  console.log('Fetching from:', BASE_URL + '/api/categories');
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
