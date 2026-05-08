import { useCallback, useEffect, useMemo, useState } from 'react';
import { deleteAllMyOrders, deleteMyOrder, fetchMyOrders } from '../api';
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

const pressable =
  'transition duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50';

function ConfirmSheet({ open, title, description, confirmLabel, onConfirm, onCancel, loading, tone = 'danger' }) {
  if (!open) return null;

  const confirmBtn =
    tone === 'danger'
      ? 'bg-rose-600 text-white shadow-md shadow-rose-600/25 hover:bg-rose-700'
      : 'bg-primary text-white shadow-md hover:bg-primarydark';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
    >
      <button
        type="button"
        aria-label="Yopish"
        className={`absolute inset-0 bg-ink/35 backdrop-blur-[6px] animate-modal-backdrop ${pressable}`}
        onClick={() => {
          if (!loading) onCancel();
        }}
      />
      <div
        className={`relative z-10 mx-4 w-full max-w-sm rounded-2xl bg-white p-6 shadow-[0_24px_64px_rgba(0,0,0,0.18)] ring-1 ring-black/[0.06] animate-modal-sheet motion-reduce:animate-none motion-reduce:opacity-100 motion-reduce:transform-none`}
      >
        <p id="confirm-title" className="text-lg font-bold tracking-tight text-ink">
          {title}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted">{description}</p>
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className={`flex-1 rounded-2xl border border-stone-200/90 bg-white py-3.5 text-sm font-bold text-ink shadow-sm ${pressable}`}
          >
            Bekor qilish
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 rounded-2xl py-3.5 text-sm font-bold ${confirmBtn} ${pressable}`}
          >
            {loading ? '…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function OrderCard({ order, index, telegramId, onRequestDelete, deletingId }) {
  const busy = deletingId === String(order._id);
  return (
    <li
      className="group relative overflow-hidden rounded-[1.15rem] bg-card p-4 shadow-[0_4px_20px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.05] transition duration-300 ease-out animate-card-rise motion-reduce:animate-none"
      style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wide text-muted">
              #{String(order._id).slice(-6)}
            </span>
            <span className="rounded-full bg-primary/12 px-2.5 py-0.5 text-[11px] font-bold text-primarydark">
              {STATUS_UZ[order.status] || order.status}
            </span>
          </div>
          <p className="mt-2 text-xs text-muted">{formatOrderWhen(order.created_at)}</p>
          <p className="mt-1.5 text-sm font-semibold leading-snug text-ink">
            {(order.items || []).map((it) => `${it.name} ×${it.qty}`).join(', ')}
          </p>
          <p className="mt-2 text-sm font-bold text-primarydark">
            {Number(order.total_price || 0).toLocaleString('uz-UZ')} so'm · {order.payment_method}
          </p>
          {order.address ? (
            <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted">
              <span className="mr-0.5" aria-hidden>
                📍
              </span>
              {order.address}
            </p>
          ) : null}
        </div>
        {telegramId ? (
          <button
            type="button"
            aria-label="Buyurtmani o'chirish"
            disabled={busy}
            onClick={() => onRequestDelete(order)}
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-stone-200/80 bg-white text-base shadow-sm hover:border-primary/30 hover:bg-primary/5 ${pressable}`}
          >
            {busy ? (
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-primary/25 border-t-primary" />
            ) : (
              <span className="leading-none" aria-hidden>
                🗑️
              </span>
            )}
          </button>
        ) : null}
      </div>
    </li>
  );
}

