import { useId, useEffect, useState } from 'react';
import AppHeader from '../components/AppHeader';
import EmptyState from '../components/EmptyState';
import YandexAddressMap from '../components/YandexAddressMap';
import { loadUserPrefs, PICKUP_FROM_CAFE_LABEL, saveUserPrefs } from '../lib/userPrefs';

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

const modeBtn =
  'flex-1 rounded-xl py-3 text-center text-sm font-extrabold transition active:scale-[0.98] disabled:opacity-50';

export default function AddressPage() {
  const mapId = useId().replace(/:/g, '');
  const [deliveryMode, setDeliveryMode] = useState('delivery');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [toast, setToast] = useState(false);

  useEffect(() => {
    const p = loadUserPrefs();
    setAddress(p.address || '');
    setPhone(p.phone || '');
    setDeliveryMode(p.deliveryMode === 'pickup' ? 'pickup' : 'delivery');
  }, []);

  function handleSave() {
    if (deliveryMode === 'delivery') {
      saveUserPrefs({
        address: address.trim(),
        phone: phone.trim(),
        deliveryMode: 'delivery',
      });
    } else {
      saveUserPrefs({
        phone: phone.trim(),
        deliveryMode: 'pickup',
      });
    }
    setToast(true);
    window.setTimeout(() => setToast(false), 2000);
  }

  const textareaLabel =
    'pointer-events-none absolute left-4 top-4 z-10 text-base text-muted transition-all duration-200 peer-focus:top-2 peer-focus:text-xs peer-focus:text-primary peer-[:not(:placeholder-shown)]:top-2 peer-[:not(:placeholder-shown)]:text-xs';

  return (
    <div className="box-border flex min-h-screen flex-col bg-surface pb-24">
      <AppHeader end={null} />

      <div className="px-4 pt-3">
        <h2 className="text-xl font-bold text-ink">Manzilim</h2>
        <p className="text-sm text-muted">
          Yetkazib berish yoki kafedan olib ketish — keyingi buyurtmada avtomatik ishlatiladi.
        </p>
      </div>

      <div className="mt-4 flex flex-1 flex-col gap-5 px-4 pb-6">
        <div className="flex gap-1 rounded-2xl bg-stone-100/95 p-1 ring-1 ring-black/[0.04]">
          <button
            type="button"
            className={`${modeBtn} ${
              deliveryMode === 'delivery'
                ? 'bg-white text-ink shadow-sm ring-1 ring-black/[0.06]'
                : 'text-muted hover:text-ink'
            }`}
            onClick={() => setDeliveryMode('delivery')}
          >
            Yetkazib berish
          </button>
          <button
            type="button"
            className={`${modeBtn} ${
              deliveryMode === 'pickup'
                ? 'bg-white text-ink shadow-sm ring-1 ring-black/[0.06]'
                : 'text-muted hover:text-ink'
            }`}
            onClick={() => setDeliveryMode('pickup')}
          >
            Kafedan olib ketish
          </button>
        </div>

        {deliveryMode === 'delivery' && !address.trim() && !phone.trim() ? (
          <EmptyState
            emoji="📍"
            title="Manzilingizni saqlang"
            lines={[
              "Xaritada bosing yoki joylashuv tugmasidan foydalaning - keyingi buyurtmada tezroq bo'lasiz.",
            ]}
            className="!py-6"
          />
        ) : null}

        {deliveryMode === 'delivery' ? (
          <>
            <YandexAddressMap mapContainerId={mapId} address={address} onAddressChange={setAddress} />

            <div className="relative">
              <textarea
                id="saved-address"
                rows={3}
                placeholder=" "
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className={`${fieldBase} min-h-[100px] resize-none peer pt-6`}
              />
              <label htmlFor="saved-address" className={textareaLabel}>
                Yetkazib berish manzili
              </label>
            </div>
          </>
        ) : (
          <div className="rounded-2xl border border-primary/25 bg-primary/5 p-4 ring-1 ring-primary/10">
            <p className="text-sm font-extrabold text-ink">🏪 {PICKUP_FROM_CAFE_LABEL}</p>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Buyurtmangiz tayyor bo&apos;lganda kafeda beriladi. Manzil sifatida «{PICKUP_FROM_CAFE_LABEL}» yozuvi
              yuboriladi.
            </p>
          </div>
        )}

        <FloatingField id="saved-phone" label="Telefon raqami">
          <input
            id="saved-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder=" "
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={fieldBase}
          />
        </FloatingField>

        <button type="button" onClick={handleSave} className="btn-primary w-full">
          Saqlash
        </button>

        {toast && (
          <p className="text-center text-sm font-semibold text-primary" role="status">
            Saqlandi
          </p>
        )}
      </div>
    </div>
  );
}
