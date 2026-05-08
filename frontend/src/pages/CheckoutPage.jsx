import { useCallback, useEffect, useMemo, useState, useId } from 'react';
import { createOrder } from '../api';
import AppHeader, { HeaderIconButton } from '../components/AppHeader';
import YandexAddressMap from '../components/YandexAddressMap';
import { loadUserPrefs, saveUserPrefs } from '../lib/userPrefs';

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
  const mapDomId = useId().replace(/:/g, '');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [payment, setPayment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

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

  useEffect(() => {
    const p = loadUserPrefs();
    if (p.phone) setPhone((prev) => prev || p.phone);
    if (p.address) setAddress((prev) => prev || p.address);
  }, []);

  const setAddressStable = useCallback((line) => {
    setAddress(line);
  }, []);

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
      saveUserPrefs({ phone: phone.trim(), address: address.trim() });
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

        <YandexAddressMap
          mapContainerId={mapDomId}
          address={address}
          onAddressChange={setAddressStable}
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
