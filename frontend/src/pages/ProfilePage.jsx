import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchMyOrders } from '../api';
import AppHeader from '../components/AppHeader';
import EmptyState from '../components/EmptyState';
import { loadUserPrefs, saveUserPrefs } from '../lib/userPrefs';

const STATUS_UZ = {
  pending: 'Kutilmoqda',
  confirmed: 'Qabul qilindi',
  preparing: 'Tayyorlanmoqda',
  ready: 'Tayyor',
  delivered: 'Yetkazildi',
  cancelled: 'Bekor qilindi',
};

const ACTIVE_STATUSES = new Set(['pending', 'confirmed', 'preparing', 'ready']);

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

function OrderCard({ order }) {
  return (
    <li className="rounded-2xl bg-card p-4 shadow-card ring-1 ring-black/[0.05]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-bold text-muted">#{String(order._id).slice(-6)}</span>
        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary">
          {STATUS_UZ[order.status] || order.status}
        </span>
      </div>
      <p className="mt-2 text-xs text-muted">{formatOrderWhen(order.created_at)}</p>
      <p className="mt-1 text-sm font-semibold text-ink">
        {(order.items || []).map((it) => `${it.name} ×${it.qty}`).join(', ')}
      </p>
      <p className="mt-2 text-sm font-bold text-primary">
        {Number(order.total_price || 0).toLocaleString('uz-UZ')} so'm · {order.payment_method}
      </p>
      {order.address ? <p className="mt-2 line-clamp-2 text-xs text-muted">📍 {order.address}</p> : null}
    </li>
  );
}

export default function ProfilePage({ tgUser, onBrowseMenu }) {
  const [displayName, setDisplayName] = useState('');
  const [editing, setEditing] = useState(false);
  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [ordersError, setOrdersError] = useState(null);
  const [ordersTab, setOrdersTab] = useState('active');

  const telegramId = tgUser?.id;
  const telegramFullName = useMemo(() => {
    const a = [tgUser?.first_name, tgUser?.last_name].filter(Boolean).join(' ').trim();
    return a || '';
  }, [tgUser]);

  const activeOrders = useMemo(
    () => orders.filter((o) => ACTIVE_STATUSES.has(o.status)),
    [orders]
  );
  const pastOrders = useMemo(
    () => orders.filter((o) => !ACTIVE_STATUSES.has(o.status)),
    [orders]
  );

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

  const shownOrders = ordersTab === 'active' ? activeOrders : pastOrders;

  return (
    <div className="box-border flex min-h-[100dvh] flex-col bg-surface pb-[calc(56px+max(0.5rem,env(safe-area-inset-bottom)))]">
      <AppHeader end={null} />

      <div className="px-4 pt-3">
        <h2 className="text-xl font-bold text-ink">Profil</h2>
        <p className="text-sm text-muted">Shaxsiy ma'lumotlar va buyurtmalar</p>
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
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-base font-bold text-ink">Buyurtmalar</h3>
          {telegramId ? (
            <button
              type="button"
              onClick={() => void loadOrders()}
              className="shrink-0 text-xs font-bold text-primary active:opacity-70"
            >
              Yangilash
            </button>
          ) : null}
        </div>

        <div className="mb-4 flex rounded-2xl bg-stone-200/60 p-1">
          <button
            type="button"
            onClick={() => setOrdersTab('active')}
            className={`flex-1 rounded-xl py-2.5 text-xs font-extrabold transition ${
              ordersTab === 'active' ? 'bg-white text-primary shadow-sm' : 'text-muted'
            }`}
          >
            Faol buyurtmalar
            {activeOrders.length > 0 ? (
              <span className="ml-1 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-primary/15 px-1 text-[10px] text-primary">
                {activeOrders.length}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            onClick={() => setOrdersTab('past')}
            className={`flex-1 rounded-xl py-2.5 text-xs font-extrabold transition ${
              ordersTab === 'past' ? 'bg-white text-primary shadow-sm' : 'text-muted'
            }`}
          >
            Eski buyurtmalar
            {pastOrders.length > 0 ? (
              <span className="ml-1 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-stone-300/50 px-1 text-[10px] text-ink">
                {pastOrders.length}
              </span>
            ) : null}
          </button>
        </div>

        {!telegramId ? (
          <EmptyState
            emoji="✨"
            title="Telegramda oching"
            lines={["Buyurtmalar va tarix shu yerda ko'rinadi. Ilovani Telegram ichidan oching."]}
          />
        ) : loadingOrders ? (
          <div className="flex flex-col items-center gap-3 py-12">
            <div className="h-9 w-9 animate-spin rounded-full border-2 border-primary/25 border-t-primary" />
            <p className="text-sm font-semibold text-muted">Yuklanmoqda…</p>
          </div>
        ) : ordersError ? (
          <EmptyState
            emoji="📡"
            title="Yuklanmadi"
            lines={[ordersError]}
            primaryLabel="Qayta urinish"
            onPrimary={() => void loadOrders()}
          />
        ) : shownOrders.length === 0 ? (
          ordersTab === 'active' ? (
            <EmptyState
              emoji="🎉"
              title="Faol buyurtma yo'q"
              lines={["Hozircha jarayondagi buyurtmalar yo'q - yangisini berib ko'ring!"]}
              primaryLabel="Mahsulotlarga o'tish"
              onPrimary={onBrowseMenu}
            />
          ) : (
            <EmptyState
              emoji="📜"
              title="Tarix bo'sh"
              lines={["Tugagan buyurtmalar shu yerda to'planadi."]}
              primaryLabel="Mahsulotlarga o'tish"
              onPrimary={onBrowseMenu}
            />
          )
        ) : (
          <ul className="flex flex-col gap-3">
            {shownOrders.map((o) => (
              <OrderCard key={String(o._id)} order={o} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
