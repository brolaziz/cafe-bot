import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchMyOrders } from '../api';
import AppHeader from '../components/AppHeader';
import { loadUserPrefs, saveUserPrefs } from '../lib/userPrefs';

const STATUS_UZ = {
  pending: 'Kutilmoqda',
  confirmed: 'Qabul qilindi',
  preparing: 'Tayyorlanmoqda',
  ready: 'Tayyor',
  delivered: 'Yetkazildi',
  cancelled: 'Bekor qilindi',
};

function formatOrderWhen(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString('uz-UZ', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

export default function ProfilePage({ tgUser }) {
  const [displayName, setDisplayName] = useState('');
  const [editing, setEditing] = useState(false);
  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [ordersError, setOrdersError] = useState(null);

  const telegramId = tgUser?.id;
  const telegramFullName = useMemo(() => {
    const a = [tgUser?.first_name, tgUser?.last_name].filter(Boolean).join(' ').trim();
    return a || '';
  }, [tgUser]);

  useEffect(() => {
    const p = loadUserPrefs();
    setDisplayName(p.displayName?.trim() ? p.displayName : telegramFullName);
  }, [telegramFullName]);

  const loadOrders = useCallback(async () => {
    if (!telegramId) {
      setOrders([]);
      setLoadingOrders(false);
      setOrdersError(null);
      return;
    }
    setLoadingOrders(true);
    setOrdersError(null);
    try {
      const data = await fetchMyOrders(telegramId);
      setOrders(Array.isArray(data) ? data : []);
    } catch {
      setOrders([]);
      setOrdersError("Buyurtmalar ro'yxatini yuklab bo'lmadi.");
    } finally {
      setLoadingOrders(false);
    }
  }, [telegramId]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  function handleSaveProfile() {
    const name = displayName.trim();
    saveUserPrefs({ displayName: name });
    setEditing(false);
  }

  const visibleName = displayName.trim() || telegramFullName || 'Mehmon';

  return (
    <div className="box-border flex min-h-[100dvh] flex-col bg-surface pb-[calc(56px+max(0.5rem,env(safe-area-inset-bottom)))]">
      <AppHeader end={null} />

      <div className="px-4 pt-3">
        <h2 className="text-xl font-bold text-ink">Profil</h2>
        <p className="text-sm text-muted">Shaxsiy ma'lumotlar va buyurtmalar tarixi</p>
      </div>

      <section className="mx-4 mt-5 rounded-2xl bg-card p-4 shadow-card ring-1 ring-black/[0.05]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide text-muted">Ism-familiya</p>
            {editing ? (
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="mt-2 w-full rounded-xl border border-stone-200 px-3 py-2 text-base font-semibold text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                placeholder="Ismingizni kiriting"
                autoComplete="name"
              />
            ) : (
              <p className="mt-1 text-lg font-bold text-ink">{visibleName}</p>
            )}
            {tgUser?.username ? (
              <p className="mt-1 truncate text-sm text-muted">@{tgUser.username}</p>
            ) : null}
          </div>
          {editing ? (
            <div className="flex shrink-0 flex-col gap-2">
              <button
                type="button"
                onClick={handleSaveProfile}
                className="rounded-full bg-primary px-4 py-2 text-xs font-bold text-white shadow-sm active:scale-95"
              >
                Saqlash
              </button>
              <button
                type="button"
                onClick={() => {
                  const p = loadUserPrefs();
                  setDisplayName(p.displayName?.trim() ? p.displayName : telegramFullName);
                  setEditing(false);
                }}
                className="rounded-full border border-stone-200 bg-white px-4 py-2 text-xs font-bold text-ink active:scale-95"
              >
                Bekor
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="shrink-0 rounded-full border border-stone-200 bg-white px-4 py-2 text-xs font-bold text-ink shadow-sm active:scale-95"
            >
              Tahrirlash
            </button>
          )}
        </div>
      </section>

      <section className="mx-4 mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-bold text-ink">Buyurtmalar va tarix</h3>
          {telegramId ? (
            <button
              type="button"
              onClick={() => void loadOrders()}
              className="text-xs font-bold text-primary active:opacity-70"
            >
              Yangilash
            </button>
          ) : null}
        </div>

        {!telegramId ? (
          <p className="rounded-2xl bg-card px-4 py-6 text-center text-sm text-muted ring-1 ring-black/[0.05]">
            Buyurtmalar Telegram orqali ko'rinadi. Ilovani Telegram ichidan oching.
          </p>
        ) : loadingOrders ? (
          <p className="py-8 text-center text-sm font-medium text-muted">Yuklanmoqda…</p>
        ) : ordersError ? (
          <p className="rounded-2xl bg-red-50 px-4 py-4 text-center text-sm text-red-800 ring-1 ring-red-200/80">
            {ordersError}
          </p>
        ) : orders.length === 0 ? (
          <p className="rounded-2xl bg-card px-4 py-8 text-center text-sm text-muted ring-1 ring-black/[0.05]">
            Hali buyurtma yo'q. Mahsulotlar bo'limidan tanlang.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {orders.map((o) => (
              <li
                key={String(o._id)}
                className="rounded-2xl bg-card p-4 shadow-card ring-1 ring-black/[0.05]"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-muted">#{String(o._id).slice(-6)}</span>
                  <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary">
                    {STATUS_UZ[o.status] || o.status}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted">{formatOrderWhen(o.created_at)}</p>
                <p className="mt-1 text-sm font-semibold text-ink">
                  {(o.items || [])
                    .map((it) => `${it.name} ×${it.qty}`)
                    .join(', ')}
                </p>
                <p className="mt-2 text-sm font-bold text-primary">
                  {Number(o.total_price || 0).toLocaleString('uz-UZ')} so'm · {o.payment_method}
                </p>
                {o.address ? (
                  <p className="mt-2 line-clamp-2 text-xs text-muted">📍 {o.address}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