export default function ProfilePage({ tgUser, onBrowseMenu }) {
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [editing, setEditing] = useState(false);
  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [ordersError, setOrdersError] = useState(null);
  const [ordersTab, setOrdersTab] = useState('active');
  const [deletingId, setDeletingId] = useState(null);
  const [clearingAll, setClearingAll] = useState(false);
  const [actionError, setActionError] = useState(null);

  const [confirm, setConfirm] = useState(null);

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
    setPhone(p.phone || '');
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
    const ph = phone.trim();
    saveUserPrefs({ displayName: name, phone: ph });
    setEditing(false);
  }

  const visibleName = displayName.trim() || telegramFullName || 'Mehmon';
  const visiblePhone = phone.trim();
  const shownOrders = ordersTab === 'active' ? activeOrders : pastOrders;

  async function handleConfirmDelete() {
    const snapshot = confirm;
    if (!snapshot || !telegramId) return;
    setActionError(null);
    try {
      if (snapshot.mode === 'all') {
        setClearingAll(true);
        await deleteAllMyOrders(telegramId);
        setOrders([]);
        setConfirm(null);
        return;
      }
      if (snapshot.mode === 'one' && snapshot.orderId) {
        setDeletingId(snapshot.orderId);
        await deleteMyOrder(telegramId, snapshot.orderId);
        setOrders((prev) => prev.filter((o) => String(o._id) !== snapshot.orderId));
        setConfirm(null);
      }
    } catch (e) {
      const msg = e.response?.data?.error || e.message || "O'chirishda xatolik.";
      setActionError(typeof msg === 'string' ? msg : "O'chirishda xatolik.");
    } finally {
      setDeletingId(null);
      setClearingAll(false);
    }
  }

  return (
    <div className="box-border flex min-h-[100dvh] flex-col bg-surface pb-[calc(56px+max(0.75rem,env(safe-area-inset-bottom)))]">
      <AppHeader end={null} />

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto scroll-smooth [-webkit-overflow-scrolling:touch]">
        <div className="px-4 pt-2">
          <div
            className="relative overflow-hidden rounded-[1.65rem] bg-gradient-to-br from-card via-card to-primary/[0.12] p-5 shadow-[0_12px_40px_rgba(0,0,0,0.07)] ring-1 ring-black/[0.05] backdrop-blur-xl animate-card-rise motion-reduce:animate-none"
            style={{ animationDelay: '0ms' }}
          >
            <div className="pointer-events-none absolute -right-6 -top-6 h-28 w-28 rounded-full bg-primary/20 blur-2xl" />
            <div className="pointer-events-none absolute -bottom-8 -left-8 h-24 w-24 rounded-full bg-primary/15 blur-2xl" />
            <p className="relative text-[11px] font-bold uppercase tracking-[0.14em] text-muted">Profil</p>
            <h2 className="relative mt-1.5 text-[1.65rem] font-bold leading-tight tracking-tight text-ink">
              {visibleName}
            </h2>
            <div className="relative mt-4 flex items-center gap-2.5 rounded-2xl bg-white/55 px-3.5 py-2.5 ring-1 ring-black/[0.04] backdrop-blur-md">
              <span className="text-lg leading-none opacity-90" aria-hidden>
                📱
              </span>
              <p className={`min-w-0 flex-1 text-[15px] font-semibold ${visiblePhone ? 'text-ink' : 'text-muted'}`}>
                {visiblePhone || "Telefon saqlanmagan — tahrirlash orqali qo'shing"}
              </p>
            </div>
            {tgUser?.username ? (
              <p className="relative mt-3 truncate text-xs font-medium text-muted">
                <span aria-hidden>✨ </span>@{tgUser.username}
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-4 px-4 pb-6">
          {actionError ? (
            <div
              className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800 ring-1 ring-rose-200/80 animate-tab-content"
              role="status"
            >
              {actionError}
            </div>
          ) : null}

          <section
            className="overflow-hidden rounded-[1.35rem] bg-card p-4 shadow-[0_6px_28px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.05] animate-card-rise motion-reduce:animate-none"
            style={{ animationDelay: '60ms' }}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/14 text-xl shadow-inner"
                  aria-hidden
                >
                  👤
                </span>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-ink">Shaxsiy ma&apos;lumot</h3>
                  <p className="text-xs text-muted">Ism va telefon — keyingi buyurtmalarda</p>
                </div>
              </div>
              {!editing ? (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className={`shrink-0 rounded-full border border-stone-200/90 bg-white px-4 py-2 text-xs font-bold text-primarydark shadow-sm ${pressable}`}
                >
                  ✏️ Tahrirlash
                </button>
              ) : null}
            </div>

            {editing ? (
              <div className="mt-4 space-y-3 border-t border-stone-100 pt-4 animate-tab-content">
                <div>
                  <label htmlFor="profile-name" className="text-[11px] font-bold uppercase tracking-wide text-muted">
                    Ism
                  </label>
                  <input
                    id="profile-name"
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="mt-1.5 w-full rounded-2xl border border-stone-200/90 bg-surface/80 px-4 py-3 text-base font-semibold text-ink shadow-sm outline-none ring-0 transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                    placeholder="Ismingiz"
                    autoComplete="name"
                  />
                </div>
                <div>
                  <label htmlFor="profile-phone" className="text-[11px] font-bold uppercase tracking-wide text-muted">
                    Telefon
                  </label>
                  <input
                    id="profile-phone"
                    type="tel"
                    inputMode="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="mt-1.5 w-full rounded-2xl border border-stone-200/90 bg-surface/80 px-4 py-3 text-base font-semibold text-ink shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                    placeholder="+998 …"
                    autoComplete="tel"
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleSaveProfile}
                    className={`flex-1 rounded-2xl bg-primary py-3 text-sm font-bold text-white shadow-md shadow-primary/25 ${pressable}`}
                  >
                    💾 Saqlash
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const p = loadUserPrefs();
                      setDisplayName(p.displayName?.trim() ? p.displayName : telegramFullName);
                      setPhone(p.phone || '');
                      setEditing(false);
                    }}
                    className={`rounded-2xl border border-stone-200/90 bg-white px-4 py-3 text-sm font-bold text-ink shadow-sm ${pressable}`}
                  >
                    Bekor
                  </button>
                </div>
              </div>
            ) : null}
          </section>

          <section
            className="overflow-hidden rounded-[1.35rem] bg-card shadow-[0_6px_28px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.05] animate-card-rise motion-reduce:animate-none"
            style={{ animationDelay: '120ms' }}
          >
            <div className="flex items-start justify-between gap-3 border-b border-stone-100/90 p-4">
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/14 text-xl shadow-inner"
                  aria-hidden
                >
                  📋
                </span>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-ink">Buyurtmalar</h3>
                  <p className="text-xs text-muted">Faol va yakunlangan buyurtmalar</p>
                </div>
              </div>
              {telegramId ? (
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <button
                    type="button"
                    onClick={() => void loadOrders()}
                    className={`rounded-full px-3 py-1.5 text-[11px] font-bold text-primarydark hover:bg-primary/10 ${pressable}`}
                  >
                    🔄 Yangilash
                  </button>
                  {orders.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => {
                        setActionError(null);
                        setConfirm({
                          mode: 'all',
                          title: "Barcha tarixni o'chirish?",
                          description:
                            "Barcha buyurtmalar tarixidan o'chiriladi. Bu amalni qaytarib bo'lmaydi. Davom etasizmi?",
                        });
                      }}
                      disabled={clearingAll}
                      className={`rounded-full border border-rose-200/90 bg-rose-50/90 px-3 py-1.5 text-[11px] font-bold text-rose-700 shadow-sm ${pressable}`}
                    >
                      🧹 Barchasini tozalash
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="p-4">
              {!telegramId ? (
                <EmptyState
                  emoji="✨"
                  title="Telegramda oching"
                  lines={["Buyurtmalar va tarix shu yerda ko'rinadi. Ilovani Telegram ichidan oching."]}
                />
              ) : loadingOrders ? (
                <div className="flex flex-col items-center gap-3 py-14">
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
              ) : (
                <>
                  <div className="flex rounded-2xl bg-stone-200/50 p-1">
                    <button
                      type="button"
                      onClick={() => setOrdersTab('active')}
                      className={`relative flex-1 rounded-[0.85rem] py-2.5 text-xs font-extrabold transition duration-200 ${
                        ordersTab === 'active'
                          ? 'bg-white text-primarydark shadow-[0_2px_12px_rgba(0,0,0,0.06)]'
                          : 'text-muted'
                      } ${pressable}`}
                    >
                      Faol
                      {activeOrders.length > 0 ? (
                        <span className="ml-1 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-primary/18 px-1 text-[10px] font-bold text-primarydark">
                          {activeOrders.length}
                        </span>
                      ) : null}
                    </button>
                    <button
                      type="button"
                      onClick={() => setOrdersTab('past')}
                      className={`relative flex-1 rounded-[0.85rem] py-2.5 text-xs font-extrabold transition duration-200 ${
                        ordersTab === 'past'
                          ? 'bg-white text-primarydark shadow-[0_2px_12px_rgba(0,0,0,0.06)]'
                          : 'text-muted'
                      } ${pressable}`}
                    >
                      Tarix
                      {pastOrders.length > 0 ? (
                        <span className="ml-1 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-stone-300/60 px-1 text-[10px] font-bold text-ink">
                          {pastOrders.length}
                        </span>
                      ) : null}
                    </button>
                  </div>

                  <div key={ordersTab} className="mt-4 animate-tab-content motion-reduce:animate-none">
                    {shownOrders.length === 0 ? (
                      ordersTab === 'active' ? (
                        <EmptyState
                          emoji="🎉"
                          title="Faol buyurtma yo'q"
                          lines={["Hozircha jarayondagi buyurtmalar yo'q — yangisini berib ko'ring!"]}
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
                        {shownOrders.map((o, i) => (
                          <OrderCard
                            key={String(o._id)}
                            order={o}
                            index={i}
                            telegramId={telegramId}
                            deletingId={deletingId}
                            onRequestDelete={(ord) => {
                              setActionError(null);
                              setConfirm({
                                mode: 'one',
                                orderId: String(ord._id),
                                title: "Buyurtmani o'chirish?",
                                description: `№${String(ord._id).slice(-6)} — ${formatOrderWhen(ord.created_at)}. Bu yozuv tarixdan olib tashlanadi.`,
                              });
                            }}
                          />
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              )}
            </div>
          </section>
        </div>
      </div>

      <ConfirmSheet
        open={Boolean(confirm)}
        title={confirm?.title}
        description={confirm?.description}
        confirmLabel={confirm?.mode === 'all' ? 'Ha, barchasini' : "Ha, o'chirish"}
        tone={confirm?.mode === 'all' ? 'danger' : 'danger'}
        loading={clearingAll || Boolean(deletingId)}
        onCancel={() => !clearingAll && !deletingId && setConfirm(null)}
        onConfirm={() => void handleConfirmDelete()}
      />
    </div>
  );
}
