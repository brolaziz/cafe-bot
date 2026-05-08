import { useCallback, useEffect, useMemo, useState, useId, useRef } from 'react';
import { createOrder, fetchP2pCardPublic, uploadOrderReceipt } from '../api';
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

/** Scroll: min balandlik + vertikal scroll; pastki bo‘sh joy (pb-20 ≈ nav + xavfsiz zona) */
const checkoutPageScrollStyle = {
  minHeight: '100vh',
  overflowY: 'auto',
};

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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  /** Buyurtma yaratilgandan keyin JSON (null = forma rejimi) */
  const [completedOrder, setCompletedOrder] = useState(null);
  const [copyHint, setCopyHint] = useState('');
  const [p2pFromApi, setP2pFromApi] = useState({ card_number: '', card_owner: '' });
  const receiptInputRef = useRef(null);
  const [receiptUploading, setReceiptUploading] = useState(false);
  const [receiptUploaded, setReceiptUploaded] = useState(false);
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState('');
  const [receiptError, setReceiptError] = useState('');

  const total = useMemo(() => cartTotal(cart), [cart]);

  const envCardNumber = (import.meta.env.VITE_CARD_NUMBER || '').trim();
  const envCardOwner = (import.meta.env.VITE_CARD_OWNER || '').trim();
  const cardNumber = (p2pFromApi.card_number || envCardNumber).trim();
  const cardOwner = (p2pFromApi.card_owner || envCardOwner).trim();
  const tgUser =
    tgUserProp ??
    window.Telegram?.WebApp?.initDataUnsafe?.user ?? {
      id: Number('000000000'),
      username: 'testuser',
    };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchP2pCardPublic();
        if (!cancelled && data && typeof data === 'object') {
          setP2pFromApi({
            card_number: typeof data.card_number === 'string' ? data.card_number : '',
            card_owner: typeof data.card_owner === 'string' ? data.card_owner : '',
          });
        }
      } catch {
        /* API yo'q yoki xato — faqat .env ishlatiladi */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  async function copyCardNumber() {
    const n = cardNumber.replace(/\s/g, '');
    if (!n) return;
    try {
      await navigator.clipboard.writeText(n);
      setCopyHint("Nusxa olindi!");
      window.setTimeout(() => setCopyHint(''), 2000);
    } catch {
      setCopyHint('Clipboard ishlamadi — raqamni qo‘lda nusxalang.');
      window.setTimeout(() => setCopyHint(''), 3000);
    }
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
      payment_method: 'p2p',
    };

    setSubmitting(true);
    try {
      const order = await createOrder(payload);
      saveUserPrefs({ phone: phone.trim(), address: address.trim() });
      setCompletedOrder(order);
    } catch (err) {
      const msg = err.response?.data?.error || err.message || "Xatolik yuz berdi.";
      setError(typeof msg === 'string' ? msg : "Buyurtma yuborilmadi.");
    } finally {
      setSubmitting(false);
    }
  }

  const textareaLabel =
    'pointer-events-none absolute left-4 top-4 z-10 text-base text-muted transition-all duration-200 peer-focus:top-2 peer-focus:text-xs peer-focus:text-primary peer-[:not(:placeholder-shown)]:top-2 peer-[:not(:placeholder-shown)]:text-xs';

  useEffect(() => {
    return () => {
      if (receiptPreviewUrl) URL.revokeObjectURL(receiptPreviewUrl);
    };
  }, [receiptPreviewUrl]);

  async function handleReceiptFileChange(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !completedOrder?._id) return;
    if (!file.type.startsWith('image/')) {
      setReceiptError('Faqat rasm tanlang.');
      return;
    }
    setReceiptError('');
    setReceiptUploading(true);
    try {
      await uploadOrderReceipt(tgUser.id, completedOrder._id, file);
      setReceiptPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(file);
      });
      setReceiptUploaded(true);
    } catch (err) {
      const msg = err.response?.data?.error || err.message || "Yuklash muvaffaqiyatsiz.";
      setReceiptError(typeof msg === 'string' ? msg : "Xatolik.");
    } finally {
      setReceiptUploading(false);
    }
  }

  if (completedOrder) {
    const orderShort = String(completedOrder._id || '')
      .slice(-6)
      .toUpperCase();
    const totalNum = Number(completedOrder.total_price);
    const totalLabel = Number.isFinite(totalNum)
      ? `${totalNum.toLocaleString('uz-UZ')} so'm`
      : `${completedOrder.total_price} so'm`;
    const isP2p =
      String(completedOrder.payment_method || '')
        .trim()
        .toLowerCase() === 'p2p';

    return (
      <div className="bg-surface pb-20" style={{ ...checkoutPageScrollStyle, paddingBottom: '80px' }}>
        <AppHeader start={<HeaderIconButton onClick={onBack} aria-label="Orqaga">←</HeaderIconButton>} />
        <div className="flex flex-col gap-5 px-4 pt-8">
          <div className="flex flex-col items-center text-center">
            <div
              className="flex h-24 w-24 items-center justify-center rounded-full bg-emerald-100 shadow-inner ring-4 ring-emerald-50"
              aria-hidden
            >
              <span className="select-none text-5xl leading-none animate-success-check">✅</span>
            </div>
            <h1 className="mt-6 text-2xl font-extrabold tracking-tight text-ink">Buyurtma qabul qilindi!</h1>
            <p className="mt-2 text-base font-bold text-primarydark">
              Buyurtma #{orderShort}
            </p>
            <p className="mt-1 text-lg font-extrabold text-primary">{totalLabel}</p>
          </div>

          {isP2p ? (
            <>
              <div className="rounded-2xl border border-stone-200/90 bg-card p-4 shadow-sm ring-1 ring-black/[0.04]">
                <p className="text-xs font-bold uppercase tracking-wide text-muted">Karta ma&apos;lumoti</p>
                {cardNumber ? (
                  <div className="mt-3 flex items-center gap-2">
                    <p className="min-w-0 flex-1 break-all font-mono text-sm font-bold text-ink">{cardNumber}</p>
                    <button
                      type="button"
                      onClick={() => void copyCardNumber()}
                      className="shrink-0 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-bold text-primarydark shadow-sm transition active:scale-95"
                    >
                      Nusxa
                    </button>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-muted">Karta raqami sozlanmagan.</p>
                )}
                {cardOwner ? (
                  <p className="mt-3 text-sm text-muted">
                    Egasi: <span className="font-semibold text-ink">{cardOwner}</span>
                  </p>
                ) : null}
                {copyHint ? <p className="mt-2 text-xs font-semibold text-primarydark">{copyHint}</p> : null}
              </div>

              <div className="rounded-2xl bg-card p-5 shadow-card ring-1 ring-black/[0.06]">
                <p className="text-sm font-bold text-ink">Chek yoki to&apos;lov skrinshotini yuklang</p>
                <p className="mt-1 text-xs text-muted">Rasm admin Telegramga yuboriladi.</p>

                <input
                  ref={receiptInputRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  disabled={receiptUploaded || receiptUploading}
                  onChange={(ev) => void handleReceiptFileChange(ev)}
                />

                {!receiptUploaded ? (
                  <button
                    type="button"
                    disabled={receiptUploading}
                    onClick={() => receiptInputRef.current?.click()}
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 py-4 text-sm font-extrabold text-primarydark transition hover:bg-primary/10 disabled:opacity-60"
                  >
                    {receiptUploading ? 'Yuborilmoqda…' : '📎 Rasm yuklash'}
                  </button>
                ) : null}

                {receiptError ? (
                  <p className="mt-3 text-sm font-medium text-red-700">{receiptError}</p>
                ) : null}

                {receiptUploaded && receiptPreviewUrl ? (
                  <div className="mt-4 flex flex-col items-center gap-3">
                    <img
                      src={receiptPreviewUrl}
                      alt="Chek"
                      className="h-36 w-auto max-w-full rounded-xl border border-stone-200 object-contain shadow-sm"
                    />
                    <p className="text-sm font-bold text-emerald-700">✅ Yuborildi</p>
                  </div>
                ) : null}
              </div>
            </>
          ) : null}

          <div className="flex flex-col gap-3 pt-4">
            <button
              type="button"
              onClick={() => onSuccess?.({ skipAlert: true })}
              className="btn-primary w-full"
            >
              Menyuga qaytish
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface pb-20" style={checkoutPageScrollStyle}>
      <AppHeader start={<HeaderIconButton onClick={onBack} aria-label="Orqaga">←</HeaderIconButton>} />

      <div className="px-4 pt-3">
        <h2 className="text-xl font-bold text-ink">Buyurtma</h2>
        <p className="text-sm text-muted">Manzil va to&apos;lov (P2P)</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5 px-4 pt-4">
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
          <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-muted">To&apos;lov</span>
          <div className="flex items-center gap-3 rounded-2xl border-2 border-primary bg-primary/10 px-4 py-3 ring-2 ring-primary/15">
            <span className="text-2xl leading-none" aria-hidden>
              💳
            </span>
            <div>
              <p className="text-sm font-extrabold text-ink">P2P o&apos;tkazma</p>
              <p className="text-xs text-muted">Payme va Click vaqtincha o&apos;chirilgan</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-stone-200/90 bg-card p-4 shadow-sm ring-1 ring-black/[0.04]">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Karta ma&apos;lumoti</p>
          {cardNumber ? (
            <div className="mt-3 flex items-center gap-2">
              <p className="min-w-0 flex-1 break-all font-mono text-sm font-bold text-ink">{cardNumber}</p>
              <button
                type="button"
                onClick={() => void copyCardNumber()}
                className="shrink-0 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-bold text-primarydark shadow-sm transition active:scale-95"
              >
                Nusxa
              </button>
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted">
              Karta raqami hali kiritilmagan. Admin Telegramda «💳 P2P karta» orqali qo&apos;shadi yoki .env da
              VITE_CARD_NUMBER.
            </p>
          )}
          {cardOwner ? (
            <p className="mt-3 text-sm text-muted">
              Egasi: <span className="font-semibold text-ink">{cardOwner}</span>
            </p>
          ) : null}
          {copyHint ? <p className="mt-2 text-xs font-semibold text-primarydark">{copyHint}</p> : null}
          <p className="mt-4 text-sm leading-relaxed text-muted">
            To&apos;lovni amalga oshirib, quyidagi tugmani bosing
          </p>
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
          className="btn-primary w-full"
        >
          {submitting ? 'Yuborilmoqda…' : 'Tasdiqlash'}
        </button>
      </form>
    </div>
  );
}
