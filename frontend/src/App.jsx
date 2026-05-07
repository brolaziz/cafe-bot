import { useCallback, useEffect, useMemo, useState } from 'react';
import MenuPage from './pages/MenuPage';
import CartPage from './pages/CartPage';
import CheckoutPage from './pages/CheckoutPage';

function getTelegramUser() {
  return window.Telegram?.WebApp?.initDataUnsafe?.user ?? null;
}

export default function App() {
  const [page, setPage] = useState('menu');
  const [cart, setCart] = useState([]);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
    }
  }, []);

  const cartCount = useMemo(() => cart.reduce((n, line) => n + line.qty, 0), [cart]);

  const addToCart = useCallback((product) => {
    setCart((prev) => {
      const id = product._id;
      const idx = prev.findIndex((p) => p.productId === id);
      if (idx === -1) {
        return [
          ...prev,
          {
            productId: id,
            name_uz: product.name_uz,
            price: product.price,
            image_url: product.image_url || '',
            qty: 1,
          },
        ];
      }
      const next = [...prev];
      next[idx] = { ...next[idx], qty: next[idx].qty + 1 };
      return next;
    });
  }, []);

  const changeQty = useCallback((productId, qty) => {
    if (qty < 1) {
      setCart((prev) => prev.filter((p) => p.productId !== productId));
      return;
    }
    setCart((prev) => prev.map((p) => (p.productId === productId ? { ...p, qty } : p)));
  }, []);

  const removeLine = useCallback((productId) => {
    setCart((prev) => prev.filter((p) => p.productId !== productId));
  }, []);

  const handleOrderSuccess = useCallback(() => {
    setCart([]);
    setPage('menu');
    const tg = window.Telegram?.WebApp;
    if (tg?.showAlert) {
      tg.showAlert("Buyurtma qabul qilindi. Tez orada bog'lanamiz.");
    } else {
      window.alert("Buyurtma qabul qilindi. Tez orada bog'lanamiz.");
    }
  }, []);

  const tgUser = getTelegramUser();

  return (
    <div key={page} className="min-h-[100dvh] animate-page-slide">
      {page === 'menu' && (
        <MenuPage
          cart={cart}
          cartCount={cartCount}
          onOpenCart={() => setPage('cart')}
          onAddToCart={addToCart}
          onChangeQty={changeQty}
        />
      )}
      {page === 'cart' && (
        <CartPage
          cart={cart}
          onBack={() => setPage('menu')}
          onCheckout={() => setPage('checkout')}
          onChangeQty={changeQty}
          onRemove={removeLine}
        />
      )}
      {page === 'checkout' && (
        <CheckoutPage
          cart={cart}
          tgUser={tgUser}
          onBack={() => setPage('cart')}
          onSuccess={handleOrderSuccess}
        />
      )}
    </div>
  );
}
