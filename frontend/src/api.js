import axios from 'axios';

const baseURL = import.meta.env.VITE_API_URL || '';

export const api = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
});

export async function fetchCategories() {
  const { data } = await api.get('/api/categories');
  return data;
}

export async function fetchProducts(categoryId) {
  const { data } = await api.get(`/api/products/${categoryId}`);
  return data;
}

export async function createOrder(payload) {
  const { data } = await api.post('/api/orders', payload);
  return data;
}
