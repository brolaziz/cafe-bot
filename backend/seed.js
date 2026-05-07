require('dotenv').config();

const mongoose = require('mongoose');
const { connectDb } = require('./db');
const Category = require('./models/Category');
const Product = require('./models/Product');

const categoriesData = [
  {
    name_uz: 'Issiq ichimliklar',
    name_ru: 'Горячие напитки',
    image_url: 'https://example.com/images/hot-drinks.jpg',
  },
  {
    name_uz: 'Salqin ichimliklar',
    name_ru: 'Холодные напитки',
    image_url: 'https://example.com/images/cold-drinks.jpg',
  },
  {
    name_uz: 'Taomlar',
    name_ru: 'Блюда',
    image_url: 'https://example.com/images/food.jpg',
  },
];

async function seed() {
  await connectDb();
  await Product.deleteMany({});
  await Category.deleteMany({});

  const [hot, cold, food] = await Category.insertMany(categoriesData);

  const productsData = [
    {
      category_id: hot._id,
      name_uz: 'Espresso',
      name_ru: 'Эспрессо',
      price: 12000,
      image_url: 'https://example.com/images/espresso.jpg',
      is_available: true,
    },
    {
      category_id: hot._id,
      name_uz: 'Kapuchino',
      name_ru: 'Капучино',
      price: 18000,
      image_url: 'https://example.com/images/cappuccino.jpg',
      is_available: true,
    },
    {
      category_id: cold._id,
      name_uz: 'Limon choy',
      name_ru: 'Лимонный чай',
      price: 15000,
      image_url: 'https://example.com/images/lemon-tea.jpg',
      is_available: true,
    },
    {
      category_id: cold._id,
      name_uz: 'Moxito',
      name_ru: 'Мохито',
      price: 22000,
      image_url: 'https://example.com/images/mojito.jpg',
      is_available: true,
    },
    {
      category_id: food._id,
      name_uz: 'Sandwich',
      name_ru: 'Сэндвич',
      price: 25000,
      image_url: 'https://example.com/images/sandwich.jpg',
      is_available: true,
    },
  ];

  await Product.insertMany(productsData);
  console.log('Seeded 3 categories and 5 products.');
  await mongoose.disconnect();
  process.exit(0);
}

seed().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
