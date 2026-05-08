import { useId, useEffect, useState } from 'react';
import AppHeader from '../components/AppHeader';
import YandexAddressMap from '../components/YandexAddressMap';
import { loadUserPrefs, saveUserPrefs } from '../lib/userPrefs';

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

export default function AddressPage() {
  const mapId = useId().replace(/:/g, '');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [toast, setToast] = useState(false);

  useEffect(() => {
    const p = loadUserPrefs();
    setAddress(p.address || '');
    setPhone(p.phone || '');
  }, []);

  function handleSave() {
    saveUserPrefs({
      address: address.trim(),
      phone: phone.trim(),
    });
    setToast(true);
    window.setTimeout(() => setToast(false), 2000);
  }

  const textareaLabel =
    'pointer-events-none absolute left-4 top-4 z-10 text-base text-muted transition-all duration-200 peer-focus:top-2 peer-focus:text-xs peer-focus:text-primary peer-[:not(:placeholder-shown)]:top-2 peer-[:not(:placeholder-shown)]:text-xs';

  return (
    <div className="box-border flex min-h-[100dvh] flex-col bg-surface pb-[calc(56px+max(0.5rem,env(safe-area-inset-bottom)))]">
      <AppHeader end={null} />

      <div className="px-4 pt-3">
        <h2 className="text-xl font-bold text-ink">Manzilim</h2>
        <p className="text-sm text-muted">Yetkazib berish manzili va telefon - keyingi buyurtmalarda avtomatik to'ldiriladi.</p>
      </div>

      <div className="mt-4 flex flex-1 flex-col gap-5 px-4 pb-6">
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
