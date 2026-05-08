import { useCallback, useEffect, useMemo, useState } from 'react';
import BottomNav from './components/BottomNav';
import MenuPage from './pages/MenuPage';
import CartPage from './pages/CartPage';
import CheckoutPage from './pages/CheckoutPage';
import AddressPage from './pages/AddressPage';
import ProfilePage from './pages/ProfilePage';

function getTelegramUser() {
  return window.Telegram?.WebApp?.initDataUnsafe?.user ?? null;
}

export default function App() {
  const [mainTab, setMainTab] = useState('menu');
  const [overlay, setOverlay] = useState(null);
  const [cart, setCart] = useState([]);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
      if (tg.disableClosingConfirmation) tg.disableClosingConfirmation();
      if (tg.lockOrientation) tg.lockOrientation();
      if (tg.disableVerticalSwipes) tg.disableVerticalSwipes();
      document.documentElement.style.setProperty(
        '--tg-safe-area-top',
        ((tg.safeAreaInset?.top || 0) + 16) + 'px'
      );
    } else {
      document.documentElement.style.setProperty('--tg-safe-area-top', '0px');
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

  const handleOrderSuccess = useCallback((opts) => {
    setCart([]);
    setOverlay(null);
    setMainTab('menu');
    if (opts?.skipAlert) return;
    const tg = window.Telegram?.WebApp;
    if (tg?.showAlert) {
      tg.showAlert("Buyurtma qabul qilindi. Tez orada bog'lanamiz.");
    } else {
      window.alert("Buyurtma qabul qilindi. Tez orada bog'lanamiz.");
    }
  }, []);

  const tgUser = getTelegramUser();

  if (overlay === 'checkout') {
    return (
      <div key="checkout" className="min-h-[100dvh] animate-page-slide">
        <CheckoutPage
          cart={cart}
          tgUser={tgUser}
          onBack={() => setOverlay(null)}
          onSuccess={handleOrderSuccess}
        />
      </div>
    );
  }

  return (
    <div className="relative min-h-[100dvh]">
      <div key={mainTab} className="min-h-[100dvh] animate-page-slide">
        {mainTab === 'menu' && (
          <MenuPage
            cart={cart}
            cartCount={cartCount}
            onOpenCart={() => setMainTab('cart')}
            onAddToCart={addToCart}
            onChangeQty={changeQty}
          />
        )}
        {mainTab === 'cart' && (
          <CartPage
            cart={cart}
            onBrowseMenu={() => setMainTab('menu')}
            onOpenAddress={() => setMainTab('address')}
            onCheckout={() => setOverlay('checkout')}
            onChangeQty={changeQty}
            onRemove={removeLine}
          />
        )}
        {mainTab === 'address' && <AddressPage />}
        {mainTab === 'profile' && (
          <ProfilePage tgUser={tgUser} onBrowseMenu={() => setMainTab('menu')} />
        )}
      </div>
      <BottomNav activeTab={mainTab} onChange={setMainTab} cartCount={cartCount} />
    </div>
  );
}
