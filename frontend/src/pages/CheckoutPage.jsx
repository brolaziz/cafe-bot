import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createOrder } from '../api';

const TASHKENT_CENTER = [41.2995, 69.2401];

function cartTotal(cart) {
  return cart.reduce((s, line) => s + line.price * line.qty, 0);
}

export default function CheckoutPage({ cart, onBack, onSuccess }) {
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [payment, setPayment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const mapRef = useRef(null);
  const placemarkRef = useRef(null);

  const total = useMemo(() => cartTotal(cart), [cart]);

  const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user || {
    id: Number('000000000'),
    username: 'testuser',
  };

  useEffect(() => {
    if (cart.length === 0) {
      onBack();
    }
  }, [cart.length, onBack]);

  const applyCoords = useCallback(async (coords, zoom) => {
    const ymaps = window.ymaps;
    if (!ymaps || !mapRef.current) return;

    const map = mapRef.current;
    if (placemarkRef.current) {
      map.geoObjects.remove(placemarkRef.current);
    }
    placemarkRef.current = new ymaps.Placemark(
      coords,
      {},
      { preset: 'islands#orangeCircleDotIcon' }
    );
    map.geoObjects.add(placemarkRef.current);
    if (typeof zoom === 'number') {
      map.setCenter(coords, zoom);
    }

    try {
      const res = await ymaps.geocode(coords, { results: 1 });
      const first = res.geoObjects.get(0);
      const line = first ? first.getAddressLine() : '';
      console.log('address:', line);
      setAddress(line);
    } catch (err) {
      console.error('Yandex geocode error:', err);
    }
  }, [setAddress]);

  useEffect(() => {
    let cancelled = false;

    const initMap = () => {
      if (cancelled) return;
      if (!document.getElementById('yandex-map') || mapRef.current) return;
      const ymaps = window.ymaps;
      if (!ymaps) return;

      ymaps.ready(() => {
        if (cancelled || mapRef.current) return;
        try {
          const map = new ymaps.Map('yandex-map', {
            center: TASHKENT_CENTER,
            zoom: 13,
            controls: ['zoomControl'],
          });
          mapRef.current = map;

          map.events.add('click', (e) => {
            const coords = e.get('coords');
            void applyCoords(coords);
          });
        } catch (err) {
          console.error('Yandex map init:', err);
        }
      });
    };

    const loadScript = () => {
      if (cancelled) return;
      if (window.ymaps) {
        initMap();
        return;
      }

      const existing = Array.from(document.getElementsByTagName('script')).find(
        (s) => s.src && s.src.includes('api-maps.yandex.ru/2.1/')
      );
      if (existing) {
        if (window.ymaps) {
          initMap();
        } else {
          existing.addEventListener('load', () => {
            if (!cancelled) initMap();
          });
        }
        return;
      }

      const script = document.createElement('script');
      const key = import.meta.env.VITE_YANDEX_MAPS_KEY ?? '';
      script.src = `https://api-maps.yandex.ru/2.1/?apikey=${key}&lang=uz_UZ`;
      script.async = true;
      script.onload = () => {
        if (!cancelled) initMap();
      };
      script.onerror = () => {
        console.error('Yandex Maps script failed to load');
      };
      document.head.appendChild(script);
    };

    loadScript();

    return () => {
      cancelled = true;
      placemarkRef.current = null;
      if (mapRef.current) {
        try {
          mapRef.current.destroy();
        } catch {
          /* ignore */
        }
        mapRef.current = null;
      }
      const mapEl = document.getElementById('yandex-map');
      if (mapEl) mapEl.innerHTML = '';
    };
  }, [applyCoords]);

  function handleMyLocation() {
    if (!navigator.geolocation) {
      window.alert("Joylashuv ruxsati berilmadi");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = [pos.coords.latitude, pos.coords.longitude];
        void applyCoords(coords, 16);
      },
      () => {
        window.alert("Joylashuv ruxsati berilmadi");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (!phone.trim()) {
      setError('Telefon raqamini kiriting.');
      return;
    }
    if (!address.trim()) {
      setError('Manzilni kiriting.');
      return;
    }
    if (!payment) {
      setError("To'lov usulini tanlang.");
      return;
    }

    const payload = {
      telegram_user_id: tgUser.id,
      telegram_username: tgUser.username || '',
      items: cart.map((line) => ({
        product_id: line.productId,
        name: line.name_uz,
        price: line.price,
        qty: line.qty,
      })),
      total_price: total,
      address: address.trim(),
      phone: phone.trim(),
      payment_method: payment,
    };

    setSubmitting(true);
    try {
      await createOrder(payload);
      onSuccess?.();
    } catch (err) {
      const msg = err.response?.data?.error || err.message || "Xatolik yuz berdi.";
      setError(typeof msg === 'string' ? msg : "Buyurtma yuborilmadi.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-stone-50 pb-8">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-stone-200/80 bg-stone-50/95 px-3 py-3 backdrop-blur">
        <button
          type="button"
          onClick={onBack}
          className="rounded-full p-2 text-stone-700 ring-1 ring-stone-200 active:bg-stone-100"
          aria-label="Orqaga"
        >
          ←
        </button>
        <h1 className="text-lg font-bold text-stone-900">Buyurtma</h1>
      </header>

      <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-4 px-4 pt-4">
        {error && (
          <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200">{error}</div>
        )}

        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-stone-700">Telefon raqami</span>
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+998 90 123 45 67"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-base outline-none ring-primary/30 focus:ring-2"
          />
        </label>

        <div className="block">
          <span className="mb-1.5 block text-sm font-semibold text-stone-700">Yetkazib berish manzili</span>
          <button
            type="button"
            onClick={handleMyLocation}
            className="mb-2 w-full rounded-xl bg-white py-2.5 text-sm font-semibold text-stone-800 ring-1 ring-stone-200 active:bg-stone-50"
          >
            📍 Mening joylashuvim
          </button>
          <div
            id="yandex-map"
            className="mb-2 h-[250px] w-full overflow-hidden rounded-xl bg-stone-100 ring-1 ring-stone-200"
          />
          <textarea
            rows={3}
            placeholder="Ko'cha, uy raqami, orientir…"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full resize-none rounded-xl border border-stone-200 bg-white px-4 py-3 text-base outline-none ring-primary/30 focus:ring-2"
          />
        </div>

        <div>
          <span className="mb-2 block text-sm font-semibold text-stone-700">To'lov usuli</span>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setPayment('Payme')}
              className={`flex flex-col items-center justify-center gap-2 rounded-2xl border-2 bg-white p-4 transition ${
                payment === 'Payme' ? 'border-primary ring-2 ring-primary/30' : 'border-stone-200'
              }`}
            >
              <img src="/payme.svg" alt="" className="h-10 w-10 object-contain" width={40} height={40} />
              <span className="text-sm font-bold text-stone-900">Payme</span>
            </button>
            <button
              type="button"
              onClick={() => setPayment('Click')}
              className={`flex flex-col items-center justify-center gap-2 rounded-2xl border-2 bg-white p-4 transition ${
                payment === 'Click' ? 'border-primary ring-2 ring-primary/30' : 'border-stone-200'
              }`}
            >
              <img src="/click.svg" alt="" className="h-10 w-10 object-contain" width={40} height={40} />
              <span className="text-sm font-bold text-stone-900">Click</span>
            </button>
          </div>
        </div>

        <div className="mt-2 rounded-2xl bg-white p-4 ring-1 ring-stone-200">
          <div className="flex justify-between text-stone-600">
            <span>Jami</span>
            <span className="text-lg font-bold text-primary">{total.toLocaleString('uz-UZ')} so'm</span>
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting || cart.length === 0}
          className="mt-auto w-full rounded-2xl bg-primary py-3.5 text-base font-bold text-white shadow-lg shadow-primary/25 disabled:cursor-not-allowed disabled:bg-stone-300 disabled:shadow-none"
        >
          {submitting ? 'Yuborilmoqda…' : 'Tasdiqlash'}
        </button>
      </form>
    </div>
  );
}
