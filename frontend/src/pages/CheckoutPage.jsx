import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createOrder } from '../api';
import AppHeader, { HeaderIconButton } from '../components/AppHeader';

const TASHKENT_CENTER = [41.2995, 69.2401];

function cartTotal(cart) {
  return cart.reduce((s, line) => s + line.price * line.qty, 0);
}

const fieldBase =
  'peer w-full rounded-2xl border border-stone-200 bg-card px-4 pb-2.5 pt-5 text-base text-ink shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15';

const labelBase =
  'pointer-events-none absolute left-4 top-4 z-10 text-base text-muted transition-all duration-200 peer-focus:top-2 peer-focus:text-xs peer-focus:text-primary peer-[:not(:placeholder-shown)]:top-2 peer-[:not(:placeholder-shown)]:text-xs';

function FloatingField({ id, label, children }) {
  return (
    <div className="relative">
      {children}
      <label htmlFor={id} className={labelBase}>
        {label}
      </label>
    </div>
  );
}

export default function CheckoutPage({ cart, tgUser: tgUserProp, onBack, onSuccess }) {
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [payment, setPayment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const mapRef = useRef(null);
  const placemarkRef = useRef(null);

  const total = useMemo(() => cartTotal(cart), [cart]);

  const tgUser =
    tgUserProp ??
    window.Telegram?.WebApp?.initDataUnsafe?.user ?? {
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

  const textareaLabel =
    'pointer-events-none absolute left-4 top-4 z-10 text-base text-muted transition-all duration-200 peer-focus:top-2 peer-focus:text-xs peer-focus:text-primary peer-[:not(:placeholder-shown)]:top-2 peer-[:not(:placeholder-shown)]:text-xs';

  return (
    <div className="flex min-h-[100dvh] flex-col bg-surface pb-8">
      <AppHeader start={<HeaderIconButton onClick={onBack} aria-label="Orqaga">←</HeaderIconButton>} />

      <div className="px-4 pt-3">
        <h2 className="text-xl font-bold text-ink">Buyurtma</h2>
        <p className="text-sm text-muted">Manzil va to'lovni tasdiqlang</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-5 px-4 pt-4">
        {error && (
          <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-800 ring-1 ring-red-200/80">
            {error}
          </div>
        )}

        <FloatingField id="checkout-phone" label="Telefon raqami">
          <input
            id="checkout-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder=" "
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={fieldBase}
          />
        </FloatingField>

        <div className="block">
          <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-muted">Xarita</span>
          <button
            type="button"
            onClick={handleMyLocation}
            className="mb-3 w-full rounded-2xl border border-stone-200 bg-card py-3 text-sm font-bold text-ink shadow-sm transition hover:border-primary/30 hover:bg-surface active:scale-[0.99]"
          >
            📍 Mening joylashuvim
          </button>
          <div
            id="yandex-map"
            className="mb-3 h-[250px] w-full overflow-hidden rounded-2xl bg-surface ring-1 ring-stone-200/80"
          />
          <div className="relative">
            <textarea
              id="checkout-address"
              rows={3}
              placeholder=" "
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className={`${fieldBase} min-h-[100px] resize-none peer pt-6`}
            />
            <label htmlFor="checkout-address" className={textareaLabel}>
              Yetkazib berish manzili
            </label>
          </div>
        </div>

        <div>
          <span className="mb-3 block text-xs font-bold uppercase tracking-wide text-muted">To'lov usuli</span>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setPayment('Payme')}
              className={`flex min-h-[130px] flex-col items-center justify-center gap-2 rounded-2xl border-2 bg-card p-4 ${
                payment === 'Payme'
                  ? 'border-primary shadow-md ring-2 ring-primary/20'
                  : 'border-stone-200/80 hover:border-primary/35'
              }`}
            >
              <img
                src="/payme.png"
                alt="Payme"
                className="h-12 w-auto max-w-[92%] object-contain"
                width={140}
                height={48}
              />
              <span className="text-xs font-bold text-ink">Payme</span>
            </button>
            <button
              type="button"
              onClick={() => setPayment('Click')}
              className={`flex min-h-[130px] flex-col items-center justify-center gap-2 rounded-2xl border-2 bg-card p-3 ${
                payment === 'Click'
                  ? 'border-primary shadow-md ring-2 ring-primary/20'
                  : 'border-stone-200/80 hover:border-primary/35'
              }`}
            >
              <div className="flex min-h-[6.5rem] w-full max-w-[180px] items-center justify-center overflow-visible py-1">
                <img
                  src="/click.png"
                  alt="Click"
                  className="h-14 w-auto max-w-[95%] origin-center scale-[1.72] object-contain object-center"
                  width={220}
                  height={88}
                />
              </div>
              <span className="text-xs font-bold text-ink">Click</span>
            </button>
          </div>
        </div>

        <div className="rounded-2xl bg-card p-4 shadow-card ring-1 ring-black/[0.05]">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-muted">Jami</span>
            <span className="text-xl font-extrabold text-primary">{total.toLocaleString('uz-UZ')} so'm</span>
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting || cart.length === 0}
          className="btn-primary mt-auto w-full"
        >
          {submitting ? 'Yuborilmoqda…' : 'Tasdiqlash'}
        </button>
      </form>
    </div>
  );
}
